import React, { useState, useEffect, useMemo } from 'react';
import { db } from '../firebase';
import { collection, onSnapshot, doc, updateDoc, query, orderBy } from 'firebase/firestore';
import { FilmOrder, PaymentMethod, RewindSettings, Staff } from '../types';
import { handleFirestoreError } from '../utils';
import { 
  sendBusinessEmail, 
  generateFilmInvoiceEmail, 
  generateFilmReceiptEmail, 
  DEFAULT_REWIND_SETTINGS 
} from '../utils/emailTemplates';
import { 
  FileText, 
  Receipt, 
  CheckCircle2, 
  Clock, 
  Send, 
  Download, 
  Search, 
  DollarSign, 
  Mail, 
  User, 
  CreditCard, 
  QrCode, 
  Wallet, 
  Building,
  Check,
  AlertCircle,
  Eye,
  RefreshCw,
  Printer
} from 'lucide-react';
import { jsPDF } from 'jspdf';
import autoTable from 'jspdf-autotable';
import { motion, AnimatePresence } from 'motion/react';

interface Props {
  branch?: string;
  role?: 'admin' | 'staff';
}

export default function InvoiceReceipt({ branch = 'ALL', role = 'staff' }: Props) {
  const [orders, setOrders] = useState<FilmOrder[]>([]);
  const [settings, setSettings] = useState<RewindSettings>(DEFAULT_REWIND_SETTINGS);
  const [staffList, setStaffList] = useState<Staff[]>([]);

  // Filter & Search
  const [statusFilter, setStatusFilter] = useState<'all' | 'unpaid' | 'paid'>('all');
  const [searchQuery, setSearchQuery] = useState('');

  // Payment Verification Modal State
  const [verifyingOrder, setVerifyingOrder] = useState<FilmOrder | null>(null);
  const [selectedPaymentMethod, setSelectedPaymentMethod] = useState<PaymentMethod>('Online transfer');
  const [selectedStaffName, setSelectedStaffName] = useState('');
  const [isProcessing, setIsProcessing] = useState(false);
  const [actionFeedback, setActionFeedback] = useState<string | null>(null);

  // Document Preview Modal State
  const [previewDoc, setPreviewDoc] = useState<{ order: FilmOrder; type: 'invoice' | 'receipt' } | null>(null);

  useEffect(() => {
    const unsubSettings = onSnapshot(collection(db, 'rewind_settings'), (snap) => {
      if (!snap.empty) {
        setSettings({ ...DEFAULT_REWIND_SETTINGS, ...snap.docs[0].data() as RewindSettings });
      }
    });

    const q = query(collection(db, 'film_orders'), orderBy('createdAt', 'desc'));
    const unsubOrders = onSnapshot(q, (snap) => {
      const list = snap.docs.map(d => ({ id: d.id, ...d.data() } as FilmOrder));
      setOrders(list);
    }, (err) => handleFirestoreError(err, 'list' as any, 'film_orders'));

    const unsubStaff = onSnapshot(collection(db, 'staff'), (snap) => {
      const list = snap.docs.map(d => ({ id: d.id, ...d.data() } as Staff));
      setStaffList(list.filter(s => s.active));
      if (list.length > 0 && !selectedStaffName) {
        setSelectedStaffName(list[0].name);
      }
    });

    return () => {
      unsubSettings();
      unsubOrders();
      unsubStaff();
    };
  }, []);

  // Stats calculation
  const stats = useMemo(() => {
    let totalInvoiced = 0;
    let totalCollected = 0;
    let unpaidCount = 0;
    let paidCount = 0;

    orders.forEach(o => {
      const amt = Number(o.totalPrice || 0);
      totalInvoiced += amt;
      if (o.paymentStatus === 'paid') {
        totalCollected += amt;
        paidCount++;
      } else {
        unpaidCount++;
      }
    });

    return { totalInvoiced, totalCollected, unpaidCount, paidCount };
  }, [orders]);

  // Filtered orders
  const filteredOrders = useMemo(() => {
    return orders.filter(o => {
      const matchesStatus = 
        statusFilter === 'all' || 
        (statusFilter === 'unpaid' && o.paymentStatus !== 'paid') ||
        (statusFilter === 'paid' && o.paymentStatus === 'paid');

      const q = searchQuery.toLowerCase().trim();
      const matchesSearch = !q ||
        (o.customerName || '').toLowerCase().includes(q) ||
        (o.customerPhone || '').toLowerCase().includes(q) ||
        (o.customerEmail || '').toLowerCase().includes(q) ||
        (o.envelopeNumber || '').toLowerCase().includes(q) ||
        (o.invoiceNumber || '').toLowerCase().includes(q) ||
        (o.receiptNumber || '').toLowerCase().includes(q) ||
        (o.orderNumber || '').toLowerCase().includes(q);

      return matchesStatus && matchesSearch;
    });
  }, [orders, statusFilter, searchQuery]);

  // Open Payment Verification Modal
  const handleOpenVerifyModal = (order: FilmOrder) => {
    setVerifyingOrder(order);
    setSelectedPaymentMethod('Online transfer');
    if (staffList.length > 0) {
      setSelectedStaffName(staffList[0].name);
    }
  };

  // Confirm Payment & Send Receipt Email
  const handleConfirmPaymentAndSendReceipt = async () => {
    if (!verifyingOrder?.id) return;
    setIsProcessing(true);

    try {
      const now = new Date();
      const yearMonth = `${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, '0')}`;
      const receiptNumber = verifyingOrder.receiptNumber || `REC-${yearMonth}${String(orders.filter(o => o.paymentStatus === 'paid').length + 1).padStart(4, '0')}`;

      const updatedFields: Partial<FilmOrder> = {
        paymentStatus: 'paid',
        paymentMethod: selectedPaymentMethod,
        receiptNumber,
        receiptSent: true,
        receiptSentAt: now.toISOString(),
        verifiedByStaff: selectedStaffName || 'Staff',
      };

      // 1. Update Firestore
      await updateDoc(doc(db, 'film_orders', verifyingOrder.id), updatedFields);

      // 2. Dispatch Official Receipt Email
      const updatedOrder: FilmOrder = { ...verifyingOrder, ...updatedFields };
      const emailContent = generateFilmReceiptEmail(updatedOrder, settings);

      await sendBusinessEmail({
        to: updatedOrder.customerEmail,
        subject: emailContent.subject,
        html: emailContent.html,
        text: emailContent.text,
        customerName: updatedOrder.customerName,
        templateType: 'receipt',
        fromName: settings.studioName
      });

      setActionFeedback(`Payment confirmed! Official Receipt ${receiptNumber} sent to ${updatedOrder.customerEmail}.`);
      setVerifyingOrder(null);
      setTimeout(() => setActionFeedback(null), 4000);
    } catch (err: any) {
      console.error('Error confirming payment:', err);
      setActionFeedback(`Error: ${err.message}`);
    } finally {
      setIsProcessing(false);
    }
  };

  // Resend Invoice Email
  const handleResendInvoice = async (order: FilmOrder) => {
    try {
      const emailContent = generateFilmInvoiceEmail(order, settings);
      await sendBusinessEmail({
        to: order.customerEmail,
        subject: emailContent.subject,
        html: emailContent.html,
        text: emailContent.text,
        customerName: order.customerName,
        templateType: 'invoice',
        fromName: settings.studioName
      });
      setActionFeedback(`Invoice ${order.invoiceNumber} resent to ${order.customerEmail}!`);
      setTimeout(() => setActionFeedback(null), 3000);
    } catch (err: any) {
      setActionFeedback(`Failed to resend invoice: ${err.message}`);
    }
  };

  // Resend Receipt Email
  const handleResendReceipt = async (order: FilmOrder) => {
    try {
      const emailContent = generateFilmReceiptEmail(order, settings);
      await sendBusinessEmail({
        to: order.customerEmail,
        subject: emailContent.subject,
        html: emailContent.html,
        text: emailContent.text,
        customerName: order.customerName,
        templateType: 'receipt',
        fromName: settings.studioName
      });
      setActionFeedback(`Receipt ${order.receiptNumber} resent to ${order.customerEmail}!`);
      setTimeout(() => setActionFeedback(null), 3000);
    } catch (err: any) {
      setActionFeedback(`Failed to resend receipt: ${err.message}`);
    }
  };

  // Generate and Download PDF
  const handleDownloadPdf = (order: FilmOrder, type: 'invoice' | 'receipt') => {
    const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
    const isInvoice = type === 'invoice';
    const currency = settings.currency || 'RM';
    const docNumber = isInvoice ? (order.invoiceNumber || 'INV-001') : (order.receiptNumber || 'REC-001');
    const docTitle = isInvoice ? 'TAX INVOICE' : 'OFFICIAL RECEIPT';
    const dateStr = order.createdAt ? new Date(order.createdAt).toLocaleDateString('en-GB') : new Date().toLocaleDateString('en-GB');

    // Header styling
    doc.setFillColor(28, 25, 23);
    doc.rect(0, 0, 210, 36, 'F');
    doc.setTextColor(255, 255, 255);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(22);
    doc.text(settings.studioName.toUpperCase(), 14, 18);
    doc.setFontSize(9);
    doc.setFont('helvetica', 'normal');
    doc.text('FILM LAB & VINTAGE CAMERAS', 14, 25);
    doc.text(`${settings.address || 'George Town, Penang'} | ${settings.phone || '+60 12-345 6789'}`, 14, 30);

    doc.setFontSize(16);
    doc.setFont('helvetica', 'bold');
    doc.text(docTitle, 196, 20, { align: 'right' });
    doc.setFontSize(10);
    doc.text(docNumber, 196, 28, { align: 'right' });

    // Meta details
    doc.setTextColor(40, 40, 40);
    doc.setFontSize(10);
    doc.setFont('helvetica', 'bold');
    doc.text(isInvoice ? 'Billed To:' : 'Receipt Issued To:', 14, 48);
    doc.setFont('helvetica', 'normal');
    doc.text(order.customerName, 14, 54);
    doc.text(`Phone: ${order.customerPhone}`, 14, 60);
    doc.text(`Email: ${order.customerEmail}`, 14, 66);

    doc.setFont('helvetica', 'bold');
    doc.text('Document Details:', 125, 48);
    doc.setFont('helvetica', 'normal');
    doc.text(`Date: ${dateStr}`, 125, 54);
    doc.text(`Envelope No: ${order.envelopeNumber}`, 125, 60);
    doc.text(`Status: ${isInvoice ? (order.paymentStatus === 'paid' ? 'PAID' : 'PAYMENT DUE') : 'PAID IN FULL'}`, 125, 66);
    if (!isInvoice && order.paymentMethod) {
      doc.text(`Payment: ${order.paymentMethod}`, 125, 72);
    }

    // AutoTable for items
    autoTable(doc, {
      startY: 80,
      head: [['Item / Film Process', 'Rolls', 'Rate', 'Amount']],
      body: [
        [
          `${order.filmType} Process\nFilm Wash, Developing & High-Res Digital Scans${order.remark ? `\nRemark: ${order.remark}` : ''}`,
          `${order.quantity} roll${order.quantity > 1 ? 's' : ''}`,
          `${currency} ${Number(order.unitPrice || 0).toFixed(2)}`,
          `${currency} ${Number(order.totalPrice || 0).toFixed(2)}`
        ]
      ],
      headStyles: {
        fillColor: [245, 239, 235],
        textColor: [87, 83, 78],
        fontSize: 9,
        fontStyle: 'bold'
      },
      styles: {
        fontSize: 9,
        cellPadding: 6,
        textColor: [28, 25, 23]
      },
      columnStyles: {
        0: { cellWidth: 100 },
        1: { cellWidth: 25, halign: 'center' },
        2: { cellWidth: 30, halign: 'right' },
        3: { cellWidth: 35, halign: 'right', fontStyle: 'bold' }
      }
    });

    const finalY = (doc as any).lastAutoTable.finalY + 12;

    // Total box
    doc.setFillColor(250, 247, 242);
    doc.roundedRect(120, finalY, 76, 24, 3, 3, 'F');
    doc.setFontSize(9);
    doc.setTextColor(120, 113, 108);
    doc.text(isInvoice ? 'TOTAL AMOUNT DUE' : 'TOTAL AMOUNT PAID', 125, finalY + 8);
    doc.setFontSize(16);
    doc.setFont('helvetica', 'bold');
    doc.setTextColor(200, 90, 50);
    doc.text(`${currency} ${Number(order.totalPrice || 0).toFixed(2)}`, 190, finalY + 18, { align: 'right' });

    // Payment details / Footer
    if (isInvoice && order.paymentStatus !== 'paid') {
      doc.setFontSize(9);
      doc.setTextColor(60, 60, 60);
      doc.setFont('helvetica', 'bold');
      doc.text('Bank Transfer Instructions:', 14, finalY + 8);
      doc.setFont('helvetica', 'normal');
      doc.text(`Bank: ${settings.bankName || 'Maybank'}`, 14, finalY + 14);
      doc.text(`Account No: ${settings.bankAccountNo || '5123 4567 8901'}`, 14, finalY + 20);
      doc.text(`Account Name: ${settings.bankAccountName || 'Rewind Studio Enterprise'}`, 14, finalY + 26);
    }

    doc.setFontSize(8);
    doc.setTextColor(140, 140, 140);
    doc.text('Thank you for developing with Rewind Film Lab! Computer generated document.', 105, 280, { align: 'center' });

    doc.save(`${docNumber}_${order.customerName.replace(/\s+/g, '_')}.pdf`);
  };

  return (
    <div className="space-y-8 max-w-7xl mx-auto pb-16">
      {/* Header & Stats */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-[#C85A32]">
            <Receipt className="w-4 h-4" />
            <span>Financial Billing & Proof</span>
          </div>
          <h1 className="text-3xl font-serif font-bold text-[var(--text-app)] mt-1">Invoices & Receipts</h1>
          <p className="text-sm text-[var(--text-muted)] mt-1">
            Automatic invoice generation on drop-off. Verify payment before dispatching customer receipts.
          </p>
        </div>

        {/* Status Filter Bar */}
        <div className="flex items-center gap-1 bg-[var(--bg-card)] p-1 rounded-xl border border-[var(--border-app)] text-xs font-bold shadow-xs">
          <button
            onClick={() => setStatusFilter('all')}
            className={`px-3 py-1.5 rounded-lg transition-all ${
              statusFilter === 'all'
                ? 'bg-[#1C1917] text-white shadow-xs'
                : 'text-[var(--text-muted)] hover:text-[var(--text-app)]'
            }`}
          >
            All Orders ({orders.length})
          </button>
          <button
            onClick={() => setStatusFilter('unpaid')}
            className={`px-3 py-1.5 rounded-lg transition-all ${
              statusFilter === 'unpaid'
                ? 'bg-amber-600 text-white shadow-xs'
                : 'text-[var(--text-muted)] hover:text-amber-700'
            }`}
          >
            Unpaid Invoices ({stats.unpaidCount})
          </button>
          <button
            onClick={() => setStatusFilter('paid')}
            className={`px-3 py-1.5 rounded-lg transition-all ${
              statusFilter === 'paid'
                ? 'bg-emerald-600 text-white shadow-xs'
                : 'text-[var(--text-muted)] hover:text-emerald-700'
            }`}
          >
            Paid Receipts ({stats.paidCount})
          </button>
        </div>
      </div>

      {/* Action Feedback Banner */}
      {actionFeedback && (
        <motion.div
          initial={{ opacity: 0, y: -10 }}
          animate={{ opacity: 1, y: 0 }}
          className="p-4 rounded-xl bg-emerald-50 border border-emerald-200 text-emerald-800 text-xs font-bold flex items-center justify-between shadow-xs"
        >
          <div className="flex items-center gap-2">
            <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
            <span>{actionFeedback}</span>
          </div>
          <button onClick={() => setActionFeedback(null)} className="text-emerald-600 hover:text-emerald-900 text-sm">
            &times;
          </button>
        </motion.div>
      )}

      {/* Summary KPI Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-6">
        <div className="natural-card p-6 bg-[var(--bg-card)]">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold uppercase tracking-wider text-[var(--text-muted)]">Total Film Billed</span>
            <div className="w-8 h-8 rounded-full bg-[#FAF0EB] text-[#C85A32] flex items-center justify-center">
              <FileText className="w-4 h-4" />
            </div>
          </div>
          <div className="text-2xl font-mono font-bold text-[var(--text-app)] mt-2">
            {settings.currency || 'RM'} {stats.totalInvoiced.toFixed(2)}
          </div>
          <div className="text-xs text-[var(--text-muted)] mt-1">Across all registered envelopes</div>
        </div>

        <div className="natural-card p-6 bg-[var(--bg-card)]">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold uppercase tracking-wider text-emerald-700">Total Verified & Collected</span>
            <div className="w-8 h-8 rounded-full bg-emerald-50 text-emerald-600 flex items-center justify-center">
              <CheckCircle2 className="w-4 h-4" />
            </div>
          </div>
          <div className="text-2xl font-mono font-bold text-emerald-700 mt-2">
            {settings.currency || 'RM'} {stats.totalCollected.toFixed(2)}
          </div>
          <div className="text-xs text-emerald-600 mt-1">{stats.paidCount} official receipts dispatched</div>
        </div>

        <div className="natural-card p-6 bg-[var(--bg-card)]">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold uppercase tracking-wider text-amber-700">Pending Payment Verification</span>
            <div className="w-8 h-8 rounded-full bg-amber-50 text-amber-600 flex items-center justify-center">
              <Clock className="w-4 h-4" />
            </div>
          </div>
          <div className="text-2xl font-mono font-bold text-amber-700 mt-2">
            {settings.currency || 'RM'} {(stats.totalInvoiced - stats.totalCollected).toFixed(2)}
          </div>
          <div className="text-xs text-amber-600 mt-1">{stats.unpaidCount} customer invoices awaiting payment</div>
        </div>
      </div>

      {/* Main Invoices Table */}
      <div className="natural-card p-6 bg-[var(--bg-card)]">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-6">
          <div>
            <h2 className="text-lg font-serif font-bold text-[var(--text-app)]">Invoice & Receipt Ledger</h2>
            <p className="text-xs text-[var(--text-muted)] mt-0.5">
              Review invoices, verify customer payments, and trigger receipts.
            </p>
          </div>

          <div className="relative">
            <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-[var(--text-muted)]" />
            <input
              type="text"
              placeholder="Search by customer, envelope, invoice #..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="natural-input pl-9 text-xs py-1.5 w-72"
            />
          </div>
        </div>

        {filteredOrders.length === 0 ? (
          <div className="text-center py-16 text-[var(--text-muted)] text-sm">
            No invoices or receipts found for current selection.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs border-collapse">
              <thead>
                <tr className="border-b border-[var(--border-app)] natural-table-header">
                  <th className="py-3 px-3">Invoice / Ref</th>
                  <th className="py-3 px-3">Envelope</th>
                  <th className="py-3 px-3">Customer</th>
                  <th className="py-3 px-3">Process & Qty</th>
                  <th className="py-3 px-3 text-right">Amount</th>
                  <th className="py-3 px-3">Payment Status</th>
                  <th className="py-3 px-3">Official Receipt</th>
                  <th className="py-3 px-3 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[var(--border-app)]">
                {filteredOrders.map((o) => {
                  const isPaid = o.paymentStatus === 'paid';
                  return (
                    <tr key={o.id} className="natural-table-row">
                      <td className="py-3 px-3">
                        <div className="font-mono font-bold text-[var(--text-app)]">{o.invoiceNumber || 'INV-PENDING'}</div>
                        <div className="font-mono text-[10px] text-[var(--text-muted)]">{o.orderNumber}</div>
                      </td>
                      <td className="py-3 px-3">
                        <span className="font-mono font-bold text-[#C85A32] bg-[#FAF0EB] px-2 py-0.5 rounded-md text-[11px]">
                          {o.envelopeNumber}
                        </span>
                      </td>
                      <td className="py-3 px-3">
                        <div className="font-bold text-[var(--text-app)]">{o.customerName}</div>
                        <div className="text-[11px] text-[var(--text-muted)] font-mono">{o.customerPhone}</div>
                        <div className="text-[10px] text-[var(--text-muted)]">{o.customerEmail}</div>
                      </td>
                      <td className="py-3 px-3">
                        <div className="font-semibold text-[var(--text-app)]">{o.filmType}</div>
                        <div className="text-[11px] text-[var(--text-muted)]">{o.quantity} roll{o.quantity > 1 ? 's' : ''}</div>
                      </td>
                      <td className="py-3 px-3 text-right font-mono font-bold text-[var(--text-app)]">
                        {settings.currency || 'RM'} {Number(o.totalPrice || 0).toFixed(2)}
                      </td>
                      <td className="py-3 px-3">
                        {isPaid ? (
                          <div>
                            <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider bg-emerald-100 text-emerald-800">
                              <Check className="w-3 h-3" />
                              Paid ({o.paymentMethod || 'Verified'})
                            </span>
                            {o.verifiedByStaff && (
                              <div className="text-[10px] text-[var(--text-muted)] mt-0.5">By {o.verifiedByStaff}</div>
                            )}
                          </div>
                        ) : (
                          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider bg-amber-100 text-amber-800">
                            <Clock className="w-3 h-3" />
                            Unpaid (Invoice Sent)
                          </span>
                        )}
                      </td>
                      <td className="py-3 px-3">
                        {isPaid ? (
                          <div>
                            <div className="font-mono font-bold text-emerald-800 text-[11px]">
                              {o.receiptNumber}
                            </div>
                            <div className="text-[10px] text-emerald-700">Receipt Sent &bull; Verified</div>
                          </div>
                        ) : (
                          <div className="text-[11px] text-[var(--text-muted)] italic">
                            Draft ready &bull; Awaiting verify
                          </div>
                        )}
                      </td>
                      <td className="py-3 px-3 text-right">
                        <div className="flex items-center justify-end gap-1.5">
                          {!isPaid ? (
                            <button
                              onClick={() => handleOpenVerifyModal(o)}
                              className="px-3 py-1.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg text-xs font-bold transition-all shadow-xs flex items-center gap-1 cursor-pointer"
                            >
                              <Check className="w-3.5 h-3.5" />
                              <span>Verify & Send Receipt</span>
                            </button>
                          ) : (
                            <button
                              onClick={() => handleResendReceipt(o)}
                              title="Resend receipt email"
                              className="p-1.5 text-[var(--text-muted)] hover:text-emerald-700 rounded-lg hover:bg-emerald-50 transition-colors"
                            >
                              <Mail className="w-4 h-4" />
                            </button>
                          )}

                          {/* Download PDF button */}
                          <button
                            onClick={() => handleDownloadPdf(o, isPaid ? 'receipt' : 'invoice')}
                            title={isPaid ? 'Download Official Receipt PDF' : 'Download Tax Invoice PDF'}
                            className="p-1.5 text-[var(--text-muted)] hover:text-[var(--text-app)] rounded-lg hover:bg-[var(--bg-app)] transition-colors"
                          >
                            <Download className="w-4 h-4" />
                          </button>

                          {/* Resend invoice button */}
                          <button
                            onClick={() => handleResendInvoice(o)}
                            title="Resend invoice email"
                            className="p-1.5 text-[var(--text-muted)] hover:text-[#C85A32] rounded-lg hover:bg-[#FAF0EB] transition-colors"
                          >
                            <RefreshCw className="w-4 h-4" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Verify Payment Modal */}
      <AnimatePresence>
        {verifyingOrder && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-xs">
            <motion.div
              initial={{ scale: 0.95, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.95, opacity: 0 }}
              className="bg-white rounded-3xl max-w-lg w-full p-8 shadow-2xl relative border border-[#E7E0D8]"
            >
              <button
                onClick={() => setVerifyingOrder(null)}
                className="absolute top-4 right-4 text-gray-400 hover:text-black p-1"
              >
                &times;
              </button>

              <div className="w-12 h-12 rounded-full bg-emerald-100 text-emerald-700 flex items-center justify-center mb-4">
                <Receipt className="w-6 h-6" />
              </div>

              <h2 className="text-xl font-serif font-bold text-[#1C1917]">
                Verify Payment & Dispatch Receipt
              </h2>
              <p className="text-xs text-[#78716C] mt-1 mb-6">
                Customer: <strong>{verifyingOrder.customerName}</strong> ({verifyingOrder.envelopeNumber}) &bull; Total: <strong>{settings.currency || 'RM'} {Number(verifyingOrder.totalPrice || 0).toFixed(2)}</strong>
              </p>

              <div className="space-y-4 mb-6">
                {/* Payment Method Selector */}
                <div>
                  <label className="block text-[11px] font-bold uppercase tracking-wider text-[#78716C] mb-1.5">
                    Select Payment Method *
                  </label>
                  <div className="grid grid-cols-2 gap-2.5">
                    {[
                      { method: 'Cash', icon: Wallet },
                      { method: 'QR', icon: QrCode },
                      { method: 'Online transfer', icon: Building },
                      { method: 'Card', icon: CreditCard },
                    ].map((item) => {
                      const isSelected = selectedPaymentMethod === item.method;
                      return (
                        <button
                          key={item.method}
                          type="button"
                          onClick={() => setSelectedPaymentMethod(item.method as PaymentMethod)}
                          className={`p-3 rounded-xl border text-left flex items-center gap-2.5 transition-all ${
                            isSelected
                              ? 'border-emerald-600 bg-emerald-50 text-emerald-950 font-bold shadow-xs'
                              : 'border-[#E7E0D8] bg-[#FAF7F2] text-[#78716C] hover:border-emerald-500/40'
                          }`}
                        >
                          <item.icon className="w-4 h-4 text-emerald-700" />
                          <span className="text-xs">{item.method}</span>
                        </button>
                      );
                    })}
                  </div>
                </div>

                {/* Staff Member who verified */}
                <div>
                  <label className="block text-[11px] font-bold uppercase tracking-wider text-[#78716C] mb-1.5">
                    Staff Member Verifying *
                  </label>
                  {staffList.length > 0 ? (
                    <select
                      value={selectedStaffName}
                      onChange={(e) => setSelectedStaffName(e.target.value)}
                      className="natural-input w-full text-xs font-semibold"
                    >
                      {staffList.map((s) => (
                        <option key={s.id} value={s.name}>{s.name}</option>
                      ))}
                    </select>
                  ) : (
                    <input
                      type="text"
                      placeholder="Staff Name"
                      value={selectedStaffName}
                      onChange={(e) => setSelectedStaffName(e.target.value)}
                      className="natural-input w-full text-xs"
                    />
                  )}
                </div>

                <div className="p-4 rounded-xl bg-emerald-50 border border-emerald-200 text-xs text-emerald-900 leading-relaxed">
                  Upon clicking confirm, the official receipt will be generated and dispatched immediately to <strong>{verifyingOrder.customerEmail}</strong>.
                </div>
              </div>

              <div className="flex gap-3">
                <button
                  type="button"
                  onClick={() => setVerifyingOrder(null)}
                  className="natural-btn-secondary flex-1 text-xs py-3"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  disabled={isProcessing}
                  onClick={handleConfirmPaymentAndSendReceipt}
                  className="flex-1 py-3 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-xs font-bold uppercase tracking-wider flex items-center justify-center gap-2 shadow-md cursor-pointer disabled:opacity-50"
                >
                  {isProcessing ? 'Dispatching Receipt...' : 'Confirm & Send Receipt'}
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
}
