import { ZodType  } from 'zod';
import { ValidationMessagesType } from '../types';

export type ValidationResultType<TFormData extends Record<string, unknown>> = {
  errors:ValidationMessagesType<TFormData>;
  data:TFormData | null;
};

// Validates data against a Zod schema and maps its issues to per-field messages for rendering.
export function validateForm<TFormData extends Record<string, unknown>>(
  schema: ZodType<TFormData>,
  data: unknown
): ValidationResultType<TFormData> {
 const result = schema.safeParse(data);
  
if (result.success) {
 return {
  errors: {},
  data: result.data,
 };
  } else {
const errors: ValidationMessagesType<TFormData> = {};

result.error.issues.forEach((issue) => {
// Forms are flat, so `issue.path[0]` is the field name.
 const fieldName = issue.path[0];

 if (fieldName && typeof fieldName === 'string') {
  errors[fieldName as keyof TFormData] = issue.message;
     }
   });
 return {errors, data:null };
  }
}