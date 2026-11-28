export type UserRole =
  | 'patient'
  | 'doctor'
  | 'hospital'
  | 'ambulance'
  | 'diagnostic'
  | 'admin';

export interface UserProfile {
  uid: string;
  displayName: string;
  email: string;
  role: UserRole;
  facilityId?: string;
  facilityName?: string;
  phone?: string;
  bloodGroup?: string;
  allergies?: string;
  emergencyContact?: string;
  abhaId?: string;
  consentGranted: boolean;
}

export interface HospitalFacility {
  hospitalId: string;
  name: string;
  area: string;
  city: string;
  lat: number;
  lng: number;
  distanceKm: number;
  phone: string;
  departments: string[];
  facilities: string[];
  icuAvailable: number;
  icuTotal: number;
  generalAvailable: number;
  generalTotal: number;
  pedsAvailable: number;
  pedsTotal: number;
  acceptingEmergencies: boolean;
  lastVerifiedBy: string;
  lastVerifiedAt: string; // ISO string
  avgAcceptanceMin: number;
}

export interface SpecialistDoctor {
  doctorId: string;
  name: string;
  specialty: string;
  hospitalId: string;
  hospitalName: string;
  location: string;
  ruralFriendly: boolean;
  remoteAvailable: boolean;
  languages: string[];
  timings: string;
  nextSlot: string;
  availableSlots: string[];
  consultationFeeInr: number;
  experienceYears: number;
  availableToday: boolean;
}

export type AppointmentStatus =
  | 'scheduled'
  | 'checked-in'
  | 'in-triage'
  | 'in-consultation'
  | 'completed'
  | 'cancelled';

export interface OpdAppointment {
  appointmentId: string;
  ownerId: string;
  patientName: string;
  hospitalId: string;
  hospitalName: string;
  department: string;
  doctorName: string;
  slotTime: string;
  tokenNumber: string;
  channel: 'QR' | 'WhatsApp' | 'ABHA' | 'SMS';
  consultationType: 'in-person' | 'remote';
  status: AppointmentStatus;
  queuePosition: number;
  estimatedWaitMin: number;
  delayMin: number;
  delayAlertSent?: boolean;
  attachedReportName?: string;
  ruralModeBooking?: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface VitalSigns {
  heartRate: number;
  bp: string;
  spo2: number;
  temperatureC: number;
  respRate: number;
  recordedAt: string;
}

export type ReferralUrgency = 'critical' | 'urgent' | 'priority';

export type ReferralStatus =
  | 'pending'
  | 'accepted'
  | 'declined'
  | 'escalated'
  | 'in_transit'
  | 'arrived'
  | 'completed';

export type AmbulanceStage =
  | 'unassigned'
  | 'assigned'
  | 'preparing'
  | 'dispatched'
  | 'picked_up'
  | 'en_route'
  | 'arrived'
  | 'completed';

export interface BedHoldRecord {
  holdId: string;
  hospitalId: string;
  hospitalName: string;
  bedLabel: string;
  bedType: 'ICU' | 'General' | 'Peds';
  reservedByDoctor: string;
  reservedAt: string;
  expiresAt: string;
  status: 'held' | 'expiring_soon' | 'expired' | 'converted_admitted' | 'released';
  reconfirmCount: number;
}

export interface EmergencyReferral {
  referralId: string;
  clientDedupeKey: string;
  referringDoctorId: string;
  referringDoctorName: string;
  referringHospitalName: string;
  targetHospitalId: string;
  targetHospitalName: string;
  fallbackHospitalIds: string[];
  patientInitials: string;
  ageSex: string;
  category: string;
  urgency: ReferralUrgency;
  status: ReferralStatus;
  vitals: VitalSigns;
  symptoms: string;
  requiredFacilities: string[];
  requiredBedType: 'ICU' | 'General' | 'Peds';
  isbarSummary: string;
  attachedReportName?: string;
  manualOverrideActive?: boolean;
  manualOverrideReason?: string;
  responseDeadlineAt: string;
  acceptedAt?: string;
  receivingDoctorName?: string;
  declineReason?: string;
  bedHold?: BedHoldRecord;
  ambulanceId?: string;
  ambulanceUnitName?: string;
  ambulanceStatus: AmbulanceStage;
  ambulanceEtaMin?: number;
  ambulanceLocation?: { lat: number; lng: number };
  locationConsentGranted?: boolean;
  clinicianInstructions?: string;
  syncStatus: 'synced' | 'pending_sync';
  createdAt: string;
  updatedAt: string;
}

export interface DiagnosticTestItem {
  testId: string;
  name: string;
  category: string;
  priceInr: number;
  turnaroundHours: number;
  fastingRequired: boolean;
}

export interface DiagnosticCentre {
  centreId: string;
  name: string;
  area: string;
  hours: string;
  distanceKm: number;
  verifiedPricing: boolean;
  slots: string[];
  tests: DiagnosticTestItem[];
}

export type DiagnosticBookingStatus =
  | 'requested'
  | 'confirmed'
  | 'sample_collected'
  | 'report_ready'
  | 'rejected';

export interface DiagnosticBooking {
  bookingId: string;
  ownerId: string;
  patientName: string;
  centreId: string;
  centreName: string;
  testName: string;
  slotTime: string;
  priceInr: number;
  prescriptionNote?: string;
  status: DiagnosticBookingStatus;
  reportSummary?: string;
  createdAt: string;
  updatedAt: string;
}

export interface KairosNotification {
  id: string;
  title: string;
  message: string;
  channel: 'In-App' | 'SMS Ready' | 'WhatsApp Ready';
  targetRoles: UserRole[];
  severity: 'info' | 'warning' | 'critical' | 'success';
  read: boolean;
  createdAt: string;
}

export interface AuditLogEntry {
  logId: string;
  actorUid: string;
  actorName: string;
  actorRole: UserRole;
  action: string;
  entityType: 'appointment' | 'referral' | 'hospital' | 'diagnostic' | 'user' | 'consent';
  entityId: string;
  summary: string;
  createdAt: string;
}

export interface HospitalMatchResult {
  hospital: HospitalFacility;
  matchPercent: number;
  estimatedDriveMin: number;
  minutesSinceVerified: number;
  isCapacityFresh: boolean;
  hasRequiredSpecialty: boolean;
  hasAvailableBed: boolean;
  matchedFacilities: string[];
  missingFacilities: string[];
  reasons: string[];
  warnings: string[];
}

export type MedBridgeCreditCategory =
  | 'golden_hour_referral'
  | 'isbar_compliance'
  | 'telemetry_stream'
  | 'fast_bed_acceptance'
  | 'bed_hold_honored'
  | 'ambulance_handover'
  | 'tele_specialist_grant'
  | 'cme_voucher'
  | 'cme_training'
  | 'priority_routing_boost'
  | 'quality_audit_grant'
  | 'referral_accepted_fast'
  | 'zero_double_booking'
  | 'priority_matching'
  | 'network_buffer'
  | 'nabh_compliance'
  | 'accept_before_move'
  | 'alert_sla_5min';

export interface MedBridgeCreditTransaction {
  id: string;
  timestamp: string;
  role: 'doctor' | 'hospital';
  entityId: string;
  entityName: string;
  type: 'earn' | 'redeem' | 'earned' | 'redeemed';
  amount: number;
  reason: string;
  category: MedBridgeCreditCategory;
}

export interface MedBridgeAccount {
  entityId: string;
  entityName: string;
  role: 'doctor' | 'hospital';
  balance: number;
  lifetimeEarned: number;
  tier: 'Bronze' | 'Silver' | 'Gold' | 'Platinum';
  complianceRate: number; // e.g. 98.4%
  streakCount: number;
  recentTransactions: MedBridgeCreditTransaction[];
  // Convenience aliases for UI components:
  ownerId?: string;
  totalEarned?: number;
  totalRedeemed?: number;
  complianceScore?: number;
  streak?: number;
  transactions?: MedBridgeCreditTransaction[];
}
