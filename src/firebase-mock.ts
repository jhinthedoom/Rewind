// High-fidelity client-side offline-first Firebase mock for NENDOA Pottery Studio.
// Persists all collections and auth sessions securely to localStorage.

import { UserProfile, Branch } from './types';

// Utility for formatting dates in vanilla JS
const formatDateStr = (d: Date) => {
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  return `${yyyy}-${mm}-${dd}`;
};

const todayStr = formatDateStr(new Date());
const tomorrowStr = formatDateStr(new Date(Date.now() + 86400000));
const yesterdayStr = formatDateStr(new Date(Date.now() - 86400000));

// ==========================================
// 1. TIMESTAMP IMPLEMENTATION
// ==========================================
export class Timestamp {
  seconds: number;
  nanoseconds: number;

  constructor(seconds: number, nanoseconds: number) {
    this.seconds = seconds;
    this.nanoseconds = nanoseconds;
  }

  static now() {
    return new Timestamp(Math.floor(Date.now() / 1000), 0);
  }

  static fromDate(date: Date) {
    return new Timestamp(Math.floor(date.getTime() / 1000), 0);
  }

  toDate() {
    return new Date(this.seconds * 1000);
  }

  toISOString() {
    return this.toDate().toISOString();
  }

  valueOf() {
    return this.seconds * 1000;
  }
}

function reviveTimestamps(obj: any): any {
  if (obj === null || obj === undefined) return obj;
  if (Array.isArray(obj)) {
    return obj.map(item => reviveTimestamps(item));
  }
  if (typeof obj === 'object') {
    if (obj.seconds !== undefined && obj.nanoseconds !== undefined && !obj.toDate) {
      return new Timestamp(obj.seconds, obj.nanoseconds);
    }
    const newObj: any = {};
    for (const key of Object.keys(obj)) {
      newObj[key] = reviveTimestamps(obj[key]);
    }
    return newObj;
  }
  return obj;
}

// ==========================================
// 2. SEED DATA ENGINE
// ==========================================
function getInitialSeedData(collectionPath: string): any[] {
  switch (collectionPath) {
    case 'users':
      return [
        { id: 'admin_user', uid: 'admin_user', email: 'angella0333@gmail.com', branch: 'ALL', role: 'admin', name: 'Angela (Admin)' },
        { id: 'admin_default', uid: 'admin_default', email: 'admin@rewind.com', branch: 'ALL', role: 'admin', name: 'Rewind Admin' },
        { id: 'staff_user', uid: 'staff_user', email: 'staff@rewind.com', branch: 'ALL', role: 'staff', name: 'Marcus (Staff)' },
        { id: 'staff_sarah', uid: 'staff_sarah', email: 'sarah@rewind.com', branch: 'ALL', role: 'staff', name: 'Sarah (Staff)' },
      ];
    case 'products':
      return [
        { id: 'cam_oly_mju', name: 'Olympus [mju:] II 35mm F2.8', brand: 'Olympus', type: 'Point and Shoot', category: 'sale', productCategory: 'Point and Shoot', price: 1250, stock: 3, location: 'ALL', sku: 'CAM-OLY-MJU2', description: 'Legendary compact film camera with sharp 35mm f/2.8 lens.' },
        { id: 'cam_canon_autoboy', name: 'Canon Autoboy Luna 35', brand: 'Canon', type: 'Point and Shoot', category: 'sale', productCategory: 'Point and Shoot', price: 480, stock: 4, location: 'ALL', sku: 'CAM-CAN-AB35', description: 'Versatile 35-70mm zoom compact camera with caption stamping.' },
        { id: 'cam_canon_ixy', name: 'Canon IXY Digital 900 IS (7.1MP)', brand: 'Canon', type: 'CCD/Digicam', category: 'sale', productCategory: 'CCD/Digicam', price: 390, stock: 5, location: 'ALL', sku: 'CAM-DIG-IXY900', description: 'Cult classic vintage CCD digicam with signature warm film-like rendering.' },
        { id: 'cam_sony_cybershot', name: 'Sony Cyber-shot DSC-P100 (5.1MP)', brand: 'Sony', type: 'CCD/Digicam', category: 'sale', productCategory: 'CCD/Digicam', price: 340, stock: 2, location: 'ALL', sku: 'CAM-DIG-P100', description: 'Vintage aluminum body CCD digicam with Carl Zeiss Vario-Tessar lens.' },
        { id: 'cam_canon_ae1', name: 'Canon AE-1 Program + 50mm f/1.8', brand: 'Canon', type: 'SLR', category: 'sale', productCategory: 'SLR', price: 980, stock: 2, location: 'ALL', sku: 'CAM-SLR-AE1P', description: 'Iconic 35mm manual focus SLR with automatic program exposure.' },
        { id: 'cam_pentax_k1000', name: 'Pentax K1000 + SMC 50mm f/2', brand: 'Pentax', type: 'SLR', category: 'sale', productCategory: 'SLR', price: 780, stock: 3, location: 'ALL', sku: 'CAM-SLR-K1000', description: 'Classic all-mechanical mechanical SLR workhorse.' },
        { id: 'cam_olympus_rc', name: 'Olympus 35 RC Rangefinder', brand: 'Olympus', type: 'Rangefinder', category: 'sale', productCategory: 'Rangefinder', price: 650, stock: 1, location: 'ALL', sku: 'CAM-RF-35RC', description: 'Ultra-compact mechanical 35mm rangefinder with 42mm f/2.8 lens.' },
        { id: 'cam_kodak_disp', name: 'Kodak FunSaver 35mm (27+12 Exp)', brand: 'Kodak', type: 'Disposable Camera', category: 'sale', productCategory: 'Disposable Camera', price: 68, stock: 18, location: 'ALL', sku: 'CAM-DSP-FUN', description: 'Pre-loaded single use camera with 800 ISO film and built-in flash.' },
        { id: 'cam_fuji_disp', name: 'Fujifilm Simple Ace 400 (27 Exp)', brand: 'Fujifilm', type: 'Disposable Camera', category: 'sale', productCategory: 'Disposable Camera', price: 72, stock: 14, location: 'ALL', sku: 'CAM-DSP-ACE', description: 'Popular Japanese disposable camera with vivid colors and fine grain.' },
      ];
    case 'film_orders':
      return [
        {
          id: 'fo_001',
          orderNumber: 'REW-2026-001',
          customerName: 'Marcus Tan',
          customerPhone: '+60 17-654 3210',
          customerEmail: 'marcus.tan@example.com',
          filmType: 'C-41',
          quantity: 2,
          envelopeNumber: 'ENV-1041',
          remark: 'Push +1 stop if possible, please scan high-res.',
          unitPrice: 18,
          totalPrice: 36,
          createdAt: new Date(Date.now() - 86400000 * 3).toISOString(),
          status: 'ready_for_pickup',
          invoiceNumber: 'INV-20260901',
          invoiceSent: true,
          invoiceSentAt: new Date(Date.now() - 86400000 * 3).toISOString(),
          paymentStatus: 'paid',
          paymentMethod: 'QR',
          receiptNumber: 'REC-20260901',
          receiptSent: true,
          receiptSentAt: new Date(Date.now() - 86400000 * 2).toISOString(),
          verifiedByStaff: 'Marcus (Staff)',
          pickupNotified: true,
          pickupNotifiedAt: new Date(Date.now() - 86400000 * 1).toISOString(),
          pickupDeadline: new Date(Date.now() + 86400000 * 29).toISOString(),
          pickupAppointmentDate: todayStr,
          pickupTimeSlot: '02:00 PM - 03:00 PM',
          appointmentNotes: 'Customer booked via QR code link.',
          location: 'ALL'
        },
        {
          id: 'fo_002',
          orderNumber: 'REW-2026-002',
          customerName: 'Sophia Chen',
          customerPhone: '+60 12-345 6789',
          customerEmail: 'sophia.chen@example.com',
          filmType: 'ECN-2',
          quantity: 3,
          envelopeNumber: 'ENV-1042',
          remark: 'Kodak Vision3 250D motion film rolls with remjet layer.',
          unitPrice: 28,
          totalPrice: 84,
          createdAt: new Date(Date.now() - 86400000 * 2).toISOString(),
          status: 'in_process',
          invoiceNumber: 'INV-20260902',
          invoiceSent: true,
          invoiceSentAt: new Date(Date.now() - 86400000 * 2).toISOString(),
          paymentStatus: 'paid',
          paymentMethod: 'Online transfer',
          receiptNumber: 'REC-20260902',
          receiptSent: true,
          receiptSentAt: new Date(Date.now() - 86400000 * 1).toISOString(),
          verifiedByStaff: 'Angela (Admin)',
          pickupNotified: false,
          location: 'ALL'
        },
        {
          id: 'fo_003',
          orderNumber: 'REW-2026-003',
          customerName: 'Bryan Wong',
          customerPhone: '+60 13-987 6543',
          customerEmail: 'bryan.wong@example.com',
          filmType: 'Black and White',
          quantity: 1,
          envelopeNumber: 'ENV-1043',
          remark: 'Ilford HP5 Plus. Standard development.',
          unitPrice: 22,
          totalPrice: 22,
          createdAt: new Date(Date.now() - 3600000 * 5).toISOString(),
          status: 'registered',
          invoiceNumber: 'INV-20260903',
          invoiceSent: true,
          invoiceSentAt: new Date(Date.now() - 3600000 * 5).toISOString(),
          paymentStatus: 'unpaid',
          receiptSent: false,
          pickupNotified: false,
          location: 'ALL'
        }
      ];
    case 'rewind_settings':
      return [
        {
          id: 'main',
          studioName: 'Rewind',
          tagline: 'Film Lab & Vintage Cameras',
          currency: 'RM',
          phone: '+60 12-345 6789',
          email: 'hello@rewindfilmlab.com',
          address: '12-A, Jalan Gurdwara, 10300 George Town, Penang, Malaysia',
          operatingHours: '11:00 AM - 7:00 PM (Daily)',
          bankName: 'Maybank',
          bankAccountNo: '5123 4567 8901',
          bankAccountName: 'Rewind Studio Enterprise',
          priceC41: 18,
          priceBW: 22,
          priceECN2: 28,
          staffAllowedTabs: [
            'dashboard',
            'calendar',
            'film-registration',
            'invoices-receipts',
            'pickups',
            'pos',
            'products'
          ]
        }
      ];
    case 'staff':
      return [
        { id: 'staff_angela', name: 'Angela (Admin)', branch: 'ALL', active: true, email: 'angella0333@gmail.com', role: 'admin' },
        { id: 'staff_marcus', name: 'Marcus (Staff)', branch: 'ALL', active: true, email: 'marcus@rewind.com', role: 'staff' },
        { id: 'staff_sarah', name: 'Sarah (Staff)', branch: 'ALL', active: true, email: 'sarah@rewind.com', role: 'staff' },
      ];
    case 'expense_categories':
      return [
        { id: 'exp_cat_rent', name: 'Rent & Rental', createdAt: new Date().toISOString(), spendingType: 'Expenses' },
        { id: 'exp_cat_supplies', name: 'Studio Supplies', createdAt: new Date().toISOString(), spendingType: 'Expenses' },
        { id: 'exp_cat_utils', name: 'Utilities', createdAt: new Date().toISOString(), spendingType: 'Expenses' },
        { id: 'exp_cat_salary', name: 'Staff Salaries', createdAt: new Date().toISOString(), spendingType: 'Expenses' },
        { id: 'exp_cat_others', name: 'Others', createdAt: new Date().toISOString(), spendingType: 'Expenses' },
      ];
    case 'bank_config':
      return [
        { id: 'main', initialBalance: 5000, lastUpdated: new Date().toISOString() }
      ];
    case 'bookings':
      return [
        {
          id: 'b_today',
          workshopId: 'wheel-throwing',
          workshopName: 'Wheel Throwing Trial',
          customerName: 'Sophia Chen',
          customerPhone: '+60 12-345 6789',
          customerEmail: 'sophia.chen@example.com',
          date: todayStr,
          time: '10:00',
          status: 'confirmed',
          depositPaid: true,
          balancePaid: false,
          totalPrice: 150,
          depositAmount: 50,
          pax: 2,
          notes: 'Prefers white stoneware clay.',
          location: 'PG',
          staffName: 'Angela',
          recordingDate: todayStr
        },
        {
          id: 'b_tomorrow',
          workshopId: 'handbuilding',
          workshopName: 'Handbuilding Ceramics',
          customerName: 'Marcus Tan',
          customerPhone: '+60 17-654 3210',
          customerEmail: 'marcus.tan@example.com',
          date: tomorrowStr,
          time: '14:00',
          status: 'pending',
          depositPaid: false,
          balancePaid: false,
          totalPrice: 120,
          depositAmount: 40,
          pax: 1,
          notes: 'Celebrating birthday!',
          location: 'BM',
          staffName: 'Bryan',
          recordingDate: tomorrowStr
        },
        {
          id: 'b_yesterday',
          workshopId: 'underglaze-painting',
          workshopName: 'Ceramic Painting & Glazing',
          customerName: 'Isabella Wong',
          customerPhone: '+60 13-987 6543',
          customerEmail: 'isabella.wong@example.com',
          date: yesterdayStr,
          time: '11:00',
          status: 'completed',
          depositPaid: true,
          balancePaid: true,
          totalPrice: 80,
          depositAmount: 30,
          pax: 1,
          notes: 'Pickup from BM branch.',
          location: 'PG',
          staffName: 'Chloe',
          recordingDate: yesterdayStr
        }
      ];
    case 'email_settings':
      return [
        {
          id: 'main',
          senderName: 'Nendoa Studio',
          fromEmail: 'hello@nendoastudio.com',
          replyTo: 'contact@nendoastudio.com',
          studioAddressPG: '214, Lebuh Victoria, 10300 Georgetown, Pulau Pinang',
          studioAddressBM: '214, Lebuh Victoria, 10300 Georgetown, Pulau Pinang',
          studioPhone: '+60 12-889 2030',
          websiteUrl: 'https://nendoastudio.com',
          signatureTagline: 'Handcrafted ceramic moments in Penang.',
          smtpHost: '',
          smtpPort: 587,
          smtpSecure: false,
          smtpUser: '',
          smtpPass: '',
          useCustomSmtp: false,
        }
      ];
    case 'email_logs':
      return [
        {
          id: 'mail_log_1',
          to: 'sophia.chen@example.com',
          customerName: 'Sophia Chen',
          subject: 'Booking Confirmed: Wheel Throwing Trial at Nendoa Studio',
          fromEmail: 'hello@nendoastudio.com',
          fromName: 'Nendoa Studio',
          templateType: 'booking_confirmation',
          bodyHtml: '<p>Dear Sophia Chen,</p><p><p>Your booking for Wheel Throwing Trial on ' + todayStr + ' at 10:00 has been confirmed.</p>',
          status: 'delivered',
          createdAt: new Date(Date.now() - 3600000).toISOString(),
          messageId: 'msg_seed_sophia_conf',
          relatedBookingId: 'b_today',
          location: 'PG',
          sentBy: 'Angela'
        }
      ];
    case 'transactions':
      return [
        {
          id: 't_today_dep',
          type: 'deposit',
          amount: 50,
          timestamp: Timestamp.now(),
          description: 'Deposit for Wheel Throwing Trial',
          relatedId: 'b_today',
          customerName: 'Sophia Chen',
          customerPhone: '+60 12-345 6789',
          location: 'PG',
          staffName: 'Angela'
        },
        {
          id: 't_yest_dep',
          type: 'deposit',
          amount: 30,
          timestamp: Timestamp.fromDate(new Date(Date.now() - 172800000)),
          description: 'Deposit for Ceramic Painting & Glazing',
          relatedId: 'b_yesterday',
          customerName: 'Isabella Wong',
          customerPhone: '+60 13-987 6543',
          location: 'PG',
          staffName: 'Chloe'
        },
        {
          id: 't_yest_bal',
          type: 'balance',
          amount: 50,
          timestamp: Timestamp.fromDate(new Date(Date.now() - 86400000)),
          description: 'Balance for Ceramic Painting & Glazing',
          relatedId: 'b_yesterday',
          customerName: 'Isabella Wong',
          customerPhone: '+60 13-987 6543',
          location: 'PG',
          staffName: 'Chloe'
        }
      ];
    default:
      return [];
  }
}

function getCollectionData(collectionPath: string): any[] {
  const data = localStorage.getItem(`rewind_db_${collectionPath}`) || localStorage.getItem(`nendoa_db_${collectionPath}`);
  if (!data) {
    const seed = getInitialSeedData(collectionPath);
    localStorage.setItem(`rewind_db_${collectionPath}`, JSON.stringify(seed));
    return reviveTimestamps(seed);
  }
  try {
    const parsed = JSON.parse(data);
    // If products collection has old pottery seed, upgrade to Rewind camera seed
    if (collectionPath === 'products' && Array.isArray(parsed) && parsed.some(p => p.id === 'prod_clay_white')) {
      const seed = getInitialSeedData('products');
      localStorage.setItem(`rewind_db_${collectionPath}`, JSON.stringify(seed));
      return reviveTimestamps(seed);
    }
    return reviveTimestamps(parsed);
  } catch (e) {
    return [];
  }
}

function setCollectionData(collectionPath: string, items: any[]) {
  localStorage.setItem(`rewind_db_${collectionPath}`, JSON.stringify(items));
  triggerSnapshots(collectionPath);
}

// ==========================================
// 3. FIRESTORE REFERENCES & CLASS MOCKS
// ==========================================
export class MockDocumentReference {
  type = 'document' as const;
  id: string;
  path: string;

  constructor(path: string, id: string) {
    this.path = path;
    this.id = id;
  }
}

export class MockCollectionReference {
  type = 'collection' as const;
  path: string;

  constructor(path: string) {
    this.path = path;
  }
}

export class MockDocumentSnapshot {
  _exists: boolean;
  id: string;
  _data: any;

  constructor(exists: boolean, id: string, data: any) {
    this._exists = exists;
    this.id = id;
    this._data = data;
  }

  exists() {
    return this._exists;
  }

  data() {
    return this._data;
  }
}

export class MockQuerySnapshot {
  docs: MockDocumentSnapshot[];

  constructor(docs: MockDocumentSnapshot[]) {
    this.docs = docs;
  }

  get size() {
    return this.docs.length;
  }

  get empty() {
    return this.docs.length === 0;
  }

  forEach(callback: (doc: MockDocumentSnapshot) => void) {
    this.docs.forEach(callback);
  }
}

export class MockQuery {
  colRef: MockCollectionReference;
  constraints: any[];
  path: string;

  constructor(colRef: MockCollectionReference, constraints: any[]) {
    this.colRef = colRef;
    this.constraints = constraints;
    this.path = colRef.path;
  }
}

// ==========================================
// 4. SNAPSHOT EVENT DISPATCHER
// ==========================================
type SnapshotCallback = (snapshot?: any) => void;
const activeListeners = new Map<string, Set<SnapshotCallback>>();

function triggerSnapshots(collectionPath: string) {
  const colListeners = activeListeners.get(collectionPath);
  if (colListeners) {
    colListeners.forEach(listener => {
      try {
        listener();
      } catch (err) {
        console.error("Error in mock onSnapshot listener:", err);
      }
    });
  }
}

// ==========================================
// 5. FIRESTORE METHODS IMPLEMENTATION
// ==========================================
export function getFirestore() {
  return { type: 'firestore' };
}

export function doc(dbOrCol: any, pathOrId?: string, ...segments: string[]) {
  if (dbOrCol.type === 'collection') {
    const colPath = dbOrCol.path;
    const docId = pathOrId!;
    return new MockDocumentReference(`${colPath}/${docId}`, docId);
  } else {
    // dbOrCol is db
    const colPath = pathOrId!;
    const docId = segments[0] || 'default_doc_id';
    return new MockDocumentReference(`${colPath}/${docId}`, docId);
  }
}

export function collection(db: any, path: string) {
  return new MockCollectionReference(path);
}

export async function getDoc(docRef: MockDocumentReference) {
  const parts = docRef.path.split('/');
  const collectionPath = parts[0];
  const items = getCollectionData(collectionPath);
  const found = items.find(i => i.id === docRef.id);
  if (found) {
    return new MockDocumentSnapshot(true, docRef.id, found);
  }
  return new MockDocumentSnapshot(false, docRef.id, null);
}

export async function getDocFromServer(docRef: MockDocumentReference) {
  return getDoc(docRef);
}

export async function setDoc(docRef: MockDocumentReference, data: any, options?: any) {
  const parts = docRef.path.split('/');
  const collectionPath = parts[0];
  const items = getCollectionData(collectionPath);
  const index = items.findIndex(i => i.id === docRef.id);

  let updatedData = { ...data };
  if (options?.merge && index >= 0) {
    updatedData = { ...items[index], ...data };
  }

  // Handle timestamp representation in standard formats
  for (const k of Object.keys(updatedData)) {
    if (updatedData[k] instanceof Timestamp) {
      // Keep instance in memory but JSON will handle seconds
    }
  }

  if (index >= 0) {
    items[index] = { ...updatedData, id: docRef.id };
  } else {
    items.push({ ...updatedData, id: docRef.id });
  }

  setCollectionData(collectionPath, items);
}

export const deleteField = () => 'MOCK_DELETE_FIELD_SENTINEL';

export async function addDoc(colRef: MockCollectionReference, data: any) {
  const items = getCollectionData(colRef.path);
  const newId = 'doc_' + Math.floor(Math.random() * 10000000);
  
  const docData = { ...data, id: newId };
  items.push(docData);
  setCollectionData(colRef.path, items);
  
  return new MockDocumentReference(`${colRef.path}/${newId}`, newId);
}

export async function updateDoc(docRef: MockDocumentReference, data: any) {
  const parts = docRef.path.split('/');
  const collectionPath = parts[0];
  const items = getCollectionData(collectionPath);
  const index = items.findIndex(i => i.id === docRef.id);

  if (index >= 0) {
    const current = { ...items[index] };
    for (const key of Object.keys(data)) {
      if (data[key] === 'MOCK_DELETE_FIELD_SENTINEL') {
        delete current[key];
      } else {
        current[key] = data[key];
      }
    }
    items[index] = current;
    setCollectionData(collectionPath, items);
  } else {
    throw new Error(`Document not found: ${docRef.path}`);
  }
}

export async function deleteDoc(docRef: MockDocumentReference) {
  const parts = docRef.path.split('/');
  const collectionPath = parts[0];
  const items = getCollectionData(collectionPath);
  const filtered = items.filter(i => i.id !== docRef.id);
  setCollectionData(collectionPath, filtered);
}

export function query(colRef: MockCollectionReference, ...constraints: any[]) {
  return new MockQuery(colRef, constraints);
}

export function where(field: string, operator: string, value: any) {
  return { type: 'where', field, operator, value };
}

export function orderBy(field: string, direction: 'asc' | 'desc' = 'asc') {
  return { type: 'orderBy', field, direction };
}

export function limit(count: number) {
  return { type: 'limit', count };
}

function executeQuery(queryOrCol: any): MockQuerySnapshot {
  let colPath: string;
  let constraints: any[] = [];

  if (queryOrCol.type === 'collection') {
    colPath = queryOrCol.path;
  } else if (queryOrCol instanceof MockQuery) {
    colPath = queryOrCol.colRef.path;
    constraints = queryOrCol.constraints;
  } else {
    colPath = queryOrCol.path;
  }

  let items = getCollectionData(colPath);

  // Apply filters
  for (const c of constraints) {
    if (c.type === 'where') {
      const { field, operator, value } = c;
      items = items.filter(item => {
        let itemVal = item[field];
        
        // Resolve nested fields like timestamp comparison
        if (itemVal instanceof Timestamp) {
          itemVal = itemVal.toDate();
        }

        let targetVal = value;
        if (targetVal instanceof Timestamp) {
          targetVal = targetVal.toDate();
        }

        // Standard comparison operations
        if (operator === '==') {
          if (itemVal instanceof Date && targetVal instanceof Date) {
            return itemVal.getTime() === targetVal.getTime();
          }
          return itemVal === targetVal;
        }
        if (operator === '!=') return itemVal !== targetVal;
        if (operator === '>') return itemVal > targetVal;
        if (operator === '>=') return itemVal >= targetVal;
        if (operator === '<') return itemVal < targetVal;
        if (operator === '<=') return itemVal <= targetVal;
        if (operator === 'array-contains') return Array.isArray(itemVal) && itemVal.includes(targetVal);
        if (operator === 'in') return Array.isArray(targetVal) && targetVal.includes(itemVal);
        return true;
      });
    }
  }

  // Apply order
  for (const c of constraints) {
    if (c.type === 'orderBy') {
      const { field, direction } = c;
      items.sort((a, b) => {
        let valA = a[field];
        let valB = b[field];

        if (valA instanceof Timestamp) valA = valA.valueOf();
        if (valB instanceof Timestamp) valB = valB.valueOf();
        if (valA instanceof Date) valA = valA.getTime();
        if (valB instanceof Date) valB = valB.getTime();

        if (valA === undefined || valA === null) return direction === 'asc' ? 1 : -1;
        if (valB === undefined || valB === null) return direction === 'asc' ? -1 : 1;

        if (valA < valB) return direction === 'asc' ? -1 : 1;
        if (valA > valB) return direction === 'asc' ? 1 : -1;
        return 0;
      });
    }
  }

  // Apply limit
  for (const c of constraints) {
    if (c.type === 'limit') {
      items = items.slice(0, c.count);
    }
  }

  const docSnaps = items.map(item => new MockDocumentSnapshot(true, item.id, item));
  return new MockQuerySnapshot(docSnaps);
}

export async function getDocs(queryOrCol: any) {
  return executeQuery(queryOrCol);
}

export function onSnapshot(queryOrColRef: any, callback: SnapshotCallback, errorCallback?: (err: any) => void) {
  const collectionPath = queryOrColRef.path || queryOrColRef.colRef?.path;
  if (!collectionPath) {
    console.warn("onSnapshot: collection path missing on reference", queryOrColRef);
    return () => {};
  }

  let listeners = activeListeners.get(collectionPath);
  if (!listeners) {
    listeners = new Set();
    activeListeners.set(collectionPath, listeners);
  }

  const listenerWrapper = () => {
    try {
      const snapshot = executeQuery(queryOrColRef);
      callback(snapshot);
    } catch (err) {
      if (errorCallback) errorCallback(err);
    }
  };

  listeners.add(listenerWrapper);

  // Initial trigger
  setTimeout(listenerWrapper, 0);

  return () => {
    const colListeners = activeListeners.get(collectionPath);
    if (colListeners) {
      colListeners.delete(listenerWrapper);
      if (colListeners.size === 0) {
        activeListeners.delete(collectionPath);
      }
    }
  };
}

export function writeBatch(db: any) {
  const operations: (() => void)[] = [];
  return {
    set(docRef: MockDocumentReference, data: any, options?: any) {
      operations.push(() => {
        setDoc(docRef, data, options);
      });
    },
    update(docRef: MockDocumentReference, data: any) {
      operations.push(() => {
        updateDoc(docRef, data);
      });
    },
    delete(docRef: MockDocumentReference) {
      operations.push(() => {
        deleteDoc(docRef);
      });
    },
    async commit() {
      operations.forEach(op => op());
    }
  };
}

// ==========================================
// 6. STORAGE METHODS IMPLEMENTATION
// ==========================================
export function getStorage() {
  return { type: 'storage' };
}

export function ref(storage: any, path: string) {
  return { type: 'storage_ref', path };
}

export async function uploadBytes(storageRef: any, file: File): Promise<any> {
  return new Promise((resolve) => {
    const reader = new FileReader();
    reader.onloadend = () => {
      const dataUrl = reader.result as string;
      localStorage.setItem(`nendoa_storage_${storageRef.path}`, dataUrl);
      resolve({ ref: storageRef });
    };
    reader.readAsDataURL(file);
  });
}

export async function getDownloadURL(storageRef: any) {
  const saved = localStorage.getItem(`nendoa_storage_${storageRef.path}`);
  if (saved) return saved;
  // Fallbacks based on typical image names
  if (storageRef.path.includes('booking')) {
    return 'https://images.unsplash.com/photo-1565192647048-f997ded8795c?w=500&auto=format&fit=crop&q=60';
  }
  return 'https://images.unsplash.com/photo-1578749556568-bc2c40e68b61?w=500&auto=format&fit=crop&q=60';
}

// ==========================================
// 7. AUTH METHODS IMPLEMENTATION
// ==========================================
export interface User {
  uid: string;
  email: string | null;
  emailVerified: boolean;
  isAnonymous: boolean;
}

class MockAuth {
  currentUser: User | null = null;
  listeners: ((user: User | null) => void)[] = [];

  constructor() {
    const saved = localStorage.getItem('nendoa_auth_user');
    if (saved) {
      try {
        this.currentUser = JSON.parse(saved);
      } catch (e) {
        this.currentUser = null;
      }
    } else {
      // Auto-populate active admin user if not found to provide a zero-config start!
      const defaultUser = {
        uid: 'admin_nendoa',
        email: 'admin@nendoa.com',
        emailVerified: true,
        isAnonymous: false
      };
      this.currentUser = defaultUser;
      localStorage.setItem('nendoa_auth_user', JSON.stringify(defaultUser));
    }
  }

  onAuthStateChanged(callback: (user: User | null) => void) {
    this.listeners.push(callback);
    setTimeout(() => callback(this.currentUser), 0);
    return () => {
      this.listeners = this.listeners.filter(l => l !== callback);
    };
  }

  setCurrentUser(user: User | null) {
    this.currentUser = user;
    if (user) {
      localStorage.setItem('nendoa_auth_user', JSON.stringify(user));
    } else {
      localStorage.removeItem('nendoa_auth_user');
    }
    this.listeners.forEach(l => l(user));
  }
}

const mockAuthInstance = new MockAuth();

export function getAuth() {
  return mockAuthInstance;
}

export function onAuthStateChanged(auth: any, callback: (user: User | null) => void) {
  return auth.onAuthStateChanged(callback);
}

export async function signInWithEmailAndPassword(auth: MockAuth, email: string, pass: string) {
  const users = getCollectionData('users');
  const userKey = email.toLowerCase().trim();
  let found = users.find(u => u.email.toLowerCase().trim() === userKey);

  if (!found) {
    // Dynamically register/create on-the-fly for seamless login experience!
    const isNewAdmin = userKey.includes('admin');
    const newUid = 'user_' + Math.floor(Math.random() * 10000000);
    found = {
      id: newUid,
      uid: newUid,
      email: email,
      branch: isNewAdmin ? 'ALL' : 'PG',
      role: isNewAdmin ? 'admin' : 'staff'
    };
    users.push(found);
    setCollectionData('users', users);
  }

  const user: User = {
    uid: found.uid,
    email: found.email,
    emailVerified: true,
    isAnonymous: false
  };

  auth.setCurrentUser(user);
  return { user };
}

export async function createUserWithEmailAndPassword(auth: MockAuth, email: string, pass: string) {
  const users = getCollectionData('users');
  const userKey = email.toLowerCase().trim();
  const exists = users.some(u => u.email.toLowerCase().trim() === userKey);

  if (exists) {
    throw new Error('auth/email-already-in-use');
  }

  const newUid = 'user_' + Math.floor(Math.random() * 10000000);
  const isNewAdmin = userKey.includes('admin');
  const newUser = {
    id: newUid,
    uid: newUid,
    email: email,
    branch: isNewAdmin ? 'ALL' : 'PG',
    role: isNewAdmin ? 'admin' : 'staff'
  };

  users.push(newUser);
  setCollectionData('users', users);

  const user: User = {
    uid: newUid,
    email: email,
    emailVerified: true,
    isAnonymous: false
  };

  auth.setCurrentUser(user);
  return { user };
}

export async function signOut(auth: MockAuth) {
  auth.setCurrentUser(null);
}

export function initializeApp() {
  return {};
}
