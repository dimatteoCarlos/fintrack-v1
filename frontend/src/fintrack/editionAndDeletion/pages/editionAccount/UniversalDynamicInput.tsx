import { useMemo } from 'react';
import { FieldConfigType } from '../../validations_zod/accountEditSchema.ts';
import { ValidationMessagesType } from '../../../validations/types.ts';

import { DropdownOptionType } from '../../../types/types.ts';
import DropDownSelection from '../../../general_components/dropdownSelection/DropDownSelection.tsx';
import FormDatepicker from '../../../general_components/datepicker/Datepicker.tsx';

import { DB_MAX_LENGTHS } from '../../../validations/utils/constants.ts';

export interface UniversalDynamicInputPropsType<
  T extends Record<string, unknown>,
> {
  fieldConfig: FieldConfigType;
  formData: T;
  setFormData: React.Dispatch<React.SetStateAction<T>>;
  validationMessages: ValidationMessagesType<T>;
  isReset: boolean;

  // Handler factories (higher-order functions), one per input kind.
  handleDropdownChange: (
    fieldName: string,
  ) => (option: DropdownOptionType | null) => void;

  handleDateChange: (fieldName: string) => (date: Date) => void;

  // Text and number fields share one handler (as defined by EditAccount.tsx).
  handleInputNumberChange: (
    fieldName: string,
  ) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => void;
}

// Renders one form field according to its fieldConfig.
export function UniversalDynamicInput<T extends Record<string, unknown>>({
  fieldConfig,
  formData,
  validationMessages,
  handleDropdownChange,
  handleDateChange,
  handleInputNumberChange,
  isReset,
}: UniversalDynamicInputPropsType<T>): JSX.Element {
  const fieldNameKey = fieldConfig.fieldName as keyof T;

  const value = formData[fieldNameKey];
  const errorMessage = validationMessages[fieldNameKey];

  // Read-only fields lock interaction; derived fields are read-only.
  const isReadOnly = !fieldConfig.isEditable;

  const readOnlyStyle = useMemo(
    () =>
      isReadOnly
        ? ({
            opacity: 0.6,
            pointerEvents: 'none',
            backgroundColor: '#333333',
            cursor: 'not-allowed',
            border: '1px dashed #555',
            whiteSpace: 'nowrap',
            textOverflow: 'ellipsis',
            overflow: 'hidden',
          } as React.CSSProperties)
        : undefined,
    [isReadOnly],
  );
  const textOrNumberHandler = handleInputNumberChange(fieldConfig.fieldName);

  // The stored value may be a string or a number (Zod transforms it); the
  // input's `value` needs a string.
  let inputValue = '';
  if (value !== null && value !== undefined) {
    inputValue = String(value);
  }

  // Max length per field from DB_MAX_LENGTHS, with a default.
  const currentMax =
    DB_MAX_LENGTHS[fieldConfig.fieldName as keyof typeof DB_MAX_LENGTHS] ||
    DB_MAX_LENGTHS.default;
  const isLimit = inputValue.length >= currentMax * 1;

  const renderInput = () => {
    switch (fieldConfig.inputType) {
      case 'text':
      case 'number':
      case 'textarea':
        if (fieldConfig.inputType === 'textarea') {
          return (
            <textarea
              className={`input__container ${isReadOnly ? 'read-only' : ''}`}
              id={fieldConfig.fieldName}
              name={fieldConfig.fieldName}
              placeholder={fieldConfig.placeholder}
              value={inputValue}
              onChange={textOrNumberHandler}
              readOnly={isReadOnly}
              style={readOnlyStyle}
              maxLength={currentMax}
            
            />
          );
        }

        return (
          <input
            className={`input__container ${isReadOnly ? 'read-only' : ''}`}
            type={'text'} // 'text' so the parent handler can parse number formats
            id={fieldConfig.fieldName}
            name={fieldConfig.fieldName}
            placeholder={fieldConfig.placeholder}
            value={inputValue}
            onChange={textOrNumberHandler}
            readOnly={isReadOnly}
            style={readOnlyStyle}
            maxLength={currentMax}
          />
        );

      case 'select':
        if (!fieldConfig.options) {
          return (
            <p className='error-message'>
              Error: 'select' type, requires 'options'.
            </p>
          );
        }

        return (
          <DropDownSelection
            dropDownOptions={{
              title:
                inputValue ||
                fieldConfig.placeholder ||
                `Select ${fieldConfig.label}`,
              options: fieldConfig.options,
              variant: 'form',
            }}
            updateOptionHandler={handleDropdownChange(fieldConfig.fieldName)}
            isReset={isReset}
            setIsReset={() => {
              /* no-op; the parent handles reset if needed */
            }}
          />
        );

      case 'date': {
        let dateValue: Date;

        if (value instanceof Date) {
          dateValue = value;
        } else if (typeof value === 'string') {
          let parsedDate = new Date(value);

          if (isNaN(parsedDate.getTime())) {
            // PostgreSQL timestamp "YYYY-MM-DD HH:MM:SS-TZ".
            if (value.includes(' ')) {
              const [datePart] = value.split(' ');
              const [year, month, day] = datePart.split('-').map(Number);
              parsedDate = new Date(year, month - 1, day);
            }
            // Plain YYYY-MM-DD.
            else if (value.match(/^\d{4}-\d{2}-\d{2}$/)) {
              const [year, month, day] = value.split('-').map(Number);
              parsedDate = new Date(year, month - 1, day);
            }
          }
          dateValue = !isNaN(parsedDate.getTime()) ? parsedDate : new Date();
        } else {
          dateValue = new Date();
        }

        return (
          <div className='form__datepicker__container input__box--datepicker'>
            <FormDatepicker
              changeDate={handleDateChange(fieldConfig.fieldName)}
              date={dateValue}
              variant={'form'}
            />
          </div>
        );
      }
      default:
        return (
          <p className='error-message'>
            Input type not supported: {fieldConfig.inputType}
          </p>
        );
    }
  };

  return (
    <div className='input__box'>
      {/* htmlFor only for branches that render a native control: react-select
          and the Datepicker take no id, so pointing at them would name nothing. */}
      <label
       className='label forms__label'
       htmlFor={
        fieldConfig.inputType === 'select' || fieldConfig.inputType === 'date'
         ? undefined
         : fieldConfig.fieldName
       }
      >
        {fieldConfig.label}
        {fieldConfig.isRequired && <span className='required-star'>*</span>}
        &nbsp;
        {(fieldConfig.inputType === 'text' ||
          fieldConfig.inputType === 'textarea') && (
          <span
            style={{
              fontSize: '0.75rem',
              color: isLimit ? '#ff4d4d' : 'rgba(255,255,255,0.4)',
              fontWeight: isLimit ? 'bold' : 'normal',
              resize:'vertical'
            }}
          >
            {inputValue.length}/{currentMax}
          </span>
        )}
      </label>

      <span
        className='validation__errMsg'
      >
        {errorMessage}
      </span>

      {fieldConfig.helpText && !errorMessage && (
        <p
          className='help-text'
          style={{
            color: 'cyan',
            opacity: '0.8',
            fontWeight: '100',
            fontSize: '0.8rem',
          }}
        >
          {fieldConfig.helpText}
        </p>
      )}

      {renderInput()}
    </div>
  );
}

export default UniversalDynamicInput;
