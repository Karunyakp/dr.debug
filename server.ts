import 'dotenv/config';
import express from 'express';
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { WebSocketServer, type WebSocket } from 'ws';
import {
  GoogleGenAI,
  Modality,
  ThinkingLevel,
  type LiveServerMessage,
} from '@google/genai';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const PORT = Number(process.env.PORT || 3000);
const isProduction = process.env.NODE_ENV === 'production';

function getGeminiClient(): GoogleGenAI | null {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey || apiKey === 'MY_GEMINI_API_KEY') {
    return null;
  }
  return new GoogleGenAI({
    apiKey,
    httpOptions: {
      headers: {
        'User-Agent': 'aistudio-build',
      },
    },
  });
}

function formatGeminiError(error: unknown): { status: number; message: string } {
  const raw = error instanceof Error ? error.message : String(error ?? 'Unknown Gemini API error');
  if (raw.includes('API_KEY_INVALID') || raw.includes('PERMISSION_DENIED') || raw.includes('403')) {
    return {
      status: 403,
      message: 'Gemini API key was rejected or lacks permission. Please verify GEMINI_API_KEY in Settings > Secrets.',
    };
  }
  if (raw.includes('RESOURCE_EXHAUSTED') || raw.includes('429')) {
    return {
      status: 429,
      message: 'Gemini API rate or quota limit reached. Please retry shortly or select a billing-enabled key in Settings > Secrets.',
    };
  }
  if (raw.includes('NOT_FOUND') || raw.includes('404')) {
    return {
      status: 404,
      message: `Requested Gemini model was not found (${raw}).`,
    };
  }
  return {
    status: 502,
    message: raw,
  };
}

function buildRoleSystemInstruction(role: string, contextSummary?: string): string {
  const roleContext: Record<string, string> = {
    patient:
      'You are assisting a Patient or family caregiver on KAIROS. Help explain OPD booking, QR token queues, Specialist Connect, Diagnostic Connect, and what to prepare before an emergency transfer in clear, calm, plain language.',
    doctor:
      'You are assisting a Referring Clinician on KAIROS. Help organize clinical observations into concise ISBAR handovers, check required receiving facilities, verify missing handover items, and explain bed-hold and escalation workflows.',
    hospital:
      'You are assisting a Receiving Hospital Command Desk officer on KAIROS. Help review incoming referrals, summarize bed-hold timers, OPD queue adjustments, and receiving emergency department readiness checklists.',
    ambulance:
      'You are assisting an Ambulance Paramedic Team on KAIROS. Keep responses brief, scannable, and action-oriented for transfer status, route handover checklists, and recording in-transit vitals.',
    diagnostic:
      'You are assisting a Diagnostic Centre Coordinator on KAIROS. Help with lab slot coordination, specimen/report turnaround communications, and patient preparation instructions.',
    admin:
      'You are assisting a KAIROS Network Administrator. Help analyze coordination metrics, escalation trends, governance/DPDP consent workflows, and HL7 FHIR R4 interoperability.',
    visitor:
      'You are KAIROS Assistant on the KAIROS Golden Hour Rescue Platform. Explain how KAIROS connects Smart OPD, Specialist Connect, Diagnostic Connect, and Accept-Before-You-Move Emergency Hospital Coordination.',
  };

  const base = roleContext[role] ?? roleContext.visitor;
  const safety =
    ' CRITICAL SAFETY GUARDRAIL: You are a healthcare coordination and handover assistant—NEVER diagnose medical conditions, NEVER prescribe or recommend medications or clinical treatments, and always remind users that licensed clinicians and local emergency services (108/112) govern medical decisions. Keep answers clear, well-structured, and concise.';

  return contextSummary
    ? `${base}${safety}\n\nCurrent live workspace snapshot (DEMO DATA unless verified):\n${contextSummary.slice(0, 1500)}`
    : `${base}${safety}`;
}

interface ChatHistoryTurn {
  role: 'user' | 'model';
  text: string;
}

interface ExtractedMapPlace {
  title: string;
  uri: string;
  placeId?: string;
  reviewSnippets: Array<{ text: string; uri?: string }>;
}

const VALID_VOICES = new Set(['Zephyr', 'Kore', 'Puck', 'Charon', 'Fenrir']);

async function startServer() {
  const app = express();
  app.use(express.json({ limit: '20mb' }));

  app.get('/api/health', (_req, res) => {
    res.json({
      status: 'ok',
      platform: 'KAIROS – The Golden Hour Rescue Platform',
      fhirVersion: 'R4',
      abdmReady: true,
      aiCapabilities: {
        chat: ['gemini-4-hydrogen', 'gemini-3.1-flash-lite'],
        liveVoice: 'gemini-3.8-live',
        transcribe: 'gemini-3.5-transcribe',
        mapsGrounding: 'gemini-4-hydrogen',
      },
      timestamp: new Date().toISOString(),
    });
  });

  app.get('/api/maps/config', (_req, res) => {
    const key = process.env.VITE_GOOGLE_MAPS_API_KEY || process.env.GOOGLE_MAPS_API_KEY || '';
    res.json({
      hasMapsKey: Boolean(key && key !== 'MY_GOOGLE_MAPS_API_KEY'),
      mapsApiKey: key && key !== 'MY_GOOGLE_MAPS_API_KEY' ? key : '',
    });
  });

  /**
   * 1. Multi-Turn Gemini Chatbot
   * Supports conversation history + role-specific system instructions.
   * Uses standard non-paid models: gemini-4-hydrogen (general / high reasoning)
   * and gemini-3.1-flash-lite (fast responses).
   */
  app.post('/api/ai/chat', async (req, res) => {
    const {
      message,
      history = [],
      mode = 'general',
      role = 'visitor',
      contextSummary = '',
    } = req.body ?? {};

    if (!message || typeof message !== 'string' || !message.trim()) {
      return res.status(400).json({ error: 'Please enter a message to send to KAIROS Assistant.' });
    }

    const ai = getGeminiClient();
    if (!ai) {
      return res.status(503).json({
        error: 'Gemini API key is not configured on the server. Please configure GEMINI_API_KEY in Settings > Secrets.',
      });
    }

    const selectedMode =
      mode === 'fast' || mode === 'deep' || mode === 'general' ? mode : 'general';
    const model =
      selectedMode === 'fast' ? 'gemini-3.1-flash-lite' : 'gemini-4-hydrogen';

    const sanitizedHistory: Array<{ role: 'user' | 'model'; parts: Array<{ text: string }> }> =
      Array.isArray(history)
        ? history
            .filter(
              (t: unknown): t is ChatHistoryTurn =>
                Boolean(
                  t &&
                    typeof t === 'object' &&
                    ((t as ChatHistoryTurn).role === 'user' ||
                      (t as ChatHistoryTurn).role === 'model') &&
                    typeof (t as ChatHistoryTurn).text === 'string' &&
                    (t as ChatHistoryTurn).text.trim().length > 0
                )
            )
            .slice(-24)
            .map((t) => ({
              role: t.role,
              parts: [{ text: t.text.slice(0, 4000) }],
            }))
        : [];

    try {
      const chatConfig: {
        systemInstruction: string;
        thinkingConfig?: { thinkingLevel: ThinkingLevel };
      } = {
        systemInstruction: buildRoleSystemInstruction(
          typeof role === 'string' ? role : 'visitor',
          typeof contextSummary === 'string' ? contextSummary : ''
        ),
      };

      if (selectedMode === 'deep') {
        chatConfig.thinkingConfig = { thinkingLevel: ThinkingLevel.HIGH };
      } else if (selectedMode === 'general') {
        chatConfig.thinkingConfig = { thinkingLevel: ThinkingLevel.MEDIUM };
      }

      const chat = ai.chats.create({
        model,
        history: sanitizedHistory,
        config: chatConfig,
      });

      const response = await chat.sendMessage({
        message: message.trim().slice(0, 4000),
      });

      const reply = response.text?.trim();
      if (!reply) {
        return res.status(502).json({ error: 'Empty response returned from Gemini API.' });
      }

      return res.json({
        reply,
        model,
        mode: selectedMode,
      });
    } catch (error) {
      console.error('Gemini chat error:', error);
      const formatted = formatGeminiError(error);
      return res.status(formatted.status).json({ error: formatted.message });
    }
  });

  /**
   * 2. Audio Transcription using gemini-3.5-transcribe
   * Accepts base64-encoded audio recorded from the microphone or uploaded by the user.
   */
  app.post('/api/ai/transcribe', async (req, res) => {
    const { audioBase64, mimeType = 'audio/webm', contextHint = '' } = req.body ?? {};

    if (!audioBase64 || typeof audioBase64 !== 'string') {
      return res.status(400).json({ error: 'No audio payload provided for transcription.' });
    }

    const ai = getGeminiClient();
    if (!ai) {
      return res.status(503).json({
        error: 'Gemini API key is not configured on the server. Please configure GEMINI_API_KEY in Settings > Secrets.',
      });
    }

    const cleanMime =
      typeof mimeType === 'string' && mimeType.startsWith('audio/')
        ? mimeType.split(';')[0].trim()
        : 'audio/webm';

    const prompt = contextHint
      ? `Transcribe this audio accurately verbatim. Context: ${String(contextHint).slice(0, 200)}. Preserve clinical abbreviations (such as BP, HR, SpO2, RR, ICU, ISBAR, OPD, ECG) accurately. Return only the clean transcript text.`
      : 'Transcribe this audio accurately verbatim. Preserve any healthcare or location terms cleanly. Return only the transcript text.';

    try {
      const response = await ai.models.generateContent({
        model: 'gemini-3.5-transcribe',
        contents: {
          parts: [
            {
              inlineData: {
                mimeType: cleanMime,
                data: audioBase64,
              },
            },
            { text: prompt },
          ],
        },
      });

      const transcript = response.text?.trim();
      if (!transcript) {
        return res.status(502).json({
          error: 'No speech could be transcribed from the recording. Please try speaking closer to the microphone.',
        });
      }

      return res.json({
        transcript,
        model: 'gemini-3.5-transcribe',
      });
    } catch (error) {
      console.error('Gemini transcription error:', error);
      const formatted = formatGeminiError(error);
      return res.status(formatted.status).json({ error: formatted.message });
    }
  });

  /**
   * 3. Google Maps Grounding using gemini-4-hydrogen with googleMaps tool
   * Returns grounded Markdown text plus extracted Google Maps place URLs & review snippets.
   */
  app.post('/api/ai/maps-grounding', async (req, res) => {
    const { query, latitude, longitude } = req.body ?? {};

    if (!query || typeof query !== 'string' || !query.trim()) {
      return res.status(400).json({
        error: 'Please enter a location or facility query (e.g., 24/7 emergency hospitals nearby).',
      });
    }

    const ai = getGeminiClient();
    if (!ai) {
      return res.status(503).json({
        error: 'Gemini API key is not configured on the server. Please configure GEMINI_API_KEY in Settings > Secrets.',
      });
    }

    const hasValidCoords =
      typeof latitude === 'number' &&
      Number.isFinite(latitude) &&
      typeof longitude === 'number' &&
      Number.isFinite(longitude);

    try {
      const response = await ai.models.generateContent({
        model: 'gemini-4-hydrogen',
        contents: query.trim().slice(0, 800),
        config: {
          systemInstruction:
            'You are KAIROS Location & Facility Finder powered by Google Maps grounding. ' +
            'Provide accurate, up-to-date nearby healthcare facility information (hospitals, trauma centres, blood banks, pharmacies, diagnostic labs) using Google Maps data. ' +
            'Include practical details such as address/area, emergency or 24-hour status if known, and highlight that live ICU bed availability should always be confirmed directly with the receiving hospital.',
          tools: [{ googleMaps: {} }],
          ...(hasValidCoords
            ? {
                toolConfig: {
                  retrievalConfig: {
                    latLng: {
                      latitude,
                      longitude,
                    },
                  },
                },
              }
            : {}),
        },
      });

      const text = response.text?.trim() || '';
      const rawChunks =
        (response.candidates?.[0]?.groundingMetadata?.groundingChunks as Array<{
          maps?: {
            uri?: string;
            title?: string;
            placeId?: string;
            placeAnswerSources?: {
              reviewSnippets?: Array<{
                content?: string;
                text?: string;
                uri?: string;
                googleMapsUri?: string;
              }>;
            };
          };
        }>) ?? [];

      const placesMap = new Map<string, ExtractedMapPlace>();
      for (const chunk of rawChunks) {
        if (!chunk?.maps?.uri) continue;
        const key = chunk.maps.uri;
        const snippets: Array<{ text: string; uri?: string }> = [];
        const rawSnippets = chunk.maps.placeAnswerSources?.reviewSnippets ?? [];
        for (const s of rawSnippets) {
          const snippetText = (s.content || s.text || '').trim();
          const snippetUri = s.googleMapsUri || s.uri;
          if (snippetText || snippetUri) {
            snippets.push({
              text: snippetText || 'View place review on Google Maps',
              uri: snippetUri,
            });
          }
        }
        const existing = placesMap.get(key);
        if (existing) {
          existing.reviewSnippets.push(...snippets);
        } else {
          placesMap.set(key, {
            title: chunk.maps.title || 'Google Maps Location',
            uri: chunk.maps.uri,
            placeId: chunk.maps.placeId,
            reviewSnippets: snippets,
          });
        }
      }

      return res.json({
        text: text || 'Here are the grounded Google Maps locations matching your search.',
        places: Array.from(placesMap.values()),
        model: 'gemini-4-hydrogen',
        usedCoordinates: hasValidCoords ? { latitude, longitude } : null,
      });
    } catch (error) {
      console.error('Gemini Maps Grounding error:', error);
      const formatted = formatGeminiError(error);
      return res.status(formatted.status).json({ error: formatted.message });
    }
  });

  /**
   * Non-diagnostic ISBAR Clinical Handover & Bed-Readiness Assistant.
   * Uses Gemini (gemini-4-hydrogen) strictly for formatting clinician-entered
   * handover notes and checking completeness—never diagnoses or recommends treatment.
   */
  app.post('/api/ai/isbar-assistant', async (req, res) => {
    const {
      patientInitials,
      ageSex,
      category,
      urgency,
      symptoms,
      vitals,
      requiredFacilities,
      targetHospital,
      hospitalCapacityNote,
      question,
    } = req.body ?? {};

    if (!symptoms && !question) {
      return res.status(400).json({
        error: 'Provide clinical handover notes or a coordination question.',
      });
    }

    const ai = getGeminiClient();
    if (!ai) {
      return res.status(503).json({
        error: 'Gemini API key is not configured on the server. Configure GEMINI_API_KEY in Settings > Secrets to use live AI ISBAR drafting.',
      });
    }

    try {
      const prompt = [
        `Clinician Coordination Request:`,
        patientInitials ? `Patient: ${String(patientInitials).slice(0, 60)} (${String(ageSex || 'Age/Sex not specified').slice(0, 30)})` : '',
        category ? `Emergency Category: ${String(category).slice(0, 80)} | Urgency: ${String(urgency || 'unspecified').slice(0, 20)}` : '',
        vitals ? `Recorded Vitals: HR ${vitals.heartRate ?? '?'} bpm, BP ${vitals.bp ?? '?'}, SpO2 ${vitals.spo2 ?? '?'}%, Temp ${vitals.temperatureC ?? '?'} C, RR ${vitals.respRate ?? '?'}/min` : '',
        symptoms ? `Clinician Observations: ${String(symptoms).slice(0, 1200)}` : '',
        Array.isArray(requiredFacilities) && requiredFacilities.length > 0
          ? `Requested Facilities: ${requiredFacilities.slice(0, 10).join(', ')}`
          : '',
        targetHospital ? `Selected Receiving Hospital: ${String(targetHospital).slice(0, 140)}` : '',
        hospitalCapacityNote ? `Verified Bed Status Note: ${String(hospitalCapacityNote).slice(0, 300)}` : '',
        question ? `Clinician Question: ${String(question).slice(0, 600)}` : '',
      ]
        .filter(Boolean)
        .join('\n');

      const response = await ai.models.generateContent({
        model: 'gemini-4-hydrogen',
        contents: prompt,
        config: {
          systemInstruction:
            'You are KAIROS Assistant, a strictly non-diagnostic healthcare handover coordinator. ' +
            'Format clinician-provided notes into concise ISBAR sections (Identify, Situation, Background, Assessment Observations, Logistics/Resource Readiness), ' +
            'highlight any missing handover documentation fields (such as allergies, symptom onset time, or ECG/lab attachment), and summarize verified hospital bed-readiness logistics. ' +
            'CRITICAL SAFETY RULE: NEVER diagnose a patient, NEVER suggest medications or clinical treatments, and always end with a single-line reminder that clinician judgment and local emergency protocols govern all care. Keep output under 220 words in clean plain text.',
        },
      });

      const summary = response.text?.trim();
      if (!summary) {
        return res.status(502).json({ error: 'Empty response returned from Gemini API.' });
      }

      return res.json({
        summary,
        model: 'gemini-4-hydrogen',
        disclaimer: 'Non-diagnostic handover draft only. Clinician verification required before dispatch.',
      });
    } catch (error) {
      console.error('Gemini ISBAR assistant error:', error);
      const formatted = formatGeminiError(error);
      return res.status(formatted.status).json({ error: formatted.message });
    }
  });

  if (!isProduction) {
    const { createServer: createViteServer } = await import('vite');
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distDir = path.resolve(__dirname, 'dist');
    app.use(express.static(distDir));
    app.get('*', (_req, res) => {
      const indexFile = path.join(distDir, 'index.html');
      if (fs.existsSync(indexFile)) {
        res.sendFile(indexFile);
      } else {
        res.status(404).send('Build output missing. Run npm run build.');
      }
    });
  }

  /**
   * 4. Real-Time Voice Conversations via Gemini Live API (gemini-3.8-live)
   * Bridges browser 16kHz PCM mic stream -> Gemini Live API -> 24kHz PCM audio + live transcripts.
   */
  const server = http.createServer(app);
  const liveWss = new WebSocketServer({ noServer: true });

  server.on('upgrade', (request, socket, head) => {
    try {
      const url = new URL(request.url || '/', `http://${request.headers.host || 'localhost'}`);
      if (url.pathname === '/api/ai/live') {
        liveWss.handleUpgrade(request, socket, head, (ws) => {
          liveWss.emit('connection', ws, request);
        });
      }
    } catch {
      socket.destroy();
    }
  });

  liveWss.on('connection', async (clientWs: WebSocket, request: http.IncomingMessage) => {
    const ai = getGeminiClient();
    if (!ai) {
      clientWs.send(
        JSON.stringify({
          error: 'Gemini API key is not configured on the server. Please configure GEMINI_API_KEY in Settings > Secrets.',
        })
      );
      clientWs.close();
      return;
    }

    const reqUrl = new URL(request.url || '/api/ai/live', `http://${request.headers.host || 'localhost'}`);
    const requestedVoice = reqUrl.searchParams.get('voice') || 'Zephyr';
    const voiceName = VALID_VOICES.has(requestedVoice) ? requestedVoice : 'Zephyr';
    const role = reqUrl.searchParams.get('role') || 'visitor';

    let closed = false;
    let liveSession: Awaited<ReturnType<typeof ai.live.connect>> | null = null;

    const safeSend = (payload: Record<string, unknown>) => {
      if (!closed && clientWs.readyState === 1) {
        clientWs.send(JSON.stringify(payload));
      }
    };

    const sessionPromise = ai.live
      .connect({
        model: 'gemini-3.8-live',
        config: {
          responseModalities: [Modality.AUDIO],
          speechConfig: {
            voiceConfig: {
              prebuiltVoiceConfig: { voiceName },
            },
          },
          inputAudioTranscription: {},
          outputAudioTranscription: {},
          systemInstruction:
            buildRoleSystemInstruction(role) +
            ' You are speaking in a real-time voice conversation—keep spoken answers concise, calm, natural, and under 3 sentences per turn unless asked for more detail.',
        },
        callbacks: {
          onopen: () => {
            safeSend({ ready: true, model: 'gemini-3.8-live', voice: voiceName });
          },
          onmessage: (message: LiveServerMessage) => {
            const content = message.serverContent;
            if (content?.inputTranscription?.text) {
              safeSend({ inputTranscript: content.inputTranscription.text });
            }
            if (content?.outputTranscription?.text) {
              safeSend({ outputTranscript: content.outputTranscription.text });
            }
            for (const part of content?.modelTurn?.parts ?? []) {
              if (part.inlineData?.data) {
                safeSend({ audio: part.inlineData.data });
              }
            }
            if (content?.interrupted) {
              safeSend({ interrupted: true });
            }
            if (content?.turnComplete) {
              safeSend({ turnComplete: true });
            }
          },
          onerror: (err: unknown) => {
            console.error('Gemini Live session error:', err);
            const formatted = formatGeminiError(err);
            safeSend({ error: formatted.message });
          },
          onclose: () => {
            if (!closed) {
              safeSend({ closed: true });
            }
          },
        },
      })
      .then((session) => {
        liveSession = session;
        if (closed) {
          try {
            session.close();
          } catch {
            // ignore cleanup error
          }
        }
        return session;
      })
      .catch((err) => {
        console.error('Failed to open Gemini Live session:', err);
        const formatted = formatGeminiError(err);
        safeSend({ error: formatted.message });
        clientWs.close();
        return null;
      });

    clientWs.on('message', (raw) => {
      let parsed: { audio?: string; text?: string } | null = null;
      try {
        parsed = JSON.parse(raw.toString()) as { audio?: string; text?: string };
      } catch {
        return;
      }
      if (!parsed) return;

      sessionPromise.then((session) => {
        if (!session || closed) return;
        try {
          if (parsed?.audio) {
            session.sendRealtimeInput({
              audio: {
                data: parsed.audio,
                mimeType: 'audio/pcm;rate=16000',
              },
            });
          } else if (parsed?.text && parsed.text.trim()) {
            session.sendRealtimeInput({
              text: parsed.text.trim().slice(0, 1000),
            });
          }
        } catch (sendErr) {
          console.error('Error sending Live input:', sendErr);
        }
      });
    });

    clientWs.on('close', () => {
      closed = true;
      if (liveSession) {
        try {
          liveSession.close();
        } catch {
          // ignore cleanup error
        }
        liveSession = null;
      }
    });

    clientWs.on('error', () => {
      closed = true;
      if (liveSession) {
        try {
          liveSession.close();
        } catch {
          // ignore cleanup error
        }
        liveSession = null;
      }
    });
  });

  server.listen(PORT, '0.0.0.0', () => {
    console.log(`KAIROS server running at http://0.0.0.0:${PORT}`);
  });
}

startServer().catch((err) => {
  console.error('Failed to start KAIROS server:', err);
  process.exit(1);
});
