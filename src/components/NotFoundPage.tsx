import React from 'react';
import { ArrowRight, Home } from 'lucide-react';
import { ThemeToggle } from './ThemeToggle';

interface NotFoundPageProps {
  onGoHome: () => void;
  onOpenPlatform: () => void;
}

export const NotFoundPage: React.FC<NotFoundPageProps> = ({
  onGoHome,
  onOpenPlatform,
}) => {
  return (
    <div className="min-h-screen bg-kairos-mint text-kairos-forest-ink flex flex-col transition-colors duration-200">
      {/* Top Bar */}
      <header className="sticky top-0 z-40 bg-kairos-surface/95 backdrop-blur-md border-b border-kairos-border">
        <div className="max-w-7xl mx-auto px-6 h-[72px] flex items-center justify-between gap-8">
          <button
            type="button"
            onClick={onGoHome}
            className="flex items-center gap-2.5 whitespace-nowrap shrink-0 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-kairos-emerald rounded-lg"
          >
            <img
              src="/assets/aistudio/Kairos-Logo-Icon_f4a33af1.png"
              alt="KAIROS"
              className="w-9 h-9 object-contain"
              referrerPolicy="no-referrer"
            />
            <span className="font-display text-2xl font-extrabold tracking-tight text-kairos-forest-ink">
              KAIROS
            </span>
          </button>

          <nav
            aria-label="Primary navigation"
            className="hidden md:flex items-center gap-8 text-[15px] font-medium text-kairos-forest-ink/85"
          >
            <button
              type="button"
              onClick={onGoHome}
              className="hover:text-kairos-emerald-ink transition-colors whitespace-nowrap shrink-0"
            >
              OPD
            </button>
            <button
              type="button"
              onClick={onGoHome}
              className="hover:text-kairos-emerald-ink transition-colors whitespace-nowrap shrink-0"
            >
              Emergency
            </button>
            <button
              type="button"
              onClick={onGoHome}
              className="hover:text-kairos-emerald-ink transition-colors whitespace-nowrap shrink-0"
            >
              Hospitals
            </button>
            <button
              type="button"
              onClick={onGoHome}
              className="hover:text-kairos-emerald-ink transition-colors whitespace-nowrap shrink-0"
            >
              How it works
            </button>
          </nav>

          <div className="flex items-center gap-2.5 shrink-0">
            <ThemeToggle />
            <button
              type="button"
              onClick={onOpenPlatform}
              className="inline-flex items-center gap-2 px-5 py-2.5 rounded-full bg-kairos-emerald hover:bg-kairos-emerald-hover text-white text-sm font-semibold transition-colors whitespace-nowrap shrink-0 shadow-xs"
            >
              Open Platform
              <ArrowRight className="w-4 h-4" />
            </button>
          </div>
        </div>
      </header>

      {/* 404 Center Stage */}
      <main className="flex-1 flex flex-col items-center justify-center px-6 py-12 text-center">
        <div className="max-w-2xl w-full flex flex-col items-center">
          <div className="w-full max-w-xl rounded-2xl overflow-hidden border border-kairos-border bg-white shadow-sm dark:brightness-90 dark:contrast-105">
            <img
              src="/assets/aistudio/ERROR_PG_d0b96091.jpeg"
              alt="404 Page Not Found — KAIROS"
              className="w-full h-auto object-cover"
              referrerPolicy="no-referrer"
            />
          </div>

          <h1 className="font-display text-3xl sm:text-4xl font-extrabold tracking-tight text-kairos-forest-ink mt-7">
            This Page Does <span className="text-kairos-emerald-ink">Not Exist</span>
          </h1>
          <p className="text-sm sm:text-base text-kairos-muted mt-3 max-w-md leading-relaxed">
            Sorry, the page you are looking for could not be found. Maybe an accident happened, or the link was incorrect.
          </p>

          <button
            type="button"
            onClick={onGoHome}
            className="mt-7 inline-flex items-center gap-2 px-7 py-3 rounded-full bg-kairos-forest hover:bg-kairos-emerald text-white text-sm font-bold transition-colors shadow-sm"
          >
            <Home className="w-4 h-4" />
            Go to Homepage
          </button>
        </div>
      </main>
    </div>
  );
};
