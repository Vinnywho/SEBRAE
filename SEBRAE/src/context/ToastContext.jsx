import React, { createContext, useContext, useState, useCallback } from 'react';
import { CheckCircle2, AlertCircle, AlertTriangle, Info, X } from 'lucide-react';
import './Toast.css';

const ToastContext = createContext(null);

export const ToastProvider = ({ children }) => {
  const [toasts, setToasts] = useState([]);
  const [confirmState, setConfirmState] = useState(null);

  const removeToast = useCallback((id) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  }, []);

  const addToast = useCallback(({ type = 'info', title, message, duration = 4000 }) => {
    const id = Date.now() + Math.random().toString(36).substring(2, 9);
    const newToast = { id, type, title, message };
    setToasts((prev) => [...prev, newToast]);

    if (duration > 0) {
      setTimeout(() => {
        removeToast(id);
      }, duration);
    }
  }, [removeToast]);

  const toast = {
    success: (message, title = 'Sucesso') => addToast({ type: 'success', title, message }),
    error: (message, title = 'Erro') => addToast({ type: 'error', title, message, duration: 6000 }),
    warning: (message, title = 'Atenção') => addToast({ type: 'warning', title, message }),
    info: (message, title = 'Informação') => addToast({ type: 'info', title, message })
  };

  const confirmDialog = ({
    title = 'Confirmar Ação',
    message,
    confirmText = 'Confirmar',
    cancelText = 'Cancelar',
    isDanger = false,
    onConfirm
  }) => {
    return new Promise((resolve) => {
      setConfirmState({
        title,
        message,
        confirmText,
        cancelText,
        isDanger,
        onConfirm: () => {
          setConfirmState(null);
          if (onConfirm) onConfirm();
          resolve(true);
        },
        onCancel: () => {
          setConfirmState(null);
          resolve(false);
        }
      });
    });
  };

  const getIcon = (type) => {
    switch (type) {
      case 'success':
        return <CheckCircle2 size={20} className="toast-icon" />;
      case 'error':
        return <AlertCircle size={20} className="toast-icon" />;
      case 'warning':
        return <AlertTriangle size={20} className="toast-icon" />;
      default:
        return <Info size={20} className="toast-icon" />;
    }
  };

  return (
    <ToastContext.Provider value={{ toast, confirmDialog }}>
      {children}

      {/* Floating Toasts */}
      <div className="toast-container">
        {toasts.map((t) => (
          <div key={t.id} className={`toast-item ${t.type}`}>
            {getIcon(t.type)}
            <div className="toast-content">
              {t.title && <h5 className="toast-title">{t.title}</h5>}
              <p className="toast-message">{t.message}</p>
            </div>
            <button className="toast-close" onClick={() => removeToast(t.id)}>
              <X size={16} />
            </button>
          </div>
        ))}
      </div>

      {/* Modern Confirmation Dialog */}
      {confirmState && (
        <div className="confirm-overlay" onClick={confirmState.onCancel}>
          <div className="confirm-box" onClick={(e) => e.stopPropagation()}>
            <div className="confirm-header">
              <div className={`confirm-icon-wrapper ${confirmState.isDanger ? 'danger' : 'primary'}`}>
                {confirmState.isDanger ? <AlertTriangle size={22} /> : <Info size={22} />}
              </div>
              <h4>{confirmState.title}</h4>
            </div>
            <p className="confirm-message">{confirmState.message}</p>
            <div className="confirm-actions">
              <button className="confirm-btn-cancel" onClick={confirmState.onCancel}>
                {confirmState.cancelText}
              </button>
              <button
                className={`confirm-btn-action ${confirmState.isDanger ? 'danger' : 'primary'}`}
                onClick={confirmState.onConfirm}
              >
                {confirmState.confirmText}
              </button>
            </div>
          </div>
        </div>
      )}
    </ToastContext.Provider>
  );
};

export const useToast = () => {
  const context = useContext(ToastContext);
  if (!context) {
    throw new Error('useToast deve ser usado dentro de um ToastProvider');
  }
  return context;
};
