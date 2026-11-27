import React, { useMemo, useRef, useState } from 'react';
import {
  Activity,
  AlertTriangle,
  Ambulance,
  CheckCircle2,
  Clock,
  Code2,
  Loader2,
  Mic,
  Send,
  ShieldAlert,
  Sparkles,
  Square,
  Stethoscope,
  WifiOff,
} from 'lucide-react';
import { useKairos } from '../context/KairosContext';
import type { ReferralUrgency } from '../types/kairos';
import {
  buildFhirReferralBundle,
  evaluateBedHoldState,
  formatCountdown,
  rankReceivingHospitals,
} from '../utils/kairosEngine';
import { blobToBase64, pickSupportedAudioMimeType } from '../utils/audioUtils';

const ALL_FACILITIES = ['ICU', 'Ventilator', 'NICU/OB-GYN', 'Cath Lab', 'Trauma OT', 'CT/MRI', 'Blood Bank'];
const CATEGORIES = [
  { label: 'Obstetric', dept: 'Obstetrics & Gynaecology' },
  { label: 'Chest pain / Cardiac', dept: 'Cardiology' },
  { label: 'Polytrauma / Road Accident', dept: 'Orthopaedics' },
  { label: 'Acute Stroke / Neuro', dept: 'Neurology' },
  { label: 'Paediatric Emergency', dept: 'Paediatrics' },
  { label: 'Respiratory Distress / Sepsis', dept: 'General Medicine' },
];

interface DoctorDashboardProps {
  activeTab: string;
  onTabChange: (tab: string) => void;
  searchQuery: string;
  onOpenAssistant: (notes?: string, applyCb?: (summary: string) => void) => void;
}

export const DoctorDashboard: React.FC<DoctorDashboardProps> = ({
  activeTab,
  onTabChange,
  searchQuery,
  onOpenAssistant,
}) => {
  const {
    hospitals,
    appointments,
    referrals,
    offlineReferralQueue,
    isOfflineSimulated,
    nowMs,
    createEmergencyReferral,
    syncOfflineReferralsNow,
    assignAmbulanceToReferral,
  } = useKairos();

  // Emergency Referral Wizard Form State
  const [patientInitials, setPatientInitials] = useState('');
  const [ageSex, setAgeSex] = useState('34F');
  const [category, setCategory] = useState('Obstetric');
  const [urgency, setUrgency] = useState<ReferralUrgency>('critical');
  const [requiredBedType, setRequiredBedType] = useState<'ICU' | 'General' | 'Peds'>('ICU');
  const [requiredFacilities, setRequiredFacilities] = useState<string[]>(['ICU', 'NICU/OB-GYN', 'Blood Bank']);
  const [heartRate, setHeartRate] = useState(116);
  const [bp, setBp] = useState('104/68');
  const [spo2, setSpo2] = useState(93);
  const [temperatureC, setTemperatureC] = useState(37.4);
  const [respRate, setRespRate] = useState(24);
  const [symptoms, setSymptoms] = useState('');
  const [isbarSummary, setIsbarSummary] = useState('');
  const [clinicianInstructions, setClinicianInstructions] = useState(
    'Maintain IV access, continuous SpO2 & ECG monitoring during transfer.'
  );
  const [reportName, setReportName] = useState('');
  const [selectedHospitalId, setSelectedHospitalId] = useState<string>('');
  const [manualOverride, setManualOverride] = useState(false);
  const [manualOverrideReason, setManualOverrideReason] = useState('');
  const [formError, setFormError] = useState<string | null>(null);
  const [fhirPreviewRefId, setFhirPreviewRefId] = useState<string | null>(null);
  const [isDictating, setIsDictating] = useState(false);
  const [isTranscribingNotes, setIsTranscribingNotes] = useState(false);
  const dictationRecorderRef = useRef<MediaRecorder | null>(null);
  const dictationChunksRef = useRef<Blob[]>([]);

  const handleToggleDictateSymptoms = async () => {
    if (isDictating && dictationRecorderRef.current) {
      dictationRecorderRef.current.stop();
      setIsDictating(false);
      return;
    }

    setFormError(null);
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const mimeType = pickSupportedAudioMimeType();
      const recorder = new MediaRecorder(stream, mimeType ? { mimeType } : undefined);
      dictationChunksRef.current = [];
      recorder.ondataavailable = (ev) => {
        if (ev.data.size > 0) dictationChunksRef.current.push(ev.data);
      };
      recorder.onstop = async () => {
        stream.getTracks().forEach((t) => t.stop());
        const blob = new Blob(dictationChunksRef.current, { type: mimeType || 'audio/webm' });
        if (blob.size < 150) return;
        setIsTranscribingNotes(true);
        try {
          const audioBase64 = await blobToBase64(blob);
          const res = await fetch('/api/ai/transcribe', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              audioBase64,
              mimeType: blob.type || mimeType,
              contextHint: 'Emergency clinical referral observations and vitals',
            }),
          });
          const data = (await res.json()) as { transcript?: string; error?: string };
          if (!res.ok || !data.transcript) {
            setFormError(data.error || 'Unable to transcribe clinical dictation.');
          } else {
            setSymptoms((prev) => (prev.trim() ? `${prev.trim()} ${data.transcript}` : data.transcript!));
          }
        } catch {
          setFormError('Network error reaching /api/ai/transcribe.');
        } finally {
          setIsTranscribingNotes(false);
        }
      };
      dictationRecorderRef.current = recorder;
      recorder.start();
      setIsDictating(true);
    } catch {
      setFormError('Microphone permission is required to dictate clinical observations.');
    }
  };

  const matchedDept =
    CATEGORIES.find((c) => c.label === category)?.dept ?? 'Emergency Medicine';

  const rankedHospitals = useMemo(
    () =>
      rankReceivingHospitals(hospitals, {
        department: matchedDept,
        requiredBedType,
        requiredFacilities,
        nowMs,
      }),
    [hospitals, matchedDept, nowMs, requiredBedType, requiredFacilities]
  );

  const effectiveTargetId =
    selectedHospitalId || rankedHospitals[0]?.hospital.hospitalId || hospitals[0]?.hospitalId;

  const filteredReferrals = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    if (!q) return referrals;
    return referrals.filter(
      (r) =>
        r.referralId.toLowerCase().includes(q) ||
        r.patientInitials.toLowerCase().includes(q) ||
        r.category.toLowerCase().includes(q) ||
        r.targetHospitalName.toLowerCase().includes(q)
    );
  }, [referrals, searchQuery]);

  const toggleFacility = (fac: string) => {
    setRequiredFacilities((prev) =>
      prev.includes(fac) ? prev.filter((f) => f !== fac) : [...prev, fac]
    );
  };

  const handleSubmitReferral = (e: React.FormEvent) => {
    e.preventDefault();
    setFormError(null);

    if (!effectiveTargetId || hospitals.length === 0) {
      setFormError('No receiving hospitals are registered yet. Register a hospital from the Hospital Desk or Admin portal first.');
      return;
    }
    if (!patientInitials.trim() || !symptoms.trim()) {
      setFormError('Patient initials/identifier and clinical observations are required.');
      return;
    }
    if (manualOverride && !manualOverrideReason.trim()) {
      setFormError('Please document the clinical protocol reason for Emergency Manual Override.');
      return;
    }

    const fallbackHospitalIds = rankedHospitals
      .filter((m) => m.hospital.hospitalId !== effectiveTargetId && m.hasAvailableBed)
      .map((m) => m.hospital.hospitalId);

    const autoIsbar =
      isbarSummary.trim() ||
      `I: ${patientInitials.trim()} (${ageSex}). S: ${category} (${urgency.toUpperCase()}). B: ${symptoms.trim()}. A: HR ${heartRate}, BP ${bp}, SpO2 ${spo2}%, Temp ${temperatureC}°C, RR ${respRate}/min. R: Requesting ${requiredBedType} bed with ${requiredFacilities.join(', ') || 'standard ED support'}.`;

    createEmergencyReferral({
      patientInitials,
      ageSex,
      category,
      urgency,
      vitals: {
        heartRate: Number(heartRate),
        bp,
        spo2: Number(spo2),
        temperatureC: Number(temperatureC),
        respRate: Number(respRate),
        recordedAt: new Date().toISOString(),
      },
      symptoms,
      requiredFacilities,
      requiredBedType,
      targetHospitalId: effectiveTargetId,
      fallbackHospitalIds,
      isbarSummary: autoIsbar,
      attachedReportName: reportName || undefined,
      clinicianInstructions,
      manualOverrideActive: manualOverride,
      manualOverrideReason: manualOverride ? manualOverrideReason : undefined,
      saveOffline: isOfflineSimulated,
    });

    setPatientInitials('');
    setSymptoms('');
    setIsbarSummary('');
    setReportName('');
    setManualOverride(false);
    setManualOverrideReason('');
    onTabChange('referrals');
  };

  const pendingCount = referrals.filter((r) => r.status === 'pending' || r.status === 'escalated').length;
  const acceptedTransitCount = referrals.filter((r) => r.status === 'accepted' || r.status === 'in_transit').length;

  return (
    <div className="space-y-6">
      {/* Offline Store-and-Forward Banner */}
      {(isOfflineSimulated || offlineReferralQueue.length > 0) && (
        <div className="rounded-2xl bg-amber-50 dark:bg-amber-950/40 border border-amber-300 dark:border-amber-700/70 p-4 flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-start gap-2.5 text-xs text-amber-950 dark:text-amber-100">
            <WifiOff className="w-4 h-4 text-amber-700 dark:text-amber-400 shrink-0 mt-0.5" />
            <div>
              <p className="font-bold">
                Offline-First Referral Queue ({offlineReferralQueue.length} pending sync · NOT YET RECEIVED BY HOSPITAL)
              </p>
              <p className="text-amber-800 dark:text-amber-300 mt-0.5">
                Referrals saved offline are queued locally with idempotency keys to prevent duplicates when weak rural connectivity returns.
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={syncOfflineReferralsNow}
            className="px-4 py-2 rounded-xl bg-kairos-forest text-white text-xs font-semibold hover:bg-kairos-emerald whitespace-nowrap"
          >
            Reconnect & Sync Now
          </button>
        </div>
      )}

      {/* OVERVIEW TAB */}
      {activeTab === 'overview' && (
        <>
          <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">
            <div className="bg-kairos-surface border border-kairos-border rounded-2xl p-5">
              <p className="text-xs font-medium text-kairos-muted">Today&apos;s Consultations</p>
              <p className="font-display text-2xl font-extrabold text-kairos-forest-ink mt-1 font-mono tabular-nums">
                {appointments.filter((a) => a.status !== 'cancelled').length}
              </p>
              <p className="text-xs text-kairos-muted mt-1">OPD + Rural Remote Specialist slots</p>
            </div>
            <div className="bg-kairos-forest text-white rounded-2xl p-5">
              <p className="text-xs font-medium text-emerald-200">Pending Hospital Responses</p>
              <p className="font-display text-2xl font-extrabold mt-1 font-mono tabular-nums">
                {pendingCount}
              </p>
              <p className="text-xs text-emerald-200/80 mt-1">Auto-escalation active at 5:00 SLA</p>
            </div>
            <div className="bg-kairos-surface border border-kairos-border rounded-2xl p-5">
              <p className="text-xs font-medium text-kairos-muted">Confirmed & En Route</p>
              <p className="font-display text-2xl font-extrabold text-kairos-emerald-ink mt-1 font-mono tabular-nums">
                {acceptedTransitCount}
              </p>
              <p className="text-xs text-kairos-muted mt-1">Bed held before ambulance departure</p>
            </div>
            <div className="bg-kairos-surface border border-kairos-border rounded-2xl p-5">
              <p className="text-xs font-medium text-kairos-muted">Offline Sync Queue</p>
              <p className="font-display text-2xl font-extrabold text-kairos-forest-ink mt-1 font-mono tabular-nums">
                {offlineReferralQueue.length}
              </p>
              <p className="text-xs text-kairos-muted mt-1">Deduplicated store-and-forward payloads</p>
            </div>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-12 gap-5">
            <div className="lg:col-span-7 bg-kairos-surface border border-kairos-border rounded-2xl p-6 space-y-4">
              <div className="flex items-center justify-between gap-2">
                <div>
                  <h2 className="font-display text-base font-bold text-kairos-forest-ink">
                    Active Emergency Referrals
                  </h2>
                  <p className="text-xs text-kairos-muted">
                    Real-time hospital responses, vitals, and bed-hold countdowns
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => onTabChange('new-referral')}
                  className="px-3.5 py-2 rounded-xl bg-kairos-emerald text-white text-xs font-semibold hover:bg-kairos-emerald-hover"
                >
                  + New ISBAR Referral
                </button>
              </div>

              <div className="space-y-3">
                {filteredReferrals.length === 0 && (
                  <p className="text-xs text-kairos-muted p-4 rounded-xl bg-kairos-surface-subtle border border-kairos-border-subtle">
                    No emergency referrals sent yet. Create a structured ISBAR referral to coordinate a bed before transfer.
                  </p>
                )}
                {filteredReferrals.map((ref) => {
                  const holdEval = ref.bedHold ? evaluateBedHoldState(ref.bedHold, nowMs) : null;
                  return (
                    <div
                      key={ref.referralId}
                      className="p-4 rounded-xl border border-kairos-border bg-kairos-surface-subtle space-y-2.5"
                    >
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <div className="flex items-center gap-2">
                          <span className="font-mono text-xs font-bold text-kairos-forest-ink">
                            {ref.referralId}
                          </span>
                          <span className="text-xs font-bold text-kairos-forest-ink">
                            · {ref.category} ({ref.patientInitials})
                          </span>
                        </div>
                        <span
                          className={`text-[11px] font-mono font-bold uppercase ${
                            ref.urgency === 'critical' ? 'text-red-700 dark:text-red-400' : 'text-amber-700 dark:text-amber-400'
                          }`}
                        >
                          {ref.urgency} · {ref.status.replace('_', ' ')}
                        </span>
                      </div>

                      <div className="flex flex-wrap gap-3 text-xs font-mono text-kairos-forest-ink/85 tabular-nums">
                        <span>HR {ref.vitals.heartRate}</span>
                        <span>SpO2 {ref.vitals.spo2}%</span>
                        <span>BP {ref.vitals.bp}</span>
                        <span>Temp {ref.vitals.temperatureC}°C</span>
                        <span>RR {ref.vitals.respRate}</span>
                      </div>

                      <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-kairos-muted pt-1">
                        <span>
                          Receiving: <strong className="text-kairos-forest-ink">{ref.targetHospitalName}</strong>
                          {ref.bedHold && holdEval && (
                            <>
                              {' '}· <strong className="text-kairos-emerald-ink">{ref.bedHold.bedLabel} Held {formatCountdown(holdEval.remainingSec)}</strong>
                            </>
                          )}
                        </span>
                        <button
                          type="button"
                          onClick={() => onTabChange('referrals')}
                          className="font-semibold text-kairos-emerald-ink hover:underline"
                        >
                          Track Handover →
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>

            <div className="lg:col-span-5 bg-kairos-surface border border-kairos-border rounded-2xl p-6 space-y-4">
              <div className="flex items-center justify-between">
                <h2 className="font-display text-base font-bold text-kairos-forest-ink">
                  Today&apos;s Specialist & OPD Schedule
                </h2>
                <Stethoscope className="w-4 h-4 text-kairos-emerald-ink" />
              </div>
              <div className="space-y-2.5">
                {appointments.length === 0 && (
                  <p className="text-xs text-kairos-muted p-3 rounded-xl bg-kairos-surface-subtle border border-kairos-border-subtle">
                    No OPD consultations scheduled yet.
                  </p>
                )}
                {appointments.slice(0, 5).map((a) => (
                  <div
                    key={a.appointmentId}
                    className="p-3 rounded-xl border border-kairos-border-subtle bg-kairos-surface-subtle flex items-center justify-between gap-2 text-xs"
                  >
                    <div className="min-w-0">
                      <p className="font-bold text-kairos-forest-ink truncate">
                        #{a.tokenNumber} · {a.patientName}
                      </p>
                      <p className="text-kairos-muted truncate">
                        {a.department} · {a.slotTime} ({a.consultationType})
                      </p>
                    </div>
                    <span className="font-mono text-[11px] font-semibold uppercase text-kairos-emerald-ink shrink-0">
                      {a.status}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </>
      )}

      {/* CREATE NEW STRUCTURED ISBAR EMERGENCY REFERRAL TAB */}
      {activeTab === 'new-referral' && (
        <form onSubmit={handleSubmitReferral} className="grid grid-cols-1 lg:grid-cols-12 gap-6">
          {/* Left: Patient Assessment & Vitals */}
          <div className="lg:col-span-7 bg-kairos-surface border border-kairos-border rounded-2xl p-6 space-y-5">
            <div className="flex flex-wrap items-center justify-between gap-2 pb-3 border-b border-kairos-border-subtle">
              <div>
                <h2 className="font-display text-lg font-bold text-kairos-forest-ink">
                  Step 1–2 · Structured ISBAR Emergency Referral
                </h2>
                <p className="text-xs text-kairos-muted">
                  Accept Before You Move · Capture vitals and required facilities before selecting a hospital
                </p>
              </div>
              <button
                type="button"
                onClick={() =>
                  onOpenAssistant(
                    `Patient ${patientInitials || '[initials]'} (${ageSex}), ${category}, HR ${heartRate}, BP ${bp}, SpO2 ${spo2}%, Temp ${temperatureC}C, RR ${respRate}. Notes: ${symptoms}`,
                    (draft) => setIsbarSummary(draft)
                  )
                }
                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-kairos-mint-soft border border-kairos-border text-xs font-semibold text-kairos-forest-ink hover:bg-kairos-mint-soft"
              >
                <Sparkles className="w-3.5 h-3.5 text-kairos-emerald-ink" />
                Draft ISBAR with Assistant
              </button>
            </div>

            {formError && (
              <div className="p-3 rounded-xl bg-red-50 dark:bg-red-950/40 border border-red-200 dark:border-red-900/60 text-xs text-red-700 dark:text-red-400">
                {formError}
              </div>
            )}

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3.5">
              <div>
                <label htmlFor="ref-patient" className="block text-xs font-semibold text-kairos-forest-ink mb-1">
                  Patient Name / Initials *
                </label>
                <input
                  id="ref-patient"
                  type="text"
                  required
                  value={patientInitials}
                  onChange={(e) => setPatientInitials(e.target.value)}
                  placeholder="e.g., S. Murthy"
                  className="w-full rounded-xl border border-kairos-border px-3 py-2 text-sm text-kairos-forest-ink"
                />
              </div>
              <div>
                <label htmlFor="ref-agesex" className="block text-xs font-semibold text-kairos-forest-ink mb-1">
                  Age / Sex
                </label>
                <input
                  id="ref-agesex"
                  type="text"
                  value={ageSex}
                  onChange={(e) => setAgeSex(e.target.value)}
                  placeholder="e.g., 34F"
                  className="w-full rounded-xl border border-kairos-border px-3 py-2 text-sm text-kairos-forest-ink"
                />
              </div>
              <div>
                <label htmlFor="ref-category" className="block text-xs font-semibold text-kairos-forest-ink mb-1">
                  Emergency Category
                </label>
                <select
                  id="ref-category"
                  value={category}
                  onChange={(e) => setCategory(e.target.value)}
                  className="w-full rounded-xl border border-kairos-border px-3 py-2 text-sm text-kairos-forest-ink"
                >
                  {CATEGORIES.map((c) => (
                    <option key={c.label} value={c.label}>{c.label}</option>
                  ))}
                </select>
              </div>
            </div>

            {/* Urgency & Bed Type */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <span className="block text-xs font-semibold text-kairos-forest-ink mb-1.5">Urgency Level</span>
                <div className="grid grid-cols-3 gap-2">
                  {(['critical', 'urgent', 'priority'] as ReferralUrgency[]).map((u) => (
                    <button
                      key={u}
                      type="button"
                      onClick={() => setUrgency(u)}
                      className={`py-2 rounded-xl text-xs font-bold uppercase border transition-colors ${
                        urgency === u
                          ? u === 'critical'
                            ? 'bg-red-600 text-white border-red-600'
                            : 'bg-kairos-forest text-white border-kairos-forest'
                          : 'bg-kairos-surface-subtle text-kairos-forest-ink border-kairos-border'
                      }`}
                    >
                      {u}
                    </button>
                  ))}
                </div>
              </div>
              <div>
                <span className="block text-xs font-semibold text-kairos-forest-ink mb-1.5">Required Bed Type</span>
                <div className="grid grid-cols-3 gap-2">
                  {(['ICU', 'General', 'Peds'] as const).map((b) => (
                    <button
                      key={b}
                      type="button"
                      onClick={() => setRequiredBedType(b)}
                      className={`py-2 rounded-xl text-xs font-bold border transition-colors ${
                        requiredBedType === b
                          ? 'bg-kairos-emerald text-white border-kairos-emerald'
                          : 'bg-kairos-surface-subtle text-kairos-forest-ink border-kairos-border'
                      }`}
                    >
                      {b}
                    </button>
                  ))}
                </div>
              </div>
            </div>

            {/* 5 Mandatory Clinical Vitals */}
            <div>
              <span className="block text-xs font-semibold text-kairos-forest-ink mb-2">
                Recorded Vital Signs
              </span>
              <div className="grid grid-cols-2 sm:grid-cols-5 gap-2.5">
                <div>
                  <label htmlFor="v-hr" className="block text-[11px] text-kairos-muted mb-1">HR (bpm)</label>
                  <input
                    id="v-hr"
                    type="number"
                    min={20}
                    max={250}
                    value={heartRate}
                    onChange={(e) => setHeartRate(Number(e.target.value))}
                    className="w-full rounded-xl border border-kairos-border px-2.5 py-2 text-sm font-mono tabular-nums text-kairos-forest-ink"
                  />
                </div>
                <div>
                  <label htmlFor="v-bp" className="block text-[11px] text-kairos-muted mb-1">BP (mmHg)</label>
                  <input
                    id="v-bp"
                    type="text"
                    value={bp}
                    onChange={(e) => setBp(e.target.value)}
                    className="w-full rounded-xl border border-kairos-border px-2.5 py-2 text-sm font-mono tabular-nums text-kairos-forest-ink"
                  />
                </div>
                <div>
                  <label htmlFor="v-spo2" className="block text-[11px] text-kairos-muted mb-1">SpO2 (%)</label>
                  <input
                    id="v-spo2"
                    type="number"
                    min={50}
                    max={100}
                    value={spo2}
                    onChange={(e) => setSpo2(Number(e.target.value))}
                    className="w-full rounded-xl border border-kairos-border px-2.5 py-2 text-sm font-mono tabular-nums text-kairos-forest-ink"
                  />
                </div>
                <div>
                  <label htmlFor="v-temp" className="block text-[11px] text-kairos-muted mb-1">Temp (°C)</label>
                  <input
                    id="v-temp"
                    type="number"
                    step="0.1"
                    min={32}
                    max={43}
                    value={temperatureC}
                    onChange={(e) => setTemperatureC(Number(e.target.value))}
                    className="w-full rounded-xl border border-kairos-border px-2.5 py-2 text-sm font-mono tabular-nums text-kairos-forest-ink"
                  />
                </div>
                <div>
                  <label htmlFor="v-rr" className="block text-[11px] text-kairos-muted mb-1">RR (/min)</label>
                  <input
                    id="v-rr"
                    type="number"
                    min={6}
                    max={60}
                    value={respRate}
                    onChange={(e) => setRespRate(Number(e.target.value))}
                    className="w-full rounded-xl border border-kairos-border px-2.5 py-2 text-sm font-mono tabular-nums text-kairos-forest-ink"
                  />
                </div>
              </div>
            </div>

            {/* Required Facilities */}
            <div>
              <span className="block text-xs font-semibold text-kairos-forest-ink mb-2">
                Required Receiving Facilities (drives transparent matching)
              </span>
              <div className="flex flex-wrap gap-2">
                {ALL_FACILITIES.map((fac) => {
                  const selected = requiredFacilities.includes(fac);
                  return (
                    <button
                      key={fac}
                      type="button"
                      onClick={() => toggleFacility(fac)}
                      className={`px-3 py-1.5 rounded-xl text-xs font-semibold border transition-colors ${
                        selected
                          ? 'bg-kairos-forest text-white border-kairos-forest'
                          : 'bg-kairos-surface-subtle text-kairos-forest-ink border-kairos-border hover:border-kairos-emerald'
                      }`}
                    >
                      {fac}
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Clinical Observations & ISBAR */}
            <div>
              <div className="flex flex-wrap items-center justify-between gap-2 mb-1">
                <label htmlFor="ref-symptoms" className="block text-xs font-semibold text-kairos-forest-ink">
                  Symptoms &amp; Clinical Observations *
                </label>
                <button
                  type="button"
                  disabled={isTranscribingNotes}
                  onClick={() => void handleToggleDictateSymptoms()}
                  className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-[11px] font-semibold border transition-colors ${
                    isDictating
                      ? 'bg-red-600 text-white border-red-600'
                      : 'bg-kairos-mint-soft text-kairos-forest-ink border-kairos-border hover:bg-kairos-mint-soft'
                  }`}
                >
                  {isTranscribingNotes ? (
                    <Loader2 className="w-3 h-3 animate-spin" />
                  ) : isDictating ? (
                    <Square className="w-3 h-3" />
                  ) : (
                    <Mic className="w-3 h-3 text-kairos-emerald-ink" />
                  )}
                  {isTranscribingNotes
                    ? 'Transcribing...'
                    : isDictating
                      ? 'Stop Dictation'
                      : 'Dictate (Mic)'}
                </button>
              </div>
              <textarea
                id="ref-symptoms"
                rows={3}
                required
                value={symptoms}
                onChange={(e) => setSymptoms(e.target.value)}
                placeholder="Summarize onset, primary clinical findings, IV fluids/stabilization already performed..."
                className="w-full rounded-xl border border-kairos-border px-3.5 py-2 text-sm text-kairos-forest-ink"
              />
            </div>

            <div>
              <label htmlFor="ref-isbar" className="block text-xs font-semibold text-kairos-forest-ink mb-1">
                Structured ISBAR Summary (Auto-populated if blank, or drafted via Assistant)
              </label>
              <textarea
                id="ref-isbar"
                rows={3}
                value={isbarSummary}
                onChange={(e) => setIsbarSummary(e.target.value)}
                placeholder="I: ... S: ... B: ... A: ... R: ..."
                className="w-full rounded-xl border border-kairos-border px-3.5 py-2 text-xs text-kairos-forest-ink"
              />
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
              <div>
                <label htmlFor="ref-inst" className="block text-xs font-semibold text-kairos-forest-ink mb-1">
                  Ambulance & ED Instructions
                </label>
                <input
                  id="ref-inst"
                  type="text"
                  value={clinicianInstructions}
                  onChange={(e) => setClinicianInstructions(e.target.value)}
                  className="w-full rounded-xl border border-kairos-border px-3 py-2 text-xs text-kairos-forest-ink"
                />
              </div>
              <div>
                <label htmlFor="ref-file" className="block text-xs font-semibold text-kairos-forest-ink mb-1">
                  Attach ECG / Lab Report
                </label>
                <input
                  id="ref-file"
                  type="file"
                  onChange={(e) => setReportName(e.target.files?.[0]?.name || '')}
                  className="w-full text-xs text-kairos-muted file:mr-2 file:py-1.5 file:px-3 file:rounded-lg file:border-0 file:bg-kairos-forest file:text-white file:text-xs"
                />
              </div>
            </div>

            {/* Emergency Manual Override Safety Requirement */}
            <div className="p-4 rounded-xl bg-red-50 dark:bg-red-950/40 border border-red-200 dark:border-red-900/60 space-y-2.5">
              <label className="flex items-start gap-2.5 cursor-pointer">
                <input
                  type="checkbox"
                  checked={manualOverride}
                  onChange={(e) => setManualOverride(e.target.checked)}
                  className="mt-0.5 rounded border-red-300 dark:border-red-800/70 text-red-600 dark:text-red-400"
                />
                <span className="text-xs text-red-900 dark:text-red-200">
                  <strong>Emergency Manual Override Protocol:</strong> Invoke only if waiting for digital hospital acceptance could endanger the patient. Dispatches ambulance immediately while alerting the receiving ED in parallel. Clinical judgment always takes priority.
                </span>
              </label>
              {manualOverride && (
                <input
                  type="text"
                  value={manualOverrideReason}
                  onChange={(e) => setManualOverrideReason(e.target.value)}
                  placeholder="Required clinical reason for immediate dispatch override..."
                  className="w-full rounded-lg border border-red-300 dark:border-red-800/70 bg-kairos-surface px-3 py-2 text-xs text-red-950"
                />
              )}
            </div>
          </div>

          {/* Right: Transparent Smart Hospital Matcher */}
          <div className="lg:col-span-5 bg-kairos-surface border border-kairos-border rounded-2xl p-6 flex flex-col justify-between space-y-4">
            <div className="space-y-4">
              <div>
                <h2 className="font-display text-lg font-bold text-kairos-forest-ink">
                  Step 3 · Transparent Hospital Matching
                </h2>
                <p className="text-xs text-kairos-muted mt-0.5">
                  Ranked explicitly by distance, specialty, required facilities, and timestamped verified capacity — never an opaque AI black box.
                </p>
              </div>

              <div className="space-y-3">
                {rankedHospitals.length === 0 && (
                  <div className="p-4 rounded-xl bg-kairos-surface-subtle border border-kairos-border text-xs text-kairos-muted leading-relaxed">
                    No receiving hospitals are registered in the network yet. Sign in to the Hospital Desk or Administrator portal to register hospitals and verified bed counts.
                  </div>
                )}
                {rankedHospitals.map((match) => {
                  const isSelected = effectiveTargetId === match.hospital.hospitalId;
                  return (
                    <button
                      key={match.hospital.hospitalId}
                      type="button"
                      onClick={() => setSelectedHospitalId(match.hospital.hospitalId)}
                      className={`w-full text-left p-4 rounded-xl border transition-colors ${
                        isSelected
                          ? 'bg-kairos-forest text-white border-kairos-forest'
                          : 'bg-kairos-surface-subtle text-kairos-forest-ink border-kairos-border hover:border-kairos-emerald'
                      }`}
                    >
                      <div className="flex items-start justify-between gap-2">
                        <div>
                          <p className="text-sm font-bold">{match.hospital.name}</p>
                          <p className={`text-[11px] ${isSelected ? 'text-emerald-200' : 'text-kairos-muted'}`}>
                            {match.hospital.area} · {match.hospital.distanceKm} km (~{match.estimatedDriveMin} min)
                          </p>
                        </div>
                        <span
                          className={`font-mono text-sm font-extrabold tabular-nums ${
                            isSelected ? 'text-kairos-gold' : match.hasAvailableBed ? 'text-kairos-emerald-ink' : 'text-red-600 dark:text-red-400'
                          }`}
                        >
                          {match.matchPercent}% match
                        </span>
                      </div>

                      <ul className={`mt-2.5 space-y-1 text-[11px] ${isSelected ? 'text-emerald-100' : 'text-kairos-muted'}`}>
                        {match.reasons.map((r) => (
                          <li key={r}>✓ {r}</li>
                        ))}
                        {match.warnings.map((w) => (
                          <li key={w} className={isSelected ? 'text-amber-300 font-semibold' : 'text-red-700 dark:text-red-400 font-semibold'}>
                            ⚠ {w}
                          </li>
                        ))}
                      </ul>
                    </button>
                  );
                })}
              </div>
            </div>

            <div className="pt-3 border-t border-kairos-border-subtle space-y-2.5">
              <button
                type="submit"
                className={`w-full inline-flex items-center justify-center gap-2 py-3 px-5 rounded-xl text-white text-sm font-bold transition-colors ${
                  manualOverride
                    ? 'bg-red-600 hover:bg-red-700'
                    : isOfflineSimulated
                      ? 'bg-amber-600 hover:bg-amber-700'
                      : 'bg-kairos-emerald hover:bg-kairos-emerald-hover'
                }`}
              >
                <Send className="w-4 h-4" />
                {manualOverride
                  ? 'Invoke Emergency Override & Dispatch'
                  : isOfflineSimulated
                    ? 'Save Referral to Offline Queue'
                    : 'Send Structured Referral (Accept Before Move)'}
              </button>
              <p className="text-[11px] text-kairos-muted text-center">
                If declined or 5-min timer expires, KAIROS escalates to the next matched accepting hospital automatically.
              </p>
            </div>
          </div>
        </form>
      )}

      {/* REFERRALS MONITOR & HL7 FHIR R4 EXPORT TAB */}
      {activeTab === 'referrals' && (
        <div className="space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <h2 className="font-display text-lg font-bold text-kairos-forest-ink">
                Sent Emergency Referrals & Handover Tracker ({filteredReferrals.length})
              </h2>
              <p className="text-xs text-kairos-muted">
                Monitor real-time hospital acceptance, time-limited bed holds, ambulance assignment, and HL7 FHIR R4 payloads.
              </p>
            </div>
            <button
              type="button"
              onClick={() => onTabChange('new-referral')}
              className="px-4 py-2 rounded-xl bg-kairos-forest text-white text-xs font-semibold hover:bg-kairos-emerald"
            >
              + New Emergency Referral
            </button>
          </div>

          <div className="space-y-4">
            {filteredReferrals.length === 0 && (
              <div className="bg-kairos-surface border border-kairos-border rounded-2xl p-8 text-center text-xs text-kairos-muted">
                No emergency referrals sent yet.
              </div>
            )}
            {filteredReferrals.map((ref) => {
              const holdEval = ref.bedHold ? evaluateBedHoldState(ref.bedHold, nowMs) : null;
              const slaRemaining = Math.max(0, Math.floor((Date.parse(ref.responseDeadlineAt) - nowMs) / 1000));
              const showFhir = fhirPreviewRefId === ref.referralId;
              return (
                <div
                  key={ref.referralId}
                  className="bg-kairos-surface border border-kairos-border rounded-2xl p-5 space-y-4"
                >
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div>
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="font-mono text-sm font-extrabold text-kairos-forest-ink">
                          {ref.referralId}
                        </span>
                        <span className="text-sm font-bold text-kairos-forest-ink">
                          · {ref.category} · {ref.patientInitials} ({ref.ageSex})
                        </span>
                        {ref.manualOverrideActive && (
                          <span className="inline-flex items-center gap-1 text-xs font-bold text-red-700 dark:text-red-400">
                            <ShieldAlert className="w-3.5 h-3.5" /> MANUAL OVERRIDE
                          </span>
                        )}
                      </div>
                      <p className="text-xs text-kairos-muted mt-1">
                        Target: <strong className="text-kairos-forest-ink">{ref.targetHospitalName}</strong> · Required: {ref.requiredBedType} ({ref.requiredFacilities.join(', ')})
                      </p>
                    </div>

                    <div className="text-right">
                      <p className="font-mono text-xs font-extrabold uppercase text-kairos-emerald-ink">
                        {ref.status.replace('_', ' ')}
                      </p>
                      {(ref.status === 'pending' || ref.status === 'escalated') && (
                        <p className="text-xs font-mono text-amber-700 dark:text-amber-400 tabular-nums mt-0.5">
                          <Clock className="w-3 h-3 inline mr-1" />
                          SLA {formatCountdown(slaRemaining)}
                        </p>
                      )}
                      {ref.bedHold && holdEval && (
                        <p className="text-xs font-mono font-bold text-kairos-forest-ink tabular-nums mt-0.5">
                          {ref.bedHold.bedLabel} · {holdEval.status === 'converted_admitted' ? 'Admitted' : `Held ${formatCountdown(holdEval.remainingSec)}`}
                        </p>
                      )}
                    </div>
                  </div>

                  <p className="text-xs text-kairos-forest-ink/85 bg-kairos-surface-subtle border border-kairos-border rounded-xl p-3 leading-relaxed">
                    {ref.isbarSummary}
                  </p>

                  {ref.declineReason && (
                    <div className="p-3 rounded-xl bg-amber-50 dark:bg-amber-950/40 border border-amber-200 dark:border-amber-800/60 text-xs text-amber-900 dark:text-amber-200 flex items-center gap-2">
                      <AlertTriangle className="w-4 h-4 shrink-0" />
                      <span>{ref.declineReason}</span>
                    </div>
                  )}

                  <div className="flex flex-wrap items-center justify-between gap-3 pt-2 border-t border-kairos-border-subtle">
                    <div className="flex flex-wrap items-center gap-3 text-xs font-mono text-kairos-forest-ink/85 tabular-nums">
                      <span>HR {ref.vitals.heartRate}</span>
                      <span>SpO2 {ref.vitals.spo2}%</span>
                      <span>BP {ref.vitals.bp}</span>
                      <span>Ambulance: {ref.ambulanceStatus.replace('_', ' ')}</span>
                    </div>

                    <div className="flex flex-wrap items-center gap-2">
                      {ref.status === 'accepted' && ref.ambulanceStatus === 'unassigned' && (
                        <button
                          type="button"
                          onClick={() => assignAmbulanceToReferral(ref.referralId)}
                          className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-kairos-emerald text-white text-xs font-semibold hover:bg-kairos-emerald-hover"
                        >
                          <Ambulance className="w-3.5 h-3.5" />
                          Assign Ambulance KA-01
                        </button>
                      )}
                      <button
                        type="button"
                        onClick={() => setFhirPreviewRefId(showFhir ? null : ref.referralId)}
                        className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-kairos-border text-xs font-semibold text-kairos-forest-ink hover:bg-kairos-mint-soft"
                      >
                        <Code2 className="w-3.5 h-3.5" />
                        {showFhir ? 'Hide HL7 FHIR R4' : 'Inspect HL7 FHIR R4'}
                      </button>
                    </div>
                  </div>

                  {showFhir && (
                    <pre className="p-4 rounded-xl bg-kairos-forest-deep text-emerald-100 text-[11px] font-mono overflow-x-auto max-h-64">
                      {JSON.stringify(buildFhirReferralBundle(ref), null, 2)}
                    </pre>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
};
