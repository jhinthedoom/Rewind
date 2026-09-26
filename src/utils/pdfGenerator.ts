import { jsPDF } from 'jspdf';
import autoTable from 'jspdf-autotable';
import { Transaction, Booking } from '../types';
import { format } from 'date-fns';
import { getTransactionDocRef, getBookingDocRef, formatDocReference } from './referenceNumber';

export interface GenerateReceiptPdfOptions {
  docType?: 'receipt' | 'invoice';
  customerName?: string;
  customerEmail?: string;
  customerPhone?: string;
  date?: string;
  ref?: string;
  items: Array<{
    description: string;
    quantity: number;
    unitPrice: number;
    total: number;
  }>;
  subtotal: number;
  tax?: number;
  grandTotal: number;
  location?: string;
  customMessage?: string;
  statusBadge?: string;
  depositPaid?: number;
  balancePaid?: number;
  netLabel?: string;
}

export function createReceiptPdfDoc(options: GenerateReceiptPdfOptions): jsPDF {
  const doc = new jsPDF({
    orientation: 'portrait',
    unit: 'mm',
    format: 'a4',
  });

  const docTitle = options.docType === 'invoice' ? 'TAX INVOICE' : 'OFFICIAL RECEIPT';
  const primaryColor: [number, number, number] = [45, 36, 30]; // Black / deep charcoal for both invoice and receipt
  const darkColor: [number, number, number] = [45, 36, 30];
  const mutedColor: [number, number, number] = [140, 131, 121];
  const lightBg: [number, number, number] = [250, 249, 246];

  const pageWidth = doc.internal.pageSize.getWidth();
  const margin = 20;
  const contentWidth = pageWidth - margin * 2;

  // Background card / decorative border
  doc.setFillColor(255, 255, 255);
  doc.setDrawColor(217, 209, 199);
  doc.roundedRect(margin, 15, contentWidth, 267, 4, 4, 'FD');

  let currentY = 28;

  // Top header - Document Title
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(20);
  doc.setTextColor(primaryColor[0], primaryColor[1], primaryColor[2]);
  doc.text(options.docType === 'invoice' ? 'TAX INVOICE' : 'OFFICIAL RECEIPT', pageWidth / 2, currentY, { align: 'center' });

  currentY += 8;
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(10);
  doc.setTextColor(darkColor[0], darkColor[1], darkColor[2]);
  doc.text('NENDOA STUDIO ENTERPRISE', pageWidth / 2, currentY, { align: 'center' });

  currentY += 5;
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8);
  doc.setTextColor(mutedColor[0], mutedColor[1], mutedColor[2]);
  doc.text('SSM Reg No: 202403185935 (PG0558602-T)', pageWidth / 2, currentY, { align: 'center' });

  currentY += 4.5;
  doc.text('214, Lebuh Victoria, 10300 Georgetown, Pulau Pinang', pageWidth / 2, currentY, { align: 'center' });

  // Dashed separator
  currentY += 8;
  doc.setDrawColor(217, 209, 199);
  doc.setLineDashPattern([2, 2], 0);
  doc.line(margin + 5, currentY, margin + contentWidth - 5, currentY);
  doc.setLineDashPattern([], 0); // reset

  // Metadata Section (2 columns)
  currentY += 10;
  const leftColX = margin + 8;
  const rightColX = margin + contentWidth - 8;
  const metaStartY = currentY;

  // Left column: Customer Details
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(7.5);
  doc.setTextColor(mutedColor[0], mutedColor[1], mutedColor[2]);
  doc.text(options.docType === 'invoice' ? 'BILL TO / CUSTOMER' : 'SOLD TO / CUSTOMER', leftColX, currentY);

  currentY += 5;
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(11);
  doc.setTextColor(darkColor[0], darkColor[1], darkColor[2]);
  doc.text(options.customerName || 'Valued Customer', leftColX, currentY);

  if (options.customerEmail) {
    currentY += 4.5;
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(8);
    doc.setTextColor(mutedColor[0], mutedColor[1], mutedColor[2]);
    doc.text(options.customerEmail, leftColX, currentY);
  }

  if (options.customerPhone) {
    currentY += 4;
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(8);
    doc.setTextColor(mutedColor[0], mutedColor[1], mutedColor[2]);
    doc.text(options.customerPhone, leftColX, currentY);
  }

  // Right column: Ref, Date, Branch
  let rightY = metaStartY;
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(7.5);
  doc.setTextColor(mutedColor[0], mutedColor[1], mutedColor[2]);
  doc.text(`${docTitle} REF`, rightColX, rightY, { align: 'right' });

  rightY += 5;
  doc.setFont('courier', 'bold');
  doc.setFontSize(10);
  doc.setTextColor(darkColor[0], darkColor[1], darkColor[2]);
  doc.text(options.ref || '#RECEIPT', rightColX, rightY, { align: 'right' });

  rightY += 6;
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(7.5);
  doc.setTextColor(mutedColor[0], mutedColor[1], mutedColor[2]);
  doc.text('DATE & TIME', rightColX, rightY, { align: 'right' });

  rightY += 4.5;
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8.5);
  doc.setTextColor(darkColor[0], darkColor[1], darkColor[2]);
  doc.text(options.date || format(new Date(), 'dd MMM yyyy, hh:mm a'), rightColX, rightY, { align: 'right' });

  currentY = Math.max(currentY + 6, rightY + 6);

  // Items List separated by lines (no boxed table)
  const tableData = options.items.map((item) => [
    item.description,
    item.quantity.toString(),
    item.unitPrice.toFixed(2),
    `RM ${item.total.toFixed(2)}`,
  ]);

  autoTable(doc, {
    startY: currentY + 4,
    margin: { left: margin + 8, right: margin + 8 },
    head: [['Item / Description', 'Qty', 'Unit Price (RM)', 'Total (MYR)']],
    body: tableData,
    theme: 'plain',
    headStyles: {
      fillColor: [255, 255, 255],
      textColor: mutedColor,
      fontSize: 7.5,
      fontStyle: 'bold',
      halign: 'left',
      cellPadding: { top: 2.5, bottom: 2.5, left: 1, right: 1 },
    },
    columnStyles: {
      0: { cellWidth: 'auto' },
      1: { halign: 'center', cellWidth: 20 },
      2: { halign: 'right', cellWidth: 32 },
      3: { halign: 'right', fontStyle: 'bold', cellWidth: 35 },
    },
    styles: {
      fontSize: 8.5,
      textColor: darkColor,
      cellPadding: { top: 3.5, bottom: 3.5, left: 1, right: 1 },
      lineWidth: 0,
    },
    didDrawCell: (data) => {
      // Line above header
      if (data.row.index === 0 && data.row.section === 'head') {
        doc.setDrawColor(217, 209, 199);
        doc.setLineWidth(0.3);
        doc.line(data.cell.x, data.cell.y, data.cell.x + data.cell.width, data.cell.y);
      }
      // Line below header
      if (data.row.section === 'head') {
        doc.setDrawColor(217, 209, 199);
        doc.setLineWidth(0.3);
        doc.line(data.cell.x, data.cell.y + data.cell.height, data.cell.x + data.cell.width, data.cell.y + data.cell.height);
      }
      // Line below each item row
      if (data.row.section === 'body') {
        doc.setDrawColor(230, 225, 218);
        doc.setLineWidth(0.2);
        doc.line(data.cell.x, data.cell.y + data.cell.height, data.cell.x + data.cell.width, data.cell.y + data.cell.height);
      }
    },
  });

  const finalY = (doc as any).lastAutoTable.finalY + 8;

  // Summary section on right side (clean text separated with lines, no box)
  const hasDeposit = Boolean(options.depositPaid && options.depositPaid > 0);
  const isPayLater = Boolean(options.docType === 'invoice');
  const finalLabel = options.netLabel || (isPayLater ? 'TOTAL DUE' : 'GRAND TOTAL PAID');
  const summaryBoxWidth = 78;
  const summaryBoxX = margin + contentWidth - 8 - summaryBoxWidth;

  let sumY = finalY + 4;
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8);
  doc.setTextColor(mutedColor[0], mutedColor[1], mutedColor[2]);
  doc.text('Subtotal', summaryBoxX + 2, sumY);
  doc.setFont('courier', 'normal');
  doc.setTextColor(darkColor[0], darkColor[1], darkColor[2]);
  doc.text(`RM ${options.subtotal.toFixed(2)}`, summaryBoxX + summaryBoxWidth, sumY, { align: 'right' });

  if (hasDeposit) {
    sumY += 5;
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(8);
    doc.setTextColor(5, 150, 105); // forest green for deposit deduction
    doc.text('Minus Deposit', summaryBoxX + 2, sumY);
    doc.setFont('courier', 'bold');
    doc.text(`-RM ${(options.depositPaid || 0).toFixed(2)}`, summaryBoxX + summaryBoxWidth, sumY, { align: 'right' });
  }

  sumY += 4.5;
  doc.setDrawColor(217, 209, 199);
  doc.setLineWidth(0.3);
  doc.line(summaryBoxX, sumY - 1, summaryBoxX + summaryBoxWidth, sumY - 1);

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(8);
  doc.setTextColor(darkColor[0], darkColor[1], darkColor[2]);
  doc.text(finalLabel, summaryBoxX + 2, sumY + 4);

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(11);
  doc.setTextColor(primaryColor[0], primaryColor[1], primaryColor[2]);
  doc.text(`RM ${options.grandTotal.toFixed(2)}`, summaryBoxX + summaryBoxWidth, sumY + 4, { align: 'right' });

  if (options.customMessage) {
    const noteY = finalY + (hasDeposit ? 34 : 28);
    doc.setFillColor(250, 244, 240);
    doc.setDrawColor(200, 106, 75);
    doc.roundedRect(margin + 8, noteY, contentWidth - 16, 12, 1.5, 1.5, 'FD');
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(7.5);
    doc.setTextColor(darkColor[0], darkColor[1], darkColor[2]);
    doc.text(`Studio Note: ${options.customMessage}`, margin + 12, noteY + 7);
  }

  // Footer section
  const footerY = 262;
  doc.setDrawColor(217, 209, 199);
  doc.setLineDashPattern([2, 2], 0);
  doc.line(margin + 5, footerY, margin + contentWidth - 5, footerY);
  doc.setLineDashPattern([], 0);

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(7.5);
  doc.setTextColor(mutedColor[0], mutedColor[1], mutedColor[2]);
  doc.text('Email: hello@nendoastudio.com  |  WhatsApp: +60 12-889 2030  |  Web: nendoastudio.com', pageWidth / 2, footerY + 5, { align: 'center' });

  doc.setFont('helvetica', 'italic');
  doc.setFontSize(7.5);
  doc.text('Thank you for supporting handcrafted ceramic pottery.', pageWidth / 2, footerY + 9, { align: 'center' });

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(7);
  doc.setTextColor(darkColor[0], darkColor[1], darkColor[2]);
  doc.text(`NENDOA STUDIO ENTERPRISE • COMPUTER GENERATED ${docTitle}`, pageWidth / 2, footerY + 13.5, { align: 'center' });

  return doc;
}

export function buildTransactionPdfOptions(
  tx: Transaction,
  type: 'receipt' | 'invoice' = 'receipt',
  refOverride?: string,
  allTransactions?: Transaction[],
  relatedBooking?: Booking
): GenerateReceiptPdfOptions {
  const isInvoice = type === 'invoice';
  let displayDateStr = '';

  if (isInvoice && relatedBooking) {
    const dateStringToParse = tx.type === 'deposit'
      ? (relatedBooking.recordingDate || relatedBooking.date)
      : (tx.type === 'balance' ? relatedBooking.settlementDate : null);

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
        displayDateStr = !isNaN(parsedDate.getTime())
          ? format(parsedDate, 'dd MMM yyyy')
          : format(tx.timestamp ? new Date(tx.timestamp) : new Date(), 'dd MMM yyyy, hh:mm a');
      }
    } else {
      displayDateStr = format(tx.timestamp ? new Date(tx.timestamp) : new Date(), 'dd MMM yyyy, hh:mm a');
    }
  } else {
    displayDateStr = format(tx.timestamp ? new Date(tx.timestamp) : new Date(), 'dd MMM yyyy, hh:mm a');
  }

  const ref = refOverride || getTransactionDocRef(tx, type, allTransactions);
  const custName = tx.customerName || relatedBooking?.customerName || 'Valued Customer';
  const custEmail = tx.customerEmail || relatedBooking?.customerEmail;
  const custPhone = tx.customerPhone || relatedBooking?.customerPhone;
  const location = tx.location || relatedBooking?.location;

  // 1. Workshop Deposit Transaction
  if (tx.type === 'deposit') {
    const workshopName = relatedBooking?.workshopName || (tx.description ? tx.description.replace('Deposit: ', '') : 'Pottery Workshop Session');
    const pax = relatedBooking?.pax || 1;
    const sessionDateInfo = relatedBooking?.date ? ` (Session: ${format(new Date(relatedBooking.date), 'dd MMM yyyy')})` : '';
    const itemDesc = `Advance Deposit: ${workshopName}${pax > 1 ? ` (${pax} pax)` : ''}${sessionDateInfo}`;

    return {
      docType: type,
      customerName: custName,
      customerEmail: custEmail,
      customerPhone: custPhone,
      date: displayDateStr,
      ref,
      items: [
        {
          description: itemDesc,
          quantity: 1,
          unitPrice: tx.amount,
          total: tx.amount,
        },
      ],
      subtotal: tx.amount,
      grandTotal: tx.amount,
      location,
      statusBadge: isInvoice ? 'PAYMENT DUE' : 'PAID IN FULL',
      netLabel: isInvoice ? 'TOTAL DUE' : 'GRAND TOTAL PAID',
    };
  }

  // 2. Workshop Balance Transaction with Booking details
  if (tx.type === 'balance' && relatedBooking) {
    const items: Array<{ description: string; quantity: number; unitPrice: number; total: number }> = [];
    const pax = relatedBooking.pax || 1;
    const workshopTotal = Number(relatedBooking.totalPrice) || 0;
    const paintingTotal = Number(relatedBooking.paintingPrice) || 0;
    const deliveryTotal = Number(relatedBooking.deliveryFee) || 0;
    const drinksDiscount = (Number(relatedBooking.drinksDiscountCount) || 0) * 10;
    const depositToDeduct = relatedBooking.depositPaid ? (Number(relatedBooking.depositAmount) || 0) : 0;

    if (relatedBooking.selectedItems && relatedBooking.selectedItems.length > 0) {
      relatedBooking.selectedItems.forEach(item => {
        items.push({
          description: item.name,
          quantity: item.quantity,
          unitPrice: item.price,
          total: item.price * item.quantity,
        });
      });
    } else {
      items.push({
        description: relatedBooking.workshopName || 'Pottery Session Attendance',
        quantity: pax,
        unitPrice: pax > 0 ? (workshopTotal / pax) : workshopTotal,
        total: workshopTotal,
      });
    }

    if (paintingTotal > 0) {
      const pieces = relatedBooking.paintingPieces || 1;
      items.push({
        description: 'Add-on Ceramic Pieces / Colour Painting',
        quantity: pieces,
        unitPrice: paintingTotal / pieces,
        total: paintingTotal,
      });
    }

    if (deliveryTotal > 0) {
      items.push({
        description: 'Standard Courier Delivery Service',
        quantity: 1,
        unitPrice: deliveryTotal,
        total: deliveryTotal,
      });
    }

    if (drinksDiscount > 0) {
      items.push({
        description: `Drinks Promotion Discount (${relatedBooking.drinksDiscountCount} items)`,
        quantity: relatedBooking.drinksDiscountCount || 1,
        unitPrice: -10,
        total: -drinksDiscount,
      });
    }

    const subtotal = Math.max(0, (relatedBooking.selectedItems && relatedBooking.selectedItems.length > 0
      ? items.reduce((s, i) => s + i.total, 0)
      : (workshopTotal + paintingTotal + deliveryTotal - drinksDiscount)));
    const balanceDue = Math.max(0, subtotal - depositToDeduct);

    return {
      docType: type,
      customerName: custName,
      customerEmail: custEmail,
      customerPhone: custPhone,
      date: displayDateStr,
      ref,
      items,
      subtotal,
      depositPaid: depositToDeduct > 0 ? depositToDeduct : undefined,
      grandTotal: tx.amount > 0 ? tx.amount : balanceDue,
      location,
      statusBadge: isInvoice ? 'PAYMENT DUE' : 'PAID IN FULL',
      netLabel: isInvoice ? 'TOTAL DUE' : 'GRAND TOTAL PAID',
    };
  }

  // 3. Direct Product Sale or General Transaction
  const itemDesc = (tx.description || 'Handcrafted Ceramics').replace('Direct Sale: ', '');
  const qty = tx.quantity || 1;
  const unitPrice = tx.unitPrice || (tx.amount / qty);

  return {
    docType: type,
    customerName: custName,
    customerEmail: custEmail,
    customerPhone: custPhone,
    date: displayDateStr,
    ref,
    items: [
      {
        description: itemDesc,
        quantity: qty,
        unitPrice,
        total: tx.amount,
      },
    ],
    subtotal: tx.amount,
    grandTotal: tx.amount,
    location,
    statusBadge: tx.type === 'refund' ? 'REFUND ISSUED' : (isInvoice ? 'PAYMENT DUE' : 'PAID IN FULL'),
    netLabel: isInvoice ? 'TOTAL DUE' : (tx.type === 'refund' ? 'REFUND AMOUNT' : 'GRAND TOTAL PAID'),
  };
}

export function generateTransactionReceiptPdfBase64(
  tx: Transaction,
  type: 'receipt' | 'invoice' = 'receipt',
  refOverride?: string,
  allTransactions?: Transaction[],
  relatedBooking?: Booking
): string {
  const options = buildTransactionPdfOptions(tx, type, refOverride, allTransactions, relatedBooking);
  const doc = createReceiptPdfDoc(options);
  const arrayBuffer = doc.output('arraybuffer');
  let binary = '';
  const bytes = new Uint8Array(arrayBuffer);
  for (let i = 0; i < bytes.byteLength; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary);
}

export function downloadTransactionReceiptPdf(
  tx: Transaction,
  type: 'receipt' | 'invoice' = 'receipt',
  refOverride?: string,
  allTransactions?: Transaction[],
  relatedBooking?: Booking
) {
  const options = buildTransactionPdfOptions(tx, type, refOverride, allTransactions, relatedBooking);
  const doc = createReceiptPdfDoc(options);
  const filename = `${type === 'invoice' ? 'Tax-Invoice' : 'Official-Receipt'}-${options.ref?.replace(/[^A-Za-z0-9-_]/g, '') || 'Doc'}.pdf`;
  doc.save(filename);
}

export function generateBookingReceiptPdfBase64(
  booking: Booking,
  type: 'receipt' | 'invoice' = 'receipt',
  refOverride?: string,
  allBookings?: Booking[]
): string {
  const dateStr = booking.date || format(new Date(), 'dd MMM yyyy');
  const ref = refOverride || getBookingDocRef(booking, type, allBookings);
  const pax = booking.pax || 1;
  const workshopTotal = booking.totalPrice || 0;
  const paintingTotal = booking.paintingPrice || 0;
  const deliveryTotal = booking.deliveryFee || 0;
  const drinksDiscount = (booking.drinksDiscountCount || 0) * 10;
  const deposit = booking.depositPaid ? (booking.depositAmount || 0) : 0;

  // If only advance deposit was paid and session is not settled yet
  if (type === 'receipt' && !booking.balancePaid && deposit > 0) {
    const receiptAmount = deposit;
    const itemDesc = `Advance Deposit for ${booking.workshopName || 'Pottery Workshop'}${pax > 1 ? ` (${pax} pax)` : ''}`;

    const doc = createReceiptPdfDoc({
      docType: 'receipt',
      customerName: booking.customerName || 'Walk-in Customer',
      customerEmail: booking.customerEmail,
      customerPhone: booking.customerPhone,
      date: dateStr,
      ref,
      items: [
        {
          description: itemDesc,
          quantity: 1,
          unitPrice: receiptAmount,
          total: receiptAmount,
        },
      ],
      subtotal: receiptAmount,
      grandTotal: receiptAmount,
      location: booking.location,
      statusBadge: 'PAID IN FULL',
      netLabel: 'GRAND TOTAL PAID',
    });

    const arrayBuffer = doc.output('arraybuffer');
    let binary = '';
    const bytes = new Uint8Array(arrayBuffer);
    for (let i = 0; i < bytes.byteLength; i++) {
      binary += String.fromCharCode(bytes[i]);
    }
    return btoa(binary);
  }

  // Full itemized session invoice or final settlement receipt
  const items: Array<{ description: string; quantity: number; unitPrice: number; total: number }> = [];

  if (booking.selectedItems && booking.selectedItems.length > 0) {
    booking.selectedItems.forEach(item => {
      items.push({
        description: item.name,
        quantity: item.quantity,
        unitPrice: item.price,
        total: item.price * item.quantity,
      });
    });
  } else {
    items.push({
      description: booking.workshopName || 'Pottery Session Workshop',
      quantity: pax,
      unitPrice: pax > 0 ? (workshopTotal / pax) : workshopTotal,
      total: workshopTotal,
    });
  }

  if (paintingTotal > 0) {
    const pieces = booking.paintingPieces || 1;
    items.push({
      description: 'Add-on Ceramic Pieces / Colour Painting',
      quantity: pieces,
      unitPrice: paintingTotal / pieces,
      total: paintingTotal,
    });
  }

  if (deliveryTotal > 0) {
    items.push({
      description: 'Standard Courier Delivery Service',
      quantity: 1,
      unitPrice: deliveryTotal,
      total: deliveryTotal,
    });
  }

  if (drinksDiscount > 0) {
    items.push({
      description: `Drinks Promotion Discount (${booking.drinksDiscountCount} items)`,
      quantity: booking.drinksDiscountCount || 1,
      unitPrice: -10,
      total: -drinksDiscount,
    });
  }

  const grandTotal = Math.max(0, (booking.selectedItems && booking.selectedItems.length > 0 ? items.reduce((s, i) => s + i.total, 0) : (workshopTotal + paintingTotal + deliveryTotal - drinksDiscount)));
  const balance = Math.max(0, grandTotal - deposit);
  const isInvoice = type === 'invoice' || Boolean(booking.paymentLater);

  const doc = createReceiptPdfDoc({
    docType: isInvoice ? 'invoice' : 'receipt',
    customerName: booking.customerName || 'Walk-in Customer',
    customerEmail: booking.customerEmail,
    customerPhone: booking.customerPhone,
    date: dateStr,
    ref,
    items,
    subtotal: grandTotal,
    grandTotal: balance,
    location: booking.location,
    statusBadge: isInvoice ? (booking.balancePaid ? 'PAID IN FULL' : 'PAYMENT DUE') : 'PAID IN FULL',
    depositPaid: deposit > 0 ? deposit : undefined,
    balancePaid: balance,
    netLabel: isInvoice ? (booking.balancePaid ? 'TOTAL AMOUNT' : 'TOTAL DUE') : 'GRAND TOTAL PAID',
  });

  const arrayBuffer = doc.output('arraybuffer');
  let binary = '';
  const bytes = new Uint8Array(arrayBuffer);
  for (let i = 0; i < bytes.byteLength; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary);
}

export function downloadBookingReceiptPdf(
  booking: Booking,
  type: 'receipt' | 'invoice' = 'receipt',
  refOverride?: string,
  allBookings?: Booking[]
) {
  const dateStr = booking.date || format(new Date(), 'dd MMM yyyy');
  const ref = refOverride || getBookingDocRef(booking, type, allBookings);
  const pax = booking.pax || 1;
  const workshopTotal = booking.totalPrice || 0;
  const paintingTotal = booking.paintingPrice || 0;
  const deliveryTotal = booking.deliveryFee || 0;
  const drinksDiscount = (booking.drinksDiscountCount || 0) * 10;
  const deposit = booking.depositPaid ? (booking.depositAmount || 0) : 0;

  if (type === 'receipt' && !booking.balancePaid && deposit > 0) {
    const receiptAmount = deposit;
    const itemDesc = `Advance Deposit for ${booking.workshopName || 'Pottery Workshop'}${pax > 1 ? ` (${pax} pax)` : ''}`;

    const doc = createReceiptPdfDoc({
      docType: 'receipt',
      customerName: booking.customerName || 'Walk-in Customer',
      customerEmail: booking.customerEmail,
      customerPhone: booking.customerPhone,
      date: dateStr,
      ref,
      items: [
        {
          description: itemDesc,
          quantity: 1,
          unitPrice: receiptAmount,
          total: receiptAmount,
        },
      ],
      subtotal: receiptAmount,
      grandTotal: receiptAmount,
      location: booking.location,
      statusBadge: 'PAID IN FULL',
      netLabel: 'GRAND TOTAL PAID',
    });

    const filename = `Official-Receipt-${ref.replace(/[^A-Za-z0-9-_]/g, '')}.pdf`;
    doc.save(filename);
    return;
  }

  const items: Array<{ description: string; quantity: number; unitPrice: number; total: number }> = [];

  if (booking.selectedItems && booking.selectedItems.length > 0) {
    booking.selectedItems.forEach(item => {
      items.push({
        description: item.name,
        quantity: item.quantity,
        unitPrice: item.price,
        total: item.price * item.quantity,
      });
    });
  } else {
    items.push({
      description: booking.workshopName || 'Pottery Session Workshop',
      quantity: pax,
      unitPrice: pax > 0 ? (workshopTotal / pax) : workshopTotal,
      total: workshopTotal,
    });
  }

  if (paintingTotal > 0) {
    const pieces = booking.paintingPieces || 1;
    items.push({
      description: 'Add-on Ceramic Pieces / Colour Painting',
      quantity: pieces,
      unitPrice: paintingTotal / pieces,
      total: paintingTotal,
    });
  }

  if (deliveryTotal > 0) {
    items.push({
      description: 'Standard Courier Delivery Service',
      quantity: 1,
      unitPrice: deliveryTotal,
      total: deliveryTotal,
    });
  }

  if (drinksDiscount > 0) {
    items.push({
      description: `Drinks Promotion Discount (${booking.drinksDiscountCount} items)`,
      quantity: booking.drinksDiscountCount || 1,
      unitPrice: -10,
      total: -drinksDiscount,
    });
  }

  const grandTotal = Math.max(0, (booking.selectedItems && booking.selectedItems.length > 0 ? items.reduce((s, i) => s + i.total, 0) : (workshopTotal + paintingTotal + deliveryTotal - drinksDiscount)));
  const balance = Math.max(0, grandTotal - deposit);
  const isInvoice = type === 'invoice' || Boolean(booking.paymentLater);

  const doc = createReceiptPdfDoc({
    docType: isInvoice ? 'invoice' : 'receipt',
    customerName: booking.customerName || 'Walk-in Customer',
    customerEmail: booking.customerEmail,
    customerPhone: booking.customerPhone,
    date: dateStr,
    ref,
    items,
    subtotal: grandTotal,
    grandTotal: balance,
    location: booking.location,
    statusBadge: isInvoice ? (booking.balancePaid ? 'PAID IN FULL' : 'PAYMENT DUE') : 'PAID IN FULL',
    depositPaid: deposit > 0 ? deposit : undefined,
    balancePaid: balance,
    netLabel: isInvoice ? (booking.balancePaid ? 'TOTAL AMOUNT' : 'TOTAL DUE') : 'GRAND TOTAL PAID',
  });

  const filename = `${isInvoice ? 'Tax-Invoice' : 'Official-Receipt'}-${ref.replace(/[^A-Za-z0-9-_]/g, '')}.pdf`;
  doc.save(filename);
}
