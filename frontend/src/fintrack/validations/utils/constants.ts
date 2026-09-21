// Max lengths, adjusted for the UI.
export const DB_MAX_LENGTHS = {
  category_name: 10,
  subcategory: 10,
  note: 90,
  account_name: 28,
  debtor_name: 10,
  debtor_lastname: 10,
  nature_type_name: 5,
  default:28,
}


export const ERROR_MESSAGES = {
  FIELD_REQUIRED: 'This field is required.',
  INVALID_FORMAT: 'Format number not valid.',
  POSITIVE_NUMBER_REQUIRED: 'Value must be greater than zero.',
  INVALID_NUMBER: "Please correct invalid characters.",
  NOTE_MAX_LENGTH: "Note cannot exceed 150 characters.",
   
  INVALID_CHARS: (chars: string) => `Invalid chars: ${chars}.`,
  INVALID_DATE: 'Invalid date format.',
  INVALID_DATE_FUTURE: 'Date must be today or later',
  INVALID_SELECTION: 'Please select an option.',

};
