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
  MessageSquare,
  Play,
  QrCode,
  Stethoscope,
  Users,
} from 'lucide-react';
import { useKairos } from '../context/KairosContext';
import type { UserRole } from '../types/kairos';
import { evaluateBedHoldState, formatCountdown } from '../utils/kairosEngine';
import { WatchHowItWorksSection } from './WatchHowItWorksSection';
import type { AssistantTab } from './KairosAssistantModal';

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
    <div className="min-h-screen bg-[#F1F7F4] text-[#0B2B22]">
      {/* Strict 3-Zone Top Bar Contract */}
      <header className="sticky top-0 z-40 bg-[#F9FBF9]/95 backdrop-blur-md border-b border-[#E3ECE6]">
        <div className="max-w-7xl mx-auto px-6 h-[72px] flex items-center justify-between gap-8">
          <a
            href="#top"
            className="flex items-center gap-2.5 whitespace-nowrap shrink-0 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#1F6A41] rounded-lg"
          >
            <img
              src="/assets/aistudio/Kairos-Logo-Icon_f4a33af1.png"
              alt="KAIROS"
              className="w-9 h-9 object-contain"
              referrerPolicy="no-referrer"
            />
            <span className="font-display text-2xl font-extrabold tracking-tight text-[#122620]">
              KAIROS
            </span>
          </a>

          <nav
            aria-label="Primary navigation"
            className="hidden md:flex items-center gap-8 text-[15px] font-medium text-[#1D352D]"
          >
            <a
              href="#smart-opd"
              className="hover:text-[#1F6A41] transition-colors whitespace-nowrap shrink-0"
            >
              OPD
            </a>
            <a
              href="#emergency"
              className="hover:text-[#1F6A41] transition-colors whitespace-nowrap shrink-0"
            >
              Emergency
            </a>
            <a
              href="#modules"
              className="hover:text-[#1F6A41] transition-colors whitespace-nowrap shrink-0"
            >
              Hospitals
            </a>
            <a
              href="#how-it-works"
              className="hover:text-[#1F6A41] transition-colors whitespace-nowrap shrink-0"
            >
              How it works
            </a>
          </nav>

          <div className="flex items-center gap-3 shrink-0">
            <button
              type="button"
              onClick={() => onOpenAuth('patient', 'signin')}
              className="inline-flex items-center gap-2 px-5 py-2.5 rounded-full bg-[#246B43] text-white text-sm font-semibold hover:bg-[#1B5434] transition-colors whitespace-nowrap shrink-0 shadow-xs"
            >
              {currentUser ? 'Open Platform' : 'Sign In'}
              <ArrowRight className="w-4 h-4" />
            </button>
          </div>
        </div>
      </header>

      <main id="top">
        {/* HERO SECTION — Full-bleed editorial healthcare showcase matching reference visual */}
        <section className="relative overflow-hidden bg-gradient-to-br from-[#FBFDFB] via-[#F6FAF7] to-[#EAF4EE] border-b border-[#DCECE3]">
          {/* Soft Botanical Background Curves */}
          <svg
            aria-hidden="true"
            viewBox="0 0 1440 680"
            preserveAspectRatio="none"
            className="pointer-events-none absolute inset-0 w-full h-full opacity-75"
          >
            <path
              d="M0,450 C220,560 440,620 680,530 C820,475 940,420 1120,450 L1440,480 L1440,680 L0,680 Z"
              fill="#E4F2E8"
              fillOpacity="0.65"
            />
            <path
              d="M-60,410 C120,520 340,610 560,640 L-60,680 Z"
              fill="#D9EDE0"
              fillOpacity="0.55"
            />
          </svg>

          {/* Desktop Right-Edge Seamless Hero Visual (Doctor holding Bed Confirmed tablet + Hospital & Ambulance) */}
          <div className="hidden lg:flex pointer-events-none absolute inset-y-0 right-0 w-[52%] xl:w-[50%] items-end justify-end">
            <img
              src="/assets/aistudio/kairos-hero-scene.png"
              alt="KAIROS doctor holding Bed Confirmed and Ambulance On The Way tablet in front of a hospital and emergency ambulance"
              className="h-full max-h-[670px] w-auto object-contain object-right-bottom select-none"
              referrerPolicy="no-referrer"
            />
          </div>

          <div className="relative z-10 max-w-7xl mx-auto px-6 pt-10 lg:pt-12 pb-20 lg:pb-24">
            <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-center">
              {/* Hero Left Column */}
              <div className="lg:col-span-7 xl:col-span-6">
                {/* Kicker Row */}
                <div className="flex flex-wrap items-center gap-3 mb-5">
                  <span className="inline-flex items-center gap-2 px-3.5 py-1.5 rounded-full bg-[#DCF0E2] text-[#0E3A2A] text-xs font-bold tracking-wide uppercase">
                    <Clock className="w-3.5 h-3.5 text-[#1F6A41] shrink-0" />
                    Golden Hour Rescue Platform
                  </span>
                  <span aria-hidden="true" className="hidden sm:inline-block h-4 w-px bg-[#9FC3AD]" />
                  <span className="text-xs font-extrabold tracking-wide uppercase text-[#1F6A41]">
                    Accept Before You Move
                  </span>
                </div>

                {/* Primary Display Headline */}
                <h1
                  className="font-display font-extrabold text-[#122620] tracking-tight leading-[1.03]"
                  style={{ fontSize: 'clamp(2.75rem, 5vw, 4.35rem)', textWrap: 'balance' }}
                >
                  Right Hospital.
                  <br />
                  <span className="text-[#1F6E42]">Right Resources.</span>
                  <br />
                  Right Now.
                </h1>

                {/* Value Proposition Copy */}
                <p className="mt-5 text-base sm:text-[18px] text-[#223B32] max-w-xl leading-snug font-medium">
                  Connecting patients, doctors, hospitals and ambulances through one coordinated healthcare platform.
                </p>

                {/* Highlighted Core Promise with Hand-Drawn Emerald Underline */}
                <div className="mt-3.5 inline-block max-w-full">
                  <div className="inline-block rounded-xl bg-[#DFF2E4] px-4 py-1.5 text-sm sm:text-[17px] font-bold text-[#122620]">
                    The bed is confirmed before the ambulance moves.
                  </div>
                  <svg
                    aria-hidden="true"
                    viewBox="0 0 360 12"
                    fill="none"
                    className="w-64 sm:w-80 h-3 -mt-0.5 ml-2 text-[#1F8A4C]"
                  >
                    <path
                      d="M3 9.5C95 2.5 235 1.5 357 4.5"
                      stroke="currentColor"
                      strokeWidth="2.8"
                      strokeLinecap="round"
                    />
                  </svg>
                </div>

                {/* 4 Role Quick-Access Circular Shortcuts (Patients · Doctors · Ambulances · Hospitals) */}
                <div className="mt-6 grid grid-cols-4 gap-3 sm:gap-5 max-w-md">
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
                        className="group flex flex-col items-center gap-2 text-center focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#1F6A41] rounded-2xl py-1"
                      >
                        <span className="w-12 h-12 sm:w-13 sm:h-13 rounded-full bg-[#E1F3E7] group-hover:bg-[#1F6A41] text-[#143B2B] group-hover:text-white flex items-center justify-center transition-colors shadow-2xs">
                          <Icon className="w-5 h-5" />
                        </span>
                        <span className="text-xs sm:text-[13px] font-semibold text-[#1A332A] group-hover:text-[#1F6A41] transition-colors">
                          {item.label}
                        </span>
                      </button>
                    );
                  })}
                </div>

                {/* Primary & Secondary Action Buttons */}
                <div className="mt-7 flex flex-wrap items-center gap-3.5">
                  <button
                    type="button"
                    onClick={() => onOpenAuth('patient', 'signin')}
                    className="inline-flex items-center gap-2 px-7 py-3.5 rounded-full bg-[#226B42] text-white text-sm font-bold hover:bg-[#185231] transition-colors whitespace-nowrap shadow-sm"
                  >
                    Get Started
                    <ArrowRight className="w-4 h-4" />
                  </button>
                  <a
                    href="#watch-how-it-works"
                    className="inline-flex items-center gap-2 px-6 py-3.5 rounded-full bg-white border border-[#24473A]/35 text-[#122620] text-sm font-semibold hover:border-[#1F6A41] hover:text-[#1F6A41] transition-colors whitespace-nowrap"
                  >
                    <Play className="w-3.5 h-3.5" />
                    Explore How It Works
                  </a>
                  <button
                    type="button"
                    onClick={() => onOpenAssistant('voice')}
                    className="inline-flex items-center gap-1.5 px-3 py-2 rounded-full text-[#1F6A41] hover:bg-[#E1F3E7] text-xs font-bold transition-colors whitespace-nowrap"
                  >
                    <AudioLines className="w-3.5 h-3.5" />
                    Live Voice &amp; AI
                  </button>
                </div>
              </div>

              {/* Mobile / Tablet Inline Hero Scene */}
              <div className="lg:hidden flex justify-center -mb-8">
                <img
                  src="/assets/aistudio/kairos-hero-scene.png"
                  alt="KAIROS doctor holding Bed Confirmed and Ambulance On The Way tablet in front of a hospital and emergency ambulance"
                  className="w-full max-w-[480px] h-auto object-contain select-none"
                  referrerPolicy="no-referrer"
                />
              </div>
            </div>
          </div>

          {/* Bottom Centered Live Capabilities Strip (Interactive quick-jumps) */}
          <div className="relative lg:absolute lg:bottom-5 lg:inset-x-0 z-20 px-4 pb-5 lg:pb-0 flex justify-center">
            <div className="inline-flex flex-wrap items-center justify-center gap-x-3 gap-y-1.5 px-5 py-2.5 rounded-full bg-white/95 backdrop-blur-md border border-[#D8E9DF] shadow-[0_8px_28px_rgba(16,40,33,0.08)] text-xs text-[#1D352D]">
              <button
                type="button"
                onClick={() => onEnterRole('hospital', 'overview')}
                className="inline-flex items-center gap-1.5 font-bold text-[#122620] hover:text-[#1F6A41] transition-colors whitespace-nowrap"
              >
                <Activity className="w-3.5 h-3.5 text-[#1F6A41]" />
                Live Updates
              </button>
              <span aria-hidden="true" className="text-slate-300">|</span>
              <button
                type="button"
                onClick={() => onEnterRole('hospital', 'capacity')}
                className="font-medium hover:text-[#1F6A41] transition-colors whitespace-nowrap"
              >
                {hospitals.length > 0 ? `Bed Availability (${openIcuCount} ICU open)` : 'Bed Availability'}
              </button>
              <span aria-hidden="true" className="text-slate-300">·</span>
              <button
                type="button"
                onClick={() => onEnterRole('ambulance', 'route')}
                className="font-medium hover:text-[#1F6A41] transition-colors whitespace-nowrap"
              >
                Ambulance Tracking
              </button>
              <span aria-hidden="true" className="text-slate-300">·</span>
              <button
                type="button"
                onClick={() => onEnterRole('patient', 'opd')}
                className="font-medium hover:text-[#1F6A41] transition-colors whitespace-nowrap"
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
                className="bg-white border border-[#D5E7DD] rounded-2xl p-4 sm:p-5 grid grid-cols-1 md:grid-cols-12 gap-4 items-end shadow-xs"
              >
                <div className="md:col-span-4">
                  <label
                    htmlFor="quick-hospital"
                    className="block text-[11px] font-semibold text-slate-500 mb-1"
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
                    className="w-full rounded-xl border border-[#CFE3D8] bg-[#FAFDFB] px-3.5 py-2.5 text-sm font-semibold text-[#0B3B2D] focus:outline-none focus:ring-2 focus:ring-[#119655]"
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
                    className="block text-[11px] font-semibold text-slate-500 mb-1"
                  >
                    Department
                  </label>
                  <select
                    id="quick-dept"
                    value={selectedDept}
                    onChange={(e) => setSelectedDept(e.target.value)}
                    className="w-full rounded-xl border border-[#CFE3D8] bg-[#FAFDFB] px-3.5 py-2.5 text-sm font-semibold text-[#0B3B2D] focus:outline-none focus:ring-2 focus:ring-[#119655]"
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
                    className="block text-[11px] font-semibold text-slate-500 mb-1"
                  >
                    Available Slot
                  </label>
                  <select
                    id="quick-slot"
                    value={selectedSlot}
                    onChange={(e) => setSelectedSlot(e.target.value)}
                    className="w-full rounded-xl border border-[#CFE3D8] bg-[#FAFDFB] px-3.5 py-2.5 text-sm font-semibold text-[#0B3B2D] focus:outline-none focus:ring-2 focus:ring-[#119655]"
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
                    className="w-full inline-flex items-center justify-center gap-2 py-2.5 px-5 rounded-xl bg-[#0B3B2D] text-white text-sm font-semibold hover:bg-[#119655] transition-colors whitespace-nowrap"
                  >
                    Book OPD
                    <ArrowRight className="w-4 h-4" />
                  </button>
                </div>
              </form>
            ) : (
              <div
                id="smart-opd"
                className="bg-white border border-[#D5E7DD] rounded-2xl p-5 flex flex-col md:flex-row md:items-center justify-between gap-4 shadow-xs"
              >
                <div>
                  <p className="text-xs font-bold uppercase tracking-wider text-[#119655]">
                    Smart OPD &amp; Hospital Onboarding
                  </p>
                  <h2 className="font-display text-lg font-bold text-[#0B3B2D] mt-0.5">
                    Sign in to book OPD tokens or register your hospital&apos;s live capacity
                  </h2>
                  <p className="text-xs text-slate-600 mt-0.5">
                    Each role has its own dedicated sign-in portal with Email &amp; Password or Google Sign-In.
                  </p>
                </div>
                <div className="flex flex-wrap items-center gap-2.5 shrink-0">
                  <button
                    type="button"
                    onClick={() => onOpenAuth('patient', 'signin')}
                    className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl bg-[#0B3B2D] text-white text-xs font-semibold hover:bg-[#119655] transition-colors whitespace-nowrap"
                  >
                    Patient Sign In
                    <ArrowRight className="w-3.5 h-3.5" />
                  </button>
                  <button
                    type="button"
                    onClick={() => onOpenAuth('hospital', 'signin')}
                    className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl border border-[#CFE3D8] bg-[#FAFDFB] text-[#0B3B2D] text-xs font-semibold hover:border-[#119655] transition-colors whitespace-nowrap"
                  >
                    Hospital Desk Sign In
                  </button>
                </div>
              </div>
            )}

            {/* 4-COLUMN QUANTITATIVE EVIDENCE STRIP (Matching PDF Page 1 & Pitch Deck) */}
            <div className="mt-5 grid grid-cols-2 lg:grid-cols-4 gap-4">
              <div className="bg-white border border-[#D5E7DD] rounded-2xl p-5">
                <p className="font-display text-2xl sm:text-3xl font-extrabold text-[#0B3B2D] tabular-nums">
                  ~15,000
                </p>
                <p className="text-xs text-slate-600 mt-1">
                  OPD patients/day at AIIMS Delhi; queues exceed 200 m
                </p>
              </div>
              <div className="bg-white border border-[#D5E7DD] rounded-2xl p-5">
                <p className="font-display text-2xl sm:text-3xl font-extrabold text-[#119655] tabular-nums">
                  &le; 5 min
                </p>
                <p className="text-xs text-slate-600 mt-1">
                  Pilot target for emergency hospital bed acceptance
                </p>
              </div>
              <div className="bg-white border border-[#D5E7DD] rounded-2xl p-5">
                <p className="font-display text-2xl sm:text-3xl font-extrabold text-[#0B3B2D] tabular-nums">
                  90.6%
                </p>
                <p className="text-xs text-slate-600 mt-1">
                  Critically ill obstetric transfers arrive with zero prior notice
                </p>
              </div>
              <div className="bg-white border border-[#D5E7DD] rounded-2xl p-5">
                <p className="font-display text-2xl sm:text-3xl font-extrabold text-[#119655] tabular-nums">
                  0
                </p>
                <p className="text-xs text-slate-600 mt-1">
                  Double-promised ICU beds with time-bounded bed holds
                </p>
              </div>
            </div>
          </div>
        </section>

        {/* THE PROBLEM & OUR SOLUTION */}
        <section className="py-12 px-6 bg-white border-y border-[#DCECE3]">
          <div className="max-w-7xl mx-auto">
            <div className="max-w-2xl mb-8">
              <p className="text-xs font-bold uppercase tracking-wider text-[#119655]">
                01. The Coordination Problem & Solution
              </p>
              <h2 className="font-display text-2xl sm:text-3xl font-extrabold text-[#0B3B2D] mt-1.5">
                Healthcare access breaks twice: at the OPD counter and at the ambulance door.
              </h2>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
              <div className="lg:col-span-5 bg-[#0B3B2D] text-white rounded-2xl p-7 flex flex-col justify-between">
                <div>
                  <p className="text-xs font-bold uppercase tracking-wider text-[#F2B705]">
                    Our Core Principle
                  </p>
                  <h3 className="font-display text-3xl font-extrabold mt-2 leading-tight">
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
                <div className="rounded-2xl border border-[#DCECE3] p-6 bg-[#FAFDFB]">
                  <p className="text-xs font-semibold text-red-700 mb-2">Today · Broken Routine Care</p>
                  <ul className="space-y-2.5 text-sm text-slate-700">
                    <li>• 52% of tertiary OPD visits travel from outside the city without slot visibility.</li>
                    <li>• Doctor delays leave waiting patients uninformed in crowded corridors.</li>
                    <li>• Rural families struggle to locate verified specialists or nearby labs.</li>
                  </ul>
                </div>
                <div className="rounded-2xl border border-[#DCECE3] p-6 bg-[#FAFDFB]">
                  <p className="text-xs font-semibold text-red-700 mb-2">Today · Uncoordinated Referrals</p>
                  <ul className="space-y-2.5 text-sm text-slate-700">
                    <li>• Emergency transfers rely on frantic phone calls and incomplete vitals.</li>
                    <li>• Ambulances drive toward hospitals with full ICUs and no bed confirmation.</li>
                    <li>• Receiving EDs face surprise arrivals without advance ISBAR handover.</li>
                  </ul>
                </div>
                <div className="sm:col-span-2 rounded-2xl border border-[#BCE0CE] bg-[#EFF9F4] p-6 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                  <div>
                    <p className="text-sm font-bold text-[#0B3B2D]">
                      One Unified Coordination Layer — Plugs into Existing HMIS
                    </p>
                    <p className="text-xs text-slate-600 mt-1">
                      HL7 FHIR R4 structured payloads · ABDM integration-ready architecture · App-less SMS & WhatsApp fallback templates.
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={() => onEnterRole('hospital')}
                    className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl bg-[#0B3B2D] text-white text-xs font-semibold hover:bg-[#119655] transition-colors whitespace-nowrap shrink-0"
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
        <section id="modules" className="py-12 px-6">
          <div id="core-features" className="max-w-7xl mx-auto">
            <div className="flex flex-wrap items-end justify-between gap-4 mb-8">
              <div>
                <p className="text-xs font-bold uppercase tracking-wider text-[#119655]">
                  02. Core Features
                </p>
                <h2 className="font-display text-2xl sm:text-3xl font-extrabold text-[#0B3B2D] mt-1.5">
                  Core Features for Routine Access & Golden-Hour Emergencies
                </h2>
              </div>
              <button
                type="button"
                onClick={() => onOpenAuth('patient', 'signin')}
                className="text-sm font-semibold text-[#119655] hover:text-[#0B3B2D] whitespace-nowrap"
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
                        ? 'bg-[#0B3B2D] text-white border border-[#145542]'
                        : 'bg-white text-[#0B3B2D] border border-[#D5E7DD] hover:border-[#119655]'
                    }`}
                  >
                    <div>
                      <div className="flex items-center justify-between gap-3 mb-4">
                        <div
                          className={`w-11 h-11 rounded-xl flex items-center justify-center shrink-0 ${
                            isFeatured
                              ? 'bg-[#119655] text-white'
                              : 'bg-[#E8F6EE] text-[#119655]'
                          }`}
                        >
                          <Icon className="w-5 h-5" />
                        </div>
                        <span
                          className={`text-xs font-medium text-right ${
                            isFeatured ? 'text-[#F2B705] font-semibold' : 'text-slate-500'
                          }`}
                        >
                          {feature.indexLabel}
                        </span>
                      </div>

                      <h3 className="font-display text-xl font-bold">{feature.title}</h3>
                      <p
                        className={`text-xs font-mono font-semibold tabular-nums mt-2 ${
                          isFeatured ? 'text-emerald-200' : 'text-[#119655]'
                        }`}
                      >
                        {feature.liveMetric}
                      </p>
                      <p
                        className={`text-sm mt-2.5 leading-relaxed ${
                          isFeatured ? 'text-emerald-100/90' : 'text-slate-600'
                        }`}
                      >
                        {feature.summary}
                      </p>
                    </div>

                    <div
                      className={`mt-5 pt-4 border-t flex items-center justify-between gap-3 ${
                        isFeatured ? 'border-white/15' : 'border-[#EBF3EF]'
                      }`}
                    >
                      <span
                        className={`text-xs ${
                          isFeatured ? 'text-emerald-200' : 'text-slate-500'
                        }`}
                      >
                        {feature.capabilities}
                      </span>
                      <button
                        type="button"
                        onClick={() => onEnterRole(feature.targetRole, feature.targetTab)}
                        className={`text-xs font-semibold whitespace-nowrap shrink-0 ${
                          isFeatured
                            ? 'text-[#F2B705] hover:underline'
                            : 'text-[#119655] hover:text-[#0B3B2D]'
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
            <div className="mt-5 bg-white border border-[#D5E7DD] rounded-2xl p-5 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
              <div className="flex items-start sm:items-center gap-3.5">
                <div className="w-10 h-10 rounded-xl bg-[#E8F6EE] text-[#119655] flex items-center justify-center shrink-0">
                  <FlaskConical className="w-5 h-5" />
                </div>
                <div>
                  <p className="text-sm font-bold text-[#0B3B2D]">
                    Plus Diagnostic Connect{diagnosticCentres.length > 0 ? ` · ${diagnosticCentres.length} Partner Centres` : ' · Labs & Imaging'}
                  </p>
                  <p className="text-xs text-slate-600 mt-0.5">
                    Search registered lab tests with transparent pricing, book slots, and view uploaded diagnostic reports securely.
                  </p>
                </div>
              </div>
              <div className="flex items-center gap-3 shrink-0">
                <button
                  type="button"
                  onClick={() => onEnterRole('patient', 'diagnostics')}
                  className="text-xs font-semibold text-[#119655] hover:text-[#0B3B2D] whitespace-nowrap"
                >
                  Book Lab Test →
                </button>
                <button
                  type="button"
                  onClick={() => onEnterRole('diagnostic', 'bookings')}
                  className="px-3.5 py-2 rounded-xl bg-[#F4FAF6] border border-[#CFE3D8] text-xs font-semibold text-[#0B3B2D] hover:border-[#119655] whitespace-nowrap"
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
        <section id="how-it-works" className="py-12 px-6 bg-[#F1F7F4] border-y border-[#DCECE3]">
          <div className="max-w-7xl mx-auto">
            <div className="mb-8">
              <p className="text-xs font-bold uppercase tracking-wider text-[#119655]">
                04. How KAIROS Works
              </p>
              <h2 className="font-display text-2xl sm:text-3xl font-extrabold text-[#0B3B2D] mt-1.5">
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
                    className="text-left p-4 rounded-2xl border border-[#D5E7DD] bg-[#FAFDFB] hover:border-[#119655] transition-colors flex flex-col justify-between"
                  >
                    <div className="flex items-center justify-between mb-3">
                      <span className="font-mono text-xs font-bold text-[#119655]">{node.step}</span>
                      <Icon className="w-4 h-4 text-[#0B3B2D]" />
                    </div>
                    <div>
                      <p className="text-sm font-bold text-[#0B3B2D]">{node.title}</p>
                      <p className="text-xs text-slate-600 mt-1 leading-relaxed">{node.desc}</p>
                    </div>
                  </button>
                );
              })}
            </div>

            {/* Side-by-side Smart OPD vs Emergency Process Cards (Matching PDF Page 1 bottom) */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
              <div className="rounded-2xl border border-[#D5E7DD] bg-[#F5FBF8] p-6">
                <p className="text-xs font-bold uppercase tracking-wider text-[#119655] mb-4">
                  How It Works · Smart OPD
                </p>
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs">
                  <div>
                    <span className="font-mono font-bold text-[#0B3B2D]">1.</span>
                    <p className="font-semibold text-[#0B3B2D] mt-1">Pick hospital + slot</p>
                  </div>
                  <div>
                    <span className="font-mono font-bold text-[#0B3B2D]">2.</span>
                    <p className="font-semibold text-[#0B3B2D] mt-1">Verify · QR token</p>
                  </div>
                  <div>
                    <span className="font-mono font-bold text-[#0B3B2D]">3.</span>
                    <p className="font-semibold text-[#0B3B2D] mt-1">Scan · Join live queue</p>
                  </div>
                  <div>
                    <span className="font-mono font-bold text-[#0B3B2D]">4.</span>
                    <p className="font-semibold text-[#0B3B2D] mt-1">Consult · Delay alerts</p>
                  </div>
                </div>
                <p className="mt-4 text-xs text-slate-600">
                  Works with or without the app · SMS / WhatsApp notification templates ready.
                </p>
              </div>

              <div className="rounded-2xl bg-[#0B3B2D] text-white p-6">
                <p className="text-xs font-bold uppercase tracking-wider text-[#F2B705] mb-4">
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
        <section className="py-12 px-6">
          <div className="max-w-7xl mx-auto">
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
              <div className="bg-white border border-[#D5E7DD] rounded-2xl p-6">
                <Lock className="w-5 h-5 text-[#119655] mb-3" />
                <h3 className="font-display text-base font-bold text-[#0B3B2D]">
                  DPDP-Aligned Consent & PII Isolation
                </h3>
                <p className="text-xs text-slate-600 mt-2 leading-relaxed">
                  Role-based access control, split private PII collections in Firestore security rules, explicit revocable patient consent, and immutable audit logs for sensitive clinical actions.
                </p>
              </div>
              <div className="bg-white border border-[#D5E7DD] rounded-2xl p-6">
                <Clock className="w-5 h-5 text-[#119655] mb-3" />
                <h3 className="font-display text-base font-bold text-[#0B3B2D]">
                  Clinical Judgment & Safety Override
                </h3>
                <p className="text-xs text-slate-600 mt-2 leading-relaxed">
                  KAIROS never delays emergency care waiting for digital confirmation and never auto-diagnoses patients. Verified capacity timestamps and manual emergency override protect every handover.
                </p>
              </div>
              <div className="bg-white border border-[#D5E7DD] rounded-2xl p-6">
                <MessageSquare className="w-5 h-5 text-[#119655] mb-3" />
                <h3 className="font-display text-base font-bold text-[#0B3B2D]">
                  HL7 FHIR R4 & ABDM-Ready Architecture
                </h3>
                <p className="text-xs text-slate-600 mt-2 leading-relaxed">
                  Structured referral bundles export cleanly in HL7 FHIR R4 format, designed for HMIS & future ABDM onboarding without claiming live unverified partnerships.
                </p>
              </div>
            </div>

            {/* Dedicated Role Sign-In Bar */}
            <div className="mt-8 bg-white border border-[#D5E7DD] rounded-2xl p-6 flex flex-col lg:flex-row lg:items-center justify-between gap-4">
              <div>
                <h3 className="font-display text-lg font-bold text-[#0B3B2D]">
                  Sign in to your KAIROS role portal
                </h3>
                <p className="text-xs text-slate-600 mt-0.5">
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
                    className="px-3.5 py-2 rounded-xl border border-[#CFE3D8] bg-[#FAFDFB] text-xs font-semibold text-[#0B3B2D] hover:bg-[#0B3B2D] hover:text-white hover:border-[#0B3B2D] transition-colors whitespace-nowrap"
                  >
                    {label}
                  </button>
                ))}
              </div>
            </div>
          </div>
        </section>
      </main>

      {/* QUIET FOOTER */}
      <footer className="bg-white border-t border-[#DCECE3] py-8 px-6">
        <div className="max-w-7xl mx-auto flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 text-xs text-slate-600">
          <div className="flex items-center gap-3">
            <img
              src="/assets/aistudio/Kairos-Logo-Icon_f4a33af1.png"
              alt="KAIROS"
              className="w-6 h-6 object-contain"
              referrerPolicy="no-referrer"
            />
            <span>
              <strong className="text-[#0B3B2D]">KAIROS</strong> · The Golden Hour Rescue Platform · Right Hospital. Right Resources. Right Now.
            </span>
          </div>
          <div className="flex flex-wrap items-center gap-3 text-slate-500">
            <span>Team Dr. Debug · Think Tank 2026 · CMRIT Bengaluru</span>
            <span aria-hidden="true">·</span>
            <span>DPDP-Aligned · HL7 FHIR R4 Ready</span>
          </div>
        </div>
      </footer>
    </div>
  );
};
