import React, { useState, useEffect } from 'react';
import { db } from '../firebase';
import { collection, onSnapshot, query, orderBy, limit, where, Timestamp, doc, updateDoc, deleteDoc, getDocs, getDoc } from 'firebase/firestore';
import { Transaction, OperationType, Booking } from '../types';
import { handleFirestoreError } from '../utils';
import { ConfirmationModal } from './ConfirmationModal';
import { 
  History, 
  Search,
  FileText,
  Receipt,
  Printer,
  Trash2,
  Pencil,
  X,
  Check,
  Download
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { format, startOfMonth, endOfMonth } from 'date-fns';
import { getTransactionDocRef } from '../utils/referenceNumber';
import { downloadTransactionReceiptPdf } from '../utils/pdfGenerator';

export default function Transactions({ branch = 'ALL', role = 'admin' }: { branch?: string, role?: string }) {
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [bookings, setBookings] = useState<Record<string, Booking>>({});
  const [search, setSearch] = useState('');
  const [typeFilter, setTypeFilter] = useState<'all' | 'sale' | 'deposit' | 'balance' | 'refund'>('all');
  const [viewMode, setViewMode] = useState<'standard' | 'profile'>('profile');
  const [showAllProfile, setShowAllProfile] = useState(false);
  const [showAllStandard, setShowAllStandard] = useState(false);
  const [selectedYear, setSelectedYear] = useState(new Date().getFullYear());
  const [selectedMonth, setSelectedMonth] = useState(new Date().getMonth());
  const [downloadNotice, setDownloadNotice] = useState<string | null>(null);

  const handleDownloadPdf = (tx: Transaction, type: 'invoice' | 'receipt') => {
    try {
      const booking = tx.relatedId ? bookings[tx.relatedId] : undefined;
      downloadTransactionReceiptPdf(tx, type, undefined, transactions, booking);
      const docName = type === 'invoice' ? 'Tax Invoice' : 'Official Receipt';
      setDownloadNotice(`✓ Downloaded ${docName} PDF`);
      setTimeout(() => {
        setDownloadNotice(null);
      }, 3200);
    } catch (err) {
      console.error('Error generating PDF download:', err);
    }
  };

  const years = Array.from({ length: 5 }, (_, i) => new Date().getFullYear() - i);
  const months = [
    'January', 'February', 'March', 'April', 'May', 'June',
    'July', 'August', 'September', 'October', 'November', 'December'
  ];

  const getDocumentHTML = (tx: Transaction, type: 'invoice' | 'receipt') => {
    const isInvoice = type === 'invoice';
    const docTitle = isInvoice ? 'Tax Invoice' : 'Official Receipt';
    
    // Find associated booking and its deposit transaction
    const booking = tx.relatedId ? bookings[tx.relatedId] : null;
    const depositTx = tx.type === 'balance' && tx.relatedId 
      ? transactions.find(t => t.relatedId === tx.relatedId && t.type === 'deposit')
      : null;

    let displayDateStr = '';
    if (isInvoice && booking) {
      const dateStringToParse = tx.type === 'deposit' 
        ? (booking.recordingDate || booking.date) 
        : (tx.type === 'balance' ? booking.settlementDate : null);

      if (dateStringToParse) {
        const parts = dateStringToParse.split('-');
        if (parts.length === 3) {
          const year = parseInt(parts[0], 10);
          const month = parseInt(parts[1], 10) - 1;
          const day = parseInt(parts[2], 10);
          const parsedDate = new Date(year, month, day);
          displayDateStr = format(parsedDate, 'dd MMM yyyy');
        } else {
          const parsedDate = new Date(dateStringToParse);
          if (!isNaN(parsedDate.getTime())) {
            displayDateStr = format(parsedDate, 'dd MMM yyyy');
          } else {
            displayDateStr = format(tx.timestamp instanceof Date ? tx.timestamp : new Date(tx.timestamp), 'dd MMM yyyy, hh:mm a');
          }
        }
      } else {
        displayDateStr = format(tx.timestamp instanceof Date ? tx.timestamp : new Date(tx.timestamp), 'dd MMM yyyy, hh:mm a');
      }
    } else {
      displayDateStr = format(tx.timestamp instanceof Date ? tx.timestamp : new Date(tx.timestamp), 'dd MMM yyyy, hh:mm a');
    }

    const ref = getTransactionDocRef(tx, type, transactions);

    return `
      <div class="receipt-card">
        <!-- Header -->
        <div class="receipt-header">
          <h1 class="doc-title">${docTitle}</h1>
          <div class="studio-name">NENDOA STUDIO ENTERPRISE</div>
          <div class="studio-sub">SSM Reg No: 202403185935 (PG0558602-T)</div>
          <div class="studio-sub">214, Lebuh Victoria, 10300 Georgetown, Pulau Pinang</div>
        </div>

        <div class="divider-dashed"></div>

        <!-- 2-Column Meta Grid -->
        <table class="meta-grid" style="width: 100%; border-collapse: collapse; margin-bottom: 20px;">
          <tr>
            <td class="meta-col" style="vertical-align: top; width: 55%; padding: 0;">
              <h4>${isInvoice ? 'BILL TO / CUSTOMER' : 'SOLD TO / CUSTOMER'}</h4>
              <div style="font-size: 13px; font-weight: 700; color: #2D241E; margin-top: 2px;">
                ${tx.customerName || 'Walk-in Customer'}
              </div>
              ${tx.customerPhone ? `<div style="font-size: 10.5px; color: #8C8379; font-family: monospace; margin-top: 2px;">${tx.customerPhone}</div>` : ''}
              ${tx.customerEmail ? `<div style="font-size: 10.5px; color: #8C8379; font-family: monospace; margin-top: 1px;">${tx.customerEmail}</div>` : ''}
            </td>
            <td class="meta-col" style="vertical-align: top; text-align: right; width: 45%; padding: 0;">
              <h4>${docTitle.toUpperCase()} REF</h4>
              <div style="font-family: monospace; font-size: 12px; font-weight: 700; color: #2D241E;">${ref}</div>
              <h4 style="margin-top: 8px;">DATE & TIME</h4>
              <div style="font-size: 11px; font-weight: 600; color: #2D241E;">${displayDateStr}</div>
            </td>
          </tr>
        </table>

        <!-- Table -->
        <table class="items-table">
          <thead>
            <tr>
              <th style="text-align: left;">Item / Description</th>
              <th style="text-align: center; width: 45px;">Qty</th>
              <th style="text-align: right; width: 95px;">Unit Price (RM)</th>
              <th style="text-align: right; width: 100px;">Total (MYR)</th>
            </tr>
          </thead>
          <tbody>
            ${tx.type === 'deposit' ? `
              <tr>
                <td>
                  <strong>Deposit: ${booking?.workshopName || tx.description}</strong>
                  <div style="font-size: 10.5px; color: #8C8379; margin-top: 2px;">
                    Scheduled Workshop: ${booking ? `${format(new Date(booking.date), 'dd MMM yyyy')}` : '---'} (${booking?.pax || 1} pax)
                  </div>
                </td>
                <td style="text-align: center; font-family: monospace;">1</td>
                <td style="text-align: right; font-family: monospace; color: #8C8379;">${tx.amount.toFixed(2)}</td>
                <td style="text-align: right; font-weight: 700; font-family: monospace;">RM ${tx.amount.toFixed(2)}</td>
              </tr>
            ` : tx.type === 'balance' && booking ? `
              <tr>
                <td>
                  <strong>${booking.workshopName}</strong>
                  <div style="font-size: 10.5px; color: #8C8379; margin-top: 2px;">
                    ${booking.workshopName?.toLowerCase().includes('ceramic painting') ? 'Selected Ceramic Pieces' : `Workshop Attendance (${booking.pax || 1} pax)`}
                  </div>
                </td>
                <td style="text-align: center; font-family: monospace;">${booking.pax || 1}</td>
                <td style="text-align: right; font-family: monospace; color: #8C8379;">
                  ${((booking.totalPrice || 0) / (booking.pax || 1)).toFixed(2)}
                </td>
                <td style="text-align: right; font-weight: 700; font-family: monospace;">
                  RM ${(booking.totalPrice || 0).toFixed(2)}
                </td>
              </tr>
              ${(booking.paintingPrice || 0) > 0 ? `
                <tr>
                  <td>
                    <strong>Add-on Ceramic Pieces / Colour Painting</strong>
                  </td>
                  <td style="text-align: center; font-family: monospace;">${booking.paintingPieces || 1}</td>
                  <td style="text-align: right; font-family: monospace; color: #8C8379;">
                    ${((booking.paintingPrice || 0) / (booking.paintingPieces || 1)).toFixed(2)}
                  </td>
                  <td style="text-align: right; font-weight: 700; font-family: monospace;">
                    RM ${(booking.paintingPrice || 0).toFixed(2)}
                  </td>
                </tr>
              ` : ''}
              ${(booking.deliveryFee || 0) > 0 ? `
                <tr>
                  <td>
                    <strong>Standard Delivery Courier Service</strong>
                  </td>
                  <td style="text-align: center; font-family: monospace;">1</td>
                  <td style="text-align: right; font-family: monospace; color: #8C8379;">${(booking.deliveryFee || 0).toFixed(2)}</td>
                  <td style="text-align: right; font-weight: 700; font-family: monospace;">RM ${(booking.deliveryFee || 0).toFixed(2)}</td>
                </tr>
              ` : ''}
              ${(() => {
                const discountCount = booking.drinksDiscountCount ?? 0;
                const discountAmount = discountCount * 10;
                return discountAmount > 0 ? `
                  <tr>
                    <td>
                      <strong style="color: #D44E4E;">Drinks Promotion Discount (${discountCount} items)</strong>
                    </td>
                    <td style="text-align: center; font-family: monospace;">${discountCount}</td>
                    <td style="text-align: right; font-family: monospace; color: #D44E4E;">-10.00</td>
                    <td style="text-align: right; font-weight: 700; font-family: monospace; color: #D44E4E;">- RM ${discountAmount.toFixed(2)}</td>
                  </tr>
                ` : '';
              })()}
              ${(booking && booking.depositPaid && (booking.depositAmount || 0) > 0) ? `
                <tr>
                  <td>
                    <strong style="color: #8B9A82;">Initial Deposit Deduction</strong>
                    <div style="font-size: 10.5px; color: #8C8379;">
                      ${depositTx ? `Paid on ${format(new Date(depositTx.timestamp), 'dd/MM/yyyy')} (${getTransactionDocRef(depositTx, 'receipt', transactions)})` : 'Advance deposit received'}
                    </div>
                  </td>
                  <td style="text-align: center; font-family: monospace;">1</td>
                  <td style="text-align: right; font-family: monospace; color: #8B9A82;">-${(booking.depositAmount || 0).toFixed(2)}</td>
                  <td style="text-align: right; font-weight: 700; font-family: monospace; color: #8B9A82;">- RM ${(booking.depositAmount || 0).toFixed(2)}</td>
                </tr>
              ` : ''}
            ` : `
              <tr>
                <td>
                  <strong>${getCleanDescription(tx.description, tx.type, [])}</strong>
                  <div style="font-size: 10.5px; color: #8C8379; margin-top: 2px;">Handcrafted Ceramics</div>
                </td>
                <td style="text-align: center; font-family: monospace;">${tx.quantity || 1}</td>
                <td style="text-align: right; font-family: monospace; color: #8C8379;">
                  ${((tx.unitPrice || (tx.amount / (tx.quantity || 1)))).toFixed(2)}
                </td>
                <td style="text-align: right; font-weight: 700; font-family: monospace;">RM ${tx.amount.toFixed(2)}</td>
              </tr>
            `}
          </tbody>
        </table>

        <!-- Summary Totals -->
        <div style="display: flex; justify-content: flex-end; margin-top: 14px;">
          <div class="summary-box">
            <div class="summary-line">
              <span>Subtotal</span>
              <span style="font-family: monospace;">RM ${tx.amount.toFixed(2)}</span>
            </div>
            <div class="summary-divider"></div>
            <div class="summary-line grand">
              <span>${isInvoice ? 'TOTAL DUE' : 'GRAND TOTAL PAID'}</span>
              <span class="grand-amount">RM ${tx.amount.toFixed(2)}</span>
            </div>
          </div>
        </div>

        <!-- Footer -->
        <div class="receipt-footer">
          <p>Email: hello@nendoastudio.com &nbsp;|&nbsp; WhatsApp: +60 12-889 2030 &nbsp;|&nbsp; Web: nendoastudio.com</p>
          <p style="font-size: 10px; color: #8C8379; margin-top: 4px;">
            Thank you for supporting handcrafted ceramic pottery.
          </p>
          <p class="footer-legal">
            NENDOA STUDIO ENTERPRISE &bull; COMPUTER GENERATED ${docTitle.toUpperCase()}
          </p>
        </div>
      </div>
    `;
  };

  const printDocument = (tx: Transaction | Transaction[], type: 'invoice' | 'receipt') => {
    const printWindow = window.open('', '_blank');
    if (!printWindow) return;

    const txs = Array.isArray(tx) ? tx : [tx];
    
    printWindow.document.write(`
      <!DOCTYPE html>
      <html>
        <head>
          <meta charset="utf-8" />
          <title>${type === 'invoice' ? 'Tax Invoice' : 'Official Receipt'} - Nendoa Studio</title>
          <link href="https://fonts.googleapis.com/css2?family=Cormorant+Garamond:ital,wght@1,600;1,700&family=Plus+Jakarta+Sans:wght@400;500;600;700;800&family=JetBrains+Mono:wght@500;700&display=swap" rel="stylesheet">
          <style>
            * { box-sizing: border-box; margin: 0; padding: 0; }
            body { 
              font-family: 'Plus Jakarta Sans', -apple-system, sans-serif; 
              color: #2D241E; 
              background: #F4F1EA; 
              line-height: 1.5; 
              padding: 30px 20px;
            }
            .receipt-card {
              max-width: 620px;
              margin: 0 auto 30px auto;
              background: #FFFFFF;
              border: 1px solid #E6E1DA;
              border-radius: 20px;
              padding: 36px 32px;
              box-shadow: 0 4px 20px rgba(45,36,30,0.05);
            }
            @media print {
              body { background: #FFFFFF; padding: 0; }
              .receipt-card {
                max-width: 100%;
                border: none;
                border-radius: 0;
                box-shadow: none;
                padding: 20px;
                page-break-after: always;
              }
            }
            .receipt-header { text-align: center; margin-bottom: 16px; }
            .doc-title {
              font-family: 'Inter', -apple-system, sans-serif;
              text-transform: uppercase;
              letter-spacing: 1px;
              font-size: 22px;
              font-weight: 900;
              color: #2D241E;
              margin-bottom: 4px;
            }
            .studio-name {
              font-size: 11px;
              font-weight: 800;
              letter-spacing: 2px;
              text-transform: uppercase;
              color: #2D241E;
            }
            .studio-sub {
              font-size: 9.5px;
              color: #8C8379;
              margin-top: 2px;
            }
            .divider-dashed {
              border-top: 1px dashed #D9D1C7;
              margin: 16px 0 18px 0;
            }
            .meta-col h4 {
              font-size: 8.5px;
              font-weight: 800;
              letter-spacing: 1.2px;
              text-transform: uppercase;
              color: #8C8379;
              margin-bottom: 2px;
            }
            .paid-badge {
              display: inline-block;
              margin-top: 8px;
              background: #F0F4EE;
              color: #556B2F;
              border: 1px solid #D5E2D0;
              padding: 2px 8px;
              border-radius: 6px;
              font-size: 9.5px;
              font-weight: 800;
              letter-spacing: 0.5px;
            }
            .items-table {
              width: 100%;
              border-collapse: collapse;
              margin: 20px 0;
            }
            .items-table th {
              background: transparent;
              border-top: 1px solid #D9D1C7;
              border-bottom: 1px solid #D9D1C7;
              font-size: 9px;
              font-weight: 800;
              text-transform: uppercase;
              letter-spacing: 1px;
              color: #8C8379;
              padding: 10px 4px;
            }
            .items-table td {
              padding: 12px 4px;
              border-bottom: 1px solid #E6E1DA;
              font-size: 12px;
              color: #2D241E;
            }
            .summary-box {
              width: 250px;
              padding: 4px 0;
            }
            .summary-line {
              display: flex;
              justify-content: space-between;
              font-size: 11.5px;
              color: #8C8379;
              padding: 3px 0;
            }
            .summary-divider {
              border-top: 1px solid #D9D1C7;
              margin: 8px 0;
            }
            .summary-line.grand {
              align-items: baseline;
              color: #2D241E;
              font-weight: 800;
              font-size: 10px;
              letter-spacing: 0.8px;
            }
            .grand-amount {
              font-family: 'JetBrains Mono', monospace;
              font-size: 18px;
              font-weight: 800;
              color: #2D241E;
            }
            .receipt-footer {
              margin-top: 24px;
              padding-top: 16px;
              border-top: 1px dashed #D9D1C7;
              text-align: center;
              font-size: 9.5px;
              color: #8C8379;
            }
            .footer-legal {
              font-size: 8.5px;
              font-weight: 800;
              letter-spacing: 1.5px;
              text-transform: uppercase;
              color: #2D241E;
              margin-top: 6px;
            }
          </style>
        </head>
        <body>
          ${txs.map(t => getDocumentHTML(t, type)).join('')}
          <script>
            window.onload = function() {
              window.print();
            };
          </script>
        </body>
      </html>
    `);
    printWindow.document.close();
  };

  useEffect(() => {
    const yearStart = startOfMonth(new Date(selectedYear, 0)).toISOString();
    const yearEnd = endOfMonth(new Date(selectedYear, 11)).toISOString();
    
    // Use ISO strings for query to match existing DB storage (strings)
    const q = query(
      collection(db, 'transactions'), 
      where('timestamp', '>=', yearStart),
      where('timestamp', '<=', yearEnd),
      orderBy('timestamp', 'desc')
    );
    
    const unsubscribe = onSnapshot(q, (snapshot) => {
      const docs = snapshot.docs.map(doc => {
        const data = doc.data();
        return { 
          id: doc.id, 
          ...data
        } as Transaction;
      });
      setTransactions(docs);

      // Fetch related bookings to enrich the data
      const relatedIds = Array.from(new Set(docs.map(t => t.relatedId).filter(Boolean))) as string[];
      if (relatedIds.length > 0) {
        // Fetch bookings in batches of 30 to stay within Firestore 'in' query limits
        const chunks: string[][] = [];
        for (let i = 0; i < relatedIds.length; i += 30) {
          chunks.push(relatedIds.slice(i, i + 30));
        }
        
        Promise.all(chunks.map(async (chunk) => {
          const qb = query(collection(db, 'bookings'), where('__name__', 'in', chunk));
          const bSnap = await getDocs(qb);
          const bMap: Record<string, Booking> = {};
          bSnap.docs.forEach(d => {
            bMap[d.id] = { id: d.id, ...d.data() } as Booking;
          });
          return bMap;
        })).then((results) => {
          const combined = results.reduce((acc, curr) => ({ ...acc, ...curr }), {});
          setBookings(prev => ({ ...prev, ...combined }));
        });
      }
    }, (error) => handleFirestoreError(error, OperationType.LIST, 'transactions'));

    return () => unsubscribe();
  }, [selectedYear]); // Re-subscribe only when year changes, filter months in-memory for zero latency

  const filteredTransactions = transactions.filter(t => {
    let matchesMonth = false;
    try {
      const txDate = new Date(t.timestamp);
      matchesMonth = txDate.getFullYear() === selectedYear && txDate.getMonth() === selectedMonth;
    } catch (e) {
      matchesMonth = false;
    }
    const matchesBranch = branch === 'ALL' || t.location === branch;
    const matchesSearch = t.description.toLowerCase().includes(search.toLowerCase()) || 
                          t.customerName.toLowerCase().includes(search.toLowerCase()) ||
                          (t.staffName && t.staffName.toLowerCase().includes(search.toLowerCase()));
    const matchesType = typeFilter === 'all' || t.type === typeFilter;
    return matchesMonth && matchesBranch && matchesSearch && matchesType && t.type !== 'deleted';
  });

  const totalAmount = filteredTransactions.reduce((acc, tx) => {
    return tx.type === 'refund' ? acc - tx.amount : acc + tx.amount;
  }, 0);

  // Helper to clean transaction descriptions as requested
  const getCleanDescription = (description: string, type: string, customerTxs: Transaction[]) => {
    // 1. Initial cleaning of common noise - aggressively strip info after "minus" or "Total"
    let clean = description
      .split(/(?:minus|Total)\s*rm/i)[0] 
      .replace(/^(Deposit for |Balance for |Deposit - |Balance - |Settlement for [^:]+:\s*|Settlement - |Settlement for |Payment for |Sale - |Refund - )/i, '')
      .trim();

    // 2. Extra piece/item extraction for settlements (item code and number)
    const piecesMatch = description.match(/Pieces:\s*([^.]+)/i);
    const piecesInfo = piecesMatch ? piecesMatch[1].trim() : '';

    // 3. Resolve "Balance" or "Settlement" to its "Deposit" counterpart if possible
    if (type === 'balance' || description.toLowerCase().includes('settlement')) {
      const baseName = clean.replace(/Workshop\s*RM\d+(\.\d+)?/i, '').replace(/^\+\s*/, '').trim();

      // Look for a transaction in this customer's history that looks like a deposit for this workshop
      const depositTx = customerTxs.find(t => 
        t.type === 'deposit' && 
        (t.description.toLowerCase().includes(baseName.toLowerCase()) || 
         (baseName && t.description.toLowerCase().includes(baseName.toLowerCase())))
      );

      if (depositTx) {
        // Use the deposit description but strip its prefix
        const depositTitle = depositTx.description
          .replace(/^(Deposit - |Deposit for |Balance - |Balance for |Sale - |Refund - )/i, '')
          .split(/(?:minus|Total)\s*rm/i)[0]
          .trim();
        
        return piecesInfo ? `${depositTitle} + ${piecesInfo}` : depositTitle;
      }
      
      const finalBase = baseName || "Workshop";
      return piecesInfo ? `${finalBase} + ${piecesInfo}` : finalBase;
    }

    return clean || "Workshop";
  };

  const [isDeleting, setIsDeleting] = useState<string | null>(null);
  const [deleteConfirm, setDeleteConfirm] = useState<{ isOpen: boolean; id: string | null }>({ isOpen: false, id: null });

  const [editModal, setEditModal] = useState<{
    isOpen: boolean;
    transaction: Transaction | null;
  }>({ isOpen: false, transaction: null });

  // State for edit form:
  const [editName, setEditName] = useState('');
  const [editPhone, setEditPhone] = useState('');
  const [editAmount, setEditAmount] = useState<number>(0);
  const [editDate, setEditDate] = useState(''); // YYYY-MM-DD
  const [editType, setEditType] = useState<Transaction['type']>('balance');
  const [editDescription, setEditDescription] = useState('');
  const [editStaffName, setEditStaffName] = useState('');
  const [editBalancePaid, setEditBalancePaid] = useState(true);
  const [editDepositPaid, setEditDepositPaid] = useState(true);
  const [isSaving, setIsSaving] = useState(false);

  const handleOpenEdit = (tx: Transaction) => {
    let dateStr = '';
    try {
      const timestampVal = tx.timestamp;
      const d = new Date(timestampVal);
      if (!isNaN(d.getTime())) {
        dateStr = d.toISOString().split('T')[0];
      }
    } catch (e) {
      console.error(e);
    }

    setEditModal({ isOpen: true, transaction: tx });
    setEditName(tx.customerName || '');
    setEditPhone(tx.customerPhone || '');
    setEditAmount(tx.amount || 0);
    setEditDate(dateStr);
    setEditType(tx.type || 'balance');
    setEditDescription(tx.description || '');
    setEditStaffName(tx.staffName || '');
    
    // Check related booking
    if (tx.relatedId && bookings[tx.relatedId]) {
      const booking = bookings[tx.relatedId];
      setEditBalancePaid(booking.balancePaid ?? false);
      setEditDepositPaid(booking.depositPaid ?? false);
    } else {
      setEditBalancePaid(tx.type === 'balance');
      setEditDepositPaid(tx.type === 'deposit');
    }
  };

  const handleSaveEdit = async () => {
    if (!editModal.transaction) return;
    setIsSaving(true);
    try {
      const tx = editModal.transaction;
      
      // Preserve original time part if existing
      let finalTimestamp = editDate;
      if (editDate) {
        const originalTime = tx.timestamp && typeof tx.timestamp === 'string' && tx.timestamp.includes('T') 
          ? tx.timestamp.split('T')[1] 
          : '12:00:00.000Z';
        finalTimestamp = `${editDate}T${originalTime}`;
      } else {
        finalTimestamp = tx.timestamp;
      }

      // Update related booking if exist
      if (tx.relatedId) {
        const bookingRef = doc(db, 'bookings', tx.relatedId);
        const bookingUpdates: any = {
          customerName: editName,
          customerPhone: editPhone,
        };

        if (editType === 'balance') {
          bookingUpdates.balancePaid = editBalancePaid;
          bookingUpdates.settlementDate = editBalancePaid ? editDate : '';
          bookingUpdates.status = editBalancePaid ? 'settled' : 'confirmed';
        } else if (editType === 'deposit') {
          bookingUpdates.depositPaid = editDepositPaid;
          bookingUpdates.recordingDate = editDate;
          bookingUpdates.status = editDepositPaid ? 'confirmed' : 'pending';
        }

        await updateDoc(bookingRef, bookingUpdates);
      }

      // Update the transaction itself
      const txRef = doc(db, 'transactions', tx.id!);
      await updateDoc(txRef, {
        customerName: editName,
        customerPhone: editPhone,
        amount: Number(editAmount) || 0,
        timestamp: finalTimestamp,
        type: editType,
        description: editDescription,
        staffName: editStaffName
      });

      setEditModal({ isOpen: false, transaction: null });
    } catch (error) {
      console.error('Failed to save transaction:', error);
      alert('Edit failed. Please check connection or schema requirements.');
      handleFirestoreError(error, OperationType.UPDATE, `transactions/${editModal.transaction.id}`);
    } finally {
      setIsSaving(false);
    }
  };

  const deleteTransaction = async (id: string) => {
    setIsDeleting(id);
    try {
      const tx = transactions.find(t => t.id === id);
      if (tx && tx.relatedId) {
        const bookingRef = doc(db, 'bookings', tx.relatedId);
        const bookingSnap = await getDoc(bookingRef);
        if (bookingSnap.exists()) {
          const bookingData = bookingSnap.data() as Booking;
          const updates: any = {};
          if (tx.type === 'balance') {
            updates.balancePaid = false;
            updates.settlementDate = '';
            updates.status = bookingData.depositPaid ? 'confirmed' : 'pending';
          } else if (tx.type === 'deposit') {
            updates.depositPaid = false;
            updates.status = 'pending';
          }
          await updateDoc(bookingRef, updates);
        }
      }
      await deleteDoc(doc(db, 'transactions', id));
      // No need to alert success as onSnapshot will automatically update the UI
    } catch (error) {
      console.error('Delete failed:', error);
      alert('Delete failed. Please check your permissions or connection.');
      handleFirestoreError(error, OperationType.DELETE, `transactions/${id}`);
    } finally {
      setIsDeleting(null);
    }
  };

  // Profile calculation - Group by Customer (Name + Phone to avoid collisions)
  // 1. Identify all customers actively transacting in the currently filtered month/filters
  const activeCustomerKeys = new Set(
    filteredTransactions
      .filter(t => t.customerName && !t.customerName.startsWith('Walk-in Customer'))
      .map(t => `${t.customerName || 'Unknown'} - ${t.customerPhone || ''}`)
  );

  // 2. Group ALL transactions of the selected year for those active customers
  const profileGroups = transactions.reduce((acc, tx) => {
    const customerKey = `${tx.customerName || 'Unknown'} - ${tx.customerPhone || ''}`;
    if (activeCustomerKeys.has(customerKey) && tx.type !== 'deleted') {
      if (!acc[customerKey]) acc[customerKey] = [];
      acc[customerKey].push(tx);
    }
    return acc;
  }, {} as Record<string, Transaction[]>);

  const profileData = (Object.entries(profileGroups) as [string, Transaction[]][])
    .filter(([key]) => !key.startsWith('Walk-in Customer'))
    .sort(([, txsA], [, txsB]) => {
      const latestA = Math.max(...txsA.map(t => new Date(t.timestamp).getTime()));
      const latestB = Math.max(...txsB.map(t => new Date(t.timestamp).getTime()));
      return latestB - latestA;
    });

  const displayProfileData = showAllProfile ? profileData : profileData.slice(0, 5);
  const displayStandardData = showAllStandard ? filteredTransactions : filteredTransactions.slice(0, 5);

  return (
    <div className="space-y-6">
      {/* Header Section */}
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
        <div>
          <h1 className="text-2xl font-serif italic text-[#2D241E]">Transactions</h1>
          <p className="text-[10px] font-black uppercase tracking-widest text-[#8C8379] mt-1">
            Studio Financial Records • {months[selectedMonth]} {selectedYear}
          </p>
        </div>
        
        <div className="bg-[#2D241E] px-6 py-4 rounded-[24px] text-white shadow-xl flex items-center gap-4 min-w-[200px] relative overflow-hidden group">
          <div className="relative z-10">
            <p className="text-[9px] font-black uppercase tracking-widest text-white/50 mb-0.5">Total Revenue</p>
            <div className="text-2xl font-serif italic">RM{totalAmount.toFixed(2)}</div>
          </div>
          <History className="text-white/10 absolute -right-2 -bottom-2 group-hover:scale-110 transition-transform" size={60} />
        </div>
      </div>

      {/* Toolbar Section */}
      <div className="bg-white p-2 rounded-3xl border border-[#D9D1C7]/30 shadow-sm space-y-2">
        <div className="flex flex-col lg:flex-row gap-2">
          {/* Main Controls Row */}
          <div className="flex flex-1 flex-wrap items-center gap-2">
            {/* View Selection */}
            <div className="flex bg-[#F2EFE9]/50 rounded-xl p-1 border border-[#D9D1C7]/20">
              {(['profile', 'standard'] as const).map(m => (
                <button 
                  key={m}
                  onClick={() => setViewMode(m)}
                  className={`px-4 py-1.5 rounded-lg text-[10px] font-black uppercase tracking-wider transition-all ${viewMode === m ? 'bg-[#2D241E] text-white shadow-sm' : 'text-[#8C8379] hover:text-[#2D241E]'}`}
                >
                  {m === 'standard' ? 'List' : m}
                </button>
              ))}
            </div>

            {/* Date Range Selection */}
            <div className="flex gap-1 bg-[#F2EFE9]/50 rounded-xl p-1 border border-[#D9D1C7]/20">
              <select 
                value={selectedMonth}
                onChange={(e) => setSelectedMonth(parseInt(e.target.value) || 0)}
                className="px-3 py-1.5 bg-transparent text-[10px] font-black uppercase tracking-wider text-[#2D241E] focus:outline-none cursor-pointer"
              >
                {months.map((m, i) => (
                  <option key={m} value={i}>{m}</option>
                ))}
              </select>
              <select 
                value={selectedYear}
                onChange={(e) => setSelectedYear(parseInt(e.target.value) || new Date().getFullYear())}
                className="px-3 py-1.5 bg-transparent text-[10px] font-black uppercase tracking-wider text-[#2D241E] focus:outline-none cursor-pointer border-l border-[#D9D1C7]/30"
              >
                {years.map(y => (
                  <option key={y} value={y}>{y}</option>
                ))}
              </select>
            </div>

            {/* Print Bulk Actions */}
            <div className="flex gap-1 ml-auto">
              <button 
                onClick={() => printDocument(filteredTransactions, 'invoice')}
                disabled={filteredTransactions.length === 0}
                className="flex items-center gap-2 px-4 py-2 rounded-xl bg-white border border-[#D9D1C7]/50 text-[10px] font-black uppercase tracking-wider text-[#8C8379] hover:text-[#2D241E] hover:border-[#2D241E] transition-all disabled:opacity-30"
              >
                <Printer size={12} />
                <span>Bulk Invoice</span>
              </button>
              <button 
                onClick={() => printDocument(filteredTransactions, 'receipt')}
                disabled={filteredTransactions.length === 0}
                className="flex items-center gap-2 px-4 py-2 rounded-xl bg-white border border-[#D9D1C7]/50 text-[10px] font-black uppercase tracking-wider text-[#8C8379] hover:text-[#2D241E] hover:border-[#2D241E] transition-all disabled:opacity-30"
              >
                <Receipt size={12} />
                <span>Bulk Receipt</span>
              </button>
            </div>
          </div>
        </div>

        {/* Filter Row */}
        <div className="flex flex-col md:flex-row gap-2 border-t border-[#F2EFE9] pt-2 mt-1">
          <div className="relative flex-1 group">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-[#A69D94] group-focus-within:text-[#2D241E] transition-colors" size={14} />
            <input 
              type="text" 
              placeholder="Search by name, description, or staff..."
              className="w-full pl-9 pr-4 py-2 bg-[#F2EFE9]/30 border border-transparent rounded-xl text-xs outline-none focus:bg-white focus:border-[#D9D1C7]/50 transition-all"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>

          <div className="flex gap-1 overflow-x-auto pb-1 md:pb-0 scrollbar-hide">
            {(['all', 'sale', 'deposit', 'balance', 'refund'] as const).map(f => (
              <button
                key={f}
                onClick={() => setTypeFilter(f)}
                className={`px-4 py-2 rounded-xl text-[10px] font-black uppercase tracking-wider transition-all whitespace-nowrap ${
                  typeFilter === f ? 'bg-[#2D241E] text-white shadow-sm' : 'bg-[#F2EFE9]/40 text-[#8C8379] hover:bg-[#F2EFE9] hover:text-[#2D241E]'
                }`}
              >
                {f}
              </button>
            ))}
          </div>
        </div>
      </div>

      <div className="bg-white rounded-[32px] border border-[var(--border-app)] flex flex-col overflow-hidden shadow-xs">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm border-collapse">
            <thead>
               <tr className="bg-[var(--bg-header)] text-[var(--text-header)] uppercase text-[9px] font-black tracking-widest border-b border-[var(--border-app)]">
                <th className="px-6 py-4">
                  {viewMode === 'profile' ? 'Customer Profile' : 'Timestamp'}
                </th>
                {viewMode === 'profile' ? (
                  <>
                    <th className="px-3 py-3 w-[25%] lg:w-[200px]">Experience</th>
                    <th className="px-3 py-3 w-[45%] lg:w-[350px]">Payment Status</th>
                    <th className="px-3 py-3 text-right w-[30%] lg:w-[120px]">Total Paid</th>
                  </>
                ) : (
                  <>
                    <th className="px-6 py-4">Type</th>
                    <th className="px-6 py-4">Details</th>
                    <th className="px-6 py-4">Staff</th>
                    <th className="px-6 py-4 text-right">Amount</th>
                    <th className="px-6 py-4 text-right">Actions</th>
                  </>
                )}
              </tr>
            </thead>
            <tbody className="divide-y divide-[#D9D1C7]/10">
              {viewMode === 'profile' ? 
                displayProfileData.map(([key, txs], idx) => {
                  const customerName = txs[0]?.customerName || 'Unknown';
                  const customerPhone = txs[0]?.customerPhone || '';
                  
                  const workshopNames = Array.from(new Set(txs.map(tx => {
                    return getCleanDescription(tx.description, tx.type, txs);
                  }))).filter(n => n !== 'Workshop' || txs.length === 1);

                  const deposits = txs.filter(t => t.type === 'deposit');
                  const balances = txs.filter(t => t.type === 'balance');
                  const refunds = txs.filter(t => t.type === 'refund');

                  return (
                    <tr key={idx} className="hover:bg-[var(--bg-subtle)] border-b border-[var(--border-app)]/30 group align-top">
                      <td className="px-3 py-2">
                        <div className="text-[11px] font-black text-[#2D241E] uppercase tracking-tighter pt-1">{customerName}</div>
                        {customerPhone && (
                          <div className="text-[8px] text-[#A69D94] font-bold tracking-tighter">{customerPhone}</div>
                        )}
                      </td>
                      <td className="px-3 py-2">
                        <div className="flex flex-wrap gap-1 pt-1">
                          {workshopNames.length > 0 ? workshopNames.map((name, wIdx) => (
                            <span key={wIdx} className="text-[9px] font-bold text-[#4A3F35] bg-[#F2EFE9]/60 px-2 py-0.5 rounded-md whitespace-nowrap">
                              {name}
                            </span>
                          )) : <span className="text-[9px] text-[#A69D94] italic">Workshop</span>}
                        </div>
                      </td>
                      <td className="px-3 py-2">
                        <div className="flex gap-3 max-w-[420px]">
                          {/* Consolidated Deposit Section */}
                          <div className="w-[130px] shrink-0 space-y-1">
                            <div className="flex items-center gap-1.5 opacity-60">
                              <div className={`w-1 h-1 rounded-full ${deposits.length > 0 ? 'bg-[#8B9A82]' : 'bg-amber-400'}`} />
                              <span className="text-[8px] font-black uppercase tracking-tighter text-[#8C8379]">Depo</span>
                            </div>
                            {deposits.length > 0 ? (
                              <div className="space-y-1">
                                {deposits.map((d, dIdx) => (
                                  <div key={dIdx} className="group/btn flex items-center justify-between">
                                    <div className="flex items-center gap-1">
                                      <span className="text-[10px] font-black text-[#8B9A82]">RM{d.amount.toFixed(0)}</span>
                                      <span className="text-[8px] text-[#A69D94] font-medium opacity-50">{format(new Date(d.timestamp), 'dd/MM')}</span>
                                    </div>
                                    <div className="flex gap-0.5">
                                      <button 
                                        onClick={() => handleDownloadPdf(d, 'invoice')} 
                                        className="p-1 hover:bg-[#F2EFE9] rounded text-[#8C8379] hover:text-[#2D241E] active:scale-95 transition-all" 
                                        title="Download Tax Invoice (PDF)"
                                      >
                                        <FileText size={10} />
                                      </button>
                                      <button 
                                        onClick={() => handleDownloadPdf(d, 'receipt')} 
                                        className="p-1 hover:bg-[#F2EFE9] rounded text-[#8C8379] hover:text-[#2D241E] active:scale-95 transition-all" 
                                        title="Download Official Receipt (PDF)"
                                      >
                                        <Receipt size={10} />
                                      </button>
                                      <button onClick={() => handleOpenEdit(d)} className="p-1 hover:bg-[#F2EFE9] rounded text-[#8C8379] hover:text-[#2D241E] active:scale-95 transition-all" title="Edit"><Pencil size={10} /></button>
                                    </div>
                                  </div>
                                ))}
                              </div>
                            ) : (() => {
                              // Infer deposit from balance descriptions
                              const inferred = balances.reduce((sum, b) => {
                                const m = b.description.match(/minus\s*rm\s*(\d+)/i);
                                return sum + (m ? parseFloat(m[1]) : 0);
                              }, 0);
                              
                              if (inferred > 0) {
                                  return (
                                    <div className="flex items-center gap-1.5 py-0.5">
                                      <span className="text-[10px] font-black text-[#8B9A82]">RM{inferred.toFixed(0)}</span>
                                      <span className="text-[7px] text-[#A69D94] font-black uppercase tracking-tighter opacity-50">Pre</span>
                                    </div>
                                  );
                              }
                              
                              return balances.length > 0 ? (
                                <span className="text-[9px] font-black text-[#8C8379] uppercase italic opacity-30">Walk-in</span>
                              ) : (
                                refunds.length === 0 && <span className="text-[9px] font-black text-amber-500/50 uppercase">Pending</span>
                              );
                            })()}
                          </div>

                          {/* Consolidated Balance Section */}
                          <div className="w-[150px] shrink-0 space-y-1 border-l border-[#F2EFE9] pl-3">
                            <div className="flex items-center gap-1.5 opacity-60">
                              <div className={`w-1 h-1 rounded-full ${balances.length > 0 ? 'bg-[#7D6B5D]' : 'bg-gray-300'}`} />
                              <span className="text-[8px] font-black uppercase tracking-tighter text-[#8C8379]">Bal</span>
                            </div>
                            {balances.length > 0 ? (
                              <div className="space-y-1">
                                {balances.map((b, bIdx) => (
                                  <div key={bIdx} className="group/btn flex items-center justify-between">
                                    <div className="flex items-center gap-1">
                                      <span className="text-[10px] font-black text-[#7D6B5D]">RM{b.amount.toFixed(0)}</span>
                                      <span className="text-[8px] text-[#A69D94] font-medium opacity-50">{format(new Date(b.timestamp), 'dd/MM')}</span>
                                    </div>
                                    <div className="flex gap-0.5">
                                      <button 
                                        onClick={() => handleDownloadPdf(b, 'invoice')} 
                                        className="p-1 hover:bg-[#F2EFE9] rounded text-[#8C8379] hover:text-[#2D241E] active:scale-95 transition-all" 
                                        title="Download Tax Invoice (PDF)"
                                      >
                                        <FileText size={10} />
                                      </button>
                                      <button 
                                        onClick={() => handleDownloadPdf(b, 'receipt')} 
                                        className="p-1 hover:bg-[#F2EFE9] rounded text-[#8C8379] hover:text-[#2D241E] active:scale-95 transition-all" 
                                        title="Download Official Receipt (PDF)"
                                      >
                                        <Receipt size={10} />
                                      </button>
                                      <button onClick={() => handleOpenEdit(b)} className="p-1 hover:bg-[#F2EFE9] rounded text-[#8C8379] hover:text-[#2D241E] active:scale-95 transition-all" title="Edit"><Pencil size={10} /></button>
                                      <button 
                                        disabled={isDeleting === b.id}
                                        onClick={() => setDeleteConfirm({ isOpen: true, id: b.id! })} 
                                        className={`p-1 rounded text-[#8C8379]/40 hover:text-red-400 ${isDeleting === b.id ? 'animate-pulse' : 'hover:bg-red-50'}`} 
                                        title="Delete"
                                      >
                                        <Trash2 size={10} />
                                      </button>
                                    </div>
                                  </div>
                                ))}
                              </div>
                            ) : (
                              refunds.length === 0 && <span className="text-[9px] font-black text-[#D9D1C7] uppercase">Pending</span>
                            )}
                          </div>

                          {/* Consolidated Refund Section */}
                          {refunds.length > 0 && (
                            <div className="w-[110px] shrink-0 space-y-1 border-l border-[#F2EFE9] pl-3">
                              <div className="flex items-center gap-1.5 opacity-60">
                                <div className="w-1 h-1 rounded-full bg-purple-500" />
                                <span className="text-[8px] font-black uppercase tracking-tighter text-purple-500">Refund</span>
                              </div>
                              <div className="space-y-1">
                                {refunds.map((r, rIdx) => (
                                  <div key={rIdx} className="group/btn flex items-center justify-between">
                                    <div className="flex items-center gap-1">
                                      <span className="text-[10px] font-black text-purple-500">RM{r.amount.toFixed(0)}</span>
                                      <span className="text-[8px] text-[#A69D94] font-medium opacity-50">{format(new Date(r.timestamp), 'dd/MM')}</span>
                                    </div>
                                    <div className="flex gap-0.5">
                                      <button 
                                        onClick={() => handleDownloadPdf(r, 'invoice')} 
                                        className="p-1 hover:bg-[#F2EFE9] rounded text-[#8C8379] hover:text-[#2D241E] active:scale-95 transition-all" 
                                        title="Download Invoice / Credit Note (PDF)"
                                      >
                                        <FileText size={10} />
                                      </button>
                                      <button 
                                        onClick={() => handleDownloadPdf(r, 'receipt')} 
                                        className="p-1 hover:bg-[#F2EFE9] rounded text-[#8C8379] hover:text-[#2D241E] active:scale-95 transition-all" 
                                        title="Download Official Receipt (PDF)"
                                      >
                                        <Receipt size={10} />
                                      </button>
                                      <button onClick={() => handleOpenEdit(r)} className="p-1 hover:bg-[#F2EFE9] rounded text-[#8C8379] hover:text-[#2D241E] active:scale-95 transition-all" title="Edit"><Pencil size={10} /></button>
                                    </div>
                                  </div>
                                ))}
                              </div>
                            </div>
                          )}
                        </div>
                      </td>
                      <td className="px-3 py-2 text-right">
                        <div className="pt-1 flex flex-col items-end">
                          <span className="text-[11px] font-bold text-[#2D241E]">
                            RM{txs.reduce((s, t) => t.type === 'refund' ? s - t.amount : s + t.amount, 0).toFixed(2)}
                          </span>
                          {(() => {
                            const bookingIds = Array.from(new Set(txs.map(t => t.relatedId).filter(Boolean)));
                            // Note: This requires bookings to be available in Transactions.tsx or calculated differently.
                            // For now, let's just show it if we find it in the tx descriptions or logic.
                          })()}
                        </div>
                      </td>
                    </tr>
                  );
                })
               : 
                displayStandardData.map((tx) => (
                <tr key={tx.id} className="hover:bg-[var(--bg-subtle)] transition-colors group">
                  <td className="px-6 py-4">
                    <div className="text-[11px] font-bold text-[#2D241E]">
                      {format(new Date(tx.timestamp), 'dd/MM/yy')}
                    </div>
                    <div className="text-[9px] text-[#A69D94] font-medium">
                      {format(new Date(tx.timestamp), 'HH:mm')}
                    </div>
                  </td>
                  <td className="px-6 py-4">
                    <span className={`
                      inline-flex px-2 py-0.5 rounded-lg text-[8px] font-black uppercase tracking-widest
                      ${tx.type === 'sale' ? 'bg-[#D9E2D9]/60 text-[#8B9A82]' : 
                        tx.type === 'deposit' ? 'bg-[#E8E2D9]/60 text-[#7D6B5D]' : 
                        tx.type === 'refund' ? 'bg-red-50 text-red-500/70 border border-red-100' :
                        'bg-[#F2EFE9] text-[#8C8379]'}
                    `}>
                      {tx.type}
                    </span>
                  </td>
                  <td className="px-6 py-4">
                    <div className="max-w-[220px]">
                      <p className="text-[11px] text-[#2D241E] font-bold truncate leading-none mb-1">
                        {getCleanDescription(tx.description, tx.type, filteredTransactions.filter(t => t.customerName === tx.customerName && t.customerPhone === tx.customerPhone))}
                      </p>
                      <p className="text-[10px] text-[#8C8379] font-black uppercase tracking-tight truncate">{tx.customerName}</p>
                    </div>
                  </td>
                  <td className="px-6 py-4">
                    <div className="text-[10px] font-black uppercase text-[#8C8379] tracking-tighter">
                      {tx.staffName || '---'}
                    </div>
                  </td>
                  <td className="px-6 py-4 text-right">
                    <span className={`text-[11px] font-black ${tx.type === 'refund' ? 'text-red-500/70' : 'text-[#2D241E]'}`}>
                      {tx.type === 'refund' ? '-' : ''}RM{tx.amount.toFixed(2)}
                    </span>
                  </td>
                  <td className="px-6 py-4 text-right">
                                    <div className="flex justify-end gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                                      <button 
                                        onClick={() => handleDownloadPdf(tx, 'invoice')}
                                        className="p-1.5 text-[#8C8379] hover:text-[#2D241E] hover:bg-[#F2EFE9] rounded-lg active:scale-95 transition-all"
                                        title="Download Tax Invoice (PDF)"
                                      >
                                        <FileText size={12} />
                                      </button>
                                      <button 
                                        onClick={() => handleDownloadPdf(tx, 'receipt')}
                                        className="p-1.5 text-[#8C8379] hover:text-[#2D241E] hover:bg-[#F2EFE9] rounded-lg active:scale-95 transition-all"
                                        title="Download Official Receipt (PDF)"
                                      >
                                        <Receipt size={12} />
                                      </button>
                                      <button 
                                        onClick={() => handleOpenEdit(tx)}
                                        className="p-1.5 text-[#8C8379] hover:text-[#2D241E] hover:bg-[#F2EFE9] rounded-lg transition-all"
                                        title="Edit Transaction"
                                      >
                                        <Pencil size={12} />
                                      </button>
                                      <button 
                                        disabled={isDeleting === tx.id}
                                        onClick={() => setDeleteConfirm({ isOpen: true, id: tx.id! })}
                                        className={`p-1.5 rounded-lg transition-all ${isDeleting === tx.id ? 'text-red-500 animate-pulse' : 'text-red-400/50 hover:text-red-500 hover:bg-red-50'}`}
                                        title="Delete Transaction"
                                      >
                                        <Trash2 size={12} />
                                      </button>
                                    </div>
                                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {viewMode === 'profile' && profileData.length > 5 && (
          <div className="p-4 border-t border-[#D9D1C7]/10 flex justify-center">
            <button 
              onClick={() => setShowAllProfile(!showAllProfile)}
              className="px-6 py-2 bg-[#F2EFE9] text-[#8C8379] rounded-xl text-[10px] font-black uppercase tracking-widest hover:bg-[#2D241E] hover:text-white transition-all shadow-sm"
            >
              {showAllProfile ? 'Show Less' : `View All ${profileData.length} Profiles`}
            </button>
          </div>
        )}

        {viewMode === 'standard' && filteredTransactions.length > 5 && (
          <div className="p-4 border-t border-[#D9D1C7]/10 flex justify-center">
            <button 
              onClick={() => setShowAllStandard(!showAllStandard)}
              className="px-6 py-2 bg-[#F2EFE9] text-[#8C8379] rounded-xl text-[10px] font-black uppercase tracking-widest hover:bg-[#2D241E] hover:text-white transition-all shadow-sm"
            >
              {showAllStandard ? 'Show Less' : `View All ${filteredTransactions.length} Records`}
            </button>
          </div>
        )}
      </div>

      {/* Edit Transaction Modal */}
      {editModal.isOpen && editModal.transaction && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-6 bg-black/40 backdrop-blur-sm">
          <div className="bg-white rounded-[32px] shadow-2xl w-full max-w-xl overflow-hidden relative flex flex-col">
            <div className="bg-[#FAF9F6] p-6 border-b border-[#D9D1C7]/30 flex justify-between items-center">
              <div className="flex items-center gap-3">
                <div className="bg-[#2D241E] p-2 rounded-xl text-white">
                  <Pencil size={18} />
                </div>
                <div>
                  <h3 className="text-lg font-black text-[#2D241E] uppercase tracking-tight">Edit Transaction</h3>
                  <p className="text-[10px] uppercase font-bold tracking-widest text-[#8C8379]">Ref: {getTransactionDocRef(editModal.transaction, editModal.transaction.type === 'deposit' || editModal.transaction.type === 'sale' ? 'receipt' : 'invoice', transactions)}</p>
                </div>
              </div>
              <button 
                onClick={() => setEditModal({ isOpen: false, transaction: null })}
                className="p-1.5 text-[#8C8379] hover:text-[#2D241E] hover:bg-white rounded-full transition-all border border-[#D9D1C7]/30"
              >
                <X size={16} />
              </button>
            </div>

            <div className="p-6 space-y-4 max-h-[70vh] overflow-y-auto text-[#2D241E]">
              {/* Customer Info row */}
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-[9px] font-black uppercase tracking-widest text-[#8C8379] mb-1">Customer Name</label>
                  <input 
                    type="text"
                    required
                    value={editName}
                    onChange={(e) => setEditName(e.target.value)}
                    className="w-full bg-[#FAF9F6] border border-[#D9D1C7]/30 rounded-xl px-3 py-2 text-xs outline-none focus:ring-1 focus:ring-[#8B9A82]/50"
                  />
                </div>
                <div>
                  <label className="block text-[9px] font-black uppercase tracking-widest text-[#8C8379] mb-1">Customer Phone</label>
                  <input 
                    type="text"
                    value={editPhone}
                    onChange={(e) => setEditPhone(e.target.value)}
                    className="w-full bg-[#FAF9F6] border border-[#D9D1C7]/30 rounded-xl px-3 py-2 text-xs outline-none focus:ring-1 focus:ring-[#8B9A82]/50"
                  />
                </div>
              </div>

              {/* Amount and Date */}
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-[9px] font-black uppercase tracking-widest text-[#8C8379] mb-1">Amount (MYR)</label>
                  <input 
                    type="number"
                    step="0.01"
                    required
                    value={editAmount}
                    onChange={(e) => setEditAmount(Number(e.target.value))}
                    className="w-full bg-[#FAF9F6] border border-[#D9D1C7]/30 rounded-xl px-3 py-2 text-xs outline-none focus:ring-1 focus:ring-[#8B9A82]/50 font-mono"
                  />
                </div>
                <div>
                  <label className="block text-[9px] font-black uppercase tracking-widest text-[#8C8379] mb-1">Transaction / Settlement Date</label>
                  <input 
                    type="date"
                    required
                    value={editDate}
                    onChange={(e) => setEditDate(e.target.value)}
                    className="w-full bg-[#FAF9F6] border border-[#D9D1C7]/30 rounded-xl px-3 py-2 text-xs outline-none focus:ring-1 focus:ring-[#8B9A82]/50"
                  />
                </div>
              </div>

              {/* Type and Staff row */}
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-[9px] font-black uppercase tracking-widest text-[#8C8379] mb-1">Transaction Type</label>
                  <select 
                    value={editType}
                    onChange={(e) => setEditType(e.target.value as Transaction['type'])}
                    className="w-full bg-[#FAF9F6] border border-[#D9D1C7]/30 rounded-xl px-3 py-2 text-xs outline-none focus:ring-1 focus:ring-[#8B9A82]/50 cursor-pointer text-[#2D241E]"
                  >
                    <option value="deposit">deposit</option>
                    <option value="balance">balance (settlement)</option>
                    <option value="sale">sale</option>
                    <option value="refund">refund</option>
                  </select>
                </div>
                <div>
                  <label className="block text-[9px] font-black uppercase tracking-widest text-[#8C8379] mb-1">Staff Name</label>
                  <input 
                    type="text"
                    value={editStaffName}
                    onChange={(e) => setEditStaffName(e.target.value)}
                    placeholder="Staff in charge"
                    className="w-full bg-[#FAF9F6] border border-[#D9D1C7]/30 rounded-xl px-3 py-2 text-xs outline-none focus:ring-1 focus:ring-[#8B9A82]/50"
                  />
                </div>
              </div>

              {/* Description */}
              <div>
                <label className="block text-[9px] font-black uppercase tracking-widest text-[#8C8379] mb-1">Description / Notes</label>
                <textarea 
                  rows={2}
                  value={editDescription}
                  onChange={(e) => setEditDescription(e.target.value)}
                  className="w-full bg-[#FAF9F6] border border-[#D9D1C7]/30 rounded-xl px-3 py-2 text-xs outline-none focus:ring-1 focus:ring-[#8B9A82]/50 resize-none font-medium"
                />
              </div>

              {/* Booking Connection Sync */}
              {editModal.transaction.relatedId && bookings[editModal.transaction.relatedId] && (
                <div className="mt-2 p-4 bg-[#FAF9F6] border border-[#D9D1C7]/30 rounded-2xl space-y-3">
                  <div className="flex justify-between items-center pb-2 border-b border-[#D9D1C7]/20">
                    <span className="text-[10px] font-black uppercase tracking-widest text-[#2D241E]">Booking Sync Options</span>
                    <span className="text-[8px] px-2 py-0.5 font-bold uppercase tracking-widest text-emerald-600 bg-emerald-50 rounded">Booking Found</span>
                  </div>
                  <p className="text-[9px] text-[#8C8379] leading-tight">These options will automatically sync the booking status and settlement date when saving this transaction.</p>
                  
                  <div className="space-y-2">
                    {editType === 'balance' && (
                      <label className="flex items-center gap-2 cursor-pointer py-1">
                        <input 
                          type="checkbox"
                          checked={editBalancePaid}
                          onChange={(e) => setEditBalancePaid(e.target.checked)}
                          className="rounded border-[#D9D1C7]/30 text-[#2D241E] focus:ring-0 focus:ring-offset-0 cursor-pointer h-4 w-4"
                        />
                        <span className="text-[11px] font-bold text-[#4A3F35]">Booking Balance (Settlement) is Paid</span>
                      </label>
                    )}

                    {editType === 'deposit' && (
                      <label className="flex items-center gap-2 cursor-pointer py-1">
                        <input 
                          type="checkbox"
                          checked={editDepositPaid}
                          onChange={(e) => setEditDepositPaid(e.target.checked)}
                          className="rounded border-[#D9D1C7]/30 text-[#2D241E] focus:ring-0 focus:ring-offset-0 cursor-pointer h-4 w-4"
                        />
                        <span className="text-[11px] font-bold text-[#4A3F35]">Booking Deposit is Paid</span>
                      </label>
                    )}
                  </div>
                </div>
              )}
            </div>

            {/* Footer buttons */}
            <div className="p-6 bg-[#FAF9F6] border-t border-[#D9D1C7]/30 flex gap-3">
              <button
                type="button"
                disabled={isSaving}
                onClick={handleSaveEdit}
                className="flex-1 bg-[#2D241E] text-white py-3 rounded-xl font-black uppercase text-[10px] tracking-widest flex items-center justify-center gap-2 hover:bg-black transition-all shadow-sm active:scale-95 disabled:opacity-55"
              >
                {isSaving ? 'Saving...' : 'Save Changes'}
              </button>
              <button
                type="button"
                onClick={() => setEditModal({ isOpen: false, transaction: null })}
                className="flex-1 bg-white border border-[#D9D1C7] text-[#8C8379] py-3 rounded-xl font-black uppercase text-[10px] tracking-widest hover:bg-[#F2EFE9] transition-all"
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}

      <ConfirmationModal 
        isOpen={deleteConfirm.isOpen}
        onClose={() => setDeleteConfirm({ isOpen: false, id: null })}
        onConfirm={() => {
          if (deleteConfirm.id) deleteTransaction(deleteConfirm.id);
        }}
        title="Delete Transaction"
        message="Are you sure you want to permanently delete this transaction record? This action cannot be undone."
      />

      <AnimatePresence>
        {downloadNotice && (
          <motion.div
            initial={{ opacity: 0, y: 16, scale: 0.95 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 16, scale: 0.95 }}
            className="fixed bottom-6 right-6 z-50 bg-[#2D241E] text-white px-4 py-3 rounded-xl shadow-2xl border border-[#4A3F35] flex items-center gap-2.5 text-xs font-semibold tracking-wide"
          >
            <Download size={14} className="text-[#8B9A82] shrink-0" />
            <span>{downloadNotice}</span>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
