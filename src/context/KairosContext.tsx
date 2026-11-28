import React, { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { onAuthStateChanged, type User as FirebaseUser } from 'firebase/auth';
import {
  auth,
  clearPendingAuthContext,
  consumeGoogleRedirectResult,
  readPendingAuthContext,
  registerWithEmail,
  savePendingAuthContext,
  signInWithEmail,
  signInWithGoogle,
  signOutFirebase,
  syncAppointmentToFirestore,
  syncDiagnosticBookingToFirestore,
  syncReferralAuditToFirestore,
  syncUserProfileToFirestore,
} from '../firebase';
import { matchDummyCredentials, type DummyCredentials } from '../utils/demoCredentials';
import type {
  AmbulanceStage,
  AppointmentStatus,
  AuditLogEntry,
  DiagnosticBooking,
  DiagnosticBookingStatus,
  DiagnosticCentre,
  EmergencyReferral,
  HospitalFacility,
  KairosNotification,
  OpdAppointment,
  ReferralUrgency,
  SpecialistDoctor,
  UserProfile,
  UserRole,
  VitalSigns,
  MedBridgeAccount,
  MedBridgeCreditCategory,
  MedBridgeCreditTransaction,
} from '../types/kairos';
import {
  createBedHold,
  enqueueOfflineReferral,
  evaluateBedHoldState,
  mergeSyncedReferrals,
  recalculateOpdQueue,
} from '../utils/kairosEngine';

import {
  DEFAULT_AUDIT_LOGS,
  DEFAULT_APPOINTMENTS,
  DEFAULT_DIAGNOSTIC_BOOKINGS,
  DEFAULT_DIAGNOSTIC_CENTRES,
  DEFAULT_HOSPITALS,
  DEFAULT_NOTIFICATIONS,
  DEFAULT_REFERRALS,
  DEFAULT_REGISTERED_USERS,
  DEFAULT_SPECIALISTS,
  DEFAULT_MEDBRIDGE_ACCOUNTS,
} from '../data/defaultPlatformData';

const STORAGE_KEY = 'kairos_platform_state_v2';
const PROFILE_STORAGE_PREFIX = 'kairos_user_profile_v2_';
const CHANNEL_NAME = 'kairos-live-sync-v2';

interface PersistedState {
  hospitals: HospitalFacility[];
  specialists: SpecialistDoctor[];
  appointments: OpdAppointment[];
  referrals: EmergencyReferral[];
  offlineReferralQueue: EmergencyReferral[];
  diagnosticCentres: DiagnosticCentre[];
  diagnosticBookings: DiagnosticBooking[];
  notifications: KairosNotification[];
  auditLogs: AuditLogEntry[];
  registeredUsers: UserProfile[];
  medbridgeAccounts: Record<string, MedBridgeAccount>;
}

export const INITIAL_PLATFORM_STATE: PersistedState = {
  hospitals: DEFAULT_HOSPITALS,
  specialists: DEFAULT_SPECIALISTS,
  appointments: DEFAULT_APPOINTMENTS,
  referrals: DEFAULT_REFERRALS,
  offlineReferralQueue: [],
  diagnosticCentres: DEFAULT_DIAGNOSTIC_CENTRES,
  diagnosticBookings: DEFAULT_DIAGNOSTIC_BOOKINGS,
  notifications: DEFAULT_NOTIFICATIONS,
  auditLogs: DEFAULT_AUDIT_LOGS,
  registeredUsers: DEFAULT_REGISTERED_USERS,
  medbridgeAccounts: DEFAULT_MEDBRIDGE_ACCOUNTS,
};

function loadInitialState(): PersistedState {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw) as Partial<PersistedState>;
      return {
        hospitals:
          Array.isArray(parsed.hospitals) && parsed.hospitals.length > 0
            ? parsed.hospitals
            : DEFAULT_HOSPITALS,
        specialists:
          Array.isArray(parsed.specialists) && parsed.specialists.length > 0
            ? parsed.specialists
            : DEFAULT_SPECIALISTS,
        appointments:
          Array.isArray(parsed.appointments) && parsed.appointments.length > 0
            ? parsed.appointments
            : DEFAULT_APPOINTMENTS,
        referrals:
          Array.isArray(parsed.referrals) && parsed.referrals.length > 0
            ? parsed.referrals
            : DEFAULT_REFERRALS,
        offlineReferralQueue: Array.isArray(parsed.offlineReferralQueue)
          ? parsed.offlineReferralQueue
          : [],
        diagnosticCentres:
          Array.isArray(parsed.diagnosticCentres) && parsed.diagnosticCentres.length > 0
            ? parsed.diagnosticCentres
            : DEFAULT_DIAGNOSTIC_CENTRES,
        diagnosticBookings:
          Array.isArray(parsed.diagnosticBookings) && parsed.diagnosticBookings.length > 0
            ? parsed.diagnosticBookings
            : DEFAULT_DIAGNOSTIC_BOOKINGS,
        notifications:
          Array.isArray(parsed.notifications) && parsed.notifications.length > 0
            ? parsed.notifications
            : DEFAULT_NOTIFICATIONS,
        auditLogs:
          Array.isArray(parsed.auditLogs) && parsed.auditLogs.length > 0
            ? parsed.auditLogs
            : DEFAULT_AUDIT_LOGS,
        registeredUsers: (() => {
          const list =
            Array.isArray(parsed.registeredUsers) && parsed.registeredUsers.length > 0
              ? parsed.registeredUsers
              : DEFAULT_REGISTERED_USERS;
          if (!list.some((u) => u.email.toLowerCase() === 'karunyayashu6@gmail.com')) {
            return [
              {
                uid: 'admin-karunya',
                displayName: 'Karunya',
                email: 'karunyayashu6@gmail.com',
                role: 'admin' as UserRole,
                facilityName: 'State Health Command Operations',
                phone: '+91-98450-54321',
                consentGranted: true,
              },
              ...list,
            ];
          }
          return list;
        })(),
        medbridgeAccounts:
          parsed.medbridgeAccounts && Object.keys(parsed.medbridgeAccounts).length > 0
            ? parsed.medbridgeAccounts
            : DEFAULT_MEDBRIDGE_ACCOUNTS,
      };
    }
  } catch {
    // Fallback to initial default state
  }
  return INITIAL_PLATFORM_STATE;
}

function loadStoredProfile(uid: string): UserProfile | null {
  try {
    const raw = localStorage.getItem(`${PROFILE_STORAGE_PREFIX}${uid}`);
    if (!raw) return null;
    const profile = JSON.parse(raw) as UserProfile;
    if (profile.email && profile.email.toLowerCase() === 'karunyayashu6@gmail.com') {
      profile.role = 'admin';
      profile.displayName = 'Karunya';
    }
    return profile;
  } catch {
    return null;
  }
}

function saveStoredProfile(profile: UserProfile): void {
  try {
    localStorage.setItem(`${PROFILE_STORAGE_PREFIX}${profile.uid}`, JSON.stringify(profile));
  } catch {
    // Ignore storage quota warnings
  }
}

export interface BookAppointmentInput {
  hospitalId: string;
  department: string;
  doctorName: string;
  slotTime: string;
  consultationType: 'in-person' | 'remote';
  patientName?: string;
  channel?: 'QR' | 'WhatsApp' | 'ABHA' | 'SMS';
  attachedReportName?: string;
  ruralModeBooking?: boolean;
}

export interface CreateReferralInput {
  patientInitials: string;
  ageSex: string;
  category: string;
  urgency: ReferralUrgency;
  vitals: VitalSigns;
  symptoms: string;
  requiredFacilities: string[];
  requiredBedType: 'ICU' | 'General' | 'Peds';
  targetHospitalId: string;
  fallbackHospitalIds: string[];
  isbarSummary: string;
  attachedReportName?: string;
  clinicianInstructions?: string;
  manualOverrideActive?: boolean;
  manualOverrideReason?: string;
  saveOffline?: boolean;
}

export interface BookDiagnosticInput {
  centreId: string;
  testName: string;
  slotTime: string;
  priceInr: number;
  prescriptionNote?: string;
}

export interface AddHospitalInput {
  name: string;
  area: string;
  city: string;
  phone: string;
  departments: string[];
  facilities: string[];
  icuTotal: number;
  generalTotal: number;
  pedsTotal: number;
  lat?: number;
  lng?: number;
  distanceKm?: number;
}

export interface AddSpecialistInput {
  name: string;
  specialty: string;
  hospitalId: string;
  location: string;
  languages: string[];
  timings: string;
  consultationFeeInr: number;
  experienceYears: number;
  remoteAvailable: boolean;
  ruralFriendly: boolean;
}

export interface AddDiagnosticCentreInput {
  name: string;
  area: string;
  hours: string;
  distanceKm?: number;
}

export interface RegisterEmailAccountInput {
  displayName: string;
  email: string;
  password: string;
  role: UserRole;
  phone?: string;
  facilityName?: string;
  bloodGroup?: string;
  allergies?: string;
  emergencyContact?: string;
  abhaId?: string;
  consentGranted: boolean;
}

interface KairosContextValue {
  currentUser: UserProfile | null;
  firebaseUser: FirebaseUser | null;
  authReady: boolean;
  isOfflineSimulated: boolean;
  setOfflineSimulated: (offline: boolean) => void;
  nowMs: number;
  hospitals: HospitalFacility[];
  specialists: SpecialistDoctor[];
  appointments: OpdAppointment[];
  referrals: EmergencyReferral[];
  offlineReferralQueue: EmergencyReferral[];
  diagnosticCentres: DiagnosticCentre[];
  diagnosticBookings: DiagnosticBooking[];
  notifications: KairosNotification[];
  auditLogs: AuditLogEntry[];
  registeredUsers: UserProfile[];
  toastMessage: string | null;
  showToast: (msg: string) => void;
  // Auth & Profile
  authCallbackError: unknown | null;
  clearAuthCallbackError: () => void;
  redirectAuthenticatedRole: UserRole | null;
  consumeRedirectAuthenticatedRole: () => void;
  loginWithEmail: (email: string, password: string, selectedRole: UserRole) => Promise<void>;
  registerWithEmailAccount: (input: RegisterEmailAccountInput) => Promise<void>;
  loginWithGoogle: (selectedRole?: UserRole, facilityName?: string) => Promise<boolean>;
  loginWithDemoCredentials: (creds: DummyCredentials) => void;
  logout: () => Promise<void>;
  updateCurrentProfile: (patch: Partial<UserProfile>) => void;
  // Facility & Directory Registration
  addHospitalFacility: (input: AddHospitalInput) => HospitalFacility;
  addSpecialistDoctor: (input: AddSpecialistInput) => SpecialistDoctor | null;
  addDiagnosticCentre: (input: AddDiagnosticCentreInput) => DiagnosticCentre;
  // Smart OPD & Specialist Connect
  bookAppointment: (input: BookAppointmentInput) => OpdAppointment | null;
  checkInAppointmentByToken: (tokenOrId: string) => { ok: boolean; message: string };
  updateAppointmentStatus: (appointmentId: string, status: AppointmentStatus) => void;
  rescheduleAppointment: (appointmentId: string, newSlot: string) => void;
  cancelAppointment: (appointmentId: string) => void;
  applyDoctorDelay: (hospitalId: string, department: string, delayMin: number) => void;
  // Diagnostic Connect
  bookDiagnosticTest: (input: BookDiagnosticInput) => DiagnosticBooking | null;
  updateDiagnosticBooking: (
    bookingId: string,
    status: DiagnosticBookingStatus,
    reportSummary?: string
  ) => void;
  addDiagnosticTestToCentre: (
    centreId: string,
    test: { name: string; category: string; priceInr: number; turnaroundHours: number; fastingRequired: boolean }
  ) => void;
  // Emergency Hospital Coordination ("Accept Before You Move")
  createEmergencyReferral: (input: CreateReferralInput) => EmergencyReferral | null;
  syncOfflineReferralsNow: () => number;
  acceptReferral: (referralId: string, bedLabel: string, receivingDoctor: string) => void;
  declineReferral: (referralId: string, reason: string) => void;
  reconfirmBedHold: (referralId: string) => void;
  assignAmbulanceToReferral: (referralId: string, unitName?: string) => void;
  updateAmbulanceTransfer: (
    referralId: string,
    stage: AmbulanceStage,
    patch?: {
      vitals?: Partial<VitalSigns>;
      locationConsentGranted?: boolean;
      etaMin?: number;
      coords?: { lat: number; lng: number };
    }
  ) => void;
  confirmPatientArrival: (referralId: string) => void;
  // Hospital & Admin management
  updateHospitalCapacity: (
    hospitalId: string,
    patch: Partial<Pick<HospitalFacility, 'icuAvailable' | 'generalAvailable' | 'pedsAvailable' | 'acceptingEmergencies'>>
  ) => void;
  addHospitalDepartment: (hospitalId: string, department: string) => void;
  updateUserRoleByAdmin: (uid: string, role: UserRole) => void;
  broadcastNotification: (title: string, message: string, severity: KairosNotification['severity']) => void;
  markAllNotificationsRead: () => void;
  resetPlatformData: () => void;
  // MedBridge Credits USP Engine
  medbridgeAccounts: Record<string, MedBridgeAccount>;
  getMedbridgeAccount: (entityId: string, role: 'doctor' | 'hospital') => MedBridgeAccount;
  awardMedbridgeCredits: (
    entityId: string,
    role: 'doctor' | 'hospital',
    amount: number,
    reason: string,
    category: MedBridgeCreditCategory
  ) => void;
  redeemMedbridgeCredits: (
    entityId: string,
    role: 'doctor' | 'hospital',
    amount: number,
    reason: string,
    category: MedBridgeCreditCategory
  ) => boolean;
}

const KairosContext = createContext<KairosContextValue | null>(null);

export const KairosProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [state, setState] = useState<PersistedState>(() => loadInitialState());
  const [currentUser, setCurrentUser] = useState<UserProfile | null>(null);
  const [firebaseUser, setFirebaseUser] = useState<FirebaseUser | null>(null);
  const [authReady, setAuthReady] = useState(false);
  const [isOfflineSimulated, setOfflineSimulated] = useState(false);
  const [nowMs, setNowMs] = useState(() => Date.now());
  const [toastMessage, setToastMessage] = useState<string | null>(null);

  const [authCallbackError, setAuthCallbackError] = useState<unknown | null>(null);
  const [redirectAuthenticatedRole, setRedirectAuthenticatedRole] = useState<UserRole | null>(null);
  const channelRef = useRef<BroadcastChannel | null>(null);
  const toastTimerRef = useRef<number | null>(null);

  const clearAuthCallbackError = useCallback(() => setAuthCallbackError(null), []);
  const consumeRedirectAuthenticatedRole = useCallback(() => setRedirectAuthenticatedRole(null), []);

  const showToast = useCallback((msg: string) => {
    setToastMessage(msg);
    if (toastTimerRef.current) {
      window.clearTimeout(toastTimerRef.current);
    }
    toastTimerRef.current = window.setTimeout(() => {
      setToastMessage(null);
    }, 4200);
  }, []);

  const persistAndBroadcast = useCallback((next: PersistedState) => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
      channelRef.current?.postMessage({ type: 'STATE_SYNC', payload: next });
    } catch {
      // Ignore storage quota warnings
    }
  }, []);

  const updateState = useCallback(
    (updater: (prev: PersistedState) => PersistedState) => {
      setState((prev) => {
        const next = updater(prev);
        persistAndBroadcast(next);
        return next;
      });
    },
    [persistAndBroadcast]
  );

  // Cross-tab real-time sync
  useEffect(() => {
    if (typeof BroadcastChannel === 'undefined') return;
    const ch = new BroadcastChannel(CHANNEL_NAME);
    channelRef.current = ch;
    ch.onmessage = (event) => {
      if (event.data?.type === 'STATE_SYNC' && event.data?.payload) {
        setState(event.data.payload as PersistedState);
      }
    };
    return () => {
      ch.close();
      channelRef.current = null;
    };
  }, []);

  const appendAudit = (
    prev: PersistedState,
    action: string,
    entityType: AuditLogEntry['entityType'],
    entityId: string,
    summary: string,
    actor?: UserProfile | null
  ): AuditLogEntry[] => {
    const who = actor ?? currentUser;
    const entry: AuditLogEntry = {
      logId: `aud-${Date.now()}-${Math.floor(Math.random() * 900 + 100)}`,
      actorUid: who?.uid ?? 'system',
      actorName: who?.displayName ?? 'KAIROS System',
      actorRole: who?.role ?? 'admin',
      action,
      entityType,
      entityId,
      summary,
      createdAt: new Date().toISOString(),
    };
    return [entry, ...prev.auditLogs].slice(0, 100);
  };

  const prependNotification = (
    list: KairosNotification[],
    item: KairosNotification
  ): KairosNotification[] => [item, ...list].slice(0, 40);

  const upsertRegisteredUser = useCallback(
    (profile: UserProfile, action: string, summary: string) => {
      updateState((prev) => {
        const exists = prev.registeredUsers.some((u) => u.uid === profile.uid);
        const nextUsers = exists
          ? prev.registeredUsers.map((u) => (u.uid === profile.uid ? profile : u))
          : [profile, ...prev.registeredUsers];
        return {
          ...prev,
          registeredUsers: nextUsers,
          auditLogs: appendAudit(prev, action, 'user', profile.uid, summary, profile),
        };
      });
    },
    [updateState]
  );

  // Firebase Auth listener + OAuth redirect callback handler
  useEffect(() => {
    let active = true;

    const hydrateProfile = (fbUser: FirebaseUser): UserProfile => {
      const pending = readPendingAuthContext();
      const stored = loadStoredProfile(fbUser.uid);
      const email = fbUser.email?.trim().toLowerCase() || stored?.email?.toLowerCase() || '';
      const isKarunya = email === 'karunyayashu6@gmail.com';
      const role: UserRole = isKarunya ? 'admin' : (pending?.role ?? stored?.role ?? 'patient');
      const mapped: UserProfile = {
        uid: fbUser.uid,
        displayName:
          isKarunya
            ? 'Karunya'
            : (pending?.displayName ||
              stored?.displayName ||
              fbUser.displayName ||
              fbUser.email?.split('@')[0] ||
              'KAIROS User'),
        email: fbUser.email || stored?.email || '',
        role,
        phone: pending?.phone ?? stored?.phone ?? (isKarunya ? '+91-98450-54321' : undefined),
        facilityId: stored?.facilityId,
        facilityName:
          isKarunya
            ? 'State Health Command Operations'
            : (pending?.facilityName ?? stored?.facilityName),
        bloodGroup: stored?.bloodGroup,
        allergies: stored?.allergies,
        emergencyContact: stored?.emergencyContact,
        abhaId: stored?.abhaId,
        consentGranted: pending?.consentGranted ?? stored?.consentGranted ?? true,
      };
      return mapped;
    };

    // Process returning OAuth redirect callback only if one was explicitly initiated
    const initialPending = readPendingAuthContext();
    if (initialPending?.isRedirect) {
      void consumeGoogleRedirectResult()
        .then((redirectUser) => {
          if (!active || !redirectUser) return;
          const pending = readPendingAuthContext();
          const profile = hydrateProfile(redirectUser);
          saveStoredProfile(profile);
          clearPendingAuthContext();
          setCurrentUser(profile);
          upsertRegisteredUser(
            profile,
            'GOOGLE_SIGN_IN',
            `${profile.displayName} signed in to ${profile.role} portal via Google.`
          );
          setRedirectAuthenticatedRole(pending?.role ?? profile.role);
          syncUserProfileToFirestore(profile).catch((err) => {
            console.error('Firestore profile sync warning after redirect:', err);
          });
          showToast(`Signed in with Google as ${profile.displayName}`);
        })
        .catch((err) => {
          if (!active) return;
          clearPendingAuthContext();
          console.error('Firebase OAuth redirect callback error:', err);
          setAuthCallbackError(err);
        });
    }

    const unsub = onAuthStateChanged(auth, (fbUser) => {
      if (!active) return;
      setFirebaseUser(fbUser);
      setAuthReady(true);
      if (fbUser) {
        const pending = readPendingAuthContext();
        const mapped = hydrateProfile(fbUser);
        setCurrentUser(mapped);
        if (pending?.isRedirect) {
          saveStoredProfile(mapped);
          clearPendingAuthContext();
          setRedirectAuthenticatedRole(pending.role);
        }
      } else {
        setCurrentUser((prev) => {
          if (prev && prev.uid.startsWith('demo-')) {
            return prev;
          }
          try {
            const rawDemo = window.sessionStorage.getItem('kairos_demo_session_v1');
            if (rawDemo) {
              return JSON.parse(rawDemo) as UserProfile;
            }
          } catch {
            // Ignore sessionStorage read failures
          }
          return null;
        });
      }
    });

    return () => {
      active = false;
      unsub();
    };
  }, [showToast, upsertRegisteredUser]);

  // Live 1-second timer for bed-hold countdowns, auto-release on expiry, & response SLA escalations
  useEffect(() => {
    const interval = window.setInterval(() => {
      const tickNow = Date.now();
      setNowMs(tickNow);

      setState((prev) => {
        if (prev.referrals.length === 0) return prev;
        let changed = false;
        let nextHospitals = prev.hospitals;
        const nextNotifications = [...prev.notifications];

        const nextReferrals = prev.referrals.map((ref) => {
          if (ref.bedHold && (ref.bedHold.status === 'held' || ref.bedHold.status === 'expiring_soon')) {
            const evalRes = evaluateBedHoldState(ref.bedHold, tickNow, 120);
            if (evalRes.status !== ref.bedHold.status) {
              changed = true;
              if (evalRes.status === 'expired') {
                nextHospitals = nextHospitals.map((h) => {
                  if (h.hospitalId !== ref.bedHold?.hospitalId) return h;
                  if (ref.bedHold.bedType === 'ICU') {
                    return { ...h, icuAvailable: Math.min(h.icuTotal, h.icuAvailable + 1) };
                  }
                  if (ref.bedHold.bedType === 'Peds') {
                    return { ...h, pedsAvailable: Math.min(h.pedsTotal, h.pedsAvailable + 1) };
                  }
                  return { ...h, generalAvailable: Math.min(h.generalTotal, h.generalAvailable + 1) };
                });
                nextNotifications.unshift({
                  id: `notif-exp-${ref.referralId}-${tickNow}`,
                  title: `Bed Hold Expired · ${ref.bedHold.bedLabel}`,
                  message: `Temporary reservation for ${ref.referralId} expired without reconfirmation and was released back to ${ref.bedHold.hospitalName}.`,
                  channel: 'In-App',
                  targetRoles: ['hospital', 'doctor', 'admin'],
                  severity: 'warning',
                  read: false,
                  createdAt: new Date(tickNow).toISOString(),
                });
              } else if (evalRes.status === 'expiring_soon') {
                nextNotifications.unshift({
                  id: `notif-warn-${ref.referralId}-${tickNow}`,
                  title: `Reconfirm Bed Hold · ${ref.bedHold.bedLabel}`,
                  message: `Hold for ${ref.referralId} expires in under 2 minutes. Reconfirm or mark arrived.`,
                  channel: 'In-App',
                  targetRoles: ['hospital'],
                  severity: 'warning',
                  read: false,
                  createdAt: new Date(tickNow).toISOString(),
                });
              }
              return {
                ...ref,
                bedHold: { ...ref.bedHold, status: evalRes.status },
              };
            }
          }

          if (ref.status === 'pending' && ref.fallbackHospitalIds.length > 0) {
            const deadlineMs = Date.parse(ref.responseDeadlineAt);
            if (Number.isFinite(deadlineMs) && tickNow > deadlineMs) {
              const nextTargetId = ref.fallbackHospitalIds[0];
              const nextTarget = nextHospitals.find((h) => h.hospitalId === nextTargetId);
              if (nextTarget) {
                changed = true;
                nextNotifications.unshift({
                  id: `notif-esc-${ref.referralId}-${tickNow}`,
                  title: `Auto-Escalated · ${ref.referralId}`,
                  message: `Response timer expired at ${ref.targetHospitalName}. Escalated automatically to ${nextTarget.name}.`,
                  channel: 'SMS Ready',
                  targetRoles: ['doctor', 'hospital', 'admin'],
                  severity: 'critical',
                  read: false,
                  createdAt: new Date(tickNow).toISOString(),
                });
                return {
                  ...ref,
                  targetHospitalId: nextTarget.hospitalId,
                  targetHospitalName: nextTarget.name,
                  fallbackHospitalIds: ref.fallbackHospitalIds.slice(1),
                  status: 'escalated' as const,
                  responseDeadlineAt: new Date(tickNow + 5 * 60_000).toISOString(),
                  updatedAt: new Date(tickNow).toISOString(),
                };
              }
            }
          }

          return ref;
        });

        if (!changed) return prev;
        const next: PersistedState = {
          ...prev,
          hospitals: nextHospitals,
          referrals: nextReferrals,
          notifications: nextNotifications.slice(0, 40),
        };
        persistAndBroadcast(next);
        return next;
      });
    }, 1000);

    return () => window.clearInterval(interval);
  }, [persistAndBroadcast]);

  const loginWithDemoCredentials = useCallback(
    (creds: DummyCredentials) => {
      setAuthCallbackError(null);
      clearPendingAuthContext();
      const isKarunya = creds.email.toLowerCase() === 'karunyayashu6@gmail.com';
      const profile: UserProfile = {
        uid: isKarunya ? 'admin-karunya' : `demo-${creds.role}`,
        displayName: isKarunya ? 'Karunya' : creds.displayName,
        email: creds.email,
        role: isKarunya ? 'admin' : creds.role,
        phone: creds.phone,
        facilityName: creds.facilityName,
        bloodGroup: creds.bloodGroup,
        consentGranted: true,
      };
      saveStoredProfile(profile);
      try {
        window.sessionStorage.setItem('kairos_demo_session_v1', JSON.stringify(profile));
      } catch {
        // Ignore sessionStorage quota issues
      }
      setCurrentUser(profile);
      upsertRegisteredUser(
        profile,
        'DEMO_SIGN_IN',
        `${profile.displayName} entered ${profile.role} portal via Demo Login.`
      );
      showToast(`Demo session started · ${profile.displayName}`);
    },
    [showToast, upsertRegisteredUser]
  );

  const loginWithEmail = useCallback(
    async (email: string, password: string, selectedRole: UserRole) => {
      const matchedDemo = matchDummyCredentials(email, password, selectedRole);
      if (matchedDemo) {
        loginWithDemoCredentials(matchedDemo);
        return;
      }
      setAuthCallbackError(null);
      savePendingAuthContext({ role: selectedRole, isRedirect: false });
      try {
        const fbUser = await signInWithEmail(email, password);
        const existing = loadStoredProfile(fbUser.uid);
        const emailTrimmed = email.trim();
        const isKarunya = emailTrimmed.toLowerCase() === 'karunyayashu6@gmail.com';
        const effectiveRole: UserRole = isKarunya ? 'admin' : selectedRole;
        const profile: UserProfile = {
          uid: fbUser.uid,
          displayName: isKarunya
            ? 'Karunya'
            : (existing?.displayName || fbUser.displayName || fbUser.email?.split('@')[0] || 'KAIROS User'),
          email: fbUser.email || emailTrimmed,
          role: effectiveRole,
          phone: existing?.phone ?? (isKarunya ? '+91-98450-54321' : undefined),
          facilityId: existing?.facilityId,
          facilityName: isKarunya ? 'State Health Command Operations' : existing?.facilityName,
          bloodGroup: existing?.bloodGroup,
          allergies: existing?.allergies,
          emergencyContact: existing?.emergencyContact,
          abhaId: existing?.abhaId,
          consentGranted: existing?.consentGranted ?? true,
        };
        saveStoredProfile(profile);
        clearPendingAuthContext();
        setCurrentUser(profile);
        upsertRegisteredUser(
          profile,
          'USER_SIGNED_IN',
          `${profile.displayName} signed in to ${profile.role} portal via Email & Password.`
        );
        syncUserProfileToFirestore(profile).catch(() => {
          // Firestore sync runs when email is verified
        });
        showToast(`Signed in as ${profile.displayName}`);
      } catch (err) {
        clearPendingAuthContext();
        throw err;
      }
    },
    [loginWithDemoCredentials, showToast, upsertRegisteredUser]
  );

  const registerWithEmailAccount = useCallback(
    async (input: RegisterEmailAccountInput) => {
      setAuthCallbackError(null);
      savePendingAuthContext({
        role: input.role,
        displayName: input.displayName.trim(),
        phone: input.phone?.trim() || undefined,
        facilityName: input.facilityName?.trim() || undefined,
        consentGranted: input.consentGranted,
        isRedirect: false,
      });
      try {
        const fbUser = await registerWithEmail(input.email, input.password, input.displayName);
        const emailTrimmed = input.email.trim();
        const isKarunya = emailTrimmed.toLowerCase() === 'karunyayashu6@gmail.com';
        const profile: UserProfile = {
          uid: fbUser.uid,
          displayName: isKarunya ? 'Karunya' : input.displayName.trim(),
          email: fbUser.email || emailTrimmed,
          role: isKarunya ? 'admin' : input.role,
          phone: input.phone?.trim() || (isKarunya ? '+91-98450-54321' : undefined),
          facilityName: isKarunya ? 'State Health Command Operations' : (input.facilityName?.trim() || undefined),
          bloodGroup: input.bloodGroup,
          allergies: input.allergies?.trim() || undefined,
          emergencyContact: input.emergencyContact?.trim() || undefined,
          abhaId: input.abhaId?.trim() || undefined,
          consentGranted: input.consentGranted,
        };
        saveStoredProfile(profile);
        clearPendingAuthContext();
        setCurrentUser(profile);
        upsertRegisteredUser(
          profile,
          'ACCOUNT_REGISTERED',
          `Created ${profile.role} account for ${profile.displayName} with DPDP consent=${input.consentGranted}.`
        );
        syncUserProfileToFirestore(profile).catch(() => {
          // Firestore sync runs when email is verified
        });
        showToast(`Welcome, ${profile.displayName}. Your account is ready.`);
      } catch (err) {
        clearPendingAuthContext();
        throw err;
      }
    },
    [showToast, upsertRegisteredUser]
  );

  const loginWithGoogle = useCallback(
    async (selectedRole: UserRole = 'patient', facilityName?: string): Promise<boolean> => {
      setAuthCallbackError(null);
      const fbUser = await signInWithGoogle({
        role: selectedRole,
        facilityName: facilityName?.trim() || undefined,
      });
      const existing = loadStoredProfile(fbUser.uid);
      const emailLower = fbUser.email?.trim().toLowerCase() || '';
      const isKarunya = emailLower === 'karunyayashu6@gmail.com';
      const effectiveRole: UserRole = isKarunya ? 'admin' : selectedRole;
      const profile: UserProfile = {
        uid: fbUser.uid,
        displayName: isKarunya
          ? 'Karunya'
          : (fbUser.displayName || existing?.displayName || fbUser.email?.split('@')[0] || 'KAIROS User'),
        email: fbUser.email || '',
        role: effectiveRole,
        phone: existing?.phone ?? (isKarunya ? '+91-98450-54321' : undefined),
        facilityId: existing?.facilityId,
        facilityName: isKarunya ? 'State Health Command Operations' : (facilityName?.trim() || existing?.facilityName),
        bloodGroup: existing?.bloodGroup,
        allergies: existing?.allergies,
        emergencyContact: existing?.emergencyContact,
        abhaId: existing?.abhaId,
        consentGranted: existing?.consentGranted ?? true,
      };
      saveStoredProfile(profile);
      clearPendingAuthContext();
      setCurrentUser(profile);
      upsertRegisteredUser(
        profile,
        'GOOGLE_SIGN_IN',
        `${profile.displayName} signed in to ${profile.role} portal via Google.`
      );
      // Sync profile to Firestore in the background so sign-in enters the dashboard immediately
      syncUserProfileToFirestore(profile).catch((err) => {
        console.error('Firestore profile sync warning:', err);
      });
      showToast(`Signed in with Google as ${profile.displayName}`);
      return true;
    },
    [showToast, upsertRegisteredUser]
  );

  const logout = useCallback(async () => {
    try {
      window.sessionStorage.removeItem('kairos_demo_session_v1');
    } catch {
      // Ignore storage errors
    }
    setCurrentUser(null);
    if (auth.currentUser) {
      await signOutFirebase();
    }
    showToast('Signed out of KAIROS.');
  }, [showToast]);

  const updateCurrentProfile = useCallback(
    (patch: Partial<UserProfile>) => {
      setCurrentUser((prev) => {
        if (!prev) return prev;
        const updated = { ...prev, ...patch };
        saveStoredProfile(updated);
        updateState((s) => ({
          ...s,
          registeredUsers: s.registeredUsers.some((u) => u.uid === updated.uid)
            ? s.registeredUsers.map((u) => (u.uid === updated.uid ? updated : u))
            : [updated, ...s.registeredUsers],
          auditLogs: appendAudit(
            s,
            'PROFILE_UPDATED',
            'consent',
            updated.uid,
            `Updated profile & DPDP consent (${updated.consentGranted ? 'Active' : 'Revoked'}).`,
            updated
          ),
        }));
        if (firebaseUser) {
          syncUserProfileToFirestore(updated).catch((err) => console.error(err));
        }
        return updated;
      });
      showToast('Profile and consent preferences saved.');
    },
    [firebaseUser, showToast, updateState]
  );

  const addHospitalFacility = useCallback(
    (input: AddHospitalInput): HospitalFacility => {
      const nowIso = new Date().toISOString();
      const hospital: HospitalFacility = {
        hospitalId: `hosp-${Date.now().toString(36)}`,
        name: input.name.trim(),
        area: input.area.trim(),
        city: input.city.trim() || 'Bengaluru',
        lat: input.lat ?? 12.9716,
        lng: input.lng ?? 77.5946,
        distanceKm: input.distanceKm ?? 2.5,
        phone: input.phone.trim(),
        departments: input.departments.length > 0 ? input.departments : ['General Medicine', 'Emergency'],
        facilities: input.facilities.length > 0 ? input.facilities : ['ICU'],
        icuAvailable: Math.max(0, input.icuTotal),
        icuTotal: Math.max(0, input.icuTotal),
        generalAvailable: Math.max(0, input.generalTotal),
        generalTotal: Math.max(0, input.generalTotal),
        pedsAvailable: Math.max(0, input.pedsTotal),
        pedsTotal: Math.max(0, input.pedsTotal),
        acceptingEmergencies: true,
        lastVerifiedBy: currentUser?.displayName || 'Authorized Hospital Staff',
        lastVerifiedAt: nowIso,
        avgAcceptanceMin: 4.0,
      };

      updateState((prev) => ({
        ...prev,
        hospitals: [hospital, ...prev.hospitals],
        auditLogs: appendAudit(
          prev,
          'HOSPITAL_REGISTERED',
          'hospital',
          hospital.hospitalId,
          `Registered hospital ${hospital.name} (${hospital.area}, ${hospital.city}).`
        ),
      }));

      if (currentUser && currentUser.role === 'hospital' && !currentUser.facilityId) {
        const updatedProfile = {
          ...currentUser,
          facilityId: hospital.hospitalId,
          facilityName: hospital.name,
        };
        saveStoredProfile(updatedProfile);
        setCurrentUser(updatedProfile);
      }

      showToast(`Hospital "${hospital.name}" registered in KAIROS.`);
      return hospital;
    },
    [currentUser, showToast, updateState]
  );

  const addSpecialistDoctor = useCallback(
    (input: AddSpecialistInput): SpecialistDoctor | null => {
      const hospital = state.hospitals.find((h) => h.hospitalId === input.hospitalId);
      if (!hospital) {
        showToast('Please register a hospital before adding a specialist.');
        return null;
      }
      const specialist: SpecialistDoctor = {
        doctorId: `doc-${Date.now().toString(36)}`,
        name: input.name.trim(),
        specialty: input.specialty.trim(),
        hospitalId: hospital.hospitalId,
        hospitalName: hospital.name,
        location: input.location.trim() || `${hospital.area}, ${hospital.city}`,
        ruralFriendly: input.ruralFriendly,
        remoteAvailable: input.remoteAvailable,
        languages: input.languages.length > 0 ? input.languages : ['English'],
        timings: input.timings.trim() || '09:30 AM – 04:00 PM',
        nextSlot: 'Today · 11:00 AM',
        availableSlots: ['Today · 11:00 AM', 'Today · 12:30 PM', 'Today · 03:00 PM', 'Tomorrow · 10:00 AM'],
        consultationFeeInr: Math.max(0, input.consultationFeeInr),
        experienceYears: Math.max(1, input.experienceYears),
        availableToday: true,
      };
      updateState((prev) => ({
        ...prev,
        specialists: [specialist, ...prev.specialists],
        auditLogs: appendAudit(
          prev,
          'SPECIALIST_ADDED',
          'hospital',
          specialist.doctorId,
          `Added specialist ${specialist.name} (${specialist.specialty}) at ${hospital.name}.`
        ),
      }));
      showToast(`Added ${specialist.name} to specialist directory.`);
      return specialist;
    },
    [showToast, state.hospitals, updateState]
  );

  const addDiagnosticCentre = useCallback(
    (input: AddDiagnosticCentreInput): DiagnosticCentre => {
      const centre: DiagnosticCentre = {
        centreId: `diag-${Date.now().toString(36)}`,
        name: input.name.trim(),
        area: input.area.trim(),
        hours: input.hours.trim() || '07:00 AM – 08:00 PM',
        distanceKm: input.distanceKm ?? 2.0,
        verifiedPricing: true,
        slots: ['Today · 10:00 AM', 'Today · 11:30 AM', 'Today · 02:00 PM', 'Tomorrow · 08:30 AM'],
        tests: [],
      };
      updateState((prev) => ({
        ...prev,
        diagnosticCentres: [centre, ...prev.diagnosticCentres],
        auditLogs: appendAudit(
          prev,
          'DIAGNOSTIC_CENTRE_REGISTERED',
          'diagnostic',
          centre.centreId,
          `Registered diagnostic centre ${centre.name} (${centre.area}).`
        ),
      }));
      if (currentUser && currentUser.role === 'diagnostic' && !currentUser.facilityId) {
        const updatedProfile = {
          ...currentUser,
          facilityId: centre.centreId,
          facilityName: centre.name,
        };
        saveStoredProfile(updatedProfile);
        setCurrentUser(updatedProfile);
      }
      showToast(`Diagnostic centre "${centre.name}" registered.`);
      return centre;
    },
    [currentUser, showToast, updateState]
  );

  const bookAppointment = useCallback(
    (input: BookAppointmentInput): OpdAppointment | null => {
      const hospital =
        state.hospitals.find((h) => h.hospitalId === input.hospitalId) ?? state.hospitals[0];
      if (!hospital) {
        showToast('No registered hospitals available yet. Ask a hospital desk or admin to add a facility.');
        return null;
      }

      const existingDeptActive = state.appointments.filter(
        (a) =>
          a.hospitalId === hospital.hospitalId &&
          a.department === input.department &&
          a.status !== 'cancelled' &&
          a.status !== 'completed'
      );
      const nextNum = 101 + state.appointments.length;
      const prefix = input.department.charAt(0).toUpperCase() || 'A';
      const tokenNumber = `${prefix}-${nextNum}`;
      const queuePosition = existingDeptActive.length + 1;
      const nowIso = new Date().toISOString();

      const newAppt: OpdAppointment = {
        appointmentId: `apt-${Date.now()}`,
        ownerId: currentUser?.uid ?? 'guest',
        patientName: input.patientName?.trim() || currentUser?.displayName || 'Patient',
        hospitalId: hospital.hospitalId,
        hospitalName: hospital.name,
        department: input.department,
        doctorName: input.doctorName.trim() || 'Duty Clinician',
        slotTime: input.slotTime,
        tokenNumber,
        channel: input.channel ?? (input.ruralModeBooking ? 'SMS' : 'QR'),
        consultationType: input.consultationType,
        status: 'scheduled',
        queuePosition,
        estimatedWaitMin: Math.max(6, queuePosition * 6),
        delayMin: 0,
        attachedReportName: input.attachedReportName,
        ruralModeBooking: input.ruralModeBooking,
        createdAt: nowIso,
        updatedAt: nowIso,
      };

      updateState((prev) => ({
        ...prev,
        appointments: [newAppt, ...prev.appointments],
        notifications: prependNotification(prev.notifications, {
          id: `notif-apt-${Date.now()}`,
          title: `QR Token #${tokenNumber} Issued`,
          message: `${newAppt.consultationType === 'remote' ? 'Remote' : 'OPD'} booking confirmed with ${newAppt.doctorName} at ${newAppt.hospitalName} (${newAppt.slotTime}).`,
          channel: input.ruralModeBooking ? 'SMS Ready' : 'In-App',
          targetRoles: ['patient', 'hospital', 'doctor'],
          severity: 'success',
          read: false,
          createdAt: nowIso,
        }),
        auditLogs: appendAudit(
          prev,
          'OPD_APPOINTMENT_BOOKED',
          'appointment',
          newAppt.appointmentId,
          `Booked token #${tokenNumber} for ${newAppt.patientName} at ${newAppt.hospitalName} (${newAppt.department}).`
        ),
      }));

      if (firebaseUser) {
        syncAppointmentToFirestore(newAppt).catch((err) => console.error(err));
      }
      showToast(`Token #${tokenNumber} confirmed for ${newAppt.hospitalName}`);
      return newAppt;
    },
    [currentUser, firebaseUser, showToast, state.appointments, state.hospitals, updateState]
  );

  const checkInAppointmentByToken = useCallback(
    (tokenOrId: string): { ok: boolean; message: string } => {
      const normalized = tokenOrId.trim().toUpperCase();
      const target = state.appointments.find(
        (a) =>
          a.tokenNumber.toUpperCase() === normalized ||
          a.appointmentId.toUpperCase() === normalized
      );
      if (!target) {
        return { ok: false, message: `No appointment found for token "${tokenOrId}".` };
      }
      if (target.status === 'cancelled' || target.status === 'completed') {
        return { ok: false, message: `Token #${target.tokenNumber} is already ${target.status}.` };
      }

      const nowIso = new Date().toISOString();
      updateState((prev) => ({
        ...prev,
        appointments: prev.appointments.map((a) =>
          a.appointmentId === target.appointmentId
            ? { ...a, status: 'checked-in', updatedAt: nowIso }
            : a
        ),
        notifications: prependNotification(prev.notifications, {
          id: `notif-qr-${Date.now()}`,
          title: `QR Verified · Token #${target.tokenNumber}`,
          message: `${target.patientName} scanned QR at ${target.hospitalName} and joined the live ${target.department} queue.`,
          channel: 'In-App',
          targetRoles: ['patient', 'hospital'],
          severity: 'info',
          read: false,
          createdAt: nowIso,
        }),
        auditLogs: appendAudit(
          prev,
          'QR_CHECK_IN',
          'appointment',
          target.appointmentId,
          `QR token #${target.tokenNumber} scanned and checked into live OPD queue.`
        ),
      }));
      showToast(`QR verified: #${target.tokenNumber} joined the live queue.`);
      return { ok: true, message: `Token #${target.tokenNumber} checked into live queue.` };
    },
    [showToast, state.appointments, updateState]
  );

  const updateAppointmentStatus = useCallback(
    (appointmentId: string, status: AppointmentStatus) => {
      const nowIso = new Date().toISOString();
      updateState((prev) => {
        const target = prev.appointments.find((a) => a.appointmentId === appointmentId);
        const mapped = prev.appointments.map((a) =>
          a.appointmentId === appointmentId ? { ...a, status, updatedAt: nowIso } : a
        );
        const recalculated = target
          ? recalculateOpdQueue(mapped, target.hospitalId, target.department, target.delayMin).updated
          : mapped;
        return {
          ...prev,
          appointments: recalculated,
          auditLogs: appendAudit(
            prev,
            `OPD_STATUS_${status.toUpperCase()}`,
            'appointment',
            appointmentId,
            `Updated token #${target?.tokenNumber ?? appointmentId} status to ${status}.`
          ),
        };
      });
      showToast(`Queue status updated to ${status}.`);
    },
    [showToast, updateState]
  );

  const rescheduleAppointment = useCallback(
    (appointmentId: string, newSlot: string) => {
      const nowIso = new Date().toISOString();
      updateState((prev) => ({
        ...prev,
        appointments: prev.appointments.map((a) =>
          a.appointmentId === appointmentId ? { ...a, slotTime: newSlot, updatedAt: nowIso } : a
        ),
        auditLogs: appendAudit(
          prev,
          'OPD_RESCHEDULED',
          'appointment',
          appointmentId,
          `Rescheduled appointment ${appointmentId} to ${newSlot}.`
        ),
      }));
      showToast(`Appointment rescheduled to ${newSlot}.`);
    },
    [showToast, updateState]
  );

  const cancelAppointment = useCallback(
    (appointmentId: string) => {
      const nowIso = new Date().toISOString();
      updateState((prev) => {
        const target = prev.appointments.find((a) => a.appointmentId === appointmentId);
        const mapped = prev.appointments.map((a) =>
          a.appointmentId === appointmentId
            ? { ...a, status: 'cancelled' as const, queuePosition: 0, estimatedWaitMin: 0, updatedAt: nowIso }
            : a
        );
        const recalculated = target
          ? recalculateOpdQueue(mapped, target.hospitalId, target.department, target.delayMin).updated
          : mapped;
        return {
          ...prev,
          appointments: recalculated,
          auditLogs: appendAudit(
            prev,
            'OPD_CANCELLED',
            'appointment',
            appointmentId,
            `Cancelled appointment #${target?.tokenNumber ?? appointmentId}.`
          ),
        };
      });
      showToast('Appointment cancelled and queue recalculated.');
    },
    [showToast, updateState]
  );

  const applyDoctorDelay = useCallback(
    (hospitalId: string, department: string, delayMin: number) => {
      const nowIso = new Date().toISOString();
      updateState((prev) => {
        const { updated, affectedAppointmentIds } = recalculateOpdQueue(
          prev.appointments,
          hospitalId,
          department,
          delayMin
        );
        const hosp = prev.hospitals.find((h) => h.hospitalId === hospitalId);
        return {
          ...prev,
          appointments: updated,
          notifications: prependNotification(prev.notifications, {
            id: `notif-delay-${Date.now()}`,
            title: `Delay-Aware Queue Update (+${delayMin} min)`,
            message: `${department} at ${hosp?.name ?? 'Hospital'} updated by +${delayMin} min. ${affectedAppointmentIds.length} waiting patients re-estimated & alerted via WhatsApp/SMS template.`,
            channel: 'WhatsApp Ready',
            targetRoles: ['patient', 'hospital', 'admin'],
            severity: 'warning',
            read: false,
            createdAt: nowIso,
          }),
          auditLogs: appendAudit(
            prev,
            'QUEUE_DELAY_REESTIMATED',
            'hospital',
            hospitalId,
            `Applied +${delayMin} min delay to ${department}; recalculated ${affectedAppointmentIds.length} tokens.`
          ),
        };
      });
      showToast(`Delay (+${delayMin} min) applied — live queue wait times recalculated.`);
    },
    [showToast, updateState]
  );

  const bookDiagnosticTest = useCallback(
    (input: BookDiagnosticInput): DiagnosticBooking | null => {
      const centre =
        state.diagnosticCentres.find((c) => c.centreId === input.centreId) ?? state.diagnosticCentres[0];
      if (!centre) {
        showToast('No registered diagnostic centres available yet.');
        return null;
      }

      const nowIso = new Date().toISOString();
      const booking: DiagnosticBooking = {
        bookingId: `diag-bk-${Date.now().toString().slice(-5)}`,
        ownerId: currentUser?.uid ?? 'guest',
        patientName: currentUser?.displayName || 'Patient',
        centreId: centre.centreId,
        centreName: centre.name,
        testName: input.testName,
        slotTime: input.slotTime,
        priceInr: input.priceInr,
        prescriptionNote: input.prescriptionNote,
        status: 'requested',
        createdAt: nowIso,
        updatedAt: nowIso,
      };
      updateState((prev) => ({
        ...prev,
        diagnosticBookings: [booking, ...prev.diagnosticBookings],
        notifications: prependNotification(prev.notifications, {
          id: `notif-diag-${Date.now()}`,
          title: `Diagnostic Slot Requested`,
          message: `${booking.testName} at ${centre.name} (${booking.slotTime}) awaits centre confirmation.`,
          channel: 'In-App',
          targetRoles: ['patient', 'diagnostic', 'admin'],
          severity: 'info',
          read: false,
          createdAt: nowIso,
        }),
        auditLogs: appendAudit(
          prev,
          'DIAGNOSTIC_BOOKED',
          'diagnostic',
          booking.bookingId,
          `Booked ${booking.testName} at ${centre.name} for ₹${booking.priceInr}.`
        ),
      }));
      if (firebaseUser) {
        syncDiagnosticBookingToFirestore(booking).catch((err) => console.error(err));
      }
      showToast(`Booked ${booking.testName} at ${centre.name}`);
      return booking;
    },
    [currentUser, firebaseUser, showToast, state.diagnosticCentres, updateState]
  );

  const updateDiagnosticBooking = useCallback(
    (bookingId: string, status: DiagnosticBookingStatus, reportSummary?: string) => {
      const nowIso = new Date().toISOString();
      updateState((prev) => {
        const target = prev.diagnosticBookings.find((b) => b.bookingId === bookingId);
        return {
          ...prev,
          diagnosticBookings: prev.diagnosticBookings.map((b) =>
            b.bookingId === bookingId
              ? { ...b, status, reportSummary: reportSummary ?? b.reportSummary, updatedAt: nowIso }
              : b
          ),
          notifications: prependNotification(prev.notifications, {
            id: `notif-diag-upd-${Date.now()}`,
            title: `Diagnostic Status: ${status.replace('_', ' ').toUpperCase()}`,
            message: `${target?.testName ?? 'Lab test'} at ${target?.centreName ?? 'Centre'} is now ${status.replace('_', ' ')}.`,
            channel: 'SMS Ready',
            targetRoles: ['patient', 'diagnostic'],
            severity: status === 'report_ready' ? 'success' : status === 'rejected' ? 'warning' : 'info',
            read: false,
            createdAt: nowIso,
          }),
          auditLogs: appendAudit(
            prev,
            `DIAGNOSTIC_${status.toUpperCase()}`,
            'diagnostic',
            bookingId,
            `Updated diagnostic booking ${bookingId} to ${status}.`
          ),
        };
      });
      showToast(`Diagnostic booking updated to ${status.replace('_', ' ')}.`);
    },
    [showToast, updateState]
  );

  const addDiagnosticTestToCentre = useCallback(
    (
      centreId: string,
      test: { name: string; category: string; priceInr: number; turnaroundHours: number; fastingRequired: boolean }
    ) => {
      updateState((prev) => ({
        ...prev,
        diagnosticCentres: prev.diagnosticCentres.map((c) =>
          c.centreId === centreId
            ? {
                ...c,
                tests: [
                  ...c.tests,
                  {
                    testId: `t-${Date.now()}`,
                    ...test,
                  },
                ],
              }
            : c
        ),
      }));
      showToast(`Added "${test.name}" to diagnostic catalog.`);
    },
    [showToast, updateState]
  );

  const createEmergencyReferral = useCallback(
    (input: CreateReferralInput): EmergencyReferral | null => {
      const targetHospital =
        state.hospitals.find((h) => h.hospitalId === input.targetHospitalId) ?? state.hospitals[0];
      if (!targetHospital) {
        showToast('No receiving hospitals registered yet. Register a hospital first.');
        return null;
      }

      const nowIso = new Date().toISOString();
      const nextNum = 101 + state.referrals.length + state.offlineReferralQueue.length;
      const referralId = `REF-${nextNum}`;
      const dedupeKey = `${input.patientInitials.trim().toLowerCase()}-${input.category.toLowerCase()}-${targetHospital.hospitalId}-${Math.floor(Date.now() / 15000)}`;

      const shouldStoreOffline = Boolean(input.saveOffline || isOfflineSimulated);

      const newRef: EmergencyReferral = {
        referralId,
        clientDedupeKey: dedupeKey,
        referringDoctorId: currentUser?.uid ?? 'doctor',
        referringDoctorName: currentUser?.displayName || 'Referring Clinician',
        referringHospitalName: currentUser?.facilityName || 'Referring Clinic',
        targetHospitalId: targetHospital.hospitalId,
        targetHospitalName: targetHospital.name,
        fallbackHospitalIds: input.fallbackHospitalIds,
        patientInitials: input.patientInitials.trim(),
        ageSex: input.ageSex.trim(),
        category: input.category,
        urgency: input.urgency,
        status: input.manualOverrideActive ? 'in_transit' : 'pending',
        vitals: input.vitals,
        symptoms: input.symptoms.trim(),
        requiredFacilities: input.requiredFacilities,
        requiredBedType: input.requiredBedType,
        isbarSummary: input.isbarSummary.trim(),
        attachedReportName: input.attachedReportName,
        manualOverrideActive: input.manualOverrideActive,
        manualOverrideReason: input.manualOverrideReason,
        responseDeadlineAt: new Date(Date.now() + 5 * 60_000).toISOString(),
        ambulanceId: input.manualOverrideActive ? 'amb-unit-1' : undefined,
        ambulanceUnitName: input.manualOverrideActive ? 'Emergency Ambulance (Override Dispatch)' : undefined,
        ambulanceStatus: input.manualOverrideActive ? 'dispatched' : 'unassigned',
        ambulanceEtaMin: input.manualOverrideActive ? Math.max(4, Math.round(targetHospital.distanceKm * 2)) : undefined,
        ambulanceLocation: input.manualOverrideActive
          ? { lat: targetHospital.lat, lng: targetHospital.lng }
          : undefined,
        clinicianInstructions: input.clinicianInstructions,
        syncStatus: shouldStoreOffline ? 'pending_sync' : 'synced',
        createdAt: nowIso,
        updatedAt: nowIso,
      };

      if (shouldStoreOffline) {
        updateState((prev) => {
          const { queue, deduplicated } = enqueueOfflineReferral(prev.offlineReferralQueue, newRef);
          if (deduplicated) return prev;
          return {
            ...prev,
            offlineReferralQueue: queue,
            auditLogs: appendAudit(
              prev,
              'REFERRAL_QUEUED_OFFLINE',
              'referral',
              referralId,
              `Saved ${referralId} locally (NOT YET RECEIVED BY HOSPITAL) due to offline mode.`
            ),
          };
        });
        showToast(`${referralId} saved locally — pending sync (not yet received by hospital).`);
        return newRef;
      }

      updateState((prev) => ({
        ...prev,
        referrals: [newRef, ...prev.referrals],
        notifications: prependNotification(prev.notifications, {
          id: `notif-ref-${Date.now()}`,
          title: input.manualOverrideActive
            ? `EMERGENCY OVERRIDE DISPATCH · ${referralId}`
            : `Incoming ${input.urgency.toUpperCase()} Referral · ${referralId}`,
          message: `${newRef.category} (${newRef.patientInitials}) sent to ${targetHospital.name}. ${input.manualOverrideActive ? 'Clinician invoked manual safety override.' : '5-min acceptance timer started.'}`,
          channel: 'SMS Ready',
          targetRoles: ['hospital', 'doctor', 'ambulance', 'admin'],
          severity: 'critical',
          read: false,
          createdAt: nowIso,
        }),
        auditLogs: appendAudit(
          prev,
          input.manualOverrideActive ? 'EMERGENCY_MANUAL_OVERRIDE' : 'REFERRAL_SENT',
          'referral',
          referralId,
          `Structured ISBAR referral ${referralId} sent to ${targetHospital.name}.`
        ),
      }));

      if (firebaseUser) {
        syncReferralAuditToFirestore(newRef, currentUser?.role || 'doctor').catch((err) =>
          console.error(err)
        );
      }
      showToast(
        input.manualOverrideActive
          ? `${referralId} dispatched under Emergency Manual Override Protocol.`
          : `${referralId} sent to ${targetHospital.name}. Awaiting bed acceptance.`
      );
      return newRef;
    },
    [
      currentUser,
      firebaseUser,
      isOfflineSimulated,
      showToast,
      state.hospitals,
      state.offlineReferralQueue.length,
      state.referrals.length,
      updateState,
    ]
  );

  const syncOfflineReferralsNow = useCallback((): number => {
    let syncedCount = 0;
    const nowIso = new Date().toISOString();
    updateState((prev) => {
      if (prev.offlineReferralQueue.length === 0) return prev;
      const { merged, newlySyncedCount } = mergeSyncedReferrals(
        prev.referrals,
        prev.offlineReferralQueue
      );
      syncedCount = newlySyncedCount;
      return {
        ...prev,
        referrals: merged,
        offlineReferralQueue: [],
        notifications:
          newlySyncedCount > 0
            ? prependNotification(prev.notifications, {
                id: `notif-sync-${Date.now()}`,
                title: `${newlySyncedCount} Offline Referral${newlySyncedCount > 1 ? 's' : ''} Synchronised`,
                message: 'Store-and-forward queue synced cleanly with deduplication; receiving hospitals notified.',
                channel: 'In-App',
                targetRoles: ['doctor', 'hospital', 'admin'],
                severity: 'success',
                read: false,
                createdAt: nowIso,
              })
            : prev.notifications,
        auditLogs: appendAudit(
          prev,
          'OFFLINE_QUEUE_SYNCED',
          'referral',
          'offline-batch',
          `Synchronised ${newlySyncedCount} offline referrals with duplicate prevention.`
        ),
      };
    });
    setOfflineSimulated(false);
    showToast(
      syncedCount > 0
        ? `Synced ${syncedCount} queued referral(s) to receiving hospitals.`
        : 'All referrals are already synchronised.'
    );
    return syncedCount;
  }, [showToast, updateState]);

  const acceptReferral = useCallback(
    (referralId: string, bedLabel: string, receivingDoctor: string) => {
      const nowIso = new Date().toISOString();
      updateState((prev) => {
        const ref = prev.referrals.find((r) => r.referralId === referralId);
        if (!ref) return prev;
        const hold = createBedHold(
          ref.targetHospitalId,
          ref.targetHospitalName,
          bedLabel,
          ref.requiredBedType,
          receivingDoctor,
          900
        );

        const nextHospitals = prev.hospitals.map((h) => {
          if (h.hospitalId !== ref.targetHospitalId) return h;
          if (ref.requiredBedType === 'ICU') {
            return { ...h, icuAvailable: Math.max(0, h.icuAvailable - 1), lastVerifiedAt: nowIso, lastVerifiedBy: receivingDoctor };
          }
          if (ref.requiredBedType === 'Peds') {
            return { ...h, pedsAvailable: Math.max(0, h.pedsAvailable - 1), lastVerifiedAt: nowIso, lastVerifiedBy: receivingDoctor };
          }
          return { ...h, generalAvailable: Math.max(0, h.generalAvailable - 1), lastVerifiedAt: nowIso, lastVerifiedBy: receivingDoctor };
        });

        const nextReferrals = prev.referrals.map((r) =>
          r.referralId === referralId
            ? {
                ...r,
                status: 'accepted' as const,
                acceptedAt: nowIso,
                receivingDoctorName: receivingDoctor,
                bedHold: hold,
                ambulanceId: r.ambulanceId ?? 'amb-assigned',
                ambulanceUnitName: r.ambulanceUnitName ?? 'Assigned Ambulance Unit',
                ambulanceStatus: r.ambulanceStatus === 'unassigned' ? ('assigned' as const) : r.ambulanceStatus,
                ambulanceEtaMin: r.ambulanceEtaMin ?? 8,
                updatedAt: nowIso,
              }
            : r
        );

        return {
          ...prev,
          hospitals: nextHospitals,
          referrals: nextReferrals,
          notifications: prependNotification(prev.notifications, {
            id: `notif-acc-${Date.now()}`,
            title: `ACCEPTED · ${referralId} (${bedLabel} Held 15:00)`,
            message: `${receivingDoctor} at ${ref.targetHospitalName} confirmed ${bedLabel}. Ambulance cleared to move.`,
            channel: 'SMS Ready',
            targetRoles: ['doctor', 'hospital', 'ambulance', 'admin'],
            severity: 'success',
            read: false,
            createdAt: nowIso,
          }),
          auditLogs: appendAudit(
            prev,
            'REFERRAL_ACCEPTED_BED_HELD',
            'referral',
            referralId,
            `${receivingDoctor} accepted ${referralId} and placed time-limited hold on ${bedLabel} at ${ref.targetHospitalName}.`
          ),
        };
      });
      showToast(`Accepted ${referralId} — ${bedLabel} reserved on 15-min timer.`);
    },
    [showToast, updateState]
  );

  const declineReferral = useCallback(
    (referralId: string, reason: string) => {
      const nowIso = new Date().toISOString();
      updateState((prev) => {
        const ref = prev.referrals.find((r) => r.referralId === referralId);
        if (!ref) return prev;
        const nextFallbackId = ref.fallbackHospitalIds[0];
        const nextHospital = nextFallbackId
          ? prev.hospitals.find((h) => h.hospitalId === nextFallbackId)
          : undefined;

        const nextReferrals = prev.referrals.map((r) => {
          if (r.referralId !== referralId) return r;
          if (nextHospital) {
            return {
              ...r,
              targetHospitalId: nextHospital.hospitalId,
              targetHospitalName: nextHospital.name,
              fallbackHospitalIds: r.fallbackHospitalIds.slice(1),
              status: 'escalated' as const,
              declineReason: `Declined by ${r.targetHospitalName}: ${reason}`,
              responseDeadlineAt: new Date(Date.now() + 5 * 60_000).toISOString(),
              updatedAt: nowIso,
            };
          }
          return {
            ...r,
            status: 'declined' as const,
            declineReason: reason,
            updatedAt: nowIso,
          };
        });

        return {
          ...prev,
          referrals: nextReferrals,
          notifications: prependNotification(prev.notifications, {
            id: `notif-dec-${Date.now()}`,
            title: nextHospital
              ? `Declined & Auto-Escalated · ${referralId}`
              : `Referral Declined · ${referralId}`,
            message: nextHospital
              ? `${ref.targetHospitalName} declined (${reason}). Escalated immediately to ${nextHospital.name}.`
              : `${ref.targetHospitalName} declined ${referralId}: ${reason}.`,
            channel: 'SMS Ready',
            targetRoles: ['doctor', 'hospital', 'admin'],
            severity: 'warning',
            read: false,
            createdAt: nowIso,
          }),
          auditLogs: appendAudit(
            prev,
            nextHospital ? 'REFERRAL_DECLINED_ESCALATED' : 'REFERRAL_DECLINED',
            'referral',
            referralId,
            `Declined at ${ref.targetHospitalName} (${reason})${nextHospital ? ` -> escalated to ${nextHospital.name}` : ''}.`
          ),
        };
      });
      showToast(`Referral declined with clinical reason recorded.`);
    },
    [showToast, updateState]
  );

  const reconfirmBedHold = useCallback(
    (referralId: string) => {
      const nowIso = new Date().toISOString();
      updateState((prev) => ({
        ...prev,
        referrals: prev.referrals.map((r) => {
          if (r.referralId !== referralId || !r.bedHold) return r;
          return {
            ...r,
            bedHold: {
              ...r.bedHold,
              status: 'held',
              expiresAt: new Date(Date.now() + 10 * 60_000).toISOString(),
              reconfirmCount: r.bedHold.reconfirmCount + 1,
            },
            updatedAt: nowIso,
          };
        }),
        auditLogs: appendAudit(
          prev,
          'BED_HOLD_RECONFIRMED',
          'referral',
          referralId,
          `Extended temporary bed hold for ${referralId} by +10 minutes.`
        ),
      }));
      showToast('Bed reservation reconfirmed (+10 min).');
    },
    [showToast, updateState]
  );

  const assignAmbulanceToReferral = useCallback(
    (referralId: string, unitName = 'Assigned Ambulance Unit') => {
      const nowIso = new Date().toISOString();
      updateState((prev) => ({
        ...prev,
        referrals: prev.referrals.map((r) =>
          r.referralId === referralId
            ? {
                ...r,
                ambulanceId: `amb-${Date.now().toString(36)}`,
                ambulanceUnitName: unitName,
                ambulanceStatus: 'assigned',
                ambulanceEtaMin: 9,
                updatedAt: nowIso,
              }
            : r
        ),
        auditLogs: appendAudit(
          prev,
          'AMBULANCE_ASSIGNED',
          'referral',
          referralId,
          `Assigned ${unitName} to confirmed transfer ${referralId}.`
        ),
      }));
      showToast(`${unitName} assigned to ${referralId}.`);
    },
    [showToast, updateState]
  );

  const updateAmbulanceTransfer = useCallback(
    (
      referralId: string,
      stage: AmbulanceStage,
      patch?: {
        vitals?: Partial<VitalSigns>;
        locationConsentGranted?: boolean;
        etaMin?: number;
        coords?: { lat: number; lng: number };
      }
    ) => {
      const nowIso = new Date().toISOString();
      updateState((prev) => ({
        ...prev,
        referrals: prev.referrals.map((r) => {
          if (r.referralId !== referralId) return r;
          const nextStatus =
            stage === 'completed'
              ? ('completed' as const)
              : stage === 'arrived'
                ? ('arrived' as const)
                : stage === 'dispatched' || stage === 'picked_up' || stage === 'en_route'
                  ? ('in_transit' as const)
                  : r.status;
          const nextEta =
            patch?.etaMin ??
            (stage === 'arrived' || stage === 'completed'
              ? 0
              : stage === 'en_route'
                ? 4
                : stage === 'picked_up'
                  ? 7
                  : stage === 'dispatched'
                    ? 10
                    : r.ambulanceEtaMin);

          return {
            ...r,
            status: nextStatus,
            ambulanceStatus: stage,
            ambulanceEtaMin: nextEta,
            locationConsentGranted:
              patch?.locationConsentGranted !== undefined
                ? patch.locationConsentGranted
                : r.locationConsentGranted,
            ambulanceLocation: patch?.coords ?? r.ambulanceLocation,
            vitals: patch?.vitals
              ? { ...r.vitals, ...patch.vitals, recordedAt: nowIso }
              : r.vitals,
            updatedAt: nowIso,
          };
        }),
        notifications: prependNotification(prev.notifications, {
          id: `notif-amb-${Date.now()}`,
          title: `Ambulance Update · ${referralId}`,
          message: `Transfer stage updated to ${stage.replace('_', ' ').toUpperCase()}.`,
          channel: 'In-App',
          targetRoles: ['hospital', 'doctor', 'ambulance'],
          severity: stage === 'arrived' ? 'success' : 'info',
          read: false,
          createdAt: nowIso,
        }),
        auditLogs: appendAudit(
          prev,
          `AMBULANCE_${stage.toUpperCase()}`,
          'referral',
          referralId,
          `Ambulance updated ${referralId} stage to ${stage}.`
        ),
      }));
      showToast(`Ambulance transfer stage: ${stage.replace('_', ' ')}`);
    },
    [showToast, updateState]
  );

  const confirmPatientArrival = useCallback(
    (referralId: string) => {
      const nowIso = new Date().toISOString();
      updateState((prev) => ({
        ...prev,
        referrals: prev.referrals.map((r) =>
          r.referralId === referralId
            ? {
                ...r,
                status: 'completed' as const,
                ambulanceStatus: 'completed' as const,
                ambulanceEtaMin: 0,
                bedHold: r.bedHold
                  ? { ...r.bedHold, status: 'converted_admitted' as const }
                  : undefined,
                updatedAt: nowIso,
              }
            : r
        ),
        notifications: prependNotification(prev.notifications, {
          id: `notif-arr-${Date.now()}`,
          title: `Patient Arrived & Admitted · ${referralId}`,
          message: `Receiving hospital confirmed arrival. Bed reservation converted to active admission.`,
          channel: 'In-App',
          targetRoles: ['doctor', 'hospital', 'ambulance', 'admin'],
          severity: 'success',
          read: false,
          createdAt: nowIso,
        }),
        auditLogs: appendAudit(
          prev,
          'PATIENT_ARRIVAL_CONFIRMED',
          'referral',
          referralId,
          `Receiving hospital confirmed patient arrival and closed referral ${referralId}.`
        ),
      }));
      showToast(`Arrival confirmed — ${referralId} marked Completed.`);
    },
    [showToast, updateState]
  );

  const updateHospitalCapacity = useCallback(
    (
      hospitalId: string,
      patch: Partial<Pick<HospitalFacility, 'icuAvailable' | 'generalAvailable' | 'pedsAvailable' | 'acceptingEmergencies'>>
    ) => {
      const nowIso = new Date().toISOString();
      const verifier = currentUser?.displayName ?? 'Authorized Hospital Staff';
      updateState((prev) => ({
        ...prev,
        hospitals: prev.hospitals.map((h) => {
          if (h.hospitalId !== hospitalId) return h;
          return {
            ...h,
            icuAvailable:
              patch.icuAvailable !== undefined
                ? Math.max(0, Math.min(h.icuTotal, patch.icuAvailable))
                : h.icuAvailable,
            generalAvailable:
              patch.generalAvailable !== undefined
                ? Math.max(0, Math.min(h.generalTotal, patch.generalAvailable))
                : h.generalAvailable,
            pedsAvailable:
              patch.pedsAvailable !== undefined
                ? Math.max(0, Math.min(h.pedsTotal, patch.pedsAvailable))
                : h.pedsAvailable,
            acceptingEmergencies:
              patch.acceptingEmergencies !== undefined
                ? patch.acceptingEmergencies
                : h.acceptingEmergencies,
            lastVerifiedBy: verifier,
            lastVerifiedAt: nowIso,
          };
        }),
        auditLogs: appendAudit(
          prev,
          'HOSPITAL_CAPACITY_VERIFIED',
          'hospital',
          hospitalId,
          `${verifier} updated verified bed capacity for ${hospitalId}.`
        ),
      }));
      showToast('Verified bed capacity updated with timestamp.');
    },
    [currentUser, showToast, updateState]
  );

  const addHospitalDepartment = useCallback(
    (hospitalId: string, department: string) => {
      const trimmed = department.trim();
      if (!trimmed) return;
      updateState((prev) => ({
        ...prev,
        hospitals: prev.hospitals.map((h) =>
          h.hospitalId === hospitalId && !h.departments.includes(trimmed)
            ? { ...h, departments: [...h.departments, trimmed] }
            : h
        ),
      }));
      showToast(`Department "${trimmed}" added.`);
    },
    [showToast, updateState]
  );

  const updateUserRoleByAdmin = useCallback(
    (uid: string, role: UserRole) => {
      updateState((prev) => ({
        ...prev,
        registeredUsers: prev.registeredUsers.map((u) => (u.uid === uid ? { ...u, role } : u)),
        auditLogs: appendAudit(
          prev,
          'RBAC_ROLE_CHANGED',
          'user',
          uid,
          `Administrator updated user ${uid} role to ${role}.`
        ),
      }));
      showToast(`Role updated to ${role}.`);
    },
    [showToast, updateState]
  );

  const broadcastNotification = useCallback(
    (title: string, message: string, severity: KairosNotification['severity']) => {
      const nowIso = new Date().toISOString();
      updateState((prev) => ({
        ...prev,
        notifications: prependNotification(prev.notifications, {
          id: `notif-sys-${Date.now()}`,
          title,
          message,
          channel: 'SMS Ready',
          targetRoles: ['patient', 'doctor', 'hospital', 'ambulance', 'diagnostic', 'admin'],
          severity,
          read: false,
          createdAt: nowIso,
        }),
        auditLogs: appendAudit(
          prev,
          'SYSTEM_BROADCAST',
          'hospital',
          'network',
          `Broadcast sent: ${title}`
        ),
      }));
      showToast('System notification broadcast sent.');
    },
    [showToast, updateState]
  );

  const markAllNotificationsRead = useCallback(() => {
    updateState((prev) => ({
      ...prev,
      notifications: prev.notifications.map((n) => ({ ...n, read: true })),
    }));
  }, [updateState]);

  const getMedbridgeAccount = useCallback(
    (entityId: string, role: 'doctor' | 'hospital'): MedBridgeAccount => {
      if (state.medbridgeAccounts && state.medbridgeAccounts[entityId]) {
        return state.medbridgeAccounts[entityId];
      }
      if (role === 'doctor') {
        return (
          state.medbridgeAccounts['demo-doctor'] ?? {
            entityId,
            entityName: 'Referring Clinician',
            role: 'doctor',
            balance: 1450,
            lifetimeEarned: 2200,
            tier: 'Gold',
            complianceRate: 98.4,
            streakCount: 14,
            recentTransactions: [],
          }
        );
      }
      return (
        state.medbridgeAccounts[entityId] ??
        state.medbridgeAccounts['hosp-cmrit'] ?? {
          entityId,
          entityName: 'Receiving Hospital',
          role: 'hospital',
          balance: 3820,
          lifetimeEarned: 5400,
          tier: 'Platinum',
          complianceRate: 99.2,
          streakCount: 28,
          recentTransactions: [],
        }
      );
    },
    [state.medbridgeAccounts]
  );

  const awardMedbridgeCredits = useCallback(
    (
      entityId: string,
      role: 'doctor' | 'hospital',
      amount: number,
      reason: string,
      category: MedBridgeCreditCategory
    ) => {
      const nowIso = new Date().toISOString();
      const tx: MedBridgeCreditTransaction = {
        id: `mbc-tx-${Date.now()}`,
        timestamp: nowIso,
        role,
        entityId,
        entityName: role === 'doctor' ? 'Referring Clinician' : 'Receiving Hospital',
        type: 'earn',
        amount,
        reason,
        category,
      };

      updateState((prev) => {
        const fallbackAcc =
          role === 'doctor' ? prev.medbridgeAccounts['demo-doctor'] : prev.medbridgeAccounts['hosp-cmrit'];
        const currentAccount =
          prev.medbridgeAccounts[entityId] ??
          fallbackAcc ?? {
            entityId,
            entityName: role === 'doctor' ? 'Referring Clinician' : 'Receiving Hospital',
            role,
            balance: role === 'doctor' ? 1450 : 3820,
            lifetimeEarned: role === 'doctor' ? 2200 : 5400,
            tier: role === 'doctor' ? 'Gold' : 'Platinum',
            complianceRate: 98.4,
            streakCount: 14,
            recentTransactions: [],
          };

        const nextBalance = currentAccount.balance + amount;
        const nextLifetime = currentAccount.lifetimeEarned + amount;
        const nextTier =
          nextLifetime >= 5000 ? 'Platinum' : nextLifetime >= 2000 ? 'Gold' : nextLifetime >= 1000 ? 'Silver' : 'Bronze';

        const updatedAccount: MedBridgeAccount = {
          ...currentAccount,
          balance: nextBalance,
          lifetimeEarned: nextLifetime,
          tier: nextTier,
          streakCount: currentAccount.streakCount + 1,
          recentTransactions: [tx, ...currentAccount.recentTransactions].slice(0, 25),
        };

        const nextAccounts: Record<string, MedBridgeAccount> = {
          ...prev.medbridgeAccounts,
          [entityId]: updatedAccount,
        };
        if (role === 'doctor' || entityId === 'demo-doctor') {
          nextAccounts['demo-doctor'] = updatedAccount;
        }
        if (role === 'hospital' && (entityId === 'hosp-cmrit' || entityId === 'demo-hospital')) {
          nextAccounts['hosp-cmrit'] = updatedAccount;
          nextAccounts['demo-hospital'] = updatedAccount;
        }

        return {
          ...prev,
          medbridgeAccounts: nextAccounts,
          notifications: prependNotification(prev.notifications, {
            id: `notif-mbc-${Date.now()}`,
            title: `MedBridge Credits Earned (+${amount} MBC)`,
            message: `${reason} · Current Balance: ${nextBalance} MBC.`,
            channel: 'In-App',
            targetRoles: [role, 'admin'],
            severity: 'success',
            read: false,
            createdAt: nowIso,
          }),
          auditLogs: appendAudit(
            prev,
            'MEDBRIDGE_CREDITS_EARNED',
            'referral',
            entityId,
            `Awarded +${amount} MBC to ${role} (${reason}). New balance: ${nextBalance} MBC.`
          ),
        };
      });

      showToast(`+${amount} MedBridge Credits awarded! (${reason})`);
    },
    [showToast, updateState]
  );

  const redeemMedbridgeCredits = useCallback(
    (
      entityId: string,
      role: 'doctor' | 'hospital',
      amount: number,
      reason: string,
      category: MedBridgeCreditCategory
    ): boolean => {
      const currentAccount = getMedbridgeAccount(entityId, role);
      if (currentAccount.balance < amount) {
        showToast(`Insufficient MedBridge Credits (Balance: ${currentAccount.balance} MBC, Required: ${amount} MBC).`);
        return false;
      }

      const nowIso = new Date().toISOString();
      const tx: MedBridgeCreditTransaction = {
        id: `mbc-tx-${Date.now()}`,
        timestamp: nowIso,
        role,
        entityId,
        entityName: currentAccount.entityName,
        type: 'redeem',
        amount,
        reason,
        category,
      };

      updateState((prev) => {
        const nextBalance = currentAccount.balance - amount;
        const updatedAccount: MedBridgeAccount = {
          ...currentAccount,
          balance: nextBalance,
          recentTransactions: [tx, ...currentAccount.recentTransactions].slice(0, 25),
        };

        const nextAccounts: Record<string, MedBridgeAccount> = {
          ...prev.medbridgeAccounts,
          [entityId]: updatedAccount,
        };
        if (role === 'doctor' || entityId === 'demo-doctor') {
          nextAccounts['demo-doctor'] = updatedAccount;
        }
        if (role === 'hospital' && (entityId === 'hosp-cmrit' || entityId === 'demo-hospital')) {
          nextAccounts['hosp-cmrit'] = updatedAccount;
          nextAccounts['demo-hospital'] = updatedAccount;
        }

        return {
          ...prev,
          medbridgeAccounts: nextAccounts,
          notifications: prependNotification(prev.notifications, {
            id: `notif-mbc-${Date.now()}`,
            title: `MedBridge Credits Redeemed (-${amount} MBC)`,
            message: `Redeemed: ${reason}. Remaining Balance: ${nextBalance} MBC.`,
            channel: 'In-App',
            targetRoles: [role, 'admin'],
            severity: 'info',
            read: false,
            createdAt: nowIso,
          }),
          auditLogs: appendAudit(
            prev,
            'MEDBRIDGE_CREDITS_REDEEMED',
            'referral',
            entityId,
            `Redeemed -${amount} MBC for ${reason}. Remaining balance: ${nextBalance} MBC.`
          ),
        };
      });

      showToast(`Redeemed ${amount} MBC for ${reason}!`);
      return true;
    },
    [getMedbridgeAccount, showToast, updateState]
  );

  const resetPlatformData = useCallback(() => {
    setState(INITIAL_PLATFORM_STATE);
    persistAndBroadcast(INITIAL_PLATFORM_STATE);
    showToast('Healthcare network reset to verified live demo state.');
  }, [persistAndBroadcast, showToast]);

  const value = useMemo<KairosContextValue>(
    () => ({
      currentUser,
      firebaseUser,
      authReady,
      isOfflineSimulated,
      setOfflineSimulated,
      nowMs,
      hospitals: state.hospitals,
      specialists: state.specialists,
      appointments: state.appointments,
      referrals: state.referrals,
      offlineReferralQueue: state.offlineReferralQueue,
      diagnosticCentres: state.diagnosticCentres,
      diagnosticBookings: state.diagnosticBookings,
      notifications: state.notifications,
      auditLogs: state.auditLogs,
      registeredUsers: state.registeredUsers,
      medbridgeAccounts: state.medbridgeAccounts,
      getMedbridgeAccount,
      awardMedbridgeCredits,
      redeemMedbridgeCredits,
      toastMessage,
      showToast,
      authCallbackError,
      clearAuthCallbackError,
      redirectAuthenticatedRole,
      consumeRedirectAuthenticatedRole,
      loginWithEmail,
      registerWithEmailAccount,
      loginWithGoogle,
      loginWithDemoCredentials,
      logout,
      updateCurrentProfile,
      addHospitalFacility,
      addSpecialistDoctor,
      addDiagnosticCentre,
      bookAppointment,
      checkInAppointmentByToken,
      updateAppointmentStatus,
      rescheduleAppointment,
      cancelAppointment,
      applyDoctorDelay,
      bookDiagnosticTest,
      updateDiagnosticBooking,
      addDiagnosticTestToCentre,
      createEmergencyReferral,
      syncOfflineReferralsNow,
      acceptReferral,
      declineReferral,
      reconfirmBedHold,
      assignAmbulanceToReferral,
      updateAmbulanceTransfer,
      confirmPatientArrival,
      updateHospitalCapacity,
      addHospitalDepartment,
      updateUserRoleByAdmin,
      broadcastNotification,
      markAllNotificationsRead,
      resetPlatformData,
    }),
    [
      currentUser,
      firebaseUser,
      authReady,
      isOfflineSimulated,
      setOfflineSimulated,
      nowMs,
      state,
      getMedbridgeAccount,
      awardMedbridgeCredits,
      redeemMedbridgeCredits,
      toastMessage,
      showToast,
      authCallbackError,
      clearAuthCallbackError,
      redirectAuthenticatedRole,
      consumeRedirectAuthenticatedRole,
      loginWithEmail,
      registerWithEmailAccount,
      loginWithGoogle,
      loginWithDemoCredentials,
      logout,
      updateCurrentProfile,
      addHospitalFacility,
      addSpecialistDoctor,
      addDiagnosticCentre,
      bookAppointment,
      checkInAppointmentByToken,
      updateAppointmentStatus,
      rescheduleAppointment,
      cancelAppointment,
      applyDoctorDelay,
      bookDiagnosticTest,
      updateDiagnosticBooking,
      addDiagnosticTestToCentre,
      createEmergencyReferral,
      syncOfflineReferralsNow,
      acceptReferral,
      declineReferral,
      reconfirmBedHold,
      assignAmbulanceToReferral,
      updateAmbulanceTransfer,
      confirmPatientArrival,
      updateHospitalCapacity,
      addHospitalDepartment,
      updateUserRoleByAdmin,
      broadcastNotification,
      markAllNotificationsRead,
      resetPlatformData,
    ]
  );

  return <KairosContext.Provider value={value}>{children}</KairosContext.Provider>;
};

export function useKairos(): KairosContextValue {
  const ctx = useContext(KairosContext);
  if (!ctx) throw new Error('useKairos must be used inside KairosProvider');
  return ctx;
}
