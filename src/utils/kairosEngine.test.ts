import test from 'node:test';
import assert from 'node:assert/strict';
import {
  buildFhirReferralBundle,
  createBedHold,
  enqueueOfflineReferral,
  evaluateBedHoldState,
  formatCountdown,
  mergeSyncedReferrals,
  rankReceivingHospitals,
  recalculateOpdQueue,
} from './kairosEngine';
import type { EmergencyReferral, HospitalFacility, OpdAppointment } from '../types/kairos';

const nowMs = Date.parse('2026-11-27T10:30:00.000Z');

const sampleHospitals: HospitalFacility[] = [
  {
    hospitalId: 'hosp-cmrit',
    name: 'CMRIT General',
    area: 'Whitefield',
    city: 'Bengaluru',
    lat: 12.9667,
    lng: 77.712,
    distanceKm: 3.2,
    phone: '+91-80-4001-1000',
    departments: ['General Medicine', 'Obstetrics & Gynaecology', 'Cardiology', 'Emergency'],
    facilities: ['ICU', 'Ventilator', 'NICU/OB-GYN', 'Blood Bank'],
    icuAvailable: 2,
    icuTotal: 5,
    generalAvailable: 12,
    generalTotal: 15,
    pedsAvailable: 2,
    pedsTotal: 4,
    acceptingEmergencies: true,
    lastVerifiedBy: 'Dr. Patel',
    lastVerifiedAt: new Date(nowMs - 2 * 60000).toISOString(),
    avgAcceptanceMin: 4.2,
  },
  {
    hospitalId: 'hosp-stmarys',
    name: 'St. Marys',
    area: 'KR Puram',
    city: 'Bengaluru',
    lat: 13.005,
    lng: 77.695,
    distanceKm: 6.0,
    phone: '+91-80-4001-2000',
    departments: ['Obstetrics & Gynaecology', 'General Medicine'],
    facilities: ['ICU', 'NICU/OB-GYN'],
    icuAvailable: 0,
    icuTotal: 4,
    generalAvailable: 3,
    generalTotal: 12,
    pedsAvailable: 1,
    pedsTotal: 3,
    acceptingEmergencies: false,
    lastVerifiedBy: 'Nurse Rekha',
    lastVerifiedAt: new Date(nowMs - 45 * 60000).toISOString(),
    avgAcceptanceMin: 6.5,
  },
];

test('delay-aware queue engine recalculates positions, wait times, and flags affected tokens', () => {
  const appointments: OpdAppointment[] = [
    {
      appointmentId: 'apt-1',
      ownerId: 'u1',
      patientName: 'A. Patel',
      hospitalId: 'hosp-cmrit',
      hospitalName: 'CMRIT General',
      department: 'General Medicine',
      doctorName: 'Dr. Meera',
      slotTime: '10:30 AM',
      tokenNumber: 'A-042',
      channel: 'QR',
      consultationType: 'in-person',
      status: 'in-triage',
      queuePosition: 1,
      estimatedWaitMin: 4,
      delayMin: 0,
      createdAt: new Date(nowMs).toISOString(),
      updatedAt: new Date(nowMs).toISOString(),
    },
    {
      appointmentId: 'apt-2',
      ownerId: 'u2',
      patientName: 'R. Rao',
      hospitalId: 'hosp-cmrit',
      hospitalName: 'CMRIT General',
      department: 'General Medicine',
      doctorName: 'Dr. Meera',
      slotTime: '10:45 AM',
      tokenNumber: 'A-043',
      channel: 'ABHA',
      consultationType: 'in-person',
      status: 'scheduled',
      queuePosition: 2,
      estimatedWaitMin: 10,
      delayMin: 0,
      createdAt: new Date(nowMs).toISOString(),
      updatedAt: new Date(nowMs).toISOString(),
    },
  ];

  const { updated, affectedAppointmentIds } = recalculateOpdQueue(
    appointments,
    'hosp-cmrit',
    'General Medicine',
    15
  );

  assert.deepEqual(affectedAppointmentIds, ['apt-1', 'apt-2']);
  assert.equal(updated[0].delayMin, 15);
  assert.equal(updated[0].estimatedWaitMin, 19);
  assert.equal(updated[1].estimatedWaitMin, 25);
  assert.equal(updated[1].delayAlertSent, true);
});

test('transparent hospital matcher ranks accepting ICU hospital above full/stale hospital with clear warnings', () => {
  const ranked = rankReceivingHospitals(sampleHospitals, {
    department: 'Obstetrics & Gynaecology',
    requiredBedType: 'ICU',
    requiredFacilities: ['ICU', 'NICU/OB-GYN', 'Blood Bank'],
    nowMs,
  });

  assert.equal(ranked[0].hospital.hospitalId, 'hosp-cmrit');
  assert.equal(ranked[0].hasAvailableBed, true);
  assert.equal(ranked[0].isCapacityFresh, true);
  assert.ok(ranked[0].matchPercent > ranked[1].matchPercent);

  assert.equal(ranked[1].hospital.hospitalId, 'hosp-stmarys');
  assert.equal(ranked[1].isCapacityFresh, false);
  assert.ok(ranked[1].warnings.some((w) => w.includes('diversion')));
  assert.ok(ranked[1].warnings.some((w) => w.includes('old')));
});

test('time-bounded bed hold transitions through held -> expiring_soon -> expired', () => {
  const hold = createBedHold('hosp-cmrit', 'CMRIT General', 'Bed 12A', 'ICU', 'Dr. Patel', 300, nowMs);

  const initial = evaluateBedHoldState(hold, nowMs + 60 * 1000);
  assert.equal(initial.status, 'held');
  assert.equal(formatCountdown(initial.remainingSec), '04:00');

  const warning = evaluateBedHoldState(hold, nowMs + 220 * 1000);
  assert.equal(warning.status, 'expiring_soon');
  assert.equal(formatCountdown(warning.remainingSec), '01:20');

  const expired = evaluateBedHoldState(hold, nowMs + 305 * 1000);
  assert.equal(expired.status, 'expired');
  assert.equal(expired.remainingSec, 0);
});

test('offline-first referral queue deduplicates retries and merges cleanly on reconnect', () => {
  const ref: EmergencyReferral = {
    referralId: 'REF-999',
    clientDedupeKey: 'dedupe-key-1',
    referringDoctorId: 'doc-1',
    referringDoctorName: 'Dr. Kavitha',
    referringHospitalName: 'Nandi Rural PHC',
    targetHospitalId: 'hosp-cmrit',
    targetHospitalName: 'CMRIT General',
    fallbackHospitalIds: [],
    patientInitials: 'S. M.',
    ageSex: '28F',
    category: 'Obstetric',
    urgency: 'critical',
    status: 'pending',
    vitals: { heartRate: 118, bp: '100/65', spo2: 93, temperatureC: 37.2, respRate: 24, recordedAt: new Date(nowMs).toISOString() },
    symptoms: 'Postpartum haemorrhage, tachycardia',
    requiredFacilities: ['ICU', 'Blood Bank'],
    requiredBedType: 'ICU',
    isbarSummary: 'ISBAR test payload',
    responseDeadlineAt: new Date(nowMs + 300000).toISOString(),
    ambulanceStatus: 'unassigned',
    syncStatus: 'pending_sync',
    createdAt: new Date(nowMs).toISOString(),
    updatedAt: new Date(nowMs).toISOString(),
  };

  const first = enqueueOfflineReferral([], ref);
  assert.equal(first.deduplicated, false);
  assert.equal(first.queue.length, 1);

  const retry = enqueueOfflineReferral(first.queue, ref);
  assert.equal(retry.deduplicated, true);
  assert.equal(retry.queue.length, 1);

  const synced = mergeSyncedReferrals([], retry.queue);
  assert.equal(synced.newlySyncedCount, 1);
  assert.equal(synced.merged[0].syncStatus, 'synced');

  const fhir = buildFhirReferralBundle(synced.merged[0]);
  assert.equal(fhir.resourceType, 'Bundle');
  assert.equal(fhir.entry.length, 2);
});
