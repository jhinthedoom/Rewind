import React, { useState, useEffect } from 'react';
import { auth, signIn, logOut, signUp, db, subscribeToConnectionError } from './firebase';
import { onAuthStateChanged, User } from 'firebase/auth';
import { doc, getDoc, setDoc, onSnapshot, collection } from 'firebase/firestore';
import { 
  BarChart3, 
  Calendar, 
  Users, 
  PlusCircle, 
  LogOut, 
  ReceiptText,
  Menu,
  X,
  LayoutGrid,
  TrendingDown,
  Palette,
  Check,
  Mail,
  Camera,
  PackageCheck,
  ShoppingBag,
  Settings,
  Sparkles,
  QrCode
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { UserProfile, Branch, OperationType, FirestoreErrorInfo, RewindSettings } from './types';
import { subscribeToFirestoreErrors } from './utils';
import { DEFAULT_REWIND_SETTINGS } from './utils/emailTemplates';

// Component Imports for the 10 Tabs
import Dashboard from './components/Dashboard';
import CalendarView from './components/CalendarView';
import FilmRegistration from './components/FilmRegistration';
import InvoiceReceipt from './components/InvoiceReceipt';
import FilmPickups from './components/FilmPickups';
import POS from './components/POS';
import Products from './components/Products';
import Expenses from './components/Expenses';
import Setup from './components/Setup';
import Staff from './components/Staff';

// Standalone Public Pages for Customers
import PublicFilmRegistrationForm from './components/PublicFilmRegistrationForm';
import PublicPickupBooking from './components/PublicPickupBooking';

type View = 
  | 'dashboard'
  | 'calendar'
  | 'film-registration'
  | 'invoices-receipts'
  | 'pickups'
  | 'pos'
  | 'products'
  | 'expenses'
  | 'setup'
  | 'staff';

export default function App() {
  // 1. Check for standalone public query routes (QR code landing pages)
  const urlParams = new URLSearchParams(window.location.search);
  const publicView = urlParams.get('view');
  if (publicView === 'register') {
    return <PublicFilmRegistrationForm />;
  }
  if (publicView === 'pickup-booking') {
    return <PublicPickupBooking />;
  }

  // 2. Main Portal State
  const [user, setUser] = useState<User | null>(null);
  const [userProfile, setUserProfile] = useState<UserProfile | null>(null);
  const [settings, setSettings] = useState<RewindSettings>(DEFAULT_REWIND_SETTINGS);
  const [loading, setLoading] = useState(true);
  const [currentView, setCurrentView] = useState<View>('dashboard');
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);
  const [email, setEmail] = useState('angella0333@gmail.com');
  const [password, setPassword] = useState('password123');
  const [authError, setAuthError] = useState('');
  const [firebaseError, setFirebaseError] = useState<string | null>(null);
  const [firestoreErrors, setFirestoreErrors] = useState<FirestoreErrorInfo[]>([]);

  // Theme support
  const [currentTheme, setCurrentTheme] = useState<string>(() => {
    return localStorage.getItem('rewind_theme') || 'terracotta';
  });
  const [isThemePickerOpen, setIsThemePickerOpen] = useState(false);

  useEffect(() => {
    document.documentElement.setAttribute('data-theme', currentTheme);
    localStorage.setItem('rewind_theme', currentTheme);
  }, [currentTheme]);

  const themes = [
    { id: 'terracotta', name: 'Warm Terracotta & Film Gold', color: '#C86A4B', bg: '#FAF4F0' },
    { id: 'slate', name: 'Monochrome Slate & Analog Black', color: '#475569', bg: '#F1F5F9' },
    { id: 'sage', name: 'Sage & Olive', color: '#5B8266', bg: '#F3F6F4' },
    { id: 'ochre', name: 'Vintage Ochre & Linen', color: '#C28B38', bg: '#FAF7F2' },
  ];

  // Subscribe to Rewind Settings
  useEffect(() => {
    const unsub = onSnapshot(collection(db, 'rewind_settings'), (snap) => {
      if (!snap.empty) {
        setSettings({ ...DEFAULT_REWIND_SETTINGS, ...snap.docs[0].data() as RewindSettings });
      }
    });
    return () => unsub();
  }, []);

  useEffect(() => {
    const unsubscribeConn = subscribeToConnectionError((err) => {
      setFirebaseError(err);
    });
    
    const unsubscribeErrors = subscribeToFirestoreErrors((errInfo) => {
      setFirestoreErrors(prev => {
        if (prev.some(e => e.error === errInfo.error)) return prev;
        return [errInfo, ...prev];
      });
    });

    return () => {
      unsubscribeConn();
      unsubscribeErrors();
    };
  }, []);

  const handleFirestoreError = (error: unknown, operationType: OperationType, path: string | null) => {
    const errInfo: FirestoreErrorInfo = {
      error: error instanceof Error ? error.message : String(error),
      authInfo: {
        userId: auth.currentUser?.uid,
        email: auth.currentUser?.email,
      },
      operationType,
      path
    };
    setFirestoreErrors(prev => {
      if (prev.some(e => e.error === errInfo.error)) return prev;
      return [errInfo, ...prev];
    });
    return new Error(JSON.stringify(errInfo));
  };

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (authUser) => {
      setFirestoreErrors([]);
      try {
        setUser(authUser);
        if (authUser) {
          const userRef = doc(db, 'users', authUser.uid);
          let profileDoc;
          try {
            profileDoc = await getDoc(userRef);
          } catch (e) {
            throw handleFirestoreError(e, OperationType.GET, `users/${authUser.uid}`);
          }

          if (profileDoc.exists()) {
            const profile = profileDoc.data() as UserProfile;
            setUserProfile(profile);
          } else {
            const userEmail = (authUser.email || '').toLowerCase().trim();
            const isAdmin = userEmail === 'angella0333@gmail.com' || userEmail === 'admin@rewind.com' || userEmail.includes('admin');
            
            const defaultProfile: UserProfile = {
              uid: authUser.uid,
              email: authUser.email || '',
              branch: 'ALL',
              role: isAdmin ? 'admin' : 'staff',
              name: isAdmin ? 'Angela (Admin)' : 'Staff Member'
            };
            
            try {
              await setDoc(userRef, defaultProfile);
            } catch (e) {
              throw handleFirestoreError(e, OperationType.WRITE, `users/${authUser.uid}`);
            }
            
            setUserProfile(defaultProfile);
          }
        } else {
          setUserProfile(null);
        }
      } catch (error: any) {
        console.error("Auth initialization error:", error);
        setAuthError(`Session error: ${error.message}`);
      } finally {
        setLoading(false);
      }
    });
    return () => unsubscribe();
  }, []);

  const handleAuth = async (e: React.FormEvent) => {
    e.preventDefault();
    setAuthError('');
    try {
      await signIn(email, password);
    } catch (err: any) {
      let message = 'Authentication failed';
      if (err.code === 'auth/invalid-credential' || err.message?.includes('auth/invalid-credential')) {
        message = 'Incorrect email or password. Please try again.';
      } else {
        message = err.message || message;
      }
      setAuthError(message);
    }
  };

  const handleLogout = () => {
    logOut();
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-[#FAF7F2]">
        <div className="text-center">
          <div className="w-12 h-12 border-4 border-[#E7E0D8] border-t-[#C85A32] rounded-full animate-spin mx-auto mb-4" />
          <p className="text-[#78716C] font-serif italic text-base">Rewind Film Lab Loading...</p>
        </div>
      </div>
    );
  }

  // Login Screen if not signed in
  if (!user || !userProfile) {
    return (
      <div className="min-h-screen bg-[#FAF7F2] flex items-center justify-center p-6 font-sans">
        <motion.div 
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="max-w-md w-full bg-white rounded-3xl p-8 sm:p-12 shadow-xl border border-[#E7E0D8]"
        >
          <div className="text-center mb-8">
            <div className="w-16 h-16 bg-[#1C1917] rounded-2xl flex items-center justify-center mx-auto mb-4 shadow-md text-white">
              <Camera size={32} className="text-[#FED7AA]" />
            </div>
            <h1 className="text-3xl font-serif font-bold text-[#1C1917] tracking-tight">REWIND</h1>
            <p className="text-[10px] font-black uppercase tracking-widest text-[#C85A32] mt-1">
              Film Lab & Vintage Cameras
            </p>
            <p className="text-xs text-[#78716C] mt-2">
              Staff & Admin Portal Login
            </p>
          </div>
          
          <form onSubmit={handleAuth} className="space-y-5">
            <div className="space-y-1.5">
              <label className="text-[10px] font-bold text-[#78716C] uppercase tracking-wider px-1">Email</label>
              <input 
                required
                type="email"
                autoComplete="username"
                className="natural-input w-full"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
              />
            </div>
            <div className="space-y-1.5">
              <label className="text-[10px] font-bold text-[#78716C] uppercase tracking-wider px-1">Password</label>
              <input 
                required
                type="password"
                autoComplete="current-password"
                className="natural-input w-full"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
              />
            </div>

            {authError && <p className="text-rose-500 text-xs font-bold text-center">{authError}</p>}

            <button
              type="submit"
              className="w-full py-4 bg-[#1C1917] hover:bg-black text-white rounded-xl text-xs uppercase tracking-widest font-black transition-all cursor-pointer shadow-md"
            >
              Sign In to Rewind Portal
            </button>
          </form>

          {/* Quick test accounts */}
          <div className="mt-8 pt-6 border-t border-[#E7E0D8] space-y-2">
            <p className="text-[10px] font-bold uppercase tracking-wider text-[#78716C] text-center">
              Quick Test Accounts
            </p>
            <div className="grid grid-cols-2 gap-2 text-xs">
              <button
                type="button"
                onClick={() => {
                  setEmail('angella0333@gmail.com');
                  setPassword('password123');
                }}
                className="p-2 text-left rounded-xl bg-[#FAF7F2] border border-[#E7E0D8] hover:bg-[#FAF0EB] transition-colors"
              >
                <div className="font-bold text-[#1C1917]">Angela (Admin)</div>
                <div className="text-[10px] text-[#78716C]">Full 10 tabs access</div>
              </button>
              <button
                type="button"
                onClick={() => {
                  setEmail('staff@rewind.com');
                  setPassword('password123');
                }}
                className="p-2 text-left rounded-xl bg-[#FAF7F2] border border-[#E7E0D8] hover:bg-[#FAF0EB] transition-colors"
              >
                <div className="font-bold text-[#1C1917]">Marcus (Staff)</div>
                <div className="text-[10px] text-[#78716C]">Staff role access</div>
              </button>
            </div>
          </div>
        </motion.div>
      </div>
    );
  }

  // 10 Tabs Definition
  const allTabs = [
    { id: 'dashboard', name: '1. Dashboard', icon: BarChart3 },
    { id: 'calendar', name: '2. Booking Calendar', icon: Calendar },
    { id: 'film-registration', name: '3. Film Registration', icon: Camera },
    { id: 'invoices-receipts', name: '4. Invoices & Receipts', icon: ReceiptText },
    { id: 'pickups', name: '5. Film Pickups', icon: PackageCheck },
    { id: 'pos', name: '6. Product Sales (POS)', icon: ShoppingBag },
    { id: 'products', name: '7. Inventory Management', icon: LayoutGrid },
    { id: 'expenses', name: '8. Spending & Assets', icon: TrendingDown },
    { id: 'setup', name: '9. Setup', icon: Settings },
    { id: 'staff', name: '10. Staff Management', icon: Users },
  ];

  // Dynamic access filtering:
  // Admin has access to all 10 tabs.
  // Staff has access according to settings.staffAllowedTabs configured in Tab 9 Setup!
  const allowedTabs = allTabs.filter(tab => {
    if (userProfile.role === 'admin') return true;
    const staffAllowed = settings.staffAllowedTabs || [
      'dashboard',
      'calendar',
      'film-registration',
      'invoices-receipts',
      'pickups',
      'pos',
      'products'
    ];
    return staffAllowed.includes(tab.id);
  });

  const renderView = () => {
    const commonProps = { 
      branch: 'ALL' as Branch, 
      role: userProfile?.role === 'admin' ? ('admin' as const) : ('staff' as const) 
    };

    switch (currentView) {
      case 'dashboard':
        return <Dashboard {...commonProps} onNavigate={(tab) => setCurrentView(tab as View)} />;
      case 'calendar':
        return <CalendarView branch="ALL" />;
      case 'film-registration':
        return <FilmRegistration branch="ALL" onGoToInvoices={() => setCurrentView('invoices-receipts')} />;
      case 'invoices-receipts':
        return <InvoiceReceipt {...commonProps} />;
      case 'pickups':
        return <FilmPickups branch="ALL" onGoToCalendar={() => setCurrentView('calendar')} />;
      case 'pos':
        return <POS {...commonProps} onComplete={() => setCurrentView('pos')} />;
      case 'products':
        return <Products branch="ALL" />;
      case 'expenses':
        return <Expenses {...commonProps} />;
      case 'setup':
        return <Setup />;
      case 'staff':
        return <Staff branch="ALL" role={userProfile.role} />;
      default:
        return <Dashboard {...commonProps} onNavigate={(tab) => setCurrentView(tab as View)} />;
    }
  };

  return (
    <div className="min-h-screen font-sans flex text-[var(--text-app)] bg-[var(--bg-app)] transition-colors duration-300">
      {/* Sidebar */}
      <aside className={`
        fixed inset-y-0 left-0 z-40 w-72 bg-[var(--bg-sidebar)] border-r border-[var(--border-sidebar)] transform transition-transform duration-300 ease-in-out md:relative md:translate-x-0
        ${isSidebarOpen ? 'translate-x-0' : '-translate-x-full'}
      `}>
        <div className="h-full flex flex-col p-6">
          {/* Logo & Header */}
          <div className="mb-8 flex items-center gap-3">
            <div className="w-10 h-10 bg-[#1C1917] rounded-2xl flex items-center justify-center text-white shadow-xs">
              <Camera className="w-5 h-5 text-[#FED7AA]" />
            </div>
            <div>
              <h1 className="font-serif text-2xl font-bold tracking-tight text-[var(--text-app)]">REWIND</h1>
              <p className="text-[9px] font-black uppercase tracking-widest text-[#C85A32]">Film Lab & Cameras</p>
            </div>
          </div>

          {/* Navigation Items (10 Tabs) */}
          <nav className="flex-1 space-y-1 overflow-y-auto pr-1">
            {allowedTabs.map((item) => {
              const isActive = currentView === item.id;
              return (
                <button
                  key={item.id}
                  id={`nav-${item.id}`}
                  onClick={() => {
                    setCurrentView(item.id as View);
                    setIsSidebarOpen(false);
                  }}
                  className={`
                    w-full flex items-center gap-3 px-3.5 py-2.5 rounded-xl font-medium transition-all text-xs text-left
                    ${isActive 
                      ? 'bg-[#1C1917] text-white font-bold shadow-xs' 
                      : 'text-[var(--text-muted)] hover:bg-[var(--nav-active)]/40 hover:text-[var(--text-app)]'}
                  `}
                >
                  <item.icon className={`w-4 h-4 shrink-0 ${isActive ? 'text-[#FED7AA]' : 'opacity-70'}`} />
                  <span className="truncate">{item.name}</span>
                </button>
              );
            })}
          </nav>

          {/* User Profile & Sign Out Footer */}
          <div className="pt-4 border-t border-[var(--border-sidebar)] mt-2">
            <div className="flex items-center gap-3 px-2 mb-3">
              <div className="w-9 h-9 rounded-full bg-[#1C1917] flex items-center justify-center text-white text-xs font-bold uppercase shadow-2xs">
                {userProfile.email.charAt(0)}
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-xs font-bold truncate text-[var(--text-app)]">
                  {userProfile.name || userProfile.email.split('@')[0]}
                </p>
                <div className="flex items-center gap-1.5 mt-0.5">
                  <span className={`inline-block px-1.5 py-0.2 rounded text-[9px] font-black uppercase tracking-wider ${
                    userProfile.role === 'admin' 
                      ? 'bg-[#FAF0EB] text-[#C85A32]' 
                      : 'bg-gray-200 text-gray-700'
                  }`}>
                    {userProfile.role}
                  </span>
                </div>
              </div>
            </div>

            <button
              onClick={handleLogout}
              className="w-full flex items-center gap-2.5 px-3 py-2 rounded-xl text-xs text-[var(--text-muted)] hover:text-rose-600 hover:bg-rose-50 transition-colors font-semibold"
            >
              <LogOut className="w-4 h-4 opacity-75" />
              <span>Sign Out</span>
            </button>
          </div>
        </div>
      </aside>

      {/* Main Content Area */}
      <div className="flex-1 flex flex-col min-w-0 overflow-hidden">
        {/* Top Navbar */}
        <header className="h-16 bg-[var(--bg-card)] border-b border-[var(--border-app)] px-6 flex items-center justify-between shrink-0">
          <div className="flex items-center gap-4">
            <button
              onClick={() => setIsSidebarOpen(!isSidebarOpen)}
              className="md:hidden p-2 rounded-lg text-[var(--text-muted)] hover:bg-[var(--bg-app)]"
            >
              <Menu size={20} />
            </button>
            <span className="text-xs font-bold uppercase tracking-wider text-[var(--text-muted)] hidden sm:inline">
              Rewind Management System
            </span>
          </div>

          {/* Quick links & theme switch */}
          <div className="flex items-center gap-3">
            <a
              href={`${window.location.origin}${window.location.pathname}?view=register`}
              target="_blank"
              rel="noreferrer"
              className="text-xs font-semibold text-[#C85A32] hover:underline flex items-center gap-1 bg-[#FAF0EB] px-3 py-1.5 rounded-xl border border-[#C85A32]/20"
            >
              <QrCode className="w-3.5 h-3.5" />
              <span>Public Drop-off Form</span>
            </a>

            {/* Theme switcher toggle */}
            <div className="relative">
              <button
                onClick={() => setIsThemePickerOpen(!isThemePickerOpen)}
                className="p-2 rounded-xl border border-[var(--border-app)] hover:bg-[var(--bg-subtle)] text-[var(--text-app)]"
                title="Change color theme"
              >
                <Palette size={16} />
              </button>

              {isThemePickerOpen && (
                <div className="absolute right-0 mt-2 w-56 bg-white border border-[var(--border-app)] rounded-2xl shadow-xl p-2 z-50">
                  <div className="text-[10px] font-bold uppercase text-[var(--text-muted)] px-2.5 py-1.5">
                    Select Theme
                  </div>
                  {themes.map((t) => (
                    <button
                      key={t.id}
                      onClick={() => {
                        setCurrentTheme(t.id);
                        setIsThemePickerOpen(false);
                      }}
                      className="w-full flex items-center justify-between p-2 rounded-xl hover:bg-[var(--bg-subtle)] text-xs text-left"
                    >
                      <div className="flex items-center gap-2">
                        <span className="w-3 h-3 rounded-full" style={{ backgroundColor: t.color }} />
                        <span className="font-semibold text-[var(--text-app)]">{t.name}</span>
                      </div>
                      {currentTheme === t.id && <Check size={14} className="text-[#C85A32]" />}
                    </button>
                  ))}
                </div>
              )}
            </div>
          </div>
        </header>

        {/* Scrollable View Container */}
        <main className="flex-1 overflow-y-auto p-4 sm:p-8">
          {renderView()}
        </main>
      </div>
    </div>
  );
}
