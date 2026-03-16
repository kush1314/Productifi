import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import { GoogleGenerativeAI } from '@google/generative-ai';

dotenv.config();

const app = express();
app.use(cors());
app.use(express.json());

const GEMINI_API_KEY = (process.env.GEMINI_API_KEY || process.env.GOOGLE_API_KEY || '').trim();
const GEMINI_MODEL = (process.env.GEMINI_MODEL || '').trim();
const hasGeminiKey = Boolean(
  GEMINI_API_KEY
  && GEMINI_API_KEY !== 'your_gemini_api_key_here'
  && GEMINI_API_KEY !== 'replace_with_real_key'
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

// In-memory store for session logs from the frontend or CV Python service
let sessionEvents: any[] = [];
let currentCVStatus = {
  face_present: true,
  eye_attention_score: 100,
  drowsiness_flag: false,
};

interface FocusReportData {
  score: number;
  focusConsistency: number;
  distractionResistance: number;
  distractions: number;
  away: number;
  talking: number;
  notifications: number;
  sessionName?: string;
  sessionType?: string;
  goal?: string;
  durationMinutes?: number;
  plannedMinutes?: number;
  harshness?: string;
}

interface RealtimeCoachData {
  score: number;
  distractions: number;
  away: number;
  talking: number;
  trigger: 'score-drop' | 'conversation' | 'look-away';
  minutesRemaining: number;
  sessionGoal: string;
}

function fallbackFocusReport(data: FocusReportData) {
  const summary = data.score >= 80
    ? `Strong session: focus score ${data.score}/100 with ${data.distractions} distraction event${data.distractions === 1 ? '' : 's'}.`
    : data.score >= 60
      ? `Solid session: focus score ${data.score}/100, but ${data.distractions} distraction event${data.distractions === 1 ? '' : 's'} affected consistency.`
      : `Challenging session: focus score ${data.score}/100 with frequent interruptions and attention drops.`;

  const strengths: string[] = [];
  if (data.focusConsistency >= 70) strengths.push('You maintained good attention consistency through most of the session.');
  if (data.distractionResistance >= 70) strengths.push('You recovered quickly after distractions.');
  if (data.notifications <= 2) strengths.push('You needed very few nudges to refocus.');
  if (strengths.length === 0) strengths.push('You completed the full focus session and gathered useful data.');

  const improvements: string[] = [];
  if (data.talking > 3) improvements.push('Reduce conversation interruptions during focus blocks.');
  if (data.away > 3) improvements.push('Minimize look-away moments by keeping one clear task visible.');
  if (data.notifications > 4) improvements.push('Use a stricter environment: close non-essential tabs and mute notifications.');
  if (improvements.length === 0) improvements.push('Increase next session duration by 5-10 minutes to build momentum.');

  const distractionPattern = data.talking > data.away
    ? `Primary pattern: verbal interruptions (${data.talking} talking events).`
    : data.away > 0
      ? `Primary pattern: visual drift (${data.away} look-away events).`
      : 'No dominant distraction pattern detected.';

  const nextSessionTip = data.score >= 80
    ? 'Keep the same setup and stretch your session length slightly.'
    : 'Start the next session with one concrete objective and close all unrelated tabs first.';

  return {
    summary,
    strengths,
    improvements,
    distractionPattern,
    nextSessionTip,
    encouragement: data.score >= 75
      ? 'Great work. Your consistency is improving session by session.'
      : 'You are building momentum. Small focus wins compound quickly.',
  };
}

function fallbackRealtimeCoach(data: RealtimeCoachData): string {
  if (data.trigger === 'conversation') {
    return `Hey, quick reset: pause talking, take one breath, and lock in for the next 2 minutes on your current task.`;
  }
  if (data.trigger === 'look-away') {
    return `Eyes back on screen. Close one distracting tab and complete one clear step before checking anything else.`;
  }
  if (data.score <= 40) {
    return 'You are not failing, you are just off rhythm. Breathe once and win the next 3 focused minutes.';
  }
  if (data.away >= 4) {
    return 'Bring your gaze back to the task. One tab, one target, then finish one small milestone.';
  }
  if (data.talking >= 3) {
    return 'Conversation is pulling your focus down. Go quiet now and complete one concrete action before speaking again.';
  }
  return 'Focus dipped briefly. Recenter on the next action and stay with it until done.';
}

function sanitizeReportInput(raw: any): FocusReportData {
  return {
    score: Number(raw?.score ?? 0),
    focusConsistency: Number(raw?.focusConsistency ?? raw?.score ?? 0),
    distractionResistance: Number(raw?.distractionResistance ?? 0),
    distractions: Number(raw?.distractions ?? 0),
    away: Number(raw?.away ?? 0),
    talking: Number(raw?.talking ?? 0),
    notifications: Number(raw?.notifications ?? 0),
    sessionName: String(raw?.sessionName ?? 'Focus Session'),
    sessionType: String(raw?.sessionType ?? 'General Work'),
    goal: String(raw?.goal ?? 'Maintain focus'),
    durationMinutes: Number(raw?.durationMinutes ?? 0),
    plannedMinutes: Number(raw?.plannedMinutes ?? 0),
    harshness: String(raw?.harshness ?? 'realistic'),
  };
}

async function generateGeminiText(prompt: string): Promise<string> {
  if (!genAI || geminiDisabled) {
    throw new Error('Gemini unavailable: API key not configured');
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
      if (message.includes('API_KEY_INVALID') || message.includes('PERMISSION_DENIED')) {
        geminiDisabled = true;
        console.warn('Gemini disabled due to invalid credentials or permission errors. Falling back to local coaching responses.');
        break;
      }
    }
  }

  throw lastError || new Error('Gemini response was empty');
}

// ==========================================
// FRONTEND API ROUTES
// ==========================================

app.get('/api/health', (_req, res) => {
  res.json({ ok: true, geminiEnabled: Boolean(genAI) && !geminiDisabled });
});

app.post('/api/log-distraction', (req, res) => {
  const { site, mode, timestamp } = req.body;
  const event = { type: 'distraction', site, mode, timestamp };
  sessionEvents.push(event);
  console.log(`[Event Logged] Distraction Attempt: ${site} in ${mode}`);
  res.json({ status: 'logged', event });
});

app.post('/api/end-session', (req, res) => {
  const { sessionData, finalScore } = req.body;
  console.log(`[Session Ended] ${sessionData?.sessionName ?? 'Session'} | Score: ${finalScore}`);
  res.json({ status: 'saved' });
});

app.post('/api/ai/focus-report', async (req, res) => {
  const data = sanitizeReportInput(req.body?.data ?? req.body);

  if (!genAI || geminiDisabled) {
    return res.json({ ok: true, source: 'fallback', report: fallbackFocusReport(data) });
  }

  try {
    const prompt = `You are a productivity coach for Productifi.
Return ONLY valid JSON with keys:
summary, strengths (array), improvements (array), distractionPattern, nextSessionTip, encouragement.

Analyze this focus session:
- Session: ${data.sessionName}
- Type: ${data.sessionType}
- Goal: ${data.goal}
- Duration: ${data.durationMinutes} min (planned ${data.plannedMinutes} min)
- Harshness: ${data.harshness}

Metrics:
- Focus score: ${data.score}
- Focus consistency: ${data.focusConsistency}
- Distraction resistance: ${data.distractionResistance}
- Distractions: ${data.distractions}
- Time away events: ${data.away}
- Speaking detected: ${data.talking}
- Refocus notifications: ${data.notifications}

Requirements:
- summary: 2-3 short sentences
- improvements: 3 concrete actions
- encouragement: 1 motivational sentence
- keep tone concise and actionable.`;

  const text = await generateGeminiText(prompt);
    const match = text.match(/\{[\s\S]*\}/);
    if (!match) {
      return res.json({ ok: true, source: 'fallback', report: fallbackFocusReport(data) });
    }

    const parsed = JSON.parse(match[0]);
    return res.json({
      ok: true,
      source: 'gemini',
      report: {
        summary: String(parsed.summary || ''),
        strengths: Array.isArray(parsed.strengths) ? parsed.strengths.map(String) : [],
        improvements: Array.isArray(parsed.improvements) ? parsed.improvements.map(String) : [],
        distractionPattern: String(parsed.distractionPattern || ''),
        nextSessionTip: String(parsed.nextSessionTip || ''),
        encouragement: String(parsed.encouragement || ''),
      },
    });
  } catch (error) {
    console.error('[AI/focus-report] Gemini call failed:', error);
    return res.json({ ok: true, source: 'fallback', report: fallbackFocusReport(data) });
  }
});

app.post('/api/ai/realtime-coach', async (req, res) => {
  const data: RealtimeCoachData = {
    score: Number(req.body?.score ?? 0),
    distractions: Number(req.body?.distractions ?? 0),
    away: Number(req.body?.away ?? 0),
    talking: Number(req.body?.talking ?? 0),
    trigger: req.body?.trigger === 'conversation' || req.body?.trigger === 'look-away' ? req.body.trigger : 'score-drop',
    minutesRemaining: Math.max(1, Number(req.body?.minutesRemaining ?? 5)),
    sessionGoal: String(req.body?.sessionGoal ?? 'maintain focus'),
  };

  if (!genAI || geminiDisabled) {
    return res.json({ ok: true, source: 'fallback', message: fallbackRealtimeCoach(data) });
  }

  try {
    const prompt = `You are a real-time productivity coach with warm, direct personality.
User attention dropped during a focus session.

Current metrics:
- Attention score: ${data.score}
- Distractions: ${data.distractions}
- Look-away events: ${data.away}
- Speaking events: ${data.talking}
- Trigger: ${data.trigger}
- Minutes remaining: ${data.minutesRemaining}
- Session goal: ${data.sessionGoal}

Generate ONE practical coaching line that sounds genuine and human.
Requirements:
- 1 empathetic phrase + 1 specific action the user can do now
- include a concrete step (example: close one tab, 2-minute sprint, one next task)
- max 32 words
- no quotes, no numbering, no emojis.`;

  const text = (await generateGeminiText(prompt)).replace(/\s+/g, ' ').trim();
    const message = text.length > 0 ? text : fallbackRealtimeCoach(data);
    return res.json({ ok: true, source: 'gemini', message });
  } catch (error) {
    console.error('[AI/realtime-coach] Gemini call failed:', error);
    return res.json({ ok: true, source: 'fallback', message: fallbackRealtimeCoach(data) });
  }
});

// ==========================================
// COMPUTER VISION SERVICE HOOKS
// ==========================================

// The Python cv_service can POST updates to this endpoint over time
app.post('/api/cv/update', (req, res) => {
  const metrics = req.body;
  currentCVStatus = { ...currentCVStatus, ...metrics };
  res.json({ status: 'received' });
});

// The Frontend can GET this endpoint every second to update the dashboard
app.get('/api/cv/status', (_req, res) => {
  res.json(currentCVStatus);
});

const PORT = process.env.PORT || 5001;
app.listen(PORT, () => {
  console.log(`Productifi Backend running on port ${PORT}`);
  console.log(`Gemini enabled: ${Boolean(genAI)}`);
});
