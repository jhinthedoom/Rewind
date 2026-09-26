import React, { useState, useEffect } from 'react';
import { db } from '../firebase';
import { collection, addDoc, doc, getDoc } from 'firebase/firestore';
import { Booking, BusinessEmailSettings, EmailLog, OperationType } from '../types';
import { handleFirestoreError } from '../utils';
import { 
  DEFAULT_BUSINESS_SETTINGS, 
  generateBookingConfirmationEmail, 
  generateCollectionReadyEmail, 
  generatePaymentReceiptEmail, 
  generateCustomEmail 
} from '../utils/emailTemplates';
import { generateBookingReceiptPdfBase64, downloadBookingReceiptPdf } from '../utils/pdfGenerator';
import { getBookingDocRef } from '../utils/referenceNumber';
import { 
  X, 
  Mail, 
  Send, 
  Eye, 
  Edit3, 
  CheckCircle2, 
  AlertCircle, 
  Sparkles, 
  Building2, 
  Calendar,
  FileText,
  User,
  Phone,
  RefreshCw,
  Sliders,
  Check,
  Download
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';

interface SendEmailModalProps {
  isOpen: boolean;
  onClose: () => void;
  booking?: Booking | null;
  defaultRecipientEmail?: string;
  defaultCustomerName?: string;
  defaultTemplate?: 'booking_confirmation' | 'collection_ready' | 'receipt' | 'reminder' | 'custom';
  onEmailSent?: (log: EmailLog) => void;
}

export const SendEmailModal: React.FC<SendEmailModalProps> = ({
  isOpen,
  onClose,
  booking,
  defaultRecipientEmail = '',
  defaultCustomerName = '',
  defaultTemplate = 'booking_confirmation',
  onEmailSent,
}) => {
  const [recipientEmail, setRecipientEmail] = useState(defaultRecipientEmail);
  const [customerName, setCustomerName] = useState(defaultCustomerName);
  const [templateType, setTemplateType] = useState<string>(defaultTemplate);
  const [subject, setSubject] = useState('');
  const [customNote, setCustomNote] = useState('');
  const [rawHtmlBody, setRawHtmlBody] = useState('');
  const [activeTab, setActiveTab] = useState<'compose' | 'preview'>('compose');
  const [attachPdf, setAttachPdf] = useState(true);
  const [isSending, setIsSending] = useState(false);
  const [sendSuccess, setSendSuccess] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const [settings, setSettings] = useState<BusinessEmailSettings>(() => {
    try {
      const saved = localStorage.getItem('nendoa_email_settings');
      return saved ? JSON.parse(saved) : DEFAULT_BUSINESS_SETTINGS;
    } catch {
      return DEFAULT_BUSINESS_SETTINGS;
    }
  });

  // Fetch settings from firestore if available
  useEffect(() => {
    const fetchSettings = async () => {
      try {
        const snap = await getDoc(doc(db, 'email_settings', 'main'));
        if (snap.exists()) {
          const data = snap.data() as BusinessEmailSettings;
          setSettings(data);
          localStorage.setItem('nendoa_email_settings', JSON.stringify(data));
        }
      } catch (err) {
        console.warn('Could not fetch email settings from firestore, using local defaults', err);
      }
    };
    fetchSettings();
  }, []);

  // Update recipient and content whenever booking or default params change
  useEffect(() => {
    if (booking) {
      setRecipientEmail(booking.customerEmail || defaultRecipientEmail || '');
      setCustomerName(booking.customerName || defaultCustomerName || '');
      const tType = defaultTemplate || (booking.readyForCollection ? 'collection_ready' : (booking.balancePaid ? 'receipt' : 'booking_confirmation'));
      setTemplateType(tType);

      if (tType === 'booking_confirmation') {
        setAttachPdf(Boolean(booking.depositPaid && (booking.depositAmount || 0) > 0));
      } else if (tType === 'receipt') {
        setAttachPdf(true);
      } else {
        setAttachPdf(false);
      }
    } else {
      setRecipientEmail(defaultRecipientEmail || '');
      setCustomerName(defaultCustomerName || '');
      setTemplateType(defaultTemplate || 'custom');
      setAttachPdf(false);
    }
    setSendSuccess(null);
    setErrorMessage(null);
  }, [booking, defaultRecipientEmail, defaultCustomerName, defaultTemplate, isOpen]);

  // Re-generate subject & body whenever template, booking, customer, custom notes or settings change
  useEffect(() => {
    const params = {
      customerName: customerName || booking?.customerName || 'Valued Guest',
      customerEmail: recipientEmail,
      workshopName: booking?.workshopName || 'Pottery Experience',
      bookingDate: booking?.date || new Date().toISOString().split('T')[0],
      bookingTime: booking?.time || '10:00 AM',
      location: (booking?.location as 'PG' | 'BM') || 'PG',
      pax: booking?.pax || 1,
      depositAmount: booking?.depositAmount || 0,
      totalPrice: booking?.totalPrice || 0,
      balancePaid: booking?.balancePaid || false,
      depositPaid: booking?.depositPaid || false,
      collectionMethod: booking?.collectionMethod || 'island',
      notes: booking?.notes || '',
      customMessage: customNote,
      settings,
      bookingId: booking ? getBookingDocRef(booking, templateType === 'receipt' ? (booking.paymentLater ? 'invoice' : 'receipt') : 'receipt') : undefined,
      paintingPieces: booking?.paintingPieces,
      paintingPrice: booking?.paintingPrice,
      deliveryFee: booking?.deliveryFee,
      drinksDiscountCount: booking?.drinksDiscountCount,
      selectedItems: booking?.selectedItems,
      paymentLater: booking?.paymentLater,
    };

    let result;
    if (templateType === 'booking_confirmation') {
      result = generateBookingConfirmationEmail(params);
    } else if (templateType === 'collection_ready') {
      result = generateCollectionReadyEmail(params);
    } else if (templateType === 'receipt') {
      result = generatePaymentReceiptEmail(params);
    } else {
      result = generateCustomEmail({
        ...params,
        customSubject: subject || `Message regarding your booking with Nendoa Studio`,
        bodyContent: customNote 
          ? `<p>Dear ${params.customerName},</p><p style="white-space: pre-wrap;">${customNote}</p>`
          : `<p>Dear ${params.customerName},</p><p>Thank you for crafting with Nendoa Studio. We look forward to seeing you soon!</p>`
      });
    }

    setSubject(result.subject);
    setRawHtmlBody(result.html);
  }, [templateType, customerName, recipientEmail, customNote, booking, settings]);

  if (!isOpen) return null;

  const handleSend = async () => {
    if (!recipientEmail || !recipientEmail.includes('@')) {
      setErrorMessage('Please provide a valid customer email address.');
      return;
    }

    setIsSending(true);
    setErrorMessage(null);
    setSendSuccess(null);

    try {
      let attachments: any[] | undefined = undefined;
      if (booking && attachPdf && (templateType === 'receipt' || templateType === 'booking_confirmation')) {
        try {
          const isDepositPaid = Boolean(booking.depositPaid && (booking.depositAmount || 0) > 0);
          const docType = (templateType === 'booking_confirmation' && isDepositPaid) 
            ? 'receipt' 
            : (booking.paymentLater ? 'invoice' : 'receipt');
          const docRef = getBookingDocRef(booking, docType);
          const pdfBase64 = generateBookingReceiptPdfBase64(booking, docType, docRef);
          const filename = `${docType === 'invoice' ? 'Tax-Invoice' : (templateType === 'booking_confirmation' && isDepositPaid ? 'Official-Deposit-Receipt' : 'Official-Receipt')}-${docRef.replace(/[^A-Za-z0-9-_]/g, '')}.pdf`;
          attachments = [
            {
              filename,
              content: pdfBase64,
              contentType: 'application/pdf',
            },
          ];
        } catch (pdfErr) {
          console.warn('Could not generate booking receipt PDF attachment:', pdfErr);
        }
      }

      const response = await fetch('/api/send-email', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          to: recipientEmail,
          subject,
          html: rawHtmlBody,
          fromName: settings.senderName,
          fromEmail: settings.fromEmail,
          replyTo: settings.replyTo,
          attachments,
          smtpConfig: settings.useCustomSmtp ? {
            host: settings.smtpHost,
            port: settings.smtpPort,
            secure: settings.smtpSecure,
            user: settings.smtpUser,
            pass: settings.smtpPass,
          } : undefined,
        }),
      });

      const data = await response.json();

      if (!response.ok || !data.success) {
        throw new Error(data.error || 'Failed to dispatch email.');
      }

      // Record to Firestore email_logs
      const logEntry: EmailLog = {
        to: recipientEmail,
        customerName: customerName || booking?.customerName || 'Customer',
        subject,
        fromEmail: settings.fromEmail,
        fromName: settings.senderName,
        templateType,
        bodyHtml: rawHtmlBody,
        status: data.mode === 'live_smtp' ? 'delivered' : 'simulated',
        createdAt: new Date().toISOString(),
        messageId: data.messageId,
        relatedBookingId: booking?.id || '',
        location: booking?.location || 'PG',
        sentBy: 'Staff',
      };

      try {
        const docRef = await addDoc(collection(db, 'email_logs'), logEntry);
        logEntry.id = docRef.id;
      } catch (e) {
        console.warn('Could not save to firestore email_logs, logging locally', e);
      }

      if (onEmailSent) {
        onEmailSent(logEntry);
      }

      setSendSuccess(
        data.mode === 'live_smtp'
          ? `Email successfully delivered to ${recipientEmail} through live SMTP!`
          : `Email sent to ${recipientEmail} via NENDOA Mailer (${data.mode})!`
      );

      setTimeout(() => {
        onClose();
      }, 1600);
    } catch (err: any) {
      console.error('Send error:', err);
      setErrorMessage(err.message || 'Failed to send email. Please check business SMTP settings.');
    } finally {
      setIsSending(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-center justify-center p-4">
      <motion.div 
        initial={{ opacity: 0, scale: 0.95, y: 15 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        exit={{ opacity: 0, scale: 0.95, y: 15 }}
        className="bg-white rounded-2xl w-full max-w-4xl max-h-[92vh] flex flex-col shadow-2xl overflow-hidden border border-[#EADDCF]"
      >
        {/* Modal Header */}
        <div className="px-6 py-4 border-b border-[#EADDCF] bg-[#FAF4F0] flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-full bg-[#C86A4B] text-white flex items-center justify-center shadow-xs">
              <Mail className="w-5 h-5" />
            </div>
            <div>
              <h3 className="font-serif text-lg font-bold text-[#2D241E]">
                Send Business Email to Customer
              </h3>
              <p className="text-xs text-[#8C7E74]">
                Dispatched from <span className="font-semibold text-[#C86A4B]">{settings.fromEmail}</span> ({settings.senderName})
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            {/* View Tab Toggle */}
            <div className="flex bg-[#EFE4DC] p-1 rounded-xl text-xs font-semibold">
              <button
                type="button"
                onClick={() => setActiveTab('compose')}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg transition-all ${
                  activeTab === 'compose' ? 'bg-white text-[#2D241E] shadow-xs' : 'text-[#8C7E74] hover:text-[#2D241E]'
                }`}
              >
                <Edit3 className="w-3.5 h-3.5" />
                Compose
              </button>
              <button
                type="button"
                onClick={() => setActiveTab('preview')}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg transition-all ${
                  activeTab === 'preview' ? 'bg-white text-[#2D241E] shadow-xs' : 'text-[#8C7E74] hover:text-[#2D241E]'
                }`}
              >
                <Eye className="w-3.5 h-3.5" />
                Live Preview
              </button>
            </div>

            <button
              onClick={onClose}
              className="p-2 text-[#8C7E74] hover:text-[#2D241E] hover:bg-[#EFE4DC] rounded-full transition-colors ml-2"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Modal Body */}
        <div className="flex-1 overflow-y-auto p-6 space-y-5 bg-[#FCFAF8]">
          {sendSuccess && (
            <motion.div 
              initial={{ opacity: 0, y: -10 }} 
              animate={{ opacity: 1, y: 0 }}
              className="p-4 rounded-xl bg-emerald-50 border border-emerald-200 text-emerald-800 flex items-center gap-3 text-sm font-medium"
            >
              <CheckCircle2 className="w-5 h-5 text-emerald-600 shrink-0" />
              <span>{sendSuccess}</span>
            </motion.div>
          )}

          {errorMessage && (
            <motion.div 
              initial={{ opacity: 0, y: -10 }} 
              animate={{ opacity: 1, y: 0 }}
              className="p-4 rounded-xl bg-rose-50 border border-rose-200 text-rose-800 flex items-center gap-3 text-sm font-medium"
            >
              <AlertCircle className="w-5 h-5 text-rose-600 shrink-0" />
              <span>{errorMessage}</span>
            </motion.div>
          )}

          {activeTab === 'compose' ? (
            <div className="space-y-4">
              {/* Template Picker */}
              <div>
                <label className="block text-[11px] font-bold text-[#8C7E74] uppercase tracking-wider mb-2">
                  Select Email Template
                </label>
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                  {[
                    { id: 'booking_confirmation', label: 'Booking Confirmation', icon: Calendar },
                    { id: 'collection_ready', label: 'Ready for Collection', icon: Sparkles },
                    { id: 'receipt', label: 'Payment Receipt', icon: FileText },
                    { id: 'custom', label: 'Custom Message', icon: Edit3 },
                  ].map((tpl) => {
                    const Icon = tpl.icon;
                    const isSelected = templateType === tpl.id;
                    return (
                      <button
                        key={tpl.id}
                        type="button"
                        onClick={() => setTemplateType(tpl.id)}
                        className={`flex items-center gap-2 p-3 rounded-xl border text-xs font-semibold text-left transition-all ${
                          isSelected
                            ? 'border-[#C86A4B] bg-[#FAF4F0] text-[#C86A4B] shadow-xs'
                            : 'border-[#EADDCF] bg-white text-[#5A4E47] hover:border-[#C86A4B]/50'
                        }`}
                      >
                        <Icon className={`w-4 h-4 shrink-0 ${isSelected ? 'text-[#C86A4B]' : 'text-[#8C7E74]'}`} />
                        <span className="truncate">{tpl.label}</span>
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* Recipient & Customer Details */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="block text-[11px] font-bold text-[#8C7E74] uppercase tracking-wider mb-1">
                    Customer Email Address *
                  </label>
                  <div className="relative">
                    <Mail className="w-4 h-4 absolute left-3.5 top-1/2 -translate-y-1/2 text-[#8C7E74]" />
                    <input
                      type="email"
                      required
                      placeholder="customer@example.com"
                      value={recipientEmail}
                      onChange={(e) => setRecipientEmail(e.target.value)}
                      className="w-full pl-10 pr-4 py-2.5 bg-white border border-[#EADDCF] rounded-xl text-sm text-[#2D241E] focus:outline-none focus:border-[#C86A4B] transition-colors"
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-[11px] font-bold text-[#8C7E74] uppercase tracking-wider mb-1">
                    Customer Name
                  </label>
                  <div className="relative">
                    <User className="w-4 h-4 absolute left-3.5 top-1/2 -translate-y-1/2 text-[#8C7E74]" />
                    <input
                      type="text"
                      placeholder="Customer Name"
                      value={customerName}
                      onChange={(e) => setCustomerName(e.target.value)}
                      className="w-full pl-10 pr-4 py-2.5 bg-white border border-[#EADDCF] rounded-xl text-sm text-[#2D241E] focus:outline-none focus:border-[#C86A4B] transition-colors"
                    />
                  </div>
                </div>
              </div>

              {/* Subject */}
              <div>
                <label className="block text-[11px] font-bold text-[#8C7E74] uppercase tracking-wider mb-1">
                  Email Subject Line
                </label>
                <input
                  type="text"
                  required
                  value={subject}
                  onChange={(e) => setSubject(e.target.value)}
                  className="w-full px-4 py-2.5 bg-white border border-[#EADDCF] rounded-xl text-sm font-medium text-[#2D241E] focus:outline-none focus:border-[#C86A4B] transition-colors"
                />
              </div>

              {/* Custom Personal Note / Message */}
              <div>
                <label className="block text-[11px] font-bold text-[#8C7E74] uppercase tracking-wider mb-1">
                  {templateType === 'custom' ? 'Message Content *' : 'Custom Personal Note (Optional)'}
                </label>
                <textarea
                  rows={4}
                  placeholder={
                    templateType === 'custom'
                      ? 'Type the full email body here...'
                      : 'Add any specific note for this customer (e.g. "We prepared extra blue glazes for you!")...'
                  }
                  value={customNote}
                  onChange={(e) => setCustomNote(e.target.value)}
                  className="w-full p-3.5 bg-white border border-[#EADDCF] rounded-xl text-sm text-[#2D241E] focus:outline-none focus:border-[#C86A4B] transition-colors"
                />
              </div>

              {/* Attach PDF Receipt Toggle (if booking exists) */}
              {booking && (
                <div className={`p-3.5 rounded-xl border flex items-center justify-between transition-colors ${
                  attachPdf && booking.depositPaid && (booking.depositAmount || 0) > 0
                    ? 'bg-[#F3F8F2] border-[#CFE2CD]'
                    : 'bg-[#FAF9F6] border-[#D9D1C7]'
                }`}>
                  <div className="flex items-center gap-2.5">
                    <input
                      type="checkbox"
                      id="attachPdfReceipt"
                      checked={attachPdf}
                      onChange={(e) => setAttachPdf(e.target.checked)}
                      className="w-4 h-4 text-[#C86A4B] rounded-sm focus:ring-[#C86A4B] accent-[#C86A4B] cursor-pointer"
                    />
                    <label htmlFor="attachPdfReceipt" className="text-xs font-bold text-[#2D241E] cursor-pointer flex items-center gap-1.5">
                      <FileText className={`w-3.5 h-3.5 ${attachPdf && booking.depositPaid && (booking.depositAmount || 0) > 0 ? 'text-emerald-700' : 'text-[#C86A4B]'}`} />
                      {templateType === 'booking_confirmation' ? (
                        booking.depositPaid && (booking.depositAmount || 0) > 0 ? (
                          <span>Attach Official Deposit Receipt PDF <strong className="text-emerald-800 font-mono">(RM{Number(booking.depositAmount).toFixed(2)})</strong></span>
                        ) : (
                          <span>Attach Session Slip / Invoice PDF</span>
                        )
                      ) : (
                        <span>Attach Official Studio PDF {booking?.paymentLater ? 'Invoice' : 'Receipt'} Slip</span>
                      )}
                    </label>
                  </div>

                  <button
                    type="button"
                    onClick={() => downloadBookingReceiptPdf(booking, booking?.paymentLater ? 'invoice' : 'receipt')}
                    className="inline-flex items-center gap-1 px-2.5 py-1 text-[11px] font-bold text-[#2D241E] bg-white border border-[#D9D1C7] hover:bg-[#F2EFE9] rounded-lg transition-colors shadow-2xs"
                  >
                    <Download className="w-3 h-3" />
                    Download PDF
                  </button>
                </div>
              )}

              {/* Sender Details Callout */}
              <div className="p-3.5 bg-[#FAF4F0] border border-[#EADDCF] rounded-xl flex items-center justify-between text-xs text-[#5A4E47]">
                <div className="flex items-center gap-2">
                  <Building2 className="w-4 h-4 text-[#C86A4B]" />
                  <span>
                    Sending from: <strong>{settings.senderName}</strong> &lt;{settings.fromEmail}&gt;
                  </span>
                </div>
                <span className="text-[11px] text-[#8C7E74]">
                  {settings.useCustomSmtp && settings.smtpHost ? `Custom SMTP (${settings.smtpHost})` : 'NENDOA Mailer Engine'}
                </span>
              </div>
            </div>
          ) : (
            /* Live Email Preview */
            <div className="space-y-3">
              <div className="bg-[#EFE4DC]/60 p-3 rounded-xl border border-[#EADDCF] flex flex-wrap items-center justify-between text-xs text-[#5A4E47] gap-2">
                <div>
                  <strong>To:</strong> {recipientEmail || '(recipient email)'} &bull; <strong>From:</strong> {settings.senderName} &lt;{settings.fromEmail}&gt;
                </div>
                <div>
                  <strong>Subject:</strong> {subject}
                </div>
              </div>

              <div className="border border-[#EADDCF] rounded-2xl overflow-hidden bg-white shadow-inner">
                <iframe
                  title="Email Preview"
                  srcDoc={rawHtmlBody}
                  className="w-full h-[460px] border-0"
                />
              </div>
            </div>
          )}
        </div>

        {/* Modal Footer */}
        <div className="px-6 py-4 border-t border-[#EADDCF] bg-[#FAF4F0] flex items-center justify-between">
          <button
            type="button"
            onClick={onClose}
            className="px-5 py-2.5 rounded-xl border border-[#EADDCF] text-xs font-bold text-[#5A4E47] hover:bg-white transition-colors"
          >
            Cancel
          </button>

          <div className="flex items-center gap-3">
            {activeTab === 'compose' && (
              <button
                type="button"
                onClick={() => setActiveTab('preview')}
                className="px-4 py-2.5 rounded-xl border border-[#C86A4B] text-xs font-bold text-[#C86A4B] hover:bg-[#C86A4B]/5 transition-colors flex items-center gap-1.5"
              >
                <Eye className="w-3.5 h-3.5" />
                Preview First
              </button>
            )}

            <button
              type="button"
              disabled={isSending || !recipientEmail}
              onClick={handleSend}
              className={`px-6 py-2.5 rounded-xl text-xs font-bold uppercase tracking-wider text-white flex items-center gap-2 shadow-sm transition-all ${
                isSending || !recipientEmail
                  ? 'bg-[#C86A4B]/60 cursor-not-allowed'
                  : 'bg-[#C86A4B] hover:bg-[#B3593B] active:scale-95'
              }`}
            >
              {isSending ? (
                <>
                  <RefreshCw className="w-4 h-4 animate-spin" />
                  Dispatching...
                </>
              ) : (
                <>
                  <Send className="w-4 h-4" />
                  Send Email
                </>
              )}
            </button>
          </div>
        </div>
      </motion.div>
    </div>
  );
};

export default SendEmailModal;
