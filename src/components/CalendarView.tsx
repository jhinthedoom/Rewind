import React, { useState, useEffect } from 'react';
import { db } from '../firebase';
import { collection, onSnapshot, query, orderBy, where } from 'firebase/firestore';
import { Booking, Workshop, OperationType, FilmOrder } from '../types';
import { handleFirestoreError } from '../utils';
import { 
  Clock,
  User, 
  Phone,
  MapPin,
  Tag,
  Info,
  X,
  ChevronLeft,
  ChevronRight
} from 'lucide-react';
import { 
  format, 
  startOfMonth, 
  endOfMonth, 
  startOfWeek, 
  endOfWeek, 
  eachDayOfInterval, 
  isSameMonth, 
  isSameDay, 
  addMonths, 
  subMonths 
} from 'date-fns';

export default function CalendarView({ branch = 'ALL' }: { branch?: string }) {
  const [bookings, setBookings] = useState<Booking[]>([]);
  const [filmPickups, setFilmPickups] = useState<Booking[]>([]);
  const [workshops, setWorkshops] = useState<Workshop[]>([]);
  const [selectedCalendarDate, setSelectedCalendarDate] = useState<Date>(new Date());
  const [selectedDayDate, setSelectedDayDate] = useState<Date>(new Date());
  const [isTimelineOpen, setIsTimelineOpen] = useState<boolean>(false);
  const [selectedBooking, setSelectedBooking] = useState<Booking | null>(null);

  useEffect(() => {
    let qb = collection(db, 'bookings') as any;
    if (branch !== 'ALL') {
      qb = query(qb, where('location', '==', branch));
    }

    const unsubscribeBookings = onSnapshot(qb, (snapshot) => {
      let docs = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Booking));
      // Sort client-side by date DESC
      docs.sort((a, b) => {
        const dateA = a.date || '';
        const dateB = b.date || '';
        return dateB.localeCompare(dateA);
      });
      setBookings(docs);
    }, (error) => handleFirestoreError(error, OperationType.LIST, 'bookings'));

    const qw = collection(db, 'workshops');
    const unsubscribeWorkshops = onSnapshot(qw, (snapshot) => {
      let docs = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Workshop));
      docs.sort((a, b) => (a.name || '').localeCompare(b.name || ''));
      setWorkshops(docs);
    }, (error) => handleFirestoreError(error, OperationType.LIST, 'workshops'));

    // Subscribe to film orders that have pickup appointments
    const qf = collection(db, 'film_orders');
    const unsubscribeFilm = onSnapshot(qf, (snapshot) => {
      const orders = snapshot.docs.map(d => ({ id: d.id, ...d.data() } as FilmOrder));
      const pickups: Booking[] = orders
        .filter(o => o.pickupAppointmentDate && o.status !== 'completed')
        .map(o => ({
          id: `film_order_${o.id}`,
          workshopId: 'film-pickup',
          workshopName: `Film Pickup: ${o.envelopeNumber} (${o.filmType})`,
          customerName: o.customerName,
          customerPhone: o.customerPhone,
          customerEmail: o.customerEmail,
          date: o.pickupAppointmentDate!,
          time: o.pickupTimeSlot ? o.pickupTimeSlot.split(' - ')[0] : '11:00 AM',
          status: 'confirmed',
          depositPaid: true,
          balancePaid: o.paymentStatus === 'paid',
          totalPrice: o.totalPrice,
          depositAmount: 0,
          pax: o.quantity,
          location: 'ALL',
          notes: `Envelope: ${o.envelopeNumber} | Film: ${o.filmType} (${o.quantity} rolls)${o.appointmentNotes ? ` | Note: ${o.appointmentNotes}` : ''}`
        }));
      setFilmPickups(pickups);
    }, (err) => console.warn('Error fetching film pickups for calendar:', err));

    return () => {
      unsubscribeBookings();
      unsubscribeWorkshops();
      unsubscribeFilm();
    };
  }, [branch]);

  const activeBookings = React.useMemo(() => {
    const list = bookings.filter(b => b.status !== 'deleted' && b.status !== 'cancelled' && b.status !== 'refunded');
    // Combine with film pickups avoiding duplicate envelope bookings
    const existingEnvelopes = new Set<string>();
    list.forEach(b => {
      if (b.notes && b.notes.includes('Envelope:')) {
        existingEnvelopes.add(b.notes.split('|')[0].trim());
      }
    });

    const uniqueFilmPickups = filmPickups.filter(fp => {
      const envKey = fp.notes ? fp.notes.split('|')[0].trim() : '';
      return !existingEnvelopes.has(envKey);
    });

    return [...list, ...uniqueFilmPickups];
  }, [bookings, filmPickups]);

  // Compute daily schedule / timeline slots (9 AM - 9 PM)
  const timelineData = React.useMemo(() => {
    const dateStr = format(selectedDayDate, 'yyyy-MM-dd');
    const dayBookings = activeBookings.filter(b => b.date === dateStr);
    
    const slots = [];
    for (let hour = 9; hour <= 21; hour++) {
      // Find bookings that start in this hour interval (e.g. 13:00 to 13:59)
      const bookingsInHour = dayBookings.filter(b => {
        if (!b.time) return false;
        const [bHourStr] = b.time.split(':');
        const bHour = parseInt(bHourStr, 10);
        return bHour === hour;
      });

      const isPm = hour >= 12;
      const displayHour = hour === 12 ? 12 : hour % 12;
      const amPm = isPm ? 'pm' : 'am';
      const formattedLabel = `${displayHour} ${amPm}`;

      slots.push({
        hour,
        label: formattedLabel,
        bookings: bookingsInHour
      });
    }
    return slots;
  }, [selectedDayDate, activeBookings]);

  // Bookings that are on this day but outside of standard 9am-9pm
  const outsideBookings = React.useMemo(() => {
    const dateStr = format(selectedDayDate, 'yyyy-MM-dd');
    const dayBookings = activeBookings.filter(b => b.date === dateStr);
    
    return dayBookings.filter(b => {
      if (!b.time) return true;
      const [bHourStr] = b.time.split(':');
      const bHour = parseInt(bHourStr, 10);
      return isNaN(bHour) || bHour < 9 || bHour > 21;
    });
  }, [selectedDayDate, activeBookings]);

  const timelineBookingsCount = bookings.filter(b => b.date === format(selectedDayDate, 'yyyy-MM-dd')).length;

  const getBookingStyles = (booking: Booking) => {
    if (booking.isCollected || booking.status === 'completed') {
      return 'bg-[#F2EFE9] border-[#D9D1C7] text-[#A69D94] opacity-80';
    }

    const isFilmPickup = booking.workshopId === 'film-pickup' || (booking.workshopName && booking.workshopName.toLowerCase().includes('pickup'));
    if (isFilmPickup) {
      return 'bg-[#FAF0EB] border-[#FED7AA] text-[#9A3412]';
    }

    if (booking.balancePaid) {
      return 'bg-[#F2EFE9] border-[#D9D1C7] text-[#A69D94] opacity-80';
    }

    const workshop = workshops.find(w => w.id === booking.workshopId);
    const isPainting = workshop?.isVariablePrice;
    const loc = booking.location;
    
    if (loc === 'PG') {
      return isPainting 
        ? 'bg-[#E0F2FE] border-[#BAE6FD] text-[#0369A1]' 
        : 'bg-[#DBEAFE] border-[#BFDBFE] text-[#1D4ED8]';
    } else {
      return isPainting
        ? 'bg-[#FCE7F3] border-[#FBCFE8] text-[#BE185D]' 
        : 'bg-[#F3E8FF] border-[#E9D5FF] text-[#7E22CE]';
    }
  };

  const monthStart = startOfMonth(selectedCalendarDate);
  const monthEnd = endOfMonth(monthStart);
  const startDate = startOfWeek(monthStart);
  const endDate = endOfWeek(monthEnd);

  const calendarDays = eachDayOfInterval({
    start: startDate,
    end: endDate,
  });

  return (
    <div className="space-y-6">
      {/* Monthly Calendar View */}
      <div className="bg-white rounded-[32px] border border-[#D9D1C7] shadow-sm overflow-hidden flex flex-col">
        <div className="px-8 py-6 bg-[#F2EFE9] border-b border-[#D9D1C7]/50 flex justify-between items-center">
          <div className="flex items-center gap-4">
            <h3 className="text-xl font-serif italic text-[#2D241E]">{format(selectedCalendarDate, 'MMMM yyyy')}</h3>
            <div className="flex gap-2">
              <button onClick={() => setSelectedCalendarDate(subMonths(selectedCalendarDate, 1))} className="p-1 hover:bg-white rounded-lg text-[#8C8379] transition-colors">
                <ChevronLeft size={18} />
              </button>
              <button onClick={() => setSelectedCalendarDate(addMonths(selectedCalendarDate, 1))} className="p-1 hover:bg-white rounded-lg text-[#8C8379] transition-colors">
                <ChevronRight size={18} />
              </button>
            </div>
          </div>
          <div className="flex items-center gap-4">
            <div className="flex gap-4 mr-4">
              <div className="flex items-center gap-1.5">
                <div className="w-2.5 h-2.5 rounded-full bg-[#FAF0EB] border border-[#FED7AA]" />
                <span className="text-[9px] font-bold uppercase text-[#9A3412]">Film Pickups</span>
              </div>
              <div className="flex items-center gap-1.5">
                <div className="w-2.5 h-2.5 rounded-full bg-[#F3E8FF] border border-[#E9D5FF]" />
                <span className="text-[9px] font-bold uppercase text-[#7E22CE]">Studio Events</span>
              </div>
            </div>
            <button 
              onClick={() => {
                setSelectedCalendarDate(new Date());
                setSelectedDayDate(new Date());
              }}
              className="text-[10px] font-black uppercase tracking-widest text-[#8C8379] hover:text-[#2D241E]"
            >
              Today
            </button>
          </div>
        </div>

        <div className="grid grid-cols-7 border-b border-[#D9D1C7]/30">
          {['S', 'M', 'T', 'W', 'T', 'F', 'S'].map((day, idx) => (
            <div key={idx} className="py-2 md:py-4 text-center text-[8px] md:text-[9px] font-black uppercase tracking-widest text-[#8C8379] border-r border-[#D9D1C7]/10">
              <span className="hidden md:inline">{['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'][idx]}</span>
              <span className="md:hidden">{day}</span>
            </div>
          ))}
        </div>

        <div className="grid grid-cols-7 auto-rows-fr">
          {calendarDays.map((day, i) => {
            const dateStr = format(day, 'yyyy-MM-dd');
            const dayBookings = activeBookings.filter(b => b.date === dateStr);
            const isSelectedMonth = isSameMonth(day, monthStart);
            const isToday = isSameDay(day, new Date());
            const isSelectedDay = isSameDay(day, selectedDayDate);

            return (
              <div 
                key={i} 
                onClick={() => {
                  setSelectedDayDate(day);
                  setIsTimelineOpen(true);
                }}
                className={`min-h-[80px] md:min-h-[140px] p-1 md:p-2 border-r border-b border-[#D9D1C7]/20 transition-all cursor-pointer ${
                  isSelectedDay && isTimelineOpen
                    ? 'ring-2 ring-inset ring-[#8B9A82] bg-[#FCFBF9]'
                    : !isSelectedMonth
                      ? 'bg-[#F2EFE9]/30 opacity-40 hover:bg-[#FAF9F6]'
                      : 'bg-white hover:bg-[#FAF9F6]'
                }`}
              >
                <div className="flex justify-between items-start mb-1 md:mb-2">
                  <span className={`text-[10px] md:text-xs font-black ${
                    isToday 
                      ? 'w-4 h-4 md:w-6 md:h-6 rounded-full bg-[#2D241E] text-white flex items-center justify-center font-bold' 
                      : isSelectedDay && isTimelineOpen
                        ? 'text-[#8B9A82] font-black' 
                        : 'text-[#4A3F35]'
                  }`}>
                    {format(day, 'd')}
                  </span>
                  {dayBookings.length > 0 && (
                    <span className="text-[7px] md:text-[9px] font-black px-1 md:px-1.5 py-0.5 rounded transition-colors text-[#8B9A82] bg-[#E8EFE8]">
                      {dayBookings.length}
                    </span>
                  )}
                </div>
                
                <div className="space-y-0.5 md:space-y-1">
                  {dayBookings.sort((a, b) => (a.time || '').localeCompare(b.time || '')).map(b => (
                    <div 
                      key={b.id} 
                      onClick={(e) => {
                        e.stopPropagation();
                        setSelectedBooking(b);
                      }}
                      className={`p-0.5 md:p-1.5 rounded md:rounded-lg border text-[8px] md:text-[9px] font-bold leading-tight group relative cursor-pointer shadow-sm transition-transform hover:scale-[1.02] active:scale-[0.98] ${getBookingStyles(b)}`}
                    >
                      <div className="flex flex-col items-start h-full overflow-hidden pl-1 md:pl-1.5">
                        <span className="text-[6px] md:text-[7px] opacity-70 leading-none hidden md:block">{b.time}</span>
                        <span className="text-[7px] md:text-[9px] font-black truncate w-full">{b.customerName}</span>
                      </div>
                      
                      <div className={`absolute -left-0.5 md:-left-1 top-1/2 -translate-y-1/2 w-0.5 md:w-1 h-2 md:h-3 rounded-full ${
                        b.status === 'completed' || b.isCollected ? 'bg-gray-400' :
                        b.status === 'confirmed' ? 'bg-amber-400' : 
                        b.status === 'settled' ? 'bg-blue-400' : 'bg-red-400'
                      }`} />
                    </div>
                  ))}
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Hourly Day Schedule Pop-up (Apple Calendar Style) */}
      {isTimelineOpen && (
        <div className="fixed inset-0 z-40 flex items-center justify-center p-4">
          <div 
            className="absolute inset-0 bg-[#2D241E]/40 backdrop-blur-sm"
            onClick={() => setIsTimelineOpen(false)}
          />
          <div className="relative w-full max-w-lg bg-white rounded-[32px] shadow-2xl overflow-hidden flex flex-col max-h-[85vh] animate-in fade-in zoom-in duration-200">
            <div className="px-8 py-6 bg-[#F2EFE9] border-b border-[#D9D1C7]/50 flex justify-between items-center shrink-0">
              <div className="flex flex-col">
                <span className="text-[8px] font-black uppercase tracking-widest text-[#8C8379]">Day Timeline</span>
                <h4 className="text-xl font-serif italic text-[#2D241E]">
                  {format(selectedDayDate, 'EEEE, d MMMM yyyy')}
                </h4>
                <span className="text-[10px] font-medium text-[#8C8379] mt-0.5">
                  {timelineBookingsCount > 0 
                    ? `${timelineBookingsCount} active booking(s) scheduled`
                    : 'No bookings scheduled - Open day'
                  }
                </span>
              </div>
              <button 
                onClick={() => setIsTimelineOpen(false)}
                className="p-2 hover:bg-[#FAF9F6] rounded-full text-[#8C8379] transition-colors"
              >
                <X size={20} />
              </button>
            </div>

            <div className="p-8 overflow-y-auto divide-y divide-[#D9D1C7]/15">
              {timelineData.map(({ hour, label, bookings: hourBookings }) => (
                <div key={hour} className="flex gap-4 py-3 min-h-[70px] relative group">
                  {/* Hour scale label */}
                  <div className="w-14 shrink-0 text-right pr-2 border-r border-[#D9D1C7]/20 flex flex-col justify-start">
                    <span className="text-[10px] font-mono tracking-wider font-bold text-[#8C8379]/80 mt-0.5 uppercase">
                      {label}
                    </span>
                  </div>

                  {/* Event slot area */}
                  <div className="flex-1 space-y-2">
                    {hourBookings.length > 0 ? (
                      hourBookings.map(b => (
                        <div
                          key={b.id}
                          onClick={() => setSelectedBooking(b)}
                          className={`p-2.5 rounded-xl border text-[11px] font-bold leading-tight relative cursor-pointer shadow-sm transition-all hover:translate-x-0.5 active:scale-[0.99] ${getBookingStyles(b)}`}
                        >
                          <div className="flex justify-between items-start gap-1">
                            <span className="font-extrabold text-[#2D241E] truncate max-w-[170px]">
                              {b.customerName}
                            </span>
                            <span className="text-[8.5px] font-black px-1.5 py-0.2 rounded bg-white/60 text-[#2D241E]">
                              {b.time}
                            </span>
                          </div>
                          <div className="text-[10px] font-medium opacity-90 truncate mt-0.5">
                            {b.workshopName}
                          </div>
                          <div className="flex items-center gap-2 mt-1.5 text-[8px] font-black uppercase tracking-wider opacity-75">
                            <span>Pax: {b.pax}</span>
                          </div>
                          
                          <div className={`absolute left-0 top-3 bottom-3 w-1 rounded-r-full ${
                            b.status === 'completed' || b.isCollected ? 'bg-gray-400' :
                            b.status === 'confirmed' ? 'bg-amber-400' : 
                            b.status === 'settled' ? 'bg-blue-400' : 'bg-red-400'
                          }`} />
                        </div>
                      ))
                    ) : (
                      /* Elegant placeholder representation when empty */
                      <div className="h-full min-h-[40px] flex items-center justify-between px-3 py-2 rounded-xl border border-dashed border-[#D9D1C7]/30 bg-transparent group-hover:bg-[#FAF9F6]/40 group-hover:border-[#8B9A82]/30 transition-all">
                        <span className="text-[9px] font-medium tracking-wide text-[#A69D94]/70 italic select-none">
                          Empty Slot
                        </span>
                        <span className="text-[10px] text-[#A69D94]/0 group-hover:text-[#A69D94]/60 transition-all font-bold">
                          +
                        </span>
                      </div>
                    )}
                  </div>
                </div>
              ))}

              {/* Fallback segment for outstanding bookings */}
              {outsideBookings.length > 0 && (
                <div className="pt-4 mt-2 border-t border-dashed border-[#D9D1C7]/40">
                  <span className="text-[9px] font-black uppercase text-[#8C8379] tracking-wider block mb-2">
                    Other Hours / Unscheduled
                  </span>
                  <div className="space-y-2">
                    {outsideBookings.map(b => (
                      <div
                        key={b.id}
                        onClick={() => setSelectedBooking(b)}
                        className={`p-2.5 rounded-xl border text-[11px] font-bold leading-tight relative cursor-pointer shadow-sm transition-all hover:translate-x-0.5 ${getBookingStyles(b)}`}
                      >
                        <div className="flex justify-between items-start">
                          <span className="font-extrabold text-[#2D241E] truncate">
                            {b.customerName}
                          </span>
                          <span className="text-[8px] font-black px-1.5 py-0.2 rounded bg-white/60 text-[#2D241E]">
                            {b.time || 'No Time'}
                          </span>
                        </div>
                        <div className="text-[10px] font-medium opacity-90 truncate mt-0.5">
                          {b.workshopName}
                        </div>
                        <div className="flex items-center gap-2 mt-1 text-[8px] font-black uppercase tracking-wider opacity-75">
                          <span>Pax: {b.pax}</span>
                          <span>•</span>
                          <span>{b.location}</span>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Booking Details Modal Pop-up (higher z-axis than timeline modal) */}
      {selectedBooking && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div 
            className="absolute inset-0 bg-[#2D241E]/45 backdrop-blur-xs"
            onClick={() => setSelectedBooking(null)}
          />
          <div className="relative w-full max-w-sm bg-white rounded-[32px] shadow-2xl overflow-hidden animate-in fade-in zoom-in duration-200">
            <div className={`h-2 ${getBookingStyles(selectedBooking).split(' ')[0]}`} />
            
            <div className="px-8 pt-8 pb-3 flex justify-between items-start">
              <div>
                <h4 className="text-2xl font-serif italic text-[#2D241E]">{selectedBooking.workshopName}</h4>
                <div className="flex items-center gap-2 mt-1">
                  <div className={`w-2 h-2 rounded-full ${
                    selectedBooking.status === 'completed' || selectedBooking.isCollected ? 'bg-gray-400' :
                    selectedBooking.status === 'confirmed' ? 'bg-amber-400' : 
                    selectedBooking.status === 'settled' ? 'bg-blue-400' : 'bg-red-400'
                  }`} />
                  <span className="text-[10px] font-black uppercase tracking-widest text-[#8C8379]">{selectedBooking.status}</span>
                </div>
              </div>
              <button 
                onClick={() => setSelectedBooking(null)}
                className="p-2 hover:bg-[#FAF9F6] rounded-full text-[#8C8379] transition-colors"
              >
                <X size={20} />
              </button>
            </div>

            <div className="px-8 py-6 space-y-4">
              <div className="flex items-start gap-4">
                <div className="w-8 h-8 rounded-xl bg-[#F2EFE9] flex items-center justify-center text-[#8C8379] shrink-0">
                  <Clock size={16} />
                </div>
                <div>
                  <p className="text-[8px] font-black uppercase tracking-widest text-[#A69D94]">Time & Date</p>
                  <p className="text-sm font-bold text-[#2D241E]">{format(new Date(selectedBooking.date), 'EEEE, do MMM')} @ {selectedBooking.time}</p>
                </div>
              </div>

              <div className="flex items-start gap-4">
                <div className="w-8 h-8 rounded-xl bg-[#F2EFE9] flex items-center justify-center text-[#8C8379] shrink-0">
                  <User size={16} />
                </div>
                <div>
                  <p className="text-[8px] font-black uppercase tracking-widest text-[#A69D94]">Participant</p>
                  <p className="text-sm font-bold text-[#2D241E]">{selectedBooking.customerName}</p>
                  <p className="text-[10px] text-[#8C8379] font-medium">{selectedBooking.pax} Person(s)</p>
                </div>
              </div>

              {selectedBooking.customerPhone && (
                <div className="flex items-start gap-4">
                  <div className="w-8 h-8 rounded-xl bg-[#F2EFE9] flex items-center justify-center text-[#8C8379] shrink-0">
                    <Phone size={16} />
                  </div>
                  <div>
                    <p className="text-[8px] font-black uppercase tracking-widest text-[#A69D94]">Phone Number</p>
                    <p className="text-sm font-bold text-[#2D241E]">{selectedBooking.customerPhone}</p>
                  </div>
                </div>
              )}

              <div className="flex items-start gap-4">
                <div className="w-8 h-8 rounded-xl bg-[#F2EFE9] flex items-center justify-center text-[#8C8379] shrink-0">
                  <MapPin size={16} />
                </div>
                <div>
                  <p className="text-[8px] font-black uppercase tracking-widest text-[#A69D94]">Location</p>
                  <p className="text-sm font-bold text-[#2D241E]">{selectedBooking.location === 'PG' ? 'Penang Branch' : 'Bukit Mertajam'}</p>
                </div>
              </div>

              {selectedBooking.notes && (
                <div className="flex items-start gap-4">
                  <div className="w-8 h-8 rounded-xl bg-[#F2EFE9] flex items-center justify-center text-[#8C8379] shrink-0">
                    <Tag size={16} />
                  </div>
                  <div>
                    <p className="text-[8px] font-black uppercase tracking-widest text-[#A69D94]">Staff Notes</p>
                    <p className="text-[10px] text-[#4A3F35] leading-relaxed italic">{selectedBooking.notes}</p>
                  </div>
                </div>
              )}
            </div>

            <div className="px-8 pb-8 flex gap-2">
              <div className="flex-1 bg-[#FAF9F6] border border-[#D9D1C7]/30 rounded-2xl p-3">
                <p className="text-[8px] font-black uppercase tracking-widest text-[#A69D94] mb-1">Payment Status</p>
                <div className="flex items-center gap-2">
                  <div className={`text-[10px] font-black uppercase px-2 py-0.5 rounded-full ${selectedBooking.depositPaid ? 'bg-[#F0F4ED] text-[#8B9A82]' : 'bg-[#FFF9F0] text-amber-500'}`}>
                    Dep: {selectedBooking.depositPaid ? 'Paid' : 'Pending'}
                  </div>
                  <div className={`text-[10px] font-black uppercase px-2 py-0.5 rounded-full ${selectedBooking.balancePaid ? 'bg-[#F0F4ED] text-[#8B9A82]' : 'bg-[#FFF9F0] text-amber-500'}`}>
                    Bal: {selectedBooking.balancePaid ? 'Paid' : 'Pending'}
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
