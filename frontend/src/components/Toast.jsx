import { useState, useEffect } from 'react';
import { CheckCircle2, AlertTriangle, Info, XCircle, X } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';

export const ToastContainer = ({ toasts, removeToast }) => {
  return (
    <div className="fixed bottom-6 right-6 z-[200] flex flex-col gap-3 pointer-events-none">
      <AnimatePresence>
        {toasts.map((toast) => (
          <Toast key={toast.id} {...toast} onClose={() => removeToast(toast.id)} />
        ))}
      </AnimatePresence>
    </div>
  );
};

const Toast = ({ id, type = 'info', title, message, duration = 5000, onClose, action }) => {
  useEffect(() => {
    if (duration > 0) {
      const timer = setTimeout(onClose, duration);
      return () => clearTimeout(timer);
    }
  }, [duration, onClose]);

  const config = {
    success: {
      icon: CheckCircle2,
      bg: 'bg-emerald-900/20',
      border: 'border-emerald-500/50',
      text: 'text-emerald-300',
      iconColor: 'text-emerald-500'
    },
    error: {
      icon: XCircle,
      bg: 'bg-red-900/20',
      border: 'border-red-500/50',
      text: 'text-red-300',
      iconColor: 'text-red-500'
    },
    warning: {
      icon: AlertTriangle,
      bg: 'bg-yellow-900/20',
      border: 'border-yellow-500/50',
      text: 'text-yellow-300',
      iconColor: 'text-yellow-500'
    },
    info: {
      icon: Info,
      bg: 'bg-blue-900/20',
      border: 'border-blue-500/50',
      text: 'text-blue-300',
      iconColor: 'text-blue-500'
    }
  };

  const { icon: Icon, bg, border, text, iconColor } = config[type];

  return (
    <motion.div
      initial={{ opacity: 0, y: 20, scale: 0.95 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      exit={{ opacity: 0, x: 100, scale: 0.9 }}
      transition={{ duration: 0.2 }}
      className={`${bg} ${border} ${text} border rounded-lg p-4 flex items-start gap-3 min-w-[320px] max-w-[400px] shadow-2xl backdrop-blur-sm pointer-events-auto`}
    >
      <Icon size={20} className={`${iconColor} shrink-0 mt-0.5`} />

      <div className="flex-1 min-w-0">
        {title && <div className="font-bold text-sm mb-1">{title}</div>}
        {message && <div className="text-xs opacity-90">{message}</div>}
        {action && (
          <button
            onClick={action.onClick}
            className="mt-2 text-xs font-bold hover:underline"
          >
            {action.label}
          </button>
        )}
      </div>

      <button
        onClick={onClose}
        className="shrink-0 hover:opacity-70 transition-opacity"
      >
        <X size={16} />
      </button>
    </motion.div>
  );
};

// Hook for managing toasts
export const useToast = () => {
  const [toasts, setToasts] = useState([]);

  const addToast = ({ type = 'info', title, message, duration = 5000, action }) => {
    const id = Date.now() + Math.random();
    setToasts((prev) => [...prev, { id, type, title, message, duration, action }]);
    return id;
  };

  const removeToast = (id) => {
    setToasts((prev) => prev.filter((toast) => toast.id !== id));
  };

  const toast = {
    success: (title, message, options = {}) => addToast({ type: 'success', title, message, ...options }),
    error: (title, message, options = {}) => addToast({ type: 'error', title, message, ...options }),
    warning: (title, message, options = {}) => addToast({ type: 'warning', title, message, ...options }),
    info: (title, message, options = {}) => addToast({ type: 'info', title, message, ...options })
  };

  return { toasts, toast, removeToast };
};
