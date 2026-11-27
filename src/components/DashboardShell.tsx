import React, { useState } from 'react';
import {
  Bell,
  Home,
  LogOut,
  Menu,
  Plus,
  Search,
  Sparkles,
  Wifi,
  WifiOff,
  X,
} from 'lucide-react';
import { useKairos } from '../context/KairosContext';
import type { UserRole } from '../types/kairos';
import type { AssistantTab } from './KairosAssistantModal';
import { ThemeToggle } from './ThemeToggle';

export interface NavItem {
  id: string;
  label: string;
  icon: React.FC<{ className?: string }>;
  badge?: number;
}

interface DashboardShellProps {
  navItems: NavItem[];
  activeTab: string;
  onTabChange: (tabId: string) => void;
  primaryCtaLabel: string;
  onPrimaryCta: () => void;
  searchQuery: string;
  onSearchChange: (q: string) => void;
  onGoHome: () => void;
  onOpenAssistant: (tab?: AssistantTab) => void;
  onSwitchPortalSignIn: (role: UserRole) => void;
  children: React.ReactNode;
}

export const DashboardShell: React.FC<DashboardShellProps> = ({
  navItems,
  activeTab,
  onTabChange,
  primaryCtaLabel,
  onPrimaryCta,
  searchQuery,
  onSearchChange,
  onGoHome,
  onOpenAssistant,
  onSwitchPortalSignIn,
  children,
}) => {
  const {
    currentUser,
    notifications,
    markAllNotificationsRead,
    isOfflineSimulated,
    setOfflineSimulated,
    offlineReferralQueue,
    syncOfflineReferralsNow,
    logout,
  } = useKairos();

  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [notifOpen, setNotifOpen] = useState(false);

  const roleNotifications = notifications.filter(
    (n) => !currentUser || n.targetRoles.includes(currentUser.role)
  );
  const unreadCount = roleNotifications.filter((n) => !n.read).length;

  const initials = (currentUser?.displayName || 'KU')
    .split(' ')
    .filter(Boolean)
    .slice(0, 2)
    .map((s) => s[0]?.toUpperCase())
    .join('');

  const greetingName = currentUser?.displayName || 'KAIROS User';

  const sidebarContent = (
    <div className="flex flex-col h-full bg-[#0B3B2D] dark:bg-[#071A14] text-white border-r border-transparent dark:border-kairos-border">
      {/* Brand Lockup */}
      <div className="px-5 pt-5 pb-4 flex items-center justify-between">
        <button
          type="button"
          onClick={onGoHome}
          className="flex items-center gap-2.5 text-left group"
        >
          <img
            src="/assets/aistudio/Kairos-Logo-Icon_f4a33af1.png"
            alt="KAIROS"
            className="w-8 h-8 rounded-lg bg-white p-0.5 object-contain shrink-0"
            referrerPolicy="no-referrer"
          />
          <div>
            <p className="font-display text-base font-extrabold tracking-tight leading-none">
              KAIROS
            </p>
            <p className="text-[11px] text-emerald-200/80 mt-0.5">Golden Hour Rescue</p>
          </div>
        </button>
        <button
          type="button"
          onClick={() => setMobileMenuOpen(false)}
          aria-label="Close navigation menu"
          className="lg:hidden p-1.5 rounded-lg text-emerald-100 hover:bg-white/10"
        >
          <X className="w-4 h-4" />
        </button>
      </div>

      {/* Primary Sidebar CTA */}
      <div className="px-4 pb-4">
        <button
          type="button"
          onClick={() => {
            onPrimaryCta();
            setMobileMenuOpen(false);
          }}
          className="w-full inline-flex items-center justify-center gap-2 py-2.5 px-4 rounded-xl bg-kairos-emerald hover:bg-kairos-emerald-hover text-white text-sm font-semibold transition-colors whitespace-nowrap"
        >
          <Plus className="w-4 h-4 shrink-0" />
          {primaryCtaLabel}
        </button>
      </div>

      {/* Navigation List */}
      <nav aria-label="Workspace navigation" className="flex-1 px-3 space-y-1 overflow-y-auto">
        <button
          type="button"
          onClick={onGoHome}
          className="w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium text-emerald-100/80 hover:bg-white/10 hover:text-white transition-colors"
        >
          <Home className="w-4 h-4 shrink-0" />
          <span>Landing Home</span>
        </button>

        {navItems.map((item) => {
          const Icon = item.icon;
          const active = activeTab === item.id;
          return (
            <button
              key={item.id}
              type="button"
              onClick={() => {
                onTabChange(item.id);
                setMobileMenuOpen(false);
              }}
              className={`w-full flex items-center justify-between gap-2 px-3 py-2.5 rounded-xl text-sm font-medium transition-colors ${
                active
                  ? 'bg-[#175542] dark:bg-kairos-forest text-white font-semibold'
                  : 'text-emerald-100/80 hover:bg-white/10 hover:text-white'
              }`}
            >
              <span className="flex items-center gap-3 min-w-0">
                <Icon className="w-4 h-4 shrink-0" />
                <span className="truncate">{item.label}</span>
              </span>
              {typeof item.badge === 'number' && item.badge > 0 && (
                <span className="px-2 py-0.5 rounded-md bg-red-500 text-white text-[11px] font-mono font-bold tabular-nums shrink-0">
                  {item.badge}
                </span>
              )}
            </button>
          );
        })}
      </nav>

      {/* Kairos Assistant Card */}
      <div className="px-4 py-3">
        <div className="rounded-2xl bg-[#F4FAF6] dark:bg-[#0D251D] text-[#0B3B2D] dark:text-[#E6F4EC] border border-transparent dark:border-kairos-border p-3.5 overflow-hidden">
          <div className="rounded-xl overflow-hidden bg-white/80 dark:bg-[#081A14] mb-2.5">
            <img
              src="/assets/aistudio/kairos-assistant-doctor.png"
              alt="Kairos Assistant Doctor"
              className="w-full h-24 object-cover object-top"
              referrerPolicy="no-referrer"
            />
          </div>
          <div className="flex items-center gap-1.5">
            <Sparkles className="w-3.5 h-3.5 text-kairos-emerald-ink shrink-0" />
            <p className="text-xs font-bold">Kairos Assistant</p>
          </div>
          <p className="text-[11px] text-slate-600 dark:text-kairos-muted mt-1 leading-relaxed">
            AI chat, live voice, mic transcription &amp; Google Maps grounding.
          </p>
          <button
            type="button"
            onClick={() => {
              onOpenAssistant('chat');
              setMobileMenuOpen(false);
            }}
            className="mt-2.5 w-full py-2 px-3 rounded-xl bg-kairos-forest hover:bg-kairos-emerald text-white text-xs font-semibold transition-colors"
          >
            Open AI Chat
          </button>
          <div className="mt-1.5 grid grid-cols-3 gap-1">
            {(
              [
                ['voice', 'Voice'],
                ['transcribe', 'Mic'],
                ['maps', 'Maps'],
              ] as [AssistantTab, string][]
            ).map(([tabId, label]) => (
              <button
                key={tabId}
                type="button"
                onClick={() => {
                  onOpenAssistant(tabId);
                  setMobileMenuOpen(false);
                }}
                className="py-1.5 px-1.5 rounded-lg bg-[#E1F3E9] dark:bg-[#133629] hover:bg-[#CFEAD9] dark:hover:bg-[#1B4A38] text-[#0B3B2D] dark:text-[#E6F4EC] text-[11px] font-semibold transition-colors"
              >
                {label}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Switch Portal Sign-In */}
      <div className="px-4 pb-3">
        <label htmlFor="portal-signin-switcher" className="block text-[10px] uppercase tracking-wider text-emerald-300/80 font-semibold mb-1">
          Sign In to Another Portal
        </label>
        <select
          id="portal-signin-switcher"
          value={currentUser?.role ?? 'patient'}
          onChange={(e) => onSwitchPortalSignIn(e.target.value as UserRole)}
          className="w-full rounded-xl bg-kairos-forest-deep border border-[#1B604C] px-3 py-2 text-xs font-medium text-white focus:outline-none focus:ring-2 focus:ring-kairos-emerald"
        >
          <option value="patient">Patient Portal</option>
          <option value="doctor">Referring Doctor</option>
          <option value="hospital">Receiving Hospital</option>
          <option value="ambulance">Ambulance Team</option>
          <option value="diagnostic">Diagnostic Centre</option>
          <option value="admin">Administrator</option>
        </select>
      </div>

      {/* Active Profile Footer */}
      <div className="px-4 py-3.5 border-t border-white/10 flex items-center justify-between gap-2">
        <div className="flex items-center gap-2.5 min-w-0">
          <div className="w-8 h-8 rounded-full bg-[#175542] text-emerald-100 text-xs font-bold flex items-center justify-center shrink-0">
            {initials}
          </div>
          <div className="min-w-0">
            <p className="text-xs font-semibold truncate">{greetingName}</p>
            <p className="text-[11px] text-emerald-200/80 truncate">
              {currentUser?.facilityName || 'FHIR R4 · ABDM Ready'}
            </p>
          </div>
        </div>
        <button
          type="button"
          onClick={logout}
          aria-label="Sign out"
          title="Sign out"
          className="p-2 rounded-lg text-emerald-200 hover:bg-white/10 hover:text-white shrink-0"
        >
          <LogOut className="w-4 h-4" />
        </button>
      </div>
    </div>
  );

  return (
    <div className="min-h-screen bg-kairos-mint text-kairos-forest-ink flex transition-colors duration-200">
      {/* Desktop Sidebar */}
      <aside className="hidden lg:block w-64 shrink-0 sticky top-0 h-screen">
        {sidebarContent}
      </aside>

      {/* Mobile Drawer */}
      {mobileMenuOpen && (
        <div className="fixed inset-0 z-50 lg:hidden flex">
          <div className="w-72 max-w-[85vw] h-full shadow-2xl">{sidebarContent}</div>
          <button
            type="button"
            aria-label="Close menu backdrop"
            className="flex-1 bg-black/55"
            onClick={() => setMobileMenuOpen(false)}
          />
        </div>
      )}

      {/* Main Content Column */}
      <div className="flex-1 min-w-0 flex flex-col">
        {/* Top Workspace Header */}
        <header className="sticky top-0 z-30 bg-kairos-mint/95 backdrop-blur-md border-b border-kairos-border px-4 sm:px-6 py-3.5">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-center gap-3 min-w-0">
              <button
                type="button"
                onClick={() => setMobileMenuOpen(true)}
                aria-label="Open navigation menu"
                className="lg:hidden p-2 rounded-xl bg-kairos-surface border border-kairos-border text-kairos-forest-ink"
              >
                <Menu className="w-4 h-4" />
              </button>
              <div className="min-w-0">
                <h1 className="font-display text-lg sm:text-xl font-extrabold text-kairos-forest-ink truncate">
                  Welcome, {greetingName}
                </h1>
                <p className="text-xs text-kairos-muted truncate">
                  Live coordination for OPD &amp; Emergency · Signed in as{' '}
                  <span className="capitalize font-semibold text-kairos-forest-ink">{currentUser?.role}</span>
                </p>
              </div>
            </div>

            <div className="flex items-center gap-2.5 flex-wrap">
              {/* Global Search */}
              <div className="relative">
                <Search className="w-3.5 h-3.5 text-kairos-muted absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
                <input
                  type="search"
                  value={searchQuery}
                  onChange={(e) => onSearchChange(e.target.value)}
                  placeholder="Search patient, bed, hospital..."
                  aria-label="Search patient, bed, or hospital"
                  className="w-48 sm:w-64 pl-8 pr-3 py-2 rounded-xl bg-kairos-surface border border-kairos-border text-xs text-kairos-forest-ink placeholder:text-kairos-muted/70 focus:outline-none focus:ring-2 focus:ring-kairos-emerald"
                />
              </div>

              {/* Offline-First Connectivity Toggle */}
              <button
                type="button"
                onClick={() => {
                  if (isOfflineSimulated) {
                    syncOfflineReferralsNow();
                  } else {
                    setOfflineSimulated(true);
                  }
                }}
                className={`inline-flex items-center gap-1.5 px-3 py-2 rounded-xl border text-xs font-semibold transition-colors whitespace-nowrap ${
                  isOfflineSimulated
                    ? 'bg-amber-50 dark:bg-amber-950/50 border-amber-300 dark:border-amber-700 text-amber-900 dark:text-amber-200'
                    : 'bg-kairos-surface border-kairos-border text-kairos-forest-ink hover:border-kairos-emerald'
                }`}
                title="Simulate weak rural connectivity for offline-first referral queue"
              >
                {isOfflineSimulated ? (
                  <WifiOff className="w-3.5 h-3.5 text-amber-700 dark:text-amber-400" />
                ) : (
                  <Wifi className="w-3.5 h-3.5 text-kairos-emerald-ink" />
                )}
                {isOfflineSimulated
                  ? `Offline (${offlineReferralQueue.length} queued)`
                  : 'Online Sync'}
              </button>

              {/* Theme Toggle */}
              <ThemeToggle />

              {/* Notifications Popover */}
              <div className="relative">
                <button
                  type="button"
                  onClick={() => setNotifOpen((o) => !o)}
                  aria-label={`Notifications (${unreadCount} unread)`}
                  className="relative p-2 rounded-xl bg-kairos-surface border border-kairos-border text-kairos-forest-ink hover:border-kairos-emerald"
                >
                  <Bell className="w-4 h-4" />
                  {unreadCount > 0 && (
                    <span className="absolute -top-1 -right-1 w-4 h-4 rounded-full bg-red-600 text-white text-[10px] font-mono font-bold flex items-center justify-center">
                      {unreadCount > 9 ? '9+' : unreadCount}
                    </span>
                  )}
                </button>

                {notifOpen && (
                  <div className="absolute right-0 mt-2 w-80 sm:w-96 bg-kairos-surface border border-kairos-border rounded-2xl shadow-xl z-50 overflow-hidden">
                    <div className="px-4 py-3 border-b border-kairos-border-subtle flex items-center justify-between">
                      <span className="text-xs font-bold text-kairos-forest-ink">
                        Coordination Alerts ({roleNotifications.length})
                      </span>
                      <button
                        type="button"
                        onClick={markAllNotificationsRead}
                        className="text-[11px] font-semibold text-kairos-emerald-ink hover:underline"
                      >
                        Mark all read
                      </button>
                    </div>
                    <div className="max-h-80 overflow-y-auto divide-y divide-kairos-border-subtle">
                      {roleNotifications.length === 0 ? (
                        <p className="p-4 text-xs text-kairos-muted">No notifications yet.</p>
                      ) : (
                        roleNotifications.slice(0, 12).map((n) => (
                          <div
                            key={n.id}
                            className={`p-3.5 text-xs ${n.read ? 'bg-kairos-surface' : 'bg-kairos-mint-soft/50'}`}
                          >
                            <div className="flex items-center justify-between gap-2">
                              <span
                                className={`font-semibold ${
                                  n.severity === 'critical'
                                    ? 'text-red-700 dark:text-red-400'
                                    : n.severity === 'warning'
                                      ? 'text-amber-800 dark:text-amber-300'
                                      : 'text-kairos-forest-ink'
                                }`}
                              >
                                {n.title}
                              </span>
                              <span className="text-[10px] text-kairos-muted shrink-0">{n.channel}</span>
                            </div>
                            <p className="text-kairos-muted mt-1 leading-relaxed">{n.message}</p>
                          </div>
                        ))
                      )}
                    </div>
                  </div>
                )}
              </div>
            </div>
          </div>
        </header>

        {/* Main Workspace Viewport */}
        <main className="flex-1 p-4 sm:p-6 max-w-[1440px] w-full mx-auto">
          {children}
        </main>
      </div>
    </div>
  );
};
