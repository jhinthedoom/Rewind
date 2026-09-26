import React from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { AlertCircle, X } from 'lucide-react';

interface ConfirmationModalProps {
  isOpen: boolean;
  onClose: () => void;
  onConfirm: () => void;
  title: string;
  message: string;
  confirmText?: string;
  cancelText?: string;
  isDestructive?: boolean;
}

export const ConfirmationModal: React.FC<ConfirmationModalProps> = ({
  isOpen,
  onClose,
  onConfirm,
  title,
  message,
  confirmText = 'Confirm',
  cancelText = 'Cancel',
  isDestructive = true
}) => {
  return (
    <AnimatePresence>
      {isOpen && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={onClose}
            className="absolute inset-0 bg-[#2D241E]/40 backdrop-blur-sm"
          />
          <motion.div
            initial={{ opacity: 0, scale: 0.95, y: 20 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.95, y: 20 }}
            className="relative bg-white rounded-[32px] shadow-2xl border border-[#D9D1C7] w-full max-w-sm overflow-hidden"
          >
            <div className="p-6">
              <div className="flex items-start gap-4">
                <div className={`p-3 rounded-2xl ${isDestructive ? 'bg-red-50 text-red-500' : 'bg-blue-50 text-blue-500'}`}>
                  <AlertCircle size={24} />
                </div>
                <div className="flex-1">
                  <h3 className="text-lg font-serif font-bold text-[#2D241E] leading-tight mb-1">
                    {title}
                  </h3>
                  <p className="text-[#8C8379] text-sm leading-relaxed">
                    {message}
                  </p>
                </div>
                <button 
                  onClick={onClose}
                  className="p-1 text-[#D9D1C7] hover:text-[#8C8379] transition-colors"
                >
                  <X size={20} />
                </button>
              </div>
            </div>

            <div className="flex border-t border-[#F2EFE9] bg-[#FAF9F6]/50">
              <button
                onClick={onClose}
                className="flex-1 py-4 text-sm font-medium text-[#8C8379] hover:bg-white transition-colors"
              >
                {cancelText}
              </button>
              <button
                onClick={() => {
                  onConfirm();
                  onClose();
                }}
                className={`flex-1 py-4 text-sm font-bold border-l border-[#F2EFE9] transition-colors ${
                  isDestructive 
                    ? 'text-red-500 hover:bg-red-50' 
                    : 'text-[#2D241E] hover:bg-white'
                }`}
              >
                {confirmText}
              </button>
            </div>
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  );
};
