import * as React from 'react';
import { createPortal } from 'react-dom';
import { CheckCircle, XCircle, AlertTriangle, Info, X } from 'lucide-react';
import { cn } from '@/lib/utils';

export type ToastVariant = 'success' | 'error' | 'warning' | 'info';

export interface Toast {
  id: string;
  variant: ToastVariant;
  title?: string;
  message: string;
  duration?: number;
}

export interface ToastContextValue {
  toast: (toast: Omit<Toast, 'id'>) => void;
  dismiss: (id: string) => void;
}

const ToastContext = React.createContext<ToastContextValue | undefined>(
  undefined
);

const TOAST_LIMIT = 5;
const TOAST_REMOVE_DELAY = 300;

function toastVariantStyles(variant: ToastVariant) {
  switch (variant) {
    case 'success':
      return 'border-green-500/50 text-green-50';
    case 'error':
      return 'border-red-500/50 text-red-50';
    case 'warning':
      return 'border-yellow-500/50 text-yellow-50';
    case 'info':
      return 'border-blue-500/50 text-blue-50';
  }
}

function toastIcon(variant: ToastVariant) {
  switch (variant) {
    case 'success':
      return <CheckCircle className="h-5 w-5 text-green-400" />;
    case 'error':
      return <XCircle className="h-5 w-5 text-red-400" />;
    case 'warning':
      return <AlertTriangle className="h-5 w-5 text-yellow-400" />;
    case 'info':
      return <Info className="h-5 w-5 text-blue-400" />;
  }
}

interface ToastItemProps {
  toast: Toast;
  onDismiss: (id: string) => void;
}

function ToastItem({ toast, onDismiss }: ToastItemProps) {
  const [isVisible, setIsVisible] = React.useState(false);
  const [isLeaving, setIsLeaving] = React.useState(false);

  React.useEffect(() => {
    // Animate in
    setIsVisible(true);

    // Auto dismiss
    const duration = toast.duration ?? 5000;
    const timer = setTimeout(() => {
      handleDismiss();
    }, duration);

    return () => clearTimeout(timer);
  }, [toast.duration]);

  const handleDismiss = () => {
    setIsLeaving(true);
    setTimeout(() => {
      onDismiss(toast.id);
    }, TOAST_REMOVE_DELAY);
  };

  return (
    <div
      role="alert"
      className={cn(
        'flex items-start gap-3 rounded-lg border bg-card p-4 shadow-lg',
        'animate-in slide-in-from-right-full',
        isLeaving && 'animate-out slide-out-to-right-full',
        isVisible && 'duration-300',
        toastVariantStyles(toast.variant)
      )}
    >
      <div className="shrink-0">{toastIcon(toast.variant)}</div>
      <div className="flex-1">
        {toast.title && (
          <h4 className="font-semibold">{toast.title}</h4>
        )}
        <p className="text-sm text-muted-foreground">{toast.message}</p>
      </div>
      <button
        onClick={handleDismiss}
        className="shrink-0 rounded-md p-1 transition-colors hover:bg-white/10 focus:outline-none focus:ring-2 focus:ring-ring"
        aria-label="Dismiss notification"
      >
        <X className="h-4 w-4" />
      </button>
    </div>
  );
}

interface ToastContainerProps {
  toasts: Toast[];
  onDismiss: (id: string) => void;
}

function ToastContainer({ toasts, onDismiss }: ToastContainerProps) {
  const container = React.useRef<HTMLDivElement>(null);

  React.useEffect(() => {
    container.current?.scrollIntoView({ behavior: 'smooth', block: 'end' });
  }, [toasts]);

  if (toasts.length === 0) {
    return null;
  }

  return createPortal(
    <div className="fixed bottom-4 right-4 z-[100] flex max-h-[50vh] w-full max-w-sm flex-col gap-2 overflow-y-auto">
      {toasts.map((toast) => (
        <ToastItem key={toast.id} toast={toast} onDismiss={onDismiss} />
      ))}
    </div>,
    document.body
  );
}

interface ToastProviderProps {
  children: React.ReactNode;
}

function ToastProvider({ children }: ToastProviderProps) {
  const [toasts, setToasts] = React.useState<Toast[]>([]);
  const toastCount = React.useRef(0);

  const toast = React.useCallback(
    (newToast: Omit<Toast, 'id'>) => {
      const id = `toast-${toastCount.current++}`;
      const toastWithId: Toast = { ...newToast, id };

      setToasts((prevToasts) => {
        const newToasts = [toastWithId, ...prevToasts];
        if (newToasts.length > TOAST_LIMIT) {
          return newToasts.slice(0, TOAST_LIMIT);
        }
        return newToasts;
      });
    },
    []
  );

  const dismiss = React.useCallback((id: string) => {
    setToasts((prevToasts) => prevToasts.filter((t) => t.id !== id));
  }, []);

  const value = React.useMemo(() => ({ toast, dismiss }), [toast, dismiss]);

  return (
    <ToastContext.Provider value={value}>
      {children}
      <ToastContainer toasts={toasts} onDismiss={dismiss} />
    </ToastContext.Provider>
  );
}

function useToast(): ToastContextValue {
  const context = React.useContext(ToastContext);
  if (context === undefined) {
    throw new Error('useToast must be used within a ToastProvider');
  }
  return context;
}

export { ToastProvider, useToast };
