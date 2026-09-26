import React, { useState, useEffect, useMemo } from 'react';
import { db } from '../firebase';
import { collection, onSnapshot, query, orderBy, where } from 'firebase/firestore';
import { FilmOrder, Transaction, Product, RewindSettings, PaymentMethod } from '../types';
import { handleFirestoreError } from '../utils';
import { DEFAULT_REWIND_SETTINGS } from '../utils/emailTemplates';
import { 
  Camera, 
  DollarSign, 
  Package, 
  Calendar, 
  Clock, 
  CheckCircle2, 
  AlertTriangle, 
  ShoppingBag, 
  Receipt, 
  QrCode, 
  ArrowRight,
  TrendingUp,
  User,
  Wallet,
  Building,
  CreditCard,
  PlusCircle
} from 'lucide-react';
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer } from 'recharts';
import { format, isToday, startOfDay, endOfDay, subDays } from 'date-fns';

interface Props {
  branch?: string;
  role?: 'admin' | 'staff';
  onNavigate?: (tab: string) => void;
}

export default function Dashboard({ branch = 'ALL', role = 'admin', onNavigate }: Props) {
  const [orders, setOrders] = useState<FilmOrder[]>([]);
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [settings, setSettings] = useState<RewindSettings>(DEFAULT_REWIND_SETTINGS);

  useEffect(() => {
    // 1. Settings
    const unsubSettings = onSnapshot(collection(db, 'rewind_settings'), (snap) => {
      if (!snap.empty) {
        setSettings({ ...DEFAULT_REWIND_SETTINGS, ...snap.docs[0].data() as RewindSettings });
      }
    });

    // 2. Film Orders
    const qOrders = query(collection(db, 'film_orders'), orderBy('createdAt', 'desc'));
    const unsubOrders = onSnapshot(qOrders, (snap) => {
      setOrders(snap.docs.map(d => ({ id: d.id, ...d.data() } as FilmOrder)));
    }, (err) => handleFirestoreError(err, 'list' as any, 'film_orders'));

    // 3. Transactions (POS sales)
    const qTrans = query(collection(db, 'transactions'), orderBy('timestamp', 'desc'));
    const unsubTrans = onSnapshot(qTrans, (snap) => {
      setTransactions(snap.docs.map(d => ({ id: d.id, ...d.data() } as Transaction)));
    }, (err) => handleFirestoreError(err, 'list' as any, 'transactions'));

    // 4. Products / Cameras
    const qProducts = collection(db, 'products');
    const unsubProducts = onSnapshot(qProducts, (snap) => {
      setProducts(snap.docs.map(d => ({ id: d.id, ...d.data() } as Product)));
    }, (err) => handleFirestoreError(err, 'list' as any, 'products'));

    return () => {
      unsubSettings();
      unsubOrders();
      unsubTrans();
      unsubProducts();
    };
  }, []);

  // Summary Metrics
  const metrics = useMemo(() => {
    const todayStr = format(new Date(), 'yyyy-MM-dd');
    let totalFilmRevenue = 0;
    let totalPosRevenue = 0;
    let todayRevenue = 0;

    // Payment method breakdown
    const paymentBreakdown: Record<string, number> = {
      'Cash': 0,
      'QR': 0,
      'Online transfer': 0,
      'Card': 0
    };

    orders.forEach(o => {
      if (o.paymentStatus === 'paid') {
        const amt = Number(o.totalPrice || 0);
        totalFilmRevenue += amt;
        const method = o.paymentMethod || 'Online transfer';
        paymentBreakdown[method] = (paymentBreakdown[method] || 0) + amt;

        if (o.createdAt && o.createdAt.startsWith(todayStr)) {
          todayRevenue += amt;
        }
      }
    });

    transactions.forEach(t => {
      if (t.type === 'sale') {
        const amt = Number(t.amount || 0);
        totalPosRevenue += amt;
        const method = t.paymentMethod || 'Cash';
        paymentBreakdown[method] = (paymentBreakdown[method] || 0) + amt;

        if (t.timestamp && t.timestamp.startsWith(todayStr)) {
          todayRevenue += amt;
        }
      }
    });

    // Film Lab Status Queue
    const inDeveloping = orders.filter(o => (o.status === 'registered' || o.status === 'in_process') && !o.pickupNotified).length;
    const readyForPickup = orders.filter(o => o.pickupNotified && o.status !== 'completed').length;
    const todayPickupAppointments = orders.filter(o => o.pickupAppointmentDate === todayStr && o.status !== 'completed');
    const completedPickups = orders.filter(o => o.status === 'completed').length;
    const unpaidInvoices = orders.filter(o => o.paymentStatus !== 'paid').length;

    // Low stock cameras
    const lowStockCameras = products.filter(p => Number(p.stock || 0) <= 2);

    return {
      totalRevenue: totalFilmRevenue + totalPosRevenue,
      totalFilmRevenue,
      totalPosRevenue,
      todayRevenue,
      paymentBreakdown,
      inDeveloping,
      readyForPickup,
      todayPickupAppointments,
      completedPickups,
      unpaidInvoices,
      lowStockCameras
    };
  }, [orders, transactions, products]);

  // Last 7 days chart data
  const chartData = useMemo(() => {
    const days: { day: string; date: string; film: number; pos: number; total: number }[] = [];
    for (let i = 6; i >= 0; i--) {
      const d = subDays(new Date(), i);
      const dateKey = format(d, 'yyyy-MM-dd');
      const label = format(d, 'EEE (dd)');

      let filmTotal = 0;
      let posTotal = 0;

      orders.forEach(o => {
        if (o.paymentStatus === 'paid' && o.createdAt && o.createdAt.startsWith(dateKey)) {
          filmTotal += Number(o.totalPrice || 0);
        }
      });

      transactions.forEach(t => {
        if (t.type === 'sale' && t.timestamp && t.timestamp.startsWith(dateKey)) {
          posTotal += Number(t.amount || 0);
        }
      });

      days.push({
        day: label,
        date: dateKey,
        film: filmTotal,
        pos: posTotal,
        total: filmTotal + posTotal
      });
    }
    return days;
  }, [orders, transactions]);

  const currency = settings.currency || 'RM';

  return (
    <div className="space-y-8 max-w-7xl mx-auto pb-16">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-[#C85A32]">
            <Camera className="w-4 h-4" />
            <span>Rewind Studio Executive Summary</span>
          </div>
          <h1 className="text-3xl font-serif font-bold text-[var(--text-app)] mt-1">Dashboard</h1>
          <p className="text-sm text-[var(--text-muted)] mt-1">
            Complete overview of film wash registrations, invoices, pickup appointments, and camera POS sales.
          </p>
        </div>

        {/* Quick Actions */}
        <div className="flex flex-wrap items-center gap-2.5">
          <button
            onClick={() => onNavigate && onNavigate('film-registration')}
            className="natural-btn-primary flex items-center gap-1.5 text-xs font-bold uppercase tracking-wider"
          >
            <PlusCircle className="w-4 h-4" />
            <span>New Film Drop-off</span>
          </button>
          <button
            onClick={() => onNavigate && onNavigate('pos')}
            className="natural-btn-secondary flex items-center gap-1.5 text-xs font-bold uppercase tracking-wider"
          >
            <ShoppingBag className="w-4 h-4 text-[#C85A32]" />
            <span>Product Sales (POS)</span>
          </button>
        </div>
      </div>

      {/* KPI Cards Row 1: Finances */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
        <div className="natural-card p-6 bg-[var(--bg-card)]">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold uppercase tracking-wider text-[var(--text-muted)]">Total Revenue</span>
            <div className="w-8 h-8 rounded-full bg-[#FAF0EB] text-[#C85A32] flex items-center justify-center">
              <DollarSign className="w-4 h-4" />
            </div>
          </div>
          <div className="text-2xl font-mono font-bold text-[var(--text-app)] mt-2">
            {currency} {metrics.totalRevenue.toFixed(2)}
          </div>
          <div className="text-xs text-[var(--text-muted)] mt-1">
            Film Wash ({currency} {metrics.totalFilmRevenue.toFixed(0)}) &bull; POS ({currency} {metrics.totalPosRevenue.toFixed(0)})
          </div>
        </div>

        <div className="natural-card p-6 bg-[var(--bg-card)]">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold uppercase tracking-wider text-emerald-700">Today's Sales</span>
            <div className="w-8 h-8 rounded-full bg-emerald-50 text-emerald-600 flex items-center justify-center">
              <TrendingUp className="w-4 h-4" />
            </div>
          </div>
          <div className="text-2xl font-mono font-bold text-emerald-700 mt-2">
            {currency} {metrics.todayRevenue.toFixed(2)}
          </div>
          <div className="text-xs text-emerald-600 mt-1">
            Collected today ({format(new Date(), 'dd MMM yyyy')})
          </div>
        </div>

        <div className="natural-card p-6 bg-[var(--bg-card)]">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold uppercase tracking-wider text-amber-700">Pending Invoices</span>
            <div className="w-8 h-8 rounded-full bg-amber-50 text-amber-600 flex items-center justify-center">
              <Receipt className="w-4 h-4" />
            </div>
          </div>
          <div className="text-2xl font-mono font-bold text-amber-700 mt-2">
            {metrics.unpaidInvoices} orders
          </div>
          <button
            onClick={() => onNavigate && onNavigate('invoices-receipts')}
            className="text-xs text-amber-800 font-bold hover:underline mt-1 flex items-center gap-1"
          >
            <span>Verify in Invoices & Receipts &rarr;</span>
          </button>
        </div>

        <div className="natural-card p-6 bg-[var(--bg-card)]">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold uppercase tracking-wider text-purple-700">Pick-up Queue</span>
            <div className="w-8 h-8 rounded-full bg-purple-50 text-purple-600 flex items-center justify-center">
              <Clock className="w-4 h-4" />
            </div>
          </div>
          <div className="text-2xl font-mono font-bold text-purple-700 mt-2">
            {metrics.readyForPickup} ready
          </div>
          <div className="text-xs text-purple-600 mt-1">
            {metrics.todayPickupAppointments.length} pickup slot(s) booked for today
          </div>
        </div>
      </div>

      {/* Grid: 7-Day Revenue Chart + Payment Method Breakdown */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">
        {/* Left: Recharts 7-Day Sales Trend */}
        <div className="lg:col-span-8 natural-card p-6 sm:p-8 bg-[var(--bg-card)]">
          <div className="flex items-center justify-between mb-6">
            <div>
              <h2 className="text-lg font-serif font-bold text-[var(--text-app)]">Last 7 Days Sales Trend</h2>
              <p className="text-xs text-[var(--text-muted)] mt-0.5">
                Comparison of Film Wash revenue vs. Camera & Goods POS sales
              </p>
            </div>
            <div className="flex items-center gap-4 text-xs font-bold">
              <div className="flex items-center gap-1.5">
                <span className="w-3 h-3 rounded-full bg-[#C85A32]" />
                <span className="text-[var(--text-muted)]">Film Wash</span>
              </div>
              <div className="flex items-center gap-1.5">
                <span className="w-3 h-3 rounded-full bg-[#292524]" />
                <span className="text-[var(--text-muted)]">Camera POS</span>
              </div>
            </div>
          </div>

          <div className="h-64 w-full">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={chartData} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                <XAxis dataKey="day" tick={{ fontSize: 11, fill: '#78716C' }} axisLine={false} tickLine={false} />
                <YAxis tick={{ fontSize: 11, fill: '#78716C' }} axisLine={false} tickLine={false} />
                <Tooltip
                  formatter={(val: any) => [`${currency} ${Number(val).toFixed(2)}`, '']}
                  contentStyle={{ backgroundColor: '#FFFFFF', borderRadius: '12px', border: '1px solid #E7E0D8' }}
                />
                <Bar dataKey="film" name="Film Wash" fill="#C85A32" radius={[4, 4, 0, 0]} stackId="a" />
                <Bar dataKey="pos" name="Camera POS" fill="#292524" radius={[4, 4, 0, 0]} stackId="a" />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* Right: Payment Method Breakdown */}
        <div className="lg:col-span-4 natural-card p-6 sm:p-8 bg-[var(--bg-card)] space-y-6">
          <div>
            <h2 className="text-lg font-serif font-bold text-[var(--text-app)]">Payment Channels</h2>
            <p className="text-xs text-[var(--text-muted)] mt-0.5">
              Sales by tender across all transactions
            </p>
          </div>

          <div className="space-y-4">
            {[
              { name: 'DuitNow QR', method: 'QR', icon: QrCode, color: 'text-amber-700 bg-amber-50' },
              { name: 'Online Transfer', method: 'Online transfer', icon: Building, color: 'text-blue-700 bg-blue-50' },
              { name: 'Cash', method: 'Cash', icon: Wallet, color: 'text-emerald-700 bg-emerald-50' },
              { name: 'Credit / Debit Card', method: 'Card', icon: CreditCard, color: 'text-purple-700 bg-purple-50' },
            ].map(item => {
              const amount = metrics.paymentBreakdown[item.method] || 0;
              const percent = metrics.totalRevenue > 0 ? (amount / metrics.totalRevenue) * 100 : 0;
              return (
                <div key={item.method} className="space-y-1.5">
                  <div className="flex items-center justify-between text-xs">
                    <div className="flex items-center gap-2">
                      <div className={`w-6 h-6 rounded-md flex items-center justify-center ${item.color}`}>
                        <item.icon className="w-3.5 h-3.5" />
                      </div>
                      <span className="font-bold text-[var(--text-app)]">{item.name}</span>
                    </div>
                    <span className="font-mono font-bold text-[var(--text-app)]">
                      {currency} {amount.toFixed(2)}
                    </span>
                  </div>
                  <div className="h-1.5 w-full bg-[var(--bg-app)] rounded-full overflow-hidden">
                    <div className="h-full bg-[#C85A32] rounded-full transition-all" style={{ width: `${percent}%` }} />
                  </div>
                </div>
              );
            })}
          </div>

          <div className="pt-4 border-t border-[var(--border-app)] text-center">
            <button
              onClick={() => onNavigate && onNavigate('invoices-receipts')}
              className="text-xs font-bold text-[#C85A32] hover:underline"
            >
              View Full Receipts Ledger &rarr;
            </button>
          </div>
        </div>
      </div>

      {/* Row 2: Today's Pickups + Camera Stock Alerts */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">
        {/* Left: Today's Scheduled Pickup Appointments (Tab 2 & 5) */}
        <div className="lg:col-span-7 natural-card p-6 bg-[var(--bg-card)]">
          <div className="flex items-center justify-between mb-4">
            <div>
              <h2 className="text-lg font-serif font-bold text-[var(--text-app)]">Today's Pickup Appointments</h2>
              <p className="text-xs text-[var(--text-muted)] mt-0.5">
                Customers scheduled to collect negative sleeves today
              </p>
            </div>
            <button
              onClick={() => onNavigate && onNavigate('calendar')}
              className="text-xs text-[#C85A32] hover:underline font-bold"
            >
              Open Calendar &rarr;
            </button>
          </div>

          {metrics.todayPickupAppointments.length === 0 ? (
            <div className="text-center py-10 bg-[var(--bg-app)] rounded-2xl border border-dashed border-[var(--border-app)] text-xs text-[var(--text-muted)]">
              No pickup appointments booked for today.
            </div>
          ) : (
            <div className="space-y-3">
              {metrics.todayPickupAppointments.map(o => (
                <div key={o.id} className="p-3.5 bg-[var(--bg-app)] border border-[var(--border-app)] rounded-2xl flex items-center justify-between text-xs">
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="font-mono font-bold text-[#C85A32]">{o.envelopeNumber}</span>
                      <span className="font-bold text-[var(--text-app)]">{o.customerName}</span>
                    </div>
                    <div className="text-[11px] text-[var(--text-muted)] mt-0.5">
                      {o.filmType} ({o.quantity} roll{o.quantity > 1 ? 's' : ''}) &bull; {o.customerPhone}
                    </div>
                  </div>
                  <div className="text-right">
                    <span className="inline-block px-2.5 py-1 rounded-lg font-mono font-bold text-xs bg-[#FAF0EB] text-[#C85A32]">
                      {o.pickupTimeSlot}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Right: Low Stock Camera Alerts (Tab 7) */}
        <div className="lg:col-span-5 natural-card p-6 bg-[var(--bg-card)]">
          <div className="flex items-center justify-between mb-4">
            <div>
              <h2 className="text-lg font-serif font-bold text-[var(--text-app)]">Low Camera Stock Alert</h2>
              <p className="text-xs text-[var(--text-muted)] mt-0.5">
                Items with 2 or fewer units in inventory
              </p>
            </div>
            <button
              onClick={() => onNavigate && onNavigate('products')}
              className="text-xs text-[#C85A32] hover:underline font-bold"
            >
              Inventory &rarr;
            </button>
          </div>

          {metrics.lowStockCameras.length === 0 ? (
            <div className="text-center py-10 bg-[var(--bg-app)] rounded-2xl border border-dashed border-[var(--border-app)] text-xs text-[var(--text-muted)]">
              All camera variants are well-stocked.
            </div>
          ) : (
            <div className="space-y-2.5">
              {metrics.lowStockCameras.slice(0, 5).map(p => (
                <div key={p.id} className="p-3 bg-[var(--bg-app)] border border-[var(--border-app)] rounded-xl flex items-center justify-between text-xs">
                  <div>
                    <div className="font-bold text-[var(--text-app)]">{p.name}</div>
                    <div className="text-[10px] text-[var(--text-muted)] font-mono">{p.brand} &bull; {p.type || p.productCategory}</div>
                  </div>
                  <div className="text-right">
                    <span className="font-bold text-rose-600 bg-rose-50 px-2 py-0.5 rounded text-[11px]">
                      {p.stock} left
                    </span>
                    <div className="text-[10px] text-[var(--text-muted)] mt-0.5 font-mono">
                      {currency} {Number(p.price || 0).toFixed(2)}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
