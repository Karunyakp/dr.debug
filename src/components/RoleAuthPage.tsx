import React, { useEffect, useState } from 'react';
import {
  Ambulance,
  ArrowLeft,
  Building2,
  Eye,
  EyeOff,
  FlaskConical,
  Loader2,
  Lock,
  Mail,
  ShieldCheck,
  Sparkles,
  Stethoscope,
  User,
  Users,
} from 'lucide-react';
import { useKairos } from '../context/KairosContext';
import type { UserRole } from '../types/kairos';
import { generateDummyCredentials } from '../utils/demoCredentials';
import { ThemeToggle } from './ThemeToggle';

export { generateDummyCredentials };

interface RolePortalMeta {
  role: UserRole;
  shortLabel: string;
  portalTitle: string;
  signInSubtitle: string;
  signUpSubtitle: string;
  facilityLabel?: string;
  facilityPlaceholder?: string;
  icon: React.FC<{ className?: string }>;
}

const ROLE_PORTALS: RolePortalMeta[] = [
  {
    role: 'patient',
    shortLabel: 'Patient',
    portalTitle: 'Patient Portal',
    signInSubtitle: 'Book Smart OPD tokens, track live queues, find specialists, and view lab reports.',
    signUpSubtitle: 'Create your patient account to book OPD slots, connect with specialists, and manage consent.',
    icon: Users,
  },
  {
    role: 'doctor',
    shortLabel: 'Doctor',
    portalTitle: 'Referring Doctor Portal',
    signInSubtitle: 'Send structured ISBAR emergency referrals with live vitals and transparent hospital matching.',
    signUpSubtitle: 'Register your clinician account for PHC/clinic triage and golden-hour referrals.',
    facilityLabel: 'Clinic / PHC / Hospital Name',
    facilityPlaceholder: 'e.g., Community Health Centre',
    icon: Stethoscope,
  },
  {
    role: 'hospital',
    shortLabel: 'Hospital',
    portalTitle: 'Receiving Hospital Desk',
    signInSubtitle: 'Accept incoming emergency referrals, reserve ICU beds, and manage live OPD queues.',
    signUpSubtitle: 'Register your hospital command desk account to publish verified bed capacity.',
    facilityLabel: 'Hospital Name',
    facilityPlaceholder: 'e.g., City General Hospital',
    icon: Building2,
  },
  {
    role: 'ambulance',
    shortLabel: 'Ambulance',
    portalTitle: 'Ambulance Team Portal',
    signInSubtitle: 'Receive confirmed bed assignments, stream en-route vitals, and share consented GPS ETA.',
    signUpSubtitle: 'Register your ambulance crew account for confirmed emergency transfers.',
    facilityLabel: 'Ambulance Unit / Fleet ID',
    facilityPlaceholder: 'e.g., ALS Unit KA-01',
    icon: Ambulance,
  },
  {
    role: 'diagnostic',
    shortLabel: 'Diagnostics',
    portalTitle: 'Diagnostic Centre Portal',
    signInSubtitle: 'Confirm patient test bookings, manage lab catalogs, and publish diagnostic reports.',
    signUpSubtitle: 'Register your diagnostic laboratory to list tests and confirm bookings.',
    facilityLabel: 'Diagnostic Centre Name',
    facilityPlaceholder: 'e.g., Metro Diagnostics Lab',
    icon: FlaskConical,
  },
  {
    role: 'admin',
    shortLabel: 'Admin',
    portalTitle: 'Administrator Portal',
    signInSubtitle: 'Manage hospital networks, specialist directories, RBAC roles, and DPDP audit trails.',
    signUpSubtitle: 'Create an administrator account to configure facilities and oversee platform operations.',
    facilityLabel: 'Organization / Authority',
    facilityPlaceholder: 'e.g., District Health Operations',
    icon: ShieldCheck,
  },
];

interface RoleAuthPageProps {
  role: UserRole;
  initialMode?: 'signin' | 'signup';
  onChangeRole: (role: UserRole) => void;
  onBackHome: () => void;
  onAuthenticated: (authenticatedRole?: UserRole) => void;
}

function formatFirebaseAuthError(err: unknown): string {
  const code =
    typeof err === 'object' && err !== null && 'code' in err
      ? String((err as { code?: unknown }).code)
      : '';
  const msg = err instanceof Error ? err.message : '';

  if (
    code === 'auth/operation-not-allowed' ||
    msg.includes('operation-not-allowed') ||
    msg.includes('PASSWORD_LOGIN_DISABLED')
  ) {
    return 'Email & Password sign-in is disabled in Firebase Console (PASSWORD_LOGIN_DISABLED). Enable "Email/Password" under Firebase Console → Authentication → Sign-in method, or use "Continue with Google".';
  }
  if (
    code === 'auth/invalid-credential' ||
    code === 'auth/wrong-password' ||
    code === 'auth/user-not-found'
  ) {
    return 'Invalid email address or password. Please check your credentials or create an account.';
  }
  if (code === 'auth/email-already-in-use') {
    return 'An account with this email already exists. Switch to Sign in instead.';
  }
  if (code === 'auth/weak-password') {
    return 'Password must be at least 6 characters long.';
  }
  if (code === 'auth/invalid-email') {
    return 'Please enter a valid email address.';
  }
  if (code === 'auth/unauthorized-domain' || msg.includes('unauthorized-domain')) {
    const host = typeof window !== 'undefined' ? window.location.hostname : 'this domain';
    return `Google sign-in is blocked because "${host}" is not yet in Firebase Authorized Domains. Add "${host}" under Firebase Console → Authentication → Settings → Authorized domains.`;
  }
  if (code === 'auth/popup-blocked' || msg.includes('popup-blocked')) {
    return 'Your browser blocked the Google sign-in popup. Please allow popups for this site and click "Continue with Google" again, or use Demo Login below.';
  }
  if (code === 'auth/operation-not-supported-in-this-environment') {
    return 'Google sign-in popup is restricted in this embedded browser view. Open the app in a full browser tab to sign in with Google, or use Demo Login below.';
  }
  if (code === 'auth/popup-closed-by-user' || code === 'auth/cancelled-popup-request') {
    return 'Google sign-in popup was closed before completing sign-in. Please try again.';
  }
  if (code === 'auth/network-request-failed') {
    return 'Network error while reaching Firebase Authentication. Please check your internet connection and try again.';
  }
  if (code === 'auth/too-many-requests') {
    return 'Too many failed attempts. Please wait a moment and try again.';
  }
  return msg || 'Authentication failed. Please try again.';
}

const GoogleIcon: React.FC = () => (
  <svg className="w-4 h-4 shrink-0" viewBox="0 0 24 24" aria-hidden="true">
    <path
      fill="#4285F4"
      d="M23.49 12.27c0-.79-.07-1.55-.2-2.27H12v4.3h6.44a5.5 5.5 0 0 1-2.39 3.61v3h3.87c2.26-2.08 3.57-5.15 3.57-8.64z"
    />
    <path
      fill="#34A853"
      d="M12 24c3.24 0 5.96-1.07 7.95-2.91l-3.87-3c-1.07.72-2.45 1.15-4.08 1.15-3.14 0-5.8-2.12-6.75-4.97H1.25v3.09A12 12 0 0 0 12 24z"
    />
    <path
      fill="#FBBC05"
      d="M5.25 14.27a7.21 7.21 0 0 1 0-4.54V6.64H1.25a12 12 0 0 0 0 10.72l4-3.09z"
    />
    <path
      fill="#EA4335"
      d="M12 4.76c1.76 0 3.34.61 4.58 1.8l3.44-3.44C17.95 1.19 15.23 0 12 0 7.31 0 3.25 2.69 1.25 6.64l4 3.09C6.2 6.88 8.86 4.76 12 4.76z"
    />
  </svg>
);

export const RoleAuthPage: React.FC<RoleAuthPageProps> = ({
  role,
  initialMode = 'signin',
  onChangeRole,
  onBackHome,
  onAuthenticated,
}) => {
  const {
    loginWithEmail,
    registerWithEmailAccount,
    loginWithGoogle,
    loginWithDemoCredentials,
    authCallbackError,
    clearAuthCallbackError,
  } = useKairos();

  const [mode, setMode] = useState<'signin' | 'signup'>(initialMode);
  const [fullName, setFullName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [phone, setPhone] = useState('');
  const [facilityName, setFacilityName] = useState('');
  const [consentGranted, setConsentGranted] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [demoNotice, setDemoNotice] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [googleBusy, setGoogleBusy] = useState(false);

  useEffect(() => {
    setMode(initialMode);
  }, [initialMode]);

  useEffect(() => {
    if (authCallbackError) {
      setError(formatFirebaseAuthError(authCallbackError));
    }
  }, [authCallbackError]);

  useEffect(() => {
    setError(null);
    clearAuthCallbackError();
  }, [role, mode, clearAuthCallbackError]);

  const portal = ROLE_PORTALS.find((p) => p.role === role) ?? ROLE_PORTALS[0];
  const PortalIcon = portal.icon;

  const handleEmailSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    if (!email.trim() || !password) {
      setError('Please enter both your email address and password.');
      return;
    }

    if (mode === 'signup') {
      if (!fullName.trim()) {
        setError('Please enter your full name.');
        return;
      }
      if (password.length < 6) {
        setError('Password must be at least 6 characters long.');
        return;
      }
      if (!consentGranted) {
        setError('Please accept the DPDP clinical data handling consent to create your account.');
        return;
      }
    }

    setSubmitting(true);
    try {
      if (mode === 'signin') {
        await loginWithEmail(email, password, role);
      } else {
        await registerWithEmailAccount({
          displayName: fullName,
          email,
          password,
          role,
          phone: phone.trim() || undefined,
          facilityName: facilityName.trim() || undefined,
          consentGranted,
        });
      }
      onAuthenticated(role);
    } catch (err) {
      setError(formatFirebaseAuthError(err));
    } finally {
      setSubmitting(false);
    }
  };

  const handleGoogleSignIn = async () => {
    setError(null);
    clearAuthCallbackError();
    setGoogleBusy(true);
    try {
      const completedImmediately = await loginWithGoogle(role, facilityName.trim() || undefined);
      if (completedImmediately) {
        onAuthenticated(role);
      }
    } catch (err) {
      setError(formatFirebaseAuthError(err));
    } finally {
      setGoogleBusy(false);
    }
  };

  const handleAutoFillDemo = (targetRole: UserRole) => {
    const creds = generateDummyCredentials(targetRole);
    setError(null);
    clearAuthCallbackError();
    onChangeRole(targetRole);
    setMode('signin');
    setFullName(creds.displayName);
    setEmail(creds.email);
    setPassword(creds.password);
    setPhone(creds.phone);
    setFacilityName(creds.facilityName ?? '');
    setDemoNotice(
      `Auto-filled ${targetRole} demo credentials (${creds.email}). Click "Sign in" above or launch directly below.`
    );
  };

  const handleInstantDemoLaunch = (targetRole: UserRole) => {
    const creds = generateDummyCredentials(targetRole);
    setError(null);
    clearAuthCallbackError();
    onChangeRole(targetRole);
    loginWithDemoCredentials(creds);
    onAuthenticated(targetRole);
  };

  return (
    <div className="min-h-screen bg-kairos-mint text-kairos-forest-ink flex flex-col transition-colors duration-200">
      {/* Top Bar */}
      <header className="bg-kairos-surface/95 backdrop-blur-md border-b border-kairos-border">
        <div className="max-w-5xl mx-auto px-5 h-16 flex items-center justify-between gap-4">
          <button
            type="button"
            onClick={onBackHome}
            className="flex items-center gap-2.5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-kairos-emerald rounded-lg"
          >
            <img
              src="/assets/aistudio/Kairos-Logo-Icon_f4a33af1.png"
              alt="KAIROS"
              className="w-8 h-8 object-contain"
              referrerPolicy="no-referrer"
            />
            <span className="font-display text-xl font-extrabold tracking-tight text-kairos-forest-ink">
              KAIROS
            </span>
          </button>

          <div className="flex items-center gap-3">
            <ThemeToggle />
            <button
              type="button"
              onClick={onBackHome}
              className="inline-flex items-center gap-1.5 text-sm font-semibold text-kairos-forest-ink/85 hover:text-kairos-emerald-ink transition-colors whitespace-nowrap"
            >
              <ArrowLeft className="w-4 h-4" />
              Back to Home
            </button>
          </div>
        </div>
      </header>

      {/* Main Auth Container */}
      <main className="flex-1 flex flex-col items-center justify-center px-4 py-8 sm:py-12">
        {/* Per-Role Portal Selector */}
        <div className="w-full max-w-2xl mb-6">
          <p className="text-center text-xs font-semibold uppercase tracking-wider text-kairos-muted mb-3">
            Choose Your KAIROS Portal
          </p>
          <div
            role="tablist"
            aria-label="Select sign-in portal role"
            className="grid grid-cols-3 sm:grid-cols-6 gap-2"
          >
            {ROLE_PORTALS.map((item) => {
              const Icon = item.icon;
              const active = item.role === role;
              return (
                <button
                  key={item.role}
                  type="button"
                  role="tab"
                  aria-selected={active}
                  onClick={() => onChangeRole(item.role)}
                  className={`flex flex-col items-center justify-center gap-1.5 px-2.5 py-2.5 rounded-xl border text-xs font-semibold transition-all ${
                    active
                      ? 'bg-kairos-forest text-white border-kairos-forest shadow-sm'
                      : 'bg-kairos-surface text-kairos-forest-ink border-kairos-border hover:border-kairos-emerald hover:text-kairos-emerald-ink'
                  }`}
                >
                  <Icon className={`w-4 h-4 ${active ? 'text-[#4ADE80]' : 'text-kairos-emerald-ink'}`} />
                  <span className="truncate max-w-full">{item.shortLabel}</span>
                </button>
              );
            })}
          </div>
        </div>

        {/* Standard Modern App Sign-In Card */}
        <div className="w-full max-w-[440px] bg-kairos-surface border border-kairos-border rounded-2xl shadow-[0_14px_40px_rgba(11,59,45,0.08)] dark:shadow-[0_14px_40px_rgba(0,0,0,0.45)] p-6 sm:p-8">
          {/* Role Header */}
          <div className="text-center mb-6">
            <div className="w-12 h-12 rounded-2xl bg-kairos-mint-soft text-kairos-emerald-ink flex items-center justify-center mx-auto mb-3.5">
              <PortalIcon className="w-6 h-6" />
            </div>
            <h1 className="font-display text-2xl font-extrabold text-kairos-forest-ink tracking-tight">
              {mode === 'signin'
                ? `Sign in · ${portal.portalTitle}`
                : `Create ${portal.shortLabel} Account`}
            </h1>
            <p className="text-xs sm:text-[13px] text-kairos-muted mt-1.5 leading-relaxed">
              {mode === 'signin' ? portal.signInSubtitle : portal.signUpSubtitle}
            </p>
          </div>

          {error && (
            <div
              role="alert"
              className="mb-4 p-3 rounded-xl bg-red-50 dark:bg-red-950/50 border border-red-200 dark:border-red-900/60 text-xs text-red-800 dark:text-red-200 leading-relaxed"
            >
              {error}
            </div>
          )}

          {/* Primary Email & Password Form */}
          <form onSubmit={handleEmailSubmit} className="space-y-4">
            {mode === 'signup' && (
              <>
                <div>
                  <label
                    htmlFor="auth-fullname"
                    className="block text-xs font-semibold text-kairos-forest-ink mb-1.5"
                  >
                    Full Name
                  </label>
                  <div className="relative">
                    <User className="w-4 h-4 text-kairos-muted absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none" />
                    <input
                      id="auth-fullname"
                      type="text"
                      required
                      value={fullName}
                      onChange={(e) => setFullName(e.target.value)}
                      placeholder="Enter your full name"
                      autoComplete="name"
                      className="w-full pl-10 pr-3.5 py-2.5 rounded-xl border border-kairos-border bg-kairos-surface-subtle text-sm text-kairos-forest-ink placeholder:text-kairos-muted/70 focus:bg-kairos-surface focus:outline-none focus:ring-2 focus:ring-kairos-emerald"
                    />
                  </div>
                </div>

                {portal.facilityLabel && (
                  <div>
                    <label
                      htmlFor="auth-facility"
                      className="block text-xs font-semibold text-kairos-forest-ink mb-1.5"
                    >
                      {portal.facilityLabel}
                    </label>
                    <input
                      id="auth-facility"
                      type="text"
                      value={facilityName}
                      onChange={(e) => setFacilityName(e.target.value)}
                      placeholder={portal.facilityPlaceholder}
                      className="w-full px-3.5 py-2.5 rounded-xl border border-kairos-border bg-kairos-surface-subtle text-sm text-kairos-forest-ink placeholder:text-kairos-muted/70 focus:bg-kairos-surface focus:outline-none focus:ring-2 focus:ring-kairos-emerald"
                    />
                  </div>
                )}

                <div>
                  <label
                    htmlFor="auth-phone"
                    className="block text-xs font-semibold text-kairos-forest-ink mb-1.5"
                  >
                    Phone Number <span className="text-kairos-muted font-normal">(Optional)</span>
                  </label>
                  <input
                    id="auth-phone"
                    type="tel"
                    value={phone}
                    onChange={(e) => setPhone(e.target.value)}
                    placeholder="+91-98XXXXXXXX"
                    autoComplete="tel"
                    className="w-full px-3.5 py-2.5 rounded-xl border border-kairos-border bg-kairos-surface-subtle text-sm text-kairos-forest-ink placeholder:text-kairos-muted/70 focus:bg-kairos-surface focus:outline-none focus:ring-2 focus:ring-kairos-emerald"
                  />
                </div>
              </>
            )}

            <div>
              <label
                htmlFor="auth-email"
                className="block text-xs font-semibold text-kairos-forest-ink mb-1.5"
              >
                Email Address
              </label>
              <div className="relative">
                <Mail className="w-4 h-4 text-kairos-muted absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none" />
                <input
                  id="auth-email"
                  type="email"
                  required
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="name@example.com"
                  autoComplete="email"
                  className="w-full pl-10 pr-3.5 py-2.5 rounded-xl border border-kairos-border bg-kairos-surface-subtle text-sm text-kairos-forest-ink placeholder:text-kairos-muted/70 focus:bg-kairos-surface focus:outline-none focus:ring-2 focus:ring-kairos-emerald"
                />
              </div>
            </div>

            <div>
              <label
                htmlFor="auth-password"
                className="block text-xs font-semibold text-kairos-forest-ink mb-1.5"
              >
                Password
              </label>
              <div className="relative">
                <Lock className="w-4 h-4 text-kairos-muted absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none" />
                <input
                  id="auth-password"
                  type={showPassword ? 'text' : 'password'}
                  required
                  minLength={6}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder={mode === 'signup' ? 'Create a password (min. 6 chars)' : 'Enter your password'}
                  autoComplete={mode === 'signin' ? 'current-password' : 'new-password'}
                  className="w-full pl-10 pr-10 py-2.5 rounded-xl border border-kairos-border bg-kairos-surface-subtle text-sm text-kairos-forest-ink placeholder:text-kairos-muted/70 focus:bg-kairos-surface focus:outline-none focus:ring-2 focus:ring-kairos-emerald"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword((v) => !v)}
                  aria-label={showPassword ? 'Hide password' : 'Show password'}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-kairos-muted hover:text-kairos-forest-ink p-1"
                >
                  {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>
            </div>

            {mode === 'signup' && (
              <label className="flex items-start gap-2.5 p-3 rounded-xl bg-kairos-mint-soft/70 border border-kairos-border cursor-pointer">
                <input
                  type="checkbox"
                  checked={consentGranted}
                  onChange={(e) => setConsentGranted(e.target.checked)}
                  className="mt-0.5 rounded border-kairos-border text-kairos-emerald focus:ring-kairos-emerald"
                />
                <span className="text-[11px] text-kairos-muted leading-relaxed">
                  I agree to DPDP-aligned clinical data handling and revocable consent policies for KAIROS healthcare coordination.
                </span>
              </label>
            )}

            <button
              type="submit"
              disabled={submitting || googleBusy}
              className="w-full inline-flex items-center justify-center gap-2 py-2.5 px-4 rounded-xl bg-kairos-emerald hover:bg-kairos-emerald-hover text-white text-sm font-semibold transition-colors shadow-xs disabled:opacity-60"
            >
              {submitting && <Loader2 className="w-4 h-4 animate-spin" />}
              {mode === 'signin' ? `Sign in to ${portal.shortLabel} Portal` : 'Create Account'}
            </button>
          </form>

          {/* Standard Divider */}
          <div className="relative my-5">
            <div className="absolute inset-0 flex items-center" aria-hidden="true">
              <div className="w-full border-t border-kairos-border" />
            </div>
            <div className="relative flex justify-center">
              <span className="bg-kairos-surface px-3 text-xs font-medium text-kairos-muted">or</span>
            </div>
          </div>

          {/* Standard Google Sign-In Button Below */}
          <button
            type="button"
            disabled={submitting || googleBusy}
            onClick={() => void handleGoogleSignIn()}
            className="w-full inline-flex items-center justify-center gap-2.5 py-2.5 px-4 rounded-xl bg-kairos-surface hover:bg-kairos-surface-subtle text-kairos-forest-ink border border-kairos-border hover:border-kairos-emerald text-sm font-semibold transition-colors shadow-2xs disabled:opacity-60"
          >
            {googleBusy ? <Loader2 className="w-4 h-4 animate-spin text-kairos-emerald-ink" /> : <GoogleIcon />}
            <span>{googleBusy ? 'Connecting to Google...' : 'Continue with Google'}</span>
          </button>

          {/* Demo Login Section */}
          <div className="mt-5 rounded-xl border border-kairos-border bg-kairos-surface-subtle p-4 space-y-3">
            <div className="flex items-center justify-between gap-2">
              <div className="flex items-center gap-1.5">
                <Sparkles className="w-3.5 h-3.5 text-kairos-emerald-ink shrink-0" />
                <h2 className="text-xs font-bold text-kairos-forest-ink uppercase tracking-wider">
                  Demo Login
                </h2>
              </div>
              <span className="text-[11px] font-medium text-kairos-muted">
                Quick auto-fill
              </span>
            </div>

            <p className="text-[11px] text-kairos-muted leading-relaxed">
              Auto-fill sample credentials for any role to test the full flow without creating an account:
            </p>

            <div className="grid grid-cols-3 gap-2">
              {ROLE_PORTALS.map((item) => {
                const Icon = item.icon;
                const isFilled =
                  email.trim().toLowerCase() ===
                  generateDummyCredentials(item.role).email.toLowerCase();
                return (
                  <button
                    key={item.role}
                    type="button"
                    onClick={() => handleAutoFillDemo(item.role)}
                    className={`flex flex-col items-center justify-center gap-1 py-2 px-2 rounded-lg border text-[11px] font-semibold transition-colors ${
                      isFilled
                        ? 'bg-kairos-mint-soft border-kairos-emerald text-kairos-forest-ink'
                        : 'bg-kairos-surface border-kairos-border text-kairos-forest-ink hover:border-kairos-emerald hover:text-kairos-emerald-ink'
                    }`}
                  >
                    <Icon className="w-3.5 h-3.5 text-kairos-emerald-ink" />
                    <span className="truncate max-w-full">{item.shortLabel}</span>
                  </button>
                );
              })}
            </div>

            {demoNotice && (
              <div className="rounded-lg bg-kairos-mint-soft/80 border border-kairos-border px-3 py-2 space-y-2">
                <p className="text-[11px] text-kairos-forest-ink leading-snug">{demoNotice}</p>
                <button
                  type="button"
                  onClick={() => handleInstantDemoLaunch(role)}
                  className="w-full py-1.5 px-3 rounded-lg bg-kairos-forest hover:bg-kairos-emerald text-white text-xs font-semibold transition-colors"
                >
                  Enter {portal.shortLabel} Demo Now →
                </button>
              </div>
            )}
          </div>

          {/* Mode Toggle Footer */}
          <p className="mt-6 text-center text-xs text-kairos-muted">
            {mode === 'signin' ? (
              <>
                Don&apos;t have an account?{' '}
                <button
                  type="button"
                  onClick={() => setMode('signup')}
                  className="font-bold text-kairos-emerald-ink hover:underline"
                >
                  Sign up
                </button>
              </>
            ) : (
              <>
                Already have an account?{' '}
                <button
                  type="button"
                  onClick={() => setMode('signin')}
                  className="font-bold text-kairos-emerald-ink hover:underline"
                >
                  Sign in
                </button>
              </>
            )}
          </p>
        </div>

        <p className="mt-5 text-[11px] text-kairos-muted text-center max-w-md">
          Protected by Firebase Authentication, isolated PII records, and immutable clinical audit logs.
        </p>
      </main>
    </div>
  );
};
