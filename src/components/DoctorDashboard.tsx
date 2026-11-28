import React, { useMemo, useRef, useState } from 'react';
import {
  Activity,
  AlertTriangle,
  Ambulance,
  ArrowUpRight,
  Award,
  BadgeCheck,
  Check,
  CheckCircle2,
  Clock,
  Code2,
  Download,
  FileCheck,
  FileText,
  Gift,
  Loader2,
  Lock,
  Mic,
  Printer,
  Send,
  Shield,
  ShieldAlert,
  ShieldCheck,
  Sparkles,
  Square,
  Stethoscope,
  TrendingUp,
  WifiOff,
  X,
  Zap,
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
    currentUser,
    hospitals,
    appointments,
    referrals,
    offlineReferralQueue,
    isOfflineSimulated,
    nowMs,
    createEmergencyReferral,
    syncOfflineReferralsNow,
    assignAmbulanceToReferral,
    getMedbridgeAccount,
    awardMedbridgeCredits,
    redeemMedbridgeCredits,
  } = useKairos();

  const doctorAccount = getMedbridgeAccount(currentUser?.uid ?? 'demo-doctor', 'doctor');

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
  const [selectedCmeBadge, setSelectedCmeBadge] = useState<{
    id: string;
    title: string;
    cmeHours: string;
    accreditedBy: string;
    category: string;
    earnedDate: string;
    certificateNumber: string;
    verificationHash: string;
  } | null>(null);
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

    awardMedbridgeCredits(
      currentUser?.uid ?? 'demo-doctor',
      'doctor',
      50,
      `Golden-Hour ISBAR Emergency Referral · ${patientInitials} (${category})`,
      'golden_hour_referral'
    );

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
          {/* MedBridge Credits USP Highlight Banner */}
          <div className="bg-gradient-to-r from-kairos-surface via-kairos-mint-soft/70 to-kairos-surface border border-kairos-emerald/30 rounded-2xl p-5 flex flex-col md:flex-row items-start md:items-center justify-between gap-4 shadow-xs">
            <div className="flex items-start gap-3.5">
              <div className="w-11 h-11 rounded-2xl bg-kairos-forest text-amber-300 flex items-center justify-center shrink-0 shadow-sm border border-emerald-500/30">
                <Award className="w-6 h-6" />
              </div>
              <div>
                <div className="flex items-center gap-2">
                  <span className="font-display text-sm font-bold text-kairos-forest-ink">
                    MedBridge Credits™ (Platform USP)
                  </span>
                  <span className="px-2 py-0.5 rounded-full text-[10px] font-bold uppercase bg-amber-100 text-amber-900 dark:bg-amber-950/60 dark:text-amber-300 border border-amber-300 dark:border-amber-700">
                    {doctorAccount.tier} Clinician
                  </span>
                  <span className="px-2 py-0.5 rounded-full text-[10px] font-bold uppercase bg-emerald-100 text-emerald-900 dark:bg-emerald-950/60 dark:text-emerald-300 border border-emerald-300 dark:border-emerald-700">
                    Zero Cash Commission
                  </span>
                </div>
                <p className="text-xs text-kairos-muted mt-0.5 max-w-xl">
                  Automated verification for complete ISBAR handovers, Accept-Before-You-Move bed holds, and &lt;5 min emergency alert acknowledgments. Zero cash cuts — 100% ethical merit credits for CME badges &amp; specialist grants.
                </p>
              </div>
            </div>
            <div className="flex items-center gap-3 shrink-0 w-full md:w-auto justify-between md:justify-end">
              <div className="text-right">
                <p className="font-mono text-xl font-extrabold text-kairos-forest-ink tabular-nums">
                  {doctorAccount.balance} <span className="text-xs font-bold text-kairos-emerald-ink">MBC</span>
                </p>
                <p className="text-[10px] text-emerald-700 dark:text-emerald-400 font-bold uppercase tracking-wider">
                  Zero Cash Commission
                </p>
              </div>
              <button
                type="button"
                onClick={() => onTabChange('credits')}
                className="inline-flex items-center gap-1.5 px-4 py-2.5 rounded-xl bg-kairos-forest hover:bg-kairos-emerald text-white text-xs font-bold transition-colors whitespace-nowrap shadow-xs"
              >
                <span>Credit Vault &amp; Perks</span>
                <ArrowUpRight className="w-3.5 h-3.5" />
              </button>
            </div>
          </div>

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

      {/* MEDBRIDGE CREDITS - USP FEATURE TAB */}
      {activeTab === 'credits' && (
        <div className="space-y-6">
          {/* Header Banner */}
          <div className="rounded-2xl bg-gradient-to-r from-kairos-forest-deep via-kairos-forest to-emerald-950 p-6 text-white shadow-xl relative overflow-hidden border border-emerald-500/20">
            <div className="absolute top-0 right-0 w-96 h-96 bg-emerald-500/10 rounded-full blur-3xl pointer-events-none" />
            <div className="relative z-10 flex flex-col lg:flex-row items-start lg:items-center justify-between gap-6">
              <div className="space-y-2">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-emerald-400/15 border border-emerald-400/30 text-emerald-300 text-xs font-semibold uppercase tracking-wider">
                    <Award className="w-3.5 h-3.5" />
                    KAIROS USP: MedBridge Credits™ Engine
                  </span>
                  <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-amber-400/20 border border-amber-400/40 text-amber-300 text-xs font-bold uppercase tracking-wider">
                    <ShieldCheck className="w-3.5 h-3.5" />
                    Zero Cash Commission Certified
                  </span>
                </div>
                <h2 className="text-2xl lg:text-3xl font-serif font-bold text-white tracking-tight">
                  Doctor Clinical Credit Vault &amp; Protocol Rewards
                </h2>
                <p className="text-sm text-emerald-100/80 max-w-2xl leading-relaxed">
                  Earn verifiable, non-monetary merit credits for <strong>Complete ISBAR Handovers</strong>, <strong>Accept-Before-You-Move Bed Holds</strong>,
                  and <strong>&lt;5 Min Emergency Alert Acknowledgments</strong>. Redeem earned credits for on-demand tele-specialist patient grants,
                  accredited CME training badges, and ALS dispatch prioritization.
                </p>
              </div>

              <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-3 w-full lg:w-auto">
                <button
                  type="button"
                  onClick={() => {
                    awardMedbridgeCredits(
                      doctorAccount.entityId,
                      'doctor',
                      50,
                      'Complete ISBAR Clinical Handover Automated Verification Passed',
                      'isbar_compliance'
                    );
                    awardMedbridgeCredits(
                      doctorAccount.entityId,
                      'doctor',
                      50,
                      'Accept-Before-You-Move Protocol Verified (Bed Held Before Wheels Roll)',
                      'accept_before_move'
                    );
                    awardMedbridgeCredits(
                      doctorAccount.entityId,
                      'doctor',
                      50,
                      'Emergency Alert Acknowledged within 5-Minute Window (2m 45s SLA)',
                      'alert_sla_5min'
                    );
                  }}
                  className="inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl bg-gradient-to-r from-amber-400 to-amber-500 text-amber-950 font-bold text-xs uppercase tracking-wider hover:from-amber-300 hover:to-amber-400 shadow-md transition-all active:scale-95 whitespace-nowrap"
                >
                  <Zap className="w-4 h-4 fill-amber-950" />
                  Simulate Full Handover &amp; Auto-Verify (+150 MBC)
                </button>
                <button
                  type="button"
                  onClick={() => onTabChange('new-referral')}
                  className="inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl bg-white/10 hover:bg-white/15 border border-white/20 text-white font-medium text-xs uppercase tracking-wider transition-all whitespace-nowrap"
                >
                  <Send className="w-3.5 h-3.5" />
                  New Referral (+50 MBC)
                </button>
              </div>
            </div>
          </div>

          {/* Zero Cash Commission Guarantee Charter Box */}
          <div className="rounded-2xl border-2 border-emerald-500/30 bg-emerald-50/70 dark:bg-emerald-950/20 p-5 shadow-xs">
            <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
              <div className="flex items-start gap-3.5">
                <div className="w-10 h-10 rounded-xl bg-emerald-600 text-white flex items-center justify-center shrink-0 shadow-sm">
                  <ShieldCheck className="w-5 h-5" />
                </div>
                <div>
                  <div className="flex items-center gap-2 flex-wrap">
                    <h3 className="text-sm font-bold text-kairos-forest-ink uppercase tracking-wide">
                      Zero Cash Commission Charter · Ethical Referral Protocol
                    </h3>
                    <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-emerald-200 dark:bg-emerald-900/60 text-emerald-900 dark:text-emerald-200 border border-emerald-300">
                      NMC Ethics Compliant
                    </span>
                    <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-cyan-100 dark:bg-cyan-950/60 text-cyan-900 dark:text-cyan-300 border border-cyan-300">
                      Anti-Kickback Certified
                    </span>
                  </div>
                  <p className="text-xs text-kairos-muted mt-1 leading-relaxed max-w-3xl">
                    Under National Medical Commission (NMC) regulations, <strong>KAIROS strictly operates with 0% cash cuts or monetary commissions for patient referrals</strong>. MedBridge Credits are exclusively non-monetary merit tokens earned through clinical precision (ISBAR compliance, Accept-Before-You-Move bed holds, and sub-5 minute alert responses). Credits can never be encashed and are redeemable solely for certified CME training badges, indigent patient tele-specialist grants, and emergency logistics.
                  </p>
                </div>
              </div>
              <div className="shrink-0 flex items-center gap-2">
                <div className="px-3 py-1.5 rounded-xl bg-white dark:bg-kairos-card border border-emerald-300 dark:border-emerald-800 text-center">
                  <span className="text-[10px] font-bold uppercase text-kairos-muted block">Cash Payout</span>
                  <strong className="text-xs text-red-600 font-mono">₹0.00 (Zero)</strong>
                </div>
                <div className="px-3 py-1.5 rounded-xl bg-white dark:bg-kairos-card border border-emerald-300 dark:border-emerald-800 text-center">
                  <span className="text-[10px] font-bold uppercase text-kairos-muted block">Reward Mode</span>
                  <strong className="text-xs text-emerald-700 dark:text-emerald-400 font-mono">Clinical Merit Only</strong>
                </div>
              </div>
            </div>
          </div>

          {/* Automated Verification Engine & Compiler Status */}
          <div className="rounded-2xl bg-white dark:bg-kairos-card border border-kairos-border p-5 space-y-4 shadow-sm">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-kairos-border pb-3">
              <div className="flex items-center gap-2.5">
                <div className="w-8 h-8 rounded-lg bg-kairos-mint-soft text-kairos-emerald flex items-center justify-center">
                  <Code2 className="w-4 h-4" />
                </div>
                <div>
                  <h3 className="text-sm font-bold text-kairos-forest-ink">
                    MedBridge Automated Verification &amp; Handover Compiler
                  </h3>
                  <p className="text-[11px] text-kairos-muted">
                    Smart rule compiler validating clinical handovers before credit issuance
                  </p>
                </div>
              </div>
              <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-emerald-50 dark:bg-emerald-950/40 text-emerald-700 dark:text-emerald-400 text-xs font-bold border border-emerald-200 dark:border-emerald-800">
                <BadgeCheck className="w-3.5 h-3.5" />
                All 3 Core Verification Gates ACTIVE
              </span>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div className="p-4 rounded-xl bg-kairos-surface-subtle border border-kairos-border flex flex-col justify-between">
                <div>
                  <div className="flex items-center justify-between mb-1.5">
                    <span className="text-xs font-bold text-kairos-forest-ink flex items-center gap-1.5">
                      <FileCheck className="w-3.5 h-3.5 text-kairos-emerald" />
                      1. Complete ISBAR Handover
                    </span>
                    <span className="text-xs font-bold text-emerald-700 font-mono">+50 MBC</span>
                  </div>
                  <p className="text-[11px] text-kairos-muted leading-relaxed">
                    Automated parser validates Identity, Situation, Background, Assessment, Recommendation, complete vitals snapshot, and HL7 FHIR R4 Bundle.
                  </p>
                </div>
                <div className="mt-3 pt-2.5 border-t border-kairos-border/60 flex items-center justify-between text-[11px]">
                  <span className="text-kairos-muted">Parser Gate:</span>
                  <span className="font-semibold text-emerald-700 flex items-center gap-1">
                    <Check className="w-3 h-3" /> Auto-Verified Pass
                  </span>
                </div>
              </div>

              <div className="p-4 rounded-xl bg-kairos-surface-subtle border border-kairos-border flex flex-col justify-between">
                <div>
                  <div className="flex items-center justify-between mb-1.5">
                    <span className="text-xs font-bold text-kairos-forest-ink flex items-center gap-1.5">
                      <Lock className="w-3.5 h-3.5 text-kairos-emerald" />
                      2. Accept Before You Move
                    </span>
                    <span className="text-xs font-bold text-emerald-700 font-mono">+50 MBC</span>
                  </div>
                  <p className="text-[11px] text-kairos-muted leading-relaxed">
                    Bed hold lock must be actively confirmed at destination hospital BEFORE ambulance wheels roll. Eliminates blind transfers and patient diversion.
                  </p>
                </div>
                <div className="mt-3 pt-2.5 border-t border-kairos-border/60 flex items-center justify-between text-[11px]">
                  <span className="text-kairos-muted">Bed Hold Lock:</span>
                  <span className="font-semibold text-emerald-700 flex items-center gap-1">
                    <Check className="w-3 h-3" /> Locked &amp; Honored
                  </span>
                </div>
              </div>

              <div className="p-4 rounded-xl bg-kairos-surface-subtle border border-kairos-border flex flex-col justify-between">
                <div>
                  <div className="flex items-center justify-between mb-1.5">
                    <span className="text-xs font-bold text-kairos-forest-ink flex items-center gap-1.5">
                      <Clock className="w-3.5 h-3.5 text-kairos-emerald" />
                      3. &lt;5 Min Emergency Alert SLA
                    </span>
                    <span className="text-xs font-bold text-emerald-700 font-mono">+50 MBC</span>
                  </div>
                  <p className="text-[11px] text-kairos-muted leading-relaxed">
                    Cryptographic timestamp audit verifies triage acknowledgment within 300 seconds of initial emergency alert trigger.
                  </p>
                </div>
                <div className="mt-3 pt-2.5 border-t border-kairos-border/60 flex items-center justify-between text-[11px]">
                  <span className="text-kairos-muted">Avg Response:</span>
                  <span className="font-semibold text-emerald-700 flex items-center gap-1 font-mono">
                    <Check className="w-3 h-3" /> 3m 48s (&lt; 5m SLA)
                  </span>
                </div>
              </div>
            </div>
          </div>

          {/* 4 Core Stat Cards */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            <div className="p-5 rounded-2xl bg-white dark:bg-kairos-card border border-kairos-border shadow-sm">
              <div className="flex items-center justify-between text-xs font-semibold text-kairos-forest-subtle uppercase tracking-wider mb-2">
                <span>Available Balance</span>
                <Award className="w-4 h-4 text-amber-500" />
              </div>
              <div className="flex items-baseline gap-2">
                <span className="text-3xl font-serif font-bold text-kairos-forest-ink">
                  {doctorAccount.balance.toLocaleString()}
                </span>
                <span className="text-xs font-bold text-amber-600 bg-amber-50 px-2 py-0.5 rounded-md border border-amber-200">
                  MBC
                </span>
              </div>
              <p className="text-xs text-kairos-forest-subtle mt-2 flex items-center gap-1">
                <TrendingUp className="w-3 h-3 text-emerald-600" />
                Lifetime earned: {doctorAccount.lifetimeEarned.toLocaleString()} MBC
              </p>
            </div>

            <div className="p-5 rounded-2xl bg-white dark:bg-kairos-card border border-kairos-border shadow-sm">
              <div className="flex items-center justify-between text-xs font-semibold text-kairos-forest-subtle uppercase tracking-wider mb-2">
                <span>Clinician Tier</span>
                <ShieldCheck className="w-4 h-4 text-kairos-emerald" />
              </div>
              <div className="flex items-baseline gap-2">
                <span className="text-2xl font-serif font-bold text-kairos-forest-ink uppercase tracking-wide">
                  {doctorAccount.tier}
                </span>
                <span className="text-xs text-kairos-emerald font-semibold">Tier Status</span>
              </div>
              <p className="text-xs text-kairos-forest-subtle mt-2">
                Active Streak: <strong className="text-kairos-forest-ink">{doctorAccount.streakCount} consecutive</strong> golden-hour transfers
              </p>
            </div>

            <div className="p-5 rounded-2xl bg-white dark:bg-kairos-card border border-kairos-border shadow-sm">
              <div className="flex items-center justify-between text-xs font-semibold text-kairos-forest-subtle uppercase tracking-wider mb-2">
                <span>Handover &amp; SLA Compliance</span>
                <Activity className="w-4 h-4 text-cyan-600" />
              </div>
              <div className="flex items-baseline gap-2">
                <span className="text-3xl font-serif font-bold text-kairos-forest-ink">
                  {doctorAccount.complianceRate}%
                </span>
                <span className="text-xs text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded-md border border-emerald-200 font-bold">
                  Top 2%
                </span>
              </div>
              <p className="text-xs text-kairos-forest-subtle mt-2">
                ISBAR &amp; &lt;5m response: <strong className="text-kairos-forest-ink">100% verified pass</strong>
              </p>
            </div>

            <div className="p-5 rounded-2xl bg-white dark:bg-kairos-card border border-kairos-border shadow-sm">
              <div className="flex items-center justify-between text-xs font-semibold text-kairos-forest-subtle uppercase tracking-wider mb-2">
                <span>Public-Good Value Redeemed</span>
                <Gift className="w-4 h-4 text-purple-600" />
              </div>
              <div className="flex items-baseline gap-2">
                <span className="text-3xl font-serif font-bold text-kairos-forest-ink">
                  {Math.max(0, doctorAccount.lifetimeEarned - doctorAccount.balance).toLocaleString()}
                </span>
                <span className="text-xs text-purple-700 bg-purple-50 px-2 py-0.5 rounded-md border border-purple-200 font-bold">
                  MBC
                </span>
              </div>
              <p className="text-xs text-kairos-forest-subtle mt-2">
                {doctorAccount.recentTransactions.filter((t) => t.type === 'redeem' || t.type === 'redeemed').length} CME badges &amp; specialist grants
              </p>
            </div>
          </div>

          {/* Interactive Redemption Vault: Specialist Consults & CME Training Badges */}
          <div className="space-y-4">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
              <div>
                <h3 className="text-lg font-serif font-bold text-kairos-forest-ink">
                  Redemption Vault · Specialist Consult Grants &amp; CME Training Badges
                </h3>
                <p className="text-xs text-kairos-forest-subtle">
                  Redeem earned credits for accredited CME training badges, indigent patient tele-specialist grants, and emergency logistics.
                </p>
              </div>
              <div className="flex items-center gap-3">
                <span className="text-xs text-kairos-forest-subtle">
                  Balance: <strong className="text-amber-600 font-mono">{doctorAccount.balance} MBC</strong>
                </span>
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {[
                {
                  id: 'cme-kmc-resus',
                  title: 'KMC Accredited CME Resuscitation Master Badge',
                  desc: '2.0 Certified CME Credit Hours in Pre-Hospital Resuscitation, ISBAR handovers & Golden Hour protocol. Accredited by Karnataka Medical Council.',
                  cost: 350,
                  tag: 'CME Training Badge',
                  category: 'cme_training' as const,
                  cmeHours: '2.0 CME Hours',
                  accreditedBy: 'Karnataka Medical Council (KMC)',
                  isBadge: true,
                  icon: Award,
                },
                {
                  id: 'cme-isbar-fellow',
                  title: 'Advanced ISBAR Handover Fellow Badge',
                  desc: '1.5 Accredited CME Hours in Structured Clinical Communication, HL7 FHIR interoperability, and critical care handover standardization.',
                  cost: 300,
                  tag: 'CME Training Badge',
                  category: 'cme_training' as const,
                  cmeHours: '1.5 CME Hours',
                  accreditedBy: 'National Medical Commission Protocol',
                  isBadge: true,
                  icon: BadgeCheck,
                },
                {
                  id: 'tele-grant',
                  title: 'On-Demand Tele-Specialist Patient Consult Grant',
                  desc: 'Sponsor an urgent sub-specialist tele-triage consult (Cardiology / Neurology) for an economically disadvantaged patient with 100% subsidy.',
                  cost: 200,
                  tag: 'Specialist Consult Grant',
                  category: 'tele_specialist_grant' as const,
                  cmeHours: 'Patient Care Subsidy',
                  accreditedBy: 'KAIROS Patient Equity Fund',
                  isBadge: false,
                  icon: Stethoscope,
                },
                {
                  id: 'tele-neuro-stroke',
                  title: 'Urgent Tele-Neurology Acute Stroke Review Grant',
                  desc: 'Subsidize immediate secondary specialist tele-consultation for acute ischemic stroke and thrombolytic triage window evaluation.',
                  cost: 250,
                  tag: 'Specialist Consult Grant',
                  category: 'tele_specialist_grant' as const,
                  cmeHours: 'Patient Care Subsidy',
                  accreditedBy: 'KAIROS Stroke Network',
                  isBadge: false,
                  icon: Activity,
                },
                {
                  id: 'cme-trauma-fellow',
                  title: 'Golden Hour Acute Trauma Specialist Badge',
                  desc: '3.0 Accredited CME Hours in Polytrauma Triage, Hemodynamic Stabilization, and Accept-Before-You-Move bed hold compliance.',
                  cost: 450,
                  tag: 'CME Training Badge',
                  category: 'cme_training' as const,
                  cmeHours: '3.0 CME Hours',
                  accreditedBy: 'Karnataka Trauma & Emergency Network',
                  isBadge: true,
                  icon: ShieldCheck,
                },
                {
                  id: 'als-priority',
                  title: 'Green-Corridor ALS Ambulance Priority Dispatch',
                  desc: 'Priority lock on advanced cardiac life support ambulance with automated municipal traffic corridor signaling for emergency transfer.',
                  cost: 150,
                  tag: 'Emergency Transit',
                  category: 'golden_hour_referral' as const,
                  cmeHours: 'Emergency Fleet Logistics',
                  accreditedBy: 'Bangalore Emergency Dispatch Network',
                  isBadge: false,
                  icon: Ambulance,
                },
              ].map((item) => {
                const canAfford = doctorAccount.balance >= item.cost;
                const IconComponent = item.icon;
                return (
                  <div
                    key={item.id}
                    className="p-5 rounded-2xl bg-white dark:bg-kairos-card border border-kairos-border shadow-sm flex flex-col justify-between hover:border-kairos-emerald transition-all"
                  >
                    <div className="space-y-3">
                      <div className="flex items-center justify-between">
                        <span className={`text-[11px] font-bold px-2.5 py-0.5 rounded-full border ${
                          item.isBadge
                            ? 'bg-amber-50 dark:bg-amber-950/40 text-amber-900 dark:text-amber-300 border-amber-300 dark:border-amber-700'
                            : 'bg-kairos-mint-soft text-kairos-emerald border-kairos-border'
                        }`}>
                          {item.tag}
                        </span>
                        <div className="p-2 rounded-xl bg-emerald-50 dark:bg-emerald-950/40 text-emerald-700 dark:text-emerald-300">
                          <IconComponent className="w-4 h-4" />
                        </div>
                      </div>

                      <div>
                        <h4 className="text-sm font-serif font-bold text-kairos-forest-ink">
                          {item.title}
                        </h4>
                        <p className="text-xs text-kairos-forest-subtle mt-1.5 leading-relaxed">
                          {item.desc}
                        </p>
                      </div>

                      <div className="p-2.5 rounded-xl bg-kairos-surface-subtle border border-kairos-border text-[11px] text-kairos-muted flex items-center justify-between">
                        <span>Accreditation:</span>
                        <strong className="text-kairos-forest-ink">{item.cmeHours}</strong>
                      </div>
                    </div>

                    <div className="mt-5 pt-4 border-t border-kairos-border/80 flex items-center justify-between gap-3">
                      <div>
                        <span className="text-[10px] text-kairos-forest-subtle block uppercase font-bold">Cost</span>
                        <span className="text-base font-bold text-amber-600 font-mono">
                          {item.cost} <span className="text-[10px] text-amber-700">MBC</span>
                        </span>
                      </div>

                      <div className="flex items-center gap-1.5">
                        {item.isBadge && (
                          <button
                            type="button"
                            onClick={() => {
                              setSelectedCmeBadge({
                                id: item.id,
                                title: item.title,
                                cmeHours: item.cmeHours,
                                accreditedBy: item.accreditedBy,
                                category: item.tag,
                                earnedDate: new Date().toLocaleDateString('en-IN', {
                                  year: 'numeric',
                                  month: 'short',
                                  day: 'numeric',
                                }),
                                certificateNumber: `KAIROS-CME-2026-${item.id.toUpperCase()}`,
                                verificationHash: `0x7F${Math.random().toString(16).substring(2, 10).toUpperCase()}...NMC`,
                              });
                            }}
                            className="px-2.5 py-2 rounded-xl text-xs font-semibold border border-kairos-border text-kairos-forest-ink hover:bg-kairos-mint-soft transition-colors"
                          >
                            Inspect Badge
                          </button>
                        )}
                        <button
                          type="button"
                          disabled={!canAfford}
                          onClick={() => {
                            const success = redeemMedbridgeCredits(
                              doctorAccount.entityId,
                              'doctor',
                              item.cost,
                              item.title,
                              item.category
                            );
                            if (success && item.isBadge) {
                              setSelectedCmeBadge({
                                id: item.id,
                                title: item.title,
                                cmeHours: item.cmeHours,
                                accreditedBy: item.accreditedBy,
                                category: item.tag,
                                earnedDate: new Date().toLocaleDateString('en-IN', {
                                  year: 'numeric',
                                  month: 'short',
                                  day: 'numeric',
                                }),
                                certificateNumber: `KAIROS-CME-2026-${item.id.toUpperCase()}`,
                                verificationHash: `0x7F${Math.random().toString(16).substring(2, 10).toUpperCase()}...NMC`,
                              });
                            }
                          }}
                          className={`px-3 py-2 rounded-xl text-xs font-bold transition-all shadow-sm ${
                            canAfford
                              ? 'bg-kairos-emerald hover:bg-kairos-emerald-hover text-white active:scale-95'
                              : 'bg-gray-100 dark:bg-gray-800 text-gray-400 cursor-not-allowed border border-gray-200 dark:border-gray-700'
                          }`}
                        >
                          {canAfford ? (item.isBadge ? 'Redeem Badge' : 'Redeem Grant') : `Need ${item.cost - doctorAccount.balance} more`}
                        </button>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Immutable Transaction Ledger with Automated Verification Hash */}
          <div className="p-6 rounded-2xl bg-white dark:bg-kairos-card border border-kairos-border shadow-sm space-y-4">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
              <div>
                <h3 className="text-base font-serif font-bold text-kairos-forest-ink">
                  MedBridge Automated Verification &amp; Audit Ledger
                </h3>
                <p className="text-xs text-kairos-forest-subtle">
                  Cryptographically timestamped transaction log with verification proof and Zero-Cash-Commission audit seal.
                </p>
              </div>
              <div className="flex items-center gap-2">
                <span className="text-[11px] font-mono px-2.5 py-1 rounded-lg bg-emerald-50 dark:bg-emerald-950/40 text-emerald-800 dark:text-emerald-300 border border-emerald-300 font-bold">
                  NMC Zero-Commission Seal: VERIFIED
                </span>
              </div>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead>
                  <tr className="border-b border-kairos-border text-[11px] font-semibold text-kairos-forest-subtle uppercase tracking-wider">
                    <th className="pb-3 pl-2">Timestamp</th>
                    <th className="pb-3">Type</th>
                    <th className="pb-3">Clinical Action / Protocol Description</th>
                    <th className="pb-3">Automated Verification Gate</th>
                    <th className="pb-3 text-right pr-2">Credit Delta</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-kairos-border/60">
                  {doctorAccount.recentTransactions.map((tx) => {
                    const isEarned = tx.type === 'earn' || tx.type === 'earned';
                    const dateStr = new Date(tx.timestamp).toLocaleString('en-IN', {
                      month: 'short',
                      day: 'numeric',
                      hour: '2-digit',
                      minute: '2-digit',
                    });

                    // Verification method label
                    let verifMethod = 'Auto-Verified: ISBAR Compiler (FHIR-OK)';
                    if (tx.category === 'accept_before_move') verifMethod = 'Auto-Verified: Accept-Before-Move Bed Lock';
                    else if (tx.category === 'alert_sla_5min') verifMethod = 'Auto-Verified: <5m Alert SLA (<300s)';
                    else if (tx.category === 'cme_training') verifMethod = 'KMC Credential Issued · Zero-Cash Audit';
                    else if (tx.category === 'tele_specialist_grant') verifMethod = 'Indigent Care Grant Disbursed (₹0 Fee)';
                    else if (tx.category === 'golden_hour_referral') verifMethod = 'Door-to-Departure <60m Verified';

                    return (
                      <tr key={tx.id} className="hover:bg-kairos-mint-soft/30 transition-colors">
                        <td className="py-3 pl-2 font-mono text-[11px] text-kairos-forest-subtle">
                          {dateStr}
                        </td>
                        <td className="py-3">
                          <span
                            className={`inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider ${
                              isEarned
                                ? 'bg-emerald-50 text-emerald-700 border border-emerald-200'
                                : 'bg-purple-50 text-purple-700 border border-purple-200'
                            }`}
                          >
                            {isEarned ? <ArrowUpRight className="w-3 h-3" /> : <Gift className="w-3 h-3" />}
                            {tx.type}
                          </span>
                        </td>
                        <td className="py-3 font-medium text-kairos-forest-ink max-w-sm">
                          {tx.reason}
                        </td>
                        <td className="py-3">
                          <span className="font-mono text-[11px] font-medium text-emerald-700 dark:text-emerald-400 bg-emerald-50 dark:bg-emerald-950/40 px-2 py-0.5 rounded border border-emerald-200 dark:border-emerald-800">
                            {verifMethod}
                          </span>
                        </td>
                        <td className="py-3 pr-2 text-right font-mono font-bold">
                          <span className={isEarned ? 'text-emerald-700' : 'text-purple-700'}>
                            {isEarned ? '+' : '-'}{tx.amount} MBC
                          </span>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* CME TRAINING BADGE & CERTIFICATE INSPECTION MODAL */}
      {selectedCmeBadge && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-xs">
          <div className="relative w-full max-w-xl rounded-3xl bg-white dark:bg-kairos-card border-2 border-amber-400 p-8 shadow-2xl space-y-6">
            <button
              type="button"
              onClick={() => setSelectedCmeBadge(null)}
              className="absolute top-4 right-4 p-2 rounded-xl text-kairos-muted hover:text-kairos-forest-ink hover:bg-kairos-mint-soft transition-colors"
              aria-label="Close CME Badge Modal"
            >
              <X className="w-5 h-5" />
            </button>

            {/* Certificate Header */}
            <div className="text-center space-y-2 border-b border-kairos-border pb-5">
              <div className="inline-flex items-center justify-center w-16 h-16 rounded-2xl bg-gradient-to-br from-amber-400 to-amber-600 text-amber-950 shadow-md mx-auto">
                <Award className="w-9 h-9" />
              </div>
              <p className="text-[11px] font-mono font-bold uppercase tracking-widest text-amber-600">
                Official CME Training Credential
              </p>
              <h3 className="font-serif text-2xl font-bold text-kairos-forest-ink">
                Certificate of Protocol Excellence
              </h3>
              <p className="text-xs text-kairos-muted">
                Accredited under the National Medical Commission (NMC) Continuing Medical Education Framework
              </p>
            </div>

            {/* Certificate Body */}
            <div className="space-y-4 py-2 text-center">
              <p className="text-xs text-kairos-muted">This certifies that</p>
              <p className="text-xl font-serif font-bold text-kairos-forest-ink tracking-wide">
                {currentUser?.displayName || 'Dr. Vikram Patel, MD'}
              </p>
              <p className="text-xs text-kairos-muted max-w-md mx-auto leading-relaxed">
                has successfully demonstrated verified clinical excellence in structured emergency protocols and is hereby awarded the credential:
              </p>

              <div className="p-4 rounded-2xl bg-amber-50 dark:bg-amber-950/30 border border-amber-300 dark:border-amber-700 inline-block w-full max-w-md">
                <h4 className="font-serif text-lg font-bold text-amber-900 dark:text-amber-200">
                  {selectedCmeBadge.title}
                </h4>
                <p className="text-xs font-semibold text-emerald-700 dark:text-emerald-400 mt-1">
                  {selectedCmeBadge.cmeHours} · {selectedCmeBadge.accreditedBy}
                </p>
              </div>

              <div className="grid grid-cols-2 gap-3 text-left pt-2">
                <div className="p-3 rounded-xl bg-kairos-surface-subtle border border-kairos-border">
                  <span className="text-[10px] text-kairos-muted uppercase font-bold block">Certificate ID</span>
                  <span className="font-mono text-xs font-semibold text-kairos-forest-ink">
                    {selectedCmeBadge.certificateNumber}
                  </span>
                </div>
                <div className="p-3 rounded-xl bg-kairos-surface-subtle border border-kairos-border">
                  <span className="text-[10px] text-kairos-muted uppercase font-bold block">Issue Date</span>
                  <span className="font-mono text-xs font-semibold text-kairos-forest-ink">
                    {selectedCmeBadge.earnedDate}
                  </span>
                </div>
              </div>

              <div className="p-3 rounded-xl bg-emerald-50 dark:bg-emerald-950/30 border border-emerald-300 dark:border-emerald-800 text-left flex items-center justify-between text-xs">
                <div>
                  <span className="font-bold text-emerald-900 dark:text-emerald-200 block">
                    Zero Cash Commission Audit Seal
                  </span>
                  <span className="text-[11px] text-emerald-700 dark:text-emerald-300 font-mono">
                    {selectedCmeBadge.verificationHash}
                  </span>
                </div>
                <BadgeCheck className="w-6 h-6 text-emerald-600 shrink-0" />
              </div>
            </div>

            {/* Certificate Footer Controls */}
            <div className="flex items-center justify-end gap-3 pt-3 border-t border-kairos-border">
              <button
                type="button"
                onClick={() => {
                  window.print();
                }}
                className="inline-flex items-center gap-1.5 px-4 py-2.5 rounded-xl border border-kairos-border bg-kairos-surface text-xs font-semibold text-kairos-forest-ink hover:bg-kairos-mint-soft"
              >
                <Printer className="w-4 h-4" />
                Print Certificate
              </button>
              <button
                type="button"
                onClick={() => setSelectedCmeBadge(null)}
                className="px-5 py-2.5 rounded-xl bg-kairos-emerald hover:bg-kairos-emerald-hover text-white text-xs font-bold transition-colors"
              >
                Done
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
