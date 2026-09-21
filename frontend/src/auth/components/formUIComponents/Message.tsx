import React from 'react';
import styles from './styles/message.module.css';

export type MessageType = 'error' | 'success' | 'warning' | 'info';

type MessagePropsType = {
  message: string;
  type?: MessageType;
// Dismiss handler; the close button renders only when it is provided.
  onDismiss?: () => void;
  id?: string;
  className?: string;
  style?: React.CSSProperties;
  showIcon?: boolean;
// Auto-dismiss delay in ms; requires onDismiss.
  autoDismiss?: number;

  ariaLive?: 'assertive' | 'polite' | 'off';
  
  role?: 'alert' | 'status' | 'log';
};

const Message: React.FC<MessagePropsType> = ({
  message,
  type = 'info',
  onDismiss,
  showIcon = true,
  autoDismiss = 500,
  id,
  className = '',
  style,

}) => {
  
  /* Auto-dismiss: the timer is cleared on unmount and whenever the delay or handler changes. */
  React.useEffect(() => {
    if (autoDismiss > 0 && onDismiss) {
      const timer = setTimeout(() => {
        onDismiss();
      }, autoDismiss);
      
      return () => clearTimeout(timer);
    }
  }, [autoDismiss, onDismiss]);
  
  const typeClass = {
    error: styles.messageError,
    success: styles.messageSuccess,
    warning: styles.messageWarning,
    info: styles.messageInfo
  }[type];
  
  const role = type === 'error' || type === 'warning' ? 'alert' : 'status';
  const ariaLive = type === 'error' || type === 'warning' ? 'assertive' : 'polite';

  const typeIcons = {
   error: '❌',
   success: '✅',
   warning: '⚠️',
   info: 'ℹ️'
  };
    
  return (
    <div
      id={id}
      className={`${styles.messageContainer} ${typeClass} ${className}`}
      style={style}
      role={role}
      aria-live={ariaLive}
      aria-atomic="true"
       data-testid={`message-${type}`}

    >
      {/* Decorative: the message text carries the meaning, so the icon is aria-hidden. */}
      {showIcon && (
        <span 
          className={styles.messageIcon}
          aria-hidden="true"
          data-testid="message-icon"
        >
         {typeIcons[type]}
        </span>
      )}
      <p className={`${styles.messageText} ${showIcon ? styles.messageTextWithIcon : ''}`}
       data-testid="message-text"
      >
        {message}
      </p>

      {onDismiss && (
        <button
          type="button"
          className={styles.dismissButton}
          onClick={onDismiss}
          aria-label="Dismiss message"
          title="Dismiss"
          data-testid="message-dismiss-button"
        >
          ×
        </button>
      )}
    </div>
  );
};

export default Message;