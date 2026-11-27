import React, { useEffect, useMemo, useState } from 'react';
import {
  Activity,
  AlertTriangle,
  Ambulance,
  BarChart3,
  BedDouble,
  Building2,
  Calendar,
  CheckCircle2,
  FlaskConical,
  HeartPulse,
  LayoutDashboard,
  MapPin,
  Send,
  ShieldCheck,
  Stethoscope,
  User,
  Users,
  X,
} from 'lucide-react';
import { useKairos } from './context/KairosContext';
import type { UserRole } from './types/kairos';
import { LandingPage } from './components/LandingPage';
import { DashboardShell, type NavItem } from './components/DashboardShell';
import { AuthModal } from './components/AuthModal';
import { KairosAssistantModal } from './components/KairosAssistantModal';
import { PatientDashboard } from './components/PatientDashboard';
import { DoctorDashboard } from './components/DoctorDashboard';
import { HospitalDashboard } from './components/HospitalDashboard';
import { AmbulanceDashboard } from './components/AmbulanceDashboard';
import { DiagnosticDashboard } from './components/DiagnosticDashboard';
import { AdminDashboard } from './components/AdminDashboard';

const DEFAULT_TAB_BY_ROLE: Record<UserRole, string> = {
  patient: 'overview',
  doctor: 'overview',
  hospital: 'overview',
  ambulance: 'transfers',
  diagnostic: 'bookings',
  admin: 'overview',
};

const VALID_ROLES: UserRole[] = [
  'patient',
  'doctor',
  'hospital',
  'ambulance',
  'diagnostic',
  'admin',
];

export default function App() {
  const {
    currentUser,
    referrals,
    diagnosticBookings,
    toastMessage,
    loginAsDemoRole,
  } = useKairos();

  const [view, setView] = useState<'landing' | 'dashboard'>('landing');
  const [activeTab, setActiveTab] = useState<string>('overview');
  const [searchQuery, setSearchQuery] = useState('');
  const [authModalOpen, setAuthModalOpen] = useState(false);
  const [authInitialTab, setAuthInitialTab] = useState<'demo' | 'register' | 'google'>('demo');
  const [assistantOpen, setAssistantOpen] = useState(false);
  const [assistantNotes, setAssistantNotes] = useState('');
  const [assistantApplyCb, setAssistantApplyCb] = useState<((summary: string) => void) | undefined>(
    undefined
  );
  const [quotaBannerVisible, setQuotaBannerVisible] = useState(false);

  // Google Maps Case A Demo Key quota listener (mandatory top-level sticky amber banner)
  useEffect(() => {
    const handler = () => setQuotaBannerVisible(true);
    window.addEventListener('gmp-quota-exceeded', handler);
    return () => window.removeEventListener('gmp-quota-exceeded', handler);
  }, []);

  // Support ?autostart=1 or ?role=<role> for direct workspace launch
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const roleParam = params.get('role') as UserRole | null;
    const autostart = params.get('autostart') === '1';

    if (roleParam && VALID_ROLES.includes(roleParam)) {
      loginAsDemoRole(roleParam);
      setActiveTab(DEFAULT_TAB_BY_ROLE[roleParam]);
      setView('dashboard');
    } else if (autostart) {
      loginAsDemoRole('hospital');
      setActiveTab(DEFAULT_TAB_BY_ROLE.hospital);
      setView('dashboard');
    }
    // Run once on initial mount
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const enterRoleWorkspace = (role: UserRole, initialTab?: string) => {
    loginAsDemoRole(role);
    setActiveTab(initialTab ?? DEFAULT_TAB_BY_ROLE[role]);
    setSearchQuery('');
    setView('dashboard');
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const handleSwitchRole = (role: UserRole) => {
    loginAsDemoRole(role);
    setActiveTab(DEFAULT_TAB_BY_ROLE[role]);
    setSearchQuery('');
  };

  const handleOpenAuth = (tab: 'demo' | 'register' | 'google' = 'demo') => {
    setAuthInitialTab(tab);
    setAuthModalOpen(true);
  };

  const handleAuthenticated = () => {
    setAuthModalOpen(false);
    setView('dashboard');
  };

  // Keep activeTab valid whenever role changes via AuthModal
  useEffect(() => {
    if (currentUser && view === 'dashboard') {
      const roleNavs: Record<UserRole, string[]> = {
        patient: ['overview', 'opd', 'specialists', 'diagnostics', 'profile'],
        doctor: ['overview', 'new-referral', 'referrals'],
        hospital: ['overview', 'opd-queue', 'referrals', 'capacity'],
        ambulance: ['transfers', 'vitals', 'route'],
        diagnostic: ['bookings', 'catalog'],
        admin: ['overview', 'network', 'users', 'governance'],
      };
      if (!roleNavs[currentUser.role].includes(activeTab)) {
        setActiveTab(DEFAULT_TAB_BY_ROLE[currentUser.role]);
      }
    }
  }, [activeTab, currentUser, view]);

  const pendingReferralCount = referrals.filter(
    (r) => r.status === 'pending' || r.status === 'escalated'
  ).length;

  const activeTransferCount = referrals.filter(
    (r) => r.status === 'accepted' || r.status === 'in_transit'
  ).length;

  const pendingDiagCount = diagnosticBookings.filter((b) => b.status === 'requested').length;

  const navConfig = useMemo((): {
    items: NavItem[];
    primaryCtaLabel: string;
    onPrimaryCta: () => void;
  } => {
    const role = currentUser?.role ?? 'patient';
    switch (role) {
      case 'patient':
        return {
          items: [
            { id: 'overview', label: 'My Care Overview', icon: LayoutDashboard },
            { id: 'opd', label: 'Smart OPD & QR', icon: Calendar },
            { id: 'specialists', label: 'Specialist Connect', icon: Stethoscope },
            { id: 'diagnostics', label: 'Diagnostic Connect', icon: FlaskConical },
            { id: 'profile', label: 'Medical Profile', icon: User },
          ],
          primaryCtaLabel: 'Book OPD Token',
          onPrimaryCta: () => setActiveTab('opd'),
        };
      case 'doctor':
        return {
          items: [
            { id: 'overview', label: 'Triage Overview', icon: LayoutDashboard },
            { id: 'new-referral', label: 'New Emergency Referral', icon: Send },
            {
              id: 'referrals',
              label: 'Sent Referrals',
              icon: Activity,
              badge: pendingReferralCount,
            },
          ],
          primaryCtaLabel: 'New Referral',
          onPrimaryCta: () => setActiveTab('new-referral'),
        };
      case 'hospital':
        return {
          items: [
            { id: 'overview', label: 'Command Center', icon: LayoutDashboard },
            { id: 'opd-queue', label: 'Live OPD Queue', icon: Users },
            {
              id: 'referrals',
              label: 'Emergency Referrals',
              icon: Activity,
              badge: pendingReferralCount,
            },
            { id: 'capacity', label: 'Beds & Capacity', icon: BedDouble },
          ],
          primaryCtaLabel: 'Incoming Referrals',
          onPrimaryCta: () => setActiveTab('referrals'),
        };
      case 'ambulance':
        return {
          items: [
            {
              id: 'transfers',
              label: 'Assigned Transfers',
              icon: Ambulance,
              badge: activeTransferCount,
            },
            { id: 'vitals', label: 'In-Transit Vitals', icon: HeartPulse },
            { id: 'route', label: 'Route & GPS Consent', icon: MapPin },
          ],
          primaryCtaLabel: 'Update Vitals',
          onPrimaryCta: () => setActiveTab('vitals'),
        };
      case 'diagnostic':
        return {
          items: [
            {
              id: 'bookings',
              label: 'Slot Requests & Reports',
              icon: FlaskConical,
              badge: pendingDiagCount,
            },
            { id: 'catalog', label: 'Lab Test Catalog', icon: Activity },
          ],
          primaryCtaLabel: 'Add Lab Test',
          onPrimaryCta: () => setActiveTab('catalog'),
        };
      case 'admin':
        return {
          items: [
            { id: 'overview', label: 'Platform Analytics', icon: BarChart3 },
            { id: 'network', label: 'Hospitals & Network', icon: Building2 },
            { id: 'users', label: 'Users & RBAC', icon: Users },
            { id: 'governance', label: 'Audit & Broadcast', icon: ShieldCheck },
          ],
          primaryCtaLabel: 'Broadcast Alert',
          onPrimaryCta: () => setActiveTab('governance'),
        };
    }
  }, [activeTransferCount, currentUser?.role, pendingDiagCount, pendingReferralCount]);

  const handleOpenAssistant = (notes?: string, applyCb?: (summary: string) => void) => {
    setAssistantNotes(notes ?? '');
    setAssistantApplyCb(() => applyCb);
    setAssistantOpen(true);
  };

  return (
    <>
      {/* Mandatory Google Maps Demo Key Quota Exceeded Banner */}
      {quotaBannerVisible && (
        <div
          role="alert"
          className="sticky top-0 z-50 bg-amber-100 border-b border-amber-300 text-amber-950 px-4 py-2.5 text-xs flex items-center justify-between gap-3"
        >
          <div className="flex items-center gap-2">
            <AlertTriangle className="w-4 h-4 text-amber-800 shrink-0" />
            <span>
              Google Maps demo quota reached — interactive Bengaluru corridor fallback is active.{' '}
              <a
                href="https://developers.google.com/maps/ai/ai-studio?utm_campaign=gmp_mcp_codeassist_v1_aistudio#quota_exceeded_errors"
                target="_blank"
                rel="noopener noreferrer"
                className="font-bold underline hover:text-amber-900"
              >
                Learn how to switch to your own Google Maps API key
              </a>
              .
            </span>
          </div>
          <button
            type="button"
            onClick={() => setQuotaBannerVisible(false)}
            aria-label="Dismiss quota notice"
            className="p-1 rounded-lg hover:bg-amber-200/70 shrink-0"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      )}

      {view === 'landing' || !currentUser ? (
        <LandingPage onOpenAuth={handleOpenAuth} onEnterRole={enterRoleWorkspace} />
      ) : (
        <DashboardShell
          navItems={navConfig.items}
          activeTab={activeTab}
          onTabChange={setActiveTab}
          primaryCtaLabel={navConfig.primaryCtaLabel}
          onPrimaryCta={navConfig.onPrimaryCta}
          searchQuery={searchQuery}
          onSearchChange={setSearchQuery}
          onGoHome={() => setView('landing')}
          onOpenAssistant={() => handleOpenAssistant()}
          onSwitchRole={handleSwitchRole}
        >
          {currentUser.role === 'patient' && (
            <PatientDashboard
              activeTab={activeTab}
              onTabChange={setActiveTab}
              searchQuery={searchQuery}
            />
          )}
          {currentUser.role === 'doctor' && (
            <DoctorDashboard
              activeTab={activeTab}
              onTabChange={setActiveTab}
              searchQuery={searchQuery}
              onOpenAssistant={handleOpenAssistant}
            />
          )}
          {currentUser.role === 'hospital' && (
            <HospitalDashboard
              activeTab={activeTab}
              onTabChange={setActiveTab}
              searchQuery={searchQuery}
            />
          )}
          {currentUser.role === 'ambulance' && (
            <AmbulanceDashboard
              activeTab={activeTab}
              onTabChange={setActiveTab}
              searchQuery={searchQuery}
            />
          )}
          {currentUser.role === 'diagnostic' && (
            <DiagnosticDashboard
              activeTab={activeTab}
              onTabChange={setActiveTab}
              searchQuery={searchQuery}
            />
          )}
          {currentUser.role === 'admin' && (
            <AdminDashboard
              activeTab={activeTab}
              onTabChange={setActiveTab}
              searchQuery={searchQuery}
            />
          )}
        </DashboardShell>
      )}

      <AuthModal
        open={authModalOpen}
        initialTab={authInitialTab}
        onClose={() => setAuthModalOpen(false)}
        onAuthenticated={handleAuthenticated}
      />

      <KairosAssistantModal
        open={assistantOpen}
        onClose={() => setAssistantOpen(false)}
        initialNotes={assistantNotes}
        onApplySummary={assistantApplyCb}
      />

      {toastMessage && (
        <div
          role="status"
          aria-live="polite"
          className="fixed bottom-5 right-5 z-50 max-w-sm rounded-xl bg-[#0B3B2D] text-white px-4 py-3 shadow-xl border border-emerald-700/60 flex items-center gap-2.5 text-xs font-medium"
        >
          <CheckCircle2 className="w-4 h-4 text-[#4ADE80] shrink-0" />
          <span>{toastMessage}</span>
        </div>
      )}
    </>
  );
}
