import React from 'react';
import styles from './styles/loadingSpinner.module.css';

type LoadingSpinnerProps = {
  /** Size in pixels */
  size?: number;
  
  color?: string;
  
  className?: string;
  
  /** Accessible label announced by screen readers */
  label?: string;
};

/** Pure-CSS spinner exposed to assistive technology as a polite status region. */
const LoadingSpinner: React.FC<LoadingSpinnerProps> = ({
  size = 40,
  color = '#3498db',
  className = '',
  label = 'Loading...'
}) => {
  const containerStyle: React.CSSProperties = {
    width: size,
    height: size
  };
  
  const spinnerStyle: React.CSSProperties = {
    borderColor: color,
    borderTopColor: 'transparent',
    width: size,
    height: size,
    borderWidth: Math.max(2, Math.floor(size / 10))
  };
  
  return (
    <div 
      className={`${styles.spinnerContainer} ${className}`}
      style={containerStyle}
      role="status"
      aria-label={label}
      aria-live="polite"
      aria-busy="true"
    >
      {/* Decorative: the container's role and aria-label carry the announcement. */}
      <div 
        className={styles.spinner}
        style={spinnerStyle}
        aria-hidden="true"
      />
      
      <span className={styles.srOnly}>
        {label}
      </span>
    </div>
  );
};

export default LoadingSpinner;