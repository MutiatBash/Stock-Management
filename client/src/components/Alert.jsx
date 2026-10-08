import { useEffect } from 'react';

export default function Alert({ type, message, onClose }) {
  useEffect(() => {
    if (!message) return;

    const timer = setTimeout(() => {
      onClose?.();
    }, 4000);

    return () => clearTimeout(timer);
  }, [message, onClose]);

  if (!message) return null;

  const isError = type === 'error';

  return (
    <div className={`alert alert-${type}`} role="alert">
      <div className="alert-content">
        <div className="alert-icon">
          {isError ? '!' : '✓'}
        </div>

        <div>
          <strong className="alert-title">
            {isError ? 'Something went wrong' : 'Success'}
          </strong>
          <p className="alert-message">{message}</p>
        </div>
      </div>

      {onClose && (
        <button
          type="button"
          className="alert-close"
          onClick={onClose}
          aria-label="Close notification"
        >
          ×
        </button>
      )}
    </div>
  );
}