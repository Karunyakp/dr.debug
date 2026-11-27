import React, { useMemo, useState } from 'react';
import {
  Bar,
  BarChart,
  CartesianGrid,
  Legend,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import {
  Activity,
  Bell,
  Building2,
  FlaskConical,
  Send,
  ShieldCheck,
  Stethoscope,
  Users,
} from 'lucide-react';
import { useKairos } from '../context/KairosContext';
import type { KairosNotification, UserRole } from '../types/kairos';

interface AdminDashboardProps {
  activeTab: string;
  onTabChange: (tab: string) => void;
  searchQuery: string;
}

export const AdminDashboard: React.FC<AdminDashboardProps> = ({
  activeTab,
  searchQuery,
}) => {
  const {
    hospitals,
    specialists,
    appointments,
    referrals,
    diagnosticCentres,
    diagnosticBookings,
    registeredUsers,
    auditLogs,
    updateUserRoleByAdmin,
    broadcastNotification,
    addHospitalFacility,
    addSpecialistDoctor,
  } = useKairos();

  const [broadcastTitle, setBroadcastTitle] = useState('');
  const [broadcastMessage, setBroadcastMessage] = useState('');
  const [broadcastSeverity, setBroadcastSeverity] =
    useState<KairosNotification['severity']>('info');

  const [newHospName, setNewHospName] = useState('');
  const [newHospArea, setNewHospArea] = useState('');
  const [newHospPhone, setNewHospPhone] = useState('');
  const [newHospIcu, setNewHospIcu] = useState('8');

  const [newDocName, setNewDocName] = useState('');
  const [newDocSpecialty, setNewDocSpecialty] = useState('General Medicine');
  const [newDocHospId, setNewDocHospId] = useState('');

  const bedChartData = useMemo(
    () =>
      hospitals.map((h) => ({
        name: h.name
          .replace(' Multi-Specialty', '')
          .replace(' Medical Centre', '')
          .replace(' Trauma & Cardiac Institute', '')
          .replace(' District Hospital', '')
          .replace(' General', ''),
        'ICU Avail': h.icuAvailable,
        'General Avail': h.generalAvailable,
        'Peds Avail': h.pedsAvailable,
      })),
    [hospitals]
  );

  const activityChartData = useMemo(
    () => [
      {
        module: 'OPD Tokens',
        Active: appointments.filter((a) => a.status !== 'cancelled' && a.status !== 'completed').length,
        Completed: appointments.filter((a) => a.status === 'completed').length,
      },
      {
        module: 'Referrals',
        Active: referrals.filter((r) => r.status !== 'completed' && r.status !== 'declined').length,
        Completed: referrals.filter((r) => r.status === 'completed' || r.status === 'arrived').length,
      },
      {
        module: 'Diagnostics',
        Active: diagnosticBookings.filter((d) => d.status !== 'report_ready' && d.status !== 'rejected').length,
        Completed: diagnosticBookings.filter((d) => d.status === 'report_ready').length,
      },
    ],
    [appointments, diagnosticBookings, referrals]
  );

  const totalIcuAvail = hospitals.reduce((sum, h) => sum + h.icuAvailable, 0);
  const totalIcuCap = hospitals.reduce((sum, h) => sum + h.icuTotal, 0);

  const filteredUsers = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    return registeredUsers.filter((u) => {
      if (!q) return true;
      return (
        u.displayName.toLowerCase().includes(q) ||
        u.email.toLowerCase().includes(q) ||
        u.role.toLowerCase().includes(q)
      );
    });
  }, [registeredUsers, searchQuery]);

  const filteredLogs = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    return auditLogs.filter((l) => {
      if (!q) return true;
      return (
        l.action.toLowerCase().includes(q) ||
        l.actorName.toLowerCase().includes(q) ||
        l.summary.toLowerCase().includes(q)
      );
    });
  }, [auditLogs, searchQuery]);

  const handleBroadcast = (e: React.FormEvent) => {
    e.preventDefault();
    if (!broadcastTitle.trim() || !broadcastMessage.trim()) return;
    broadcastNotification(broadcastTitle.trim(), broadcastMessage.trim(), broadcastSeverity);
    setBroadcastTitle('');
    setBroadcastMessage('');
  };

  return (
    <div className="space-y-6">
      {/* Top Platform KPIs */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="bg-white rounded-2xl border border-[#DCECE3] p-5">
          <p className="text-xs font-medium text-slate-600">Network ICU Capacity</p>
          <p className="font-mono text-2xl font-bold text-[#0B3B2D] tabular-nums mt-1">
            {totalIcuAvail} / {totalIcuCap}
          </p>
          <p className="text-xs text-[#119655] font-medium mt-1">
            {hospitals.filter((h) => h.acceptingEmergencies).length} of {hospitals.length} accepting ER
          </p>
        </div>

        <div className="bg-white rounded-2xl border border-[#DCECE3] p-5">
          <p className="text-xs font-medium text-slate-600">OPD Bookings Tracked</p>
          <p className="font-mono text-2xl font-bold text-[#0B3B2D] tabular-nums mt-1">
            {appointments.length}
          </p>
          <p className="text-xs text-slate-500 mt-1">QR + Rural SMS channels</p>
        </div>

        <div className="bg-white rounded-2xl border border-[#DCECE3] p-5">
          <p className="text-xs font-medium text-slate-600">Emergency Referrals</p>
          <p className="font-mono text-2xl font-bold text-[#0B3B2D] tabular-nums mt-1">
            {referrals.length}
          </p>
          <p className="text-xs text-slate-500 mt-1">
            {referrals.filter((r) => r.bedHold).length} with verified bed hold
          </p>
        </div>

        <div className="bg-white rounded-2xl border border-[#DCECE3] p-5">
          <p className="text-xs font-medium text-slate-600">Audit Events Logged</p>
          <p className="font-mono text-2xl font-bold text-[#0B3B2D] tabular-nums mt-1">
            {auditLogs.length}
          </p>
          <p className="text-xs text-[#119655] font-medium mt-1">DPDP 2023 + RBAC Active</p>
        </div>
      </div>

      {activeTab === 'overview' && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* Bed Capacity Chart */}
          <div className="bg-white rounded-2xl border border-[#DCECE3] p-6">
            <div className="flex items-center justify-between mb-4">
              <div>
                <h2 className="font-display text-base font-bold text-[#0B3B2D]">
                  Verified Hospital Bed Availability
                </h2>
                <p className="text-xs text-slate-500 mt-0.5">
                  Live bed counts across registered network hospitals
                </p>
              </div>
              <Activity className="w-4 h-4 text-[#119655]" />
            </div>
            <div className="h-72 w-full">
              {bedChartData.length === 0 ? (
                <div className="h-full flex items-center justify-center text-xs text-slate-500 bg-[#FAFDFB] rounded-xl border border-[#E5F0EA]">
                  Register hospitals in the Hospitals &amp; Network tab to see live bed capacity charts.
                </div>
              ) : (
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={bedChartData} margin={{ top: 8, right: 8, left: -16, bottom: 4 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#E5F0EA" />
                    <XAxis dataKey="name" interval={0} tick={{ fontSize: 11, fill: '#334155' }} />
                    <YAxis tick={{ fontSize: 11, fill: '#334155' }} />
                    <Tooltip />
                    <Legend wrapperStyle={{ fontSize: '12px' }} />
                    <Bar dataKey="ICU Avail" fill="#0B3B2D" radius={[4, 4, 0, 0]} />
                    <Bar dataKey="General Avail" fill="#119655" radius={[4, 4, 0, 0]} />
                    <Bar dataKey="Peds Avail" fill="#F2B705" radius={[4, 4, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              )}
            </div>
          </div>

          {/* Coordination Activity Chart */}
          <div className="bg-white rounded-2xl border border-[#DCECE3] p-6">
            <div className="flex items-center justify-between mb-4">
              <div>
                <h2 className="font-display text-base font-bold text-[#0B3B2D]">
                  Platform Coordination Throughput
                </h2>
                <p className="text-xs text-slate-500 mt-0.5">
                  Active vs completed cases across OPD, Emergency, and Diagnostics
                </p>
              </div>
              <Building2 className="w-4 h-4 text-[#119655]" />
            </div>
            <div className="h-72 w-full">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={activityChartData} margin={{ top: 8, right: 8, left: -16, bottom: 4 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#E5F0EA" />
                  <XAxis dataKey="module" tick={{ fontSize: 12, fill: '#334155' }} />
                  <YAxis allowDecimals={false} tick={{ fontSize: 11, fill: '#334155' }} />
                  <Tooltip />
                  <Legend wrapperStyle={{ fontSize: '12px' }} />
                  <Bar dataKey="Active" fill="#119655" radius={[4, 4, 0, 0]} />
                  <Bar dataKey="Completed" fill="#0B3B2D" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </div>
        </div>
      )}

      {activeTab === 'network' && (
        <div className="space-y-6">
          {/* Quick Onboard Hospital & Specialist Forms */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
            <form
              onSubmit={(e) => {
                e.preventDefault();
                if (!newHospName.trim() || !newHospArea.trim()) return;
                addHospitalFacility({
                  name: newHospName,
                  area: newHospArea,
                  city: 'Bengaluru',
                  phone: newHospPhone || '+91-80-0000-0000',
                  departments: ['General Medicine', 'Emergency', 'Cardiology', 'Obstetrics & Gynaecology'],
                  facilities: ['ICU', 'Ventilator', 'Blood Bank'],
                  icuTotal: Number(newHospIcu) || 0,
                  generalTotal: 30,
                  pedsTotal: 10,
                });
                setNewHospName('');
                setNewHospArea('');
                setNewHospPhone('');
              }}
              className="bg-white rounded-2xl border border-[#DCECE3] p-5 space-y-3"
            >
              <h3 className="font-display text-sm font-bold text-[#0B3B2D]">Register Hospital</h3>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                <input
                  type="text"
                  required
                  value={newHospName}
                  onChange={(e) => setNewHospName(e.target.value)}
                  placeholder="Hospital Name *"
                  className="rounded-xl border border-[#CFE3D8] px-3 py-2 text-xs text-[#0B3B2D]"
                />
                <input
                  type="text"
                  required
                  value={newHospArea}
                  onChange={(e) => setNewHospArea(e.target.value)}
                  placeholder="Area / Locality *"
                  className="rounded-xl border border-[#CFE3D8] px-3 py-2 text-xs text-[#0B3B2D]"
                />
                <input
                  type="tel"
                  value={newHospPhone}
                  onChange={(e) => setNewHospPhone(e.target.value)}
                  placeholder="Emergency Phone"
                  className="rounded-xl border border-[#CFE3D8] px-3 py-2 text-xs text-[#0B3B2D]"
                />
                <input
                  type="number"
                  min={0}
                  value={newHospIcu}
                  onChange={(e) => setNewHospIcu(e.target.value)}
                  placeholder="ICU Beds"
                  className="rounded-xl border border-[#CFE3D8] px-3 py-2 text-xs font-mono text-[#0B3B2D]"
                />
              </div>
              <button
                type="submit"
                className="px-4 py-2 rounded-xl bg-[#119655] hover:bg-[#0D7A44] text-white text-xs font-semibold"
              >
                Add Hospital to Network
              </button>
            </form>

            <form
              onSubmit={(e) => {
                e.preventDefault();
                const targetHospId = newDocHospId || hospitals[0]?.hospitalId;
                if (!newDocName.trim() || !targetHospId) return;
                addSpecialistDoctor({
                  name: newDocName,
                  specialty: newDocSpecialty,
                  hospitalId: targetHospId,
                  location: hospitals.find((h) => h.hospitalId === targetHospId)?.area || '',
                  languages: ['English', 'Kannada'],
                  timings: '09:30 AM – 04:00 PM',
                  consultationFeeInr: 500,
                  experienceYears: 8,
                  remoteAvailable: true,
                  ruralFriendly: true,
                });
                setNewDocName('');
              }}
              className="bg-white rounded-2xl border border-[#DCECE3] p-5 space-y-3"
            >
              <h3 className="font-display text-sm font-bold text-[#0B3B2D]">Add Specialist Doctor</h3>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                <input
                  type="text"
                  required
                  value={newDocName}
                  onChange={(e) => setNewDocName(e.target.value)}
                  placeholder="Doctor Full Name *"
                  className="rounded-xl border border-[#CFE3D8] px-3 py-2 text-xs text-[#0B3B2D]"
                />
                <input
                  type="text"
                  required
                  value={newDocSpecialty}
                  onChange={(e) => setNewDocSpecialty(e.target.value)}
                  placeholder="Specialty *"
                  className="rounded-xl border border-[#CFE3D8] px-3 py-2 text-xs text-[#0B3B2D]"
                />
                <select
                  value={newDocHospId || hospitals[0]?.hospitalId || ''}
                  onChange={(e) => setNewDocHospId(e.target.value)}
                  disabled={hospitals.length === 0}
                  className="sm:col-span-2 rounded-xl border border-[#CFE3D8] px-3 py-2 text-xs bg-white text-[#0B3B2D] disabled:opacity-50"
                >
                  {hospitals.length === 0 ? (
                    <option value="">Register a hospital first</option>
                  ) : (
                    hospitals.map((h) => (
                      <option key={h.hospitalId} value={h.hospitalId}>
                        {h.name} ({h.area})
                      </option>
                    ))
                  )}
                </select>
              </div>
              <button
                type="submit"
                disabled={hospitals.length === 0}
                className="px-4 py-2 rounded-xl bg-[#0B3B2D] hover:bg-[#119655] text-white text-xs font-semibold disabled:opacity-50"
              >
                Add Specialist
              </button>
            </form>
          </div>

          {/* Hospitals Monitor */}
          <div className="bg-white rounded-2xl border border-[#DCECE3] overflow-hidden">
            <div className="px-6 py-4 border-b border-[#E5F0EA] flex items-center gap-2">
              <Building2 className="w-4 h-4 text-[#119655]" />
              <h2 className="font-display text-base font-bold text-[#0B3B2D]">
                Registered Hospitals &amp; Capacity Freshness ({hospitals.length})
              </h2>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead className="bg-[#F6FBF8] text-slate-600 border-b border-[#E5F0EA]">
                  <tr>
                    <th className="py-3 px-4 font-semibold">Hospital</th>
                    <th className="py-3 px-4 font-semibold">ICU</th>
                    <th className="py-3 px-4 font-semibold">General</th>
                    <th className="py-3 px-4 font-semibold">ER Status</th>
                    <th className="py-3 px-4 font-semibold">Last Verified By</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[#EEF5F1]">
                  {hospitals.length === 0 ? (
                    <tr>
                      <td colSpan={5} className="py-6 px-4 text-center text-slate-500">
                        No hospitals registered yet.
                      </td>
                    </tr>
                  ) : (
                    hospitals.map((h) => (
                      <tr key={h.hospitalId}>
                        <td className="py-3 px-4">
                          <p className="font-bold text-[#0B3B2D]">{h.name}</p>
                          <p className="text-slate-500">{h.area} · {h.distanceKm} km</p>
                        </td>
                        <td className="py-3 px-4 font-mono font-bold tabular-nums text-[#0B3B2D]">
                          {h.icuAvailable}/{h.icuTotal}
                        </td>
                        <td className="py-3 px-4 font-mono tabular-nums text-slate-700">
                          {h.generalAvailable}/{h.generalTotal}
                        </td>
                        <td className="py-3 px-4">
                          <span
                            className={`font-semibold ${
                              h.acceptingEmergencies ? 'text-[#119655]' : 'text-red-700'
                            }`}
                          >
                            {h.acceptingEmergencies ? 'Accepting' : 'Diversion'}
                          </span>
                        </td>
                        <td className="py-3 px-4 text-slate-600">{h.lastVerifiedBy}</td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {/* Specialists */}
            <div className="bg-white rounded-2xl border border-[#DCECE3] p-5">
              <div className="flex items-center gap-2 mb-3">
                <Stethoscope className="w-4 h-4 text-[#119655]" />
                <h3 className="font-display text-sm font-bold text-[#0B3B2D]">
                  Specialist Directory ({specialists.length})
                </h3>
              </div>
              <div className="divide-y divide-[#EEF5F1] text-xs">
                {specialists.map((s) => (
                  <div key={s.doctorId} className="py-2.5 flex items-center justify-between gap-2">
                    <div>
                      <p className="font-bold text-[#0B3B2D]">{s.name}</p>
                      <p className="text-slate-600">
                        {s.specialty} · {s.hospitalName}
                      </p>
                    </div>
                    <span className="text-[11px] font-semibold text-[#119655]">
                      {s.remoteAvailable ? 'Remote + OPD' : 'In-Person'}
                    </span>
                  </div>
                ))}
              </div>
            </div>

            {/* Diagnostic Centres */}
            <div className="bg-white rounded-2xl border border-[#DCECE3] p-5">
              <div className="flex items-center gap-2 mb-3">
                <FlaskConical className="w-4 h-4 text-[#119655]" />
                <h3 className="font-display text-sm font-bold text-[#0B3B2D]">
                  Diagnostic Centres ({diagnosticCentres.length})
                </h3>
              </div>
              <div className="divide-y divide-[#EEF5F1] text-xs">
                {diagnosticCentres.map((c) => (
                  <div key={c.centreId} className="py-2.5 flex items-center justify-between gap-2">
                    <div>
                      <p className="font-bold text-[#0B3B2D]">{c.name}</p>
                      <p className="text-slate-600">
                        {c.area} · {c.hours}
                      </p>
                    </div>
                    <span className="font-mono font-semibold text-[#0B3B2D]">
                      {c.tests.length} tests
                    </span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      )}

      {activeTab === 'users' && (
        <div className="bg-white rounded-2xl border border-[#DCECE3] overflow-hidden">
          <div className="px-6 py-4 border-b border-[#E5F0EA] flex items-center gap-2">
            <Users className="w-4 h-4 text-[#119655]" />
            <div>
              <h2 className="font-display text-base font-bold text-[#0B3B2D]">
                Registered Users & Role-Based Access Control (RBAC)
              </h2>
              <p className="text-xs text-slate-600">
                Server-side Firestore rules enforce least-privilege access per role.
              </p>
            </div>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="bg-[#F6FBF8] text-slate-600 border-b border-[#E5F0EA]">
                <tr>
                  <th className="py-3 px-4 font-semibold">User</th>
                  <th className="py-3 px-4 font-semibold">Email</th>
                  <th className="py-3 px-4 font-semibold">Facility</th>
                  <th className="py-3 px-4 font-semibold">DPDP Consent</th>
                  <th className="py-3 px-4 font-semibold">Assigned Role</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#EEF5F1]">
                {filteredUsers.map((u) => (
                  <tr key={u.uid}>
                    <td className="py-3 px-4 font-bold text-[#0B3B2D]">{u.displayName}</td>
                    <td className="py-3 px-4 text-slate-600 font-mono">{u.email}</td>
                    <td className="py-3 px-4 text-slate-600">{u.facilityName || '—'}</td>
                    <td className="py-3 px-4">
                      <span
                        className={`font-semibold ${
                          u.consentGranted ? 'text-[#119655]' : 'text-amber-700'
                        }`}
                      >
                        {u.consentGranted ? 'Granted' : 'Revoked'}
                      </span>
                    </td>
                    <td className="py-3 px-4">
                      <select
                        aria-label={`Role for ${u.displayName}`}
                        value={u.role}
                        onChange={(e) => updateUserRoleByAdmin(u.uid, e.target.value as UserRole)}
                        className="rounded-lg border border-[#CFE3D8] bg-white px-2.5 py-1.5 text-xs font-semibold text-[#0B3B2D]"
                      >
                        <option value="patient">Patient</option>
                        <option value="doctor">Referring Doctor</option>
                        <option value="hospital">Receiving Hospital</option>
                        <option value="ambulance">Ambulance Team</option>
                        <option value="diagnostic">Diagnostic Centre</option>
                        <option value="admin">Administrator</option>
                      </select>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {activeTab === 'governance' && (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Audit Log */}
          <div className="lg:col-span-2 bg-white rounded-2xl border border-[#DCECE3] overflow-hidden">
            <div className="px-6 py-4 border-b border-[#E5F0EA] flex items-center gap-2">
              <ShieldCheck className="w-4 h-4 text-[#119655]" />
              <div>
                <h2 className="font-display text-base font-bold text-[#0B3B2D]">
                  Immutable Coordination & DPDP Audit Trail
                </h2>
                <p className="text-xs text-slate-600">
                  Every bed hold, referral override, role update, and consent change is logged.
                </p>
              </div>
            </div>
            <div className="max-h-[460px] overflow-y-auto divide-y divide-[#EEF5F1]">
              {filteredLogs.map((log) => (
                <div key={log.logId} className="px-5 py-3.5 text-xs">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <span className="font-mono font-bold text-[#0B3B2D]">{log.action}</span>
                    <span className="text-slate-500 font-mono text-[11px]">
                      {new Date(log.createdAt).toLocaleTimeString([], {
                        hour: '2-digit',
                        minute: '2-digit',
                        second: '2-digit',
                      })}
                    </span>
                  </div>
                  <p className="text-slate-700 mt-1">{log.summary}</p>
                  <p className="text-[11px] text-slate-500 mt-0.5">
                    Actor: {log.actorName} ({log.actorRole}) · Entity: {log.entityType}/{log.entityId}
                  </p>
                </div>
              ))}
            </div>
          </div>

          {/* System Broadcast Notification */}
          <div className="bg-white rounded-2xl border border-[#DCECE3] p-6">
            <div className="flex items-center gap-2 mb-1">
              <Bell className="w-4 h-4 text-[#119655]" />
              <h3 className="font-display text-base font-bold text-[#0B3B2D]">
                System Broadcast Alert
              </h3>
            </div>
            <p className="text-xs text-slate-600 mb-4">
              Publish operational advisories to all active hospital, doctor, ambulance, and patient portals.
            </p>
            <form onSubmit={handleBroadcast} className="space-y-3.5">
              <div>
                <label className="block text-xs font-semibold text-[#0B3B2D] mb-1">Alert Title</label>
                <input
                  type="text"
                  value={broadcastTitle}
                  onChange={(e) => setBroadcastTitle(e.target.value)}
                  placeholder="e.g., Outer Ring Road Trauma Diversion"
                  className="w-full rounded-xl border border-[#CFE3D8] px-3 py-2 text-xs"
                  required
                />
              </div>
              <div>
                <label className="block text-xs font-semibold text-[#0B3B2D] mb-1">Severity</label>
                <select
                  value={broadcastSeverity}
                  onChange={(e) =>
                    setBroadcastSeverity(e.target.value as KairosNotification['severity'])
                  }
                  className="w-full rounded-xl border border-[#CFE3D8] px-3 py-2 text-xs bg-white"
                >
                  <option value="info">Info</option>
                  <option value="warning">Warning</option>
                  <option value="critical">Critical</option>
                  <option value="success">Resolved / Success</option>
                </select>
              </div>
              <div>
                <label className="block text-xs font-semibold text-[#0B3B2D] mb-1">Message</label>
                <textarea
                  rows={4}
                  value={broadcastMessage}
                  onChange={(e) => setBroadcastMessage(e.target.value)}
                  placeholder="Provide clear, non-diagnostic coordination guidance..."
                  className="w-full rounded-xl border border-[#CFE3D8] px-3 py-2 text-xs"
                  required
                />
              </div>
              <button
                type="submit"
                className="w-full inline-flex items-center justify-center gap-2 py-2.5 px-4 rounded-xl bg-[#0B3B2D] hover:bg-[#15523F] text-white text-xs font-semibold"
              >
                <Send className="w-3.5 h-3.5" />
                Broadcast to All Roles
              </button>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
