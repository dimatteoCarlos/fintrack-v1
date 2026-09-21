// Guards what enters users.timezone; getUserTimeZone reads it back.

// Built once at import; the ICU catalog does not change while the process lives.
// 'UTC' is added by hand because Intl lists canonical zones only, and it is the
// column default every existing row holds.
const IANA_TIME_ZONES = new Set([...Intl.supportedValuesOf('timeZone'), 'UTC']);

/**
 * Stricter than the DB trigger on purpose: this canonical set is a subset of pg_timezone_names
 * (no aliases like 'US/Eastern'), so an accepted value never raises there. Case sensitive:
 * Intl accepts 'utc' but Postgres does not, which would turn a bad request into a 500.
 *
 * @param {unknown} value - a candidate zone, straight from a request body
 */
export function isIanaTimeZone(value) {
 return typeof value === 'string' && IANA_TIME_ZONES.has(value);
}
