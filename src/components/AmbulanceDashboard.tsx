import React, { useMemo, useState } from 'react';
import {
  Activity,
  AlertTriangle,
  Ambulance,
  CheckCircle2,
  Clock,
  Compass,
  HeartPulse,
  MapPin,
  Navigation,
  PhoneCall,
  ShieldCheck,
  Stethoscope,
  WifiOff,
} from 'lucide-react';
import { useKairos } from '../context/KairosContext';
import type { AmbulanceStage } from '../types/kairos';
import { evaluateBedHoldState, formatCountdown } from '../utils/kairosEngine';
import { MapPanel } from './MapPanel';

const TRANSFER_STAGES: { stage: AmbulanceStage; label: string; defaultEta: number }[] = [
  { stage: 'assigned', label: 'Assigned', defaultEta: 14 },
  { stage: 'preparing', label: 'Preparing', defaultEta: 12 },
  { stage: 'dispatched', label: 'Dispatched', defaultEta: 10 },
  { stage: 'picked_up', label: 'Patient Picked Up', defaultEta: 8 },
  { stage: 'en_route', label: 'En Route', defaultEta: 5 },
  { stage: 'arrived', label: 'Arrived', defaultEta: 0 },
  { stage: 'completed', label: 'Transfer Completed', defaultEta: 0 },
];

interface AmbulanceDashboardProps {
  activeTab: string;
  onTabChange: (tab: string) => void;
  searchQuery: string;
}

export const AmbulanceDashboard: React.FC<AmbulanceDashboardProps> = ({
  activeTab,
  onTabChange,
  searchQuery,
}) => {
  const {
    hospitals,
    referrals,
    nowMs,
    isOfflineSimulated,
    updateAmbulanceTransfer,
    confirmPatientArrival,
    showToast,
  } = useKairos();

  const assignedTransfers = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    return referrals
      .filter((r) => r.status === 'accepted' || r.status === 'in_transit' || r.status === 'arrived' || r.status === 'completed' || r.manualOverrideActive)
      .filter((r) => {
        if (!q) return true;
        return (
          r.referralId.toLowerCase().includes(q) ||
          r.targetHospitalName.toLowerCase().includes(q) ||
          r.category.toLowerCase().includes(q) ||
          r.patientInitials.toLowerCase().includes(q)
        );
      });
  }, [referrals, searchQuery]);

  const [selectedReferralId, setSelectedReferralId] = useState<string>(
    assignedTransfers[0]?.referralId ?? ''
  );

  const activeTransfer =
    assignedTransfers.find((r) => r.referralId === selectedReferralId) ?? assignedTransfers[0] ?? null;

  const [hr, setHr] = useState(String(activeTransfer?.vitals.heartRate ?? 108));
  const [bp, setBp] = useState(activeTransfer?.vitals.bp ?? '140/90');
  const [spo2, setSpo2] = useState(String(activeTransfer?.vitals.spo2 ?? 94));
  const [tempC, setTempC] = useState(String(activeTransfer?.vitals.temperatureC ?? 37.2));
  const [respRate, setRespRate] = useState(String(activeTransfer?.vitals.respRate ?? 22));
  const [geoStatus, setGeoStatus] = useState<string | null>(null);

  const handleSelectTransfer = (referralId: string) => {
    setSelectedReferralId(referralId);
    const target = assignedTransfers.find((r) => r.referralId === referralId);
    if (target) {
      setHr(String(target.vitals.heartRate));
      setBp(target.vitals.bp);
      setSpo2(String(target.vitals.spo2));
      setTempC(String(target.vitals.temperatureC));
      setRespRate(String(target.vitals.respRate));
    }
  };

  const handleAdvanceStage = (stage: AmbulanceStage, etaMin: number) => {
    if (!activeTransfer) return;
    if (stage === 'arrived' || stage === 'completed') {
      updateAmbulanceTransfer(activeTransfer.referralId, stage, { etaMin: 0 });
      if (stage === 'arrived') {
        confirmPatientArrival(activeTransfer.referralId);
      }
      return;
    }
    const baseLat = activeTransfer.ambulanceLocation?.lat ?? 12.989;
    const baseLng = activeTransfer.ambulanceLocation?.lng ?? 77.701;
    updateAmbulanceTransfer(activeTransfer.referralId, stage, {
      etaMin,
      coords: {
        lat: Number((baseLat - 0.004).toFixed(4)),
        lng: Number((baseLng + 0.006).toFixed(4)),
      },
    });
  };

  const handleVitalsUpdate = (e: React.FormEvent) => {
    e.preventDefault();
    if (!activeTransfer) return;
    updateAmbulanceTransfer(activeTransfer.referralId, activeTransfer.ambulanceStatus, {
      vitals: {
        heartRate: Number(hr) || activeTransfer.vitals.heartRate,
        bp: bp.trim() || activeTransfer.vitals.bp,
        spo2: Number(spo2) || activeTransfer.vitals.spo2,
        temperatureC: Number(tempC) || activeTransfer.vitals.temperatureC,
        respRate: Number(respRate) || activeTransfer.vitals.respRate,
        recordedAt: new Date().toISOString(),
      },
    });
  };

  const handleToggleLocationConsent = () => {
    if (!activeTransfer) return;
    const nextConsent = !activeTransfer.locationConsentGranted;
    if (!nextConsent) {
      updateAmbulanceTransfer(activeTransfer.referralId, activeTransfer.ambulanceStatus, {
        locationConsentGranted: false,
      });
      setGeoStatus('Location sharing revoked. Hospital receives manual ETA updates only.');
      return;
    }

    if (typeof navigator !== 'undefined' && navigator.geolocation) {
      setGeoStatus('Requesting device GPS permission...');
      navigator.geolocation.getCurrentPosition(
        (pos) => {
          updateAmbulanceTransfer(activeTransfer.referralId, activeTransfer.ambulanceStatus, {
            locationConsentGranted: true,
            coords: {
              lat: Number(pos.coords.latitude.toFixed(5)),
              lng: Number(pos.coords.longitude.toFixed(5)),
            },
          });
          setGeoStatus('Live GPS permission granted and synced to receiving hospital.');
        },
        () => {
          setGeoStatus('Device GPS permission was denied or unavailable. Enable location access in your browser to stream live GPS.');
          showToast('Location access unavailable — enable device GPS to share live coordinates.');
        },
        { timeout: 4000 }
      );
    } else {
      setGeoStatus('Geolocation is not supported by this browser. Hospital will receive manual ETA updates.');
    }
  };

  const currentStageIdx = activeTransfer
    ? TRANSFER_STAGES.findIndex((s) => s.stage === activeTransfer.ambulanceStatus)
    : -1;

  const destinationHospital = activeTransfer
    ? hospitals.find((h) => h.hospitalId === activeTransfer.targetHospitalId)
    : undefined;

  const holdState = activeTransfer?.bedHold
    ? evaluateBedHoldState(activeTransfer.bedHold, nowMs)
    : null;

  return (
    <div className="space-y-6">
      {/* Top Action Strip */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div className="bg-white rounded-2xl border border-[#DCECE3] p-5">
          <p className="text-xs font-medium text-slate-600">Assigned Transfers</p>
          <p className="font-mono text-2xl font-bold text-[#0B3B2D] tabular-nums mt-1">
            {assignedTransfers.filter((r) => r.status !== 'completed').length}
          </p>
          <p className="text-xs text-[#119655] font-medium mt-1">
            Only confirmed or override-logged cases
          </p>
        </div>

        <div className="bg-white rounded-2xl border border-[#DCECE3] p-5">
          <p className="text-xs font-medium text-slate-600">Active Unit · ETA</p>
          <p className="font-mono text-2xl font-bold text-[#0B3B2D] tabular-nums mt-1">
            {activeTransfer?.ambulanceUnitName ? 'KA-01' : 'Standby'} ·{' '}
            {activeTransfer?.ambulanceEtaMin ?? 0}m
          </p>
          <p className="text-xs text-slate-600 mt-1">
            {activeTransfer ? `Stage: ${activeTransfer.ambulanceStatus.replace('_', ' ')}` : 'Awaiting dispatch'}
          </p>
        </div>

        <div className="bg-white rounded-2xl border border-[#DCECE3] p-5">
          <p className="text-xs font-medium text-slate-600">Receiving Bed Confirmation</p>
          <p className="font-mono text-2xl font-bold text-[#119655] tabular-nums mt-1">
            {activeTransfer?.bedHold
              ? `${activeTransfer.bedHold.bedLabel} · ${formatCountdown(holdState?.remainingSec ?? 0)}`
              : activeTransfer?.manualOverrideActive
                ? 'Override'
                : 'None'}
          </p>
          <p className="text-xs text-slate-600 mt-1">
            {activeTransfer?.targetHospitalName || 'No active destination'}
          </p>
        </div>
      </div>

      {!activeTransfer ? (
        <div className="bg-white rounded-2xl border border-[#DCECE3] p-8 text-center">
          <Ambulance className="w-8 h-8 text-[#119655] mx-auto" />
          <h2 className="font-display text-lg font-bold text-[#0B3B2D] mt-3">
            No confirmed emergency transfers yet
          </h2>
          <p className="text-sm text-slate-600 max-w-md mx-auto mt-1">
            Under KAIROS’s Accept Before You Move protocol, ambulances dispatch once a receiving
            hospital confirms capacity or a clinician logs a manual safety override.
          </p>
        </div>
      ) : (
        <>
          {/* Transfer Selector if multiple */}
          {assignedTransfers.length > 1 && (
            <div className="flex flex-wrap items-center gap-2">
              {assignedTransfers.map((ref) => (
                <button
                  key={ref.referralId}
                  type="button"
                  onClick={() => handleSelectTransfer(ref.referralId)}
                  className={`px-3.5 py-2 rounded-xl border text-xs font-semibold transition-colors ${
                    ref.referralId === activeTransfer.referralId
                      ? 'bg-[#0B3B2D] text-white border-[#0B3B2D]'
                      : 'bg-white text-[#0B3B2D] border-[#CFE3D8] hover:border-[#119655]'
                  }`}
                >
                  {ref.referralId} · {ref.patientInitials} → {ref.targetHospitalName}
                </button>
              ))}
            </div>
          )}

          {activeTab === 'transfers' && (
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
              {/* Main Handoff & 7-Stage Status Card */}
              <div className="lg:col-span-2 bg-white rounded-2xl border border-[#DCECE3] p-6 space-y-6">
                <div className="flex flex-wrap items-start justify-between gap-4 border-b border-[#E5F0EA] pb-4">
                  <div>
                    <div className="flex items-center gap-2 text-xs font-semibold">
                      <span className="font-mono text-[#0B3B2D]">{activeTransfer.referralId}</span>
                      <span className="text-slate-300">·</span>
                      <span className={activeTransfer.urgency === 'critical' ? 'text-red-700' : 'text-amber-700'}>
                        {activeTransfer.urgency.toUpperCase()}
                      </span>
                      <span className="text-slate-300">·</span>
                      <span className="text-[#119655]">
                        {activeTransfer.manualOverrideActive
                          ? 'Manual Safety Override Logged'
                          : 'Hospital Acceptance Confirmed'}
                      </span>
                    </div>
                    <h2 className="font-display text-xl font-extrabold text-[#0B3B2D] mt-1">
                      {activeTransfer.category} — {activeTransfer.patientInitials} ({activeTransfer.ageSex})
                    </h2>
                    <p className="text-xs text-slate-600 mt-1">
                      Pickup: {activeTransfer.referringHospitalName} · Destination: {activeTransfer.targetHospitalName}
                    </p>
                  </div>

                  {activeTransfer.bedHold && (
                    <div className="rounded-xl bg-[#ECFDF3] border border-[#BBF7D0] px-3.5 py-2 text-right">
                      <p className="text-[11px] font-semibold text-[#119655]">CONFIRMED BED HOLD</p>
                      <p className="font-mono text-sm font-bold text-[#0B3B2D] tabular-nums">
                        {activeTransfer.bedHold.bedLabel} · {formatCountdown(holdState?.remainingSec ?? 0)}
                      </p>
                    </div>
                  )}
                </div>

                {/* 7-Stage One-Tap Status Progression */}
                <div>
                  <div className="flex items-center justify-between mb-3">
                    <h3 className="font-display text-sm font-bold text-[#0B3B2D]">
                      7-Stage Ambulance Transfer Status
                    </h3>
                    <span className="text-xs font-mono text-slate-500">
                      Tap stage to broadcast live update
                    </span>
                  </div>
                  <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-2.5">
                    {TRANSFER_STAGES.map((item, idx) => {
                      const isCurrent = item.stage === activeTransfer.ambulanceStatus;
                      const isCompleted = currentStageIdx > idx;
                      return (
                        <button
                          key={item.stage}
                          type="button"
                          onClick={() => handleAdvanceStage(item.stage, item.defaultEta)}
                          className={`p-3 rounded-xl border text-left transition-all ${
                            isCurrent
                              ? 'bg-[#119655] border-[#0D7A44] text-white shadow-sm'
                              : isCompleted
                                ? 'bg-[#ECFDF3] border-[#BBF7D0] text-[#0B3B2D]'
                                : 'bg-[#F8FBF9] border-[#DCECE3] text-slate-700 hover:border-[#119655]'
                          }`}
                        >
                          <div className="flex items-center justify-between">
                            <span className="font-mono text-[11px] font-bold">0{idx + 1}</span>
                            {isCompleted && <CheckCircle2 className="w-3.5 h-3.5 text-[#119655]" />}
                            {isCurrent && <Ambulance className="w-3.5 h-3.5 text-white" />}
                          </div>
                          <p className="text-xs font-bold mt-1.5 leading-snug">{item.label}</p>
                        </button>
                      );
                    })}
                  </div>
                </div>

                {/* Clinician Emergency Instructions */}
                <div className="rounded-xl bg-[#F4FAF6] border border-[#D5E7DD] p-4">
                  <div className="flex items-center gap-2 text-xs font-bold text-[#0B3B2D]">
                    <Stethoscope className="w-4 h-4 text-[#119655]" />
                    Authorised Clinician Instructions ({activeTransfer.referringDoctorName})
                  </div>
                  <p className="text-sm text-slate-700 mt-2 leading-relaxed">
                    {activeTransfer.clinicianInstructions ||
                      'Maintain airway patency, monitor SpO2 continuously every 5 minutes, keep IV access patent, and notify receiving triage upon entering hospital corridor.'}
                  </p>
                  <p className="text-xs text-slate-500 mt-2">
                    Symptoms & Handover: {activeTransfer.symptoms}
                  </p>
                </div>

                {/* Quick Navigation Buttons */}
                <div className="flex flex-wrap gap-3 pt-1">
                  <button
                    type="button"
                    onClick={() => onTabChange('vitals')}
                    className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl bg-[#0B3B2D] text-white text-xs font-semibold hover:bg-[#14503E] transition-colors"
                  >
                    <HeartPulse className="w-4 h-4" />
                    Update In-Transit Vitals
                  </button>
                  <button
                    type="button"
                    onClick={() => onTabChange('route')}
                    className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl bg-white border border-[#CFE3D8] text-[#0B3B2D] text-xs font-semibold hover:border-[#119655] transition-colors"
                  >
                    <Navigation className="w-4 h-4 text-[#119655]" />
                    Route & Location Consent
                  </button>
                </div>
              </div>

              {/* Right Column: Pickup & Receiving Contacts + Latest Vitals */}
              <div className="space-y-4">
                <div className="bg-white rounded-2xl border border-[#DCECE3] p-5 space-y-3">
                  <h3 className="font-display text-sm font-bold text-[#0B3B2D]">
                    Pickup & Destination Details
                  </h3>
                  <div className="space-y-2.5 text-xs">
                    <div className="p-3 rounded-xl bg-[#F8FBF9] border border-[#E5F0EA]">
                      <p className="text-[11px] font-semibold text-slate-500">PICKUP FACILITY</p>
                      <p className="font-bold text-[#0B3B2D] mt-0.5">{activeTransfer.referringHospitalName}</p>
                      <p className="text-slate-600 mt-0.5">Lead: {activeTransfer.referringDoctorName}</p>
                    </div>
                    <div className="p-3 rounded-xl bg-[#ECFDF3] border border-[#BBF7D0]">
                      <p className="text-[11px] font-semibold text-[#119655]">RECEIVING HOSPITAL (CONFIRMED)</p>
                      <p className="font-bold text-[#0B3B2D] mt-0.5">{activeTransfer.targetHospitalName}</p>
                      <p className="text-slate-600 mt-0.5">
                        {destinationHospital?.area || 'Bengaluru East'} · Receiving MD:{' '}
                        {activeTransfer.receivingDoctorName || 'ER Duty Physician'}
                      </p>
                      {destinationHospital?.phone && (
                        <p className="font-mono text-[#0B3B2D] mt-1 inline-flex items-center gap-1">
                          <PhoneCall className="w-3 h-3 text-[#119655]" />
                          {destinationHospital.phone}
                        </p>
                      )}
                    </div>
                  </div>
                </div>

                <div className="bg-white rounded-2xl border border-[#DCECE3] p-5">
                  <h3 className="font-display text-sm font-bold text-[#0B3B2D] mb-3">
                    Latest Recorded Vitals
                  </h3>
                  <div className="grid grid-cols-2 gap-2.5 font-mono text-xs tabular-nums">
                    <div className="p-2.5 rounded-xl bg-[#F8FBF9] border border-[#E5F0EA]">
                      <span className="text-[10px] text-slate-500 block font-sans">Heart Rate</span>
                      <span className="font-bold text-[#0B3B2D] text-sm">{activeTransfer.vitals.heartRate} bpm</span>
                    </div>
                    <div className="p-2.5 rounded-xl bg-[#F8FBF9] border border-[#E5F0EA]">
                      <span className="text-[10px] text-slate-500 block font-sans">Blood Pressure</span>
                      <span className="font-bold text-[#0B3B2D] text-sm">{activeTransfer.vitals.bp}</span>
                    </div>
                    <div className="p-2.5 rounded-xl bg-[#F8FBF9] border border-[#E5F0EA]">
                      <span className="text-[10px] text-slate-500 block font-sans">SpO2</span>
                      <span className={`font-bold text-sm ${activeTransfer.vitals.spo2 < 92 ? 'text-red-700' : 'text-[#119655]'}`}>
                        {activeTransfer.vitals.spo2}%
                      </span>
                    </div>
                    <div className="p-2.5 rounded-xl bg-[#F8FBF9] border border-[#E5F0EA]">
                      <span className="text-[10px] text-slate-500 block font-sans">Temp · RR</span>
                      <span className="font-bold text-[#0B3B2D] text-sm">
                        {activeTransfer.vitals.temperatureC}°C · {activeTransfer.vitals.respRate}
                      </span>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          )}

          {activeTab === 'vitals' && (
            <div className="max-w-2xl bg-white rounded-2xl border border-[#DCECE3] p-6 space-y-5">
              <div>
                <h2 className="font-display text-lg font-extrabold text-[#0B3B2D]">
                  In-Transit Vitals Streamer · {activeTransfer.referralId}
                </h2>
                <p className="text-xs text-slate-600 mt-1">
                  Updates sync directly to the receiving ER desk at {activeTransfer.targetHospitalName}.
                </p>
              </div>

              {isOfflineSimulated && (
                <div className="rounded-xl bg-amber-50 border border-amber-200 p-3.5 text-xs text-amber-900 flex items-start gap-2.5">
                  <WifiOff className="w-4 h-4 text-amber-700 shrink-0 mt-0.5" />
                  <div>
                    <p className="font-bold">Weak Rural Connectivity Mode Active</p>
                    <p className="mt-0.5">
                      Vitals are stored locally and formatted for compact SMS fallback until broadband reconnects.
                    </p>
                  </div>
                </div>
              )}

              <form onSubmit={handleVitalsUpdate} className="space-y-4">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-xs font-semibold text-[#0B3B2D] mb-1">
                      Heart Rate (bpm)
                    </label>
                    <input
                      type="number"
                      value={hr}
                      onChange={(e) => setHr(e.target.value)}
                      className="w-full rounded-xl border border-[#CFE3D8] px-3 py-2 text-sm font-mono tabular-nums"
                      required
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-[#0B3B2D] mb-1">
                      Blood Pressure (mmHg)
                    </label>
                    <input
                      type="text"
                      value={bp}
                      onChange={(e) => setBp(e.target.value)}
                      className="w-full rounded-xl border border-[#CFE3D8] px-3 py-2 text-sm font-mono tabular-nums"
                      required
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-[#0B3B2D] mb-1">
                      Oxygen Saturation SpO2 (%)
                    </label>
                    <input
                      type="number"
                      min={50}
                      max={100}
                      value={spo2}
                      onChange={(e) => setSpo2(e.target.value)}
                      className="w-full rounded-xl border border-[#CFE3D8] px-3 py-2 text-sm font-mono tabular-nums"
                      required
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-[#0B3B2D] mb-1">
                      Temperature (°C)
                    </label>
                    <input
                      type="number"
                      step="0.1"
                      value={tempC}
                      onChange={(e) => setTempC(e.target.value)}
                      className="w-full rounded-xl border border-[#CFE3D8] px-3 py-2 text-sm font-mono tabular-nums"
                      required
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-[#0B3B2D] mb-1">
                      Respiratory Rate (breaths/min)
                    </label>
                    <input
                      type="number"
                      value={respRate}
                      onChange={(e) => setRespRate(e.target.value)}
                      className="w-full rounded-xl border border-[#CFE3D8] px-3 py-2 text-sm font-mono tabular-nums"
                      required
                    />
                  </div>
                </div>

                <div className="flex items-center gap-3 pt-2">
                  <button
                    type="submit"
                    className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl bg-[#119655] hover:bg-[#0D7A44] text-white text-sm font-semibold transition-colors"
                  >
                    <Activity className="w-4 h-4" />
                    Transmit Updated Vitals to ER
                  </button>
                  <button
                    type="button"
                    onClick={() => onTabChange('transfers')}
                    className="px-4 py-2.5 rounded-xl border border-[#CFE3D8] text-xs font-semibold text-[#0B3B2D]"
                  >
                    Back to Transfer
                  </button>
                </div>
              </form>
            </div>
          )}

          {activeTab === 'route' && (
            <div className="space-y-5">
              <div className="bg-white rounded-2xl border border-[#DCECE3] p-5 flex flex-wrap items-center justify-between gap-4">
                <div className="flex items-start gap-3">
                  <ShieldCheck className="w-5 h-5 text-[#119655] shrink-0 mt-0.5" />
                  <div>
                    <h2 className="font-display text-base font-bold text-[#0B3B2D]">
                      Explicit, Revocable Location Sharing (DPDP Compliant)
                    </h2>
                    <p className="text-xs text-slate-600 mt-0.5">
                      Live ambulance GPS is shared with {activeTransfer.targetHospitalName} only while consent is active.
                    </p>
                    {geoStatus && <p className="text-xs text-[#119655] font-medium mt-1">{geoStatus}</p>}
                  </div>
                </div>
                <button
                  type="button"
                  onClick={handleToggleLocationConsent}
                  className={`inline-flex items-center gap-2 px-4 py-2.5 rounded-xl text-xs font-semibold transition-colors ${
                    activeTransfer.locationConsentGranted
                      ? 'bg-red-50 border border-red-200 text-red-700 hover:bg-red-100'
                      : 'bg-[#119655] text-white hover:bg-[#0D7A44]'
                  }`}
                >
                  <Compass className="w-4 h-4" />
                  {activeTransfer.locationConsentGranted ? 'Revoke Location Sharing' : 'Grant Location Sharing'}
                </button>
              </div>

              <MapPanel
                hospitals={hospitals}
                activeReferral={activeTransfer}
                selectedHospitalId={activeTransfer.targetHospitalId}
                title={`Live Transfer Corridor · ${activeTransfer.referringHospitalName} → ${activeTransfer.targetHospitalName}`}
                heightClass="h-[400px]"
              />

              <div className="bg-white rounded-2xl border border-[#DCECE3] p-4 flex flex-wrap items-center justify-between gap-3 text-xs text-slate-600">
                <span className="inline-flex items-center gap-1.5">
                  <MapPin className="w-3.5 h-3.5 text-[#119655]" />
                  Current Coordinates:{' '}
                  <strong className="font-mono text-[#0B3B2D]">
                    {activeTransfer.ambulanceLocation
                      ? `${activeTransfer.ambulanceLocation.lat}, ${activeTransfer.ambulanceLocation.lng}`
                      : 'Not shared'}
                  </strong>
                </span>
                <span className="inline-flex items-center gap-1.5">
                  <Clock className="w-3.5 h-3.5 text-[#119655]" />
                  Estimated Arrival: <strong className="font-mono text-[#0B3B2D]">{activeTransfer.ambulanceEtaMin ?? 6} min</strong>
                </span>
                {activeTransfer.manualOverrideActive && (
                  <span className="inline-flex items-center gap-1.5 text-amber-800 font-semibold">
                    <AlertTriangle className="w-3.5 h-3.5" />
                    Manual Override Active — Confirm ER readiness on arrival
                  </span>
                )}
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
};
