import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  AudioLines,
  Check,
  ClipboardCopy,
  ExternalLink,
  FileAudio,
  Loader2,
  MapPin,
  MessageSquare,
  Mic,
  MicOff,
  Navigation,
  PhoneOff,
  Send,
  ShieldAlert,
  Sparkles,
  Square,
  Trash2,
  Upload,
  Volume2,
  X,
} from 'lucide-react';
import { useKairos } from '../context/KairosContext';
import {
  blobToBase64,
  computeRmsLevel,
  float32ToPcm16Base64,
  pcm24kBase64ToAudioBuffer,
  pickSupportedAudioMimeType,
} from '../utils/audioUtils';

export type AssistantTab = 'chat' | 'voice' | 'transcribe' | 'maps' | 'isbar';

interface KairosAssistantModalProps {
  open: boolean;
  onClose: () => void;
  initialTab?: AssistantTab;
  initialNotes?: string;
  onApplySummary?: (summary: string) => void;
}

interface ChatMessage {
  id: string;
  role: 'user' | 'model';
  text: string;
  model?: string;
  timestamp: string;
}

interface LiveTranscriptItem {
  id: string;
  speaker: 'user' | 'model';
  text: string;
}

interface GroundedMapPlace {
  title: string;
  uri: string;
  placeId?: string;
  reviewSnippets: Array<{ text: string; uri?: string }>;
}

const VOICE_OPTIONS = ['Zephyr', 'Kore', 'Puck', 'Charon', 'Fenrir'] as const;

const DEFAULT_COORDS = {
  latitude: 12.9698,
  longitude: 77.7136,
  label: 'Brookefield / Whitefield, Bengaluru (Default)',
};

/**
 * Safe lightweight Markdown renderer (no raw HTML injection).
 * Renders headings, bullet lists, bold inline segments, and links cleanly.
 */
function renderSafeMarkdown(text: string): React.ReactNode {
  const lines = text.split('\n');
  return (
    <div className="space-y-1.5 text-xs leading-relaxed text-kairos-forest-ink">
      {lines.map((rawLine, idx) => {
        const line = rawLine.trim();
        if (!line) return <div key={idx} className="h-1" />;

        const renderInline = (content: string) => {
          const parts = content.split(/(\*\*[^*]+\*\*|\[[^\]]+\]\(https?:\/\/[^)]+\))/g);
          return parts.map((part, pIdx) => {
            if (part.startsWith('**') && part.endsWith('**')) {
              return (
                <strong key={pIdx} className="font-semibold text-kairos-forest-ink">
                  {part.slice(2, -2)}
                </strong>
              );
            }
            const linkMatch = part.match(/^\[([^\]]+)\]\((https?:\/\/[^)]+)\)$/);
            if (linkMatch) {
              return (
                <a
                  key={pIdx}
                  href={linkMatch[2]}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-kairos-emerald-ink font-semibold underline hover:text-kairos-forest-ink"
                >
                  {linkMatch[1]}
                </a>
              );
            }
            return <React.Fragment key={pIdx}>{part}</React.Fragment>;
          });
        };

        if (line.startsWith('### ') || line.startsWith('## ') || line.startsWith('# ')) {
          return (
            <p key={idx} className="font-bold text-kairos-forest-ink pt-1">
              {renderInline(line.replace(/^#{1,3}\s+/, ''))}
            </p>
          );
        }
        if (line.startsWith('- ') || line.startsWith('* ')) {
          return (
            <div key={idx} className="flex items-start gap-2 pl-1">
              <span className="text-kairos-emerald-ink font-bold">•</span>
              <span className="flex-1">{renderInline(line.slice(2))}</span>
            </div>
          );
        }
        return <p key={idx}>{renderInline(line)}</p>;
      })}
    </div>
  );
}

export const KairosAssistantModal: React.FC<KairosAssistantModalProps> = ({
  open,
  onClose,
  initialTab = 'chat',
  initialNotes = '',
  onApplySummary,
}) => {
  const { currentUser, hospitals, referrals, appointments } = useKairos();

  const [activeTab, setActiveTab] = useState<AssistantTab>(initialTab);

  // Sync tab whenever modal opens with a specific initialTab
  useEffect(() => {
    if (open) {
      setActiveTab(initialTab);
      if (initialNotes) {
        setIsbarNotes(initialNotes);
      }
    }
  }, [open, initialTab, initialNotes]);

  const roleKey = currentUser?.role ?? 'visitor';

  const workspaceSnapshot = useMemo(() => {
    const hospLine = hospitals
      .map(
        (h) =>
          `${h.name} (${h.area}): ICU ${h.icuAvailable}/${h.icuTotal}, General ${h.generalAvailable}/${h.generalTotal}, ${h.acceptingEmergencies ? 'Accepting' : 'Diversion'}`
      )
      .join('; ');
    const refLine = referrals
      .slice(0, 4)
      .map(
        (r) =>
          `${r.referralId} (${r.category}, ${r.urgency}, status=${r.status}, target=${r.targetHospitalName})`
      )
      .join('; ');
    return `Hospitals: ${hospLine}. Active Referrals (${referrals.length}): ${refLine}. Active OPD Appointments: ${appointments.length}.`;
  }, [appointments.length, hospitals, referrals]);

  // -------------------------------------------------------------------------
  // 1. MULTI-TURN GEMINI CHAT STATE
  // -------------------------------------------------------------------------
  const [chatMode, setChatMode] = useState<'general' | 'deep' | 'fast'>('general');
  const [chatMessages, setChatMessages] = useState<ChatMessage[]>([
    {
      id: 'welcome-msg',
      role: 'model',
      model: 'gemini-4-hydrogen',
      timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
      text: 'Hello! I am KAIROS Assistant. Ask me about live ICU bed readiness, Smart OPD queue management, ISBAR referral checklists, or golden-hour coordination workflows. You can also dictate using the microphone button.',
    },
  ]);
  const [chatInput, setChatInput] = useState('');
  const [chatLoading, setChatLoading] = useState(false);
  const [chatError, setChatError] = useState<string | null>(null);
  const [chatDictating, setChatDictating] = useState(false);
  const [chatTranscribing, setChatTranscribing] = useState(false);
  const chatScrollRef = useRef<HTMLDivElement | null>(null);
  const chatRecorderRef = useRef<MediaRecorder | null>(null);
  const chatAudioChunksRef = useRef<Blob[]>([]);

  useEffect(() => {
    if (chatScrollRef.current) {
      chatScrollRef.current.scrollTop = chatScrollRef.current.scrollHeight;
    }
  }, [chatMessages, chatLoading]);

  const sendChatMessage = async (textOverride?: string) => {
    const trimmed = (textOverride ?? chatInput).trim();
    if (!trimmed || chatLoading) return;

    const userMsg: ChatMessage = {
      id: `u-${Date.now()}`,
      role: 'user',
      text: trimmed,
      timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
    };

    const priorHistory = chatMessages
      .filter((m) => m.id !== 'welcome-msg')
      .map((m) => ({ role: m.role, text: m.text }));

    setChatMessages((prev) => [...prev, userMsg]);
    if (!textOverride) setChatInput('');
    setChatLoading(true);
    setChatError(null);

    try {
      const response = await fetch('/api/ai/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          message: trimmed,
          history: priorHistory,
          mode: chatMode,
          role: roleKey,
          contextSummary: workspaceSnapshot,
        }),
      });
      const data = (await response.json()) as {
        reply?: string;
        model?: string;
        error?: string;
      };

      if (!response.ok || !data.reply) {
        setChatError(data.error || 'Unable to receive a response from Gemini.');
      } else {
        setChatMessages((prev) => [
          ...prev,
          {
            id: `m-${Date.now()}`,
            role: 'model',
            text: data.reply!,
            model: data.model,
            timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
          },
        ]);
      }
    } catch {
      setChatError('Network error reaching the KAIROS AI chat endpoint.');
    } finally {
      setChatLoading(false);
    }
  };

  const toggleChatDictation = async () => {
    if (chatDictating && chatRecorderRef.current) {
      chatRecorderRef.current.stop();
      setChatDictating(false);
      return;
    }

    setChatError(null);
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const mimeType = pickSupportedAudioMimeType();
      const recorder = new MediaRecorder(stream, mimeType ? { mimeType } : undefined);
      chatAudioChunksRef.current = [];

      recorder.ondataavailable = (ev) => {
        if (ev.data.size > 0) chatAudioChunksRef.current.push(ev.data);
      };

      recorder.onstop = async () => {
        stream.getTracks().forEach((t) => t.stop());
        const blob = new Blob(chatAudioChunksRef.current, { type: mimeType || 'audio/webm' });
        if (blob.size < 200) return;
        setChatTranscribing(true);
        try {
          const audioBase64 = await blobToBase64(blob);
          const res = await fetch('/api/ai/transcribe', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              audioBase64,
              mimeType: blob.type || mimeType,
              contextHint: 'KAIROS healthcare coordination chat question',
            }),
          });
          const data = (await res.json()) as { transcript?: string; error?: string };
          if (!res.ok || !data.transcript) {
            setChatError(data.error || 'Transcription failed.');
          } else {
            setChatInput((prev) => (prev ? `${prev} ${data.transcript}` : data.transcript!));
          }
        } catch {
          setChatError('Network error while transcribing dictated audio.');
        } finally {
          setChatTranscribing(false);
        }
      };

      chatRecorderRef.current = recorder;
      recorder.start();
      setChatDictating(true);
    } catch {
      setChatError('Microphone permission is required for speech dictation.');
    }
  };

  // -------------------------------------------------------------------------
  // 2. LIVE API VOICE CONVERSATION STATE (gemini-3.8-live)
  // -------------------------------------------------------------------------
  const [liveStatus, setLiveStatus] = useState<'idle' | 'connecting' | 'connected' | 'error'>('idle');
  const [liveVoiceName, setLiveVoiceName] = useState<(typeof VOICE_OPTIONS)[number]>('Zephyr');
  const [liveMuted, setLiveMuted] = useState(false);
  const [liveMicLevel, setLiveMicLevel] = useState(0);
  const [liveError, setLiveError] = useState<string | null>(null);
  const [liveTranscripts, setLiveTranscripts] = useState<LiveTranscriptItem[]>([]);
  const [liveTextNudge, setLiveTextNudge] = useState('');

  const liveWsRef = useRef<WebSocket | null>(null);
  const inputAudioCtxRef = useRef<AudioContext | null>(null);
  const outputAudioCtxRef = useRef<AudioContext | null>(null);
  const micStreamRef = useRef<MediaStream | null>(null);
  const scriptProcessorRef = useRef<ScriptProcessorNode | null>(null);
  const nextStartTimeRef = useRef<number>(0);
  const activeSourcesRef = useRef<AudioBufferSourceNode[]>([]);
  const liveMutedRef = useRef<boolean>(false);
  const liveScrollRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    liveMutedRef.current = liveMuted;
  }, [liveMuted]);

  useEffect(() => {
    if (liveScrollRef.current) {
      liveScrollRef.current.scrollTop = liveScrollRef.current.scrollHeight;
    }
  }, [liveTranscripts]);

  const stopOutputPlayback = () => {
    for (const src of activeSourcesRef.current) {
      try {
        src.stop();
      } catch {
        // already ended
      }
    }
    activeSourcesRef.current = [];
    if (outputAudioCtxRef.current) {
      nextStartTimeRef.current = outputAudioCtxRef.current.currentTime;
    } else {
      nextStartTimeRef.current = 0;
    }
  };

  const stopLiveSession = () => {
    stopOutputPlayback();
    if (scriptProcessorRef.current) {
      scriptProcessorRef.current.disconnect();
      scriptProcessorRef.current.onaudioprocess = null;
      scriptProcessorRef.current = null;
    }
    if (micStreamRef.current) {
      micStreamRef.current.getTracks().forEach((t) => t.stop());
      micStreamRef.current = null;
    }
    if (inputAudioCtxRef.current) {
      inputAudioCtxRef.current.close().catch(() => {});
      inputAudioCtxRef.current = null;
    }
    if (outputAudioCtxRef.current) {
      outputAudioCtxRef.current.close().catch(() => {});
      outputAudioCtxRef.current = null;
    }
    if (liveWsRef.current) {
      try {
        liveWsRef.current.close();
      } catch {
        // ignore
      }
      liveWsRef.current = null;
    }
    setLiveMicLevel(0);
    setLiveStatus('idle');
  };

  // Ensure Live session & recorders are cleaned up on modal close or tab switch
  useEffect(() => {
    if (!open || activeTab !== 'voice') {
      if (liveWsRef.current || micStreamRef.current) {
        stopLiveSession();
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, activeTab]);

  useEffect(() => {
    return () => {
      stopLiveSession();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const schedulePcm24kAudio = (base64Audio: string) => {
    const outCtx = outputAudioCtxRef.current;
    if (!outCtx) return;
    if (outCtx.state === 'suspended') {
      outCtx.resume().catch(() => {});
    }
    const audioBuffer = pcm24kBase64ToAudioBuffer(outCtx, base64Audio);
    const source = outCtx.createBufferSource();
    source.buffer = audioBuffer;
    source.connect(outCtx.destination);

    const now = outCtx.currentTime;
    const startAt = Math.max(now + 0.02, nextStartTimeRef.current);
    source.start(startAt);
    nextStartTimeRef.current = startAt + audioBuffer.duration;

    activeSourcesRef.current.push(source);
    source.onended = () => {
      activeSourcesRef.current = activeSourcesRef.current.filter((s) => s !== source);
    };
  };

  const appendLiveTranscript = (speaker: 'user' | 'model', chunkText: string) => {
    const cleaned = chunkText.trim();
    if (!cleaned) return;
    setLiveTranscripts((prev) => {
      const last = prev[prev.length - 1];
      if (last && last.speaker === speaker) {
        return [
          ...prev.slice(0, -1),
          { ...last, text: `${last.text} ${cleaned}`.replace(/\s+/g, ' ') },
        ];
      }
      return [...prev, { id: `lt-${Date.now()}-${Math.random()}`, speaker, text: cleaned }];
    });
  };

  const startLiveSession = async () => {
    stopLiveSession();
    setLiveError(null);
    setLiveStatus('connecting');
    setLiveTranscripts([]);

    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          channelCount: 1,
          sampleRate: 16000,
          echoCancellation: true,
          noiseSuppression: true,
        },
      });
      micStreamRef.current = stream;

      // Separate 16kHz input AudioContext and 24kHz output AudioContext per Live API rules
      const inCtx = new AudioContext({ sampleRate: 16000 });
      const outCtx = new AudioContext({ sampleRate: 24000 });
      inputAudioCtxRef.current = inCtx;
      outputAudioCtxRef.current = outCtx;
      nextStartTimeRef.current = outCtx.currentTime;

      const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
      const wsUrl = `${protocol}//${window.location.host}/api/ai/live?voice=${encodeURIComponent(liveVoiceName)}&role=${encodeURIComponent(roleKey)}`;
      const ws = new WebSocket(wsUrl);
      liveWsRef.current = ws;

      ws.onopen = () => {
        const source = inCtx.createMediaStreamSource(stream);
        const processor = inCtx.createScriptProcessor(4096, 1, 1);
        scriptProcessorRef.current = processor;
        source.connect(processor);
        processor.connect(inCtx.destination);

        processor.onaudioprocess = (ev) => {
          const inputData = ev.inputBuffer.getChannelData(0);
          if (liveMutedRef.current) {
            setLiveMicLevel(0);
            return;
          }
          setLiveMicLevel(computeRmsLevel(inputData));
          if (ws.readyState === WebSocket.OPEN) {
            const base64Pcm = float32ToPcm16Base64(inputData);
            ws.send(JSON.stringify({ audio: base64Pcm }));
          }
        };
      };

      ws.onmessage = (event) => {
        let msg: {
          ready?: boolean;
          audio?: string;
          inputTranscript?: string;
          outputTranscript?: string;
          interrupted?: boolean;
          error?: string;
          closed?: boolean;
        } | null = null;
        try {
          msg = JSON.parse(String(event.data));
        } catch {
          return;
        }
        if (!msg) return;
        if (msg.ready) {
          setLiveStatus('connected');
        }
        if (msg.audio) {
          schedulePcm24kAudio(msg.audio);
        }
        if (msg.inputTranscript) {
          appendLiveTranscript('user', msg.inputTranscript);
        }
        if (msg.outputTranscript) {
          appendLiveTranscript('model', msg.outputTranscript);
        }
        if (msg.interrupted) {
          stopOutputPlayback();
        }
        if (msg.error) {
          setLiveError(msg.error);
          setLiveStatus('error');
        }
        if (msg.closed) {
          stopLiveSession();
        }
      };

      ws.onerror = () => {
        setLiveError('WebSocket connection error while connecting to Gemini Live API.');
        setLiveStatus('error');
      };

      ws.onclose = () => {
        if (liveWsRef.current === ws) {
          stopLiveSession();
        }
      };
    } catch (err) {
      const msg =
        err instanceof Error && err.name === 'NotAllowedError'
          ? 'Microphone access was denied. Please allow microphone permission to start a live voice conversation.'
          : 'Unable to start microphone capture for Live API.';
      setLiveError(msg);
      setLiveStatus('error');
      stopLiveSession();
    }
  };

  const sendLiveTextNudge = (e: React.FormEvent) => {
    e.preventDefault();
    const text = liveTextNudge.trim();
    if (!text || !liveWsRef.current || liveWsRef.current.readyState !== WebSocket.OPEN) return;
    liveWsRef.current.send(JSON.stringify({ text }));
    appendLiveTranscript('user', text);
    setLiveTextNudge('');
  };

  // -------------------------------------------------------------------------
  // 3. AUDIO TRANSCRIPTION STATE (gemini-3.5-transcribe)
  // -------------------------------------------------------------------------
  const [transcribeRecording, setTranscribeRecording] = useState(false);
  const [transcribeSeconds, setTranscribeSeconds] = useState(0);
  const [transcribeLoading, setTranscribeLoading] = useState(false);
  const [transcribeHint, setTranscribeHint] = useState('Clinical Handover / ISBAR');
  const [transcribeResult, setTranscribeResult] = useState('');
  const [transcribeError, setTranscribeError] = useState<string | null>(null);
  const [transcribeCopied, setTranscribeCopied] = useState(false);
  const transcribeRecorderRef = useRef<MediaRecorder | null>(null);
  const transcribeChunksRef = useRef<Blob[]>([]);
  const transcribeTimerRef = useRef<number | null>(null);

  const stopTranscribeTimer = () => {
    if (transcribeTimerRef.current !== null) {
      window.clearInterval(transcribeTimerRef.current);
      transcribeTimerRef.current = null;
    }
  };

  const submitAudioForTranscription = async (blob: Blob, mimeOverride?: string) => {
    setTranscribeLoading(true);
    setTranscribeError(null);
    try {
      const audioBase64 = await blobToBase64(blob);
      const res = await fetch('/api/ai/transcribe', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          audioBase64,
          mimeType: mimeOverride || blob.type || 'audio/webm',
          contextHint: transcribeHint,
        }),
      });
      const data = (await res.json()) as { transcript?: string; error?: string };
      if (!res.ok || !data.transcript) {
        setTranscribeError(data.error || 'Could not transcribe audio.');
      } else {
        setTranscribeResult(data.transcript);
      }
    } catch {
      setTranscribeError('Network error while contacting /api/ai/transcribe.');
    } finally {
      setTranscribeLoading(false);
    }
  };

  const startMicRecording = async () => {
    setTranscribeError(null);
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const mimeType = pickSupportedAudioMimeType();
      const recorder = new MediaRecorder(stream, mimeType ? { mimeType } : undefined);
      transcribeChunksRef.current = [];

      recorder.ondataavailable = (ev) => {
        if (ev.data.size > 0) transcribeChunksRef.current.push(ev.data);
      };

      recorder.onstop = () => {
        stopTranscribeTimer();
        stream.getTracks().forEach((t) => t.stop());
        const blob = new Blob(transcribeChunksRef.current, { type: mimeType || 'audio/webm' });
        if (blob.size > 100) {
          void submitAudioForTranscription(blob, mimeType);
        }
      };

      transcribeRecorderRef.current = recorder;
      recorder.start();
      setTranscribeSeconds(0);
      setTranscribeRecording(true);
      transcribeTimerRef.current = window.setInterval(() => {
        setTranscribeSeconds((s) => s + 1);
      }, 1000);
    } catch {
      setTranscribeError('Microphone permission is required to record audio.');
    }
  };

  const stopMicRecording = () => {
    if (transcribeRecorderRef.current && transcribeRecording) {
      transcribeRecorderRef.current.stop();
      setTranscribeRecording(false);
    }
  };

  const handleUploadAudioFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    void submitAudioForTranscription(file, file.type || 'audio/mp3');
    e.target.value = '';
  };

  // -------------------------------------------------------------------------
  // 4. GOOGLE MAPS GROUNDING STATE (gemini-4-hydrogen + googleMaps)
  // -------------------------------------------------------------------------
  const [mapsQuery, setMapsQuery] = useState('24/7 emergency hospitals with ICU and trauma care nearby');
  const [mapsCoords, setMapsCoords] = useState(DEFAULT_COORDS);
  const [locatingGps, setLocatingGps] = useState(false);
  const [mapsLoading, setMapsLoading] = useState(false);
  const [mapsAnswer, setMapsAnswer] = useState<string | null>(null);
  const [mapsPlaces, setMapsPlaces] = useState<GroundedMapPlace[]>([]);
  const [mapsError, setMapsError] = useState<string | null>(null);

  const requestUserGps = () => {
    if (!navigator.geolocation) {
      setMapsError('Geolocation is not supported in this browser. Using Bengaluru default coordinates.');
      return;
    }
    setLocatingGps(true);
    setMapsError(null);
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setMapsCoords({
          latitude: Number(pos.coords.latitude.toFixed(5)),
          longitude: Number(pos.coords.longitude.toFixed(5)),
          label: `Live GPS (${pos.coords.latitude.toFixed(4)}, ${pos.coords.longitude.toFixed(4)})`,
        });
        setLocatingGps(false);
      },
      () => {
        setMapsError('GPS location permission unavailable—continuing with Bengaluru Brookefield coordinates.');
        setLocatingGps(false);
      },
      { timeout: 8000 }
    );
  };

  const runMapsSearch = async (queryOverride?: string) => {
    const q = (queryOverride ?? mapsQuery).trim();
    if (!q || mapsLoading) return;
    if (queryOverride) setMapsQuery(queryOverride);

    setMapsLoading(true);
    setMapsError(null);

    try {
      const res = await fetch('/api/ai/maps-grounding', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          query: q,
          latitude: mapsCoords.latitude,
          longitude: mapsCoords.longitude,
        }),
      });
      const data = (await res.json()) as {
        text?: string;
        places?: GroundedMapPlace[];
        error?: string;
      };
      if (!res.ok) {
        setMapsError(data.error || 'Google Maps grounding request failed.');
      } else {
        setMapsAnswer(data.text || '');
        setMapsPlaces(Array.isArray(data.places) ? data.places : []);
      }
    } catch {
      setMapsError('Network error reaching /api/ai/maps-grounding.');
    } finally {
      setMapsLoading(false);
    }
  };

  // -------------------------------------------------------------------------
  // 5. ISBAR HANDOVER CHECKER STATE (existing workflow preserved)
  // -------------------------------------------------------------------------
  const [selectedRefId, setSelectedRefId] = useState<string>(referrals[0]?.referralId ?? 'custom');
  const [isbarNotes, setIsbarNotes] = useState(initialNotes);
  const [isbarQuestion, setIsbarQuestion] = useState(
    'Structure this handover into ISBAR format, check for missing handover fields, and summarize verified ICU readiness.'
  );
  const [isbarLoading, setIsbarLoading] = useState(false);
  const [isbarResult, setIsbarResult] = useState<string | null>(null);
  const [isbarDisclaimer, setIsbarDisclaimer] = useState<string | null>(null);
  const [isbarError, setIsbarError] = useState<string | null>(null);
  const [isbarCopied, setIsbarCopied] = useState(false);

  const selectedRef = referrals.find((r) => r.referralId === selectedRefId);

  const handleGenerateIsbar = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsbarLoading(true);
    setIsbarError(null);
    setIsbarResult(null);

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
          symptoms: isbarNotes.trim() || selectedRef?.symptoms || 'Routine handover structuring request',
          requiredFacilities: selectedRef?.requiredFacilities || ['ICU'],
          targetHospital: selectedRef?.targetHospitalName || hospitals[0]?.name,
          hospitalCapacityNote: capacitySummary,
          question: isbarQuestion,
        }),
      });

      const data = (await response.json()) as {
        summary?: string;
        disclaimer?: string;
        error?: string;
      };

      if (!response.ok || !data.summary) {
        setIsbarError(data.error || 'Unable to generate ISBAR handover draft right now.');
      } else {
        setIsbarResult(data.summary);
        setIsbarDisclaimer(
          data.disclaimer || 'Non-diagnostic handover draft. Clinician review required.'
        );
      }
    } catch {
      setIsbarError('Network error reaching the KAIROS server endpoint.');
    } finally {
      setIsbarLoading(false);
    }
  };

  if (!open) return null;

  const tabs: Array<{
    id: AssistantTab;
    label: string;
    modelTag: string;
    icon: React.FC<{ className?: string }>;
  }> = [
    { id: 'chat', label: 'AI Chat', modelTag: 'gemini-4-hydrogen', icon: MessageSquare },
    { id: 'voice', label: 'Live Voice', modelTag: 'gemini-3.8-live', icon: AudioLines },
    { id: 'transcribe', label: 'Transcribe', modelTag: 'gemini-3.5-transcribe', icon: Mic },
    { id: 'maps', label: 'Maps Grounding', modelTag: 'googleMaps', icon: MapPin },
    { id: 'isbar', label: 'ISBAR Checker', modelTag: 'handover', icon: Sparkles },
  ];

  return (
    <div
      className="fixed inset-0 z-50 bg-kairos-forest-deep/65 backdrop-blur-xs flex items-center justify-center p-3 sm:p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="kairos-ai-hub-title"
    >
      <div className="bg-kairos-surface border border-kairos-border rounded-2xl max-w-4xl w-full max-h-[92vh] flex flex-col shadow-2xl overflow-hidden">
        {/* Modal Header */}
        <div className="px-5 py-4 bg-kairos-forest text-white flex items-center justify-between gap-4 shrink-0">
          <div className="flex items-center gap-3 min-w-0">
            <div className="w-9 h-9 rounded-xl bg-kairos-emerald text-white flex items-center justify-center shrink-0">
              <Sparkles className="w-4 h-4" />
            </div>
            <div className="min-w-0">
              <h2 id="kairos-ai-hub-title" className="text-base font-extrabold tracking-tight truncate">
                KAIROS Gemini AI Coordination Hub
              </h2>
              <p className="text-[11px] text-emerald-200/90 truncate">
                Multi-Turn Chat · Real-Time Voice (Live API) · Mic Transcription · Google Maps Grounding
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={() => {
              stopLiveSession();
              onClose();
            }}
            aria-label="Close KAIROS AI Hub"
            className="p-2 rounded-lg text-emerald-100 hover:bg-white/10 hover:text-white shrink-0"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Navigation Tab Bar */}
        <div
          role="tablist"
          aria-label="KAIROS AI capabilities"
          className="px-4 pt-3 pb-2 bg-kairos-surface-subtle border-b border-kairos-border flex items-center gap-1.5 overflow-x-auto shrink-0"
        >
          {tabs.map((tab) => {
            const Icon = tab.icon;
            const active = activeTab === tab.id;
            return (
              <button
                key={tab.id}
                type="button"
                role="tab"
                aria-selected={active}
                onClick={() => setActiveTab(tab.id)}
                className={`inline-flex items-center gap-2 px-3.5 py-2 rounded-xl text-xs font-semibold transition-colors whitespace-nowrap shrink-0 ${
                  active
                    ? 'bg-kairos-forest text-white'
                    : 'bg-kairos-surface text-kairos-forest-ink border border-kairos-border hover:border-kairos-emerald'
                }`}
              >
                <Icon className="w-3.5 h-3.5 shrink-0" />
                <span>{tab.label}</span>
              </button>
            );
          })}
        </div>

        {/* Clinical Safety Reminder Strip */}
        <div className="px-5 py-2 bg-amber-50 dark:bg-amber-950/40 border-b border-amber-200 dark:border-amber-800/60 flex items-center gap-2 text-[11px] text-amber-950 dark:text-amber-100 shrink-0">
          <ShieldAlert className="w-3.5 h-3.5 shrink-0 text-amber-700 dark:text-amber-400" />
          <span>
            <strong>Coordination Support Only:</strong> Non-diagnostic AI assistant. Always verify bed holds with hospital staff and call emergency services (108/112) in life-threatening situations.
          </span>
        </div>

        {/* Tab Viewport */}
        <div className="flex-1 overflow-y-auto p-5">
          {/* ================================================================
              TAB 1: MULTI-TURN GEMINI CHATBOT
             ================================================================ */}
          {activeTab === 'chat' && (
            <div className="flex flex-col h-[56vh] min-h-[380px]">
              {/* Controls Row */}
              <div className="flex flex-wrap items-center justify-between gap-2 pb-3 border-b border-kairos-border-subtle">
                <div className="flex flex-wrap items-center gap-1.5">
                  <span className="text-[11px] font-semibold text-kairos-muted mr-1">Model Mode:</span>
                  {(
                    [
                      ['general', 'Standard (gemini-4-hydrogen)'],
                      ['deep', 'Deep Analysis (High Thinking)'],
                      ['fast', 'Fast (gemini-3.1-flash-lite)'],
                    ] as const
                  ).map(([modeId, label]) => (
                    <button
                      key={modeId}
                      type="button"
                      onClick={() => setChatMode(modeId)}
                      className={`px-2.5 py-1 rounded-lg text-[11px] font-semibold border transition-colors ${
                        chatMode === modeId
                          ? 'bg-kairos-emerald text-white border-kairos-emerald'
                          : 'bg-kairos-surface-subtle text-kairos-forest-ink border-kairos-border hover:border-kairos-emerald'
                      }`}
                    >
                      {label}
                    </button>
                  ))}
                </div>
                <button
                  type="button"
                  onClick={() =>
                    setChatMessages((prev) => (prev.length > 0 ? [prev[0]] : []))
                  }
                  className="inline-flex items-center gap-1 text-[11px] font-semibold text-kairos-muted hover:text-red-700 dark:text-red-400"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                  Clear History
                </button>
              </div>

              {/* Scrollable Message Thread */}
              <div
                ref={chatScrollRef}
                className="flex-1 overflow-y-auto py-4 space-y-3 pr-1"
              >
                {chatMessages.map((msg) => {
                  const isUser = msg.role === 'user';
                  return (
                    <div
                      key={msg.id}
                      className={`flex ${isUser ? 'justify-end' : 'justify-start'}`}
                    >
                      <div
                        className={`max-w-[85%] rounded-2xl px-4 py-3 ${
                          isUser
                            ? 'bg-kairos-forest text-white'
                            : 'bg-kairos-surface-subtle border border-kairos-border text-kairos-forest-ink'
                        }`}
                      >
                        <div className="flex items-center justify-between gap-3 mb-1">
                          <span
                            className={`text-[10px] font-bold uppercase tracking-wider ${
                              isUser ? 'text-emerald-200' : 'text-kairos-emerald-ink'
                            }`}
                          >
                            {isUser ? 'You' : `KAIROS Assistant · ${msg.model || 'gemini-4-hydrogen'}`}
                          </span>
                          <span
                            className={`text-[10px] font-mono ${
                              isUser ? 'text-emerald-200/80' : 'text-kairos-muted/80'
                            }`}
                          >
                            {msg.timestamp}
                          </span>
                        </div>
                        {isUser ? (
                          <p className="text-xs leading-relaxed whitespace-pre-wrap">{msg.text}</p>
                        ) : (
                          renderSafeMarkdown(msg.text)
                        )}
                      </div>
                    </div>
                  );
                })}

                {chatLoading && (
                  <div className="flex justify-start">
                    <div className="rounded-2xl px-4 py-3 bg-kairos-surface-subtle border border-kairos-border flex items-center gap-2 text-xs text-kairos-forest-ink">
                      <Loader2 className="w-3.5 h-3.5 animate-spin text-kairos-emerald-ink" />
                      <span>KAIROS Assistant is thinking...</span>
                    </div>
                  </div>
                )}
              </div>

              {/* Starter Prompts */}
              <div className="flex flex-wrap gap-1.5 pb-2.5">
                {[
                  'Summarize open ICU capacity across the network right now',
                  'Give me an ISBAR handover checklist for an obstetric referral',
                  'How does Accept Before You Move prevent double-booked beds?',
                ].map((prompt) => (
                  <button
                    key={prompt}
                    type="button"
                    onClick={() => void sendChatMessage(prompt)}
                    disabled={chatLoading}
                    className="text-[11px] px-2.5 py-1 rounded-lg bg-kairos-surface-subtle border border-kairos-border text-kairos-forest-ink hover:border-kairos-emerald transition-colors text-left"
                  >
                    {prompt}
                  </button>
                ))}
              </div>

              {chatError && (
                <div className="mb-2 p-2.5 rounded-xl bg-red-50 dark:bg-red-950/40 border border-red-200 dark:border-red-900/60 text-xs text-red-800 dark:text-red-300">
                  {chatError}
                </div>
              )}

              {/* Message Composer with Inline Mic Dictation */}
              <form
                onSubmit={(e) => {
                  e.preventDefault();
                  void sendChatMessage();
                }}
                className="flex items-center gap-2 pt-2 border-t border-kairos-border-subtle"
              >
                <button
                  type="button"
                  onClick={() => void toggleChatDictation()}
                  disabled={chatTranscribing}
                  title={chatDictating ? 'Stop voice dictation' : 'Dictate message with gemini-3.5-transcribe'}
                  aria-label={chatDictating ? 'Stop voice dictation' : 'Dictate message with microphone'}
                  className={`p-2.5 rounded-xl border transition-colors shrink-0 ${
                    chatDictating
                      ? 'bg-red-600 text-white border-red-600'
                      : 'bg-kairos-surface-subtle text-kairos-forest-ink border-kairos-border hover:border-kairos-emerald'
                  }`}
                >
                  {chatTranscribing ? (
                    <Loader2 className="w-4 h-4 animate-spin" />
                  ) : chatDictating ? (
                    <Square className="w-4 h-4" />
                  ) : (
                    <Mic className="w-4 h-4" />
                  )}
                </button>
                <input
                  type="text"
                  value={chatInput}
                  onChange={(e) => setChatInput(e.target.value)}
                  placeholder={
                    chatDictating
                      ? 'Listening... click stop to transcribe into chat'
                      : chatTranscribing
                        ? 'Transcribing speech with gemini-3.5-transcribe...'
                        : 'Ask KAIROS Assistant anything about OPD, referrals, or ICU readiness...'
                  }
                  className="flex-1 rounded-xl border border-kairos-border px-3.5 py-2.5 text-xs text-kairos-forest-ink focus:outline-none focus:ring-2 focus:ring-kairos-emerald"
                />
                <button
                  type="submit"
                  disabled={chatLoading || !chatInput.trim()}
                  className="inline-flex items-center gap-1.5 px-4 py-2.5 rounded-xl bg-kairos-emerald text-white text-xs font-semibold hover:bg-kairos-emerald-hover disabled:opacity-50 transition-colors shrink-0"
                >
                  <Send className="w-3.5 h-3.5" />
                  Send
                </button>
              </form>
            </div>
          )}

          {/* ================================================================
              TAB 2: REAL-TIME VOICE CONVERSATION (gemini-3.8-live)
             ================================================================ */}
          {activeTab === 'voice' && (
            <div className="space-y-4">
              <div className="rounded-2xl bg-kairos-forest text-white p-5 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                <div className="space-y-1">
                  <div className="flex items-center gap-2">
                    <AudioLines className="w-4 h-4 text-[#4ADE80]" />
                    <h3 className="font-display text-base font-bold">
                      Real-Time Voice Assistant · Gemini Live API
                    </h3>
                  </div>
                  <p className="text-xs text-emerald-100/90 max-w-xl leading-relaxed">
                    Have a hands-free, low-latency spoken conversation powered by{' '}
                    <span className="font-mono text-emerald-200">gemini-3.8-live</span> (16kHz PCM mic stream &amp; 24kHz gapless voice playback with live captions).
                  </p>
                </div>

                <div className="flex items-center gap-2 shrink-0">
                  <label htmlFor="live-voice-select" className="sr-only">
                    Voice persona
                  </label>
                  <select
                    id="live-voice-select"
                    value={liveVoiceName}
                    disabled={liveStatus === 'connected' || liveStatus === 'connecting'}
                    onChange={(e) =>
                      setLiveVoiceName(e.target.value as (typeof VOICE_OPTIONS)[number])
                    }
                    className="rounded-xl bg-kairos-forest-deep border border-[#1B604C] px-3 py-2 text-xs font-semibold text-white disabled:opacity-60"
                  >
                    {VOICE_OPTIONS.map((v) => (
                      <option key={v} value={v}>
                        Voice: {v}
                      </option>
                    ))}
                  </select>

                  {liveStatus === 'connected' || liveStatus === 'connecting' ? (
                    <button
                      type="button"
                      onClick={stopLiveSession}
                      className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl bg-red-600 hover:bg-red-700 text-white text-xs font-bold transition-colors whitespace-nowrap"
                    >
                      <PhoneOff className="w-3.5 h-3.5" />
                      End Voice
                    </button>
                  ) : (
                    <button
                      type="button"
                      onClick={() => void startLiveSession()}
                      className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl bg-kairos-emerald hover:bg-kairos-emerald-hover text-white text-xs font-bold transition-colors whitespace-nowrap"
                    >
                      <Mic className="w-3.5 h-3.5" />
                      Start Live Voice
                    </button>
                  )}
                </div>
              </div>

              {/* Active Audio Meter & Mute Controls */}
              <div className="rounded-xl border border-kairos-border bg-kairos-surface-subtle p-4 flex flex-wrap items-center justify-between gap-4">
                <div className="flex items-center gap-3 flex-1 min-w-[200px]">
                  <Volume2
                    className={`w-4 h-4 shrink-0 ${
                      liveStatus === 'connected' ? 'text-kairos-emerald-ink' : 'text-kairos-muted/80'
                    }`}
                  />
                  <div className="flex-1">
                    <div className="flex items-center justify-between text-[11px] mb-1">
                      <span className="font-semibold text-kairos-forest-ink">
                        {liveStatus === 'connected'
                          ? liveMuted
                            ? 'Microphone muted · Listening for KAIROS response'
                            : 'Live audio channel active — speak naturally'
                          : liveStatus === 'connecting'
                            ? 'Connecting WebSocket bridge to gemini-3.8-live...'
                            : 'Ready to start real-time voice session'}
                      </span>
                      <span className="font-mono text-kairos-muted">16kHz IN · 24kHz OUT</span>
                    </div>
                    <div className="h-2 rounded-full bg-kairos-border overflow-hidden">
                      <div
                        className="h-full bg-kairos-emerald transition-all duration-75"
                        style={{
                          width: `${Math.round((liveStatus === 'connected' ? liveMicLevel : 0) * 100)}%`,
                        }}
                      />
                    </div>
                  </div>
                </div>

                <button
                  type="button"
                  disabled={liveStatus !== 'connected'}
                  onClick={() => setLiveMuted((m) => !m)}
                  className={`inline-flex items-center gap-1.5 px-3 py-2 rounded-xl border text-xs font-semibold disabled:opacity-50 ${
                    liveMuted
                      ? 'bg-amber-50 dark:bg-amber-950/40 border-amber-300 dark:border-amber-700/70 text-amber-900 dark:text-amber-200'
                      : 'bg-kairos-surface border-kairos-border text-kairos-forest-ink'
                  }`}
                >
                  {liveMuted ? <MicOff className="w-3.5 h-3.5" /> : <Mic className="w-3.5 h-3.5" />}
                  {liveMuted ? 'Unmute Mic' : 'Mute Mic'}
                </button>
              </div>

              {liveError && (
                <div className="p-3.5 rounded-xl bg-red-50 dark:bg-red-950/40 border border-red-200 dark:border-red-900/60 text-xs text-red-800 dark:text-red-300">
                  {liveError}
                </div>
              )}

              {/* Real-Time Spoken Transcript Feed */}
              <div className="rounded-xl border border-kairos-border bg-kairos-surface overflow-hidden">
                <div className="px-4 py-2.5 bg-kairos-surface-subtle border-b border-kairos-border flex items-center justify-between text-xs">
                  <span className="font-bold text-kairos-forest-ink">Live Voice Transcript</span>
                  <span className="font-mono text-[11px] text-kairos-muted">
                    {liveTranscripts.length} turns
                  </span>
                </div>
                <div
                  ref={liveScrollRef}
                  className="h-56 overflow-y-auto p-4 space-y-2.5 bg-kairos-surface-subtle"
                >
                  {liveTranscripts.length === 0 ? (
                    <div className="h-full flex flex-col items-center justify-center text-center text-xs text-kairos-muted px-4">
                      <AudioLines className="w-6 h-6 text-kairos-emerald-ink/60 mb-2" />
                      <p className="font-semibold text-kairos-forest-ink">
                        Click &ldquo;Start Live Voice&rdquo; and speak directly to KAIROS.
                      </p>
                      <p className="mt-1 max-w-md">
                        Try saying: &ldquo;Walk me through the steps to send an obstetric emergency referral with a confirmed ICU bed hold.&rdquo;
                      </p>
                    </div>
                  ) : (
                    liveTranscripts.map((item) => (
                      <div
                        key={item.id}
                        className={`p-3 rounded-xl text-xs leading-relaxed ${
                          item.speaker === 'user'
                            ? 'bg-kairos-forest text-white ml-8'
                            : 'bg-kairos-surface border border-kairos-border text-kairos-forest-ink mr-8'
                        }`}
                      >
                        <p
                          className={`text-[10px] font-bold uppercase mb-0.5 ${
                            item.speaker === 'user' ? 'text-emerald-200' : 'text-kairos-emerald-ink'
                          }`}
                        >
                          {item.speaker === 'user' ? 'You (Spoken)' : `KAIROS Live (${liveVoiceName})`}
                        </p>
                        <p>{item.text}</p>
                      </div>
                    ))
                  )}
                </div>

                {liveStatus === 'connected' && (
                  <form
                    onSubmit={sendLiveTextNudge}
                    className="p-3 bg-kairos-surface border-t border-kairos-border-subtle flex items-center gap-2"
                  >
                    <input
                      type="text"
                      value={liveTextNudge}
                      onChange={(e) => setLiveTextNudge(e.target.value)}
                      placeholder="Optionally type a message into the active voice session..."
                      className="flex-1 rounded-lg border border-kairos-border px-3 py-2 text-xs text-kairos-forest-ink"
                    />
                    <button
                      type="submit"
                      disabled={!liveTextNudge.trim()}
                      className="px-3.5 py-2 rounded-lg bg-kairos-forest text-white text-xs font-semibold disabled:opacity-50"
                    >
                      Send
                    </button>
                  </form>
                )}
              </div>
            </div>
          )}

          {/* ================================================================
              TAB 3: AUDIO TRANSCRIPTION (gemini-3.5-transcribe)
             ================================================================ */}
          {activeTab === 'transcribe' && (
            <div className="space-y-4">
              <div className="rounded-2xl border border-kairos-border bg-kairos-surface-subtle p-5 space-y-4">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <h3 className="font-display text-base font-bold text-kairos-forest-ink">
                      Microphone &amp; Audio File Transcription
                    </h3>
                    <p className="text-xs text-kairos-muted mt-0.5">
                      Powered by <span className="font-mono font-semibold text-kairos-emerald-ink">gemini-3.5-transcribe</span> — record bedside handover notes, OPD queries, or ambulance updates directly with your microphone.
                    </p>
                  </div>
                  <select
                    aria-label="Transcription vocabulary context"
                    value={transcribeHint}
                    onChange={(e) => setTranscribeHint(e.target.value)}
                    className="rounded-xl border border-kairos-border bg-kairos-surface px-3 py-2 text-xs font-semibold text-kairos-forest-ink"
                  >
                    <option value="Clinical Handover / ISBAR">Context: Clinical Handover / ISBAR</option>
                    <option value="Ambulance En-Route Vitals Update">Context: Ambulance Vitals Update</option>
                    <option value="Patient OPD & Symptom Note">Context: Patient OPD Inquiry</option>
                  </select>
                </div>

                <div className="flex flex-wrap items-center gap-3">
                  {transcribeRecording ? (
                    <button
                      type="button"
                      onClick={stopMicRecording}
                      className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl bg-red-600 hover:bg-red-700 text-white text-xs font-bold transition-colors"
                    >
                      <Square className="w-3.5 h-3.5" />
                      Stop &amp; Transcribe ({String(Math.floor(transcribeSeconds / 60)).padStart(2, '0')}:
                      {String(transcribeSeconds % 60).padStart(2, '0')})
                    </button>
                  ) : (
                    <button
                      type="button"
                      disabled={transcribeLoading}
                      onClick={() => void startMicRecording()}
                      className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl bg-kairos-emerald hover:bg-kairos-emerald-hover text-white text-xs font-bold disabled:opacity-50 transition-colors"
                    >
                      <Mic className="w-4 h-4" />
                      Record with Microphone
                    </button>
                  )}

                  <label className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl bg-kairos-surface border border-kairos-border hover:border-kairos-emerald text-xs font-semibold text-kairos-forest-ink cursor-pointer">
                    <Upload className="w-3.5 h-3.5 text-kairos-emerald-ink" />
                    Upload Audio File
                    <input
                      type="file"
                      accept="audio/*"
                      onChange={handleUploadAudioFile}
                      className="hidden"
                    />
                  </label>

                  {transcribeLoading && (
                    <span className="inline-flex items-center gap-1.5 text-xs font-semibold text-kairos-forest-ink">
                      <Loader2 className="w-4 h-4 animate-spin text-kairos-emerald-ink" />
                      Transcribing with gemini-3.5-transcribe...
                    </span>
                  )}
                </div>
              </div>

              {transcribeError && (
                <div className="p-3.5 rounded-xl bg-red-50 dark:bg-red-950/40 border border-red-200 dark:border-red-900/60 text-xs text-red-800 dark:text-red-300">
                  {transcribeError}
                </div>
              )}

              <div className="rounded-2xl border border-kairos-border bg-kairos-surface p-4 space-y-3">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="flex items-center gap-2">
                    <FileAudio className="w-4 h-4 text-kairos-emerald-ink" />
                    <span className="text-xs font-bold text-kairos-forest-ink">Transcribed Text</span>
                  </div>
                  <div className="flex flex-wrap items-center gap-2">
                    <button
                      type="button"
                      disabled={!transcribeResult}
                      onClick={() => {
                        navigator.clipboard?.writeText(transcribeResult).catch(() => {});
                        setTranscribeCopied(true);
                        window.setTimeout(() => setTranscribeCopied(false), 1800);
                      }}
                      className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg border border-kairos-border text-xs font-semibold text-kairos-forest-ink disabled:opacity-40"
                    >
                      {transcribeCopied ? (
                        <Check className="w-3.5 h-3.5 text-kairos-emerald-ink" />
                      ) : (
                        <ClipboardCopy className="w-3.5 h-3.5" />
                      )}
                      {transcribeCopied ? 'Copied' : 'Copy'}
                    </button>
                    <button
                      type="button"
                      disabled={!transcribeResult}
                      onClick={() => {
                        setChatInput(transcribeResult);
                        setActiveTab('chat');
                      }}
                      className="px-3 py-1.5 rounded-lg bg-kairos-forest text-white text-xs font-semibold disabled:opacity-40"
                    >
                      Send to AI Chat
                    </button>
                    {onApplySummary && (
                      <button
                        type="button"
                        disabled={!transcribeResult}
                        onClick={() => {
                          onApplySummary(transcribeResult);
                          onClose();
                        }}
                        className="px-3 py-1.5 rounded-lg bg-kairos-emerald text-white text-xs font-semibold disabled:opacity-40"
                      >
                        Apply to Referral
                      </button>
                    )}
                  </div>
                </div>
                <textarea
                  rows={6}
                  value={transcribeResult}
                  onChange={(e) => setTranscribeResult(e.target.value)}
                  placeholder="Your microphone or uploaded audio transcript will appear here. You can edit it directly before copying or sending to AI Chat."
                  className="w-full rounded-xl border border-kairos-border bg-kairos-surface-subtle p-3.5 text-sm text-kairos-forest-ink focus:outline-none focus:ring-2 focus:ring-kairos-emerald"
                />
              </div>
            </div>
          )}

          {/* ================================================================
              TAB 4: GOOGLE MAPS GROUNDING (gemini-4-hydrogen + googleMaps)
             ================================================================ */}
          {activeTab === 'maps' && (
            <div className="space-y-4">
              <div className="rounded-2xl border border-kairos-border bg-kairos-surface-subtle p-4 space-y-3">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div>
                    <h3 className="font-display text-base font-bold text-kairos-forest-ink">
                      Live Healthcare Facility Search · Google Maps Grounding
                    </h3>
                    <p className="text-xs text-kairos-muted">
                      Powered by <span className="font-mono font-semibold text-kairos-emerald-ink">gemini-4-hydrogen</span> with Google Maps data for real-world hospitals, trauma centres, pharmacies, blood banks, and diagnostic labs.
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={requestUserGps}
                    disabled={locatingGps}
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-kairos-surface border border-kairos-border hover:border-kairos-emerald text-xs font-semibold text-kairos-forest-ink"
                  >
                    {locatingGps ? (
                      <Loader2 className="w-3.5 h-3.5 animate-spin text-kairos-emerald-ink" />
                    ) : (
                      <Navigation className="w-3.5 h-3.5 text-kairos-emerald-ink" />
                    )}
                    {mapsCoords.label}
                  </button>
                </div>

                <form
                  onSubmit={(e) => {
                    e.preventDefault();
                    void runMapsSearch();
                  }}
                  className="flex flex-col sm:flex-row gap-2"
                >
                  <input
                    type="text"
                    value={mapsQuery}
                    onChange={(e) => setMapsQuery(e.target.value)}
                    placeholder="Search real-world hospitals, trauma centres, blood banks, 24h pharmacies..."
                    className="flex-1 rounded-xl border border-kairos-border bg-kairos-surface px-3.5 py-2.5 text-xs text-kairos-forest-ink focus:outline-none focus:ring-2 focus:ring-kairos-emerald"
                  />
                  <button
                    type="submit"
                    disabled={mapsLoading || !mapsQuery.trim()}
                    className="inline-flex items-center justify-center gap-1.5 px-5 py-2.5 rounded-xl bg-kairos-forest hover:bg-kairos-emerald text-white text-xs font-bold disabled:opacity-50 transition-colors whitespace-nowrap"
                  >
                    {mapsLoading ? (
                      <Loader2 className="w-3.5 h-3.5 animate-spin" />
                    ) : (
                      <MapPin className="w-3.5 h-3.5" />
                    )}
                    Search Google Maps
                  </button>
                </form>

                <div className="flex flex-wrap gap-1.5">
                  {[
                    '24/7 emergency hospitals with ICU and trauma care nearby',
                    'Blood banks and emergency maternity hospitals nearby',
                    '24-hour medical pharmacies nearby',
                    'Diagnostic centres with CT scan and MRI nearby',
                  ].map((q) => (
                    <button
                      key={q}
                      type="button"
                      disabled={mapsLoading}
                      onClick={() => void runMapsSearch(q)}
                      className="text-[11px] px-2.5 py-1 rounded-lg bg-kairos-surface border border-kairos-border text-kairos-forest-ink hover:border-kairos-emerald transition-colors"
                    >
                      {q}
                    </button>
                  ))}
                </div>
              </div>

              {mapsError && (
                <div className="p-3.5 rounded-xl bg-red-50 dark:bg-red-950/40 border border-red-200 dark:border-red-900/60 text-xs text-red-800 dark:text-red-300">
                  {mapsError}
                </div>
              )}

              {mapsAnswer && (
                <div className="grid grid-cols-1 lg:grid-cols-12 gap-4">
                  <div className="lg:col-span-7 rounded-2xl border border-kairos-border bg-kairos-surface p-4 space-y-2">
                    <p className="text-xs font-bold text-kairos-forest-ink uppercase tracking-wider">
                      Grounded Google Maps Summary
                    </p>
                    {renderSafeMarkdown(mapsAnswer)}
                  </div>

                  <div className="lg:col-span-5 rounded-2xl border border-kairos-border bg-kairos-surface-subtle p-4 space-y-3">
                    <div className="flex items-center justify-between">
                      <p className="text-xs font-bold text-kairos-forest-ink uppercase tracking-wider">
                        Google Maps Places ({mapsPlaces.length})
                      </p>
                      <MapPin className="w-3.5 h-3.5 text-kairos-emerald-ink" />
                    </div>
                    {mapsPlaces.length === 0 ? (
                      <p className="text-xs text-kairos-muted">
                        No direct map place links were returned for this query. Try adding a neighborhood or city name.
                      </p>
                    ) : (
                      <div className="space-y-2.5 max-h-80 overflow-y-auto pr-1">
                        {mapsPlaces.map((place, idx) => (
                          <div
                            key={`${place.uri}-${idx}`}
                            className="p-3 rounded-xl bg-kairos-surface border border-kairos-border space-y-1.5"
                          >
                            <a
                              href={place.uri}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="inline-flex items-center gap-1.5 text-xs font-bold text-kairos-forest-ink hover:text-kairos-emerald-ink"
                            >
                              <span>{place.title}</span>
                              <ExternalLink className="w-3 h-3 shrink-0 text-kairos-emerald-ink" />
                            </a>
                            {place.reviewSnippets.length > 0 && (
                              <div className="space-y-1 pt-1 border-t border-kairos-border-subtle">
                                {place.reviewSnippets.slice(0, 2).map((rev, rIdx) => (
                                  <div key={rIdx} className="text-[11px] text-kairos-muted leading-snug">
                                    <span>&ldquo;{rev.text}&rdquo;</span>
                                    {rev.uri && (
                                      <a
                                        href={rev.uri}
                                        target="_blank"
                                        rel="noopener noreferrer"
                                        className="ml-1.5 text-kairos-emerald-ink font-semibold hover:underline"
                                      >
                                        Review link
                                      </a>
                                    )}
                                  </div>
                                ))}
                              </div>
                            )}
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
              )}
            </div>
          )}

          {/* ================================================================
              TAB 5: STRUCTURED ISBAR & BED-READINESS CHECKER
             ================================================================ */}
          {activeTab === 'isbar' && (
            <form onSubmit={handleGenerateIsbar} className="space-y-4">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label
                    htmlFor="assistant-ref-select"
                    className="block text-xs font-semibold text-kairos-forest-ink mb-1.5"
                  >
                    Load Active Referral Context
                  </label>
                  <select
                    id="assistant-ref-select"
                    value={selectedRefId}
                    onChange={(e) => setSelectedRefId(e.target.value)}
                    className="w-full rounded-xl border border-kairos-border px-3 py-2 text-sm text-kairos-forest-ink focus:outline-none focus:ring-2 focus:ring-kairos-emerald"
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
                  <label
                    htmlFor="assistant-goal"
                    className="block text-xs font-semibold text-kairos-forest-ink mb-1.5"
                  >
                    Coordination Check
                  </label>
                  <input
                    id="assistant-goal"
                    type="text"
                    value={isbarQuestion}
                    onChange={(e) => setIsbarQuestion(e.target.value)}
                    className="w-full rounded-xl border border-kairos-border px-3 py-2 text-sm text-kairos-forest-ink focus:outline-none focus:ring-2 focus:ring-kairos-emerald"
                  />
                </div>
              </div>

              <div>
                <label
                  htmlFor="assistant-notes"
                  className="block text-xs font-semibold text-kairos-forest-ink mb-1.5"
                >
                  Clinician Observations / Handover Notes (Optional override)
                </label>
                <textarea
                  id="assistant-notes"
                  rows={3}
                  value={isbarNotes}
                  onChange={(e) => setIsbarNotes(e.target.value)}
                  placeholder={
                    selectedRef?.symptoms ||
                    'Enter patient observations, onset timing, and transfer logistics...'
                  }
                  className="w-full rounded-xl border border-kairos-border px-3.5 py-2.5 text-sm text-kairos-forest-ink focus:outline-none focus:ring-2 focus:ring-kairos-emerald"
                />
              </div>

              <div className="flex items-center justify-end gap-3">
                <button
                  type="button"
                  onClick={onClose}
                  className="px-4 py-2 rounded-xl border border-kairos-border text-sm font-medium text-kairos-forest-ink hover:bg-kairos-mint-soft"
                >
                  Close
                </button>
                <button
                  type="submit"
                  disabled={isbarLoading}
                  className="inline-flex items-center gap-2 px-5 py-2 rounded-xl bg-kairos-emerald text-white text-sm font-semibold hover:bg-kairos-emerald-hover disabled:opacity-60 transition-colors"
                >
                  {isbarLoading ? (
                    <Loader2 className="w-4 h-4 animate-spin" />
                  ) : (
                    <Sparkles className="w-4 h-4" />
                  )}
                  {isbarLoading ? 'Structuring ISBAR...' : 'Check Bed Status & ISBAR'}
                </button>
              </div>

              {isbarError && (
                <div className="p-4 rounded-xl bg-red-50 dark:bg-red-950/40 border border-red-200 dark:border-red-900/60 text-xs text-red-800 dark:text-red-300">
                  {isbarError}
                </div>
              )}

              {isbarResult && (
                <div className="rounded-xl border border-kairos-border bg-kairos-surface-subtle p-4 space-y-3">
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-xs font-semibold text-kairos-forest-ink">
                      Structured ISBAR Handover Draft
                    </span>
                    <div className="flex items-center gap-2">
                      <button
                        type="button"
                        onClick={() => {
                          navigator.clipboard?.writeText(isbarResult).catch(() => {});
                          setIsbarCopied(true);
                          window.setTimeout(() => setIsbarCopied(false), 1800);
                        }}
                        className="inline-flex items-center gap-1 text-xs font-medium text-kairos-forest-ink px-2.5 py-1 rounded-lg border border-kairos-border bg-kairos-surface hover:bg-kairos-mint-soft"
                      >
                        {isbarCopied ? (
                          <Check className="w-3.5 h-3.5 text-kairos-emerald-ink" />
                        ) : (
                          <ClipboardCopy className="w-3.5 h-3.5" />
                        )}
                        {isbarCopied ? 'Copied' : 'Copy'}
                      </button>
                      {onApplySummary && (
                        <button
                          type="button"
                          onClick={() => {
                            onApplySummary(isbarResult);
                            onClose();
                          }}
                          className="text-xs font-semibold text-white bg-kairos-forest px-3 py-1 rounded-lg hover:bg-kairos-forest-deep"
                        >
                          Use in Referral
                        </button>
                      )}
                    </div>
                  </div>
                  <pre className="whitespace-pre-wrap font-sans text-xs leading-relaxed text-kairos-forest-ink">
                    {isbarResult}
                  </pre>
                  {isbarDisclaimer && (
                    <p className="text-[11px] text-kairos-muted pt-2 border-t border-kairos-border">
                      {isbarDisclaimer}
                    </p>
                  )}
                </div>
              )}
            </form>
          )}
        </div>
      </div>
    </div>
  );
};
