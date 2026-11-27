import React, { useState } from 'react';
import {
  Activity,
  Ambulance,
  Building2,
  FlaskConical,
  LogIn,
  ShieldCheck,
  Stethoscope,
  User,
  UserPlus,
  X,
} from 'lucide-react';
import { useKairos } from '../context/KairosContext';
import type { UserRole } from '../types/kairos';

interface AuthModalProps {
  open: boolean;
  initialTab?: 'demo' | 'register' | 'google';
  onClose: () => void;
  onAuthenticated: () => void;
}

const ROLE_CARDS: {
  role: UserRole;
  label: string;
  actor: string;
  desc: string;
  icon: React.FC<{ className?: string }>;
}[] = [
  {
    role: 'patient',
    label: 'Patient',
    actor: 'Ananya Patel',
    desc: 'Smart OPD QR tokens, Rural Kannada Specialist Connect & Diagnostics',
    icon: User,
  },
  {
    role: 'doctor',
    label: 'Referring Doctor',
    actor: 'Dr. Kavitha Rao · Nandi Rural PHC',
    desc: 'Structured ISBAR emergency referrals, vitals & hospital matching',
    icon: Stethoscope,
  },
  {
    role: 'hospital',
    label: 'Receiving Hospital',
    actor: 'Dr. Vikram Patel · CMRIT General',
    desc: 'Accept/decline referrals, Bed 12A timer hold, live OPD delay engine',
    icon: Building2,
  },
  {
    role: 'ambulance',
    label: 'Ambulance Team',
    actor: 'EMT Suresh · Unit KA-01',
    desc: 'Confirmed hospital handoff, 7-stage transfer tracker & live vitals',
    icon: Ambulance,
  },
  {
    role: 'diagnostic',
    label: 'Diagnostic Centre',
    actor: 'Prana Diagnostics Whitefield',
    desc: 'Confirm lab bookings, manage verified demo pricing & upload reports',
    icon: FlaskConical,
  },
  {
    role: 'admin',
    label: 'Administrator',
    actor: 'KAIROS Regional Command',
    desc: 'Network analytics, hospital/user RBAC governance & DPDP audit logs',
    icon: ShieldCheck,
  },
];

export const AuthModal: React.FC<AuthModalProps> = ({
  open,
  initialTab = 'demo',
  onClose,
  onAuthenticated,
}) => {
  const { loginAsDemoRole, registerPatient, loginWithGoogle } = useKairos();
  const [tab, setTab] = useState<'demo' | 'register' | 'google'>(initialTab);
  const [googleRole, setGoogleRole] = useState<UserRole>('patient');
  const [googleLoading, setGoogleLoading] = useState(false);
  const [authError, setAuthError] = useState<string | null>(null);

  // Registration form fields
  const [displayName, setDisplayName] = useState('');
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [bloodGroup, setBloodGroup] = useState('O+');
  const [allergies, setAllergies] = useState('');
  const [emergencyContact, setEmergencyContact] = useState('');
  const [abhaId, setAbhaId] = useState('');
  const [consentGranted, setConsentGranted] = useState(true);

  if (!open) return null;

  const handleDemoEnter = (role: UserRole) => {
    loginAsDemoRole(role);
    onAuthenticated();
    onClose();
  };

  const handleRegisterSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setAuthError(null);
    if (!displayName.trim() || !phone.trim() || !email.trim()) {
      setAuthError('Full name, email, and mobile number are required.');
      return;
    }
    if (!consentGranted) {
      setAuthError('Please grant explicit DPDP data coordination consent to register.');
      return;
    }
    registerPatient({
      displayName,
      email,
      phone,
      bloodGroup,
      allergies,
      emergencyContact,
      abhaId,
      consentGranted,
    });
    onAuthenticated();
    onClose();
  };

  const handleGoogleSignIn = async () => {
    setGoogleLoading(true);
    setAuthError(null);
    try {
      await loginWithGoogle(googleRole);
      onAuthenticated();
      onClose();
    } catch (err) {
      setAuthError(
        err instanceof Error
          ? err.message
          : 'Google sign-in popup was cancelled or blocked. You can also use instant Demo Accounts.'
      );
    } finally {
      setGoogleLoading(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 bg-[#07291F]/65 backdrop-blur-xs flex items-center justify-center p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="auth-modal-heading"
    >
      <div className="bg-white border border-[#D5E7DD] rounded-2xl max-w-2xl w-full max-h-[90vh] overflow-y-auto shadow-2xl">
        <div className="px-6 py-4 border-b border-[#E5F0EA] flex items-center justify-between">
          <div className="flex items-center gap-3">
            <img
              src="/assets/aistudio/Kairos-Logo-Icon_f4a33af1.png"
              alt="KAIROS Emblem"
              className="w-8 h-8 object-contain"
              referrerPolicy="no-referrer"
            />
            <div>
              <h2 id="auth-modal-heading" className="text-lg font-bold text-[#0B3B2D]">
                Access KAIROS Platform
              </h2>
              <p className="text-xs text-slate-500">
                Role-based authentication · Live cross-tab demo sync enabled
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close sign in dialog"
            className="p-2 rounded-lg text-slate-500 hover:bg-slate-100 hover:text-slate-900"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="px-6 pt-4">
          <div className="inline-flex p-1 bg-[#EFF7F3] rounded-xl border border-[#DCECE3] w-full sm:w-auto">
            <button
              type="button"
              onClick={() => {
                setTab('demo');
                setAuthError(null);
              }}
              className={`flex-1 sm:flex-initial px-4 py-2 text-xs font-semibold rounded-lg transition-colors whitespace-nowrap ${
                tab === 'demo' ? 'bg-white text-[#0B3B2D] shadow-xs' : 'text-slate-600 hover:text-[#0B3B2D]'
              }`}
            >
              Demo Role Accounts
            </button>
            <button
              type="button"
              onClick={() => {
                setTab('register');
                setAuthError(null);
              }}
              className={`flex-1 sm:flex-initial px-4 py-2 text-xs font-semibold rounded-lg transition-colors whitespace-nowrap ${
                tab === 'register' ? 'bg-white text-[#0B3B2D] shadow-xs' : 'text-slate-600 hover:text-[#0B3B2D]'
              }`}
            >
              Register Patient
            </button>
            <button
              type="button"
              onClick={() => {
                setTab('google');
                setAuthError(null);
              }}
              className={`flex-1 sm:flex-initial px-4 py-2 text-xs font-semibold rounded-lg transition-colors whitespace-nowrap ${
                tab === 'google' ? 'bg-white text-[#0B3B2D] shadow-xs' : 'text-slate-600 hover:text-[#0B3B2D]'
              }`}
            >
              Google Sign-In (Firebase)
            </button>
          </div>
        </div>

        <div className="p-6">
          {authError && (
            <div className="mb-4 p-3 rounded-xl bg-red-50 border border-red-200 text-xs text-red-700">
              {authError}
            </div>
          )}

          {tab === 'demo' && (
            <div className="space-y-4">
              <p className="text-xs text-slate-600">
                Select any role below to test complete live workflows. Open KAIROS in a second browser tab under a different role (e.g., Referring Doctor + Receiving Hospital) to watch real-time emergency coordination synchronize automatically.
              </p>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                {ROLE_CARDS.map((item) => {
                  const Icon = item.icon;
                  return (
                    <button
                      key={item.role}
                      type="button"
                      onClick={() => handleDemoEnter(item.role)}
                      className="text-left p-4 rounded-xl border border-[#D5E7DD] bg-[#FAFDFB] hover:border-[#119655] hover:bg-[#EFF8F3] transition-colors group"
                    >
                      <div className="flex items-center gap-2.5">
                        <div className="w-8 h-8 rounded-lg bg-[#0B3B2D] text-white flex items-center justify-center group-hover:bg-[#119655] transition-colors shrink-0">
                          <Icon className="w-4 h-4" />
                        </div>
                        <div className="min-w-0">
                          <p className="text-sm font-bold text-[#0B3B2D] truncate">{item.label}</p>
                          <p className="text-[11px] text-[#119655] font-medium truncate">{item.actor}</p>
                        </div>
                      </div>
                      <p className="text-xs text-slate-600 mt-2.5 leading-relaxed">{item.desc}</p>
                    </button>
                  );
                })}
              </div>
            </div>
          )}

          {tab === 'register' && (
            <form onSubmit={handleRegisterSubmit} className="space-y-4">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
                <div>
                  <label htmlFor="reg-name" className="block text-xs font-semibold text-[#0B3B2D] mb-1">
                    Full Name *
                  </label>
                  <input
                    id="reg-name"
                    type="text"
                    required
                    value={displayName}
                    onChange={(e) => setDisplayName(e.target.value)}
                    placeholder="e.g., Rajeshwari Kulkarni"
                    className="w-full rounded-xl border border-[#CFE3D8] px-3.5 py-2 text-sm text-[#0B3B2D] focus:outline-none focus:ring-2 focus:ring-[#119655]"
                  />
                </div>
                <div>
                  <label htmlFor="reg-email" className="block text-xs font-semibold text-[#0B3B2D] mb-1">
                    Email Address *
                  </label>
                  <input
                    id="reg-email"
                    type="email"
                    required
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="patient@example.com"
                    className="w-full rounded-xl border border-[#CFE3D8] px-3.5 py-2 text-sm text-[#0B3B2D] focus:outline-none focus:ring-2 focus:ring-[#119655]"
                  />
                </div>
                <div>
                  <label htmlFor="reg-phone" className="block text-xs font-semibold text-[#0B3B2D] mb-1">
                    Mobile Number (for SMS Alerts) *
                  </label>
                  <input
                    id="reg-phone"
                    type="tel"
                    required
                    value={phone}
                    onChange={(e) => setPhone(e.target.value)}
                    placeholder="+91 98450 XXXXX"
                    className="w-full rounded-xl border border-[#CFE3D8] px-3.5 py-2 text-sm text-[#0B3B2D] focus:outline-none focus:ring-2 focus:ring-[#119655]"
                  />
                </div>
                <div>
                  <label htmlFor="reg-blood" className="block text-xs font-semibold text-[#0B3B2D] mb-1">
                    Blood Group
                  </label>
                  <select
                    id="reg-blood"
                    value={bloodGroup}
                    onChange={(e) => setBloodGroup(e.target.value)}
                    className="w-full rounded-xl border border-[#CFE3D8] px-3.5 py-2 text-sm text-[#0B3B2D] focus:outline-none focus:ring-2 focus:ring-[#119655]"
                  >
                    {['O+', 'O-', 'A+', 'A-', 'B+', 'B-', 'AB+', 'AB-'].map((bg) => (
                      <option key={bg} value={bg}>{bg}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label htmlFor="reg-allergies" className="block text-xs font-semibold text-[#0B3B2D] mb-1">
                    Known Allergies
                  </label>
                  <input
                    id="reg-allergies"
                    type="text"
                    value={allergies}
                    onChange={(e) => setAllergies(e.target.value)}
                    placeholder="e.g., Sulfa drugs, Penicillin, or None"
                    className="w-full rounded-xl border border-[#CFE3D8] px-3.5 py-2 text-sm text-[#0B3B2D] focus:outline-none focus:ring-2 focus:ring-[#119655]"
                  />
                </div>
                <div>
                  <label htmlFor="reg-abha" className="block text-xs font-semibold text-[#0B3B2D] mb-1">
                    ABHA Number (Optional · Ready Format)
                  </label>
                  <input
                    id="reg-abha"
                    type="text"
                    value={abhaId}
                    onChange={(e) => setAbhaId(e.target.value)}
                    placeholder="XX-XXXX-XXXX-XXXX"
                    className="w-full rounded-xl border border-[#CFE3D8] px-3.5 py-2 text-sm text-[#0B3B2D] focus:outline-none focus:ring-2 focus:ring-[#119655]"
                  />
                </div>
              </div>

              <div>
                <label htmlFor="reg-emg" className="block text-xs font-semibold text-[#0B3B2D] mb-1">
                  Emergency Contact
                </label>
                <input
                  id="reg-emg"
                  type="text"
                  value={emergencyContact}
                  onChange={(e) => setEmergencyContact(e.target.value)}
                  placeholder="Name and phone number"
                  className="w-full rounded-xl border border-[#CFE3D8] px-3.5 py-2 text-sm text-[#0B3B2D] focus:outline-none focus:ring-2 focus:ring-[#119655]"
                />
              </div>

              <label className="flex items-start gap-2.5 p-3.5 rounded-xl bg-[#F4FAF6] border border-[#DCECE3] cursor-pointer">
                <input
                  type="checkbox"
                  checked={consentGranted}
                  onChange={(e) => setConsentGranted(e.target.checked)}
                  className="mt-0.5 rounded border-slate-300 text-[#119655] focus:ring-[#119655]"
                />
                <span className="text-xs text-slate-700 leading-relaxed">
                  <strong>DPDP Consent:</strong> I consent to KAIROS sharing my appointment, diagnostic, and emergency vitals data solely with authorized clinicians and hospitals involved in my care. Consent can be revoked anytime in my profile.
                </span>
              </label>

              <button
                type="submit"
                className="w-full inline-flex items-center justify-center gap-2 py-2.5 px-5 rounded-xl bg-[#119655] text-white text-sm font-semibold hover:bg-[#0D7A44] transition-colors"
              >
                <UserPlus className="w-4 h-4" />
                Create Patient Account & Open Dashboard
              </button>
            </form>
          )}

          {tab === 'google' && (
            <div className="space-y-4">
              <div className="p-4 rounded-xl bg-[#F4FAF6] border border-[#DCECE3] space-y-2">
                <div className="flex items-center gap-2 text-sm font-semibold text-[#0B3B2D]">
                  <Activity className="w-4 h-4 text-[#119655]" />
                  Live Firebase Auth + Cloud Firestore Sync
                </div>
                <p className="text-xs text-slate-600 leading-relaxed">
                  Authenticate with your Google account via Firebase Authentication. Your patient profile, DPDP consent, OPD bookings, and diagnostic bookings will persist directly to Cloud Firestore under strict security rules.
                </p>
              </div>

              <div>
                <label htmlFor="google-role-select" className="block text-xs font-semibold text-[#0B3B2D] mb-1.5">
                  Select Workspace View After Sign-In
                </label>
                <select
                  id="google-role-select"
                  value={googleRole}
                  onChange={(e) => setGoogleRole(e.target.value as UserRole)}
                  className="w-full rounded-xl border border-[#CFE3D8] px-3.5 py-2.5 text-sm text-[#0B3B2D] focus:outline-none focus:ring-2 focus:ring-[#119655]"
                >
                  <option value="patient">Patient Portal</option>
                  <option value="doctor">Referring Doctor Portal</option>
                  <option value="hospital">Receiving Hospital Portal</option>
                  <option value="ambulance">Ambulance Team Portal</option>
                  <option value="diagnostic">Diagnostic Centre Portal</option>
                  <option value="admin">Administrator Portal</option>
                </select>
              </div>

              <button
                type="button"
                onClick={handleGoogleSignIn}
                disabled={googleLoading}
                className="w-full inline-flex items-center justify-center gap-2.5 py-3 px-5 rounded-xl bg-[#0B3B2D] text-white text-sm font-semibold hover:bg-[#07291F] disabled:opacity-60 transition-colors"
              >
                <LogIn className="w-4 h-4" />
                {googleLoading ? 'Opening Google Sign-In...' : 'Continue with Google'}
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
