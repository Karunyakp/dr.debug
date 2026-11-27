import type {
  BedHoldRecord,
  EmergencyReferral,
  HospitalFacility,
  HospitalMatchResult,
  OpdAppointment,
} from '../types/kairos';

/**
 * 1. DELAY-AWARE QUEUE RE-ESTIMATION ENGINE
 * Recomputes live queue positions and estimated wait times when a doctor is
 * delayed or pulled away for an emergency, returning updated appointments and
 * a list of affected patients requiring alerts.
 */
export function recalculateOpdQueue(
  appointments: OpdAppointment[],
  hospitalId: string,
  department: string,
  doctorDelayMin: number,
  avgConsultMin = 6
): { updated: OpdAppointment[]; affectedAppointmentIds: string[] } {
  const safeDelay = Math.max(0, Math.min(240, Math.round(doctorDelayMin)));
  const activeStatuses = new Set(['scheduled', 'checked-in', 'in-triage', 'in-consultation']);

  const matchingActive = appointments
    .filter(
      (a) =>
        a.hospitalId === hospitalId &&
        a.department === department &&
        activeStatuses.has(a.status)
    )
    .sort((a, b) => a.queuePosition - b.queuePosition);

  const affectedAppointmentIds: string[] = [];
  const positionById: Record<string, { pos: number; wait: number }> = {};

  matchingActive.forEach((appt, idx) => {
    const pos = idx + 1;
    const baseWait = appt.status === 'in-consultation' ? 0 : idx * avgConsultMin + 4;
    const wait = appt.status === 'in-consultation' ? 0 : baseWait + safeDelay;
    positionById[appt.appointmentId] = { pos, wait };
    if (safeDelay > 0 && appt.status !== 'in-consultation') {
      affectedAppointmentIds.push(appt.appointmentId);
    }
  });

  const nowIso = new Date().toISOString();
  const updated = appointments.map((appt) => {
    const recalc = positionById[appt.appointmentId];
    if (!recalc) return appt;
    return {
      ...appt,
      queuePosition: recalc.pos,
      estimatedWaitMin: recalc.wait,
      delayMin: safeDelay,
      delayAlertSent: safeDelay > 0 ? true : appt.delayAlertSent,
      updatedAt: nowIso,
    };
  });

  return { updated, affectedAppointmentIds };
}

/**
 * 2. TRANSPARENT SMART HOSPITAL MATCHING ENGINE
 * Evaluates receiving hospitals transparently using distance, department match,
 * verified bed/ICU availability, timestamp freshness, and required facilities.
 * Never acts as an opaque black-box score replacing clinical judgment.
 */
export interface HospitalMatchCriteria {
  department: string;
  requiredBedType: 'ICU' | 'General' | 'Peds';
  requiredFacilities: string[];
  nowMs?: number;
}

export function rankReceivingHospitals(
  hospitals: HospitalFacility[],
  criteria: HospitalMatchCriteria
): HospitalMatchResult[] {
  const nowMs = criteria.nowMs ?? Date.now();

  return hospitals
    .map((hospital) => {
      const verifiedMs = Date.parse(hospital.lastVerifiedAt);
      const minutesSinceVerified = Number.isFinite(verifiedMs)
        ? Math.max(0, Math.round((nowMs - verifiedMs) / 60000))
        : 999;
      const isCapacityFresh = minutesSinceVerified <= 30;

      const availableCount =
        criteria.requiredBedType === 'ICU'
          ? hospital.icuAvailable
          : criteria.requiredBedType === 'Peds'
            ? hospital.pedsAvailable
            : hospital.generalAvailable;

      const hasAvailableBed = availableCount > 0 && hospital.acceptingEmergencies;
      const hasRequiredSpecialty = hospital.departments.some(
        (d) =>
          d.toLowerCase().includes(criteria.department.toLowerCase()) ||
          criteria.department.toLowerCase().includes(d.toLowerCase())
      );

      const matchedFacilities = criteria.requiredFacilities.filter((req) =>
        hospital.facilities.some((f) => f.toLowerCase() === req.toLowerCase())
      );
      const missingFacilities = criteria.requiredFacilities.filter(
        (req) => !matchedFacilities.includes(req)
      );

      // Transparent deterministic point breakdown (100 max):
      // Bed availability & acceptance: 35 pts
      // Specialty match: 25 pts
      // Facilities coverage: 20 pts
      // Proximity (distance): 15 pts
      // Verified data freshness (<= 30m): 5 pts
      let score = 0;
      if (hasAvailableBed) score += 35;
      else if (availableCount > 0) score += 10;

      if (hasRequiredSpecialty) score += 25;

      const facilityRatio =
        criteria.requiredFacilities.length === 0
          ? 1
          : matchedFacilities.length / criteria.requiredFacilities.length;
      score += Math.round(facilityRatio * 20);

      const distanceScore = Math.max(0, Math.round(15 - hospital.distanceKm * 0.75));
      score += distanceScore;

      if (isCapacityFresh) score += 5;

      const estimatedDriveMin = Math.max(4, Math.round(hospital.distanceKm * 2.1 + 2));

      const reasons: string[] = [];
      const warnings: string[] = [];

      if (hasAvailableBed) {
        reasons.push(
          `${availableCount} verified ${criteria.requiredBedType} bed${availableCount === 1 ? '' : 's'} open`
        );
      } else if (!hospital.acceptingEmergencies) {
        warnings.push('Hospital emergency diversion active');
      } else {
        warnings.push(`0 ${criteria.requiredBedType} beds currently reported available`);
      }

      if (hasRequiredSpecialty) {
        reasons.push(`${criteria.department} specialist team available`);
      } else {
        warnings.push(`No dedicated ${criteria.department} department listed`);
      }

      if (missingFacilities.length === 0 && criteria.requiredFacilities.length > 0) {
        reasons.push(`All required facilities confirmed (${matchedFacilities.join(', ')})`);
      } else if (missingFacilities.length > 0) {
        warnings.push(`Missing facilities: ${missingFacilities.join(', ')}`);
      }

      if (isCapacityFresh) {
        reasons.push(`Bed status verified ${minutesSinceVerified} min ago by ${hospital.lastVerifiedBy}`);
      } else {
        warnings.push(
          `Capacity update is ${minutesSinceVerified} min old — confirm verbally before dispatch`
        );
      }

      reasons.push(`${hospital.distanceKm.toFixed(1)} km (~${estimatedDriveMin} min transfer)`);

      return {
        hospital,
        matchPercent: Math.min(100, Math.max(0, score)),
        estimatedDriveMin,
        minutesSinceVerified,
        isCapacityFresh,
        hasRequiredSpecialty,
        hasAvailableBed,
        matchedFacilities,
        missingFacilities,
        reasons,
        warnings,
      };
    })
    .sort((a, b) => b.matchPercent - a.matchPercent || a.hospital.distanceKm - b.hospital.distanceKm);
}

/**
 * 3. TIME-BOUNDED BED HOLD STATE MACHINE
 * Soft-locks a bed upon receiving hospital acceptance and expires automatically
 * if not reconfirmed or converted upon patient arrival, preventing double-promises.
 */
export function createBedHold(
  hospitalId: string,
  hospitalName: string,
  bedLabel: string,
  bedType: 'ICU' | 'General' | 'Peds',
  reservedByDoctor: string,
  holdDurationSec = 900,
  nowMs = Date.now()
): BedHoldRecord {
  return {
    holdId: `HOLD-${hospitalId.slice(0, 4).toUpperCase()}-${nowMs.toString().slice(-4)}`,
    hospitalId,
    hospitalName,
    bedLabel,
    bedType,
    reservedByDoctor,
    reservedAt: new Date(nowMs).toISOString(),
    expiresAt: new Date(nowMs + holdDurationSec * 1000).toISOString(),
    status: 'held',
    reconfirmCount: 0,
  };
}

export function evaluateBedHoldState(
  hold: BedHoldRecord,
  nowMs = Date.now(),
  warningThresholdSec = 120
): { status: BedHoldRecord['status']; remainingSec: number } {
  if (hold.status === 'converted_admitted' || hold.status === 'released') {
    return { status: hold.status, remainingSec: 0 };
  }
  const expiresMs = Date.parse(hold.expiresAt);
  const remainingSec = Math.max(0, Math.floor((expiresMs - nowMs) / 1000));
  if (remainingSec <= 0) {
    return { status: 'expired', remainingSec: 0 };
  }
  if (remainingSec <= warningThresholdSec) {
    return { status: 'expiring_soon', remainingSec };
  }
  return { status: 'held', remainingSec };
}

export function formatCountdown(totalSeconds: number): string {
  const safe = Math.max(0, Math.floor(totalSeconds));
  const mins = Math.floor(safe / 60);
  const secs = safe % 60;
  return `${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;
}

/**
 * 4. OFFLINE-FIRST REFERRAL SYNCHRONISATION & DEDUPLICATION
 * Prevents duplicate referrals when weak rural connectivity causes retries.
 */
export function enqueueOfflineReferral(
  queue: EmergencyReferral[],
  incomingReferral: EmergencyReferral
): { queue: EmergencyReferral[]; deduplicated: boolean } {
  const exists = queue.some(
    (item) =>
      item.clientDedupeKey === incomingReferral.clientDedupeKey ||
      item.referralId === incomingReferral.referralId
  );
  if (exists) {
    return { queue, deduplicated: true };
  }
  return {
    queue: [{ ...incomingReferral, syncStatus: 'pending_sync' }, ...queue],
    deduplicated: false,
  };
}

export function mergeSyncedReferrals(
  existingReferrals: EmergencyReferral[],
  offlineQueue: EmergencyReferral[]
): { merged: EmergencyReferral[]; newlySyncedCount: number } {
  const existingKeys = new Set(existingReferrals.map((r) => r.clientDedupeKey));
  const toSync = offlineQueue
    .filter((item) => !existingKeys.has(item.clientDedupeKey))
    .map((item) => ({
      ...item,
      syncStatus: 'synced' as const,
      updatedAt: new Date().toISOString(),
    }));

  return {
    merged: [...toSync, ...existingReferrals],
    newlySyncedCount: toSync.length,
  };
}

/**
 * 5. HL7 FHIR R4 INTEROPERABILITY BUNDLE BUILDER
 * Generates an integration-ready HL7 FHIR R4 Bundle (ServiceRequest + Vitals
 * Observations) structured for HMIS / future ABDM exchange.
 */
export function buildFhirReferralBundle(referral: EmergencyReferral) {
  return {
    resourceType: 'Bundle',
    id: `kairos-fhir-${referral.referralId.toLowerCase()}`,
    type: 'transaction',
    timestamp: referral.updatedAt,
    meta: {
      profile: ['http://hl7.org/fhir/StructureDefinition/Bundle'],
      tag: [
        {
          system: 'https://kairos.health/fhir/tags',
          code: 'abdm-integration-ready',
          display: 'ABDM Compatible Structure (Demo)',
        },
      ],
    },
    entry: [
      {
        resource: {
          resourceType: 'ServiceRequest',
          id: referral.referralId,
          status: referral.status === 'completed' ? 'completed' : 'active',
          intent: 'order',
          priority: referral.urgency === 'critical' ? 'stat' : referral.urgency,
          category: [{ text: referral.category }],
          subject: { display: `${referral.patientInitials} (${referral.ageSex})` },
          requester: { display: `${referral.referringDoctorName} · ${referral.referringHospitalName}` },
          performer: [{ display: referral.targetHospitalName }],
          note: [{ text: referral.isbarSummary }],
          authoredOn: referral.createdAt,
        },
      },
      {
        resource: {
          resourceType: 'Observation',
          id: `${referral.referralId}-vitals`,
          status: 'final',
          category: [{ coding: [{ system: 'http://terminology.hl7.org/CodeSystem/observation-category', code: 'vital-signs' }] }],
          effectiveDateTime: referral.vitals.recordedAt,
          component: [
            { code: { text: 'Heart Rate' }, valueQuantity: { value: referral.vitals.heartRate, unit: 'beats/min' } },
            { code: { text: 'Oxygen Saturation (SpO2)' }, valueQuantity: { value: referral.vitals.spo2, unit: '%' } },
            { code: { text: 'Blood Pressure' }, valueString: referral.vitals.bp },
            { code: { text: 'Body Temperature' }, valueQuantity: { value: referral.vitals.temperatureC, unit: 'Cel' } },
            { code: { text: 'Respiratory Rate' }, valueQuantity: { value: referral.vitals.respRate, unit: 'breaths/min' } },
          ],
        },
      },
    ],
  };
}
