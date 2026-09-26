import React, { useState, useEffect, useMemo } from 'react';
import { db } from '../firebase';
import { collection, onSnapshot, addDoc, updateDoc, doc, setDoc, getDoc, query, orderBy, Timestamp } from 'firebase/firestore';
import { Booking, Transaction, BusinessEmailSettings, EmailLog, Branch, EmailTemplateConfig } from '../types';
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
  DEFAULT_TEMPLATE_CONFIGS, 
  getStoredTemplateConfigs, 
  saveStoredTemplateConfigs 
} from '../utils/templateConfigs';
import { TemplateEditorModal } from './TemplateEditorModal';
import { 
  Mail, 
  Send, 
  Eye, 
  Settings, 
  History, 
  CheckCircle2, 
  AlertCircle, 
  RefreshCw, 
  Search, 
  Filter, 
  User, 
  Building2, 
  Calendar, 
  Sparkles, 
  FileText, 
  Layers, 
  Check, 
  X, 
  Clock, 
  Copy, 
  Smartphone, 
  Monitor, 
  Key, 
  Server, 
  Lock, 
  ShieldCheck, 
  ExternalLink,
  Phone,
  Edit2,
  EyeOff,
  Sliders,
  RotateCcw,
  Download
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';

interface EmailCenterProps {
  branch: Branch;
  role: 'admin' | 'staff';
}

export const EmailCenter: React.FC<EmailCenterProps> = ({ branch, role }) => {
  const [activeTab, setActiveTab] = useState<'compose' | 'history' | 'settings'>('compose');

  // Customer & Bookings state for auto-complete
  const [bookings, setBookings] = useState<Booking[]>([]);
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [emailLogs, setEmailLogs] = useState<EmailLog[]>([]);
  const [logsLoading, setLogsLoading] = useState(true);

  // Compose State
  const [selectedCustomerId, setSelectedCustomerId] = useState<string>('');
  const [recipientEmail, setRecipientEmail] = useState('');
  const [customerName, setCustomerName] = useState('');
  const [selectedBookingId, setSelectedBookingId] = useState<string>('');
  const [templateType, setTemplateType] = useState<string>('booking_confirmation');
  const [subject, setSubject] = useState('');
  const [customNote, setCustomNote] = useState('');
  const [rawHtmlBody, setRawHtmlBody] = useState('');
  const [previewDevice, setPreviewDevice] = useState<'desktop' | 'mobile'>('desktop');
  const [showPreviewModal, setShowPreviewModal] = useState(false);
  const [isSending, setIsSending] = useState(false);
  const [sendSuccessMsg, setSendSuccessMsg] = useState<string | null>(null);
  const [sendErrorMsg, setSendErrorMsg] = useState<string | null>(null);

  // Outbox search & filter
  const [logSearchQuery, setLogSearchQuery] = useState('');
  const [logStatusFilter, setLogStatusFilter] = useState<string>('ALL');
  const [selectedLogForDetail, setSelectedLogForDetail] = useState<EmailLog | null>(null);

  // Settings State
  const [settings, setSettings] = useState<BusinessEmailSettings>(() => {
    try {
      const saved = localStorage.getItem('nendoa_email_settings');
      return saved ? JSON.parse(saved) : DEFAULT_BUSINESS_SETTINGS;
    } catch {
      return DEFAULT_BUSINESS_SETTINGS;
    }
  });
  const [templateConfigs, setTemplateConfigs] = useState<Record<string, EmailTemplateConfig>>(() => {
    return getStoredTemplateConfigs();
  });
  const [editingTemplateId, setEditingTemplateId] = useState<string | null>(null);
  const [isSavingSettings, setIsSavingSettings] = useState(false);
  const [settingsSuccess, setSettingsSuccess] = useState<string | null>(null);
  const [isTestingSmtp, setIsTestingSmtp] = useState(false);
  const [smtpTestResult, setSmtpTestResult] = useState<{ success: boolean; message: string } | null>(null);
  const [testEmailAddress, setTestEmailAddress] = useState('');
  const [isSendingTestMail, setIsSendingTestMail] = useState(false);
  const [showPassword, setShowPassword] = useState(false);

  // 1. Fetch Bookings and Transactions for Customer Directory
  useEffect(() => {
    const unsubBookings = onSnapshot(collection(db, 'bookings'), (snap) => {
      const list = snap.docs.map(d => ({ id: d.id, ...d.data() } as Booking));
      setBookings(list);
    });

    const unsubTx = onSnapshot(collection(db, 'transactions'), (snap) => {
      const list = snap.docs.map(d => ({ id: d.id, ...d.data() } as Transaction));
      setTransactions(list);
    });

    const unsubLogs = onSnapshot(collection(db, 'email_logs'), (snap) => {
      const list = snap.docs.map(d => ({ id: d.id, ...d.data() } as EmailLog));
      list.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
      setEmailLogs(list);
      setLogsLoading(false);
    });

    // Fetch persistent email settings
    const fetchSettings = async () => {
      try {
        const snap = await getDoc(doc(db, 'email_settings', 'main'));
        if (snap.exists()) {
          const data = snap.data() as BusinessEmailSettings;
          setSettings(data);
          localStorage.setItem('nendoa_email_settings', JSON.stringify(data));
        }
      } catch (err) {
        console.warn('Could not fetch settings:', err);
      }
    };
    fetchSettings();

    return () => {
      unsubBookings();
      unsubTx();
      unsubLogs();
    };
  }, []);

  // Customer List aggregation (from Bookings and Transactions)
  const customerDirectory = useMemo(() => {
    const map = new Map<string, { name: string; email: string; phone?: string; latestBooking?: Booking }>();

    // From Bookings
    bookings.forEach(b => {
      const emailKey = b.customerEmail ? b.customerEmail.toLowerCase().trim() : (b.customerPhone || b.customerName);
      if (!map.has(emailKey) && (b.customerEmail || b.customerName)) {
        map.set(emailKey, {
          name: b.customerName,
          email: b.customerEmail || '',
          phone: b.customerPhone,
          latestBooking: b,
        });
      }
    });

    // From Transactions
    transactions.forEach(t => {
      if (t.customerEmail && !map.has(t.customerEmail.toLowerCase().trim())) {
        map.set(t.customerEmail.toLowerCase().trim(), {
          name: t.customerName,
          email: t.customerEmail,
          phone: t.customerPhone,
        });
      }
    });

    return Array.from(map.values());
  }, [bookings, transactions]);

  // Handle selecting a customer from directory
  const handleSelectCustomer = (customerEmailOrKey: string) => {
    setSelectedCustomerId(customerEmailOrKey);
    const found = customerDirectory.find(c => (c.email === customerEmailOrKey) || (c.name === customerEmailOrKey));
    if (found) {
      setRecipientEmail(found.email);
      setCustomerName(found.name);
      if (found.latestBooking) {
        setSelectedBookingId(found.latestBooking.id || '');
      }
    }
  };

  // Find currently active booking object
  const activeBooking = useMemo(() => {
    if (!selectedBookingId) return null;
    return bookings.find(b => b.id === selectedBookingId) || null;
  }, [bookings, selectedBookingId]);

  // Template configuration handlers
  const handleSaveTemplateConfig = (updated: EmailTemplateConfig) => {
    const updatedConfigs = {
      ...templateConfigs,
      [updated.id]: updated,
    };
    setTemplateConfigs(updatedConfigs);
    saveStoredTemplateConfigs(updatedConfigs);
  };

  const handleResetTemplateConfig = (templateId: string) => {
    const def = DEFAULT_TEMPLATE_CONFIGS[templateId];
    if (def) {
      const updatedConfigs = {
        ...templateConfigs,
        [templateId]: def,
      };
      setTemplateConfigs(updatedConfigs);
      saveStoredTemplateConfigs(updatedConfigs);
    }
  };

  // Re-generate email content whenever template, inputs, or booking change
  useEffect(() => {
    const currentTemplateConfig = templateConfigs[templateType] || DEFAULT_TEMPLATE_CONFIGS[templateType];
    const params = {
      customerName: customerName || activeBooking?.customerName || 'Valued Guest',
      customerEmail: recipientEmail,
      workshopName: activeBooking?.workshopName || 'Pottery Workshop',
      bookingDate: activeBooking?.date || new Date().toISOString().split('T')[0],
      bookingTime: activeBooking?.time || '10:00 AM',
      location: (activeBooking?.location as 'PG' | 'BM') || 'PG',
      pax: activeBooking?.pax || 1,
      depositAmount: activeBooking?.depositAmount || 0,
      totalPrice: activeBooking?.totalPrice || 0,
      balancePaid: activeBooking?.balancePaid || false,
      depositPaid: activeBooking?.depositPaid || false,
      collectionMethod: activeBooking?.collectionMethod || 'island',
      notes: activeBooking?.notes || '',
      customMessage: customNote,
      settings,
      bookingId: activeBooking ? getBookingDocRef(activeBooking, activeBooking.paymentLater ? 'invoice' : 'receipt', bookings) : undefined,
      templateConfig: currentTemplateConfig,
      paintingPieces: activeBooking?.paintingPieces,
      paintingPrice: activeBooking?.paintingPrice,
      deliveryFee: activeBooking?.deliveryFee,
      drinksDiscountCount: activeBooking?.drinksDiscountCount,
      selectedItems: activeBooking?.selectedItems,
      paymentLater: activeBooking?.paymentLater,
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
        customSubject: subject || currentTemplateConfig?.subject || `Message from ${settings.senderName}`,
        bodyContent: customNote 
          ? `<p>Dear ${params.customerName},</p><p style="white-space: pre-wrap;">${customNote}</p>`
          : `<p>Dear ${params.customerName},</p><p>${currentTemplateConfig?.leadMessage || 'Thank you for connecting with TOKIKOBO Pottery Studio.'}</p>`
      });
    }

    setSubject(result.subject);
    setRawHtmlBody(result.html);
  }, [templateType, customerName, recipientEmail, customNote, activeBooking, settings, templateConfigs, bookings]);

  // Dispatch Email
  const handleSendEmail = async () => {
    if (!recipientEmail || !recipientEmail.includes('@')) {
      setSendErrorMsg('Please enter a valid recipient customer email address.');
      return;
    }

    setIsSending(true);
    setSendErrorMsg(null);
    setSendSuccessMsg(null);

    try {
      let attachments: any[] | undefined = undefined;
      if (activeBooking && (templateType === 'receipt' || templateType === 'booking_confirmation')) {
        try {
          const docType = activeBooking.paymentLater ? 'invoice' : 'receipt';
          const docRef = getBookingDocRef(activeBooking, docType, bookings);
          const pdfBase64 = generateBookingReceiptPdfBase64(activeBooking, docType, docRef, bookings);
          const filename = `${docType === 'invoice' ? 'Tax-Invoice' : 'Official-Receipt'}-${docRef.replace(/[^A-Za-z0-9-_]/g, '')}.pdf`;
          attachments = [
            {
              filename,
              content: pdfBase64,
              contentType: 'application/pdf',
            },
          ];
        } catch (pdfErr) {
          console.warn('Could not generate PDF attachment in EmailCenter:', pdfErr);
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

      // Record to Firestore
      const newLog: EmailLog = {
        to: recipientEmail,
        customerName: customerName || 'Customer',
        subject,
        fromEmail: settings.fromEmail,
        fromName: settings.senderName,
        templateType,
        bodyHtml: rawHtmlBody,
        status: data.mode === 'live_smtp' ? 'delivered' : 'simulated',
        createdAt: new Date().toISOString(),
        messageId: data.messageId,
        relatedBookingId: activeBooking?.id || '',
        location: activeBooking?.location || 'PG',
        sentBy: role === 'admin' ? 'Admin' : 'Staff',
      };

      await addDoc(collection(db, 'email_logs'), newLog);

      setSendSuccessMsg(
        data.mode === 'live_smtp'
          ? `Email successfully delivered to ${recipientEmail} via Live SMTP!`
          : `Email successfully sent to ${recipientEmail} via NENDOA Mailer Engine (${data.mode})!`
      );

      // Reset specific fields
      setCustomNote('');
    } catch (err: any) {
      console.error('Send error:', err);
      setSendErrorMsg(err.message || 'Failed to dispatch email.');
    } finally {
      setIsSending(false);
    }
  };

  // Save Settings
  const handleSaveSettings = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSavingSettings(true);
    setSettingsSuccess(null);

    try {
      await setDoc(doc(db, 'email_settings', 'main'), settings);
      localStorage.setItem('nendoa_email_settings', JSON.stringify(settings));
      setSettingsSuccess('Business Email & SMTP Settings saved successfully!');
      setTimeout(() => setSettingsSuccess(null), 4000);
    } catch (err: any) {
      console.error('Error saving settings:', err);
    } finally {
      setIsSavingSettings(false);
    }
  };

  // Test SMTP Connection
  const handleTestSmtp = async () => {
    setIsTestingSmtp(true);
    setSmtpTestResult(null);

    try {
      const response = await fetch('/api/verify-smtp', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          host: settings.smtpHost,
          port: settings.smtpPort,
          secure: settings.smtpSecure,
          user: settings.smtpUser,
          pass: settings.smtpPass,
        }),
      });

      const data = await response.json();
      setSmtpTestResult({
        success: Boolean(data.success),
        message: data.message || (data.success ? 'SMTP Connection Verified!' : 'SMTP Connection Failed.'),
      });
    } catch (err: any) {
      setSmtpTestResult({
        success: false,
        message: err.message || 'Failed to reach backend SMTP test endpoint.',
      });
    } finally {
      setIsTestingSmtp(false);
    }
  };

  // Send Test Email to Staff Inbox
  const handleSendTestEmail = async () => {
    if (!testEmailAddress || !testEmailAddress.includes('@')) {
      alert('Please enter a valid email address to receive the test email.');
      return;
    }

    setIsSendingTestMail(true);
    try {
      const testHtml = `
        <div style="font-family: Georgia, serif; padding: 30px; background-color: #FAF4F0; color: #2D241E;">
          <div style="max-width: 500px; margin: 0 auto; background: #fff; padding: 25px; border-radius: 12px; border: 1px solid #EFE4DC;">
            <h2 style="color: #C86A4B; margin-top: 0;">NENDOA Pottery Studio</h2>
            <p><strong>SMTP Test Successful!</strong></p>
            <p>Your business email dispatch service is operating normally.</p>
            <hr style="border: 0; border-top: 1px solid #EFE4DC;" />
            <p style="font-size: 12px; color: #8C7E74;">Sent at: ${new Date().toLocaleString()}</p>
          </div>
        </div>
      `;

      const response = await fetch('/api/send-email', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          to: testEmailAddress,
          subject: 'NENDOA Pottery – SMTP Test Email',
          html: testHtml,
          fromName: settings.senderName,
          fromEmail: settings.fromEmail,
          replyTo: settings.replyTo,
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
      if (data.success) {
        alert(`Test email sent successfully to ${testEmailAddress}! Check your inbox.`);
      } else {
        alert(`Failed to send test email: ${data.error || 'Unknown error'}`);
      }
    } catch (err: any) {
      alert(`Error sending test email: ${err.message}`);
    } finally {
      setIsSendingTestMail(false);
    }
  };

  // Filtered Logs
  const filteredLogs = useMemo(() => {
    return emailLogs.filter(log => {
      const matchesSearch = 
        log.to.toLowerCase().includes(logSearchQuery.toLowerCase()) ||
        (log.customerName && log.customerName.toLowerCase().includes(logSearchQuery.toLowerCase())) ||
        log.subject.toLowerCase().includes(logSearchQuery.toLowerCase());

      const matchesStatus = logStatusFilter === 'ALL' || log.status === logStatusFilter;

      return matchesSearch && matchesStatus;
    });
  }, [emailLogs, logSearchQuery, logStatusFilter]);

  // Apply SMTP Presets
  const applySmtpPreset = (preset: 'gmail' | 'sendgrid' | 'mailgun' | 'outlook') => {
    if (preset === 'gmail') {
      setSettings(prev => ({
        ...prev,
        smtpHost: 'smtp.gmail.com',
        smtpPort: 587,
        smtpSecure: false,
        useCustomSmtp: true,
      }));
    } else if (preset === 'sendgrid') {
      setSettings(prev => ({
        ...prev,
        smtpHost: 'smtp.sendgrid.net',
        smtpPort: 587,
        smtpSecure: false,
        useCustomSmtp: true,
      }));
    } else if (preset === 'mailgun') {
      setSettings(prev => ({
        ...prev,
        smtpHost: 'smtp.mailgun.org',
        smtpPort: 587,
        smtpSecure: false,
        useCustomSmtp: true,
      }));
    } else if (preset === 'outlook') {
      setSettings(prev => ({
        ...prev,
        smtpHost: 'smtp.office365.com',
        smtpPort: 587,
        smtpSecure: false,
        useCustomSmtp: true,
      }));
    }
  };

  return (
    <div className="p-6 md:p-8 space-y-8 max-w-7xl mx-auto">
      {/* Top Banner & Overview */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <span className="px-2.5 py-0.5 rounded-full text-[10px] font-extrabold uppercase tracking-wider bg-[#C86A4B]/10 text-[#C86A4B]">
              Business Communications
            </span>
            <span className="text-xs text-[#8C7E74] flex items-center gap-1">
              <ShieldCheck className="w-3.5 h-3.5 text-emerald-600" />
              Verified Sender Profile
            </span>
          </div>
          <h2 className="font-serif text-3xl font-bold tracking-tight text-[#2D241E]">
            Customer Email Center
          </h2>
          <p className="text-sm text-[#8C7E74] mt-1">
            Dispatch branded booking confirmations, collection ready notices, official digital receipts, and personalized messages.
          </p>
        </div>

        {/* Sender Status Pill */}
        <div className="flex items-center gap-3 bg-white border border-[#EADDCF] px-4 py-3 rounded-2xl shadow-xs">
          <div className="w-10 h-10 rounded-full bg-[#FAF4F0] text-[#C86A4B] flex items-center justify-center font-bold">
            <Building2 className="w-5 h-5" />
          </div>
          <div className="text-left">
            <p className="text-xs font-bold text-[#2D241E]">{settings.senderName}</p>
            <p className="text-[11px] text-[#8C7E74] font-medium">{settings.fromEmail}</p>
          </div>
        </div>
      </div>

      {/* Main Tab Navigation */}
      <div className="flex border-b border-[#EADDCF] gap-6 text-sm font-bold">
        <button
          onClick={() => setActiveTab('compose')}
          className={`pb-3 flex items-center gap-2 transition-all relative ${
            activeTab === 'compose'
              ? 'text-[#C86A4B]'
              : 'text-[#8C7E74] hover:text-[#2D241E]'
          }`}
        >
          <Send className="w-4 h-4" />
          Compose & Dispatch
          {activeTab === 'compose' && (
            <motion.div layoutId="activeTabIndicator" className="absolute bottom-0 left-0 right-0 h-0.5 bg-[#C86A4B]" />
          )}
        </button>

        <button
          onClick={() => setActiveTab('history')}
          className={`pb-3 flex items-center gap-2 transition-all relative ${
            activeTab === 'history'
              ? 'text-[#C86A4B]'
              : 'text-[#8C7E74] hover:text-[#2D241E]'
          }`}
        >
          <History className="w-4 h-4" />
          Sent History & Logs
          <span className="ml-1 px-2 py-0.5 rounded-full text-[10px] bg-[#EFE4DC] text-[#5A4E47]">
            {emailLogs.length}
          </span>
          {activeTab === 'history' && (
            <motion.div layoutId="activeTabIndicator" className="absolute bottom-0 left-0 right-0 h-0.5 bg-[#C86A4B]" />
          )}
        </button>

        <button
          onClick={() => setActiveTab('settings')}
          className={`pb-3 flex items-center gap-2 transition-all relative ${
            activeTab === 'settings'
              ? 'text-[#C86A4B]'
              : 'text-[#8C7E74] hover:text-[#2D241E]'
          }`}
        >
          <Settings className="w-4 h-4" />
          Business Sender & SMTP Settings
          {activeTab === 'settings' && (
            <motion.div layoutId="activeTabIndicator" className="absolute bottom-0 left-0 right-0 h-0.5 bg-[#C86A4B]" />
          )}
        </button>
      </div>

      {/* TAB 1: COMPOSE & DISPATCH */}
      {activeTab === 'compose' && (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">
          {/* Left Column: Form Controls (7 cols) */}
          <div className="lg:col-span-7 space-y-6">
            {sendSuccessMsg && (
              <motion.div 
                initial={{ opacity: 0, y: -10 }} 
                animate={{ opacity: 1, y: 0 }}
                className="p-4 rounded-2xl bg-emerald-50 border border-emerald-200 text-emerald-900 flex items-start gap-3 shadow-xs"
              >
                <CheckCircle2 className="w-5 h-5 text-emerald-600 mt-0.5 shrink-0" />
                <div>
                  <p className="font-bold text-sm">Email Dispatched Successfully</p>
                  <p className="text-xs text-emerald-700 mt-0.5">{sendSuccessMsg}</p>
                </div>
              </motion.div>
            )}

            {sendErrorMsg && (
              <motion.div 
                initial={{ opacity: 0, y: -10 }} 
                animate={{ opacity: 1, y: 0 }}
                className="p-4 rounded-2xl bg-rose-50 border border-rose-200 text-rose-900 flex items-start gap-3 shadow-xs"
              >
                <AlertCircle className="w-5 h-5 text-rose-600 mt-0.5 shrink-0" />
                <div>
                  <p className="font-bold text-sm">Failed to Send Email</p>
                  <p className="text-xs text-rose-700 mt-0.5">{sendErrorMsg}</p>
                </div>
              </motion.div>
            )}

            {/* Template Selector Cards */}
            <div className="bg-white p-6 rounded-2xl border border-[#EADDCF] shadow-xs space-y-4">
              <div className="flex items-center justify-between">
                <label className="block text-xs font-bold text-[#8C7E74] uppercase tracking-wider">
                  1. Select Email Template
                </label>
                <button
                  type="button"
                  onClick={() => setEditingTemplateId(templateType)}
                  className="inline-flex items-center gap-1.5 px-3 py-1 bg-[#FAF4F0] hover:bg-[#FAF0E6] text-[#C86A4B] border border-[#EADDCF] rounded-lg text-xs font-bold transition-colors"
                  title="Customize text and styles of the selected template"
                >
                  <Edit2 className="w-3.5 h-3.5" />
                  Customize Selected Template
                </button>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                {[
                  {
                    id: 'booking_confirmation',
                    title: 'Booking Confirmation',
                    desc: 'Workshop date, pax, deposit received & studio arrival tips.',
                    icon: Calendar,
                    color: 'text-[#C86A4B]',
                  },
                  {
                    id: 'collection_ready',
                    title: 'Ready for Collection',
                    desc: 'Ceramics fired & glazed notification with pickup hours.',
                    icon: Sparkles,
                    color: 'text-[#5B8266]',
                  },
                  {
                    id: 'receipt',
                    title: 'Digital Payment Receipt',
                    desc: 'Itemized settlement breakdown & paid confirmation.',
                    icon: FileText,
                    color: 'text-[#2D241E]',
                  },
                  {
                    id: 'custom',
                    title: 'Custom Studio Message',
                    desc: 'Personalized customer message framed with studio branding.',
                    icon: Edit2,
                    color: 'text-[#C28B38]',
                  },
                ].map((tpl) => {
                  const Icon = tpl.icon;
                  const isSelected = templateType === tpl.id;
                  return (
                    <div
                      key={tpl.id}
                      onClick={() => setTemplateType(tpl.id)}
                      className={`p-4 rounded-xl border text-left transition-all relative cursor-pointer flex flex-col justify-between ${
                        isSelected
                          ? 'border-[#C86A4B] bg-[#FAF4F0] shadow-sm'
                          : 'border-[#EADDCF] bg-white hover:border-[#C86A4B]/40 hover:bg-[#FAF4F0]/30'
                      }`}
                    >
                      <div>
                        <div className="flex items-center justify-between mb-1.5">
                          <div className="flex items-center gap-2.5">
                            <div className={`p-2 rounded-lg bg-white shadow-xs ${tpl.color}`}>
                              <Icon className="w-4 h-4" />
                            </div>
                            <h4 className="font-bold text-sm text-[#2D241E]">{tpl.title}</h4>
                          </div>
                          {isSelected && (
                            <div className="w-4 h-4 rounded-full bg-[#C86A4B] text-white flex items-center justify-center">
                              <Check className="w-3 h-3" />
                            </div>
                          )}
                        </div>
                        <p className="text-xs text-[#8C7E74] leading-relaxed pl-1">
                          {tpl.desc}
                        </p>
                      </div>

                      <div className="mt-3 pt-2.5 border-t border-[#EADDCF]/60 flex items-center justify-between">
                        <span className="text-[10px] font-semibold text-[#8C7E74]">
                          {templateConfigs[tpl.id] ? 'Customized' : 'Standard'}
                        </span>
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            setEditingTemplateId(tpl.id);
                          }}
                          className="inline-flex items-center gap-1 text-[11px] font-bold text-[#C86A4B] hover:text-[#B3593B] px-2 py-0.5 rounded hover:bg-white transition-colors"
                        >
                          <Edit2 className="w-3 h-3" />
                          Edit Template
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>

            {/* Recipient & Customer Linker */}
            <div className="bg-white p-6 rounded-2xl border border-[#EADDCF] shadow-xs space-y-4">
              <label className="block text-xs font-bold text-[#8C7E74] uppercase tracking-wider">
                2. Recipient & Customer Information
              </label>

              {/* Quick Customer Auto-fill selector */}
              <div>
                <label className="block text-xs font-medium text-[#5A4E47] mb-1.5">
                  Auto-fill from Recent Customer / Booking
                </label>
                <div className="relative">
                  <select
                    value={selectedCustomerId}
                    onChange={(e) => handleSelectCustomer(e.target.value)}
                    className="w-full px-4 py-2.5 bg-[#FAF4F0] border border-[#EADDCF] rounded-xl text-sm font-medium text-[#2D241E] focus:outline-none focus:border-[#C86A4B] transition-colors"
                  >
                    <option value="">-- Choose Existing Customer or Enter Manually --</option>
                    {customerDirectory.map((c, i) => (
                      <option key={i} value={c.email || c.name}>
                        {c.name} {c.email ? `(${c.email})` : ''} {c.phone ? `• ${c.phone}` : ''}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-medium text-[#5A4E47] mb-1">
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
                  <label className="block text-xs font-medium text-[#5A4E47] mb-1">
                    Customer Full Name
                  </label>
                  <div className="relative">
                    <User className="w-4 h-4 absolute left-3.5 top-1/2 -translate-y-1/2 text-[#8C7E74]" />
                    <input
                      type="text"
                      placeholder="e.g. Sophia Chen"
                      value={customerName}
                      onChange={(e) => setCustomerName(e.target.value)}
                      className="w-full pl-10 pr-4 py-2.5 bg-white border border-[#EADDCF] rounded-xl text-sm text-[#2D241E] focus:outline-none focus:border-[#C86A4B] transition-colors"
                    />
                  </div>
                </div>
              </div>

              {/* Related Booking Linker (if available) */}
              <div>
                <label className="block text-xs font-medium text-[#5A4E47] mb-1">
                  Attach Booking Details (Optional)
                </label>
                <select
                  value={selectedBookingId}
                  onChange={(e) => setSelectedBookingId(e.target.value)}
                  className="w-full px-4 py-2.5 bg-white border border-[#EADDCF] rounded-xl text-sm text-[#2D241E] focus:outline-none focus:border-[#C86A4B] transition-colors"
                >
                  <option value="">-- No specific booking attached --</option>
                  {bookings.map((b) => (
                    <option key={b.id} value={b.id}>
                      {b.customerName} - {b.workshopName} ({b.date} {b.time}) [{b.location}] - Status: {b.status}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            {/* Email Subject & Message Customization */}
            <div className="bg-white p-6 rounded-2xl border border-[#EADDCF] shadow-xs space-y-4">
              <label className="block text-xs font-bold text-[#8C7E74] uppercase tracking-wider">
                3. Email Content & Subject
              </label>

              <div>
                <label className="block text-xs font-medium text-[#5A4E47] mb-1">
                  Subject Line
                </label>
                <input
                  type="text"
                  required
                  value={subject}
                  onChange={(e) => setSubject(e.target.value)}
                  className="w-full px-4 py-2.5 bg-white border border-[#EADDCF] rounded-xl text-sm font-semibold text-[#2D241E] focus:outline-none focus:border-[#C86A4B] transition-colors"
                />
              </div>

              <div>
                <label className="block text-xs font-medium text-[#5A4E47] mb-1">
                  {templateType === 'custom' ? 'Email Message Body *' : 'Custom Personal Note for Customer (Appears highlighted)'}
                </label>
                <textarea
                  rows={4}
                  placeholder={
                    templateType === 'custom'
                      ? 'Write your custom message here...'
                      : 'Add an optional personalized note (e.g. "We prepared extra terracotta clay for your group!")...'
                  }
                  value={customNote}
                  onChange={(e) => setCustomNote(e.target.value)}
                  className="w-full p-3.5 bg-white border border-[#EADDCF] rounded-xl text-sm text-[#2D241E] focus:outline-none focus:border-[#C86A4B] transition-colors"
                />
              </div>

              {/* Action Buttons */}
              <div className="pt-2 flex flex-wrap items-center justify-between gap-4">
                <button
                  type="button"
                  onClick={() => setShowPreviewModal(true)}
                  className="px-4 py-2.5 rounded-xl border border-[#C86A4B] text-xs font-bold text-[#C86A4B] hover:bg-[#C86A4B]/5 transition-colors flex items-center gap-1.5"
                >
                  <Eye className="w-4 h-4" />
                  Full Screen Preview
                </button>

                <button
                  type="button"
                  disabled={isSending || !recipientEmail}
                  onClick={handleSendEmail}
                  className={`px-8 py-3 rounded-xl text-xs font-bold uppercase tracking-wider text-white flex items-center gap-2 shadow-md transition-all ${
                    isSending || !recipientEmail
                      ? 'bg-[#C86A4B]/60 cursor-not-allowed'
                      : 'bg-[#C86A4B] hover:bg-[#B3593B] active:scale-95'
                  }`}
                >
                  {isSending ? (
                    <>
                      <RefreshCw className="w-4 h-4 animate-spin" />
                      Sending Email...
                    </>
                  ) : (
                    <>
                      <Send className="w-4 h-4" />
                      Send to Customer
                    </>
                  )}
                </button>
              </div>
            </div>
          </div>

          {/* Right Column: Live In-Place Email Preview (5 cols) */}
          <div className="lg:col-span-5 space-y-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
                <h3 className="font-serif text-lg font-bold text-[#2D241E]">
                  Live Customer Preview
                </h3>
              </div>

              {/* Device Toggle */}
              <div className="flex bg-[#EFE4DC] p-1 rounded-xl text-xs">
                <button
                  type="button"
                  onClick={() => setPreviewDevice('desktop')}
                  className={`p-1.5 rounded-lg transition-all ${
                    previewDevice === 'desktop' ? 'bg-white text-[#2D241E] shadow-xs' : 'text-[#8C7E74]'
                  }`}
                  title="Desktop Preview"
                >
                  <Monitor className="w-4 h-4" />
                </button>
                <button
                  type="button"
                  onClick={() => setPreviewDevice('mobile')}
                  className={`p-1.5 rounded-lg transition-all ${
                    previewDevice === 'mobile' ? 'bg-white text-[#2D241E] shadow-xs' : 'text-[#8C7E74]'
                  }`}
                  title="Mobile Preview"
                >
                  <Smartphone className="w-4 h-4" />
                </button>
              </div>
            </div>

            {/* Simulated Email Client Container */}
            <div className={`mx-auto bg-[#FAF4F0] border border-[#EADDCF] rounded-2xl overflow-hidden shadow-md transition-all duration-300 ${
              previewDevice === 'mobile' ? 'max-w-[360px]' : 'w-full'
            }`}>
              {/* Fake Email Client Header Bar */}
              <div className="bg-[#2D241E] px-4 py-2.5 text-white flex items-center justify-between text-xs">
                <div className="flex items-center gap-2">
                  <div className="w-2.5 h-2.5 rounded-full bg-rose-400" />
                  <div className="w-2.5 h-2.5 rounded-full bg-amber-400" />
                  <div className="w-2.5 h-2.5 rounded-full bg-emerald-400" />
                </div>
                <span className="text-[10px] uppercase font-bold tracking-widest text-[#EADDCF]">
                  Customer Inbox View
                </span>
                <div className="w-8" />
              </div>

              {/* Email Envelope Summary */}
              <div className="bg-white p-3 border-b border-[#EADDCF] text-xs space-y-1">
                <p className="text-[#8C7E74] truncate">
                  <strong className="text-[#2D241E]">From:</strong> {settings.senderName} &lt;{settings.fromEmail}&gt;
                </p>
                <p className="text-[#8C7E74] truncate">
                  <strong className="text-[#2D241E]">To:</strong> {recipientEmail || '(customer email)'}
                </p>
                <p className="text-[#2D241E] font-semibold truncate pt-0.5">
                  <strong>Subject:</strong> {subject}
                </p>
              </div>

              {/* Rendered HTML in iframe */}
              <div className="bg-white">
                <iframe
                  title="Live Email Preview"
                  srcDoc={rawHtmlBody}
                  className={`w-full border-0 ${previewDevice === 'mobile' ? 'h-[520px]' : 'h-[580px]'}`}
                />
              </div>
            </div>
          </div>
        </div>
      )}

      {/* TAB 2: SENT HISTORY & OUTBOX LOG */}
      {activeTab === 'history' && (
        <div className="space-y-6">
          {/* SMTP Status Notice Banner if not configured */}
          {(!settings.useCustomSmtp || !settings.smtpPass || !settings.smtpUser) && (
            <div className="p-4 bg-amber-50/80 border border-amber-200/80 rounded-2xl flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-amber-950">
              <div className="flex items-start gap-3">
                <AlertCircle className="w-5 h-5 text-amber-600 shrink-0 mt-0.5" />
                <div className="text-xs space-y-0.5">
                  <p className="font-bold text-amber-900">Live Delivery Requires Custom SMTP Configuration</p>
                  <p className="text-amber-800 text-[11px] leading-relaxed">
                    Emails sent without an active SMTP server are formatted, previewed, and logged to your studio database in <strong>Simulated Mode</strong>. To deliver directly into real customer inboxes (e.g. Gmail/Google Workspace/SendGrid), configure your credentials in the Settings tab.
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setActiveTab('settings')}
                className="px-3.5 py-2 bg-amber-600 text-white rounded-xl text-[11px] font-bold uppercase tracking-wider hover:bg-amber-700 transition-colors shrink-0 flex items-center justify-center gap-1.5 shadow-xs"
              >
                <Settings className="w-3.5 h-3.5" />
                Configure SMTP
              </button>
            </div>
          )}

          {/* Controls & Filter Bar */}
          <div className="bg-white p-6 rounded-2xl border border-[#EADDCF] shadow-xs flex flex-col md:flex-row md:items-center justify-between gap-4">
            {/* Search */}
            <div className="relative flex-1 max-w-md">
              <Search className="w-4 h-4 absolute left-3.5 top-1/2 -translate-y-1/2 text-[#8C7E74]" />
              <input
                type="text"
                placeholder="Search by recipient, customer name, or subject..."
                value={logSearchQuery}
                onChange={(e) => setLogSearchQuery(e.target.value)}
                className="w-full pl-10 pr-4 py-2.5 bg-[#FAF4F0] border border-[#EADDCF] rounded-xl text-xs text-[#2D241E] focus:outline-none focus:border-[#C86A4B] transition-colors"
              />
            </div>

            {/* Status Filter */}
            <div className="flex items-center gap-2">
              <span className="text-xs font-bold text-[#8C7E74]">Status:</span>
              <select
                value={logStatusFilter}
                onChange={(e) => setLogStatusFilter(e.target.value)}
                className="px-3 py-2 bg-[#FAF4F0] border border-[#EADDCF] rounded-xl text-xs font-semibold text-[#2D241E]"
              >
                <option value="ALL">All Statuses</option>
                <option value="delivered">Delivered (Live SMTP)</option>
                <option value="simulated">Sent (Studio Mailer)</option>
                <option value="failed">Failed</option>
              </select>
            </div>
          </div>

          {/* Log Table */}
          <div className="bg-white rounded-2xl border border-[#EADDCF] shadow-xs overflow-hidden">
            {logsLoading ? (
              <div className="p-12 text-center text-[#8C7E74]">
                <RefreshCw className="w-6 h-6 animate-spin mx-auto mb-2 text-[#C86A4B]" />
                <p className="text-xs font-serif italic">Loading email logs...</p>
              </div>
            ) : filteredLogs.length === 0 ? (
              <div className="p-12 text-center text-[#8C7E74]">
                <Mail className="w-8 h-8 mx-auto mb-2 opacity-40" />
                <p className="text-sm font-bold text-[#2D241E]">No email records found</p>
                <p className="text-xs mt-1">Dispatched customer emails will appear here with delivery timestamps and viewable receipts.</p>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs">
                  <thead className="bg-[#FAF4F0] border-b border-[#EADDCF] text-[#8C7E74] uppercase tracking-wider text-[10px]">
                    <tr>
                      <th className="py-3.5 px-6 font-bold">Recipient & Customer</th>
                      <th className="py-3.5 px-6 font-bold">Subject Line</th>
                      <th className="py-3.5 px-6 font-bold">Template Type</th>
                      <th className="py-3.5 px-6 font-bold">Date & Time</th>
                      <th className="py-3.5 px-6 font-bold">Delivery Status</th>
                      <th className="py-3.5 px-6 font-bold text-right">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-[#EADDCF]/60">
                    {filteredLogs.map((log) => (
                      <tr key={log.id} className="hover:bg-[#FAF4F0]/40 transition-colors">
                        <td className="py-4 px-6 font-medium">
                          <p className="font-bold text-[#2D241E]">{log.customerName || 'Customer'}</p>
                          <p className="text-[11px] text-[#8C7E74]">{log.to}</p>
                        </td>
                        <td className="py-4 px-6 font-medium text-[#2D241E] max-w-xs truncate">
                          {log.subject}
                        </td>
                        <td className="py-4 px-6">
                          <span className="px-2.5 py-1 rounded-full text-[10px] font-bold uppercase tracking-wider bg-[#EFE4DC] text-[#5A4E47]">
                            {log.templateType?.replace('_', ' ') || 'Email'}
                          </span>
                        </td>
                        <td className="py-4 px-6 text-[#8C7E74]">
                          {new Date(log.createdAt).toLocaleString(undefined, {
                            dateStyle: 'medium',
                            timeStyle: 'short',
                          })}
                        </td>
                        <td className="py-4 px-6">
                          {log.status === 'delivered' ? (
                            <span 
                              className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[10px] font-bold uppercase tracking-wider bg-emerald-100 text-emerald-800 border border-emerald-300"
                              title="Delivered to real customer inbox via Live SMTP"
                            >
                              <CheckCircle2 className="w-3 h-3 text-emerald-600" />
                              Delivered (Live)
                            </span>
                          ) : log.status === 'simulated' ? (
                            <span 
                              className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[10px] font-bold uppercase tracking-wider bg-amber-50 text-amber-900 border border-amber-300"
                              title="Saved in Studio Ledger (Simulated Mode - No SMTP server configured)"
                            >
                              <AlertCircle className="w-3 h-3 text-amber-600" />
                              Simulated (No SMTP)
                            </span>
                          ) : (
                            <span 
                              className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[10px] font-bold uppercase tracking-wider bg-rose-100 text-rose-800 border border-rose-300"
                              title="Delivery failed - check error logs or SMTP settings"
                            >
                              <AlertCircle className="w-3 h-3 text-rose-600" />
                              Failed
                            </span>
                          )}
                        </td>
                        <td className="py-4 px-6 text-right">
                          <button
                            onClick={() => setSelectedLogForDetail(log)}
                            className="px-3 py-1.5 bg-white border border-[#EADDCF] rounded-lg font-bold text-[11px] text-[#C86A4B] hover:bg-[#FAF4F0] transition-colors"
                          >
                            View Email
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>
      )}

      {/* TAB 3: BUSINESS EMAIL & SMTP SETTINGS */}
      {activeTab === 'settings' && (
        <form onSubmit={handleSaveSettings} className="space-y-8 max-w-4xl">
          {settingsSuccess && (
            <motion.div 
              initial={{ opacity: 0, y: -10 }} 
              animate={{ opacity: 1, y: 0 }}
              className="p-4 rounded-2xl bg-emerald-50 border border-emerald-200 text-emerald-900 flex items-center gap-3 text-sm font-medium shadow-xs"
            >
              <CheckCircle2 className="w-5 h-5 text-emerald-600 shrink-0" />
              <span>{settingsSuccess}</span>
            </motion.div>
          )}

          {/* Section 1: Business Sender Profile */}
          <div className="bg-white p-6 rounded-2xl border border-[#EADDCF] shadow-xs space-y-5">
            <div className="border-b border-[#EADDCF] pb-3">
              <h3 className="font-serif text-lg font-bold text-[#2D241E] flex items-center gap-2">
                <Building2 className="w-5 h-5 text-[#C86A4B]" />
                Studio Sender Profile
              </h3>
              <p className="text-xs text-[#8C7E74] mt-0.5">
                This business identity is stamped on all email headers, confirmation cards, and digital receipts sent to customers.
              </p>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-bold text-[#8C7E74] uppercase tracking-wider mb-1">
                  Studio Sender Display Name
                </label>
                <input
                  type="text"
                  required
                  value={settings.senderName}
                  onChange={(e) => setSettings({ ...settings, senderName: e.target.value })}
                  placeholder="e.g. NENDOA Pottery Studio"
                  className="w-full px-4 py-2.5 bg-white border border-[#EADDCF] rounded-xl text-sm font-medium text-[#2D241E] focus:outline-none focus:border-[#C86A4B] transition-colors"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-[#8C7E74] uppercase tracking-wider mb-1">
                  Business From Email Address
                </label>
                <input
                  type="email"
                  required
                  value={settings.fromEmail}
                  onChange={(e) => setSettings({ ...settings, fromEmail: e.target.value })}
                  placeholder="hello@nendoapottery.com"
                  className="w-full px-4 py-2.5 bg-white border border-[#EADDCF] rounded-xl text-sm font-medium text-[#2D241E] focus:outline-none focus:border-[#C86A4B] transition-colors"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-[#8C7E74] uppercase tracking-wider mb-1">
                  Reply-To Email Address
                </label>
                <input
                  type="email"
                  required
                  value={settings.replyTo}
                  onChange={(e) => setSettings({ ...settings, replyTo: e.target.value })}
                  placeholder="contact@nendoapottery.com"
                  className="w-full px-4 py-2.5 bg-white border border-[#EADDCF] rounded-xl text-sm font-medium text-[#2D241E] focus:outline-none focus:border-[#C86A4B] transition-colors"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-[#8C7E74] uppercase tracking-wider mb-1">
                  Studio Phone / WhatsApp
                </label>
                <input
                  type="text"
                  value={settings.studioPhone}
                  onChange={(e) => setSettings({ ...settings, studioPhone: e.target.value })}
                  placeholder="+60 12-889 2030"
                  className="w-full px-4 py-2.5 bg-white border border-[#EADDCF] rounded-xl text-sm font-medium text-[#2D241E] focus:outline-none focus:border-[#C86A4B] transition-colors"
                />
              </div>
            </div>

            <div className="pt-2">
              <label className="block text-xs font-bold text-[#8C7E74] uppercase tracking-wider mb-1">
                Studio Address
              </label>
              <textarea
                rows={2}
                value={settings.studioAddress || settings.studioAddressPG || settings.studioAddressBM || '214, Lebuh Victoria, 10300 Georgetown, Pulau Pinang'}
                onChange={(e) => setSettings({ 
                  ...settings, 
                  studioAddress: e.target.value,
                  studioAddressBM: e.target.value,
                  studioAddressPG: e.target.value
                })}
                placeholder="214, Lebuh Victoria, 10300 Georgetown, Pulau Pinang"
                className="w-full p-3 bg-white border border-[#EADDCF] rounded-xl text-xs text-[#2D241E] focus:outline-none focus:border-[#C86A4B] transition-colors"
              />
              <p className="text-[10px] text-[#8C7E74] mt-1">Single studio location used on customer receipts, booking confirmations, and emails.</p>
            </div>

            <div>
              <label className="block text-xs font-bold text-[#8C7E74] uppercase tracking-wider mb-1">
                Footer Tagline / Signature Note
              </label>
              <input
                type="text"
                value={settings.signatureTagline}
                onChange={(e) => setSettings({ ...settings, signatureTagline: e.target.value })}
                placeholder="Handcrafted ceramic moments in Penang."
                className="w-full px-4 py-2.5 bg-white border border-[#EADDCF] rounded-xl text-sm text-[#2D241E] focus:outline-none focus:border-[#C86A4B] transition-colors"
              />
            </div>
          </div>

          {/* Section 2: SMTP Credentials & Sending Gateway */}
          <div className="bg-white p-6 rounded-2xl border border-[#EADDCF] shadow-xs space-y-5">
            <div className="border-b border-[#EADDCF] pb-3 flex items-center justify-between">
              <div>
                <h3 className="font-serif text-lg font-bold text-[#2D241E] flex items-center gap-2">
                  <Server className="w-5 h-5 text-[#C86A4B]" />
                  Custom SMTP Server Configuration
                </h3>
                <p className="text-xs text-[#8C7E74] mt-0.5">
                  Connect your business domain (Google Workspace, SendGrid, Mailgun, or private mail server) to deliver directly into customer inboxes.
                </p>
              </div>

              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="checkbox"
                  checked={settings.useCustomSmtp || false}
                  onChange={(e) => setSettings({ ...settings, useCustomSmtp: e.target.checked })}
                  className="w-4 h-4 text-[#C86A4B] rounded border-[#EADDCF] focus:ring-[#C86A4B]"
                />
                <span className="text-xs font-bold text-[#2D241E]">Enable Custom SMTP</span>
              </label>
            </div>

            {/* 1-Click Presets */}
            <div>
              <label className="block text-[11px] font-bold text-[#8C7E74] uppercase tracking-wider mb-2">
                Quick Setup Presets
              </label>
              <div className="flex flex-wrap gap-2">
                {[
                  { id: 'gmail', name: 'Google Workspace / Gmail' },
                  { id: 'sendgrid', name: 'SendGrid SMTP' },
                  { id: 'mailgun', name: 'Mailgun' },
                  { id: 'outlook', name: 'Microsoft 365' },
                ].map((p) => (
                  <button
                    key={p.id}
                    type="button"
                    onClick={() => applySmtpPreset(p.id as any)}
                    className="px-3 py-1.5 bg-[#FAF4F0] border border-[#EADDCF] hover:border-[#C86A4B] rounded-lg text-xs font-semibold text-[#5A4E47] transition-all"
                  >
                    + {p.name}
                  </button>
                ))}
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div className="md:col-span-2">
                <label className="block text-xs font-bold text-[#8C7E74] uppercase tracking-wider mb-1">
                  SMTP Host Server
                </label>
                <input
                  type="text"
                  placeholder="smtp.gmail.com or mail.yourdomain.com"
                  value={settings.smtpHost || ''}
                  onChange={(e) => setSettings({ ...settings, smtpHost: e.target.value })}
                  className="w-full px-4 py-2.5 bg-white border border-[#EADDCF] rounded-xl text-sm font-mono text-[#2D241E] focus:outline-none focus:border-[#C86A4B] transition-colors"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-[#8C7E74] uppercase tracking-wider mb-1">
                  SMTP Port
                </label>
                <input
                  type="number"
                  placeholder="587"
                  value={settings.smtpPort || 587}
                  onChange={(e) => setSettings({ ...settings, smtpPort: Number(e.target.value) })}
                  className="w-full px-4 py-2.5 bg-white border border-[#EADDCF] rounded-xl text-sm font-mono text-[#2D241E] focus:outline-none focus:border-[#C86A4B] transition-colors"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-[#8C7E74] uppercase tracking-wider mb-1">
                  SMTP Username / Email
                </label>
                <input
                  type="text"
                  placeholder="sender@yourdomain.com"
                  value={settings.smtpUser || ''}
                  onChange={(e) => setSettings({ ...settings, smtpUser: e.target.value })}
                  className="w-full px-4 py-2.5 bg-white border border-[#EADDCF] rounded-xl text-sm text-[#2D241E] focus:outline-none focus:border-[#C86A4B] transition-colors"
                />
              </div>

              <div>
                <div className="flex items-center justify-between mb-1">
                  <label className="block text-xs font-bold text-[#8C7E74] uppercase tracking-wider">
                    SMTP Password / App Password
                  </label>
                  <button
                    type="button"
                    onClick={() => setShowPassword(!showPassword)}
                    className="text-[10px] text-[#8C7E74] hover:text-[#2D241E] flex items-center gap-1 font-semibold transition-colors"
                  >
                    {showPassword ? <EyeOff size={11} /> : <Eye size={11} />}
                    <span>{showPassword ? 'Hide' : 'Show'}</span>
                  </button>
                </div>
                <div className="relative">
                  <input
                    type={showPassword ? 'text' : 'password'}
                    placeholder="••••••••••••••••"
                    value={settings.smtpPass || ''}
                    onChange={(e) => setSettings({ ...settings, smtpPass: e.target.value })}
                    className="w-full px-4 py-2.5 bg-white border border-[#EADDCF] rounded-xl text-sm font-mono text-[#2D241E] focus:outline-none focus:border-[#C86A4B] transition-colors"
                  />
                </div>
              </div>

              <div className="flex items-end">
                <label className="flex items-center gap-2 p-2.5 bg-[#FAF4F0] border border-[#EADDCF] rounded-xl w-full cursor-pointer">
                  <input
                    type="checkbox"
                    checked={settings.smtpSecure || false}
                    onChange={(e) => setSettings({ ...settings, smtpSecure: e.target.checked })}
                    className="w-4 h-4 text-[#C86A4B] rounded border-[#EADDCF] focus:ring-[#C86A4B]"
                  />
                  <span className="text-xs font-semibold text-[#2D241E]">SSL/TLS (Port 465)</span>
                </label>
              </div>
            </div>

            {/* Security Guarantee Banner */}
            <div className="p-3.5 bg-[#FAF9F6] border border-[#EADDCF] rounded-xl text-xs text-[#5A4E47] flex items-start gap-2.5">
              <ShieldCheck className="w-4 h-4 text-emerald-600 shrink-0 mt-0.5" />
              <div className="space-y-1 text-[11px] leading-relaxed">
                <p className="font-bold text-[#2D241E]">Security & Privacy Guarantee:</p>
                <p>
                  • <strong>Recipients never see your password:</strong> Outgoing emails only include your from-name, studio address, and receipt content.
                </p>
                <p>
                  • <strong>Isolated App Password:</strong> For Gmail, you only provide a 16-character App Password, keeping your primary Google account credentials completely safe.
                </p>
                <p>
                  • <strong>Backend Delivery:</strong> Email transport is executed through server-side SSL/TLS and is never exposed in public web pages or client HTML.
                </p>
              </div>
            </div>

            {/* Test Connection Buttons & Output */}
            <div className="pt-2 border-t border-[#EADDCF] flex flex-wrap items-center justify-between gap-4">
              <div className="flex items-center gap-3">
                <button
                  type="button"
                  disabled={isTestingSmtp || !settings.smtpHost}
                  onClick={handleTestSmtp}
                  className="px-4 py-2.5 bg-white border border-[#2D241E] text-[#2D241E] hover:bg-[#2D241E] hover:text-white rounded-xl text-xs font-bold uppercase tracking-wider transition-colors flex items-center gap-1.5"
                >
                  {isTestingSmtp ? <RefreshCw className="w-3.5 h-3.5 animate-spin" /> : <Key className="w-3.5 h-3.5" />}
                  Test SMTP Connection
                </button>
              </div>

              {/* Live Test Email */}
              <div className="flex items-center gap-2">
                <input
                  type="email"
                  placeholder="your.email@example.com"
                  value={testEmailAddress}
                  onChange={(e) => setTestEmailAddress(e.target.value)}
                  className="px-3 py-2 bg-white border border-[#EADDCF] rounded-xl text-xs text-[#2D241E]"
                />
                <button
                  type="button"
                  disabled={isSendingTestMail}
                  onClick={handleSendTestEmail}
                  className="px-3 py-2 bg-[#5B8266] text-white hover:bg-[#486b52] rounded-xl text-xs font-bold uppercase tracking-wider transition-colors"
                >
                  {isSendingTestMail ? 'Sending...' : 'Send Test'}
                </button>
              </div>
            </div>

            {smtpTestResult && (
              <div className={`p-4 rounded-xl text-xs font-semibold ${
                smtpTestResult.success 
                  ? 'bg-emerald-50 text-emerald-900 border border-emerald-200' 
                  : 'bg-rose-50 text-rose-900 border border-rose-200'
              }`}>
                {smtpTestResult.message}
              </div>
            )}
          </div>

          {/* Section 3: Email Templates Customization */}
          <div className="bg-white p-6 rounded-2xl border border-[#EADDCF] shadow-xs space-y-6">
            <div className="flex items-center justify-between pb-4 border-b border-[#EADDCF]">
              <div>
                <h3 className="font-serif font-bold text-base text-[#2D241E] flex items-center gap-2">
                  <Edit2 className="w-5 h-5 text-[#C86A4B]" />
                  Email Templates & Branding Customization
                </h3>
                <p className="text-xs text-[#8C7E74] mt-0.5">
                  Customize the subject lines, greetings, arrival tips, lead paragraphs, and color schemes for each email template sent to your customers.
                </p>
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {[
                {
                  id: 'booking_confirmation',
                  title: 'Booking Confirmation Email',
                  desc: 'Sent upon booking creation. Contains workshop schedule, pax, studio address, and parking/arrival tips.',
                  icon: Calendar,
                  color: 'text-[#C86A4B]',
                },
                {
                  id: 'collection_ready',
                  title: 'Collection Ready Email',
                  desc: 'Sent when ceramics are glazed and fired. Includes pickup guidelines, opening hours, and holding period.',
                  icon: Sparkles,
                  color: 'text-[#5B8266]',
                },
                {
                  id: 'receipt',
                  title: 'Payment Receipt Email',
                  desc: 'Sent after deposit or full settlement. Itemizes payment breakdown, balance status, and receipt number.',
                  icon: FileText,
                  color: 'text-[#2D241E]',
                },
                {
                  id: 'custom',
                  title: 'Custom Studio Message Email',
                  desc: 'Sent for special announcements, follow-ups, or custom notes with branded header and footer.',
                  icon: Edit2,
                  color: 'text-[#C28B38]',
                },
              ].map((tpl) => {
                const Icon = tpl.icon;
                const config = templateConfigs[tpl.id] || DEFAULT_TEMPLATE_CONFIGS[tpl.id];
                return (
                  <div
                    key={tpl.id}
                    className="p-4 rounded-xl border border-[#EADDCF] bg-[#FAF4F0]/30 hover:bg-[#FAF4F0]/60 transition-all flex flex-col justify-between"
                  >
                    <div>
                      <div className="flex items-center justify-between mb-2">
                        <div className="flex items-center gap-2.5">
                          <div className={`p-2 rounded-lg bg-white shadow-xs ${tpl.color}`}>
                            <Icon className="w-4 h-4" />
                          </div>
                          <div>
                            <h4 className="font-bold text-sm text-[#2D241E]">{tpl.title}</h4>
                            <p className="text-[10px] text-[#8C7E74]">Subject: {config?.subject}</p>
                          </div>
                        </div>
                      </div>
                      <p className="text-xs text-[#8C7E74] leading-relaxed mb-3">
                        {tpl.desc}
                      </p>
                    </div>

                    <div className="pt-3 border-t border-[#EADDCF] flex items-center justify-between">
                      <span className="text-[10px] font-semibold text-[#8C7E74]">
                        {templateConfigs[tpl.id] ? 'Customized' : 'Default Preset'}
                      </span>
                      <button
                        type="button"
                        onClick={() => setEditingTemplateId(tpl.id)}
                        className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-[#C86A4B] text-white hover:bg-[#B3593B] text-xs font-bold transition-colors shadow-xs"
                      >
                        <Edit2 className="w-3.5 h-3.5" />
                        Edit Template
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Submit Button */}
          <div className="flex justify-end">
            <button
              type="submit"
              disabled={isSavingSettings}
              className="px-8 py-3 rounded-xl bg-[#C86A4B] text-white hover:bg-[#B3593B] text-xs font-bold uppercase tracking-wider shadow-md transition-all flex items-center gap-2"
            >
              {isSavingSettings ? <RefreshCw className="w-4 h-4 animate-spin" /> : <Check className="w-4 h-4" />}
              Save All Settings
            </button>
          </div>
        </form>
      )}

      {/* MODAL 1: Full-screen Preview Modal */}
      {showPreviewModal && (
        <div className="fixed inset-0 z-50 bg-black/70 backdrop-blur-xs flex items-center justify-center p-4">
          <motion.div 
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            className="bg-white rounded-2xl w-full max-w-4xl max-h-[90vh] flex flex-col shadow-2xl overflow-hidden border border-[#EADDCF]"
          >
            <div className="px-6 py-4 bg-[#FAF4F0] border-b border-[#EADDCF] flex items-center justify-between">
              <div>
                <h4 className="font-serif font-bold text-lg text-[#2D241E]">
                  Desktop & Mobile Email Preview
                </h4>
                <p className="text-xs text-[#8C7E74]">Subject: {subject}</p>
              </div>
              <button
                onClick={() => setShowPreviewModal(false)}
                className="p-2 text-[#8C7E74] hover:text-[#2D241E] rounded-full"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
            <div className="flex-1 p-6 overflow-y-auto bg-[#FAF4F0]">
              <iframe
                title="Full Email Preview"
                srcDoc={rawHtmlBody}
                className="w-full h-[600px] border border-[#EADDCF] rounded-xl bg-white shadow-sm"
              />
            </div>
          </motion.div>
        </div>
      )}

      {/* MODAL 2: View Sent Email Details Modal */}
      {selectedLogForDetail && (
        <div className="fixed inset-0 z-50 bg-black/70 backdrop-blur-xs flex items-center justify-center p-4">
          <motion.div 
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            className="bg-white rounded-2xl w-full max-w-3xl max-h-[90vh] flex flex-col shadow-2xl overflow-hidden border border-[#EADDCF]"
          >
            <div className="px-6 py-4 bg-[#FAF4F0] border-b border-[#EADDCF] flex items-center justify-between">
              <div>
                <h4 className="font-serif font-bold text-lg text-[#2D241E]">
                  Sent Email Record
                </h4>
                <p className="text-xs text-[#8C7E74]">
                  Sent on {new Date(selectedLogForDetail.createdAt).toLocaleString()} &bull; Status: {selectedLogForDetail.status}
                </p>
              </div>
              <button
                onClick={() => setSelectedLogForDetail(null)}
                className="p-2 text-[#8C7E74] hover:text-[#2D241E] rounded-full"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="p-4 bg-white border-b border-[#EADDCF] text-xs space-y-1">
              <div className="flex items-center justify-between pb-1">
                <p><strong>To:</strong> {selectedLogForDetail.customerName} &lt;{selectedLogForDetail.to}&gt;</p>
                {selectedLogForDetail.status === 'delivered' ? (
                  <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider bg-emerald-100 text-emerald-800 border border-emerald-300">
                    <CheckCircle2 className="w-3 h-3 text-emerald-600" /> Live Delivered
                  </span>
                ) : (
                  <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider bg-amber-100 text-amber-900 border border-amber-300">
                    <AlertCircle className="w-3 h-3 text-amber-600" /> Simulated (Internal Log)
                  </span>
                )}
              </div>
              <p><strong>From:</strong> {selectedLogForDetail.fromName} &lt;{selectedLogForDetail.fromEmail}&gt;</p>
              <p><strong>Subject:</strong> {selectedLogForDetail.subject}</p>
              {selectedLogForDetail.messageId && (
                <p className="text-[#8C7E74] font-mono text-[10px]"><strong>Message ID:</strong> {selectedLogForDetail.messageId}</p>
              )}
              {selectedLogForDetail.status === 'simulated' && (
                <div className="p-2.5 mt-2 bg-amber-50 border border-amber-200 rounded-lg text-amber-900 text-[11px] flex items-start gap-2">
                  <AlertCircle className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
                  <div>
                    <span className="font-bold">Why was this simulated?</span> This email was generated and saved to your studio history, but because live SMTP credentials (like Google Workspace, Gmail App Password, or SendGrid) have not been entered and verified under <em>Email Center &gt; Settings</em>, it was not dispatched over the external internet.
                  </div>
                </div>
              )}
            </div>

            <div className="flex-1 p-6 overflow-y-auto bg-[#FAF4F0]">
              <iframe
                title="Email Content"
                srcDoc={selectedLogForDetail.bodyHtml}
                className="w-full h-[450px] border border-[#EADDCF] rounded-xl bg-white shadow-inner"
              />
            </div>

            <div className="px-6 py-3 bg-[#FAF4F0] border-t border-[#EADDCF] flex justify-end">
              <button
                onClick={() => setSelectedLogForDetail(null)}
                className="px-5 py-2 bg-[#2D241E] text-white rounded-xl text-xs font-bold uppercase tracking-wider"
              >
                Close
              </button>
            </div>
          </motion.div>
        </div>
      )}

      {/* MODAL 3: Email Template Customizer / Editor */}
      {editingTemplateId && (
        <TemplateEditorModal
          templateId={editingTemplateId}
          config={templateConfigs[editingTemplateId] || DEFAULT_TEMPLATE_CONFIGS[editingTemplateId]}
          isOpen={Boolean(editingTemplateId)}
          onClose={() => setEditingTemplateId(null)}
          onSave={(updated) => {
            handleSaveTemplateConfig(updated);
            setEditingTemplateId(null);
          }}
          onReset={(id) => {
            handleResetTemplateConfig(id);
          }}
        />
      )}
    </div>
  );
};

export default EmailCenter;
