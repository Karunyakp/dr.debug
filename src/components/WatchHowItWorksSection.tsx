import React, { useRef, useState } from 'react';
import { ArrowRight, Pause, Play, RotateCcw } from 'lucide-react';

interface VideoChapter {
  id: string;
  timeSec: number;
  timeLabel: string;
  title: string;
  caption: string;
}

const VIDEO_CHAPTERS: VideoChapter[] = [
  {
    id: 'intro',
    timeSec: 0,
    timeLabel: '00:00',
    title: 'Accept Before You Move',
    caption: 'Why confirming ICU capacity before dispatch prevents blind emergency transfers.',
  },
  {
    id: 'isbar',
    timeSec: 5.8,
    timeLabel: '00:06',
    title: '01. Structured ISBAR & Vitals',
    caption: 'Referring doctors log 5 vitals, symptoms, and required facilities in seconds.',
  },
  {
    id: 'matching',
    timeSec: 11.8,
    timeLabel: '00:12',
    title: '02. Transparent Hospital Matching',
    caption: 'Ranked by verified bed timestamps, specialty, distance, and 5-min escalation.',
  },
  {
    id: 'bed-hold',
    timeSec: 17.8,
    timeLabel: '00:18',
    title: '03. Doctor Accepts & Bed Soft-Lock',
    caption: 'Receiving ED reserves Bed 12A on a countdown timer—zero double-promised beds.',
  },
  {
    id: 'ambulance',
    timeSec: 23.8,
    timeLabel: '00:24',
    title: '04. Tracked Ambulance & Handover',
    caption: 'Unit KA-01 streams live vitals & GPS ETA to a prepared receiving emergency team.',
  },
];

interface WatchHowItWorksSectionProps {
  onLaunchEmergency: () => void;
}

export const WatchHowItWorksSection: React.FC<WatchHowItWorksSectionProps> = ({
  onLaunchEmergency,
}) => {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [hasStarted, setHasStarted] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);

  const activeChapterIdx = VIDEO_CHAPTERS.reduce((acc, chapter, idx) => {
    return currentTime >= chapter.timeSec - 0.25 ? idx : acc;
  }, 0);

  const handleTogglePlay = () => {
    const vid = videoRef.current;
    if (!vid) return;
    if (vid.paused || vid.ended) {
      vid.play().catch(() => {
        // Native controls remain available if browser blocks programmatic play
      });
    } else {
      vid.pause();
    }
  };

  const handleJumpToChapter = (timeSec: number) => {
    const vid = videoRef.current;
    if (!vid) return;
    vid.currentTime = timeSec;
    setCurrentTime(timeSec);
    setHasStarted(true);
    vid.play().catch(() => {
      // Fallback: user can press native play button
    });
  };

  const handleReplay = () => {
    handleJumpToChapter(0);
  };

  return (
    <section
      id="watch-how-it-works"
      className="py-10 px-5 sm:px-6 bg-kairos-surface border-t border-kairos-border"
    >
      <div className="max-w-7xl mx-auto">
        <div className="flex flex-wrap items-end justify-between gap-4 mb-6">
          <div className="max-w-2xl">
            <p className="text-[11px] font-bold uppercase tracking-wider text-kairos-emerald-ink">
              03. Watch How It Works
            </p>
            <h2 className="font-display text-xl sm:text-2xl font-extrabold text-kairos-forest-ink mt-1">
              Watch How KAIROS Coordinates a Golden-Hour Rescue
            </h2>
            <p className="text-xs sm:text-sm text-kairos-muted mt-1.5">
              A 30-second visual walkthrough from rural ISBAR referral to verified ICU bed hold and tracked ambulance handover.
            </p>
          </div>
          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={handleTogglePlay}
              className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl bg-kairos-forest hover:bg-kairos-emerald text-white text-xs font-semibold transition-colors whitespace-nowrap"
            >
              {isPlaying ? <Pause className="w-3.5 h-3.5" /> : <Play className="w-3.5 h-3.5" />}
              {isPlaying ? 'Pause Overview' : 'Play 30s Overview'}
            </button>
            {hasStarted && (
              <button
                type="button"
                onClick={handleReplay}
                aria-label="Replay video from start"
                className="inline-flex items-center gap-1.5 px-3 py-2.5 rounded-xl border border-kairos-border bg-kairos-surface-subtle text-kairos-forest-ink text-xs font-semibold hover:border-kairos-emerald transition-colors whitespace-nowrap"
              >
                <RotateCcw className="w-3.5 h-3.5" />
                Replay
              </button>
            )}
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-stretch">
          {/* Primary 16:9 HTML5 Embedded Video Player */}
          <div className="lg:col-span-8 flex flex-col">
            <div className="relative rounded-2xl overflow-hidden bg-[#07261D] border border-[#145542] shadow-[0_14px_34px_rgba(11,59,45,0.12)] dark:shadow-[0_14px_34px_rgba(0,0,0,0.45)] aspect-video w-full">
              <video
                ref={videoRef}
                className="w-full h-full object-cover"
                controls
                playsInline
                preload="metadata"
                poster="/assets/kairos-video-poster.png"
                onPlay={() => {
                  setIsPlaying(true);
                  setHasStarted(true);
                }}
                onPause={() => setIsPlaying(false)}
                onEnded={() => setIsPlaying(false)}
                onTimeUpdate={(e) => setCurrentTime(e.currentTarget.currentTime)}
              >
                <source src="/assets/kairos-how-it-works.mp4" type="video/mp4" />
                <track
                  kind="captions"
                  srcLang="en"
                  label="English Captions"
                  src="/assets/kairos-how-it-works.vtt"
                  default
                />
                Your browser does not support HTML5 video playback.
              </video>

              {!hasStarted && (
                <button
                  type="button"
                  onClick={handleTogglePlay}
                  aria-label="Play KAIROS emergency coordination overview video"
                  className="absolute inset-0 bg-[#0B3B2D]/25 hover:bg-[#0B3B2D]/15 transition-colors flex items-center justify-center group"
                >
                  <span className="w-16 h-16 sm:w-20 sm:h-20 rounded-full bg-kairos-emerald group-hover:bg-kairos-emerald-hover text-white flex items-center justify-center shadow-2xl ring-4 ring-white/30 transition-transform group-hover:scale-105">
                    <Play className="w-7 h-7 sm:w-8 sm:h-8 ml-1 fill-white" />
                  </span>
                </button>
              )}
            </div>

            <div className="mt-3 flex flex-wrap items-center justify-between gap-2 text-xs text-kairos-muted">
              <span>
                HD 720p · Captions included (CC) · Duration <strong className="font-mono tabular-nums text-kairos-forest-ink">00:30</strong>
              </span>
              <span>Overview walkthrough of the KAIROS emergency workflow</span>
            </div>
          </div>

          {/* Interactive Chapter Jump List */}
          <div className="lg:col-span-4 bg-kairos-surface-subtle border border-kairos-border rounded-2xl p-5 flex flex-col justify-between">
            <div>
              <div className="flex items-center justify-between mb-3">
                <h3 className="font-display text-sm font-bold text-kairos-forest-ink">
                  Workflow Chapters
                </h3>
                <span className="font-mono text-[11px] font-semibold text-kairos-emerald-ink tabular-nums">
                  Click to jump
                </span>
              </div>

              <div className="space-y-2">
                {VIDEO_CHAPTERS.map((chapter, idx) => {
                  const active = idx === activeChapterIdx && hasStarted;
                  return (
                    <button
                      key={chapter.id}
                      type="button"
                      onClick={() => handleJumpToChapter(chapter.timeSec)}
                      className={`w-full text-left p-3 rounded-xl border transition-colors ${
                        active
                          ? 'bg-kairos-forest text-white border-kairos-forest'
                          : 'bg-kairos-surface text-kairos-forest-ink border-kairos-border hover:border-kairos-emerald'
                      }`}
                    >
                      <div className="flex items-center justify-between gap-2">
                        <span className="text-xs font-bold">{chapter.title}</span>
                        <span
                          className={`font-mono text-[11px] font-semibold tabular-nums shrink-0 ${
                            active ? 'text-kairos-gold' : 'text-kairos-emerald-ink'
                          }`}
                        >
                          {chapter.timeLabel}
                        </span>
                      </div>
                      <p
                        className={`text-[11px] mt-1 leading-relaxed ${
                          active ? 'text-emerald-100/90' : 'text-kairos-muted'
                        }`}
                      >
                        {chapter.caption}
                      </p>
                    </button>
                  );
                })}
              </div>
            </div>

            <div className="mt-4 pt-4 border-t border-kairos-border">
              <button
                type="button"
                onClick={onLaunchEmergency}
                className="w-full inline-flex items-center justify-center gap-2 py-2.5 px-4 rounded-xl bg-kairos-emerald hover:bg-kairos-emerald-hover text-white text-xs font-semibold transition-colors"
              >
                Try Live Referral Workflow
                <ArrowRight className="w-3.5 h-3.5" />
              </button>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
};
