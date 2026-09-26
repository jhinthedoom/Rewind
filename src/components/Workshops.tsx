import React, { useState, useEffect } from 'react';
import { db } from '../firebase';
import { collection, onSnapshot, addDoc, updateDoc, deleteDoc, doc, query, orderBy, where } from 'firebase/firestore';
import { Workshop, OperationType } from '../types';
import { handleFirestoreError } from '../utils';
import { Plus, Edit2, Trash2, Save, X, Users, DollarSign, Wallet } from 'lucide-react';
import { motion } from 'motion/react';
import { ConfirmationModal } from './ConfirmationModal';

export default function Workshops({ branch = 'ALL' }: { branch?: string }) {
  const [workshops, setWorkshops] = useState<Workshop[]>([]);
  const [isEditing, setIsEditing] = useState<string | null>(null);
  const [isAdding, setIsAdding] = useState(false);
  
  const [formData, setFormData] = useState<Omit<Workshop, 'id'>>({
    name: '',
    description: '',
    totalPrice: 0,
    depositAmount: 0,
    priceDisplay: '',
    isVariablePrice: false,
    location: 'ALL',
  });

  useEffect(() => {
    const q = collection(db, 'workshops');
    const unsubscribe = onSnapshot(q, (snapshot) => {
      let docs = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Workshop));
      if (branch !== 'ALL') {
        docs = docs.filter(w => w.location === 'ALL' || w.location === branch);
      }
      // Sort by name alphabetically client-side
      docs.sort((a, b) => (a.name || '').localeCompare(b.name || ''));
      setWorkshops(docs);
    }, (error) => handleFirestoreError(error, OperationType.LIST, 'workshops'));

    return () => unsubscribe();
  }, [branch]);

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      if (isEditing) {
        await updateDoc(doc(db, 'workshops', isEditing), { ...formData });
        setIsEditing(null);
      } else {
        await addDoc(collection(db, 'workshops'), { ...formData });
        setIsAdding(false);
      }
      setFormData({ name: '', description: '', totalPrice: 0, depositAmount: 0, priceDisplay: '', isVariablePrice: false, location: 'ALL' });
    } catch (error) {
      handleFirestoreError(error, OperationType.WRITE, 'workshops');
    }
  };

  const handleEdit = (ws: Workshop) => {
    setFormData({
      name: ws.name,
      description: ws.description || '',
      totalPrice: ws.totalPrice,
      depositAmount: ws.depositAmount,
      priceDisplay: ws.priceDisplay || '',
      isVariablePrice: !!ws.isVariablePrice,
      location: ws.location || 'ALL'
    });
    setIsEditing(ws.id!);
    setIsAdding(false);
  };

  const [deleteConfirmId, setDeleteConfirmId] = useState<string | null>(null);

  const handleDelete = (id: string) => {
    setDeleteConfirmId(id);
  };

  const handleConfirmDelete = async () => {
    if (!deleteConfirmId) return;
    try {
      await deleteDoc(doc(db, 'workshops', deleteConfirmId));
    } catch (error) {
      handleFirestoreError(error, OperationType.DELETE, `workshops/${deleteConfirmId}`);
    }
  };

  return (
    <div className="space-y-10">
      <div className="flex flex-col sm:flex-row justify-between items-stretch sm:items-center gap-4 bg-[#F2EFE9] p-4 md:p-6 rounded-[32px] border border-[#D9D1C7]/50 shadow-sm">
        <div>
          <h2 className="font-serif italic font-bold text-lg md:text-xl text-[#2D241E]">Session Curriculum</h2>
          <p className="text-[10px] font-black text-[#8C8379] uppercase tracking-widest mt-1">Configure workshop experiences</p>
        </div>
        <button
          onClick={() => {
            setIsAdding(true);
            setIsEditing(null);
            setFormData({ name: '', description: '', totalPrice: 0, depositAmount: 0, priceDisplay: '', isVariablePrice: false, location: branch === 'ALL' ? 'PG' : branch as any });
          }}
          className="natural-btn-primary flex items-center justify-center p-4 sm:p-3"
        >
          <Plus className="w-4 h-4 mr-2" />
          Define Workshop
        </button>
      </div>

      {(isAdding || isEditing) && (
        <motion.div 
          initial={{ opacity: 0, scale: 0.98 }}
          animate={{ opacity: 1, scale: 1 }}
          className="bg-white p-6 md:p-10 rounded-[32px] md:rounded-[40px] border border-[#D9D1C7] shadow-xl relative overflow-hidden"
        >
          <div className="absolute top-0 left-0 w-full h-1 bg-[#7D6B5D]/30"></div>
          <header className="flex justify-between items-center mb-8 md:mb-10">
            <div>
              <h3 className="text-xl md:text-2xl font-serif italic text-[#2D241E]">{isEditing ? 'Modify Workshop' : 'New Workshop Definition'}</h3>
              <p className="text-[10px] text-[#8C8379] font-bold mt-1 uppercase tracking-widest">Designing local learning</p>
            </div>
            <button onClick={() => { setIsAdding(false); setIsEditing(null); }} className="p-2 text-[#8C8379] hover:text-[#2D241E] bg-[#FAF9F6] rounded-full">
              <X size={18} />
            </button>
          </header>
          <form onSubmit={handleSave} className="grid grid-cols-1 md:grid-cols-2 gap-6 md:gap-8">
            <div className="space-y-2">
              <label className="text-[10px] font-black text-[#8C8379] uppercase tracking-widest px-1">Workshop Title</label>
              <input
                required
                type="text"
                placeholder="Ex: Wheel Throwing for Beginners"
                className="natural-input w-full"
                value={formData.name}
                onChange={(e) => setFormData({ ...formData, name: e.target.value })}
              />
            </div>
            <div className="space-y-2">
              <label className="text-[10px] font-black text-[#8C8379] uppercase tracking-widest px-1">Total Fee (RM)</label>
              <input
                required
                type="number"
                step="0.01"
                className="natural-input w-full"
                value={formData.totalPrice || ''}
                onChange={(e) => setFormData({ ...formData, totalPrice: parseFloat(e.target.value) || 0 })}
              />
            </div>
            <div className="space-y-2">
              <label className="text-[10px] font-black text-[#8C8379] uppercase tracking-widest px-1">Deposit Required (RM)</label>
              <input
                required
                type="number"
                step="0.01"
                className="natural-input w-full"
                value={formData.depositAmount || ''}
                onChange={(e) => setFormData({ ...formData, depositAmount: parseFloat(e.target.value) || 0 })}
              />
            </div>
            <div className="space-y-2">
              <label className="text-[10px] font-black text-[#8C8379] uppercase tracking-widest px-1">Experience Description</label>
              <input
                type="text"
                placeholder="Focus on specific techniques..."
                className="natural-input w-full"
                value={formData.description}
                onChange={(e) => setFormData({ ...formData, description: e.target.value })}
              />
            </div>
            {/* Studio Location is defaulted to ALL since there is only one branch now */}
            <div className="space-y-2">
              <label className="text-[10px] font-black text-[#8C8379] uppercase tracking-widest px-1">Price Display (Optional Range/Note)</label>
              <input
                type="text"
                placeholder="Ex: RM50 - RM150"
                className="natural-input w-full"
                value={formData.priceDisplay}
                onChange={(e) => setFormData({ ...formData, priceDisplay: e.target.value })}
              />
            </div>
            <div className="md:col-span-2 space-y-2">
              <div className="flex items-center gap-3 p-4 bg-[#FAF9F6] rounded-2xl border border-[#D9D1C7]/30 hover:border-[#8B9A82] transition-colors cursor-pointer" onClick={() => setFormData(f => ({ ...f, isVariablePrice: !f.isVariablePrice }))}>
                <input
                  type="checkbox"
                  className="w-5 h-5 accent-[#8B9A82]"
                  checked={formData.isVariablePrice}
                  onChange={(e) => setFormData({ ...formData, isVariablePrice: e.target.checked })}
                />
                <div>
                  <p className="text-[10px] font-black text-[#8C8379] uppercase tracking-widest">Ceramic Painting Mode (Variable Pricing)</p>
                  <p className="text-[10px] md:text-xs text-[#2D241E] italic mt-0.5">Deposit is deductible from the final item price (RM69-99 model)</p>
                </div>
              </div>
            </div>
            <div className="md:col-span-2 flex flex-col-reverse sm:flex-row justify-end gap-3 pt-6">
              <button
                type="button"
                onClick={() => { setIsAdding(false); setIsEditing(null); }}
                className="natural-btn-secondary w-full sm:w-auto"
              >
                Cancel
              </button>
              <button
                type="submit"
                className="natural-btn-primary w-full sm:w-auto flex items-center justify-center py-4 sm:py-3"
              >
                <Save className="w-4 h-4 mr-2" />
                {isEditing ? 'Save Workshop' : 'Launch Workshop'}
              </button>
            </div>
          </form>
        </motion.div>
      )}

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8">
        {workshops.map((ws) => (
          <motion.div
            layout
            key={ws.id}
            className="group natural-card p-8 hover:bg-[#F2EFE9] transition-all flex flex-col"
          >
            <div className="flex justify-between items-start mb-6">
              <div className="w-10 h-10 bg-[#7D6B5D]/10 rounded-full flex items-center justify-center text-[#7D6B5D]">
                <Users className="w-5 h-5" />
              </div>
              <div className="flex gap-2">
                <button 
                  onClick={() => handleEdit(ws)}
                  className="p-2 text-[#8C8379] hover:text-[#2D241E] transition-colors"
                >
                  <Edit2 size={16} />
                </button>
                <button 
                  onClick={() => handleDelete(ws.id!)}
                  className="p-2 text-[#8C8379] hover:text-red-400 transition-colors"
                >
                  <Trash2 size={16} />
                </button>
              </div>
            </div>
            
            <h4 className="font-serif italic font-bold text-2xl text-[#2D241E] mb-1">{ws.name}</h4>
            <div className="flex flex-wrap gap-2 mb-3">
              {/* Branch badge removed since there is only one branch now */}
              {ws.priceDisplay && (
                <div className="inline-block px-3 py-1 bg-[#8B9A82]/10 text-[#8B9A82] text-[10px] font-black uppercase tracking-widest rounded-full">
                  {ws.priceDisplay}
                </div>
              )}
            </div>
            <p className="text-[#8C8379] text-sm mb-10 flex-grow font-medium leading-relaxed">{ws.description || 'Master the art of pottery.'}</p>
            
            <div className="space-y-4 pt-6 border-t border-[#D9D1C7]/30">
              <div className="flex justify-between items-center">
                <span className="text-[10px] font-black text-[#8C8379] uppercase tracking-widest flex items-center gap-2">
                  <DollarSign size={12} /> Full Price
                </span>
                <span className="font-serif italic font-bold text-lg text-[#2D241E]">RM{ws.totalPrice.toFixed(2)}</span>
              </div>
              <div className="flex justify-between items-center">
                <span className="text-[10px] font-black text-[#8C8379] uppercase tracking-widest flex items-center gap-2">
                  <Wallet size={12} /> Deposit
                </span>
                <span className="font-bold text-[#8B9A82] text-sm">RM{ws.depositAmount.toFixed(2)}</span>
              </div>
              <div className="flex justify-between items-center text-[10px] text-[#8C8379] font-black uppercase tracking-widest bg-white/50 px-3 py-2 rounded-lg">
                <span>Final Balance</span>
                <span className="text-[#2D241E]">RM{(ws.totalPrice - ws.depositAmount).toFixed(2)}</span>
              </div>
            </div>
          </motion.div>
        ))}
      </div>

      {workshops.length === 0 && !isAdding && (
        <div className="text-center py-24 bg-[#F2EFE9]/30 rounded-[40px] border-2 border-dashed border-[#D9D1C7]">
          <Users className="w-12 h-12 text-[#D9D1C7] mx-auto mb-4" />
          <h3 className="text-[#2D241E] font-serif italic text-xl">No workshops defined</h3>
          <p className="text-[#8C8379] text-sm mt-2">Create your first class to open the studio.</p>
        </div>
      )}

      <ConfirmationModal
        isOpen={deleteConfirmId !== null}
        onClose={() => setDeleteConfirmId(null)}
        onConfirm={handleConfirmDelete}
        title="Delete Workshop"
        message="Are you sure you want to delete this workshop? This action cannot be undone and will not delete existing bookings."
        confirmText="Delete"
        cancelText="Cancel"
        isDestructive={true}
      />
    </div>
  );
}
