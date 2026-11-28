import React, { useMemo, useState } from 'react';
import {
  Activity,
  AlertTriangle,
  Ambulance,
  ArrowUpRight,
  Award,
  BadgeCheck,
  BedDouble,
  Building2,
  Check,
  CheckCircle2,
  Clock,
  FileCheck,
  FileText,
  Gift,
  Lock,
  Minus,
  Plus,
  QrCode,
  RefreshCw,
  ShieldCheck,
  TrendingUp,
  Users,
  XCircle,
  Zap,
} from 'lucide-react';
import { useKairos } from '../context/KairosContext';
import { evaluateBedHoldState, formatCountdown } from '../utils/kairosEngine';
import { MapPanel } from './MapPanel';

interface HospitalDashboardProps {
  activeTab: string;
  onTabChange: (tab: string) => void;
  searchQuery: string;
}

export const HospitalDashboard: React.FC<HospitalDashboardProps> = ({
  activeTab,
  onTabChange,
  searchQuery,
}) => {
  const {
    currentUser,
    hospitals,
    appointments,
    referrals,
    nowMs,
    checkInAppointmentByToken,
    updateAppointmentStatus,
    applyDoctorDelay,
    acceptReferral,
    declineReferral,
    reconfirmBedHold,
    confirmPatientArrival,
    updateHospitalCapacity,
    addHospitalDepartment,
    addHospitalFacility,
    getMedbridgeAccount,
    awardMedbridgeCredits,
    redeemMedbridgeCredits,
  } = useKairos();

  const [managedHospitalId, setManagedHospitalId] = useState(
    currentUser?.facilityId ?? hospitals[0]?.hospitalId ?? ''
  );
  const myHospital =
    hospitals.find((h) => h.hospitalId === managedHospitalId) ?? hospitals[0] ?? null;

  const hospitalAccount = getMedbridgeAccount(
    myHospital?.hospitalId ?? 'hosp-cmrit',
    'hospital'
  );

  // Register Hospital onboarding form state
  const [regName, setRegName] = useState(currentUser?.facilityName ?? '');
  const [regArea, setRegArea] = useState('');
  const [regCity, setRegCity] = useState('');
  const [regPhone, setRegPhone] = useState('');
  const [regIcu, setRegIcu] = useState('10');
  const [regGen, setRegGen] = useState('40');
  const [regPeds, setRegPeds] = useState('12');

  const [qrInput, setQrInput] = useState('');
  const [qrFeedback, setQrFeedback] = useState<{ ok: boolean; msg: string } | null>(null);
  const [selectedDeptDelay, setSelectedDeptDelay] = useState('General Medicine');
  const [delayMinutes, setDelayMinutes] = useState(10);

  // Accept / Decline state
  const [bedLabelByRef, setBedLabelByRef] = useState<Record<string, string>>({});
  const [decliningRefId, setDecliningRefId] = useState<string | null>(null);
  const [declineReason, setDeclineReason] = useState('');
  const [newDeptName, setNewDeptName] = useState('');

  const hospitalAppointments = useMemo(() => {
    if (!myHospital) return [];
    const q = searchQuery.trim().toLowerCase();
    return appointments
      .filter((a) => a.hospitalId === myHospital.hospitalId && a.status !== 'cancelled')
      .filter((a) => {
        if (!q) return true;
        return (
          a.tokenNumber.toLowerCase().includes(q) ||
          a.patientName.toLowerCase().includes(q) ||
          a.department.toLowerCase().includes(q)
        );
      })
      .sort((a, b) => a.queuePosition - b.queuePosition);
  }, [appointments, myHospital, searchQuery]);

  const activeQueueCount = hospitalAppointments.filter((a) => a.status !== 'completed').length;
  const waitingCount = hospitalAppointments.filter((a) => a.status === 'checked-in' || a.status === 'scheduled').length;
  const triageCount = hospitalAppointments.filter((a) => a.status === 'in-triage').length;
  const avgWaitMin =
    activeQueueCount > 0
      ? Math.round(
          hospitalAppointments
            .filter((a) => a.status !== 'completed')
            .reduce((acc, item) => acc + item.estimatedWaitMin, 0) / activeQueueCount
        )
      : 12;

  const incomingReferrals = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    return referrals.filter((r) => {
      if (!q) return true;
      return (
        r.referralId.toLowerCase().includes(q) ||
        r.patientInitials.toLowerCase().includes(q) ||
        r.category.toLowerCase().includes(q)
      );
    });
  }, [referrals, searchQuery]);

  const activeHoldRef = referrals.find(
    (r) =>
      r.bedHold &&
      (r.bedHold.status === 'held' || r.bedHold.status === 'expiring_soon')
  );
  const activeHoldCountdown = activeHoldRef?.bedHold
    ? formatCountdown(evaluateBedHoldState(activeHoldRef.bedHold, nowMs).remainingSec)
    : 'No hold';

  const activeAmbulanceRef = referrals.find(
    (r) => r.status === 'in_transit' || r.status === 'accepted' || r.status === 'arrived'
  );

  const handleQrScanSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!qrInput.trim()) return;
    const res = checkInAppointmentByToken(qrInput);
    setQrFeedback({ ok: res.ok, msg: res.message });
    if (res.ok) setQrInput('');
  };

  const handleConfirmDecline = (referralId: string) => {
    if (!declineReason.trim()) return;
    declineReferral(referralId, declineReason.trim());
    setDecliningRefId(null);
    setDeclineReason('');
  };

  const handleAcceptReferral = (referralId: string, bedLabel: string) => {
    acceptReferral(referralId, bedLabel, currentUser?.displayName || 'Dr. Vikram Patel');
    awardMedbridgeCredits(
      myHospital?.hospitalId ?? 'hosp-cmrit',
      'hospital',
      50,
      `Emergency Bed Hold Reserved for ${referralId} (<5m SLA)`,
      'referral_accepted_fast'
    );
  };

  const handleConfirmPatientArrival = (referralId: string) => {
    confirmPatientArrival(referralId);
    awardMedbridgeCredits(
      myHospital?.hospitalId ?? 'hosp-cmrit',
      'hospital',
      30,
      `Ambulance Arrival Handover Completed for ${referralId} (<10m)`,
      'zero_double_booking'
    );
  };

  const handleRegisterHospital = (e: React.FormEvent) => {
    e.preventDefault();
    if (!regName.trim() || !regArea.trim()) return;
    const created = addHospitalFacility({
      name: regName,
      area: regArea,
      city: regCity || 'Bengaluru',
      phone: regPhone || '+91-80-0000-0000',
      departments: ['General Medicine', 'Emergency', 'Cardiology', 'Obstetrics & Gynaecology'],
      facilities: ['ICU', 'Ventilator', 'Blood Bank'],
      icuTotal: Number(regIcu) || 0,
      generalTotal: Number(regGen) || 0,
      pedsTotal: Number(regPeds) || 0,
    });
    setManagedHospitalId(created.hospitalId);
    setRegName('');
    setRegArea('');
    setRegCity('');
    setRegPhone('');
  };

  if (!myHospital) {
    return (
      <div className="max-w-2xl mx-auto bg-kairos-surface border border-kairos-border rounded-2xl p-6 sm:p-8 space-y-5">
        <div className="flex items-start gap-3">
          <div className="w-11 h-11 rounded-xl bg-kairos-mint-soft text-kairos-emerald-ink flex items-center justify-center shrink-0">
            <Building2 className="w-5 h-5" />
          </div>
          <div>
            <h2 className="font-display text-xl font-extrabold text-kairos-forest-ink">
              Register Your Hospital Facility
            </h2>
            <p className="text-xs text-kairos-muted mt-1">
              Add your hospital details and verified bed capacities to begin accepting Smart OPD bookings and Golden-Hour emergency referrals.
            </p>
          </div>
        </div>

        <form onSubmit={handleRegisterHospital} className="space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
            <div>
              <label className="block text-xs font-semibold text-kairos-forest-ink mb-1">Hospital Name *</label>
              <input
                type="text"
                required
                value={regName}
                onChange={(e) => setRegName(e.target.value)}
                placeholder="e.g., City General Hospital"
                className="w-full rounded-xl border border-kairos-border px-3.5 py-2.5 text-sm text-kairos-forest-ink"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-kairos-forest-ink mb-1">Area / Locality *</label>
              <input
                type="text"
                required
                value={regArea}
                onChange={(e) => setRegArea(e.target.value)}
                placeholder="e.g., Whitefield"
                className="w-full rounded-xl border border-kairos-border px-3.5 py-2.5 text-sm text-kairos-forest-ink"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-kairos-forest-ink mb-1">City</label>
              <input
                type="text"
                value={regCity}
                onChange={(e) => setRegCity(e.target.value)}
                placeholder="e.g., Bengaluru"
                className="w-full rounded-xl border border-kairos-border px-3.5 py-2.5 text-sm text-kairos-forest-ink"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-kairos-forest-ink mb-1">Emergency Phone</label>
              <input
                type="tel"
                value={regPhone}
                onChange={(e) => setRegPhone(e.target.value)}
                placeholder="+91-80-XXXX-XXXX"
                className="w-full rounded-xl border border-kairos-border px-3.5 py-2.5 text-sm text-kairos-forest-ink"
              />
            </div>
          </div>

          <div className="grid grid-cols-3 gap-3">
            <div>
              <label className="block text-xs font-semibold text-kairos-forest-ink mb-1">ICU Beds</label>
              <input
                type="number"
                min={0}
                value={regIcu}
                onChange={(e) => setRegIcu(e.target.value)}
                className="w-full rounded-xl border border-kairos-border px-3 py-2 text-sm font-mono text-kairos-forest-ink"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-kairos-forest-ink mb-1">General Beds</label>
              <input
                type="number"
                min={0}
                value={regGen}
                onChange={(e) => setRegGen(e.target.value)}
                className="w-full rounded-xl border border-kairos-border px-3 py-2 text-sm font-mono text-kairos-forest-ink"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-kairos-forest-ink mb-1">Paediatric Beds</label>
              <input
                type="number"
                min={0}
                value={regPeds}
                onChange={(e) => setRegPeds(e.target.value)}
                className="w-full rounded-xl border border-kairos-border px-3 py-2 text-sm font-mono text-kairos-forest-ink"
              />
            </div>
          </div>

          <button
            type="submit"
            className="w-full py-2.5 px-5 rounded-xl bg-kairos-emerald hover:bg-kairos-emerald-hover text-white text-sm font-semibold transition-colors"
          >
            Register Hospital &amp; Open Command Center
          </button>
        </form>
      </div>
    );
  }

  const minutesSinceVerify = Math.max(
    0,
    Math.round((nowMs - Date.parse(myHospital.lastVerifiedAt)) / 60000)
  );

  return (
    <div className="space-y-6">
      {/* Hospital Selector Bar */}
      <div className="flex flex-wrap items-center justify-between gap-3 bg-kairos-surface border border-kairos-border rounded-2xl px-5 py-3">
        <div className="flex items-center gap-2.5 text-xs">
          <Building2 className="w-4 h-4 text-kairos-emerald-ink" />
          <span className="font-bold text-kairos-forest-ink">{myHospital.name}</span>
          <span className="text-kairos-muted">· {myHospital.area}</span>
          <span className="text-kairos-muted/80">|</span>
          <span className="text-kairos-muted">
            Capacity verified <strong>{minutesSinceVerify} min ago</strong> by {myHospital.lastVerifiedBy}
          </span>
        </div>
        <select
          value={myHospital.hospitalId}
          onChange={(e) => setManagedHospitalId(e.target.value)}
          aria-label="Select hospital desk to manage"
          className="rounded-xl border border-kairos-border bg-kairos-surface-subtle px-3 py-1.5 text-xs font-semibold text-kairos-forest-ink"
        >
          {hospitals.map((h) => (
            <option key={h.hospitalId} value={h.hospitalId}>
              Manage: {h.name}
            </option>
          ))}
        </select>
      </div>

      {/* TOP 4 KPI CARDS (Directly matching Kairos-Landing-And-Dashboard-v2 Page 2) */}
      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">
        <div className="bg-kairos-surface border border-kairos-border rounded-2xl p-5 flex items-start justify-between gap-2">
          <div className="min-w-0">
            <p className="text-xs font-medium text-kairos-muted">Live Queue</p>
            <p className="font-display text-xl 2xl:text-2xl font-extrabold text-kairos-forest-ink mt-1 font-mono tabular-nums whitespace-nowrap">
              {activeQueueCount} patients
            </p>
            <p className="text-xs text-kairos-muted mt-1">
              {waitingCount} waiting · {triageCount} in triage
            </p>
          </div>
          <div className="w-9 h-9 rounded-xl bg-kairos-mint-soft text-kairos-emerald-ink flex items-center justify-center shrink-0">
            <Users className="w-4 h-4" />
          </div>
        </div>

        <div className="bg-kairos-forest text-white rounded-2xl p-5 flex items-start justify-between gap-2">
          <div className="min-w-0">
            <p className="text-xs font-medium text-emerald-200">Referral to Accept</p>
            <p className="font-display text-xl 2xl:text-2xl font-extrabold mt-1 font-mono tabular-nums whitespace-nowrap">
              4 min 12 sec
            </p>
            <p className="text-xs text-emerald-200/85 mt-1">Target: 5 min or less</p>
          </div>
          <div className="w-9 h-9 rounded-xl bg-white/15 hover:bg-white/20 text-emerald-200 flex items-center justify-center shrink-0">
            <Clock className="w-4 h-4" />
          </div>
        </div>

        <div className="bg-kairos-surface border border-kairos-border rounded-2xl p-5 flex items-start justify-between gap-2">
          <div className="min-w-0">
            <p className="text-xs font-medium text-kairos-muted">Bed Hold</p>
            <p className="font-display text-xl 2xl:text-2xl font-extrabold text-kairos-forest-ink mt-1 font-mono tabular-nums whitespace-nowrap">
              {activeHoldRef?.bedHold ? `${activeHoldRef.bedHold.bedLabel} · ${activeHoldCountdown}` : 'Idle'}
            </p>
            <p className="text-xs text-kairos-emerald-ink font-medium mt-1">
              Held · Not double-promised
            </p>
          </div>
          <div className="w-9 h-9 rounded-xl bg-kairos-mint-soft text-kairos-emerald-ink flex items-center justify-center shrink-0">
            <BedDouble className="w-4 h-4" />
          </div>
        </div>

        <div className="bg-kairos-surface border border-kairos-border rounded-2xl p-5 flex items-start justify-between gap-2">
          <div className="min-w-0">
            <p className="text-xs font-medium text-kairos-muted">OPD Wait</p>
            <p className="font-display text-xl 2xl:text-2xl font-extrabold text-kairos-forest-ink mt-1 font-mono tabular-nums whitespace-nowrap">
              {avgWaitMin} min avg
            </p>
            <p className="text-xs text-kairos-muted mt-1">30% lower · Pilot target</p>
          </div>
          <div className="w-9 h-9 rounded-xl bg-kairos-mint-soft text-kairos-emerald-ink flex items-center justify-center shrink-0">
            <Activity className="w-4 h-4" />
          </div>
        </div>
      </div>

      {/* OVERVIEW TAB — 3-COLUMN COMMAND LAYOUT MATCHING PDF PAGE 2 */}
      {activeTab === 'overview' && (
        <div className="space-y-5">
          {/* MedBridge Credits USP Highlight Banner */}
          <div className="rounded-2xl bg-gradient-to-r from-kairos-forest-deep via-kairos-forest to-emerald-950 p-5 text-white shadow-md border border-emerald-500/20 flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
            <div className="flex items-center gap-3.5">
              <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-amber-400 to-amber-600 flex items-center justify-center text-amber-950 shadow-inner shrink-0">
                <Award className="w-6 h-6" />
              </div>
              <div>
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="text-[11px] font-bold uppercase tracking-wider text-amber-400 bg-amber-400/10 px-2 py-0.5 rounded border border-amber-400/20">
                    Hospital USP Feature
                  </span>
                  <span className="text-xs font-semibold text-emerald-200">
                    {hospitalAccount.tier.toUpperCase()} TIER · {hospitalAccount.streakCount}-Hold Streak
                  </span>
                  <span className="text-[10px] font-bold uppercase tracking-wider text-emerald-300 bg-emerald-400/15 px-2 py-0.5 rounded border border-emerald-400/30">
                    Zero Cash Commission
                  </span>
                </div>
                <p className="text-lg font-serif font-bold text-white mt-0.5">
                  MedBridge Reserve: <span className="text-amber-400 font-mono">{hospitalAccount.balance.toLocaleString()} MBC</span>
                  <span className="text-xs font-normal text-emerald-200/80 ml-2">
                    ({hospitalAccount.complianceRate}% &lt;5m Alert SLA · 100% Accept-Before-You-Move Bed Hold Integrity)
                  </span>
                </p>
              </div>
            </div>

            <div className="flex items-center gap-2.5 w-full md:w-auto">
              <button
                type="button"
                onClick={() => {
                  awardMedbridgeCredits(
                    hospitalAccount.entityId,
                    'hospital',
                    50,
                    'Rapid Emergency Referral Acceptance (<4m SLA)',
                    'referral_accepted_fast'
                  );
                }}
                className="flex-1 md:flex-initial inline-flex items-center justify-center gap-1.5 px-3.5 py-2 rounded-xl bg-amber-400 hover:bg-amber-300 text-amber-950 font-bold text-xs uppercase tracking-wider transition-all shadow-sm active:scale-95"
              >
                <Zap className="w-3.5 h-3.5 fill-amber-950" />
                +50 MBC Test SLA
              </button>
              <button
                type="button"
                onClick={() => onTabChange('credits')}
                className="flex-1 md:flex-initial inline-flex items-center justify-center gap-1.5 px-4 py-2 rounded-xl bg-white/10 hover:bg-white/15 border border-white/20 text-white font-semibold text-xs uppercase tracking-wider transition-all"
              >
                <span>Credit Vault</span>
                <ArrowUpRight className="w-3.5 h-3.5" />
              </button>
            </div>
          </div>

          <div className="grid grid-cols-1 xl:grid-cols-12 gap-5">
          {/* Column 1: Live OPD Queue (5 cols) */}
          <div className="xl:col-span-5 bg-kairos-surface border border-kairos-border rounded-2xl p-5 flex flex-col justify-between space-y-4">
            <div className="space-y-3">
              <div className="flex items-center justify-between gap-2">
                <div>
                  <h2 className="font-display text-base font-bold text-kairos-forest-ink">
                    Live OPD Queue · General Medicine
                  </h2>
                  <p className="text-xs text-kairos-muted">
                    {activeQueueCount} active · {waitingCount} waiting · {triageCount} in triage
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => onTabChange('opd-queue')}
                  className="text-xs font-semibold text-kairos-emerald-ink hover:underline whitespace-nowrap"
                >
                  Manage Queue →
                </button>
              </div>

              <div className="space-y-2.5">
                {hospitalAppointments.slice(0, 5).map((appt) => (
                  <div
                    key={appt.appointmentId}
                    className="p-3.5 rounded-xl border border-kairos-border bg-kairos-surface-subtle flex items-center justify-between gap-3"
                  >
                    <div className="flex items-center gap-3 min-w-0">
                      <span className="px-2.5 py-1 rounded-lg bg-kairos-surface border border-kairos-border font-mono text-xs font-bold text-kairos-forest-ink tabular-nums shrink-0">
                        {appt.tokenNumber}
                      </span>
                      <div className="min-w-0">
                        <p className="text-sm font-bold text-kairos-forest-ink truncate">
                          {appt.patientName}
                        </p>
                        <p className="text-[11px] text-kairos-muted truncate">
                          {appt.channel} · {appt.slotTime}
                        </p>
                      </div>
                    </div>

                    <div className="text-right shrink-0">
                      {appt.delayMin > 0 ? (
                        <p className="text-xs font-bold text-red-700 dark:text-red-400">
                          Doctor delayed {appt.delayMin} min
                        </p>
                      ) : (
                        <p className="text-xs font-mono font-bold text-kairos-forest-ink tabular-nums">
                          #{appt.queuePosition} · {appt.estimatedWaitMin} min
                        </p>
                      )}
                      <p className="text-[11px] font-semibold text-kairos-emerald-ink capitalize">
                        {appt.delayMin > 0 ? 'Alert sent' : appt.status.replace('-', ' ')}
                      </p>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            <div className="p-4 rounded-xl bg-kairos-mint-soft border border-kairos-border flex items-center justify-between gap-3">
              <div>
                <p className="text-xs font-bold text-kairos-forest-ink">
                  Doctor delay? Queue re-estimates automatically.
                </p>
                <p className="text-[11px] text-kairos-muted">
                  Delay-aware queue · WhatsApp / SMS alert templates ready
                </p>
              </div>
              <button
                type="button"
                onClick={() => applyDoctorDelay(myHospital.hospitalId, 'General Medicine', 10)}
                className="px-3 py-1.5 rounded-lg bg-kairos-forest text-white text-xs font-semibold hover:bg-kairos-emerald whitespace-nowrap shrink-0"
              >
                +10m Delay
              </button>
            </div>
          </div>

          {/* Column 2: Emergency Referrals + Active Ambulance Card (4 cols) */}
          <div className="xl:col-span-4 bg-kairos-surface border border-kairos-border rounded-2xl p-5 space-y-4">
            <div className="flex items-center justify-between gap-2">
              <div>
                <h2 className="font-display text-base font-bold text-kairos-forest-ink">
                  Emergency Referrals
                </h2>
                <p className="text-xs text-kairos-muted">ISBAR · Accept before you move</p>
              </div>
              <button
                type="button"
                onClick={() => onTabChange('referrals')}
                className="text-xs font-semibold text-kairos-emerald-ink hover:underline"
              >
                All ({incomingReferrals.length})
              </button>
            </div>

            <div className="space-y-3">
              {incomingReferrals.slice(0, 2).map((ref) => {
                const holdEval = ref.bedHold ? evaluateBedHoldState(ref.bedHold, nowMs) : null;
                const bedChoice = bedLabelByRef[ref.referralId] ?? 'Bed 14B';
                return (
                  <div
                    key={ref.referralId}
                    className={`p-4 rounded-xl border space-y-2.5 ${
                      ref.urgency === 'critical'
                        ? 'border-red-200 dark:border-red-900/60 bg-red-50 dark:bg-red-950/40/40'
                        : 'border-kairos-border bg-kairos-surface-subtle'
                    }`}
                  >
                    <div className="flex items-center justify-between gap-2">
                      <p className="text-xs font-extrabold text-kairos-forest-ink">
                        {ref.referralId} · {ref.category}
                      </p>
                      <span
                        className={`text-[11px] font-mono font-bold uppercase ${
                          ref.urgency === 'critical' ? 'text-red-700 dark:text-red-400' : 'text-amber-700 dark:text-amber-400'
                        }`}
                      >
                        {ref.urgency}
                      </span>
                    </div>

                    <div className="flex flex-wrap gap-2 text-[11px] font-mono text-kairos-forest-ink tabular-nums">
                      <span className="px-2 py-0.5 rounded bg-kairos-surface border border-kairos-border">
                        HR {ref.vitals.heartRate}
                      </span>
                      <span className="px-2 py-0.5 rounded bg-kairos-surface border border-kairos-border">
                        SpO2 {ref.vitals.spo2}%
                      </span>
                      <span className="px-2 py-0.5 rounded bg-kairos-surface border border-kairos-border">
                        BP {ref.vitals.bp}
                      </span>
                    </div>

                    <p className="text-[11px] text-kairos-muted">
                      From: {ref.referringHospitalName} · Bed: <strong className="text-kairos-forest-ink">{ref.requiredBedType}</strong>
                      {ref.bedHold && holdEval && (
                        <> · Held {formatCountdown(holdEval.remainingSec)}</>
                      )}
                    </p>

                    {(ref.status === 'pending' || ref.status === 'escalated') ? (
                      <div className="flex items-center gap-2 pt-1">
                        <button
                          type="button"
                          onClick={() => handleAcceptReferral(ref.referralId, bedChoice)}
                          className="flex-1 py-2 px-3 rounded-xl bg-kairos-emerald text-white text-xs font-bold hover:bg-kairos-emerald-hover"
                        >
                          Accept & Hold Bed
                        </button>
                        <button
                          type="button"
                          onClick={() => {
                            setDecliningRefId(ref.referralId);
                            onTabChange('referrals');
                          }}
                          className="flex-1 py-2 px-3 rounded-xl border border-kairos-border bg-kairos-surface text-kairos-forest-ink text-xs font-bold hover:bg-red-50 dark:bg-red-950/40 hover:text-red-700 dark:text-red-400"
                        >
                          Decline
                        </button>
                      </div>
                    ) : (
                      <div className="flex items-center gap-2 pt-1">
                        <button
                          type="button"
                          onClick={() => onTabChange('referrals')}
                          className="flex-1 py-1.5 px-3 rounded-xl bg-kairos-forest text-white text-xs font-semibold hover:bg-kairos-forest-deep"
                        >
                          View ISBAR
                        </button>
                        {ref.status !== 'completed' && (
                          <button
                            type="button"
                            onClick={() => handleConfirmPatientArrival(ref.referralId)}
                            className="flex-1 py-1.5 px-3 rounded-xl border border-kairos-emerald text-kairos-forest-ink text-xs font-semibold hover:bg-kairos-mint-soft"
                          >
                            Confirm Arrival
                          </button>
                        )}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>

            {/* Dark Emerald Active Ambulance Card (Matching PDF Page 2) */}
            {activeAmbulanceRef && (
              <div className="rounded-2xl bg-kairos-forest text-white p-4 space-y-2.5">
                <div className="flex items-center justify-between gap-2">
                  <div className="flex items-center gap-2">
                    <Ambulance className="w-4 h-4 text-emerald-300" />
                    <span className="text-xs font-bold">
                      {activeAmbulanceRef.ambulanceUnitName || 'Ambulance · KA-01'}
                    </span>
                  </div>
                  <span className="text-[11px] font-mono font-bold text-emerald-300 uppercase">
                    {activeAmbulanceRef.ambulanceStatus.replace('_', ' ')}
                  </span>
                </div>
                <p className="text-xs text-emerald-100">
                  Accepted · {activeAmbulanceRef.ambulanceEtaMin ?? 4} min away · Route: {activeAmbulanceRef.targetHospitalName}
                </p>
                <p className="font-mono text-xs text-emerald-200 tabular-nums">
                  Live vitals: HR {activeAmbulanceRef.vitals.heartRate} · SpO2 {activeAmbulanceRef.vitals.spo2}% · BP {activeAmbulanceRef.vitals.bp}
                </p>
                <p className="text-[11px] text-emerald-300/80 pt-1.5 border-t border-white/10">
                  Store-and-forward · SMS fallback ready · ED: Prepare {activeAmbulanceRef.bedHold?.bedLabel ?? 'ICU Bay'}
                </p>
              </div>
            )}
          </div>

          {/* Column 3: Live Bed Status + Nearby Hospitals (3 cols) */}
          <div className="xl:col-span-3 bg-kairos-surface border border-kairos-border rounded-2xl p-5 flex flex-col justify-between space-y-5">
            <div className="space-y-4">
              <div>
                <h2 className="font-display text-base font-bold text-kairos-forest-ink">
                  Bed Status · Live
                </h2>
                <p className="text-xs text-kairos-muted">
                  Verified {minutesSinceVerify} min ago
                </p>
              </div>

              {[
                { label: 'ICU', avail: myHospital.icuAvailable, total: myHospital.icuTotal, key: 'icuAvailable' as const },
                { label: 'General', avail: myHospital.generalAvailable, total: myHospital.generalTotal, key: 'generalAvailable' as const },
                { label: 'Peds', avail: myHospital.pedsAvailable, total: myHospital.pedsTotal, key: 'pedsAvailable' as const },
              ].map((bed) => {
                const occupied = Math.max(0, bed.total - bed.avail);
                const pct = bed.total > 0 ? Math.round((occupied / bed.total) * 100) : 0;
                return (
                  <div key={bed.label} className="space-y-1.5">
                    <div className="flex items-center justify-between text-xs">
                      <span className="font-bold text-kairos-forest-ink">{bed.label}</span>
                      <span className="font-mono font-semibold text-kairos-forest-ink/85 tabular-nums">
                        {bed.avail} open / {bed.total}
                      </span>
                    </div>
                    <div className="w-full h-2 rounded-full bg-kairos-mint-soft overflow-hidden">
                      <div
                        className={`h-full rounded-full transition-all ${
                          bed.avail === 0 ? 'bg-red-600' : 'bg-kairos-emerald'
                        }`}
                        style={{ width: `${pct}%` }}
                      />
                    </div>
                  </div>
                );
              })}

              <div className="pt-3 border-t border-kairos-border-subtle space-y-2.5">
                <p className="text-xs font-bold text-kairos-forest-ink">Nearby Hospitals</p>
                {hospitals.slice(0, 3).map((h) => (
                  <div
                    key={h.hospitalId}
                    className="p-3 rounded-xl border border-kairos-border-subtle bg-kairos-surface-subtle flex items-center justify-between gap-2"
                  >
                    <div className="min-w-0">
                      <p className="text-xs font-bold text-kairos-forest-ink truncate">{h.name}</p>
                      <p
                        className={`text-[11px] font-mono tabular-nums ${
                          h.icuAvailable === 0 || !h.acceptingEmergencies
                            ? 'text-red-700 dark:text-red-400 font-semibold'
                            : 'text-kairos-emerald-ink font-semibold'
                        }`}
                      >
                        ICU {h.icuAvailable} · {h.acceptingEmergencies && h.icuAvailable > 0 ? 'Accepting' : 'Full / Diversion'}
                      </p>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            <button
              type="button"
              onClick={() => onTabChange('capacity')}
              className="w-full py-2.5 px-4 rounded-xl bg-kairos-emerald text-white text-xs font-bold hover:bg-kairos-emerald-hover transition-colors"
            >
              Update Verified Capacity
            </button>
          </div>
        </div>
        </div>
      )}

      {/* OPD QUEUE & DELAY ENGINE TAB */}
      {activeTab === 'opd-queue' && (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-5">
          <div className="lg:col-span-4 space-y-4">
            {/* QR Token Scanner / Verifier */}
            <form
              onSubmit={handleQrScanSubmit}
              className="bg-kairos-surface border border-kairos-border rounded-2xl p-5 space-y-3"
            >
              <div className="flex items-center gap-2">
                <QrCode className="w-4 h-4 text-kairos-emerald-ink" />
                <h2 className="font-display text-sm font-bold text-kairos-forest-ink">
                  Hospital QR Token Check-In
                </h2>
              </div>
              <p className="text-xs text-kairos-muted">
                Scan or enter patient QR token (e.g., <span className="font-mono">A-044</span>) to admit into the live OPD queue.
              </p>
              <input
                type="text"
                value={qrInput}
                onChange={(e) => setQrInput(e.target.value)}
                placeholder="Enter token # (e.g. A-044)"
                className="w-full rounded-xl border border-kairos-border px-3 py-2 text-sm font-mono uppercase text-kairos-forest-ink"
              />
              <button
                type="submit"
                className="w-full py-2 px-4 rounded-xl bg-kairos-emerald text-white text-xs font-semibold hover:bg-kairos-emerald-hover"
              >
                Verify QR & Check In
              </button>
              {qrFeedback && (
                <p className={`text-xs font-medium ${qrFeedback.ok ? 'text-kairos-emerald-ink' : 'text-red-700 dark:text-red-400'}`}>
                  {qrFeedback.msg}
                </p>
              )}
            </form>

            {/* Delay-Aware Queue Re-Estimation Control */}
            <div className="bg-kairos-forest text-white rounded-2xl p-5 space-y-3">
              <h2 className="font-display text-sm font-bold">
                Delay-Aware Queue Re-Estimation
              </h2>
              <p className="text-xs text-emerald-200/90">
                When a clinician is delayed or pulled to an emergency, recalculate wait times and alert affected patients immediately.
              </p>
              <select
                value={selectedDeptDelay}
                onChange={(e) => setSelectedDeptDelay(e.target.value)}
                aria-label="Department for delay update"
                className="w-full rounded-xl bg-kairos-surface text-kairos-forest-ink px-3 py-2 text-xs font-semibold"
              >
                {myHospital.departments.map((d) => (
                  <option key={d} value={d}>{d}</option>
                ))}
              </select>
              <div className="flex items-center gap-2">
                {[0, 10, 15, 25].map((m) => (
                  <button
                    key={m}
                    type="button"
                    onClick={() => setDelayMinutes(m)}
                    className={`flex-1 py-1.5 rounded-lg text-xs font-mono font-bold ${
                      delayMinutes === m
                        ? 'bg-kairos-gold text-[#07291F]'
                        : 'bg-white/15 hover:bg-white/20 text-white'
                    }`}
                  >
                    {m === 0 ? 'Clear' : `+${m}m`}
                  </button>
                ))}
              </div>
              <button
                type="button"
                onClick={() => applyDoctorDelay(myHospital.hospitalId, selectedDeptDelay, delayMinutes)}
                className="w-full py-2 px-4 rounded-xl bg-kairos-emerald text-white text-xs font-bold hover:bg-kairos-emerald-hover"
              >
                Recalculate Queue & Notify Patients
              </button>
            </div>
          </div>

          {/* Full Queue Table */}
          <div className="lg:col-span-8 bg-kairos-surface border border-kairos-border rounded-2xl p-5 space-y-4">
            <h2 className="font-display text-base font-bold text-kairos-forest-ink">
              All OPD Appointments · {myHospital.name} ({hospitalAppointments.length})
            </h2>
            <div className="space-y-2.5">
              {hospitalAppointments.map((appt) => (
                <div
                  key={appt.appointmentId}
                  className="p-4 rounded-xl border border-kairos-border bg-kairos-surface-subtle flex flex-wrap items-center justify-between gap-3"
                >
                  <div>
                    <p className="text-sm font-bold text-kairos-forest-ink">
                      <span className="font-mono mr-2">#{appt.tokenNumber}</span>
                      {appt.patientName}
                    </p>
                    <p className="text-xs text-kairos-muted mt-0.5">
                      {appt.department} · {appt.doctorName} · {appt.slotTime} · Pos #{appt.queuePosition} (~{appt.estimatedWaitMin} min)
                    </p>
                  </div>
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="text-xs font-mono font-bold uppercase text-kairos-emerald-ink mr-1">
                      {appt.status}
                    </span>
                    {appt.status === 'scheduled' && (
                      <button
                        type="button"
                        onClick={() => updateAppointmentStatus(appt.appointmentId, 'checked-in')}
                        className="px-2.5 py-1.5 rounded-lg bg-kairos-forest text-white text-xs font-semibold"
                      >
                        Check In
                      </button>
                    )}
                    {(appt.status === 'checked-in' || appt.status === 'scheduled') && (
                      <button
                        type="button"
                        onClick={() => updateAppointmentStatus(appt.appointmentId, 'in-triage')}
                        className="px-2.5 py-1.5 rounded-lg border border-kairos-border bg-kairos-surface text-kairos-forest-ink text-xs font-semibold"
                      >
                        Move to Triage
                      </button>
                    )}
                    {appt.status === 'in-triage' && (
                      <button
                        type="button"
                        onClick={() => updateAppointmentStatus(appt.appointmentId, 'in-consultation')}
                        className="px-2.5 py-1.5 rounded-lg bg-kairos-emerald text-white text-xs font-semibold"
                      >
                        Start Consult
                      </button>
                    )}
                    {appt.status !== 'completed' && (
                      <button
                        type="button"
                        onClick={() => updateAppointmentStatus(appt.appointmentId, 'completed')}
                        className="px-2.5 py-1.5 rounded-lg border border-kairos-emerald text-kairos-forest-ink text-xs font-semibold"
                      >
                        Complete
                      </button>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* INCOMING EMERGENCY REFERRALS DESK TAB */}
      {activeTab === 'referrals' && (
        <div className="space-y-4">
          <div className="bg-kairos-surface border border-kairos-border rounded-2xl p-5">
            <h2 className="font-display text-lg font-bold text-kairos-forest-ink">
              Emergency Referrals Desk · Accept Before You Move
            </h2>
            <p className="text-xs text-kairos-muted mt-1">
              Accepting creates a time-limited soft lock on the chosen bed and alerts the referring doctor & ambulance team. Declining requires a clinical reason and triggers automatic escalation.
            </p>
          </div>

          <div className="space-y-4">
            {incomingReferrals.map((ref) => {
              const holdEval = ref.bedHold ? evaluateBedHoldState(ref.bedHold, nowMs) : null;
              const selectedBedLabel = bedLabelByRef[ref.referralId] ?? 'Bed 14B (ICU)';
              return (
                <div
                  key={ref.referralId}
                  className="bg-kairos-surface border border-kairos-border rounded-2xl p-5 space-y-4"
                >
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div>
                      <p className="text-base font-extrabold text-kairos-forest-ink">
                        <span className="font-mono mr-2">{ref.referralId}</span>
                        {ref.category} · {ref.patientInitials} ({ref.ageSex})
                      </p>
                      <p className="text-xs text-kairos-muted mt-1">
                        From: {ref.referringDoctorName} ({ref.referringHospitalName}) → Assigned Target: <strong>{ref.targetHospitalName}</strong>
                      </p>
                    </div>
                    <div className="text-right">
                      <span
                        className={`font-mono text-xs font-extrabold uppercase ${
                          ref.urgency === 'critical' ? 'text-red-700 dark:text-red-400' : 'text-amber-700 dark:text-amber-400'
                        }`}
                      >
                        {ref.urgency} · {ref.status.replace('_', ' ')}
                      </span>
                      {ref.bedHold && holdEval && (
                        <p className="text-xs font-mono font-bold text-kairos-emerald-ink tabular-nums mt-1">
                          {ref.bedHold.bedLabel} · {holdEval.status === 'converted_admitted' ? 'Admitted' : `Expires in ${formatCountdown(holdEval.remainingSec)}`}
                        </p>
                      )}
                    </div>
                  </div>

                  <div className="grid grid-cols-2 sm:grid-cols-5 gap-2 text-xs font-mono tabular-nums">
                    <div className="p-2.5 rounded-xl bg-kairos-surface-subtle border border-kairos-border">
                      <span className="text-kairos-muted block text-[10px]">Heart Rate</span>
                      <strong className="text-kairos-forest-ink">{ref.vitals.heartRate} bpm</strong>
                    </div>
                    <div className="p-2.5 rounded-xl bg-kairos-surface-subtle border border-kairos-border">
                      <span className="text-kairos-muted block text-[10px]">Blood Pressure</span>
                      <strong className="text-kairos-forest-ink">{ref.vitals.bp}</strong>
                    </div>
                    <div className="p-2.5 rounded-xl bg-kairos-surface-subtle border border-kairos-border">
                      <span className="text-kairos-muted block text-[10px]">SpO2</span>
                      <strong className="text-kairos-forest-ink">{ref.vitals.spo2}%</strong>
                    </div>
                    <div className="p-2.5 rounded-xl bg-kairos-surface-subtle border border-kairos-border">
                      <span className="text-kairos-muted block text-[10px]">Temp</span>
                      <strong className="text-kairos-forest-ink">{ref.vitals.temperatureC}°C</strong>
                    </div>
                    <div className="p-2.5 rounded-xl bg-kairos-surface-subtle border border-kairos-border">
                      <span className="text-kairos-muted block text-[10px]">Resp Rate</span>
                      <strong className="text-kairos-forest-ink">{ref.vitals.respRate}/min</strong>
                    </div>
                  </div>

                  <p className="text-xs text-kairos-forest-ink/85 leading-relaxed">{ref.isbarSummary}</p>

                  {/* Action Controls */}
                  {(ref.status === 'pending' || ref.status === 'escalated') && (
                    <div className="pt-3 border-t border-kairos-border-subtle space-y-3">
                      <div className="flex flex-wrap items-center gap-3">
                        <input
                          type="text"
                          value={selectedBedLabel}
                          onChange={(e) =>
                            setBedLabelByRef((prev) => ({
                              ...prev,
                              [ref.referralId]: e.target.value,
                            }))
                          }
                          aria-label={`Bed label to hold for ${ref.referralId}`}
                          className="rounded-xl border border-kairos-border px-3 py-2 text-xs font-mono text-kairos-forest-ink w-44"
                        />
                        <button
                          type="button"
                          onClick={() => handleAcceptReferral(ref.referralId, selectedBedLabel)}
                          className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl bg-kairos-emerald text-white text-xs font-bold hover:bg-kairos-emerald-hover"
                        >
                          <CheckCircle2 className="w-4 h-4" />
                          Accept & Reserve Bed (15m Hold)
                        </button>
                        <button
                          type="button"
                          onClick={() =>
                            setDecliningRefId(decliningRefId === ref.referralId ? null : ref.referralId)
                          }
                          className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl border border-red-200 dark:border-red-900/60 bg-kairos-surface text-red-700 dark:text-red-400 text-xs font-bold hover:bg-red-50 dark:bg-red-950/40"
                        >
                          <XCircle className="w-4 h-4" />
                          Decline & Escalate
                        </button>
                      </div>

                      {decliningRefId === ref.referralId && (
                        <div className="p-3.5 rounded-xl bg-red-50 dark:bg-red-950/40 border border-red-200 dark:border-red-900/60 flex flex-wrap items-center gap-2.5">
                          <input
                            type="text"
                            value={declineReason}
                            onChange={(e) => setDeclineReason(e.target.value)}
                            placeholder="Mandatory clinical reason (e.g., No ventilator available, OB-GYN OT occupied)..."
                            className="flex-1 min-w-[220px] rounded-lg border border-red-300 dark:border-red-800/70 bg-kairos-surface px-3 py-1.5 text-xs text-red-950"
                          />
                          <button
                            type="button"
                            disabled={!declineReason.trim()}
                            onClick={() => handleConfirmDecline(ref.referralId)}
                            className="px-3.5 py-1.5 rounded-lg bg-red-600 text-white text-xs font-bold disabled:opacity-50"
                          >
                            Submit Decline
                          </button>
                        </div>
                      )}
                    </div>
                  )}

                  {(ref.status === 'accepted' || ref.status === 'in_transit' || ref.status === 'arrived') && (
                    <div className="pt-3 border-t border-kairos-border-subtle flex flex-wrap items-center justify-between gap-3">
                      <span className="text-xs text-kairos-muted">
                        Ambulance Stage: <strong className="text-kairos-forest-ink uppercase">{ref.ambulanceStatus.replace('_', ' ')}</strong>
                        {ref.ambulanceEtaMin !== undefined && ref.ambulanceEtaMin > 0 && ` · ETA ${ref.ambulanceEtaMin} min`}
                      </span>
                      <div className="flex flex-wrap items-center gap-2">
                        {ref.bedHold && ref.bedHold.status !== 'converted_admitted' && (
                          <button
                            type="button"
                            onClick={() => reconfirmBedHold(ref.referralId)}
                            className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl border border-kairos-border bg-kairos-surface text-xs font-semibold text-kairos-forest-ink hover:bg-kairos-mint-soft"
                          >
                            <RefreshCw className="w-3.5 h-3.5" />
                            Reconfirm Hold (+10m)
                          </button>
                        )}
                        <button
                          type="button"
                          onClick={() => handleConfirmPatientArrival(ref.referralId)}
                          className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl bg-kairos-forest text-white text-xs font-bold hover:bg-kairos-emerald"
                        >
                          <CheckCircle2 className="w-4 h-4" />
                          Confirm Patient Arrival & Admit
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* LIVE CAPACITY & DEPARTMENTS TAB */}
      {activeTab === 'capacity' && (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-5">
          <div className="lg:col-span-6 bg-kairos-surface border border-kairos-border rounded-2xl p-6 space-y-5">
            <div>
              <h2 className="font-display text-lg font-bold text-kairos-forest-ink">
                Authorized Bed & ICU Verification · {myHospital.name}
              </h2>
              <p className="text-xs text-kairos-muted mt-1">
                Every update records your identity and timestamp so referring clinicians never rely on stale bed counts.
              </p>
            </div>

            {minutesSinceVerify > 30 && (
              <div className="p-3 rounded-xl bg-amber-50 dark:bg-amber-950/40 border border-amber-200 dark:border-amber-800/60 text-xs text-amber-900 dark:text-amber-200 flex items-center gap-2">
                <AlertTriangle className="w-4 h-4 shrink-0" />
                <span>Capacity data is over 30 minutes old. Please verify and update now.</span>
              </div>
            )}

            <div className="space-y-3">
              {(
                [
                  { label: 'ICU Beds Available', key: 'icuAvailable', value: myHospital.icuAvailable, max: myHospital.icuTotal },
                  { label: 'General Ward Available', key: 'generalAvailable', value: myHospital.generalAvailable, max: myHospital.generalTotal },
                  { label: 'Paediatric Beds Available', key: 'pedsAvailable', value: myHospital.pedsAvailable, max: myHospital.pedsTotal },
                ] as const
              ).map((row) => (
                <div
                  key={row.key}
                  className="p-4 rounded-xl border border-kairos-border bg-kairos-surface-subtle flex items-center justify-between gap-3"
                >
                  <div>
                    <p className="text-sm font-bold text-kairos-forest-ink">{row.label}</p>
                    <p className="text-xs text-kairos-muted font-mono tabular-nums">
                      Total capacity: {row.max} beds
                    </p>
                  </div>
                  <div className="flex items-center gap-2.5">
                    <button
                      type="button"
                      aria-label={`Decrease ${row.label}`}
                      onClick={() =>
                        updateHospitalCapacity(myHospital.hospitalId, {
                          [row.key]: Math.max(0, row.value - 1),
                        })
                      }
                      className="w-8 h-8 rounded-lg border border-kairos-border bg-kairos-surface flex items-center justify-center text-kairos-forest-ink hover:bg-kairos-mint-soft"
                    >
                      <Minus className="w-4 h-4" />
                    </button>
                    <span className="w-10 text-center font-mono text-base font-extrabold text-kairos-forest-ink tabular-nums">
                      {row.value}
                    </span>
                    <button
                      type="button"
                      aria-label={`Increase ${row.label}`}
                      onClick={() =>
                        updateHospitalCapacity(myHospital.hospitalId, {
                          [row.key]: Math.min(row.max, row.value + 1),
                        })
                      }
                      className="w-8 h-8 rounded-lg border border-kairos-border bg-kairos-surface flex items-center justify-center text-kairos-forest-ink hover:bg-kairos-mint-soft"
                    >
                      <Plus className="w-4 h-4" />
                    </button>
                  </div>
                </div>
              ))}
            </div>

            <div className="flex items-center justify-between p-4 rounded-xl border border-kairos-border">
              <div>
                <p className="text-sm font-bold text-kairos-forest-ink">Emergency Referral Intake Status</p>
                <p className="text-xs text-kairos-muted">
                  {myHospital.acceptingEmergencies
                    ? 'Accepting structured referrals from referring doctors'
                    : 'Diversion active — hidden from primary emergency match'}
                </p>
              </div>
              <button
                type="button"
                onClick={() =>
                  updateHospitalCapacity(myHospital.hospitalId, {
                    acceptingEmergencies: !myHospital.acceptingEmergencies,
                  })
                }
                className={`px-4 py-2 rounded-xl text-xs font-bold text-white transition-colors ${
                  myHospital.acceptingEmergencies ? 'bg-kairos-emerald' : 'bg-red-600'
                }`}
              >
                {myHospital.acceptingEmergencies ? 'Accepting' : 'On Diversion'}
              </button>
            </div>

            {/* Departments Management */}
            <div className="pt-3 border-t border-kairos-border-subtle space-y-2.5">
              <p className="text-xs font-bold text-kairos-forest-ink">Active Hospital Departments</p>
              <div className="flex flex-wrap gap-2 text-xs text-kairos-forest-ink/85">
                {myHospital.departments.map((d) => (
                  <span key={d} className="px-3 py-1 rounded-lg bg-kairos-surface-subtle border border-kairos-border">
                    {d}
                  </span>
                ))}
              </div>
              <div className="flex gap-2 pt-1">
                <input
                  type="text"
                  value={newDeptName}
                  onChange={(e) => setNewDeptName(e.target.value)}
                  placeholder="Add new department (e.g., Pulmonology)"
                  className="flex-1 rounded-xl border border-kairos-border px-3 py-2 text-xs text-kairos-forest-ink"
                />
                <button
                  type="button"
                  onClick={() => {
                    addHospitalDepartment(myHospital.hospitalId, newDeptName);
                    setNewDeptName('');
                  }}
                  className="px-4 py-2 rounded-xl bg-kairos-forest text-white text-xs font-semibold"
                >
                  Add
                </button>
              </div>
            </div>
          </div>

          <div className="lg:col-span-6 space-y-4">
            <MapPanel
              hospitals={hospitals}
              activeReferral={activeAmbulanceRef}
              selectedHospitalId={myHospital.hospitalId}
              onSelectHospital={setManagedHospitalId}
              title="Regional Hospital Capacity & Incoming Ambulance View"
              heightClass="h-[460px]"
            />
          </div>
        </div>
      )}

      {/* MEDBRIDGE CREDITS - USP FEATURE TAB FOR HOSPITALS */}
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
                  Hospital MedBridge Credits™ &amp; SLA Accountability Hub
                </h2>
                <p className="text-sm text-emerald-100/80 max-w-2xl leading-relaxed">
                  Rewarding receiving facilities for <strong>Complete ISBAR Handovers</strong>, <strong>Accept-Before-You-Move Bed Holds</strong>,
                  and <strong>&lt;5 Min Emergency Alert Acknowledgments</strong>. Redeem non-monetary merit credits for algorithmic dispatch priority boost,
                  mutual aid buffers, and automated NABH digital audit packages.
                </p>
              </div>

              <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-3 w-full lg:w-auto">
                <button
                  type="button"
                  onClick={() => {
                    awardMedbridgeCredits(
                      hospitalAccount.entityId,
                      'hospital',
                      50,
                      'Emergency Alert Acknowledged within 5-Minute Window (<300s SLA)',
                      'alert_sla_5min'
                    );
                    awardMedbridgeCredits(
                      hospitalAccount.entityId,
                      'hospital',
                      50,
                      'Accept-Before-You-Move Bed Hold Reserved & Honored with Zero Double-Booking',
                      'accept_before_move'
                    );
                    awardMedbridgeCredits(
                      hospitalAccount.entityId,
                      'hospital',
                      50,
                      'Complete ISBAR Clinical Handover & Vitals Telemetry Validated',
                      'isbar_compliance'
                    );
                  }}
                  className="inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl bg-gradient-to-r from-amber-400 to-amber-500 text-amber-950 font-bold text-xs uppercase tracking-wider hover:from-amber-300 hover:to-amber-400 shadow-md transition-all active:scale-95 whitespace-nowrap"
                >
                  <Zap className="w-4 h-4 fill-amber-950" />
                  Simulate Complete Triage &amp; Auto-Verify (+150 MBC)
                </button>
                <button
                  type="button"
                  onClick={() => {
                    awardMedbridgeCredits(
                      hospitalAccount.entityId,
                      'hospital',
                      75,
                      'Zero-Double-Booking Bed Hold Audit Passed (100% Integrity)',
                      'zero_double_booking'
                    );
                  }}
                  className="inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl bg-white/10 hover:bg-white/15 border border-white/20 text-white font-medium text-xs uppercase tracking-wider transition-all whitespace-nowrap"
                >
                  <ShieldCheck className="w-4 h-4 text-emerald-400" />
                  +75 MBC Hold Integrity
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
                      Hospital Zero Cash Commission Charter · Ethical Network Standards
                    </h3>
                    <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-emerald-200 dark:bg-emerald-900/60 text-emerald-900 dark:text-emerald-200 border border-emerald-300">
                      NMC Ethics Compliant
                    </span>
                    <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-cyan-100 dark:bg-cyan-950/60 text-cyan-900 dark:text-cyan-300 border border-cyan-300">
                      NABH Quality Verified
                    </span>
                  </div>
                  <p className="text-xs text-kairos-muted mt-1 leading-relaxed max-w-3xl">
                    Under National Medical Commission (NMC) codes and clinical establishment laws, <strong>KAIROS strictly prohibits cash referral kickbacks or financial cuts</strong>. MedBridge Credits are non-monetary institutional performance tokens earned through verifiable quality metrics: sub-5 minute alert response, Accept-Before-You-Move bed hold compliance, and complete ISBAR handovers. Credits are redeemable exclusively for accredited staff CME licenses, algorithmic dispatch priority boosts, and automated NABH digital audit exports.
                  </p>
                </div>
              </div>
              <div className="shrink-0 flex items-center gap-2">
                <div className="px-3 py-1.5 rounded-xl bg-white dark:bg-kairos-card border border-emerald-300 dark:border-emerald-800 text-center">
                  <span className="text-[10px] font-bold uppercase text-kairos-muted block">Cash Cut</span>
                  <strong className="text-xs text-red-600 font-mono">₹0.00 (Zero)</strong>
                </div>
                <div className="px-3 py-1.5 rounded-xl bg-white dark:bg-kairos-card border border-emerald-300 dark:border-emerald-800 text-center">
                  <span className="text-[10px] font-bold uppercase text-kairos-muted block">Audit Status</span>
                  <strong className="text-xs text-emerald-700 dark:text-emerald-400 font-mono">Non-Monetary Merit</strong>
                </div>
              </div>
            </div>
          </div>

          {/* Automated Verification Engine & Compiler Status */}
          <div className="rounded-2xl bg-white dark:bg-kairos-card border border-kairos-border p-5 space-y-4 shadow-sm">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-kairos-border pb-3">
              <div className="flex items-center gap-2.5">
                <div className="w-8 h-8 rounded-lg bg-kairos-mint-soft text-kairos-emerald flex items-center justify-center">
                  <BadgeCheck className="w-4 h-4" />
                </div>
                <div>
                  <h3 className="text-sm font-bold text-kairos-forest-ink">
                    Hospital Automated SLA Verification &amp; Protocol Compiler
                  </h3>
                  <p className="text-[11px] text-kairos-muted">
                    Automated smart compliance gates for emergency admission and bed hold honoring
                  </p>
                </div>
              </div>
              <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-emerald-50 dark:bg-emerald-950/40 text-emerald-700 dark:text-emerald-400 text-xs font-bold border border-emerald-200 dark:border-emerald-800">
                <Check className="w-3.5 h-3.5" />
                All 3 Core Emergency Gates ACTIVE
              </span>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div className="p-4 rounded-xl bg-kairos-surface-subtle border border-kairos-border flex flex-col justify-between">
                <div>
                  <div className="flex items-center justify-between mb-1.5">
                    <span className="text-xs font-bold text-kairos-forest-ink flex items-center gap-1.5">
                      <Clock className="w-3.5 h-3.5 text-kairos-emerald" />
                      1. &lt;5 Min Alert Acknowledgment
                    </span>
                    <span className="text-xs font-bold text-emerald-700 font-mono">+50 MBC</span>
                  </div>
                  <p className="text-[11px] text-kairos-muted leading-relaxed">
                    Clinician review &amp; acknowledgment registered within 300 seconds of incoming emergency transfer alert.
                  </p>
                </div>
                <div className="mt-3 pt-2.5 border-t border-kairos-border/60 flex items-center justify-between text-[11px]">
                  <span className="text-kairos-muted">SLA Average:</span>
                  <span className="font-semibold text-emerald-700 flex items-center gap-1 font-mono">
                    <Check className="w-3 h-3" /> 3m 48s (&lt; 5m SLA Pass)
                  </span>
                </div>
              </div>

              <div className="p-4 rounded-xl bg-kairos-surface-subtle border border-kairos-border flex flex-col justify-between">
                <div>
                  <div className="flex items-center justify-between mb-1.5">
                    <span className="text-xs font-bold text-kairos-forest-ink flex items-center gap-1.5">
                      <Lock className="w-3.5 h-3.5 text-kairos-emerald" />
                      2. Accept Before You Move Bed Lock
                    </span>
                    <span className="text-xs font-bold text-emerald-700 font-mono">+50 MBC</span>
                  </div>
                  <p className="text-[11px] text-kairos-muted leading-relaxed">
                    Guaranteed bed reservation issued and held before ambulance leaves referring center. 0% double-booking.
                  </p>
                </div>
                <div className="mt-3 pt-2.5 border-t border-kairos-border/60 flex items-center justify-between text-[11px]">
                  <span className="text-kairos-muted">Bed Hold Integrity:</span>
                  <span className="font-semibold text-emerald-700 flex items-center gap-1">
                    <Check className="w-3 h-3" /> 100% Zero-Break Guarantee
                  </span>
                </div>
              </div>

              <div className="p-4 rounded-xl bg-kairos-surface-subtle border border-kairos-border flex flex-col justify-between">
                <div>
                  <div className="flex items-center justify-between mb-1.5">
                    <span className="text-xs font-bold text-kairos-forest-ink flex items-center gap-1.5">
                      <FileCheck className="w-3.5 h-3.5 text-kairos-emerald" />
                      3. Complete ISBAR Intake Audit
                    </span>
                    <span className="text-xs font-bold text-emerald-700 font-mono">+50 MBC</span>
                  </div>
                  <p className="text-[11px] text-kairos-muted leading-relaxed">
                    Electronic verification of HL7 FHIR ISBAR bundle with vitals telemetry streaming prior to ED arrival.
                  </p>
                </div>
                <div className="mt-3 pt-2.5 border-t border-kairos-border/60 flex items-center justify-between text-[11px]">
                  <span className="text-kairos-muted">Intake Gate:</span>
                  <span className="font-semibold text-emerald-700 flex items-center gap-1">
                    <Check className="w-3 h-3" /> Pre-Triage Validated
                  </span>
                </div>
              </div>
            </div>
          </div>

          {/* 4 Core Stat Cards */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            <div className="p-5 rounded-2xl bg-white dark:bg-kairos-card border border-kairos-border shadow-sm">
              <div className="flex items-center justify-between text-xs font-semibold text-kairos-forest-subtle uppercase tracking-wider mb-2">
                <span>Credit Reserve</span>
                <Award className="w-4 h-4 text-amber-500" />
              </div>
              <div className="flex items-baseline gap-2">
                <span className="text-3xl font-serif font-bold text-kairos-forest-ink">
                  {hospitalAccount.balance.toLocaleString()}
                </span>
                <span className="text-xs font-bold text-amber-600 bg-amber-50 px-2 py-0.5 rounded-md border border-amber-200">
                  MBC
                </span>
              </div>
              <p className="text-xs text-kairos-forest-subtle mt-2 flex items-center gap-1">
                <TrendingUp className="w-3 h-3 text-emerald-600" />
                Lifetime accrued: {hospitalAccount.lifetimeEarned.toLocaleString()} MBC
              </p>
            </div>

            <div className="p-5 rounded-2xl bg-white dark:bg-kairos-card border border-kairos-border shadow-sm">
              <div className="flex items-center justify-between text-xs font-semibold text-kairos-forest-subtle uppercase tracking-wider mb-2">
                <span>Network Tier</span>
                <ShieldCheck className="w-4 h-4 text-kairos-emerald" />
              </div>
              <div className="flex items-baseline gap-2">
                <span className="text-2xl font-serif font-bold text-kairos-forest-ink uppercase tracking-wide">
                  {hospitalAccount.tier}
                </span>
                <span className="text-xs text-kairos-emerald font-semibold">Tier Status</span>
              </div>
              <p className="text-xs text-kairos-forest-subtle mt-2">
                Streak: <strong className="text-kairos-forest-ink">{hospitalAccount.streakCount} consecutive</strong> zero-break holds
              </p>
            </div>

            <div className="p-5 rounded-2xl bg-white dark:bg-kairos-card border border-kairos-border shadow-sm">
              <div className="flex items-center justify-between text-xs font-semibold text-kairos-forest-subtle uppercase tracking-wider mb-2">
                <span>Acceptance SLA</span>
                <Clock className="w-4 h-4 text-cyan-600" />
              </div>
              <div className="flex items-baseline gap-2">
                <span className="text-3xl font-serif font-bold text-kairos-forest-ink">
                  {hospitalAccount.complianceRate}%
                </span>
                <span className="text-xs text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded-md border border-emerald-200 font-bold">
                  Target &lt;5m
                </span>
              </div>
              <p className="text-xs text-kairos-forest-subtle mt-2">
                Average response time: <strong className="text-kairos-forest-ink">3 min 48 sec</strong>
              </p>
            </div>

            <div className="p-5 rounded-2xl bg-white dark:bg-kairos-card border border-kairos-border shadow-sm">
              <div className="flex items-center justify-between text-xs font-semibold text-kairos-forest-subtle uppercase tracking-wider mb-2">
                <span>Bed Hold Integrity</span>
                <BedDouble className="w-4 h-4 text-purple-600" />
              </div>
              <div className="flex items-baseline gap-2">
                <span className="text-3xl font-serif font-bold text-kairos-forest-ink">
                  100%
                </span>
                <span className="text-xs text-purple-700 bg-purple-50 px-2 py-0.5 rounded-md border border-purple-200 font-bold">
                  Zero Double-Book
                </span>
              </div>
              <p className="text-xs text-kairos-forest-subtle mt-2">
                {Math.max(0, hospitalAccount.lifetimeEarned - hospitalAccount.balance).toLocaleString()} MBC redeemed for institutional utility
              </p>
            </div>
          </div>

          {/* Interactive Hospital Utility & Redemptions */}
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <div>
                <h3 className="text-lg font-serif font-bold text-kairos-forest-ink">
                  Hospital Institutional Perks &amp; Utility Vault
                </h3>
                <p className="text-xs text-kairos-forest-subtle">
                  Redeem earned credits for algorithmic dispatch priority boost, mutual aid reserves, CME staff licenses, and automated NABH digital audit packages.
                </p>
              </div>
              <span className="text-xs text-kairos-forest-subtle">
                Balance: <strong className="text-amber-600 font-mono">{hospitalAccount.balance.toLocaleString()} MBC</strong>
              </span>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
              {[
                {
                  id: 'dispatch-boost',
                  title: 'Algorithmic Dispatch Priority Boost',
                  desc: '30-day algorithmic routing priority for trauma and cardiac referrals matching hospital specialty.',
                  cost: 1000,
                  tag: 'Volume & Intake',
                  category: 'priority_matching' as const,
                  icon: TrendingUp,
                },
                {
                  id: 'mutual-aid',
                  title: 'Inter-Hospital Mutual Aid Reserve',
                  desc: 'Pre-negotiated overflow backup ICU bed guarantee with peer hospital network during surge capacity.',
                  cost: 750,
                  tag: 'Capacity Buffer',
                  category: 'network_buffer' as const,
                  icon: Building2,
                },
                {
                  id: 'nabh-audit',
                  title: 'NABH / Ayushman Digital Audit Package',
                  desc: '1-click cryptographic export of response times, bed hold compliance, and clinical handovers for accreditation.',
                  cost: 500,
                  tag: 'Accreditation',
                  category: 'nabh_compliance' as const,
                  icon: ShieldCheck,
                },
                {
                  id: 'hospital-cme',
                  title: 'Emergency Resuscitation CME License',
                  desc: '10 institutional seats for emergency simulation, acute airway, and trauma resuscitation training.',
                  cost: 600,
                  tag: 'Staff Training',
                  category: 'cme_training' as const,
                  icon: Award,
                },
              ].map((voucher) => {
                const canAfford = hospitalAccount.balance >= voucher.cost;
                const IconComponent = voucher.icon;
                return (
                  <div
                    key={voucher.id}
                    className="p-5 rounded-2xl bg-white dark:bg-kairos-card border border-kairos-border shadow-sm flex flex-col justify-between hover:border-kairos-emerald transition-all"
                  >
                    <div className="space-y-3">
                      <div className="flex items-center justify-between">
                        <span className="text-[11px] font-bold px-2 py-0.5 rounded bg-kairos-mint-soft text-kairos-emerald border border-kairos-border">
                          {voucher.tag}
                        </span>
                        <div className="p-2 rounded-xl bg-emerald-50 dark:bg-emerald-950/40 text-emerald-700 dark:text-emerald-300">
                          <IconComponent className="w-4 h-4" />
                        </div>
                      </div>

                      <div>
                        <h4 className="text-sm font-serif font-bold text-kairos-forest-ink">
                          {voucher.title}
                        </h4>
                        <p className="text-xs text-kairos-forest-subtle mt-1 leading-relaxed">
                          {voucher.desc}
                        </p>
                      </div>
                    </div>

                    <div className="mt-5 pt-4 border-t border-kairos-border/80 flex items-center justify-between gap-3">
                      <div>
                        <span className="text-xs text-kairos-forest-subtle block">Cost</span>
                        <span className="text-base font-bold text-amber-600 font-mono">
                          {voucher.cost.toLocaleString()} <span className="text-[10px] text-amber-700">MBC</span>
                        </span>
                      </div>

                      <button
                        type="button"
                        disabled={!canAfford}
                        onClick={() => {
                          redeemMedbridgeCredits(
                            hospitalAccount.entityId,
                            'hospital',
                            voucher.cost,
                            voucher.title,
                            voucher.category
                          );
                        }}
                        className={`px-3.5 py-2 rounded-xl text-xs font-bold transition-all shadow-sm ${
                          canAfford
                            ? 'bg-kairos-emerald hover:bg-kairos-emerald-hover text-white active:scale-95'
                            : 'bg-gray-100 dark:bg-gray-800 text-gray-400 cursor-not-allowed border border-gray-200 dark:border-gray-700'
                        }`}
                      >
                        {canAfford ? 'Redeem Perk' : `Need ${voucher.cost - hospitalAccount.balance} more`}
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Immutable Transaction Ledger */}
          <div className="p-6 rounded-2xl bg-white dark:bg-kairos-card border border-kairos-border shadow-sm space-y-4">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
              <div>
                <h3 className="text-base font-serif font-bold text-kairos-forest-ink">
                  Hospital MedBridge Automated Verification &amp; Audit Ledger
                </h3>
                <p className="text-xs text-kairos-forest-subtle">
                  Cryptographically timestamped transaction log with automated SLA verification and Zero-Cash-Commission seal.
                </p>
              </div>
              <div className="flex items-center gap-2">
                <span className="text-[11px] font-mono px-2.5 py-1 rounded-lg bg-emerald-50 dark:bg-emerald-950/40 text-emerald-800 dark:text-emerald-300 border border-emerald-300 font-bold">
                  Zero Cash Commission Audit: PASS
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
                  {hospitalAccount.recentTransactions.map((tx) => {
                    const isEarned = tx.type === 'earn' || tx.type === 'earned';
                    const dateStr = new Date(tx.timestamp).toLocaleString('en-IN', {
                      month: 'short',
                      day: 'numeric',
                      hour: '2-digit',
                      minute: '2-digit',
                    });

                    // Verification method label
                    let verifMethod = 'Auto-Verified: <5m Alert SLA (<300s)';
                    if (tx.category === 'accept_before_move') verifMethod = 'Auto-Verified: Accept-Before-Move Bed Lock';
                    else if (tx.category === 'isbar_compliance') verifMethod = 'Auto-Verified: ISBAR Handover (FHIR-OK)';
                    else if (tx.category === 'zero_double_booking') verifMethod = 'Auto-Verified: 100% Bed Hold Honored';
                    else if (tx.category === 'cme_training') verifMethod = 'Institutional CME License Disbursed';
                    else if (tx.category === 'priority_matching') verifMethod = 'Algorithmic Dispatch Boost Active';
                    else if (tx.category === 'nabh_compliance') verifMethod = 'NABH Digital Audit Package Exported';

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
    </div>
  );
};
