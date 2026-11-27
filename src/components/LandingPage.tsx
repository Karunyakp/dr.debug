import React, { useState } from 'react';
import {
  Activity,
  Ambulance,
  ArrowRight,
  AudioLines,
  Building2,
  CheckCircle2,
  Clock,
  FlaskConical,
  Lock,
  Mail,
  MapPin,
  MessageSquare,
  Phone,
  Play,
  QrCode,
  ShieldCheck,
  Stethoscope,
  Users,
  X,
} from 'lucide-react';
import { useKairos } from '../context/KairosContext';
import type { UserRole } from '../types/kairos';
import { evaluateBedHoldState, formatCountdown } from '../utils/kairosEngine';
import { WatchHowItWorksSection } from './WatchHowItWorksSection';
import type { AssistantTab } from './KairosAssistantModal';
import { ThemeToggle } from './ThemeToggle';

interface LandingPageProps {
  onOpenAuth: (role?: UserRole, mode?: 'signin' | 'signup') => void;
  onEnterRole: (role: UserRole, initialTab?: string) => void;
  onOpenAssistant: (tab?: AssistantTab) => void;
}

interface CoreFeatureCard {
  id: string;
  anchorId?: string;
  indexLabel: string;
  title: string;
  summary: string;
  liveMetric: string;
  capabilities: string;
  ctaLabel: string;
  targetRole: UserRole;
  targetTab: string;
  featured?: boolean;
  icon: React.FC<{ className?: string }>;
}

export const LandingPage: React.FC<LandingPageProps> = ({
  onOpenAuth,
  onEnterRole,
  onOpenAssistant,
}) => {
  const {
    currentUser,
    hospitals,
    specialists,
    referrals,
    appointments,
    diagnosticCentres,
    nowMs,
    bookAppointment,
  } = useKairos();

  const [selectedHospitalId, setSelectedHospitalId] = useState(
    hospitals[0]?.hospitalId ?? ''
  );
  const selectedHospital =
    hospitals.find((h) => h.hospitalId === selectedHospitalId) ?? hospitals[0];
  const [selectedDept, setSelectedDept] = useState(
    selectedHospital?.departments[0] ?? 'General Medicine'
  );
  const [selectedSlot, setSelectedSlot] = useState('Today · 10:30 AM');
  const [footerModal, setFooterModal] = useState<'privacy' | 'terms' | 'dpdp' | 'contact' | null>(null);
  const [contactSubmitted, setContactSubmitted] = useState(false);
  const [contactName, setContactName] = useState('');
  const [contactEmail, setContactEmail] = useState('');
  const [contactMsg, setContactMsg] = useState('');

  const activeHoldRef = referrals.find((r) => r.bedHold && r.bedHold.status !== 'expired');
  const holdCountdown = activeHoldRef?.bedHold
    ? formatCountdown(evaluateBedHoldState(activeHoldRef.bedHold, nowMs).remainingSec)
    : null;

  const latestToken = appointments[0];
  const activeOpdCount = appointments.filter(
    (a) => a.status !== 'cancelled' && a.status !== 'completed'
  ).length;
  const ruralSpecialistsCount = specialists.filter((s) => s.ruralFriendly || s.remoteAvailable).length;
  const openIcuCount = hospitals
    .filter((h) => h.acceptingEmergencies)
    .reduce((sum, h) => sum + h.icuAvailable, 0);

  const coreFeatures: CoreFeatureCard[] = [
    {
      id: 'smart-opd',
      indexLabel: 'Feature 01 · Routine Access',
      title: 'Smart OPD',
      summary:
        'Advance hospital appointment booking with unique digital QR tokens, kiosk QR check-in, live queue tracking, and automatic wait-time re-estimation when doctors run delayed.',
      liveMetric:
        activeOpdCount > 0 && latestToken
          ? `${activeOpdCount} active tokens · Latest #${latestToken.tokenNumber}`
          : 'Digital QR tokens · Delay-aware live queue',
      capabilities: 'QR check-in · Reschedule · Delay alerts',
      ctaLabel: 'Open Smart OPD →',
      targetRole: 'patient',
      targetTab: 'opd',
      icon: QrCode,
    },
    {
      id: 'specialist-connect',
      indexLabel: 'Feature 02 · Rural & Semi-Urban',
      title: 'Specialist Connect',
      summary:
        'Discover verified specialists across hospitals with a dedicated Rural Simplified Mode in English and Kannada (ಕನ್ನಡ). Book in-person or remote consults with SMS-ready notices.',
      liveMetric:
        specialists.length > 0
          ? `${specialists.length} specialists · ${ruralSpecialistsCount} remote / rural-ready`
          : 'English & ಕನ್ನಡ · In-person & remote consults',
      capabilities: 'English & ಕನ್ನಡ · Remote consults · SMS ready',
      ctaLabel: 'Find a Specialist →',
      targetRole: 'patient',
      targetTab: 'specialists',
      icon: Stethoscope,
    },
    {
      id: 'emergency-coordination',
      anchorId: 'emergency',
      indexLabel: 'Feature 03 · Accept Before You Move',
      title: 'Emergency Coordination',
      summary:
        'Structured ISBAR referrals with live vitals, transparent smart hospital matching, 5-minute acceptance timers with auto-escalation, time-bounded ICU bed holds, and ambulance tracking.',
      liveMetric:
        hospitals.length > 0
          ? `${openIcuCount} verified ICU beds open${holdCountdown ? ` · Hold ${holdCountdown}` : ''}`
          : 'Verified bed holds · 5-min acceptance SLA',
      capabilities: 'ISBAR + vitals · Bed hold timer · Manual override',
      ctaLabel: 'Launch Emergency Desk →',
      targetRole: 'doctor',
      targetTab: 'new-referral',
      featured: true,
      icon: Ambulance,
    },
  ];

  const handleQuickBook = (e: React.FormEvent) => {
    e.preventDefault();
    if (!currentUser || !selectedHospital) {
      onEnterRole('patient', 'opd');
      return;
    }
    const matchedDoc =
      specialists.find(
        (s) => s.hospitalId === selectedHospital.hospitalId && s.specialty === selectedDept
      ) ?? specialists[0];

    bookAppointment({
      hospitalId: selectedHospital.hospitalId,
      department: selectedDept,
      doctorName: matchedDoc?.name ?? 'Duty Clinician',
      slotTime: selectedSlot,
      consultationType: 'in-person',
      channel: 'QR',
    });
    onEnterRole('patient', 'opd');
  };

  return (
    <div className="min-h-screen bg-kairos-mint text-kairos-forest-ink transition-colors duration-200">
      {/* Strict 3-Zone Top Bar Contract */}
      <header className="sticky top-0 z-40 bg-kairos-surface/95 backdrop-blur-md border-b border-kairos-border">
        <div className="max-w-[1440px] mx-auto px-5 sm:px-8 h-14 flex items-center justify-between gap-6">
          <a
            href="#top"
            className="flex items-center gap-2 whitespace-nowrap shrink-0 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-kairos-emerald rounded-lg"
          >
            <img
              src="/assets/aistudio/Kairos-Logo-Icon_f4a33af1.png"
              alt="KAIROS"
              className="w-7 h-7 object-contain"
              referrerPolicy="no-referrer"
            />
            <span className="font-display text-lg font-extrabold tracking-tight text-kairos-forest-ink">
              KAIROS
            </span>
          </a>

          <nav
            aria-label="Primary navigation"
            className="hidden md:flex items-center gap-6 text-[13px] font-medium text-kairos-forest-ink/85"
          >
            <a
              href="#smart-opd"
              className="hover:text-kairos-emerald-ink transition-colors whitespace-nowrap shrink-0"
            >
              OPD
            </a>
            <a
              href="#emergency"
              className="hover:text-kairos-emerald-ink transition-colors whitespace-nowrap shrink-0"
            >
              Emergency
            </a>
            <a
              href="#modules"
              className="hover:text-kairos-emerald-ink transition-colors whitespace-nowrap shrink-0"
            >
              Hospitals
            </a>
            <a
              href="#watch-how-it-works"
              className="hover:text-kairos-emerald-ink transition-colors whitespace-nowrap shrink-0"
            >
              How it works
            </a>
          </nav>

          <div className="flex items-center gap-2 shrink-0">
            <ThemeToggle />
            <button
              type="button"
              onClick={() => onOpenAuth('patient', 'signin')}
              className="inline-flex items-center gap-1.5 px-4 py-1.5 rounded-full bg-kairos-emerald hover:bg-kairos-emerald-hover text-white text-[13px] font-semibold transition-colors whitespace-nowrap shrink-0 shadow-xs"
            >
              {currentUser ? 'Open Platform' : 'Sign In'}
              <ArrowRight className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>
      </header>

      <main id="top">
        {/* HERO SECTION — Full-bleed edge-to-edge editorial healthcare showcase */}
        <section className="relative overflow-hidden w-full lg:min-h-[515px] flex flex-col justify-between bg-gradient-to-br from-[#FBFDFB] via-[#F6FAF7] to-[#EAF4EE] dark:from-[#071A14] dark:via-[#081F17] dark:to-[#0C2B20] border-b border-kairos-border">
          {/* Soft Botanical Background Curves — full width edge-to-edge */}
          <svg
            aria-hidden="true"
            viewBox="0 0 1440 680"
            preserveAspectRatio="none"
            className="pointer-events-none absolute inset-0 w-full h-full opacity-75 dark:opacity-55"
          >
            <path
              d="M0,450 C220,560 440,620 680,530 C820,475 940,420 1120,450 L1440,480 L1440,680 L0,680 Z"
              className="fill-[#E4F2E8] dark:fill-[#0F3326]"
              fillOpacity="0.65"
            />
            <path
              d="M-60,410 C120,520 340,610 560,640 L-60,680 Z"
              className="fill-[#D9EDE0] dark:fill-[#133F2F]"
              fillOpacity="0.55"
            />
          </svg>

          {/* Desktop Right-Half Full-Bleed Visual — extends flush to right edge, top & bottom */}
          <div className="hidden lg:block pointer-events-none select-none absolute top-0 bottom-0 right-0 left-[46%] xl:left-[47%] overflow-hidden">
            <img
              src="/assets/aistudio/kairos-hero-scene.png"
              alt="KAIROS doctor holding Bed Confirmed and Ambulance On The Way tablet in front of a hospital and emergency ambulance"
              className="w-full h-full object-cover object-[center_18%] [mask-image:linear-gradient(to_right,transparent_0%,black_10%,black_100%)] dark:brightness-90 dark:contrast-105"
              referrerPolicy="no-referrer"
            />
          </div>

          <div className="relative z-10 w-full max-w-[1440px] mx-auto px-5 sm:px-8 flex-1 flex items-center">
            <div className="w-full lg:w-[50%] xl:w-[49%] pt-5 lg:pt-7 pb-6 lg:pb-16">
              {/* Kicker Row */}
              <div className="flex flex-wrap items-center gap-2.5 mb-2.5">
                <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-[#DCF0E2] dark:bg-kairos-mint-soft text-[#0E3A2A] dark:text-[#C5EEDB] text-[11px] font-bold tracking-wide uppercase">
                  <Clock className="w-3 h-3 text-kairos-emerald-ink shrink-0" />
                  Golden-Hour Care Network
                </span>
                <span aria-hidden="true" className="hidden sm:inline-block h-3.5 w-px bg-[#9FC3AD] dark:bg-kairos-border" />
                <span className="text-[11px] font-bold tracking-wide uppercase text-kairos-emerald-ink">
                  Verified Before Dispatch
                </span>
              </div>

              {/* Primary Display Headline — normal web-app scale */}
              <h1
                className="font-display font-extrabold text-kairos-forest-ink tracking-tight leading-[1.08] text-[28px] sm:text-[34px] lg:text-[40px]"
                style={{ textWrap: 'balance' }}
              >
                Every Second Counts.
                <br />
                <span className="text-[#1F6E42] dark:text-kairos-emerald-ink">Every Bed Verified.</span>
                <br />
                Zero Guesswork.
              </h1>

              {/* Value Proposition Copy */}
              <p className="mt-2.5 text-[13.5px] sm:text-[14.5px] text-[#223B32] dark:text-[#C5DFD3] max-w-lg leading-snug font-normal">
                Real-time coordination across patients, clinicians, ambulances, and ICUs—turning chaotic handoffs into confirmed, life-saving care.
              </p>

              {/* Highlighted Core Promise with Hand-Drawn Emerald Underline */}
              <div className="mt-2.5 inline-block max-w-full">
                <div className="inline-block rounded-lg bg-[#DFF2E4] dark:bg-kairos-mint-soft px-3 py-1 text-xs sm:text-[13px] font-semibold text-kairos-forest-ink">
                  The bed is confirmed before the ambulance moves.
                </div>
                <svg
                  aria-hidden="true"
                  viewBox="0 0 360 12"
                  fill="none"
                  className="w-52 sm:w-64 h-2 -mt-0.5 ml-1.5 text-[#1F8A4C] dark:text-kairos-emerald-ink"
                >
                  <path
                    d="M3 9.5C95 2.5 235 1.5 357 4.5"
                    stroke="currentColor"
                    strokeWidth="2.8"
                    strokeLinecap="round"
                  />
                </svg>
              </div>

              {/* 4 Role Quick-Access Circular Shortcuts */}
              <div className="mt-3.5 grid grid-cols-4 gap-2 sm:gap-3 max-w-sm">
                {(
                  [
                    { role: 'patient' as UserRole, label: 'Patients', icon: Users },
                    { role: 'doctor' as UserRole, label: 'Doctors', icon: Stethoscope },
                    { role: 'ambulance' as UserRole, label: 'Ambulances', icon: Ambulance },
                    { role: 'hospital' as UserRole, label: 'Hospitals', icon: Building2 },
                  ]
                ).map((item) => {
                  const Icon = item.icon;
                  return (
                    <button
                      key={item.role}
                      type="button"
                      onClick={() => onEnterRole(item.role)}
                      className="group flex flex-col items-center gap-1.5 text-center focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-kairos-emerald rounded-xl py-0.5"
                    >
                      <span className="w-9 h-9 rounded-full bg-kairos-mint-soft group-hover:bg-kairos-emerald text-kairos-forest-ink group-hover:text-white flex items-center justify-center transition-colors shadow-2xs border border-transparent dark:border-kairos-border">
                        <Icon className="w-4 h-4" />
                      </span>
                      <span className="text-[11px] font-semibold text-kairos-forest-ink/90 group-hover:text-kairos-emerald-ink transition-colors">
                        {item.label}
                      </span>
                    </button>
                  );
                })}
              </div>

              {/* Primary & Secondary Action Buttons — Always Above the Fold */}
              <div className="mt-4 flex flex-wrap items-center gap-2.5">
                <button
                  type="button"
                  onClick={() => onOpenAuth('patient', 'signin')}
                  className="inline-flex items-center gap-1.5 px-5 py-2 rounded-full bg-kairos-emerald hover:bg-kairos-emerald-hover text-white text-[13px] font-semibold transition-colors whitespace-nowrap shadow-xs"
                >
                  Get Started
                  <ArrowRight className="w-3.5 h-3.5" />
                </button>
                <a
                  href="#watch-how-it-works"
                  className="inline-flex items-center gap-1.5 px-4 py-2 rounded-full bg-kairos-surface border border-kairos-border text-kairos-forest-ink text-[13px] font-semibold hover:border-kairos-emerald hover:text-kairos-emerald-ink transition-colors whitespace-nowrap"
                >
                  <Play className="w-3.5 h-3.5 fill-current" />
                  Watch How It Works
                </a>
                <button
                  type="button"
                  onClick={() => onOpenAssistant('voice')}
                  className="inline-flex items-center gap-1.5 px-3 py-2 rounded-full text-kairos-emerald-ink hover:bg-kairos-mint-soft text-xs font-semibold transition-colors whitespace-nowrap"
                >
                  <AudioLines className="w-3.5 h-3.5" />
                  Live Voice &amp; AI
                </button>
              </div>
            </div>
          </div>

          {/* Mobile / Tablet Full-Width Hero Scene */}
          <div className="lg:hidden relative z-10 w-full overflow-hidden">
            <img
              src="/assets/aistudio/kairos-hero-scene.png"
              alt="KAIROS doctor holding Bed Confirmed and Ambulance On The Way tablet in front of a hospital and emergency ambulance"
              className="w-full h-auto object-cover object-top select-none dark:brightness-90"
              referrerPolicy="no-referrer"
            />
          </div>

          {/* Bottom Centered Live Capabilities Strip */}
          <div className="relative lg:absolute lg:bottom-3 lg:inset-x-0 z-20 px-4 pb-3 lg:pb-0 flex justify-center">
            <div className="inline-flex flex-wrap items-center justify-center gap-x-2.5 gap-y-1 px-4 py-1.5 rounded-full bg-kairos-surface/95 backdrop-blur-md border border-kairos-border shadow-[0_6px_20px_rgba(16,40,33,0.07)] dark:shadow-[0_6px_20px_rgba(0,0,0,0.4)] text-[11px] text-kairos-forest-ink/85">
              <button
                type="button"
                onClick={() => onEnterRole('hospital', 'overview')}
                className="inline-flex items-center gap-1.5 font-semibold text-kairos-forest-ink hover:text-kairos-emerald-ink transition-colors whitespace-nowrap"
              >
                <Activity className="w-3 h-3 text-kairos-emerald-ink" />
                Live Updates
              </button>
              <span aria-hidden="true" className="text-kairos-border">|</span>
              <button
                type="button"
                onClick={() => onEnterRole('hospital', 'capacity')}
                className="font-medium hover:text-kairos-emerald-ink transition-colors whitespace-nowrap"
              >
                {hospitals.length > 0 ? `Bed Availability (${openIcuCount} ICU open)` : 'Bed Availability'}
              </button>
              <span aria-hidden="true" className="text-kairos-border">·</span>
              <button
                type="button"
                onClick={() => onEnterRole('ambulance', 'route')}
                className="font-medium hover:text-kairos-emerald-ink transition-colors whitespace-nowrap"
              >
                Ambulance Tracking
              </button>
              <span aria-hidden="true" className="text-kairos-border">·</span>
              <button
                type="button"
                onClick={() => onEnterRole('patient', 'opd')}
                className="font-medium hover:text-kairos-emerald-ink transition-colors whitespace-nowrap"
              >
                {latestToken ? `Real-Time Queue (#${latestToken.tokenNumber})` : 'Real-Time Queue'}
              </button>
            </div>
          </div>
        </section>

        {/* INSTANT OPD QUICK-BOOK STRIP & QUANTITATIVE EVIDENCE */}
        <section className="py-10 px-6">
          <div className="max-w-7xl mx-auto">
            {hospitals.length > 0 ? (
              <form
                id="smart-opd"
                onSubmit={handleQuickBook}
                className="bg-kairos-surface border border-kairos-border rounded-2xl p-4 sm:p-5 grid grid-cols-1 md:grid-cols-12 gap-4 items-end shadow-xs"
              >
                <div className="md:col-span-4">
                  <label
                    htmlFor="quick-hospital"
                    className="block text-[11px] font-semibold text-kairos-muted mb-1"
                  >
                    Registered Hospital
                  </label>
                  <select
                    id="quick-hospital"
                    value={selectedHospital?.hospitalId ?? ''}
                    onChange={(e) => {
                      const nextId = e.target.value;
                      setSelectedHospitalId(nextId);
                      const nextH = hospitals.find((h) => h.hospitalId === nextId);
                      if (nextH && !nextH.departments.includes(selectedDept)) {
                        setSelectedDept(nextH.departments[0] ?? 'General Medicine');
                      }
                    }}
                    className="w-full rounded-xl border border-kairos-border bg-kairos-surface-subtle px-3.5 py-2.5 text-sm font-semibold text-kairos-forest-ink focus:outline-none focus:ring-2 focus:ring-kairos-emerald"
                  >
                    {hospitals.map((h) => (
                      <option key={h.hospitalId} value={h.hospitalId}>
                        {h.name} — {h.area}
                      </option>
                    ))}
                  </select>
                </div>

                <div className="md:col-span-3">
                  <label
                    htmlFor="quick-dept"
                    className="block text-[11px] font-semibold text-kairos-muted mb-1"
                  >
                    Department
                  </label>
                  <select
                    id="quick-dept"
                    value={selectedDept}
                    onChange={(e) => setSelectedDept(e.target.value)}
                    className="w-full rounded-xl border border-kairos-border bg-kairos-surface-subtle px-3.5 py-2.5 text-sm font-semibold text-kairos-forest-ink focus:outline-none focus:ring-2 focus:ring-kairos-emerald"
                  >
                    {(selectedHospital?.departments ?? ['General Medicine']).map((dept) => (
                      <option key={dept} value={dept}>
                        {dept}
                      </option>
                    ))}
                  </select>
                </div>

                <div className="md:col-span-3">
                  <label
                    htmlFor="quick-slot"
                    className="block text-[11px] font-semibold text-kairos-muted mb-1"
                  >
                    Available Slot
                  </label>
                  <select
                    id="quick-slot"
                    value={selectedSlot}
                    onChange={(e) => setSelectedSlot(e.target.value)}
                    className="w-full rounded-xl border border-kairos-border bg-kairos-surface-subtle px-3.5 py-2.5 text-sm font-semibold text-kairos-forest-ink focus:outline-none focus:ring-2 focus:ring-kairos-emerald"
                  >
                    <option value="Today · 10:30 AM">Today · 10:30 AM</option>
                    <option value="Today · 11:15 AM">Today · 11:15 AM</option>
                    <option value="Today · 12:00 PM">Today · 12:00 PM</option>
                    <option value="Today · 02:30 PM">Today · 02:30 PM</option>
                  </select>
                </div>

                <div className="md:col-span-2">
                  <button
                    type="submit"
                    className="w-full inline-flex items-center justify-center gap-2 py-2.5 px-5 rounded-xl bg-kairos-forest text-white text-sm font-semibold hover:bg-kairos-emerald transition-colors whitespace-nowrap"
                  >
                    Book OPD
                    <ArrowRight className="w-4 h-4" />
                  </button>
                </div>
              </form>
            ) : (
              <div
                id="smart-opd"
                className="bg-kairos-surface border border-kairos-border rounded-2xl p-5 flex flex-col md:flex-row md:items-center justify-between gap-4 shadow-xs"
              >
                <div>
                  <p className="text-xs font-bold uppercase tracking-wider text-kairos-emerald-ink">
                    Smart OPD &amp; Hospital Onboarding
                  </p>
                  <h2 className="font-display text-lg font-bold text-kairos-forest-ink mt-0.5">
                    Sign in to book OPD tokens or register your hospital&apos;s live capacity
                  </h2>
                  <p className="text-xs text-kairos-muted mt-0.5">
                    Each role has its own dedicated sign-in portal with Email &amp; Password or Google Sign-In.
                  </p>
                </div>
                <div className="flex flex-wrap items-center gap-2.5 shrink-0">
                  <button
                    type="button"
                    onClick={() => onOpenAuth('patient', 'signin')}
                    className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl bg-kairos-forest text-white text-xs font-semibold hover:bg-kairos-emerald transition-colors whitespace-nowrap"
                  >
                    Patient Sign In
                    <ArrowRight className="w-3.5 h-3.5" />
                  </button>
                  <button
                    type="button"
                    onClick={() => onOpenAuth('hospital', 'signin')}
                    className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl border border-kairos-border bg-kairos-surface-subtle text-kairos-forest-ink text-xs font-semibold hover:border-kairos-emerald transition-colors whitespace-nowrap"
                  >
                    Hospital Desk Sign In
                  </button>
                </div>
              </div>
            )}

            {/* 4-COLUMN QUANTITATIVE EVIDENCE STRIP */}
            <div className="mt-4 grid grid-cols-2 lg:grid-cols-4 gap-3.5">
              <div className="bg-kairos-surface border border-kairos-border rounded-xl p-4">
                <p className="font-display text-xl sm:text-2xl font-extrabold text-kairos-forest-ink tabular-nums">
                  ~15,000
                </p>
                <p className="text-xs text-kairos-muted mt-1">
                  OPD patients/day at AIIMS Delhi; queues exceed 200 m
                </p>
              </div>
              <div className="bg-kairos-surface border border-kairos-border rounded-xl p-4">
                <p className="font-display text-xl sm:text-2xl font-extrabold text-kairos-emerald-ink tabular-nums">
                  &le; 5 min
                </p>
                <p className="text-xs text-kairos-muted mt-1">
                  Pilot target for emergency hospital bed acceptance
                </p>
              </div>
              <div className="bg-kairos-surface border border-kairos-border rounded-xl p-4">
                <p className="font-display text-xl sm:text-2xl font-extrabold text-kairos-forest-ink tabular-nums">
                  90.6%
                </p>
                <p className="text-xs text-kairos-muted mt-1">
                  Critically ill obstetric transfers arrive with zero prior notice
                </p>
              </div>
              <div className="bg-kairos-surface border border-kairos-border rounded-xl p-4">
                <p className="font-display text-xl sm:text-2xl font-extrabold text-kairos-emerald-ink tabular-nums">
                  0
                </p>
                <p className="text-xs text-kairos-muted mt-1">
                  Double-promised ICU beds with time-bounded bed holds
                </p>
              </div>
            </div>
          </div>
        </section>

        {/* THE PROBLEM & OUR SOLUTION */}
        <section className="py-10 px-5 sm:px-6 bg-kairos-surface border-y border-kairos-border">
          <div className="max-w-7xl mx-auto">
            <div className="max-w-2xl mb-6">
              <p className="text-[11px] font-bold uppercase tracking-wider text-kairos-emerald-ink">
                01. The Coordination Problem &amp; Solution
              </p>
              <h2 className="font-display text-xl sm:text-2xl font-extrabold text-kairos-forest-ink mt-1">
                Healthcare access breaks twice: at the OPD counter and at the ambulance door.
              </h2>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-12 gap-5">
              <div className="lg:col-span-5 bg-kairos-forest text-white rounded-2xl p-6 flex flex-col justify-between border border-transparent dark:border-emerald-800/60">
                <div>
                  <p className="text-[11px] font-bold uppercase tracking-wider text-kairos-gold">
                    Our Core Principle
                  </p>
                  <h3 className="font-display text-2xl font-extrabold mt-1.5 leading-tight">
                    ACCEPT BEFORE YOU MOVE.
                  </h3>
                  <p className="mt-4 text-sm text-emerald-100 leading-relaxed">
                    A receiving doctor confirms bed and specialist readiness before the ambulance departs. The bed is soft-locked on a countdown timer so it is never promised twice—while manual clinical override guarantees zero delay in life-threatening emergencies.
                  </p>
                </div>
                <div className="mt-6 pt-5 border-t border-white/15">
                  <p className="text-xs text-emerald-200">
                    Why unite OPD and Emergency? Routine Smart OPD onboards hospitals daily; the exact same live network powers golden-hour referrals with one-click escalation.
                  </p>
                </div>
              </div>

              <div className="lg:col-span-7 grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="rounded-2xl border border-kairos-border p-6 bg-kairos-surface-subtle">
                  <p className="text-xs font-semibold text-red-700 dark:text-red-400 mb-2">Today · Broken Routine Care</p>
                  <ul className="space-y-2.5 text-sm text-kairos-forest-ink/85">
                    <li>• 52% of tertiary OPD visits travel from outside the city without slot visibility.</li>
                    <li>• Doctor delays leave waiting patients uninformed in crowded corridors.</li>
                    <li>• Rural families struggle to locate verified specialists or nearby labs.</li>
                  </ul>
                </div>
                <div className="rounded-2xl border border-kairos-border p-6 bg-kairos-surface-subtle">
                  <p className="text-xs font-semibold text-red-700 dark:text-red-400 mb-2">Today · Uncoordinated Referrals</p>
                  <ul className="space-y-2.5 text-sm text-kairos-forest-ink/85">
                    <li>• Emergency transfers rely on frantic phone calls and incomplete vitals.</li>
                    <li>• Ambulances drive toward hospitals with full ICUs and no bed confirmation.</li>
                    <li>• Receiving EDs face surprise arrivals without advance ISBAR handover.</li>
                  </ul>
                </div>
                <div className="sm:col-span-2 rounded-2xl border border-kairos-border bg-kairos-mint-soft/75 p-6 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                  <div>
                    <p className="text-sm font-bold text-kairos-forest-ink">
                      One Unified Coordination Layer — Plugs into Existing HMIS
                    </p>
                    <p className="text-xs text-kairos-muted mt-1">
                      HL7 FHIR R4 structured payloads · ABDM integration-ready architecture · App-less SMS &amp; WhatsApp fallback templates.
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={() => onEnterRole('hospital')}
                    className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl bg-kairos-forest text-white text-xs font-semibold hover:bg-kairos-emerald transition-colors whitespace-nowrap shrink-0"
                  >
                    Inspect Live Hospital Desk
                    <ArrowRight className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* CORE FEATURES — Dynamically Rendered Cards */}
        <section id="modules" className="py-10 px-5 sm:px-6">
          <div id="core-features" className="max-w-7xl mx-auto">
            <div className="flex flex-wrap items-end justify-between gap-4 mb-6">
              <div>
                <p className="text-[11px] font-bold uppercase tracking-wider text-kairos-emerald-ink">
                  02. Core Features
                </p>
                <h2 className="font-display text-xl sm:text-2xl font-extrabold text-kairos-forest-ink mt-1">
                  Core Features for Routine Access &amp; Golden-Hour Emergencies
                </h2>
              </div>
              <button
                type="button"
                onClick={() => onOpenAuth('patient', 'signin')}
                className="text-xs sm:text-sm font-semibold text-kairos-emerald-ink hover:text-kairos-forest-ink whitespace-nowrap"
              >
                Sign In to Your Portal →
              </button>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
              {coreFeatures.map((feature) => {
                const Icon = feature.icon;
                const isFeatured = Boolean(feature.featured);
                return (
                  <article
                    key={feature.id}
                    id={feature.anchorId}
                    className={`rounded-2xl p-6 flex flex-col justify-between transition-colors ${
                      isFeatured
                        ? 'bg-kairos-forest text-white border border-emerald-800/60'
                        : 'bg-kairos-surface text-kairos-forest-ink border border-kairos-border hover:border-kairos-emerald'
                    }`}
                  >
                    <div>
                      <div className="flex items-center justify-between gap-3 mb-4">
                        <div
                          className={`w-11 h-11 rounded-xl flex items-center justify-center shrink-0 ${
                            isFeatured
                              ? 'bg-kairos-emerald text-white'
                              : 'bg-kairos-mint-soft text-kairos-emerald-ink'
                          }`}
                        >
                          <Icon className="w-5 h-5" />
                        </div>
                        <span
                          className={`text-xs font-medium text-right ${
                            isFeatured ? 'text-kairos-gold font-semibold' : 'text-kairos-muted'
                          }`}
                        >
                          {feature.indexLabel}
                        </span>
                      </div>

                      <h3 className="font-display text-xl font-bold">{feature.title}</h3>
                      <p
                        className={`text-xs font-mono font-semibold tabular-nums mt-2 ${
                          isFeatured ? 'text-emerald-200' : 'text-kairos-emerald-ink'
                        }`}
                      >
                        {feature.liveMetric}
                      </p>
                      <p
                        className={`text-sm mt-2.5 leading-relaxed ${
                          isFeatured ? 'text-emerald-100/90' : 'text-kairos-muted'
                        }`}
                      >
                        {feature.summary}
                      </p>
                    </div>

                    <div
                      className={`mt-5 pt-4 border-t flex items-center justify-between gap-3 ${
                        isFeatured ? 'border-white/15' : 'border-kairos-border-subtle'
                      }`}
                    >
                      <span
                        className={`text-xs ${
                          isFeatured ? 'text-emerald-200' : 'text-kairos-muted'
                        }`}
                      >
                        {feature.capabilities}
                      </span>
                      <button
                        type="button"
                        onClick={() => onEnterRole(feature.targetRole, feature.targetTab)}
                        className={`text-xs font-semibold whitespace-nowrap shrink-0 ${
                          isFeatured
                            ? 'text-kairos-gold hover:underline'
                            : 'text-kairos-emerald-ink hover:text-kairos-forest-ink'
                        }`}
                      >
                        {feature.ctaLabel}
                      </button>
                    </div>
                  </article>
                );
              })}
            </div>

            {/* Companion Diagnostic Connect Strip */}
            <div className="mt-5 bg-kairos-surface border border-kairos-border rounded-2xl p-5 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
              <div className="flex items-start sm:items-center gap-3.5">
                <div className="w-10 h-10 rounded-xl bg-kairos-mint-soft text-kairos-emerald-ink flex items-center justify-center shrink-0">
                  <FlaskConical className="w-5 h-5" />
                </div>
                <div>
                  <p className="text-sm font-bold text-kairos-forest-ink">
                    Plus Diagnostic Connect{diagnosticCentres.length > 0 ? ` · ${diagnosticCentres.length} Partner Centres` : ' · Labs & Imaging'}
                  </p>
                  <p className="text-xs text-kairos-muted mt-0.5">
                    Search registered lab tests with transparent pricing, book slots, and view uploaded diagnostic reports securely.
                  </p>
                </div>
              </div>
              <div className="flex items-center gap-3 shrink-0">
                <button
                  type="button"
                  onClick={() => onEnterRole('patient', 'diagnostics')}
                  className="text-xs font-semibold text-kairos-emerald-ink hover:text-kairos-forest-ink whitespace-nowrap"
                >
                  Book Lab Test →
                </button>
                <button
                  type="button"
                  onClick={() => onEnterRole('diagnostic', 'bookings')}
                  className="px-3.5 py-2 rounded-xl bg-kairos-surface-subtle border border-kairos-border text-xs font-semibold text-kairos-forest-ink hover:border-kairos-emerald whitespace-nowrap"
                >
                  Lab Portal
                </button>
              </div>
            </div>
          </div>
        </section>

        {/* WATCH HOW IT WORKS — Embedded Overview Video */}
        <WatchHowItWorksSection
          onLaunchEmergency={() => onEnterRole('doctor', 'new-referral')}
        />

        {/* HOW KAIROS WORKS — Dual Flow + 5-Stage Coordination Chain */}
        <section id="how-it-works" className="py-10 px-5 sm:px-6 bg-kairos-mint border-y border-kairos-border">
          <div className="max-w-7xl mx-auto">
            <div className="mb-6">
              <p className="text-[11px] font-bold uppercase tracking-wider text-kairos-emerald-ink">
                04. How KAIROS Works
              </p>
              <h2 className="font-display text-xl sm:text-2xl font-extrabold text-kairos-forest-ink mt-1">
                End-to-End Golden Hour Coordination Chain
              </h2>
            </div>

            {/* 5-Node Visual Coordination Workflow */}
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3 mb-7">
              {[
                { step: '01', title: 'Patient', desc: 'Assessed at clinic/PHC or books OPD token', icon: Users, role: 'patient' as UserRole },
                { step: '02', title: 'Referring Doctor', desc: 'Logs vitals, ISBAR notes & required facilities', icon: Stethoscope, role: 'doctor' as UserRole },
                { step: '03', title: 'Hospital Acceptance', desc: 'Receiving ED accepts & soft-locks ICU bed', icon: CheckCircle2, role: 'hospital' as UserRole },
                { step: '04', title: 'Ambulance Team', desc: 'Receives confirmed bed, route & streams vitals', icon: Ambulance, role: 'ambulance' as UserRole },
                { step: '05', title: 'Receiving Hospital', desc: 'ED team prepared; arrival confirmed & closed', icon: Building2, role: 'hospital' as UserRole },
              ].map((node) => {
                const Icon = node.icon;
                return (
                  <button
                    key={node.step}
                    type="button"
                    onClick={() => onEnterRole(node.role)}
                    className="text-left p-4 rounded-2xl border border-kairos-border bg-kairos-surface hover:border-kairos-emerald transition-colors flex flex-col justify-between"
                  >
                    <div className="flex items-center justify-between mb-3">
                      <span className="font-mono text-xs font-bold text-kairos-emerald-ink">{node.step}</span>
                      <Icon className="w-4 h-4 text-kairos-forest-ink" />
                    </div>
                    <div>
                      <p className="text-sm font-bold text-kairos-forest-ink">{node.title}</p>
                      <p className="text-xs text-kairos-muted mt-1 leading-relaxed">{node.desc}</p>
                    </div>
                  </button>
                );
              })}
            </div>

            {/* Side-by-side Smart OPD vs Emergency Process Cards */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
              <div className="rounded-2xl border border-kairos-border bg-kairos-surface p-6">
                <p className="text-xs font-bold uppercase tracking-wider text-kairos-emerald-ink mb-4">
                  How It Works · Smart OPD
                </p>
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs">
                  <div>
                    <span className="font-mono font-bold text-kairos-forest-ink">1.</span>
                    <p className="font-semibold text-kairos-forest-ink mt-1">Pick hospital + slot</p>
                  </div>
                  <div>
                    <span className="font-mono font-bold text-kairos-forest-ink">2.</span>
                    <p className="font-semibold text-kairos-forest-ink mt-1">Verify · QR token</p>
                  </div>
                  <div>
                    <span className="font-mono font-bold text-kairos-forest-ink">3.</span>
                    <p className="font-semibold text-kairos-forest-ink mt-1">Scan · Join live queue</p>
                  </div>
                  <div>
                    <span className="font-mono font-bold text-kairos-forest-ink">4.</span>
                    <p className="font-semibold text-kairos-forest-ink mt-1">Consult · Delay alerts</p>
                  </div>
                </div>
                <p className="mt-4 text-xs text-kairos-muted">
                  Works with or without the app · SMS / WhatsApp notification templates ready.
                </p>
              </div>

              <div className="rounded-2xl bg-kairos-forest text-white p-6 border border-transparent dark:border-emerald-800/60">
                <p className="text-xs font-bold uppercase tracking-wider text-kairos-gold mb-4">
                  How It Works · Emergency · Target &le; 5 Min
                </p>
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs">
                  <div>
                    <span className="font-mono font-bold text-emerald-300">1.</span>
                    <p className="font-semibold mt-1">Doctor sends ISBAR + vitals</p>
                  </div>
                  <div>
                    <span className="font-mono font-bold text-emerald-300">2.</span>
                    <p className="font-semibold mt-1">Match live verified ICU beds</p>
                  </div>
                  <div>
                    <span className="font-mono font-bold text-emerald-300">3.</span>
                    <p className="font-semibold mt-1">Doctor accepts · Bed held</p>
                  </div>
                  <div>
                    <span className="font-mono font-bold text-emerald-300">4.</span>
                    <p className="font-semibold mt-1">Ambulance moves · Tracked</p>
                  </div>
                </div>
                <p className="mt-4 text-xs text-emerald-200/90">
                  If declined or response timer ends → next matched hospital is escalated automatically.
                </p>
              </div>
            </div>
          </div>
        </section>

        {/* TRUST, PRIVACY, SECURITY & INTEROPERABILITY */}
        <section id="trust" className="py-10 px-5 sm:px-6">
          <div className="max-w-7xl mx-auto">
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
              <div className="bg-kairos-surface border border-kairos-border rounded-2xl p-6">
                <Lock className="w-5 h-5 text-kairos-emerald-ink mb-3" />
                <h3 className="font-display text-base font-bold text-kairos-forest-ink">
                  DPDP-Aligned Consent &amp; PII Isolation
                </h3>
                <p className="text-xs text-kairos-muted mt-2 leading-relaxed">
                  Role-based access control, split private PII collections in Firestore security rules, explicit revocable patient consent, and immutable audit logs for sensitive clinical actions.
                </p>
              </div>
              <div className="bg-kairos-surface border border-kairos-border rounded-2xl p-6">
                <Clock className="w-5 h-5 text-kairos-emerald-ink mb-3" />
                <h3 className="font-display text-base font-bold text-kairos-forest-ink">
                  Clinical Judgment &amp; Safety Override
                </h3>
                <p className="text-xs text-kairos-muted mt-2 leading-relaxed">
                  KAIROS never delays emergency care waiting for digital confirmation and never auto-diagnoses patients. Verified capacity timestamps and manual emergency override protect every handover.
                </p>
              </div>
              <div className="bg-kairos-surface border border-kairos-border rounded-2xl p-6">
                <MessageSquare className="w-5 h-5 text-kairos-emerald-ink mb-3" />
                <h3 className="font-display text-base font-bold text-kairos-forest-ink">
                  HL7 FHIR R4 &amp; ABDM-Ready Architecture
                </h3>
                <p className="text-xs text-kairos-muted mt-2 leading-relaxed">
                  Structured referral bundles export cleanly in HL7 FHIR R4 format, designed for HMIS &amp; future ABDM onboarding without claiming live unverified partnerships.
                </p>
              </div>
            </div>

            {/* Dedicated Role Sign-In Bar */}
            <div className="mt-8 bg-kairos-surface border border-kairos-border rounded-2xl p-6 flex flex-col lg:flex-row lg:items-center justify-between gap-4">
              <div>
                <h3 className="font-display text-lg font-bold text-kairos-forest-ink">
                  Sign in to your KAIROS role portal
                </h3>
                <p className="text-xs text-kairos-muted mt-0.5">
                  Choose your role to open its dedicated Sign In page with Email &amp; Password or Google Sign-In.
                </p>
              </div>
              <div className="flex flex-wrap gap-2">
                {(
                  [
                    ['patient', 'Patient'],
                    ['doctor', 'Referring Doctor'],
                    ['hospital', 'Hospital Desk'],
                    ['ambulance', 'Ambulance'],
                    ['diagnostic', 'Diagnostics'],
                    ['admin', 'Admin'],
                  ] as [UserRole, string][]
                ).map(([role, label]) => (
                  <button
                    key={role}
                    type="button"
                    onClick={() => onEnterRole(role)}
                    className="px-3.5 py-2 rounded-xl border border-kairos-border bg-kairos-surface-subtle text-xs font-semibold text-kairos-forest-ink hover:bg-kairos-forest hover:text-white hover:border-kairos-forest transition-colors whitespace-nowrap"
                  >
                    {label}
                  </button>
                ))}
              </div>
            </div>
          </div>
        </section>
      </main>

      {/* PROFESSIONAL MULTI-COLUMN FOOTER */}
      <footer className="bg-kairos-surface border-t border-kairos-border">
        <div className="max-w-7xl mx-auto px-5 sm:px-6 pt-12 pb-8">
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-12 gap-8 pb-10 border-b border-kairos-border-subtle">
            {/* Column 1: Brand, Mission & Social Media */}
            <div className="lg:col-span-4 space-y-4">
              <a
                href="#top"
                className="inline-flex items-center gap-2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-kairos-emerald rounded-lg"
              >
                <img
                  src="/assets/aistudio/Kairos-Logo-Icon_f4a33af1.png"
                  alt="KAIROS"
                  className="w-7 h-7 object-contain"
                  referrerPolicy="no-referrer"
                />
                <span className="font-display text-lg font-extrabold tracking-tight text-kairos-forest-ink">
                  KAIROS
                </span>
              </a>
              <p className="text-xs text-kairos-muted leading-relaxed max-w-sm">
                Golden-Hour Care Network unifying Smart OPD scheduling, Specialist Connect, and real-time emergency ICU bed verification so no ambulance drives blind.
              </p>
              <div className="inline-flex items-center gap-1.5 text-[11px] font-semibold text-kairos-emerald-ink">
                <ShieldCheck className="w-3.5 h-3.5 shrink-0" />
                DPDP-Aligned · HL7 FHIR R4 Ready
              </div>

              {/* Social Media Handles */}
              <div className="pt-1">
                <p className="text-[11px] font-semibold uppercase tracking-wider text-kairos-muted mb-2.5">
                  Connect With Us
                </p>
                <div className="flex items-center gap-2">
                  {[
                    {
                      label: 'KAIROS on X (Twitter)',
                      href: 'https://x.com/kairoshealth',
                      icon: (
                        <svg viewBox="0 0 24 24" className="w-3.5 h-3.5 fill-current" aria-hidden="true">
                          <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z" />
                        </svg>
                      ),
                    },
                    {
                      label: 'KAIROS on LinkedIn',
                      href: 'https://linkedin.com/company/kairos-health-network',
                      icon: (
                        <svg viewBox="0 0 24 24" className="w-3.5 h-3.5 fill-current" aria-hidden="true">
                          <path d="M19 3a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h14m-.5 15.5v-5.3a3.26 3.26 0 0 0-3.26-3.26c-.85 0-1.84.52-2.28 1.3v-1.11h-2.79v8.37h2.79v-4.93c0-.77.62-1.4 1.39-1.4a1.4 1.4 0 0 1 1.4 1.4v4.93h2.75M6.88 8.56a1.68 1.68 0 0 0 1.68-1.68c0-.93-.75-1.69-1.68-1.69a1.69 1.69 0 0 0-1.69 1.69c0 .93.76 1.68 1.69 1.68m1.39 9.94v-8.37H5.5v8.37h2.77z" />
                        </svg>
                      ),
                    },
                    {
                      label: 'KAIROS on Instagram',
                      href: 'https://instagram.com/kairoshealth.in',
                      icon: (
                        <svg viewBox="0 0 24 24" className="w-3.5 h-3.5 fill-current" aria-hidden="true">
                          <path d="M7.8 2h8.4C19.4 2 22 4.6 22 7.8v8.4a5.8 5.8 0 0 1-5.8 5.8H7.8C4.6 22 2 19.4 2 16.2V7.8A5.8 5.8 0 0 1 7.8 2m-.2 2A3.6 3.6 0 0 0 4 7.6v8.8C4 18.39 5.61 20 7.6 20h8.8a3.6 3.6 0 0 0 3.6-3.6V7.6C20 5.61 18.39 4 16.4 4H7.6m9.65 1.5a1.25 1.25 0 0 1 1.25 1.25A1.25 1.25 0 0 1 17.25 8 1.25 1.25 0 0 1 16 6.75a1.25 1.25 0 0 1 1.25-1.25M12 7a5 5 0 0 1 5 5 5 5 0 0 1-5 5 5 5 0 0 1-5-5 5 5 0 0 1 5-5m0 2a3 3 0 0 0-3 3 3 3 0 0 0 3 3 3 3 0 0 0 3-3 3 3 0 0 0-3-3z" />
                        </svg>
                      ),
                    },
                    {
                      label: 'KAIROS on YouTube',
                      href: 'https://youtube.com/@kairoshealth',
                      icon: (
                        <svg viewBox="0 0 24 24" className="w-3.5 h-3.5 fill-current" aria-hidden="true">
                          <path d="M23.5 6.19a3.02 3.02 0 0 0-2.12-2.14C19.5 3.5 12 3.5 12 3.5s-7.5 0-9.38.55A3.02 3.02 0 0 0 .5 6.19C0 8.07 0 12 0 12s0 3.93.5 5.81a3.02 3.02 0 0 0 2.12 2.14c1.88.55 9.38.55 9.38.55s7.5 0 9.38-.55a3.02 3.02 0 0 0 2.12-2.14C24 15.93 24 12 24 12s0-3.93-.5-5.81zM9.54 15.57V8.43L15.82 12l-6.28 3.57z" />
                        </svg>
                      ),
                    },
                    {
                      label: 'KAIROS on GitHub',
                      href: 'https://github.com/kairos-health',
                      icon: (
                        <svg viewBox="0 0 24 24" className="w-3.5 h-3.5 fill-current" aria-hidden="true">
                          <path d="M12 2A10 10 0 0 0 2 12c0 4.42 2.87 8.17 6.84 9.5.5.08.66-.23.66-.5v-1.69c-2.77.6-3.36-1.34-3.36-1.34-.46-1.16-1.11-1.47-1.11-1.47-.91-.62.07-.6.07-.6 1 .07 1.53 1.03 1.53 1.03.87 1.52 2.34 1.07 2.91.83.09-.65.35-1.09.63-1.34-2.22-.25-4.55-1.11-4.55-4.92 0-1.11.38-2 1.03-2.71-.1-.25-.45-1.29.1-2.64 0 0 .84-.27 2.75 1.02.79-.22 1.65-.33 2.5-.33.85 0 1.71.11 2.5.33 1.91-1.29 2.75-1.02 2.75-1.02.55 1.35.2 2.39.1 2.64.65.71 1.03 1.6 1.03 2.71 0 3.82-2.34 4.66-4.57 4.91.36.31.69.92.69 1.85V21c0 .27.16.59.67.5C19.14 20.16 22 16.42 22 12A10 10 0 0 0 12 2z" />
                        </svg>
                      ),
                    },
                  ].map((social) => (
                    <a
                      key={social.label}
                      href={social.href}
                      target="_blank"
                      rel="noopener noreferrer"
                      aria-label={social.label}
                      className="w-8 h-8 rounded-lg border border-kairos-border bg-kairos-surface-subtle text-kairos-forest-ink/80 hover:bg-kairos-emerald hover:border-kairos-emerald hover:text-white flex items-center justify-center transition-colors"
                    >
                      {social.icon}
                    </a>
                  ))}
                </div>
              </div>
            </div>

            {/* Column 2: Platform Links */}
            <div className="lg:col-span-2">
              <h3 className="text-xs font-bold uppercase tracking-wider text-kairos-forest-ink mb-3.5">
                Platform
              </h3>
              <ul className="space-y-2.5 text-xs text-kairos-muted">
                <li>
                  <a href="#smart-opd" className="hover:text-kairos-emerald-ink transition-colors">
                    Smart OPD Booking
                  </a>
                </li>
                <li>
                  <a href="#emergency" className="hover:text-kairos-emerald-ink transition-colors">
                    Emergency Coordination
                  </a>
                </li>
                <li>
                  <button
                    type="button"
                    onClick={() => onEnterRole('patient', 'specialists')}
                    className="hover:text-kairos-emerald-ink transition-colors text-left"
                  >
                    Specialist Connect
                  </button>
                </li>
                <li>
                  <a href="#watch-how-it-works" className="hover:text-kairos-emerald-ink transition-colors">
                    Watch How It Works
                  </a>
                </li>
                <li>
                  <button
                    type="button"
                    onClick={() => onEnterRole('hospital')}
                    className="hover:text-kairos-emerald-ink transition-colors text-left"
                  >
                    Hospital &amp; Lab Portals
                  </button>
                </li>
              </ul>
            </div>

            {/* Column 3: Legal & Privacy */}
            <div className="lg:col-span-3">
              <h3 className="text-xs font-bold uppercase tracking-wider text-kairos-forest-ink mb-3.5">
                Legal &amp; Privacy
              </h3>
              <ul className="space-y-2.5 text-xs text-kairos-muted">
                <li>
                  <button
                    type="button"
                    onClick={() => setFooterModal('privacy')}
                    className="hover:text-kairos-emerald-ink transition-colors text-left"
                  >
                    Privacy Policy
                  </button>
                </li>
                <li>
                  <button
                    type="button"
                    onClick={() => setFooterModal('terms')}
                    className="hover:text-kairos-emerald-ink transition-colors text-left"
                  >
                    Terms of Service &amp; Clinical Override
                  </button>
                </li>
                <li>
                  <button
                    type="button"
                    onClick={() => setFooterModal('dpdp')}
                    className="hover:text-kairos-emerald-ink transition-colors text-left"
                  >
                    DPDP Act 2023 &amp; Patient Consent
                  </button>
                </li>
                <li>
                  <a href="#trust" className="hover:text-kairos-emerald-ink transition-colors">
                    Security &amp; HL7 FHIR R4 Standards
                  </a>
                </li>
              </ul>
            </div>

            {/* Column 4: Contact & 24/7 Coordination Desk */}
            <div className="lg:col-span-3">
              <h3 className="text-xs font-bold uppercase tracking-wider text-kairos-forest-ink mb-3.5">
                Contact &amp; Support
              </h3>
              <ul className="space-y-2.5 text-xs text-kairos-muted">
                <li>
                  <a
                    href="mailto:karunyayashu6@gmail.com"
                    className="inline-flex items-center gap-2 hover:text-kairos-emerald-ink transition-colors"
                  >
                    <Mail className="w-3.5 h-3.5 text-kairos-emerald-ink shrink-0" />
                    karunyayashu6@gmail.com
                  </a>
                </li>
                <li>
                  <a
                    href="mailto:support@kairoshealth.in"
                    className="inline-flex items-center gap-2 hover:text-kairos-emerald-ink transition-colors"
                  >
                    <Mail className="w-3.5 h-3.5 text-kairos-emerald-ink shrink-0" />
                    support@kairoshealth.in
                  </a>
                </li>
                <li>
                  <a
                    href="tel:+1234567890"
                    className="inline-flex items-center gap-2 hover:text-kairos-emerald-ink transition-colors font-mono"
                  >
                    <Phone className="w-3.5 h-3.5 text-kairos-emerald-ink shrink-0" />
                    +1234567890 (24/7 Desk)
                  </a>
                </li>
                <li className="inline-flex items-start gap-2">
                  <MapPin className="w-3.5 h-3.5 text-kairos-emerald-ink shrink-0 mt-0.5" />
                  <span>Bengaluru, KA 560049</span>
                </li>
              </ul>
              <button
                type="button"
                onClick={() => {
                  setContactSubmitted(false);
                  setFooterModal('contact');
                }}
                className="mt-4 inline-flex items-center gap-1.5 px-3.5 py-2 rounded-lg border border-kairos-border bg-kairos-surface-subtle hover:border-kairos-emerald text-xs font-semibold text-kairos-forest-ink hover:text-kairos-emerald-ink transition-colors"
              >
                <MessageSquare className="w-3.5 h-3.5" />
                Contact Coordination Team
              </button>
            </div>
          </div>

          {/* Bottom Copyright & Legal Bar */}
          <div className="pt-6 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 text-[11px] text-kairos-muted">
            <p>
              &copy; {new Date().getFullYear()} <strong className="text-kairos-forest-ink">KAIROS Health Network</strong> · Team Dr. Debug · Think Tank 2026. All rights reserved.
            </p>
            <div className="flex flex-wrap items-center gap-x-4 gap-y-1">
              <button
                type="button"
                onClick={() => setFooterModal('privacy')}
                className="hover:text-kairos-emerald-ink transition-colors"
              >
                Privacy
              </button>
              <button
                type="button"
                onClick={() => setFooterModal('terms')}
                className="hover:text-kairos-emerald-ink transition-colors"
              >
                Terms
              </button>
              <button
                type="button"
                onClick={() => setFooterModal('dpdp')}
                className="hover:text-kairos-emerald-ink transition-colors"
              >
                DPDP Notice
              </button>
              <button
                type="button"
                onClick={() => {
                  setContactSubmitted(false);
                  setFooterModal('contact');
                }}
                className="hover:text-kairos-emerald-ink transition-colors"
              >
                Contact
              </button>
            </div>
          </div>
        </div>
      </footer>

      {/* Interactive Legal / Privacy / Contact Modal */}
      {footerModal && (
        <div
          role="dialog"
          aria-modal="true"
          className="fixed inset-0 z-50 bg-black/55 backdrop-blur-xs flex items-center justify-center p-4"
          onClick={() => setFooterModal(null)}
        >
          <div
            className="w-full max-w-lg rounded-2xl bg-kairos-surface border border-kairos-border shadow-2xl overflow-hidden"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="px-5 py-4 bg-kairos-forest text-white flex items-center justify-between gap-3">
              <div className="flex items-center gap-2">
                <ShieldCheck className="w-4 h-4 text-[#4ADE80]" />
                <h3 className="font-display text-sm font-bold">
                  {footerModal === 'privacy' && 'Privacy Policy · KAIROS Health Network'}
                  {footerModal === 'terms' && 'Terms of Service & Clinical Safety Override'}
                  {footerModal === 'dpdp' && 'DPDP Act 2023 · Data Governance & Consent'}
                  {footerModal === 'contact' && 'Contact KAIROS Coordination Team'}
                </h3>
              </div>
              <button
                type="button"
                onClick={() => setFooterModal(null)}
                aria-label="Close modal"
                className="p-1 rounded-lg hover:bg-white/10 transition-colors"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="p-5 text-xs text-kairos-forest-ink/85 space-y-3 leading-relaxed max-h-[70vh] overflow-y-auto">
              {footerModal === 'privacy' && (
                <>
                  <p>
                    KAIROS processes patient and clinician data strictly for Smart OPD scheduling, Specialist Connect consultations, and Golden-Hour emergency referral coordination.
                  </p>
                  <p>
                    <strong className="text-kairos-forest-ink">PII Isolation &amp; Role-Based Access:</strong> Personal identifiers (contact numbers, clinical notes, and private patient metadata) are isolated behind role-scoped security rules so only authorized clinicians, receiving hospitals, and the patient can view relevant records.
                  </p>
                  <p>
                    <strong className="text-kairos-forest-ink">No Unconsented Data Sharing:</strong> KAIROS never sells medical data or shares patient records with third-party advertisers. All sensitive handoffs are logged in an immutable audit trail.
                  </p>
                </>
              )}

              {footerModal === 'terms' && (
                <>
                  <p>
                    KAIROS is a real-time clinical coordination and bed-verification layer designed to assist referring doctors, ambulance teams, and receiving hospitals.
                  </p>
                  <p>
                    <strong className="text-kairos-forest-ink">Clinical Safety Override:</strong> KAIROS never replaces licensed medical judgment and never auto-diagnoses patients. In immediately life-threatening emergencies, clinicians and paramedics may always exercise Manual Safety Override without waiting for digital bed confirmation.
                  </p>
                  <p>
                    <strong className="text-kairos-forest-ink">Verified Capacity Timestamps:</strong> Receiving hospitals are responsible for keeping ICU, ventilator, and oxygen bed counts accurate. Stale entries are transparently flagged in the matching engine.
                  </p>
                </>
              )}

              {footerModal === 'dpdp' && (
                <>
                  <p>
                    Aligned with India&apos;s <strong className="text-kairos-forest-ink">Digital Personal Data Protection (DPDP) Act, 2023</strong>, every account creation and emergency referral records explicit, purpose-limited consent.
                  </p>
                  <ul className="list-disc pl-4 space-y-1.5">
                    <li>Patients can view and revoke non-emergency data sharing consent at any time.</li>
                    <li>Structured clinical payloads follow HL7 FHIR R4 standards for safe HMIS interoperability.</li>
                    <li>For Data Protection Officer inquiries, email <span className="font-mono text-kairos-emerald-ink">privacy@kairoshealth.in</span>.</li>
                  </ul>
                </>
              )}

              {footerModal === 'contact' && (
                contactSubmitted ? (
                  <div className="p-4 rounded-xl bg-kairos-mint-soft border border-kairos-border text-center space-y-2">
                    <CheckCircle2 className="w-7 h-7 text-kairos-emerald-ink mx-auto" />
                    <p className="font-semibold text-sm text-kairos-forest-ink">Message Received</p>
                    <p className="text-xs text-kairos-muted">
                      Thank you{contactName ? `, ${contactName}` : ''}. Our coordination &amp; hospital onboarding team will respond to <span className="font-mono">{contactEmail || 'your email'}</span> shortly.
                    </p>
                  </div>
                ) : (
                  <form
                    onSubmit={(e) => {
                      e.preventDefault();
                      setContactSubmitted(true);
                    }}
                    className="space-y-3"
                  >
                    <p className="text-kairos-muted">
                      Reach out for hospital onboarding, ambulance fleet integration, or technical support at{' '}
                      <a href="mailto:karunyayashu6@gmail.com" className="font-semibold text-kairos-emerald-ink hover:underline">
                        karunyayashu6@gmail.com
                      </a>.
                    </p>
                    <div>
                      <label htmlFor="footer-contact-name" className="block font-semibold text-kairos-forest-ink mb-1">
                        Full Name / Organization
                      </label>
                      <input
                        id="footer-contact-name"
                        type="text"
                        required
                        value={contactName}
                        onChange={(e) => setContactName(e.target.value)}
                        placeholder="Dr. Ananya Rao / City Trauma Hospital"
                        className="w-full rounded-xl border border-kairos-border bg-kairos-surface-subtle px-3 py-2 text-xs text-kairos-forest-ink placeholder:text-kairos-muted/70 focus:outline-none focus:ring-2 focus:ring-kairos-emerald"
                      />
                    </div>
                    <div>
                      <label htmlFor="footer-contact-email" className="block font-semibold text-kairos-forest-ink mb-1">
                        Email Address
                      </label>
                      <input
                        id="footer-contact-email"
                        type="email"
                        required
                        value={contactEmail}
                        onChange={(e) => setContactEmail(e.target.value)}
                        placeholder="you@hospital.org"
                        className="w-full rounded-xl border border-kairos-border bg-kairos-surface-subtle px-3 py-2 text-xs text-kairos-forest-ink placeholder:text-kairos-muted/70 focus:outline-none focus:ring-2 focus:ring-kairos-emerald"
                      />
                    </div>
                    <div>
                      <label htmlFor="footer-contact-msg" className="block font-semibold text-kairos-forest-ink mb-1">
                        How can we help?
                      </label>
                      <textarea
                        id="footer-contact-msg"
                        rows={3}
                        required
                        value={contactMsg}
                        onChange={(e) => setContactMsg(e.target.value)}
                        placeholder="Hospital onboarding, HMIS/FHIR integration, or general inquiry..."
                        className="w-full rounded-xl border border-kairos-border bg-kairos-surface-subtle px-3 py-2 text-xs text-kairos-forest-ink placeholder:text-kairos-muted/70 focus:outline-none focus:ring-2 focus:ring-kairos-emerald"
                      />
                    </div>
                    <button
                      type="submit"
                      className="w-full py-2.5 rounded-xl bg-kairos-emerald hover:bg-kairos-emerald-hover text-white text-xs font-semibold transition-colors"
                    >
                      Send Message
                    </button>
                  </form>
                )
              )}
            </div>

            <div className="px-5 py-3 border-t border-kairos-border-subtle bg-kairos-surface-subtle flex justify-end">
              <button
                type="button"
                onClick={() => setFooterModal(null)}
                className="px-4 py-1.5 rounded-lg bg-kairos-forest hover:bg-kairos-emerald text-white text-xs font-semibold transition-colors"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
