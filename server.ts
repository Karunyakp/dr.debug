import 'dotenv/config';
import express from 'express';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { GoogleGenAI } from '@google/genai';

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

async function startServer() {
  const app = express();
  app.use(express.json({ limit: '1mb' }));

  app.get('/api/health', (_req, res) => {
    res.json({
      status: 'ok',
      platform: 'KAIROS – The Golden Hour Rescue Platform',
      fhirVersion: 'R4',
      abdmReady: true,
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
      const message = error instanceof Error ? error.message : 'Unable to reach Gemini API.';
      return res.status(502).json({ error: message });
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

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`KAIROS server running at http://0.0.0.0:${PORT}`);
  });
}

startServer().catch((err) => {
  console.error('Failed to start KAIROS server:', err);
  process.exit(1);
});
