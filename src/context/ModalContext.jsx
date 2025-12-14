import React, { createContext, useContext, useState, useCallback } from 'react';
import Modal from '../components/Modal';

const ModalContext = createContext(null);

export function ModalProvider({ children }) {
  const [modals, setModals] = useState([]);

  const openModal = useCallback((config) => {
    const id = Date.now().toString();
    const modal = { id, ...config };
    setModals(prev => [...prev, modal]);
    return id;
  }, []);

  const closeModal = useCallback((id) => {
    setModals(prev => prev.filter(m => m.id !== id));
  }, []);

  const closeAllModals = useCallback(() => {
    setModals([]);
  }, []);

  const updateModal = useCallback((id, updates) => {
    setModals(prev => prev.map(m => 
      m.id === id ? { ...m, ...updates } : m
    ));
  }, []);

  // Confirmation modal helper
  const confirm = useCallback(({ title, message, type = 'warning', confirmText = 'Confirm', cancelText = 'Cancel' }) => {
    return new Promise((resolve) => {
      const id = openModal({
        type: 'confirm',
        title,
        message,
        confirmType: type,
        confirmText,
        cancelText,
        onConfirm: () => {
          closeModal(id);
          resolve(true);
        },
        onCancel: () => {
          closeModal(id);
          resolve(false);
        }
      });
    });
  }, [openModal, closeModal]);

  // Alert modal helper
  const alert = useCallback(({ title, message, type = 'success' }) => {
    return new Promise((resolve) => {
      const id = openModal({
        type: 'alert',
        title,
        message,
        alertType: type,
        onClose: () => {
          closeModal(id);
          resolve();
        }
      });
    });
  }, [openModal, closeModal]);

  return (
    <ModalContext.Provider value={{ 
      modals, 
      openModal, 
      closeModal, 
      closeAllModals, 
      updateModal,
      confirm,
      alert
    }}>
      {children}
      {modals.map((modal, index) => (
        <Modal
          key={modal.id}
          {...modal}
          zIndex={200 + index}
          onClose={() => {
            if (modal.onCancel) modal.onCancel();
            else if (modal.onClose) modal.onClose();
            else closeModal(modal.id);
          }}
        />
      ))}
    </ModalContext.Provider>
  );
}

export function useModal() {
  const context = useContext(ModalContext);
  if (!context) {
    throw new Error('useModal must be used within a ModalProvider');
  }
  return context;
}

export default ModalContext;
