// Zod schemas for sign-up, sign-in, profile update and password change.
import { z } from 'zod';
import { isIanaTimeZone } from '../../utils/fintrackUtils/date-utils/ianaTimeZone.js';
// Imported, not repeated: a private copy of the code list would refuse currencies
// added elsewhere, and the profile is where an owner chooses a currency.
import { SUPPORTED_CURRENCIES } from '../../fintrack_api/services/fx_services/core/fxConfig.js';
// Field limits mirror the database columns noted beside each.
const FIELD_LIMITS = {
  USERNAME:{MAX:25,MIN:3, name:'Username'},   // VARCHAR(50), held at 25 until narrowed
  // No MIN: the format check decides. The MAX is the column's.
  EMAIL:{MAX:255, name:'Email'},      // email VARCHAR(255)
  FIRSTNAME:{MAX:25,MIN:1, name:'First name'},  // user_firstname VARCHAR(25)
  LASTNAME:{MAX: 25,MIN:1, name:'Last name'},   // user_lastname VARCHAR(25)
  CONTACT:{MAX: 25,MIN:1, name:'Contact'},    // user_contact VARCHAR(25)
  PASSWORD:{ MAX:72,MIN:4, name:'Password'},// MAX is bcrypt's practical limit
  // Sign-in only: a lookup key holding a username or an email, so the cap is the
  // wider of the two columns.
  IDENTITY:{MAX:255,MIN:1, name:'Username or email'},
};

// Strips < and > and trims whitespace, as a basic XSS guard.
export const sanitizeText = (text) => {
  return text.replace(/[<>]/g, '').trim();
};

// Accepts exactly the codes the FX state can price, printed in the error. Lowercase
// only: the client sends the code lowercased and the catalog stores it that way.
export const currencySchema = z
  .string()
  .refine((code) => SUPPORTED_CURRENCIES.includes(code), {
    message: `Currency is not supported. Available options: ${SUPPORTED_CURRENCIES.join(', ')}`,
  })
  .optional();

/**
 * The IANA zone the user's calendar is read on. Checked against the set the database
 * trigger admits, so a wrong value is a 400 rather than the trigger's 500.
 */
export const timezoneSchema = z.string()
  .refine(isIanaTimeZone, {
    message: 'Time zone must be a valid IANA identifier, for example America/Bogota'
  })
  .optional();

// Text-field schema built from a FIELD_LIMITS entry: required, length-bounded, no < or >.
const individualFieldSchema = (field)=>
 // An absent field would otherwise come back with zod's own type message. Returning
 // undefined for any other issue keeps the checks below in charge of their wording.
 z.string({error:(issue)=> issue.input === undefined ? `${field.name} is required` : undefined})
 .min(1,{message:`${field.name} is required`})
 .min(field.MIN,{
  message:`${field.name} must be at least ${field.MIN} character${field.MIN === 1 ? '' : 's'}`
 })
 .max(field['MAX'],{
  message:`${field.name} cannot exceed ${field.MAX} characters`})
 .refine(val=>!val.includes('<') && !val.includes('>'), {message: `${field.name} cannot contain < or > characters`})

const firstNameSchema=individualFieldSchema(FIELD_LIMITS.FIRSTNAME);

const lastNameSchema = individualFieldSchema(FIELD_LIMITS.LASTNAME);

const contactSchema = z.string()
  .max(FIELD_LIMITS.CONTACT.MAX, { 
    message: `Contact cannot exceed ${FIELD_LIMITS.CONTACT.MAX} characters` 
  })
  .optional()
  .nullable()
  .transform(val => {
    if (val === undefined) return undefined;

    // explicit null erases the contact
    if (val === null) return null;

    const sanitized = sanitizeText(val);
    return sanitized.length > 0 ? sanitized : null;
  });

/**
 * The server's own copy of the sign-up rules, mirroring the form schema at
 * frontend/src/auth/validation/zod_schemas/authSchemas.ts so a rejection reads the
 * same on either side. It is what holds when the request does not come from the form.
 */
// individualFieldSchema admits a whitespace-only value (it passes min(1)), which the
// controller would then trim to '' on its way to a NOT NULL column.
const requiredNameSchema = (field) =>
 individualFieldSchema(field).refine((val) => val.trim().length > 0, {
  message: `${field.name} cannot be empty or just whitespace`,
 });

export const signUpSchema = z.object({
 username: requiredNameSchema(FIELD_LIMITS.USERNAME),

 // Trimmed before the format check: an address pasted with a trailing space is a
 // valid address, not a 400.
 email: z.string({error:(issue)=> issue.input === undefined ? `${FIELD_LIMITS.EMAIL.name} is required` : undefined})
  .transform((val) => val.trim())
  .pipe(
   z.email({ message: 'Invalid email address' })
    .max(FIELD_LIMITS.EMAIL.MAX, {
     message: `${FIELD_LIMITS.EMAIL.name} cannot exceed ${FIELD_LIMITS.EMAIL.MAX} characters`
    })
  ),

 // Never sanitized and never trimmed: removing a character from a secret changes
 // the credential its owner chose.
 password: z.string({error:(issue)=> issue.input === undefined ? `${FIELD_LIMITS.PASSWORD.name} is required` : undefined})
  .min(FIELD_LIMITS.PASSWORD.MIN, {
   message: `${FIELD_LIMITS.PASSWORD.name} must be at least ${FIELD_LIMITS.PASSWORD.MIN} characters`
  })
  .max(FIELD_LIMITS.PASSWORD.MAX, {
   message: `${FIELD_LIMITS.PASSWORD.name} cannot exceed ${FIELD_LIMITS.PASSWORD.MAX} characters`
  })
  .refine((val) => val === val.trim(), {
   message: `${FIELD_LIMITS.PASSWORD.name} cannot start or end with spaces`
  })
  // bcrypt's ceiling counts bytes: an accented password can be under 72 characters and
  // over 72 bytes, and bcrypt would truncate it silently. The first clause yields to
  // the character rule above so an over-long password is reported once.
  .refine((val) => val.length > FIELD_LIMITS.PASSWORD.MAX
   || Buffer.byteLength(val, 'utf8') <= FIELD_LIMITS.PASSWORD.MAX, {
   message: `${FIELD_LIMITS.PASSWORD.name} cannot exceed ${FIELD_LIMITS.PASSWORD.MAX} bytes`
  }),

 user_firstname: requiredNameSchema(FIELD_LIMITS.FIRSTNAME),
 user_lastname: requiredNameSchema(FIELD_LIMITS.LASTNAME),

 // Both already optional where they are declared: absent means the column default.
 currency: currencySchema,
 timezone: timezoneSchema
});

/**
 * The server's copy of the sign-in rules, mirroring the form schema in frontend authSchemas.ts.
 * The identity is a username or an email, so it is not validated as an email; the cap bounds the work,
 * and an identity no row matches is a 401, not a 400.
 */
const identityField = z.string({error:(issue)=> issue.input === undefined ? `${FIELD_LIMITS.IDENTITY.name} is required` : undefined})
 .transform((val) => val.trim())
 .pipe(
  z.string()
   .min(FIELD_LIMITS.IDENTITY.MIN, {message:`${FIELD_LIMITS.IDENTITY.name} is required`})
   .max(FIELD_LIMITS.IDENTITY.MAX, {
    message:`${FIELD_LIMITS.IDENTITY.name} cannot exceed ${FIELD_LIMITS.IDENTITY.MAX} characters`
   })
   .refine(val=>!val.includes('<') && !val.includes('>'), {
    message:`${FIELD_LIMITS.IDENTITY.name} cannot contain < or > characters`
   })
 );

export const signInSchema = z.preprocess(
 // The form sends `identity`; `email` and `username` are folded in so an older client
 // keeps signing in and the controller reads a single payload shape.
 (raw) => {
  if (raw === null || typeof raw !== 'object') return raw;
  return { identity: raw.identity ?? raw.email ?? raw.username, password: raw.password };
 },
 z.object({
  identity: identityField,

  // Presence and the bcrypt ceiling only, never composition rules: an account whose
  // password predates a rule must still sign in, and a 400 here is one its owner cannot fix.
  password: z.string({error:(issue)=> issue.input === undefined ? `${FIELD_LIMITS.PASSWORD.name} is required` : undefined})
   .min(1, {message:`${FIELD_LIMITS.PASSWORD.name} is required`})
   .max(FIELD_LIMITS.PASSWORD.MAX, {
    message:`${FIELD_LIMITS.PASSWORD.name} cannot exceed ${FIELD_LIMITS.PASSWORD.MAX} characters`
   })
 })
);

export const updateProfileSchema = z.object({
  firstname: firstNameSchema.optional(),
  lastname: lastNameSchema.optional(),
  contact: contactSchema,
  currency: currencySchema.optional(),
  timezone: timezoneSchema
})
.refine(
  (data) => {
    return Object.values(data).some(val => 
      val !== undefined && val !== null && val !== ''
    );
  },
  {
    message: "At least one field must be provided for update",
    path: []
  }
);
export const changePasswordSchema = z.object({
  currentPassword: z.string()
    .min(1, { message: "Current password is required" }),
    
  newPassword: z.string()
    .min(FIELD_LIMITS.PASSWORD.MIN, { 
      message: `New password must be at least ${FIELD_LIMITS.PASSWORD.MIN} characters` 
    })
    .max(FIELD_LIMITS.PASSWORD.MAX, {
      message: `Password cannot exceed ${FIELD_LIMITS.PASSWORD.MAX} characters`
    })
    .refine(
      (password) => password.trim().length > 0,
      { message: "New password cannot be empty or just whitespace" }
    )
    .refine(
      (val) => val === val.trim(),
      { message: "New password cannot start or end with spaces" }
    )
    .refine(val=>!val.includes('<') && !val.includes('>'), {message: `Passwords cannot contain < or > characters`}),

  confirmPassword: z.string()
    .min(1, { message: "Please confirm your new password" })
})
.refine(
  (data) => data.newPassword === data.confirmPassword,
  {
    message: "New password and confirmation do not match",
    path: ["confirmPassword"]
  }
)
.refine(
  (data) => data.newPassword.trim() === data.newPassword,
  {
    message: "New password cannot have spaces at the beginning or end",
    path: ["newPassword"]
  }
);
