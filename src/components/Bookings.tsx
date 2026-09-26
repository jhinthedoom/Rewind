import React, { useState, useEffect } from 'react';
import { db, storage } from '../firebase';
import { collection, onSnapshot, addDoc, updateDoc, doc, query, orderBy, Timestamp, where, deleteField, deleteDoc, getDocs } from 'firebase/firestore';
import { ref, uploadBytes, getDownloadURL } from 'firebase/storage';
import { Booking, Workshop, OperationType, Transaction, Product, Staff } from '../types';
import { handleFirestoreError } from '../utils';
import { ConfirmationModal } from './ConfirmationModal';
import { SendEmailModal } from './SendEmailModal';
import { 
  Plus, 
  Search, 
  Calendar, 
  CheckCircle2, 
  Clock, 
  AlertCircle,
  MoreVertical,
  Mail,
  Phone,
  Banknote,
  CheckCircle,
  Coffee,
  XCircle,
  Package,
  Truck,
  MapPin,
  Camera,
  Image as ImageIcon,
  Edit2,
  Trash2,
  RotateCcw,
  Undo2,
  Palette,
  MessageSquare,
  Download,
  FileText,
  X,
  Copy,
  Send,
  Printer,
  CheckCheck,
  Smartphone,
  Receipt,
  Eye
} from 'lucide-react';
import { downloadBookingReceiptPdf, generateBookingReceiptPdfBase64 } from '../utils/pdfGenerator';
import { getBookingDocRef } from '../utils/referenceNumber';
import { sendBusinessEmail, generatePaymentReceiptEmail, generateBookingConfirmationEmail } from '../utils/emailTemplates';
import { 
  format, 
  startOfMonth, 
  endOfMonth, 
  startOfWeek, 
  endOfWeek, 
  eachDayOfInterval, 
  isSameMonth, 
  isSameDay, 
  addMonths, 
  subMonths 
} from 'date-fns';
import { motion, AnimatePresence } from 'motion/react';

const compressImage = (file: File, maxWidth = 1024, maxHeight = 1024, quality = 0.75): Promise<File> => {
  return new Promise((resolve) => {
    if (!file.type.startsWith('image/')) {
      resolve(file);
      return;
    }

    const reader = new FileReader();
    reader.onload = (event) => {
      const img = new Image();
      img.onload = () => {
        try {
          const canvas = document.createElement('canvas');
          let width = img.width;
          let height = img.height;

          if (width > height) {
            if (width > maxWidth) {
              height = Math.round((height * maxWidth) / width);
              width = maxWidth;
            }
          } else {
            if (height > maxHeight) {
              width = Math.round((width * maxHeight) / height);
              height = maxHeight;
            }
          }

          canvas.width = width;
          canvas.height = height;

          const ctx = canvas.getContext('2d');
          if (!ctx) {
            resolve(file);
            return;
          }

          ctx.drawImage(img, 0, 0, width, height);

          canvas.toBlob(
            (blob) => {
              if (blob) {
                const compressedFile = new File([blob], file.name, {
                  type: 'image/jpeg',
                  lastModified: Date.now(),
                });
                resolve(compressedFile);
              } else {
                resolve(file);
              }
            },
            'image/jpeg',
            quality
          );
        } catch (err) {
          console.warn("Compression failed, using original file", err);
          resolve(file);
        }
      };
      img.onerror = () => resolve(file);
      img.src = event.target?.result as string;
    };
    reader.onerror = () => resolve(file);
    reader.readAsDataURL(file);
  });
};

export default function Bookings({ 
  branch = 'ALL', 
  startAdding = false, 
  onAddingFormClose 
}: { 
  branch?: string; 
  startAdding?: boolean; 
  onAddingFormClose?: () => void; 
}) {
  const [activeTab, setActiveTab] = useState<'active' | 'pending' | 'history'>('active');
  const [bookings, setBookings] = useState<Booking[]>([]);
  const [workshops, setWorkshops] = useState<Workshop[]>([]);
  const [isAdding, setIsAdding] = useState(startAdding);

  useEffect(() => {
    if (startAdding) {
      setIsAdding(true);
    }
  }, [startAdding]);

  useEffect(() => {
    if (!isAdding && onAddingFormClose) {
      onAddingFormClose();
    }
  }, [isAdding, onAddingFormClose]);
  const [search, setSearch] = useState('');
  const [filterType, setFilterType] = useState<'all' | 'workshop' | 'ceramic'>('all');
  const [paintingPieces, setPaintingPieces] = useState<Record<string, number>>({});
  const [paintingPricesInput, setPaintingPricesInput] = useState<Record<string, number>>({});
  const [inventoryBases, setInventoryBases] = useState<Product[]>([]);
  const [staffList, setStaffList] = useState<Staff[]>([]);
  const [selectedPiecesForBooking, setSelectedPiecesForBooking] = useState<Record<string, { productId: string; name: string; price: number; quantity: number }[]>>({});
  const [activeSettlementId, setActiveSettlementId] = useState<string | null>(null);
  const [settlementDate, setSettlementDate] = useState<string>('');
  const [editingBooking, setEditingBooking] = useState<Booking | null>(null);
  const [editDateValue, setEditDateValue] = useState<string>('');
  const [editTimeValue, setEditTimeValue] = useState<string>('');
  const [activePiecesId, setActivePiecesId] = useState<string | null>(null);
  const [paintingInstructionsId, setPaintingInstructionsId] = useState<string | null>(null);
  const [colourPaintingQty, setColourPaintingQty] = useState<number>(0);
  const [colourPaintingRate, setColourPaintingRate] = useState<number>(20);
  const [includeDelivery, setIncludeDelivery] = useState(false);
  const [deliveryAmount, setDeliveryAmount] = useState(0);
  const [drinksDiscountCount, setDrinksDiscountCount] = useState<number>(0);
  const [relatedTransactions, setRelatedTransactions] = useState<Transaction[]>([]);
  const [paymentConfirmTarget, setPaymentConfirmTarget] = useState<Booking | null>(null);
  const [settlementPaymentOpt, setSettlementPaymentOpt] = useState<'now' | 'later'>('now');
  const [emailModalTarget, setEmailModalTarget] = useState<Booking | null>(null);
  const [emailDefaultTemplate, setEmailDefaultTemplate] = useState<'booking_confirmation' | 'collection_ready' | 'receipt' | 'reminder' | 'custom'>('booking_confirmation');

  // --- Document Preview & Email Dispatch Hub Modal State (matches POS.tsx) ---
  const [previewDoc, setPreviewDoc] = useState<{ booking: Booking; type: 'receipt' | 'invoice' } | null>(null);
  const [modalEmailInput, setModalEmailInput] = useState<string>('');
  const [modalPhoneInput, setModalPhoneInput] = useState<string>('');
  const [emailActionFeedback, setEmailActionFeedback] = useState<string | null>(null);
  const [isSendingEmail, setIsSendingEmail] = useState<boolean>(false);
  const [isCopied, setIsCopied] = useState<boolean>(false);
  const [downloadNotice, setDownloadNotice] = useState<string | null>(null);
  const [autoSendConfirmationEmail, setAutoSendConfirmationEmail] = useState<boolean>(true);
  const [isSubmittingBooking, setIsSubmittingBooking] = useState<boolean>(false);

  const handleDownloadBookingPdf = (booking: Booking, type: 'invoice' | 'receipt') => {
    try {
      downloadBookingReceiptPdf(booking, type, undefined, bookings);
      const docName = type === 'invoice' ? 'Tax Invoice' : 'Official Receipt';
      setDownloadNotice(`✓ Downloaded ${docName} PDF`);
      setTimeout(() => {
        setDownloadNotice(null);
      }, 3200);
    } catch (err) {
      console.error('Error downloading booking PDF:', err);
    }
  };
  
  useEffect(() => {
    if (activeSettlementId) {
      setSettlementPaymentOpt('now');
      const booking = bookings.find(b => b.id === activeSettlementId);
      if (booking) {
        if (booking.location === 'BM') {
          setColourPaintingRate(10);
        } else {
          setColourPaintingRate(20);
        }

        if (booking.drinksDiscountCount !== undefined) {
          setDrinksDiscountCount(booking.drinksDiscountCount);
        } else {
          const selected = selectedPiecesForBooking[booking.id!] || [];
          const piecesCount = selected.length > 0 
            ? selected.reduce((sum, p) => sum + (Number(p.quantity) || 0), 0)
            : (booking.selectedItems || []).reduce((sum, p) => sum + (Number(p.quantity) || 0), 0);
          
          if (booking.location === 'BM') {
            setDrinksDiscountCount(piecesCount);
          } else {
            setDrinksDiscountCount(0);
          }
        }
      }
      // Default to today's local date
      const today = new Date();
      const yyyy = today.getFullYear();
      const mm = String(today.getMonth() + 1).padStart(2, '0');
      const dd = String(today.getDate()).padStart(2, '0');
      setSettlementDate(`${yyyy}-${mm}-${dd}`);
    } else {
      setSettlementDate('');
      setDrinksDiscountCount(0);
    }
  }, [activeSettlementId, bookings, selectedPiecesForBooking]);

  const [actualPaidDate, setActualPaidDate] = useState<string>('');

  useEffect(() => {
    if (paymentConfirmTarget) {
      const today = new Date();
      const yyyy = today.getFullYear();
      const mm = String(today.getMonth() + 1).padStart(2, '0');
      const dd = String(today.getDate()).padStart(2, '0');
      setActualPaidDate(`${yyyy}-${mm}-${dd}`);
    } else {
      setActualPaidDate('');
    }
  }, [paymentConfirmTarget]);

  const [formData, setFormData] = useState<Omit<Booking, 'id'>>({
    workshopId: '',
    workshopName: '',
    customerName: '',
    customerPhone: '',
    customerEmail: '',
    date: new Date().toISOString().split('T')[0],
    time: '10:00',
    status: 'pending',
    depositPaid: false,
    balancePaid: false,
    totalPrice: 0,
    depositAmount: 0,
    pax: 1,
    notes: '',
    location: branch === 'ALL' ? 'PG' : branch as any,
    staffName: '',
    recordingDate: '',
  });

  useEffect(() => {
    let qb = collection(db, 'bookings') as any;
    if (branch !== 'ALL') {
      qb = query(qb, where('location', '==', branch));
    }

    const unsubscribeBookings = onSnapshot(qb, (snapshot) => {
      let docs = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Booking));
      // Sort client-side by date ASC, then code-friendly time ASC
      docs.sort((a, b) => {
        const dateA = a.date || '';
        const dateB = b.date || '';
        if (dateA !== dateB) {
          return dateA.localeCompare(dateB);
        }
        const timeA = a.time || '';
        const timeB = b.time || '';
        return timeA.localeCompare(timeB);
      });
      setBookings(docs);
    }, (error) => handleFirestoreError(error, OperationType.LIST, 'bookings'));

    const qw = collection(db, 'workshops');
    const unsubscribeWorkshops = onSnapshot(qw, (snapshot) => {
      let docs = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Workshop));
      if (branch !== 'ALL') {
        docs = docs.filter(w => w.location === 'ALL' || w.location === branch);
      }
      // Sort client-side by name ascending
      docs.sort((a, b) => (a.name || '').localeCompare(b.name || ''));
      setWorkshops(docs);
    }, (error) => handleFirestoreError(error, OperationType.LIST, 'workshops'));

    let qp = query(collection(db, 'products'), where('category', '==', 'base'));
    const unsubscribeProducts = onSnapshot(qp, (snapshot) => {
      const docs = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Product));
      setInventoryBases(docs);
    }, (error) => handleFirestoreError(error, OperationType.LIST, 'products'));

    const unsubscribeStaff = onSnapshot(collection(db, 'staff'), (snapshot) => {
      setStaffList(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Staff)));
    });

    return () => {
      unsubscribeBookings();
      unsubscribeWorkshops();
      unsubscribeProducts();
      unsubscribeStaff();
    };
  }, [branch]);

  useEffect(() => {
    if (!activeSettlementId) {
      setRelatedTransactions([]);
      return;
    }

    const q = query(
      collection(db, 'transactions'),
      where('relatedId', '==', activeSettlementId)
    );

    const unsubscribe = onSnapshot(q, (snapshot) => {
      const docs = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Transaction));
      // Sort client-side by timestamp in ascending order
      docs.sort((a, b) => (a.timestamp || '').localeCompare(b.timestamp || ''));
      setRelatedTransactions(docs);
    });

    return () => unsubscribe();
  }, [activeSettlementId]);

  // Open Document Preview Modal & prefill email/phone state (matches POS.tsx)
  const openDocumentPreview = (booking: Booking, type?: 'receipt' | 'invoice') => {
    const docType: 'receipt' | 'invoice' = type || (booking.paymentLater ? 'invoice' : (booking.depositPaid || booking.balancePaid ? 'receipt' : 'invoice'));
    setPreviewDoc({ booking, type: docType });
    setModalEmailInput(booking.customerEmail || '');
    setModalPhoneInput(booking.customerPhone || '');
    setEmailActionFeedback(null);
    setIsCopied(false);
  };

  const getBookingDocDetails = (booking: Booking, type: 'receipt' | 'invoice') => {
    const isInvoice = type === 'invoice' || Boolean(booking.paymentLater);
    const docRef = getBookingDocRef(booking, type, bookings);
    const dateStr = (() => {
      try {
        if (booking.settlementDate) return format(new Date(booking.settlementDate), 'dd MMM yyyy');
        if (booking.date) return format(new Date(booking.date), 'dd MMM yyyy');
        return format(new Date(), 'dd MMM yyyy');
      } catch {
        return booking.date || format(new Date(), 'dd MMM yyyy');
      }
    })();

    const pax = booking.pax || 1;
    const workshopTotal = booking.totalPrice || 0;
    const paintingTotal = booking.paintingPrice || 0;
    const deliveryTotal = booking.deliveryFee || 0;
    const drinksDiscount = (booking.drinksDiscountCount || 0) * 10;
    const deposit = booking.depositPaid ? (booking.depositAmount || 0) : 0;

    // Advance deposit only receipt
    if (type === 'receipt' && !booking.balancePaid && deposit > 0) {
      return {
        isInvoice: false,
        docRef,
        dateStr,
        items: [
          {
            name: `Advance Deposit for ${booking.workshopName || 'Pottery Workshop'}${pax > 1 ? ` (${pax} pax)` : ''}`,
            qty: 1,
            unitPrice: deposit,
            total: deposit,
            isDeduction: false
          }
        ],
        subtotal: deposit,
        deposit: 0,
        totalDueOrPaid: deposit,
        statusBadge: 'PAID IN FULL',
      };
    }

    // Full itemized or settlement
    const items: Array<{ name: string; qty: number; unitPrice: number; total: number; isDeduction?: boolean }> = [];
    if (booking.selectedItems && booking.selectedItems.length > 0) {
      booking.selectedItems.forEach(item => {
        items.push({
          name: item.name,
          qty: item.quantity,
          unitPrice: item.price,
          total: item.price * item.quantity,
          isDeduction: false
        });
      });
    } else {
      items.push({
        name: booking.workshopName || 'Pottery Session Workshop',
        qty: pax,
        unitPrice: pax > 0 ? (workshopTotal / pax) : workshopTotal,
        total: workshopTotal,
        isDeduction: false
      });
    }

    if (paintingTotal > 0) {
      const pieces = booking.paintingPieces || 1;
      items.push({
        name: 'Add-on Ceramic Pieces / Colour Painting',
        qty: pieces,
        unitPrice: paintingTotal / pieces,
        total: paintingTotal,
        isDeduction: false
      });
    }

    if (deliveryTotal > 0) {
      items.push({
        name: 'Standard Courier Delivery Service',
        qty: 1,
        unitPrice: deliveryTotal,
        total: deliveryTotal,
        isDeduction: false
      });
    }

    if (drinksDiscount > 0) {
      items.push({
        name: `Drinks Promotion Discount (${booking.drinksDiscountCount} items)`,
        qty: booking.drinksDiscountCount || 1,
        unitPrice: -10,
        total: -drinksDiscount,
        isDeduction: true,
      });
    }

    const subtotal = Math.max(0, items.filter(i => !i.isDeduction).reduce((s, i) => s + i.total, 0));
    const totalAmount = Math.max(0, items.reduce((s, i) => s + i.total, 0));
    const balanceDue = Math.max(0, totalAmount - deposit);

    return {
      isInvoice,
      docRef,
      dateStr,
      items,
      subtotal,
      deposit: deposit > 0 ? deposit : 0,
      totalDueOrPaid: isInvoice ? balanceDue : (booking.balancePaid ? balanceDue : totalAmount),
      statusBadge: isInvoice ? 'PAYMENT DUE' : 'PAID IN FULL',
    };
  };

  const generateBookingReceiptSummaryText = (booking: Booking, type: 'receipt' | 'invoice' = 'receipt') => {
    const doc = getBookingDocDetails(booking, type);
    const title = doc.isInvoice ? 'TAX INVOICE' : 'OFFICIAL RECEIPT';
    const customer = booking.customerName || 'Valued Customer';

    return `==============================
NENDOA STUDIO ENTERPRISE
SSM Reg No: 202403185935 (PG0558602-T)
214, Lebuh Victoria, 10300 Georgetown, Pulau Pinang
Email: hello@nendoastudio.com | WhatsApp: +60 12-889 2030
==============================
${title}
Document No : ${doc.docRef}
Date & Time : ${doc.dateStr}
Customer    : ${customer}
Status      : ${doc.statusBadge}
------------------------------
ITEM BREAKDOWN:
${doc.items.map(r => `• ${r.name} (${r.qty}x) - ${r.total < 0 ? `-RM ${Math.abs(r.total).toFixed(2)}` : `RM ${r.total.toFixed(2)}`}`).join('\n')}
------------------------------
SUBTOTAL           : RM ${doc.subtotal.toFixed(2)}
${doc.deposit > 0 ? `MINUS DEPOSIT      : -RM ${doc.deposit.toFixed(2)}\n` : ''}${doc.isInvoice ? 'TOTAL DUE          ' : 'GRAND TOTAL PAID   '} : RM ${doc.totalDueOrPaid.toFixed(2)}
==============================
Thank you for supporting handcrafted ceramic pottery.
For inquiries or questions, contact hello@nendoastudio.com.`;
  };

  const handleSendEmailReceipt = async (booking: Booking, type: 'receipt' | 'invoice' = 'receipt', overrideEmail?: string) => {
    const targetEmail = overrideEmail || modalEmailInput || booking.customerEmail || '';
    if (!targetEmail.trim() || !targetEmail.includes('@')) {
      alert('Please enter a valid customer email address (e.g. name@example.com).');
      return;
    }

    setIsSendingEmail(true);
    setEmailActionFeedback('Dispatching email from studio...');

    try {
      if (booking.id && targetEmail.trim() !== (booking.customerEmail || '')) {
        try {
          await updateDoc(doc(db, 'bookings', booking.id), { customerEmail: targetEmail.trim() });
        } catch {
          // Non-blocking update
        }
      }

      const docRef = getBookingDocRef(booking, type, bookings);
      const isAdvanceDepositReceipt = type === 'receipt' && !booking.balancePaid && Boolean(booking.depositPaid && (booking.depositAmount || 0) > 0);

      let subject = '';
      let html = '';
      let text = '';
      let templateType: 'booking_confirmation' | 'receipt' = 'receipt';

      if (isAdvanceDepositReceipt) {
        templateType = 'booking_confirmation';
        const confirmationEmail = generateBookingConfirmationEmail({
          customerName: booking.customerName || 'Valued Customer',
          customerEmail: targetEmail.trim(),
          customerPhone: booking.customerPhone,
          workshopName: booking.workshopName,
          bookingDate: booking.date,
          bookingTime: booking.time,
          location: booking.location,
          pax: booking.pax,
          depositAmount: booking.depositAmount,
          totalPrice: booking.totalPrice,
          depositPaid: true,
          notes: booking.notes,
          bookingId: docRef,
        });
        subject = confirmationEmail.subject;
        html = confirmationEmail.html;
        text = confirmationEmail.text;
      } else {
        templateType = type === 'invoice' ? 'booking_confirmation' : 'receipt';
        const receiptEmail = generatePaymentReceiptEmail({
          customerName: booking.customerName || 'Valued Customer',
          customerEmail: targetEmail.trim(),
          customerPhone: booking.customerPhone,
          workshopName: booking.workshopName,
          pax: booking.pax,
          date: booking.date,
          time: booking.time,
          location: booking.location,
          totalPrice: booking.totalPrice,
          depositAmount: booking.depositAmount,
          depositPaid: booking.depositPaid,
          bookingId: docRef,
          paintingPieces: booking.paintingPieces,
          paintingPrice: booking.paintingPrice,
          deliveryFee: booking.deliveryFee,
          drinksDiscountCount: booking.drinksDiscountCount,
          selectedItems: booking.selectedItems,
          paymentLater: type === 'invoice',
        });
        subject = receiptEmail.subject;
        html = receiptEmail.html;
        text = receiptEmail.text;
      }

      let pdfAttachment: any = undefined;
      try {
        const pdfBase64 = generateBookingReceiptPdfBase64(booking, type, docRef, bookings);
        const filename = `${type === 'invoice' ? 'Tax-Invoice' : (isAdvanceDepositReceipt ? 'Official-Deposit-Receipt' : 'Official-Receipt')}-${docRef.replace(/[^A-Za-z0-9-_]/g, '')}.pdf`;
        pdfAttachment = {
          filename,
          content: pdfBase64,
          contentType: 'application/pdf',
        };
      } catch (pdfErr) {
        console.warn('Could not generate PDF attachment, continuing with email HTML:', pdfErr);
      }

      const result = await sendBusinessEmail({
        to: targetEmail.trim(),
        subject,
        html,
        text,
        templateType,
        customerName: booking.customerName || 'Customer',
        bookingId: booking.id,
        attachments: pdfAttachment ? [pdfAttachment] : undefined,
      });

      if (result.success) {
        setEmailActionFeedback(
          isAdvanceDepositReceipt
            ? `✓ Booking confirmation email & official deposit receipt PDF sent to ${targetEmail.trim()}!`
            : `✓ Official ${type === 'invoice' ? 'Invoice' : 'Receipt'} PDF & email sent to ${targetEmail.trim()}!`
        );
      } else {
        console.warn('API send failed, launching mailto fallback:', result.error);
        const mailtoUrl = `mailto:${encodeURIComponent(targetEmail.trim())}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(text)}`;
        window.location.href = mailtoUrl;
        setEmailActionFeedback('✓ Mail client opened with prefilled receipt!');
      }
    } catch (err) {
      console.error('Error sending receipt email:', err);
      const title = type === 'invoice' ? 'Tax Invoice' : 'Official Receipt';
      const docRef = getBookingDocRef(booking, type, bookings);
      const subject = `${title} from NENDOA STUDIO ENTERPRISE ${docRef}`.trim();
      const body = generateBookingReceiptSummaryText(booking, type);
      const mailtoUrl = `mailto:${encodeURIComponent(targetEmail.trim())}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
      window.location.href = mailtoUrl;
      setEmailActionFeedback('✓ Mail client opened with prefilled receipt!');
    } finally {
      setIsSendingEmail(false);
      setTimeout(() => setEmailActionFeedback(null), 6000);
    }
  };

  const handleSendWhatsAppReceipt = (booking: Booking, type: 'receipt' | 'invoice' = 'receipt', overridePhone?: string) => {
    const phone = overridePhone || modalPhoneInput || booking.customerPhone || '';
    const cleanPhone = phone.replace(/[^0-9]/g, '');
    const text = generateBookingReceiptSummaryText(booking, type);
    const waUrl = cleanPhone 
      ? `https://api.whatsapp.com/send?phone=${cleanPhone.startsWith('60') ? cleanPhone : cleanPhone.startsWith('0') ? '6' + cleanPhone : cleanPhone}&text=${encodeURIComponent(text)}`
      : `https://api.whatsapp.com/send?text=${encodeURIComponent(text)}`;
    window.open(waUrl, '_blank');
    setEmailActionFeedback('✓ WhatsApp opened with prefilled receipt!');
    setTimeout(() => setEmailActionFeedback(null), 4000);
  };

  const handleCopyReceiptText = async (booking: Booking, type: 'receipt' | 'invoice' = 'receipt') => {
    const text = generateBookingReceiptSummaryText(booking, type);
    try {
      await navigator.clipboard.writeText(text);
      setIsCopied(true);
      setEmailActionFeedback('✓ Receipt text copied to clipboard!');
      setTimeout(() => {
        setIsCopied(false);
        setEmailActionFeedback(null);
      }, 3500);
    } catch {
      setEmailActionFeedback('Unable to copy automatically');
    }
  };

  const generateBookingDocument = (type: 'receipt' | 'invoice', booking: Booking) => {
    const printWindow = window.open('', '_blank');
    if (!printWindow) return;
    const doc = getBookingDocDetails(booking, type);
    const docTitle = doc.isInvoice ? 'Tax Invoice' : 'Official Receipt';
    const customer = booking.customerName || 'Walk-in Customer';

    const content = `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8"/>
  <title>${docTitle} - ${doc.docRef}</title>
  <style>
    @page { size: portrait; margin: 15mm; }
    body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; color: #2D241E; margin: 0; padding: 20px; font-size: 13px; line-height: 1.5; }
    .header { text-align: center; border-bottom: 1.5px dashed #D9D1C7; padding-bottom: 16px; margin-bottom: 20px; }
    .title { font-size: 24px; font-weight: 900; text-transform: uppercase; letter-spacing: 1.5px; margin: 0 0 6px 0; color: #2D241E; }
    .studio { font-size: 11px; font-weight: 800; text-transform: uppercase; letter-spacing: 3px; margin: 4px 0; }
    .ssm { font-size: 9.5px; color: #8C8379; margin: 0; }
    .address { font-size: 9px; color: #8C8379; text-transform: uppercase; margin-top: 4px; }
    .meta-table { width: 100%; border-collapse: collapse; margin-bottom: 24px; }
    .meta-box h4 { font-size: 8.5px; text-transform: uppercase; letter-spacing: 1px; color: #8C8379; margin: 0 0 4px 0; }
    .meta-box p { font-size: 14px; font-weight: bold; margin: 0; }
    .item-table { width: 100%; border-collapse: collapse; margin-bottom: 24px; }
    .item-table th { border-top: 1px solid #D9D1C7; border-bottom: 1px solid #D9D1C7; padding: 10px 4px; text-align: left; font-size: 9.5px; text-transform: uppercase; color: #8C8379; }
    .item-table td { padding: 12px 4px; border-bottom: 1px solid #E6E1DA; }
    .total-section { float: right; width: 280px; margin-top: 8px; }
    .total-row { display: flex; justify-content: space-between; padding: 4px 0; font-size: 12px; }
    .total-final { border-top: 1.5px solid #D9D1C7; padding-top: 10px; margin-top: 6px; font-weight: 900; font-size: 18px; color: #2D241E; }
    .footer { clear: both; margin-top: 50px; text-align: center; font-size: 9.5px; color: #8C8379; border-top: 1.5px dashed #D9D1C7; padding-top: 18px; }
  </style>
</head>
<body>
  <div class="header">
    <div class="title">${docTitle}</div>
    <div class="studio">NENDOA STUDIO ENTERPRISE</div>
    <div class="ssm">SSM Reg No: 202403185935 (PG0558602-T)</div>
    <div class="address">214, Lebuh Victoria, 10300 Georgetown, Pulau Pinang</div>
  </div>
  <table class="meta-table">
    <tr>
      <td class="meta-box" style="width: 55%; vertical-align: top;">
        <h4>${doc.isInvoice ? 'BILL TO / CUSTOMER' : 'SOLD TO / CUSTOMER'}</h4>
        <p>${customer}</p>
        ${booking.customerEmail ? `<div style="font-size: 10px; color: #8C8379;">${booking.customerEmail}</div>` : ''}
        ${booking.customerPhone ? `<div style="font-size: 10px; color: #8C8379;">${booking.customerPhone}</div>` : ''}
      </td>
      <td class="meta-box" style="width: 45%; vertical-align: top; text-align: right;">
        <h4>${doc.isInvoice ? 'TAX INVOICE REF' : 'OFFICIAL RECEIPT REF'}</h4>
        <p style="font-family: monospace; font-size: 13px;">${doc.docRef}</p>
        <h4 style="margin-top: 8px;">DATE & TIME</h4>
        <div style="font-size: 11px; font-weight: 600;">${doc.dateStr}</div>
      </td>
    </tr>
  </table>
  <table class="item-table">
    <thead>
      <tr>
        <th>Item / Description</th>
        <th style="text-align: center; width: 45px;">Qty</th>
        <th style="text-align: right; width: 90px;">Unit Price (RM)</th>
        <th style="text-align: right; width: 100px;">Total (MYR)</th>
      </tr>
    </thead>
    <tbody>
      ${doc.items.map(row => `
        <tr>
          <td><strong>${row.name}</strong></td>
          <td style="text-align: center; font-family: monospace;">${row.qty}</td>
          <td style="text-align: right; font-family: monospace; color: #8C8379;">${row.unitPrice < 0 ? `-RM ${Math.abs(row.unitPrice).toFixed(2)}` : `RM ${row.unitPrice.toFixed(2)}`}</td>
          <td style="text-align: right; font-weight: bold; font-family: monospace;">${row.total < 0 ? `-RM ${Math.abs(row.total).toFixed(2)}` : `RM ${row.total.toFixed(2)}`}</td>
        </tr>
      `).join('')}
    </tbody>
  </table>
  <div class="total-section">
    <div class="total-row">
      <span style="color: #8C8379;">Subtotal</span>
      <span style="font-family: monospace; font-weight: 600;">RM ${doc.subtotal.toFixed(2)}</span>
    </div>
    ${doc.deposit > 0 ? `
      <div class="total-row" style="color: #059669;">
        <span>Minus Deposit</span>
        <span style="font-family: monospace; font-weight: 600;">-RM ${doc.deposit.toFixed(2)}</span>
      </div>
    ` : ''}
    <div class="total-row total-final">
      <span style="font-size: 11px; text-transform: uppercase; letter-spacing: 1px;">${doc.isInvoice ? 'TOTAL DUE' : 'GRAND TOTAL PAID'}</span>
      <span style="font-family: monospace;">RM ${doc.totalDueOrPaid.toFixed(2)}</span>
    </div>
  </div>
  <div class="footer">
    <p style="margin: 0 0 4px 0;">Email: hello@nendoastudio.com | WhatsApp: +60 12-889 2030</p>
    <p style="margin: 0 0 4px 0;">Thank you for supporting handcrafted ceramic pottery.</p>
    <p style="margin: 0; font-weight: bold; text-transform: uppercase; letter-spacing: 0.5px;">NENDOA STUDIO ENTERPRISE • Computer Generated ${docTitle}</p>
  </div>
</body>
</html>`;

    printWindow.document.open();
    printWindow.document.write(content);
    printWindow.document.close();
    setTimeout(() => {
      printWindow.focus();
      printWindow.print();
    }, 300);
  };

  const handleAddBooking = async (e: React.FormEvent) => {
    e.preventDefault();
    const workshop = workshops.find(w => w.id === formData.workshopId);
    if (!workshop) return;

    setIsSubmittingBooking(true);

    try {
      const totalPrice = workshop.totalPrice * formData.pax;
      const depositAmount = formData.depositPaid ? (Number(formData.depositAmount) || 0) : 0;
      const isDepositPaid = Boolean(formData.depositPaid && depositAmount > 0);

      const newBooking = {
        ...formData,
        workshopName: workshop.name,
        totalPrice,
        depositAmount,
        depositPaid: isDepositPaid,
        status: isDepositPaid ? 'confirmed' : 'pending',
      };

      const bookingRef = await addDoc(collection(db, 'bookings'), newBooking);

      if (isDepositPaid) {
        // Record transaction
        const txDate = formData.recordingDate 
          ? new Date(formData.recordingDate).toISOString() 
          : new Date().toISOString();

        await addDoc(collection(db, 'transactions'), {
          type: 'deposit',
          amount: depositAmount,
          timestamp: txDate,
          description: `Deposit for ${workshop.name} (${formData.pax} pax)`,
          relatedId: bookingRef.id,
          customerName: formData.customerName,
          customerPhone: formData.customerPhone,
          location: formData.location,
          staffName: formData.staffName || ''
        } as Transaction);
      }

      const createdBookingWithId: Booking = { id: bookingRef.id, ...newBooking };
      const docRef = getBookingDocRef(createdBookingWithId, isDepositPaid ? 'receipt' : 'invoice', bookings);

      // Automated Booking Confirmation Email Dispatch
      // Sends confirmation email together with official receipt PDF if deposit was paid
      let emailFeedbackMsg = '';
      if (autoSendConfirmationEmail && formData.customerEmail?.trim()) {
        try {
          let attachments: any[] | undefined = undefined;

          if (isDepositPaid) {
            try {
              const pdfBase64 = generateBookingReceiptPdfBase64(createdBookingWithId, 'receipt', docRef, bookings);
              const filename = `Official-Receipt-${docRef.replace(/[^A-Za-z0-9-_]/g, '')}.pdf`;
              attachments = [
                {
                  filename,
                  content: pdfBase64,
                  contentType: 'application/pdf',
                },
              ];
            } catch (pdfErr) {
              console.warn('Could not generate deposit receipt PDF attachment:', pdfErr);
            }
          }

          const { subject, html, text } = generateBookingConfirmationEmail({
            customerName: formData.customerName,
            customerEmail: formData.customerEmail.trim(),
            customerPhone: formData.customerPhone,
            workshopName: workshop.name,
            bookingDate: formData.date,
            bookingTime: formData.time,
            location: formData.location,
            pax: formData.pax,
            depositAmount,
            totalPrice,
            depositPaid: isDepositPaid,
            notes: formData.notes,
            bookingId: docRef,
          });

          const result = await sendBusinessEmail({
            to: formData.customerEmail.trim(),
            subject,
            html,
            text,
            templateType: 'booking_confirmation',
            customerName: formData.customerName,
            bookingId: bookingRef.id,
            attachments,
          });

          if (result.success) {
            emailFeedbackMsg = isDepositPaid
              ? `✓ Booking confirmation email & official deposit receipt PDF dispatched to ${formData.customerEmail.trim()}!`
              : `✓ Booking confirmation email dispatched to ${formData.customerEmail.trim()}!`;
          } else {
            console.warn('Auto email dispatch warning:', result.error);
            emailFeedbackMsg = `Booking created. Note: Email auto-dispatch: ${result.error || 'Check SMTP'}`;
          }
        } catch (emailErr: any) {
          console.warn('Error during auto-email dispatch:', emailErr);
          emailFeedbackMsg = `Booking created. (Email dispatch error: ${emailErr.message || 'failed'})`;
        }
      }

      setIsAdding(false);
      setFormData({
        workshopId: '', workshopName: '', customerName: '', customerPhone: '', customerEmail: '',
        date: new Date().toISOString().split('T')[0], time: '10:00', status: 'pending', depositPaid: false,
        balancePaid: false, totalPrice: 0, depositAmount: 0, pax: 1, notes: '',
        location: branch === 'ALL' ? 'PG' : branch as any, staffName: '', recordingDate: ''
      });

      if (emailFeedbackMsg) {
        setDownloadNotice(emailFeedbackMsg);
        setTimeout(() => setDownloadNotice(null), 6000);
      }

      // Automatically open Document Preview & Email Dispatch Hub (matches Product Sales POS)
      openDocumentPreview(createdBookingWithId, isDepositPaid ? 'receipt' : 'invoice');
      if (emailFeedbackMsg) {
        setEmailActionFeedback(emailFeedbackMsg);
      }
    } catch (error) {
      handleFirestoreError(error, OperationType.WRITE, 'bookings');
    } finally {
      setIsSubmittingBooking(false);
    }
  };

  const markDepositPaid = async (booking: Booking) => {
    try {
      const txDate = booking.recordingDate 
        ? new Date(booking.recordingDate).toISOString() 
        : new Date().toISOString();

      await updateDoc(doc(db, 'bookings', booking.id!), {
        depositPaid: true,
        status: 'confirmed'
      });

      await addDoc(collection(db, 'transactions'), {
        type: 'deposit',
        amount: booking.depositAmount,
        timestamp: txDate,
        description: `Deposit for ${booking.workshopName} (${booking.pax || 1} pax)`,
        relatedId: booking.id,
        customerName: booking.customerName,
        customerPhone: booking.customerPhone,
        location: booking.location
      } as Transaction);

      const updatedBooking: Booking = { ...booking, depositPaid: true, status: 'confirmed' };
      openDocumentPreview(updatedBooking, 'receipt');
    } catch (error) {
      handleFirestoreError(error, OperationType.UPDATE, `bookings/${booking.id}`);
    }
  };


  const markBalancePaid = async (booking: Booking, config?: { includeDelivery: boolean; deliveryAmount: number; drinksDiscountCount: number; settlementDate?: string; paymentLater?: boolean }) => {
    try {
      const workshop = workshops.find(w => w.id === booking.workshopId);
      const isVariable = workshop?.isVariablePrice ?? false;
      
      const selected = selectedPiecesForBooking[booking.id!] || [];
      let paintingTotal = 0;
      let piecesCount = 0;
      let description = '';

      if (isVariable) {
        paintingTotal = selected.reduce((sum, p) => sum + ((Number(p.price) || 0) * (Number(p.quantity) || 0)), 0);
        piecesCount = selected.reduce((sum, p) => sum + (Number(p.quantity) || 0), 0);
      } else {
        paintingTotal = colourPaintingQty * colourPaintingRate;
        piecesCount = colourPaintingQty;
      }

      let finalAmount = 0;
      const depositToDeduct = (booking.depositPaid ? (booking.depositAmount || 0) : 0);

      const deliveryFee = config?.includeDelivery ? (Number(config.deliveryAmount) || 0) : 0;
      const discountCount = config?.drinksDiscountCount ?? 0;
      const discountAmount = discountCount * 10;
      const discountLabel = 'Drinks Discount';

      if (isVariable) {
        finalAmount = Math.max(0, paintingTotal - depositToDeduct) + deliveryFee - discountAmount;
        const piecesDesc = selected.map(p => `${p.quantity}x ${p.name}`).join(', ');
        description = `Ceramic Painting: ${piecesDesc || 'No pieces selected'}${deliveryFee > 0 ? ` + Delivery RM${deliveryFee}` : ''}${discountAmount > 0 ? ` - ${discountLabel}${discountCount > 1 ? ` (x${discountCount})` : ''} RM${discountAmount}` : ''}`;
      } else {
        const workshopBalance = Math.max(0, (booking.totalPrice || 0) - depositToDeduct);
        finalAmount = workshopBalance + paintingTotal + deliveryFee - discountAmount;
        const piecesDesc = colourPaintingQty > 0 ? ` + Color Painting (${colourPaintingQty} pieces)` : '';
        const deliveryDesc = deliveryFee > 0 ? ` + Delivery RM${deliveryFee}` : '';
        const discountDesc = discountAmount > 0 ? ` - ${discountLabel}${discountCount > 1 ? ` (x${discountCount})` : ''} RM${discountAmount}` : '';
        description = `Settlement for ${booking.workshopName} (${booking.pax || 1} pax)${piecesDesc}${deliveryDesc}${discountDesc}`;
      }

      const bookingRef = doc(db, 'bookings', booking.id!);
      const isLater = config?.paymentLater || false;

      const updates: any = {
        balancePaid: !isLater,
        paymentLater: isLater,
        status: isLater ? 'confirmed' : 'settled',
        paintingPieces: piecesCount,
        paintingPrice: isVariable ? 0 : paintingTotal,
        totalPrice: isVariable ? paintingTotal : (booking.totalPrice || 0),
        drinksDiscountCount: discountCount,
        selectedItems: isVariable ? selected.map(p => ({ name: p.name, quantity: p.quantity, price: p.price })) : []
      };

      if (config?.settlementDate) {
        updates.settlementDate = config.settlementDate;
      }

      if (config?.includeDelivery) {
        updates.collectionMethod = 'delivery';
        updates.deliveryFee = deliveryFee;
      }

      await updateDoc(bookingRef, updates);

      if (isVariable) {
        // Stock deduction only for ceramic painting pieces
        for (const piece of selected) {
          const prodRef = doc(db, 'products', piece.productId);
          const prod = inventoryBases.find(p => p.id === piece.productId);
          if (prod) {
            await updateDoc(prodRef, {
              stock: Math.max(0, prod.stock - piece.quantity)
            });
          }
        }
      }

      if (!isLater) {
        const txDate = config?.settlementDate
          ? new Date(config.settlementDate).toISOString()
          : (booking.recordingDate 
              ? new Date(booking.recordingDate).toISOString() 
              : new Date().toISOString());

        await addDoc(collection(db, 'transactions'), {
          type: 'balance',
          amount: Number(finalAmount) || 0,
          timestamp: txDate,
          description: description,
          relatedId: booking.id,
          customerName: booking.customerName,
          customerPhone: booking.customerPhone,
          location: booking.location,
          staffName: booking.staffName || '',
          commissionRate: booking.location === 'PG' ? 3.5 : (booking.commissionRate || 1)
        } as Transaction);
      }

      // Automatically trigger Document Preview & Email Dispatch Hub (matches POS.tsx)
      const finalizedBooking: Booking = {
        ...booking,
        ...updates,
      };
      openDocumentPreview(finalizedBooking, isLater ? 'invoice' : 'receipt');

    } catch (error) {
      handleFirestoreError(error, OperationType.UPDATE, `bookings/${booking.id}`);
    }
  };

  const handleMarkPaymentLaterAsPaid = async (booking: Booking, customPaidDate?: string) => {
    try {
      const depositToDeduct = (booking.depositPaid ? (booking.depositAmount || 0) : 0);
      const deliveryFee = booking.deliveryFee || 0;
      
      const isVariable = booking.selectedItems && booking.selectedItems.length > 0;
      let paintingTotal = 0;
      
      if (isVariable) {
        paintingTotal = (booking.selectedItems || []).reduce((sum, p) => sum + ((Number(p.price) || 0) * (Number(p.quantity) || 0)), 0);
      } else {
        paintingTotal = booking.paintingPrice || 0;
      }

      let finalAmount = 0;
      let description = '';
      const discountCount = booking.drinksDiscountCount ?? 0;
      const discountAmount = discountCount * 10;
      const discountLabel = 'Drinks Discount';

      if (isVariable) {
        finalAmount = Math.max(0, paintingTotal - depositToDeduct) + deliveryFee - discountAmount;
        const piecesDesc = (booking.selectedItems || []).map(p => `${p.quantity}x ${p.name}`).join(', ');
        description = `Ceramic Painting: ${piecesDesc || 'No pieces selected'}${deliveryFee > 0 ? ` + Delivery RM${deliveryFee}` : ''}${discountAmount > 0 ? ` - ${discountLabel}${discountCount > 1 ? ` (x${discountCount})` : ''} RM${discountAmount}` : ''}`;
      } else {
        const workshopBalance = Math.max(0, (booking.totalPrice || 0) - depositToDeduct);
        finalAmount = workshopBalance + paintingTotal + deliveryFee - discountAmount;
        const piecesDesc = (booking.paintingPieces || 0) > 0 ? ` + Color Painting (${booking.paintingPieces} pieces)` : '';
        const deliveryDesc = deliveryFee > 0 ? ` + Delivery RM${deliveryFee}` : '';
        const discountDesc = discountAmount > 0 ? ` - ${discountLabel}${discountCount > 1 ? ` (x${discountCount})` : ''} RM${discountAmount}` : '';
        description = `Settlement for ${booking.workshopName} (${booking.pax || 1} pax)${piecesDesc}${deliveryDesc}${discountDesc}`;
      }

      const bookingRef = doc(db, 'bookings', booking.id!);
      const settlementDate = booking.settlementDate || new Date().toISOString().split('T')[0];
      await updateDoc(bookingRef, {
        balancePaid: true,
        status: 'settled',
        paymentLater: false,
        settlementDate: settlementDate
      });

      const txDate = customPaidDate
        ? new Date(customPaidDate).toISOString()
        : (booking.settlementDate 
            ? new Date(booking.settlementDate).toISOString() 
            : (booking.recordingDate 
                ? new Date(booking.recordingDate).toISOString() 
                : new Date().toISOString()));

      await addDoc(collection(db, 'transactions'), {
        type: 'balance',
        amount: Number(finalAmount) || 0,
        timestamp: txDate,
        description: description,
        relatedId: booking.id,
        customerName: booking.customerName,
        customerPhone: booking.customerPhone,
        location: booking.location,
        staffName: booking.staffName || '',
        commissionRate: booking.location === 'PG' ? 3.5 : (booking.commissionRate || 1)
      } as Transaction);

      // Automatically trigger Document Preview & Email Dispatch Hub (matches POS.tsx)
      const settledBooking: Booking = {
        ...booking,
        balancePaid: true,
        paymentLater: false,
        status: 'settled',
        settlementDate
      };
      openDocumentPreview(settledBooking, 'receipt');

    } catch (error) {
      handleFirestoreError(error, OperationType.UPDATE, `bookings/${booking.id}`);
    }
  };

  const addPieceToBooking = (bookingId: string, product: Product) => {
    setSelectedPiecesForBooking(prev => {
      const current = prev[bookingId] || [];
      const existing = current.find(p => p.productId === product.id);
      if (existing) {
        return {
          ...prev,
          [bookingId]: current.map(p => p.productId === product.id ? { ...p, quantity: p.quantity + 1 } : p)
        };
      }
      return {
        ...prev,
        [bookingId]: [...current, { productId: product.id!, name: product.name, price: product.price, quantity: 1 }]
      };
    });
  };

  const removePieceFromBooking = (bookingId: string, productId: string) => {
    setSelectedPiecesForBooking(prev => {
      const current = prev[bookingId] || [];
      return {
        ...prev,
        [bookingId]: current.filter(p => p.productId !== productId)
      };
    });
  };

  const updateCollectionStatus = async (bookingId: string, updates: Partial<Booking>) => {
    try {
      await updateDoc(doc(db, 'bookings', bookingId), updates);
    } catch (error) {
      handleFirestoreError(error, OperationType.UPDATE, `bookings/${bookingId}`);
    }
  };

  const handleRevertToActiveSession = async (booking: Booking) => {
    try {
      const isVariable = booking.selectedItems && booking.selectedItems.length > 0;
      if (isVariable && booking.selectedItems) {
        for (const item of booking.selectedItems) {
          const prod = inventoryBases.find(p => p.name === item.name);
          if (prod) {
            const prodRef = doc(db, 'products', prod.id);
            await updateDoc(prodRef, {
              stock: prod.stock + (Number(item.quantity) || 0)
            });
          }
        }
      }

      const bookingRef = doc(db, 'bookings', booking.id!);
      await updateDoc(bookingRef, {
        balancePaid: false,
        paymentLater: false,
        status: booking.depositPaid ? 'confirmed' : 'pending',
        settlementDate: ''
      });

      // Remove balance settlement transactions
      const q = query(
        collection(db, 'transactions'), 
        where('relatedId', '==', booking.id), 
        where('type', '==', 'balance')
      );
      const snapshot = await getDocs(q);
      for (const docSnap of snapshot.docs) {
        await deleteDoc(doc(db, 'transactions', docSnap.id));
      }
    } catch (error) {
      handleFirestoreError(error, OperationType.UPDATE, `bookings/${booking.id}`);
    }
  };

  const handleRevertToPendingCollection = async (booking: Booking) => {
    try {
      const bookingRef = doc(db, 'bookings', booking.id!);
      await updateDoc(bookingRef, {
        isCollected: false,
        status: 'settled',
        readyForCollection: true
      });
    } catch (error) {
      handleFirestoreError(error, OperationType.UPDATE, `bookings/${booking.id}`);
    }
  };

  const handleSaveEditBooking = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingBooking || !editingBooking.id) return;
    try {
      await updateDoc(doc(db, 'bookings', editingBooking.id), {
        date: editDateValue,
        time: editTimeValue || ''
      });
      setEditingBooking(null);
    } catch (error) {
      handleFirestoreError(error, OperationType.UPDATE, `bookings/${editingBooking.id}`);
    }
  };

  const handlePiecePhotoUpload = async (bookingId: string, pieceId: string, file: File) => {
    if (!file) return;
    try {
      const booking = bookings.find(b => b.id === bookingId);
      if (!booking) return;

      // Compress image client-side first
      const compressedFile = await compressImage(file);

      const storageRef = ref(storage, `bookings/${bookingId}/pieces/${pieceId}_${compressedFile.name}`);
      const snapshot = await uploadBytes(storageRef, compressedFile);
      const downloadURL = await getDownloadURL(snapshot.ref);

      const pieces = booking.finishedPieces || [];
      const updatedPieces = pieces.map(p => p.id === pieceId ? { ...p, photoUrl: downloadURL } : p);
      
      await updateDoc(doc(db, 'bookings', bookingId), {
        finishedPieces: updatedPieces
      });
    } catch (error) {
      handleFirestoreError(error, OperationType.UPDATE, `bookings/${bookingId}/pieces/${pieceId}/photo`);
    }
  };

  const addFinishedPiece = async (bookingId: string) => {
    try {
      const booking = bookings.find(b => b.id === bookingId);
      if (!booking) return;

      const newPiece = {
        id: crypto.randomUUID(),
        photoUrl: '',
        remarks: '',
        createdAt: new Date().toISOString()
      };

      await updateDoc(doc(db, 'bookings', bookingId), {
        finishedPieces: [...(booking.finishedPieces || []), newPiece]
      });
    } catch (error) {
      handleFirestoreError(error, OperationType.UPDATE, `bookings/${bookingId}/add-piece`);
    }
  };

  const removeFinishedPiece = async (bookingId: string, pieceId: string) => {
    try {
      const booking = bookings.find(b => b.id === bookingId);
      if (!booking) return;

      await updateDoc(doc(db, 'bookings', bookingId), {
        finishedPieces: (booking.finishedPieces || []).filter(p => p.id !== pieceId)
      });
    } catch (error) {
      handleFirestoreError(error, OperationType.UPDATE, `bookings/${bookingId}/remove-piece`);
    }
  };

  const updatePieceRemarks = async (bookingId: string, pieceId: string, remarks: string) => {
    try {
      const booking = bookings.find(b => b.id === bookingId);
      if (!booking) return;

      const updatedPieces = (booking.finishedPieces || []).map(p => 
        p.id === pieceId ? { ...p, remarks } : p
      );

      await updateDoc(doc(db, 'bookings', bookingId), {
        finishedPieces: updatedPieces
      });
    } catch (error) {
      handleFirestoreError(error, OperationType.UPDATE, `bookings/${bookingId}/update-piece-remarks`);
    }
  };

  const handleInstructionsImageUpload = async (bookingId: string, file: File) => {
    if (!file) return;
    try {
      // Compress image client-side first
      const compressedFile = await compressImage(file);

      const storageRef = ref(storage, `bookings/${bookingId}/instructions_${compressedFile.name}`);
      const snapshot = await uploadBytes(storageRef, compressedFile);
      const downloadURL = await getDownloadURL(snapshot.ref);
      
      await updateDoc(doc(db, 'bookings', bookingId), {
        paintingInstructionsImage: downloadURL
      });
    } catch (error) {
      handleFirestoreError(error, OperationType.UPDATE, `bookings/${bookingId}/instructions-photo`);
    }
  };

  const filteredBookings = bookings.filter(b => 
    (b.customerName.toLowerCase().includes(search.toLowerCase()) ||
    b.workshopName.toLowerCase().includes(search.toLowerCase())) &&
    b.status !== 'deleted'
  );

  const activeBookings = filteredBookings.filter(b => !b.isCollected);
  const completedBookings = filteredBookings.filter(b => b.isCollected);

  const [showAll, setShowAll] = useState(false);

  const [showAllFinalized, setShowAllFinalized] = useState(false);
  const [selectedMonth, setSelectedMonth] = useState<string>(format(new Date(), 'yyyy-MM'));

  const availableMonths = Array.from(new Set([
    format(new Date(), 'yyyy-MM'),
    ...bookings.map(b => {
      // Format YYYY-MM
      try {
        const d = new Date(b.date);
        return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
      } catch (e) {
        return null;
      }
    })
  ])).filter(Boolean).sort().reverse() as string[];

  const currentBookings = filteredBookings.filter(b => {
    const workshop = workshops.find(w => w.id === b.workshopId);
    const dateMatch = selectedMonth === 'ALL' || b.date.startsWith(selectedMonth);
    const typeMatch = filterType === 'all' || 
                    (filterType === 'ceramic' ? workshop?.isVariablePrice : !workshop?.isVariablePrice);
    return dateMatch && typeMatch;
  });

  const activePendingSettlement = currentBookings.filter(b => !b.isCollected && !b.balancePaid && b.status !== 'refunded' && b.status !== 'cancelled');
  const pendingCollection = currentBookings.filter(b => !b.isCollected && b.balancePaid && b.status !== 'refunded' && b.status !== 'cancelled');
  const historyCurrent = currentBookings.filter(b => b.isCollected || b.status === 'refunded' || b.status === 'cancelled');
  const [deleteConfirm, setDeleteConfirm] = useState<{ isOpen: boolean; id: string | null }>({ isOpen: false, id: null });
  const [revertSessionConfirm, setRevertSessionConfirm] = useState<{ isOpen: boolean; booking: Booking | null }>({ isOpen: false, booking: null });
  const [revertHandoverConfirm, setRevertHandoverConfirm] = useState<{ isOpen: boolean; booking: Booking | null }>({ isOpen: false, booking: null });
  const [refundTarget, setRefundTarget] = useState<Booking | null>(null);
  const [refundData, setRefundData] = useState({ amount: 0, reason: '' });

  const handleRefund = async () => {
    if (!refundTarget) return;
    try {
      await updateDoc(doc(db, 'bookings', refundTarget.id!), {
        status: 'refunded',
        isCollected: true,
        notes: (refundTarget.notes || '') + `\n[REFUND RM${refundData.amount} - ${refundData.reason}]`
      });

      await addDoc(collection(db, 'transactions'), {
        type: 'refund',
        amount: Number(refundData.amount),
        timestamp: new Date().toISOString(),
        description: `Refund for ${refundTarget.workshopName}${refundData.reason ? `: ${refundData.reason}` : ''}`,
        relatedId: refundTarget.id,
        customerName: refundTarget.customerName,
        customerPhone: refundTarget.customerPhone,
        location: refundTarget.location
      } as Transaction);

      setRefundTarget(null);
      setRefundData({ amount: 0, reason: '' });
    } catch (error) {
      handleFirestoreError(error, OperationType.UPDATE, `bookings/${refundTarget.id}`);
    }
  };

  const availableWorkshops = workshops;

  const deleteBooking = async (id: string) => {
    try {
      // Find and delete all transactions related to this booking
      const q = query(collection(db, 'transactions'), where('relatedId', '==', id));
      const snapshot = await getDocs(q);
      
      const deletePromises = snapshot.docs.map(tDoc => deleteDoc(doc(db, 'transactions', tDoc.id)));
      await Promise.all(deletePromises);

      // Finally delete the booking
      await deleteDoc(doc(db, 'bookings', id));
    } catch (error) {
      console.error('Failed to delete booking and its transactions:', error);
      handleFirestoreError(error, OperationType.DELETE, `bookings/${id}`);
    }
  };

  const renderPendingCollectionGrid = (items: Booking[], title: string) => (
    <div className="space-y-4">
      <div className="px-6 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="w-1.5 h-1.5 rounded-full bg-blue-500" />
          <h3 className="text-[10px] font-black uppercase tracking-[0.2em] text-[#8C8379]">{title}</h3>
        </div>
        <span className="text-[9px] font-black uppercase text-[#A69D94]">{items.length} records</span>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-6">
        {items.map((booking) => (
          <div key={booking.id} className="bg-white rounded-[32px] border border-[#D9D1C7] shadow-sm overflow-hidden flex flex-col hover:shadow-md transition-shadow">
            {/* Header: Customer Info */}
            <div className="p-5 bg-[#FAF9F6] border-b border-[#F2EFE9] flex justify-between items-start">
              <div className="space-y-1">
                <div className="flex items-center gap-2">
                  <h4 className="font-serif italic font-bold text-[#2D241E] text-base leading-tight">{booking.customerName}</h4>
                  <button 
                    onClick={() => setDeleteConfirm({ isOpen: true, id: booking.id! })}
                    className="p-1 text-[#D9D1C7] hover:text-red-500 hover:bg-red-50 rounded-full transition-all"
                    title="Delete Booking"
                  >
                    <Trash2 size={13} />
                  </button>
                </div>
                <div className="flex items-center gap-2 text-[#8C8379] font-black uppercase text-[9px] tracking-widest">
                  <Phone size={10} className="text-[#8B9A82]" />
                  {booking.customerPhone}
                </div>
              </div>
              <div className="flex flex-col items-end gap-1">
                  <span className="text-[8px] font-black uppercase px-2 py-0.5 rounded bg-white border border-[#D9D1C7]/20 text-[#8C8379]">
                     {booking.workshopName}
                  </span>
                  <span className={`text-[8px] font-black uppercase tracking-tighter ${booking.location === 'PG' ? 'text-blue-500' : 'text-amber-600'}`}>
                     {booking.location} Branch
                  </span>
              </div>
            </div>

            {/* Session / Workshop Dates */}
            <div className="px-5 py-2.5 bg-amber-50/10 border-b border-[#F2EFE9] flex items-center gap-2 text-[10px]">
              <div className="flex items-center gap-1.5 font-bold text-amber-800">
                <Calendar size={11} className="text-[#8B9A82]" />
                <span>Workshop Day: {booking.settlementDate ? booking.settlementDate.split('-').reverse().join('/') : (booking.date ? booking.date.split('-').reverse().join('/') : '---')}</span>
              </div>
            </div>

            {/* Pieces Gallery */}
            <div className="p-5 flex-1 bg-white">
              <div className="flex items-center justify-between mb-3">
                 <h5 className="text-[10px] font-black uppercase text-[#8C8379] tracking-widest">Ceramic Pieces ({booking.finishedPieces?.length || 0})</h5>
                 <button 
                   onClick={() => setActivePiecesId(booking.id!)}
                   className="p-1.5 hover:bg-[#F2EFE9] rounded-lg text-[#8C8379] transition-colors"
                   title="Manage Pieces"
                 >
                   <Plus size={14} />
                 </button>
              </div>
              
              <div className="grid grid-cols-2 gap-3 max-h-48 overflow-y-auto custom-scrollbar pr-1">
                {booking.finishedPieces?.map((piece) => (
                  <div 
                    key={piece.id} 
                    className="group relative rounded-2xl overflow-hidden aspect-square border border-[#F2EFE9] bg-[#FAF9F6] cursor-pointer"
                    onClick={() => setActivePiecesId(booking.id!)}
                  >
                    {piece.photoUrl ? (
                      <img src={piece.photoUrl} className="w-full h-full object-cover" referrerPolicy="no-referrer" />
                    ) : (
                      <div className="w-full h-full flex items-center justify-center text-[#D9D1C7]">
                        <ImageIcon size={16} />
                      </div>
                    )}
                    {piece.remarks && (
                      <div className="absolute inset-0 bg-black/60 opacity-0 group-hover:opacity-100 transition-opacity p-2 flex items-center justify-center text-center">
                         <p className="text-[8px] text-white font-medium leading-tight line-clamp-4">{piece.remarks}</p>
                      </div>
                    )}
                  </div>
                ))}
                {(!booking.finishedPieces || booking.finishedPieces.length === 0) && (
                  <div className="col-span-2 py-8 text-center bg-[#FAF9F6]/50 rounded-2xl border border-dashed border-[#D9D1C7]/30">
                     <p className="text-[9px] font-black uppercase text-[#D9D1C7]">Pending piece recording</p>
                  </div>
                )}
              </div>
            </div>

            {/* Footer: Collection Management */}
            <div className="p-5 bg-[#F2EFE9]/30 border-t border-[#F2EFE9]">
              <div className="flex flex-col gap-3">
                <div className="flex items-center justify-between">
                   <span className="text-[9px] font-black uppercase text-[#A69D94] tracking-widest">Collection Method</span>
                   {booking.collectionMethod === 'delivery' && (
                     <div className="flex items-center gap-1 text-blue-500 font-black text-[8px] uppercase">
                       <Truck size={10} /> DeliveryRM{booking.deliveryFee?.toFixed(2) || '0.00'}
                     </div>
                   )}
                </div>

                <div className="flex items-center gap-3">
                  {!booking.collectionMethod ? (
                    <div className="flex-1 flex gap-1 p-1 bg-white rounded-xl border border-[#D9D1C7]/30">
                      {[
                        { id: 'bm', label: 'BM' },
                        { id: 'island', label: 'PG' },
                        { id: 'delivery', icon: Truck }
                      ].map(m => (
                        <button 
                          key={m.id}
                          onClick={() => updateCollectionStatus(booking.id!, { collectionMethod: m.id as any, isCollected: false })}
                          className="flex-1 h-8 rounded-lg flex items-center justify-center text-[#8C8379] hover:bg-[#2D241E] hover:text-white transition-all font-black text-[8px]"
                        >
                          {m.label || <m.icon size={12} />}
                        </button>
                      ))}
                    </div>
                  ) : (
                    <div className="flex-1 flex items-center justify-between gap-2">
                      <div className="flex items-center gap-2 px-3 py-1.5 bg-white rounded-xl border border-[#D9D1C7]/30">
                        {booking.collectionMethod === 'delivery' ? <Truck size={12} className="text-blue-500" /> : <MapPin size={12} className="text-[#8B9A82]" />}
                        <span className="text-[10px] font-black uppercase text-[#2D241E] tracking-widest">
                           {booking.collectionMethod === 'bm' ? 'BM Pick-up' : booking.collectionMethod === 'island' ? 'PG Pick-up' : 'Delivery'}
                        </span>
                        {!booking.isCollected && (
                          <button onClick={() => updateCollectionStatus(booking.id!, { collectionMethod: deleteField() as any })} className="ml-1 text-[#8C8379] hover:text-red-500 font-bold transition-colors">×</button>
                        )}
                      </div>
                      <button 
                        onClick={() => updateCollectionStatus(booking.id!, { isCollected: true, status: 'completed', readyForCollection: true })}
                        className="py-2.5 px-4 bg-[#2D241E] text-white rounded-xl text-[10px] font-black uppercase tracking-widest hover:bg-black transition-colors shadow-sm flex-shrink-0"
                      >
                        Hand Over
                      </button>
                    </div>
                  )}
                </div>

                <div className="pt-2 border-t border-[#FAF9F6] flex items-center justify-between gap-2">
                  <button 
                    onClick={() => {
                      setEmailDefaultTemplate('collection_ready');
                      setEmailModalTarget(booking);
                    }}
                    className="text-[9px] font-black uppercase tracking-widest text-[#5B8266] hover:text-[#3D5B46] transition-colors flex items-center gap-1.5 bg-[#5B8266]/10 hover:bg-[#5B8266]/20 px-2.5 py-1.5 rounded-lg border border-[#5B8266]/20"
                    title="Send Ready for Collection Email to Customer"
                  >
                    <Mail size={11} /> Inform via Email
                  </button>
                  <button 
                    onClick={() => setRevertSessionConfirm({ isOpen: true, booking })}
                    className="text-[9px] font-black uppercase tracking-widest text-amber-700 hover:text-amber-950 transition-colors flex items-center gap-1 bg-amber-50/50 hover:bg-amber-100/50 px-2 py-1 rounded"
                  >
                    <Undo2 size={10} /> Revert to Active Session
                  </button>
                </div>
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );

  const renderTable = (items: Booking[], title?: string) => (
    <div className="bg-white rounded-[24px] border border-[#D9D1C7] shadow-sm overflow-hidden flex flex-col">
      {title && (
        <div className="px-5 py-3 bg-[#F2EFE9] border-b border-[#D9D1C7]/50 flex justify-between items-center">
          <h3 className="text-[11px] font-black uppercase tracking-widest text-[#2D241E]">{title}</h3>
          <span className="text-[9px] font-black uppercase px-2 py-0.5 rounded bg-white border border-[#D9D1C7]/20 text-[#8C8379]">
            {items.length} Bookings
          </span>
        </div>
      )}
      <div className="overflow-x-auto">
        <table className="w-full text-left text-sm border-collapse">
          <thead>
            <tr className="bg-[var(--bg-header)] text-[var(--text-header)] uppercase text-[9px] font-black tracking-widest border-b border-[var(--border-app)]">
              <th className="px-4 py-3 sticky left-0 bg-[var(--bg-header)] z-20 shadow-[2px_0_5px_-2px_rgba(0,0,0,0.1)]">Participant</th>
              <th className="px-4 py-3">Experience</th>
              <th className="px-4 py-3 text-center">Pax</th>
              <th className="px-4 py-3">Schedule</th>
              <th className="px-4 py-3">Payments</th>
              <th className="px-4 py-3 text-right">Settlement</th>
              {activeTab !== 'active' && <th className="px-4 py-3">Ceramic Pieces</th>}
              <th className="px-4 py-3">Collection Management</th>
              {activeTab !== 'active' && <th className="px-4 py-3">Status</th>}
              <th className="px-4 py-3 text-right">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-[var(--border-app)]/40">
            {items.slice(0, showAll ? undefined : 20).map((booking) => (
              <tr key={booking.id} className="group hover:bg-[var(--bg-subtle)] transition-colors">
                <td className="px-4 py-2.5 sticky left-0 bg-white group-hover:bg-[var(--bg-subtle)] z-10 transition-colors shadow-[2px_0_5px_-2px_rgba(0,0,0,0.1)]">
                  <div className="font-serif italic font-bold text-[#2D241E] text-sm leading-tight">{booking.customerName}</div>
                  <div className="text-[9px] text-[#A69D94] font-bold uppercase tracking-tighter flex items-center gap-1.5 mt-0.5">
                    <Phone size={9} /> {booking.customerPhone}
                  </div>
                </td>
                <td className="px-4 py-2.5">
                  <div className="text-[11px] font-bold text-[#4A3F35] leading-tight">{booking.workshopName}</div>
                </td>
                <td className="px-4 py-2.5 text-center">
                  <span className="inline-flex items-center justify-center w-6 h-6 rounded-full bg-[#F2EFE9] text-[10px] font-black text-[#2D241E]">
                    {booking.pax}
                  </span>
                </td>
                <td className="px-4 py-2.5 whitespace-nowrap overflow-visible">
                  <div className="flex items-center gap-1.5">
                    <span className="text-[11px] font-bold text-[#4A3F35]">{format(new Date(booking.date), 'dd/MM/yy')}</span>
                    <button 
                      onClick={() => {
                        setEditingBooking(booking);
                        setEditDateValue(booking.date);
                        setEditTimeValue(booking.time || '');
                      }}
                      className="p-1 text-[#8C8379] hover:text-[#2D241E] hover:bg-[#F2EFE9] rounded transition-all opacity-0 group-hover:opacity-100"
                      title="Edit Schedule"
                    >
                      <Edit2 size={10} />
                    </button>
                  </div>
                  {booking.time && (
                    <div className="flex items-center gap-1 text-[9px] text-[#A69D94] font-black uppercase tracking-tighter">
                      <Clock size={9} /> {booking.time}
                    </div>
                  )}
                </td>
                <td className="px-4 py-2.5 whitespace-nowrap">
                  <div className="space-y-0.5">
                    <div className={`text-[8px] font-black uppercase tracking-tighter flex items-center gap-1 ${
                      booking.depositPaid 
                        ? 'text-[#8B9A82]' 
                        : ((booking.depositAmount || 0) === 0 ? 'text-[#8C8379]' : 'text-amber-500')
                    }`}>
                      {booking.depositPaid ? (
                        <>
                          <CheckCircle size={9} /> DEP: PAID (RM{(booking.depositAmount || 0).toFixed(0)})
                        </>
                      ) : ((booking.depositAmount || 0) === 0) ? (
                        <>
                          <span className="w-1.5 h-1.5 rounded-full bg-[#8C8379]/40 inline-block" /> WALK-IN (NO DEP)
                        </>
                      ) : (
                        <>
                          <Clock size={9} /> DEP: PENDING (RM{(booking.depositAmount || 0).toFixed(0)})
                        </>
                      )}
                    </div>                     <div className={`text-[8px] font-black uppercase tracking-tighter flex items-center gap-1 ${
                      booking.balancePaid 
                        ? 'text-[#8B9A82]' 
                        : (booking.paymentLater ? 'text-amber-600 animate-pulse' : 'text-[#A69D94]')
                    }`}>
                      {booking.balancePaid ? <CheckCircle size={9} /> : <Banknote size={9} />}
                      BAL: {booking.balancePaid ? 'SETTLED' : (booking.paymentLater ? 'INVOICED / UNPAID' : 'PENDING')}
                    </div>
                  </div>
                </td>
                <td className="px-4 py-2.5 text-right">
                  {booking.status === 'refunded' ? (
                    <span className="text-[9px] font-black uppercase text-purple-400/60 tracking-wider">Refunded</span>
                  ) : booking.balancePaid ? (
                    <div className="flex flex-col items-end gap-1">
                      <div 
                        onClick={() => {
                          setActiveSettlementId(booking.id!);
                          setColourPaintingQty(0);
                          setIncludeDelivery(false);
                          setDeliveryAmount(0);
                        }}
                        className="inline-flex cursor-pointer items-center gap-1 text-[10px] font-black text-[#2D241E] bg-[#E8E2D9] px-2 py-1 rounded-md border border-[#D9D1C7]/20 hover:bg-[#D9D1C7] transition-all"
                      >
                        RM{((booking.paintingPrice || 0) + (booking.totalPrice || 0) - (booking.depositPaid ? (booking.depositAmount || 0) : 0)).toFixed(2)}
                      </div>
                    </div>
                  ) : booking.paymentLater ? (
                    <div className="flex flex-col items-end gap-1.5">
                      <button 
                        onClick={() => setPaymentConfirmTarget(booking)}
                        className="px-2.5 py-1 bg-[#8B9A82] text-white rounded text-[8px] font-black uppercase tracking-widest hover:bg-[#728369] transition-all shadow-sm flex items-center gap-1"
                      >
                        <CheckCircle size={10} /> Paid
                      </button>
                      <button
                        onClick={() => {
                          setActiveSettlementId(booking.id!);
                          setColourPaintingQty(0);
                          setIncludeDelivery(false);
                          setDeliveryAmount(0);
                        }}
                        className="text-[8px] font-black uppercase tracking-widest text-[#8C8379] hover:text-[#2D241E] underline"
                      >
                        View Invoice
                      </button>
                    </div>
                  ) : (
                    <button 
                      onClick={() => {
                        const nextId = activeSettlementId === booking.id ? null : booking.id!;
                        setActiveSettlementId(nextId);
                        setColourPaintingQty(0);
                        setIncludeDelivery(false);
                        setDeliveryAmount(0);
                      }}
                      className="px-2 py-1 bg-white border border-[#D9D1C7] rounded text-[8px] font-black uppercase tracking-widest text-[#8C8379] hover:bg-[#2D241E] hover:text-white transition-all shadow-sm"
                    >
                      Process
                    </button>
                  )}
                </td>
                {activeTab !== 'active' && (
                  <td className="px-4 py-2.5">
                    {activeTab === 'history' ? (
                      <button 
                        onClick={() => setActivePiecesId(booking.id!)}
                        className="flex items-center gap-2 px-3 py-2 bg-[#FAF9F6] border border-[#D9D1C7] rounded-xl text-[#8C8379] hover:bg-white hover:text-[#2D241E] hover:border-[#8C8379] transition-all shadow-sm group"
                      >
                        <div className="w-8 h-8 rounded-lg bg-white border border-[#D9D1C7]/30 flex items-center justify-center text-[#A69D94] group-hover:text-[#2D241E]">
                          <ImageIcon size={14} />
                        </div>
                        <div className="text-left">
                          <div className="text-[9px] font-black uppercase tracking-widest leading-none">View Pieces</div>
                          <div className="text-[8px] font-medium mt-0.5">{booking.finishedPieces?.length || 0} items recorded</div>
                        </div>
                      </button>
                    ) : (
                      <div className="grid grid-cols-2 gap-2 min-w-[200px]">
                        {booking.finishedPieces?.map((piece) => (
                          <button 
                            key={piece.id}
                            onClick={() => setActivePiecesId(booking.id!)}
                            className="flex items-center gap-2 p-1 rounded-xl hover:bg-white transition-all group border border-transparent hover:border-[#D9D1C7]/30 text-left"
                          >
                            <div className="w-10 h-10 rounded-lg border-2 border-white overflow-hidden shadow-sm flex-shrink-0 relative">
                              {piece.photoUrl ? (
                                <img src={piece.photoUrl} className="w-full h-full object-cover" referrerPolicy="no-referrer" />
                              ) : (
                                <div className="w-full h-full bg-[#F2EFE9] flex items-center justify-center text-[#D9D1C7]">
                                  <ImageIcon size={14} />
                                </div>
                              )}
                            </div>
                            {piece.remarks && (
                              <div className="text-[10px] text-[#8C8379] font-medium leading-[1.1] line-clamp-3 pr-1">
                                {piece.remarks}
                              </div>
                            )}
                          </button>
                        ))}
                        {booking.balancePaid && !booking.isCollected && (
                          <div className="flex items-center">
                            <button 
                              onClick={() => setActivePiecesId(booking.id!)}
                              className="w-7 h-7 rounded-lg border border-dashed border-[#D9D1C7] text-[#D9D1C7] hover:border-[#8C8379] hover:text-[#8C8379] flex items-center justify-center bg-[#FAF9F6] hover:bg-white transition-all shadow-sm"
                              title="Add/Manage Pieces"
                            >
                               <Plus size={14} />
                            </button>
                          </div>
                        )}
                      </div>
                    )}
                  </td>
                )}
                <td className="px-4 py-2.5">
                  {booking.status === 'refunded' ? (
                    <div className="flex items-center gap-1.5 text-purple-400/60 italic">
                      <RotateCcw size={11} />
                      <span className="text-[9px] font-medium tracking-tight">Session Refunded</span>
                    </div>
                  ) : booking.balancePaid ? (
                    <div className="flex items-center gap-2 min-w-[140px]">
                      {!booking.collectionMethod ? (
                        <div className="flex gap-0.5 p-0.5 bg-[#F2EFE9] rounded-lg border border-[#D9D1C7]/20">
                          {[
                            { id: 'bm', label: 'BM' },
                            { id: 'island', label: 'PG' },
                            { id: 'delivery', icon: Truck }
                          ].map(m => (
                            <button 
                              key={m.id}
                              onClick={() => updateCollectionStatus(booking.id!, { collectionMethod: m.id as any, isCollected: false })}
                              className="w-8 h-6 rounded flex items-center justify-center text-[#8C8379] hover:bg-[#2D241E] hover:text-white transition-all font-black text-[8px]"
                              title={`Set to ${m.label || m.id.toUpperCase()}`}
                            >
                              {m.label || <m.icon size={11} />}
                            </button>
                          ))}
                        </div>
                      ) : (
                        <div className="flex-1 space-y-1">
                          <div className="flex items-center justify-between">
                            <div className="flex items-center gap-1 px-1.5 py-0.5 bg-white rounded border border-[#D9D1C7]/20">
                              {booking.collectionMethod === 'delivery' && <Truck size={9} />}
                              <span className="text-[8px] font-black uppercase text-[#8C8379] tracking-tighter">
                                {booking.collectionMethod === 'bm' ? 'BM' : booking.collectionMethod === 'island' ? 'PG' : 'Deliv.'}
                              </span>
                            </div>
                            {!booking.isCollected && (
                              <button onClick={() => updateCollectionStatus(booking.id!, { collectionMethod: deleteField() as any })} className="text-[10px] font-bold text-red-300 hover:text-red-500">×</button>
                            )}
                          </div>
                          
                          {booking.isCollected ? (
                            <div className="flex items-center justify-center gap-1 py-1 bg-[#D9E2D9] text-[#8B9A82] rounded border border-[#8B9A82]/10">
                              <CheckCircle size={10} />
                              <span className="text-[8px] font-black uppercase tracking-tighter">Handed Over</span>
                            </div>
                          ) : (
                            <button 
                              onClick={() => updateCollectionStatus(booking.id!, { isCollected: true, status: 'completed', readyForCollection: true })}
                              className="w-full py-1 bg-[#2D241E] text-white rounded text-[8px] font-black uppercase tracking-tighter hover:scale-[1.02] active:scale-[0.98] transition-all"
                            >
                              Final Hand Over
                            </button>
                          )}
                        </div>
                      )}
                    </div>
                  ) : (
                    <div className="flex items-center gap-1.5 text-[#D9D1C7] italic">
                      <Clock size={11} />
                      <span className="text-[9px] font-medium tracking-tight">Requires Settlement</span>
                    </div>
                  )}
                </td>
                {activeTab !== 'active' && (
                  <td className="px-4 py-2.5 whitespace-nowrap">
                    <div className={`text-[8px] font-black uppercase inline-flex items-center gap-1 ${
                      booking.status === 'completed' ? 'text-[#8B9A82]' :
                      booking.status === 'settled' ? 'text-blue-500' :
                      booking.status === 'confirmed' ? 'text-amber-500' : 
                      booking.status === 'refunded' ? 'text-purple-500' : 'text-red-400'
                    }`}>
                      <div className={`w-1 h-1 rounded-full ${
                        booking.status === 'completed' ? 'bg-[#8B9A82]' :
                        booking.status === 'settled' ? 'bg-blue-500' :
                        booking.status === 'confirmed' ? 'bg-amber-500' : 
                        booking.status === 'refunded' ? 'bg-purple-500' : 'bg-red-400'
                      }`} />
                      {booking.status}
                    </div>
                  </td>
                )}
                <td className="px-4 py-2.5 text-right">
                  <div className="flex justify-end gap-1">
                    <button 
                      onClick={() => handleDownloadBookingPdf(booking, 'invoice')}
                      className="p-2 text-[#8C8379]/60 hover:text-[var(--accent-primary)] transition-all rounded-full hover:bg-[#FAF9F6]"
                      title="Download Tax Invoice (PDF)"
                    >
                      <FileText size={14} />
                    </button>
                    <button 
                      onClick={() => handleDownloadBookingPdf(booking, 'receipt')}
                      className="p-2 text-[#8C8379]/60 hover:text-[#8B9A82] transition-all rounded-full hover:bg-[#FAF9F6]"
                      title="Download Official Receipt (PDF)"
                    >
                      <Receipt size={14} />
                    </button>
                    <button 
                      onClick={() => openDocumentPreview(booking)}
                      className="p-2 text-[#8C8379]/60 hover:text-[#2D241E] transition-all rounded-full hover:bg-[#FAF9F6]"
                      title="Digital Document & Email Preview (Receipt / Invoice)"
                    >
                      <Eye size={14} />
                    </button>
                    <button 
                      onClick={() => {
                        const template = (booking.readyForCollection && !booking.isCollected) 
                          ? 'collection_ready' 
                          : booking.balancePaid 
                            ? 'receipt' 
                            : 'booking_confirmation';
                        setEmailDefaultTemplate(template);
                        setEmailModalTarget(booking);
                      }}
                      className="p-2 text-[#8C8379]/60 hover:text-[#5B8266] transition-all rounded-full hover:bg-[#FAF9F6]"
                      title="Send Business Email (Confirmation / Collection / Receipt)"
                    >
                      <Mail size={14} />
                    </button>
                    {booking.status !== 'refunded' && (
                      <button 
                        onClick={() => {
                          setEditingBooking(booking);
                          setEditDateValue(booking.date);
                          setEditTimeValue(booking.time || '');
                        }}
                        className="p-2 text-[#8C8379]/60 hover:text-[#2D241E] transition-all rounded-full hover:bg-[#F2EFE9]"
                        title="Edit Date/Time"
                      >
                        <Edit2 size={14} />
                      </button>
                    )}
                    {booking.depositPaid && booking.status !== 'refunded' && (
                      <button 
                        onClick={() => {
                          const totalPaid = (booking.depositPaid ? booking.depositAmount : 0) + (booking.balancePaid ? (booking.paintingPrice || 0) + (booking.totalPrice || 0) - (booking.depositPaid ? booking.depositAmount : 0) : 0);
                          setRefundTarget(booking);
                          setRefundData({ amount: totalPaid, reason: 'Customer requested refund' });
                        }}
                        className="p-2 text-amber-400 hover:text-amber-600 transition-all rounded-full hover:bg-amber-50"
                        title="Refund Booking"
                      >
                        <RotateCcw size={14} />
                      </button>
                    )}
                    {activeTab === 'history' && booking.status === 'completed' && (
                      <button 
                        onClick={() => setRevertHandoverConfirm({ isOpen: true, booking })}
                        className="p-2 text-amber-600 hover:text-amber-800 transition-all rounded-full hover:bg-amber-50"
                        title="Revert Hand Over"
                      >
                        <Undo2 size={14} />
                      </button>
                    )}
                    <button 
                      onClick={() => setDeleteConfirm({ isOpen: true, id: booking.id! })}
                      className="p-2 text-[#D9D1C7]/40 hover:text-red-400 transition-all rounded-full hover:bg-red-50"
                      title="Delete Booking"
                    >
                      <Trash2 size={14} />
                    </button>
                  </div>
                </td>
              </tr>
            ))}
            {items.length === 0 && (
              <tr>
                <td colSpan={10} className="py-16 text-center bg-[#FAF9F6]/30">
                  <div className="max-w-xs mx-auto">
                    <Calendar className="w-10 h-10 text-[#D9D1C7] mx-auto mb-3 opacity-50" />
                    <p className="text-[#8C8379] font-serif italic text-base leading-tight">No participants found.</p>
                  </div>
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
      
      {/* Settlement Overlays (only if active) */}
      <AnimatePresence>
        {activeSettlementId && (
          <motion.div 
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/20 backdrop-blur-sm"
            onClick={() => setActiveSettlementId(null)}
          >
            <motion.div 
              initial={{ scale: 0.95, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.95, opacity: 0 }}
              className="bg-white rounded-[40px] border border-[#D9D1C7] shadow-2xl p-6 md:p-8 max-w-md w-full max-h-[90vh] overflow-y-auto custom-scrollbar"
              onClick={e => e.stopPropagation()}
            >
              {(() => {
                const booking = bookings.find(b => b.id === activeSettlementId);
                if (!booking) return null;
                const workshop = workshops.find(w => w.id === booking.workshopId);
                const isVariable = workshop?.isVariablePrice ?? false;
                const depositToDeduct = booking.depositPaid ? (Number(booking.depositAmount) || 0) : 0;
                const activeSelected = selectedPiecesForBooking[booking.id!] || [];
                
                const isHistory = activeTab === 'history' || booking.balancePaid || booking.paymentLater;

                // For history, we show exactly what's on the record. 
                // For new settlement, we calculate based on active input.
                const paintingTotal = isHistory 
                  ? (booking.paintingPrice || 0)
                  : (isVariable 
                      ? activeSelected.reduce((sum, p) => sum + ((Number(p.price) || 0) * (Number(p.quantity) || 0)), 0)
                      : (colourPaintingQty * colourPaintingRate));

                const deliveryFeeVal = isHistory
                  ? (booking.deliveryFee || 0)
                  : (includeDelivery ? Number(deliveryAmount || 0) : 0);

                const historyDiscountCount = booking.drinksDiscountCount ?? 0;
                const activeDiscountCount = isHistory ? historyDiscountCount : drinksDiscountCount;
                const discountAmount = activeDiscountCount * 10;

                const fullWorkshopFee = isVariable ? paintingTotal : (Number(booking.totalPrice) || 0);
                const addOnsTotal = isVariable ? 0 : paintingTotal;
                const totalSessionFee = fullWorkshopFee + addOnsTotal + deliveryFeeVal - discountAmount;
                const totalBal = Math.max(0, totalSessionFee - depositToDeduct);

                return (
                  <div className="space-y-6">
                    <div className="flex justify-between items-center">
                      <div>
                        <h4 className="text-xl font-serif italic text-[#2D241E]">{isHistory ? 'Booking Details' : 'Session Settlement'}</h4>
                        <p className="text-[10px] text-[#8C8379] font-black uppercase tracking-widest">{booking.customerName}</p>
                      </div>
                      <button onClick={() => setActiveSettlementId(null)}><XCircle className="text-[#8C8379]" /></button>
                    </div>

                    <div className="space-y-4">
                      {isHistory ? (
                        <div className="space-y-4">
                           {/* Read-only History View */}
                           <div className="space-y-3">
                            <label className="text-[10px] font-black uppercase text-[#8C8379] tracking-widest block px-1">Workshop Info</label>
                            <div className="bg-[#FAF9F6] p-4 rounded-2xl border border-[#D9D1C7]/30 space-y-2">
                               <div className="flex justify-between items-center">
                                  <span className="text-[10px] font-black text-[#A69D94] uppercase tracking-wider">Experience</span>
                                  <span className="text-xs font-bold text-[#2D241E]">{booking.workshopName}</span>
                               </div>
                               <div className="flex justify-between items-center">
                                  <span className="text-[10px] font-black text-[#A69D94] uppercase tracking-wider">Pax</span>
                                  <span className="text-xs font-bold text-[#2D241E]">{booking.pax} Person(s)</span>
                               </div>
                               <div className="flex justify-between items-center">
                                  <span className="text-[10px] font-black text-[#A69D94] uppercase tracking-wider">Assigned Staff</span>
                                  <span className="text-xs font-bold text-[#2D241E]">{booking.staffName || '---'}</span>
                               </div>
                               {booking.settlementDate && (
                                 <div className="flex justify-between items-center pt-2 border-t border-[#D9D1C7]/20 text-[#8C8379]">
                                    <span className="text-[10px] font-black uppercase tracking-wider">Settlement Date</span>
                                    <span className="text-xs font-bold text-amber-700">{booking.settlementDate.split('-').reverse().join('/')}</span>
                                 </div>
                               )}
                            </div>
                           </div>

                           <div className="space-y-3">
                              <label className="text-[10px] font-black uppercase text-[#8C8379] tracking-widest block px-1">Items & Add-ons</label>
                              <div className="space-y-2">
                                 {booking.selectedItems && booking.selectedItems.length > 0 ? (
                                    booking.selectedItems.map((item, idx) => (
                                      <div key={idx} className="flex justify-between items-center bg-[#FAF9F6] p-4 rounded-xl border border-[#D9D1C7]/20">
                                        <span className="text-xs font-bold text-[#2D241E]">{item.quantity}x {item.name}</span>
                                        <span className="text-xs text-[#8C8379]">RM{(item.price * item.quantity).toFixed(2)}</span>
                                      </div>
                                    ))
                                 ) : (booking.paintingPieces || 0) > 0 ? (
                                    <div className="flex justify-between items-center bg-[#FAF9F6] p-4 rounded-xl border border-[#D9D1C7]/20">
                                      <span className="text-xs font-bold text-[#2D241E]">{booking.paintingPieces}x Colour Painting Pieces</span>
                                      <span className="text-xs text-[#8C8379]">RM{(booking.paintingPrice || 0).toFixed(2)}</span>
                                    </div>
                                 ) : (
                                    <div className="bg-[#FAF9F6] p-4 rounded-xl border border-dashed border-[#D9D1C7]/50 text-center">
                                       <span className="text-[10px] font-black uppercase text-[#A69D94]">No additional items recorded</span>
                                    </div>
                                 )}
                              </div>
                           </div>

                           {(booking.collectionMethod || booking.deliveryFee) && (
                              <div className="space-y-3">
                                 <label className="text-[10px] font-black uppercase text-[#8C8379] tracking-widest block px-1">Collection details</label>
                                 <div className="bg-[#FAF9F6] p-4 rounded-2xl border border-[#D9D1C7]/30 flex items-center justify-between">
                                    <div className="flex items-center gap-3">
                                       <div className={`w-8 h-8 rounded-lg flex items-center justify-center ${booking.collectionMethod === 'delivery' ? 'bg-blue-50 text-blue-500' : 'bg-[#F2EFE9] text-[#8B9A82]'}`}>
                                          {booking.collectionMethod === 'delivery' ? <Truck size={16} /> : <MapPin size={16} />}
                                       </div>
                                       <div>
                                          <span className="text-[10px] font-black uppercase text-[#2D241E] tracking-widest block">
                                             {booking.collectionMethod === 'bm' ? 'BM Pick-up' : booking.collectionMethod === 'island' ? 'PG Pick-up' : booking.collectionMethod === 'delivery' ? 'Delivery Service' : '---'}
                                          </span>
                                          {booking.isCollected && <span className="text-[9px] font-bold text-[#8B9A82] uppercase">Handed Over Successfully</span>}
                                       </div>
                                    </div>
                                    {booking.deliveryFee && <span className="text-xs font-bold text-[#2D241E]">RM{booking.deliveryFee.toFixed(2)}</span>}
                                 </div>
                              </div>
                           )}
                        </div>
                      ) : (
                        <div className="space-y-4">
                          {isVariable ? (
                            <div className="space-y-3">
                              <label className="text-[10px] font-black uppercase text-[#8C8379] tracking-widest block px-1">Selected Ceramic Items</label>
                              <select
                                className="natural-input w-full"
                                onChange={(e) => {
                                  const p = inventoryBases.find(item => item.id === e.target.value);
                                  if (p) addPieceToBooking(booking.id!, p);
                                  e.target.value = '';
                                }}
                              >
                                <option value="">Add a piece...</option>
                                {inventoryBases
                                  .map(p => (
                                    <option key={p.id} value={p.id} disabled={p.stock <= 0}>
                                      {p.sku ? `[${p.sku}] ` : ''}{p.name} (RM{p.price})
                                    </option>
                                  ))}
                              </select>

                              <div className="space-y-2 max-h-40 overflow-y-auto">
                                {activeSelected.map(item => (
                                  <div key={item.productId} className="flex justify-between items-center bg-[#FAF9F6] p-3 rounded-xl border border-[#D9D1C7]/20 text-xs">
                                    <span className="font-bold text-[#2D241E]">{item.quantity}x {item.name}</span>
                                    <div className="flex items-center gap-3">
                                      <span className="text-[#8C8379]">RM{(item.price * item.quantity).toFixed(2)}</span>
                                      <button onClick={() => removePieceFromBooking(booking.id!, item.productId)} className="text-red-400 font-bold hover:scale-110">×</button>
                                    </div>
                                  </div>
                                ))}
                              </div>
                            </div>
                          ) : (
                            <div className="space-y-3">
                              <div className="flex justify-between items-center px-1">
                                <label className="text-[10px] font-black uppercase text-[#8C8379] tracking-widest block">
                                  Add Colour Painting (RM{colourPaintingRate}/piece)
                                </label>
                                {booking.location === 'BM' ? (
                                  <div className="flex items-center gap-1.5 bg-white px-2.5 py-1 rounded-xl border border-[#D9D1C7]/30 shadow-sm">
                                    <span className="text-[8px] font-black uppercase text-[#8C8379]">Fee: RM</span>
                                    <input 
                                      type="number"
                                      min="0"
                                      className="w-12 h-5 text-center text-[10px] font-black bg-transparent border-none p-0 focus:outline-none text-[#2D241E]"
                                      value={colourPaintingRate}
                                      onChange={(e) => setColourPaintingRate(Math.max(0, Number(e.target.value) || 0))}
                                    />
                                  </div>
                                ) : (
                                  <span className="text-[8px] font-black uppercase text-[#8C8379] bg-white px-2.5 py-1 rounded-xl border border-[#D9D1C7]/20">Fixed PG Rate</span>
                                )}
                              </div>
                              <div className="flex items-center gap-4 bg-[#FAF9F6] p-4 rounded-xl border border-[#D9D1C7]/30">
                                <button 
                                  onClick={() => setColourPaintingQty(Math.max(0, colourPaintingQty - 1))}
                                  className="w-10 h-10 rounded-full bg-white border border-[#D9D1C7] flex items-center justify-center font-bold text-[#2D241E] hover:bg-[#F2EFE9]"
                                >
                                  -
                                </button>
                                <div className="flex-1 text-center">
                                  <span className="text-xl font-black text-[#2D241E]">{colourPaintingQty}</span>
                                  <span className="text-[8px] font-black uppercase text-[#8C8379] block">Pieces</span>
                                </div>
                                <button 
                                  onClick={() => setColourPaintingQty(colourPaintingQty + 1)}
                                  className="w-10 h-10 rounded-full bg-white border border-[#D9D1C7] flex items-center justify-center font-bold text-[#2D241E] hover:bg-[#F2EFE9]"
                                >
                                  +
                                </button>
                              </div>
                            </div>
                          )}

                          {/* Staff Assignment */}
                          <div className="space-y-3 p-4 bg-[#F2EFE9]/50 rounded-2xl border border-[#D9D1C7]/30">
                            <label className="text-[10px] font-black uppercase text-[#8C8379] tracking-widest block px-1">Assigned Staff</label>
                            <select
                              className="natural-input w-full bg-white cursor-pointer"
                              value={booking.staffName || ''}
                              onChange={(e) => updateDoc(doc(db, 'bookings', booking.id!), { staffName: e.target.value })}
                            >
                              <option value="">Select Staff Member</option>
                              {staffList
                                .filter(s => (s.branch === booking.location || s.branch === 'ALL') && s.active)
                                .map(s => (
                                  <option key={s.id} value={s.name}>{s.name}</option>
                                ))
                              }
                            </select>
                            
                            {booking.location === 'BM' && booking.staffName && (
                              <div className="space-y-2 mt-2 pt-2 border-t border-[#D9D1C7]/20">
                                <label className="text-[9px] font-black uppercase text-[#8C8379] tracking-widest block px-1">Commission Rate</label>
                                <div className="flex gap-2">
                                  {[1, 3].map((rate) => {
                                    const isSelected = (booking.commissionRate === rate) || (!booking.commissionRate && rate === 1);
                                    return (
                                      <button
                                        key={rate}
                                        type="button"
                                        onClick={() => updateDoc(doc(db, 'bookings', booking.id!), { commissionRate: rate })}
                                        className={`flex-1 py-1.5 rounded-lg text-[10px] font-black uppercase tracking-wider border transition-all ${
                                          isSelected
                                            ? 'bg-[#2D241E] text-white border-[#2D241E]'
                                            : 'bg-white text-[#8C8379] border-[#D9D1C7]/30 hover:border-[#8C8379]'
                                        }`}
                                      >
                                        {rate}% Commission
                                      </button>
                                    );
                                  })}
                                </div>
                              </div>
                            )}

                            <p className="text-[8px] text-[#A69D94] font-medium px-1">
                              {booking.location === 'PG' 
                                ? 'Used for commission calculations (3.5%).' 
                                : `Used for commission calculations (${booking.commissionRate || 1}% selected).`
                              }
                            </p>
                          </div>

                          {/* Settlement Date Selection */}
                          <div className="space-y-3 p-4 bg-[#FAF9F6] rounded-2xl border border-amber-500/20 shadow-sm relative overflow-hidden">
                            <div className="absolute top-0 left-0 w-1 h-full bg-[#8B9A82]"></div>
                            <label className="text-[10px] font-black uppercase text-[#8C8379] tracking-widest block px-1 flex items-center gap-1.5">
                              <Calendar size={10} className="text-[#8B9A82]" /> Invoice / Settlement Date
                            </label>
                            <input 
                              type="date"
                              required
                              className="natural-input w-full bg-white border-[#D9D1C7]/30 font-bold text-xs"
                              value={settlementDate}
                              onChange={(e) => setSettlementDate(e.target.value)}
                            />
                            <p className="text-[8px] text-[#8C8379]/80 italic px-1 font-medium leading-normal">
                              Specify the date for this balance settlement. The transaction document and invoice will be dated with this selection.
                            </p>
                          </div>

                          {/* Delivery Toggle & Fee */}
                          <div className="space-y-3 p-4 bg-[#F2EFE9]/50 rounded-2xl border border-[#D9D1C7]/30">
                            <div className="flex justify-between items-center px-1">
                              <label className="text-[10px] font-black uppercase text-[#8C8379] tracking-widest block">Delivery Fee</label>
                              <label className="relative inline-flex items-center cursor-pointer">
                                <input 
                                  type="checkbox" 
                                  className="sr-only peer" 
                                  checked={includeDelivery}
                                  onChange={(e) => setIncludeDelivery(e.target.checked)}
                                />
                                <div className="w-9 h-5 bg-[#D9D1C7]/50 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:bg-[#2D241E]"></div>
                              </label>
                            </div>
                            
                            {includeDelivery && (
                              <div className="flex gap-2">
                                <input 
                                  type="number"
                                  placeholder="Fee Amount (e.g. 10.00)"
                                  className="natural-input flex-1 bg-white"
                                  value={deliveryAmount || ''}
                                  onChange={(e) => setDeliveryAmount(Number(e.target.value))}
                                />
                                <div className="w-10 h-10 rounded-xl bg-white border border-[#D9D1C7]/30 flex items-center justify-center text-[#8C8379]">
                                  <Truck size={14} />
                                </div>
                              </div>
                            )}
                            <p className="text-[8px] text-[#A69D94] font-medium px-1">If selected, this booking will be marked as 'Delivery' and filtered out of branch collections.</p>
                          </div>

                          {/* Drinks Discount Quantity Selector */}
                          <div className="space-y-3 p-4 bg-amber-50/50 rounded-2xl border border-amber-200/30">
                            <div className="flex justify-between items-center px-1">
                              <div>
                                <label className="text-[10px] font-black uppercase text-amber-700 tracking-widest block leading-tight">
                                  Drinks Discount
                                </label>
                                <span className="text-[8px] font-bold text-amber-600/70 uppercase tracking-tighter">
                                  -RM 10.00 Discount per item
                                </span>
                              </div>
                              <div className="flex items-center bg-white rounded-xl border border-[#D9D1C7]/40 shadow-sm p-1 gap-1">
                                <button
                                  type="button"
                                  onClick={() => setDrinksDiscountCount(prev => Math.max(0, prev - 1))}
                                  className="w-8 h-8 flex items-center justify-center font-bold text-[#2D241E] hover:bg-[#F2EFE9] rounded-lg transition-colors text-sm select-none"
                                >
                                  -
                                </button>
                                <input
                                  type="number"
                                  min="0"
                                  className="w-8 text-center font-bold text-xs bg-transparent outline-none border-none p-0 [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
                                  value={drinksDiscountCount}
                                  onChange={(e) => setDrinksDiscountCount(Math.max(0, parseInt(e.target.value) || 0))}
                                />
                                <button
                                  type="button"
                                  onClick={() => setDrinksDiscountCount(prev => prev + 1)}
                                  className="w-8 h-8 flex items-center justify-center font-bold text-[#2D241E] hover:bg-[#F2EFE9] rounded-lg transition-colors text-sm select-none"
                                >
                                  +
                                </button>
                              </div>
                            </div>
                            {drinksDiscountCount > 0 && (
                              <div className="text-right text-[10px] text-amber-700 font-bold px-1">
                                Total Discount: -RM{(drinksDiscountCount * 10).toFixed(2)}
                              </div>
                            )}
                          </div>

                          {/* Payment Option Selection */}
                          <div className="space-y-3 p-4 bg-[#F2EFE9]/50 rounded-2xl border border-[#D9D1C7]/30">
                            <label className="text-[10px] font-black uppercase text-[#8C8379] tracking-widest block px-1">Payment Method / Receipt Option</label>
                            <div className="flex gap-2">
                              {[
                                { id: 'now', label: 'Pay Now (Receipt)', desc: 'Generate payment transaction today' },
                                { id: 'later', label: 'Pay Later (Invoice Only)', desc: 'Record settlement without instant receipt' }
                              ].map((opt) => {
                                const isSelected = settlementPaymentOpt === opt.id;
                                return (
                                  <button
                                    key={opt.id}
                                    type="button"
                                    onClick={() => setSettlementPaymentOpt(opt.id as any)}
                                    className={`flex-1 p-2.5 rounded-xl border text-left transition-all flex flex-col gap-1 ${
                                      isSelected
                                        ? 'bg-[#2D241E] text-white border-[#2D241E] shadow-sm'
                                        : 'bg-white text-[#8C8379] border-[#D9D1C7]/30 hover:border-[#8C8379]'
                                    }`}
                                  >
                                    <span className="text-[10px] font-black uppercase tracking-wider">{opt.label}</span>
                                    <span className={`text-[8px] leading-tight font-medium ${isSelected ? 'text-[#D9D1C7]' : 'text-[#A69D94]'}`}>{opt.desc}</span>
                                  </button>
                                );
                              })}
                            </div>
                          </div>
                        </div>
                      )}

                      {(() => {
                        const isPayLater = Boolean(booking.paymentLater || (!isHistory && settlementPaymentOpt === 'later'));
                        const finalLabel = isPayLater ? 'Net Payable' : 'Net Paid';

                        return (
                          <div className="p-6 bg-[#FAF9F6] rounded-[24px] border border-[#D9D1C7]/30 space-y-2.5">
                            <div className="flex justify-between text-[11px] text-[#8C8379] uppercase font-black">
                              <span>{isVariable ? 'Total Workshop Fee (Pieces Total)' : 'Total Workshop Fee'}</span> 
                              <span>RM{fullWorkshopFee.toFixed(2)}</span>
                            </div>

                            {!isVariable && paintingTotal > 0 && (
                              <div className="flex justify-between text-[11px] text-[#8C8379] uppercase font-black">
                                <span>Painting Add-on</span> 
                                <span>RM{paintingTotal.toFixed(2)}</span>
                              </div>
                            )}

                            {deliveryFeeVal > 0 && (
                              <div className="flex justify-between text-[11px] text-[#8C8379] uppercase font-black">
                                <span>Courier Delivery</span> 
                                <span>RM{deliveryFeeVal.toFixed(2)}</span>
                              </div>
                            )}

                            {discountAmount > 0 && (
                              <div className="flex justify-between text-[11px] font-black uppercase text-amber-600">
                                <span>
                                  Drinks Discount
                                  {activeDiscountCount > 1 ? ` (x${activeDiscountCount})` : ''}
                                </span> 
                                <span>-RM{discountAmount.toFixed(2)}</span>
                              </div>
                            )}

                            {depositToDeduct > 0 && (
                              <div className="flex justify-between text-[11px] font-black uppercase text-[#8B9A82]">
                                <span>Minus Deposit</span> 
                                <span>-RM{depositToDeduct.toFixed(2)}</span>
                              </div>
                            )}

                            <div className="pt-2.5 mt-2 border-t border-[#D9D1C7]/30 flex justify-between items-end">
                              <span className="text-[11px] font-black uppercase tracking-wider text-[#2D241E]">{finalLabel}</span>
                              <span className="text-3xl font-serif italic text-[#2D241E]">RM{totalBal.toFixed(2)}</span>
                            </div>
                          </div>
                        );
                      })()}

                      {relatedTransactions.length > 0 && (
                        <div className="space-y-3">
                          <label className="text-[10px] font-black uppercase text-[#8C8379] tracking-widest block px-1">Payment History</label>
                          <div className="space-y-2">
                            {relatedTransactions.map(tx => (
                              <div key={tx.id} className="flex justify-between items-center bg-[#F2EFE9]/30 p-3 rounded-xl border border-[#D9D1C7]/20">
                                <div>
                                  <div className="text-[10px] font-bold text-[#2D241E] uppercase tracking-tight">
                                    {tx.type === 'deposit' ? 'Workshop Deposit' : tx.type === 'balance' ? 'Balance Settlement' : tx.type.toUpperCase()}
                                  </div>
                                  <div className="text-[8px] text-[#8C8379] font-medium">
                                    {format(new Date(tx.timestamp), 'dd MMM yyyy, HH:mm')}
                                  </div>
                                </div>
                                <div className="text-right">
                                  <div className="text-xs font-black text-[#2D241E]">RM{tx.amount.toFixed(2)}</div>
                                  <div className="text-[8px] font-black text-[#8B9A82] uppercase tracking-tighter">
                                    {tx.type === 'deposit' ? 'RCP' : 'INV'}-{tx.id?.slice(-8).toUpperCase()}
                                  </div>
                                </div>
                              </div>
                            ))}
                          </div>
                        </div>
                      )}

                      {booking.balancePaid ? (
                        <div className="space-y-3">
                          <div className="p-4 bg-[#8B9A82]/10 rounded-2xl border border-[#8B9A82]/20 text-center">
                            <p className="text-[11px] font-black text-[#8B9A82] uppercase tracking-widest">Payment Fully Settled</p>
                            <p className="text-[9px] text-[#8B9A82] font-medium mt-1">Transaction record has been finalized.</p>
                          </div>
                          <div className="grid grid-cols-2 gap-2">
                            <button
                              type="button"
                              onClick={() => handleDownloadBookingPdf(booking, 'invoice')}
                              className="py-2.5 px-3 bg-white border border-[#D9D1C7] hover:bg-[#F2EFE9] text-[#2D241E] rounded-xl text-[10px] font-black uppercase tracking-wider transition-colors flex items-center justify-center gap-1.5 shadow-2xs"
                              title="Download Tax Invoice (PDF)"
                            >
                              <Download size={13} /> Invoice PDF
                            </button>
                            <button
                              type="button"
                              onClick={() => handleDownloadBookingPdf(booking, 'receipt')}
                              className="py-2.5 px-3 bg-white border border-[#D9D1C7] hover:bg-[#F2EFE9] text-[#2D241E] rounded-xl text-[10px] font-black uppercase tracking-wider transition-colors flex items-center justify-center gap-1.5 shadow-2xs"
                              title="Download Official Receipt (PDF)"
                            >
                              <Download size={13} /> Receipt PDF
                            </button>
                          </div>
                          <div className="grid grid-cols-2 gap-2">
                            <button
                              type="button"
                              onClick={() => openDocumentPreview(booking, 'invoice')}
                              className="py-2.5 px-3 bg-white border border-[#D9D1C7] hover:bg-[#F2EFE9] text-[#2D241E] rounded-xl text-[10px] font-black uppercase tracking-wider transition-colors flex items-center justify-center gap-1.5 shadow-2xs"
                            >
                              <Mail size={13} /> Email Invoice
                            </button>
                            <button
                              type="button"
                              onClick={() => openDocumentPreview(booking, 'receipt')}
                              className="py-2.5 px-3 bg-[#2D241E] hover:bg-[#1a1512] text-white rounded-xl text-[10px] font-black uppercase tracking-wider transition-colors flex items-center justify-center gap-1.5 shadow-2xs"
                            >
                              <Mail size={13} /> Email Receipt
                            </button>
                          </div>
                        </div>
                      ) : booking.paymentLater ? (
                        <div className="space-y-4">
                          <div className="p-4 bg-amber-50 rounded-2xl border border-amber-200 text-center">
                            <p className="text-[11px] font-black text-amber-700 uppercase tracking-widest animate-pulse">Invoice Pending Payment</p>
                            <p className="text-[9px] text-[#8C8379] font-medium mt-1">Outstanding settlement of RM{totalBal.toFixed(2)} is unpaid.</p>
                          </div>
                          <div className="grid grid-cols-2 gap-2">
                            <button
                              type="button"
                              onClick={() => handleDownloadBookingPdf(booking, 'invoice')}
                              className="py-2.5 px-3 bg-white border border-[#D9D1C7] hover:bg-[#F2EFE9] text-[#2D241E] rounded-xl text-[10px] font-black uppercase tracking-wider transition-colors flex items-center justify-center gap-1.5 shadow-2xs"
                            >
                              <Download size={13} /> Invoice PDF
                            </button>
                            <button
                              type="button"
                              onClick={() => openDocumentPreview(booking, 'invoice')}
                              className="py-2.5 px-3 bg-[#2D241E] hover:bg-[#1a1512] text-white rounded-xl text-[10px] font-black uppercase tracking-wider transition-colors flex items-center justify-center gap-1.5 shadow-2xs"
                            >
                              <Mail size={13} /> Email Invoice
                            </button>
                          </div>
                          <button 
                             onClick={() => {
                               setActiveSettlementId(null);
                               setPaymentConfirmTarget(booking);
                             }}
                             className="w-full py-5 bg-[#8B9A82] hover:bg-[#728369] text-white rounded-2xl text-sm font-black uppercase tracking-widest transition-all shadow-xl shadow-[#8B9A82]/20"
                          >
                             Mark as Fully Paid
                          </button>
                        </div>
                      ) : (
                        <div className="space-y-2">
                          <div className="grid grid-cols-2 gap-2">
                            <button
                              type="button"
                              onClick={() => handleDownloadBookingPdf(booking, 'invoice')}
                              className="py-2.5 px-3 bg-white border border-[#D9D1C7] hover:bg-[#F2EFE9] text-[#2D241E] rounded-xl text-[10px] font-black uppercase tracking-wider transition-colors flex items-center justify-center gap-1.5 shadow-2xs"
                              title="Download Tax Invoice (PDF)"
                            >
                              <Download size={12} /> Invoice PDF
                            </button>
                            <button
                              type="button"
                              onClick={() => openDocumentPreview(booking, 'invoice')}
                              className="py-2.5 px-3 bg-white border border-[#D9D1C7] hover:bg-[#F2EFE9] text-[#2D241E] rounded-xl text-[10px] font-black uppercase tracking-wider transition-colors flex items-center justify-center gap-1.5 shadow-2xs"
                              title="Email Tax Invoice"
                            >
                              <Mail size={12} /> Email Invoice
                            </button>
                          </div>
                          <button 
                             onClick={async () => {
                               await markBalancePaid(booking, { 
                                 includeDelivery, 
                                 deliveryAmount, 
                                 drinksDiscountCount: drinksDiscountCount,
                                 settlementDate,
                                 paymentLater: settlementPaymentOpt === 'later'
                               });
                               setActiveSettlementId(null);
                               setColourPaintingQty(0);
                               setIncludeDelivery(false);
                               setDeliveryAmount(0);
                               setDrinksDiscountCount(0);
                             }}
                             className="natural-btn-primary w-full py-5 text-sm uppercase font-black tracking-widest shadow-xl shadow-[#7D6B5D]/20"
                          >
                             {settlementPaymentOpt === 'later' ? 'Issue Pay-Later Invoice' : 'Collect Payment'}
                          </button>
                        </div>
                      )}
                    </div>
                  </div>
                );
              })()}
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      
      {items.length > 20 && !showAll && (
        <div className="p-4 border-t border-[#F2EFE9] bg-white flex justify-center">
          <button 
            onClick={() => setShowAll(true)}
            className="text-[10px] font-black text-[#8C8379] hover:text-[#2D241E] uppercase tracking-widest transition-colors py-2 px-6 border border-[#D9D1C7]/30 rounded-xl hover:bg-[#FAF9F6]"
          >
            See More ({items.length - 20} more)
          </button>
        </div>
      )}
    </div>
  );

  return (
    <div className="space-y-6">
      <div className="flex justify-center mb-2">
        <button
          onClick={() => setIsAdding(true)}
          className="natural-btn-primary flex items-center gap-3 px-12 py-4 rounded-3xl shadow-xl hover:scale-[1.02] active:scale-[0.98] transition-all"
        >
          <Plus className="w-5 h-5" />
          <span className="text-sm font-black uppercase tracking-widest">Register Student</span>
        </button>
      </div>

      <AnimatePresence>
        {isAdding && (
          <motion.div 
            initial={{ opacity: 0, y: -20 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -20 }}
            className="bg-white p-5 md:p-7 rounded-[32px] border border-[#D9D1C7] shadow-xl relative overflow-hidden"
          >
            <div className="absolute top-0 left-0 w-full h-1 bg-[#8B9A82]/30"></div>
            <header className="flex justify-between items-center mb-6 md:mb-8">
              <div>
                <h3 className="text-xl md:text-2xl font-serif italic text-[#2D241E]">New Workshop Booking</h3>
                <p className="text-[10px] text-[#8C8379] font-bold mt-0.5 uppercase tracking-widest">Adding to the studio roster</p>
              </div>
              <button 
                onClick={() => setIsAdding(false)}
                className="p-2 hover:bg-[#FAF9F6] rounded-full text-[#8C8379]"
              >
                <XCircle />
              </button>
            </header>
            
            <form onSubmit={handleAddBooking} className="grid grid-cols-1 md:grid-cols-2 gap-5 md:gap-8">
              <div className="space-y-4">
                <div className="space-y-2">
                  <label className="text-[10px] font-black text-[#8C8379] uppercase tracking-widest px-1">Selected Curriculum</label>
                  <select
                    required
                    className="natural-input w-full appearance-none"
                    value={formData.workshopId}
                    onChange={(e) => {
                      const wsId = e.target.value;
                      const ws = availableWorkshops.find(w => w.id === wsId);
                      const defaultLoc = (ws?.location && ws.location !== 'ALL') ? ws.location as any : formData.location;
                      const defaultDep = formData.depositPaid ? (defaultLoc === 'BM' ? 50 : ((ws?.depositAmount || 0) * (formData.pax || 1))) : 0;
                      setFormData({ 
                        ...formData, 
                        workshopId: wsId,
                        location: defaultLoc,
                        depositAmount: defaultDep
                      });
                    }}
                  >
                    <option value="">Choose an experience...</option>
                    {availableWorkshops.map(w => (
                      <option key={w.id} value={w.id}>{w.name} {w.isVariablePrice ? '(Variable Price Mode)' : `(RM${w.totalPrice})`} [{w.location || 'ALL'}]</option>
                    ))}
                  </select>
                </div>
                
                <div className="space-y-2">
                  <label className="text-[10px] font-black text-[#8C8379] uppercase tracking-widest px-1">Participant Name</label>
                  <input
                    required
                    type="text"
                    className="natural-input w-full"
                    placeholder="Full Name"
                    value={formData.customerName}
                    onChange={(e) => setFormData({ ...formData, customerName: e.target.value })}
                  />
                </div>

                <div className="grid grid-cols-3 gap-3">
                  <div className="col-span-1 space-y-2">
                    <label className="text-[10px] font-black text-[#8C8379] uppercase tracking-widest px-1">Pax</label>
                    <input
                      required
                      type="number"
                      min="1"
                      className="natural-input w-full"
                      value={formData.pax || ''}
                      onChange={(e) => {
                        const val = parseInt(e.target.value) || 0;
                        const ws = workshops.find(w => w.id === formData.workshopId);
                        const defaultLoc = formData.location;
                        const defaultDep = formData.depositPaid ? (defaultLoc === 'BM' ? 50 : ((ws?.depositAmount || 0) * val)) : 0;
                        setFormData({ ...formData, pax: val, depositAmount: defaultDep });
                      }}
                    />
                  </div>
                  <div className="col-span-2 space-y-2">
                    <label className="text-[10px] font-black text-[#8C8379] uppercase tracking-widest px-1">Phone Number</label>
                    <input
                      required
                      type="tel"
                      placeholder="000-000-0000"
                      className="natural-input w-full"
                      value={formData.customerPhone}
                      onChange={(e) => setFormData({ ...formData, customerPhone: e.target.value })}
                    />
                  </div>
                </div>

                <div className="space-y-2">
                  <label className="text-[10px] font-black text-[#8C8379] uppercase tracking-widest px-1 flex items-center gap-1.5">
                    <Mail size={10} className="text-[#C86A4B]" /> Customer Email (For Automated Dispatch)
                  </label>
                  <input
                    type="email"
                    placeholder="customer@example.com"
                    className="natural-input w-full"
                    value={formData.customerEmail || ''}
                    onChange={(e) => setFormData({ ...formData, customerEmail: e.target.value })}
                  />
                  <p className="text-[8px] text-[#8C8379] italic px-1 font-medium">
                    Enables one-click dispatch of booking confirmations, receipt invoices, & collection notices.
                  </p>
                </div>

                {/* Branch Location removed since there is only one branch now */}
              </div>

              <div className="space-y-6">
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-2">
                    <label className="text-[10px] font-black text-[#8C8379] uppercase tracking-widest px-1 flex items-center gap-1.5">
                      <Calendar size={10} className="text-[#8B9A82]" /> Session Date
                    </label>
                    <input
                      required
                      type="date"
                      className="natural-input w-full"
                      value={formData.date}
                      onChange={(e) => setFormData({ ...formData, date: e.target.value })}
                    />
                  </div>
                  <div className="space-y-2">
                    <label className="text-[10px] font-black text-[#8C8379] uppercase tracking-widest px-1 flex items-center gap-1.5">
                      <Clock size={10} className="text-[#8B9A82]" /> Start Time
                    </label>
                    <input
                      required
                      type="time"
                      className="natural-input w-full"
                      value={formData.time}
                      onChange={(e) => setFormData({ ...formData, time: e.target.value })}
                    />
                  </div>
                  <div className="col-span-2 space-y-2">
                    <label className="text-[10px] font-black text-amber-600 uppercase tracking-widest px-1 flex items-center gap-1.5">
                      <Clock size={10} /> Data Collection Date (Backdate)
                    </label>
                    <input
                      type="date"
                      className="natural-input w-full border-amber-100 bg-amber-50/10"
                      value={formData.recordingDate}
                      onChange={(e) => setFormData({ ...formData, recordingDate: e.target.value })}
                    />
                    <p className="text-[8px] text-amber-500 italic px-1 font-medium leading-none">
                      Leave empty for current time. Use this if you are recording a past booking.
                    </p>
                  </div>
                  <p className="col-span-2 text-[9px] text-[#8C8379] italic px-1 font-medium -mt-3 mb-2">
                    * Studio hours: 10:00 AM - 9:00 PM. Each session is 3 hours.
                  </p>
                </div>

                <div className="p-6 bg-[#FAF9F6] rounded-[24px] border border-[#D9D1C7]/30 space-y-4">
                  <div className="flex items-center justify-between">
                    <div>
                      <span className="text-sm font-bold text-[#4A3F35]">Process Deposit?</span>
                      <p className="text-[10px] text-[#8C8379] uppercase tracking-widest font-black mt-0.5">Recording initial payment</p>
                    </div>
                    <button
                      type="button"
                      onClick={() => {
                        const nextDepositPaid = !formData.depositPaid;
                        const ws = workshops.find(w => w.id === formData.workshopId);
                        const defaultLoc = formData.location;
                        const defaultDep = nextDepositPaid ? (defaultLoc === 'BM' ? 50 : ((ws?.depositAmount || 0) * (formData.pax || 1))) : 0;
                        setFormData({ 
                          ...formData, 
                          depositPaid: nextDepositPaid, 
                          depositAmount: defaultDep 
                        });
                      }}
                      className={`w-12 h-6 rounded-full transition-colors relative ${formData.depositPaid ? 'bg-[#8B9A82]' : 'bg-[#D9D1C7]'}`}
                    >
                      <div className={`absolute top-1 w-4 h-4 rounded-full bg-white transition-all shadow-sm ${formData.depositPaid ? 'left-7' : 'left-1'}`} />
                    </button>
                  </div>
                  {formData.workshopId && (
                    formData.depositPaid ? (
                      <div className="pt-4 border-t border-[#D9D1C7]/30 space-y-4">
                        {/* Interactive edit for actual deposit amount */}
                        <div className="space-y-2">
                          <label className="text-[10px] font-black text-[#8C8379] uppercase tracking-widest block px-1">
                            Deposit Amount Collected (RM)
                          </label>
                          <input
                            type="number"
                            min="0.01"
                            step="0.01"
                            required
                            className="natural-input w-full font-bold text-xs bg-white border-[#D9D1C7]/30"
                            value={formData.depositAmount === 0 ? '' : formData.depositAmount}
                            onChange={(e) => setFormData({ ...formData, depositAmount: Number(e.target.value) || 0 })}
                            placeholder="0.00"
                          />
                          <p className="text-[8px] text-[#8C8379]/80 italic px-1 font-medium leading-[1.1]">
                            * Will record an advance deposit of RM{(formData.depositAmount || 0).toFixed(2)} in transactions.
                          </p>
                        </div>

                        <div className="text-[11px] font-medium space-y-2 bg-white p-3 rounded-xl border border-[#D9D1C7]/20">
                          {(() => {
                            const ws = workshops.find(w => w.id === formData.workshopId);
                            if (!ws) return null;
                            const dep = Number(formData.depositAmount) || 0;
                            const total = (ws.totalPrice || 0) * (formData.pax || 1);
                            const bal = Math.max(0, total - dep);
                            return (
                              <>
                                <div className="flex justify-between text-[#8B9A82] font-bold">
                                  <span>Deposit Paid Now</span>
                                  <span>RM{dep.toFixed(2)}</span>
                                </div>
                                <div className="flex justify-between text-[#8C8379]">
                                  <span>Balance Due Later</span>
                                  <span>RM{bal.toFixed(2)}</span>
                                </div>
                                <div className="flex justify-between font-bold text-[#2D241E] pt-1 border-t border-[#D9D1C7]/20">
                                  <span>Total Value</span>
                                  <span>RM{total.toFixed(2)}</span>
                                </div>
                              </>
                            );
                          })()}
                        </div>
                      </div>
                    ) : (
                      <div className="pt-4 border-t border-[#D9D1C7]/30">
                        <div className="p-3.5 bg-amber-50/60 rounded-xl border border-amber-200/50 text-amber-900">
                          <div className="text-[11px] font-bold text-amber-800 flex items-center gap-1.5 mb-1">
                            <span>Walk-In / Pay on Site Mode</span>
                          </div>
                          <p className="text-[10px] text-amber-800/80 leading-relaxed font-medium">
                            No advance deposit will be charged or recorded. Full workshop fee of <strong>RM{(((workshops.find(w => w.id === formData.workshopId)?.totalPrice || 0) * (formData.pax || 1))).toFixed(2)}</strong> will be paid during session settlement.
                          </p>
                        </div>
                      </div>
                    )
                  )}
                </div>

                {/* Automated Confirmation Email & Receipt Dispatch Switch */}
                <div className={`p-4 rounded-2xl border transition-all ${
                  autoSendConfirmationEmail && formData.customerEmail
                    ? (formData.depositPaid && Number(formData.depositAmount) > 0 ? 'bg-[#F4F8F3] border-[#CFE2CD]' : 'bg-[#FAF9F6] border-[#D9D1C7]/70')
                    : 'bg-[#FAF9F6] border-[#D9D1C7]/40'
                }`}>
                  <div className="flex items-center justify-between gap-3">
                    <div className="flex items-center gap-3">
                      <div className={`w-9 h-9 rounded-xl flex items-center justify-center shrink-0 ${
                        autoSendConfirmationEmail && formData.customerEmail && formData.depositPaid && Number(formData.depositAmount) > 0 
                          ? 'bg-[#E1EFE0] text-[#2B7A4B]' 
                          : 'bg-[#FAF0EB] text-[#C86A4B]'
                      }`}>
                        <Mail size={18} />
                      </div>
                      <div>
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="text-xs font-bold text-[#2D241E]">
                            Send Confirmation Email
                          </span>
                          {formData.depositPaid && Number(formData.depositAmount) > 0 && (
                            <span className="text-[9px] font-black uppercase px-2 py-0.5 rounded-full bg-[#E1EFE0] text-[#2B7A4B] border border-[#CFE2CD] flex items-center gap-1">
                              <Receipt size={10} /> + Deposit Receipt PDF
                            </span>
                          )}
                        </div>
                        <p className="text-[10px] text-[#8C8379] mt-0.5 font-medium">
                          {formData.customerEmail ? (
                            formData.depositPaid && Number(formData.depositAmount) > 0
                              ? `Will email ${formData.customerEmail} with official deposit receipt PDF (RM${Number(formData.depositAmount).toFixed(2)}) attached`
                              : `Will email ${formData.customerEmail} with session details & studio guidelines`
                          ) : (
                            <span className="text-amber-700 italic">Enter customer email above to enable automated dispatch</span>
                          )}
                        </p>
                      </div>
                    </div>

                    <button
                      type="button"
                      onClick={() => setAutoSendConfirmationEmail(!autoSendConfirmationEmail)}
                      className={`w-11 h-6 rounded-full transition-colors relative shrink-0 ${autoSendConfirmationEmail ? 'bg-[#2D241E]' : 'bg-[#D9D1C7]'}`}
                    >
                      <div className={`absolute top-1 w-4 h-4 rounded-full bg-white transition-all shadow-sm ${autoSendConfirmationEmail ? 'left-6' : 'left-1'}`} />
                    </button>
                  </div>
                </div>

                <button
                  type="submit"
                  disabled={isSubmittingBooking}
                  className="natural-btn-primary w-full py-5 text-[11px] font-black uppercase tracking-widest shadow-xl shadow-[#7D6B5D]/20 active:scale-95 transition-all flex items-center justify-center gap-2 disabled:opacity-60"
                >
                  {isSubmittingBooking ? (
                    <>
                      <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                      <span>Creating Booking & Sending Confirmation...</span>
                    </>
                  ) : (
                    <>
                      <CheckCircle2 size={15} />
                      <span>
                        {autoSendConfirmationEmail && formData.customerEmail && formData.depositPaid && Number(formData.depositAmount) > 0
                          ? 'Create Booking & Dispatch Confirmation + Receipt'
                          : autoSendConfirmationEmail && formData.customerEmail
                          ? 'Create Booking & Send Confirmation'
                          : 'Create Booking'}
                      </span>
                    </>
                  )}
                </button>
              </div>
            </form>
          </motion.div>
        )}
      </AnimatePresence>

      <div className="flex flex-col lg:flex-row gap-3 justify-between items-stretch lg:items-center bg-[#FDF2F5] p-3 rounded-[24px] border border-[#F2C8D1]/60 shadow-xs">
        <div className="flex flex-col md:flex-row gap-3 items-stretch md:items-center w-full lg:w-auto">
          <div className="relative w-full md:w-64">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-[#B8939C] w-3.5 h-3.5" />
            <input 
              type="text" 
              placeholder="Search..."
              className="w-full pl-9 pr-4 py-2 bg-white border border-transparent rounded-xl outline-none focus:border-[#D87085] transition-all text-xs text-[#2D1A20]"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>

          <select 
            className="bg-white border-0 rounded-xl px-4 py-2 text-xs font-bold text-[#4A252C] shadow-xs focus:ring-1 focus:ring-[#D87085] appearance-none cursor-pointer min-w-[140px]"
            value={filterType}
            onChange={(e) => setFilterType(e.target.value as any)}
          >
            <option value="all">All Experiences</option>
            <option value="workshop">Workshops</option>
            <option value="ceramic">Ceramic Painting</option>
          </select>

          <select 
            className="bg-white border-0 rounded-xl px-4 py-2 text-xs font-bold text-[#4A252C] shadow-xs focus:ring-1 focus:ring-[#D87085] appearance-none cursor-pointer min-w-[140px]"
            value={selectedMonth}
            onChange={(e) => setSelectedMonth(e.target.value)}
          >
            <option value="ALL">All Months</option>
            {availableMonths.map(m => {
               const [year, month] = m.split('-');
               const label = new Date(parseInt(year), parseInt(month) - 1).toLocaleString('default', { month: 'long', year: 'numeric' });
               return <option key={m} value={m}>{label}</option>;
            })}
          </select>
        </div>
      </div>

      <div className="flex bg-[#FDF2F5] p-1 rounded-2xl w-full max-w-xl mx-auto shadow-inner border border-[#F2C8D1]/50">
        {(['active', 'pending', 'history'] as const).map((tab) => (
          <button
            key={tab}
            onClick={() => setActiveTab(tab)}
            className={`flex-1 py-3 rounded-xl text-[10px] font-black uppercase tracking-[0.15em] transition-all duration-300 relative ${
              activeTab === tab 
                ? 'bg-white text-[#D87085] shadow-xs' 
                : 'text-[#8C6B75] hover:text-[#2D1A20]'
            }`}
          >
            {tab === 'active' ? 'Active Sessions' : tab === 'pending' ? 'Pending Collection' : 'History'}
            {activeTab === tab && (
              <motion.div 
                layoutId="activeTab"
                className="absolute -bottom-1 left-1/2 -translate-x-1/2 w-1.5 h-1.5 bg-[#D87085] rounded-full"
              />
            )}
          </button>
        ))}
      </div>

      <AnimatePresence mode="wait">
        <motion.div
          key={activeTab}
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -10 }}
          transition={{ duration: 0.2 }}
        >
          {activeTab === 'active' && (
            <div className="space-y-6">
              <div className="px-6 flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className="w-1.5 h-1.5 rounded-full bg-amber-500 animate-pulse" />
                  <h3 className="text-[10px] font-black uppercase tracking-[0.2em] text-[#8C8379]">Active Sessions (Pending Settlement)</h3>
                </div>
                <span className="text-[9px] font-black uppercase text-[#A69D94]">{activePendingSettlement.length} records in studio</span>
              </div>
              
              <div className="space-y-8">
                {renderTable(activePendingSettlement, 'Active Sessions')}
              </div>
            </div>
          )}

          {activeTab === 'pending' && (
            <div className="space-y-12">
              {renderPendingCollectionGrid(pendingCollection, 'Ready for Glaze/Firing/Pick-up')}
              {pendingCollection.length === 0 && (
                <div className="bg-white rounded-[24px] border border-[#D9D1C7] p-20 text-center">
                   <p className="text-[11px] font-black uppercase tracking-widest text-[#D9D1C7]">No items pending collection</p>
                </div>
              )}
            </div>
          )}

          {activeTab === 'history' && (
            <div className="space-y-8">
              <div className="px-6 text-center">
                <h3 className="text-2xl font-serif italic text-[#8C8379]">Completed History</h3>
                <p className="text-[10px] text-[#A69D94] font-black uppercase tracking-[0.2em] mt-1">Archived records of collected ceramic arts ({historyCurrent.length})</p>
              </div>
              <div className="opacity-80">
                {renderTable((showAllFinalized || search || selectedMonth !== 'ALL') ? historyCurrent : historyCurrent.slice(0, 3), 'Completed History')}
                {historyCurrent.length === 0 && (
                  <div className="bg-white rounded-[24px] border border-[#D9D1C7] p-20 text-center">
                     <p className="text-[11px] font-black uppercase tracking-widest text-[#D9D1C7]">History is empty</p>
                  </div>
                )}
              </div>

              {historyCurrent.length > 3 && !showAllFinalized && !search && selectedMonth === 'ALL' && (
                <div className="flex justify-center pt-4">
                  <button 
                    onClick={() => setShowAllFinalized(!showAllFinalized)}
                    className="natural-btn-secondary px-8 py-3 text-[10px] font-black uppercase tracking-[0.2em]"
                  >
                    {showAllFinalized ? 'Show Less History' : `See All ${historyCurrent.length} Records`}
                  </button>
                </div>
              )}
            </div>
          )}
        </motion.div>
      </AnimatePresence>

      <AnimatePresence>
        {activePiecesId && (
          <motion.div 
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-[70] flex items-center justify-center p-4 bg-black/40 backdrop-blur-sm"
            onClick={() => setActivePiecesId(null)}
          >
            <motion.div 
              initial={{ scale: 0.95, opacity: 0, y: 20 }}
              animate={{ scale: 1, opacity: 1, y: 0 }}
              exit={{ scale: 0.95, opacity: 0, y: 20 }}
              className="bg-white rounded-[40px] border border-[#D9D1C7] shadow-2xl p-6 md:p-8 max-w-2xl w-full max-h-[85vh] flex flex-col"
              onClick={e => e.stopPropagation()}
            >
              {(() => {
                const booking = bookings.find(b => b.id === activePiecesId);
                if (!booking) return null;

                return (
                  <>
                    <div className="flex justify-between items-center mb-6">
                      <div className="flex items-center gap-3">
                        <div className="w-10 h-10 rounded-2xl bg-[#F2EFE9] flex items-center justify-center text-[#2D241E]">
                          <Package size={20} />
                        </div>
                        <div>
                          <h4 className="text-xl font-serif italic text-[#2D241E]">Collection Items</h4>
                          <p className="text-[9px] text-[#8C8379] font-black uppercase tracking-widest">{booking.customerName} - {booking.finishedPieces?.length || 0} Pieces</p>
                        </div>
                      </div>
                      <button 
                        onClick={() => setActivePiecesId(null)}
                        className="p-2 hover:bg-[#FAF9F6] rounded-full text-[#8C8379]"
                      >
                        <XCircle />
                      </button>
                    </div>

                    <div className="flex-1 overflow-y-auto pr-2 space-y-4 mb-6">
                      {booking.finishedPieces?.map((piece, index) => (
                        <div key={piece.id} className="p-4 bg-[#FAF9F6] rounded-[24px] border border-[#D9D1C7]/30 flex flex-col md:flex-row gap-4">
                          <div className="w-full md:w-32 h-32 flex-shrink-0 relative group">
                            <input 
                              type="file" 
                              id={`piece-photo-${piece.id}`}
                              className="hidden" 
                              accept="image/*"
                              onChange={(e) => {
                                const file = e.target.files?.[0];
                                if (file) handlePiecePhotoUpload(booking.id!, piece.id, file);
                              }}
                            />
                            <label 
                              htmlFor={`piece-photo-${piece.id}`}
                              className={`block w-full h-full rounded-2xl border-2 border-dashed transition-all cursor-pointer overflow-hidden relative ${
                                piece.photoUrl ? 'border-transparent' : 'border-[#D9D1C7] hover:border-[#8C8379]'
                              }`}
                            >
                              {piece.photoUrl ? (
                                <>
                                  <img src={piece.photoUrl} className="w-full h-full object-cover" referrerPolicy="no-referrer" />
                                  <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
                                    <Camera className="text-white" size={20} />
                                  </div>
                                </>
                              ) : (
                                <div className="h-full flex flex-col items-center justify-center text-[#D9D1C7]">
                                  <Camera size={24} />
                                  <span className="text-[8px] font-black uppercase tracking-tighter mt-1">Add Photo</span>
                                </div>
                              )}
                            </label>
                          </div>
                          
                          <div className="flex-1 space-y-2">
                            <div className="flex justify-between items-center">
                              <span className="text-[10px] font-black text-[#8C8379] uppercase tracking-widest">Piece #{index + 1} Remarks</span>
                              {!booking.isCollected && (
                                <button 
                                  onClick={() => removeFinishedPiece(booking.id!, piece.id)}
                                  className="text-[9px] font-bold text-red-400 hover:text-red-600 transition-colors"
                                >
                                  Remove
                                </button>
                              )}
                            </div>
                            <textarea 
                              disabled={booking.isCollected}
                              className="natural-input w-full h-20 text-xs resize-none bg-white p-3"
                              placeholder="e.g. Medium bowl with floral pattern..."
                              value={piece.remarks}
                              onChange={(e) => updatePieceRemarks(booking.id!, piece.id, e.target.value)}
                            />
                          </div>
                        </div>
                      ))}

                      {(!booking.finishedPieces || booking.finishedPieces.length === 0) && (
                        <div className="py-12 text-center border-2 border-dashed border-[#D9D1C7]/30 rounded-[32px]">
                          <Package className="w-10 h-10 text-[#D9D1C7] mx-auto mb-3 opacity-50" />
                          <p className="text-[10px] font-black uppercase tracking-widest text-[#8C8379]">No pieces recorded yet</p>
                        </div>
                      )}
                    </div>

                    {!booking.isCollected && (
                      <div className="flex gap-3">
                        <button 
                          onClick={() => addFinishedPiece(booking.id!)}
                          className="flex-1 py-4 bg-[#F2EFE9] hover:bg-[#D9D1C7]/50 text-[#4A3F35] rounded-2xl text-[10px] font-black uppercase tracking-widest transition-all shadow-sm flex items-center justify-center gap-2"
                        >
                          <Plus size={14} /> Add Another Piece
                        </button>
                        <button 
                          onClick={() => {
                            if ((booking.finishedPieces?.length || 0) > 0) {
                              updateDoc(doc(db, 'bookings', booking.id!), { readyForCollection: true });
                            }
                            setActivePiecesId(null);
                          }}
                          className="flex-1 py-4 bg-[#2D241E] text-white rounded-2xl text-[10px] font-black uppercase tracking-widest hover:bg-black transition-all shadow-lg"
                        >
                          Save & Finish
                        </button>
                      </div>
                    )}
                  </>
                );
              })()}
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      <AnimatePresence>
        {paintingInstructionsId && (
          <motion.div 
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-[60] flex items-center justify-center p-4 bg-black/40 backdrop-blur-sm"
            onClick={() => setPaintingInstructionsId(null)}
          >
            <motion.div 
              initial={{ scale: 0.95, opacity: 0, y: 20 }}
              animate={{ scale: 1, opacity: 1, y: 0 }}
              exit={{ scale: 0.95, opacity: 0, y: 20 }}
              className="bg-white rounded-[40px] border border-[#D9D1C7] shadow-2xl p-6 md:p-8 max-w-lg w-full max-h-[90vh] overflow-y-auto custom-scrollbar"
              onClick={e => e.stopPropagation()}
            >
              {(() => {
                const booking = bookings.find(b => b.id === paintingInstructionsId);
                if (!booking) return null;

                return (
                  <div className="space-y-6">
                    <div className="flex justify-between items-center">
                      <div className="flex items-center gap-3">
                        <div className="w-10 h-10 rounded-2xl bg-[#F2EFE9] flex items-center justify-center text-[#2D241E]">
                          <ImageIcon size={20} />
                        </div>
                        <div>
                          <h4 className="text-xl font-serif italic text-[#2D241E]">Painting Instructions</h4>
                          <p className="text-[9px] text-[#8C8379] font-black uppercase tracking-widest">{booking.customerName} - {booking.workshopName}</p>
                        </div>
                      </div>
                      <button 
                        onClick={() => setPaintingInstructionsId(null)}
                        className="p-2 hover:bg-[#FAF9F6] rounded-full text-[#8C8379]"
                      >
                        <XCircle />
                      </button>
                    </div>

                    <div className="space-y-4">
                      {/* Image Upload Area */}
                      <div className="space-y-2">
                        <label className="text-[10px] font-black uppercase text-[#8C8379] tracking-widest block px-1">Ceramic Piece Photo</label>
                        <div className="relative group">
                          <input 
                            type="file" 
                            id="instruction-photo"
                            className="hidden" 
                            accept="image/*"
                            onChange={(e) => {
                              const file = e.target.files?.[0];
                              if (file) handleInstructionsImageUpload(booking.id!, file);
                            }}
                          />
                          <label 
                            htmlFor="instruction-photo"
                            className={`block w-full h-48 rounded-3xl border-2 border-dashed transition-all cursor-pointer overflow-hidden relative ${
                              booking.paintingInstructionsImage 
                                ? 'border-transparent' 
                                : 'border-[#D9D1C7] hover:border-[#8C8379] bg-[#FAF9F6]'
                            }`}
                          >
                            {booking.paintingInstructionsImage ? (
                              <>
                                <img src={booking.paintingInstructionsImage} className="w-full h-full object-cover" referrerPolicy="no-referrer" />
                                <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
                                  <div className="text-white flex flex-col items-center gap-2">
                                    <Camera size={24} />
                                    <span className="text-[10px] font-black uppercase tracking-widest">Replace Photo</span>
                                  </div>
                                </div>
                              </>
                            ) : (
                              <div className="h-full flex flex-col items-center justify-center gap-3 text-[#A69D94]">
                                <Camera size={32} />
                                <div className="text-center px-6">
                                  <p className="text-[10px] font-black uppercase tracking-widest">Take or Upload Photo</p>
                                  <p className="text-[9px] mt-1 font-medium italic">Record the piece before painting</p>
                                </div>
                              </div>
                            )}
                          </label>
                        </div>
                      </div>

                      {/* Remarks Field */}
                      <div className="space-y-2">
                        <label className="text-[10px] font-black uppercase text-[#8C8379] tracking-widest block px-1">Color Remarks & Requirements</label>
                        <textarea 
                          className="natural-input w-full h-32 resize-none leading-relaxed"
                          placeholder="Example: Customer wants matte pastel blue for the base, glossy white for the rim... etc"
                          value={booking.paintingInstructionsRemarks || ''}
                          onChange={(e) => updateDoc(doc(db, 'bookings', booking.id!), { paintingInstructionsRemarks: e.target.value })}
                        />
                      </div>

                      <div className="flex gap-3">
                        <button 
                          onClick={() => setPaintingInstructionsId(null)}
                          className="flex-1 py-4 bg-[#2D241E] text-white rounded-2xl text-[10px] font-black uppercase tracking-widest hover:bg-black transition-all shadow-lg active:scale-95"
                        >
                          Save Instructions
                        </button>
                      </div>
                    </div>
                  </div>
                );
              })()}
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      <ConfirmationModal 
        isOpen={deleteConfirm.isOpen}
        onClose={() => setDeleteConfirm({ isOpen: false, id: null })}
        onConfirm={() => {
          if (deleteConfirm.id) deleteBooking(deleteConfirm.id);
        }}
        title="Delete Booking"
        message="Are you sure you want to permanently delete this booking record? This action cannot be undone."
      />

      <ConfirmationModal 
        isOpen={revertSessionConfirm.isOpen}
        onClose={() => setRevertSessionConfirm({ isOpen: false, booking: null })}
        onConfirm={() => {
          if (revertSessionConfirm.booking) {
            handleRevertToActiveSession(revertSessionConfirm.booking);
            setRevertSessionConfirm({ isOpen: false, booking: null });
          }
        }}
        title="Revert to Active Session"
        message={`Are you sure you want to revert ${revertSessionConfirm.booking?.customerName}'s booking back to an Active Session? This will delete the recorded balance settlement transactions, and restore stock for any ceramic items in the session.`}
      />

      <ConfirmationModal 
        isOpen={revertHandoverConfirm.isOpen}
        onClose={() => setRevertHandoverConfirm({ isOpen: false, booking: null })}
        onConfirm={() => {
          if (revertHandoverConfirm.booking) {
            handleRevertToPendingCollection(revertHandoverConfirm.booking);
            setRevertHandoverConfirm({ isOpen: false, booking: null });
          }
        }}
        title="Revert Hand Over"
        message={`Are you sure you want to revert the handover for ${revertHandoverConfirm.booking?.customerName}'s booking and move it back to Pending Collection?`}
      />

      <AnimatePresence>
        {refundTarget && (
          <motion.div 
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/20 backdrop-blur-sm"
          >
            <motion.div 
              initial={{ scale: 0.95, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.95, opacity: 0 }}
              className="bg-white rounded-[40px] border border-[#D9D1C7] shadow-2xl p-6 md:p-8 max-w-md w-full max-h-[90vh] overflow-y-auto custom-scrollbar"
              onClick={e => e.stopPropagation()}
            >
              <div className="space-y-6">
                <div className="flex justify-between items-center">
                  <div>
                    <h4 className="text-xl font-serif italic text-[#2D241E]">Process Refund</h4>
                    <p className="text-[10px] text-[#8C8379] font-black uppercase tracking-widest">{refundTarget.customerName}</p>
                  </div>
                  <button onClick={() => setRefundTarget(null)}><XCircle className="text-[#8C8379]" /></button>
                </div>

                <div className="space-y-4">
                  <div className="space-y-2">
                    <label className="text-[10px] font-black uppercase text-[#8C8379] tracking-widest block px-1">Refund Amount (RM)</label>
                    <input 
                      type="number"
                      className="natural-input w-full"
                      value={refundData.amount}
                      onChange={(e) => setRefundData({ ...refundData, amount: Number(e.target.value) })}
                    />
                  </div>
                  
                  <div className="space-y-2">
                    <label className="text-[10px] font-black uppercase text-[#8C8379] tracking-widest block px-1">Reason for Refund</label>
                    <textarea 
                      className="natural-input w-full h-20 resize-none"
                      placeholder="e.g. Booking cancellation, overpayment..."
                      value={refundData.reason}
                      onChange={(e) => setRefundData({ ...refundData, reason: e.target.value })}
                    />
                  </div>

                  <div className="p-4 bg-red-50 rounded-2xl border border-red-100">
                    <p className="text-[10px] text-red-600 font-bold leading-relaxed">
                      Warning: This will set the booking status to "Refunded" and record a negative transaction in the ledger. This action is permanent.
                    </p>
                  </div>

                  <button 
                     onClick={handleRefund}
                     disabled={refundData.amount <= 0}
                     className="w-full py-4 bg-red-500 text-white rounded-2xl text-sm font-black uppercase tracking-widest hover:bg-red-600 transition-colors shadow-lg shadow-red-200/50 disabled:opacity-50 disabled:shadow-none"
                  >
                     Confirm Refund
                  </button>
                </div>
              </div>
            </motion.div>
          </motion.div>
        )}

        {editingBooking && (
          <motion.div 
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/20 backdrop-blur-sm"
            onClick={() => setEditingBooking(null)}
          >
            <motion.div 
              initial={{ scale: 0.95, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.95, opacity: 0 }}
              className="bg-white rounded-[40px] border border-[#D9D1C7] shadow-2xl p-6 md:p-8 max-w-md w-full max-h-[90vh] overflow-y-auto custom-scrollbar"
              onClick={e => e.stopPropagation()}
            >
              <form onSubmit={handleSaveEditBooking} className="space-y-6">
                <div className="flex justify-between items-center">
                  <div>
                    <h4 className="text-xl font-serif italic text-[#2D241E]">Edit Booking Schedule</h4>
                    <p className="text-[10px] text-[#8C8379] font-black uppercase tracking-widest">{editingBooking.customerName}</p>
                  </div>
                  <button type="button" onClick={() => setEditingBooking(null)}><XCircle className="text-[#8C8379]" /></button>
                </div>

                <div className="space-y-4">
                  <div className="space-y-2">
                    <label className="text-[10px] font-black uppercase text-[#8C8379] tracking-widest block px-1 flex items-center gap-1.5">
                      <Calendar size={10} className="text-[#8B9A82]" /> Session Date
                    </label>
                    <input 
                      type="date"
                      required
                      className="natural-input w-full font-bold text-xs bg-white border-[#D9D1C7]/30"
                      value={editDateValue}
                      onChange={(e) => setEditDateValue(e.target.value)}
                    />
                  </div>
                  
                  <div className="space-y-2">
                    <label className="text-[10px] font-black uppercase text-[#8C8379] tracking-widest block px-1 flex items-center gap-1.5">
                      <Clock size={10} className="text-[#8B9A82]" /> Session Time
                    </label>
                    <input 
                      type="text"
                      placeholder="e.g. 10:00 AM, 2:00 PM"
                      className="natural-input w-full font-bold text-xs bg-white border-[#D9D1C7]/30"
                      value={editTimeValue}
                      onChange={(e) => setEditTimeValue(e.target.value)}
                    />
                  </div>

                  <button 
                     type="submit"
                     className="w-full py-4 bg-[#2D241E] text-white rounded-2xl text-sm font-black uppercase tracking-widest hover:bg-[#4A3F35] transition-colors shadow-lg shadow-[#2D241E]/20"
                  >
                     Save Changes
                  </button>
                </div>
              </form>
            </motion.div>
          </motion.div>
        )}

        {paymentConfirmTarget && (
          <motion.div 
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/20 backdrop-blur-sm"
            onClick={() => setPaymentConfirmTarget(null)}
          >
            <motion.div 
              initial={{ scale: 0.95, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.95, opacity: 0 }}
              className="bg-white rounded-[40px] border border-[#D9D1C7] shadow-2xl p-6 md:p-8 max-w-sm w-full"
              onClick={e => e.stopPropagation()}
            >
              <div className="space-y-6">
                <div className="flex justify-between items-center">
                  <div>
                    <h4 className="text-xl font-serif italic text-[#2D241E]">Confirm Payment</h4>
                    <p className="text-[10px] text-[#8C8379] font-black uppercase tracking-widest">{paymentConfirmTarget.customerName}</p>
                  </div>
                  <button onClick={() => setPaymentConfirmTarget(null)}><XCircle className="text-[#8C8379]" /></button>
                </div>

                <div className="p-5 bg-[#8B9A82]/10 rounded-2xl border border-[#8B9A82]/20 text-center space-y-2">
                  <p className="text-[9px] text-[#8C8379] font-black uppercase tracking-widest">Mark as Fully Paid</p>
                  <p className="text-3xl font-serif text-[#2D241E]">
                    RM{Math.max(0, (
                      (paymentConfirmTarget.paintingPrice || 0) + 
                      (paymentConfirmTarget.totalPrice || 0) + 
                      (paymentConfirmTarget.deliveryFee || 0) - 
                      ((paymentConfirmTarget.drinksDiscountCount ?? 0) * 10) - 
                      (paymentConfirmTarget.depositPaid ? (paymentConfirmTarget.depositAmount || 0) : 0)
                    )).toFixed(2)}
                  </p>
                  <p className="text-[8px] text-[#8C8379] font-medium leading-normal max-w-[240px] mx-auto">
                    Are you sure you have received payment of the outstanding amount for this session? This will record the payment in the selected date's reports.
                  </p>
                </div>

                <div className="space-y-2 p-4 bg-[#FAF9F6]/50 rounded-2xl border border-[#D9D1C7]/30">
                  <label className="text-[9px] font-black uppercase text-[#8C8379] tracking-widest block flex items-center gap-1.5 px-0.5">
                    <Calendar size={11} className="text-[#8B9A82]" /> Actual Payment Date
                  </label>
                  <input 
                    type="date"
                    required
                    className="natural-input w-full bg-white border-[#D9D1C7]/30 font-bold text-xs py-2 px-3 rounded-lg text-[#2D241E] focus:outline-none focus:border-[#8B9A82]"
                    value={actualPaidDate}
                    onChange={(e) => setActualPaidDate(e.target.value)}
                  />
                  <p className="text-[8px] text-[#A69D94] leading-normal font-medium px-0.5">
                    Specify the date when payment was actually received. The receipt/transaction date will reflect this.
                  </p>
                </div>

                <div className="flex gap-2.5">
                  <button 
                    onClick={() => setPaymentConfirmTarget(null)}
                    className="flex-1 py-4 bg-[#F2EFE9] text-[#8C8379] rounded-2xl text-[10px] font-black uppercase tracking-widest hover:bg-[#D9D1C7]/50 transition-all font-sans"
                  >
                    Cancel
                  </button>
                  <button 
                    onClick={async () => {
                      await handleMarkPaymentLaterAsPaid(paymentConfirmTarget, actualPaidDate);
                      setPaymentConfirmTarget(null);
                    }}
                    className="flex-1 py-4 bg-[#8B9A82] text-white rounded-2xl text-[10px] font-black uppercase tracking-widest hover:bg-[#728369] transition-all shadow-lg shadow-[#8B9A82]/15 font-sans"
                  >
                    Confirm Paid
                  </button>
                </div>
              </div>
            </motion.div>
          </motion.div>
        )}

        {/* Document Preview & Digital Dispatch Hub Modal (Matches POS.tsx) */}
        {previewDoc && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 sm:p-6 bg-black/60 backdrop-blur-xs overflow-y-auto">
            <motion.div
              initial={{ opacity: 0, scale: 0.95, y: 15 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 15 }}
              className="bg-white rounded-3xl w-full max-w-2xl max-h-[92vh] flex flex-col shadow-2xl overflow-hidden border border-[#D9D1C7]"
              onClick={(e) => e.stopPropagation()}
            >
              {/* Modal Top Header */}
              <div className="px-6 py-4 bg-[#2D241E] text-white flex items-center justify-between border-b border-white/10">
                <div className="flex items-center gap-3">
                  <div className="w-8 h-8 rounded-full bg-[var(--accent-primary)]/20 border border-[var(--accent-primary)]/40 flex items-center justify-center text-[var(--accent-primary)]">
                    <FileText size={16} />
                  </div>
                  <div>
                    <h3 className="font-serif italic text-lg leading-tight">Digital Document & Email Dispatch</h3>
                    <p className="text-[9px] font-black uppercase tracking-widest text-white/50">
                      Send receipt directly to customer email or WhatsApp
                    </p>
                  </div>
                </div>

                {/* Document Type Switcher Tabs & Close */}
                <div className="flex items-center gap-3">
                  <div className="flex bg-black/30 p-1 rounded-xl border border-white/10">
                    <button
                      type="button"
                      onClick={() => setPreviewDoc({ ...previewDoc, type: 'receipt' })}
                      className={`px-3 py-1 rounded-lg text-[9px] font-black uppercase tracking-wider transition-all ${
                        previewDoc.type === 'receipt'
                          ? 'bg-[var(--accent-primary)] text-white shadow-xs'
                          : 'text-white/60 hover:text-white'
                      }`}
                    >
                      Receipt
                    </button>
                    <button
                      type="button"
                      onClick={() => setPreviewDoc({ ...previewDoc, type: 'invoice' })}
                      className={`px-3 py-1 rounded-lg text-[9px] font-black uppercase tracking-wider transition-all ${
                        previewDoc.type === 'invoice'
                          ? 'bg-[var(--accent-primary)] text-white shadow-xs'
                          : 'text-white/60 hover:text-white'
                      }`}
                    >
                      Invoice
                    </button>
                  </div>

                  <button
                    type="button"
                    onClick={() => setPreviewDoc(null)}
                    className="p-1.5 text-white/70 hover:text-white rounded-full hover:bg-white/10 transition-colors"
                  >
                    <X size={18} />
                  </button>
                </div>
              </div>

              {/* Digital Dispatch Toolbar (Email / WhatsApp / Copy / Download) */}
              <div className="bg-white border-b border-[#E6E1DA] p-4 sm:p-5 space-y-3">
                <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-2">
                  <div className="flex items-center gap-2">
                    <span className="text-[9px] font-black uppercase tracking-wider text-[#8C8379]">
                      Dispatch Digital Receipt:
                    </span>
                    {emailActionFeedback && (
                      <span className="text-[10px] font-bold text-emerald-700 bg-emerald-50 border border-emerald-200 px-2.5 py-0.5 rounded-full animate-pulse">
                        {emailActionFeedback}
                      </span>
                    )}
                  </div>

                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={() => handleDownloadBookingPdf(previewDoc.booking, previewDoc.type)}
                      className="inline-flex items-center justify-center gap-1.5 px-3 py-1.5 bg-[#2D241E] hover:bg-[#43362E] text-white rounded-xl text-[10px] font-black uppercase tracking-wider transition-all shadow-xs"
                      title="Download official PDF receipt or invoice file"
                    >
                      <Download size={12} />
                      <span>Download PDF</span>
                    </button>

                    <button
                      type="button"
                      onClick={() => handleCopyReceiptText(previewDoc.booking, previewDoc.type)}
                      className="inline-flex items-center justify-center gap-1.5 px-3 py-1.5 bg-[#FAF9F6] hover:bg-[#F2EFE9] text-[#2D241E] border border-[#D9D1C7]/60 rounded-xl text-[10px] font-bold transition-all"
                      title="Copy full receipt text to clipboard"
                    >
                      {isCopied ? <CheckCheck size={13} className="text-emerald-600" /> : <Copy size={13} />}
                      <span>{isCopied ? 'Copied' : 'Copy Text'}</span>
                    </button>
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  {/* Email Dispatch Input & Action */}
                  <div className="flex items-center gap-1.5 bg-[#FAF9F6] border border-[#D9D1C7]/60 rounded-2xl p-1.5 focus-within:border-[var(--accent-primary)] focus-within:bg-white transition-all">
                    <div className="pl-2 text-[#8C8379]">
                      <Mail size={14} />
                    </div>
                    <input
                      type="email"
                      placeholder="Enter customer email..."
                      value={modalEmailInput}
                      onChange={(e) => setModalEmailInput(e.target.value)}
                      className="w-full bg-transparent text-xs text-[#2D241E] placeholder:text-[#A69D94] outline-none px-1"
                    />
                    <button
                      type="button"
                      disabled={isSendingEmail}
                      onClick={() => handleSendEmailReceipt(previewDoc.booking, previewDoc.type)}
                      className="px-3.5 py-2 bg-[var(--btn-primary)] hover:bg-[var(--btn-primary-hover)] text-white font-bold rounded-xl text-[10px] font-black uppercase tracking-wider transition-all whitespace-nowrap flex items-center gap-1.5 shadow-sm disabled:opacity-50"
                    >
                      {isSendingEmail ? (
                        <div className="w-3 h-3 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                      ) : (
                        <Send size={11} />
                      )}
                      <span>{isSendingEmail ? 'Sending...' : 'Send Email'}</span>
                    </button>
                  </div>

                  {/* WhatsApp Dispatch Input & Action */}
                  <div className="flex items-center gap-1.5 bg-[#FAF9F6] border border-[#D9D1C7]/60 rounded-2xl p-1.5 focus-within:border-emerald-600 focus-within:bg-white transition-all">
                    <div className="pl-2 text-emerald-700">
                      <Smartphone size={14} />
                    </div>
                    <input
                      type="tel"
                      placeholder="WhatsApp phone (e.g. 012-345 6789)..."
                      value={modalPhoneInput}
                      onChange={(e) => setModalPhoneInput(e.target.value)}
                      className="w-full bg-transparent text-xs text-[#2D241E] placeholder:text-[#A69D94] outline-none px-1"
                    />
                    <button
                      type="button"
                      onClick={() => handleSendWhatsAppReceipt(previewDoc.booking, previewDoc.type)}
                      className="px-3 py-2 bg-emerald-700 hover:bg-emerald-800 text-white rounded-xl text-[10px] font-black uppercase tracking-wider transition-all whitespace-nowrap flex items-center gap-1 shadow-xs"
                    >
                      <MessageSquare size={11} />
                      <span>WhatsApp</span>
                    </button>
                  </div>
                </div>
              </div>

              {/* Scrollable Paper-Style Preview */}
              <div className="p-6 overflow-y-auto bg-[#F4F1EA]/60 flex justify-center">
                <div className="bg-white rounded-2xl border border-[#D9D1C7] shadow-lg p-8 sm:p-10 max-w-xl w-full space-y-6 text-[#2D241E]">
                  {/* Studio Header */}
                  <div className="text-center pb-6 border-b border-dashed border-[#D9D1C7] space-y-1">
                    <h2 className="font-sans font-black uppercase tracking-wider text-2xl sm:text-3xl text-[#2D241E]">
                      {previewDoc.type === 'receipt' ? 'Official Receipt' : 'Tax Invoice'}
                    </h2>
                    <p className="text-[11px] font-black uppercase tracking-[3px] text-[#2D241E] pt-1">
                      NENDOA STUDIO ENTERPRISE
                    </p>
                    <p className="text-[9.5px] font-bold text-[#8C8379] tracking-wider">
                      SSM Reg No: 202403185935 (PG0558602-T)
                    </p>
                    <p className="text-[9px] text-[#8C8379] uppercase max-w-sm mx-auto leading-relaxed pt-1">
                      214, Lebuh Victoria,<br />
                      10300 Georgetown, Pulau Pinang
                    </p>
                  </div>

                  {(() => {
                    const docDetails = getBookingDocDetails(previewDoc.booking, previewDoc.type);
                    return (
                      <>
                        {/* Metadata Grid */}
                        <div className="grid grid-cols-2 gap-4 text-xs bg-[#FAF9F6] p-4 rounded-xl border border-[#E6E1DA]">
                          <div>
                            <span className="block text-[8.5px] font-black uppercase tracking-wider text-[#8C8379] mb-0.5">
                              {previewDoc.type === 'receipt' ? 'Sold To / Customer' : 'Bill To / Customer'}
                            </span>
                            <span className="font-bold text-sm text-[#2D241E] block">
                              {previewDoc.booking.customerName || 'Walk-in Customer'}
                            </span>
                            {(modalEmailInput || previewDoc.booking.customerEmail) && (
                              <span className="text-[9px] text-[#8C8379] font-mono flex items-center gap-1 mt-0.5">
                                <Mail size={10} className="text-[#C86A4B]" />
                                <span>{modalEmailInput || previewDoc.booking.customerEmail}</span>
                              </span>
                            )}
                            {(modalPhoneInput || previewDoc.booking.customerPhone) && (
                              <span className="text-[9px] text-[#8C8379] font-mono flex items-center gap-1 mt-0.5">
                                <Smartphone size={10} className="text-emerald-600" />
                                <span>{modalPhoneInput || previewDoc.booking.customerPhone}</span>
                              </span>
                            )}
                          </div>

                          <div className="text-right space-y-1.5">
                            <div>
                              <span className="block text-[8.5px] font-black uppercase tracking-wider text-[#8C8379]">
                                {previewDoc.type === 'receipt' ? 'Receipt Ref' : 'Invoice Ref'}
                              </span>
                              <span className="font-mono text-xs font-bold text-[#2D241E]">
                                {docDetails.docRef}
                              </span>
                            </div>
                            <div>
                              <span className="block text-[8.5px] font-black uppercase tracking-wider text-[#8C8379]">
                                Date & Time
                              </span>
                              <span className="text-[11px] font-semibold text-[#2D241E]">
                                {docDetails.dateStr}
                              </span>
                            </div>
                          </div>
                        </div>

                        {/* Line Items List (Separated by lines, no boxed table) */}
                        <div className="w-full">
                          <table className="w-full text-xs">
                            <thead className="border-y border-[#D9D1C7] text-[9px] font-black uppercase tracking-wider text-[#8C8379]">
                              <tr>
                                <th className="py-2.5 px-1 text-left">Item / Description</th>
                                <th className="py-2.5 px-1 text-center w-16">Qty</th>
                                <th className="py-2.5 px-1 text-right w-24">Unit Price (RM)</th>
                                <th className="py-2.5 px-1 text-right w-28">Total (MYR)</th>
                              </tr>
                            </thead>
                            <tbody className="divide-y divide-[#E6E1DA]">
                              {docDetails.items.map((item, idx) => (
                                <tr key={idx}>
                                  <td className="py-3 px-1 font-medium text-[#2D241E]">
                                    <strong className={item.isDeduction ? 'text-amber-700' : ''}>{item.name}</strong>
                                  </td>
                                  <td className="py-3 px-1 text-center font-mono text-[#2D241E]">
                                    {item.qty}
                                  </td>
                                  <td className="py-3 px-1 text-right font-mono text-[#8C8379]">
                                    {item.unitPrice < 0 ? `-RM ${Math.abs(item.unitPrice).toFixed(2)}` : `RM ${item.unitPrice.toFixed(2)}`}
                                  </td>
                                  <td className={`py-3 px-1 text-right font-mono font-bold ${item.isDeduction ? 'text-amber-700' : 'text-[#2D241E]'}`}>
                                    {item.total < 0 ? `-RM ${Math.abs(item.total).toFixed(2)}` : `RM ${item.total.toFixed(2)}`}
                                  </td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </div>

                        {/* Summary Totals (Separated with lines, no box) */}
                        <div className="flex justify-end pt-2">
                          <div className="w-64 space-y-1.5">
                            <div className="flex justify-between text-xs text-[#8C8379]">
                              <span>Subtotal</span>
                              <span className="font-mono text-[#2D241E]">RM {docDetails.subtotal.toFixed(2)}</span>
                            </div>
                            {docDetails.deposit > 0 && (
                              <div className="flex justify-between text-xs text-emerald-700 font-semibold">
                                <span>Minus Deposit</span>
                                <span className="font-mono">-RM {docDetails.deposit.toFixed(2)}</span>
                              </div>
                            )}
                            <div className="border-t border-[#D9D1C7] pt-2 flex justify-between items-baseline">
                              <span className="text-[10px] font-black uppercase tracking-wider text-[#2D241E]">
                                {previewDoc.type === 'invoice' ? 'Total Due' : 'Grand Total Paid'}
                              </span>
                              <span className="font-mono font-black text-2xl text-[#2D241E]">
                                RM {docDetails.totalDueOrPaid.toFixed(2)}
                              </span>
                            </div>
                          </div>
                        </div>

                        {/* Footer Notes */}
                        <div className="pt-4 border-t border-dashed border-[#D9D1C7] text-center space-y-1 text-[#8C8379]">
                          <p className="text-[9.5px] text-[#A69D94]">
                            Email: hello@nendoastudio.com | WhatsApp: +60 12-889 2030 | Web: nendoastudio.com
                          </p>
                          <p className="text-[10px] text-[#8C8379]">
                            Thank you for supporting handcrafted ceramic pottery.
                          </p>
                          <p className="text-[8.5px] uppercase font-bold tracking-widest text-[#2D241E]">
                            NENDOA STUDIO ENTERPRISE • Computer Generated {previewDoc.type === 'receipt' ? 'Official Receipt' : 'Tax Invoice'}
                          </p>
                        </div>
                      </>
                    );
                  })()}
                </div>
              </div>

              {/* Action Footer */}
              <div className="p-4 bg-[#FAF9F6] border-t border-[#D9D1C7]/70 flex flex-col sm:flex-row justify-between items-center gap-3">
                <span className="text-[10px] text-[#8C8379] font-medium">
                  Digital receipt ready for customer email or instant WhatsApp delivery.
                </span>

                <div className="flex items-center gap-2 w-full sm:w-auto">
                  <button
                    type="button"
                    onClick={() => setPreviewDoc(null)}
                    className="flex-1 sm:flex-none px-5 py-2 bg-white hover:bg-[#F2EFE9] text-[#2D241E] border border-[#D9D1C7] rounded-xl text-xs font-black uppercase tracking-wider transition-all"
                  >
                    Done / Close
                  </button>

                  <button
                    type="button"
                    onClick={() => downloadBookingReceiptPdf(previewDoc.booking, previewDoc.type, undefined, bookings)}
                    className="flex-1 sm:flex-none px-4 py-2 bg-[#2D241E] hover:bg-[#43362E] text-white rounded-xl text-xs font-black uppercase tracking-wider transition-all flex items-center justify-center gap-1.5 shadow-sm"
                  >
                    <Download size={14} />
                    <span>Download PDF</span>
                  </button>

                  <button
                    type="button"
                    disabled={isSendingEmail}
                    onClick={() => handleSendEmailReceipt(previewDoc.booking, previewDoc.type)}
                    className="flex-1 sm:flex-none px-5 py-2.5 bg-[var(--btn-primary)] hover:bg-[var(--btn-primary-hover)] text-white font-bold rounded-xl text-xs font-black uppercase tracking-wider shadow-md transition-all flex items-center justify-center gap-2 disabled:opacity-50"
                  >
                    <Mail size={15} />
                    <span>
                      {previewDoc.type === 'receipt' && previewDoc.booking.depositPaid && !previewDoc.booking.balancePaid
                        ? 'Email Confirmation + Receipt'
                        : 'Send PDF via Email'}
                    </span>
                  </button>

                  <button
                    type="button"
                    onClick={() => generateBookingDocument(previewDoc.type, previewDoc.booking)}
                    className="p-2 text-[#8C8379] hover:text-[#2D241E] hover:bg-white rounded-xl transition-all"
                    title="Manual Print (Optional)"
                  >
                    <Printer size={15} />
                  </button>
                </div>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      <SendEmailModal
        isOpen={Boolean(emailModalTarget)}
        onClose={() => setEmailModalTarget(null)}
        booking={emailModalTarget}
        defaultTemplate={emailDefaultTemplate}
      />

      {/* Floating Download Feedback Toast */}
      <AnimatePresence>
        {downloadNotice && (
          <motion.div
            initial={{ opacity: 0, y: 16, scale: 0.96 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 16, scale: 0.96 }}
            transition={{ duration: 0.2 }}
            className="fixed bottom-6 right-6 z-50 bg-[#2D241E] text-white px-4 py-3 rounded-2xl shadow-2xl flex items-center gap-3 border border-white/10"
          >
            <div className="w-2 h-2 rounded-full bg-[#8B9A82] animate-pulse" />
            <span className="text-xs font-bold tracking-wide">{downloadNotice}</span>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
