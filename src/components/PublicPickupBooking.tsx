import React, { useState, useEffect, useMemo } from 'react';
import { db } from '../firebase';
import { doc, getDoc, updateDoc, collection, addDoc, onSnapshot } from 'firebase/firestore';
import { FilmOrder, RewindSettings } from '../types';
import { DEFAULT_REWIND_SETTINGS } from '../utils/emailTemplates';
import { Camera, Calendar, Clock, MapPin, CheckCircle2, AlertCircle, Sparkles, ChevronRight } from 'lucide-react';
import { motion } from 'motion/react';
import { format, addDays, isAfter, isBefore, startOfDay } from 'date-fns';

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

export default function PublicPickupBooking() {
  const [order, setOrder] = useState<FilmOrder | null>(null);
  const [settings, setSettings] = useState<RewindSettings>(DEFAULT_REWIND_SETTINGS);
  const [loading, setLoading] = useState(true);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  // Booking states
  const [selectedDate, setSelectedDate] = useState<string>(format(new Date(), 'yyyy-MM-dd'));
  const [selectedSlot, setSelectedSlot] = useState<string>(TIME_SLOTS[0]);
  const [notes, setNotes] = useState<string>('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isBookedSuccess, setIsBookedSuccess] = useState(false);

  // Extract orderId from URL query parameters
  const urlParams = new URLSearchParams(window.location.search);
  const orderId = urlParams.get('orderId');

  useEffect(() => {
    // 1. Load settings
    const unsubSettings = onSnapshot(collection(db, 'rewind_settings'), (snap) => {
      if (!snap.empty) {
        setSettings({ ...DEFAULT_REWIND_SETTINGS, ...snap.docs[0].data() as RewindSettings });
      }
    });

    // 2. Load order
    const loadOrder = async () => {
      if (!orderId) {
        setErrorMsg('Invalid or missing order reference. Please use the link provided in your email.');
        setLoading(false);
        return;
      }

      try {
        const docRef = doc(db, 'film_orders', orderId);
        const snap = await getDoc(docRef);
        if (snap.exists()) {
          const data = { id: snap.id, ...snap.data() } as FilmOrder;
          setOrder(data);
          if (data.pickupAppointmentDate) {
            setSelectedDate(data.pickupAppointmentDate);
          }
          if (data.pickupTimeSlot) {
            setSelectedSlot(data.pickupTimeSlot);
          }
        } else {
          setErrorMsg('Order not found. Please contact the studio for assistance.');
        }
      } catch (err: any) {
        setErrorMsg(err.message || 'Failed to retrieve your order details.');
      } finally {
        setLoading(false);
      }
    };

    loadOrder();

    return () => unsubSettings();
  }, [orderId]);

  // Calculate 1-month collection window
  const minDate = format(new Date(), 'yyyy-MM-dd');
  const maxDate = useMemo(() => {
    if (order?.pickupNotifiedAt) {
      const notified = new Date(order.pickupNotifiedAt);
      return format(addDays(notified, 30), 'yyyy-MM-dd');
    }
    return format(addDays(new Date(), 30), 'yyyy-MM-dd');
  }, [order]);

  const handleConfirmAppointment = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!order?.id) return;

    setIsSubmitting(true);
    setErrorMsg(null);

    try {
      // 1. Update order in Firestore
      await updateDoc(doc(db, 'film_orders', order.id), {
        pickupAppointmentDate: selectedDate,
        pickupTimeSlot: selectedSlot,
        appointmentNotes: notes.trim() || undefined,
        status: 'ready_for_pickup' // ready for pickup with booked slot
      });

      // 2. Also register into bookings collection so Tab 2 Calendar shows it
      await addDoc(collection(db, 'bookings'), {
        workshopId: 'film-pickup',
        workshopName: `Film Pickup: ${order.envelopeNumber} (${order.filmType})`,
        customerName: order.customerName,
        customerPhone: order.customerPhone,
        customerEmail: order.customerEmail,
        date: selectedDate,
        time: selectedSlot.split(' - ')[0], // e.g. "11:00 AM"
        status: 'confirmed',
        depositPaid: true,
        balancePaid: true,
        totalPrice: order.totalPrice,
        depositAmount: 0,
        pax: order.quantity,
        location: 'ALL',
        notes: `Envelope: ${order.envelopeNumber} | Film: ${order.filmType} (${order.quantity} rolls) | Slot: ${selectedSlot}${notes ? ` | Note: ${notes}` : ''}`,
      });

      setIsBookedSuccess(true);
    } catch (err: any) {
      setErrorMsg(err.message || 'Failed to save appointment. Please try again.');
    } finally {
      setIsSubmitting(false);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-[#FAF7F2] flex items-center justify-center p-6 text-center">
        <div className="w-10 h-10 border-3 border-[#D95328] border-t-transparent rounded-full animate-spin mx-auto mb-4" />
        <p className="text-sm font-serif italic text-[#78716C]">Loading your film order details...</p>
      </div>
    );
  }

  if (errorMsg && !order) {
    return (
      <div className="min-h-screen bg-[#FAF7F2] flex items-center justify-center p-6 font-sans">
        <div className="max-w-md w-full bg-white rounded-3xl p-8 text-center border border-[#E7E0D8] shadow-lg">
          <AlertCircle className="w-12 h-12 text-rose-500 mx-auto mb-3" />
          <h2 className="text-xl font-serif font-bold text-[#1C1917]">Notice</h2>
          <p className="text-xs text-[#78716C] mt-2 leading-relaxed">{errorMsg}</p>
        </div>
      </div>
    );
  }

  if (isBookedSuccess) {
    return (
      <div className="min-h-screen bg-[#FAF7F2] text-[#1C1917] p-4 sm:p-8 flex items-center justify-center font-sans">
        <motion.div
          initial={{ opacity: 0, y: 15 }}
          animate={{ opacity: 1, y: 0 }}
          className="max-w-md w-full bg-white rounded-3xl p-8 shadow-xl border border-[#E7E0D8] text-center"
        >
          <div className="w-14 h-14 rounded-full bg-emerald-100 text-emerald-700 flex items-center justify-center mx-auto mb-4">
            <CheckCircle2 className="w-8 h-8" />
          </div>

          <span className="text-[11px] font-black uppercase tracking-widest text-[#D95328] bg-[#FAF0EB] px-3 py-1 rounded-full">
            Appointment Confirmed
          </span>

          <h1 className="text-2xl font-serif font-bold text-[#1C1917] mt-3">See You Soon!</h1>
          <p className="text-xs text-[#78716C] mt-1.5 leading-relaxed">
            Your negative collection slot is officially booked, <strong>{order?.customerName}</strong>.
          </p>

          <div className="my-6 p-5 rounded-2xl bg-[#FAF7F2] border border-[#E7E0D8] text-left space-y-3 text-xs">
            <div className="flex justify-between">
              <span className="text-[#78716C]">Envelope No</span>
              <span className="font-mono font-bold text-[#D95328]">{order?.envelopeNumber}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-[#78716C]">Film Process</span>
              <span className="font-semibold text-[#1C1917]">{order?.filmType} ({order?.quantity} rolls)</span>
            </div>
            <div className="flex justify-between border-t border-[#E7E0D8] pt-2">
              <span className="text-[#78716C]">Scheduled Date</span>
              <span className="font-bold text-[#1C1917]">{selectedDate}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-[#78716C]">Time Slot</span>
              <span className="font-bold text-[#D95328]">{selectedSlot}</span>
            </div>
          </div>

          <div className="p-4 rounded-xl bg-stone-50 border border-stone-200 text-left text-xs space-y-1 mb-6">
            <div className="font-bold text-[#1C1917] uppercase text-[10px] tracking-wider flex items-center gap-1.5">
              <MapPin className="w-3.5 h-3.5 text-[#D95328]" />
              <span>Studio Location</span>
            </div>
            <div className="text-[#44403C]">{settings.address || '12-A, Jalan Gurdwara, George Town, Penang'}</div>
            <div className="text-[11px] text-[#78716C]">Hours: {settings.operatingHours || '11:00 AM - 7:00 PM (Daily)'}</div>
          </div>

          <p className="text-[11px] text-[#78716C]">
            Please bring your envelope number <strong>{order?.envelopeNumber}</strong> when you arrive.
          </p>
        </motion.div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#FAF7F2] text-[#1C1917] p-4 sm:p-8 flex items-center justify-center font-sans">
      <motion.div
        initial={{ opacity: 0, y: 15 }}
        animate={{ opacity: 1, y: 0 }}
        className="max-w-lg w-full bg-white rounded-3xl p-6 sm:p-10 shadow-xl border border-[#E7E0D8]"
      >
        {/* Brand Header */}
        <div className="text-center mb-6">
          <div className="w-12 h-12 bg-[#1C1917] text-white rounded-2xl flex items-center justify-center mx-auto mb-3 shadow-md">
            <Camera className="w-6 h-6 text-[#FED7AA]" />
          </div>
          <h1 className="text-2xl font-serif font-bold text-[#1C1917]">
            {settings.studioName.toUpperCase()}
          </h1>
          <p className="text-[10px] font-black uppercase tracking-widest text-[#D95328] mt-1">
            Negative Pick-up Appointment
          </p>
        </div>

        {/* Order Details Badge */}
        <div className="p-4 bg-[#FAF7F2] rounded-2xl border border-[#E7E0D8] mb-6 text-xs space-y-1.5">
          <div className="flex justify-between items-center">
            <span className="text-[#78716C]">Customer</span>
            <span className="font-bold text-[#1C1917]">{order?.customerName}</span>
          </div>
          <div className="flex justify-between items-center">
            <span className="text-[#78716C]">Envelope Number</span>
            <span className="font-mono font-bold text-[#D95328]">{order?.envelopeNumber}</span>
          </div>
          <div className="flex justify-between items-center">
            <span className="text-[#78716C]">Film Rolls</span>
            <span className="font-semibold text-[#1C1917]">{order?.filmType} &bull; {order?.quantity} roll{order?.quantity === 1 ? '' : 's'}</span>
          </div>
        </div>

        {/* Appointment Form */}
        <form onSubmit={handleConfirmAppointment} className="space-y-5">
          <div>
            <label className="block text-[11px] font-bold uppercase tracking-wider text-[#78716C] mb-1.5">
              1. Choose Date (Within 1 Month) *
            </label>
            <div className="relative">
              <Calendar className="w-4 h-4 absolute left-3.5 top-1/2 -translate-y-1/2 text-[#78716C]" />
              <input
                type="date"
                required
                min={minDate}
                max={maxDate}
                value={selectedDate}
                onChange={(e) => setSelectedDate(e.target.value)}
                className="w-full pl-10 pr-4 py-2.5 bg-[#FAF7F2] border border-[#E7E0D8] rounded-xl text-xs font-semibold focus:outline-none focus:border-[#D95328] focus:bg-white"
              />
            </div>
            <p className="text-[10px] text-[#78716C] mt-1">
              Pick-up available daily. Must be scheduled between <strong>{minDate}</strong> and <strong>{maxDate}</strong>.
            </p>
          </div>

          <div>
            <label className="block text-[11px] font-bold uppercase tracking-wider text-[#78716C] mb-2">
              2. Select 1-Hour Time Slot (11:00 AM – 7:00 PM) *
            </label>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
              {TIME_SLOTS.map((slot) => {
                const isSelected = selectedSlot === slot;
                return (
                  <button
                    key={slot}
                    type="button"
                    onClick={() => setSelectedSlot(slot)}
                    className={`py-2.5 px-3 rounded-xl border text-xs font-medium text-left flex items-center justify-between transition-all ${
                      isSelected
                        ? 'border-[#D95328] bg-[#FAF0EB] text-[#1C1917] font-bold shadow-xs'
                        : 'border-[#E7E0D8] bg-[#FAF7F2] text-[#78716C] hover:border-[#D95328]/40'
                    }`}
                  >
                    <div className="flex items-center gap-2">
                      <Clock className={`w-3.5 h-3.5 ${isSelected ? 'text-[#D95328]' : 'text-gray-400'}`} />
                      <span>{slot}</span>
                    </div>
                    {isSelected && <ChevronRight className="w-3.5 h-3.5 text-[#D95328]" />}
                  </button>
                );
              })}
            </div>
          </div>

          <div>
            <label className="block text-[11px] font-bold uppercase tracking-wider text-[#78716C] mb-1">
              Notes / Special Instructions (Optional)
            </label>
            <textarea
              rows={2}
              placeholder="e.g. Someone else picking up on my behalf, will arrive around 2:30pm..."
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              className="w-full px-3 py-2 bg-[#FAF7F2] border border-[#E7E0D8] rounded-xl text-xs resize-none focus:outline-none focus:border-[#D95328] focus:bg-white"
            />
          </div>

          {errorMsg && (
            <div className="p-3 bg-rose-50 border border-rose-200 text-rose-800 text-xs rounded-xl flex items-center gap-2">
              <AlertCircle className="w-4 h-4 shrink-0" />
              <span>{errorMsg}</span>
            </div>
          )}

          <button
            type="submit"
            disabled={isSubmitting}
            className="w-full py-3.5 bg-[#D95328] hover:bg-[#C2451C] text-white rounded-xl text-xs font-black uppercase tracking-widest shadow-md transition-all cursor-pointer disabled:opacity-50"
          >
            {isSubmitting ? 'Booking Appointment...' : 'Confirm Pick-up Slot'}
          </button>
        </form>

        <div className="mt-6 pt-4 border-t border-[#E7E0D8] text-center text-[10px] text-[#78716C] space-y-0.5">
          <p><strong>{settings.studioName}</strong> &bull; {settings.address || 'George Town, Penang'}</p>
          <p>Operating Hours: {settings.operatingHours || '11:00 AM - 7:00 PM (Daily)'}</p>
        </div>
      </motion.div>
    </div>
  );
}
