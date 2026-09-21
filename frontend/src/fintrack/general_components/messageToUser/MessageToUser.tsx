import { useEffect, useRef } from 'react';
import { capitalize } from '../../helpers/functions';
import { VariantType } from '../../types/types';
import './messageToUser.css';
import { showToastByStatus } from '../../helpers/showToastByStatus';

type MessageToUserPropType = {
  isLoading?: boolean;
  error?: string | Error | null;
  messageToUser:
    | { message: string; status?: number }
    | string
    | null
    | undefined;
  variant?: VariantType;
  showToast?: boolean;
  /** Whether a plain messageToUser reads as a confirmation of something done or
   * as a correction the owner still has to make. Defaults to confirmation. */
  tone?: 'confirmation' | 'correction';
};

export const MessageToUser = ({
  isLoading,
  error,
  messageToUser,
  variant,
  showToast = true,
  tone = 'confirmation',
}: MessageToUserPropType): JSX.Element => {
  const lastMessageRef = useRef<string>('');
  // The tracker renders on the light card, so it takes the light-surface feedback family ('red' measured
  // 4.00:1 there, under 4.5:1). The other variants sit on the dark ground, where their literals pass;
  // replacing them needs a dark-surface feedback pair the tokens lack.
  const colorStyles =
    variant === 'tracker'
      ? {
          success: 'var(--color-feedback-success-content)',
          failure: 'var(--color-feedback-error-content)',
          neutral: 'var(--color-content-secondary)',
        }
      : {
          // The product's financial semaphore, calibrated in tokens.css against this
          // dark ground: 5.13:1 for ok and 5.70:1 for alert on --color-surface-app.
          success: 'var(--color-status-ok)',
          failure: 'var(--color-status-alert)',
          neutral: 'var(--color-content-on-dark-subtle)',
        };

  // A correction is painted and announced as one, whichever channel carried it.
  const messageColor =
    tone === 'correction' ? colorStyles.failure : colorStyles.success;

  const topStyles = variant === 'tracker' ? '2%' : '70%';

  // Toasts are for the form variant only, and only when showToast is set.
  useEffect(() => {
    if (messageToUser && variant == 'form' && showToast) {
      const msg =
        typeof messageToUser === 'string'
          ? messageToUser
          : messageToUser.message;

      const status =
       typeof messageToUser === 'string' ? 200 : (messageToUser.status ?? 200);

      console.log('📨 Showing toast:', {
      currentMessage: msg,
      previousMessage: lastMessageRef.current,
      sameMessage: msg === lastMessageRef.current,
    });
        showToastByStatus(msg, status);

      if (!messageToUser) {
        lastMessageRef.current = '';
      }
    }
  }, [showToast, messageToUser, variant]);
  // Non-form variants show the message inline.
  const shouldShowInlineMessage = variant !== 'form';

  return (
    <>
      {isLoading && (
        <div style={{ color: colorStyles.neutral }}>Loading...</div>
      )}

      {error && shouldShowInlineMessage && (
        <div className='error-message1'>
          {/* Announced, not just drawn: it appears in place after a save attempt
              without moving focus (WCAG 4.1.3). 'alert' rather than 'status'
              because the save did not happen. */}
          <span
            role='alert'
            className='validation__errMsg1 '
            style={{
              color: colorStyles.failure,
              position: 'absolute',
              top: `${topStyles}`,
              right: '2rem',
              width: '80%',
              height: '1.5rem',
              textAlign: 'right',
              borderRadius: '4px',
              fontSize: '0.75rem',
              fontWeight: '400',
              lineHeight: '1.5rem',
              zIndex: '1',
            }}
          >
            {typeof error == 'string' ? error : error?.message}
          </span>
        </div>
      )}

      {!error && messageToUser && shouldShowInlineMessage && (
        <div className='success-message'>
          <span
            role={tone === 'correction' ? 'alert' : 'status'}
            style={{
              color: messageColor,
              position: 'absolute',
              top: `${topStyles}`,
              right: '2rem',
              width: '60%',
              height: '1.5rem',
              textAlign: 'right',
              borderRadius: '4px',
              fontSize: '0.75rem',
              fontWeight: '400',
              lineHeight: '1.5rem',
              zIndex: '1',
            }}
          >
            {capitalize(
              typeof messageToUser === 'string'
                ? messageToUser
                : messageToUser.message,
            )}
          </span>
        </div>
      )}
    </>
  );
};
