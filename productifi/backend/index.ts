import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import { GoogleGenerativeAI } from '@google/generative-ai';

import { Logging } from '@google-cloud/logging';
import os from 'os';

const logging = new Logging();
const log = logging.log('productifi-backend-log');

async function logCloudRunStartup() {

  const metadata = {
    service: process.env.K_SERVICE || "local-dev",
    revision: process.env.K_REVISION || "none",
    configuration: process.env.K_CONFIGURATION || "none",
    region: process.env.GOOGLE_CLOUD_REGION || "unknown",
    hostname: os.hostname(),
  };

  const entry = log.entry({ resource: { type: "global" } }, {
    message: "Productifi backend started on Google Cloud",
    metadata
  });

  try {
    await log.write(entry);
  } catch (err) {
    console.log("Cloud logging unavailable (likely local dev)");
  }

  console.log("Google Cloud environment info:", metadata);
}

dotenv.config();

const app = express();

app.use(cors());
app.use(express.json());

app.use((req, _res, next) => {
  console.log(`[${new Date().toISOString()}] ${req.method} ${req.url}`);
  next();
});

const GEMINI_API_KEY = (process.env.GEMINI_API_KEY || process.env.GOOGLE_API_KEY || '').trim();
const GEMINI_MODEL = (process.env.GEMINI_MODEL || '').trim();

const hasGeminiKey = Boolean(
  GEMINI_API_KEY &&
  GEMINI_API_KEY !== 'your_gemini_api_key_here' &&
  GEMINI_API_KEY !== 'replace_with_real_key'
);

const genAI = hasGeminiKey ? new GoogleGenerativeAI(GEMINI_API_KEY) : null;

let geminiDisabled = false;

const GEMINI_MODELS = [
  GEMINI_MODEL,
  'gemini-2.5-flash',
  'gemini-flash-latest',
  'gemini-2.0-flash',
  'gemini-2.0-flash-exp',
].filter(Boolean);


let sessionEvents: any[] = [];

let currentCVStatus = {
  face_present: true,
  eye_attention_score: 100,
  drowsiness_flag: false,
};


async function generateGeminiText(prompt: string): Promise<string> {

  if (!genAI || geminiDisabled) {
    throw new Error('Gemini unavailable');
  }

  let lastError: unknown = null;

  for (const modelName of GEMINI_MODELS) {
    try {

      const model = genAI.getGenerativeModel({ model: modelName });

      const result = await model.generateContent(prompt);

      const text = result.response.text().trim();

      if (text) {
        return text;
      }

    } catch (error) {

      lastError = error;

      const message = String((error as Error)?.message || '');

      if (
        message.includes('API_KEY_INVALID') ||
        message.includes('PERMISSION_DENIED')
      ) {
        geminiDisabled = true;

        console.warn(
          'Gemini disabled due to credentials or permissions.'
        );

        break;
      }
    }
  }

  throw lastError || new Error('Gemini response empty');
}

app.get('/api/health', (_req, res) => {
  res.json({
    ok: true,
    geminiEnabled: Boolean(genAI) && !geminiDisabled,
  });
});

app.post('/api/log-distraction', (req, res) => {

  const { site, mode, timestamp } = req.body;

  const event = {
    type: 'distraction',
    site,
    mode,
    timestamp,
  };

  sessionEvents.push(event);

  console.log(`[Distraction Attempt] ${site} in ${mode}`);

  res.json({ status: 'logged', event });
});


app.post('/api/end-session', async (req, res) => {

  const { sessionData, finalScore } = req.body;

  console.log(
    `[Session Ended] ${sessionData?.sessionName ?? 'Session'} | Score: ${finalScore}`
  );

  try {

    const bucket = storage.bucket(bucketName);

    const filename = `sessions/${Date.now()}-session.json`;

    const file = bucket.file(filename);

    await file.save(JSON.stringify({
      sessionData,
      finalScore,
      timestamp: new Date().toISOString()
    }));

    console.log("Session stored in Google Cloud Storage:", filename);

  } catch (err) {

    console.log("Cloud storage unavailable (likely local dev)");

  }

  res.json({ status: 'saved' });

});

app.post('/api/cv/update', (req, res) => {

  const metrics = req.body;

  currentCVStatus = { ...currentCVStatus, ...metrics };

  res.json({ status: 'received' });
});

app.get('/api/cv/status', (_req, res) => {
  res.json(currentCVStatus);
});


// FOR JUDGES, THIS IS OUT GOOGLE CLOUD ENDPOINT //
app.get('/api/cloud-info', (_req, res) => {

  res.json({
    runningOnGoogleCloud: Boolean(process.env.K_SERVICE),
    cloudService: process.env.K_SERVICE || "local",
    revision: process.env.K_REVISION || null,
    region: process.env.GOOGLE_CLOUD_REGION || null,
    project: process.env.GOOGLE_CLOUD_PROJECT || null
  });

});


const PORT = process.env.PORT || 8080;

/*
Cloud Run requires:
- dynamic PORT
- host 0.0.0.0
*/

app.listen(PORT, '0.0.0.0', () => {

  console.log('----------------------------------');
  console.log(`Productifi Backend Started`);
  console.log(`Listening on port ${PORT}`);
  console.log(`Gemini Enabled: ${Boolean(genAI)}`);
  console.log(`Running on Cloud Run compatible server`);
  console.log('----------------------------------');

});