import { getApp, getApps, initializeApp } from 'firebase/app';
import {
  GoogleAuthProvider,
  createUserWithEmailAndPassword,
  getAuth,
  getRedirectResult,
  signInWithEmailAndPassword,
  signInWithPopup,
  signOut as firebaseSignOut,
  updateProfile,
  type User,
} from 'firebase/auth';
import {
  doc,
  getDocFromServer,
  getFirestore,
  serverTimestamp,
  setDoc,
  updateDoc,
} from 'firebase/firestore';
import firebaseConfig from '../firebase-applet-config.json';
import type {
  DiagnosticBooking,
  EmergencyReferral,
  OpdAppointment,
  UserProfile,
  UserRole,
} from './types/kairos';

const app = getApps().length > 0 ? getApp() : initializeApp(firebaseConfig);
export const db = getFirestore(app, firebaseConfig.firestoreDatabaseId);
export const auth = getAuth(app);
const googleProvider = new GoogleAuthProvider();
googleProvider.setCustomParameters({ prompt: 'select_account' });

const PENDING_AUTH_KEY = 'kairos_pending_auth_context_v1';

export interface PendingAuthContext {
  role: UserRole;
  facilityName?: string;
  displayName?: string;
  phone?: string;
  consentGranted?: boolean;
  isRedirect?: boolean;
  createdAt: number;
}

export function savePendingAuthContext(ctx: Omit<PendingAuthContext, 'createdAt'>): void {
  if (typeof window === 'undefined') return;
  try {
    const payload: PendingAuthContext = { ...ctx, createdAt: Date.now() };
    window.sessionStorage.setItem(PENDING_AUTH_KEY, JSON.stringify(payload));
  } catch {
    // Ignore storage quota / private mode failures
  }
}

export function readPendingAuthContext(): PendingAuthContext | null {
  if (typeof window === 'undefined') return null;
  try {
    const raw = window.sessionStorage.getItem(PENDING_AUTH_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as PendingAuthContext;
    // Expire stale pending contexts older than 10 minutes
    if (!parsed.createdAt || Date.now() - parsed.createdAt > 10 * 60 * 1000) {
      window.sessionStorage.removeItem(PENDING_AUTH_KEY);
      return null;
    }
    return parsed;
  } catch {
    return null;
  }
}

export function clearPendingAuthContext(): void {
  if (typeof window === 'undefined') return;
  try {
    window.sessionStorage.removeItem(PENDING_AUTH_KEY);
  } catch {
    // Ignore storage failures
  }
}

export enum OperationType {
  CREATE = 'create',
  UPDATE = 'update',
  DELETE = 'delete',
  LIST = 'list',
  GET = 'get',
  WRITE = 'write',
}

export interface FirestoreErrorInfo {
  error: string;
  operationType: OperationType;
  path: string | null;
  authInfo: {
    userId?: string | null;
    email?: string | null;
    emailVerified?: boolean | null;
    isAnonymous?: boolean | null;
    tenantId?: string | null;
    providerInfo?: {
      providerId?: string | null;
      email?: string | null;
    }[];
  };
}

export function handleFirestoreError(
  error: unknown,
  operationType: OperationType,
  path: string | null
): never {
  const errInfo: FirestoreErrorInfo = {
    error: error instanceof Error ? error.message : String(error),
    authInfo: {
      userId: auth.currentUser?.uid ?? null,
      email: auth.currentUser?.email ?? null,
      emailVerified: auth.currentUser?.emailVerified ?? null,
      isAnonymous: auth.currentUser?.isAnonymous ?? null,
      tenantId: auth.currentUser?.tenantId ?? null,
      providerInfo:
        auth.currentUser?.providerData?.map((provider) => ({
          providerId: provider.providerId,
          email: provider.email,
        })) || [],
    },
    operationType,
    path,
  };
  console.error('Firestore Error: ', JSON.stringify(errInfo));
  throw new Error(JSON.stringify(errInfo));
}

export async function testConnection(): Promise<boolean> {
  try {
    await getDocFromServer(doc(db, 'test', 'connection'));
    return true;
  } catch (error) {
    if (error instanceof Error && error.message.includes('the client is offline')) {
      console.error('Please check your Firebase configuration.');
    }
    return false;
  }
}

void testConnection();

export async function signInWithGoogle(
  pendingContext?: Omit<PendingAuthContext, 'createdAt' | 'isRedirect'>
): Promise<User> {
  if (pendingContext) {
    savePendingAuthContext({ ...pendingContext, isRedirect: false });
  }
  try {
    // Always prefer signInWithPopup: cross-origin signInWithRedirect reloads "/" (Home Page)
    // and fails under modern browser third-party storage partitioning.
    const result = await signInWithPopup(auth, googleProvider);
    return result.user;
  } catch (error) {
    clearPendingAuthContext();
    throw error;
  }
}

export async function consumeGoogleRedirectResult(): Promise<User | null> {
  const result = await getRedirectResult(auth);
  return result?.user ?? null;
}

export async function signInWithEmail(email: string, password: string): Promise<User> {
  const result = await signInWithEmailAndPassword(auth, email.trim(), password);
  return result.user;
}

export async function registerWithEmail(
  email: string,
  password: string,
  displayName: string
): Promise<User> {
  const result = await createUserWithEmailAndPassword(auth, email.trim(), password);
  if (displayName.trim()) {
    await updateProfile(result.user, { displayName: displayName.trim() });
  }
  return result.user;
}

export async function signOutFirebase(): Promise<void> {
  clearPendingAuthContext();
  await firebaseSignOut(auth);
}

function sanitizeId(raw: string): string {
  const cleaned = raw.replace(/[^a-zA-Z0-9_-]/g, '_').slice(0, 128);
  return cleaned || 'id_default';
}

/**
 * Syncs verified authenticated user's public & private records to Firestore,
 * strictly matching firebase-blueprint.json schema & security rules.
 */
export async function syncUserProfileToFirestore(profile: UserProfile): Promise<void> {
  const current = auth.currentUser;
  if (!current || !current.emailVerified) return;

  const uid = sanitizeId(current.uid);
  const publicPath = `users/${uid}`;
  const safeDisplayName = (profile.displayName || current.displayName || 'KAIROS User').slice(0, 120);
  try {
    // Fast path for returning users: update allowed mutable fields without triggering a create-rule rejection
    await updateDoc(doc(db, 'users', uid), {
      displayName: safeDisplayName,
      updatedAt: serverTimestamp(),
    });
  } catch {
    // First-time user: create the public user profile document
    try {
      await setDoc(
        doc(db, 'users', uid),
        {
          uid,
          displayName: safeDisplayName,
          role: 'patient',
          createdAt: serverTimestamp(),
          updatedAt: serverTimestamp(),
        },
        { merge: false }
      );
    } catch (error) {
      handleFirestoreError(error, OperationType.CREATE, publicPath);
    }
  }

  const privatePath = `users/${uid}/private/info`;
  try {
    await setDoc(doc(db, 'users', uid, 'private', 'info'), {
      uid,
      email: (profile.email || current.email || '').slice(0, 200),
      phone: (profile.phone || '').slice(0, 32),
      bloodGroup: (profile.bloodGroup || '').slice(0, 10),
      allergies: (profile.allergies || '').slice(0, 300),
      emergencyContact: (profile.emergencyContact || '').slice(0, 120),
      abhaId: (profile.abhaId || '').slice(0, 40),
      consentGranted: Boolean(profile.consentGranted),
      updatedAt: serverTimestamp(),
    });
  } catch (error) {
    handleFirestoreError(error, OperationType.WRITE, privatePath);
  }
}

export async function syncAppointmentToFirestore(appt: OpdAppointment): Promise<void> {
  const current = auth.currentUser;
  if (!current || !current.emailVerified) return;

  const appointmentId = sanitizeId(appt.appointmentId);
  const path = `appointments/${appointmentId}`;
  try {
    await setDoc(doc(db, 'appointments', appointmentId), {
      appointmentId,
      ownerId: sanitizeId(current.uid),
      patientName: appt.patientName.slice(0, 120),
      hospitalId: sanitizeId(appt.hospitalId),
      hospitalName: appt.hospitalName.slice(0, 160),
      department: appt.department.slice(0, 100),
      doctorName: appt.doctorName.slice(0, 120),
      slotTime: appt.slotTime.slice(0, 40),
      tokenNumber: appt.tokenNumber.slice(0, 24),
      consultationType: appt.consultationType,
      status: appt.status,
      queuePosition: Math.max(0, Math.min(999, Math.round(appt.queuePosition))),
      estimatedWaitMin: Math.max(0, Math.min(600, Math.round(appt.estimatedWaitMin))),
      delayMin: Math.max(0, Math.min(240, Math.round(appt.delayMin))),
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    });
  } catch (error) {
    handleFirestoreError(error, OperationType.CREATE, path);
  }
}

export async function syncDiagnosticBookingToFirestore(booking: DiagnosticBooking): Promise<void> {
  const current = auth.currentUser;
  if (!current || !current.emailVerified) return;

  const bookingId = sanitizeId(booking.bookingId);
  const path = `diagnosticBookings/${bookingId}`;
  try {
    await setDoc(doc(db, 'diagnosticBookings', bookingId), {
      bookingId,
      ownerId: sanitizeId(current.uid),
      centreId: sanitizeId(booking.centreId),
      centreName: booking.centreName.slice(0, 160),
      testName: booking.testName.slice(0, 160),
      slotTime: booking.slotTime.slice(0, 40),
      priceInr: Math.max(0, Math.min(500000, Math.round(booking.priceInr))),
      status: booking.status,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    });
  } catch (error) {
    handleFirestoreError(error, OperationType.CREATE, path);
  }
}

export async function syncReferralAuditToFirestore(
  referral: EmergencyReferral,
  actorRole: string = 'clinical'
): Promise<void> {
  const current = auth.currentUser;
  if (!current || !current.emailVerified) return;

  const logId = sanitizeId(`log-${referral.referralId}-${Date.now()}`);
  const path = `auditLogs/${logId}`;
  try {
    await setDoc(doc(db, 'auditLogs', logId), {
      logId,
      actorUid: sanitizeId(current.uid),
      actorRole: actorRole.slice(0, 40),
      action: `referral_${referral.status}`,
      entityType: 'referral',
      entityId: sanitizeId(referral.referralId),
      summary: `${referral.referralId} (${referral.category}) -> ${referral.targetHospitalName} [${referral.status}]`.slice(0, 400),
      createdAt: serverTimestamp(),
    });
  } catch (error) {
    handleFirestoreError(error, OperationType.CREATE, path);
  }
}
