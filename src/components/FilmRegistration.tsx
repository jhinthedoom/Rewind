import React, { useState, useEffect, useMemo } from 'react';
import { db } from '../firebase';
import { collection, onSnapshot, addDoc, query, orderBy } from 'firebase/firestore';
import { FilmOrder, FilmProcessType, RewindSettings, Branch } from '../types';
import { handleFirestoreError } from '../utils';
import { sendBusinessEmail, generateFilmInvoiceEmail, DEFAULT_REWIND_SETTINGS } from '../utils/emailTemplates';
import { 
  PlusCircle, 
  QrCode, 
  Share2, 
  Search, 
  Check, 
  Copy, 
  Mail, 
  Sparkles, 
  Camera, 
  Layers, 
  FileText, 
  User, 
  Phone, 
  Hash, 
  MessageSquare,
  AlertCircle,
  ExternalLink,
  ChevronRight,
  Filter
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';

interface Props {
  branch?: string;
  onGoToInvoices?: () => void;
}

export default function FilmRegistration({ branch = 'ALL', onGoToInvoices }: Props) {
  const [orders, setOrders] = useState<FilmOrder[]>([]);
  const [settings, setSettings] = useState<RewindSettings>(DEFAULT_REWIND_SETTINGS);
  
  // Registration Form States
  const [customerName, setCustomerName] = useState('');
  const [customerPhone, setCustomerPhone] = useState('');
  const [customerEmail, setCustomerEmail] = useState('');
  const [filmType, setFilmType] = useState<FilmProcessType>('C-41');
  const [quantity, setQuantity] = useState<number>(1);
  const [envelopeNumber, setEnvelopeNumber] = useState('');
  const [remark, setRemark] = useState('');

  // UI States
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedProcessFilter, setSelectedProcessFilter] = useState<string>('ALL');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [feedback, setFeedback] = useState<{ type: 'success' | 'error'; message: string } | null>(null);
  const [isShareModalOpen, setIsShareModalOpen] = useState(false);
  const [copiedLink, setCopiedLink] = useState(false);
  const [showCustomerSuggestions, setShowCustomerSuggestions] = useState(false);

  // Fetch settings & film orders
  useEffect(() => {
    const unsubSettings = onSnapshot(collection(db, 'rewind_settings'), (snap) => {
      if (!snap.empty) {
        const s = snap.docs[0].data() as RewindSettings;
        setSettings({ ...DEFAULT_REWIND_SETTINGS, ...s, id: snap.docs[0].id });
      }
    });

    const q = query(collection(db, 'film_orders'), orderBy('createdAt', 'desc'));
    const unsubOrders = onSnapshot(q, (snap) => {
      const list = snap.docs.map(d => ({ id: d.id, ...d.data() } as FilmOrder));
      setOrders(list);
    }, (err) => handleFirestoreError(err, 'list' as any, 'film_orders'));

    return () => {
      unsubSettings();
      unsubOrders();
    };
  }, []);

  // Compute past unique customers for auto-completion & quick convenience
  const pastCustomers = useMemo(() => {
    const map = new Map<string, { name: string; phone: string; email: string }>();
    orders.forEach(o => {
      const key = (o.customerName || '').trim().toLowerCase();
      if (key && !map.has(key)) {
        map.set(key, {
          name: o.customerName.trim(),
          phone: o.customerPhone || '',
          email: o.customerEmail || ''
        });
      }
    });
    return Array.from(map.values());
  }, [orders]);

  // Next suggested envelope number
  const suggestedNextEnvelope = useMemo(() => {
    let maxNum = 1000;
    orders.forEach(o => {
      if (o.envelopeNumber) {
        const match = o.envelopeNumber.match(/(\d+)/);
        if (match) {
          const n = parseInt(match[1], 10);
          if (!isNaN(n) && n > maxNum) maxNum = n;
        }
      }
    });
    return `ENV-${maxNum + 1}`;
  }, [orders]);

  // Pre-fill default envelope number if empty
  useEffect(() => {
    if (!envelopeNumber && suggestedNextEnvelope) {
      setEnvelopeNumber(suggestedNextEnvelope);
    }
  }, [suggestedNextEnvelope]);

  // Filtered customer suggestions when typing name
  const filteredSuggestions = useMemo(() => {
    const trimmed = customerName.trim().toLowerCase();
    if (!trimmed || trimmed.length < 2) return [];
    return pastCustomers.filter(c => 
      c.name.toLowerCase().includes(trimmed) ||
      c.phone.includes(trimmed) ||
      c.email.toLowerCase().includes(trimmed)
    ).slice(0, 5);
  }, [customerName, pastCustomers]);

  // Auto-fill on selecting existing customer
  const handleSelectCustomer = (c: { name: string; phone: string; email: string }) => {
    setCustomerName(c.name);
    setCustomerPhone(c.phone);
    setCustomerEmail(c.email);
    setShowCustomerSuggestions(false);
  };

  // Check matching customer on blur or change
  const handleNameChange = (val: string) => {
    setCustomerName(val);
    setShowCustomerSuggestions(true);
    // If exact name match found, auto-fill phone and email
    const exact = pastCustomers.find(c => c.name.toLowerCase() === val.trim().toLowerCase());
    if (exact) {
      if (!customerPhone) setCustomerPhone(exact.phone);
      if (!customerEmail) setCustomerEmail(exact.email);
    }
  };

  // Pricing calculations
  const unitPrice = useMemo(() => {
    if (filmType === 'C-41') return Number(settings.priceC41 || 18);
    if (filmType === 'Black and White') return Number(settings.priceBW || 22);
    if (filmType === 'ECN-2') return Number(settings.priceECN2 || 28);
    return 18;
  }, [filmType, settings]);

  const totalPrice = unitPrice * Math.min(50, Math.max(1, quantity));

  // Public registration URL
  const publicRegistrationUrl = `${window.location.origin}${window.location.pathname}?view=register`;
  const qrCodeImageUrl = `https://api.qrserver.com/v1/create-qr-code/?size=300x300&margin=12&data=${encodeURIComponent(publicRegistrationUrl)}`;

  // Submit Registration
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!customerName.trim() || !customerPhone.trim() || !customerEmail.trim()) {
      setFeedback({ type: 'error', message: 'Please provide Customer Name, Phone, and Email.' });
      return;
    }
    if (quantity < 1 || quantity > 50) {
      setFeedback({ type: 'error', message: 'Quantity must be between 1 and 50 rolls.' });
      return;
    }

    setIsSubmitting(true);
    setFeedback(null);

    try {
      const now = new Date();
      const yearMonth = `${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, '0')}`;
      const seq = String(orders.length + 1).padStart(4, '0');
      const orderNumber = `REW-${now.getFullYear()}-${String(orders.length + 1).padStart(3, '0')}`;
      const invoiceNumber = `INV-${yearMonth}${seq}`;

      const newOrder: Omit<FilmOrder, 'id'> = {
        orderNumber,
        customerName: customerName.trim(),
        customerPhone: customerPhone.trim(),
        customerEmail: customerEmail.trim(),
        filmType,
        quantity: Math.min(50, Math.max(1, quantity)),
        envelopeNumber: envelopeNumber.trim() || suggestedNextEnvelope,
        remark: remark.trim() || undefined,
        unitPrice,
        totalPrice,
        createdAt: now.toISOString(),
        status: 'registered',
        invoiceNumber,
        invoiceSent: true,
        invoiceSentAt: now.toISOString(),
        paymentStatus: 'unpaid',
        receiptSent: false,
        pickupNotified: false,
        location: branch as Branch
      };

      // 1. Save order to Firestore
      const docRef = await addDoc(collection(db, 'film_orders'), newOrder);

      // 2. Automatically generate and send invoice email
      const invoiceEmail = generateFilmInvoiceEmail({ ...newOrder, id: docRef.id }, settings);
      sendBusinessEmail({
        to: newOrder.customerEmail,
        subject: invoiceEmail.subject,
        html: invoiceEmail.html,
        text: invoiceEmail.text,
        customerName: newOrder.customerName,
        templateType: 'invoice',
        fromName: settings.studioName
      }).catch(err => console.warn('Background invoice email dispatch:', err));

      // Reset form & notify
      setFeedback({
        type: 'success',
        message: `Order ${orderNumber} created! Invoice ${invoiceNumber} automatically sent to ${newOrder.customerEmail}.`
      });

      setCustomerName('');
      setCustomerPhone('');
      setCustomerEmail('');
      setQuantity(1);
      setRemark('');
      setEnvelopeNumber('');
    } catch (err: any) {
      setFeedback({ type: 'error', message: err.message || 'Failed to submit registration.' });
    } finally {
      setIsSubmitting(false);
    }
  };

  // Filtered orders table
  const filteredOrders = useMemo(() => {
    return orders.filter(o => {
      const matchProcess = selectedProcessFilter === 'ALL' || o.filmType === selectedProcessFilter;
      const q = searchQuery.toLowerCase().trim();
      const matchSearch = !q ||
        (o.customerName || '').toLowerCase().includes(q) ||
        (o.customerPhone || '').toLowerCase().includes(q) ||
        (o.customerEmail || '').toLowerCase().includes(q) ||
        (o.envelopeNumber || '').toLowerCase().includes(q) ||
        (o.orderNumber || '').toLowerCase().includes(q);
      return matchProcess && matchSearch;
    });
  }, [orders, selectedProcessFilter, searchQuery]);

  return (
    <div className="space-y-8 max-w-7xl mx-auto pb-16">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-[#C85A32]">
            <Camera className="w-4 h-4" />
            <span>Film Wash & Developing</span>
          </div>
          <h1 className="text-3xl font-serif font-bold text-[var(--text-app)] mt-1">Film Registration</h1>
          <p className="text-sm text-[var(--text-muted)] mt-1">
            Register drop-offs, automatically email invoices to customers, and track processing envelopes.
          </p>
        </div>

        <div className="flex items-center gap-3">
          <button
            onClick={() => setIsShareModalOpen(true)}
            className="natural-btn-secondary flex items-center gap-2 text-xs uppercase tracking-wider font-bold"
          >
            <QrCode className="w-4 h-4 text-[#C85A32]" />
            <span>Customer QR Form</span>
          </button>

          {onGoToInvoices && (
            <button
              onClick={onGoToInvoices}
              className="natural-btn-secondary flex items-center gap-2 text-xs uppercase tracking-wider font-bold"
            >
              <FileText className="w-4 h-4" />
              <span>Invoices & Receipts</span>
            </button>
          )}
        </div>
      </div>

      {/* Main Grid: Registration Form + Overview */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-start">
        {/* Registration Form Card */}
        <div className="lg:col-span-7 natural-card p-6 sm:p-8 bg-[var(--bg-card)]">
          <div className="flex items-center justify-between mb-6 pb-4 border-b border-[var(--border-app)]">
            <div>
              <h2 className="text-lg font-serif font-bold text-[var(--text-app)]">New Film Drop-off Form</h2>
              <p className="text-xs text-[var(--text-muted)] mt-0.5">
                Convenient auto-fill for recurring customers upon typing their name.
              </p>
            </div>
            <span className="px-3 py-1 text-[11px] font-bold uppercase tracking-wider rounded-lg bg-[#FAF0EB] text-[#C85A32]">
              {settings.currency || 'RM'} Pricing
            </span>
          </div>

          <form onSubmit={handleSubmit} className="space-y-6">
            {/* Customer Personal Details */}
            <div className="space-y-4">
              <div className="relative">
                <label className="block text-[11px] font-bold uppercase tracking-wider text-[var(--text-muted)] mb-1.5">
                  Customer Name *
                </label>
                <div className="relative">
                  <User className="w-4 h-4 absolute left-3.5 top-1/2 -translate-y-1/2 text-[var(--text-muted)]" />
                  <input
                    type="text"
                    required
                    placeholder="e.g. Marcus Tan"
                    value={customerName}
                    onChange={(e) => handleNameChange(e.target.value)}
                    onFocus={() => setShowCustomerSuggestions(true)}
                    className="natural-input w-full pl-10"
                  />
                </div>

                {/* Recurring Customer Auto-Complete Dropdown */}
                {showCustomerSuggestions && filteredSuggestions.length > 0 && (
                  <div className="absolute z-20 left-0 right-0 mt-1 bg-white border border-[var(--border-app)] rounded-xl shadow-lg overflow-hidden py-1">
                    <div className="px-3 py-1.5 text-[10px] font-bold uppercase tracking-wider text-[#C85A32] bg-[#FAF7F2]">
                      Recurring Customer Quick-Fill
                    </div>
                    {filteredSuggestions.map((c, i) => (
                      <button
                        key={i}
                        type="button"
                        onClick={() => handleSelectCustomer(c)}
                        className="w-full text-left px-3.5 py-2.5 hover:bg-[#FAF0EB] flex items-center justify-between transition-colors border-b border-gray-50 last:border-none"
                      >
                        <div>
                          <div className="text-xs font-bold text-[var(--text-app)]">{c.name}</div>
                          <div className="text-[11px] text-[var(--text-muted)] font-mono">{c.phone} &bull; {c.email}</div>
                        </div>
                        <span className="text-[10px] font-semibold text-[#C85A32] uppercase">Use &rarr;</span>
                      </button>
                    ))}
                  </div>
                )}
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-[11px] font-bold uppercase tracking-wider text-[var(--text-muted)] mb-1.5">
                    Phone Number *
                  </label>
                  <div className="relative">
                    <Phone className="w-4 h-4 absolute left-3.5 top-1/2 -translate-y-1/2 text-[var(--text-muted)]" />
                    <input
                      type="tel"
                      required
                      placeholder="+60 12-345 6789"
                      value={customerPhone}
                      onChange={(e) => setCustomerPhone(e.target.value)}
                      className="natural-input w-full pl-10"
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-[11px] font-bold uppercase tracking-wider text-[var(--text-muted)] mb-1.5">
                    Email Address * (For Invoice & Pickup QR)
                  </label>
                  <div className="relative">
                    <Mail className="w-4 h-4 absolute left-3.5 top-1/2 -translate-y-1/2 text-[var(--text-muted)]" />
                    <input
                      type="email"
                      required
                      placeholder="customer@example.com"
                      value={customerEmail}
                      onChange={(e) => setCustomerEmail(e.target.value)}
                      className="natural-input w-full pl-10"
                    />
                  </div>
                </div>
              </div>
            </div>

            {/* Film Processing & Envelope */}
            <div className="pt-2 border-t border-[var(--border-app)] space-y-4">
              <div>
                <label className="block text-[11px] font-bold uppercase tracking-wider text-[var(--text-muted)] mb-2">
                  Film Process Type *
                </label>
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                  {[
                    { type: 'C-41', name: 'C-41 Color', price: settings.priceC41 || 18, desc: 'Color Negative' },
                    { type: 'Black and White', name: 'B&W Process', price: settings.priceBW || 22, desc: 'Monochrome' },
                    { type: 'ECN-2', name: 'ECN-2 Motion', price: settings.priceECN2 || 28, desc: 'Motion Cinema Film' },
                  ].map((p) => {
                    const isSelected = filmType === p.type;
                    return (
                      <button
                        key={p.type}
                        type="button"
                        onClick={() => setFilmType(p.type as FilmProcessType)}
                        className={`p-3.5 rounded-xl border text-left transition-all ${
                          isSelected
                            ? 'border-[#C85A32] bg-[#FAF0EB] text-[var(--text-app)] shadow-sm'
                            : 'border-[var(--border-app)] bg-[var(--bg-app)] hover:border-[#C85A32]/50 text-[var(--text-muted)]'
                        }`}
                      >
                        <div className="text-xs font-bold text-[var(--text-app)]">{p.name}</div>
                        <div className="text-[11px] text-[var(--text-muted)] mt-0.5">{p.desc}</div>
                        <div className="text-xs font-mono font-bold text-[#C85A32] mt-2">
                          {settings.currency || 'RM'} {p.price.toFixed(2)} / roll
                        </div>
                      </button>
                    );
                  })}
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-[11px] font-bold uppercase tracking-wider text-[var(--text-muted)] mb-1.5">
                    Film Quantity (Max 50 rolls) *
                  </label>
                  <div className="flex items-center gap-2">
                    <input
                      type="number"
                      min={1}
                      max={50}
                      required
                      value={quantity}
                      onChange={(e) => setQuantity(parseInt(e.target.value, 10) || 1)}
                      className="natural-input w-full font-mono text-center font-bold text-base"
                    />
                    <div className="flex gap-1">
                      {[1, 2, 3, 5].map(n => (
                        <button
                          key={n}
                          type="button"
                          onClick={() => setQuantity(n)}
                          className={`px-2.5 py-2 text-xs font-bold rounded-lg border transition-all ${
                            quantity === n
                              ? 'bg-[#C85A32] text-white border-[#C85A32]'
                              : 'bg-[var(--bg-app)] border-[var(--border-app)] text-[var(--text-app)] hover:bg-[#FAF0EB]'
                          }`}
                        >
                          {n}
                        </button>
                      ))}
                    </div>
                  </div>
                </div>

                <div>
                  <label className="block text-[11px] font-bold uppercase tracking-wider text-[var(--text-muted)] mb-1.5">
                    Envelope Number *
                  </label>
                  <div className="relative">
                    <Hash className="w-4 h-4 absolute left-3.5 top-1/2 -translate-y-1/2 text-[var(--text-muted)]" />
                    <input
                      type="text"
                      required
                      placeholder="e.g. ENV-1044"
                      value={envelopeNumber}
                      onChange={(e) => setEnvelopeNumber(e.target.value)}
                      className="natural-input w-full pl-10 font-mono font-bold"
                    />
                  </div>
                </div>
              </div>

              <div>
                <label className="block text-[11px] font-bold uppercase tracking-wider text-[var(--text-muted)] mb-1.5">
                  Remark (Optional)
                </label>
                <div className="relative">
                  <MessageSquare className="w-4 h-4 absolute left-3.5 top-3 text-[var(--text-muted)]" />
                  <textarea
                    rows={2}
                    placeholder="e.g. Push +1 stop, high-res TIFF scans requested, half-frame camera..."
                    value={remark}
                    onChange={(e) => setRemark(e.target.value)}
                    className="natural-input w-full pl-10 resize-none"
                  />
                </div>
              </div>
            </div>

            {/* Total Calculation & Feedback */}
            <div className="p-4 rounded-2xl bg-[var(--bg-app)] border border-[var(--border-app)] flex items-center justify-between">
              <div>
                <div className="text-[11px] font-bold uppercase tracking-wider text-[var(--text-muted)]">
                  Total Calculated Amount
                </div>
                <div className="text-xs text-[var(--text-muted)] mt-0.5">
                  {quantity} roll{quantity > 1 ? 's' : ''} &times; {settings.currency || 'RM'} {unitPrice.toFixed(2)}
                </div>
              </div>
              <div className="text-right">
                <div className="text-2xl font-mono font-extrabold text-[#C85A32]">
                  {settings.currency || 'RM'} {totalPrice.toFixed(2)}
                </div>
                <div className="text-[10px] text-[var(--text-muted)]">Invoice sent automatically on registration</div>
              </div>
            </div>

            {feedback && (
              <div className={`p-4 rounded-xl text-xs font-semibold flex items-center gap-2 ${
                feedback.type === 'success' 
                  ? 'bg-emerald-50 text-emerald-800 border border-emerald-200' 
                  : 'bg-rose-50 text-rose-800 border border-rose-200'
              }`}>
                {feedback.type === 'success' ? <Check className="w-4 h-4 shrink-0" /> : <AlertCircle className="w-4 h-4 shrink-0" />}
                <span>{feedback.message}</span>
              </div>
            )}

            <button
              type="submit"
              disabled={isSubmitting}
              className="natural-btn-primary w-full py-4 text-xs uppercase tracking-widest font-black flex items-center justify-center gap-2 shadow-md cursor-pointer disabled:opacity-50"
            >
              {isSubmitting ? (
                <>
                  <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                  <span>Registering & Generating Invoice...</span>
                </>
              ) : (
                <>
                  <PlusCircle className="w-4 h-4" />
                  <span>Register Film & Send Invoice Email</span>
                </>
              )}
            </button>
          </form>
        </div>

        {/* Right Column: QR Registration Sharing + Quick Guidance */}
        <div className="lg:col-span-5 space-y-6">
          {/* QR Share Card */}
          <div className="natural-card p-6 bg-gradient-to-br from-[#FAF7F2] to-white border border-[#E7E0D8]">
            <div className="flex items-center justify-between mb-4">
              <span className="text-[10px] font-black uppercase tracking-wider text-[#C85A32] bg-[#FAF0EB] px-2.5 py-1 rounded-md">
                Customer Self-Registration
              </span>
              <button
                onClick={() => setIsShareModalOpen(true)}
                className="text-xs text-[var(--text-muted)] hover:text-[var(--text-app)] flex items-center gap-1 font-semibold"
              >
                <span>Full QR Screen</span>
                <ExternalLink className="w-3.5 h-3.5" />
              </button>
            </div>

            <div className="text-center my-3">
              <div className="inline-block p-3 bg-white rounded-2xl shadow-sm border border-[#E7E0D8]">
                <img
                  src={qrCodeImageUrl}
                  alt="Customer Form QR"
                  className="w-36 h-36 rounded-lg object-contain mx-auto"
                />
              </div>
              <h3 className="text-sm font-bold text-[var(--text-app)] mt-3">Scan to Drop-off Film</h3>
              <p className="text-xs text-[var(--text-muted)] max-w-xs mx-auto mt-1">
                Display this QR at your counter. Customers can scan on their phone, fill in their film details, and receive an instant invoice.
              </p>
            </div>

            <div className="mt-4 pt-4 border-t border-[var(--border-app)] flex items-center gap-2">
              <input
                readOnly
                value={publicRegistrationUrl}
                className="natural-input text-xs font-mono flex-1 bg-white text-ellipsis"
              />
              <button
                onClick={() => {
                  navigator.clipboard.writeText(publicRegistrationUrl);
                  setCopiedLink(true);
                  setTimeout(() => setCopiedLink(false), 2500);
                }}
                className="natural-btn-secondary py-2 px-3 text-xs flex items-center gap-1 shrink-0 font-bold"
              >
                {copiedLink ? <Check className="w-3.5 h-3.5 text-emerald-600" /> : <Copy className="w-3.5 h-3.5" />}
                <span>{copiedLink ? 'Copied' : 'Copy'}</span>
              </button>
            </div>
          </div>

          {/* Workflow Guide */}
          <div className="natural-card p-6 space-y-3.5 bg-[var(--bg-card)]">
            <h3 className="text-xs font-bold uppercase tracking-wider text-[var(--text-app)] flex items-center gap-2">
              <Sparkles className="w-4 h-4 text-[#C85A32]" />
              <span>Rewind Workflow Sequence</span>
            </h3>

            <div className="space-y-3 text-xs text-[var(--text-muted)]">
              <div className="flex gap-3">
                <span className="w-5 h-5 rounded-full bg-[#FAF0EB] text-[#C85A32] font-bold flex items-center justify-center shrink-0 text-[11px]">1</span>
                <div>
                  <strong className="text-[var(--text-app)]">Film Registration:</strong> Customer or staff keys in film details & envelope. An official invoice is emailed immediately.
                </div>
              </div>

              <div className="flex gap-3">
                <span className="w-5 h-5 rounded-full bg-[#FAF0EB] text-[#C85A32] font-bold flex items-center justify-center shrink-0 text-[11px]">2</span>
                <div>
                  <strong className="text-[var(--text-app)]">Invoices & Receipts (Tab 4):</strong> Staff confirms payment (Cash, QR, Online Transfer, Card) and clicks <em>"Verify & Send Receipt"</em> to dispatch the receipt.
                </div>
              </div>

              <div className="flex gap-3">
                <span className="w-5 h-5 rounded-full bg-[#FAF0EB] text-[#C85A32] font-bold flex items-center justify-center shrink-0 text-[11px]">3</span>
                <div>
                  <strong className="text-[var(--text-app)]">Film Pickups (Tab 5):</strong> Once film is washed out, press <em>"Notify Customer"</em> to email a QR code allowing them to book a 1-hour appointment slot within 1 month.
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Recent Registrations Table */}
      <div className="natural-card p-6 bg-[var(--bg-card)]">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-6">
          <div>
            <h2 className="text-lg font-serif font-bold text-[var(--text-app)]">Recent Film Registrations</h2>
            <p className="text-xs text-[var(--text-muted)] mt-0.5">
              Showing {filteredOrders.length} registered film order{filteredOrders.length === 1 ? '' : 's'}.
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-3">
            {/* Process Filter */}
            <div className="flex items-center gap-1 bg-[var(--bg-app)] p-1 rounded-xl border border-[var(--border-app)] text-xs font-semibold">
              {['ALL', 'C-41', 'Black and White', 'ECN-2'].map((p) => (
                <button
                  key={p}
                  onClick={() => setSelectedProcessFilter(p)}
                  className={`px-3 py-1.5 rounded-lg transition-all ${
                    selectedProcessFilter === p
                      ? 'bg-white text-[var(--text-app)] shadow-xs font-bold'
                      : 'text-[var(--text-muted)] hover:text-[var(--text-app)]'
                  }`}
                >
                  {p === 'ALL' ? 'All Processes' : p}
                </button>
              ))}
            </div>

            {/* Search */}
            <div className="relative">
              <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-[var(--text-muted)]" />
              <input
                type="text"
                placeholder="Search envelope, name, phone..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="natural-input pl-9 text-xs py-1.5 w-60"
              />
            </div>
          </div>
        </div>

        {filteredOrders.length === 0 ? (
          <div className="text-center py-12 text-[var(--text-muted)] text-sm">
            No film orders found matching the filter.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs border-collapse">
              <thead>
                <tr className="border-b border-[var(--border-app)] natural-table-header">
                  <th className="py-3 px-3">Order / Envelope</th>
                  <th className="py-3 px-3">Customer</th>
                  <th className="py-3 px-3">Process & Rolls</th>
                  <th className="py-3 px-3 text-right">Amount</th>
                  <th className="py-3 px-3">Invoice Status</th>
                  <th className="py-3 px-3">Lab Status</th>
                  <th className="py-3 px-3">Date</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[var(--border-app)]">
                {filteredOrders.map((o) => (
                  <tr key={o.id} className="natural-table-row">
                    <td className="py-3 px-3">
                      <div className="font-mono font-bold text-[var(--text-app)]">{o.envelopeNumber}</div>
                      <div className="font-mono text-[10px] text-[var(--text-muted)]">{o.orderNumber}</div>
                    </td>
                    <td className="py-3 px-3">
                      <div className="font-bold text-[var(--text-app)]">{o.customerName}</div>
                      <div className="text-[11px] text-[var(--text-muted)] font-mono">{o.customerPhone}</div>
                    </td>
                    <td className="py-3 px-3">
                      <div className="font-semibold text-[var(--text-app)]">{o.filmType}</div>
                      <div className="text-[11px] text-[var(--text-muted)]">
                        {o.quantity} roll{o.quantity > 1 ? 's' : ''}
                        {o.remark ? ` &bull; "${o.remark.slice(0, 30)}${o.remark.length > 30 ? '...' : ''}"` : ''}
                      </div>
                    </td>
                    <td className="py-3 px-3 text-right font-mono font-bold text-[var(--text-app)]">
                      {settings.currency || 'RM'} {Number(o.totalPrice || 0).toFixed(2)}
                    </td>
                    <td className="py-3 px-3">
                      <span className={`inline-block px-2.5 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider ${
                        o.paymentStatus === 'paid' 
                          ? 'bg-emerald-100 text-emerald-800' 
                          : 'bg-amber-100 text-amber-800'
                      }`}>
                        {o.paymentStatus === 'paid' ? 'Paid & Verified' : 'Invoice Sent (Unpaid)'}
                      </span>
                    </td>
                    <td className="py-3 px-3">
                      <span className={`inline-block px-2.5 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider ${
                        o.status === 'completed' 
                          ? 'bg-gray-100 text-gray-700'
                          : o.status === 'ready_for_pickup'
                            ? 'bg-purple-100 text-purple-800'
                            : o.status === 'in_process'
                              ? 'bg-blue-100 text-blue-800'
                              : 'bg-stone-100 text-stone-700'
                      }`}>
                        {o.status === 'completed' ? 'Picked Up' :
                         o.status === 'ready_for_pickup' ? 'Ready for Pickup' :
                         o.status === 'in_process' ? 'In Developing' : 'Registered'}
                      </span>
                    </td>
                    <td className="py-3 px-3 text-[11px] text-[var(--text-muted)] font-mono whitespace-nowrap">
                      {o.createdAt ? new Date(o.createdAt).toLocaleDateString('en-GB') : '-'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Full Screen Share Modal for Public Registration Form */}
      <AnimatePresence>
        {isShareModalOpen && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-xs">
            <motion.div
              initial={{ scale: 0.95, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.95, opacity: 0 }}
              className="bg-white rounded-3xl max-w-md w-full p-8 shadow-2xl relative text-center border border-[#E7E0D8]"
            >
              <button
                onClick={() => setIsShareModalOpen(false)}
                className="absolute top-4 right-4 text-gray-400 hover:text-black p-1"
              >
                &times;
              </button>

              <div className="w-10 h-10 rounded-full bg-[#FAF0EB] text-[#C85A32] flex items-center justify-center mx-auto mb-3">
                <QrCode className="w-5 h-5" />
              </div>

              <h2 className="text-xl font-serif font-bold text-[#1C1917]">Customer Drop-off QR</h2>
              <p className="text-xs text-[#78716C] mt-1 mb-6">
                Customers can scan this code to submit their film wash registration form directly on their phone.
              </p>

              <div className="p-4 bg-[#FAF7F2] rounded-2xl border border-[#E7E0D8] inline-block mb-6">
                <img
                  src={qrCodeImageUrl}
                  alt="Customer Form QR"
                  className="w-52 h-52 rounded-xl object-contain mx-auto bg-white p-2"
                />
              </div>

              <div className="space-y-3">
                <div className="flex items-center gap-2">
                  <input
                    readOnly
                    value={publicRegistrationUrl}
                    className="natural-input text-xs font-mono flex-1 bg-[#FAF7F2]"
                  />
                  <button
                    onClick={() => {
                      navigator.clipboard.writeText(publicRegistrationUrl);
                      setCopiedLink(true);
                      setTimeout(() => setCopiedLink(false), 2000);
                    }}
                    className="natural-btn-primary py-2 px-4 text-xs font-bold shrink-0"
                  >
                    {copiedLink ? 'Copied!' : 'Copy Link'}
                  </button>
                </div>

                <a
                  href={publicRegistrationUrl}
                  target="_blank"
                  rel="noreferrer"
                  className="inline-flex items-center gap-1.5 text-xs text-[#C85A32] hover:underline font-bold"
                >
                  <span>Open Public Form in New Tab</span>
                  <ExternalLink className="w-3.5 h-3.5" />
                </a>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
}
