import React from 'react';
import styles from './styles/submitButton.module.css';

type SubmitButtonProps = {
  /** Content; it stays in the layout (hidden) while loading, so the button keeps its width. */
  children: React.ReactNode;
  
  isLoading?: boolean;
  
  disabled?: boolean;
  
  type?: 'submit' | 'button' | 'reset';
  
  onClick?: (e: React.MouseEvent<HTMLButtonElement>) => void;
  
  id?: string;
  
  className?: string;
  
  style?: React.CSSProperties;
  
  loadingText?: string;
};

/** Submit button with a loading state: disabled and announced as busy while loading. */
const SubmitButton: React.FC<SubmitButtonProps> = React.memo(({
  children,
  isLoading = false,
  disabled = false,
  type = 'submit',
  onClick,
  id,
  className = '',
  style,
  loadingText = 'Loading...'
}) => {
  const isButtonDisabled = disabled || isLoading;
  
  const ariaLabel = isLoading ? `${children} - ${loadingText}` : undefined;
  
  return (
    <button
      id={id}
      type={type}
      onClick={onClick}
      disabled={isButtonDisabled}
      className={`${styles.submitButton} ${className} ${isLoading ? styles.loading : ''}`}
      style={style}
      aria-label={ariaLabel}
      aria-busy={isLoading}
    >
      {/* Faded out, not unmounted, while loading; the spinner dots are drawn over it. */}
      <span className={styles.buttonContent}>
        {children}
      </span>
      
      {isLoading && (
        <span className={styles.loadingSpinner} aria-hidden="true">
          <span className={styles.spinnerDot}></span>
          <span className={styles.spinnerDot}></span>
          <span className={styles.spinnerDot}></span>
        </span>
      )}
      
      {isLoading && (
        <span className={styles.srOnly}>
          {loadingText}
        </span>
      )}
    </button>
  );
});

// Display name for React DevTools
SubmitButton.displayName = 'SubmitButton';

export default SubmitButton;