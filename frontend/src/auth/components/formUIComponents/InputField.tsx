import React from 'react';
import { LuEyeClosed, LuEye } from 'react-icons/lu';
import styles from './styles/inputField.module.css';

export type InputFieldProps = {
  /** A node so a caller can put a glyph before the words. The id needs text, so it
   * falls back when the label is not a string. */
  label: React.ReactNode;

  value: string;

  onChange: (value: string | React.ChangeEvent<HTMLInputElement>) => void;

  error?: string;

  type?: 'text' | 'email' | 'tel' | 'password' | 'number';

  required?: boolean;

  placeholder?: string;

  disabled?: boolean;

  /** Read-only, used for the success state. */
  isReadOnly?: boolean;

  helpText?: string;

  id?: string;

  className?: string;

  /** Drawing style, not a colour or surface: the auth modal uses 'filled'; every
   * other consumer uses 'default'. */
  variant?: 'default' | 'filled';

  style?: React.CSSProperties;

  showContentToggle?: boolean;

  onToggleVisibility?: () => void;

  isContentVisible?: boolean;

  onToggleContent?: () => void;

  touched?: boolean;

  toggleIcon?: React.ReactNode;
};

const InputField: React.FC<InputFieldProps> = React.memo(
  ({
    label,
    value,
    onChange,
    error,
    type = 'text',
    required = false,
    placeholder = '',
    disabled = false,
    helpText,
    id,
    className = '',
    variant = 'default',
    style,
    showContentToggle = false,
    isContentVisible = false,
    onToggleContent,
    toggleIcon,
    isReadOnly = false,
  }) => {
    const handleChange = React.useCallback(
      (valueOrEvent: string | React.ChangeEvent<HTMLInputElement>) => {
        const value =
          typeof valueOrEvent === 'string'
            ? valueOrEvent
            : valueOrEvent.target.value;
        onChange(value);
      },
      [onChange],
    );

    const inputId =
      id ||
      `input-${
        typeof label === 'string'
          ? label.toLowerCase().replace(/\s+/g, '-')
          : 'field'
      }`;
    const hasError = !!error;

    const ariaAttributes = hasError
      ? { 'aria-invalid': true, 'aria-describedby': `${inputId}-error` }
      : {};

    return (
      <div
        className={`${styles.inputContainer} ${styles[variant]} ${className} ${
          hasError ? styles.hasError : ''
        }`}
        style={style}
      >
        {/* The required star is aria-hidden; the required attribute conveys it to assistive technology. */}
        <label htmlFor={inputId} className={styles.inputLabel}>
          {label}
          {required && (
            <span className={styles.requiredIndicator} aria-hidden='true'>
              *
            </span>
          )}
        </label>

        <div className={styles.inputWrapper}>
          <input
            id={inputId}
            type={
              showContentToggle
                ? isContentVisible
                  ? 'text'
                  : 'password'
                : type
            }
            value={value}
            onChange={(e) => handleChange(e)}
            placeholder={placeholder}
            disabled={disabled}
            readOnly={isReadOnly}
            required={required}
            className={styles.inputField}
            style={{ paddingRight: showContentToggle ? '40px' : '12px' }} // keeps the text clear of the toggle icon
            {...ariaAttributes}
          />

          {showContentToggle && onToggleContent && (
            /* Keep this button in the tab order: it is the only keyboard way to unmask the
               field. The label says "password" because the type above resolves to
               'password' whenever showContentToggle is set. */
            <button
              type='button'
              className={styles.toggleButton}
              onClick={onToggleContent}
              aria-label={isContentVisible ? 'Hide password' : 'Show password'}
            >
              {toggleIcon || (isContentVisible ? <LuEyeClosed /> : <LuEye />)}
            </button>
          )}
        </div>

        {hasError && (
          <div
            id={`${inputId}-error`}
            className={styles.errorMessage}
            role='alert'
            aria-live='polite'
          >
            {error}
          </div>
        )}

        {helpText && !hasError && (
          <div className={styles.helpText}>{helpText}</div>
        )}
      </div>
    );
  },
);

// Display name for React DevTools
InputField.displayName = 'InputField';

export default InputField;
