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
  Sparkles,
  Stethoscope,
  User,
  Users,
  X,
} from 'lucide-react';
import { useKairos } from './context/KairosContext';
import type { UserRole } from './types/kairos';
import { LandingPage } from './components/LandingPage';
import { DashboardShell, type NavItem } from './components/DashboardShell';
import { RoleAuthPage } from './components/RoleAuthPage';
import { KairosAssistantModal, type AssistantTab } from './components/KairosAssistantModal';
import { PatientDashboard } from './components/PatientDashboard';
import { DoctorDashboard } from './components/DoctorDashboard';
import { HospitalDashboard } from './components/HospitalDashboard';
import { AmbulanceDashboard } from './components/AmbulanceDashboard';
import { DiagnosticDashboard } from './components/DiagnosticDashboard';
import { AdminDashboard } from './components/AdminDashboard';
import { NotFoundPage } from './components/NotFoundPage';

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

function isUnknownPath(pathname: string): boolean {
  const clean = pathname.replace(/\/+$/, '') || '/';
  return clean !== '/' && clean !== '/index.html';
}

export default function App() {
  const {
    currentUser,
    authReady,
    authCallbackError,
    referrals,
    diagnosticBookings,
    toastMessage,
    redirectAuthenticatedRole,
    consumeRedirectAuthenticatedRole,
    logout,
  } = useKairos();

  const [view, setView] = useState<'landing' | 'auth' | 'dashboard' | 'not-found'>(() => {
    if (typeof window !== 'undefined') {
      const params = new URLSearchParams(window.location.search);
      if (params.get('page') === '404' || isUnknownPath(window.location.pathname)) {
        return 'not-found';
      }
    }
    return 'landing';
  });
  const [authRole, setAuthRole] = useState<UserRole>('patient');
  const [authMode, setAuthMode] = useState<'signin' | 'signup'>('signin');
  const [pendingTab, setPendingTab] = useState<string | undefined>(undefined);
  const [activeTab, setActiveTab] = useState<string>('overview');
  const [searchQuery, setSearchQuery] = useState('');
  const [assistantOpen, setAssistantOpen] = useState(false);
  const [assistantTab, setAssistantTab] = useState<AssistantTab>('chat');
  const [assistantNotes, setAssistantNotes] = useState('');
  const [assistantApplyCb, setAssistantApplyCb] = useState<((summary: string) => void) | undefined>(
    undefined
  );
  const [quotaBannerVisible, setQuotaBannerVisible] = useState(false);

  // Google Maps quota listener (mandatory top-level sticky amber banner)
  useEffect(() => {
    const handler = () => setQuotaBannerVisible(true);
    window.addEventListener('gmp-quota-exceeded', handler);
    return () => window.removeEventListener('gmp-quota-exceeded', handler);
  }, []);

  // Support ?role=<role> or unknown path / ?page=404
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    if (params.get('page') === '404' || isUnknownPath(window.location.pathname)) {
      setView('not-found');
      return;
    }
    const roleParam = params.get('role') as UserRole | null;
    if (roleParam && VALID_ROLES.includes(roleParam)) {
      setAuthRole(roleParam);
      setAuthMode('signin');
      setView('auth');
    }
  }, []);

  // Automatically enter dashboard when returning from an OAuth redirect callback
  useEffect(() => {
    if (redirectAuthenticatedRole && currentUser) {
      setAuthRole(redirectAuthenticatedRole);
      setActiveTab(pendingTab ?? DEFAULT_TAB_BY_ROLE[redirectAuthenticatedRole]);
      setPendingTab(undefined);
      setView('dashboard');
      consumeRedirectAuthenticatedRole();
      window.scrollTo({ top: 0, behavior: 'smooth' });
    }
  }, [redirectAuthenticatedRole, currentUser, pendingTab, consumeRedirectAuthenticatedRole]);

  // Surface any OAuth callback errors directly on the sign-in screen instead of leaving the user on Home
  useEffect(() => {
    if (authCallbackError && view === 'landing') {
      setView('auth');
    }
  }, [authCallbackError, view]);

  // Keep signed-out dashboard views on the sign-in screen once auth resolves instead of abruptly jumping to Home
  useEffect(() => {
    if (view === 'dashboard' && authReady && !currentUser) {
      setView('auth');
    }
  }, [view, authReady, currentUser]);

  const handleGoHomepageFromNotFound = () => {
    if (typeof window !== 'undefined' && (window.location.pathname !== '/' || window.location.search)) {
      window.history.replaceState({}, '', '/');
    }
    setView('landing');
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const enterRolePortal = (role: UserRole, initialTab?: string) => {
    setSearchQuery('');
    if (currentUser && currentUser.role === role) {
      setActiveTab(initialTab ?? DEFAULT_TAB_BY_ROLE[role]);
      setView('dashboard');
      window.scrollTo({ top: 0, behavior: 'smooth' });
      return;
    }
    setAuthRole(role);
    setAuthMode('signin');
    setPendingTab(initialTab);
    setView('auth');
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const handleOpenAuth = (role: UserRole = 'patient', mode: 'signin' | 'signup' = 'signin') => {
    if (currentUser && mode === 'signin' && currentUser.role === role) {
      setActiveTab(DEFAULT_TAB_BY_ROLE[currentUser.role]);
      setView('dashboard');
      return;
    }
    setAuthRole(role);
    setAuthMode(mode);
    setPendingTab(undefined);
    setView('auth');
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const handleAuthenticated = (authenticatedRole?: UserRole) => {
    const resolvedRole = currentUser?.role ?? authenticatedRole ?? authRole;
    setAuthRole(resolvedRole);
    setActiveTab(pendingTab ?? DEFAULT_TAB_BY_ROLE[resolvedRole]);
    setPendingTab(undefined);
    setView('dashboard');
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const handleOpenPortalSignIn = async (targetRole: UserRole) => {
    if (currentUser && currentUser.role === targetRole) {
      return;
    }
    await logout();
    setAuthRole(targetRole);
    setAuthMode('signin');
    setPendingTab(undefined);
    setView('auth');
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  // Keep activeTab valid whenever role changes
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

  const handleOpenAssistant = (
    notes?: string,
    applyCb?: (summary: string) => void,
    tab?: AssistantTab
  ) => {
    setAssistantNotes(notes ?? '');
    setAssistantApplyCb(() => applyCb);
    setAssistantTab(tab ?? (notes || applyCb ? 'isbar' : 'chat'));
    setAssistantOpen(true);
  };

  return (
    <>
      {/* Mandatory Google Maps Quota Exceeded Banner */}
      {quotaBannerVisible && (
        <div
          role="alert"
          className="sticky top-0 z-50 bg-amber-100 dark:bg-amber-950/90 border-b border-amber-300 dark:border-amber-800 text-amber-950 dark:text-amber-100 px-4 py-2.5 text-xs flex items-center justify-between gap-3"
        >
          <div className="flex items-center gap-2">
            <AlertTriangle className="w-4 h-4 text-amber-800 dark:text-amber-400 shrink-0" />
            <span>
              Google Maps quota reached — interactive facility corridor fallback is active.{' '}
              <a
                href="https://developers.google.com/maps/ai/ai-studio?utm_campaign=gmp_mcp_codeassist_v1_aistudio#quota_exceeded_errors"
                target="_blank"
                rel="noopener noreferrer"
                className="font-bold underline hover:text-amber-900 dark:hover:text-amber-200"
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
            className="p-1 rounded-lg hover:bg-amber-200/70 dark:hover:bg-amber-900/70 shrink-0"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      )}

      {view === 'not-found' ? (
        <NotFoundPage
          onGoHome={handleGoHomepageFromNotFound}
          onOpenPlatform={() => handleOpenAuth('patient', 'signin')}
        />
      ) : view === 'auth' ? (
        <RoleAuthPage
          role={authRole}
          initialMode={authMode}
          onChangeRole={(nextRole) => setAuthRole(nextRole)}
          onBackHome={() => setView('landing')}
          onAuthenticated={handleAuthenticated}
        />
      ) : view === 'dashboard' && !currentUser ? (
        <div className="min-h-screen bg-kairos-mint text-kairos-forest-ink flex items-center justify-center p-6">
          <div className="bg-kairos-surface border border-kairos-border rounded-2xl px-6 py-5 text-center shadow-sm">
            <p className="text-sm font-semibold text-kairos-forest-ink">Opening your KAIROS workspace…</p>
            <p className="text-xs text-kairos-muted mt-1">Restoring your authenticated session.</p>
          </div>
        </div>
      ) : view === 'dashboard' && currentUser ? (
        <DashboardShell
          navItems={navConfig.items}
          activeTab={activeTab}
          onTabChange={setActiveTab}
          primaryCtaLabel={navConfig.primaryCtaLabel}
          onPrimaryCta={navConfig.onPrimaryCta}
          searchQuery={searchQuery}
          onSearchChange={setSearchQuery}
          onGoHome={() => setView('landing')}
          onOpenAssistant={(tab) => handleOpenAssistant(undefined, undefined, tab ?? 'chat')}
          onSwitchPortalSignIn={(targetRole) => void handleOpenPortalSignIn(targetRole)}
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
      ) : (
        <LandingPage
          onOpenAuth={handleOpenAuth}
          onEnterRole={enterRolePortal}
          onOpenAssistant={(tab) => handleOpenAssistant(undefined, undefined, tab ?? 'chat')}
        />
      )}

      <KairosAssistantModal
        open={assistantOpen}
        onClose={() => setAssistantOpen(false)}
        initialTab={assistantTab}
        initialNotes={assistantNotes}
        onApplySummary={assistantApplyCb}
      />

      {!assistantOpen && (
        <button
          type="button"
          onClick={() => handleOpenAssistant(undefined, undefined, 'chat')}
          aria-label="Open KAIROS AI Voice, Chat, Transcribe & Maps Hub"
          className="fixed bottom-5 right-5 z-40 inline-flex items-center gap-2 px-4 py-2.5 rounded-2xl bg-kairos-forest hover:bg-kairos-emerald text-white text-xs font-bold shadow-xl border border-emerald-700/60 transition-colors"
        >
          <Sparkles className="w-4 h-4 text-[#4ADE80] shrink-0" />
          <span>KAIROS AI Hub</span>
        </button>
      )}

      {toastMessage && (
        <div
          role="status"
          aria-live="polite"
          className="fixed bottom-16 right-5 z-50 max-w-sm rounded-xl bg-kairos-forest text-white px-4 py-3 shadow-xl border border-emerald-700/60 flex items-center gap-2.5 text-xs font-medium"
        >
          <CheckCircle2 className="w-4 h-4 text-[#4ADE80] shrink-0" />
          <span>{toastMessage}</span>
        </div>
      )}
    </>
  );
}
