import React, { useState, useEffect } from 'react';
import { db } from '../firebase';
import { collection, onSnapshot, query, orderBy, where } from 'firebase/firestore';
import { CommissionPayment, Branch, OperationType } from '../types';
import { handleFirestoreError } from '../utils';
import { format, parseISO } from 'date-fns';
import { Receipt, Search, Calendar, User, Printer, X, ReceiptText } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';

interface PaymentHistoryProps {
  branch: Branch;
}

interface UnifiedVoucher {
  id: string;
  payee: string;
  amount: number;
  timestamp: string;
  location: Branch;
  month: string;
  originalData: CommissionPayment;
}

export default function PaymentHistory({ branch }: PaymentHistoryProps) {
  const [commissionPayments, setCommissionPayments] = useState<CommissionPayment[]>([]);
  const [search, setSearch] = useState('');
  const [selectedMonth, setSelectedMonth] = useState(format(new Date(), 'yyyy-MM'));
  const [selectedVoucher, setSelectedVoucher] = useState<UnifiedVoucher | null>(null);

  useEffect(() => {
    const qCommission = branch === 'ALL'
      ? collection(db, 'commissionPayments')
      : query(collection(db, 'commissionPayments'), where('location', '==', branch));

    const unsubCommission = onSnapshot(qCommission, (snapshot) => {
      setCommissionPayments(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as CommissionPayment)));
    }, (error) => handleFirestoreError(error, OperationType.LIST, 'commissionPayments'));

    return () => {
      unsubCommission();
    };
  }, [branch]);

  const unifiedVouchers: UnifiedVoucher[] = commissionPayments.map(p => ({
    id: p.id!,
    payee: p.staffName,
    amount: p.amount,
    timestamp: p.timestamp,
    location: p.location,
    month: p.month,
    originalData: p
  })).sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());

  const filteredVouchers = unifiedVouchers.filter(v => {
    const searchMatch = v.payee.toLowerCase().includes(search.toLowerCase()) || v.id.toLowerCase().includes(search.toLowerCase());
    const monthMatch = v.month === selectedMonth;
    return searchMatch && monthMatch;
  });

  const totalAmount = filteredVouchers.reduce((sum, v) => sum + v.amount, 0);

  const printBulk = () => {
    if (filteredVouchers.length === 0) return;
    
    const printWindow = window.open('', '_blank');
    if (!printWindow) return;

    const docHTML = (v: UnifiedVoucher) => {
      const typeLabel = 'Staff';
      const description = 'Commission Settlement';
      
      return `
        <div class="page" style="page-break-after: always; padding: 40px; font-family: 'Inter', sans-serif; max-width: 800px; margin: auto;">
          <div style="display: flex; justify-content: space-between; align-items: start; border-bottom: 2px solid #2D241E; padding-bottom: 20px; margin-bottom: 40px;">
            <div>
              <h1 style="font-size: 24px; font-weight: 900; text-transform: uppercase; margin: 0; letter-spacing: -1px; color: #2D241E;">Payment Voucher</h1>
              <p style="font-size: 9.5px; font-weight: 800; text-transform: uppercase; color: #8C8379; margin: 6px 0 2px 0; letter-spacing: 2px;">NENDOA STUDIO ENTERPRISE</p>
              <p style="font-size: 9px; font-weight: 700; color: #A69D94; margin: 0 0 6px 0; letter-spacing: 0.5px;">Reg No: 202403185935 (PG0558602-T)</p>
              <p style="font-size: 8.5px; font-weight: 500; color: #A69D94; margin: 0; line-height: 1.4; max-width: 450px; text-transform: uppercase; letter-spacing: 0.5px;">214, Lebuh Victoria,<br/>10300 Georgetown, Pulau Pinang</p>
            </div>
            <div style="text-align: right">
              <p style="font-size: 9px; font-weight: 800; text-transform: uppercase; color: #8C8379; margin: 0;">Ref Id</p>
              <p style="font-size: 12px; font-weight: 700; margin: 0; font-family: monospace;">#PV-${v.id.toUpperCase()}</p>
              <p style="font-size: 9px; font-weight: 800; text-transform: uppercase; color: #8C8379; margin: 10px 0 0 0;">Voucher Date</p>
              <p style="font-size: 11px; font-weight: 500; margin: 0;">${format(new Date(v.timestamp), 'dd MMM yyyy, HH:mm')}</p>
            </div>
          </div>

          <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 40px; margin-bottom: 40px;">
            <div>
              <p style="font-size: 9px; font-weight: 800; text-transform: uppercase; color: #8C8379; margin-bottom: 5px;">Paid From</p>
              <p style="font-size: 13px; font-weight: 700; color: #2D241E; margin: 0;">NENDOA STUDIO ENTERPRISE (${v.location})</p>
            </div>
            <div>
              <p style="font-size: 9px; font-weight: 800; text-transform: uppercase; color: #8C8379; margin-bottom: 5px;">Paid To (Payee)</p>
              <p style="font-size: 18px; font-weight: 700; color: #2D241E; margin: 0;">${v.payee} <span style="font-size: 10px; padding: 2px 8px; border: 1px solid #CCC; border-radius: 10px; vertical-align: middle; margin-left: 5px;">${typeLabel}</span></p>
            </div>
          </div>

          <table style="width: 100%; border-collapse: collapse; margin-bottom: 40px;">
            <thead>
              <tr style="border-bottom: 1px solid #2D241E;">
                <th style="text-align: left; padding: 10px 0; font-size: 10px; text-transform: uppercase; color: #8C8379;">Description</th>
                <th style="text-align: right; padding: 10px 0; font-size: 10px; text-transform: uppercase; color: #8C8379;">Amount (MYR)</th>
              </tr>
            </thead>
            <tbody>
              <tr>
                <td style="padding: 20px 0; font-size: 13px;">
                  <div style="font-weight: 700;">${description}</div>
                  <div style="font-size: 11px; color: #8C8379; margin-top: 5px;">Period: ${format(parseISO(v.month + '-01'), 'MMMM yyyy')}</div>
                </td>
                <td style="text-align: right; font-weight: 700; font-size: 16px;">RM ${v.amount.toFixed(2)}</td>
              </tr>
            </tbody>
            <tfoot>
              <tr style="border-top: 2px solid #2D241E;">
                <td style="padding: 20px 0; font-weight: 900; text-transform: uppercase; font-size: 11px;">Total Paid</td>
                <td style="text-align: right; padding: 20px 0; font-size: 24px; font-weight: 800;">RM ${v.amount.toFixed(2)}</td>
              </tr>
            </tfoot>
          </table>

          <div style="display: grid; grid-template-columns: 1fr 1fr 1fr; gap: 40px; margin-top: 60px;">
            <div style="border-top: 1px solid #D9D1C7; text-align: center; padding-top: 10px;">
              <p style="font-size: 8px; font-weight: 900; text-transform: uppercase; color: #8C8379; letter-spacing: 2px;">Prepared By</p>
            </div>
            <div style="border-top: 1px solid #D9D1C7; text-align: center; padding-top: 10px;">
              <p style="font-size: 8px; font-weight: 900; text-transform: uppercase; color: #8C8379; letter-spacing: 2px;">Authorized By</p>
            </div>
            <div style="border-top: 1px solid #D9D1C7; text-align: center; padding-top: 10px;">
              <p style="font-size: 8px; font-weight: 900; text-transform: uppercase; color: #8C8379; letter-spacing: 2px;">Receiver Signature</p>
            </div>
          </div>

          <div style="margin-top: 40px; text-align: center; font-size: 9px; color: #A69D94; border-top: 1px solid #EEE; padding-top: 20px;">
            <p>Computer Generated - No Signature Required for Authorization</p>
          </div>
        </div>
      `;
    };

    printWindow.document.write(`
      <html>
        <head>
          <title>Bulk Vouchers - NENDOA Pottery</title>
          <link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;700;900&display=swap" rel="stylesheet">
          <style>
            @media print { .page { page-break-after: always; } .no-print { display: none !important; } }
            .action-bar { padding: 16px; background: #FAF9F6; border-bottom: 1px solid #EEE; text-align: right; }
            .btn-print { background: #2D241E; color: #fff; border: none; padding: 8px 16px; border-radius: 8px; font-weight: 700; cursor: pointer; font-size: 12px; }
          </style>
        </head>
        <body style="margin: 0; padding: 0;">
          <div class="action-bar no-print">
            <button class="btn-print" onclick="window.print()">Print Vouchers</button>
          </div>
          ${filteredVouchers.map(v => docHTML(v)).join('')}
        </body>
      </html>
    `);
    printWindow.document.close();
  };

  return (
    <div className="space-y-6 pb-12">
      {/* Controls */}
      <div className="flex flex-col lg:flex-row gap-4 items-center justify-between bg-white p-4 rounded-[24px] border border-[#D9D1C7]/30 shadow-sm">
        <div className="flex flex-col md:flex-row gap-4 w-full lg:w-auto flex-1">
          <div className="relative w-full md:max-w-xs">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-[#A69D94]" size={14} />
            <input 
              type="text"
              placeholder="Search ref or payee..."
              className="w-full bg-[#FAF9F6] border border-[#D9D1C7]/30 rounded-xl pl-9 pr-4 py-2 text-xs outline-none focus:ring-1 focus:ring-[#8B9A82]/50"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>
        </div>

        <div className="flex items-center gap-2 w-full lg:w-auto">
          <button 
            onClick={printBulk}
            disabled={filteredVouchers.length === 0}
            title="Bulk Print Vouchers"
            className="p-2 text-[#8C8379] hover:text-[#2D241E] bg-[#FAF9F6] rounded-xl border border-[#D9D1C7]/30 hover:bg-white transition-all shadow-sm active:scale-95 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            <Printer size={16} />
          </button>
          <div className="bg-[#FAF9F6] border border-[#D9D1C7]/30 rounded-xl px-4 py-2 flex items-center gap-3 shadow-sm w-full md:w-auto">
            <Calendar size={14} className="text-[#8C8379]" />
            <input 
              type="month" 
              className="bg-transparent border-none text-[10px] font-black uppercase tracking-widest text-[#2D241E] focus:outline-none cursor-pointer"
              value={selectedMonth}
              onChange={(e) => setSelectedMonth(e.target.value)}
            />
          </div>
          <div className="hidden md:flex flex-col items-end px-2">
            <span className="text-[8px] font-black uppercase text-[#8C8379] tracking-widest">Total Vouchers</span>
            <span className="text-sm font-black text-[#2D241E]">RM {totalAmount.toFixed(2)}</span>
          </div>
        </div>
      </div>

      {/* History List */}
      <div className="bg-white rounded-[24px] border border-[#D9D1C7]/30 shadow-sm overflow-hidden">
        <div className="p-6 border-b border-[#D9D1C7]/10 flex justify-between items-center bg-[#FAF9F6]/30">
          <h3 className="text-xs font-black uppercase tracking-[0.2em] text-[#8C8379]">Payment Register</h3>
          <span className="text-[10px] font-bold text-[#A69D94]">{filteredVouchers.length} Vouchers found</span>
        </div>
        
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="bg-[var(--bg-header)] text-[var(--text-header)] border-b border-[var(--border-app)]">
                <th className="px-4 py-3 text-[9px] font-black uppercase tracking-widest">Date</th>
                <th className="px-4 py-3 text-[9px] font-black uppercase tracking-widest">Ref Id</th>
                <th className="px-4 py-3 text-[9px] font-black uppercase tracking-widest">Location</th>
                <th className="px-4 py-3 text-[9px] font-black uppercase tracking-widest">Type</th>
                <th className="px-4 py-3 text-[9px] font-black uppercase tracking-widest">Payee</th>
                <th className="px-4 py-3 text-right text-[9px] font-black uppercase tracking-widest">Amount</th>
                <th className="px-4 py-3 text-center text-[9px] font-black uppercase tracking-widest">Action</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[#D9D1C7]/10">
              {filteredVouchers.length > 0 ? filteredVouchers.map((v) => (
                <tr key={v.id} className="hover:bg-[#FAF9F6]/50 transition-colors group">
                  <td className="px-4 py-2">
                    <div className="flex flex-col">
                      <span className="text-[10px] font-bold text-[#2D241E]">{format(new Date(v.timestamp), 'dd MMM yyyy')}</span>
                      <span className="text-[7px] text-[#A69D94] font-black uppercase tracking-tighter">{format(new Date(v.timestamp), 'HH:mm')}</span>
                    </div>
                  </td>
                  <td className="px-4 py-2">
                    <span className="text-[9px] font-mono font-bold text-[#4A3F35] bg-[#F2EFE9] px-1.5 py-0.5 rounded">
                      #{v.id.slice(-8).toUpperCase()}
                    </span>
                  </td>
                  <td className="px-4 py-2">
                    <span className={`text-[9px] font-black px-1.5 py-0.5 rounded border ${
                      v.location === 'PG' ? 'text-purple-600 bg-purple-50 border-purple-100' : 'text-blue-600 bg-blue-50 border-blue-100'
                    }`}>
                      {v.location}
                    </span>
                  </td>
                  <td className="px-4 py-2">
                    <div className="flex items-center gap-1.5">
                      <div className="flex items-center gap-1 text-blue-600 bg-blue-50 px-1.5 py-0.5 rounded-full border border-blue-100 uppercase text-[7px] font-black tracking-widest">
                        <User size={8} /> Staff
                      </div>
                    </div>
                  </td>
                  <td className="px-4 py-2">
                    <span className="text-[10px] font-black text-[#2D241E] uppercase tracking-tight">{v.payee}</span>
                  </td>
                  <td className="px-4 py-2 text-right">
                    <span className="text-[11px] font-black text-[#2D241E]">
                      RM {v.amount.toFixed(2)}
                    </span>
                  </td>
                  <td className="px-4 py-2">
                    <div className="flex justify-center">
                      <button 
                        onClick={() => setSelectedVoucher(v)}
                        className="p-1 text-[#8C8379] hover:text-[#2D241E] hover:bg-white rounded-lg transition-all border border-transparent hover:border-[#D9D1C7]/30 shadow-sm"
                      >
                        <ReceiptText size={14} />
                      </button>
                    </div>
                  </td>
                </tr>
              )) : (
                <tr>
                  <td colSpan={7} className="px-6 py-32 text-center">
                    <div className="flex flex-col items-center gap-3 opacity-20">
                      <Receipt size={32} />
                      <p className="text-xs font-black uppercase tracking-widest">No payment history for this period</p>
                      {branch !== 'ALL' && (
                        <p className="text-[8px] font-bold uppercase tracking-tighter text-[#A69D94]">Switch to 'ALL' branch to see all vouchers</p>
                      )}
                    </div>
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Voucher Detail Modal */}
      <AnimatePresence>
        {selectedVoucher && (
          <div className="fixed inset-0 z-[100] flex items-center justify-center p-6 bg-black/40 backdrop-blur-sm">
            <motion.div
              initial={{ scale: 0.95, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.95, opacity: 0 }}
              className="bg-white rounded-[32px] shadow-2xl w-full max-w-2xl overflow-hidden relative flex flex-col max-h-[90vh]"
            >
              {/* Header */}
              <div className="bg-[#FAF9F6] p-8 border-b border-[#D9D1C7]/30 flex justify-between items-start">
                <div className="flex items-center gap-4">
                  <div className="bg-[#2D241E] p-3 rounded-2xl text-white">
                    <ReceiptText size={24} />
                  </div>
                  <div>
                    <h3 className="text-2xl font-black text-[#2D241E] uppercase tracking-tighter">Payment Voucher</h3>
                    <div className="mt-1">
                      <p className="text-[9.5px] font-black text-[#2D241E] uppercase tracking-wider">NENDOA STUDIO ENTERPRISE</p>
                      <p className="text-[9px] font-black uppercase tracking-widest text-[#8C8379]">202403185935 (PG0558602-T)</p>
                      <p className="text-[8.5px] font-medium uppercase tracking-wider text-[#8C8379] leading-relaxed max-w-md">214, Lebuh Victoria,<br />10300 Georgetown, Pulau Pinang</p>
                    </div>
                    <div className="flex flex-wrap items-center gap-3 mt-3">
                      <p className="text-[10px] font-black uppercase tracking-widest text-[#8C8379]">Ref: <span className="text-[#2D241E]">#PV-${selectedVoucher.id.toUpperCase()}</span></p>
                      <div className="w-[1px] h-3 bg-[#D9D1C7] hidden md:block" />
                      <p className="text-[10px] font-black uppercase tracking-widest text-[#8C8379]">Voucher Date: <span className="text-[#2D241E]">{format(new Date(selectedVoucher.timestamp), 'dd MMM yyyy, HH:mm')}</span></p>
                    </div>
                  </div>
                </div>
                <button 
                  onClick={() => setSelectedVoucher(null)}
                  className="p-2 text-[#8C8379] hover:text-[#2D241E] hover:bg-white rounded-full transition-all border border-[#D9D1C7]/30"
                >
                  <X size={20} />
                </button>
              </div>

              {/* Body */}
              <div className="flex-1 overflow-y-auto p-10 space-y-10">
                <div className="grid grid-cols-2 gap-12">
                  <div>
                    <p className="text-[9px] font-black uppercase tracking-widest text-[#8C8379] mb-1">Paid From</p>
                    <p className="text-sm font-bold text-[#2D241E]">NENDOA STUDIO ENTERPRISE</p>
                    <p className="text-[10px] text-[#A69D94] uppercase tracking-tighter">{selectedVoucher.location} Station</p>
                  </div>
                  <div>
                    <p className="text-[9px] font-black uppercase tracking-widest text-[#8C8379] mb-1">Paid To (Payee)</p>
                    <div className="flex items-center gap-2">
                       <p className="text-lg font-serif italic font-bold text-[#2D241E] leading-tight">{selectedVoucher.payee}</p>
                       <span className="text-[8px] font-black uppercase px-2 py-0.5 rounded border text-blue-600 bg-blue-50 border-blue-100">
                        Staff
                      </span>
                    </div>
                  </div>
                </div>

                <div className="border-t-2 border-dashed border-[#D9D1C7]/50 pt-8">
                  <table className="w-full">
                    <thead>
                      <tr className="text-[9px] font-black uppercase tracking-widest text-[#8C8379]">
                        <th className="text-left pb-4">Description</th>
                        <th className="text-right pb-4">Amount (MYR)</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-[#D9D1C7]/10">
                      <tr>
                        <td className="py-6">
                          <p className="text-xs font-bold text-[#2D241E]">
                            Commission Settlement
                          </p>
                          <p className="text-[10px] text-[#8C8379] mt-1 font-medium">
                            Period: {format(parseISO(selectedVoucher.month + '-01'), 'MMMM yyyy')}
                          </p>
                        </td>
                        <td className="py-6 text-right font-mono font-bold text-lg text-[#2D241E]">
                          RM {selectedVoucher.amount.toFixed(2)}
                        </td>
                      </tr>
                    </tbody>
                    <tfoot>
                      <tr className="border-t border-[#2D241E]">
                        <td className="py-6 text-xs font-black uppercase tracking-widest text-[#2D241E]">Total Settlement Paid</td>
                        <td className="py-6 text-right">
                          <span className="text-3xl font-serif italic text-[#2D241E] font-bold">RM {selectedVoucher.amount.toFixed(2)}</span>
                        </td>
                      </tr>
                    </tfoot>
                  </table>
                </div>

                {/* Signatures */}
                <div className="grid grid-cols-3 gap-10 pt-10">
                  <div className="space-y-12">
                    <div className="h-px bg-[#D9D1C7]" />
                    <p className="text-[9px] font-black uppercase tracking-[0.2em] text-center text-[#8C8379]">Prepared By</p>
                  </div>
                  <div className="space-y-12">
                    <div className="h-px bg-[#D9D1C7]" />
                    <p className="text-[9px] font-black uppercase tracking-[0.2em] text-center text-[#8C8379]">Authorized By</p>
                  </div>
                  <div className="space-y-12">
                    <div className="h-px bg-[#D9D1C7]" />
                    <p className="text-[9px] font-black uppercase tracking-[0.2em] text-center text-[#8C8379]">Receiver Signature</p>
                  </div>
                </div>

                <div className="text-center pt-4">
                  <p className="text-[9px] text-[#A69D94] font-medium italic">Computer Generated - No Signature Required for Authorization</p>
                </div>
              </div>

              {/* Action Bar */}
              <div className="p-8 bg-[#FAF9F6] border-t border-[#D9D1C7]/30 flex gap-4">
                <button 
                  onClick={() => window.print()}
                  className="flex-1 bg-[#2D241E] text-white py-4 rounded-2xl font-black uppercase text-[10px] tracking-[0.2em] flex items-center justify-center gap-2 hover:bg-black transition-all shadow-lg active:scale-95"
                >
                  <Printer size={16} /> Print Voucher
                </button>
                <button
                  onClick={() => setSelectedVoucher(null)}
                  className="flex-1 bg-white border border-[#D9D1C7] text-[#8C8379] py-4 rounded-2xl font-black uppercase text-[10px] tracking-[0.2em] hover:bg-[#F2EFE9] transition-all"
                >
                  Close
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      <style>{`
        @media print {
          body * { visibility: hidden; }
          .fixed.inset-0, .fixed.inset-0 * { visibility: visible; }
          .fixed.inset-0 { position: absolute; left: 0; top: 0; width: 100%; height: auto; }
          button { display: none !important; }
        }
      `}</style>
    </div>
  );
}
