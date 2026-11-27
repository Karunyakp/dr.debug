import React, { useMemo, useState } from 'react';
import {
  CheckCircle2,
  Clock,
  FileCheck2,
  FlaskConical,
  Plus,
  TestTube2,
  XCircle,
} from 'lucide-react';
import { useKairos } from '../context/KairosContext';
import type { DiagnosticBookingStatus } from '../types/kairos';

interface DiagnosticDashboardProps {
  activeTab: string;
  onTabChange: (tab: string) => void;
  searchQuery: string;
}

export const DiagnosticDashboard: React.FC<DiagnosticDashboardProps> = ({
  activeTab,
  onTabChange,
  searchQuery,
}) => {
  const {
    currentUser,
    diagnosticCentres,
    diagnosticBookings,
    updateDiagnosticBooking,
    addDiagnosticTestToCentre,
  } = useKairos();

  const myCentre =
    diagnosticCentres.find((c) => c.centreId === currentUser?.facilityId) ?? diagnosticCentres[0];

  const [reportDrafts, setReportDrafts] = useState<Record<string, string>>({});
  const [testName, setTestName] = useState('');
  const [testCategory, setTestCategory] = useState('Blood Panel');
  const [testPrice, setTestPrice] = useState('650');
  const [turnaroundHours, setTurnaroundHours] = useState('6');
  const [fastingRequired, setFastingRequired] = useState(false);

  const filteredBookings = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    return diagnosticBookings.filter((b) => {
      if (!q) return true;
      return (
        b.patientName.toLowerCase().includes(q) ||
        b.testName.toLowerCase().includes(q) ||
        b.centreName.toLowerCase().includes(q) ||
        b.bookingId.toLowerCase().includes(q)
      );
    });
  }, [diagnosticBookings, searchQuery]);

  const requestedCount = diagnosticBookings.filter((b) => b.status === 'requested').length;
  const readyCount = diagnosticBookings.filter((b) => b.status === 'report_ready').length;

  const handleStatusChange = (bookingId: string, status: DiagnosticBookingStatus) => {
    const draft = reportDrafts[bookingId]?.trim();
    updateDiagnosticBooking(
      bookingId,
      status,
      status === 'report_ready'
        ? draft || 'Verified laboratory parameters uploaded (DEMO). Clinician review advised.'
        : undefined
    );
  };

  const handleAddTest = (e: React.FormEvent) => {
    e.preventDefault();
    if (!myCentre || !testName.trim()) return;
    addDiagnosticTestToCentre(myCentre.centreId, {
      name: testName.trim(),
      category: testCategory,
      priceInr: Math.max(50, Number(testPrice) || 500),
      turnaroundHours: Math.max(1, Number(turnaroundHours) || 6),
      fastingRequired,
    });
    setTestName('');
  };

  return (
    <div className="space-y-6">
      {/* KPI Strip */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div className="bg-white rounded-2xl border border-[#DCECE3] p-5">
          <p className="text-xs font-medium text-slate-600">Diagnostic Centre</p>
          <p className="font-display text-lg font-extrabold text-[#0B3B2D] mt-1 truncate">
            {myCentre?.name}
          </p>
          <p className="text-xs text-slate-500 mt-0.5">
            {myCentre?.area} · {myCentre?.hours}
          </p>
        </div>

        <div className="bg-white rounded-2xl border border-[#DCECE3] p-5">
          <p className="text-xs font-medium text-slate-600">Pending Slot Requests</p>
          <p className="font-mono text-2xl font-bold text-amber-700 tabular-nums mt-1">
            {requestedCount}
          </p>
          <p className="text-xs text-slate-500 mt-0.5">Awaiting confirmation</p>
        </div>

        <div className="bg-white rounded-2xl border border-[#DCECE3] p-5">
          <p className="text-xs font-medium text-slate-600">Reports Published</p>
          <p className="font-mono text-2xl font-bold text-[#119655] tabular-nums mt-1">
            {readyCount}
          </p>
          <p className="text-xs text-slate-500 mt-0.5">
            {myCentre?.tests.length ?? 0} verified-demo lab tests listed
          </p>
        </div>
      </div>

      {activeTab === 'bookings' && (
        <div className="bg-white rounded-2xl border border-[#DCECE3] overflow-hidden">
          <div className="px-6 py-4 border-b border-[#E5F0EA] flex flex-wrap items-center justify-between gap-3">
            <div>
              <h2 className="font-display text-base font-bold text-[#0B3B2D]">
                Incoming Diagnostic Bookings & Report Queue
              </h2>
              <p className="text-xs text-slate-600 mt-0.5">
                Confirm patient slots, mark sample collection, and publish report summaries.
              </p>
            </div>
            <button
              type="button"
              onClick={() => onTabChange('catalog')}
              className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-[#F4FAF6] border border-[#CFE3D8] text-xs font-semibold text-[#0B3B2D] hover:border-[#119655]"
            >
              <FlaskConical className="w-3.5 h-3.5 text-[#119655]" />
              Manage Test Catalog
            </button>
          </div>

          <div className="divide-y divide-[#EEF5F1]">
            {filteredBookings.length === 0 ? (
              <p className="p-6 text-sm text-slate-500">No diagnostic bookings match your filter.</p>
            ) : (
              filteredBookings.map((booking) => (
                <div key={booking.bookingId} className="p-5 flex flex-col lg:flex-row lg:items-center justify-between gap-4">
                  <div className="space-y-1">
                    <div className="flex flex-wrap items-center gap-2 text-xs">
                      <span className="font-mono font-bold text-[#0B3B2D]">{booking.bookingId}</span>
                      <span className="text-slate-300">·</span>
                      <span className="font-semibold text-[#0B3B2D]">{booking.patientName}</span>
                      <span className="text-slate-300">·</span>
                      <span
                        className={`font-semibold uppercase text-[11px] ${
                          booking.status === 'report_ready'
                            ? 'text-[#119655]'
                            : booking.status === 'rejected'
                              ? 'text-red-700'
                              : booking.status === 'requested'
                                ? 'text-amber-700'
                                : 'text-sky-700'
                        }`}
                      >
                        {booking.status.replace('_', ' ')}
                      </span>
                    </div>
                    <p className="text-sm font-bold text-[#0B3B2D]">
                      {booking.testName}{' '}
                      <span className="font-mono text-xs font-semibold text-slate-600">
                        · ₹{booking.priceInr} (DEMO)
                      </span>
                    </p>
                    <p className="text-xs text-slate-600">
                      {booking.centreName} · Slot: {booking.slotTime}
                      {booking.prescriptionNote ? ` · Note: ${booking.prescriptionNote}` : ''}
                    </p>
                    {booking.reportSummary && (
                      <p className="text-xs text-[#0B3B2D] bg-[#ECFDF3] border border-[#BBF7D0] rounded-lg px-3 py-1.5 mt-2">
                        Published Summary: {booking.reportSummary}
                      </p>
                    )}
                  </div>

                  <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2 shrink-0">
                    {booking.status !== 'report_ready' && booking.status !== 'rejected' && (
                      <input
                        type="text"
                        placeholder="Report summary note..."
                        value={reportDrafts[booking.bookingId] ?? ''}
                        onChange={(e) =>
                          setReportDrafts((prev) => ({
                            ...prev,
                            [booking.bookingId]: e.target.value,
                          }))
                        }
                        className="rounded-xl border border-[#CFE3D8] px-3 py-2 text-xs w-full sm:w-52"
                      />
                    )}

                    <div className="flex flex-wrap items-center gap-2">
                      {booking.status === 'requested' && (
                        <>
                          <button
                            type="button"
                            onClick={() => handleStatusChange(booking.bookingId, 'confirmed')}
                            className="inline-flex items-center gap-1 px-3 py-2 rounded-xl bg-[#119655] text-white text-xs font-semibold hover:bg-[#0D7A44]"
                          >
                            <CheckCircle2 className="w-3.5 h-3.5" />
                            Confirm
                          </button>
                          <button
                            type="button"
                            onClick={() => handleStatusChange(booking.bookingId, 'rejected')}
                            className="inline-flex items-center gap-1 px-3 py-2 rounded-xl bg-red-50 text-red-700 border border-red-200 text-xs font-semibold hover:bg-red-100"
                          >
                            <XCircle className="w-3.5 h-3.5" />
                            Reject
                          </button>
                        </>
                      )}

                      {booking.status === 'confirmed' && (
                        <button
                          type="button"
                          onClick={() => handleStatusChange(booking.bookingId, 'sample_collected')}
                          className="inline-flex items-center gap-1 px-3 py-2 rounded-xl bg-[#0B3B2D] text-white text-xs font-semibold hover:bg-[#15523F]"
                        >
                          <TestTube2 className="w-3.5 h-3.5" />
                          Mark Sample Collected
                        </button>
                      )}

                      {(booking.status === 'confirmed' || booking.status === 'sample_collected') && (
                        <button
                          type="button"
                          onClick={() => handleStatusChange(booking.bookingId, 'report_ready')}
                          className="inline-flex items-center gap-1 px-3 py-2 rounded-xl bg-[#119655] text-white text-xs font-semibold hover:bg-[#0D7A44]"
                        >
                          <FileCheck2 className="w-3.5 h-3.5" />
                          Publish Report
                        </button>
                      )}
                    </div>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      )}

      {activeTab === 'catalog' && myCentre && (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          <div className="lg:col-span-2 bg-white rounded-2xl border border-[#DCECE3] p-6">
            <h2 className="font-display text-base font-bold text-[#0B3B2D]">
              Available Lab Tests · {myCentre.name}
            </h2>
            <p className="text-xs text-slate-600 mt-0.5">
              Pricing and turnaround hours are clearly tagged as verified DEMO DATA for patients.
            </p>
            <div className="mt-4 divide-y divide-[#EEF5F1]">
              {myCentre.tests.map((t) => (
                <div key={t.testId} className="py-3.5 flex items-center justify-between gap-3">
                  <div>
                    <p className="text-sm font-bold text-[#0B3B2D]">{t.name}</p>
                    <p className="text-xs text-slate-600 mt-0.5">
                      {t.category} · TAT {t.turnaroundHours}h ·{' '}
                      {t.fastingRequired ? 'Fasting required' : 'No fasting needed'}
                    </p>
                  </div>
                  <span className="font-mono text-sm font-bold text-[#119655] tabular-nums shrink-0">
                    ₹{t.priceInr}
                  </span>
                </div>
              ))}
            </div>
          </div>

          <div className="bg-white rounded-2xl border border-[#DCECE3] p-6">
            <h3 className="font-display text-base font-bold text-[#0B3B2D]">Add Lab Test</h3>
            <p className="text-xs text-slate-600 mt-0.5">
              Immediately visible in Patient Diagnostic Connect.
            </p>
            <form onSubmit={handleAddTest} className="mt-4 space-y-3.5">
              <div>
                <label className="block text-xs font-semibold text-[#0B3B2D] mb-1">Test Name</label>
                <input
                  type="text"
                  value={testName}
                  onChange={(e) => setTestName(e.target.value)}
                  placeholder="e.g., Thyroid Profile (T3, T4, TSH)"
                  className="w-full rounded-xl border border-[#CFE3D8] px-3 py-2 text-xs"
                  required
                />
              </div>
              <div>
                <label className="block text-xs font-semibold text-[#0B3B2D] mb-1">Category</label>
                <select
                  value={testCategory}
                  onChange={(e) => setTestCategory(e.target.value)}
                  className="w-full rounded-xl border border-[#CFE3D8] px-3 py-2 text-xs bg-white"
                >
                  <option value="Blood Panel">Blood Panel</option>
                  <option value="Cardiac">Cardiac</option>
                  <option value="Imaging">Imaging</option>
                  <option value="Obstetric">Obstetric</option>
                  <option value="Biochemistry">Biochemistry</option>
                </select>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-[#0B3B2D] mb-1">
                    Demo Price (₹)
                  </label>
                  <input
                    type="number"
                    value={testPrice}
                    onChange={(e) => setTestPrice(e.target.value)}
                    className="w-full rounded-xl border border-[#CFE3D8] px-3 py-2 text-xs font-mono"
                    required
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-[#0B3B2D] mb-1">
                    TAT (Hours)
                  </label>
                  <input
                    type="number"
                    value={turnaroundHours}
                    onChange={(e) => setTurnaroundHours(e.target.value)}
                    className="w-full rounded-xl border border-[#CFE3D8] px-3 py-2 text-xs font-mono"
                    required
                  />
                </div>
              </div>
              <label className="flex items-center gap-2 text-xs text-slate-700">
                <input
                  type="checkbox"
                  checked={fastingRequired}
                  onChange={(e) => setFastingRequired(e.target.checked)}
                  className="rounded border-[#CFE3D8] text-[#119655]"
                />
                Requires 8–12 hour fasting
              </label>
              <button
                type="submit"
                className="w-full inline-flex items-center justify-center gap-1.5 py-2.5 px-4 rounded-xl bg-[#119655] hover:bg-[#0D7A44] text-white text-xs font-semibold"
              >
                <Plus className="w-4 h-4" />
                Add to Centre Catalog
              </button>
              <p className="text-[11px] text-slate-500 flex items-center gap-1">
                <Clock className="w-3 h-3" /> Updates appear live across all connected portals.
              </p>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
