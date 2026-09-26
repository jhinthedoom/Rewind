import React, { useState, useEffect } from 'react';
import { db, auth } from '../firebase';
import { collection, onSnapshot, query, where, orderBy, addDoc, deleteDoc, doc, getDocs, updateDoc } from 'firebase/firestore';
import { Branch, Expense, ExpenseCategory, Staff, OperationType } from '../types';
import { handleFirestoreError } from '../utils';
import { format, parseISO } from 'date-fns';
import { 
  Receipt, 
  Plus, 
  Trash2, 
  Search, 
  FolderPlus, 
  Filter, 
  Calendar, 
  MapPin, 
  TrendingDown, 
  Tag, 
  User, 
  X,
  CreditCard,
  UploadCloud,
  FileText,
  Eye,
  Download,
  Paperclip,
  Check,
  Edit2
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { ConfirmationModal } from './ConfirmationModal';

export default function Expenses({ branch = 'ALL', role = 'staff' }: { branch?: Branch; role?: 'admin' | 'staff' }) {
  const [expenses, setExpenses] = useState<Expense[]>([]);
  const [categories, setCategories] = useState<ExpenseCategory[]>([]);
  const [staffList, setStaffList] = useState<Staff[]>([]);
  
  // Filtering states
  const [search, setSearch] = useState('');
  const [selectedCategory, setSelectedCategory] = useState<string>('ALL');
  const [selectedMonth, setSelectedMonth] = useState<string>(format(new Date(), 'yyyy-MM'));
  const [activeBranchFilter, setActiveBranchFilter] = useState<Branch>(branch === 'ALL' ? 'ALL' : branch);
  const [selectedSpendingType, setSelectedSpendingType] = useState<string>('ALL');

  // Modal / Form states
  const [showAddModal, setShowAddModal] = useState(false);
  const [showCategoryModal, setShowCategoryModal] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  
  // Form input states (Record Expense)
  const [expenseDescription, setExpenseDescription] = useState('');
  const [expenseAmount, setExpenseAmount] = useState('');
  const [expenseCategory, setExpenseCategory] = useState('');
  const [expenseDate, setExpenseDate] = useState(format(new Date(), 'yyyy-MM-dd'));
  const [expenseLocation, setExpenseLocation] = useState<Branch>(branch === 'ALL' ? 'ALL' : branch);
  const [expenseStaff, setExpenseStaff] = useState('');
  const [expenseSpendingType, setExpenseSpendingType] = useState<'Expenses' | 'Current Asset' | 'Non-Current Asset' | 'Current Liability' | 'Non-Current Liability'>('Expenses');

  // Form input states (New Category)
  const [newCategoryName, setNewCategoryName] = useState('');
  const [newCategorySpendingType, setNewCategorySpendingType] = useState<'Expenses' | 'Current Asset' | 'Non-Current Asset' | 'Current Liability' | 'Non-Current Liability'>('Expenses');

  // Confirmation Modal
  const [deleteTarget, setDeleteTarget] = useState<Expense | null>(null);
  const [categoryDeleteTarget, setCategoryDeleteTarget] = useState<ExpenseCategory | null>(null);
  const [categoryError, setCategoryError] = useState<string | null>(null);
  const [recordError, setRecordError] = useState<string | null>(null);

  // Bank Balance states
  const [initialBankBalance, setInitialBankBalance] = useState<number>(10000); // defaults to 10k if empty
  const [bankConfigId, setBankConfigId] = useState<string>('');
  const [isEditingBank, setIsEditingBank] = useState(false);
  const [tempBankBalance, setTempBankBalance] = useState('');
  const [bankError, setBankError] = useState<string | null>(null);

  // Receipt file upload states
  const [receiptFile, setReceiptFile] = useState<File | null>(null);
  const [receiptBase64, setReceiptBase64] = useState<string>('');
  const [receiptFileName, setReceiptFileName] = useState<string>('');
  const [isDragging, setIsDragging] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);

  // Row upload states for existing expenses
  const [uploadingExpenseId, setUploadingExpenseId] = useState<string | null>(null);
  const [rowUploadError, setRowUploadError] = useState<string | null>(null);
  const [removeReceiptTarget, setRemoveReceiptTarget] = useState<Expense | null>(null);

  // Date editing state
  const [editingDateExpenseId, setEditingDateExpenseId] = useState<string | null>(null);
  const [editingDateValue, setEditingDateValue] = useState<string>('');

  // Full transaction editing state
  const [editingExpense, setEditingExpense] = useState<Expense | null>(null);

  // Viewing receipt state
  const [viewingReceiptUrl, setViewingReceiptUrl] = useState<string | null>(null);
  const [viewingReceiptName, setViewingReceiptName] = useState<string | null>(null);

  // Load Realtime Data
  useEffect(() => {
    // 1. Subscribe to Expenses
    const expensesQuery = query(collection(db, 'expenses'), orderBy('date', 'desc'));
    const unsubscribeExpenses = onSnapshot(expensesQuery, (snapshot) => {
      const records = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Expense));
      setExpenses(records);
    }, (error) => {
      handleFirestoreError(error, OperationType.LIST, 'expenses');
    });

    // 2. Subscribe to Expense Categories
    const categoriesQuery = query(collection(db, 'expenseCategories'), orderBy('name', 'asc'));
    const unsubscribeCategories = onSnapshot(categoriesQuery, (snapshot) => {
      const records = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as ExpenseCategory));
      setCategories(records);
    }, (error) => {
      handleFirestoreError(error, OperationType.LIST, 'expenseCategories');
    });

    // 3. Fetch Staff list for dropdown selections
    const staffQuery = query(collection(db, 'staff'), where('active', '==', true));
    const unsubscribeStaff = onSnapshot(staffQuery, (snapshot) => {
      const records = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Staff));
      setStaffList(records);
    }, (error) => {
      handleFirestoreError(error, OperationType.LIST, 'staff');
    });

    // 4. Subscribe to Bank Statement Config
    const bankQuery = collection(db, 'bankConfig');
    const unsubscribeBank = onSnapshot(bankQuery, (snapshot) => {
      if (!snapshot.empty) {
        const configDoc = snapshot.docs[0];
        setInitialBankBalance(configDoc.data().initialBalance || 0);
        setBankConfigId(configDoc.id);
      } else {
        // If empty, initiate first bank config of 0 or let it use default
        setInitialBankBalance(10000);
        setBankConfigId('');
      }
    }, (error) => {
      console.warn("Bank config load failed", error);
    });

    return () => {
      unsubscribeExpenses();
      unsubscribeCategories();
      unsubscribeStaff();
      unsubscribeBank();
    };
  }, []);

  // Set default initial date correctly upon opening the modal
  useEffect(() => {
    if (showAddModal) {
      if (editingExpense) {
        setExpenseDate(editingExpense.date);
        setExpenseDescription(editingExpense.description);
        setExpenseAmount(editingExpense.amount.toString());
        setExpenseCategory(editingExpense.category);
        setExpenseLocation(editingExpense.location);
        setExpenseStaff(editingExpense.staffName || '');
        setExpenseSpendingType(editingExpense.spendingType || 'Expenses');
        setReceiptFile(null);
        setReceiptBase64(editingExpense.receiptUrl || '');
        setReceiptFileName(editingExpense.receiptFileName || '');
        setRecordError(null);
        setUploadError(null);
      } else {
        setExpenseDate(format(new Date(), 'yyyy-MM-dd'));
        setExpenseDescription('');
        setExpenseAmount('');
        const defaultCat = categories[0];
        setExpenseCategory(defaultCat?.name || '');
        setExpenseLocation(branch === 'ALL' ? 'ALL' : branch);
        setExpenseStaff('');
        setExpenseSpendingType(defaultCat?.spendingType || 'Expenses');
        setRecordError(null);
        setReceiptFile(null);
        setReceiptBase64('');
        setReceiptFileName('');
        setUploadError(null);
      }
    } else {
      // When the modal is closed, clear editing target
      setEditingExpense(null);
    }
  }, [showAddModal, categories, branch, editingExpense]);

  useEffect(() => {
    if (showCategoryModal) {
      setNewCategoryName('');
      setNewCategorySpendingType('Expenses');
      setCategoryError(null);
    }
  }, [showCategoryModal]);

  // Handle Quick Prepopulate Base Categories
  const handleAddDefaultCategories = async () => {
    const defaults = [
      { name: "Rent & Utilities", spendingType: "Expenses" as const },
      { name: "Glaze & Ceramics", spendingType: "Current Asset" as const },
      { name: "Studio Clay Supplies", spendingType: "Current Asset" as const },
      { name: "Tools & Maintenance", spendingType: "Expenses" as const },
      { name: "Staff Meals", spendingType: "Expenses" as const },
      { name: "Marketing & Promotions", spendingType: "Expenses" as const },
      { name: "Office & Printing", spendingType: "Expenses" as const },
      { name: "Miscellaneous", spendingType: "Expenses" as const }
    ];
    setIsSubmitting(true);
    try {
      for (const item of defaults) {
        if (!categories.some(c => c.name.toLowerCase() === item.name.toLowerCase())) {
          await addDoc(collection(db, 'expenseCategories'), {
            name: item.name,
            spendingType: item.spendingType,
            createdAt: new Date().toISOString()
          });
        }
      }
    } catch (err) {
      handleFirestoreError(err, OperationType.CREATE, 'expenseCategories');
    } finally {
      setIsSubmitting(false);
    }
  };

  // Create Category
  const handleCreateCategory = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newCategoryName.trim()) return;

    if (categories.some(c => c.name.toLowerCase() === newCategoryName.trim().toLowerCase())) {
      setCategoryError("This category already exists.");
      return;
    }

    setCategoryError(null);
    setIsSubmitting(true);
    try {
      await addDoc(collection(db, 'expenseCategories'), {
        name: newCategoryName.trim(),
        spendingType: newCategorySpendingType,
        createdAt: new Date().toISOString()
      });
      setNewCategoryName('');
      setNewCategorySpendingType('Expenses');
    } catch (err) {
      setCategoryError("Error creating category. Please try again.");
      handleFirestoreError(err, OperationType.CREATE, 'expenseCategories');
    } finally {
      setIsSubmitting(false);
    }
  };

  // Save/Update Bank Balance
  const handleSaveBankBalance = async (e: React.FormEvent) => {
    e.preventDefault();
    const parsedAmount = parseFloat(tempBankBalance);
    if (isNaN(parsedAmount) || parsedAmount < 0) {
      setBankError("Please enter a valid starting balance.");
      return;
    }
    setBankError(null);
    setIsSubmitting(true);
    try {
      if (bankConfigId) {
        await updateDoc(doc(db, 'bankConfig', bankConfigId), {
          initialBalance: parsedAmount,
          lastUpdated: new Date().toISOString()
        });
      } else {
        await addDoc(collection(db, 'bankConfig'), {
          initialBalance: parsedAmount,
          lastUpdated: new Date().toISOString()
        });
      }
      setIsEditingBank(false);
    } catch (err) {
      setBankError("Error saving bank balance.");
      console.error(err);
    } finally {
      setIsSubmitting(false);
    }
  };

  // Trigger Category Delete check
  const initiateDeleteCategory = (cat: ExpenseCategory) => {
    const inUse = expenses.some(e => e.category === cat.name);
    if (inUse) {
      setCategoryError(`Cannot delete "${cat.name}" because it is currently used in existing logs.`);
      return;
    }
    setCategoryError(null);
    setCategoryDeleteTarget(cat);
  };

  // Confirm delete Category
  const handleDeleteCategoryConfirm = async () => {
    if (!categoryDeleteTarget?.id) return;
    try {
      await deleteDoc(doc(db, 'expenseCategories', categoryDeleteTarget.id));
      setCategoryError(null);
    } catch (err) {
      setCategoryError("Error deleting category. Please try again.");
      handleFirestoreError(err, OperationType.DELETE, `expenseCategories/${categoryDeleteTarget.id}`);
    } finally {
      setCategoryDeleteTarget(null);
    }
  };

  // Record Expense Submission
  const handleRecordExpense = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!expenseDescription.trim() || !expenseAmount || !expenseCategory) {
      setRecordError("Please check your inputs and make sure all fields are filled.");
      return;
    }

    setRecordError(null);
    setIsSubmitting(true);
    try {
      const email = auth.currentUser?.email || 'System';
      const staffVal = expenseStaff.trim() || email.split('@')[0];

      const expenseData = {
        description: expenseDescription.trim(),
        amount: parseFloat(expenseAmount),
        category: expenseCategory,
        date: expenseDate,
        location: expenseLocation,
        staffName: staffVal,
        spendingType: expenseSpendingType,
        receiptUrl: receiptBase64 || null,
        receiptFileName: receiptFileName || null
      };

      if (editingExpense && editingExpense.id) {
        await updateDoc(doc(db, 'expenses', editingExpense.id), expenseData);
      } else {
        await addDoc(collection(db, 'expenses'), {
          ...expenseData,
          timestamp: new Date().toISOString()
        });
      }

      setShowAddModal(false);
      setEditingExpense(null);
    } catch (err) {
      setRecordError("Failed to save record. Please check your credentials or connection.");
      handleFirestoreError(err, editingExpense ? OperationType.UPDATE : OperationType.CREATE, editingExpense ? `expenses/${editingExpense.id}` : 'expenses');
    } finally {
      setIsSubmitting(false);
    }
  };

  // File upload processing helpers
  const processSelectedFile = (file: File) => {
    setUploadError(null);
    
    // Check file type (must be PNG, JPEG, or PDF)
    const allowedTypes = ['image/png', 'image/jpeg', 'image/jpg', 'application/pdf'];
    if (!allowedTypes.includes(file.type)) {
      setUploadError("Only PNG, JPEG, and PDF files are allowed.");
      return;
    }

    // Check size limit (limit to 800KB to fit safely within Firestore 1MB document size limit with Base64 encoding overhead)
    const maxSizeBytes = 800 * 1024;
    if (file.size > maxSizeBytes) {
      setUploadError("File is too large (limit is 800KB). Please upload a smaller receipt or compress the image.");
      return;
    }

    setReceiptFile(file);
    setReceiptFileName(file.name);

    const reader = new FileReader();
    reader.onload = (event) => {
      if (event.target?.result) {
        setReceiptBase64(event.target.result as string);
      }
    };
    reader.onerror = () => {
      setUploadError("Failed to read the file. Please try again.");
    };
    reader.readAsDataURL(file);
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files.length > 0) {
      processSelectedFile(e.target.files[0]);
    }
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(true);
  };

  const handleDragLeave = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
      processSelectedFile(e.dataTransfer.files[0]);
    }
  };

  const removeReceipt = () => {
    setReceiptFile(null);
    setReceiptBase64('');
    setReceiptFileName('');
    setUploadError(null);
  };

  // Upload receipt for an existing expense in the list
  const handleRowFileUpload = async (expenseId: string, e: React.ChangeEvent<HTMLInputElement>) => {
    if (!e.target.files || e.target.files.length === 0) return;
    const file = e.target.files[0];
    
    setRowUploadError(null);
    
    // Check file type (must be PNG, JPEG, or PDF)
    const allowedTypes = ['image/png', 'image/jpeg', 'image/jpg', 'application/pdf'];
    if (!allowedTypes.includes(file.type)) {
      setRowUploadError("Only PNG, JPEG, and PDF files are allowed.");
      return;
    }

    // Check size limit (limit to 800KB to fit safely within Firestore 1MB document size limit with Base64 encoding overhead)
    const maxSizeBytes = 800 * 1024;
    if (file.size > maxSizeBytes) {
      setRowUploadError(`File "${file.name}" is too large (limit is 800KB). Please compress the image or upload a smaller file.`);
      return;
    }

    setUploadingExpenseId(expenseId);

    const reader = new FileReader();
    reader.onload = async (event) => {
      if (event.target?.result) {
        const base64Data = event.target.result as string;
        try {
          const expenseDocRef = doc(db, 'expenses', expenseId);
          await updateDoc(expenseDocRef, {
            receiptUrl: base64Data,
            receiptFileName: file.name
          });
        } catch (error) {
          handleFirestoreError(error, OperationType.UPDATE, `expenses/${expenseId}`);
          setRowUploadError("Failed to save receipt to database.");
        } finally {
          setUploadingExpenseId(null);
        }
      }
    };
    reader.onerror = () => {
      setRowUploadError("Failed to read the file. Please try again.");
      setUploadingExpenseId(null);
    };
    reader.readAsDataURL(file);
  };

  // Remove receipt from an existing expense (confirmed)
  const handleConfirmRemoveReceipt = async () => {
    if (!removeReceiptTarget) return;
    const expenseId = removeReceiptTarget.id;
    setRowUploadError(null);
    setUploadingExpenseId(expenseId);
    setRemoveReceiptTarget(null);
    try {
      const expenseDocRef = doc(db, 'expenses', expenseId);
      await updateDoc(expenseDocRef, {
        receiptUrl: null,
        receiptFileName: null
      });
    } catch (error) {
      handleFirestoreError(error, OperationType.UPDATE, `expenses/${expenseId}`);
      setRowUploadError("Failed to remove receipt from database.");
    } finally {
      setUploadingExpenseId(null);
    }
  };

  // Update date of an existing expense in Firestore
  const handleSaveDate = async (expenseId: string) => {
    if (!editingDateValue) return;
    setRowUploadError(null);
    try {
      const expenseDocRef = doc(db, 'expenses', expenseId);
      await updateDoc(expenseDocRef, {
        date: editingDateValue
      });
      setEditingDateExpenseId(null);
      setEditingDateValue('');
    } catch (error) {
      handleFirestoreError(error, OperationType.UPDATE, `expenses/${expenseId}`);
      setRowUploadError("Failed to update the expense date in database.");
    }
  };

  // CSV download of expenses
  const handleDownloadCSV = () => {
    const headers = ['Date', 'Category', 'Description', 'Spending Classification', 'Location', 'Recorded By', 'Amount (RM)'];
    const rows = filteredExpenses.map(exp => [
      exp.date,
      `"${(exp.category || '').replace(/"/g, '""')}"`,
      `"${(exp.description || '').replace(/"/g, '""')}"`,
      exp.spendingType || 'Expenses',
      exp.location === 'ALL' ? 'All Branches' : exp.location,
      `"${(exp.staffName || '').replace(/"/g, '""')}"`,
      exp.amount.toFixed(2)
    ]);
    
    const csvContent = "\uFEFF" + [headers.join(','), ...rows.map(e => e.join(','))].join('\n');
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.setAttribute("href", url);
    const monthStr = selectedMonth === 'ALL' ? 'All_Months' : selectedMonth;
    link.setAttribute("download", `Expenses_${monthStr}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  };

  // Confirm and Delete Expense
  const handleDeleteExpense = async () => {
    if (!deleteTarget?.id) return;
    try {
      await deleteDoc(doc(db, 'expenses', deleteTarget.id));
    } catch (err) {
      handleFirestoreError(err, OperationType.DELETE, `expenses/${deleteTarget.id}`);
    } finally {
      setDeleteTarget(null);
    }
  };

  // Dynamic filter lists for Year-Months
  const availableMonths = Array.from(new Set([
    format(new Date(), 'yyyy-MM'),
    ...expenses.map(e => {
      try {
        const d = parseISO(e.date);
        return format(d, 'yyyy-MM');
      } catch {
        return null;
      }
    })
  ])).filter(Boolean).sort().reverse() as string[];

  // Filter Logic
  const baseFilteredExpenses = expenses.filter(exp => {
    // 1. Branch match
    const bMatch = activeBranchFilter === 'ALL' || exp.location === activeBranchFilter;
    
    // 2. Year-Month match
    let mMatch = true;
    if (selectedMonth !== 'ALL') {
      mMatch = exp.date.startsWith(selectedMonth);
    }

    // 3. Category match
    const cMatch = selectedCategory === 'ALL' || exp.category === selectedCategory;

    // 4. Search bar keyword match (Matches description, category or recorded staff member)
    const normalizedKeyword = search.toLowerCase();
    const searchMatch = !search || 
      exp.description.toLowerCase().includes(normalizedKeyword) ||
      exp.category.toLowerCase().includes(normalizedKeyword) ||
      (exp.staffName && exp.staffName.toLowerCase().includes(normalizedKeyword));

    return bMatch && mMatch && cMatch && searchMatch;
  });

  // Filter spending types
  const filteredExpenses = baseFilteredExpenses.filter(exp => {
    return selectedSpendingType === 'ALL' || (exp.spendingType || 'Expenses') === selectedSpendingType;
  });

  // Calculate Metrics / Stats
  const totalAmount = filteredExpenses.reduce((sum, item) => sum + item.amount, 0);

  // Calculate high level classified totals of the selected selection
  const opexTotal = baseFilteredExpenses
    .filter(e => (e.spendingType || 'Expenses') === 'Expenses')
    .reduce((sum, item) => sum + item.amount, 0);

  const currentAssetTotal = baseFilteredExpenses
    .filter(e => (e.spendingType || 'Expenses') === 'Current Asset')
    .reduce((sum, item) => sum + item.amount, 0);

  const nonCurrentAssetTotal = baseFilteredExpenses
    .filter(e => (e.spendingType || 'Expenses') === 'Non-Current Asset')
    .reduce((sum, item) => sum + item.amount, 0);

  const currentLiabilityTotal = baseFilteredExpenses
    .filter(e => (e.spendingType || 'Expenses') === 'Current Liability')
    .reduce((sum, item) => sum + item.amount, 0);

  const nonCurrentLiabilityTotal = baseFilteredExpenses
    .filter(e => (e.spendingType || 'Expenses') === 'Non-Current Liability')
    .reduce((sum, item) => sum + item.amount, 0);
  
  // Calculate top category by spending
  const expensesByCategory = filteredExpenses.reduce((acc, exp) => {
    acc[exp.category] = (acc[exp.category] || 0) + exp.amount;
    return acc;
  }, {} as Record<string, number>);

  const topCategoryName = Object.entries(expensesByCategory).length > 0
    ? Object.entries(expensesByCategory).reduce((max, current) => current[1] > max[1] ? current : max)[0]
    : 'None';

  const topCategoryAmount = Object.entries(expensesByCategory).length > 0
    ? Object.entries(expensesByCategory).reduce((max, current) => current[1] > max[1] ? current : max)[1] as number
    : 0;

  // Bank Statement calculation
  const allTimeSpent = expenses.reduce((sum, item) => sum + item.amount, 0);
  const currentBankBalance = initialBankBalance - allTimeSpent;

  return (
    <div className="space-y-6 pb-12">
      {/* KPI Cards section */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
        {/* Column 1: Bank Balance & Total Spent */}
        <div className="flex flex-col gap-4 sm:col-span-2 lg:col-span-1">
          {/* Bank balance */}
          <div className="bg-[#FAF9F6] p-5 rounded-[28px] border border-[#D9D1C7]/40 shadow-sm relative overflow-hidden flex flex-col justify-between">
            <div className="absolute right-0 top-0 w-24 h-24 bg-emerald-50 rounded-full blur-2xl -z-10 opacity-70" />
            
            <div className="flex items-start justify-between gap-3">
              <div className="flex items-center gap-3">
                <div className="p-3 bg-emerald-50 text-emerald-700 rounded-2xl shrink-0">
                  <CreditCard size={20} className="stroke-[2.5]" />
                </div>
                <div>
                  <span className="text-[9px] font-black uppercase text-emerald-800 tracking-widest block font-bold">Bank Balance</span>
                  <span className="text-xl font-serif italic font-bold text-[#2D241E] block leading-tight mt-0.5">
                    RM {currentBankBalance.toFixed(2)}
                  </span>
                </div>
              </div>

              {!isEditingBank && (
                <button
                  onClick={() => {
                    setTempBankBalance(initialBankBalance.toString());
                    setBankError(null);
                    setIsEditingBank(true);
                  }}
                  className="px-2 py-1 bg-white hover:bg-gray-50 text-[#8C8379] hover:text-[#2D241E] border border-[#D9D1C7]/30 rounded-lg text-[9px] font-black uppercase tracking-wider transition shrink-0"
                >
                  Adjust
                </button>
              )}
            </div>

            {isEditingBank ? (
              <form onSubmit={handleSaveBankBalance} className="mt-3 bg-white p-3 rounded-xl border border-emerald-200 shadow-sm relative z-10 w-full animate-in fade-in duration-250">
                <label className="block text-[9px] text-[#8C8379] font-black uppercase tracking-wide mb-1">Starting Balance (RM):</label>
                <div className="flex gap-1.5">
                  <input
                    type="number"
                    step="0.01"
                    className="w-full bg-[#FAF9F6] border border-[#D9D1C7]/40 rounded-lg px-2.5 py-1 text-xs font-mono outline-none focus:ring-1 focus:ring-emerald-500 text-[#2D241E]"
                    value={tempBankBalance}
                    onChange={(e) => setTempBankBalance(e.target.value)}
                    placeholder="10000.00"
                    autoFocus
                  />
                  <button
                    type="submit"
                    disabled={isSubmitting}
                    className="px-2 py-1 bg-[#2D241E] text-white hover:bg-[#4A3F35] rounded-lg text-[9px] font-bold uppercase shrink-0 transition"
                  >
                    Save
                  </button>
                  <button
                    type="button"
                    onClick={() => setIsEditingBank(false)}
                    className="px-2 py-1 bg-gray-100 hover:bg-gray-200 text-gray-700 rounded-lg text-[9px] font-bold uppercase shrink-0 transition"
                  >
                    Cancel
                  </button>
                </div>
                {bankError && <p className="text-[9px] text-red-500 mt-1 font-semibold">{bankError}</p>}
              </form>
            ) : (
              <div className="mt-3 space-y-1">
                <div className="flex justify-between items-center text-[10px] text-[#8C8379] font-medium bg-[#FAF9F6]/20 px-1 py-0.5">
                  <span>Starting Bank Balance:</span>
                  <span className="font-semibold text-gray-700">RM {initialBankBalance.toFixed(2)}</span>
                </div>
                <div className="flex justify-between items-center text-[9px] text-[#A69D94] px-1">
                  <span>Total Purchases Deducted:</span>
                  <span className="font-semibold text-red-500">- RM {allTimeSpent.toFixed(2)}</span>
                </div>
              </div>
            )}
          </div>

          {/* Total Expenses KPI */}
          <div className="bg-white p-5 rounded-[28px] border border-[#D9D1C7]/30 shadow-sm flex items-center gap-4 flex-1">
            <div className="p-4 bg-red-50 text-red-500 rounded-2xl">
              <TrendingDown size={24} />
            </div>
            <div>
              <span className="text-[9px] font-black uppercase text-[#8C8379] tracking-widest block font-bold">Total Spent (Filtered)</span>
              <span className="text-xl font-serif italic font-bold text-[#2D241E] block">RM {totalAmount.toFixed(2)}</span>
              <span className="text-[9px] text-[#A69D94] font-medium block mt-0.5">{filteredExpenses.length} files recorded</span>
            </div>
          </div>
        </div>

        {/* Bookkeeping Classification Breakdown */}
        <div className="bg-white p-5 rounded-[28px] border border-[#D9D1C7]/30 shadow-sm flex flex-col justify-center">
          <span className="text-[9px] font-black uppercase text-[#8C8379] tracking-widest block mb-1.5 font-bold">Bookkeeping Classification</span>
          <div className="space-y-1.5">
            <div className="flex justify-between items-center text-[10px]">
              <span className="text-[#8C8379] font-medium flex items-center gap-1">
                <span className="w-1.5 h-1.5 rounded-full bg-slate-400" />
                Expenses:
              </span>
              <span className="font-bold text-[#2D241E]">RM {opexTotal.toFixed(2)}</span>
            </div>
            <div className="flex justify-between items-center text-[10px]">
              <span className="text-[#8C8379] font-medium flex items-center gap-1">
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-400" />
                Current Asset:
              </span>
              <span className="font-bold text-emerald-600">RM {currentAssetTotal.toFixed(2)}</span>
            </div>
            <div className="flex justify-between items-center text-[10px]">
              <span className="text-[#8C8379] font-medium flex items-center gap-1">
                <span className="w-1.5 h-1.5 rounded-full bg-indigo-400" />
                Non-Current Asset:
              </span>
              <span className="font-bold text-indigo-600">RM {nonCurrentAssetTotal.toFixed(2)}</span>
            </div>
            <div className="flex justify-between items-center text-[10px]">
              <span className="text-[#8C8379] font-medium flex items-center gap-1">
                <span className="w-1.5 h-1.5 rounded-full bg-orange-400" />
                Current Liability:
              </span>
              <span className="font-bold text-orange-600">RM {currentLiabilityTotal.toFixed(2)}</span>
            </div>
            <div className="flex justify-between items-center text-[10px]">
              <span className="text-[#8C8379] font-medium flex items-center gap-1">
                <span className="w-1.5 h-1.5 rounded-full bg-rose-400" />
                Non-Current Liability:
              </span>
              <span className="font-bold text-rose-600">RM {nonCurrentLiabilityTotal.toFixed(2)}</span>
            </div>
          </div>
        </div>

        {/* Quick Operations panel */}
        <div className="bg-[#EBE7E0]/50 p-4 rounded-[28px] border border-[#D9D1C7]/30 flex flex-col justify-center gap-2">
          <button
            onClick={() => {
              setEditingExpense(null);
              setShowAddModal(true);
            }}
            className="w-full py-2.5 bg-[#2D241E] text-white hover:bg-[#4A3F35] rounded-xl text-[9.5px] lg:text-[10px] font-black uppercase tracking-wide lg:tracking-widest transition-all shadow-sm flex items-center justify-center gap-1 px-2 overflow-hidden"
          >
            <Plus size={13} className="shrink-0" />
            <span className="truncate">Record Spend & Asset</span>
          </button>
          <button
            onClick={() => setShowCategoryModal(true)}
            className="w-full py-2.5 bg-white text-[#4A3F35] hover:bg-[#FAF9F6] border border-[#D9D1C7]/40 rounded-xl text-[9.5px] lg:text-[10px] font-black uppercase tracking-wide lg:tracking-widest transition-all shadow-sm flex items-center justify-center gap-1 px-2 overflow-hidden"
          >
            <FolderPlus size={13} className="shrink-0" />
            <span className="truncate">Spending Categories</span>
          </button>
        </div>
      </div>

      {/* Filter Toolbar */}
      <div className="flex flex-col md:flex-row gap-4 items-center justify-between bg-white p-4 rounded-[24px] border border-[#D9D1C7]/30 shadow-sm">
        {/* Description Search */}
        <div className="relative flex-1 w-full md:max-w-xs">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-[#A69D94]" size={14} />
          <input 
            type="text"
            placeholder="Search description, staff, etc..."
            className="w-full bg-[#FAF9F6] border border-[#D9D1C7]/30 rounded-xl pl-9 pr-4 py-2 text-xs outline-none focus:ring-1 focus:ring-[#8B9A82]/50"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>

        {/* Select Dropdowns */}
        <div className="flex flex-wrap items-center gap-2 w-full md:w-auto">
          {/* Branch filter removed since there is only one branch now */}

          {/* Month Year Filter */}
          <select 
            className="bg-[#FAF9F6] border border-[#D9D1C7]/30 rounded-xl text-[10px] font-black uppercase tracking-tight px-3 py-2 outline-none cursor-pointer"
            value={selectedMonth}
            onChange={(e) => setSelectedMonth(e.target.value)}
          >
            <option value="ALL">All Months</option>
            {availableMonths.map(m => (
              <option key={m} value={m}>
                {format(parseISO(`${m}-01`), 'MMM yyyy')}
              </option>
            ))}
          </select>

          {/* Category Filter */}
          <select 
            className="bg-[#FAF9F6] border border-[#D9D1C7]/30 rounded-xl text-[10px] font-black uppercase tracking-tight px-3 py-2 outline-none cursor-pointer"
            value={selectedCategory}
            onChange={(e) => setSelectedCategory(e.target.value)}
          >
            <option value="ALL">All Categories</option>
            {categories.map(cat => (
              <option key={cat.id} value={cat.name}>{cat.name}</option>
            ))}
          </select>

          {/* Spending Type Filter */}
          <select 
            className="bg-[#FAF9F6] border border-[#D9D1C7]/30 rounded-xl text-[10px] font-black uppercase tracking-tight px-3 py-2 outline-none cursor-pointer text-[#4A3F35]"
            value={selectedSpendingType}
            onChange={(e) => setSelectedSpendingType(e.target.value)}
          >
            <option value="ALL">All Types</option>
            <option value="Expenses">Regular Expenses</option>
            <option value="Current Asset">Current Assets</option>
            <option value="Non-Current Asset">Non-Current Assets</option>
            <option value="Current Liability">Current Liabilities</option>
            <option value="Non-Current Liability">Non-Current Liabilities</option>
          </select>

          {/* CSV Export Button */}
          <button
            type="button"
            onClick={handleDownloadCSV}
            className="inline-flex items-center gap-1.5 bg-[#EBE7E0]/60 hover:bg-[#2D241E] text-[#4A3F35] hover:text-white border border-[#D9D1C7]/40 hover:border-transparent rounded-xl text-[10px] font-black uppercase tracking-wider px-3.5 py-2 transition-all cursor-pointer shrink-0 shadow-xs"
            title="Download CSV for current selection"
          >
            <Download size={12} className="shrink-0" />
            <span>Export CSV</span>
          </button>
        </div>
      </div>

      {/* Row Upload Error Banner */}
      {rowUploadError && (
        <div className="mb-4 p-3.5 bg-red-50 border border-red-200 text-red-600 rounded-2xl text-[11px] font-bold flex items-center justify-between gap-3 shadow-2xs">
          <div className="flex items-center gap-2">
            <span className="shrink-0 text-xs">⚠️</span>
            <span>{rowUploadError}</span>
          </div>
          <button 
            type="button"
            onClick={() => setRowUploadError(null)}
            className="p-1 hover:bg-red-100 rounded text-red-500 transition-all cursor-pointer"
          >
            <X size={12} />
          </button>
        </div>
      )}

      {/* Main Expenses Table */}
      <div className="bg-white rounded-[32px] border border-[var(--border-app)] flex flex-col overflow-hidden shadow-xs">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm border-collapse">
            <thead>
              <tr className="bg-[var(--bg-header)] border-b border-[var(--border-app)] text-[var(--text-header)]">
                <th className="px-4 py-2.5 text-[8.5px] font-black uppercase tracking-widest">Date</th>
                <th className="px-4 py-2.5 text-[8.5px] font-black uppercase tracking-widest">Category</th>
                <th className="px-4 py-2.5 text-[8.5px] font-black uppercase tracking-widest">Description</th>
                <th className="px-4 py-2.5 text-[8.5px] font-black uppercase tracking-widest">Location</th>
                <th className="px-4 py-2.5 text-[8.5px] font-black uppercase tracking-widest">Filer</th>
                <th className="px-4 py-2.5 text-center text-[8.5px] font-black uppercase tracking-widest">Receipt</th>
                <th className="px-4 py-2.5 text-right text-[8.5px] font-black uppercase tracking-widest">Amount</th>
                <th className="px-4 py-2.5 text-center text-[8.5px] font-black uppercase tracking-widest">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[var(--border-app)]/40">
              {filteredExpenses.map((expense) => (
                <tr key={expense.id} className="hover:bg-[var(--bg-subtle)] transition-colors group">
                  <td className="px-4 py-2 whitespace-nowrap">
                    {editingDateExpenseId === expense.id ? (
                      <div className="flex items-center gap-1">
                        <input
                          type="date"
                          className="bg-[#FAF9F6] border border-[#D9D1C7] rounded-xl px-2 py-1 text-[10px] font-black text-[#2D241E] outline-none"
                          value={editingDateValue}
                          onChange={(e) => setEditingDateValue(e.target.value)}
                        />
                        <button
                          type="button"
                          onClick={() => handleSaveDate(expense.id)}
                          className="p-1 bg-emerald-50 text-emerald-600 hover:bg-emerald-100 rounded-lg transition-all cursor-pointer shadow-2xs"
                          title="Save date"
                        >
                          <Check size={11} />
                        </button>
                        <button
                          type="button"
                          onClick={() => {
                            setEditingDateExpenseId(null);
                            setEditingDateValue('');
                          }}
                          className="p-1 bg-red-50 text-red-600 hover:bg-red-100 rounded-lg transition-all cursor-pointer shadow-2xs"
                          title="Cancel"
                        >
                          <X size={11} />
                        </button>
                      </div>
                    ) : (
                      <div className="flex items-center gap-2 group/date">
                        <span className="text-[10px] font-bold text-[#2D241E]">
                          {format(parseISO(expense.date), 'dd MMM yyyy')}
                        </span>
                        <button
                          type="button"
                          onClick={() => {
                            setEditingDateExpenseId(expense.id);
                            setEditingDateValue(expense.date);
                          }}
                          className="p-1 rounded-md text-[#8C8379] hover:text-[#2D241E] hover:bg-[#EBE7E0]/40 transition-all cursor-pointer opacity-0 group-hover/date:opacity-100 focus:opacity-100"
                          title="Click to edit date"
                        >
                          <Edit2 size={10} />
                        </button>
                      </div>
                    )}
                  </td>
                  <td className="px-4 py-2">
                    <div className="flex flex-col gap-1 items-start">
                      <span className="text-[9.5px] font-semibold bg-[#F2EFE9] text-[#4A3F35] px-2 py-0.5 rounded-full">
                        {expense.category}
                      </span>
                      <span className={`text-[7.5px] font-black uppercase tracking-wider px-1 py-0.5 rounded border ${
                        (expense.spendingType || 'Expenses') === 'Non-Current Asset' 
                          ? 'bg-indigo-50 text-indigo-600 border-indigo-100' 
                          : (expense.spendingType || 'Expenses') === 'Current Asset' 
                          ? 'bg-emerald-50 text-emerald-600 border-emerald-100' 
                          : (expense.spendingType || 'Expenses') === 'Current Liability' 
                          ? 'bg-orange-50 text-orange-600 border-orange-100' 
                          : (expense.spendingType || 'Expenses') === 'Non-Current Liability' 
                          ? 'bg-rose-50 text-rose-600 border-rose-100' 
                          : 'bg-slate-50 text-slate-500 border-slate-100/50'
                      }`}>
                        {expense.spendingType || 'Expenses'}
                      </span>
                    </div>
                  </td>
                  <td className="px-4 py-2">
                    <span className="text-[11px] text-[#2D241E] font-medium block max-w-sm truncate md:max-w-md">
                      {expense.description}
                    </span>
                  </td>
                  <td className="px-4 py-2 whitespace-nowrap">
                    <span className={`text-[8.5px] font-black px-1.5 py-0.5 rounded border uppercase ${
                      expense.location === 'PG' ? 'text-purple-600 bg-purple-50 border-purple-100' :
                      expense.location === 'BM' ? 'text-blue-600 bg-blue-50 border-blue-100' :
                      'text-amber-700 bg-amber-50 border-amber-100'
                    }`}>
                      {expense.location === 'ALL' ? 'All' : expense.location}
                    </span>
                  </td>
                  <td className="px-4 py-2 whitespace-nowrap">
                    <div className="flex items-center gap-1 text-[#8C8379] text-[10px] font-medium capitalize">
                      <User size={9} className="opacity-60" />
                      {expense.staffName}
                    </div>
                  </td>
                  <td className="px-4 py-2 text-center whitespace-nowrap">
                    <input
                      id={`row-upload-input-${expense.id}`}
                      type="file"
                      accept=".png,.jpg,.jpeg,.pdf"
                      className="hidden"
                      onChange={(e) => handleRowFileUpload(expense.id, e)}
                    />
                    <div className="flex items-center justify-center gap-1.5">
                      {expense.receiptUrl ? (
                        <>
                          <button
                            type="button"
                            onClick={() => {
                              setViewingReceiptUrl(expense.receiptUrl || null);
                              setViewingReceiptName(expense.receiptFileName || 'Receipt');
                            }}
                            className="inline-flex items-center gap-1 text-[9.5px] bg-[#EBE7E0]/60 hover:bg-[#2D241E] text-[#4A3F35] hover:text-white px-2.5 py-1 rounded-lg transition-all font-bold shadow-2xs cursor-pointer"
                            title={expense.receiptFileName}
                          >
                            <Eye size={11} className="shrink-0" />
                            <span>View</span>
                          </button>
                          {uploadingExpenseId === expense.id ? (
                            <span className="text-[8.5px] font-black text-[#8C8379] animate-pulse">...</span>
                          ) : (
                            <div className="flex items-center gap-0.5">
                              <button
                                type="button"
                                onClick={() => document.getElementById(`row-upload-input-${expense.id}`)?.click()}
                                className="p-1 hover:bg-[#EBE7E0]/60 hover:text-[#2D241E] rounded bg-transparent text-[#8C8379] transition-all cursor-pointer"
                                title="Replace receipt document"
                              >
                                <UploadCloud size={11} />
                              </button>
                              <button
                                type="button"
                                onClick={() => setRemoveReceiptTarget(expense)}
                                className="p-1 hover:bg-red-50 hover:text-red-500 rounded bg-transparent text-[#8C8379] transition-all cursor-pointer"
                                title="Remove receipt document"
                              >
                                <Trash2 size={11} />
                              </button>
                            </div>
                          )}
                        </>
                      ) : (
                        <>
                          {uploadingExpenseId === expense.id ? (
                            <span className="text-[8.5px] font-black text-[#8C8379] animate-pulse">Saving...</span>
                          ) : (
                            <button
                              type="button"
                              onClick={() => document.getElementById(`row-upload-input-${expense.id}`)?.click()}
                              className="inline-flex items-center gap-1 text-[9.5px] bg-[#EBE7E0]/60 hover:bg-[#2D241E] text-[#4A3F35] hover:text-white px-2.5 py-1.5 rounded-lg transition-all font-bold shadow-2xs cursor-pointer"
                              title="Upload receipt document"
                            >
                              <UploadCloud size={11} className="shrink-0" />
                              <span>Upload</span>
                            </button>
                          )}
                        </>
                      )}
                    </div>
                  </td>
                  <td className="px-4 py-2 text-right whitespace-nowrap">
                    <span className="text-[11px] font-extrabold text-red-500">
                      - RM {expense.amount.toFixed(2)}
                    </span>
                  </td>
                  <td className="px-4 py-2">
                    <div className="flex justify-center gap-1.5">
                      <button 
                        onClick={() => {
                          setEditingExpense(expense);
                          setShowAddModal(true);
                        }}
                        className="p-1 text-[#D9D1C7] hover:text-[#2D241E] hover:bg-[#EBE7E0]/40 rounded transition-all cursor-pointer"
                        title="Edit expense entry"
                      >
                        <Edit2 size={12} />
                      </button>
                      <button 
                        onClick={() => setDeleteTarget(expense)}
                        className="p-1 text-[#D9D1C7] hover:text-red-500 hover:bg-red-50 rounded transition-all cursor-pointer"
                        title="Delete expense entry"
                      >
                        <Trash2 size={12} />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}

              {filteredExpenses.length === 0 && (
                <tr>
                  <td colSpan={8} className="py-20 text-center bg-[#FAF9F6]/30">
                    <div className="max-w-xs mx-auto text-center">
                      <Receipt className="w-10 h-10 text-[#D9D1C7] mx-auto mb-3 opacity-50" />
                      <p className="text-[#8C8379] font-serif italic text-base leading-tight">No spending or asset records found for this selection.</p>
                      <p className="text-[10px] text-[#A69D94] mt-1">Ready to track? Click 'Record Spend & Asset' to add logs.</p>
                    </div>
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Record Expense Form Modal */}
      <AnimatePresence>
        {showAddModal && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setShowAddModal(false)}
              className="absolute inset-0 bg-[#2D241E]/40 backdrop-blur-sm"
            />
            <motion.div
              initial={{ opacity: 0, scale: 0.95, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 20 }}
              className="relative bg-white rounded-[32px] shadow-2xl border border-[#D9D1C7] w-full max-w-md overflow-hidden z-10 max-h-[85vh] flex flex-col"
            >
              <div className="flex items-center justify-between p-6 border-b border-[#F2EFE9] bg-[#FAF9F6] shrink-0">
                <div className="flex items-center gap-2.5">
                  <div className="w-8 h-8 rounded-full bg-red-50 flex items-center justify-center text-red-500">
                    <CreditCard size={16} />
                  </div>
                  <div>
                    <h3 className="font-serif italic font-bold text-[#2D241E] text-lg">
                      {editingExpense ? 'Edit Transaction' : 'Record Spend & Asset'}
                    </h3>
                    <p className="text-[9px] font-black uppercase text-[#8C8379] tracking-wider">
                      {editingExpense ? 'Modify this studio expenditure or asset log' : 'Add standard studio expenditures & assets'}
                    </p>
                  </div>
                </div>
                <button 
                  onClick={() => setShowAddModal(false)}
                  className="p-1 px-2 hover:bg-[#EBE7E0]/40 rounded-lg text-[#8C8379] transition-all"
                >
                  <X size={16} />
                </button>
              </div>

              <form onSubmit={handleRecordExpense} className="p-6 space-y-4 overflow-y-auto flex-1">
                {recordError && (
                  <div className="p-3 bg-red-50 border border-red-200 text-red-600 rounded-xl text-xs font-semibold flex items-center gap-2">
                    <span className="shrink-0 font-bold">⚠️</span>
                    <span>{recordError}</span>
                  </div>
                )}
                {/* Description */}
                <div className="space-y-1.5">
                  <label className="text-[10px] font-black uppercase text-[#8C8379] tracking-widest pl-1">Description / Particulars</label>
                  <input
                    type="text"
                    required
                    placeholder="e.g. Clay supplies restocking, Water bill"
                    value={expenseDescription}
                    onChange={(e) => setExpenseDescription(e.target.value)}
                    className="w-full bg-[#FAF9F6] border border-[#D9D1C7]/30 rounded-xl px-4 py-3 text-xs outline-none focus:ring-1 focus:ring-[#8B9A82]/50 text-[#2D241E] font-medium"
                  />
                </div>

                <div className="grid grid-cols-2 gap-4">
                  {/* Amount */}
                  <div className="space-y-1.5">
                    <label className="text-[10px] font-black uppercase text-[#8C8379] tracking-widest pl-1">Amount (RM)</label>
                    <input
                      type="number"
                      step="0.01"
                      required
                      min="0.01"
                      placeholder="0.00"
                      value={expenseAmount}
                      onChange={(e) => setExpenseAmount(e.target.value)}
                      className="w-full bg-[#FAF9F6] border border-[#D9D1C7]/30 rounded-xl px-4 py-3 text-xs outline-none focus:ring-1 focus:ring-[#8B9A82]/50 text-[#2D241E] font-black"
                    />
                  </div>

                  {/* Date Picker */}
                  <div className="space-y-1.5">
                    <label className="text-[10px] font-black uppercase text-[#8C8379] tracking-widest pl-1">Expense Date</label>
                    <input
                      type="date"
                      required
                      value={expenseDate}
                      onChange={(e) => setExpenseDate(e.target.value)}
                      className="w-full bg-[#FAF9F6] border border-[#D9D1C7]/30 rounded-xl px-4 py-3 text-xs outline-none focus:ring-1 focus:ring-[#8B9A82]/50 text-[#2D241E] font-bold"
                    />
                  </div>
                </div>

                 {/* Category Selector */}
                <div className="space-y-1.5">
                  <div className="flex justify-between items-center px-1">
                    <label className="text-[10px] font-black uppercase text-[#8C8379] tracking-widest">Select Category</label>
                    <button
                      type="button"
                      onClick={() => {
                        setShowCategoryModal(true);
                        setShowAddModal(false);
                      }}
                      className="text-[9px] font-black uppercase text-amber-600 hover:text-amber-800 tracking-wider flex items-center gap-1"
                    >
                      <Plus size={10} /> Add New
                    </button>
                  </div>
                  <select
                    value={expenseCategory}
                    onChange={(e) => {
                      const selectedName = e.target.value;
                      setExpenseCategory(selectedName);
                      const matchedCat = categories.find(c => c.name === selectedName);
                      if (matchedCat?.spendingType) {
                        setExpenseSpendingType(matchedCat.spendingType);
                      } else {
                        setExpenseSpendingType('Expenses');
                      }
                    }}
                    required
                    className="w-full bg-[#FAF9F6] border border-[#D9D1C7]/30 rounded-xl px-4 py-3 text-xs outline-none focus:ring-1 focus:ring-[#8B9A82]/50 text-[#2D241E] font-bold"
                  >
                    {categories.length === 0 ? (
                      <option value="">-- No Categories Found --</option>
                    ) : (
                      categories.map(c => (
                        <option key={c.id} value={c.name}>{c.name}</option>
                      ))
                    )}
                  </select>
                </div>

                 {/* Spending / Bookkeeping Type Selection */}
                <div className="space-y-1.5">
                  <label className="text-[10px] font-black uppercase text-[#8C8379] tracking-widest pl-1">Spending Classification</label>
                  <select
                    value={expenseSpendingType}
                    onChange={(e) => setExpenseSpendingType(e.target.value as 'Expenses' | 'Current Asset' | 'Non-Current Asset' | 'Current Liability' | 'Non-Current Liability')}
                    required
                    className="w-full bg-[#FAF9F6] border border-[#D9D1C7]/30 rounded-xl px-4 py-3 text-xs outline-none focus:ring-1 focus:ring-[#8B9A82]/50 text-[#2D241E] font-bold cursor-pointer"
                  >
                    <option value="Expenses">Expenses (Operational Costs, Meals, Utilities)</option>
                    <option value="Current Asset" className="text-emerald-700">Current Asset (Clay stock, Glaze materials, raw goods)</option>
                    <option value="Non-Current Asset" className="text-indigo-700 font-bold">Non-Current Asset (Kilns, Pottery Wheels, Renovations, Airconds)</option>
                    <option value="Current Liability" className="text-orange-700 font-bold">Current Liability (Short-term debt, supplier credit, deposits due)</option>
                    <option value="Non-Current Liability" className="text-rose-700 font-bold">Non-Current Liability (Long-term studio loans, machine financing)</option>
                  </select>
                  
                  {/* Informative Accounting Assist Note based on selection */}
                  <div className="p-3 bg-[#FAF9F6] rounded-xl border border-[#D9D1C7]/20 text-[10.5px] leading-relaxed text-[#8C8379]">
                    {expenseSpendingType === 'Expenses' && (
                      <p>
                        💡 <strong>Expenses:</strong> For day-to-day general spending (Rent, electricity, staff meals, printing) that are directly loaded against this month's studio profits.
                      </p>
                    )}
                    {expenseSpendingType === 'Current Asset' && (
                      <p className="text-[#3a755d]">
                        📥 <strong>Current Asset:</strong> Valuable stock that will be consumed or converted within 1 year (e.g. clay shipments in bulk, glaze raw materials, packaging). Increases your asset balances rather than immediate profit hits!
                      </p>
                    )}
                    {expenseSpendingType === 'Non-Current Asset' && (
                      <p className="text-[#3c41a4]">
                        🏗️ <strong>Non-Current Asset:</strong> Long-term physical assets used for over 1 year (e.g. electric kilns, pottery wheels, furniture, studio renovations). Capitalized on the balance sheet with depreciation.
                      </p>
                    )}
                    {expenseSpendingType === 'Current Liability' && (
                      <p className="text-[#a45e3c]">
                        💳 <strong>Current Liability:</strong> Short-term obligations to be paid within 1 year (e.g. supplier credit account balances, outstanding short-term invoices, customer deposit reserves).
                      </p>
                    )}
                    {expenseSpendingType === 'Non-Current Liability' && (
                      <p className="text-[#a43c52]">
                        🏦 <strong>Non-Current Liability:</strong> Long-term business debt or financing obligations payable after 1 year (e.g. equipment bank loans, lease obligations, startup capital financing).
                      </p>
                    )}
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-4">
                  {/* Outlet Location defaulted to ALL since there is only one branch now */}

                  {/* Staff Select / Input */}
                  <div className="space-y-1.5">
                    <label className="text-[10px] font-black uppercase text-[#8C8379] tracking-widest pl-1">Filer / Recorded By</label>
                    <select
                      value={expenseStaff}
                      onChange={(e) => setExpenseStaff(e.target.value)}
                      className="w-full bg-[#FAF9F6] border border-[#D9D1C7]/30 rounded-xl px-4 py-3 text-xs outline-none focus:ring-1 focus:ring-[#8B9A82]/50 text-[#2D241E] font-bold"
                    >
                      <option value="">Self (Registered Email)</option>
                      {staffList
                        .filter(s => expenseLocation === 'ALL' || s.branch === expenseLocation)
                        .map(s => (
                          <option key={s.id} value={s.name}>{s.name}</option>
                        ))
                      }
                    </select>
                  </div>
                </div>

                {/* Receipt Upload Zone */}
                <div className="space-y-1.5">
                  <label className="text-[10px] font-black uppercase text-[#8C8379] tracking-widest pl-1">
                    Attach Receipt (PNG or PDF)
                  </label>
                  
                  {uploadError && (
                    <div className="text-[10px] text-red-600 font-bold bg-red-50 p-2.5 rounded-xl border border-red-100 flex items-center gap-1.5">
                      <span>⚠️</span>
                      <span>{uploadError}</span>
                    </div>
                  )}

                  {!receiptBase64 ? (
                    <div
                      onDragOver={handleDragOver}
                      onDragLeave={handleDragLeave}
                      onDrop={handleDrop}
                      className={`border-2 border-dashed rounded-2xl p-4 text-center transition-all cursor-pointer ${
                        isDragging 
                          ? 'border-[#2D241E] bg-[#EBE7E0]/30' 
                          : 'border-[#D9D1C7]/60 bg-[#FAF9F6] hover:bg-[#EBE7E0]/20'
                      }`}
                      onClick={() => document.getElementById('receipt-file-input')?.click()}
                    >
                      <input
                        id="receipt-file-input"
                        type="file"
                        accept=".png,.jpg,.jpeg,.pdf"
                        className="hidden"
                        onChange={handleFileChange}
                      />
                      <UploadCloud className="mx-auto text-[#A69D94] mb-1.5" size={24} />
                      <p className="text-[11px] font-bold text-[#2D241E]">
                        Drag & Drop or Click to Upload
                      </p>
                      <p className="text-[8.5px] text-[#8C8379] mt-0.5 uppercase tracking-wider font-semibold">
                        PNG, JPEG, or PDF (Max 800KB)
                      </p>
                    </div>
                  ) : (
                    <div className="flex items-center justify-between p-3 bg-[#FAF9F6] border border-[#D9D1C7]/40 rounded-xl relative overflow-hidden">
                      <div className="flex items-center gap-2.5 min-w-0">
                        {receiptBase64.startsWith('data:image/') ? (
                          <img 
                            src={receiptBase64} 
                            alt="Receipt Preview" 
                            className="w-10 h-10 rounded-lg object-cover border border-[#D9D1C7]/40 shrink-0"
                          />
                        ) : (
                          <div className="w-10 h-10 rounded-lg bg-red-50 text-red-500 flex items-center justify-center border border-red-100 shrink-0">
                            <FileText size={18} />
                          </div>
                        )}
                        <div className="min-w-0">
                          <p className="text-[11px] font-extrabold text-[#2D241E] truncate">
                            {receiptFileName}
                          </p>
                          <p className="text-[8.5px] text-emerald-600 font-bold uppercase tracking-wider flex items-center gap-0.5">
                            <span>Ready to save</span>
                          </p>
                        </div>
                      </div>
                      
                      <button
                        type="button"
                        onClick={removeReceipt}
                        className="p-1.5 bg-white hover:bg-red-50 text-[#8C8379] hover:text-red-500 rounded-lg border border-[#D9D1C7]/20 transition-all shadow-xs"
                        title="Remove Receipt"
                      >
                        <X size={12} />
                      </button>
                    </div>
                  )}
                </div>

                {/* Submit Controls */}
                <div className="flex gap-3 pt-4 border-t border-[#F2EFE9]">
                  <button
                    type="button"
                    onClick={() => setShowAddModal(false)}
                    className="flex-1 py-3 text-center text-xs font-black uppercase tracking-widest text-[#8C8379] border border-[#D9D1C7]/20 hover:bg-[#FAF9F6] rounded-xl transition-all"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    disabled={isSubmitting || categories.length === 0}
                    className="flex-1 py-3 text-center text-xs font-black uppercase tracking-widest bg-red-500 hover:bg-red-600 text-white rounded-xl transition-all disabled:opacity-50"
                  >
                    {isSubmitting ? "Saving..." : editingExpense ? "Save Changes" : "Record Spent"}
                  </button>
                </div>
              </form>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Categories Manager Modal */}
      <AnimatePresence>
        {showCategoryModal && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setShowCategoryModal(false)}
              className="absolute inset-0 bg-[#2D241E]/40 backdrop-blur-sm"
            />
            <motion.div
              initial={{ opacity: 0, scale: 0.95, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 20 }}
              className="relative bg-white rounded-[32px] shadow-2xl border border-[#D9D1C7] w-full max-w-md overflow-hidden z-10 max-h-[85vh] flex flex-col"
            >
              <div className="flex items-center justify-between p-6 border-b border-[#F2EFE9] bg-[#FAF9F6] shrink-0">
                <div className="flex items-center gap-2.5">
                  <div className="w-8 h-8 rounded-full bg-amber-50 flex items-center justify-center text-amber-600">
                    <Tag size={16} />
                  </div>
                  <div>
                    <h3 className="font-serif italic font-bold text-[#2D241E] text-lg">Spend & Asset Categories</h3>
                    <p className="text-[9px] font-black uppercase text-[#8C8379] tracking-wider">Create and delete custom categories for tracing spend</p>
                  </div>
                </div>
                <button 
                  onClick={() => setShowCategoryModal(false)}
                  className="p-1 px-2 hover:bg-[#EBE7E0]/40 rounded-lg text-[#8C8379] transition-all"
                >
                  <X size={16} />
                </button>
              </div>

              <div className="p-6 space-y-4 overflow-y-auto flex-1">
                {categoryError && (
                  <div className="p-3 bg-red-50 border border-red-200 text-red-600 rounded-xl text-xs font-semibold flex items-center gap-2">
                    <span className="shrink-0 font-bold">⚠️</span>
                    <span>{categoryError}</span>
                  </div>
                )}

                {/* Prepopulate Categories Button */}
                {categories.length === 0 && (
                  <button
                    type="button"
                    onClick={handleAddDefaultCategories}
                    className="w-full py-2 bg-amber-50 border border-amber-200 hover:bg-amber-100 text-amber-800 text-[10px] font-black uppercase tracking-widest text-center rounded-xl transition-all"
                  >
                    ⚡ Setup standard default categories
                  </button>
                )}

                {/* Create Category form */}
                <form onSubmit={handleCreateCategory} className="space-y-3 bg-[#FAF9F6]/50 p-4 rounded-2xl border border-[#D9D1C7]/30">
                  <span className="text-[10px] font-black uppercase text-[#8C8379] tracking-widest pl-1 block">New Custom Category</span>
                  
                  <div className="space-y-1">
                    <label className="text-[9px] font-semibold text-[#8C8379] uppercase pl-1">Category Name</label>
                    <input
                      type="text"
                      required
                      placeholder="e.g. Clay supplies, Kiln repair"
                      className="w-full bg-[#FAF9F6] border border-[#D9D1C7]/30 rounded-xl px-3 py-2 text-xs outline-none focus:ring-1 focus:ring-[#8B9A82]/50 text-[#2D241E] font-medium"
                      value={newCategoryName}
                      onChange={(e) => {
                        setNewCategoryName(e.target.value);
                        setCategoryError(null);
                      }}
                    />
                  </div>

                  <div className="space-y-1">
                    <label className="text-[9px] font-semibold text-[#8C8379] uppercase pl-1">Bookkeeping Classification</label>
                    <select
                      value={newCategorySpendingType}
                      onChange={(e) => setNewCategorySpendingType(e.target.value as any)}
                      required
                      className="w-full bg-[#FAF9F6] border border-[#D9D1C7]/30 rounded-xl px-3 py-2 text-xs outline-none focus:ring-1 focus:ring-[#8B9A82]/50 text-[#2D241E] font-bold cursor-pointer"
                    >
                      <option value="Expenses">Expenses (Regular Operational Costs)</option>
                      <option value="Current Asset" className="text-emerald-700 font-bold">Current Asset (Clay stock, Glazes, raw supplies)</option>
                      <option value="Non-Current Asset" className="text-indigo-700 font-bold">Non-Current Asset (Kilns, Wheels, Airconds)</option>
                      <option value="Current Liability" className="text-orange-700 font-bold">Current Liability (Supplier credits, deposit reserves)</option>
                      <option value="Non-Current Liability" className="text-rose-700 font-bold">Non-Current Liability (Long-term studio loans)</option>
                    </select>
                  </div>

                  <button
                    type="submit"
                    className="w-full py-2 bg-[#2D241E] hover:bg-[#4A3F35] text-white rounded-xl text-[10px] font-black uppercase tracking-widest transition-all shadow-sm flex items-center justify-center gap-1 mt-1"
                  >
                    Add Spending Category
                  </button>
                </form>

                {/* Categories listings */}
                <div className="space-y-1.5 max-h-60 overflow-y-auto pr-1">
                  {categories.length === 0 ? (
                    <div className="text-center py-6 text-xs text-[#8C8379] italic bg-[#FAF9F6]/50 rounded-2xl border border-dashed border-[#D9D1C7]/40">
                      No custom categories added yet. Add one above!
                    </div>
                  ) : (
                    categories.map((cat) => (
                      <div 
                        key={cat.id} 
                        className="flex items-center justify-between px-3.5 py-2 bg-[#FAF9F6] rounded-xl border border-[#D9D1C7]/20 hover:border-[#D9D1C7]/50 transition-all text-xs"
                      >
                        <div className="flex flex-col gap-0.5">
                          <span className="font-semibold text-[#2D241E]">{cat.name}</span>
                          <span className={`text-[7.5px] font-black uppercase tracking-wider px-1 inline-block rounded w-max border ${
                            (cat.spendingType || 'Expenses') === 'Non-Current Asset' 
                              ? 'bg-indigo-50 text-indigo-600 border-indigo-100' 
                              : (cat.spendingType || 'Expenses') === 'Current Asset' 
                              ? 'bg-emerald-50 text-emerald-600 border-emerald-100' 
                              : (cat.spendingType || 'Expenses') === 'Current Liability' 
                              ? 'bg-orange-50 text-orange-600 border-orange-100' 
                              : (cat.spendingType || 'Expenses') === 'Non-Current Liability' 
                              ? 'bg-rose-50 text-rose-600 border-rose-100' 
                              : 'bg-slate-100 text-slate-500 border-slate-200/50'
                          }`}>
                            {cat.spendingType || 'Expenses'}
                          </span>
                        </div>
                        <button
                          type="button"
                          onClick={() => initiateDeleteCategory(cat)}
                          className="p-1 text-[#D9D1C7] hover:text-red-500 rounded transition-all"
                          title="Delete Category"
                        >
                          <Trash2 size={12} />
                        </button>
                      </div>
                    ))
                  )}
                </div>

                {/* Done/Close button */}
                <div className="pt-4 border-t border-[#F2EFE9] flex justify-end">
                  <button
                    type="button"
                    onClick={() => {
                      setShowCategoryModal(false);
                      // reopen Record Modal if categories are available now
                      if (categories.length > 0) {
                        setShowAddModal(true);
                      }
                    }}
                    className="px-6 py-2 bg-[#F2EFE9] text-[#4A3F35] hover:bg-[#EBE7E0] rounded-xl text-[10px] font-black uppercase tracking-widest transition-all"
                  >
                    Done & Close
                  </button>
                </div>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Delete Confirmation Dialog */}
      <ConfirmationModal
        isOpen={deleteTarget !== null}
        onClose={() => setDeleteTarget(null)}
        onConfirm={handleDeleteExpense}
        title="Delete Expense Record"
        message={`Are you sure you want to permanently delete the expense record for "${deleteTarget?.description}" of RM ${deleteTarget?.amount?.toFixed(2) || '0.00'}? This action cannot be undone.`}
        confirmText="Yes, Delete"
        cancelText="No, Keep"
        isDestructive={true}
      />

      {/* Delete Category Confirmation Dialog */}
      <ConfirmationModal
        isOpen={categoryDeleteTarget !== null}
        onClose={() => setCategoryDeleteTarget(null)}
        onConfirm={handleDeleteCategoryConfirm}
        title="Delete Spend Category"
        message={`Are you sure you want to permanently delete the category "${categoryDeleteTarget?.name}"? This action cannot be undone.`}
        confirmText="Yes, Delete"
        cancelText="No, Keep"
        isDestructive={true}
      />

      {/* Remove Receipt Confirmation Dialog */}
      <ConfirmationModal
        isOpen={removeReceiptTarget !== null}
        onClose={() => setRemoveReceiptTarget(null)}
        onConfirm={handleConfirmRemoveReceipt}
        title="Remove Attached Receipt"
        message={`Are you sure you want to remove the attached receipt document "${removeReceiptTarget?.receiptFileName || 'receipt'}" from the expense record "${removeReceiptTarget?.description}"?`}
        confirmText="Yes, Remove"
        cancelText="No, Keep"
        isDestructive={true}
      />

      {/* Receipt View Modal Overlay */}
      <AnimatePresence>
        {viewingReceiptUrl && (
          <div className="fixed inset-0 bg-[#2D241E]/40 backdrop-blur-xs flex items-center justify-center p-4 z-50">
            <motion.div
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              className="bg-white rounded-[32px] shadow-2xl border border-[#D9D1C7] w-full max-w-2xl overflow-hidden flex flex-col max-h-[85vh]"
            >
              <div className="flex items-center justify-between p-6 border-b border-[#F2EFE9] bg-[#FAF9F6]">
                <div className="flex items-center gap-2.5">
                  <div className="w-8 h-8 rounded-full bg-amber-50 flex items-center justify-center text-amber-600">
                    <Receipt size={16} />
                  </div>
                  <div className="min-w-0">
                    <h3 className="font-serif italic font-bold text-[#2D241E] text-base truncate max-w-[200px] sm:max-w-xs md:max-w-md">
                      {viewingReceiptName || 'Attached Receipt'}
                    </h3>
                    <p className="text-[9px] font-black uppercase text-[#8C8379] tracking-wider">
                      Recorded Document Review
                    </p>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <a
                    href={viewingReceiptUrl}
                    download={viewingReceiptName || 'receipt'}
                    className="p-1.5 hover:bg-[#EBE7E0]/40 rounded-lg text-[#2D241E] transition-all flex items-center gap-1 text-[10px] font-bold uppercase tracking-wider"
                    title="Download Receipt File"
                  >
                    <Download size={14} />
                    <span className="hidden sm:inline">Download</span>
                  </a>
                  <button 
                    type="button"
                    onClick={() => {
                      setViewingReceiptUrl(null);
                      setViewingReceiptName(null);
                    }}
                    className="p-1.5 hover:bg-red-50 hover:text-red-500 rounded-lg text-[#8C8379] transition-all"
                  >
                    <X size={16} />
                  </button>
                </div>
              </div>

              <div className="p-6 overflow-y-auto flex-1 flex flex-col items-center justify-center bg-[#FAF9F6]/20">
                {viewingReceiptUrl.startsWith('data:application/pdf') ? (
                  <div className="w-full h-full min-h-[400px] flex flex-col items-center justify-center">
                    <iframe 
                      src={viewingReceiptUrl} 
                      className="w-full h-[400px] rounded-2xl border border-[#D9D1C7]/30 shadow-sm"
                      title="Receipt PDF Preview"
                    />
                    <div className="mt-3 text-center">
                      <p className="text-xs text-[#8C8379] font-medium">
                        If the PDF is not displaying, you can download it directly:
                      </p>
                      <a
                        href={viewingReceiptUrl}
                        download={viewingReceiptName || 'receipt.pdf'}
                        className="inline-flex items-center gap-1.5 mt-2 px-4 py-2 bg-[#2D241E] text-white hover:bg-[#4A3F35] rounded-xl text-xs font-bold uppercase tracking-wider transition-all"
                      >
                        <Download size={12} />
                        Download PDF File
                      </a>
                    </div>
                  </div>
                ) : (
                  <div className="max-w-full max-h-[60vh] flex justify-center items-center overflow-hidden rounded-2xl border border-[#D9D1C7]/20 shadow-xs bg-white p-2">
                    <img
                      src={viewingReceiptUrl}
                      alt="Receipt Document"
                      className="max-w-full max-h-[50vh] object-contain rounded-lg"
                    />
                  </div>
                )}
              </div>

              <div className="p-4 bg-[#FAF9F6] border-t border-[#F2EFE9] flex justify-end">
                <button
                  type="button"
                  onClick={() => {
                    setViewingReceiptUrl(null);
                    setViewingReceiptName(null);
                  }}
                  className="px-6 py-2 bg-[#2D241E] text-white hover:bg-[#4A3F35] rounded-xl text-[10px] font-black uppercase tracking-widest transition-all"
                >
                  Close Preview
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
}
