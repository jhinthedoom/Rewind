import React, { useState, useEffect, useMemo } from 'react';
import { db } from '../firebase';
import { collection, onSnapshot, addDoc, query, orderBy } from 'firebase/firestore';
import { FilmOrder, FilmProcessType, RewindSettings } from '../types';
import { sendBusinessEmail, generateFilmInvoiceEmail, DEFAULT_REWIND_SETTINGS } from '../utils/emailTemplates';
import { Camera, CheckCircle2, AlertCircle, Sparkles, User, Phone, Mail, Hash, MessageSquare, ArrowLeft } from 'lucide-react';
import { motion } from 'motion/react';

export default function PublicFilmRegistrationForm() {
  const [settings, setSettings] = useState<RewindSettings>(DEFAULT_REWIND_SETTINGS);
  const [orders, setOrders] = useState<FilmOrder[]>([]);

  // Form states
  const [customerName, setCustomerName] = useState('');
  const [customerPhone, setCustomerPhone] = useState('');
  const [customerEmail, setCustomerEmail] = useState('');
  const [filmType, setFilmType] = useState<FilmProcessType>('C-41');
  const [quantity, setQuantity] = useState<number>(1);
  const [envelopeNumber, setEnvelopeNumber] = useState('');
  const [remark, setRemark] = useState('');

  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submittedOrder, setSubmittedOrder] = useState<FilmOrder | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [suggestions, setSuggestions] = useState<{ name: string; phone: string; email: string }[]>([]);

  // Fetch settings & existing orders for auto-fill
  useEffect(() => {
    const unsubSettings = onSnapshot(collection(db, 'rewind_settings'), (snap) => {
      if (!snap.empty) {
        setSettings({ ...DEFAULT_REWIND_SETTINGS, ...snap.docs[0].data() as RewindSettings });
      }
    });

    const unsubOrders = onSnapshot(collection(db, 'film_orders'), (snap) => {
      const list = snap.docs.map(d => ({ id: d.id, ...d.data() } as FilmOrder));
      setOrders(list);
    });

    return () => {
      unsubSettings();
      unsubOrders();
    };
  }, []);

  // Compute past unique customers
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

  useEffect(() => {
    if (!envelopeNumber && suggestedNextEnvelope) {
      setEnvelopeNumber(suggestedNextEnvelope);
    }
  }, [suggestedNextEnvelope]);

  // Name typing with suggestions & auto-fill
  const handleNameChange = (val: string) => {
    setCustomerName(val);
    const trimmed = val.trim().toLowerCase();
    if (trimmed.length >= 2) {
      const matches = pastCustomers.filter(c =>
        c.name.toLowerCase().includes(trimmed) ||
        c.phone.includes(trimmed) ||
        c.email.toLowerCase().includes(trimmed)
      ).slice(0, 4);
      setSuggestions(matches);

      const exact = pastCustomers.find(c => c.name.toLowerCase() === trimmed);
      if (exact) {
        if (!customerPhone) setCustomerPhone(exact.phone);
        if (!customerEmail) setCustomerEmail(exact.email);
      }
    } else {
      setSuggestions([]);
    }
  };

  const handleSelectCustomer = (c: { name: string; phone: string; email: string }) => {
    setCustomerName(c.name);
    setCustomerPhone(c.phone);
    setCustomerEmail(c.email);
    setSuggestions([]);
  };

  // Unit and total price
  const unitPrice = useMemo(() => {
    if (filmType === 'C-41') return Number(settings.priceC41 || 18);
    if (filmType === 'Black and White') return Number(settings.priceBW || 22);
    if (filmType === 'ECN-2') return Number(settings.priceECN2 || 28);
    return 18;
  }, [filmType, settings]);

  const totalPrice = unitPrice * Math.min(50, Math.max(1, quantity));

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!customerName.trim() || !customerPhone.trim() || !customerEmail.trim()) {
      setErrorMsg('Please enter your full name, phone number, and email.');
      return;
    }
    if (quantity < 1 || quantity > 50) {
      setErrorMsg('Quantity must be between 1 and 50 rolls.');
      return;
    }

    setIsSubmitting(true);
    setErrorMsg(null);

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
        location: 'ALL'
      };

      const docRef = await addDoc(collection(db, 'film_orders'), newOrder);
      const created: FilmOrder = { ...newOrder, id: docRef.id };

      // Dispatch invoice email
      const invoiceEmail = generateFilmInvoiceEmail(created, settings);
      sendBusinessEmail({
        to: created.customerEmail,
        subject: invoiceEmail.subject,
        html: invoiceEmail.html,
        text: invoiceEmail.text,
        customerName: created.customerName,
        templateType: 'invoice',
        fromName: settings.studioName
      }).catch(err => console.warn('Invoice send failed:', err));

      setSubmittedOrder(created);
    } catch (err: any) {
      setErrorMsg(err.message || 'Submission failed. Please check your connection.');
    } finally {
      setIsSubmitting(false);
    }
  };

  // If already submitted, show confirmation & invoice summary
  if (submittedOrder) {
    return (
      <div className="min-h-screen bg-[#FAF7F2] text-[#1C1917] p-4 sm:p-8 flex items-center justify-center font-sans">
        <motion.div
          initial={{ opacity: 0, y: 15 }}
          animate={{ opacity: 1, y: 0 }}
          className="max-w-md w-full bg-white rounded-3xl p-8 shadow-xl border border-[#E7E0D8] text-center"
        >
          <div className="w-14 h-14 rounded-full bg-emerald-100 text-emerald-700 flex items-center justify-center mx-auto mb-4">
            <CheckCircle2 className="w-8 h-8" />
          </div>

          <span className="text-[11px] font-black uppercase tracking-widest text-[#C85A32] bg-[#FAF0EB] px-3 py-1 rounded-full">
            Film Drop-off Confirmed
          </span>

          <h1 className="text-2xl font-serif font-bold text-[#1C1917] mt-3">Order Registered!</h1>
          <p className="text-xs text-[#78716C] mt-1.5 leading-relaxed">
            Thank you, <strong>{submittedOrder.customerName}</strong>! Your invoice has been generated and sent to <span className="font-mono text-[#1C1917]">{submittedOrder.customerEmail}</span>.
          </p>

          <div className="my-6 p-4 rounded-2xl bg-[#FAF7F2] border border-[#E7E0D8] text-left space-y-2.5 text-xs">
            <div className="flex justify-between">
              <span className="text-[#78716C]">Envelope Number</span>
              <span className="font-mono font-bold text-[#C85A32]">{submittedOrder.envelopeNumber}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-[#78716C]">Invoice Number</span>
              <span className="font-mono font-bold text-[#1C1917]">{submittedOrder.invoiceNumber}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-[#78716C]">Film Process</span>
              <span className="font-semibold text-[#1C1917]">{submittedOrder.filmType} ({submittedOrder.quantity} roll{submittedOrder.quantity > 1 ? 's' : ''})</span>
            </div>
            <div className="flex justify-between border-t border-[#E7E0D8] pt-2">
              <span className="font-bold text-[#1C1917]">Total Amount Due</span>
              <span className="font-mono font-black text-sm text-[#C85A32]">{settings.currency || 'RM'} {submittedOrder.totalPrice.toFixed(2)}</span>
            </div>
          </div>

          <div className="p-4 rounded-xl bg-stone-50 border border-stone-200 text-left text-xs space-y-1 mb-6">
            <div className="font-bold text-[#1C1917] uppercase text-[10px] tracking-wider">Bank Transfer Details</div>
            <div className="text-[#44403C]">{settings.bankName || 'Maybank'} &bull; <strong className="font-mono">{settings.bankAccountNo || '5123 4567 8901'}</strong></div>
            <div className="text-[11px] text-[#78716C]">{settings.bankAccountName || 'Rewind Studio Enterprise'}</div>
          </div>

          <p className="text-[11px] text-[#78716C] leading-relaxed mb-6">
            Once your film is washed and scanned, you will receive an email with a <strong>QR Code to book your negative pick-up appointment</strong> (11am – 7pm daily).
          </p>

          <button
            onClick={() => {
              setSubmittedOrder(null);
              setCustomerName('');
              setCustomerPhone('');
              setCustomerEmail('');
              setQuantity(1);
              setRemark('');
            }}
            className="w-full py-3 bg-[#1C1917] text-white rounded-xl text-xs font-bold uppercase tracking-wider hover:bg-black transition-all cursor-pointer"
          >
            Submit Another Film Roll
          </button>
        </motion.div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#FAF7F2] text-[#1C1917] p-4 sm:p-8 flex items-center justify-center font-sans">
      <motion.div
        initial={{ opacity: 0, y: 15 }}
        animate={{ opacity: 1, y: 0 }}
        className="max-w-lg w-full bg-white rounded-3xl p-6 sm:p-10 shadow-xl border border-[#E7E0D8]"
      >
        {/* Brand Header */}
        <div className="text-center mb-8">
          <div className="w-12 h-12 bg-[#1C1917] text-white rounded-2xl flex items-center justify-center mx-auto mb-3 shadow-md shadow-[#1C1917]/10">
            <Camera className="w-6 h-6 text-[#FED7AA]" />
          </div>
          <h1 className="text-2xl font-serif font-bold text-[#1C1917] tracking-tight">
            {settings.studioName.toUpperCase()}
          </h1>
          <p className="text-[10px] font-black uppercase tracking-widest text-[#C85A32] mt-1">
            Film Wash & Developing Registration
          </p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-5">
          {/* Customer Name with Recurring Auto-Fill */}
          <div className="relative">
            <label className="block text-[11px] font-bold uppercase tracking-wider text-[#78716C] mb-1">
              Your Full Name *
            </label>
            <div className="relative">
              <User className="w-4 h-4 absolute left-3.5 top-1/2 -translate-y-1/2 text-[#78716C]" />
              <input
                type="text"
                required
                placeholder="e.g. Marcus Tan"
                value={customerName}
                onChange={(e) => handleNameChange(e.target.value)}
                className="w-full pl-10 pr-4 py-2.5 bg-[#FAF7F2] border border-[#E7E0D8] rounded-xl text-xs font-semibold focus:outline-none focus:border-[#C85A32] focus:bg-white"
              />
            </div>

            {suggestions.length > 0 && (
              <div className="absolute z-20 left-0 right-0 mt-1 bg-white border border-[#E7E0D8] rounded-xl shadow-lg overflow-hidden py-1">
                <div className="px-3 py-1 text-[10px] font-bold uppercase text-[#C85A32] bg-[#FAF0EB]">
                  Returning Customer Auto-Fill
                </div>
                {suggestions.map((c, i) => (
                  <button
                    key={i}
                    type="button"
                    onClick={() => handleSelectCustomer(c)}
                    className="w-full text-left px-3.5 py-2 hover:bg-[#FAF0EB] flex items-center justify-between text-xs border-b border-gray-50 last:border-none"
                  >
                    <div>
                      <div className="font-bold text-[#1C1917]">{c.name}</div>
                      <div className="text-[10px] text-[#78716C] font-mono">{c.phone}</div>
                    </div>
                    <span className="text-[10px] font-semibold text-[#C85A32]">Select &rarr;</span>
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* Contact Details */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-[11px] font-bold uppercase tracking-wider text-[#78716C] mb-1">
                Phone Number *
              </label>
              <div className="relative">
                <Phone className="w-4 h-4 absolute left-3.5 top-1/2 -translate-y-1/2 text-[#78716C]" />
                <input
                  type="tel"
                  required
                  placeholder="+60 12-345 6789"
                  value={customerPhone}
                  onChange={(e) => setCustomerPhone(e.target.value)}
                  className="w-full pl-10 pr-4 py-2.5 bg-[#FAF7F2] border border-[#E7E0D8] rounded-xl text-xs font-semibold focus:outline-none focus:border-[#C85A32] focus:bg-white"
                />
              </div>
            </div>

            <div>
              <label className="block text-[11px] font-bold uppercase tracking-wider text-[#78716C] mb-1">
                Email Address * (For Invoice)
              </label>
              <div className="relative">
                <Mail className="w-4 h-4 absolute left-3.5 top-1/2 -translate-y-1/2 text-[#78716C]" />
                <input
                  type="email"
                  required
                  placeholder="yourname@gmail.com"
                  value={customerEmail}
                  onChange={(e) => setCustomerEmail(e.target.value)}
                  className="w-full pl-10 pr-4 py-2.5 bg-[#FAF7F2] border border-[#E7E0D8] rounded-xl text-xs font-semibold focus:outline-none focus:border-[#C85A32] focus:bg-white"
                />
              </div>
            </div>
          </div>

          {/* Process Choice */}
          <div>
            <label className="block text-[11px] font-bold uppercase tracking-wider text-[#78716C] mb-1.5">
              Choose Film Process *
            </label>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5">
              {[
                { type: 'C-41', name: 'C-41 Color', price: settings.priceC41 || 18 },
                { type: 'Black and White', name: 'Black & White', price: settings.priceBW || 22 },
                { type: 'ECN-2', name: 'ECN-2 Motion', price: settings.priceECN2 || 28 },
              ].map((p) => {
                const isSelected = filmType === p.type;
                return (
                  <button
                    key={p.type}
                    type="button"
                    onClick={() => setFilmType(p.type as FilmProcessType)}
                    className={`p-3 rounded-xl border text-left transition-all ${
                      isSelected
                        ? 'border-[#C85A32] bg-[#FAF0EB] text-[#1C1917]'
                        : 'border-[#E7E0D8] bg-[#FAF7F2] text-[#78716C] hover:border-[#C85A32]/40'
                    }`}
                  >
                    <div className="text-xs font-bold text-[#1C1917]">{p.name}</div>
                    <div className="text-xs font-mono font-bold text-[#C85A32] mt-1">
                      {settings.currency || 'RM'} {p.price.toFixed(2)}
                    </div>
                  </button>
                );
              })}
            </div>
          </div>

          {/* Quantity & Envelope Number */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-[11px] font-bold uppercase tracking-wider text-[#78716C] mb-1">
                Film Quantity (Max 50) *
              </label>
              <div className="flex items-center gap-2">
                <input
                  type="number"
                  min={1}
                  max={50}
                  required
                  value={quantity}
                  onChange={(e) => setQuantity(parseInt(e.target.value, 10) || 1)}
                  className="w-full py-2 bg-[#FAF7F2] border border-[#E7E0D8] rounded-xl text-xs font-mono text-center font-bold"
                />
                <div className="flex gap-1">
                  {[1, 2, 3].map(n => (
                    <button
                      key={n}
                      type="button"
                      onClick={() => setQuantity(n)}
                      className={`px-2 py-1.5 text-xs font-bold rounded-lg border ${
                        quantity === n
                          ? 'bg-[#C85A32] text-white border-[#C85A32]'
                          : 'bg-[#FAF7F2] border-[#E7E0D8] text-[#1C1917]'
                      }`}
                    >
                      {n}
                    </button>
                  ))}
                </div>
              </div>
            </div>

            <div>
              <label className="block text-[11px] font-bold uppercase tracking-wider text-[#78716C] mb-1">
                Envelope Number *
              </label>
              <div className="relative">
                <Hash className="w-4 h-4 absolute left-3.5 top-1/2 -translate-y-1/2 text-[#78716C]" />
                <input
                  type="text"
                  required
                  placeholder="e.g. ENV-1044"
                  value={envelopeNumber}
                  onChange={(e) => setEnvelopeNumber(e.target.value)}
                  className="w-full pl-10 pr-4 py-2 bg-[#FAF7F2] border border-[#E7E0D8] rounded-xl text-xs font-mono font-bold focus:outline-none focus:border-[#C85A32] focus:bg-white"
                />
              </div>
            </div>
          </div>

          {/* Remark */}
          <div>
            <label className="block text-[11px] font-bold uppercase tracking-wider text-[#78716C] mb-1">
              Remark / Note (Optional)
            </label>
            <div className="relative">
              <MessageSquare className="w-4 h-4 absolute left-3.5 top-3 text-[#78716C]" />
              <textarea
                rows={2}
                placeholder="Special scanning instructions, push/pull request..."
                value={remark}
                onChange={(e) => setRemark(e.target.value)}
                className="w-full pl-10 pr-4 py-2.5 bg-[#FAF7F2] border border-[#E7E0D8] rounded-xl text-xs resize-none focus:outline-none focus:border-[#C85A32] focus:bg-white"
              />
            </div>
          </div>

          {/* Total display */}
          <div className="p-4 bg-[#FAF7F2] rounded-2xl border border-[#E7E0D8] flex items-center justify-between">
            <div>
              <div className="text-[10px] font-bold uppercase tracking-wider text-[#78716C]">
                Total Amount Due
              </div>
              <div className="text-xs text-[#78716C]">
                {quantity} roll{quantity > 1 ? 's' : ''} &times; {settings.currency || 'RM'} {unitPrice.toFixed(2)}
              </div>
            </div>
            <div className="text-2xl font-mono font-black text-[#C85A32]">
              {settings.currency || 'RM'} {totalPrice.toFixed(2)}
            </div>
          </div>

          {errorMsg && (
            <div className="p-3.5 bg-rose-50 border border-rose-200 text-rose-800 text-xs rounded-xl flex items-center gap-2">
              <AlertCircle className="w-4 h-4 shrink-0" />
              <span>{errorMsg}</span>
            </div>
          )}

          <button
            type="submit"
            disabled={isSubmitting}
            className="w-full py-4 bg-[#C85A32] hover:bg-[#B34E2A] text-white rounded-xl text-xs font-black uppercase tracking-widest shadow-md transition-all cursor-pointer disabled:opacity-50"
          >
            {isSubmitting ? 'Registering & Generating Invoice...' : 'Submit & Receive Invoice by Email'}
          </button>
        </form>

        <p className="text-[10px] text-center text-[#78716C] mt-6">
          {settings.studioName} &bull; {settings.operatingHours || '11:00 AM - 7:00 PM (Daily)'} &bull; {settings.address}
        </p>
      </motion.div>
    </div>
  );
}
