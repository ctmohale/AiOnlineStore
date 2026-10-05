import { AlertTriangle, CheckCircle2, Info, X, XCircle } from 'lucide-react';
import { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react';

type ToastTone = 'success' | 'error' | 'warning' | 'info';
type Toast = { id: number; message: string; title?: string; tone: ToastTone };
type ConfirmOptions = {
  title: string;
  message: string;
  confirmLabel?: string;
  cancelLabel?: string;
  tone?: 'default' | 'danger';
};
type PendingConfirmation = ConfirmOptions & { resolve: (confirmed: boolean) => void };
type FeedbackContextValue = {
  notify: (message: string, tone?: ToastTone, title?: string) => void;
  confirm: (options: ConfirmOptions) => Promise<boolean>;
};

const FeedbackContext = createContext<FeedbackContextValue | null>(null);
const toastIcons = { success: CheckCircle2, error: XCircle, warning: AlertTriangle, info: Info };

export function FeedbackProvider({ children }: { children: React.ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);
  const [confirmation, setConfirmation] = useState<PendingConfirmation | null>(null);
  const nextToastId = useRef(0);
  const timers = useRef(new Map<number, ReturnType<typeof setTimeout>>());
  const confirmButton = useRef<HTMLButtonElement>(null);

  const dismissToast = useCallback((id: number) => {
    const timer = timers.current.get(id);
    if (timer) clearTimeout(timer);
    timers.current.delete(id);
    setToasts((current) => current.filter((toast) => toast.id !== id));
  }, []);

  const notify = useCallback((message: string, tone: ToastTone = 'info', title?: string) => {
    const id = ++nextToastId.current;
    setToasts((current) => [...current.slice(-1), { id, message, tone, title }]);
    timers.current.set(id, setTimeout(() => dismissToast(id), 4500));
  }, [dismissToast]);

  const confirm = useCallback((options: ConfirmOptions) => new Promise<boolean>((resolve) => {
    setConfirmation((current) => {
      current?.resolve(false);
      return { confirmLabel: 'Confirm', cancelLabel: 'Cancel', tone: 'default', ...options, resolve };
    });
  }), []);

  const settleConfirmation = useCallback((confirmed: boolean) => {
    setConfirmation((current) => {
      current?.resolve(confirmed);
      return null;
    });
  }, []);

  useEffect(() => {
    if (!confirmation) return;
    confirmButton.current?.focus();
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') settleConfirmation(false);
    };
    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, [confirmation, settleConfirmation]);

  useEffect(() => () => {
    for (const timer of timers.current.values()) clearTimeout(timer);
  }, []);

  return <FeedbackContext.Provider value={{ notify, confirm }}>
    {children}
    <div className="toast-region" aria-live="polite" aria-label="Notifications">
      {toasts.map((toast) => {
        const Icon = toastIcons[toast.tone];
        return <article className={`app-toast ${toast.tone}`} key={toast.id} role={toast.tone === 'error' ? 'alert' : 'status'}>
          <Icon aria-hidden="true" />
          <div><strong>{toast.title || (toast.tone === 'success' ? 'Done' : toast.tone === 'error' ? 'Something went wrong' : toast.tone === 'warning' ? 'Please check' : 'Notice')}</strong><p>{toast.message}</p></div>
          <button type="button" onClick={() => dismissToast(toast.id)} aria-label="Dismiss notification"><X /></button>
        </article>;
      })}
    </div>
    {confirmation && <div className="confirm-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) settleConfirmation(false); }}>
      <section className={`confirm-dialog ${confirmation.tone}`} role="alertdialog" aria-modal="true" aria-labelledby="confirm-title" aria-describedby="confirm-message">
        <span className="confirm-icon"><AlertTriangle /></span>
        <div><p className="kicker">Please confirm</p><h2 id="confirm-title">{confirmation.title}</h2><p id="confirm-message">{confirmation.message}</p></div>
        <div className="confirm-actions">
          <button type="button" className="outline-button" onClick={() => settleConfirmation(false)}>{confirmation.cancelLabel}</button>
          <button ref={confirmButton} type="button" className={confirmation.tone === 'danger' ? 'danger-button' : 'solid-button'} onClick={() => settleConfirmation(true)}>{confirmation.confirmLabel}</button>
        </div>
      </section>
    </div>}
  </FeedbackContext.Provider>;
}

// eslint-disable-next-line react-refresh/only-export-components
export const useFeedback = () => {
  const value = useContext(FeedbackContext);
  if (!value) throw new Error('useFeedback must be used inside FeedbackProvider');
  return value;
};
