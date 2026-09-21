import { detectTimeZone } from './detectTimeZone';

export type TimeZoneOptionType = {
 label: string;
 value: string;
};

/** The zone the database column defaults to; shared by the form and the fallback list. */
export const DEFAULT_TIME_ZONE = 'UTC';

/**
 * Intl.supportedValuesOf is in the ES2022 lib but the project compiles against
 * ES2020, so it is typed here rather than widening the global lib. Optional
 * because some runtimes lack it.
 */
type IntlWithSupportedValues = typeof Intl & {
 supportedValuesOf?: (key: 'timeZone') => string[];
};

/** Every canonical zone the runtime knows, or null when it cannot say. */
const supportedZones = (): string[] | null => {
 const intl = Intl as IntlWithSupportedValues;

 if (typeof intl.supportedValuesOf !== 'function') return null;

 try {
  return intl.supportedValuesOf('timeZone');
 } catch {
  return null;
 }
};

/**
 * Current UTC offset of a zone, or '' when the runtime rejects the identifier,
 * so one unknown zone degrades to a bare name instead of emptying the list.
 */
const zoneOffsetLabel = (timeZone: string): string => {
 try {
  const parts = new Intl.DateTimeFormat('en-US', {
   timeZone,
   timeZoneName: 'shortOffset',
  }).formatToParts(new Date());

  return parts.find((part) => part.type === 'timeZoneName')?.value ?? '';
 } catch {
  return '';
 }
};

/**
 * Every IANA zone this runtime knows, from the engine so it matches the backend's set. 'UTC' is
 * appended because Intl omits it and every existing row holds it; without Intl.supportedValuesOf
 * the fallback is the device zone plus UTC.
 */
export const buildTimeZoneOptions = (): TimeZoneOptionType[] => {
 const catalog = supportedZones();

 const zones = catalog
  ? [...catalog, DEFAULT_TIME_ZONE]
  : [detectTimeZone(), DEFAULT_TIME_ZONE];

 const unique = Array.from(new Set(zones)).sort((a, b) => a.localeCompare(b));

 return unique.map((zone) => {
  const offset = zoneOffsetLabel(zone);

  return {
   value: zone,
   label: offset ? `${zone} (${offset})` : zone,
  };
 });
};

/**
 * Whether a value is a zone this application agrees to store. Mirrors
 * isIanaTimeZone on the backend so a bad value is refused before the request
 * leaves, and case sensitive for the same reason: Postgres rejects 'utc'.
 */
export const isIanaTimeZone = (value: unknown): boolean => {
 if (typeof value !== 'string') return false;
 if (value === DEFAULT_TIME_ZONE) return true;

 const catalog = supportedZones();

 if (catalog) return catalog.includes(value);

 // Without the catalog, ask the formatter whether it accepts the identifier.
 try {
  new Intl.DateTimeFormat('en-US', { timeZone: value });
  return true;
 } catch {
  return false;
 }
};
