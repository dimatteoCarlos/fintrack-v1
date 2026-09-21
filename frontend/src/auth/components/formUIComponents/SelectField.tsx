import React from 'react';
import styles from './styles/selectField.module.css';

type SelectOption<T> = {
  value: T;
  label: string;
};

type SelectFieldProps <T extends string> = {
  /** A node so a caller can put a glyph before the words. The id needs text, so it
   * falls back when the label is not a string. */
  label: React.ReactNode;
  
  value: T;
  
  options: SelectOption<T>[];
  
  onChange: (value: T) => void;
  
  error?: string;
  
  required?: boolean;
  
  placeholder?: string;
  
  disabled?: boolean;
  
  helpText?: string;
  
  id?: string;
  
  className?: string;
  
  style?: React.CSSProperties;
};

/** Accessible select styled to match InputField, generic over the option value type. */
const SelectFieldInner=<T extends string>({
  label,
  value,
  options,
  onChange,
  error,
  required = false,
  placeholder = 'Select an option',
  disabled = false,
  helpText,
  id,
  className = '',
  style
}:SelectFieldProps<T>) => {

  const handleChange = React.useCallback(
(e: React.ChangeEvent<HTMLSelectElement>) =>{onChange(e.target.value as T);},
   [onChange]
  );
  
  const selectId =
    id ||
    `select-${
      typeof label === 'string'
        ? label.toLowerCase().replace(/\s+/g, '-')
        : 'field'
    }`;
  
  const hasError = !!error;
  
  const showPlaceholder = !value && placeholder;
  
  const ariaAttributes = hasError ? {
    'aria-invalid': true,
    'aria-describedby': `${selectId}-error`
  } : {};
  
  return (
    <div 
      className={`${styles.selectContainer} ${className} ${hasError ? styles.hasError : ''}`}
      style={style}
    >
      {/* The required star is aria-hidden; the required attribute conveys it to assistive technology. */}
      <label 
        htmlFor={selectId}
        className={styles.selectLabel}
      >
        {label}
        {required && (
          <span className={styles.requiredIndicator} aria-hidden="true">
            *
          </span>
        )}
      </label>
      
      <div className={styles.selectWrapper}>
        <select
          id={selectId}
          value={value}
          onChange={handleChange}
          disabled={disabled}
          required={required}
          className={styles.selectField}
          {...ariaAttributes}
        >
          
          {showPlaceholder && (
            <option value="" disabled>
              {placeholder}
            </option>
          )}

          {options.map((option) => (
            <option 
              key={option.value} 
              value={option.value}
              className={styles.selectOption}
            >
              {option.label ?? "No Option"}
            </option>
          ))}
        </select>
        
        <span className={styles.selectArrow} aria-hidden="true">
          ▼
        </span>
      </div>
      
      {hasError && (
        <div 
          id={`${selectId}-error`}
          className={styles.errorMessage}
          role="alert"
          aria-live="polite"
        >
          {error}
        </div>
      )}
      
      {helpText && !hasError && (
        <div className={styles.helpText}>
          {helpText}
        </div>
      )}
    </div>
  );
};

/* React.memo erases the generic type parameter; this cast restores it for callers. */

export const SelectField =React.memo(SelectFieldInner) as (<T extends string>(
 props:SelectFieldProps<T>)
 => JSX.Element) & {displayName?:string} ;

// Display name for React DevTools
(SelectField).displayName = 'SelectField';

export default SelectField;