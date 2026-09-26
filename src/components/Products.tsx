import React, { useState, useEffect, useMemo } from 'react';
import { db } from '../firebase';
import { collection, onSnapshot, addDoc, updateDoc, deleteDoc, doc } from 'firebase/firestore';
import { Product, OperationType, Branch, CameraType } from '../types';
import { handleFirestoreError } from '../utils';
import { 
  Plus, 
  Edit2, 
  Trash2, 
  Save, 
  X, 
  Search, 
  Camera, 
  Package, 
  AlertTriangle, 
  Check,
  Tag,
  DollarSign,
  Layers,
  Sparkles,
  ArrowUpDown
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';

const CAMERA_TYPES: CameraType[] = [
  'CCD/Digicam',
  'Point and Shoot',
  'Rangefinder',
  'SLR',
  'Disposable Camera',
  'Film Roll',
  'Accessory'
];

const POPULAR_BRANDS = [
  'Olympus',
  'Canon',
  'Nikon',
  'Pentax',
  'Fujifilm',
  'Sony',
  'Kodak',
  'Minolta',
  'Konica',
  'Ricoh',
  'Leica',
  'Other'
];

export default function Products({ branch = 'ALL' }: { branch?: string }) {
  const [products, setProducts] = useState<Product[]>([]);
  const [selectedTypeFilter, setSelectedTypeFilter] = useState<string>('ALL');
  const [selectedBrandFilter, setSelectedBrandFilter] = useState<string>('ALL');
  const [search, setSearch] = useState('');
  
  // Modal states
  const [isAdding, setIsAdding] = useState(false);
  const [isEditing, setIsEditing] = useState<string | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<Product | null>(null);

  // Form State
  const [formData, setFormData] = useState<{
    name: string;
    brand: string;
    type: CameraType;
    quantity: number;
    price: number;
    sku: string;
    description: string;
    customBrand: string;
  }>({
    name: '',
    brand: 'Olympus',
    type: 'Point and Shoot',
    quantity: 1,
    price: 0,
    sku: '',
    description: '',
    customBrand: ''
  });

  useEffect(() => {
    const q = collection(db, 'products');
    const unsubscribe = onSnapshot(q, (snapshot) => {
      let prods = snapshot.docs.map(doc => ({ 
        id: doc.id, 
        ...doc.data() 
      } as Product));

      prods.sort((a, b) => (a.name || '').localeCompare(b.name || ''));
      setProducts(prods);
    }, (error) => handleFirestoreError(error, OperationType.LIST, 'products'));

    return () => unsubscribe();
  }, [branch]);

  // Distinct Brands from products
  const availableBrands = useMemo(() => {
    const set = new Set<string>(POPULAR_BRANDS);
    products.forEach(p => {
      if (p.brand && p.brand.trim()) set.add(p.brand.trim());
    });
    return Array.from(set);
  }, [products]);

  // Filtered Products
  const filteredProducts = useMemo(() => {
    return products.filter(p => {
      const pType = p.type || p.productCategory || 'Point and Shoot';
      const matchesType = selectedTypeFilter === 'ALL' || pType === selectedTypeFilter;
      const matchesBrand = selectedBrandFilter === 'ALL' || (p.brand || '').toLowerCase() === selectedBrandFilter.toLowerCase();
      
      const q = search.toLowerCase().trim();
      const matchesSearch = !q ||
        (p.name || '').toLowerCase().includes(q) ||
        (p.brand || '').toLowerCase().includes(q) ||
        (p.sku || '').toLowerCase().includes(q) ||
        (pType || '').toLowerCase().includes(q);

      return matchesType && matchesBrand && matchesSearch;
    });
  }, [products, selectedTypeFilter, selectedBrandFilter, search]);

  // Inventory statistics
  const stats = useMemo(() => {
    let totalStock = 0;
    let totalValue = 0;
    let lowStockCount = 0;

    products.forEach(p => {
      const stock = Number(p.stock || 0);
      const price = Number(p.price || 0);
      totalStock += stock;
      totalValue += stock * price;
      if (stock <= 2) lowStockCount++;
    });

    return { totalStock, totalValue, lowStockCount };
  }, [products]);

  // Start Adding Product
  const handleStartAdd = () => {
    setFormData({
      name: '',
      brand: 'Olympus',
      type: 'Point and Shoot',
      quantity: 1,
      price: 0,
      sku: '',
      description: '',
      customBrand: ''
    });
    setIsAdding(true);
    setIsEditing(null);
  };

  // Start Editing Product
  const handleStartEdit = (p: Product) => {
    const isStandardBrand = POPULAR_BRANDS.includes(p.brand || '');
    setFormData({
      name: p.name || '',
      brand: isStandardBrand ? (p.brand || 'Olympus') : 'Other',
      type: (p.type || p.productCategory || 'Point and Shoot') as CameraType,
      quantity: Number(p.stock || 0),
      price: Number(p.price || 0),
      sku: p.sku || '',
      description: p.description || '',
      customBrand: isStandardBrand ? '' : (p.brand || '')
    });
    setIsEditing(p.id || null);
    setIsAdding(false);
  };

  // Save product (Add or Update)
  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formData.name.trim()) return;

    try {
      const finalBrand = formData.brand === 'Other' 
        ? (formData.customBrand.trim() || 'Other') 
        : formData.brand;

      const payload: Omit<Product, 'id'> = {
        name: formData.name.trim(),
        brand: finalBrand,
        type: formData.type,
        productCategory: formData.type, // backward compatibility
        price: Number(formData.price || 0),
        stock: Number(formData.quantity || 0),
        location: 'ALL' as Branch,
        category: 'sale',
        sku: formData.sku.trim() || undefined,
        description: formData.description.trim() || undefined
      };

      if (isEditing) {
        await updateDoc(doc(db, 'products', isEditing), payload);
      } else {
        await addDoc(collection(db, 'products'), payload);
      }

      setIsAdding(false);
      setIsEditing(null);
    } catch (error) {
      handleFirestoreError(error, OperationType.WRITE, 'products');
    }
  };

  // Quick adjust stock
  const handleQuickStockAdjust = async (product: Product, delta: number) => {
    if (!product.id) return;
    try {
      const newStock = Math.max(0, Number(product.stock || 0) + delta);
      await updateDoc(doc(db, 'products', product.id), { stock: newStock });
    } catch (err) {
      handleFirestoreError(err, OperationType.WRITE, `products/${product.id}`);
    }
  };

  // Confirm delete
  const handleConfirmDelete = async () => {
    if (!deleteTarget?.id) return;
    try {
      await deleteDoc(doc(db, 'products', deleteTarget.id));
      setDeleteTarget(null);
    } catch (error) {
      handleFirestoreError(error, OperationType.DELETE, `products/${deleteTarget.id}`);
    }
  };

  return (
    <div className="space-y-8 max-w-7xl mx-auto pb-16">
      {/* Header & Stats */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-[#C85A32]">
            <Camera className="w-4 h-4" />
            <span>Camera & Film Inventory</span>
          </div>
          <h1 className="text-3xl font-serif font-bold text-[var(--text-app)] mt-1">Inventory Management</h1>
          <p className="text-sm text-[var(--text-muted)] mt-1">
            Manage vintage cameras by type (CCD/Digicam, Point and Shoot, Rangefinder, SLR, Disposable), brand, stock, and price.
          </p>
        </div>

        <button
          onClick={handleStartAdd}
          className="natural-btn-primary flex items-center gap-2 text-xs uppercase tracking-wider font-bold cursor-pointer"
        >
          <Plus className="w-4 h-4" />
          <span>Add New Camera / Stock</span>
        </button>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-6">
        <div className="natural-card p-6 bg-[var(--bg-card)]">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold uppercase tracking-wider text-[var(--text-muted)]">Total Units in Stock</span>
            <div className="w-8 h-8 rounded-full bg-[#FAF0EB] text-[#C85A32] flex items-center justify-center">
              <Package className="w-4 h-4" />
            </div>
          </div>
          <div className="text-2xl font-mono font-bold text-[var(--text-app)] mt-2">
            {stats.totalStock} units
          </div>
          <div className="text-xs text-[var(--text-muted)] mt-1">Across {products.length} catalog variants</div>
        </div>

        <div className="natural-card p-6 bg-[var(--bg-card)]">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold uppercase tracking-wider text-[var(--text-muted)]">Total Inventory Valuation</span>
            <div className="w-8 h-8 rounded-full bg-emerald-50 text-emerald-600 flex items-center justify-center">
              <DollarSign className="w-4 h-4" />
            </div>
          </div>
          <div className="text-2xl font-mono font-bold text-emerald-700 mt-2">
            RM {stats.totalValue.toFixed(2)}
          </div>
          <div className="text-xs text-emerald-600 mt-1">Retail value ready for POS sales</div>
        </div>

        <div className="natural-card p-6 bg-[var(--bg-card)]">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold uppercase tracking-wider text-amber-700">Low Stock Alert (&le; 2)</span>
            <div className="w-8 h-8 rounded-full bg-amber-50 text-amber-600 flex items-center justify-center">
              <AlertTriangle className="w-4 h-4" />
            </div>
          </div>
          <div className="text-2xl font-mono font-bold text-amber-700 mt-2">
            {stats.lowStockCount} items
          </div>
          <div className="text-xs text-amber-600 mt-1">Consider restocking soon</div>
        </div>
      </div>

      {/* Filter Tabs by Camera Type */}
      <div className="flex flex-wrap items-center gap-2">
        <button
          onClick={() => setSelectedTypeFilter('ALL')}
          className={`px-3.5 py-1.5 rounded-xl text-xs font-bold transition-all ${
            selectedTypeFilter === 'ALL'
              ? 'bg-[#1C1917] text-white shadow-xs'
              : 'bg-[var(--bg-card)] text-[var(--text-muted)] hover:text-[var(--text-app)] border border-[var(--border-app)]'
          }`}
        >
          All Types ({products.length})
        </button>
        {CAMERA_TYPES.map((t) => {
          const count = products.filter(p => (p.type || p.productCategory) === t).length;
          return (
            <button
              key={t}
              onClick={() => setSelectedTypeFilter(t)}
              className={`px-3.5 py-1.5 rounded-xl text-xs font-bold transition-all flex items-center gap-1.5 ${
                selectedTypeFilter === t
                  ? 'bg-[#C85A32] text-white shadow-xs'
                  : 'bg-[var(--bg-card)] text-[var(--text-muted)] hover:text-[var(--text-app)] border border-[var(--border-app)]'
              }`}
            >
              <span>{t}</span>
              <span className={`px-1.5 py-0.2 rounded-md text-[10px] ${
                selectedTypeFilter === t ? 'bg-white/20 text-white' : 'bg-[var(--bg-app)] text-[var(--text-muted)]'
              }`}>
                {count}
              </span>
            </button>
          );
        })}
      </div>

      {/* Inventory Table Container */}
      <div className="natural-card p-6 bg-[var(--bg-card)]">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-6">
          <div className="flex flex-wrap items-center gap-3">
            {/* Search */}
            <div className="relative">
              <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-[var(--text-muted)]" />
              <input
                type="text"
                placeholder="Search camera name, brand, SKU..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="natural-input pl-9 text-xs py-1.5 w-64"
              />
            </div>

            {/* Brand Filter */}
            <select
              value={selectedBrandFilter}
              onChange={(e) => setSelectedBrandFilter(e.target.value)}
              className="natural-input text-xs py-1.5 font-semibold"
            >
              <option value="ALL">All Brands</option>
              {availableBrands.map((b) => (
                <option key={b} value={b}>{b}</option>
              ))}
            </select>
          </div>

          <div className="text-xs text-[var(--text-muted)]">
            Showing <strong>{filteredProducts.length}</strong> items
          </div>
        </div>

        {filteredProducts.length === 0 ? (
          <div className="text-center py-16 text-[var(--text-muted)] text-sm">
            No camera stock items match the current filter.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs border-collapse">
              <thead>
                <tr className="border-b border-[var(--border-app)] natural-table-header">
                  <th className="py-3 px-3">Type</th>
                  <th className="py-3 px-3">Brand</th>
                  <th className="py-3 px-3">Camera / Item Name</th>
                  <th className="py-3 px-3">SKU</th>
                  <th className="py-3 px-3 text-center">Quantity in Stock</th>
                  <th className="py-3 px-3 text-right">Price (RM)</th>
                  <th className="py-3 px-3 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[var(--border-app)]">
                {filteredProducts.map((p) => {
                  const stock = Number(p.stock || 0);
                  const isLow = stock <= 2;
                  const itemType = p.type || p.productCategory || 'Point and Shoot';

                  return (
                    <tr key={p.id} className="natural-table-row">
                      <td className="py-3 px-3">
                        <span className="inline-block px-2.5 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider bg-[#FAF0EB] text-[#C85A32]">
                          {itemType}
                        </span>
                      </td>
                      <td className="py-3 px-3 font-bold text-[var(--text-app)]">
                        {p.brand || '---'}
                      </td>
                      <td className="py-3 px-3">
                        <div className="font-bold text-[var(--text-app)] text-sm">{p.name}</div>
                        {p.description && (
                          <div className="text-[11px] text-[var(--text-muted)] line-clamp-1">{p.description}</div>
                        )}
                      </td>
                      <td className="py-3 px-3 font-mono text-[11px] text-[var(--text-muted)]">
                        {p.sku || '---'}
                      </td>
                      <td className="py-3 px-3 text-center">
                        <div className="inline-flex items-center gap-1.5 bg-[var(--bg-app)] px-2 py-1 rounded-xl border border-[var(--border-app)]">
                          <button
                            type="button"
                            onClick={() => handleQuickStockAdjust(p, -1)}
                            className="w-5 h-5 flex items-center justify-center rounded-md bg-white hover:bg-gray-100 text-xs font-bold shadow-2xs"
                            title="Decrease stock"
                          >
                            -
                          </button>
                          <span className={`font-mono font-bold text-xs px-1 ${isLow ? 'text-rose-600' : 'text-[var(--text-app)]'}`}>
                            {stock}
                          </span>
                          <button
                            type="button"
                            onClick={() => handleQuickStockAdjust(p, 1)}
                            className="w-5 h-5 flex items-center justify-center rounded-md bg-white hover:bg-gray-100 text-xs font-bold shadow-2xs"
                            title="Increase stock"
                          >
                            +
                          </button>
                        </div>
                      </td>
                      <td className="py-3 px-3 text-right font-mono font-bold text-sm text-[var(--text-app)]">
                        RM {Number(p.price || 0).toFixed(2)}
                      </td>
                      <td className="py-3 px-3 text-right">
                        <div className="flex items-center justify-end gap-1.5">
                          <button
                            onClick={() => handleStartEdit(p)}
                            title="Edit Camera / Item"
                            className="p-1.5 text-[var(--text-muted)] hover:text-[var(--text-app)] rounded-lg hover:bg-[var(--bg-app)] transition-colors"
                          >
                            <Edit2 className="w-4 h-4" />
                          </button>
                          <button
                            onClick={() => setDeleteTarget(p)}
                            title="Delete Item"
                            className="p-1.5 text-[var(--text-muted)] hover:text-rose-600 rounded-lg hover:bg-rose-50 transition-colors"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Add / Edit Camera Modal */}
      <AnimatePresence>
        {(isAdding || isEditing) && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-xs">
            <motion.div
              initial={{ scale: 0.95, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.95, opacity: 0 }}
              className="bg-white rounded-3xl max-w-lg w-full p-8 shadow-2xl relative border border-[#E7E0D8]"
            >
              <button
                onClick={() => {
                  setIsAdding(false);
                  setIsEditing(null);
                }}
                className="absolute top-4 right-4 text-gray-400 hover:text-black p-1"
              >
                &times;
              </button>

              <div className="w-12 h-12 rounded-full bg-[#FAF0EB] text-[#C85A32] flex items-center justify-center mb-4">
                <Camera className="w-6 h-6" />
              </div>

              <h2 className="text-xl font-serif font-bold text-[#1C1917]">
                {isEditing ? 'Edit Camera / Inventory Item' : 'Add New Camera / Inventory Item'}
              </h2>
              <p className="text-xs text-[#78716C] mt-1 mb-6">
                Specify camera type, brand, model name, quantity, and retail price.
              </p>

              <form onSubmit={handleSave} className="space-y-4">
                {/* Type Selection */}
                <div>
                  <label className="block text-[11px] font-bold uppercase tracking-wider text-[#78716C] mb-1">
                    Camera Type *
                  </label>
                  <select
                    value={formData.type}
                    onChange={(e) => setFormData({ ...formData, type: e.target.value as CameraType })}
                    className="natural-input w-full text-xs font-semibold"
                  >
                    {CAMERA_TYPES.map((t) => (
                      <option key={t} value={t}>{t}</option>
                    ))}
                  </select>
                </div>

                {/* Brand Selection */}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <label className="block text-[11px] font-bold uppercase tracking-wider text-[#78716C] mb-1">
                      Brand *
                    </label>
                    <select
                      value={formData.brand}
                      onChange={(e) => setFormData({ ...formData, brand: e.target.value })}
                      className="natural-input w-full text-xs font-semibold"
                    >
                      {POPULAR_BRANDS.map((b) => (
                        <option key={b} value={b}>{b}</option>
                      ))}
                    </select>
                  </div>

                  {formData.brand === 'Other' && (
                    <div>
                      <label className="block text-[11px] font-bold uppercase tracking-wider text-[#78716C] mb-1">
                        Custom Brand Name
                      </label>
                      <input
                        type="text"
                        placeholder="e.g. Rollei, Yashica"
                        value={formData.customBrand}
                        onChange={(e) => setFormData({ ...formData, customBrand: e.target.value })}
                        className="natural-input w-full text-xs"
                      />
                    </div>
                  )}

                  <div className={formData.brand === 'Other' ? 'sm:col-span-2' : ''}>
                    <label className="block text-[11px] font-bold uppercase tracking-wider text-[#78716C] mb-1">
                      Model / Item Name *
                    </label>
                    <input
                      type="text"
                      required
                      placeholder="e.g. [mju:] II 35mm F2.8"
                      value={formData.name}
                      onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                      className="natural-input w-full text-xs font-semibold"
                    />
                  </div>
                </div>

                {/* Quantity & Price */}
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-[11px] font-bold uppercase tracking-wider text-[#78716C] mb-1">
                      Quantity (Stock) *
                    </label>
                    <input
                      type="number"
                      min={0}
                      required
                      value={formData.quantity}
                      onChange={(e) => setFormData({ ...formData, quantity: parseInt(e.target.value, 10) || 0 })}
                      className="natural-input w-full font-mono text-xs font-bold"
                    />
                  </div>

                  <div>
                    <label className="block text-[11px] font-bold uppercase tracking-wider text-[#78716C] mb-1">
                      Price (RM) *
                    </label>
                    <input
                      type="number"
                      step="0.01"
                      min={0}
                      required
                      value={formData.price}
                      onChange={(e) => setFormData({ ...formData, price: parseFloat(e.target.value) || 0 })}
                      className="natural-input w-full font-mono text-xs font-bold"
                    />
                  </div>
                </div>

                {/* SKU & Description */}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <label className="block text-[11px] font-bold uppercase tracking-wider text-[#78716C] mb-1">
                      SKU / Barcode (Optional)
                    </label>
                    <input
                      type="text"
                      placeholder="e.g. CAM-OLY-01"
                      value={formData.sku}
                      onChange={(e) => setFormData({ ...formData, sku: e.target.value })}
                      className="natural-input w-full font-mono text-xs"
                    />
                  </div>

                  <div>
                    <label className="block text-[11px] font-bold uppercase tracking-wider text-[#78716C] mb-1">
                      Condition / Description
                    </label>
                    <input
                      type="text"
                      placeholder="e.g. Mint condition with original pouch"
                      value={formData.description}
                      onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                      className="natural-input w-full text-xs"
                    />
                  </div>
                </div>

                <div className="flex gap-3 pt-4 border-t border-[#E7E0D8]">
                  <button
                    type="button"
                    onClick={() => {
                      setIsAdding(false);
                      setIsEditing(null);
                    }}
                    className="natural-btn-secondary flex-1 text-xs py-3"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    className="natural-btn-primary flex-1 text-xs py-3 font-bold uppercase tracking-wider"
                  >
                    {isEditing ? 'Save Changes' : 'Add to Inventory'}
                  </button>
                </div>
              </form>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Delete Confirmation Modal */}
      <AnimatePresence>
        {deleteTarget && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-xs">
            <motion.div
              initial={{ scale: 0.95, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.95, opacity: 0 }}
              className="bg-white rounded-3xl max-w-sm w-full p-6 shadow-2xl relative text-center border border-[#E7E0D8]"
            >
              <div className="w-12 h-12 rounded-full bg-rose-100 text-rose-600 flex items-center justify-center mx-auto mb-3">
                <Trash2 className="w-6 h-6" />
              </div>
              <h3 className="text-base font-bold text-[#1C1917]">Delete Camera Product?</h3>
              <p className="text-xs text-[#78716C] mt-1 mb-6">
                Are you sure you want to remove <strong>{deleteTarget.name}</strong> from your inventory?
              </p>
              <div className="flex gap-3">
                <button
                  onClick={() => setDeleteTarget(null)}
                  className="natural-btn-secondary flex-1 text-xs py-2.5"
                >
                  Cancel
                </button>
                <button
                  onClick={handleConfirmDelete}
                  className="flex-1 py-2.5 bg-rose-600 hover:bg-rose-700 text-white rounded-xl text-xs font-bold uppercase tracking-wider"
                >
                  Delete
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
}
