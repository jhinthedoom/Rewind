import React, { useState, useEffect } from 'react';
import { db } from '../firebase';
import { collection, onSnapshot, addDoc, updateDoc, doc, setDoc, deleteDoc, query, orderBy, where, Timestamp } from 'firebase/firestore';
import { Staff, Branch, OperationType, Transaction, CommissionPayment, UserProfile } from '../types';
import { handleFirestoreError } from '../utils';
import { motion, AnimatePresence } from 'motion/react';
import { UserPlus, Trash2, Edit2, Check, X, Shield, Award, Banknote, Printer, Receipt, Calendar, Clock, AlertCircle, ChevronDown, ChevronUp } from 'lucide-react';
import { ConfirmationModal } from './ConfirmationModal';
import { format, startOfMonth, endOfMonth, parseISO } from 'date-fns';

interface StaffProps {
  branch: Branch;
  role?: string;
}

const StaffManagement: React.FC<StaffProps> = ({ branch, role }) => {
  const [staff, setStaff] = useState<Staff[]>([]);
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [payments, setPayments] = useState<CommissionPayment[]>([]);
  const [portalUsers, setPortalUsers] = useState<UserProfile[]>([]);
  const [isAddingPortalUser, setIsAddingPortalUser] = useState(false);
  const [portalFormData, setPortalFormData] = useState<UserProfile>({
    uid: '',
    email: '',
    branch: 'BM',
    role: 'staff'
  });
  const [isAdding, setIsAdding] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [selectedMonth, setSelectedMonth] = useState(format(new Date(), 'yyyy-MM'));
  const [receipt, setReceipt] = useState<CommissionPayment | null>(null);
  const [isProcessing, setIsProcessing] = useState<string | null>(null);
  const [confirmPaymentFor, setConfirmPaymentFor] = useState<Staff | null>(null);
  const [expandedCommissionStaffId, setExpandedCommissionStaffId] = useState<string | null>(null);
  const [deleteStaffId, setDeleteStaffId] = useState<string | null>(null);
  const [deletePortalUserId, setDeletePortalUserId] = useState<string | null>(null);
  
  const [formData, setFormData] = useState<Omit<Staff, 'id'>>({
    name: '',
    branch: branch === 'ALL' ? 'BM' : branch,
    active: true,
  });

  useEffect(() => {
    const qStaff = query(
      collection(db, 'staff'),
      orderBy('name', 'asc')
    );

    const unsubStaff = onSnapshot(qStaff, (snapshot) => {
      const data = snapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data()
      })) as Staff[];
      
      if (branch !== 'ALL') {
        setStaff(data.filter(s => s.branch === branch || s.branch === 'ALL'));
      } else {
        setStaff(data);
      }
    }, (error) => {
      handleFirestoreError(error, OperationType.LIST, 'staff');
    });

    const qTrans = branch === 'ALL' 
      ? collection(db, 'transactions')
      : query(collection(db, 'transactions'), where('location', '==', branch));
      
    const unsubTrans = onSnapshot(qTrans, (snapshot) => {
      const data = snapshot.docs.map(doc => ({
        id: doc.id, ...doc.data()
      })) as Transaction[];
      setTransactions(data);
    }, (error) => {
      handleFirestoreError(error, OperationType.LIST, 'transactions');
    });

    const qPayments = branch === 'ALL'
      ? collection(db, 'commissionPayments')
      : query(collection(db, 'commissionPayments'), where('location', '==', branch));

    const unsubPayments = onSnapshot(qPayments, (snapshot) => {
      const data = snapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data()
      })) as CommissionPayment[];
      setPayments(data);
    }, (error) => {
      handleFirestoreError(error, OperationType.LIST, 'commissionPayments');
    });

    // 5. Portal users list snapshot subscriber
    const qUsers = collection(db, 'users');
    const unsubUsers = onSnapshot(qUsers, (snapshot) => {
      const data = snapshot.docs.map(doc => ({
        uid: doc.id,
        ...doc.data()
      })) as UserProfile[];
      setPortalUsers(data);
    }, (error) => {
      console.warn("Error loading portal users stream:", error);
    });

    return () => {
      unsubStaff();
      unsubTrans();
      unsubPayments();
      unsubUsers();
    };
  }, [branch]);

  const isEligibleForCommission = (tx: Transaction) => {
    return tx.location === 'PG' || tx.location === 'BM';
  };

  const getCommissionForMonth = (name: string, monthStr: string) => {
    return transactions
      .filter(tx => {
        if (!tx.staffName || tx.staffName.trim().toLowerCase() !== name.trim().toLowerCase()) return false;
        if (!isEligibleForCommission(tx)) return false;
        try {
          // Handle both ISO strings and Firestore Timestamps
          const date = tx.timestamp?.toDate ? tx.timestamp.toDate() : new Date(tx.timestamp);
          const txMonth = format(date, 'yyyy-MM');
          return txMonth === monthStr;
        } catch {
          return false;
        }
      })
      .reduce((sum, tx) => {
        let rate = 0.035;
        if (tx.location === 'BM') {
          rate = tx.commissionRate ? (tx.commissionRate / 100) : 0.01;
        } else if (tx.location === 'PG') {
          rate = tx.commissionRate ? (tx.commissionRate / 100) : 0.035;
        }
        return sum + ((tx.amount || 0) * rate);
      }, 0);
  };

  const getCommissionTransactionsForMonth = (name: string, monthStr: string) => {
    return transactions
      .filter(tx => {
        if (!tx.staffName || tx.staffName.trim().toLowerCase() !== name.trim().toLowerCase()) return false;
        if (!isEligibleForCommission(tx)) return false;
        try {
          // Handle both ISO strings and Firestore Timestamps
          const date = tx.timestamp?.toDate ? tx.timestamp.toDate() : new Date(tx.timestamp);
          const txMonth = format(date, 'yyyy-MM');
          return txMonth === monthStr;
        } catch {
          return false;
        }
      });
  };

  const isPaid = (staffId: string, monthStr: string) => {
    return payments.find(p => p.staffId === staffId && p.month === monthStr);
  };

  const handlePayCommission = async (s: Staff) => {
    if (!s.id) {
      alert('Error: Staff ID is missing.');
      return;
    }

    const amount = getCommissionForMonth(s.name, selectedMonth);
    if (amount <= 0) {
      alert('No commission found to process for this staff in the selected month.');
      return;
    }

    const existingPayment = isPaid(s.id, selectedMonth);
    if (existingPayment) {
      setReceipt(existingPayment);
      return;
    }

    setConfirmPaymentFor(s);
  };

  const processAuthorizedPayment = async (s: Staff) => {
    const amount = getCommissionForMonth(s.name, selectedMonth);
    setIsProcessing(s.id!);
    try {
      const paymentLocation = branch === 'ALL' ? (s.branch === 'ALL' ? 'BM' : s.branch) : branch;
      
      const paymentData: Omit<CommissionPayment, 'id'> = {
        staffId: s.id!,
        staffName: s.name,
        amount,
        month: selectedMonth,
        timestamp: new Date().toISOString(),
        location: paymentLocation as any
      };

      const docRef = await addDoc(collection(db, 'commissionPayments'), paymentData);
      const finalPayment = { id: docRef.id, ...paymentData };
      setReceipt(finalPayment);
      
      window.scrollTo({ top: 0, behavior: 'smooth' });
    } catch (error) {
      handleFirestoreError(error, OperationType.WRITE, 'commissionPayments');
    } finally {
      setIsProcessing(null);
      setConfirmPaymentFor(null);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      if (editingId) {
        await updateDoc(doc(db, 'staff', editingId), formData);
        setEditingId(null);
      } else {
        await addDoc(collection(db, 'staff'), formData);
        setIsAdding(false);
      }
      setFormData({ name: '', branch: branch === 'ALL' ? 'BM' : branch, active: true });
    } catch (error) {
      handleFirestoreError(error, OperationType.WRITE, 'staff');
    }
  };

  const handleEdit = (s: Staff) => {
    setEditingId(s.id!);
    setFormData({ name: s.name, branch: s.branch, active: s.active });
    setIsAdding(true);
  };

  const handleDelete = (id: string) => {
    setDeleteStaffId(id);
  };

  const handleConfirmDeleteStaff = async () => {
    if (!deleteStaffId) return;
    try {
      await deleteDoc(doc(db, 'staff', deleteStaffId));
    } catch (error) {
      handleFirestoreError(error, OperationType.DELETE, `staff/${deleteStaffId}`);
    }
  };

  const handleUpdatePortalUser = async (uid: string, field: 'branch' | 'role', value: string) => {
    try {
      const userRef = doc(db, 'users', uid);
      await updateDoc(userRef, { [field]: value });
    } catch (error) {
      handleFirestoreError(error, OperationType.UPDATE, `users/${uid}`);
    }
  };

  const handleDeletePortalUser = (uid: string) => {
    setDeletePortalUserId(uid);
  };

  const handleConfirmDeletePortalUser = async () => {
    if (!deletePortalUserId) return;
    try {
      await deleteDoc(doc(db, 'users', deletePortalUserId));
    } catch (error) {
      handleFirestoreError(error, OperationType.DELETE, `users/${deletePortalUserId}`);
    }
  };

  const handleAddPortalUserSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const trimmedUid = portalFormData.uid.trim();
    const trimmedEmail = portalFormData.email.trim();
    if (!trimmedUid) {
      alert("Please enter the user UID from your Firebase authentication console.");
      return;
    }
    if (!trimmedEmail) {
      alert("Please enter the email address.");
      return;
    }
    
    try {
      const userRef = doc(db, 'users', trimmedUid);
      
      const newProfile: UserProfile = {
        uid: trimmedUid,
        email: trimmedEmail,
        branch: portalFormData.branch,
        role: portalFormData.role
      };
      
      await setDoc(userRef, newProfile);
      setIsAddingPortalUser(false);
      setPortalFormData({ uid: '', email: '', branch: 'BM', role: 'staff' });
    } catch (error) {
      handleFirestoreError(error, OperationType.WRITE, `users/${portalFormData.uid}`);
    }
  };

  return (
    <div className="space-y-8">
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-6">
        <div>
          <h2 className="text-3xl font-serif italic text-[#2D241E]">Staff Management</h2>
          <p className="text-[10px] text-[#8C8379] font-black uppercase tracking-[0.2em] mt-1">Manage your creative team and commissions</p>
        </div>
        
        <div className="flex flex-wrap items-center gap-3 w-full md:w-auto">
          <div className="bg-white border border-[#D9D1C7] rounded-2xl px-4 py-2 flex items-center gap-3 shadow-sm">
            <Calendar size={16} className="text-[#8C8379]" />
            <input 
              type="month" 
              className="bg-transparent border-none text-xs font-black uppercase tracking-widest text-[#2D241E] focus:outline-none"
              value={selectedMonth}
              onChange={(e) => setSelectedMonth(e.target.value)}
            />
          </div>

          <button
            onClick={() => {
              setIsAdding(!isAdding);
              setEditingId(null);
              setFormData({ name: '', branch: branch === 'ALL' ? 'BM' : branch, active: true });
            }}
            className="flex-1 md:flex-none bg-[#2D241E] text-white px-6 py-3 rounded-2xl flex items-center justify-center gap-2 hover:bg-[#40352E] transition-all shadow-sm"
          >
            <UserPlus size={18} />
            <span className="text-xs font-black uppercase tracking-widest">Add Staff</span>
          </button>
        </div>
      </div>

      {isAdding && (
        <motion.div
          initial={{ opacity: 0, y: -20 }}
          animate={{ opacity: 1, y: 0 }}
          className="natural-card p-8 bg-[#F2EFE9]/50"
        >
          <form onSubmit={handleSubmit} className="grid grid-cols-1 md:grid-cols-3 gap-6">
            <div className="space-y-2">
              <label className="text-[10px] font-black text-[#8C8379] uppercase tracking-widest px-1">Staff Name</label>
              <input
                required
                type="text"
                className="natural-input w-full"
                placeholder="Full Name"
                value={formData.name}
                onChange={(e) => setFormData({ ...formData, name: e.target.value })}
              />
            </div>
            {/* Primary Branch is defaulted to ALL since there is only one branch now */}
            <div className="flex items-end gap-3">
              <button
                type="submit"
                className="flex-1 bg-[#8B9A82] text-white py-3 rounded-xl font-black uppercase text-[10px] tracking-widest hover:bg-[#7A8971] transition-all"
              >
                {editingId ? 'Update' : 'Register'}
              </button>
              <button
                type="button"
                onClick={() => setIsAdding(false)}
                className="px-4 py-3 border border-[#D9D1C7] text-[#8C8379] rounded-xl hover:bg-white transition-all"
              >
                <X size={18} />
              </button>
            </div>
          </form>
        </motion.div>
      )}

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {staff.map((s) => (
          <motion.div
            layout
            key={s.id}
            className="natural-card p-6 flex flex-col gap-6 group"
          >
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-4">
                <div className="w-12 h-12 bg-[#F2EFE9] rounded-full flex items-center justify-center text-[#2D241E]">
                  <Award size={20} />
                </div>
                <div>
                  <h4 className="font-serif italic font-bold text-lg text-[#2D241E]">{s.name}</h4>
                  <div className="flex gap-2 items-center">
                    <span className="text-[8px] font-black uppercase tracking-widest px-2 py-0.5 bg-[#F2EFE9] rounded text-[#8C8379]">
                      {s.branch === 'ALL' ? 'Multi-Branch' : s.branch}
                    </span>
                    {s.active ? (
                      <span className="flex items-center gap-1 text-[8px] font-black uppercase text-[#8B9A82]">
                        <div className="w-1 h-1 rounded-full bg-[#8B9A82]" /> Active
                      </span>
                    ) : (
                      <span className="text-[8px] font-black uppercase text-red-400">Inactive</span>
                    )}
                  </div>
                </div>
              </div>
              <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                <button
                  onClick={() => handleEdit(s)}
                  className="p-2 text-[#8C8379] hover:text-[#2D241E] hover:bg-[#F2EFE9] rounded-lg transition-all"
                >
                  <Edit2 size={14} />
                </button>
                <button
                  onClick={() => handleDelete(s.id!)}
                  className="p-2 text-[#8C8379] hover:text-red-400 hover:bg-red-50 rounded-lg transition-all"
                >
                  <Trash2 size={14} />
                </button>
              </div>
            </div>

            <div className="pt-4 border-t border-[#D9D1C7]/30 flex flex-col gap-4">
              <div className="flex justify-between items-end">
                <div>
                  <p className="text-[9px] font-black uppercase text-[#8C8379] tracking-widest mb-1">Commission ({format(parseISO(selectedMonth + '-01'), 'MMM yyyy')})</p>
                  <div className="text-2xl font-serif text-[#2D241E]">RM{getCommissionForMonth(s.name, selectedMonth).toFixed(2)}</div>
                </div>
                <div className={`${isPaid(s.id!, selectedMonth) ? 'bg-[#8B9A82] text-white' : 'bg-[#8B9A82]/10 text-[#8B9A82]'} p-2.5 rounded-xl transition-all`}>
                  <Banknote size={24} />
                </div>
              </div>

              {(getCommissionForMonth(s.name, selectedMonth) > 0 || isPaid(s.id!, selectedMonth)) && (
                <button
                  onClick={() => handlePayCommission(s)}
                  disabled={isProcessing === s.id}
                  className={`w-full py-3 rounded-xl flex items-center justify-center gap-2 transition-all transform active:scale-[0.98] ${
                    isPaid(s.id!, selectedMonth)
                      ? 'bg-[#F2EFE9] text-[#8C8379] border border-[#D9D1C7]/50'
                      : isProcessing === s.id
                        ? 'bg-[#D9D1C7] text-white cursor-not-allowed'
                        : 'bg-[#2D241E] text-white shadow-md hover:bg-black'
                  }`}
                >
                  {isPaid(s.id!, selectedMonth) ? (
                    <>
                      <Receipt size={14} />
                      <span className="text-[10px] font-black uppercase tracking-wider">View Voucher</span>
                    </>
                  ) : isProcessing === s.id ? (
                    <>
                      <motion.div
                        animate={{ rotate: 360 }}
                        transition={{ duration: 1, repeat: Infinity, ease: 'linear' }}
                      >
                        <Clock size={14} />
                      </motion.div>
                      <span className="text-[10px] font-black uppercase tracking-wider">Processing...</span>
                    </>
                  ) : (
                    <>
                      <Banknote size={14} />
                      <span className="text-[10px] font-black uppercase tracking-wider">Process Payment</span>
                    </>
                  )}
                </button>
              )}

              {/* Commission Details Button & List */}
              <div className="mt-1">
                <button
                  type="button"
                  onClick={() => setExpandedCommissionStaffId(expandedCommissionStaffId === s.id ? null : s.id)}
                  className="w-full flex items-center justify-between text-[10px] font-black uppercase tracking-widest text-[#8C8379] hover:text-[#2D241E] transition-colors border-t border-[#D9D1C7]/20 pt-2"
                >
                  <span>Commission Details ({getCommissionTransactionsForMonth(s.name, selectedMonth).length} tx)</span>
                  {expandedCommissionStaffId === s.id ? <ChevronUp size={12} /> : <ChevronDown size={12} />}
                </button>

                <AnimatePresence>
                  {expandedCommissionStaffId === s.id && (
                    <motion.div
                      initial={{ height: 0, opacity: 0 }}
                      animate={{ height: 'auto', opacity: 1 }}
                      exit={{ height: 0, opacity: 0 }}
                      className="overflow-hidden space-y-2 mt-2 pt-2 border-t border-dashed border-[#D9D1C7]/35"
                    >
                      <div className="max-h-48 overflow-y-auto space-y-1.5 pr-1 scrollbar-thin text-left">
                        {getCommissionTransactionsForMonth(s.name, selectedMonth).map((tx) => {
                          let rate = 0.035;
                          if (tx.location === 'BM') {
                            rate = tx.commissionRate ? (tx.commissionRate / 100) : 0.01;
                          } else if (tx.location === 'PG') {
                            rate = tx.commissionRate ? (tx.commissionRate / 100) : 0.035;
                          }
                          const earned = (tx.amount || 0) * rate;
                          const txDate = tx.timestamp?.toDate ? tx.timestamp.toDate() : new Date(tx.timestamp);

                          return (
                            <div key={tx.id} className="text-[11px] bg-[#FAF9F6] p-2 rounded-lg border border-[#D9D1C7]/20 flex flex-col gap-0.5">
                              <div className="flex justify-between items-start font-medium">
                                <span className="text-[#2D241E] font-bold truncate max-w-[120px]" title={tx.customerName || 'Walk-in'}>
                                  {tx.customerName || 'Walk-in'}
                                </span>
                                <span className="text-[#8B9A82] font-bold font-mono">
                                  +RM{earned.toFixed(2)}
                                </span>
                              </div>
                              <div className="flex justify-between text-[9px] text-[#8C8379]">
                                <span className="truncate max-w-[140px]" title={tx.description}>
                                  {tx.description}
                                </span>
                                <span>
                                  RM{tx.amount.toFixed(2)} ({(rate * 100).toFixed(1)}%)
                                </span>
                              </div>
                              <div className="text-[8px] text-[#A69D94] mt-0.5">
                                {format(txDate, 'dd MMM yyyy')} • {tx.location}
                              </div>
                            </div>
                          );
                        })}
                        {getCommissionTransactionsForMonth(s.name, selectedMonth).length === 0 && (
                          <div className="text-center text-[10px] text-[#8C8379] italic py-4">
                            No commission transactions this month.
                          </div>
                        )}
                      </div>
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>
            </div>
          </motion.div>
        ))}
      </div>

      {/* Portal Login Accounts Section */}
      {role === 'admin' && (
        <div className="space-y-4 animate-fadeIn">
          <div className="bg-[#2D241E] py-4 px-6 rounded-t-[24px] border-b border-white/10 flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3">
            <div>
              <h2 className="text-sm font-bold text-white uppercase tracking-widest leading-none flex items-center gap-2">
                <Shield size={16} className="text-[#8B9A82]" /> Portal Login Accounts (Branches & Roles)
              </h2>
              <p className="text-[7px] font-black uppercase text-white/40 tracking-tighter mt-1">Configure branches and access roles for authenticated accounts</p>
            </div>
            
            <button
              onClick={() => {
                setIsAddingPortalUser(!isAddingPortalUser);
                setPortalFormData({ uid: '', email: '', branch: 'BM', role: 'staff' });
              }}
              className="bg-[#8B9A82] text-white px-4 py-2 rounded-xl flex items-center gap-2 hover:bg-[#7A8971] transition-all shadow-sm"
            >
              <UserPlus size={14} />
              <span className="text-[10px] font-black uppercase tracking-widest">Link Firebase Account</span>
            </button>
          </div>

          <div className="bg-white rounded-b-[32px] border border-[#D9D1C7] p-6 shadow-sm space-y-6">
            <AnimatePresence>
              {isAddingPortalUser && (
                <motion.div
                  initial={{ opacity: 0, y: -10 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -10 }}
                  className="p-6 bg-[#F2EFE9]/40 border border-[#D9D1C7]/55 rounded-2xl space-y-4"
                >
                  <div className="flex justify-between items-center border-b border-[#D9D1C7]/30 pb-2">
                    <h3 className="text-xs font-bold uppercase tracking-wider text-[#2D241E]">Link New Authentication Account</h3>
                    <p className="text-[9px] text-[#8C8379] italic">Creates the profile map in Firestore</p>
                  </div>
                  
                  <form onSubmit={handleAddPortalUserSubmit} className="grid grid-cols-1 md:grid-cols-4 gap-4">
                    <div className="space-y-1.5 col-span-1">
                      <label className="text-[9px] font-black text-[#8C8379] uppercase tracking-widest block px-1">User UID</label>
                      <input
                        required
                        type="text"
                        className="natural-input w-full text-xs"
                        placeholder="e.g. uY8bX..."
                        value={portalFormData.uid}
                        onChange={(e) => setPortalFormData({ ...portalFormData, uid: e.target.value })}
                      />
                      <p className="text-[8px] text-[#8C8379] px-1 italic leading-tight">From Firebase Console Auth users list</p>
                    </div>
                    
                    <div className="space-y-1.5 col-span-1">
                      <label className="text-[9px] font-black text-[#8C8379] uppercase tracking-widest block px-1">Staff Email</label>
                      <input
                        required
                        type="email"
                        className="natural-input w-full text-xs"
                        placeholder="staff@nendoastudio.com"
                        value={portalFormData.email}
                        onChange={(e) => setPortalFormData({ ...portalFormData, email: e.target.value })}
                      />
                    </div>

                    <div className="space-y-1.5 col-span-1">
                      {/* Assign Branch defaults to ALL since there is only one branch now */}
                    </div>

                    <div className="space-y-1.5 col-span-1 flex flex-col justify-between">
                      <div className="space-y-1.5">
                        <label className="text-[9px] font-black text-[#8C8379] uppercase tracking-widest block px-1">Portal Role</label>
                        <select
                          className="natural-input w-full text-xs"
                          value={portalFormData.role}
                          onChange={(e) => setPortalFormData({ ...portalFormData, role: e.target.value as 'admin' | 'staff' })}
                        >
                          <option value="staff">Staff Member</option>
                          <option value="admin">Administrator</option>
                        </select>
                      </div>
                    </div>

                    <div className="col-span-1 md:col-span-4 flex justify-end gap-2 pt-2 border-t border-[#D9D1C7]/20">
                      <button
                        type="button"
                        onClick={() => setIsAddingPortalUser(false)}
                        className="px-4 py-2 border border-[#D9D1C7] text-[#8C8379] rounded-xl text-[10px] font-black uppercase tracking-widest hover:bg-white transition-all shadow-sm"
                      >
                        Cancel
                      </button>
                      <button
                        type="submit"
                        className="bg-[#2D241E] text-white px-5 py-2 rounded-xl text-[10px] font-black uppercase tracking-widest hover:bg-[#40352E] transition-all shadow-sm"
                      >
                        Link Account
                      </button>
                    </div>
                  </form>
                </motion.div>
              )}
            </AnimatePresence>

            <div className="overflow-x-auto text-left">
              <table className="w-full text-xs border-collapse">
                <thead>
                  <tr className="border-b border-[var(--border-app)] bg-[var(--bg-header)] text-[var(--text-header)] font-black uppercase tracking-wider text-[9px] py-3">
                    <th className="py-3 px-3 text-left">Login Email</th>
                    <th className="py-3 px-3 text-left">User UID</th>
                    <th className="py-3 px-3 text-center">Assigned Branch & Access</th>
                    <th className="py-3 px-3 text-center">Portal Role</th>
                    <th className="py-3 px-3 text-center">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[var(--border-app)]/40 text-[var(--text-app)]">
                  {portalUsers.map((pUser) => (
                    <tr key={pUser.uid} className="hover:bg-[var(--bg-subtle)] transition-colors group">
                      <td className="py-4 px-2 font-medium">
                        <div className="flex items-center gap-2.5">
                          <div className="w-8 h-8 rounded-full bg-[#8B9A82]/10 border border-[#8B9A82]/20 flex items-center justify-center text-[#8B9A82] text-xs font-bold uppercase">
                            {pUser.email ? pUser.email.charAt(0) : '?'}
                          </div>
                          <div>
                            <p className="font-bold text-[#2D241E]">{pUser.email || 'No email'}</p>
                            <p className="text-[8px] font-black uppercase text-[#8C8379] tracking-widest">
                              {pUser.role === 'admin' ? 'Administrator' : 'Staff Member'}
                            </p>
                          </div>
                        </div>
                      </td>
                      <td className="py-4 px-2 font-mono text-[10px] text-gray-500 whitespace-nowrap">
                        <div className="flex items-center gap-1.5">
                          <span className="bg-[#FAF9F6] px-2 py-1 rounded border border-[#D9D1C7]/45">
                            {pUser.uid}
                          </span>
                          <button
                            type="button"
                            onClick={() => {
                              navigator.clipboard.writeText(pUser.uid);
                            }}
                            className="text-[#8C8379] hover:text-[#2D241E] p-1 px-1.5 rounded hover:bg-[#F2EFE9] transition-all text-[8px] font-black uppercase tracking-widest border border-[#D9D1C7]/40"
                            title="Copy UID"
                          >
                            Copy
                          </button>
                        </div>
                      </td>
                      <td className="py-4 px-2 text-center whitespace-nowrap">
                        <select
                          className="bg-white border border-[#D9D1C7] rounded-xl px-3 py-1.5 text-xs text-[#2D241E] font-bold focus:outline-none focus:ring-1 focus:ring-[#8B9A82]"
                          value={pUser.branch}
                          onChange={(e) => handleUpdatePortalUser(pUser.uid, 'branch', e.target.value as Branch)}
                        >
                          <option value="PG">Penang (PG)</option>
                          <option value="BM">Bukit Mertajam (BM)</option>
                          <option value="ALL">All Branches (ALL)</option>
                        </select>
                      </td>
                      <td className="py-4 px-2 text-center whitespace-nowrap">
                        <select
                          className="bg-white border border-[#D9D1C7] rounded-xl px-3 py-1.5 text-xs text-[#2D241E] font-bold focus:outline-none focus:ring-1 focus:ring-[#8B9A82]"
                          value={pUser.role}
                          onChange={(e) => handleUpdatePortalUser(pUser.uid, 'role', e.target.value as 'admin' | 'staff')}
                        >
                          <option value="staff">Staff Role</option>
                          <option value="admin">Admin Role</option>
                        </select>
                      </td>
                      <td className="py-4 px-2 text-center whitespace-nowrap">
                        <button
                          type="button"
                          onClick={() => handleDeletePortalUser(pUser.uid)}
                          className="p-1.5 bg-red-50 text-red-500 rounded-lg text-[9px] font-black uppercase tracking-widest hover:bg-red-100 hover:text-red-700 transition-colors opacity-0 group-hover:opacity-100 focus:opacity-100"
                        >
                          Remove Mapping
                        </button>
                      </td>
                    </tr>
                  ))}
                  
                  {portalUsers.length === 0 && (
                    <tr>
                      <td colSpan={5} className="py-10 text-center text-[#8C8379] italic">
                        No portal login profile mappings configured yet.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      <AnimatePresence>
        {confirmPaymentFor && (
          <ConfirmationModal
            isOpen={!!confirmPaymentFor}
            onClose={() => setConfirmPaymentFor(null)}
            onConfirm={() => processAuthorizedPayment(confirmPaymentFor)}
            title="Settle Commission"
            message={`Are you sure you want to process a commission payment of RM${getCommissionForMonth(confirmPaymentFor.name, selectedMonth).toFixed(2)} for ${confirmPaymentFor.name} for the period of ${format(parseISO(selectedMonth + '-01'), 'MMMM yyyy')}?`}
            confirmText="Process Payment"
            isDestructive={false}
          />
        )}
        {deleteStaffId && (
          <ConfirmationModal
            isOpen={!!deleteStaffId}
            onClose={() => setDeleteStaffId(null)}
            onConfirm={handleConfirmDeleteStaff}
            title="Remove Staff"
            message="Are you sure you want to remove this staff member?"
            confirmText="Remove"
            isDestructive={true}
          />
        )}
        {deletePortalUserId && (
          <ConfirmationModal
            isOpen={!!deletePortalUserId}
            onClose={() => setDeletePortalUserId(null)}
            onConfirm={handleConfirmDeletePortalUser}
            title="Remove Portal Login Mapping"
            message="Are you sure you want to permanently remove this portal login mapping?"
            confirmText="Remove Mapping"
            isDestructive={true}
          />
        )}
        {receipt && (
          <div className="fixed inset-0 z-[100] flex items-center justify-center p-6 bg-black/40 backdrop-blur-sm">
            <motion.div
              initial={{ scale: 0.95, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.95, opacity: 0 }}
              className="bg-white rounded-[32px] shadow-2xl w-full max-w-2xl overflow-hidden relative flex flex-col max-h-[90vh]"
            >
              {/* Voucher Header */}
              <div className="bg-[#FAF9F6] p-8 border-b border-[#D9D1C7]/30 flex justify-between items-start">
                <div className="flex items-center gap-4">
                  <div className="bg-[#2D241E] p-3 rounded-2xl text-white">
                    <Receipt size={24} />
                  </div>
                  <div>
                    <h3 className="text-2xl font-black text-[#2D241E] uppercase tracking-tighter">Payment Voucher</h3>
                    <div className="flex items-center gap-3 mt-1">
                      <p className="text-[10px] font-black uppercase tracking-widest text-[#8C8379]">Ref: <span className="text-[#2D241E]">#{receipt.id?.slice(-8).toUpperCase()}</span></p>
                      <div className="w-[1px] h-3 bg-[#D9D1C7]" />
                      <p className="text-[10px] font-black uppercase tracking-widest text-[#8C8379]">Date: <span className="text-[#2D241E]">{format(new Date(receipt.timestamp), 'dd MMM yyyy, HH:mm')}</span></p>
                    </div>
                  </div>
                </div>
                <button 
                  onClick={() => setReceipt(null)}
                  className="p-2 text-[#8C8379] hover:text-[#2D241E] hover:bg-white rounded-full transition-all shadow-sm border border-transparent hover:border-[#D9D1C7]/30"
                >
                  <X size={20} />
                </button>
              </div>

              {/* Voucher Body */}
              <div className="flex-1 overflow-y-auto p-10 space-y-10">
                <div className="grid grid-cols-2 gap-12">
                  <div className="space-y-4">
                    <div>
                      <p className="text-[9px] font-black uppercase tracking-widest text-[#8C8379] mb-1">Paid From</p>
                      <p className="text-sm font-bold text-[#2D241E]">Ceramic Studio @ {receipt.location}</p>
                      <p className="text-[10px] text-[#A69D94]">NENDOA STUDIO ENTERPRISE</p>
                    </div>
                    <div>
                      <p className="text-[9px] font-black uppercase tracking-widest text-[#8C8379] mb-1">Payment Method</p>
                      <p className="text-sm font-bold text-[#2D241E]">Bank Transfer / Cash</p>
                    </div>
                  </div>
                  <div className="space-y-4">
                    <div>
                      <p className="text-[9px] font-black uppercase tracking-widest text-[#8C8379] mb-1">Paid To (Payee)</p>
                      <p className="text-lg font-serif italic font-bold text-[#2D241E]">{receipt.staffName}</p>
                      <p className="text-[10px] text-[#8C8379] font-black uppercase tracking-widest bg-[#F2EFE9] px-2 py-0.5 rounded inline-block mt-1">Staff Member</p>
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
                          <p className="text-xs font-bold text-[#2D241E]">Commission Settlement</p>
                          <p className="text-[10px] text-[#8C8379] mt-1 font-medium">Period: {format(parseISO(receipt.month + '-01'), 'MMMM yyyy')}</p>
                        </td>
                        <td className="py-6 text-right font-mono font-bold text-lg text-[#2D241E]">
                          RM {receipt.amount.toFixed(2)}
                        </td>
                      </tr>
                    </tbody>
                    <tfoot>
                      <tr className="border-t border-[#2D241E]">
                        <td className="py-6 text-xs font-black uppercase tracking-widest text-[#2D241E]">Total Payment</td>
                        <td className="py-6 text-right">
                          <span className="text-3xl font-serif italic text-[#2D241E] font-bold">RM {receipt.amount.toFixed(2)}</span>
                        </td>
                      </tr>
                    </tfoot>
                  </table>
                </div>

                {/* Signatures */}
                <div className="grid grid-cols-2 gap-20 pt-10">
                  <div className="space-y-12">
                    <div className="h-px bg-[#D9D1C7]" />
                    <p className="text-[9px] font-black uppercase tracking-[0.2em] text-center text-[#8C8379]">Authorized By</p>
                  </div>
                  <div className="space-y-12">
                    <div className="h-px bg-[#D9D1C7]" />
                    <p className="text-[9px] font-black uppercase tracking-[0.2em] text-center text-[#8C8379]">Receiver Signature</p>
                  </div>
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
                  onClick={() => setReceipt(null)}
                  className="flex-1 bg-white border border-[#D9D1C7] text-[#8C8379] py-4 rounded-2xl font-black uppercase text-[10px] tracking-[0.2em] hover:bg-[#F2EFE9] transition-all"
                >
                  Close
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>


      {staff.length === 0 && !isAdding && (
        <div className="py-20 text-center text-[#A69D94] italic text-sm border-2 border-dashed border-[#D9D1C7]/30 rounded-[40px]">
          No staff members registered yet.
        </div>
      )}
    </div>
  );
};

export default StaffManagement;
