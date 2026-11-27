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
    addDiagnosticCentre,
  } = useKairos();

  const myCentre =
    diagnosticCentres.find((c) => c.centreId === currentUser?.facilityId) ?? diagnosticCentres[0] ?? null;

  const [regCentreName, setRegCentreName] = useState(currentUser?.facilityName ?? '');
  const [regCentreArea, setRegCentreArea] = useState('');
  const [regCentreHours, setRegCentreHours] = useState('07:00 AM – 08:00 PM');

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
        ? draft || 'Verified laboratory parameters uploaded. Clinician review advised.'
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

  const handleRegisterCentre = (e: React.FormEvent) => {
    e.preventDefault();
    if (!regCentreName.trim() || !regCentreArea.trim()) return;
    addDiagnosticCentre({
      name: regCentreName,
      area: regCentreArea,
      hours: regCentreHours,
    });
    setRegCentreName('');
    setRegCentreArea('');
  };

  if (!myCentre) {
    return (
      <div className="max-w-xl mx-auto bg-kairos-surface rounded-2xl border border-kairos-border p-6 sm:p-8 space-y-5">
        <div className="flex items-start gap-3">
          <div className="w-11 h-11 rounded-xl bg-kairos-mint-soft text-kairos-emerald-ink flex items-center justify-center shrink-0">
            <FlaskConical className="w-5 h-5" />
          </div>
          <div>
            <h2 className="font-display text-xl font-extrabold text-kairos-forest-ink">
              Register Your Diagnostic Centre
            </h2>
            <p className="text-xs text-kairos-muted mt-1">
              Add your lab profile to list diagnostic tests, confirm patient bookings, and publish reports securely.
            </p>
          </div>
        </div>
        <form onSubmit={handleRegisterCentre} className="space-y-4">
          <div>
            <label className="block text-xs font-semibold text-kairos-forest-ink mb-1">Centre Name *</label>
            <input
              type="text"
              required
              value={regCentreName}
              onChange={(e) => setRegCentreName(e.target.value)}
              placeholder="e.g., Metro Diagnostics & Imaging"
              className="w-full rounded-xl border border-kairos-border px-3.5 py-2.5 text-sm text-kairos-forest-ink"
            />
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
            <div>
              <label className="block text-xs font-semibold text-kairos-forest-ink mb-1">Area / Location *</label>
              <input
                type="text"
                required
                value={regCentreArea}
                onChange={(e) => setRegCentreArea(e.target.value)}
                placeholder="e.g., Indiranagar"
                className="w-full rounded-xl border border-kairos-border px-3.5 py-2.5 text-sm text-kairos-forest-ink"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-kairos-forest-ink mb-1">Operating Hours</label>
              <input
                type="text"
                value={regCentreHours}
                onChange={(e) => setRegCentreHours(e.target.value)}
                className="w-full rounded-xl border border-kairos-border px-3.5 py-2.5 text-sm text-kairos-forest-ink"
              />
            </div>
          </div>
          <button
            type="submit"
            className="w-full py-2.5 px-5 rounded-xl bg-kairos-emerald hover:bg-kairos-emerald-hover text-white text-sm font-semibold transition-colors"
          >
            Register Diagnostic Centre
          </button>
        </form>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* KPI Strip */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div className="bg-kairos-surface rounded-2xl border border-kairos-border p-5">
          <p className="text-xs font-medium text-kairos-muted">Diagnostic Centre</p>
          <p className="font-display text-lg font-extrabold text-kairos-forest-ink mt-1 truncate">
            {myCentre.name}
          </p>
          <p className="text-xs text-kairos-muted mt-0.5">
            {myCentre.area} · {myCentre.hours}
          </p>
        </div>

        <div className="bg-kairos-surface rounded-2xl border border-kairos-border p-5">
          <p className="text-xs font-medium text-kairos-muted">Pending Slot Requests</p>
          <p className="font-mono text-2xl font-bold text-amber-700 dark:text-amber-400 tabular-nums mt-1">
            {requestedCount}
          </p>
          <p className="text-xs text-kairos-muted mt-0.5">Awaiting confirmation</p>
        </div>

        <div className="bg-kairos-surface rounded-2xl border border-kairos-border p-5">
          <p className="text-xs font-medium text-kairos-muted">Reports Published</p>
          <p className="font-mono text-2xl font-bold text-kairos-emerald-ink tabular-nums mt-1">
            {readyCount}
          </p>
          <p className="text-xs text-kairos-muted mt-0.5">
            {myCentre.tests.length} lab tests listed
          </p>
        </div>
      </div>

      {activeTab === 'bookings' && (
        <div className="bg-kairos-surface rounded-2xl border border-kairos-border overflow-hidden">
          <div className="px-6 py-4 border-b border-kairos-border-subtle flex flex-wrap items-center justify-between gap-3">
            <div>
              <h2 className="font-display text-base font-bold text-kairos-forest-ink">
                Incoming Diagnostic Bookings & Report Queue
              </h2>
              <p className="text-xs text-kairos-muted mt-0.5">
                Confirm patient slots, mark sample collection, and publish report summaries.
              </p>
            </div>
            <button
              type="button"
              onClick={() => onTabChange('catalog')}
              className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-kairos-surface-subtle border border-kairos-border text-xs font-semibold text-kairos-forest-ink hover:border-kairos-emerald"
            >
              <FlaskConical className="w-3.5 h-3.5 text-kairos-emerald-ink" />
              Manage Test Catalog
            </button>
          </div>

          <div className="divide-y divide-kairos-border-subtle">
            {filteredBookings.length === 0 ? (
              <p className="p-6 text-sm text-kairos-muted">No diagnostic bookings match your filter.</p>
            ) : (
              filteredBookings.map((booking) => (
                <div key={booking.bookingId} className="p-5 flex flex-col lg:flex-row lg:items-center justify-between gap-4">
                  <div className="space-y-1">
                    <div className="flex flex-wrap items-center gap-2 text-xs">
                      <span className="font-mono font-bold text-kairos-forest-ink">{booking.bookingId}</span>
                      <span className="text-kairos-muted/50">·</span>
                      <span className="font-semibold text-kairos-forest-ink">{booking.patientName}</span>
                      <span className="text-kairos-muted/50">·</span>
                      <span
                        className={`font-semibold uppercase text-[11px] ${
                          booking.status === 'report_ready'
                            ? 'text-kairos-emerald-ink'
                            : booking.status === 'rejected'
                              ? 'text-red-700 dark:text-red-400'
                              : booking.status === 'requested'
                                ? 'text-amber-700 dark:text-amber-400'
                                : 'text-sky-700 dark:text-sky-400'
                        }`}
                      >
                        {booking.status.replace('_', ' ')}
                      </span>
                    </div>
                    <p className="text-sm font-bold text-kairos-forest-ink">
                      {booking.testName}{' '}
                      <span className="font-mono text-xs font-semibold text-kairos-muted">
                        · ₹{booking.priceInr}
                      </span>
                    </p>
                    <p className="text-xs text-kairos-muted">
                      {booking.centreName} · Slot: {booking.slotTime}
                      {booking.prescriptionNote ? ` · Note: ${booking.prescriptionNote}` : ''}
                    </p>
                    {booking.reportSummary && (
                      <p className="text-xs text-kairos-forest-ink bg-kairos-mint-soft border border-kairos-border rounded-lg px-3 py-1.5 mt-2">
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
                        className="rounded-xl border border-kairos-border px-3 py-2 text-xs w-full sm:w-52"
                      />
                    )}

                    <div className="flex flex-wrap items-center gap-2">
                      {booking.status === 'requested' && (
                        <>
                          <button
                            type="button"
                            onClick={() => handleStatusChange(booking.bookingId, 'confirmed')}
                            className="inline-flex items-center gap-1 px-3 py-2 rounded-xl bg-kairos-emerald text-white text-xs font-semibold hover:bg-kairos-emerald-hover"
                          >
                            <CheckCircle2 className="w-3.5 h-3.5" />
                            Confirm
                          </button>
                          <button
                            type="button"
                            onClick={() => handleStatusChange(booking.bookingId, 'rejected')}
                            className="inline-flex items-center gap-1 px-3 py-2 rounded-xl bg-red-50 dark:bg-red-950/40 text-red-700 dark:text-red-400 border border-red-200 dark:border-red-900/60 text-xs font-semibold hover:bg-red-100 dark:bg-red-950/60"
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
                          className="inline-flex items-center gap-1 px-3 py-2 rounded-xl bg-kairos-forest text-white text-xs font-semibold hover:bg-kairos-emerald"
                        >
                          <TestTube2 className="w-3.5 h-3.5" />
                          Mark Sample Collected
                        </button>
                      )}

                      {(booking.status === 'confirmed' || booking.status === 'sample_collected') && (
                        <button
                          type="button"
                          onClick={() => handleStatusChange(booking.bookingId, 'report_ready')}
                          className="inline-flex items-center gap-1 px-3 py-2 rounded-xl bg-kairos-emerald text-white text-xs font-semibold hover:bg-kairos-emerald-hover"
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
          <div className="lg:col-span-2 bg-kairos-surface rounded-2xl border border-kairos-border p-6">
            <h2 className="font-display text-base font-bold text-kairos-forest-ink">
              Available Lab Tests · {myCentre.name}
            </h2>
            <p className="text-xs text-kairos-muted mt-0.5">
              Pricing and turnaround hours are published directly to patients in Diagnostic Connect.
            </p>
            <div className="mt-4 divide-y divide-kairos-border-subtle">
              {myCentre.tests.map((t) => (
                <div key={t.testId} className="py-3.5 flex items-center justify-between gap-3">
                  <div>
                    <p className="text-sm font-bold text-kairos-forest-ink">{t.name}</p>
                    <p className="text-xs text-kairos-muted mt-0.5">
                      {t.category} · TAT {t.turnaroundHours}h ·{' '}
                      {t.fastingRequired ? 'Fasting required' : 'No fasting needed'}
                    </p>
                  </div>
                  <span className="font-mono text-sm font-bold text-kairos-emerald-ink tabular-nums shrink-0">
                    ₹{t.priceInr}
                  </span>
                </div>
              ))}
            </div>
          </div>

          <div className="bg-kairos-surface rounded-2xl border border-kairos-border p-6">
            <h3 className="font-display text-base font-bold text-kairos-forest-ink">Add Lab Test</h3>
            <p className="text-xs text-kairos-muted mt-0.5">
              Immediately visible in Patient Diagnostic Connect.
            </p>
            <form onSubmit={handleAddTest} className="mt-4 space-y-3.5">
              <div>
                <label className="block text-xs font-semibold text-kairos-forest-ink mb-1">Test Name</label>
                <input
                  type="text"
                  value={testName}
                  onChange={(e) => setTestName(e.target.value)}
                  placeholder="e.g., Thyroid Profile (T3, T4, TSH)"
                  className="w-full rounded-xl border border-kairos-border px-3 py-2 text-xs"
                  required
                />
              </div>
              <div>
                <label className="block text-xs font-semibold text-kairos-forest-ink mb-1">Category</label>
                <select
                  value={testCategory}
                  onChange={(e) => setTestCategory(e.target.value)}
                  className="w-full rounded-xl border border-kairos-border px-3 py-2 text-xs bg-kairos-surface"
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
                  <label className="block text-xs font-semibold text-kairos-forest-ink mb-1">
                    Price (₹)
                  </label>
                  <input
                    type="number"
                    value={testPrice}
                    onChange={(e) => setTestPrice(e.target.value)}
                    className="w-full rounded-xl border border-kairos-border px-3 py-2 text-xs font-mono"
                    required
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-kairos-forest-ink mb-1">
                    TAT (Hours)
                  </label>
                  <input
                    type="number"
                    value={turnaroundHours}
                    onChange={(e) => setTurnaroundHours(e.target.value)}
                    className="w-full rounded-xl border border-kairos-border px-3 py-2 text-xs font-mono"
                    required
                  />
                </div>
              </div>
              <label className="flex items-center gap-2 text-xs text-kairos-forest-ink/85">
                <input
                  type="checkbox"
                  checked={fastingRequired}
                  onChange={(e) => setFastingRequired(e.target.checked)}
                  className="rounded border-kairos-border text-kairos-emerald-ink"
                />
                Requires 8–12 hour fasting
              </label>
              <button
                type="submit"
                className="w-full inline-flex items-center justify-center gap-1.5 py-2.5 px-4 rounded-xl bg-kairos-emerald hover:bg-kairos-emerald-hover text-white text-xs font-semibold"
              >
                <Plus className="w-4 h-4" />
                Add to Centre Catalog
              </button>
              <p className="text-[11px] text-kairos-muted flex items-center gap-1">
                <Clock className="w-3 h-3" /> Updates appear live across all connected portals.
              </p>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
