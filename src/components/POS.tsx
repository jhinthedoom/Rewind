import React, { useState, useEffect, useMemo } from 'react';
import { db } from '../firebase';
import { 
  collection, 
  onSnapshot, 
  addDoc, 
  doc, 
  updateDoc, 
  query, 
  orderBy, 
  where, 
  deleteDoc 
} from 'firebase/firestore';
import { Product, OperationType, Transaction, Branch, PaymentMethod, Staff } from '../types';
import { handleFirestoreError } from '../utils';
import { 
  Receipt, 
  PackageOpen, 
  Plus, 
  TrendingUp, 
  FileText, 
  X, 
  Download, 
  Calendar, 
  Edit2, 
  Trash2, 
  Package, 
  Layers, 
  Search, 
  ShoppingBag, 
  Check, 
  ArrowUpRight, 
  AlertCircle,
  PlusCircle,
  Minus,
  Sparkles,
  SlidersHorizontal,
  RefreshCw,
  Printer,
  Eye,
  CheckCircle2,
  Mail,
  Share2,
  Copy,
  MessageSquare,
  Send,
  Smartphone,
  CheckCheck
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { startOfMonth, endOfMonth, format } from 'date-fns';
import { sendBusinessEmail, generateProductSaleReceiptEmail } from '../utils/emailTemplates';
import { generateTransactionReceiptPdfBase64, downloadTransactionReceiptPdf } from '../utils/pdfGenerator';
import { getTransactionDocRef } from '../utils/referenceNumber';

const DEFAULT_CATEGORIES = [
  'Mugs & Cups',
  'Plates & Dishes',
  'Bowls',
  'Vases & Planters',
  'Home Decor',
  'Sets & Bundles',
  'Art Pieces',
  'Accessories'
];

export default function POS({ onComplete, branch = 'ALL' }: { onComplete?: () => void, branch?: string }) {
  // --- Inventory & Products States ---
  const [saleProducts, setSaleProducts] = useState<Product[]>([]);
  const [selectedCategory, setSelectedCategory] = useState<string>('ALL');
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [selectedProduct, setSelectedProduct] = useState<Product | null>(null);

  // --- Sale Recording States ---
  const [saleMode, setSaleMode] = useState<'catalog' | 'manual'>('catalog');
  const [saleQuantity, setSaleQuantity] = useState<number>(1);
  const [manualSalePrice, setManualSalePrice] = useState<string>('');
  const [quickSaleName, setQuickSaleName] = useState<string>('');
  const [saleDate, setSaleDate] = useState<string>(format(new Date(), 'yyyy-MM-dd'));
  const [customerName, setCustomerName] = useState<string>('Walk-in Customer');
  const [customerEmail, setCustomerEmail] = useState<string>('');
  const [customerPhone, setCustomerPhone] = useState<string>('');
  const [selectedStaffName, setSelectedStaffName] = useState<string>('');
  const [selectedPaymentMethod, setSelectedPaymentMethod] = useState<PaymentMethod>('Cash');
  const [staffList, setStaffList] = useState<Staff[]>([]);
  const [isProcessing, setIsProcessing] = useState<boolean>(false);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const [autoPreviewReceipt, setAutoPreviewReceipt] = useState<boolean>(true);

  // --- Document Preview & Email Modal State ---
  const [previewDoc, setPreviewDoc] = useState<{ tx: Transaction; type: 'receipt' | 'invoice' } | null>(null);
  const [modalEmailInput, setModalEmailInput] = useState<string>('');
  const [modalPhoneInput, setModalPhoneInput] = useState<string>('');
  const [emailActionFeedback, setEmailActionFeedback] = useState<string | null>(null);
  const [isCopied, setIsCopied] = useState<boolean>(false);
  const [downloadNotice, setDownloadNotice] = useState<string | null>(null);

  const handleDownloadPosPdf = (tx: Transaction, type: 'invoice' | 'receipt') => {
    try {
      downloadTransactionReceiptPdf(tx, type, undefined, recentSales);
      const docName = type === 'invoice' ? 'Tax Invoice' : 'Official Receipt';
      setDownloadNotice(`✓ Downloaded ${docName} PDF`);
      setTimeout(() => {
        setDownloadNotice(null);
      }, 3200);
    } catch (err) {
      console.error('Error downloading POS PDF:', err);
    }
  };

  // --- Stock In / Upload Stock Modal States ---
  const [isStockModalOpen, setIsStockModalOpen] = useState<boolean>(false);
  const [stockModalTab, setStockModalTab] = useState<'add_new' | 'batch_restock'>('add_new');
  const [newCategory, setNewCategory] = useState<string>('Mugs & Cups');
  const [customCategoryName, setCustomCategoryName] = useState<string>('');
  const [newName, setNewName] = useState<string>('');
  const [newStock, setNewStock] = useState<string>('1');
  const [newPrice, setNewPrice] = useState<string>('');
  const [newSku, setNewSku] = useState<string>('');
  const [newLocation, setNewLocation] = useState<Branch>('ALL');
  const [isSavingStock, setIsSavingStock] = useState<boolean>(false);
  const [batchCategoryFilter, setBatchCategoryFilter] = useState<string>('ALL');
  const [batchStockChanges, setBatchStockChanges] = useState<{ [productId: string]: number }>({});

  // --- Ledger / History States ---
  const [lastTx, setLastTx] = useState<Transaction | null>(null);
  const [recentSales, setRecentSales] = useState<Transaction[]>([]);
  const [showAllTx, setShowAllTx] = useState<boolean>(false);
  const [selectedYear, setSelectedYear] = useState<number>(new Date().getFullYear());
  const [selectedMonth, setSelectedMonth] = useState<number>(new Date().getMonth());

  // --- POS Editing States ---
  const [editingTx, setEditingTx] = useState<Transaction | null>(null);
  const [editDesc, setEditDesc] = useState<string>('');
  const [editAmount, setEditAmount] = useState<string>('');
  const [editDate, setEditDate] = useState<string>('');
  const [editTime, setEditTime] = useState<string>('');
  const [isSavingEdit, setIsSavingEdit] = useState<boolean>(false);

  // --- POS Deletion States ---
  const [deletingTx, setDeletingTx] = useState<Transaction | null>(null);
  const [isDeleting, setIsDeleting] = useState<boolean>(false);
  const [isSendingEmail, setIsSendingEmail] = useState<boolean>(false);

  const years = Array.from({ length: 5 }, (_, i) => new Date().getFullYear() - i);
  const months = [
    'January', 'February', 'March', 'April', 'May', 'June',
    'July', 'August', 'September', 'October', 'November', 'December'
  ];

  // 1. Subscribe to ready-sale products
  useEffect(() => {
    const q = collection(db, 'products');
    const unsub = onSnapshot(q, (snapshot) => {
      const allProds = snapshot.docs.map(d => ({ id: d.id, ...d.data() } as Product));
      // Filter for sale category products
      const forSale = allProds.filter(p => p.category === 'sale');
      forSale.sort((a, b) => (a.name || '').localeCompare(b.name || ''));
      setSaleProducts(forSale);
    }, (error) => handleFirestoreError(error, OperationType.LIST, 'products'));

    return () => unsub();
  }, []);

  // 2. Subscribe to transaction ledger
  useEffect(() => {
    const startDate = startOfMonth(new Date(selectedYear, selectedMonth)).toISOString();
    const endDate = endOfMonth(new Date(selectedYear, selectedMonth)).toISOString();

    const q = query(
      collection(db, 'transactions'), 
      where('timestamp', '>=', startDate),
      where('timestamp', '<=', endDate),
      orderBy('timestamp', 'desc')
    );

    const unsub = onSnapshot(q, (snapshot) => {
      let data = snapshot.docs.map(d => ({ id: d.id, ...d.data() })) as Transaction[];
      data = data.filter(tx => tx.type === 'sale');
      if (branch !== 'ALL') {
        data = data.filter(tx => tx.location === branch);
      }
      setRecentSales(data);
    }, (error) => handleFirestoreError(error, OperationType.LIST, 'transactions'));
    
    return () => unsub();
  }, [branch, selectedYear, selectedMonth]);

  // Subscribe to staff members
  useEffect(() => {
    const q = collection(db, 'staff');
    const unsub = onSnapshot(q, (snap) => {
      const list = snap.docs.map(d => ({ id: d.id, ...d.data() } as Staff)).filter(s => s.active);
      setStaffList(list);
      if (list.length > 0 && !selectedStaffName) {
        setSelectedStaffName(list[0].name);
      }
    });
    return () => unsub();
  }, []);

  // Extract unique category list from products + defaults
  const availableCategories = useMemo(() => {
    const set = new Set<string>(DEFAULT_CATEGORIES);
    saleProducts.forEach(p => {
      if (p.productCategory && p.productCategory.trim()) {
        set.add(p.productCategory.trim());
      }
    });
    return Array.from(set);
  }, [saleProducts]);

  // Filtered products for catalog
  const filteredCatalogProducts = useMemo(() => {
    return saleProducts.filter(p => {
      const matchesCategory = selectedCategory === 'ALL' || (p.productCategory || 'General') === selectedCategory;
      const matchesSearch = !searchQuery.trim() || 
        p.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
        (p.sku && p.sku.toLowerCase().includes(searchQuery.toLowerCase())) ||
        (p.productCategory && p.productCategory.toLowerCase().includes(searchQuery.toLowerCase()));
      return matchesCategory && matchesSearch;
    });
  }, [saleProducts, selectedCategory, searchQuery]);

  // Select a product from catalog
  const handleSelectProduct = (product: Product) => {
    setSelectedProduct(product);
    setSaleMode('catalog');
    setSaleQuantity(1);
    // Pre-fill manual price with default price, but leave it editable
    setManualSalePrice(product.price ? product.price.toFixed(2) : '0.00');
    setQuickSaleName(`${product.name}${product.productCategory ? ` [${product.productCategory}]` : ''}`);
  };

  // Adjust sale quantity
  const handleQuantityChange = (qty: number) => {
    const newQty = Math.max(1, qty);
    setSaleQuantity(newQty);
    if (selectedProduct) {
      const calculated = (Number(selectedProduct.price || 0) * newQty).toFixed(2);
      setManualSalePrice(calculated);
    }
  };

  // Record Sale & Deduct Stock
  const handleRecordSale = async (e: React.FormEvent, shouldPreview = autoPreviewReceipt) => {
    e.preventDefault();
    const finalAmount = parseFloat(manualSalePrice);
    if (isNaN(finalAmount) || finalAmount < 0 || isProcessing) return;

    if (saleMode === 'manual' && !quickSaleName.trim()) return;
    if (saleMode === 'catalog' && !selectedProduct) return;

    setIsProcessing(true);
    try {
      const location = branch === 'ALL' ? 'BM' : branch;
      const now = new Date();
      const timeStr = format(now, 'HH:mm:ss');
      const timestampIso = new Date(`${saleDate}T${timeStr}`).toISOString();

      let description = '';
      if (saleMode === 'catalog' && selectedProduct) {
        const catLabel = selectedProduct.productCategory ? ` [${selectedProduct.productCategory}]` : '';
        description = `Direct Sale: ${saleQuantity}x ${selectedProduct.name}${catLabel}`;
      } else {
        description = `Direct Sale: ${quickSaleName.trim()}`;
      }

      const transactionData: Omit<Transaction, 'id'> = {
        type: 'sale',
        amount: finalAmount,
        timestamp: timestampIso,
        description,
        customerName: customerName.trim() || 'Walk-in Customer',
        customerEmail: customerEmail.trim() || undefined,
        customerPhone: customerPhone.trim() || undefined,
        location: location as Branch,
        productId: selectedProduct?.id || '',
        quantity: saleMode === 'catalog' ? saleQuantity : 1,
        unitPrice: saleMode === 'catalog' && saleQuantity > 0 ? finalAmount / saleQuantity : finalAmount,
        staffName: selectedStaffName || 'Staff',
        paymentMethod: selectedPaymentMethod
      };

      // 1. Create transaction in Firestore
      const docRef = await addDoc(collection(db, 'transactions'), transactionData);
      const recordedTx: Transaction = { id: docRef.id, ...transactionData };
      setLastTx(recordedTx);

      // 2. Deduct product stock in Firestore if linked to a catalog item
      if (saleMode === 'catalog' && selectedProduct?.id) {
        const currentStock = Number(selectedProduct.stock || 0);
        const newStock = Math.max(0, currentStock - saleQuantity);
        await updateDoc(doc(db, 'products', selectedProduct.id), {
          stock: newStock
        });
      }

      // Show success feedback
      setSuccessMessage(`Recorded sale of RM ${finalAmount.toFixed(2)}${selectedProduct ? ` and updated stock for "${selectedProduct.name}"` : ''}!`);
      setTimeout(() => setSuccessMessage(null), 5000);

      // If preview requested, open receipt preview modal immediately!
      if (shouldPreview) {
        openDocumentPreview(recordedTx, 'receipt');
      }

      // Reset form
      if (saleMode === 'manual') {
        setQuickSaleName('');
        setManualSalePrice('');
      } else {
        setSelectedProduct(null);
        setManualSalePrice('');
      }
      setSaleQuantity(1);
      setSaleDate(format(new Date(), 'yyyy-MM-dd'));
      setCustomerName('Walk-in Customer');
      setCustomerEmail('');
      setCustomerPhone('');
    } catch (error) {
      handleFirestoreError(error, OperationType.WRITE, 'transactions');
    } finally {
      setIsProcessing(false);
    }
  };

  // Add new ready-sale product under a category
  const handleAddNewProductStock = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newName.trim() || isSavingStock) return;

    setIsSavingStock(true);
    try {
      const categoryToUse = newCategory === '__custom__' ? (customCategoryName.trim() || 'Other') : newCategory;
      const initialStock = parseInt(newStock) || 0;
      const defaultPrice = parseFloat(newPrice) || 0;

      const productPayload: Omit<Product, 'id'> = {
        name: newName.trim(),
        category: 'sale',
        productCategory: categoryToUse,
        stock: initialStock,
        price: defaultPrice,
        sku: newSku.trim(),
        location: newLocation
      };

      await addDoc(collection(db, 'products'), productPayload);

      // Reset modal fields
      setNewName('');
      setNewStock('1');
      setNewPrice('');
      setNewSku('');
      setCustomCategoryName('');
      setIsStockModalOpen(false);
    } catch (error) {
      handleFirestoreError(error, OperationType.WRITE, 'products');
    } finally {
      setIsSavingStock(false);
    }
  };

  // Quick increment/decrement batch stock change
  const handleBatchStockDelta = (productId: string, delta: number) => {
    setBatchStockChanges(prev => {
      const currentDelta = prev[productId] || 0;
      return { ...prev, [productId]: currentDelta + delta };
    });
  };

  // Save batch stock updates
  const handleSaveBatchRestock = async () => {
    if (Object.keys(batchStockChanges).length === 0 || isSavingStock) return;
    setIsSavingStock(true);
    try {
      for (const [prodId, delta] of Object.entries(batchStockChanges)) {
        const deltaNum = Number(delta) || 0;
        if (deltaNum === 0) continue;
        const targetProd = saleProducts.find(p => p.id === prodId);
        if (targetProd) {
          const current = Number(targetProd.stock || 0);
          const updated = Math.max(0, current + deltaNum);
          await updateDoc(doc(db, 'products', prodId), {
            stock: updated
          });
        }
      }
      setBatchStockChanges({});
      setIsStockModalOpen(false);
    } catch (error) {
      handleFirestoreError(error, OperationType.UPDATE, 'products');
    } finally {
      setIsSavingStock(false);
    }
  };

  // Direct stock quick update on single card
  const handleQuickSingleStockUpdate = async (product: Product, delta: number) => {
    if (!product.id) return;
    try {
      const current = Number(product.stock || 0);
      const updated = Math.max(0, current + delta);
      await updateDoc(doc(db, 'products', product.id), {
        stock: updated
      });
    } catch (error) {
      handleFirestoreError(error, OperationType.UPDATE, `products/${product.id}`);
    }
  };

  // Delete transaction
  const handleDeleteSale = (tx: Transaction) => {
    setDeletingTx(tx);
  };

  const confirmDeleteSale = async () => {
    if (!deletingTx || !deletingTx.id || isDeleting) return;
    setIsDeleting(true);
    try {
      await deleteDoc(doc(db, 'transactions', deletingTx.id));
      if (lastTx && lastTx.id === deletingTx.id) {
        setLastTx(null);
      }
      setDeletingTx(null);
    } catch (error) {
      handleFirestoreError(error, OperationType.DELETE, `transactions/${deletingTx.id}`);
    } finally {
      setIsDeleting(false);
    }
  };

  // Edit transaction
  const handleStartEdit = (tx: Transaction) => {
    setEditingTx(tx);
    const cleanDesc = tx.description.startsWith('Direct Sale: ') 
      ? tx.description.substring(13) 
      : tx.description;
    setEditDesc(cleanDesc);
    setEditAmount(tx.amount.toString());
    
    if (tx.timestamp) {
      const d = new Date(tx.timestamp);
      setEditDate(format(d, 'yyyy-MM-dd'));
      setEditTime(format(d, 'HH:mm'));
    } else {
      const now = new Date();
      setEditDate(format(now, 'yyyy-MM-dd'));
      setEditTime(format(now, 'HH:mm'));
    }
  };

  const handleSaveEdit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingTx || !editingTx.id || isSavingEdit) return;
    
    setIsSavingEdit(true);
    try {
      const amount = parseFloat(editAmount);
      const originalTime = editTime || '12:00';
      const updatedTimestamp = new Date(`${editDate}T${originalTime}:00`).toISOString();
      
      const txRef = doc(db, 'transactions', editingTx.id);
      await updateDoc(txRef, {
        description: `Direct Sale: ${editDesc}`,
        amount,
        timestamp: updatedTimestamp
      });
      
      if (lastTx && lastTx.id === editingTx.id) {
        setLastTx({
          ...lastTx,
          description: `Direct Sale: ${editDesc}`,
          amount,
          timestamp: updatedTimestamp
        });
      }
      
      setEditingTx(null);
    } catch (error) {
      handleFirestoreError(error, OperationType.UPDATE, `transactions/${editingTx.id}`);
    } finally {
      setIsSavingEdit(false);
    }
  };

  // Open Document Preview Modal & prefill email/phone state
  const openDocumentPreview = (tx: Transaction, type: 'receipt' | 'invoice' = 'receipt') => {
    setPreviewDoc({ tx, type });
    setModalEmailInput(tx.customerEmail || '');
    setModalPhoneInput(tx.customerPhone || '');
    setEmailActionFeedback(null);
    setIsCopied(false);
  };

  // Formats clean, structured receipt text for Email, WhatsApp, and Clipboard
  const generateReceiptSummaryText = (tx: Transaction, type: 'receipt' | 'invoice' = 'receipt') => {
    const title = type === 'receipt' ? 'OFFICIAL RECEIPT' : 'TAX INVOICE';
    const docRef = getTransactionDocRef(tx, type, recentSales);
    const dateStr = (() => {
      try {
        return tx.timestamp ? format(new Date(tx.timestamp), 'dd MMM yyyy, hh:mm a') : format(new Date(), 'dd MMM yyyy, hh:mm a');
      } catch {
        return format(new Date(), 'dd MMM yyyy, hh:mm a');
      }
    })();
    const branchName = tx.location === 'BM' ? 'Machang Bubok (BM)' : 'Penang Studio (PG)';
    const itemDesc = (tx.description || '').replace('Direct Sale: ', '');
    const qty = tx.quantity || 1;
    const unitPrice = tx.unitPrice ? tx.unitPrice.toFixed(2) : (tx.amount / qty).toFixed(2);
    const total = tx.amount.toFixed(2);
    const customer = tx.customerName || 'Valued Customer';

    return `==============================
NENDOA STUDIO ENTERPRISE
SSM Reg No: 202403185935 (PG0558602-T)
214, Lebuh Victoria, 10300 Georgetown, Pulau Pinang
Email: hello@nendoastudio.com | WhatsApp: +60 12-889 2030
==============================
${title}
Document No : ${docRef}
Date & Time : ${dateStr}
Customer    : ${customer}
Status      : ${type === 'invoice' ? 'PAYMENT DUE' : 'PAID IN FULL'}
------------------------------
ITEM BREAKDOWN:
• ${itemDesc}
  Qty: ${qty} | Unit Price: RM ${unitPrice}
  Line Total: RM ${total}
------------------------------
SUBTOTAL   : RM ${total}
${type === 'invoice' ? 'TOTAL DUE  ' : 'TOTAL PAID '} : RM ${total}
==============================
Thank you for supporting handcrafted ceramic pottery at Nendoa Studio!
For inquiries or questions, contact hello@nendoastudio.com.`;
  };

  // Trigger Email Receipt via Direct Business SMTP API (with Mailto fallback)
  const handleSendEmailReceipt = async (tx: Transaction, type: 'receipt' | 'invoice' = 'receipt', overrideEmail?: string) => {
    const targetEmail = overrideEmail || modalEmailInput || tx.customerEmail || '';
    if (!targetEmail.trim() || !targetEmail.includes('@')) {
      alert('Please enter a valid customer email address (e.g. name@example.com).');
      return;
    }

    setIsSendingEmail(true);
    setEmailActionFeedback('Dispatching email from studio...');

    try {
      // If email was entered/updated and transaction exists in Firestore, persist email to transaction
      if (tx.id && targetEmail.trim() !== (tx.customerEmail || '')) {
        try {
          await updateDoc(doc(db, 'transactions', tx.id), { customerEmail: targetEmail.trim() });
        } catch {
          // Non-blocking update
        }
      }

      const docRef = getTransactionDocRef(tx, type, recentSales);
      // Generate branded HTML and text for product sale
      const { subject, html, text } = generateProductSaleReceiptEmail({
        customerName: tx.customerName || 'Valued Customer',
        customerEmail: targetEmail.trim(),
        customerPhone: tx.customerPhone,
        itemsDescription: tx.description ? tx.description.replace('Direct Sale: ', '') : 'Handcrafted Ceramics',
        quantity: tx.quantity || 1,
        unitPrice: tx.unitPrice,
        totalAmount: tx.amount,
        paymentDate: tx.timestamp ? format(new Date(tx.timestamp), 'dd MMM yyyy') : undefined,
        transactionRef: docRef,
        location: tx.location,
        type: type,
      });

      // Generate official PDF receipt attachment
      let pdfAttachment: any = undefined;
      try {
        const pdfBase64 = generateTransactionReceiptPdfBase64(tx, type, docRef, recentSales);
        const filename = `${type === 'invoice' ? 'Tax-Invoice' : 'Official-Receipt'}-${docRef.replace(/[^A-Za-z0-9-_]/g, '')}.pdf`;
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
        templateType: 'sale_receipt',
        customerName: tx.customerName || 'Customer',
        transactionId: tx.id,
        attachments: pdfAttachment ? [pdfAttachment] : undefined,
      });

      if (result.success) {
        setEmailActionFeedback(`✓ Official ${type === 'invoice' ? 'Invoice' : 'Receipt'} PDF & email sent to ${targetEmail.trim()}!`);
      } else {
        console.warn('API send failed, launching mailto fallback:', result.error);
        const mailtoUrl = `mailto:${encodeURIComponent(targetEmail.trim())}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(text)}`;
        window.location.href = mailtoUrl;
        setEmailActionFeedback('✓ Mail client opened with prefilled receipt!');
      }
    } catch (err) {
      console.error('Error sending receipt email:', err);
      const title = type === 'receipt' ? 'Official Receipt' : 'Tax Invoice';
      const docRef = tx.id ? `#${tx.id.slice(-8).toUpperCase()}` : '';
      const subject = `${title} from NENDOA STUDIO ENTERPRISE ${docRef}`.trim();
      const body = generateReceiptSummaryText(tx, type);
      const mailtoUrl = `mailto:${encodeURIComponent(targetEmail.trim())}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
      window.location.href = mailtoUrl;
      setEmailActionFeedback('✓ Mail client opened with prefilled receipt!');
    } finally {
      setIsSendingEmail(false);
      setTimeout(() => setEmailActionFeedback(null), 6000);
    }
  };

  // Trigger WhatsApp Receipt
  const handleSendWhatsAppReceipt = (tx: Transaction, type: 'receipt' | 'invoice' = 'receipt', overridePhone?: string) => {
    const phone = overridePhone || modalPhoneInput || tx.customerPhone || '';
    const cleanPhone = phone.replace(/[^0-9]/g, '');
    const text = generateReceiptSummaryText(tx, type);
    const waUrl = cleanPhone 
      ? `https://api.whatsapp.com/send?phone=${cleanPhone.startsWith('60') ? cleanPhone : cleanPhone.startsWith('0') ? '6' + cleanPhone : cleanPhone}&text=${encodeURIComponent(text)}`
      : `https://api.whatsapp.com/send?text=${encodeURIComponent(text)}`;
    window.open(waUrl, '_blank');
    setEmailActionFeedback('✓ WhatsApp opened with prefilled receipt!');
    setTimeout(() => setEmailActionFeedback(null), 4000);
  };

  // Copy Clean Receipt Text
  const handleCopyReceiptText = async (tx: Transaction, type: 'receipt' | 'invoice' = 'receipt') => {
    const text = generateReceiptSummaryText(tx, type);
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

  // Document generators (Receipt / Invoice)
  const generateDocument = (type: 'receipt' | 'invoice', tx?: Transaction) => {
    const targetTx = tx || lastTx;
    if (!targetTx) return;
    const printWindow = window.open('', '_blank');
    if (!printWindow) return;

    const docTitle = type === 'invoice' ? 'Tax Invoice' : 'Official Receipt';
    const accent = type === 'invoice' ? '#2D241E' : '#8B9A82';
    const ref = targetTx.id ? `#${targetTx.id.slice(-8).toUpperCase()}` : '#SALE';
    const dateStr = (() => {
      try {
        return format(new Date(targetTx.timestamp), 'dd MMM yyyy, hh:mm a');
      } catch {
        return format(new Date(), 'dd MMM yyyy, hh:mm a');
      }
    })();
    const itemDesc = (targetTx.description || '').replace('Direct Sale: ', '');
    const qty = targetTx.quantity || 1;
    const unitPrice = targetTx.unitPrice ? targetTx.unitPrice : (targetTx.amount / qty);

    printWindow.document.write(`
      <!DOCTYPE html>
      <html>
        <head>
          <title>${docTitle} - ${ref}</title>
          <meta charset="utf-8" />
          <link href="https://fonts.googleapis.com/css2?family=Cormorant+Garamond:ital,wght@1,700&family=Inter:wght@400;500;600;700&display=swap" rel="stylesheet">
          <style>
            * { box-sizing: border-box; }
            body { 
              font-family: 'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; 
              padding: 36px 12px; 
              color: #2D241E; 
              line-height: 1.6; 
              background-color: #FAF4F0;
              margin: 0;
            }
            .action-bar {
              max-width: 580px;
              margin: 0 auto 20px auto;
              display: flex;
              justify-content: space-between;
              align-items: center;
              padding: 12px 18px;
              background: #FFFFFF;
              border: 1px solid #D9D1C7;
              border-radius: 12px;
              box-shadow: 0 2px 10px rgba(0,0,0,0.03);
            }
            .btn-print {
              background: #2D241E;
              color: #fff;
              border: none;
              padding: 8px 18px;
              border-radius: 8px;
              font-size: 12px;
              font-weight: 700;
              cursor: pointer;
              letter-spacing: 0.5px;
            }
            .btn-print:hover {
              background: #4A3F35;
            }
            .receipt-card {
              max-width: 580px;
              margin: 0 auto;
              background-color: #FFFFFF;
              border-radius: 16px;
              border: 1px solid #D9D1C7;
              box-shadow: 0 6px 28px rgba(45, 36, 30, 0.07);
              padding: 36px 30px;
            }
            .header { text-align: center; border-bottom: 1.5px dashed #D9D1C7; padding-bottom: 24px; margin-bottom: 24px; }
            .doc-title { font-family: 'Inter', -apple-system, sans-serif; text-transform: uppercase; letter-spacing: 1px; font-size: 24px; margin: 0 0 6px 0; color: ${accent}; font-weight: 900; }
            .studio-title { text-transform: uppercase; letter-spacing: 3px; font-size: 11px; font-weight: 800; color: #2D241E; margin: 6px 0 3px 0; }
            .ssm { font-size: 9.5px; font-weight: 600; color: #8C8379; letter-spacing: 0.5px; margin: 0; }
            .address { font-size: 9px; color: #8C8379; margin: 6px 0 0 0; line-height: 1.5; text-transform: uppercase; letter-spacing: 0.3px; }
            
            .meta-table { width: 100%; border-collapse: collapse; margin-bottom: 24px; font-size: 12px; }
            .meta-box h4 { text-transform: uppercase; font-size: 8.5px; letter-spacing: 1px; color: #8C8379; margin: 0 0 3px 0; font-weight: 800; }
            .meta-box p { margin: 0 0 4px 0; color: #2D241E; font-size: 13px; font-weight: 700; }
            .paid-stamp { display: inline-block; border: 1.5px solid #10B981; color: #065F46; background: #ECFDF5; padding: 4px 10px; border-radius: 6px; font-size: 9.5px; font-weight: 800; letter-spacing: 1.2px; text-transform: uppercase; margin-top: 6px; }
            
            .item-table { width: 100%; border-collapse: collapse; margin: 24px 0; font-size: 12px; }
            .item-table th { background: transparent; padding: 10px 4px; font-size: 9px; text-transform: uppercase; letter-spacing: 1px; color: #8C8379; border-top: 1px solid #D9D1C7; border-bottom: 1px solid #D9D1C7; font-weight: 800; text-align: left; }
            .item-table td { padding: 12px 4px; border-bottom: 1px solid #E6E1DA; font-size: 12px; color: #2D241E; }
            
            .footer { margin-top: 28px; text-align: center; font-size: 9.5px; color: #A69D94; border-top: 1.5px dashed #D9D1C7; padding-top: 20px; line-height: 1.6; }
            @media print { 
              body { padding: 0; background: #fff; } 
              .no-print { display: none !important; }
              .receipt-card { border: none; padding: 0; box-shadow: none; }
            }
          </style>
        </head>
        <body>
          <div class="action-bar no-print">
            <span style="font-size: 12px; color: #8C8379;">Document ready to print</span>
            <button class="btn-print" onclick="window.print()">Print Document</button>
          </div>

          <div class="receipt-card">
            <div class="header">
              <h1 class="doc-title">${docTitle}</h1>
              <p class="studio-title">NENDOA STUDIO ENTERPRISE</p>
              <p class="ssm">SSM Reg No: 202403185935 (PG0558602-T)</p>
              <p class="address">214, Lebuh Victoria,<br/>10300 Georgetown, Pulau Pinang</p>
            </div>
            
            <table class="meta-table">
              <tr>
                <td class="meta-box" style="vertical-align: top; width: 55%;">
                  <h4>${type === 'invoice' ? 'Bill To / Customer' : 'Sold To / Customer'}</h4>
                  <p>${targetTx.customerName || 'Walk-in Customer'}</p>
                  ${targetTx.customerEmail ? `<div style="font-size: 10px; color: #8C8379; font-family: monospace;">${targetTx.customerEmail}</div>` : ''}
                  ${targetTx.customerPhone ? `<div style="font-size: 10px; color: #8C8379; font-family: monospace;">${targetTx.customerPhone}</div>` : ''}
                </td>
                <td class="meta-box" style="vertical-align: top; text-align: right; width: 45%;">
                  <h4>${docTitle} Ref</h4>
                  <p style="font-family: monospace; font-size: 12.5px; color: #2D241E;">${ref}</p>
                  <h4 style="margin-top: 8px;">Date & Time</h4>
                  <div style="font-size: 11px; font-weight: 600; color: #2D241E;">${dateStr}</div>
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
                <tr>
                  <td>
                    <strong>${itemDesc}</strong>
                  </td>
                  <td style="text-align: center; font-family: monospace;">${qty}</td>
                  <td style="text-align: right; font-family: monospace; color: #8C8379;">${unitPrice.toFixed(2)}</td>
                  <td style="text-align: right; font-weight: 700; font-family: monospace;">RM ${targetTx.amount.toFixed(2)}</td>
                </tr>
              </tbody>
            </table>

            <div style="text-align: right; margin-top: 16px; margin-bottom: 24px;">
              <table style="display: inline-table; width: 260px; font-size: 12px; border-collapse: collapse; border: none;">
                <tr>
                  <td style="color: #8C8379; padding: 4px 0;">Subtotal</td>
                  <td style="text-align: right; font-family: monospace; color: #2D241E; padding: 4px 0;">RM ${targetTx.amount.toFixed(2)}</td>
                </tr>
                <tr style="border-top: 1px solid #D9D1C7;">
                  <td style="font-size: 10px; font-weight: 800; text-transform: uppercase; letter-spacing: 1px; color: #2D241E; padding-top: 10px;">${type === 'invoice' ? 'Total Due' : 'Grand Total Paid'}</td>
                  <td style="text-align: right; font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace; font-size: 18px; font-weight: 800; color: ${accent}; padding-top: 10px;">RM ${targetTx.amount.toFixed(2)}</td>
                </tr>
              </table>
            </div>

            <div class="footer">
              <p style="margin: 0 0 4px 0;">Email: hello@nendoastudio.com | WhatsApp: +60 12-889 2030</p>
              <p style="margin: 0 0 4px 0; font-style: italic; color: #8C8379;">
                Thank you for supporting handcrafted ceramic pottery.
              </p>
              <p style="margin: 0; font-weight: 700; text-transform: uppercase; letter-spacing: 0.5px;">
                NENDOA STUDIO ENTERPRISE &bull; Computer Generated ${docTitle}
              </p>
            </div>
          </div>
        </body>
      </html>
    `);
    printWindow.document.close();
  };

  const exportToCSV = () => {
    if (recentSales.length === 0) return;
    
    const headers = ['Ref', 'Date', 'Description', 'Customer', 'Branch', 'Amount (RM)'];
    const rows = recentSales.map(tx => [
      tx.id?.slice(-8).toUpperCase(),
      format(new Date(tx.timestamp), 'yyyy-MM-dd HH:mm'),
      tx.description.replace('Direct Sale: ', ''),
      tx.customerName || 'Walk-in',
      tx.location,
      tx.amount.toFixed(2)
    ]);

    const csvContent = [
      headers.join(','),
      ...rows.map(row => row.map(cell => `"${cell}"`).join(','))
    ].join('\n');

    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement('a');
    const url = URL.createObjectURL(blob);
    link.setAttribute('href', url);
    link.setAttribute('download', `Studio_Ledger_${months[selectedMonth]}_${selectedYear}.csv`);
    link.style.visibility = 'hidden';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const printBulk = (type: 'receipt' | 'invoice') => {
    const printWindow = window.open('', '_blank');
    if (!printWindow) return;

    const docHTML = (tx: Transaction) => {
      const title = type === 'receipt' ? 'Receipt' : 'Invoice';
      const accent = type === 'receipt' ? '#8B9A82' : '#2D241E';
      return `
        <div class="page" style="page-break-after: always; padding: 60px; font-family: 'Inter', sans-serif; max-width: 800px; margin: auto;">
          <div style="text-align: center; border-bottom: 2px solid #EEE; padding-bottom: 30px; margin-bottom: 30px;">
            <h1 style="font-family: 'Inter', sans-serif; text-transform: uppercase; letter-spacing: 1px; color: ${accent}; font-size: 24px; font-weight: 900; margin: 0;">${title}</h1>
            <p style="text-transform: uppercase; letter-spacing: 4px; font-size: 9px; font-weight: 800; color: #8C8379; margin: 8px 0 4px 0;">NENDOA STUDIO ENTERPRISE</p>
            <p style="font-size: 9px; letter-spacing: 1px; font-weight: 700; color: #A69D94; margin: 0 0 8px 0;">Reg No: 202403185935 (PG0558602-T)</p>
            <p style="font-size: 8.5px; color: #A69D94; font-weight: 500; line-height: 1.5; letter-spacing: 0.5px; max-width: 500px; margin: 0 auto; text-transform: uppercase;">214, Lebuh Victoria,<br/>10300 Georgetown, Pulau Pinang</p>
          </div>
          <div style="display: flex; justify-content: space-between; margin-bottom: 30px; font-size: 11px;">
            <div>
              <h4 style="text-transform: uppercase; font-size: 9px; color: #8C8379; margin: 0 0 5px 0;">Customer</h4>
              <p style="margin: 0; font-weight: 700;">${tx.customerName}</p>
            </div>
            <div style="text-align: right">
              <h4 style="text-transform: uppercase; font-size: 9px; color: #8C8379; margin: 0 0 5px 0;">Number</h4>
              <p style="margin: 0; font-family: monospace;">#${tx.id?.slice(-8).toUpperCase()}</p>
              <h4 style="text-transform: uppercase; font-size: 9px; color: #8C8379; margin: 10px 0 5px 0;">Date</h4>
              <p style="margin: 0;">${new Date(tx.timestamp).toLocaleDateString()}</p>
            </div>
          </div>
          <table style="width: 100%; border-collapse: collapse; margin-bottom: 30px;">
            <thead>
              <tr style="background: #F9F8F6;">
                <th style="text-align: left; padding: 12px; font-size: 10px; text-transform: uppercase; color: #8C8379;">Description</th>
                <th style="text-align: right; padding: 12px; font-size: 10px; text-transform: uppercase; color: #8C8379;">Amount (MYR)</th>
              </tr>
            </thead>
            <tbody>
              <tr>
                <td style="padding: 12px; border-bottom: 1px solid #EEE; font-size: 12px;">${tx.description.replace('Direct Sale: ', '')}</td>
                <td style="text-align: right; padding: 12px; border-bottom: 1px solid #EEE; font-weight: 700; font-size: 12px;">RM${tx.amount.toFixed(2)}</td>
              </tr>
            </tbody>
          </table>
          <div style="text-align: right">
            <div style="background: #FAF9F6; padding: 15px 30px; border-radius: 15px; display: inline-block;">
              <span style="font-size: 10px; color: #8C8379; display: block; text-transform: uppercase;">${type === 'invoice' ? 'Total Due' : 'Total Paid'}</span>
              <span style="font-family: monospace; font-size: 20px; color: ${accent}; font-weight: bold;">RM${tx.amount.toFixed(2)}</span>
            </div>
          </div>
          <div style="margin-top: 50px; text-align: center; font-size: 9px; color: #A69D94; border-top: 1px solid #EEE; padding-top: 20px;">
            <p>Thank you for supporting Malaysian craft.</p>
            <p>Computer Generated - No Signature Required</p>
          </div>
        </div>
      `;
    };

    printWindow.document.write(`
      <html>
        <head>
          <title>Bulk ${type === 'receipt' ? 'Receipts' : 'Invoices'}</title>
          <link href="https://fonts.googleapis.com/css2?family=Cormorant+Garamond:ital,wght@1,700&family=Inter:wght@400;700&display=swap" rel="stylesheet">
          <style>
            @media print { .page { page-break-after: always; } .no-print { display: none !important; } }
            .action-bar { padding: 16px; background: #FAF9F6; border-bottom: 1px solid #EEE; text-align: right; }
            .btn-print { background: #2D241E; color: #fff; border: none; padding: 8px 16px; border-radius: 8px; font-weight: 700; cursor: pointer; font-size: 12px; }
          </style>
        </head>
        <body style="margin: 0; padding: 0;">
          <div class="action-bar no-print">
            <button class="btn-print" onclick="window.print()">Print Documents</button>
          </div>
          ${recentSales.map(tx => docHTML(tx)).join('')}
        </body>
      </html>
    `);
    printWindow.document.close();
  };

  return (
    <div className="max-w-6xl mx-auto space-y-8 pb-12">
      {/* Top Header */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 px-2">
        <div>
          <div className="flex items-center gap-2">
            <ShoppingBag className="w-5 h-5 text-[var(--accent-primary)]" />
            <h2 className="text-2xl font-serif italic text-[#2D241E]">Product Sales</h2>
          </div>
        </div>
      </div>

      {/* Success Notification Banner */}
      <AnimatePresence>
        {successMessage && (
          <motion.div
            initial={{ opacity: 0, y: -10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -10 }}
            className="p-4 bg-emerald-50 border border-emerald-200 text-emerald-800 rounded-2xl flex items-center justify-between shadow-sm"
          >
            <div className="flex items-center gap-3">
              <div className="w-8 h-8 rounded-full bg-emerald-100 flex items-center justify-center text-emerald-700">
                <Check size={16} />
              </div>
              <span className="text-xs font-bold">{successMessage}</span>
            </div>
            <div className="flex items-center gap-2">
              {lastTx && (
                <button
                  type="button"
                  onClick={() => openDocumentPreview(lastTx, 'receipt')}
                  className="px-3.5 py-1.5 bg-emerald-700 hover:bg-emerald-800 text-white rounded-xl text-[10px] font-black uppercase tracking-wider transition-all flex items-center gap-1.5 shadow-xs"
                  title="Email / View Digital Receipt"
                >
                  <Mail size={13} />
                  <span>Email / View Receipt</span>
                </button>
              )}
              <button
                type="button"
                onClick={() => setSuccessMessage(null)}
                className="p-1 text-emerald-700 hover:text-emerald-900 rounded-lg hover:bg-emerald-100 transition-colors"
                title="Dismiss"
              >
                <X size={14} />
              </button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Section 1: Ready-Sale Products Catalog & Category Browser */}
      <div className="bg-white border-2 border-[#D9D1C7]/30 rounded-[32px] overflow-hidden shadow-sm p-6 space-y-6">
        <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 border-b border-[#F2EFE9] pb-4">
          <div>
            <div className="flex items-center gap-2">
              <Package className="w-4 h-4 text-[#8C8379]" />
              <h3 className="text-sm font-black uppercase text-[#2D241E] tracking-widest">Ready Sale Catalog</h3>
            </div>
            <p className="text-[10px] text-[#8C8379] mt-0.5">
              Click a product to select it and manually record how much you sell
            </p>
          </div>

          <div className="flex items-center gap-2 w-full md:w-auto">
            {/* Search */}
            <div className="relative w-full sm:w-64">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-[#A69D94] w-3.5 h-3.5" />
              <input
                type="text"
                placeholder="Search piece or SKU..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full pl-9 pr-3 py-2 bg-[#FAF9F6] border border-[#D9D1C7]/40 rounded-xl text-xs outline-none focus:border-[var(--accent-primary)] focus:bg-white transition-all"
              />
              {searchQuery && (
                <button 
                  onClick={() => setSearchQuery('')}
                  className="absolute right-2.5 top-1/2 -translate-y-1/2 text-[#8C8379] hover:text-[#2D241E]"
                >
                  <X size={12} />
                </button>
              )}
            </div>
          </div>
        </div>

        {/* Category Filters */}
        <div className="flex items-center gap-1.5 overflow-x-auto pb-2 scrollbar-none">
          <button
            onClick={() => setSelectedCategory('ALL')}
            className={`px-3.5 py-1.5 rounded-xl text-[10px] font-black uppercase tracking-wider whitespace-nowrap transition-all flex items-center gap-1.5 ${
              selectedCategory === 'ALL'
                ? 'bg-[#2D241E] text-white shadow-xs'
                : 'bg-[#FAF9F6] text-[#8C8379] hover:bg-[#F2EFE9] hover:text-[#2D241E] border border-[#D9D1C7]/30'
            }`}
          >
            <span>All Categories</span>
            <span className="text-[9px] opacity-70 px-1 py-0.2 bg-white/20 rounded-md">{saleProducts.length}</span>
          </button>

          {availableCategories.map(cat => {
            const count = saleProducts.filter(p => (p.productCategory || 'General') === cat).length;
            if (count === 0 && selectedCategory !== cat) return null;
            return (
              <button
                key={cat}
                onClick={() => setSelectedCategory(cat)}
                className={`px-3.5 py-1.5 rounded-xl text-[10px] font-black uppercase tracking-wider whitespace-nowrap transition-all flex items-center gap-1.5 ${
                  selectedCategory === cat
                    ? 'bg-[var(--accent-primary)] text-white shadow-xs'
                    : 'bg-[#FAF9F6] text-[#8C8379] hover:bg-[#F2EFE9] hover:text-[#2D241E] border border-[#D9D1C7]/30'
                }`}
              >
                <span>{cat}</span>
                <span className="text-[9px] opacity-70 px-1.5 py-0.2 bg-black/10 rounded-md">{count}</span>
              </button>
            );
          })}
        </div>

        {/* Product Cards Grid */}
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-3.5">
          {/* Catalog Ready Products */}
          {filteredCatalogProducts.map(product => {
            const isSelected = selectedProduct?.id === product.id;
            const stock = Number(product.stock || 0);
            return (
              <div
                key={product.id}
                onClick={() => handleSelectProduct(product)}
                className={`p-3.5 rounded-2xl border-2 cursor-pointer transition-all flex flex-col justify-between gap-2.5 relative group min-h-[140px] ${
                  isSelected
                    ? 'border-[var(--accent-primary)] bg-[var(--accent-primary)]/5 shadow-md ring-2 ring-[var(--accent-primary)]/20'
                    : 'border-[#D9D1C7]/30 hover:border-[var(--accent-primary)] bg-white shadow-2xs'
                }`}
              >
                {/* Header with category tag & SKU */}
                <div className="flex justify-between items-start gap-1">
                  <span className="text-[8px] font-black uppercase tracking-wider text-[#8C8379] truncate max-w-[85px]" title={product.productCategory || 'Ready Sale'}>
                    {product.productCategory || 'Ready Sale'}
                  </span>
                  {product.sku && (
                    <span className="text-[7px] font-mono font-bold bg-[#FAF9F6] text-[#8C8379] border border-[#D9D1C7]/40 px-1 py-0.5 rounded">
                      {product.sku}
                    </span>
                  )}
                </div>

                {/* Product Name */}
                <div>
                  <h4 className="font-serif italic font-bold text-xs text-[#2D241E] line-clamp-2 leading-snug" title={product.name}>
                    {product.name}
                  </h4>
                </div>

                {/* Bottom: Price & Stock Status */}
                <div className="pt-2 border-t border-[#F2EFE9] flex items-end justify-between gap-1 mt-auto">
                  <div>
                    <span className="text-[7px] font-black uppercase tracking-tighter text-[#A69D94] block">Ref Price</span>
                    <span className="font-mono text-xs font-black text-[#2D241E]">
                      RM{Number(product.price || 0).toFixed(2)}
                    </span>
                  </div>

                  {/* Stock pill with quick + / - on hover */}
                  <div className="flex items-center gap-1">
                    <span className={`text-[8px] font-black uppercase tracking-tighter px-2 py-0.5 rounded-lg ${
                      stock > 5 ? 'bg-emerald-50 text-emerald-700 border border-emerald-200' :
                      stock > 0 ? 'bg-amber-50 text-amber-700 border border-amber-200' :
                      'bg-red-50 text-red-600 border border-red-200'
                    }`}>
                      {stock} in stock
                    </span>
                  </div>
                </div>

                {/* Quick select indicator */}
                {isSelected && (
                  <div className="absolute top-2 right-2 w-4 h-4 bg-[var(--accent-primary)] text-white rounded-full flex items-center justify-center">
                    <Check size={10} strokeWidth={3} />
                  </div>
                )}
              </div>
            );
          })}
        </div>

        {/* Empty catalog notice */}
        {filteredCatalogProducts.length === 0 && (
          <div className="text-center py-12 bg-[#FAF9F6] rounded-2xl border border-dashed border-[#D9D1C7]/50 space-y-2">
            <PackageOpen className="w-8 h-8 text-[#A69D94] mx-auto opacity-50" />
            <p className="text-xs font-serif italic text-[#2D241E]">No ready products in this category yet</p>
            <button
              onClick={() => {
                setStockModalTab('add_new');
                if (selectedCategory !== 'ALL') setNewCategory(selectedCategory);
                setIsStockModalOpen(true);
              }}
              className="text-[9px] font-black uppercase tracking-wider text-[var(--accent-primary)] hover:underline inline-flex items-center gap-1"
            >
              <Plus size={12} />
              <span>Upload Ready Products for {selectedCategory === 'ALL' ? 'Sale' : selectedCategory}</span>
            </button>
          </div>
        )}
      </div>

      {/* Section 2: Sale Checkout & Recording Station */}
      <div className="bg-white border-2 border-[#D9D1C7]/30 rounded-[32px] overflow-hidden shadow-sm">
        <div className="p-6 bg-[#FAF9F6] border-b border-[#F2EFE9] flex flex-col md:flex-row justify-between items-start md:items-center gap-2">
          <div>
            <h3 className="text-sm font-black uppercase text-[#2D241E] tracking-widest flex items-center gap-2">
              <span>Sale Checkout Station</span>
              {selectedProduct ? (
                <span className="text-[9px] font-mono px-2 py-0.5 bg-[var(--accent-primary)] text-white rounded-md uppercase">
                  Product Linked: {selectedProduct.name}
                </span>
              ) : (
                <span className="text-[9px] font-mono px-2 py-0.5 bg-[#8C8379] text-white rounded-md uppercase">
                  Manual Custom Sale
                </span>
              )}
            </h3>
            <p className="text-[10px] text-[#8C8379] mt-0.5">
              Record sold quantity and adjust the final selling price manually as needed
            </p>
          </div>

          {/* Mode switch */}
          <div className="flex bg-white p-1 rounded-xl border border-[#D9D1C7]/30 gap-1">
            <button
              type="button"
              onClick={() => {
                setSaleMode('catalog');
                if (saleProducts.length > 0 && !selectedProduct) {
                  handleSelectProduct(saleProducts[0]);
                }
              }}
              className={`px-3 py-1 rounded-lg text-[9px] font-black uppercase tracking-wider transition-all ${
                saleMode === 'catalog' && selectedProduct
                  ? 'bg-[#2D241E] text-white'
                  : 'text-[#8C8379] hover:text-[#2D241E]'
              }`}
            >
              Catalog Item
            </button>
            <button
              type="button"
              onClick={() => {
                setSaleMode('manual');
                setSelectedProduct(null);
                setQuickSaleName('');
                setManualSalePrice('');
              }}
              className={`px-3 py-1 rounded-lg text-[9px] font-black uppercase tracking-wider transition-all ${
                saleMode === 'manual' || !selectedProduct
                  ? 'bg-[#2D241E] text-white'
                  : 'text-[#8C8379] hover:text-[#2D241E]'
              }`}
            >
              Manual / Custom Sale
            </button>
          </div>
        </div>

        <form onSubmit={handleRecordSale} className="p-6 space-y-6">
          <div className="grid grid-cols-1 md:grid-cols-12 gap-4">
            {/* Description / Product Name */}
            <div className="md:col-span-5 space-y-1.5">
              <label className="block text-[9px] font-black text-[#8C8379] uppercase tracking-wider">
                {selectedProduct ? 'Selected Ready-Sale Product' : 'Sale Item / Description'}
              </label>
              {selectedProduct ? (
                <div className="w-full bg-[#FAF9F6] border border-[#D9D1C7]/40 rounded-xl p-3 flex justify-between items-center">
                  <div>
                    <span className="text-xs font-serif italic font-bold text-[#2D241E] block">
                      {selectedProduct.name}
                    </span>
                    <span className="text-[8px] font-black uppercase tracking-wider text-[#8C8379]">
                      Category: {selectedProduct.productCategory || 'General'} • Available Stock: {selectedProduct.stock} units
                    </span>
                  </div>
                  <button
                    type="button"
                    onClick={() => {
                      setSelectedProduct(null);
                      setSaleMode('manual');
                      setQuickSaleName('');
                    }}
                    className="p-1.5 text-[#8C8379] hover:text-red-500 rounded-lg hover:bg-white transition-all"
                    title="Clear selected product"
                  >
                    <X size={14} />
                  </button>
                </div>
              ) : (
                <input
                  type="text"
                  placeholder="Ex: Speckled Mug, Glazed Pot, Custom Order..."
                  value={quickSaleName}
                  onChange={(e) => setQuickSaleName(e.target.value)}
                  className="w-full bg-[#FAF9F6] border border-[#D9D1C7]/40 rounded-xl px-3 py-2.5 text-xs focus:ring-1 focus:ring-[var(--accent-primary)] focus:bg-white outline-none transition-all"
                  required={saleMode === 'manual'}
                />
              )}
            </div>

            {/* Quantity Stepper */}
            <div className="md:col-span-2 space-y-1.5">
              <label className="block text-[9px] font-black text-[#8C8379] uppercase tracking-wider">
                Quantity Sold
              </label>
              <div className="flex items-center bg-[#FAF9F6] border border-[#D9D1C7]/40 rounded-xl overflow-hidden p-1">
                <button
                  type="button"
                  onClick={() => handleQuantityChange(saleQuantity - 1)}
                  className="w-7 h-7 flex items-center justify-center bg-white hover:bg-[#F2EFE9] text-[#2D241E] rounded-lg transition-all"
                >
                  <Minus size={12} />
                </button>
                <input
                  type="number"
                  min="1"
                  value={saleQuantity}
                  onChange={(e) => handleQuantityChange(parseInt(e.target.value) || 1)}
                  className="w-full text-center bg-transparent text-xs font-mono font-bold text-[#2D241E] outline-none"
                />
                <button
                  type="button"
                  onClick={() => handleQuantityChange(saleQuantity + 1)}
                  className="w-7 h-7 flex items-center justify-center bg-white hover:bg-[#F2EFE9] text-[#2D241E] rounded-lg transition-all"
                >
                  <Plus size={12} />
                </button>
              </div>
            </div>

            {/* Manual Sale Amount (RM) - Highlighted as requested */}
            <div className="md:col-span-3 space-y-1.5">
              <div className="flex justify-between items-center">
                <label className="block text-[9px] font-black text-[#8C8379] uppercase tracking-wider">
                  Total Sale Price (RM)
                </label>
                <span className="text-[8px] font-bold text-[var(--accent-primary)] uppercase">
                  Manual Entry Editable
                </span>
              </div>
              <div className="relative">
                <span className="absolute left-3 top-1/2 -translate-y-1/2 text-xs font-mono font-bold text-[#8C8379]">RM</span>
                <input
                  type="number"
                  step="0.01"
                  placeholder="0.00"
                  value={manualSalePrice}
                  onChange={(e) => setManualSalePrice(e.target.value)}
                  className="w-full bg-[#FAF9F6] border-2 border-[#D9D1C7] rounded-xl pl-10 pr-3 py-2 text-sm font-mono font-black text-[#2D241E] focus:border-[var(--accent-primary)] focus:bg-white outline-none transition-all"
                  required
                />
              </div>
            </div>

            {/* Sale Date */}
            <div className="md:col-span-2 space-y-1.5">
              <label className="block text-[9px] font-black text-[#8C8379] uppercase tracking-wider">
                Sale Date
              </label>
              <input
                type="date"
                value={saleDate}
                onChange={(e) => setSaleDate(e.target.value)}
                className="w-full bg-[#FAF9F6] border border-[#D9D1C7]/40 rounded-xl px-3 py-2 text-xs focus:ring-1 focus:ring-[var(--accent-primary)] outline-none"
                required
              />
            </div>
          </div>

          {/* Customer Details (Name, Email, WhatsApp) & Action Submit */}
          <div className="pt-4 border-t border-[#F2EFE9] space-y-4">
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              {/* Customer Name */}
              <div className="space-y-1">
                <label className="text-[9px] font-black uppercase tracking-wider text-[#8C8379] block">
                  Customer Name:
                </label>
                <input
                  type="text"
                  placeholder="Walk-in Customer (optional)"
                  value={customerName}
                  onChange={(e) => setCustomerName(e.target.value)}
                  className="w-full bg-[#FAF9F6] border border-[#D9D1C7]/40 rounded-xl px-3 py-2 text-xs outline-none focus:border-[var(--accent-primary)] focus:bg-white transition-all"
                />
              </div>

              {/* Customer Email */}
              <div className="space-y-1">
                <div className="flex justify-between items-center">
                  <label className="text-[9px] font-black uppercase tracking-wider text-[#8C8379] block flex items-center gap-1">
                    <Mail size={10} className="text-[var(--accent-primary)]" />
                    <span>Customer Email:</span>
                  </label>
                  <span className="text-[8px] text-[#A69D94] font-medium">For e-Receipt</span>
                </div>
                <input
                  type="email"
                  placeholder="e.g. customer@gmail.com"
                  value={customerEmail}
                  onChange={(e) => setCustomerEmail(e.target.value)}
                  className="w-full bg-[#FAF9F6] border border-[#D9D1C7]/40 rounded-xl px-3 py-2 text-xs outline-none focus:border-[var(--accent-primary)] focus:bg-white transition-all"
                />
              </div>

              {/* Customer Phone / WhatsApp */}
              <div className="space-y-1">
                <div className="flex justify-between items-center">
                  <label className="text-[9px] font-black uppercase tracking-wider text-[#8C8379] block flex items-center gap-1">
                    <Smartphone size={10} className="text-emerald-600" />
                    <span>WhatsApp / Phone:</span>
                  </label>
                  <span className="text-[8px] text-[#A69D94] font-medium">Optional</span>
                </div>
                <input
                  type="tel"
                  placeholder="e.g. 012-345 6789"
                  value={customerPhone}
                  onChange={(e) => setCustomerPhone(e.target.value)}
                  className="w-full bg-[#FAF9F6] border border-[#D9D1C7]/40 rounded-xl px-3 py-2 text-xs outline-none focus:border-[var(--accent-primary)] focus:bg-white transition-all"
                />
              </div>
            </div>

            {/* Sales Person (Closed By) & Payment Method */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 pt-3 border-t border-[#F2EFE9]">
              {/* Person who closed the sales */}
              <div className="space-y-1.5">
                <label className="text-[9px] font-black uppercase tracking-wider text-[#8C8379] block">
                  Sales Person (Closed By) *
                </label>
                {staffList.length > 0 ? (
                  <select
                    value={selectedStaffName}
                    onChange={(e) => setSelectedStaffName(e.target.value)}
                    className="w-full bg-[#FAF9F6] border border-[#D9D1C7]/40 rounded-xl px-3 py-2 text-xs font-semibold outline-none focus:border-[var(--accent-primary)] focus:bg-white transition-all"
                  >
                    {staffList.map((s) => (
                      <option key={s.id} value={s.name}>{s.name}</option>
                    ))}
                  </select>
                ) : (
                  <input
                    type="text"
                    placeholder="Staff name"
                    value={selectedStaffName}
                    onChange={(e) => setSelectedStaffName(e.target.value)}
                    className="w-full bg-[#FAF9F6] border border-[#D9D1C7]/40 rounded-xl px-3 py-2 text-xs outline-none focus:border-[var(--accent-primary)] focus:bg-white"
                  />
                )}
              </div>

              {/* Payment Method Selector */}
              <div className="space-y-1.5">
                <label className="text-[9px] font-black uppercase tracking-wider text-[#8C8379] block">
                  Payment Method *
                </label>
                <div className="grid grid-cols-4 gap-1.5">
                  {(['Cash', 'QR', 'Online transfer', 'Card'] as PaymentMethod[]).map((method) => {
                    const isSelected = selectedPaymentMethod === method;
                    return (
                      <button
                        key={method}
                        type="button"
                        onClick={() => setSelectedPaymentMethod(method)}
                        className={`py-2 px-1 text-center rounded-xl text-[10px] font-bold transition-all border ${
                          isSelected
                            ? 'bg-[#1C1917] text-white border-[#1C1917] shadow-xs'
                            : 'bg-[#FAF9F6] border-[#D9D1C7]/40 text-[#8C8379] hover:text-[#1C1917] hover:bg-white'
                        }`}
                      >
                        {method === 'Online transfer' ? 'Transfer' : method}
                      </button>
                    );
                  })}
                </div>
              </div>
            </div>

            {/* Bottom Form Actions */}
            <div className="flex flex-col sm:flex-row justify-between items-stretch sm:items-center gap-4 pt-2">
              <div className="flex items-center gap-3">
                {selectedProduct && Number(selectedProduct.stock || 0) < saleQuantity && (
                  <div className="flex items-center gap-1 text-[9px] text-amber-600 font-bold bg-amber-50 px-3 py-1.5 rounded-xl border border-amber-200">
                    <AlertCircle size={12} />
                    <span>Warning: Selling {saleQuantity} exceeds current stock ({selectedProduct.stock})</span>
                  </div>
                )}

                {/* Auto Preview Toggle Checkbox */}
                <label className="flex items-center gap-2 cursor-pointer text-[10px] font-semibold text-[#8C8379] select-none hover:text-[#2D241E] transition-colors py-1">
                  <input
                    type="checkbox"
                    checked={autoPreviewReceipt}
                    onChange={(e) => setAutoPreviewReceipt(e.target.checked)}
                    className="rounded border-[#D9D1C7] text-[var(--accent-primary)] focus:ring-[var(--accent-primary)] accent-[#8B9A82] w-3.5 h-3.5"
                  />
                  <span>Auto-show digital receipt modal</span>
                </label>
              </div>

              {/* Submit Buttons */}
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={(e) => handleRecordSale(e, false)}
                  disabled={isProcessing || !manualSalePrice || parseFloat(manualSalePrice) <= 0}
                  className="px-4 py-2.5 bg-white hover:bg-[var(--bg-subtle)] text-[var(--text-app)] border-2 border-[var(--border-app)] rounded-2xl text-xs font-black uppercase tracking-wider transition-all disabled:opacity-40 disabled:cursor-not-allowed shadow-xs"
                  title="Record direct sale without opening modal"
                >
                  Quick Record
                </button>

                <button
                  type="button"
                  onClick={(e) => handleRecordSale(e, true)}
                  disabled={isProcessing || !manualSalePrice || parseFloat(manualSalePrice) <= 0}
                  className="px-6 py-2.5 bg-[var(--btn-primary)] text-white hover:bg-[var(--btn-primary-hover)] rounded-2xl text-xs font-black uppercase tracking-widest shadow-md transition-all flex items-center justify-center gap-2 disabled:opacity-40 disabled:cursor-not-allowed min-w-[220px]"
                  title="Record sale and open digital receipt modal to email or review"
                >
                  {isProcessing ? (
                    <div className="w-4 h-4 border-2 border-white/20 border-t-white rounded-full animate-spin" />
                  ) : (
                    <>
                      <Receipt size={15} />
                      <span>
                        Record & View / Email Receipt {manualSalePrice ? `(RM ${parseFloat(manualSalePrice || '0').toFixed(2)})` : ''}
                      </span>
                    </>
                  )}
                </button>
              </div>
            </div>
          </div>
        </form>
      </div>

      {/* Section 3: Transaction History / Studio Ledger */}
      <div className="bg-white border-2 border-[#D9D1C7]/30 rounded-[32px] overflow-hidden shadow-sm">
        <div className="p-6 border-b border-[#F2EFE9] flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
          <div>
            <h3 className="text-sm font-black uppercase text-[#8C8379] tracking-widest">Transaction History & Ledger</h3>
            <p className="text-[10px] text-[#A69D94] font-medium">Recorded shop ledger entries for {months[selectedMonth]} {selectedYear}</p>
          </div>
          
          <div className="flex flex-wrap items-center gap-2">
            <div className="flex gap-1 bg-[#FAF9F6] p-1 rounded-xl border border-[#D9D1C7]/30">
              <Calendar size={12} className="text-[#8C8379] m-2" />
              <select 
                value={selectedMonth}
                onChange={(e) => setSelectedMonth(parseInt(e.target.value))}
                className="bg-transparent text-[10px] font-black uppercase tracking-widest text-[#8C8379] focus:outline-none cursor-pointer pr-2"
              >
                {months.map((m, i) => (
                  <option key={m} value={i}>{m}</option>
                ))}
              </select>
              <select 
                value={selectedYear}
                onChange={(e) => setSelectedYear(parseInt(e.target.value))}
                className="bg-transparent text-[10px] font-black uppercase tracking-widest text-[#8C8379] focus:outline-none cursor-pointer border-l border-[#D9D1C7]/20 pl-2 pr-1"
              >
                {years.map(y => (
                  <option key={y} value={y}>{y}</option>
                ))}
              </select>
            </div>

            <div className="flex gap-1">
              <button 
                onClick={exportToCSV}
                title="Download CSV"
                className="p-2 text-[#8C8379] hover:text-[#8B9A82] bg-[#FAF9F6] rounded-xl border border-[#D9D1C7]/30 hover:bg-white transition-all shadow-sm"
              >
                <Download size={14} />
              </button>
              <button 
                onClick={() => printBulk('receipt')}
                title="Bulk Receipts"
                className="p-2 text-[#8C8379] hover:text-[#8B9A82] bg-[#FAF9F6] rounded-xl border border-[#D9D1C7]/30 hover:bg-white transition-all shadow-sm"
              >
                <Receipt size={14} />
              </button>
              <button 
                onClick={() => printBulk('invoice')}
                title="Bulk Invoices"
                className="p-2 text-[#8C8379] hover:text-[#2D241E] bg-[#FAF9F6] rounded-xl border border-[#D9D1C7]/30 hover:bg-white transition-all shadow-sm"
              >
                <FileText size={14} />
              </button>
              {recentSales.length > 5 && (
                <button 
                  onClick={() => setShowAllTx(!showAllTx)}
                  className="text-[10px] font-black uppercase tracking-widest text-[#8C8379] hover:text-[#2D241E] px-4 py-2 bg-[#FAF9F6] rounded-xl border border-[#D9D1C7]/30"
                >
                  {showAllTx ? 'Show Less' : `See All (${recentSales.length})`}
                </button>
              )}
            </div>
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left">
            <thead>
              <tr className="bg-[var(--bg-header)] border-b border-[var(--border-app)] text-[9px] font-black uppercase tracking-widest text-[var(--text-header)]">
                <th className="px-6 py-4">Ref</th>
                <th className="px-6 py-4">Date</th>
                <th className="px-6 py-4">Customer</th>
                <th className="px-6 py-4 w-56">Description</th>
                <th className="px-4 py-4">Sales Person</th>
                <th className="px-4 py-4">Payment</th>
                <th className="px-6 py-4 text-right">Amount</th>
                <th className="px-6 py-4 text-center">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[var(--border-app)]/40">
              {(showAllTx ? recentSales : recentSales.slice(0, 5)).map(tx => (
                <tr key={tx.id} className="group hover:bg-[var(--bg-subtle)] transition-colors">
                  <td className="px-6 py-4 text-[10px] font-mono text-[#D9D1C7] uppercase">#{tx.id?.slice(-6)}</td>
                  <td className="px-6 py-4 text-[10px] font-mono text-[#8C8379]">
                    {(() => {
                      try {
                        return tx.timestamp ? format(new Date(tx.timestamp), 'dd MMM yyyy') : '---';
                      } catch {
                        return '---';
                      }
                    })()}
                  </td>
                  <td className="px-6 py-4">
                    <div className="flex flex-col">
                      <span className="text-xs font-medium text-[#2D241E]">
                        {tx.customerName || 'Walk-in Customer'}
                      </span>
                      {tx.customerEmail && (
                        <span className="text-[9px] text-[#8C8379] font-mono flex items-center gap-1 mt-0.5" title={tx.customerEmail}>
                          <Mail size={10} className="text-[var(--accent-primary)]" />
                          <span className="truncate max-w-[140px]">{tx.customerEmail}</span>
                        </span>
                      )}
                    </div>
                  </td>
                  <td className="px-6 py-4 w-56">
                    <span className="text-xs text-[#8C8379] block truncate font-medium" title={tx.description.replace('Direct Sale: ', '')}>
                      {tx.description.replace('Direct Sale: ', '')}
                    </span>
                  </td>
                  <td className="px-4 py-4">
                    <span className="text-xs font-semibold text-[#2D241E]">
                      {tx.staffName || '---'}
                    </span>
                  </td>
                  <td className="px-4 py-4">
                    <span className="inline-block px-2 py-0.5 rounded-md text-[10px] font-bold bg-[#FAF0EB] text-[#C85A32]">
                      {tx.paymentMethod || 'Cash'}
                    </span>
                  </td>
                  <td className="px-6 py-4 text-right">
                    <span className="font-mono text-sm font-black text-[#2D241E]">RM{tx.amount.toFixed(2)}</span>
                  </td>
                  <td className="px-6 py-4">
                    <div className="flex justify-center items-center gap-1">
                      <button 
                        onClick={() => handleDownloadPosPdf(tx, 'invoice')}
                        className="p-2 text-[#8C8379] hover:text-[#2D241E] hover:bg-white rounded-xl transition-all"
                        title="Download Tax Invoice (PDF)"
                      >
                        <FileText size={14} />
                      </button>
                      <button 
                        onClick={() => handleDownloadPosPdf(tx, 'receipt')}
                        className="p-2 text-[#8C8379] hover:text-[#8B9A82] hover:bg-white rounded-xl transition-all"
                        title="Download Official Receipt (PDF)"
                      >
                        <Receipt size={14} />
                      </button>
                      <button 
                        onClick={() => openDocumentPreview(tx, 'receipt')}
                        className="p-2 text-[#8C8379] hover:text-[var(--accent-primary)] hover:bg-white rounded-xl transition-all flex items-center gap-1"
                        title="Send Email Receipt / Preview"
                      >
                        <Mail size={14} />
                      </button>
                      <button 
                        onClick={() => handleStartEdit(tx)}
                        className="p-2 text-[#D9D1C7] hover:text-[#8B9A82] hover:bg-white rounded-xl transition-all"
                        title="Edit Transaction"
                      >
                        <Edit2 size={14} />
                      </button>
                      <button 
                        onClick={() => handleDeleteSale(tx)}
                        className="p-2 text-[#D9D1C7] hover:text-red-600 hover:bg-white rounded-xl transition-all"
                        title="Delete Transaction"
                      >
                        <Trash2 size={14} />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {recentSales.length === 0 && !isProcessing && (
            <div className="text-center py-20 bg-white">
              <PackageOpen className="mx-auto mb-4 text-[#F2EFE9]" size={48} />
              <p className="text-xs font-serif italic text-[#D9D1C7]">No transactions recorded in this ledger yet.</p>
            </div>
          )}
        </div>
      </div>

      {/* --- Stock Management Modal (Upload New Ready Products & Batch Stock In) --- */}
      <AnimatePresence>
        {isStockModalOpen && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40 backdrop-blur-xs">
            <motion.div
              initial={{ opacity: 0, scale: 0.95, y: 15 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 15 }}
              className="bg-white rounded-[32px] border-2 border-[#D9D1C7] shadow-2xl max-w-2xl w-full overflow-hidden flex flex-col max-h-[90vh]"
            >
              {/* Modal Header */}
              <div className="bg-[#2D241E] p-6 text-white flex justify-between items-center">
                <div>
                  <h3 className="font-serif italic text-xl">Ready Product Stock Manager</h3>
                  <p className="text-[9px] font-black uppercase tracking-widest text-white/60 mt-0.5">
                    Organize Products by Category & Upload Stock Counts
                  </p>
                </div>
                <button
                  onClick={() => setIsStockModalOpen(false)}
                  className="p-1.5 text-white/70 hover:text-white rounded-full hover:bg-white/10 transition-colors"
                >
                  <X size={18} />
                </button>
              </div>

              {/* Tabs */}
              <div className="flex border-b border-[#F2EFE9] bg-[#FAF9F6] px-6 pt-3 gap-2">
                <button
                  type="button"
                  onClick={() => setStockModalTab('add_new')}
                  className={`pb-3 px-4 text-xs font-black uppercase tracking-wider border-b-2 transition-all flex items-center gap-2 ${
                    stockModalTab === 'add_new'
                      ? 'border-[var(--accent-primary)] text-[var(--accent-primary)]'
                      : 'border-transparent text-[#8C8379] hover:text-[#2D241E]'
                  }`}
                >
                  <PlusCircle size={14} />
                  <span>Upload New Ready Product</span>
                </button>
                <button
                  type="button"
                  onClick={() => setStockModalTab('batch_restock')}
                  className={`pb-3 px-4 text-xs font-black uppercase tracking-wider border-b-2 transition-all flex items-center gap-2 ${
                    stockModalTab === 'batch_restock'
                      ? 'border-[var(--accent-primary)] text-[var(--accent-primary)]'
                      : 'border-transparent text-[#8C8379] hover:text-[#2D241E]'
                  }`}
                >
                  <SlidersHorizontal size={14} />
                  <span>Batch Stock Update Under Category</span>
                </button>
              </div>

              {/* Tab 1: Upload / Add New Ready Product */}
              {stockModalTab === 'add_new' && (
                <form onSubmit={handleAddNewProductStock} className="p-6 space-y-4 overflow-y-auto">
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    {/* Category Selection */}
                    <div className="space-y-1.5">
                      <label className="block text-[9px] font-black uppercase tracking-wider text-[#8C8379]">
                        Product Category
                      </label>
                      <select
                        value={newCategory}
                        onChange={(e) => setNewCategory(e.target.value)}
                        className="w-full bg-[#FAF9F6] border border-[#D9D1C7]/60 rounded-xl px-3 py-2 text-xs focus:ring-1 focus:ring-[var(--accent-primary)] outline-none font-medium"
                      >
                        {availableCategories.map(c => (
                          <option key={c} value={c}>{c}</option>
                        ))}
                        <option value="__custom__">+ Add Custom Category...</option>
                      </select>
                    </div>

                    {/* Custom Category Input if selected */}
                    {newCategory === '__custom__' ? (
                      <div className="space-y-1.5">
                        <label className="block text-[9px] font-black uppercase tracking-wider text-[#8C8379]">
                          Custom Category Name
                        </label>
                        <input
                          type="text"
                          placeholder="Ex: Ceramic Teapots, Incense Burners..."
                          value={customCategoryName}
                          onChange={(e) => setCustomCategoryName(e.target.value)}
                          className="w-full bg-[#FAF9F6] border border-[#D9D1C7]/60 rounded-xl px-3 py-2 text-xs focus:ring-1 focus:ring-[var(--accent-primary)] outline-none"
                          required
                        />
                      </div>
                    ) : (
                      <div className="space-y-1.5">
                        <label className="block text-[9px] font-black uppercase tracking-wider text-[#8C8379]">
                          SKU / Item Code (Optional)
                        </label>
                        <input
                          type="text"
                          placeholder="Ex: MUG-01, PLT-BLU"
                          value={newSku}
                          onChange={(e) => setNewSku(e.target.value)}
                          className="w-full bg-[#FAF9F6] border border-[#D9D1C7]/60 rounded-xl px-3 py-2 text-xs focus:ring-1 focus:ring-[var(--accent-primary)] outline-none"
                        />
                      </div>
                    )}

                    {/* Product Name */}
                    <div className="md:col-span-2 space-y-1.5">
                      <label className="block text-[9px] font-black uppercase tracking-wider text-[#8C8379]">
                        Product Name / Title
                      </label>
                      <input
                        type="text"
                        placeholder="Ex: Speckled Espresso Cup, Matte White Salad Bowl"
                        value={newName}
                        onChange={(e) => setNewName(e.target.value)}
                        className="w-full bg-[#FAF9F6] border border-[#D9D1C7]/60 rounded-xl px-3 py-2 text-xs focus:ring-1 focus:ring-[var(--accent-primary)] outline-none"
                        required
                      />
                    </div>

                    {/* Stock Quantity */}
                    <div className="space-y-1.5">
                      <label className="block text-[9px] font-black uppercase tracking-wider text-[#8C8379]">
                        Ready Sale Stock (Units)
                      </label>
                      <input
                        type="number"
                        min="0"
                        placeholder="10"
                        value={newStock}
                        onChange={(e) => setNewStock(e.target.value)}
                        className="w-full bg-[#FAF9F6] border border-[#D9D1C7]/60 rounded-xl px-3 py-2 text-xs font-mono font-bold focus:ring-1 focus:ring-[var(--accent-primary)] outline-none"
                        required
                      />
                    </div>

                    {/* Default Reference Price */}
                    <div className="space-y-1.5">
                      <label className="block text-[9px] font-black uppercase tracking-wider text-[#8C8379]">
                        Default Selling Price (RM)
                      </label>
                      <input
                        type="number"
                        step="0.01"
                        min="0"
                        placeholder="35.00"
                        value={newPrice}
                        onChange={(e) => setNewPrice(e.target.value)}
                        className="w-full bg-[#FAF9F6] border border-[#D9D1C7]/60 rounded-xl px-3 py-2 text-xs font-mono font-bold focus:ring-1 focus:ring-[var(--accent-primary)] outline-none"
                      />
                    </div>
                  </div>

                  <div className="flex justify-end gap-2 pt-4 border-t border-[#F2EFE9]">
                    <button
                      type="button"
                      onClick={() => setIsStockModalOpen(false)}
                      className="px-4 py-2.5 bg-[#FAF9F6] hover:bg-[#F2EFE9] text-[#2D241E] rounded-xl text-xs font-black uppercase tracking-wider transition-all"
                    >
                      Cancel
                    </button>
                    <button
                      type="submit"
                      disabled={isSavingStock || !newName.trim()}
                      className="px-6 py-2.5 bg-[var(--accent-primary)] text-white hover:bg-[var(--accent-hover)] rounded-xl text-xs font-black uppercase tracking-wider shadow-sm transition-all flex items-center gap-1.5 disabled:opacity-50"
                    >
                      {isSavingStock ? (
                        <div className="w-3.5 h-3.5 border-2 border-white/20 border-t-white rounded-full animate-spin" />
                      ) : (
                        <Plus size={14} />
                      )}
                      <span>Upload to Ready Inventory</span>
                    </button>
                  </div>
                </form>
              )}

              {/* Tab 2: Batch Restock by Category */}
              {stockModalTab === 'batch_restock' && (
                <div className="p-6 space-y-4 overflow-y-auto flex-1">
                  <div className="flex justify-between items-center">
                    <p className="text-xs text-[#8C8379]">
                      Quickly add incoming pottery batches under each category:
                    </p>
                    {/* Category filter */}
                    <select
                      value={batchCategoryFilter}
                      onChange={(e) => setBatchCategoryFilter(e.target.value)}
                      className="bg-[#FAF9F6] border border-[#D9D1C7]/60 rounded-xl px-3 py-1.5 text-xs font-black uppercase tracking-wider text-[#2D241E] outline-none"
                    >
                      <option value="ALL">All Categories</option>
                      {availableCategories.map(c => (
                        <option key={c} value={c}>{c}</option>
                      ))}
                    </select>
                  </div>

                  {/* List of items */}
                  <div className="divide-y divide-[#F2EFE9] max-h-72 overflow-y-auto pr-1">
                    {saleProducts
                      .filter(p => batchCategoryFilter === 'ALL' || (p.productCategory || 'General') === batchCategoryFilter)
                      .map(p => {
                        const change = batchStockChanges[p.id!] || 0;
                        const current = Number(p.stock || 0);
                        const effective = current + change;
                        return (
                          <div key={p.id} className="py-3 flex items-center justify-between gap-3">
                            <div>
                              <span className="text-xs font-bold text-[#2D241E] block truncate max-w-xs">{p.name}</span>
                              <span className="text-[8px] font-black uppercase tracking-wider text-[#8C8379]">
                                {p.productCategory || 'General'} • Current Stock: {current}
                              </span>
                            </div>

                            <div className="flex items-center gap-2">
                              <div className="flex items-center gap-1 bg-[#FAF9F6] border border-[#D9D1C7]/40 rounded-xl p-1">
                                <button
                                  type="button"
                                  onClick={() => handleBatchStockDelta(p.id!, -1)}
                                  className="w-6 h-6 flex items-center justify-center bg-white rounded-lg text-xs hover:bg-[#F2EFE9]"
                                >
                                  -1
                                </button>
                                <button
                                  type="button"
                                  onClick={() => handleBatchStockDelta(p.id!, 1)}
                                  className="w-6 h-6 flex items-center justify-center bg-white rounded-lg text-xs hover:bg-[#F2EFE9] font-bold"
                                >
                                  +1
                                </button>
                                <button
                                  type="button"
                                  onClick={() => handleBatchStockDelta(p.id!, 5)}
                                  className="w-7 h-6 flex items-center justify-center bg-white rounded-lg text-[10px] hover:bg-[#F2EFE9] font-bold text-[var(--accent-primary)]"
                                >
                                  +5
                                </button>
                                <button
                                  type="button"
                                  onClick={() => handleBatchStockDelta(p.id!, 10)}
                                  className="w-8 h-6 flex items-center justify-center bg-white rounded-lg text-[10px] hover:bg-[#F2EFE9] font-bold text-[var(--accent-primary)]"
                                >
                                  +10
                                </button>
                              </div>

                              <div className="min-w-[60px] text-right">
                                <span className={`text-xs font-mono font-black ${change !== 0 ? 'text-[var(--accent-primary)] font-black' : 'text-[#8C8379]'}`}>
                                  {effective} units
                                </span>
                              </div>
                            </div>
                          </div>
                        );
                      })}
                  </div>

                  <div className="flex justify-between items-center pt-4 border-t border-[#F2EFE9]">
                    <span className="text-[10px] text-[#8C8379] font-medium">
                      {Object.keys(batchStockChanges).length > 0 
                        ? `${Object.keys(batchStockChanges).length} items modified` 
                        : 'No pending modifications'}
                    </span>
                    <div className="flex gap-2">
                      <button
                        type="button"
                        onClick={() => {
                          setBatchStockChanges({});
                          setIsStockModalOpen(false);
                        }}
                        className="px-4 py-2 bg-[#FAF9F6] text-[#2D241E] rounded-xl text-xs font-black uppercase tracking-wider"
                      >
                        Cancel
                      </button>
                      <button
                        type="button"
                        onClick={handleSaveBatchRestock}
                        disabled={isSavingStock || Object.keys(batchStockChanges).length === 0}
                        className="px-6 py-2 bg-[var(--accent-primary)] text-white hover:bg-[var(--accent-hover)] rounded-xl text-xs font-black uppercase tracking-wider shadow-sm transition-all disabled:opacity-50"
                      >
                        {isSavingStock ? 'Saving...' : 'Apply Stock Updates'}
                      </button>
                    </div>
                  </div>
                </div>
              )}
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Edit Transaction Modal */}
      <AnimatePresence>
        {editingTx && (
          <div className="fixed inset-0 bg-black/50 backdrop-blur-xs flex items-center justify-center p-4 z-50">
            <motion.div
              initial={{ opacity: 0, scale: 0.95, y: 15 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 15 }}
              className="bg-white border-2 border-[#D9D1C7] rounded-[32px] overflow-hidden max-w-md w-full shadow-2xl"
            >
              <div className="bg-[#2D241E] p-6 text-white flex justify-between items-center">
                <div>
                  <h3 className="font-serif italic text-lg leading-none">Edit Transaction</h3>
                  <p className="text-[9px] font-black uppercase text-white/50 tracking-widest mt-1">Ref: #{editingTx.id?.slice(-8).toUpperCase()}</p>
                </div>
                <button
                  type="button"
                  onClick={() => setEditingTx(null)}
                  className="text-white/70 hover:text-white transition-colors"
                >
                  <X size={18} />
                </button>
              </div>

              <form onSubmit={handleSaveEdit} className="p-6 space-y-4">
                <div>
                  <label className="block text-[8px] font-black uppercase text-[#8C8379] tracking-wider mb-1.5 ml-0.5">Description</label>
                  <input
                    type="text"
                    value={editDesc}
                    onChange={(e) => setEditDesc(e.target.value)}
                    required
                    className="w-full bg-[#FAF9F6] border border-[#D9D1C7] rounded-xl px-3 py-2 text-xs focus:ring-1 focus:ring-[var(--accent-primary)] outline-none hover:border-[var(--accent-primary)] transition-colors"
                  />
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-[8px] font-black uppercase text-[#8C8379] tracking-wider mb-1.5 ml-0.5">Date</label>
                    <input
                      type="date"
                      value={editDate}
                      onChange={(e) => setEditDate(e.target.value)}
                      required
                      className="w-full bg-[#FAF9F6] border border-[#D9D1C7] rounded-xl px-3 py-2 text-xs focus:ring-1 focus:ring-[var(--accent-primary)] outline-none hover:border-[var(--accent-primary)] transition-colors"
                    />
                  </div>
                  <div>
                    <label className="block text-[8px] font-black uppercase text-[#8C8379] tracking-wider mb-1.5 ml-0.5">Time</label>
                    <input
                      type="time"
                      value={editTime}
                      onChange={(e) => setEditTime(e.target.value)}
                      required
                      className="w-full bg-[#FAF9F6] border border-[#D9D1C7] rounded-xl px-3 py-2 text-xs focus:ring-1 focus:ring-[var(--accent-primary)] outline-none hover:border-[var(--accent-primary)] transition-colors"
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-[8px] font-black uppercase text-[#8C8379] tracking-wider mb-1.5 ml-0.5">Amount (RM)</label>
                  <input
                    type="number"
                    step="0.01"
                    value={editAmount}
                    onChange={(e) => setEditAmount(e.target.value)}
                    required
                    className="w-full bg-[#FAF9F6] border border-[#D9D1C7] rounded-xl px-3 py-2 text-xs font-mono font-bold text-[#2D241E] focus:ring-1 focus:ring-[var(--accent-primary)] outline-none hover:border-[var(--accent-primary)] transition-colors"
                  />
                </div>

                <div className="flex gap-2 justify-end pt-4 border-t border-[#F2EFE9]">
                  <button
                    type="button"
                    onClick={() => setEditingTx(null)}
                    className="px-4 py-2 bg-[#F2EFE9] text-[#2D241E] rounded-xl text-xs font-black uppercase tracking-wider hover:bg-[#EBE7DF] transition-all"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    disabled={isSavingEdit}
                    className="px-6 py-2 bg-[var(--accent-primary)] text-white rounded-xl text-xs font-black uppercase tracking-wider hover:bg-[var(--accent-hover)] disabled:opacity-50 transition-all flex items-center gap-1.5"
                  >
                    {isSavingEdit ? (
                      <>
                        <div className="w-3.5 h-3.5 border-2 border-white/20 border-t-white rounded-full animate-spin" />
                        <span>Saving...</span>
                      </>
                    ) : (
                      <span>Save Changes</span>
                    )}
                  </button>
                </div>
              </form>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Delete Transaction Confirmation Modal */}
      <AnimatePresence>
        {deletingTx && (
          <div className="fixed inset-0 bg-black/50 backdrop-blur-xs flex items-center justify-center p-4 z-50">
            <motion.div
              initial={{ opacity: 0, scale: 0.95, y: 15 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 15 }}
              className="bg-white border-2 border-[#D9D1C7] rounded-[32px] overflow-hidden max-w-sm w-full shadow-2xl"
            >
              <div className="bg-[#2D241E] p-6 text-white flex justify-between items-center">
                <div>
                  <h3 className="font-serif italic text-lg leading-none">Delete Transaction</h3>
                  <p className="text-[9px] font-black uppercase text-white/50 tracking-widest mt-1 font-sans">
                    Ref: #{deletingTx.id?.slice(-8).toUpperCase()}
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => setDeletingTx(null)}
                  className="text-white/70 hover:text-white transition-colors"
                >
                  <X size={18} />
                </button>
              </div>

              <div className="p-6 space-y-4">
                <p className="text-xs text-[#8C8379] leading-relaxed">
                  Are you sure you want to permanently delete this direct sale item? This action cannot be undone.
                </p>

                <div className="bg-[#FAF9F6] border border-[#D9D1C7]/60 rounded-2xl p-4 space-y-1.5">
                  <div className="flex justify-between text-[9px] uppercase tracking-wider text-[#8C8379]">
                    <span>Item</span>
                    <span>Amount</span>
                  </div>
                  <div className="flex justify-between items-center">
                    <span className="text-xs font-bold text-[#2D241E] truncate max-w-[180px]" title={deletingTx.description.replace('Direct Sale: ', '')}>
                      {deletingTx.description.replace('Direct Sale: ', '')}
                    </span>
                    <span className="font-mono text-xs font-black text-red-600">
                      RM {deletingTx.amount.toFixed(2)}
                    </span>
                  </div>
                </div>

                <div className="flex gap-2 justify-end pt-4 border-t border-[#F2EFE9]">
                  <button
                    type="button"
                    onClick={() => setDeletingTx(null)}
                    className="px-4 py-2 bg-[#F2EFE9] text-[#2D241E] rounded-xl text-xs font-black uppercase tracking-wider hover:bg-[#EBE7DF] transition-all"
                  >
                    Cancel
                  </button>
                  <button
                    type="button"
                    onClick={confirmDeleteSale}
                    disabled={isDeleting}
                    className="px-6 py-2 bg-red-600 hover:bg-red-700 text-white rounded-xl text-xs font-black uppercase tracking-wider disabled:opacity-50 transition-all flex items-center gap-1.5"
                  >
                    {isDeleting ? (
                      <>
                        <div className="w-3.5 h-3.5 border-2 border-white/20 border-t-white rounded-full animate-spin" />
                        <span>Deleting...</span>
                      </>
                    ) : (
                      <span>Confirm Delete</span>
                    )}
                  </button>
                </div>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* --- Receipt & Invoice Preview & Email Dispatch Modal --- */}
      <AnimatePresence>
        {previewDoc && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-xs">
            <motion.div
              initial={{ opacity: 0, scale: 0.95, y: 15 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 15 }}
              className="bg-[#FAF9F6] border-2 border-[#D9D1C7] rounded-[32px] shadow-2xl max-w-2xl w-full overflow-hidden flex flex-col max-h-[92vh]"
            >
              {/* Modal Top Header */}
              <div className="bg-[#2D241E] p-5 text-white flex justify-between items-center">
                <div className="flex items-center gap-3">
                  <div className="w-9 h-9 rounded-2xl bg-white/10 flex items-center justify-center text-[var(--accent-primary)] border border-white/10">
                    <Mail size={18} />
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

              {/* Digital Dispatch Toolbar (Email / WhatsApp / Copy) */}
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
                      onClick={() => handleDownloadPosPdf(previewDoc.tx, previewDoc.type)}
                      className="inline-flex items-center justify-center gap-1.5 px-3 py-1.5 bg-[#2D241E] hover:bg-[#43362E] text-white rounded-xl text-[10px] font-black uppercase tracking-wider transition-all shadow-xs"
                      title="Download official PDF receipt or invoice file"
                    >
                      <Download size={12} />
                      <span>Download PDF</span>
                    </button>

                    <button
                      type="button"
                      onClick={() => handleCopyReceiptText(previewDoc.tx, previewDoc.type)}
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
                      onClick={() => handleSendEmailReceipt(previewDoc.tx, previewDoc.type)}
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
                      onClick={() => handleSendWhatsAppReceipt(previewDoc.tx, previewDoc.type)}
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

                  {/* Metadata Grid */}
                  <div className="grid grid-cols-2 gap-4 text-xs bg-[#FAF9F6] p-4 rounded-xl border border-[#E6E1DA]">
                    <div>
                      <span className="block text-[8.5px] font-black uppercase tracking-wider text-[#8C8379] mb-0.5">
                        {previewDoc.type === 'receipt' ? 'Sold To / Customer' : 'Bill To / Customer'}
                      </span>
                      <span className="font-bold text-sm text-[#2D241E] block">
                        {previewDoc.tx.customerName || 'Walk-in Customer'}
                      </span>
                      {(modalEmailInput || previewDoc.tx.customerEmail) && (
                        <span className="text-[9px] text-[#8C8379] font-mono flex items-center gap-1 mt-0.5">
                          <Mail size={10} className="text-[#C86A4B]" />
                          <span>{modalEmailInput || previewDoc.tx.customerEmail}</span>
                        </span>
                      )}
                      {(modalPhoneInput || previewDoc.tx.customerPhone) && (
                        <span className="text-[9px] text-[#8C8379] font-mono flex items-center gap-1 mt-0.5">
                          <Smartphone size={10} className="text-emerald-600" />
                          <span>{modalPhoneInput || previewDoc.tx.customerPhone}</span>
                        </span>
                      )}
                    </div>

                    <div className="text-right space-y-1.5">
                      <div>
                        <span className="block text-[8.5px] font-black uppercase tracking-wider text-[#8C8379]">
                          {previewDoc.type === 'receipt' ? 'Receipt Ref' : 'Invoice Ref'}
                        </span>
                        <span className="font-mono text-xs font-bold text-[#2D241E]">
                          {getTransactionDocRef(previewDoc.tx, previewDoc.type, recentSales)}
                        </span>
                      </div>
                      <div>
                        <span className="block text-[8.5px] font-black uppercase tracking-wider text-[#8C8379]">
                          Date & Time
                        </span>
                        <span className="text-[11px] font-semibold text-[#2D241E]">
                          {(() => {
                            try {
                              return format(new Date(previewDoc.tx.timestamp), 'dd MMM yyyy, hh:mm a');
                            } catch {
                              return '---';
                            }
                          })()}
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
                        <tr>
                          <td className="py-3 px-1 font-medium text-[#2D241E]">
                            <strong>{(previewDoc.tx.description || '').replace('Direct Sale: ', '')}</strong>
                          </td>
                          <td className="py-3 px-1 text-center font-mono text-[#2D241E]">
                            {previewDoc.tx.quantity || 1}
                          </td>
                          <td className="py-3 px-1 text-right font-mono text-[#8C8379]">
                            {((previewDoc.tx.unitPrice || (previewDoc.tx.amount / (previewDoc.tx.quantity || 1)))).toFixed(2)}
                          </td>
                          <td className="py-3 px-1 text-right font-mono font-bold text-[#2D241E]">
                            RM {previewDoc.tx.amount.toFixed(2)}
                          </td>
                        </tr>
                      </tbody>
                    </table>
                  </div>

                  {/* Summary Totals (Separated with lines, no box) */}
                  <div className="flex justify-end pt-2">
                    <div className="w-64 space-y-1.5">
                      <div className="flex justify-between text-xs text-[#8C8379]">
                        <span>Subtotal</span>
                        <span className="font-mono text-[#2D241E]">RM {previewDoc.tx.amount.toFixed(2)}</span>
                      </div>
                      <div className="border-t border-[#D9D1C7] pt-2 flex justify-between items-baseline">
                        <span className="text-[10px] font-black uppercase tracking-wider text-[#2D241E]">
                          {previewDoc.type === 'invoice' ? 'Total Due' : 'Grand Total Paid'}
                        </span>
                        <span className="font-mono font-black text-2xl text-[#2D241E]">
                          RM {previewDoc.tx.amount.toFixed(2)}
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
                    onClick={() => handleDownloadPosPdf(previewDoc.tx, previewDoc.type)}
                    className="flex-1 sm:flex-none px-4 py-2 bg-[#2D241E] hover:bg-[#43362E] text-white rounded-xl text-xs font-black uppercase tracking-wider transition-all flex items-center justify-center gap-1.5 shadow-sm"
                  >
                    <Download size={14} />
                    <span>Download PDF</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => handleSendEmailReceipt(previewDoc.tx, previewDoc.type)}
                    className="flex-1 sm:flex-none px-5 py-2.5 bg-[var(--btn-primary)] hover:bg-[var(--btn-primary-hover)] text-white font-bold rounded-xl text-xs font-black uppercase tracking-wider shadow-md transition-all flex items-center justify-center gap-2"
                  >
                    <Mail size={15} />
                    <span>Send PDF via Email</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => generateDocument(previewDoc.type, previewDoc.tx)}
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
