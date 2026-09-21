import {z} from 'zod';
import { FIELD_LIMITS, FieldLimitType } from './constants';
import { SUPPORTED_CURRENCIES } from '../../../fintrack/helpers/currencyConstants';
import { isIanaTimeZone } from '../../auth_utils/timeZoneOptions';

// Replica of the backend zod validation schemas.
export const sanitizeText = (text:string) => {
 return text.replace(/[<>]/g, '').trim();
};
const individualFieldSchema = (field:FieldLimitType)=>
 z.string()
 .min(1,{message:`${field.name} is required`})
 .min(field.MIN,{
  message:`${field.name} must be at least ${field.MIN} character${field.MIN === 1 ? '' : 's'}`
 })
 .max(field['MAX'],{
  message:`${field.name} cannot exceed ${field.MAX} characters`})
 .refine(val=>!val.includes('<') && !val.includes('>'), {message: `${field.name} cannot contain < or > characters`})
  .refine(
      (val) => val.trim().length > 0,
      { message: `${field.name} cannot be empty or just whitespace`}
    )
     .refine(
      (val) => val === val.trim(),
      { message: `${field.name} cannot start or end with spaces`}
    )

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
     if (val === null) return null;
     
     const sanitized = sanitizeText(val);
     return sanitized.length > 0 ? sanitized : null;
   });

   export const currencySchema= z.enum(SUPPORTED_CURRENCIES as [string, ...string[]], {
     error: (issue) => {
       if (issue.code === 'invalid_value') {
        return {
         message: `Currency "${issue.received}" is not supported. Available options: ${SUPPORTED_CURRENCIES.join(', ')}`
        };
       } 
       return {message:"Invalid currency input"};
     }
   })
   .optional();

   /**
    * Checked against the catalog the backend admits, so an accepted value cannot
    * make the database trigger raise.
    */
   export const timezoneSchema = z.string()
     .refine(isIanaTimeZone, {
       message: 'Time zone must be a valid IANA identifier, for example America/Bogota'
     })
     .optional();

export const updateProfileSchema = z.object(
{
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
)

export const changePasswordSchema = z.object(
 {
  currentPassword: z.string()
   .min(1, { message: "Current password is required" })
   ,
    
  newPassword: z.string()
    .min(FIELD_LIMITS.PASSWORD.MIN, { 
      message: `New password must be at least ${FIELD_LIMITS.PASSWORD.MIN} characters` 
    })
    .max(FIELD_LIMITS.PASSWORD.MAX, {
      message: `Password cannot exceed ${FIELD_LIMITS.PASSWORD.MAX} characters`
    })
    .refine(
      (newPassword) => newPassword.trim().length > 0,
      { message: "New password cannot be empty or just whitespace" }
    )
     .refine(
      (val) => val === val.trim(),
      { message: "New password cannot start or end with spaces" }
    )
    .refine(val=>!val.includes('<') && !val.includes('>'), {message: `Passwords cannot contain < or > characters`})
    ,
    
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

export type UpdateProfileSchemaFormDataType =z.infer<typeof updateProfileSchema>;

export type ChangePasswordSchemaFormDataType =z.infer<typeof changePasswordSchema>;








