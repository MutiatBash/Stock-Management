import { useEffect, useRef, useState } from 'react';

export function useConfirmDelete() {
  const [label, setLabel] = useState('');
  const [open, setOpen] = useState(false);
  const actionRef = useRef(null);

  function request(itemLabel, onConfirm) {
    setLabel(itemLabel);
    actionRef.current = onConfirm;
    setOpen(true);
  }

  function close() {
    setOpen(false);
    actionRef.current = null;
  }

  function confirm() {
    if (actionRef.current) actionRef.current();
    close();
  }

  return { open, label, request, close, confirm };
}

export default function ConfirmModal({ open, label, close, confirm }) {
  const [secondsLeft, setSecondsLeft] = useState(10);

  useEffect(() => {
    if (!open) return;
    setSecondsLeft(10);
    const interval = setInterval(() => {
      setSecondsLeft((s) => (s > 0 ? s - 1 : 0));
    }, 1000);
    return () => clearInterval(interval);
  }, [open]);

  if (!open) return null;

  return (
    <div className="modal-overlay" onClick={(e) => e.target === e.currentTarget && close()}>
      <div className="modal-box">
        <h3 className="modal-title">Are you sure?</h3>
        <p className="modal-message">
          This will permanently remove <strong>{label}</strong>. This cannot be undone.
        </p>
        <div className="modal-actions">
          <button type="button" className="btn btn-secondary" onClick={close}>
            Cancel
          </button>
          <button type="button" className="btn btn-danger" disabled={secondsLeft > 0} onClick={confirm}>
            {secondsLeft > 0 ? `Confirm (${secondsLeft})` : 'Confirm'}
          </button>
        </div>
      </div>
    </div>
  );
}
