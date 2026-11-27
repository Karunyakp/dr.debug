import type { UserRole } from '../types/kairos';

export interface DummyCredentials {
  role: UserRole;
  email: string;
  password: string;
  displayName: string;
  phone: string;
  facilityName?: string;
  bloodGroup?: string;
}

const DEMO_ACCOUNTS: Record<UserRole, Omit<DummyCredentials, 'role'>> = {
  patient: {
    email: 'patient.demo@kairoshealth.in',
    password: 'Kairos@Patient2026',
    displayName: 'Aarav Sharma',
    phone: '+91-98450-11223',
    bloodGroup: 'O+',
  },
  doctor: {
    email: 'doctor.demo@kairoshealth.in',
    password: 'Kairos@Doctor2026',
    displayName: 'Dr. Meera Nair',
    phone: '+91-98450-33445',
    facilityName: 'Hoskote Rural PHC',
  },
  hospital: {
    email: 'hospital.demo@kairoshealth.in',
    password: 'Kairos@Hospital2026',
    displayName: 'Command Desk Officer',
    phone: '+1234567890',
    facilityName: 'KAIROS Tertiary Trauma Hospital',
  },
  ambulance: {
    email: 'ambulance.demo@kairoshealth.in',
    password: 'Kairos@Ambulance2026',
    displayName: 'ALS Paramedic Lead',
    phone: '+91-98450-55667',
    facilityName: 'ALS Unit KA-01-EM-108',
  },
  diagnostic: {
    email: 'diagnostics.demo@kairoshealth.in',
    password: 'Kairos@Lab2026',
    displayName: 'Lab Coordinator',
    phone: '+91-80-4123-9200',
    facilityName: 'Metro Diagnostics Centre',
  },
  admin: {
    email: 'karunyayashu6@gmail.com',
    password: 'Kairos@Admin2026',
    displayName: 'Karunya (Platform Admin)',
    phone: '+91-98450-54321',
    facilityName: 'State Health Command Operations',
  },
};

/**
 * Generates deterministic dummy credentials for a given KAIROS role so users
 * can auto-fill and test any portal without creating a real account.
 */
export function generateDummyCredentials(role: UserRole): DummyCredentials {
  const base = DEMO_ACCOUNTS[role] ?? DEMO_ACCOUNTS.patient;
  return {
    role,
    ...base,
  };
}

/**
 * Checks whether an email/password pair matches any generated dummy credential.
 */
export function matchDummyCredentials(
  email: string,
  password: string,
  preferredRole?: UserRole
): DummyCredentials | null {
  const normalizedEmail = email.trim().toLowerCase();
  const roles = Object.keys(DEMO_ACCOUNTS) as UserRole[];
  for (const r of roles) {
    const creds = DEMO_ACCOUNTS[r];
    const emailMatches =
      creds.email.toLowerCase() === normalizedEmail ||
      (r === 'admin' && (normalizedEmail === 'karunyayashu6@gmail.com' || normalizedEmail === 'admin.demo@kairoshealth.in'));
    if (emailMatches && creds.password === password) {
      return {
        role: preferredRole ?? r,
        ...creds,
        email: normalizedEmail,
      };
    }
  }
  return null;
}
