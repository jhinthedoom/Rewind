import React, { useState, useEffect } from 'react';
import { db } from '../firebase';
import { collection, onSnapshot, doc, setDoc, query, orderBy } from 'firebase/firestore';
import { Staff, Branch, OperationType, StaffTimesheet, TimesheetEntry } from '../types';
import { handleFirestoreError } from '../utils';
import { format, startOfMonth, endOfMonth, eachDayOfInterval, isSaturday, isSunday, parseISO, parse } from 'date-fns';
import { motion, AnimatePresence } from 'motion/react';
import { Calendar, Clock, DollarSign, Save, Sparkles, Trash2, ArrowRight, Check, AlertCircle, RefreshCw, Star, Printer, FileText, Settings, ChevronDown, ChevronUp } from 'lucide-react';

interface SalaryCalculatorProps {
  branch: Branch;
  role?: string;
}

const SalaryCalculator: React.FC<SalaryCalculatorProps> = ({ branch, role }) => {
  const [staff, setStaff] = useState<Staff[]>([]);
  const [selectedStaffId, setSelectedStaffId] = useState<string>('');
  const [selectedMonth, setSelectedMonth] = useState<string>(format(new Date(), 'yyyy-MM'));
  const [hourlyRate, setHourlyRate] = useState<number>(10);
  const [normalHoursLimit, setNormalHoursLimit] = useState<number>(8);
  const [breakDeduction, setBreakDeduction] = useState<number>(1);
  const [otMultiplier, setOtMultiplier] = useState<number>(1.5);
  const [holidayMultiplier, setHolidayMultiplier] = useState<number>(2.0);
  const [offDayMultiplier, setOffDayMultiplier] = useState<number>(1.5);
  const [restDayMultiplier, setRestDayMultiplier] = useState<number>(1.0);
  const [restDayOtMultiplier, setRestDayOtMultiplier] = useState<number>(2.0);
  const [holidayOtMultiplier, setHolidayOtMultiplier] = useState<number>(3.0);
  
  // Flat hourly rates in RM/hr
  const [otRate, setOtRate] = useState<number>(15.0);
  const [holidayRate, setHolidayRate] = useState<number>(20.0);
  const [offDayRate, setOffDayRate] = useState<number>(15.0);
  const [restDayRate, setRestDayRate] = useState<number>(10.0);
  const [restDayOtRate, setRestDayOtRate] = useState<number>(20.0);
  const [holidayOtRate, setHolidayOtRate] = useState<number>(30.0);
  const [entries, setEntries] = useState<{ [date: string]: TimesheetEntry }>({});
  const [loading, setLoading] = useState<boolean>(false);
  const [saving, setSaving] = useState<boolean>(false);
  const [saveStatus, setSaveStatus] = useState<'idle' | 'success' | 'error'>('idle');
  const [highlightedDate, setHighlightedDate] = useState<string | null>(null);
  const [loadedStateString, setLoadedStateString] = useState<string>('');
  const [lastSavedTime, setLastSavedTime] = useState<string | null>(null);

  // Malaysian Payslip specific states
  const [showSalaryRules, setShowSalaryRules] = useState<boolean>(false);
  const [activeTab, setActiveTab] = useState<'timesheet' | 'payslip'>('timesheet');
  const [companyName, setCompanyName] = useState<string>('NENDOA STUDIO ENTERPRISE');
  const [companyRegNo, setCompanyRegNo] = useState<string>('202403185935 (PG0558602-T)');
  const [employeeName, setEmployeeName] = useState<string>('');
  const [lastSelectedStaffId, setLastSelectedStaffId] = useState<string>('');
  const [employeeNo, setEmployeeNo] = useState<string>('');
  const [icNo, setIcNo] = useState<string>('');
  const [basicRate, setBasicRate] = useState<number>(0);
  const [attendanceAllowance, setAttendanceAllowance] = useState<number>(0);
  const [carAllowance, setCarAllowance] = useState<number>(0);
  const [otherAllowance, setOtherAllowance] = useState<number>(0);
  const [unpaidLeave, setUnpaidLeave] = useState<number>(0);
  const [othersDeduction, setOthersDeduction] = useState<number>(0);
  const [epfDeduction, setEpfDeduction] = useState<number>(0);
  const [socsoDeduction, setSocsoDeduction] = useState<number>(0);
  const [eisDeduction, setEisDeduction] = useState<number>(0);
  const [pcbDeduction, setPcbDeduction] = useState<number>(0);
  const [advanceDeduction, setAdvanceDeduction] = useState<number>(0);
  const [annualLeaveTaken, setAnnualLeaveTaken] = useState<number>(0);
  const [annualLeaveBalance, setAnnualLeaveBalance] = useState<number>(2);
  const [employerEpf, setEmployerEpf] = useState<number>(0);
  const [employerSocso, setEmployerSocso] = useState<number>(0);
  const [employerEis, setEmployerEis] = useState<number>(0);
  const [employerLevy, setEmployerLevy] = useState<number>(0);
  const [includeOtInEpf, setIncludeOtInEpf] = useState<boolean>(false);
  const [includeHolidayInEpf, setIncludeHolidayInEpf] = useState<boolean>(false);



  // Load staff list
  useEffect(() => {
    const qStaff = query(collection(db, 'staff'), orderBy('name', 'asc'));
    const unsubStaff = onSnapshot(qStaff, (snapshot) => {
      const data = snapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data()
      })) as Staff[];
      
      const activeStaff = data.filter(s => s.active);
      if (branch !== 'ALL') {
        setStaff(activeStaff.filter(s => s.branch === branch || s.branch === 'ALL'));
      } else {
        setStaff(activeStaff);
      }
    }, (error) => {
      handleFirestoreError(error, OperationType.LIST, 'staff');
    });

    return () => unsubStaff();
  }, [branch]);

  // Sync employeeName when staff list loads or selected staff changes
  useEffect(() => {
    if (selectedStaffId && staff.length > 0 && selectedStaffId !== lastSelectedStaffId) {
      setLastSelectedStaffId(selectedStaffId);
      const currentStaff = staff.find(s => s.id === selectedStaffId);
      if (currentStaff) {
        setEmployeeName(currentStaff.name || '');
      }
    }
  }, [selectedStaffId, staff, lastSelectedStaffId]);

  // Load timesheet for selected staff member and month
  useEffect(() => {
    if (!selectedStaffId || !selectedMonth) {
      setEntries({});
      return;
    }

    setLoading(true);
    setSaveStatus('idle');
    const docId = `${selectedStaffId}_${selectedMonth}`;
    const timesheetRef = doc(db, 'timesheets', docId);

    const unsubTimesheet = onSnapshot(timesheetRef, (snapshot) => {
      if (snapshot.exists()) {
        const data = snapshot.data() as StaffTimesheet;
        const hRate = data.hourlyRate || 10;
        setHourlyRate(hRate);
        setNormalHoursLimit(data.normalHoursLimit ?? 8);
        setBreakDeduction(data.breakDeduction ?? 1);
        
        const otMult = data.otMultiplier ?? 1.5;
        const holMult = data.holidayMultiplier ?? 2.0;
        const offMult = data.offDayMultiplier ?? 1.5;
        const restMult = data.restDayMultiplier ?? 1.0;
        const restOtMult = data.restDayOtMultiplier ?? 2.0;
        const holOtMult = data.holidayOtMultiplier ?? 3.0;

        setOtMultiplier(otMult);
        setHolidayMultiplier(holMult);
        setOffDayMultiplier(offMult);
        setRestDayMultiplier(restMult);
        setRestDayOtMultiplier(restOtMult);
        setHolidayOtMultiplier(holOtMult);
        
        setOtRate(data.otRate ?? (hRate * otMult));
        setHolidayRate(data.holidayRate ?? (hRate * holMult));
        setOffDayRate(data.offDayRate ?? (hRate * offMult));
        setRestDayRate(data.restDayRate ?? (hRate * restMult));
        setRestDayOtRate(data.restDayOtRate ?? (hRate * restOtMult));
        setHolidayOtRate(data.holidayOtRate ?? (hRate * holOtMult));
        
        setEntries(data.entries || {});
        
        // Load Malaysian Payslip specific values if available
        setEmployeeName(data.employeeName || staff.find(s => s.id === selectedStaffId)?.name || '');
        setEmployeeNo(data.employeeNo || '');
        setIcNo(data.icNo || '');
        setBasicRate(data.basicRate ?? 0);
        setAttendanceAllowance(data.attendanceAllowance ?? 0);
        setCarAllowance(data.carAllowance ?? 0);
        setOtherAllowance(data.otherAllowance ?? 0);
        setUnpaidLeave(data.unpaidLeave ?? 0);
        setOthersDeduction(data.othersDeduction ?? 0);
        setEpfDeduction(Math.ceil(data.epfDeduction ?? 0));
        setSocsoDeduction(data.socsoDeduction ?? 0);
        setEisDeduction(data.eisDeduction ?? 0);
        setPcbDeduction(data.pcbDeduction ?? 0);
        setAdvanceDeduction(data.advanceDeduction ?? 0);
        setAnnualLeaveTaken(data.annualLeaveTaken ?? 0);
        setAnnualLeaveBalance(data.annualLeaveBalance ?? 2);
        setEmployerEpf(Math.ceil(data.employerEpf ?? 0));
        setEmployerSocso(data.employerSocso ?? 0);
        setEmployerEis(data.employerEis ?? 0);
        setEmployerLevy(data.employerLevy ?? 0);
        setIncludeOtInEpf(data.includeOtInEpf ?? false);
        setIncludeHolidayInEpf(data.includeHolidayInEpf ?? false);

        // Store serialized initial loaded state
        setLoadedStateString(JSON.stringify({
          hourlyRate: hRate,
          normalHoursLimit: data.normalHoursLimit ?? 8,
          breakDeduction: data.breakDeduction ?? 1,
          otMultiplier: otMult,
          holidayMultiplier: holMult,
          offDayMultiplier: offMult,
          restDayMultiplier: restMult,
          restDayOtMultiplier: restOtMult,
          holidayOtMultiplier: holOtMult,
          otRate: data.otRate ?? (hRate * otMult),
          holidayRate: data.holidayRate ?? (hRate * holMult),
          offDayRate: data.offDayRate ?? (hRate * offMult),
          restDayRate: data.restDayRate ?? (hRate * restMult),
          restDayOtRate: data.restDayOtRate ?? (hRate * restOtMult),
          holidayOtRate: data.holidayOtRate ?? (hRate * holOtMult),
          entries: data.entries || {},
          employeeName: data.employeeName || staff.find(s => s.id === selectedStaffId)?.name || '',
          employeeNo: data.employeeNo || '',
          icNo: data.icNo || '',
          basicRate: data.basicRate ?? 0,
          attendanceAllowance: data.attendanceAllowance ?? 0,
          carAllowance: data.carAllowance ?? 0,
          otherAllowance: data.otherAllowance ?? 0,
          unpaidLeave: data.unpaidLeave ?? 0,
          othersDeduction: data.othersDeduction ?? 0,
          epfDeduction: Math.ceil(data.epfDeduction ?? 0),
          socsoDeduction: data.socsoDeduction ?? 0,
          eisDeduction: data.eisDeduction ?? 0,
          pcbDeduction: data.pcbDeduction ?? 0,
          advanceDeduction: data.advanceDeduction ?? 0,
          annualLeaveTaken: data.annualLeaveTaken ?? 0,
          annualLeaveBalance: data.annualLeaveBalance ?? 2,
          employerEpf: Math.ceil(data.employerEpf ?? 0),
          employerSocso: data.employerSocso ?? 0,
          employerEis: data.employerEis ?? 0,
          employerLevy: data.employerLevy ?? 0,
          includeOtInEpf: data.includeOtInEpf ?? false,
          includeHolidayInEpf: data.includeHolidayInEpf ?? false,
        }));
        setLastSavedTime(data.lastUpdated || data.createdAt || null);
      } else {
        // No timesheet found, reset entries but keep rate or default to 10
        const currentStaff = staff.find(s => s.id === selectedStaffId);
        const defaultRate = currentStaff?.hourlyRate || 10;
        setHourlyRate(defaultRate);
        setNormalHoursLimit(8);
        setBreakDeduction(1);
        setOtMultiplier(1.5);
        setHolidayMultiplier(2.0);
        setOffDayMultiplier(1.5);
        setRestDayMultiplier(1.0);
        setRestDayOtMultiplier(2.0);
        setHolidayOtMultiplier(3.0);
        
        setOtRate(defaultRate * 1.5);
        setHolidayRate(defaultRate * 2.0);
        setOffDayRate(defaultRate * 1.5);
        setRestDayRate(defaultRate * 1.0);
        setRestDayOtRate(defaultRate * 2.0);
        setHolidayOtRate(defaultRate * 3.0);
        setEntries({});
        
        // Reset Payslip specific values
        setEmployeeNo('');
        setIcNo('');
        setBasicRate(0);
        setAttendanceAllowance(0);
        setCarAllowance(0);
        setOtherAllowance(0);
        setUnpaidLeave(0);
        setOthersDeduction(0);
        setEpfDeduction(0);
        setSocsoDeduction(0);
        setEisDeduction(0);
        setPcbDeduction(0);
        setAdvanceDeduction(0);
        setAnnualLeaveTaken(0);
        setAnnualLeaveBalance(2);
        setEmployerEpf(0);
        setEmployerSocso(0);
        setEmployerEis(0);
        setEmployerLevy(0);
        setIncludeOtInEpf(false);
        setIncludeHolidayInEpf(false);

        setLoadedStateString(JSON.stringify({
          hourlyRate: defaultRate,
          normalHoursLimit: 8,
          breakDeduction: 1,
          otMultiplier: 1.5,
          holidayMultiplier: 2.0,
          offDayMultiplier: 1.5,
          restDayMultiplier: 1.0,
          restDayOtMultiplier: 2.0,
          holidayOtMultiplier: 3.0,
          otRate: defaultRate * 1.5,
          holidayRate: defaultRate * 2.0,
          offDayRate: defaultRate * 1.5,
          restDayRate: defaultRate * 1.0,
          restDayOtRate: defaultRate * 2.0,
          holidayOtRate: defaultRate * 3.0,
          entries: {},
          employeeName: currentStaff?.name || '',
          employeeNo: '',
          icNo: '',
          basicRate: 0,
          attendanceAllowance: 0,
          carAllowance: 0,
          otherAllowance: 0,
          unpaidLeave: 0,
          othersDeduction: 0,
          epfDeduction: 0,
          socsoDeduction: 0,
          eisDeduction: 0,
          pcbDeduction: 0,
          advanceDeduction: 0,
          annualLeaveTaken: 0,
          annualLeaveBalance: 2,
          employerEpf: 0,
          employerSocso: 0,
          employerEis: 0,
          employerLevy: 0,
          includeOtInEpf: false,
          includeHolidayInEpf: false,
        }));
        setLastSavedTime(null);
      }
      setLoading(false);
    }, (error) => {
      console.error("Error loading timesheet:", error);
      setLoading(false);
    });

    return () => unsubTimesheet();
  }, [selectedStaffId, selectedMonth]);

  // Generate all days for the selected month
  const daysInMonth = React.useMemo(() => {
    try {
      const [year, month] = selectedMonth.split('-').map(Number);
      const start = startOfMonth(new Date(year, month - 1, 1));
      const end = endOfMonth(new Date(year, month - 1, 1));
      return eachDayOfInterval({ start, end });
    } catch {
      return [];
    }
  }, [selectedMonth]);

  const currentStateString = React.useMemo(() => {
    return JSON.stringify({
      hourlyRate,
      normalHoursLimit,
      breakDeduction,
      otMultiplier,
      holidayMultiplier,
      offDayMultiplier,
      restDayMultiplier,
      restDayOtMultiplier,
      holidayOtMultiplier,
      otRate,
      holidayRate,
      offDayRate,
      restDayRate,
      restDayOtRate,
      holidayOtRate,
      entries,
      employeeName,
      employeeNo,
      icNo,
      basicRate,
      attendanceAllowance,
      carAllowance,
      otherAllowance,
      unpaidLeave,
      othersDeduction,
      epfDeduction,
      socsoDeduction,
      eisDeduction,
      pcbDeduction,
      advanceDeduction,
      annualLeaveTaken,
      annualLeaveBalance,
      employerEpf,
      employerSocso,
      employerEis,
      employerLevy,
      includeOtInEpf,
      includeHolidayInEpf,
    });
  }, [
    hourlyRate,
    normalHoursLimit,
    breakDeduction,
    otMultiplier,
    holidayMultiplier,
    offDayMultiplier,
    restDayMultiplier,
    restDayOtMultiplier,
    holidayOtMultiplier,
    otRate,
    holidayRate,
    offDayRate,
    restDayRate,
    restDayOtRate,
    holidayOtRate,
    entries,
    employeeName,
    employeeNo,
    icNo,
    basicRate,
    attendanceAllowance,
    carAllowance,
    otherAllowance,
    unpaidLeave,
    othersDeduction,
    epfDeduction,
    socsoDeduction,
    eisDeduction,
    pcbDeduction,
    advanceDeduction,
    annualLeaveTaken,
    annualLeaveBalance,
    employerEpf,
    employerSocso,
    employerEis,
    employerLevy,
    includeOtInEpf,
    includeHolidayInEpf,
  ]);

  const isDirty = React.useMemo(() => {
    if (!selectedStaffId || !selectedMonth || loading || !loadedStateString) return false;
    return loadedStateString !== currentStateString;
  }, [loadedStateString, currentStateString, selectedStaffId, selectedMonth, loading]);

  // Calculate hours worked for a single entry
  const calculateEntryHours = (entry: TimesheetEntry | undefined): number => {
    if (!entry || !entry.clockIn || !entry.clockOut) return 0;
    try {
      const [inH, inM] = entry.clockIn.split(':').map(Number);
      const [outH, outM] = entry.clockOut.split(':').map(Number);
      
      const totalInMinutes = inH * 60 + inM;
      const totalOutMinutes = outH * 60 + outM;
      
      if (totalOutMinutes <= totalInMinutes) return 0; // Invalid shift or midnight cross
      const elapsedHours = (totalOutMinutes - totalInMinutes) / 60;
      
      // Auto-deduct break hour if elapsed hours is >= 5 hours
      if (breakDeduction > 0 && elapsedHours >= 5) {
        return Math.max(0, elapsedHours - breakDeduction);
      }
      return elapsedHours;
    } catch {
      return 0;
    }
  };

  // Helper: Get fallback/configured Day Type for a given day
  const getDayType = (day: Date, entry: TimesheetEntry | undefined): 'normal' | 'off' | 'holiday' => {
    if (entry?.dayType === 'holiday' || entry?.isPublicHoliday) return 'holiday';
    if (entry?.dayType === 'off' || entry?.dayType === 'rest') return 'off';
    if (entry?.dayType === 'normal') return 'normal';
    
    // Default fallback if no entry is saved or dayType is not specified is 'normal'
    return 'normal';
  };

  // Helper: Core daily calculation based on Malaysian Employment Act & GAD payslip flat rates
  const getEntryCalculation = (day: Date, entry: TimesheetEntry | undefined, rate: number) => {
    const entryWithDefaults = {
      clockIn: entry?.clockIn || '10:00',
      clockOut: entry?.clockOut || '18:00',
      dayType: entry?.dayType || 'normal',
      isPublicHoliday: entry?.isPublicHoliday || false
    };

    const type = getDayType(day, entryWithDefaults);
    
    if (type === 'off') {
      return {
        totalHours: 0,
        normalHours: 0,
        otHours: 0,
        normalPay: 0,
        otPay: 0,
        extraPay: 0,
        dailySalary: 0,
        type
      };
    }

    const totalHours = calculateEntryHours(entryWithDefaults);
    
    let normalHours = 0;
    let otHours = 0;
    let normalPay = 0;
    let otPay = 0;
    let extraPay = 0;
    
    if (totalHours > 0) {
      normalHours = Math.min(totalHours, normalHoursLimit);
      otHours = Math.max(0, totalHours - normalHoursLimit);
      
      // Scale direct rates if the passed rate differs from standard base hourlyRate (e.g. on payslip basicRate conversion)
      const scaleFactor = hourlyRate > 0 ? (rate / hourlyRate) : 1;
      
      const effOtRate = otRate * scaleFactor;
      const effHolidayRate = holidayRate * scaleFactor;
      const effHolidayOtRate = holidayOtRate * scaleFactor;
      const effNormalRate = rate;

      if (type === 'normal') {
        normalPay = normalHours * effNormalRate;
        otPay = otHours * effOtRate;
        extraPay = 0;
      } else if (type === 'holiday') {
        normalPay = normalHours * effNormalRate;
        otPay = otHours * effHolidayOtRate;
        extraPay = normalHours * Math.max(0, effHolidayRate - rate);
      }
    }
    
    return {
      totalHours,
      normalHours,
      otHours,
      normalPay,
      otPay,
      extraPay,
      dailySalary: normalPay + otPay + extraPay,
      type
    };
  };

  // Handle manual input change
  const handleEntryChange = (dateStr: string, field: keyof TimesheetEntry, value: any) => {
    setEntries(prev => {
      const current = prev[dateStr] || { clockIn: '', clockOut: '', isPublicHoliday: false };
      let updatedEntry = { ...current, [field]: value };
      
      // Synchronize dayType with old checkbox
      if (field === 'dayType') {
        updatedEntry.isPublicHoliday = value === 'holiday';
      } else if (field === 'isPublicHoliday') {
        updatedEntry.dayType = value ? 'holiday' : 'normal';
      }
      
      return {
        ...prev,
        [dateStr]: updatedEntry
      };
    });
  };



  // Save timesheet to Firestore including Payslip fields
  const handleSaveTimesheet = async () => {
    if (!selectedStaffId || !selectedMonth) return;
    setSaving(true);
    setSaveStatus('idle');

    const selectedStaff = staff.find(s => s.id === selectedStaffId);
    if (!selectedStaff) return;

    try {
      const docId = `${selectedStaffId}_${selectedMonth}`;
      const timesheetRef = doc(db, 'timesheets', docId);

      const timesheetData: StaffTimesheet = {
        staffId: selectedStaffId,
        staffName: selectedStaff.name,
        month: selectedMonth,
        hourlyRate,
        normalHoursLimit,
        breakDeduction,
        otMultiplier,
        holidayMultiplier,
        offDayMultiplier,
        restDayMultiplier,
        restDayOtMultiplier,
        holidayOtMultiplier,
        otRate,
        holidayRate,
        offDayRate,
        restDayRate,
        restDayOtRate,
        holidayOtRate,
        entries,
        
        // Malaysian Payslip Fields
        employeeName,
        employeeNo,
        icNo,
        basicRate,
        attendanceAllowance,
        carAllowance,
        otherAllowance,
        unpaidLeave,
        othersDeduction,
        epfDeduction,
        socsoDeduction,
        eisDeduction,
        pcbDeduction,
        advanceDeduction,
        annualLeaveTaken,
        annualLeaveBalance,
        employerEpf,
        employerSocso,
        employerEis,
        employerLevy,
        includeOtInEpf,
        includeHolidayInEpf,
        
        createdAt: new Date().toISOString(),
        lastUpdated: new Date().toISOString()
      };

      await setDoc(timesheetRef, timesheetData);
      setLoadedStateString(currentStateString);
      setLastSavedTime(timesheetData.lastUpdated);
      setSaveStatus('success');
      setTimeout(() => setSaveStatus('idle'), 3000);
    } catch (e) {
      console.error("Error saving timesheet:", e);
      setSaveStatus('error');
    } finally {
      setSaving(false);
    }
  };

  // Auto-Calculate EPF / SOCSO / EIS based on Malaysia standard formula
  const handleAutoCalculateContributions = () => {
    let grossSalaryForEpf = basicRate + attendanceAllowance + carAllowance + otherAllowance;
    if (includeOtInEpf) {
      grossSalaryForEpf += summary.totalOtPay;
    }
    if (includeHolidayInEpf) {
      grossSalaryForEpf += summary.totalExtraPay;
    }

    if (grossSalaryForEpf <= 0) {
      alert("Please enter a Basic Rate or Monthly Basic Salary first!");
      return;
    }
    
    // EPF defaults: Employee = 11%, Employer = 13% for <= 5000, 12% for > 5000
    // Round up to the next whole number with no decimals allowed
    const calculatedEmployeeEpf = Math.ceil(grossSalaryForEpf * 0.11);
    const calculatedEmployerEpf = Math.ceil(grossSalaryForEpf * (grossSalaryForEpf <= 5000 ? 0.13 : 0.12));
    
    // SOCSO / PERKESO (roughly 0.494% for employee, 1.73% for employer, capped at RM 5,000)
    const activeSalaryForSocso = Math.min(grossSalaryForEpf, 5000);
    const calculatedEmployeeSocso = Math.round(activeSalaryForSocso * 0.00494 * 100) / 100;
    const calculatedEmployerSocso = Math.round(activeSalaryForSocso * 0.0173 * 100) / 100;
    
    // EIS / SIP (0.2% employee, 0.2% employer, capped at RM 5,000)
    const activeSalaryForEis = Math.min(grossSalaryForEpf, 5000);
    const calculatedEmployeeEis = Math.round(activeSalaryForEis * 0.002 * 100) / 100;
    const calculatedEmployerEis = Math.round(activeSalaryForEis * 0.002 * 100) / 100;

    setEpfDeduction(calculatedEmployeeEpf);
    setEmployerEpf(calculatedEmployerEpf);
    
    setSocsoDeduction(calculatedEmployeeSocso);
    setEmployerSocso(calculatedEmployerSocso);
    
    setEisDeduction(calculatedEmployeeEis);
    setEmployerEis(calculatedEmployerEis);
  };

   // Calculate timesheet summaries dynamically
  const summary = React.useMemo(() => {
    let totalHours = 0;
    let totalNormalHours = 0;
    let totalOtHours = 0;
    let totalNormalPay = 0;
    let totalOtPay = 0;
    let totalBasePay = 0;
    let totalExtraPay = 0;
    let workDaysCount = 0;
    let publicHolidaysWorked = 0;

    daysInMonth.forEach(day => {
      const dateStr = format(day, 'yyyy-MM-dd');
      const entry = entries[dateStr];
      const calc = getEntryCalculation(day, entry, hourlyRate);

      if (calc.totalHours > 0) {
        workDaysCount++;
        totalHours += calc.totalHours;
        totalNormalHours += calc.normalHours;
        totalOtHours += calc.otHours;
        totalNormalPay += calc.normalPay;
        totalOtPay += calc.otPay;
        totalBasePay += calc.totalHours * hourlyRate;
        totalExtraPay += calc.extraPay;
        
        if (calc.type === 'holiday') {
          publicHolidaysWorked++;
        }
      }
    });

    const finalBasePay = basicRate; // Keyed-in base pay
    const finalTotalSalary = finalBasePay + totalOtPay + totalExtraPay;

    return {
      totalHours,
      totalNormalHours,
      totalOtHours,
      totalNormalPay: finalBasePay,
      totalOtPay,
      totalBasePay: finalBasePay,
      totalExtraPay,
      totalSalary: finalTotalSalary,
      workDaysCount,
      publicHolidaysWorked
    };
  }, [daysInMonth, entries, hourlyRate, normalHoursLimit, otRate, holidayRate, offDayRate, restDayRate, restDayOtRate, holidayOtRate, basicRate]);

  // Calculate detailed categorised timesheet hours for the payslip
  const payslipEarnings = React.useMemo(() => {
    let normalOtHours = 0;
    let offDayHours = 0;
    let offDayOtHours = 0;
    let restDayHours = 0;
    let restDayOtHours = 0;
    let holidayHours = 0;
    let holidayOtHours = 0;
    
    daysInMonth.forEach(day => {
      const dateStr = format(day, 'yyyy-MM-dd');
      const entry = entries[dateStr];
      const calc = getEntryCalculation(day, entry, hourlyRate);
      
      if (calc.totalHours > 0) {
        if (calc.type === 'normal') {
          normalOtHours += calc.otHours;
        } else if (calc.type === 'holiday') {
          holidayHours += calc.normalHours;
          holidayOtHours += calc.otHours;
        }
      }
    });

    // OT and Holiday Extra rates are used exactly as listed in the vertical list (unscaled)
    const effNormalOtRate = otRate;
    const effHolidayRate = holidayRate;
    const effHolidayOtRate = holidayOtRate;
    
    // For holidays, extra pay is "double hourly rate - normal hourly rate"
    // Which means (holidayRate - hourlyRate) is the extra hourly rate
    const effHolidayExtraRate = Math.max(0, effHolidayRate - hourlyRate);
    
    // Amounts
    const normalOtAmount = normalOtHours * effNormalOtRate;
    const holidayAmount = holidayHours * effHolidayExtraRate;
    const holidayOtAmount = holidayOtHours * effHolidayOtRate;

    return {
      normalOtHours, normalOtRate: effNormalOtRate, normalOtAmount,
      offDayHours, offDayOtHours, offDayAmount: 0,
      restDayHours, restDayRate: 0, restDayAmount: 0,
      restDayOtHours, restDayOtRate: 0, restDayOtAmount: 0,
      holidayHours, holidayRate: effHolidayExtraRate, holidayAmount,
      holidayOtHours, holidayOtRate: effHolidayOtRate, holidayOtAmount,
    };
  }, [daysInMonth, entries, hourlyRate, otRate, holidayRate, holidayOtRate]);

  // Gross Earnings, Total Deductions, Net Pay calculation matching payslip
  const grossEarnings = summary.totalSalary + attendanceAllowance + carAllowance + otherAllowance - unpaidLeave;

  const grossEarningsAfterOthers = grossEarnings - othersDeduction;

  const totalDeductions = epfDeduction + socsoDeduction + eisDeduction + pcbDeduction;
  const nettPay = grossEarningsAfterOthers - totalDeductions - advanceDeduction;

  const handlePrintPayslip = () => {
    window.print();
  };

  return (
    <div className="space-y-6">
      {/* Stylesheet specifically for printing the payslip voucher in clean high-contrast black and white */}
      <style>{`
        @media print {
          body * {
            visibility: hidden;
            background: transparent !important;
          }
          #printable-payslip, #printable-payslip * {
            visibility: visible;
          }
          #printable-payslip {
            position: absolute;
            left: 0;
            top: 0;
            width: 100%;
            border: none !important;
            box-shadow: none !important;
            padding: 0 !important;
            margin: 0 !important;
            color: black !important;
          }
          .no-print {
            display: none !important;
          }
        }
      `}</style>

      {/* Top Banner Control Card */}
      <div className="bg-[#FAF9F6] border border-[#D9D1C7] rounded-[32px] p-6 shadow-sm relative overflow-hidden space-y-6 no-print">
        <div className="absolute top-0 right-0 w-64 h-64 bg-[#8B9A82]/5 rounded-full blur-3xl -mr-16 -mt-16 pointer-events-none" />
        
        {/* Row 1: Employee and Month selector */}
        <div className="grid grid-cols-1 md:grid-cols-12 gap-4 items-end relative z-10">
          <div className="md:col-span-5">
            <label className="block text-[8px] font-black uppercase text-[#8C8379] tracking-wider mb-1.5">
              Select Staff Member
            </label>
            <select
              value={selectedStaffId}
              onChange={(e) => {
                setSelectedStaffId(e.target.value);
                const selected = staff.find(s => s.id === e.target.value);
                if (selected) {
                  setEmployeeNo(selected.id?.substring(0, 5).toUpperCase() || '');
                }
              }}
              className="w-full bg-white border border-[#D9D1C7] text-xs py-2.5 px-3.5 rounded-xl text-[#2D241E] font-bold focus:outline-none focus:ring-1 focus:ring-[#8B9A82] transition-all"
            >
              <option value="">-- Choose Employee --</option>
              {staff.map((member) => (
                <option key={member.id} value={member.id}>
                  {member.name} ({member.branch})
                </option>
              ))}
            </select>
          </div>

          <div className="md:col-span-4">
            <label className="block text-[8px] font-black uppercase text-[#8C8379] tracking-wider mb-1.5">
              Select Month
            </label>
            <input
              type="month"
              value={selectedMonth}
              onChange={(e) => setSelectedMonth(e.target.value)}
              className="w-full bg-white border border-[#D9D1C7] text-xs py-2 px-3 rounded-xl text-[#2D241E] font-bold focus:outline-none focus:ring-1 focus:ring-[#8B9A82] transition-all"
            />
          </div>

          <div className="md:col-span-3 flex flex-col gap-1 justify-end items-end">
            <button
              onClick={handleSaveTimesheet}
              disabled={saving || !selectedStaffId}
              className="w-full md:w-auto md:min-w-[120px] flex items-center justify-center gap-1.5 py-1.5 px-3 bg-[#8B9A82] hover:bg-[#7A8A71] text-white rounded-lg text-[10px] font-bold uppercase tracking-wider transition-all disabled:opacity-40 disabled:cursor-not-allowed shadow-sm"
            >
              <Save size={11} />
              {saving ? 'Saving...' : 'Save Sheet'}
            </button>
            {selectedStaffId && (
              <div className="flex flex-col items-center md:items-end text-[8px] leading-tight font-black tracking-widest mt-1 text-center md:text-right">
                {isDirty ? (
                  <span className="text-amber-600 uppercase tracking-wider flex items-center gap-1">
                    <span className="w-1 h-1 rounded-full bg-amber-500 animate-pulse inline-block" />
                    Unsaved Changes
                  </span>
                ) : (
                  <span className="text-emerald-600 uppercase tracking-wider flex items-center gap-1">
                    <span className="w-1 h-1 rounded-full bg-emerald-500 inline-block" />
                    Saved
                  </span>
                )}
                {lastSavedTime && (
                  <span className="text-[7.5px] font-bold text-gray-400 mt-0.5 lowercase first-letter:uppercase">
                    Last saved: {new Date(lastSavedTime).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })} ({new Date(lastSavedTime).toLocaleDateString([], { month: 'short', day: 'numeric' })})
                  </span>
                )}
              </div>
            )}
          </div>
        </div>

        {/* Row 2: Navigation Tabs */}
        {selectedStaffId && (
          <div className="border-t border-[#D9D1C7]/40 pt-4 flex gap-2">
            <button
              onClick={() => setActiveTab('timesheet')}
              className={`flex items-center gap-2 px-5 py-2 rounded-xl text-xs font-bold uppercase tracking-wider transition-all ${
                activeTab === 'timesheet'
                  ? 'bg-[#2D241E] text-[#FAF9F6]'
                  : 'bg-white border border-[#D9D1C7] text-[#8C8379] hover:bg-[#FAF9F6]'
              }`}
            >
              <Calendar size={14} />
              Log Timesheet Calendar
            </button>
            <button
              onClick={() => {
                setActiveTab('payslip');
                if (basicRate === 0) {
                  // Pre-fill a standard basic salary helper if zero
                  setBasicRate(hourlyRate * 208);
                }
              }}
              className={`flex items-center gap-2 px-5 py-2 rounded-xl text-xs font-bold uppercase tracking-wider transition-all ${
                activeTab === 'payslip'
                  ? 'bg-[#2D241E] text-[#FAF9F6]'
                  : 'bg-white border border-[#D9D1C7] text-[#8C8379] hover:bg-[#FAF9F6]'
              }`}
            >
              <FileText size={14} />
              Malaysian Payslip Generator
            </button>
          </div>
        )}
      </div>

      {selectedStaffId ? (
        <AnimatePresence mode="wait">
          {activeTab === 'timesheet' ? (
            <motion.div
              key="timesheet-view"
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -10 }}
              className="space-y-6 no-print"
            >
              {/* Salary Rules & Formula Settings */}
              <div className="bg-[#FAF9F6] border border-[#D9D1C7] rounded-[32px] p-6 shadow-sm space-y-4">
                <button
                  type="button"
                  onClick={() => setShowSalaryRules(!showSalaryRules)}
                  className="w-full flex items-center justify-between gap-2 text-left focus:outline-none group"
                >
                  <div className="flex items-center gap-2">
                    <Sparkles size={14} className="text-[#8B9A82]" />
                    <span className="text-[10px] font-black uppercase text-[#2D241E] tracking-wider">Salary Rules & Formula Settings</span>
                    <span className="text-[8px] font-black uppercase text-[#8C8379] bg-[#EBE7DF]/50 px-2 py-0.5 rounded-full tracking-wider group-hover:bg-[#EBE7DF] transition-all">
                      {showSalaryRules ? 'Hide Rules' : 'Show Rules & Settings'}
                    </span>
                  </div>
                  <div className="text-[#8C8379] group-hover:text-[#2D241E] transition-all">
                    {showSalaryRules ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
                  </div>
                </button>

                {showSalaryRules && (
                  <div className="border-t border-[#D9D1C7]/30 pt-4 space-y-6">
                    <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
                  {/* Left Column: Base Configuration */}
                  <div className="space-y-4">
                    <div className="flex items-center gap-1.5 text-xs font-bold text-[#2D241E]">
                      <span className="w-1.5 h-1.5 rounded-full bg-[#8B9A82]" />
                      <span>Base Configurations</span>
                    </div>
                    
                    <div className="space-y-4">
                      <div>
                        <label className="block text-[8px] font-black uppercase text-[#8C8379] tracking-wider mb-1.5">
                          Base Hourly Rate (RM)
                        </label>
                        <div className="relative">
                          <span className="absolute left-3 top-2.5 text-xs text-[#8C8379] font-bold">RM</span>
                          <input
                            type="number"
                            min="1"
                            step="0.5"
                            value={hourlyRate}
                            onChange={(e) => {
                              const val = Number(e.target.value);
                              setHourlyRate(val);
                              // Scale direct hourly rates automatically based on default multipliers
                              setOtRate(Number((val * otMultiplier).toFixed(2)));
                              setHolidayRate(Number((val * holidayMultiplier).toFixed(2)));
                              setOffDayRate(Number((val * offDayMultiplier).toFixed(2)));
                              setRestDayRate(Number((val * restDayMultiplier).toFixed(2)));
                              setRestDayOtRate(Number((val * restDayOtMultiplier).toFixed(2)));
                              setHolidayOtRate(Number((val * holidayOtMultiplier).toFixed(2)));
                            }}
                            className="w-full bg-white border border-[#D9D1C7] text-xs py-2 pl-9 pr-3 rounded-xl text-[#2D241E] font-bold focus:outline-none focus:ring-1 focus:ring-[#8B9A82] transition-all"
                          />
                        </div>
                      </div>

                      <div>
                        <label className="block text-[8px] font-black uppercase text-[#8C8379] tracking-wider mb-1.5">
                          Monthly Base Pay (RM)
                        </label>
                        <div className="relative">
                          <span className="absolute left-3 top-2.5 text-xs text-[#8C8379] font-bold">RM</span>
                          <input
                            type="number"
                            min="0"
                            step="50"
                            value={basicRate || ''}
                            onChange={(e) => setBasicRate(Number(e.target.value))}
                            placeholder="e.g. 3000"
                            className="w-full bg-white border border-[#D9D1C7] text-xs py-2 pl-9 pr-3 rounded-xl text-[#2D241E] font-bold focus:outline-none focus:ring-1 focus:ring-[#8B9A82] transition-all"
                          />
                        </div>
                        <p className="text-[8px] text-[#8C8379] mt-1">Flat base pay amount. OT and Extra pay are added on top of this.</p>
                      </div>

                      <div>
                        <label className="block text-[8px] font-black uppercase text-[#8C8379] tracking-wider mb-1.5">
                          Normal Working Hours Limit
                        </label>
                        <div className="relative">
                          <input
                            type="number"
                            min="1"
                            max="24"
                            step="0.5"
                            value={normalHoursLimit}
                            onChange={(e) => setNormalHoursLimit(Number(e.target.value))}
                            className="w-full bg-white border border-[#D9D1C7] text-xs py-2 px-3 rounded-xl text-[#2D241E] font-bold focus:outline-none focus:ring-1 focus:ring-[#8B9A82] transition-all"
                          />
                          <span className="absolute right-3 top-2.5 text-[9px] uppercase font-bold text-[#8C8379]">hrs/day</span>
                        </div>
                        <p className="text-[8px] text-[#8C8379] mt-1">Standard limit of working hours per day before OT applies.</p>
                      </div>

                      <div>
                        <label className="block text-[8px] font-black uppercase text-[#8C8379] tracking-wider mb-1.5">
                          Unpaid Break Deduction
                        </label>
                        <div className="relative">
                          <input
                            type="number"
                            min="0"
                            max="8"
                            step="0.5"
                            value={breakDeduction}
                            onChange={(e) => setBreakDeduction(Number(e.target.value))}
                            className="w-full bg-white border border-[#D9D1C7] text-xs py-2 px-3 rounded-xl text-[#2D241E] font-bold focus:outline-none focus:ring-1 focus:ring-[#8B9A82] transition-all"
                          />
                          <span className="absolute right-3 top-2.5 text-[9px] uppercase font-bold text-[#8C8379]">hrs/day</span>
                        </div>
                        <p className="text-[8px] text-[#8C8379] mt-1">Deducted automatically from total hours if continuous shifts exceed 5 hours.</p>
                      </div>
                    </div>
                  </div>

                  {/* Right Column: Hourly Rates (Vertical List) */}
                  <div className="space-y-4">
                    <div className="flex items-center gap-1.5 text-xs font-bold text-[#2D241E]">
                      <span className="w-1.5 h-1.5 rounded-full bg-amber-500" />
                      <span>Hourly Rates (Vertical List)</span>
                    </div>

                    <div className="space-y-4 max-h-[320px] overflow-y-auto pr-2 scrollbar-thin scrollbar-thumb-gray-200">
                      {/* 1. Overtime (OT) Rate */}
                      <div className="flex items-center justify-between gap-4 border-b border-[#D9D1C7]/20 pb-2">
                        <div className="flex-1">
                          <span className="block text-[10px] font-bold text-[#2D241E]">Overtime (OT) Rate</span>
                          <span className="block text-[8px] text-[#8C8379]">Applied to hours exceeding daily limit on normal days.</span>
                        </div>
                        <div className="relative w-36">
                          <span className="absolute left-3 top-2 text-xs text-[#8C8379] font-bold">RM</span>
                          <input
                            type="number"
                            min="0"
                            step="0.1"
                            value={otRate}
                            onChange={(e) => setOtRate(Number(e.target.value))}
                            className="w-full bg-white border border-[#D9D1C7] text-xs py-2 pl-9 pr-8 rounded-xl text-[#2D241E] font-bold focus:outline-none focus:ring-1 focus:ring-[#8B9A82] transition-all text-left"
                          />
                          <span className="absolute right-3 top-2 text-[8px] uppercase font-bold text-[#8C8379]">/hr</span>
                        </div>
                      </div>



                      {/* 5. Public Holiday Rate */}
                      <div className="flex items-center justify-between gap-4 border-b border-[#D9D1C7]/20 pb-2">
                        <div className="flex-1">
                          <span className="block text-[10px] font-bold text-[#2D241E]">Public Holiday Rate</span>
                          <span className="block text-[8px] text-[#8C8379]">Rate for standard working hours on Public Holidays.</span>
                        </div>
                        <div className="relative w-36">
                          <span className="absolute left-3 top-2 text-xs text-[#8C8379] font-bold">RM</span>
                          <input
                            type="number"
                            min="0"
                            step="0.1"
                            value={holidayRate}
                            onChange={(e) => setHolidayRate(Number(e.target.value))}
                            className="w-full bg-white border border-[#D9D1C7] text-xs py-2 pl-9 pr-8 rounded-xl text-[#2D241E] font-bold focus:outline-none focus:ring-1 focus:ring-[#8B9A82] transition-all text-left"
                          />
                          <span className="absolute right-3 top-2 text-[8px] uppercase font-bold text-[#8C8379]">/hr</span>
                        </div>
                      </div>

                      {/* 6. Public Holiday OT Rate */}
                      <div className="flex items-center justify-between gap-4 pb-1">
                        <div className="flex-1">
                          <span className="block text-[10px] font-bold text-[#2D241E]">Public Holiday OT Rate</span>
                          <span className="block text-[8px] text-[#8C8379]">Rate for overtime hours worked on Public Holidays.</span>
                        </div>
                        <div className="relative w-36">
                          <span className="absolute left-3 top-2 text-xs text-[#8C8379] font-bold">RM</span>
                          <input
                            type="number"
                            min="0"
                            step="0.1"
                            value={holidayOtRate}
                            onChange={(e) => setHolidayOtRate(Number(e.target.value))}
                            className="w-full bg-white border border-[#D9D1C7] text-xs py-2 pl-9 pr-8 rounded-xl text-[#2D241E] font-bold focus:outline-none focus:ring-1 focus:ring-[#8B9A82] transition-all text-left"
                          />
                          <span className="absolute right-3 top-2 text-[8px] uppercase font-bold text-[#8C8379]">/hr</span>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
                
                    <div className="text-[9px] text-[#8C8379] italic leading-relaxed border-t border-[#D9D1C7]/20 pt-3">
                      * Note: Hourly rates shown above apply to this employee's timesheet. Changes are saved per employee timesheet per month.
                    </div>
                  </div>
                )}
              </div>

              {/* Dashboard Summary Widgets */}
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                <div className="bg-[#FAF9F6] border border-[#D9D1C7] p-5 rounded-[24px] flex flex-col justify-between">
                  <span className="text-[9px] font-black uppercase text-[#8C8379] tracking-wider">Total Salary</span>
                  <div>
                    <span className="text-2xl font-serif text-[#2D241E] font-semibold">
                      RM {summary.totalSalary.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                    </span>
                    <div className="text-[9px] text-[#8C8379] mt-1.5 flex flex-wrap gap-2">
                      <span>Base: RM {summary.totalNormalPay.toFixed(2)}</span>
                      <span className="border-l border-[#D9D1C7] pl-2">OT: RM {summary.totalOtPay.toFixed(2)}</span>
                      <span className="border-l border-[#D9D1C7] pl-2">Extra: RM {summary.totalExtraPay.toFixed(2)}</span>
                    </div>
                  </div>
                </div>

                <div className="bg-[#FAF9F6] border border-[#D9D1C7] p-5 rounded-[24px] flex flex-col justify-between">
                  <span className="text-[9px] font-black uppercase text-[#8C8379] tracking-wider">Total Hours Worked</span>
                  <div>
                    <span className="text-2xl font-serif text-[#2D241E] font-semibold">
                      {summary.totalHours.toFixed(1)} hrs
                    </span>
                    <div className="text-[9px] text-[#8C8379] mt-1.5 flex gap-2">
                      <span>Reg: {summary.totalNormalHours.toFixed(1)}h</span>
                      <span className="border-l border-[#D9D1C7] pl-2">OT: {summary.totalOtHours.toFixed(1)}h</span>
                    </div>
                  </div>
                </div>

                <div className="bg-[#FAF9F6] border border-[#D9D1C7] p-5 rounded-[24px] flex flex-col justify-between">
                  <span className="text-[9px] font-black uppercase text-[#8C8379] tracking-wider">Days Logged</span>
                  <span className="text-2xl font-serif text-[#2D241E] mt-2 font-semibold">
                    {summary.workDaysCount} days
                  </span>
                </div>

                <div className="bg-[#FAF9F6] border border-[#D9D1C7] p-5 rounded-[24px] flex flex-col justify-between">
                  <span className="text-[9px] font-black uppercase text-[#8C8379] tracking-wider">Public Holidays</span>
                  <span className="text-2xl font-serif text-[#2D241E] mt-2 font-semibold flex items-center gap-1.5 text-amber-600">
                    <Star size={18} className="fill-current" />
                    {summary.publicHolidaysWorked} days
                  </span>
                </div>
              </div>



              {/* Timesheet Vertical Calendar */}
              <div>
                <div className="bg-[#2D241E] py-4 px-6 rounded-t-[24px] border-b border-white/10 flex justify-between items-center">
                  <div>
                    <h2 className="text-sm font-bold text-white uppercase tracking-widest leading-none flex items-center gap-2">
                      <Calendar size={16} className="text-[#8B9A82]" /> Timesheet Calendar logs
                    </h2>
                    <p className="text-[7px] font-black uppercase text-white/40 tracking-tighter mt-1">
                      Vertical month scheduler with Day Type multipliers & Holiday overrides
                    </p>
                  </div>

                  <AnimatePresence>
                    {saveStatus === 'success' && (
                      <motion.span
                        initial={{ opacity: 0, x: 20 }}
                        animate={{ opacity: 1, x: 0 }}
                        exit={{ opacity: 0, x: 20 }}
                        className="text-[9px] font-black uppercase tracking-widest text-emerald-400 bg-emerald-500/10 px-3 py-1 rounded-md border border-emerald-500/20"
                      >
                        Saved successfully
                      </motion.span>
                    )}
                  </AnimatePresence>
                </div>

                <div className="bg-white rounded-b-[32px] border border-[#D9D1C7] p-6 shadow-sm overflow-hidden">
                  {loading ? (
                    <div className="py-20 text-center text-[#8C8379] italic flex flex-col items-center gap-3">
                      <RefreshCw size={24} className="animate-spin text-[#8B9A82]" />
                      <span>Syncing cloud records...</span>
                    </div>
                  ) : (
                    <>
                      {/* iOS Style Calendar Widget */}
                      <div className="mb-8 bg-[#FAF9F6] border border-[#D9D1C7] rounded-2xl p-4 sm:p-5">
                        <div className="flex items-center justify-between mb-4 pb-3 border-b border-[#D9D1C7]/40">
                          <div className="flex items-center gap-2">
                            <span className="w-2.5 h-2.5 rounded-full bg-[#8B9A82]" />
                            <h3 className="text-xs font-black uppercase tracking-wider text-[#2D241E]">
                              Monthly Calendar Overview
                            </h3>
                          </div>
                          <div className="text-[10px] font-mono font-bold text-[#8C8379] uppercase bg-white border border-[#D9D1C7] px-2.5 py-1 rounded-lg">
                            {selectedMonth ? format(new Date(selectedMonth + '-01'), 'MMMM yyyy') : ''}
                          </div>
                        </div>

                        {/* Weekday Labels */}
                        <div className="grid grid-cols-7 text-center mb-2">
                          {['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].map((d, idx) => (
                            <div
                              key={d}
                              className={`text-[9px] font-black uppercase tracking-wider ${
                                idx === 0 || idx === 6 ? 'text-red-500/70' : 'text-[#8C8379]'
                              }`}
                            >
                              {d}
                            </div>
                          ))}
                        </div>

                        {/* Day Grid */}
                        <div className="grid grid-cols-7 gap-1.5 sm:gap-2">
                          {/* Empty/Padding Cells at start of month */}
                          {Array.from({
                            length: daysInMonth.length > 0 ? daysInMonth[0].getDay() : 0,
                          }).map((_, i) => (
                            <div key={`pad-${i}`} className="aspect-square" />
                          ))}

                          {/* Month Days */}
                          {daysInMonth.map((day) => {
                            const dateStr = format(day, 'yyyy-MM-dd');
                            const entry = entries[dateStr];
                            const calc = getEntryCalculation(day, entry, hourlyRate);
                            const isOff = getDayType(day, entry) === 'off';
                            const isHoliday = getDayType(day, entry) === 'holiday';
                            const hasOt = calc.otHours > 0;
                            const hasExtraPay = calc.extraPay > 0;
                            const hasWorked = calc.totalHours > 0;

                            // Decide visual style matching requested logic
                            let styleClasses = 'bg-white text-[#2D241E] border-[#D9D1C7]/30';
                            let statusLabel = 'No logs';
                            let badgeText = '';
                            let badgeClasses = '';

                            if (isHoliday) {
                              if (hasWorked) {
                                styleClasses = 'bg-pink-100 text-pink-700 border-pink-300 font-bold ring-1 ring-pink-300';
                                statusLabel = 'Public Holiday (Worked)';
                                badgeText = 'HOL+WRK';
                                badgeClasses = 'text-pink-700 bg-pink-200/80';
                              } else {
                                styleClasses = 'bg-pink-50 text-pink-500 border-pink-200';
                                statusLabel = 'Public Holiday (Unworked)';
                                badgeText = 'HOL';
                                badgeClasses = 'text-pink-500 bg-pink-100/60';
                              }
                            } else if (isOff) {
                              styleClasses = 'bg-gray-100 text-gray-500 border-gray-300';
                              statusLabel = 'Off Day';
                              badgeText = 'OFF';
                              badgeClasses = 'text-gray-600 bg-gray-200';
                            } else if (hasWorked) {
                              if (hasOt || hasExtraPay) {
                                styleClasses = 'bg-blue-50 text-blue-700 border-blue-200 font-bold';
                                statusLabel = 'Worked Extra (OT)';
                                badgeText = '+OT';
                                badgeClasses = 'text-blue-700 bg-blue-100';
                              } else {
                                styleClasses = 'bg-[#8B9A82]/10 text-[#2D241E] border-[#8B9A82]/30';
                                statusLabel = 'Normal Worked Day';
                                badgeText = `${calc.totalHours.toFixed(0)}h`;
                                badgeClasses = 'text-[#5F6A56] bg-[#8B9A82]/20';
                              }
                            }

                            return (
                              <button
                                key={dateStr}
                                onClick={() => {
                                  const element = document.getElementById(`row-${dateStr}`);
                                  if (element) {
                                    element.scrollIntoView({ behavior: 'smooth', block: 'center' });
                                    setHighlightedDate(dateStr);
                                    setTimeout(() => setHighlightedDate(null), 1500);
                                  }
                                }}
                                className={`aspect-square flex flex-col justify-between p-1.5 sm:p-2 border rounded-xl hover:scale-105 active:scale-95 transition-all text-left relative overflow-hidden group ${styleClasses}`}
                                title={`${format(day, 'dd MMM yyyy')} - ${statusLabel}`}
                              >
                                <span className="text-[10px] sm:text-[11px] font-mono font-bold leading-none">
                                  {format(day, 'd')}
                                </span>

                                {/* Extra pay and OT pay amounts */}
                                {(calc.otPay > 0 || calc.extraPay > 0) && (
                                  <div className="flex flex-col gap-0.5 my-1 text-[8px] sm:text-[9px] font-extrabold leading-none">
                                    {calc.otPay > 0 && (
                                      <span className={isHoliday ? "text-pink-800" : "text-blue-800"}>
                                        OT: RM{calc.otPay.toFixed(2)}
                                      </span>
                                    )}
                                    {calc.extraPay > 0 && (
                                      <span className="text-pink-800">
                                        Extra: RM{calc.extraPay.toFixed(2)}
                                      </span>
                                    )}
                                  </div>
                                )}


                              </button>
                            );
                          })}
                        </div>

                        {/* Legend */}
                        <div className="mt-4 pt-3 border-t border-[#D9D1C7]/30 flex flex-wrap gap-x-4 gap-y-2 items-center text-[9px] font-black uppercase tracking-wider text-[#8C8379]">
                          <span className="text-[#2D241E]">Legend:</span>
                          <div className="flex items-center gap-1.5">
                            <span className="w-2.5 h-2.5 rounded border border-blue-200 bg-blue-50" />
                            <span>Worked Extra / OT (+OT)</span>
                          </div>
                          <div className="flex items-center gap-1.5">
                            <span className="w-2.5 h-2.5 rounded border border-pink-200 bg-pink-50" />
                            <span>Public Holiday (HOL)</span>
                          </div>
                          <div className="flex items-center gap-1.5">
                            <span className="w-2.5 h-2.5 rounded border border-gray-300 bg-gray-100" />
                            <span>Off Day (OFF)</span>
                          </div>
                          <div className="flex items-center gap-1.5">
                            <span className="w-2.5 h-2.5 rounded border border-[#8B9A82]/30 bg-[#8B9A82]/10" />
                            <span>Normal Worked Day</span>
                          </div>
                        </div>
                      </div>

                      <div className="overflow-x-auto">
                        <table className="w-full text-xs border-collapse">
                          <thead>
                            <tr className="border-b border-[var(--border-app)] bg-[var(--bg-header)] text-[var(--text-header)] font-black uppercase tracking-wider text-[9px] text-left">
                              <th className="py-2.5 px-2">Date / Day</th>
                              <th className="py-2.5 px-1 text-center w-[85px]">Clock In</th>
                              <th className="py-2.5 px-1 text-center w-[85px]">Clock Out</th>
                              <th className="py-2.5 px-1 text-center w-[110px]">Day Type</th>
                              <th className="py-2.5 px-2 text-center">Total Hours</th>
                              <th className="py-2.5 px-2 text-center">OT Hours</th>
                              <th className="py-2.5 px-2 text-right">OT Pay</th>
                              <th className="py-2.5 px-2 text-right">Extra Pay</th>
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-[#D9D1C7]/20 text-[#2D241E]">
                            {daysInMonth.map((day) => {
                              const dateStr = format(day, 'yyyy-MM-dd');
                              const entry = entries[dateStr] || { clockIn: '', clockOut: '', isPublicHoliday: false };
                              const isSat = isSaturday(day);
                              const isSun = isSunday(day);
                              
                              const calc = getEntryCalculation(day, entry, hourlyRate);

                              return (
                                <tr
                                  key={dateStr}
                                  id={`row-${dateStr}`}
                                  className={`hover:bg-[#FAF9F6] transition-all duration-300 ${
                                    highlightedDate === dateStr
                                      ? 'bg-amber-100/60 scale-[1.01] shadow-md border-y border-amber-300'
                                      : isSun
                                      ? 'bg-red-50/10'
                                      : isSat
                                      ? 'bg-amber-50/10'
                                      : ''
                                  }`}
                                >
                                {/* Date Column */}
                                <td className="py-2.5 px-2 font-medium">
                                  <div className="flex items-center gap-2">
                                    <span className={`w-1.5 h-1.5 rounded-full ${calc.totalHours > 0 ? 'bg-[#8B9A82]' : 'bg-gray-300'}`} />
                                    <div>
                                      <p className="font-bold text-[#2D241E]">
                                        {format(day, 'dd MMM')}
                                      </p>
                                      <p className={`text-[9px] uppercase font-black tracking-widest ${isSun || isSat ? 'text-red-500/70' : 'text-[#8C8379]'}`}>
                                        {format(day, 'EEEE')}
                                      </p>
                                    </div>
                                  </div>
                                </td>

                                {/* Clock In */}
                                <td className="py-2.5 px-1 text-center w-[85px]">
                                  <input
                                    type="time"
                                    value={getDayType(day, entry) === 'off' ? '' : (entry.clockIn || '10:00')}
                                    disabled={getDayType(day, entry) === 'off'}
                                    onChange={(e) => handleEntryChange(dateStr, 'clockIn', e.target.value)}
                                    className={`bg-[#FAF9F6] border border-[#D9D1C7] text-[11px] font-mono py-1 px-1.5 text-center rounded-lg text-[#2D241E] focus:outline-none w-[70px] inline-block ${
                                      getDayType(day, entry) === 'off' ? 'opacity-40 cursor-not-allowed' : ''
                                    }`}
                                  />
                                </td>

                                {/* Clock Out */}
                                <td className="py-2.5 px-1 text-center w-[85px]">
                                  <input
                                    type="time"
                                    value={getDayType(day, entry) === 'off' ? '' : (entry.clockOut || '18:00')}
                                    disabled={getDayType(day, entry) === 'off'}
                                    onChange={(e) => handleEntryChange(dateStr, 'clockOut', e.target.value)}
                                    className={`bg-[#FAF9F6] border border-[#D9D1C7] text-[11px] font-mono py-1 px-1.5 text-center rounded-lg text-[#2D241E] focus:outline-none w-[70px] inline-block ${
                                      getDayType(day, entry) === 'off' ? 'opacity-40 cursor-not-allowed' : ''
                                    }`}
                                  />
                                </td>

                                {/* Day Type Selector */}
                                <td className="py-2.5 px-1 text-center w-[110px]">
                                  <select
                                    value={getDayType(day, entry)}
                                    onChange={(e) => handleEntryChange(dateStr, 'dayType', e.target.value)}
                                    className="bg-white border border-[#D9D1C7] text-[9px] py-1 px-1 rounded-lg text-[#2D241E] font-bold focus:outline-none focus:ring-1 focus:ring-[#8B9A82] transition-all w-[100px]"
                                  >
                                    <option value="normal">Normal (1x)</option>
                                    <option value="holiday">Holiday (2.0x)</option>
                                    <option value="off">Off Day</option>
                                  </select>
                                </td>

                                {/* Total Hours */}
                                <td className="py-2.5 px-2 text-center font-mono font-bold text-[12px] text-[#2D241E]">
                                  {calc.totalHours > 0 ? (
                                    <span className="font-extrabold">{calc.totalHours.toFixed(1)} hrs</span>
                                  ) : (
                                    <span className="text-[#8C8379]/40 font-normal italic">--</span>
                                  )}
                                </td>

                                {/* OT Hours */}
                                <td className="py-2.5 px-2 text-center font-mono font-bold text-[12px] text-amber-700">
                                  {calc.otHours > 0 ? (
                                    <span className="bg-amber-50 border border-amber-100/50 px-1.5 py-0.5 rounded text-amber-800">
                                      {calc.otHours.toFixed(1)} hrs
                                    </span>
                                  ) : (
                                    <span className="text-[#8C8379]/40 font-normal italic">--</span>
                                  )}
                                </td>

                                {/* OT Pay */}
                                <td className="py-2.5 px-2 text-right font-mono font-bold text-[12px] text-amber-700">
                                  {calc.otPay > 0 ? (
                                    <span className="text-amber-700">RM {calc.otPay.toFixed(2)}</span>
                                  ) : (
                                    <span className="text-[#8C8379]/40 font-normal italic">--</span>
                                  )}
                                </td>

                                {/* Extra Pay */}
                                <td className="py-2.5 px-2 text-right font-mono font-bold text-[12px] text-emerald-700">
                                  {calc.extraPay > 0 ? (
                                    <span className="text-emerald-700">RM {calc.extraPay.toFixed(2)}</span>
                                  ) : (
                                    <span className="text-[#8C8379]/40 font-normal italic">--</span>
                                  )}
                                </td>
                              </tr>
                            );
                          })}
                        </tbody>
                      </table>
                    </div>
                    </>
                  )}
                </div>
              </div>
            </motion.div>
          ) : (
            <motion.div
              key="payslip-view"
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -10 }}
              className="grid grid-cols-1 lg:grid-cols-12 gap-6"
            >
              {/* Left Side: Payslip Configuration Form */}
              <div className="lg:col-span-5 space-y-6 no-print">
                <div className="bg-[#FAF9F6] border border-[#D9D1C7] rounded-[32px] p-6 shadow-sm space-y-5">
                  <div className="flex items-center gap-2 border-b border-[#D9D1C7]/40 pb-3">
                    <Settings size={16} className="text-[#8B9A82]" />
                    <span className="text-[10px] font-black uppercase text-[#2D241E] tracking-wider">Configure Payslip Metrics</span>
                  </div>

                  {/* Company and Employee Info */}
                  <div className="space-y-3">
                    <div>
                      <label className="block text-[8px] font-black uppercase text-[#8C8379] tracking-wider mb-1">Company Title</label>
                      <input
                        type="text"
                        value={companyName}
                        onChange={(e) => setCompanyName(e.target.value)}
                        className="w-full bg-white border border-[#D9D1C7] text-xs py-2 px-3 rounded-xl text-[#2D241E] font-medium focus:outline-none"
                      />
                    </div>

                    <div>
                      <label className="block text-[8px] font-black uppercase text-[#8C8379] tracking-wider mb-1">Employee Name</label>
                      <input
                        type="text"
                        value={employeeName}
                        onChange={(e) => setEmployeeName(e.target.value)}
                        className="w-full bg-white border border-[#D9D1C7] text-xs py-2 px-3 rounded-xl text-[#2D241E] font-medium focus:outline-none"
                        placeholder="e.g. JOHN DOE"
                      />
                    </div>

                    <div className="grid grid-cols-2 gap-3">
                      <div>
                        <label className="block text-[8px] font-black uppercase text-[#8C8379] tracking-wider mb-1">Employee No</label>
                        <input
                          type="text"
                          value={employeeNo}
                          placeholder=""
                          onChange={(e) => setEmployeeNo(e.target.value)}
                          className="w-full bg-white border border-[#D9D1C7] text-xs py-2 px-3 rounded-xl text-[#2D241E] font-medium focus:outline-none"
                        />
                      </div>
                      <div>
                        <label className="block text-[8px] font-black uppercase text-[#8C8379] tracking-wider mb-1">I/C No.</label>
                        <input
                          type="text"
                          value={icNo}
                          placeholder=""
                          onChange={(e) => setIcNo(e.target.value)}
                          className="w-full bg-white border border-[#D9D1C7] text-xs py-2 px-3 rounded-xl text-[#2D241E] font-medium focus:outline-none"
                        />
                      </div>
                    </div>
                  </div>

                  {/* Basic Salary & Allowances */}
                  <div className="space-y-3 pt-3 border-t border-[#D9D1C7]/30">
                    <span className="text-[9px] font-black uppercase text-[#8C8379] tracking-wider block">Basic Rates & Allowances (RM)</span>
                    
                    <div className="grid grid-cols-2 gap-3">
                      <div>
                        <label className="block text-[8px] font-black uppercase text-[#8C8379] tracking-wider mb-1">Basic Monthly Salary</label>
                        <input
                          type="number"
                          value={basicRate || ''}
                          onChange={(e) => setBasicRate(Number(e.target.value))}
                          placeholder="e.g. 4500"
                          className="w-full bg-white border border-[#D9D1C7] text-xs py-2 px-3 rounded-xl text-[#2D241E] font-bold focus:outline-none"
                        />
                      </div>
                      <div>
                        <label className="block text-[8px] font-black uppercase text-[#8C8379] tracking-wider mb-1">Attendance Allowance</label>
                        <input
                          type="number"
                          value={attendanceAllowance || ''}
                          onChange={(e) => setAttendanceAllowance(Number(e.target.value))}
                          className="w-full bg-white border border-[#D9D1C7] text-xs py-2 px-3 rounded-xl text-[#2D241E] focus:outline-none"
                        />
                      </div>
                    </div>

                    <div className="grid grid-cols-2 gap-3">
                      <div>
                        <label className="block text-[8px] font-black uppercase text-[#8C8379] tracking-wider mb-1">Car Allowance (Exempt)</label>
                        <input
                          type="number"
                          value={carAllowance || ''}
                          onChange={(e) => setCarAllowance(Number(e.target.value))}
                          className="w-full bg-white border border-[#D9D1C7] text-xs py-2 px-3 rounded-xl text-[#2D241E] focus:outline-none"
                        />
                      </div>
                      <div>
                        <label className="block text-[8px] font-black uppercase text-[#8C8379] tracking-wider mb-1">Other Allowance</label>
                        <input
                          type="number"
                          value={otherAllowance || ''}
                          onChange={(e) => setOtherAllowance(Number(e.target.value))}
                          className="w-full bg-white border border-[#D9D1C7] text-xs py-2 px-3 rounded-xl text-[#2D241E] focus:outline-none"
                        />
                      </div>
                    </div>
                  </div>

                  {/* Statutory Wage Inclusions */}
                  <div className="space-y-3 pt-3 border-t border-[#D9D1C7]/30">
                    <span className="text-[9px] font-black uppercase text-[#8C8379] tracking-wider block">Statutory Wages Basis Settings</span>
                    <div className="space-y-2 bg-[#F3EFE9]/40 p-3 rounded-xl border border-[#D9D1C7]/40">
                      <label className="flex items-start gap-2.5 cursor-pointer select-none">
                        <input
                          type="checkbox"
                          checked={includeOtInEpf}
                          onChange={(e) => setIncludeOtInEpf(e.target.checked)}
                          className="mt-0.5 rounded border-[#D9D1C7] text-[#8B9A82] focus:ring-[#8B9A82]"
                        />
                        <div className="flex flex-col">
                          <span className="text-[10px] font-bold text-[#2D241E] uppercase tracking-wide">Include OT Pay in EPF/SOCSO Basis</span>
                          <span className="text-[9px] font-medium text-[#8C8379] font-mono mt-0.5">Current Month OT: RM {summary.totalOtPay.toLocaleString('en-US', { minimumFractionDigits: 2 })}</span>
                        </div>
                      </label>
                      
                      <label className="flex items-start gap-2.5 cursor-pointer select-none">
                        <input
                          type="checkbox"
                          checked={includeHolidayInEpf}
                          onChange={(e) => setIncludeHolidayInEpf(e.target.checked)}
                          className="mt-0.5 rounded border-[#D9D1C7] text-[#8B9A82] focus:ring-[#8B9A82]"
                        />
                        <div className="flex flex-col">
                          <span className="text-[10px] font-bold text-[#2D241E] uppercase tracking-wide">Include Holiday Pay in EPF/SOCSO Basis</span>
                          <span className="text-[9px] font-medium text-[#8C8379] font-mono mt-0.5">Current Month Holiday Pay: RM {summary.totalExtraPay.toLocaleString('en-US', { minimumFractionDigits: 2 })}</span>
                        </div>
                      </label>
                    </div>
                  </div>

                  {/* Deductions & Leave */}
                  <div className="space-y-3 pt-3 border-t border-[#D9D1C7]/30">
                    <div className="flex justify-between items-center">
                      <span className="text-[9px] font-black uppercase text-[#8C8379] tracking-wider">Statutory Contributions & Taxes</span>
                      <button
                        onClick={handleAutoCalculateContributions}
                        className="text-[8px] font-black uppercase tracking-wider text-[#8B9A82] bg-[#8B9A82]/10 px-2 py-1 rounded hover:bg-[#8B9A82]/20"
                      >
                        Auto-Calculate EPF/SOCSO
                      </button>
                    </div>

                    <div className="grid grid-cols-3 gap-2">
                      <div>
                        <label className="block text-[8px] font-black uppercase text-[#8C8379] tracking-wider mb-1">EPF (Employee)</label>
                        <input
                          type="number"
                          value={epfDeduction || ''}
                          onChange={(e) => setEpfDeduction(Math.ceil(Number(e.target.value)))}
                          className="w-full bg-white border border-[#D9D1C7] text-xs py-2 px-2 rounded-xl text-[#2D241E] focus:outline-none"
                          step="1"
                        />
                      </div>
                      <div>
                        <label className="block text-[8px] font-black uppercase text-[#8C8379] tracking-wider mb-1">SOCSO (Employee)</label>
                        <input
                          type="number"
                          value={socsoDeduction || ''}
                          onChange={(e) => setSocsoDeduction(Number(e.target.value))}
                          className="w-full bg-white border border-[#D9D1C7] text-xs py-2 px-2 rounded-xl text-[#2D241E] focus:outline-none"
                        />
                      </div>
                      <div>
                        <label className="block text-[8px] font-black uppercase text-[#8C8379] tracking-wider mb-1">EIS (Employee)</label>
                        <input
                          type="number"
                          value={eisDeduction || ''}
                          onChange={(e) => setEisDeduction(Number(e.target.value))}
                          className="w-full bg-white border border-[#D9D1C7] text-xs py-2 px-2 rounded-xl text-[#2D241E] focus:outline-none"
                        />
                      </div>
                    </div>

                    <div className="grid grid-cols-3 gap-2">
                      <div>
                        <label className="block text-[8px] font-black uppercase text-[#8C8379] tracking-wider mb-1">PCB Tax</label>
                        <input
                          type="number"
                          value={pcbDeduction || ''}
                          onChange={(e) => setPcbDeduction(Number(e.target.value))}
                          className="w-full bg-white border border-[#D9D1C7] text-xs py-2 px-2 rounded-xl text-[#2D241E] focus:outline-none"
                        />
                      </div>
                      <div>
                        <label className="block text-[8px] font-black uppercase text-[#8C8379] tracking-wider mb-1">Unpaid Leave</label>
                        <input
                          type="number"
                          value={unpaidLeave || ''}
                          onChange={(e) => setUnpaidLeave(Number(e.target.value))}
                          className="w-full bg-white border border-[#D9D1C7] text-xs py-2 px-2 rounded-xl text-[#2D241E] focus:outline-none"
                        />
                      </div>
                      <div>
                        <label className="block text-[8px] font-black uppercase text-[#8C8379] tracking-wider mb-1">Salary Advance</label>
                        <input
                          type="number"
                          value={advanceDeduction || ''}
                          onChange={(e) => setAdvanceDeduction(Number(e.target.value))}
                          className="w-full bg-white border border-[#D9D1C7] text-xs py-2 px-2 rounded-xl text-[#2D241E] focus:outline-none"
                        />
                      </div>
                    </div>
                  </div>

                  {/* Employer Contribution Details */}
                  <div className="space-y-3 pt-3 border-t border-[#D9D1C7]/30">
                    <span className="text-[9px] font-black uppercase text-[#8C8379] tracking-wider block">Employer Contributions (RM)</span>
                    <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
                      <div>
                        <label className="block text-[7px] font-black uppercase text-[#8C8379] tracking-wider mb-1">Employer EPF</label>
                        <input
                          type="number"
                          value={employerEpf || ''}
                          onChange={(e) => setEmployerEpf(Math.ceil(Number(e.target.value)))}
                          className="w-full bg-white border border-[#D9D1C7] text-xs py-2 px-1.5 rounded-xl text-[#2D241E] focus:outline-none"
                          step="1"
                        />
                      </div>
                      <div>
                        <label className="block text-[7px] font-black uppercase text-[#8C8379] tracking-wider mb-1">Employer SOCSO</label>
                        <input
                          type="number"
                          value={employerSocso || ''}
                          onChange={(e) => setEmployerSocso(Number(e.target.value))}
                          className="w-full bg-white border border-[#D9D1C7] text-xs py-2 px-1.5 rounded-xl text-[#2D241E] focus:outline-none"
                        />
                      </div>
                      <div>
                        <label className="block text-[7px] font-black uppercase text-[#8C8379] tracking-wider mb-1">Employer EIS</label>
                        <input
                          type="number"
                          value={employerEis || ''}
                          onChange={(e) => setEmployerEis(Number(e.target.value))}
                          className="w-full bg-white border border-[#D9D1C7] text-xs py-2 px-1.5 rounded-xl text-[#2D241E] focus:outline-none"
                        />
                      </div>
                      <div>
                        <label className="block text-[7px] font-black uppercase text-[#8C8379] tracking-wider mb-1">HRD Levy</label>
                        <input
                          type="number"
                          value={employerLevy || ''}
                          onChange={(e) => setEmployerLevy(Number(e.target.value))}
                          className="w-full bg-white border border-[#D9D1C7] text-xs py-2 px-1.5 rounded-xl text-[#2D241E] focus:outline-none"
                        />
                      </div>
                    </div>
                  </div>

                  {/* Annual Leave Info */}
                  <div className="space-y-3 pt-3 border-t border-[#D9D1C7]/30">
                    <span className="text-[9px] font-black uppercase text-[#8C8379] tracking-wider block">Annual Leave Metrics</span>
                    <div className="grid grid-cols-2 gap-3">
                      <div>
                        <label className="block text-[8px] font-black uppercase text-[#8C8379] tracking-wider mb-1">A/L Taken</label>
                        <input
                          type="number"
                          value={annualLeaveTaken}
                          onChange={(e) => setAnnualLeaveTaken(Number(e.target.value))}
                          className="w-full bg-white border border-[#D9D1C7] text-xs py-2 px-3 rounded-xl text-[#2D241E] focus:outline-none"
                        />
                      </div>
                      <div>
                        <label className="block text-[8px] font-black uppercase text-[#8C8379] tracking-wider mb-1">Balance A/L (Days)</label>
                        <input
                          type="number"
                          value={annualLeaveBalance}
                          onChange={(e) => setAnnualLeaveBalance(Number(e.target.value))}
                          className="w-full bg-white border border-[#D9D1C7] text-xs py-2 px-3 rounded-xl text-[#2D241E] focus:outline-none"
                        />
                      </div>
                    </div>
                  </div>

                  {/* Action Buttons */}
                  <div className="pt-2 flex gap-3">
                    <button
                      onClick={handleSaveTimesheet}
                      className="flex-1 py-2.5 bg-[#2D241E] text-white rounded-xl text-xs font-bold uppercase tracking-wider hover:bg-[#1a1411] transition-all"
                    >
                      Save Configuration
                    </button>
                    <button
                      onClick={handlePrintPayslip}
                      className="flex-1 py-2.5 border border-[#2D241E] text-[#2D241E] hover:bg-[#2D241E]/5 rounded-xl text-xs font-bold uppercase tracking-wider transition-all flex items-center justify-center gap-1.5"
                    >
                      <Printer size={14} />
                      Print Voucher
                    </button>
                  </div>
                </div>
              </div>

              {/* Right Side: Pixel Perfect Malaysian Payslip Sheet */}
              <div className="lg:col-span-7 flex flex-col items-center">
                <div className="w-full max-w-2xl bg-white text-black font-sans shadow-md border border-[#D9D1C7]/60 p-8 rounded-lg" id="printable-payslip">
                  {/* Company Letterhead */}
                  <div className="border-b border-black pb-4 mb-4 text-left">
                    <h1 className="text-base font-black tracking-wide leading-tight uppercase">{companyName}</h1>
                    <p className="text-[10px] font-bold text-gray-700 tracking-tight mt-0.5">{companyRegNo}</p>
                    <h2 className="text-[13px] font-extrabold tracking-widest mt-3 uppercase text-gray-800">
                      SALARY FOR THE MONTH {format(parse(selectedMonth, 'yyyy-MM', new Date()), 'MMMM yyyy').toUpperCase()}
                    </h2>
                  </div>

                  {/* Employee Metadata Blocks */}
                  <div className="grid grid-cols-2 gap-x-12 gap-y-1.5 text-xs pb-4 mb-4 border-b border-black">
                    <div className="flex">
                      <span className="w-24 font-bold text-[10px] uppercase text-gray-600">E'YEE NO.</span>
                      <span className="font-extrabold text-black">: {employeeNo || '-'}</span>
                    </div>
                    <div className="flex">
                      <span className="w-24 font-bold text-[10px] uppercase text-gray-600">E'YEE NAME</span>
                      <span className="font-extrabold text-black">: {employeeName?.toUpperCase() || ''}</span>
                    </div>
                    <div className="flex">
                      <span className="w-24 font-bold text-[10px] uppercase text-gray-600">I/C NO.</span>
                      <span className="font-extrabold text-black">: {icNo || '-'}</span>
                    </div>
                  </div>

                  {/* Double Section Split Table */}
                  <div className="grid grid-cols-1 md:grid-cols-12 gap-6 items-start">
                    {/* Left Columns: Earnings and hours */}
                    <div className="md:col-span-7">
                      <table className="w-full text-[10px] border-collapse">
                        <thead>
                          <tr className="border-b border-black text-[9px] font-black uppercase text-gray-700">
                            <th className="text-left pb-1.5">Description</th>
                            <th className="text-center pb-1.5 w-24">Day/Hour</th>
                            <th className="text-center pb-1.5 w-16">Rate</th>
                            <th className="text-right pb-1.5 w-20">RM</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-gray-100 font-medium">
                          {/* Basic monthly rate */}
                          <tr>
                            <td className="py-2 text-left font-bold uppercase text-gray-800">BASIC RATE</td>
                            <td className="py-2 text-center text-gray-400">-</td>
                            <td className="py-2 text-center text-gray-400">-</td>
                            <td className="py-2 text-right font-extrabold">{(basicRate > 0 ? basicRate : summary.totalSalary).toLocaleString('en-US', { minimumFractionDigits: 2 })}</td>
                          </tr>

                          {/* Normal Day OT */}
                          {payslipEarnings.normalOtHours > 0 && (
                            <tr>
                              <td className="py-2 text-left text-gray-700">NORMAL DAY (OT)</td>
                              <td className="py-2 text-center text-gray-600">{payslipEarnings.normalOtHours.toFixed(1)} Hours</td>
                              <td className="py-2 text-center text-gray-600">{payslipEarnings.normalOtRate.toFixed(3)}</td>
                              <td className="py-2 text-right">{payslipEarnings.normalOtAmount.toLocaleString('en-US', { minimumFractionDigits: 2 })}</td>
                            </tr>
                          )}

                          {/* Off Day */}
                          {payslipEarnings.offDayAmount > 0 && (
                            <tr>
                              <td className="py-2 text-left text-gray-700">OFF DAY / OT</td>
                              <td className="py-2 text-center text-gray-400">Standard OT</td>
                              <td className="py-2 text-center text-gray-400">Multiplier</td>
                              <td className="py-2 text-right">{payslipEarnings.offDayAmount.toLocaleString('en-US', { minimumFractionDigits: 2 })}</td>
                            </tr>
                          )}

                          {/* Rest Day */}
                          {payslipEarnings.restDayHours > 0 && (
                            <tr>
                              <td className="py-2 text-left text-gray-700">REST DAY</td>
                              <td className="py-2 text-center text-gray-600">{payslipEarnings.restDayHours.toFixed(1)} Hours</td>
                              <td className="py-2 text-center text-gray-600">{payslipEarnings.restDayRate.toFixed(3)}</td>
                              <td className="py-2 text-right">{payslipEarnings.restDayAmount.toLocaleString('en-US', { minimumFractionDigits: 2 })}</td>
                            </tr>
                          )}

                          {/* Rest Day OT */}
                          {payslipEarnings.restDayOtHours > 0 && (
                            <tr>
                              <td className="py-2 text-left text-gray-700">REST DAY (OT)</td>
                              <td className="py-2 text-center text-gray-600">{payslipEarnings.restDayOtHours.toFixed(1)} Hours</td>
                              <td className="py-2 text-center text-gray-600">{payslipEarnings.restDayOtRate.toFixed(3)}</td>
                              <td className="py-2 text-right">{payslipEarnings.restDayOtAmount.toLocaleString('en-US', { minimumFractionDigits: 2 })}</td>
                            </tr>
                          )}

                          {/* Public Holiday */}
                          {payslipEarnings.holidayHours > 0 && (
                            <tr>
                              <td className="py-2 text-left text-gray-700">PUBLIC HOLIDAY</td>
                              <td className="py-2 text-center text-gray-600">{payslipEarnings.holidayHours.toFixed(1)} Hours</td>
                              <td className="py-2 text-center text-gray-600">{payslipEarnings.holidayRate.toFixed(3)}</td>
                              <td className="py-2 text-right">{payslipEarnings.holidayAmount.toLocaleString('en-US', { minimumFractionDigits: 2 })}</td>
                            </tr>
                          )}

                          {/* Public Holiday OT */}
                          {payslipEarnings.holidayOtHours > 0 && (
                            <tr>
                              <td className="py-2 text-left text-gray-700">P/HOLIDAY (OT)</td>
                              <td className="py-2 text-center text-gray-600">{payslipEarnings.holidayOtHours.toFixed(1)} Hours</td>
                              <td className="py-2 text-center text-gray-600">{payslipEarnings.holidayOtRate.toFixed(3)}</td>
                              <td className="py-2 text-right">{payslipEarnings.holidayOtAmount.toLocaleString('en-US', { minimumFractionDigits: 2 })}</td>
                            </tr>
                          )}

                          {/* Attendance Allowance */}
                          {attendanceAllowance > 0 && (
                            <tr>
                              <td className="py-2 text-left text-gray-700">ATTENDANCE A'LLW</td>
                              <td className="py-2 text-center text-gray-400">-</td>
                              <td className="py-2 text-center text-gray-400">-</td>
                              <td className="py-2 text-right">{attendanceAllowance.toLocaleString('en-US', { minimumFractionDigits: 2 })}</td>
                            </tr>
                          )}

                          {/* Car Allowance */}
                          {carAllowance > 0 && (
                            <tr>
                              <td className="py-2 text-left text-gray-700">CAR A'LLW (TAX EXEMPT)</td>
                              <td className="py-2 text-center text-gray-400">-</td>
                              <td className="py-2 text-center text-gray-400">-</td>
                              <td className="py-2 text-right">{carAllowance.toLocaleString('en-US', { minimumFractionDigits: 2 })}</td>
                            </tr>
                          )}

                          {/* Other Allowances */}
                          {otherAllowance > 0 && (
                            <tr>
                              <td className="py-2 text-left text-gray-700">OTHER A'LLW</td>
                              <td className="py-2 text-center text-gray-400">-</td>
                              <td className="py-2 text-center text-gray-400">-</td>
                              <td className="py-2 text-right">{otherAllowance.toLocaleString('en-US', { minimumFractionDigits: 2 })}</td>
                            </tr>
                          )}

                          {/* Unpaid Leave */}
                          {unpaidLeave > 0 && (
                            <tr className="text-red-600">
                              <td className="py-2 text-left">(-) UNPAID LEAVE</td>
                              <td className="py-2 text-center">-</td>
                              <td className="py-2 text-center">-</td>
                              <td className="py-2 text-right">- {unpaidLeave.toLocaleString('en-US', { minimumFractionDigits: 2 })}</td>
                            </tr>
                          )}

                          {/* Others Deductions */}
                          {othersDeduction > 0 && (
                            <tr className="text-red-600">
                              <td className="py-2 text-left">(-) OTHERS</td>
                              <td className="py-2 text-center">-</td>
                              <td className="py-2 text-center">-</td>
                              <td className="py-2 text-right">- {othersDeduction.toLocaleString('en-US', { minimumFractionDigits: 2 })}</td>
                            </tr>
                          )}
                        </tbody>
                        <tfoot>
                          <tr className="border-t border-black">
                            <td className="py-2 font-black uppercase text-gray-900" colSpan={3}>GROSS</td>
                            <td className="py-2 text-right font-black border-b-2 border-double border-black">
                              RM {grossEarningsAfterOthers.toLocaleString('en-US', { minimumFractionDigits: 2 })}
                            </td>
                          </tr>
                        </tfoot>
                      </table>
                    </div>

                    {/* Right Columns: Stats Panel & Deductions */}
                    <div className="md:col-span-5 space-y-4">
                      {/* Work Day stats mini table */}
                      <table className="w-full text-[10px] border border-gray-300 font-medium">
                        <tbody>
                          <tr className="border-b border-gray-300">
                            <td className="p-1.5 font-bold bg-gray-50 uppercase text-gray-600">DAY WORK (DAYS)</td>
                            <td className="p-1.5 text-right font-black">{summary.workDaysCount}</td>
                          </tr>
                          <tr className="border-b border-gray-300">
                            <td className="p-1.5 font-bold bg-gray-50 uppercase text-gray-600">A/L TAKEN</td>
                            <td className="p-1.5 text-right font-black">{annualLeaveTaken}</td>
                          </tr>
                          <tr>
                            <td className="p-1.5 font-bold bg-gray-50 uppercase text-gray-600">BAL A/L (DAYS)</td>
                            <td className="p-1.5 text-right font-black">{annualLeaveBalance}</td>
                          </tr>
                        </tbody>
                      </table>

                      {/* Deductions breakdown table */}
                      <div>
                        <span className="text-[9px] font-black uppercase tracking-wider text-gray-600 block mb-1">DEDUCTIONS</span>
                        <table className="w-full text-[10px] border-collapse">
                          <thead>
                            <tr className="border-b border-black text-[9px] font-black uppercase text-gray-700">
                              <th className="text-left pb-1">Type</th>
                              <th className="text-right pb-1">RM</th>
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-gray-100 font-medium text-gray-800">
                            <tr>
                              <td className="py-1.5 text-left">(-) EPF</td>
                              <td className="py-1.5 text-right">{epfDeduction > 0 ? epfDeduction.toFixed(2) : '-'}</td>
                            </tr>
                            <tr>
                              <td className="py-1.5 text-left">(-) SOCSO</td>
                              <td className="py-1.5 text-right">{socsoDeduction > 0 ? socsoDeduction.toFixed(2) : '-'}</td>
                            </tr>
                            <tr>
                              <td className="py-1.5 text-left">(-) EIS</td>
                              <td className="py-1.5 text-right">{eisDeduction > 0 ? eisDeduction.toFixed(2) : '-'}</td>
                            </tr>
                            <tr>
                              <td className="py-1.5 text-left">(-) PCB TAX</td>
                              <td className="py-1.5 text-right">{pcbDeduction > 0 ? pcbDeduction.toFixed(2) : '-'}</td>
                            </tr>
                            {advanceDeduction > 0 && (
                              <tr>
                                <td className="py-1.5 text-left">(-) ADVANCE</td>
                                <td className="py-1.5 text-right">{advanceDeduction.toFixed(2)}</td>
                              </tr>
                            )}
                            <tr className="border-t border-black font-extrabold text-black">
                              <td className="py-2 text-left uppercase text-[9.5px]">TOTAL</td>
                              <td className="py-2 text-right border-b border-black">{totalDeductions.toLocaleString('en-US', { minimumFractionDigits: 2 })}</td>
                            </tr>
                          </tbody>
                        </table>
                      </div>

                      {/* Nett Pay Highlight Box */}
                      <div className="border-2 border-black p-3 bg-gray-50/50 text-center">
                        <div className="text-[10px] font-black uppercase text-gray-700 tracking-wider">NETT PAY</div>
                        <div className="text-lg font-black tracking-wide text-black mt-1">
                          RM {nettPay.toLocaleString('en-US', { minimumFractionDigits: 2 })}
                        </div>
                      </div>
                    </div>
                  </div>

                  {/* Footer Contributions & Signature Block */}
                  <div className="grid grid-cols-1 md:grid-cols-12 gap-6 pt-6 mt-6 border-t border-black items-end text-[10px]">
                    {/* Employer Contributions (Left) */}
                    <div className="md:col-span-6 space-y-1.5">
                      <span className="text-[8px] font-black uppercase tracking-wider text-gray-500 block underline">* EMPLOYER CONTRIBUTION</span>
                      <div className="grid grid-cols-2 gap-x-4 gap-y-1 font-semibold text-gray-800">
                        <div className="flex justify-between border-b border-gray-100 pb-0.5">
                          <span>EPF</span>
                          <span className="font-extrabold">RM {employerEpf > 0 ? employerEpf.toFixed(2) : '-'}</span>
                        </div>
                        <div className="flex justify-between border-b border-gray-100 pb-0.5">
                          <span>SOCSO</span>
                          <span className="font-extrabold">RM {employerSocso > 0 ? employerSocso.toFixed(2) : '-'}</span>
                        </div>
                        <div className="flex justify-between border-b border-gray-100 pb-0.5">
                          <span>EIS</span>
                          <span className="font-extrabold">RM {employerEis > 0 ? employerEis.toFixed(2) : '-'}</span>
                        </div>
                        <div className="flex justify-between border-b border-gray-100 pb-0.5">
                          <span>LEVY</span>
                          <span className="font-extrabold">RM {employerLevy > 0 ? employerLevy.toFixed(2) : '-'}</span>
                        </div>
                      </div>
                    </div>

                    {/* Signature Panel (Right) */}
                    <div className="md:col-span-6 flex flex-col items-end pt-4">
                      {/* Decorative/Real Signature line */}
                      <div className="w-48 text-center text-black">
                        <div className="h-12 flex items-end justify-center">
                          {/* Signature placeholder squiggle */}
                          <svg className="w-16 h-8 text-gray-300" viewBox="0 0 100 50" fill="none" stroke="currentColor" strokeWidth="2">
                            <path d="M10,40 Q25,10 40,30 T70,20 T90,35" strokeDasharray="1 1" />
                          </svg>
                        </div>
                        <div className="border-t border-gray-400 mt-1 pt-1 text-[9px] font-extrabold uppercase text-gray-600 tracking-wider">
                          Employee's Signature
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      ) : (
        <div className="bg-[#FAF9F6] border border-[#D9D1C7] rounded-[32px] p-16 text-center shadow-sm no-print">
          <Calendar size={48} className="mx-auto text-[#8C8379]/40 mb-4" />
          <h3 className="text-lg font-serif italic text-[#2D241E] mb-1">Timesheet Planner Inactive</h3>
          <p className="text-xs text-[#8C8379] max-w-sm mx-auto leading-relaxed">
            Please choose a staff member and select the target month to load the vertical timesheet schedule calendar.
          </p>
        </div>
      )}
    </div>
  );
};

export default SalaryCalculator;
