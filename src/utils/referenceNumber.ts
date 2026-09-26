import { Transaction, Booking } from '../types';

/**
 * Safely parses any date, timestamp, firestore timestamp, or date string into a Date object.
 */
export function parseDateSafe(val: any): Date {
  if (!val) return new Date();
  if (val instanceof Date && !isNaN(val.getTime())) return val;
  if (typeof val?.toDate === 'function') {
    try {
      const d = val.toDate();
      if (d instanceof Date && !isNaN(d.getTime())) return d;
    } catch {}
  }
  if (typeof val?.seconds === 'number') {
    return new Date(val.seconds * 1000);
  }
  if (typeof val === 'string') {
    const match = val.match(/^(\d{4})-(\d{2})-(\d{2})/);
    if (match) {
      const year = parseInt(match[1], 10);
      const month = parseInt(match[2], 10) - 1;
      const day = parseInt(match[3], 10);
      return new Date(year, month, day);
    }
    const d = new Date(val);
    if (!isNaN(d.getTime())) return d;
  }
  if (typeof val === 'number') {
    return new Date(val);
  }
  return new Date();
}

/**
 * Extracts YYYYMM string from a date (e.g. "202608" for August 2026).
 */
export function getYearMonthKey(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  return `${year}${month}`;
}

/**
 * Generates an invoice or receipt reference string according to the studio standard:
 * - Invoice: INV-YYYYMM0001
 * - Receipt: REC-YYYYMM0001
 */
export function formatDocReference(
  type: 'invoice' | 'receipt',
  date: any,
  sequenceNumber: number = 1
): string {
  const d = parseDateSafe(date);
  const ym = getYearMonthKey(d);
  const seq = String(Math.max(1, sequenceNumber)).padStart(4, '0');
  const prefix = type === 'invoice' ? 'INV' : 'REC';
  return `${prefix}-${ym}${seq}`;
}

/**
 * Gets the numeric sequence number of a transaction within its month among allTransactions.
 * Sorts transactions chronologically by timestamp to ensure consistent sequential numbers.
 */
export function getTransactionSequence(
  tx: Transaction,
  allTransactions?: Transaction[]
): number {
  if (!allTransactions || allTransactions.length === 0) {
    return 1;
  }

  const txDate = parseDateSafe(tx.timestamp);
  const targetYm = getYearMonthKey(txDate);

  // Filter all non-deleted transactions in the same month
  const monthTxs = allTransactions
    .filter((t) => t.type !== 'deleted')
    .filter((t) => {
      const d = parseDateSafe(t.timestamp);
      return getYearMonthKey(d) === targetYm;
    })
    .sort((a, b) => {
      const timeA = parseDateSafe(a.timestamp).getTime();
      const timeB = parseDateSafe(b.timestamp).getTime();
      if (timeA !== timeB) return timeA - timeB;
      return (a.id || '').localeCompare(b.id || '');
    });

  const index = monthTxs.findIndex((t) => t.id === tx.id);
  if (index !== -1) {
    return index + 1;
  }

  // If not found in list (e.g. new or preview), calculate its position relative to existing ones
  const txTime = txDate.getTime();
  const earlierCount = monthTxs.filter((t) => parseDateSafe(t.timestamp).getTime() < txTime).length;
  return earlierCount + 1;
}

/**
 * Returns formatted reference (e.g. "INV-2026080001" or "REC-2026080001") for a Transaction.
 */
export function getTransactionDocRef(
  tx: Transaction,
  type: 'invoice' | 'receipt' = 'receipt',
  allTransactions?: Transaction[]
): string {
  const seq = getTransactionSequence(tx, allTransactions);
  return formatDocReference(type, tx.timestamp, seq);
}

/**
 * Gets the numeric sequence number of a booking within its month among allBookings.
 */
export function getBookingSequence(
  booking: Booking,
  allBookings?: Booking[]
): number {
  if (!allBookings || allBookings.length === 0) {
    return 1;
  }

  const bookingDate = parseDateSafe(booking.recordingDate || booking.settlementDate || booking.date);
  const targetYm = getYearMonthKey(bookingDate);

  const monthBookings = allBookings
    .filter((b) => b.status !== 'deleted' && b.status !== 'cancelled')
    .filter((b) => {
      const d = parseDateSafe(b.recordingDate || b.settlementDate || b.date);
      return getYearMonthKey(d) === targetYm;
    })
    .sort((a, b) => {
      const timeA = parseDateSafe(a.recordingDate || a.settlementDate || a.date).getTime();
      const timeB = parseDateSafe(b.recordingDate || b.settlementDate || b.date).getTime();
      if (timeA !== timeB) return timeA - timeB;
      return (a.id || '').localeCompare(b.id || '');
    });

  const index = monthBookings.findIndex((b) => b.id === booking.id);
  if (index !== -1) {
    return index + 1;
  }

  const bTime = bookingDate.getTime();
  const earlierCount = monthBookings.filter((b) => {
    const d = parseDateSafe(b.recordingDate || b.settlementDate || b.date);
    return d.getTime() < bTime;
  }).length;
  return earlierCount + 1;
}

/**
 * Returns formatted reference (e.g. "INV-2026080001" or "REC-2026080001") for a Booking.
 */
export function getBookingDocRef(
  booking: Booking,
  type: 'invoice' | 'receipt' = 'receipt',
  allBookings?: Booking[]
): string {
  const seq = getBookingSequence(booking, allBookings);
  const dateVal = booking.recordingDate || booking.settlementDate || booking.date;
  return formatDocReference(type, dateVal, seq);
}
