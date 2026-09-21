// Validation contracts shared by useFieldValidation and the domain-specific adapters.

export type FieldValidationResultType<TValue = unknown> = {
  isValid: boolean;
  /** The original value that was validated; always present. */
  validatedData: TValue;
  /** Set only when isValid is false. */
  error?: string;
};

export type FormValidationResultType<TFormShape extends Record<string, unknown>> = {
  isValid: boolean;
  /** Present only on success. */
  validatedData?: TFormShape;
  errors: Partial<Record<keyof TFormShape, string>>;
  /** Form-level error not tied to a field. */
  formError?: string;
};

export type ValidationOptionsType = {
  validateOnlyTouched?: boolean;
  stopOnFirstError?: boolean;
};