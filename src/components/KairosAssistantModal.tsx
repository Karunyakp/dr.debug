import React, { useState } from 'react';
import { Check, ClipboardCopy, Loader2, ShieldAlert, Sparkles, X } from 'lucide-react';
import { useKairos } from '../context/KairosContext';

interface KairosAssistantModalProps {
  open: boolean;
  onClose: () => void;
  initialNotes?: string;
  onApplySummary?: (summary: string) => void;
}

export const KairosAssistantModal: React.FC<KairosAssistantModalProps> = ({
  open,
  onClose,
  initialNotes = '',
  onApplySummary,
}) => {
  const { hospitals, referrals } = useKairos();
  const [selectedRefId, setSelectedRefId] = useState<string>(referrals[0]?.referralId ?? 'custom');
  const [notes, setNotes] = useState(initialNotes);
  const [question, setQuestion] = useState(
    'Structure this handover into ISBAR format, check for missing handover fields, and summarize verified ICU readiness.'
  );
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<string | null>(null);
  const [disclaimer, setDisclaimer] = useState<string | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  if (!open) return null;

  const selectedRef = referrals.find((r) => r.referralId === selectedRefId);

  const handleGenerate = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setErrorMsg(null);
    setResult(null);

    const capacitySummary = hospitals
      .map(
        (h) =>
          `${h.name}: ICU ${h.icuAvailable}/${h.icuTotal}, Gen ${h.generalAvailable}/${h.generalTotal}, ${h.acceptingEmergencies ? 'Accepting' : 'Diversion'}`
      )
      .join(' | ');

    try {
      const response = await fetch('/api/ai/isbar-assistant', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          patientInitials: selectedRef?.patientInitials || 'Clinician Draft',
          ageSex: selectedRef?.ageSex || '',
          category: selectedRef?.category || 'Emergency Coordination',
          urgency: selectedRef?.urgency || 'urgent',
          vitals: selectedRef?.vitals,
          symptoms: notes.trim() || selectedRef?.symptoms || 'Routine handover structuring request',
          requiredFacilities: selectedRef?.requiredFacilities || ['ICU'],
          targetHospital: selectedRef?.targetHospitalName || hospitals[0]?.name,
          hospitalCapacityNote: capacitySummary,
          question,
        }),
      });

      const data = (await response.json()) as {
        summary?: string;
        disclaimer?: string;
        error?: string;
      };

      if (!response.ok || !data.summary) {
        setErrorMsg(data.error || 'Unable to generate ISBAR handover draft right now.');
      } else {
        setResult(data.summary);
        setDisclaimer(data.disclaimer || 'Non-diagnostic handover draft. Clinician review required.');
      }
    } catch {
      setErrorMsg('Network error reaching the KAIROS server endpoint.');
    } finally {
      setLoading(false);
    }
  };

  const handleCopy = () => {
    if (!result) return;
    navigator.clipboard?.writeText(result).catch(() => {});
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1800);
  };

  return (
    <div
      className="fixed inset-0 z-50 bg-[#07291F]/60 backdrop-blur-xs flex items-center justify-center p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="kairos-assistant-title"
    >
      <div className="bg-white border border-[#D5E7DD] rounded-2xl max-w-2xl w-full max-h-[90vh] overflow-y-auto shadow-xl">
        <div className="px-6 py-4 border-b border-[#E5F0EA] flex items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-[#0B3B2D] text-emerald-300 flex items-center justify-center">
              <Sparkles className="w-4 h-4" />
            </div>
            <div>
              <h2 id="kairos-assistant-title" className="text-base font-bold text-[#0B3B2D]">
                Kairos Assistant · ISBAR & Bed-Readiness Checker
              </h2>
              <p className="text-xs text-slate-500">
                Non-diagnostic handover structuring for clinician review
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close Kairos Assistant"
            className="p-2 rounded-lg text-slate-500 hover:bg-slate-100 hover:text-slate-900"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <form onSubmit={handleGenerate} className="p-6 space-y-4">
          <div className="p-3.5 rounded-xl bg-amber-50 border border-amber-200 flex items-start gap-2.5 text-xs text-amber-900">
            <ShieldAlert className="w-4 h-4 shrink-0 mt-0.5 text-amber-700" />
            <span>
              <strong>Clinical Safety Notice:</strong> This assistant only formats clinician-entered handover notes into ISBAR structure and checks bed-readiness logistics. It never diagnoses patients or recommends medical treatment.
            </span>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label htmlFor="assistant-ref-select" className="block text-xs font-semibold text-[#0B3B2D] mb-1.5">
                Load Active Referral Context
              </label>
              <select
                id="assistant-ref-select"
                value={selectedRefId}
                onChange={(e) => setSelectedRefId(e.target.value)}
                className="w-full rounded-xl border border-[#CFE3D8] px-3 py-2 text-sm text-[#0B3B2D] focus:outline-none focus:ring-2 focus:ring-[#119655]"
              >
                {referrals.map((r) => (
                  <option key={r.referralId} value={r.referralId}>
                    {r.referralId} · {r.category} ({r.patientInitials})
                  </option>
                ))}
                <option value="custom">Custom Clinician Handover Note</option>
              </select>
            </div>
            <div>
              <label htmlFor="assistant-goal" className="block text-xs font-semibold text-[#0B3B2D] mb-1.5">
                Coordination Check
              </label>
              <input
                id="assistant-goal"
                type="text"
                value={question}
                onChange={(e) => setQuestion(e.target.value)}
                className="w-full rounded-xl border border-[#CFE3D8] px-3 py-2 text-sm text-[#0B3B2D] focus:outline-none focus:ring-2 focus:ring-[#119655]"
              />
            </div>
          </div>

          <div>
            <label htmlFor="assistant-notes" className="block text-xs font-semibold text-[#0B3B2D] mb-1.5">
              Clinician Observations / Handover Notes (Optional override)
            </label>
            <textarea
              id="assistant-notes"
              rows={3}
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder={selectedRef?.symptoms || 'Enter patient observations, onset timing, and transfer logistics...'}
              className="w-full rounded-xl border border-[#CFE3D8] px-3.5 py-2.5 text-sm text-[#0B3B2D] focus:outline-none focus:ring-2 focus:ring-[#119655]"
            />
          </div>

          <div className="flex items-center justify-end gap-3">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 rounded-xl border border-[#CFE3D8] text-sm font-medium text-[#0B3B2D] hover:bg-[#F1F7F4]"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={loading}
              className="inline-flex items-center gap-2 px-5 py-2 rounded-xl bg-[#119655] text-white text-sm font-semibold hover:bg-[#0D7A44] disabled:opacity-60 transition-colors"
            >
              {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Sparkles className="w-4 h-4" />}
              {loading ? 'Structuring ISBAR...' : 'Check Bed Status & ISBAR'}
            </button>
          </div>

          {errorMsg && (
            <div className="p-4 rounded-xl bg-red-50 border border-red-200 text-xs text-red-800">
              {errorMsg}
            </div>
          )}

          {result && (
            <div className="rounded-xl border border-[#CFE3D8] bg-[#F5FBF8] p-4 space-y-3">
              <div className="flex items-center justify-between gap-2">
                <span className="text-xs font-semibold text-[#0B3B2D]">
                  Structured ISBAR Handover Draft
                </span>
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={handleCopy}
                    className="inline-flex items-center gap-1 text-xs font-medium text-[#0B3B2D] px-2.5 py-1 rounded-lg border border-[#CFE3D8] bg-white hover:bg-[#F1F7F4]"
                  >
                    {copied ? <Check className="w-3.5 h-3.5 text-[#119655]" /> : <ClipboardCopy className="w-3.5 h-3.5" />}
                    {copied ? 'Copied' : 'Copy'}
                  </button>
                  {onApplySummary && (
                    <button
                      type="button"
                      onClick={() => {
                        onApplySummary(result);
                        onClose();
                      }}
                      className="text-xs font-semibold text-white bg-[#0B3B2D] px-3 py-1 rounded-lg hover:bg-[#07291F]"
                    >
                      Use in Referral
                    </button>
                  )}
                </div>
              </div>
              <pre className="whitespace-pre-wrap font-sans text-xs leading-relaxed text-slate-800">
                {result}
              </pre>
              {disclaimer && (
                <p className="text-[11px] text-slate-500 pt-2 border-t border-[#DCECE3]">{disclaimer}</p>
              )}
            </div>
          )}
        </form>
      </div>
    </div>
  );
};
