import React, { useMemo, useState } from 'react';
import { QRCodeSVG } from 'qrcode.react';
import {
  Activity,
  Building2,
  Calendar,
  CheckCircle2,
  Clock,
  FileText,
  FlaskConical,
  Languages,
  MapPin,
  QrCode,
  Search,
  ShieldCheck,
  Stethoscope,
  User,
  Video,
} from 'lucide-react';
import { useKairos } from '../context/KairosContext';
import { RURAL_I18N, type RuralLang } from '../data/i18n';
import { MapPanel } from './MapPanel';

interface PatientDashboardProps {
  activeTab: string;
  onTabChange: (tab: string) => void;
  searchQuery: string;
}

export const PatientDashboard: React.FC<PatientDashboardProps> = ({
  activeTab,
  onTabChange,
  searchQuery,
}) => {
  const {
    currentUser,
    hospitals,
    specialists,
    appointments,
    referrals,
    diagnosticCentres,
    diagnosticBookings,
    bookAppointment,
    checkInAppointmentByToken,
    rescheduleAppointment,
    cancelAppointment,
    bookDiagnosticTest,
    updateCurrentProfile,
  } = useKairos();

  // Smart OPD Booking Form state
  const [opdHospitalId, setOpdHospitalId] = useState(hospitals[0]?.hospitalId ?? '');
  const opdHospital = hospitals.find((h) => h.hospitalId === opdHospitalId) ?? hospitals[0];
  const [opdDept, setOpdDept] = useState(opdHospital?.departments[0] ?? 'General Medicine');
  const [opdDoctor, setOpdDoctor] = useState(specialists[0]?.name ?? 'Duty Clinician');
  const [opdSlot, setOpdSlot] = useState('Today · 10:30 AM');
  const [rescheduleTargetId, setRescheduleTargetId] = useState<string | null>(null);
  const [rescheduleSlot, setRescheduleSlot] = useState('Today · 02:30 PM');

  // Specialist Connect & Rural Mode state
  const [ruralMode, setRuralMode] = useState(false);
  const [ruralLang, setRuralLang] = useState<RuralLang>('en');
  const [lowBandwidth, setLowBandwidth] = useState(false);
  const [specDeptFilter, setSpecDeptFilter] = useState('All');
  const [specAvailOnly, setSpecAvailOnly] = useState(false);
  const [specSearch, setSpecSearch] = useState('');
  const [bookingSpecId, setBookingSpecId] = useState<string | null>(null);
  const [specConsultType, setSpecConsultType] = useState<'remote' | 'in-person'>('remote');
  const [specSlot, setSpecSlot] = useState('Today · 11:00 AM');
  const [specReportName, setSpecReportName] = useState('');

  // Diagnostic Connect state
  const [diagSearch, setDiagSearch] = useState('');
  const [diagBookingTarget, setDiagBookingTarget] = useState<{
    centreId: string;
    centreName: string;
    testName: string;
    priceInr: number;
    slots: string[];
  } | null>(null);
  const [diagSlot, setDiagSlot] = useState('Today · 11:30 AM');
  const [diagPrescription, setDiagPrescription] = useState('');

  // Profile state
  const [profileName, setProfileName] = useState(currentUser?.displayName ?? '');
  const [profilePhone, setProfilePhone] = useState(currentUser?.phone ?? '');
  const [profileBlood, setProfileBlood] = useState(currentUser?.bloodGroup ?? 'O+');
  const [profileAllergies, setProfileAllergies] = useState(currentUser?.allergies ?? '');
  const [profileEmergency, setProfileEmergency] = useState(currentUser?.emergencyContact ?? '');
  const [profileAbha, setProfileAbha] = useState(currentUser?.abhaId ?? '');
  const [profileConsent, setProfileConsent] = useState(currentUser?.consentGranted ?? true);

  const t = RURAL_I18N[ruralLang];

  const myAppointments = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    return appointments.filter((a) => {
      const belongs =
        a.ownerId === currentUser?.uid ||
        (Boolean(currentUser?.displayName) &&
          a.patientName.toLowerCase().includes((currentUser?.displayName || '').split(' ')[0].toLowerCase()));
      if (!belongs) return false;
      if (!q) return true;
      return (
        a.tokenNumber.toLowerCase().includes(q) ||
        a.hospitalName.toLowerCase().includes(q) ||
        a.doctorName.toLowerCase().includes(q) ||
        a.department.toLowerCase().includes(q)
      );
    });
  }, [appointments, currentUser, searchQuery]);

  const activeAppointment =
    myAppointments.find((a) => a.status !== 'cancelled' && a.status !== 'completed') ??
    myAppointments[0];

  const filteredSpecialists = useMemo(() => {
    const q = (specSearch || searchQuery).trim().toLowerCase();
    return specialists.filter((s) => {
      if (specDeptFilter !== 'All' && s.specialty !== specDeptFilter) return false;
      if (specAvailOnly && !s.availableToday) return false;
      if (!q) return true;
      return (
        s.name.toLowerCase().includes(q) ||
        s.specialty.toLowerCase().includes(q) ||
        s.hospitalName.toLowerCase().includes(q) ||
        s.location.toLowerCase().includes(q)
      );
    });
  }, [searchQuery, specAvailOnly, specDeptFilter, specSearch, specialists]);

  const filteredCentres = useMemo(() => {
    const q = (diagSearch || searchQuery).trim().toLowerCase();
    if (!q) return diagnosticCentres;
    return diagnosticCentres.filter(
      (c) =>
        c.name.toLowerCase().includes(q) ||
        c.area.toLowerCase().includes(q) ||
        c.tests.some((test) => test.name.toLowerCase().includes(q) || test.category.toLowerCase().includes(q))
    );
  }, [diagSearch, diagnosticCentres, searchQuery]);

  const handleBookOpd = (e: React.FormEvent) => {
    e.preventDefault();
    if (!opdHospital) return;
    bookAppointment({
      hospitalId: opdHospital.hospitalId,
      department: opdDept,
      doctorName: opdDoctor || 'Duty Clinician',
      slotTime: opdSlot,
      consultationType: 'in-person',
      channel: 'QR',
    });
  };

  const handleConfirmSpecialistBooking = (e: React.FormEvent) => {
    e.preventDefault();
    const doc = specialists.find((s) => s.doctorId === bookingSpecId);
    if (!doc) return;
    bookAppointment({
      hospitalId: doc.hospitalId,
      department: doc.specialty,
      doctorName: doc.name,
      slotTime: specSlot,
      consultationType: specConsultType,
      channel: ruralMode ? 'SMS' : 'QR',
      attachedReportName: specReportName || undefined,
      ruralModeBooking: ruralMode,
    });
    setBookingSpecId(null);
    setSpecReportName('');
  };

  const handleConfirmDiagnosticBooking = (e: React.FormEvent) => {
    e.preventDefault();
    if (!diagBookingTarget) return;
    bookDiagnosticTest({
      centreId: diagBookingTarget.centreId,
      testName: diagBookingTarget.testName,
      slotTime: diagSlot,
      priceInr: diagBookingTarget.priceInr,
      prescriptionNote: diagPrescription.trim() || undefined,
    });
    setDiagBookingTarget(null);
    setDiagPrescription('');
  };

  const handleSaveProfile = (e: React.FormEvent) => {
    e.preventDefault();
    updateCurrentProfile({
      displayName: profileName,
      phone: profilePhone,
      bloodGroup: profileBlood,
      allergies: profileAllergies,
      emergencyContact: profileEmergency,
      abhaId: profileAbha,
      consentGranted: profileConsent,
    });
  };

  return (
    <div className="space-y-6">
      {/* OVERVIEW TAB */}
      {activeTab === 'overview' && (
        <>
          {/* 4-Card Summary Strip */}
          <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">
            <div className="bg-kairos-surface border border-kairos-border rounded-2xl p-5">
              <p className="text-xs font-medium text-kairos-muted">Active QR Token</p>
              <p className="font-display text-2xl font-extrabold text-kairos-forest-ink mt-1 font-mono tabular-nums">
                {activeAppointment ? `#${activeAppointment.tokenNumber}` : 'None'}
              </p>
              <p className="text-xs text-kairos-muted mt-1 truncate">
                {activeAppointment
                  ? `${activeAppointment.hospitalName} · ${activeAppointment.department}`
                  : 'Book a Smart OPD slot below'}
              </p>
            </div>

            <div className="bg-kairos-forest text-white rounded-2xl p-5">
              <p className="text-xs font-medium text-emerald-200">Live Queue Position</p>
              <p className="font-display text-2xl font-extrabold mt-1 font-mono tabular-nums">
                {activeAppointment && activeAppointment.queuePosition > 0
                  ? `#${activeAppointment.queuePosition} · ${activeAppointment.estimatedWaitMin} min`
                  : 'Not in queue'}
              </p>
              <p className="text-xs text-emerald-200/85 mt-1">
                {activeAppointment?.delayMin
                  ? `Doctor delayed +${activeAppointment.delayMin} min (re-estimated)`
                  : 'Delay-aware live wait tracking'}
              </p>
            </div>

            <div className="bg-kairos-surface border border-kairos-border rounded-2xl p-5">
              <p className="text-xs font-medium text-kairos-muted">Diagnostic Bookings</p>
              <p className="font-display text-2xl font-extrabold text-kairos-forest-ink mt-1 font-mono tabular-nums">
                {diagnosticBookings.length}
              </p>
              <p className="text-xs text-kairos-muted mt-1">
                {diagnosticBookings[0]?.testName || 'Search nearby labs & tests'}
              </p>
            </div>

            <div className="bg-kairos-surface border border-kairos-border rounded-2xl p-5">
              <p className="text-xs font-medium text-kairos-muted">Rural Specialist Access</p>
              <p className="font-display text-2xl font-extrabold text-kairos-emerald-ink mt-1">
                EN / ಕನ್ನಡ
              </p>
              <button
                type="button"
                onClick={() => {
                  setRuralMode(true);
                  onTabChange('specialists');
                }}
                className="mt-1 text-xs font-semibold text-kairos-forest-ink hover:text-kairos-emerald-ink"
              >
                Open Rural Simplified Mode →
              </button>
            </div>
          </div>

          {/* Main Split: Active QR Token + Live Queue & Emergency Coordination Status */}
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-5">
            {/* Digital QR Token Card */}
            <div className="lg:col-span-5 bg-kairos-surface border border-kairos-border rounded-2xl p-6 flex flex-col justify-between">
              <div className="flex items-center justify-between gap-2">
                <div>
                  <h2 className="font-display text-base font-bold text-kairos-forest-ink">
                    Your Digital OPD QR Token
                  </h2>
                  <p className="text-xs text-kairos-muted">
                    Scan at hospital kiosk or check in digitally to join live queue
                  </p>
                </div>
                <QrCode className="w-5 h-5 text-kairos-emerald-ink" />
              </div>

              {activeAppointment ? (
                <div className="my-5 flex flex-col sm:flex-row items-center gap-5 p-4 rounded-2xl bg-kairos-surface-subtle border border-kairos-border">
                  <div className="bg-white p-3 rounded-xl border border-kairos-border shrink-0">
                    <QRCodeSVG
                      value={JSON.stringify({
                        token: activeAppointment.tokenNumber,
                        hospital: activeAppointment.hospitalId,
                        patient: activeAppointment.patientName,
                      })}
                      size={112}
                      fgColor="#0B3B2D"
                    />
                  </div>
                  <div className="min-w-0 flex-1 text-center sm:text-left">
                    <p className="font-mono text-2xl font-extrabold text-kairos-forest-ink tabular-nums">
                      #{activeAppointment.tokenNumber}
                    </p>
                    <p className="text-sm font-semibold text-kairos-forest-ink mt-1">
                      {activeAppointment.hospitalName}
                    </p>
                    <p className="text-xs text-kairos-muted mt-0.5">
                      {activeAppointment.department} · {activeAppointment.doctorName}
                    </p>
                    <p className="text-xs font-mono text-kairos-emerald-ink mt-1.5 tabular-nums">
                      {activeAppointment.slotTime} · Status: {activeAppointment.status}
                    </p>
                  </div>
                </div>
              ) : (
                <div className="my-6 p-6 rounded-xl bg-kairos-surface-subtle text-center text-xs text-kairos-muted">
                  No active OPD appointment. Book a slot in Smart OPD to generate your QR token.
                </div>
              )}

              <div className="flex flex-wrap gap-2.5">
                {activeAppointment && activeAppointment.status === 'scheduled' && (
                  <button
                    type="button"
                    onClick={() => checkInAppointmentByToken(activeAppointment.tokenNumber)}
                    className="flex-1 py-2.5 px-4 rounded-xl bg-kairos-emerald text-white text-xs font-semibold hover:bg-kairos-emerald-hover transition-colors whitespace-nowrap"
                  >
                    Simulate Hospital QR Scan & Join Queue
                  </button>
                )}
                <button
                  type="button"
                  onClick={() => onTabChange('opd')}
                  className="flex-1 py-2.5 px-4 rounded-xl bg-kairos-forest text-white text-xs font-semibold hover:bg-kairos-forest-deep transition-colors whitespace-nowrap"
                >
                  Book / Manage OPD
                </button>
              </div>
            </div>

            {/* Right Column: Emergency Coordination Tracker + Nearby Hospitals */}
            <div className="lg:col-span-7 space-y-5">
              <div className="bg-kairos-surface border border-kairos-border rounded-2xl p-6">
                <div className="flex items-center justify-between mb-4">
                  <div>
                    <h2 className="font-display text-base font-bold text-kairos-forest-ink">
                      Emergency Referral & Ambulance Status
                    </h2>
                    <p className="text-xs text-kairos-muted">
                      Real-time visibility when a clinician initiates an emergency transfer
                    </p>
                  </div>
                  <Activity className="w-5 h-5 text-kairos-emerald-ink" />
                </div>

                <div className="space-y-3">
                  {referrals.length === 0 ? (
                    <p className="text-xs text-kairos-muted p-4 rounded-xl bg-kairos-surface-subtle border border-kairos-border-subtle">
                      No active emergency referrals recorded yet.
                    </p>
                  ) : (
                    referrals.slice(0, 2).map((ref) => (
                      <div
                        key={ref.referralId}
                        className="p-4 rounded-xl border border-kairos-border bg-kairos-surface-subtle flex flex-col sm:flex-row sm:items-center justify-between gap-3"
                      >
                        <div>
                          <p className="text-xs font-semibold text-kairos-forest-ink">
                            {ref.referralId} · {ref.category} → {ref.targetHospitalName}
                          </p>
                          <p className="text-xs text-kairos-muted mt-1">
                            {ref.bedHold
                              ? `Confirmed ${ref.bedHold.bedLabel} (${ref.bedHold.bedType}) by ${ref.bedHold.reservedByDoctor}`
                              : 'Awaiting receiving hospital acceptance (Accept Before You Move)'}
                          </p>
                        </div>
                        <span
                          className={`text-xs font-semibold uppercase font-mono shrink-0 ${
                            ref.status === 'in_transit' || ref.status === 'accepted'
                              ? 'text-kairos-emerald-ink'
                              : 'text-amber-700 dark:text-amber-400'
                          }`}
                        >
                          {ref.status.replace('_', ' ')}
                        </span>
                      </div>
                    ))
                  )}
                </div>
              </div>

              <MapPanel
                hospitals={hospitals}
                title="Nearby Partner Hospitals"
                heightClass="h-[240px]"
              />
            </div>
          </div>
        </>
      )}

      {/* SMART OPD TAB */}
      {activeTab === 'opd' && (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
          {/* Book New OPD Appointment */}
          <form
            onSubmit={handleBookOpd}
            className="lg:col-span-5 bg-kairos-surface border border-kairos-border rounded-2xl p-6 space-y-4 h-fit"
          >
            <div className="flex items-center gap-2.5">
              <Calendar className="w-5 h-5 text-kairos-emerald-ink" />
              <div>
                <h2 className="font-display text-base font-bold text-kairos-forest-ink">
                  Book Smart OPD Appointment
                </h2>
                <p className="text-xs text-kairos-muted">
                  Instant QR token generation & live delay-aware queue
                </p>
              </div>
            </div>

            {hospitals.length === 0 ? (
              <div className="p-4 rounded-xl bg-kairos-surface-subtle border border-kairos-border text-xs text-kairos-muted leading-relaxed">
                No hospitals are registered yet. Once a hospital registers via the Hospital Desk or Administrator portal, you can book Smart OPD tokens here.
              </div>
            ) : (
              <>
                <div>
                  <label htmlFor="opd-hosp" className="block text-xs font-semibold text-kairos-forest-ink mb-1">
                    Select Hospital
                  </label>
                  <select
                    id="opd-hosp"
                    value={opdHospital?.hospitalId ?? ''}
                    onChange={(e) => {
                      const id = e.target.value;
                      setOpdHospitalId(id);
                      const h = hospitals.find((item) => item.hospitalId === id);
                      if (h) {
                        const dept = h.departments[0] ?? 'General Medicine';
                        setOpdDept(dept);
                        const doc = specialists.find((s) => s.hospitalId === id) ?? specialists[0];
                        setOpdDoctor(doc?.name ?? 'Duty Clinician');
                      }
                    }}
                    className="w-full rounded-xl border border-kairos-border px-3.5 py-2.5 text-sm text-kairos-forest-ink focus:outline-none focus:ring-2 focus:ring-kairos-emerald"
                  >
                    {hospitals.map((h) => (
                      <option key={h.hospitalId} value={h.hospitalId}>
                        {h.name} · {h.area} ({h.distanceKm} km)
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label htmlFor="opd-dept" className="block text-xs font-semibold text-kairos-forest-ink mb-1">
                    Select Department
                  </label>
                  <select
                    id="opd-dept"
                    value={opdDept}
                    onChange={(e) => setOpdDept(e.target.value)}
                    className="w-full rounded-xl border border-kairos-border px-3.5 py-2.5 text-sm text-kairos-forest-ink focus:outline-none focus:ring-2 focus:ring-kairos-emerald"
                  >
                    {(opdHospital?.departments ?? ['General Medicine']).map((d) => (
                      <option key={d} value={d}>{d}</option>
                    ))}
                  </select>
                </div>

                <div>
                  <label htmlFor="opd-doc" className="block text-xs font-semibold text-kairos-forest-ink mb-1">
                    Select Doctor
                  </label>
                  {specialists.length > 0 ? (
                    <select
                      id="opd-doc"
                      value={opdDoctor}
                      onChange={(e) => setOpdDoctor(e.target.value)}
                      className="w-full rounded-xl border border-kairos-border px-3.5 py-2.5 text-sm text-kairos-forest-ink focus:outline-none focus:ring-2 focus:ring-kairos-emerald"
                    >
                      {specialists.map((s) => (
                        <option key={s.doctorId} value={s.name}>
                          {s.name} — {s.specialty} (₹{s.consultationFeeInr})
                        </option>
                      ))}
                    </select>
                  ) : (
                    <input
                      id="opd-doc"
                      type="text"
                      value={opdDoctor}
                      onChange={(e) => setOpdDoctor(e.target.value)}
                      placeholder="Duty Clinician"
                      className="w-full rounded-xl border border-kairos-border px-3.5 py-2.5 text-sm text-kairos-forest-ink focus:outline-none focus:ring-2 focus:ring-kairos-emerald"
                    />
                  )}
                </div>

                <div>
                  <span className="block text-xs font-semibold text-kairos-forest-ink mb-1.5">
                    Choose Available Slot
                  </span>
                  <div className="grid grid-cols-2 gap-2">
                    {['Today · 10:30 AM', 'Today · 11:15 AM', 'Today · 12:00 PM', 'Today · 02:30 PM'].map(
                      (slot) => (
                        <button
                          key={slot}
                          type="button"
                          onClick={() => setOpdSlot(slot)}
                          className={`py-2 px-3 rounded-xl text-xs font-semibold border transition-colors ${
                            opdSlot === slot
                              ? 'bg-kairos-forest text-white border-kairos-forest'
                              : 'bg-kairos-surface-subtle text-kairos-forest-ink border-kairos-border hover:border-kairos-emerald'
                          }`}
                        >
                          {slot}
                        </button>
                      )
                    )}
                  </div>
                </div>

                <button
                  type="submit"
                  className="w-full py-2.5 px-5 rounded-xl bg-kairos-emerald text-white text-sm font-semibold hover:bg-kairos-emerald-hover transition-colors"
                >
                  Confirm Booking &amp; Generate QR Token
                </button>
              </>
            )}
          </form>

          {/* My Appointments & Live Queue History */}
          <div className="lg:col-span-7 bg-kairos-surface border border-kairos-border rounded-2xl p-6 space-y-4">
            <div className="flex items-center justify-between">
              <div>
                <h2 className="font-display text-base font-bold text-kairos-forest-ink">
                  My OPD Tokens & Live Queue ({myAppointments.length})
                </h2>
                <p className="text-xs text-kairos-muted">
                  Scan QR on arrival, reschedule, or cancel anytime
                </p>
              </div>
              <Clock className="w-5 h-5 text-kairos-emerald-ink" />
            </div>

            <div className="space-y-3">
              {myAppointments.length === 0 && (
                <p className="text-xs text-kairos-muted p-4 rounded-xl bg-kairos-surface-subtle border border-kairos-border-subtle">
                  No OPD appointments booked yet.
                </p>
              )}
              {myAppointments.map((appt) => (
                <div
                  key={appt.appointmentId}
                  className="p-4 rounded-xl border border-kairos-border bg-kairos-surface-subtle space-y-3"
                >
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div className="flex items-center gap-3">
                      <div className="px-3 py-2 rounded-xl bg-kairos-surface border border-kairos-border font-mono text-sm font-bold text-kairos-forest-ink tabular-nums">
                        {appt.tokenNumber}
                      </div>
                      <div>
                        <p className="text-sm font-bold text-kairos-forest-ink">
                          {appt.hospitalName} · {appt.department}
                        </p>
                        <p className="text-xs text-kairos-muted">
                          {appt.doctorName} · {appt.slotTime} ·{' '}
                          {appt.consultationType === 'remote' ? 'Remote Consultation' : 'In-Person OPD'}
                        </p>
                        {appt.attachedReportName && (
                          <p className="text-[11px] text-kairos-emerald-ink mt-0.5">
                            Attached report: {appt.attachedReportName}
                          </p>
                        )}
                      </div>
                    </div>

                    <div className="text-right">
                      <p className="text-xs font-mono font-bold uppercase text-kairos-forest-ink">
                        {appt.status}
                      </p>
                      {appt.status !== 'cancelled' && appt.status !== 'completed' && (
                        <p className="text-xs text-kairos-muted font-mono tabular-nums mt-0.5">
                          Pos #{appt.queuePosition} · ~{appt.estimatedWaitMin} min
                        </p>
                      )}
                      {appt.delayMin > 0 && (
                        <p className="text-[11px] font-semibold text-red-700 dark:text-red-400 mt-0.5">
                          Doctor delayed +{appt.delayMin} min · Alert sent
                        </p>
                      )}
                    </div>
                  </div>

                  {appt.status !== 'cancelled' && appt.status !== 'completed' && (
                    <div className="flex flex-wrap items-center gap-2 pt-2 border-t border-kairos-border-subtle">
                      {appt.status === 'scheduled' && (
                        <button
                          type="button"
                          onClick={() => checkInAppointmentByToken(appt.tokenNumber)}
                          className="px-3 py-1.5 rounded-lg bg-kairos-emerald text-white text-xs font-semibold hover:bg-kairos-emerald-hover"
                        >
                          Scan QR & Join Queue
                        </button>
                      )}
                      <button
                        type="button"
                        onClick={() =>
                          setRescheduleTargetId(
                            rescheduleTargetId === appt.appointmentId ? null : appt.appointmentId
                          )
                        }
                        className="px-3 py-1.5 rounded-lg border border-kairos-border bg-kairos-surface text-xs font-semibold text-kairos-forest-ink hover:bg-kairos-mint-soft"
                      >
                        Reschedule
                      </button>
                      <button
                        type="button"
                        onClick={() => cancelAppointment(appt.appointmentId)}
                        className="px-3 py-1.5 rounded-lg border border-red-200 dark:border-red-900/60 bg-kairos-surface text-xs font-semibold text-red-700 dark:text-red-400 hover:bg-red-50 dark:bg-red-950/40"
                      >
                        Cancel
                      </button>
                    </div>
                  )}

                  {rescheduleTargetId === appt.appointmentId && (
                    <div className="flex flex-wrap items-center gap-2 pt-2">
                      <select
                        value={rescheduleSlot}
                        onChange={(e) => setRescheduleSlot(e.target.value)}
                        aria-label="Choose new appointment slot"
                        className="rounded-lg border border-kairos-border bg-kairos-surface px-3 py-1.5 text-xs text-kairos-forest-ink"
                      >
                        <option value="Today · 02:30 PM">Today · 02:30 PM</option>
                        <option value="Today · 04:00 PM">Today · 04:00 PM</option>
                        <option value="Tomorrow · 09:30 AM">Tomorrow · 09:30 AM</option>
                      </select>
                      <button
                        type="button"
                        onClick={() => {
                          rescheduleAppointment(appt.appointmentId, rescheduleSlot);
                          setRescheduleTargetId(null);
                        }}
                        className="px-3 py-1.5 rounded-lg bg-kairos-forest text-white text-xs font-semibold"
                      >
                        Save New Slot
                      </button>
                    </div>
                  )}
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* SPECIALIST CONNECT + RURAL KANNADA/ENGLISH ACCESS TAB */}
      {activeTab === 'specialists' && (
        <div className="space-y-5">
          {/* Rural & Semi-Urban Controls Banner */}
          <div
            className={`rounded-2xl p-5 sm:p-6 border ${
              ruralMode
                ? 'bg-kairos-forest text-white border-kairos-forest'
                : 'bg-kairos-surface text-kairos-forest-ink border-kairos-border'
            }`}
          >
            <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
              <div>
                <div className="flex items-center gap-2">
                  <Languages className={`w-5 h-5 ${ruralMode ? 'text-kairos-gold' : 'text-kairos-emerald-ink'}`} />
                  <h2 className={`font-display font-extrabold ${ruralMode ? 'text-2xl' : 'text-lg'}`}>
                    {t.bannerTitle}
                  </h2>
                </div>
                <p className={`mt-1.5 ${ruralMode ? 'text-base text-emerald-100' : 'text-xs text-kairos-muted'}`}>
                  {t.bannerSub}
                </p>
              </div>

              <div className="flex flex-wrap items-center gap-2">
                <button
                  type="button"
                  onClick={() => setRuralMode((v) => !v)}
                  className={`px-4 py-2 rounded-xl text-xs font-bold transition-colors whitespace-nowrap ${
                    ruralMode
                      ? 'bg-kairos-gold text-[#07291F]'
                      : 'bg-kairos-forest text-white hover:bg-kairos-emerald'
                  }`}
                >
                  {ruralMode ? 'Standard View' : 'Rural Simplified Mode (Large Text)'}
                </button>

                <div className="inline-flex rounded-xl border border-kairos-border bg-kairos-surface p-0.5 text-kairos-forest-ink">
                  <button
                    type="button"
                    onClick={() => setRuralLang('en')}
                    className={`px-3 py-1.5 rounded-lg text-xs font-bold ${
                      ruralLang === 'en' ? 'bg-kairos-forest text-white' : 'text-kairos-forest-ink'
                    }`}
                  >
                    English
                  </button>
                  <button
                    type="button"
                    onClick={() => setRuralLang('kn')}
                    className={`px-3 py-1.5 rounded-lg text-xs font-bold ${
                      ruralLang === 'kn' ? 'bg-kairos-forest text-white' : 'text-kairos-forest-ink'
                    }`}
                  >
                    ಕನ್ನಡ
                  </button>
                </div>

                <button
                  type="button"
                  onClick={() => setLowBandwidth((b) => !b)}
                  className={`px-3 py-2 rounded-xl border text-xs font-semibold whitespace-nowrap ${
                    lowBandwidth
                      ? 'bg-amber-100 dark:bg-amber-900/50 text-amber-950 dark:text-amber-100 border-amber-300 dark:border-amber-700/70'
                      : ruralMode
                        ? 'border-white/25 text-white hover:bg-white/10'
                        : 'border-kairos-border text-kairos-forest-ink bg-kairos-surface-subtle'
                  }`}
                >
                  {t.lowBandwidthLabel}: {lowBandwidth ? 'ON' : 'OFF'}
                </button>
              </div>
            </div>

            <p className={`mt-3 text-xs ${ruralMode ? 'text-emerald-200' : 'text-kairos-muted'}`}>
              {t.disclaimer}
            </p>
          </div>

          {/* Filters */}
          <div className="bg-kairos-surface border border-kairos-border rounded-2xl p-4 flex flex-wrap items-center gap-3">
            <div className="relative flex-1 min-w-[200px]">
              <Search className="w-4 h-4 text-kairos-muted/80 absolute left-3 top-1/2 -translate-y-1/2" />
              <input
                type="search"
                value={specSearch}
                onChange={(e) => setSpecSearch(e.target.value)}
                placeholder={t.searchPlaceholder}
                className={`w-full pl-9 pr-3 py-2 rounded-xl border border-kairos-border text-kairos-forest-ink focus:outline-none focus:ring-2 focus:ring-kairos-emerald ${
                  ruralMode ? 'text-base' : 'text-sm'
                }`}
              />
            </div>
            <select
              value={specDeptFilter}
              onChange={(e) => setSpecDeptFilter(e.target.value)}
              aria-label={t.chooseSpecialty}
              className={`rounded-xl border border-kairos-border px-3 py-2 text-kairos-forest-ink ${
                ruralMode ? 'text-base font-semibold' : 'text-sm'
              }`}
            >
              <option value="All">{t.allSpecialties}</option>
              {Array.from(new Set(specialists.map((s) => s.specialty))).map((dept) => (
                <option key={dept} value={dept}>{dept}</option>
              ))}
            </select>
            <label className="inline-flex items-center gap-2 text-xs font-semibold text-kairos-forest-ink cursor-pointer px-2">
              <input
                type="checkbox"
                checked={specAvailOnly}
                onChange={(e) => setSpecAvailOnly(e.target.checked)}
                className="rounded border-slate-300 text-kairos-emerald-ink"
              />
              {t.availableToday}
            </label>
          </div>

          {/* Specialists Grid */}
          {filteredSpecialists.length === 0 ? (
            <div className="bg-kairos-surface border border-kairos-border rounded-2xl p-8 text-center">
              <Stethoscope className="w-8 h-8 text-kairos-emerald-ink mx-auto" />
              <p className="font-display text-base font-bold text-kairos-forest-ink mt-3">
                No specialists listed yet
              </p>
              <p className="text-xs text-kairos-muted mt-1">
                Specialists registered by hospitals or administrators will appear here for booking.
              </p>
            </div>
          ) : (
          <div className={`grid grid-cols-1 ${lowBandwidth ? '' : 'md:grid-cols-2'} gap-4`}>
            {filteredSpecialists.map((doc) => {
              const isOpen = bookingSpecId === doc.doctorId;
              const hosp = hospitals.find((h) => h.hospitalId === doc.hospitalId);
              const mapsDir = hosp
                ? `https://www.google.com/maps/dir/?api=1&destination=${hosp.lat},${hosp.lng}`
                : '#';
              return (
                <div
                  key={doc.doctorId}
                  className="bg-kairos-surface border border-kairos-border rounded-2xl p-5 space-y-3"
                >
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <p className={`font-display font-bold text-kairos-forest-ink ${ruralMode ? 'text-xl' : 'text-base'}`}>
                        {doc.name}
                      </p>
                      <p className={`font-semibold text-kairos-emerald-ink ${ruralMode ? 'text-base' : 'text-xs'}`}>
                        {doc.specialty} · {doc.experienceYears} yrs exp
                      </p>
                      <p className={`text-kairos-muted mt-1 ${ruralMode ? 'text-sm' : 'text-xs'}`}>
                        {doc.hospitalName} · {doc.location}
                      </p>
                    </div>
                    <div className="text-right shrink-0">
                      <p className="font-mono text-sm font-bold text-kairos-forest-ink tabular-nums">
                        ₹{doc.consultationFeeInr}
                      </p>
                      <p className="text-[11px] text-kairos-muted">{doc.timings}</p>
                    </div>
                  </div>

                  <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-kairos-muted">
                    <span>Languages: {doc.languages.join(', ')}</span>
                    <span aria-hidden="true">·</span>
                    <span>
                      {t.nextSlotLabel}: <strong className="text-kairos-forest-ink">{doc.nextSlot}</strong>
                    </span>
                    {doc.remoteAvailable && (
                      <>
                        <span aria-hidden="true">·</span>
                        <span className="inline-flex items-center gap-1 text-kairos-emerald-ink font-medium">
                          <Video className="w-3.5 h-3.5" /> Remote Ready
                        </span>
                      </>
                    )}
                  </div>

                  <div className="flex flex-wrap items-center gap-2 pt-2">
                    <button
                      type="button"
                      onClick={() => {
                        setBookingSpecId(isOpen ? null : doc.doctorId);
                        setSpecSlot(doc.availableSlots[0] ?? doc.nextSlot);
                        setSpecConsultType(doc.remoteAvailable ? 'remote' : 'in-person');
                      }}
                      className={`px-4 py-2.5 rounded-xl bg-kairos-emerald text-white font-semibold hover:bg-kairos-emerald-hover transition-colors ${
                        ruralMode ? 'text-base flex-1' : 'text-xs'
                      }`}
                    >
                      {t.bookNow}
                    </button>
                    <a
                      href={mapsDir}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center gap-1.5 px-3.5 py-2.5 rounded-xl border border-kairos-border text-xs font-semibold text-kairos-forest-ink hover:bg-kairos-mint-soft"
                    >
                      <MapPin className="w-3.5 h-3.5 text-kairos-emerald-ink" />
                      {t.directionsLabel}
                    </a>
                  </div>

                  {isOpen && (
                    <form
                      onSubmit={handleConfirmSpecialistBooking}
                      className="mt-3 p-4 rounded-xl bg-kairos-surface-subtle border border-kairos-border space-y-3"
                    >
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                        <button
                          type="button"
                          disabled={!doc.remoteAvailable}
                          onClick={() => setSpecConsultType('remote')}
                          className={`p-2.5 rounded-xl border text-xs font-semibold text-left ${
                            specConsultType === 'remote'
                              ? 'bg-kairos-forest text-white border-kairos-forest'
                              : 'bg-kairos-surface text-kairos-forest-ink border-kairos-border'
                          } disabled:opacity-40`}
                        >
                          {t.remoteConsult}
                        </button>
                        <button
                          type="button"
                          onClick={() => setSpecConsultType('in-person')}
                          className={`p-2.5 rounded-xl border text-xs font-semibold text-left ${
                            specConsultType === 'in-person'
                              ? 'bg-kairos-forest text-white border-kairos-forest'
                              : 'bg-kairos-surface text-kairos-forest-ink border-kairos-border'
                          }`}
                        >
                          {t.inPersonVisit}
                        </button>
                      </div>

                      <div>
                        <label className="block text-xs font-semibold text-kairos-forest-ink mb-1">
                          Slot
                        </label>
                        <select
                          value={specSlot}
                          onChange={(e) => setSpecSlot(e.target.value)}
                          className="w-full rounded-xl border border-kairos-border bg-kairos-surface px-3 py-2 text-xs text-kairos-forest-ink"
                        >
                          {doc.availableSlots.map((sl) => (
                            <option key={sl} value={sl}>{sl}</option>
                          ))}
                        </select>
                      </div>

                      <div>
                        <label className="block text-xs font-semibold text-kairos-forest-ink mb-1">
                          {t.attachReport}
                        </label>
                        <input
                          type="file"
                          onChange={(e) => setSpecReportName(e.target.files?.[0]?.name || '')}
                          className="w-full text-xs text-kairos-muted file:mr-3 file:py-1.5 file:px-3 file:rounded-lg file:border-0 file:bg-kairos-forest file:text-white file:text-xs file:font-semibold"
                        />
                        {specReportName && (
                          <p className="text-[11px] text-kairos-emerald-ink mt-1">Selected: {specReportName}</p>
                        )}
                      </div>

                      <p className="text-[11px] text-kairos-muted">{t.smsNotice}</p>

                      <div className="flex justify-end gap-2">
                        <button
                          type="button"
                          onClick={() => setBookingSpecId(null)}
                          className="px-3 py-2 rounded-xl border border-kairos-border bg-kairos-surface text-xs font-semibold text-kairos-forest-ink"
                        >
                          Cancel
                        </button>
                        <button
                          type="submit"
                          className="px-4 py-2 rounded-xl bg-kairos-emerald text-white text-xs font-semibold hover:bg-kairos-emerald-hover"
                        >
                          Confirm Specialist Booking
                        </button>
                      </div>
                    </form>
                  )}
                </div>
              );
            })}
          </div>
          )}
        </div>
      )}

      {/* DIAGNOSTIC CONNECT TAB */}
      {activeTab === 'diagnostics' && (
        <div className="space-y-5">
          <div className="bg-kairos-surface border border-kairos-border rounded-2xl p-5 flex flex-wrap items-center justify-between gap-4">
            <div>
              <h2 className="font-display text-lg font-bold text-kairos-forest-ink">
                Diagnostic Connect · Labs &amp; Imaging
              </h2>
              <p className="text-xs text-kairos-muted">
                Browse registered diagnostic centres, compare test pricing and hours, and view reports securely once uploaded.
              </p>
            </div>
            <div className="relative w-full sm:w-72">
              <Search className="w-4 h-4 text-kairos-muted/80 absolute left-3 top-1/2 -translate-y-1/2" />
              <input
                type="search"
                value={diagSearch}
                onChange={(e) => setDiagSearch(e.target.value)}
                placeholder="Search CBC, ECG, Thyroid, centre..."
                className="w-full pl-9 pr-3 py-2 rounded-xl border border-kairos-border text-xs text-kairos-forest-ink focus:outline-none focus:ring-2 focus:ring-kairos-emerald"
              />
            </div>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-12 gap-5">
            {/* Diagnostic Centres & Tests */}
            <div className="lg:col-span-7 space-y-4">
              {filteredCentres.length === 0 && (
                <div className="bg-kairos-surface border border-kairos-border rounded-2xl p-8 text-center">
                  <FlaskConical className="w-8 h-8 text-kairos-emerald-ink mx-auto" />
                  <p className="font-display text-base font-bold text-kairos-forest-ink mt-3">
                    No diagnostic centres registered yet
                  </p>
                  <p className="text-xs text-kairos-muted mt-1">
                    Diagnostic labs registered via the Diagnostic Centre portal will appear here.
                  </p>
                </div>
              )}
              {filteredCentres.map((centre) => (
                <div
                  key={centre.centreId}
                  className="bg-kairos-surface border border-kairos-border rounded-2xl p-5 space-y-3"
                >
                  <div className="flex flex-wrap items-center justify-between gap-2 pb-3 border-b border-kairos-border-subtle">
                    <div>
                      <h3 className="font-display text-base font-bold text-kairos-forest-ink">
                        {centre.name}
                      </h3>
                      <p className="text-xs text-kairos-muted">
                        {centre.area} · {centre.hours} · {centre.distanceKm} km
                      </p>
                    </div>
                    <span className="text-[11px] font-semibold text-kairos-emerald-ink">
                      Verified Centre
                    </span>
                  </div>

                  <div className="divide-y divide-[#EFF6F2]">
                    {centre.tests.map((test) => (
                      <div
                        key={test.testId}
                        className="py-2.5 flex items-center justify-between gap-3"
                      >
                        <div className="min-w-0">
                          <p className="text-sm font-semibold text-kairos-forest-ink truncate">
                            {test.name}
                          </p>
                          <p className="text-xs text-kairos-muted">
                            {test.category} · Report in ~{test.turnaroundHours}h
                            {test.fastingRequired ? ' · Fasting required' : ''}
                          </p>
                        </div>
                        <div className="flex items-center gap-3 shrink-0">
                          <span className="font-mono text-sm font-bold text-kairos-forest-ink tabular-nums">
                            ₹{test.priceInr}
                          </span>
                          <button
                            type="button"
                            onClick={() => {
                              setDiagBookingTarget({
                                centreId: centre.centreId,
                                centreName: centre.name,
                                testName: test.name,
                                priceInr: test.priceInr,
                                slots: centre.slots,
                              });
                              setDiagSlot(centre.slots[0] ?? 'Today · 11:30 AM');
                            }}
                            className="px-3 py-1.5 rounded-lg bg-kairos-forest text-white text-xs font-semibold hover:bg-kairos-emerald transition-colors"
                          >
                            Book Slot
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              ))}
            </div>

            {/* Right: Booking Modal Inline + My Diagnostic Bookings */}
            <div className="lg:col-span-5 space-y-4">
              {diagBookingTarget && (
                <form
                  onSubmit={handleConfirmDiagnosticBooking}
                  className="bg-kairos-forest text-white rounded-2xl p-5 space-y-3"
                >
                  <h3 className="font-display text-sm font-bold">
                    Book {diagBookingTarget.testName}
                  </h3>
                  <p className="text-xs text-emerald-200">
                    {diagBookingTarget.centreName} · ₹{diagBookingTarget.priceInr}
                  </p>
                  <div>
                    <label className="block text-xs font-medium text-emerald-100 mb-1">
                      Preferred Slot
                    </label>
                    <select
                      value={diagSlot}
                      onChange={(e) => setDiagSlot(e.target.value)}
                      className="w-full rounded-xl bg-kairos-surface text-kairos-forest-ink px-3 py-2 text-xs font-semibold"
                    >
                      {diagBookingTarget.slots.map((s) => (
                        <option key={s} value={s}>{s}</option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-emerald-100 mb-1">
                      Authorized Prescription Reference (Optional)
                    </label>
                    <input
                      type="text"
                      value={diagPrescription}
                      onChange={(e) => setDiagPrescription(e.target.value)}
                      placeholder="e.g., Ordered by Dr. Meera Deshmukh"
                      className="w-full rounded-xl bg-kairos-surface text-kairos-forest-ink px-3 py-2 text-xs"
                    />
                  </div>
                  <div className="flex justify-end gap-2 pt-1">
                    <button
                      type="button"
                      onClick={() => setDiagBookingTarget(null)}
                      className="px-3 py-1.5 rounded-lg border border-white/25 text-xs font-semibold"
                    >
                      Cancel
                    </button>
                    <button
                      type="submit"
                      className="px-4 py-1.5 rounded-lg bg-kairos-emerald text-white text-xs font-semibold hover:bg-kairos-emerald-hover"
                    >
                      Confirm Test Booking
                    </button>
                  </div>
                </form>
              )}

              <div className="bg-kairos-surface border border-kairos-border rounded-2xl p-5 space-y-3">
                <div className="flex items-center justify-between">
                  <h3 className="font-display text-base font-bold text-kairos-forest-ink">
                    My Diagnostic Bookings & Reports
                  </h3>
                  <FlaskConical className="w-4 h-4 text-kairos-emerald-ink" />
                </div>
                {diagnosticBookings.length === 0 ? (
                  <p className="text-xs text-kairos-muted">No diagnostic bookings yet.</p>
                ) : (
                  diagnosticBookings.map((bk) => (
                    <div
                      key={bk.bookingId}
                      className="p-3.5 rounded-xl border border-kairos-border bg-kairos-surface-subtle space-y-1.5"
                    >
                      <div className="flex items-center justify-between gap-2">
                        <p className="text-xs font-bold text-kairos-forest-ink">{bk.testName}</p>
                        <span className="text-[11px] font-mono font-bold uppercase text-kairos-emerald-ink">
                          {bk.status.replace('_', ' ')}
                        </span>
                      </div>
                      <p className="text-xs text-kairos-muted">
                        {bk.centreName} · {bk.slotTime} · ₹{bk.priceInr}
                      </p>
                      {bk.reportSummary && (
                        <div className="mt-2 p-2.5 rounded-lg bg-kairos-surface border border-kairos-border text-xs text-kairos-forest-ink">
                          <p className="font-semibold flex items-center gap-1.5 text-kairos-emerald-ink">
                            <FileText className="w-3.5 h-3.5" /> Provider Report Summary
                          </p>
                          <p className="mt-1 text-kairos-forest-ink/85">{bk.reportSummary}</p>
                        </div>
                      )}
                    </div>
                  ))
                )}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* MEDICAL PROFILE & DPDP CONSENT TAB */}
      {activeTab === 'profile' && (
        <form
          onSubmit={handleSaveProfile}
          className="max-w-3xl bg-kairos-surface border border-kairos-border rounded-2xl p-6 space-y-5"
        >
          <div className="flex items-center gap-3 pb-4 border-b border-kairos-border-subtle">
            <div className="w-10 h-10 rounded-xl bg-kairos-forest text-white flex items-center justify-center">
              <User className="w-5 h-5" />
            </div>
            <div>
              <h2 className="font-display text-lg font-bold text-kairos-forest-ink">
                Patient Medical Profile & DPDP Consent
              </h2>
              <p className="text-xs text-kairos-muted">
                PII is stored in an isolated private record accessible only to you and authorized clinicians during active care.
              </p>
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label htmlFor="prof-name" className="block text-xs font-semibold text-kairos-forest-ink mb-1">
                Full Name
              </label>
              <input
                id="prof-name"
                type="text"
                value={profileName}
                onChange={(e) => setProfileName(e.target.value)}
                className="w-full rounded-xl border border-kairos-border px-3.5 py-2 text-sm text-kairos-forest-ink"
              />
            </div>
            <div>
              <label htmlFor="prof-phone" className="block text-xs font-semibold text-kairos-forest-ink mb-1">
                Mobile Number
              </label>
              <input
                id="prof-phone"
                type="tel"
                value={profilePhone}
                onChange={(e) => setProfilePhone(e.target.value)}
                className="w-full rounded-xl border border-kairos-border px-3.5 py-2 text-sm text-kairos-forest-ink"
              />
            </div>
            <div>
              <label htmlFor="prof-blood" className="block text-xs font-semibold text-kairos-forest-ink mb-1">
                Blood Group
              </label>
              <select
                id="prof-blood"
                value={profileBlood}
                onChange={(e) => setProfileBlood(e.target.value)}
                className="w-full rounded-xl border border-kairos-border px-3.5 py-2 text-sm text-kairos-forest-ink"
              >
                {['O+', 'O-', 'A+', 'A-', 'B+', 'B-', 'AB+', 'AB-'].map((bg) => (
                  <option key={bg} value={bg}>{bg}</option>
                ))}
              </select>
            </div>
            <div>
              <label htmlFor="prof-abha" className="block text-xs font-semibold text-kairos-forest-ink mb-1">
                ABHA Number (ABDM Integration-Ready Field)
              </label>
              <input
                id="prof-abha"
                type="text"
                value={profileAbha}
                onChange={(e) => setProfileAbha(e.target.value)}
                className="w-full rounded-xl border border-kairos-border px-3.5 py-2 text-sm font-mono text-kairos-forest-ink"
              />
            </div>
            <div>
              <label htmlFor="prof-allergies" className="block text-xs font-semibold text-kairos-forest-ink mb-1">
                Known Allergies
              </label>
              <input
                id="prof-allergies"
                type="text"
                value={profileAllergies}
                onChange={(e) => setProfileAllergies(e.target.value)}
                className="w-full rounded-xl border border-kairos-border px-3.5 py-2 text-sm text-kairos-forest-ink"
              />
            </div>
            <div>
              <label htmlFor="prof-emg" className="block text-xs font-semibold text-kairos-forest-ink mb-1">
                Emergency Contact
              </label>
              <input
                id="prof-emg"
                type="text"
                value={profileEmergency}
                onChange={(e) => setProfileEmergency(e.target.value)}
                className="w-full rounded-xl border border-kairos-border px-3.5 py-2 text-sm text-kairos-forest-ink"
              />
            </div>
          </div>

          <label className="flex items-start gap-3 p-4 rounded-xl bg-kairos-surface-subtle border border-kairos-border cursor-pointer">
            <input
              type="checkbox"
              checked={profileConsent}
              onChange={(e) => setProfileConsent(e.target.checked)}
              className="mt-0.5 rounded border-slate-300 text-kairos-emerald-ink"
            />
            <span className="text-xs text-kairos-forest-ink/85 leading-relaxed">
              <strong className="text-kairos-forest-ink">Active DPDP Clinical Sharing Consent:</strong> Authorize KAIROS to share my minimal medical summary (blood group, allergies, vitals, and attached reports) with receiving hospitals and ambulance clinicians during active bookings or emergency referrals.
            </span>
          </label>

          <div className="flex items-center justify-between pt-2">
            <span className="inline-flex items-center gap-1.5 text-xs text-kairos-emerald-ink font-medium">
              <ShieldCheck className="w-4 h-4" /> Consent logged in immutable audit trail
            </span>
            <button
              type="submit"
              className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl bg-kairos-forest text-white text-sm font-semibold hover:bg-kairos-emerald transition-colors"
            >
              <CheckCircle2 className="w-4 h-4" />
              Save Profile & Consent
            </button>
          </div>
        </form>
      )}
    </div>
  );
};
