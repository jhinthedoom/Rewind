import React, { useState, useEffect } from 'react';
import { db } from '../firebase';
import { collection, onSnapshot, setDoc, doc } from 'firebase/firestore';
import { RewindSettings } from '../types';
import { handleFirestoreError } from '../utils';
import { DEFAULT_REWIND_SETTINGS } from '../utils/emailTemplates';
import { 
  Settings, 
  Save, 
  DollarSign, 
  Building, 
  Mail, 
  Shield, 
  QrCode, 
  Clock, 
  Check, 
  AlertCircle, 
  RefreshCw,
  Camera,
  Layers,
  Sparkles,
  Lock,
  ExternalLink
} from 'lucide-react';
import { motion } from 'motion/react';

const ALL_SYSTEM_TABS = [
  { id: 'dashboard', name: '1. Dashboard', desc: 'Summary of orders, revenue, pickups, and stock alerts' },
  { id: 'calendar', name: '2. Booking Calendar', desc: 'Pickup appointments and future event schedule' },
  { id: 'film-registration', name: '3. Film Registration', desc: 'Drop-off registration with auto-invoice dispatch' },
  { id: 'invoices-receipts', name: '4. Invoices & Receipts', desc: 'Payment verification, receipt dispatch, and PDF generation' },
  { id: 'pickups', name: '5. Film Pickups', desc: 'Film wash notification with appointment QR booking' },
  { id: 'pos', name: '6. Product Sales (POS)', desc: 'Point of sale, camera/film sales, and cashier tracking' },
  { id: 'products', name: '7. Inventory Management', desc: 'Camera stock catalog by type, brand, and quantity' },
  { id: 'expenses', name: '8. Spending & Assets', desc: 'Expense tracking, current assets, and financial ledger' },
  { id: 'setup', name: '9. Setup', desc: 'System configuration, pricing, and role permissions' },
  { id: 'staff', name: '10. Staff Management', desc: 'Portal login accounts and staff access control' },
];

export default function Setup() {
  const [settings, setSettings] = useState<RewindSettings>(DEFAULT_REWIND_SETTINGS);
  const [activeSection, setActiveSection] = useState<'pricing' | 'studio' | 'permissions' | 'smtp'>('pricing');
  const [isSaving, setIsSaving] = useState(false);
  const [feedback, setFeedback] = useState<{ type: 'success' | 'error'; message: string } | null>(null);

  // SMTP Testing
  const [smtpTesting, setSmtpTesting] = useState(false);
  const [smtpResult, setSmtpResult] = useState<string | null>(null);

  useEffect(() => {
    const unsub = onSnapshot(collection(db, 'rewind_settings'), (snap) => {
      if (!snap.empty) {
        setSettings({ ...DEFAULT_REWIND_SETTINGS, ...snap.docs[0].data() as RewindSettings, id: snap.docs[0].id });
      }
    });
    return () => unsub();
  }, []);

  const handleSaveSettings = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSaving(true);
    setFeedback(null);

    try {
      const docId = settings.id || 'main';
      await setDoc(doc(db, 'rewind_settings', docId), settings, { merge: true });
      setFeedback({ type: 'success', message: 'Settings saved successfully!' });
      setTimeout(() => setFeedback(null), 3000);
    } catch (err: any) {
      setFeedback({ type: 'error', message: err.message || 'Failed to save settings.' });
    } finally {
      setIsSaving(false);
    }
  };

  const handleToggleTabPermission = (tabId: string) => {
    const current = settings.staffAllowedTabs || [];
    const exists = current.includes(tabId);
    let updated: string[];
    if (exists) {
      updated = current.filter(id => id !== tabId);
    } else {
      updated = [...current, tabId];
    }
    setSettings({ ...settings, staffAllowedTabs: updated });
  };

  const handleTestSmtp = async () => {
    setSmtpTesting(true);
    setSmtpResult(null);
    try {
      const res = await fetch('/api/verify-smtp', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({}),
      });
      const data = await res.json();
      if (data.success) {
        setSmtpResult('✓ SMTP connection verified successfully!');
      } else {
        setSmtpResult(`Note: ${data.message || 'Simulated delivery active (standard preview mode).'}`);
      }
    } catch (err: any) {
      setSmtpResult('Running in simulated dispatch mode. Live emails work automatically once SMTP server is configured in environment.');
    } finally {
      setSmtpTesting(false);
    }
  };

  const publicRegistrationUrl = `${window.location.origin}${window.location.pathname}?view=register`;

  return (
    <div className="space-y-8 max-w-7xl mx-auto pb-16">
      {/* Header */}
      <div>
        <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-[#C85A32]">
          <Settings className="w-4 h-4" />
          <span>System & Lab Configuration</span>
        </div>
        <h1 className="text-3xl font-serif font-bold text-[var(--text-app)] mt-1">Studio Setup</h1>
        <p className="text-sm text-[var(--text-muted)] mt-1">
          Customize film wash prices, operating hours, invoice bank accounts, and staff tab access permissions.
        </p>
      </div>

      {/* Nav Tabs within Setup */}
      <div className="flex flex-wrap items-center gap-2 border-b border-[var(--border-app)] pb-3">
        {[
          { id: 'pricing', label: 'Film Wash Pricing & Currency', icon: DollarSign },
          { id: 'studio', label: 'Studio & Invoice Bank Details', icon: Building },
          { id: 'permissions', label: 'Role Tab Access Permissions', icon: Shield },
          { id: 'smtp', label: 'Email & Public Form Links', icon: Mail },
        ].map((tab) => {
          const isActive = activeSection === tab.id;
          return (
            <button
              key={tab.id}
              onClick={() => setActiveSection(tab.id as any)}
              className={`flex items-center gap-2 px-4 py-2.5 rounded-xl text-xs font-bold transition-all ${
                isActive
                  ? 'bg-[#1C1917] text-white shadow-xs'
                  : 'bg-[var(--bg-card)] text-[var(--text-muted)] hover:text-[var(--text-app)] border border-[var(--border-app)]'
              }`}
            >
              <tab.icon className="w-4 h-4" />
              <span>{tab.label}</span>
            </button>
          );
        })}
      </div>

      {feedback && (
        <div className={`p-4 rounded-xl text-xs font-bold flex items-center gap-2 ${
          feedback.type === 'success' 
            ? 'bg-emerald-50 text-emerald-800 border border-emerald-200' 
            : 'bg-rose-50 text-rose-800 border border-rose-200'
        }`}>
          {feedback.type === 'success' ? <Check className="w-4 h-4" /> : <AlertCircle className="w-4 h-4" />}
          <span>{feedback.message}</span>
        </div>
      )}

      <form onSubmit={handleSaveSettings} className="space-y-6">
        {/* SECTION 1: Film Wash Pricing & Currency */}
        {activeSection === 'pricing' && (
          <div className="natural-card p-6 sm:p-8 bg-[var(--bg-card)] space-y-6">
            <div>
              <h2 className="text-lg font-serif font-bold text-[var(--text-app)]">Film Wash & Development Rates</h2>
              <p className="text-xs text-[var(--text-muted)] mt-0.5">
                Set default rates charged per roll on customer film registration and invoices.
              </p>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-4">
              <div>
                <label className="block text-[11px] font-bold uppercase tracking-wider text-[var(--text-muted)] mb-1.5">
                  Currency Symbol *
                </label>
                <input
                  type="text"
                  required
                  value={settings.currency}
                  onChange={(e) => setSettings({ ...settings, currency: e.target.value })}
                  className="natural-input w-full font-bold font-mono"
                  placeholder="e.g. RM"
                />
              </div>

              <div>
                <label className="block text-[11px] font-bold uppercase tracking-wider text-[var(--text-muted)] mb-1.5">
                  C-41 Color Negative *
                </label>
                <div className="relative">
                  <span className="absolute left-3 top-1/2 -translate-y-1/2 text-xs font-bold text-[var(--text-muted)]">
                    {settings.currency}
                  </span>
                  <input
                    type="number"
                    step="0.5"
                    min={0}
                    required
                    value={settings.priceC41}
                    onChange={(e) => setSettings({ ...settings, priceC41: parseFloat(e.target.value) || 0 })}
                    className="natural-input w-full pl-10 font-mono font-bold"
                  />
                </div>
                <span className="text-[10px] text-[var(--text-muted)] mt-1 block">per roll developed</span>
              </div>

              <div>
                <label className="block text-[11px] font-bold uppercase tracking-wider text-[var(--text-muted)] mb-1.5">
                  Black and White (B&W) *
                </label>
                <div className="relative">
                  <span className="absolute left-3 top-1/2 -translate-y-1/2 text-xs font-bold text-[var(--text-muted)]">
                    {settings.currency}
                  </span>
                  <input
                    type="number"
                    step="0.5"
                    min={0}
                    required
                    value={settings.priceBW}
                    onChange={(e) => setSettings({ ...settings, priceBW: parseFloat(e.target.value) || 0 })}
                    className="natural-input w-full pl-10 font-mono font-bold"
                  />
                </div>
                <span className="text-[10px] text-[var(--text-muted)] mt-1 block">per roll developed</span>
              </div>

              <div>
                <label className="block text-[11px] font-bold uppercase tracking-wider text-[var(--text-muted)] mb-1.5">
                  ECN-2 (Motion Film) *
                </label>
                <div className="relative">
                  <span className="absolute left-3 top-1/2 -translate-y-1/2 text-xs font-bold text-[var(--text-muted)]">
                    {settings.currency}
                  </span>
                  <input
                    type="number"
                    step="0.5"
                    min={0}
                    required
                    value={settings.priceECN2}
                    onChange={(e) => setSettings({ ...settings, priceECN2: parseFloat(e.target.value) || 0 })}
                    className="natural-input w-full pl-10 font-mono font-bold"
                  />
                </div>
                <span className="text-[10px] text-[var(--text-muted)] mt-1 block">per roll (includes remjet removal)</span>
              </div>
            </div>
          </div>
        )}

        {/* SECTION 2: Studio Information & Bank Transfer Details */}
        {activeSection === 'studio' && (
          <div className="natural-card p-6 sm:p-8 bg-[var(--bg-card)] space-y-6">
            <div>
              <h2 className="text-lg font-serif font-bold text-[var(--text-app)]">Studio Details & Payment Info</h2>
              <p className="text-xs text-[var(--text-muted)] mt-0.5">
                These details appear in generated PDF Invoices, Receipts, and customer notifications.
              </p>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="block text-[11px] font-bold uppercase tracking-wider text-[var(--text-muted)] mb-1.5">
                  Studio Name *
                </label>
                <input
                  type="text"
                  required
                  value={settings.studioName}
                  onChange={(e) => setSettings({ ...settings, studioName: e.target.value })}
                  className="natural-input w-full font-bold"
                />
              </div>

              <div>
                <label className="block text-[11px] font-bold uppercase tracking-wider text-[var(--text-muted)] mb-1.5">
                  Operating Hours (Daily Slots) *
                </label>
                <input
                  type="text"
                  required
                  value={settings.operatingHours}
                  onChange={(e) => setSettings({ ...settings, operatingHours: e.target.value })}
                  className="natural-input w-full"
                  placeholder="e.g. 11:00 AM - 7:00 PM (Daily)"
                />
              </div>

              <div>
                <label className="block text-[11px] font-bold uppercase tracking-wider text-[var(--text-muted)] mb-1.5">
                  Studio Phone / WhatsApp *
                </label>
                <input
                  type="text"
                  required
                  value={settings.phone}
                  onChange={(e) => setSettings({ ...settings, phone: e.target.value })}
                  className="natural-input w-full"
                />
              </div>

              <div>
                <label className="block text-[11px] font-bold uppercase tracking-wider text-[var(--text-muted)] mb-1.5">
                  Studio Email *
                </label>
                <input
                  type="email"
                  required
                  value={settings.email}
                  onChange={(e) => setSettings({ ...settings, email: e.target.value })}
                  className="natural-input w-full"
                />
              </div>

              <div className="sm:col-span-2">
                <label className="block text-[11px] font-bold uppercase tracking-wider text-[var(--text-muted)] mb-1.5">
                  Physical Studio Address *
                </label>
                <input
                  type="text"
                  required
                  value={settings.address}
                  onChange={(e) => setSettings({ ...settings, address: e.target.value })}
                  className="natural-input w-full"
                />
              </div>
            </div>

            <div className="pt-4 border-t border-[var(--border-app)] space-y-4">
              <h3 className="text-sm font-bold uppercase tracking-wider text-[var(--text-app)]">
                Bank Transfer Instructions (Printed on Unpaid Invoices)
              </h3>
              
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                <div>
                  <label className="block text-[11px] font-bold uppercase tracking-wider text-[var(--text-muted)] mb-1.5">
                    Bank Name *
                  </label>
                  <input
                    type="text"
                    required
                    value={settings.bankName}
                    onChange={(e) => setSettings({ ...settings, bankName: e.target.value })}
                    className="natural-input w-full"
                    placeholder="e.g. Maybank"
                  />
                </div>

                <div>
                  <label className="block text-[11px] font-bold uppercase tracking-wider text-[var(--text-muted)] mb-1.5">
                    Account Number *
                  </label>
                  <input
                    type="text"
                    required
                    value={settings.bankAccountNo}
                    onChange={(e) => setSettings({ ...settings, bankAccountNo: e.target.value })}
                    className="natural-input w-full font-mono font-bold"
                    placeholder="e.g. 5123 4567 8901"
                  />
                </div>

                <div>
                  <label className="block text-[11px] font-bold uppercase tracking-wider text-[var(--text-muted)] mb-1.5">
                    Account Name *
                  </label>
                  <input
                    type="text"
                    required
                    value={settings.bankAccountName}
                    onChange={(e) => setSettings({ ...settings, bankAccountName: e.target.value })}
                    className="natural-input w-full"
                    placeholder="e.g. Rewind Studio Enterprise"
                  />
                </div>
              </div>
            </div>
          </div>
        )}

        {/* SECTION 3: Role Tab Access Permissions */}
        {activeSection === 'permissions' && (
          <div className="natural-card p-6 sm:p-8 bg-[var(--bg-card)] space-y-6">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
              <div>
                <h2 className="text-lg font-serif font-bold text-[var(--text-app)]">Staff Tab Access Matrix</h2>
                <p className="text-xs text-[var(--text-muted)] mt-0.5">
                  Configure which tabs are visible to staff accounts. Admins always have full access to all 10 tabs.
                </p>
              </div>
              <span className="px-3 py-1 bg-amber-50 text-amber-800 border border-amber-200 rounded-lg text-xs font-bold">
                Admin Custom Access Control
              </span>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              {ALL_SYSTEM_TABS.map((tab) => {
                const isAllowed = (settings.staffAllowedTabs || []).includes(tab.id);
                return (
                  <label
                    key={tab.id}
                    className={`p-4 rounded-2xl border transition-all cursor-pointer flex items-start gap-3 ${
                      isAllowed
                        ? 'bg-[#FAF0EB] border-[#C85A32]/40 text-[var(--text-app)]'
                        : 'bg-[var(--bg-app)] border-[var(--border-app)] text-[var(--text-muted)] hover:border-gray-300'
                    }`}
                  >
                    <input
                      type="checkbox"
                      checked={isAllowed}
                      onChange={() => handleToggleTabPermission(tab.id)}
                      className="mt-0.5 w-4 h-4 rounded text-[#C85A32] accent-[#C85A32] cursor-pointer"
                    />
                    <div>
                      <div className="text-xs font-bold text-[var(--text-app)]">{tab.name}</div>
                      <div className="text-[11px] text-[var(--text-muted)] mt-0.5">{tab.desc}</div>
                    </div>
                  </label>
                );
              })}
            </div>
          </div>
        )}

        {/* SECTION 4: Email & Public Form Links */}
        {activeSection === 'smtp' && (
          <div className="natural-card p-6 sm:p-8 bg-[var(--bg-card)] space-y-6">
            <div>
              <h2 className="text-lg font-serif font-bold text-[var(--text-app)]">Customer Form Links & Email Settings</h2>
              <p className="text-xs text-[var(--text-muted)] mt-0.5">
                Share public registration QR and test SMTP connectivity.
              </p>
            </div>

            <div className="p-4 bg-[#FAF7F2] rounded-2xl border border-[#E7E0D8] space-y-2">
              <div className="text-xs font-bold uppercase tracking-wider text-[#C85A32] flex items-center gap-1.5">
                <QrCode className="w-4 h-4" />
                <span>Public Customer Registration URL</span>
              </div>
              <div className="flex items-center gap-2">
                <input
                  readOnly
                  value={publicRegistrationUrl}
                  className="natural-input text-xs font-mono flex-1 bg-white"
                />
                <a
                  href={publicRegistrationUrl}
                  target="_blank"
                  rel="noreferrer"
                  className="natural-btn-secondary py-2 px-3 text-xs font-bold flex items-center gap-1 shrink-0"
                >
                  <ExternalLink className="w-3.5 h-3.5" />
                  <span>Open</span>
                </a>
              </div>
            </div>

            <div className="pt-4 border-t border-[var(--border-app)] space-y-4">
              <div className="flex items-center justify-between">
                <div>
                  <h3 className="text-sm font-bold uppercase tracking-wider text-[var(--text-app)]">
                    Business Email Dispatcher
                  </h3>
                  <p className="text-xs text-[var(--text-muted)]">
                    Invoices, Receipts, and Pick-up QR notifications are dispatched automatically via the backend email engine.
                  </p>
                </div>
                <button
                  type="button"
                  onClick={handleTestSmtp}
                  disabled={smtpTesting}
                  className="natural-btn-secondary text-xs py-2 px-3 font-bold"
                >
                  {smtpTesting ? 'Testing...' : 'Test Connection'}
                </button>
              </div>

              {smtpResult && (
                <div className="p-3 rounded-xl bg-stone-100 text-stone-800 text-xs font-medium border border-stone-200">
                  {smtpResult}
                </div>
              )}
            </div>
          </div>
        )}

        {/* Save Bar */}
        <div className="flex justify-end pt-4">
          <button
            type="submit"
            disabled={isSaving}
            className="natural-btn-primary px-8 py-3.5 text-xs uppercase tracking-widest font-black flex items-center gap-2 shadow-md cursor-pointer disabled:opacity-50"
          >
            <Save className="w-4 h-4" />
            <span>{isSaving ? 'Saving...' : 'Save All Settings'}</span>
          </button>
        </div>
      </form>
    </div>
  );
}
