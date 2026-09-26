export type Branch = 'PG' | 'BM' | 'ALL';

export type PaymentMethod = 'Cash' | 'QR' | 'Online transfer' | 'Card';

export type FilmProcessType = 'C-41' | 'Black and White' | 'ECN-2';

export interface FilmOrder {
  id?: string;
  orderNumber: string; // e.g. REW-2026-0001
  customerName: string;
  customerPhone: string;
  customerEmail: string;
  filmType: FilmProcessType;
  quantity: number; // 1 to 50 rolls
  envelopeNumber: string; // e.g. ENV-1042
  remark?: string;
  unitPrice: number;
  totalPrice: number;
  createdAt: string; // ISO string
  
  // Status: registered -> in_process -> ready_for_pickup -> completed
  status: 'registered' | 'in_process' | 'ready_for_pickup' | 'completed' | 'cancelled';
  
  // Invoicing & Receipt
  invoiceNumber?: string;
  invoiceSent: boolean;
  invoiceSentAt?: string;
  paymentStatus: 'unpaid' | 'paid';
  paymentMethod?: PaymentMethod;
  receiptNumber?: string;
  receiptSent: boolean;
  receiptSentAt?: string;
  verifiedByStaff?: string;
  
  // Pickup appointment workflow
  pickupNotified: boolean;
  pickupNotifiedAt?: string;
  pickupDeadline?: string; // 1 month (30 days) from pickupNotifiedAt
  pickupAppointmentDate?: string; // YYYY-MM-DD
  pickupTimeSlot?: string; // e.g. "11:00 AM - 12:00 PM"
  appointmentNotes?: string;
  pickedUpAt?: string;
  pickedUpByStaff?: string;
  
  location?: Branch;
}

export interface RewindSettings {
  id?: string;
  studioName: string;
  tagline: string;
  currency: string;
  phone: string;
  email: string;
  address: string;
  operatingHours: string;
  bankName: string;
  bankAccountNo: string;
  bankAccountName: string;
  qrPaymentImageUrl?: string;
  
  // Film wash pricing per roll
  priceC41: number;
  priceBW: number;
  priceECN2: number;
  
  // Staff allowed tabs
  staffAllowedTabs: string[];
}

export type CameraType = 
  | 'CCD/Digicam' 
  | 'Point and Shoot' 
  | 'Rangefinder' 
  | 'SLR' 
  | 'Disposable Camera'
  | 'Film Roll'
  | 'Accessory';

export interface UserProfile {
  uid: string;
  email: string;
  branch: Branch;
  role: 'admin' | 'staff';
  name?: string;
}

export interface Product {
  id?: string;
  name: string;
  brand?: string;
  type?: CameraType;
  description?: string;
  price: number;
  stock: number;
  imageUrl?: string;
  location: Branch;
  category: 'base' | 'sale';
  productCategory?: string; // e.g. "CCD/Digicam", "Point and Shoot", etc.
  sku?: string;
}

export interface Workshop {
  id?: string;
  name: string;
  description: string;
  totalPrice: number;
  depositAmount: number;
  priceDisplay?: string;
  isVariablePrice?: boolean;
  location?: Branch;
}

export interface FinishedPiece {
  id: string;
  photoUrl: string;
  remarks: string;
  createdAt: string;
}

export interface Booking {
  id?: string;
  workshopId: string;
  workshopName: string;
  customerName: string;
  customerPhone: string;
  customerEmail?: string;
  date: string;
  time?: string;
  status: 'pending' | 'confirmed' | 'settled' | 'completed' | 'cancelled' | 'refunded' | 'deleted';
  depositPaid: boolean;
  balancePaid: boolean;
  totalPrice: number;
  depositAmount: number;
  pax: number;
  paintingPieces?: number;
  paintingPrice?: number;
  collectionMethod?: 'bm' | 'island' | 'delivery';
  isCollected?: boolean;
  readyForCollection?: boolean;
  photoUrl?: string | null;
  photoPath?: string | null;
  finishedPieces?: FinishedPiece[];
  paintingInstructionsRemarks?: string;
  paintingInstructionsImage?: string | null;
  notes: string;
  location: Branch;
  staffName?: string;
  recordingDate?: string; // Optional backdated date for the recording/invoice
  settlementDate?: string; // Backdated date for internal/balance settlement invoice
  deliveryFee?: number;
  drinksDiscountCount?: number;
  selectedItems?: { name: string; quantity: number; price: number }[];
  commissionRate?: number;
  paymentLater?: boolean;
}

export interface EmailLog {
  id?: string;
  to: string;
  customerName?: string;
  subject: string;
  fromEmail: string;
  fromName: string;
  templateType?: string;
  bodyHtml: string;
  status: 'sent' | 'delivered' | 'failed' | 'simulated';
  createdAt: string;
  messageId?: string;
  bookingId?: string;
  relatedBookingId?: string;
  transactionId?: string;
  location?: Branch;
  sentBy?: string;
  errorMessage?: string;
}

export interface BusinessEmailSettings {
  senderName: string;
  fromEmail: string;
  replyTo: string;
  studioAddress?: string;
  studioAddressPG?: string;
  studioAddressBM?: string;
  studioPhone: string;
  websiteUrl: string;
  signatureTagline: string;
  smtpHost?: string;
  smtpPort?: number;
  smtpSecure?: boolean;
  smtpUser?: string;
  smtpPass?: string;
  useCustomSmtp?: boolean;
}

export interface EmailTemplateConfig {
  id: string;
  name: string;
  subject: string;
  headerTitle: string;
  headerSubtitle: string;
  leadGreeting: string;
  leadMessage: string;
  tipsOrNotesTitle?: string;
  tipsOrNotes?: string[];
  footerNote?: string;
  accentColor?: string;
}

export interface EmailTemplate {
  id: string;
  name: string;
  category: 'booking' | 'collection' | 'receipt' | 'reminder' | 'marketing' | 'custom';
  subject: string;
  description: string;
  defaultContent: string;
}

export interface Transaction {
  id?: string;
  type: 'sale' | 'deposit' | 'balance' | 'refund' | 'deleted';
  amount: number;
  timestamp: any;
  description: string;
  relatedId?: string;
  productId?: string;
  quantity?: number;
  unitPrice?: number;
  customerName: string;
  customerPhone?: string;
  customerEmail?: string;
  location: Branch;
  staffName?: string;
  paymentMethod?: PaymentMethod;
  deletedAt?: string;
  commissionRate?: number;
}

export interface Staff {
  id?: string;
  name: string;
  branch: Branch;
  active: boolean;
}

export interface CommissionPayment {
  id?: string;
  staffId: string;
  staffName: string;
  amount: number;
  month: string; // YYYY-MM
  timestamp: string;
  location: Branch;
}

export interface ExpenseCategory {
  id?: string;
  name: string;
  createdAt: string;
  spendingType?: 'Expenses' | 'Current Asset' | 'Non-Current Asset' | 'Current Liability' | 'Non-Current Liability';
}

export interface Expense {
  id?: string;
  description: string;
  amount: number;
  category: string;
  date: string;
  timestamp: string;
  location: Branch;
  staffName?: string;
  spendingType?: 'Expenses' | 'Current Asset' | 'Non-Current Asset' | 'Current Liability' | 'Non-Current Liability';
  receiptUrl?: string;
  receiptFileName?: string;
}

export interface BankConfig {
  id?: string;
  initialBalance: number;
  lastUpdated?: string;
}

export interface TimesheetEntry {
  clockIn: string; // "HH:MM" or ""
  clockOut: string; // "HH:MM" or ""
  isPublicHoliday: boolean;
  dayType?: 'normal' | 'off' | 'rest' | 'holiday';
  normalHours?: number;
  otHours?: number;
}

export interface StaffTimesheet {
  id?: string;
  staffId: string;
  staffName: string;
  month: string; // YYYY-MM
  hourlyRate: number;
  normalHoursLimit?: number; // e.g., 8
  breakDeduction?: number; // e.g., 1.0 (unpaid break hours deducted)
  otMultiplier?: number; // e.g., 1.5
  holidayMultiplier?: number; // e.g., 2.0
  offDayMultiplier?: number; // e.g., 1.5
  restDayMultiplier?: number; // e.g., 1.0
  restDayOtMultiplier?: number; // e.g., 2.0
  holidayOtMultiplier?: number; // e.g., 3.0
  otRate?: number; // Flat hourly rate for OT (RM/hr)
  holidayRate?: number; // Flat hourly rate for Holiday (RM/hr)
  offDayRate?: number; // Flat hourly rate for Off Day (RM/hr)
  restDayRate?: number; // Flat hourly rate for Rest Day (RM/hr)
  restDayOtRate?: number; // Flat hourly rate for Rest Day OT (RM/hr)
  holidayOtRate?: number; // Flat hourly rate for Holiday OT (RM/hr)
  entries: { [date: string]: TimesheetEntry };
  
  // Malaysian Payslip specific fields
  employeeName?: string;
  employeeNo?: string;
  icNo?: string;
  basicRate?: number; // standard monthly or basic pay
  attendanceAllowance?: number;
  carAllowance?: number;
  otherAllowance?: number;
  unpaidLeave?: number;
  othersDeduction?: number;
  
  // Deductions
  epfDeduction?: number;
  socsoDeduction?: number;
  eisDeduction?: number;
  pcbDeduction?: number;
  advanceDeduction?: number;
  
  // Leave stats
  daysWorked?: number;
  annualLeaveTaken?: number;
  annualLeaveBalance?: number;
  
  // Employer Contribution
  employerEpf?: number;
  employerSocso?: number;
  employerEis?: number;
  employerLevy?: number;

  // Custom Statutory Basis Settings
  includeOtInEpf?: boolean;
  includeHolidayInEpf?: boolean;
  
  createdAt: string;
  lastUpdated: string;
}

export enum OperationType {
  CREATE = 'create',
  UPDATE = 'update',
  DELETE = 'delete',
  LIST = 'list',
  GET = 'get',
  WRITE = 'write',
}

export interface FirestoreErrorInfo {
  error: string;
  operationType: OperationType;
  path: string | null;
  authInfo: {
    userId?: string | null;
    email?: string | null;
    emailVerified?: boolean | null;
    isAnonymous?: boolean | null;
  }
}
