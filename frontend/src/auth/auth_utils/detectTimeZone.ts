/**
 * The device's IANA zone, used only to seed a new account at sign-up; afterwards `userData.timezone`
 * rules, so budget periods do not move when the user travels. 'UTC' is the fallback and column
 * default, valid for the API though Intl.supportedValuesOf('timeZone') omits it.
 */
export const detectTimeZone = (): string => {
 try {
  return Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC';
 } catch {
  return 'UTC';
 }
};
