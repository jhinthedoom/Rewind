import React, { useState, useEffect, useMemo } from 'react';
import { db } from '../firebase';
import { collection, onSnapshot, doc, updateDoc, addDoc, query, orderBy } from 'firebase/firestore';
import { FilmOrder, RewindSettings } from '../types';
import { handleFirestoreError } from '../utils';
import { 
  sendBusinessEmail, 
  generateFilmPickupNotificationEmail, 
  DEFAULT_REWIND_SETTINGS 
} from '../utils/emailTemplates';
import { 
  PackageCheck, 
  QrCode, 
  Clock, 
  Calendar, 
  Mail, 
  Search, 
  CheckCircle2, 
  AlertTriangle, 
  Check, 
  ExternalLink,
  ChevronRight,
  Filter,
  User,
  Sparkles,
  Phone
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { format, addDays, differenceInDays } from 'date-fns';

const TIME_SLOTS = [
  '11:00 AM - 12:00 PM',
  '12:00 PM - 01:00 PM',
  '01:00 PM - 02:00 PM',
  '02:00 PM - 03:00 PM',
  '03:00 PM - 04:00 PM',
  '04:00 PM - 05:00 PM',
  '05:00 PM - 06:00 PM',
  '06:00 PM - 07:00 PM',
];

interface Props {
  branch?: string;
  onGoToCalendar?: () => void;
}

export default function FilmPickups({ branch = 'ALL', onGoToCalendar }: Props) {
  const [orders, setOrders] = useState<FilmOrder[]>([]);
  const [settings, setSettings] = useState<RewindSettings>(DEFAULT_REWIND_SETTINGS);

  // Filter & Search
  const [tabFilter, setTabFilter] = useState<'all' | 'processing' | 'notified' | 'scheduled' | 'completed'>('all');
  const [searchQuery, setSearchQuery] = useState('');

  // Manual Schedule Modal State (for staff scheduling on customer behalf)
  const [schedulingOrder, setSchedulingOrder] = useState<FilmOrder | null>(null);
  const [manualDate, setManualDate] = useState<string>(format(new Date(), 'yyyy-MM-dd'));
  const [manualSlot, setManualSlot] = useState<string>(TIME_SLOTS[0]);
  const [manualNotes, setManualNotes] = useState<string>('');

  // Action Feedback & Busy State
  const [actionFeedback, setActionFeedback] = useState<string | null>(null);
  const [processingId, setProcessingId] = useState<string | null>(null);

  useEffect(() => {
    const unsubSettings = onSnapshot(collection(db, 'rewind_settings'), (snap) => {
      if (!snap.empty) {
        setSettings({ ...DEFAULT_REWIND_SETTINGS, ...snap.docs[0].data() as RewindSettings });
      }
    });

    const q = query(collection(db, 'film_orders'), orderBy('createdAt', 'desc'));
    const unsubOrders = onSnapshot(q, (snap) => {
      const list = snap.docs.map(d => ({ id: d.id, ...d.data() } as FilmOrder));
      setOrders(list);
    }, (err) => handleFirestoreError(err, 'list' as any, 'film_orders'));

    return () => {
      unsubSettings();
      unsubOrders();
    };
  }, []);

  // Filtered orders
  const filteredOrders = useMemo(() => {
    return orders.filter(o => {
      let matchesTab = true;
      if (tabFilter === 'processing') {
        matchesTab = (o.status === 'registered' || o.status === 'in_process') && !o.pickupNotified;
      } else if (tabFilter === 'notified') {
        matchesTab = o.pickupNotified && !o.pickupAppointmentDate && o.status !== 'completed';
      } else if (tabFilter === 'scheduled') {
        matchesTab = Boolean(o.pickupAppointmentDate) && o.status !== 'completed';
      } else if (tabFilter === 'completed') {
        matchesTab = o.status === 'completed';
      }

      const q = searchQuery.toLowerCase().trim();
      const matchesSearch = !q ||
        (o.customerName || '').toLowerCase().includes(q) ||
        (o.customerPhone || '').toLowerCase().includes(q) ||
        (o.customerEmail || '').toLowerCase().includes(q) ||
        (o.envelopeNumber || '').toLowerCase().includes(q) ||
        (o.orderNumber || '').toLowerCase().includes(q);

      return matchesTab && matchesSearch;
    });
  }, [orders, tabFilter, searchQuery]);

  // Counts for tabs
  const counts = useMemo(() => {
    const processing = orders.filter(o => (o.status === 'registered' || o.status === 'in_process') && !o.pickupNotified).length;
    const notified = orders.filter(o => o.pickupNotified && !o.pickupAppointmentDate && o.status !== 'completed').length;
    const scheduled = orders.filter(o => Boolean(o.pickupAppointmentDate) && o.status !== 'completed').length;
    const completed = orders.filter(o => o.status === 'completed').length;
    return { processing, notified, scheduled, completed };
  }, [orders]);

  // Send Pickup Notification Email with QR Code
  const handleSendPickupNotification = async (order: FilmOrder) => {
    if (!order.id) return;
    setProcessingId(order.id);

    try {
      const now = new Date();
      const deadline = addDays(now, 30);
      const appointmentBookingUrl = `${window.location.origin}${window.location.pathname}?view=pickup-booking&orderId=${order.id}`;

      // 1. Dispatch email with embedded QR and appointment link
      const emailContent = generateFilmPickupNotificationEmail(order, settings, appointmentBookingUrl);
      await sendBusinessEmail({
        to: order.customerEmail,
        subject: emailContent.subject,
        html: emailContent.html,
        text: emailContent.text,
        customerName: order.customerName,
        templateType: 'collection',
        fromName: settings.studioName
      });

      // 2. Update status in Firestore
      await updateDoc(doc(db, 'film_orders', order.id), {
        status: 'ready_for_pickup',
        pickupNotified: true,
        pickupNotifiedAt: now.toISOString(),
        pickupDeadline: deadline.toISOString(),
      });

      setActionFeedback(`Film marked washed! Pickup email with appointment QR code sent to ${order.customerEmail}.`);
      setTimeout(() => setActionFeedback(null), 4500);
    } catch (err: any) {
      setActionFeedback(`Error notifying customer: ${err.message}`);
    } finally {
      setProcessingId(null);
    }
  };

  // Mark film as Picked Up / Completed
  const handleMarkPickedUp = async (order: FilmOrder) => {
    if (!order.id) return;
    try {
      await updateDoc(doc(db, 'film_orders', order.id), {
        status: 'completed',
        pickedUpAt: new Date().toISOString(),
      });
      setActionFeedback(`Envelope ${order.envelopeNumber} marked as completed & picked up!`);
      setTimeout(() => setActionFeedback(null), 3000);
    } catch (err: any) {
      setActionFeedback(`Error updating order: ${err.message}`);
    }
  };

  // Staff Schedule Appointment on Customer Behalf
  const handleConfirmManualSchedule = async () => {
    if (!schedulingOrder?.id) return;
    try {
      await updateDoc(doc(db, 'film_orders', schedulingOrder.id), {
        pickupAppointmentDate: manualDate,
        pickupTimeSlot: manualSlot,
        appointmentNotes: manualNotes.trim() || undefined,
        status: 'ready_for_pickup',
      });

      // Sync into bookings collection for Tab 2 Calendar
      await addDoc(collection(db, 'bookings'), {
        workshopId: 'film-pickup',
        workshopName: `Film Pickup: ${schedulingOrder.envelopeNumber} (${schedulingOrder.filmType})`,
        customerName: schedulingOrder.customerName,
        customerPhone: schedulingOrder.customerPhone,
        customerEmail: schedulingOrder.customerEmail,
        date: manualDate,
        time: manualSlot.split(' - ')[0],
        status: 'confirmed',
        depositPaid: true,
        balancePaid: true,
        totalPrice: schedulingOrder.totalPrice,
        depositAmount: 0,
        pax: schedulingOrder.quantity,
        location: 'ALL',
        notes: `Envelope: ${schedulingOrder.envelopeNumber} | Film: ${schedulingOrder.filmType} (${schedulingOrder.quantity} rolls) | Slot: ${manualSlot}`,
      });

      setActionFeedback(`Pickup slot booked for ${schedulingOrder.customerName} on ${manualDate} (${manualSlot})!`);
      setSchedulingOrder(null);
      setTimeout(() => setActionFeedback(null), 3500);
    } catch (err: any) {
      setActionFeedback(`Error scheduling: ${err.message}`);
    }
  };

  return (
    <div className="space-y-8 max-w-7xl mx-auto pb-16">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-[#D95328]">
            <PackageCheck className="w-4 h-4" />
            <span>Negative Archival & Collection</span>
          </div>
          <h1 className="text-3xl font-serif font-bold text-[var(--text-app)] mt-1">Film Pickups</h1>
          <p className="text-sm text-[var(--text-muted)] mt-1">
            Inform customers with a QR code appointment link upon completion. Pickups restricted within 1 month.
          </p>
        </div>

        {onGoToCalendar && (
          <button
            onClick={onGoToCalendar}
            className="natural-btn-secondary flex items-center gap-2 text-xs uppercase tracking-wider font-bold"
          >
            <Calendar className="w-4 h-4 text-[#D95328]" />
            <span>View Studio Calendar</span>
          </button>
        )}
      </div>

      {/* Action Feedback Banner */}
      {actionFeedback && (
        <motion.div
          initial={{ opacity: 0, y: -10 }}
          animate={{ opacity: 1, y: 0 }}
          className="p-4 rounded-xl bg-emerald-50 border border-emerald-200 text-emerald-800 text-xs font-bold flex items-center justify-between shadow-xs"
        >
          <div className="flex items-center gap-2">
            <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
            <span>{actionFeedback}</span>
          </div>
          <button onClick={() => setActionFeedback(null)} className="text-emerald-600 hover:text-emerald-900 text-sm">
            &times;
          </button>
        </motion.div>
      )}

      {/* Filter Tabs */}
      <div className="flex flex-wrap items-center gap-2">
        {[
          { id: 'all', label: 'All Orders', count: orders.length },
          { id: 'processing', label: 'Washing in Progress', count: counts.processing },
          { id: 'notified', label: 'Notified & Awaiting Booking', count: counts.notified },
          { id: 'scheduled', label: 'Appointment Scheduled', count: counts.scheduled },
          { id: 'completed', label: 'Picked Up / Completed', count: counts.completed },
        ].map((t) => (
          <button
            key={t.id}
            onClick={() => setTabFilter(t.id as any)}
            className={`px-4 py-2 rounded-xl text-xs font-bold transition-all flex items-center gap-2 ${
              tabFilter === t.id
                ? 'bg-[#1C1917] text-white shadow-sm'
                : 'bg-[var(--bg-card)] text-[var(--text-muted)] hover:text-[var(--text-app)] border border-[var(--border-app)]'
            }`}
          >
            <span>{t.label}</span>
            <span className={`px-2 py-0.5 rounded-full text-[10px] ${
              tabFilter === t.id ? 'bg-white/20 text-white' : 'bg-[var(--bg-app)] text-[var(--text-muted)]'
            }`}>
              {t.count}
            </span>
          </button>
        ))}
      </div>

      {/* Table Container */}
      <div className="natural-card p-6 bg-[var(--bg-card)]">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-6">
          <div>
            <h2 className="text-lg font-serif font-bold text-[var(--text-app)]">Film Pickups Queue</h2>
            <p className="text-xs text-[var(--text-muted)] mt-0.5">
              Operating hours: <strong>11:00 AM – 7:00 PM everyday</strong> &bull; 1-hour slots
            </p>
          </div>

          <div className="relative">
            <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-[var(--text-muted)]" />
            <input
              type="text"
              placeholder="Search customer, envelope..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="natural-input pl-9 text-xs py-1.5 w-64"
            />
          </div>
        </div>

        {filteredOrders.length === 0 ? (
          <div className="text-center py-16 text-[var(--text-muted)] text-sm">
            No film orders found under current filter.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs border-collapse">
              <thead>
                <tr className="border-b border-[var(--border-app)] natural-table-header">
                  <th className="py-3 px-3">Envelope / Order</th>
                  <th className="py-3 px-3">Customer</th>
                  <th className="py-3 px-3">Film Process</th>
                  <th className="py-3 px-3">Status</th>
                  <th className="py-3 px-3">Pick-up Appointment Slot</th>
                  <th className="py-3 px-3">1-Month Deadline</th>
                  <th className="py-3 px-3 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[var(--border-app)]">
                {filteredOrders.map((o) => {
                  const isCompleted = o.status === 'completed';
                  const isScheduled = Boolean(o.pickupAppointmentDate);
                  const isNotified = o.pickupNotified;

                  // Expiration alert
                  let daysRemaining: number | null = null;
                  if (o.pickupDeadline && !isCompleted) {
                    daysRemaining = differenceInDays(new Date(o.pickupDeadline), new Date());
                  }

                  const appointmentUrl = `${window.location.origin}${window.location.pathname}?view=pickup-booking&orderId=${o.id}`;

                  return (
                    <tr key={o.id} className="natural-table-row">
                      <td className="py-3 px-3">
                        <span className="font-mono font-bold text-[#D95328] bg-[#FAF0EB] px-2 py-0.5 rounded-md text-[11px]">
                          {o.envelopeNumber}
                        </span>
                        <div className="font-mono text-[10px] text-[var(--text-muted)] mt-0.5">{o.orderNumber}</div>
                      </td>
                      <td className="py-3 px-3">
                        <div className="font-bold text-[var(--text-app)]">{o.customerName}</div>
                        <div className="text-[11px] text-[var(--text-muted)] font-mono">{o.customerPhone}</div>
                        <div className="text-[10px] text-[var(--text-muted)]">{o.customerEmail}</div>
                      </td>
                      <td className="py-3 px-3">
                        <div className="font-semibold text-[var(--text-app)]">{o.filmType}</div>
                        <div className="text-[11px] text-[var(--text-muted)]">{o.quantity} roll{o.quantity > 1 ? 's' : ''}</div>
                      </td>
                      <td className="py-3 px-3">
                        {isCompleted ? (
                          <span className="inline-block px-2.5 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider bg-gray-100 text-gray-700">
                            Picked Up & Done
                          </span>
                        ) : isScheduled ? (
                          <span className="inline-block px-2.5 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider bg-purple-100 text-purple-800">
                            Appointment Booked
                          </span>
                        ) : isNotified ? (
                          <span className="inline-block px-2.5 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider bg-amber-100 text-amber-800">
                            Notified &bull; Awaiting Booking
                          </span>
                        ) : (
                          <span className="inline-block px-2.5 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider bg-blue-100 text-blue-800">
                            Washing / Developing
                          </span>
                        )}
                      </td>
                      <td className="py-3 px-3">
                        {isScheduled ? (
                          <div>
                            <div className="font-bold text-[var(--text-app)] flex items-center gap-1.5">
                              <Calendar className="w-3.5 h-3.5 text-[#D95328]" />
                              <span>{o.pickupAppointmentDate}</span>
                            </div>
                            <div className="text-[11px] font-mono text-[#D95328] font-bold mt-0.5">
                              {o.pickupTimeSlot}
                            </div>
                          </div>
                        ) : isNotified ? (
                          <div className="text-[11px] text-amber-700 font-medium">
                            QR sent &bull; Customer picking slot
                          </div>
                        ) : (
                          <div className="text-[11px] text-[var(--text-muted)] italic">
                            Developing in progress
                          </div>
                        )}
                      </td>
                      <td className="py-3 px-3">
                        {daysRemaining !== null ? (
                          <div>
                            <div className={`font-mono text-xs font-bold ${daysRemaining < 7 ? 'text-rose-600' : 'text-[var(--text-app)]'}`}>
                              {daysRemaining} day{daysRemaining === 1 ? '' : 's'} left
                            </div>
                            <div className="text-[10px] text-[var(--text-muted)]">
                              by {new Date(o.pickupDeadline!).toLocaleDateString('en-GB')}
                            </div>
                          </div>
                        ) : isCompleted ? (
                          <span className="text-[11px] text-gray-500">Collected</span>
                        ) : (
                          <span className="text-[11px] text-[var(--text-muted)]">Pending wash</span>
                        )}
                      </td>
                      <td className="py-3 px-3 text-right">
                        <div className="flex items-center justify-end gap-2">
                          {/* Notify Button if not notified */}
                          {!isNotified && !isCompleted && (
                            <button
                              onClick={() => handleSendPickupNotification(o)}
                              disabled={processingId === o.id}
                              className="px-3 py-1.5 bg-[#D95328] hover:bg-[#C2451C] text-white rounded-lg text-xs font-bold flex items-center gap-1.5 shadow-xs transition-all cursor-pointer disabled:opacity-50"
                            >
                              <QrCode className="w-3.5 h-3.5" />
                              <span>{processingId === o.id ? 'Sending...' : 'Notify (Send QR)'}</span>
                            </button>
                          )}

                          {/* Resend QR Notification */}
                          {isNotified && !isCompleted && !isScheduled && (
                            <button
                              onClick={() => handleSendPickupNotification(o)}
                              disabled={processingId === o.id}
                              title="Resend pickup email with QR code"
                              className="px-2.5 py-1.5 bg-amber-50 text-amber-800 border border-amber-200 hover:bg-amber-100 rounded-lg text-xs font-bold flex items-center gap-1 transition-all"
                            >
                              <Mail className="w-3.5 h-3.5" />
                              <span>Resend QR</span>
                            </button>
                          )}

                          {/* Schedule / Reschedule appointment manually */}
                          {!isCompleted && (
                            <button
                              onClick={() => {
                                setSchedulingOrder(o);
                                if (o.pickupAppointmentDate) setManualDate(o.pickupAppointmentDate);
                                if (o.pickupTimeSlot) setManualSlot(o.pickupTimeSlot);
                              }}
                              className="px-2.5 py-1.5 bg-[var(--bg-app)] hover:bg-[var(--border-app)] text-[var(--text-app)] rounded-lg text-xs font-bold border border-[var(--border-app)] transition-all"
                            >
                              {isScheduled ? 'Reschedule' : 'Set Slot'}
                            </button>
                          )}

                          {/* Mark Picked Up */}
                          {!isCompleted && (
                            <button
                              onClick={() => handleMarkPickedUp(o)}
                              className="px-3 py-1.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg text-xs font-bold flex items-center gap-1 shadow-xs transition-all cursor-pointer"
                            >
                              <Check className="w-3.5 h-3.5" />
                              <span>Collected</span>
                            </button>
                          )}

                          {/* Open customer link */}
                          <a
                            href={appointmentUrl}
                            target="_blank"
                            rel="noreferrer"
                            title="Open customer booking page"
                            className="p-1.5 text-[var(--text-muted)] hover:text-[#D95328] rounded-lg hover:bg-[#FAF0EB] transition-colors"
                          >
                            <ExternalLink className="w-4 h-4" />
                          </a>
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

      {/* Manual Slot Scheduling Modal */}
      <AnimatePresence>
        {schedulingOrder && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-xs">
            <motion.div
              initial={{ scale: 0.95, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.95, opacity: 0 }}
              className="bg-white rounded-3xl max-w-md w-full p-8 shadow-2xl relative border border-[#E7E0D8]"
            >
              <button
                onClick={() => setSchedulingOrder(null)}
                className="absolute top-4 right-4 text-gray-400 hover:text-black p-1"
              >
                &times;
              </button>

              <div className="w-12 h-12 rounded-full bg-[#FAF0EB] text-[#D95328] flex items-center justify-center mb-4">
                <Calendar className="w-6 h-6" />
              </div>

              <h2 className="text-xl font-serif font-bold text-[#1C1917]">
                Set Pick-up Appointment
              </h2>
              <p className="text-xs text-[#78716C] mt-1 mb-6">
                Customer: <strong>{schedulingOrder.customerName}</strong> &bull; Envelope: <strong>{schedulingOrder.envelopeNumber}</strong>
              </p>

              <div className="space-y-4 mb-6">
                <div>
                  <label className="block text-[11px] font-bold uppercase tracking-wider text-[#78716C] mb-1.5">
                    Pick-up Date *
                  </label>
                  <input
                    type="date"
                    required
                    min={format(new Date(), 'yyyy-MM-dd')}
                    value={manualDate}
                    onChange={(e) => setManualDate(e.target.value)}
                    className="natural-input w-full text-xs font-semibold"
                  />
                </div>

                <div>
                  <label className="block text-[11px] font-bold uppercase tracking-wider text-[#78716C] mb-1.5">
                    1-Hour Slot (11am - 7pm) *
                  </label>
                  <select
                    value={manualSlot}
                    onChange={(e) => setManualSlot(e.target.value)}
                    className="natural-input w-full text-xs font-semibold"
                  >
                    {TIME_SLOTS.map(s => (
                      <option key={s} value={s}>{s}</option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block text-[11px] font-bold uppercase tracking-wider text-[#78716C] mb-1.5">
                    Internal Staff Note (Optional)
                  </label>
                  <input
                    type="text"
                    placeholder="Customer phoned in to schedule"
                    value={manualNotes}
                    onChange={(e) => setManualNotes(e.target.value)}
                    className="natural-input w-full text-xs"
                  />
                </div>
              </div>

              <div className="flex gap-3">
                <button
                  type="button"
                  onClick={() => setSchedulingOrder(null)}
                  className="natural-btn-secondary flex-1 text-xs py-3"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={handleConfirmManualSchedule}
                  className="flex-1 py-3 bg-[#D95328] hover:bg-[#C2451C] text-white rounded-xl text-xs font-bold uppercase tracking-wider shadow-md cursor-pointer"
                >
                  Save & Sync Calendar
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
}
