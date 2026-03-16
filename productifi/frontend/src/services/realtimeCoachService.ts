const PRODUCTIFI_AI_URL = import.meta.env.VITE_PRODUCTIFI_API_URL || 'http://localhost:5001';

export type CoachTrigger = 'score-drop' | 'conversation' | 'look-away';

export interface RealtimeCoachPayload {
  score: number;
  distractions: number;
  away: number;
  talking: number;
  trigger?: CoachTrigger;
  minutesRemaining?: number;
  sessionGoal?: string;
}

function fallbackCoachMessage(data: RealtimeCoachPayload): string {
  const minutes = Math.max(1, Math.round(data.minutesRemaining ?? 10));

  if (data.trigger === 'conversation') {
    return `Hey, quick reset: pause talking, take one deep breath, and give me 2 quiet minutes on just this task.`;
  }

  if (data.trigger === 'look-away') {
    return `Eyes back on your screen. Close one distracting tab and finish a focused ${Math.min(minutes, 5)} minute sprint right now.`;
  }

  if (data.score <= 40) {
    return `You are not off track, just off rhythm. Breathe once, silence distractions, and win the next 3 minutes.`;
  }
  if (data.away >= 4) {
    return 'Bring your eyes back to the task. One tab, one target, and finish one small step before checking anything else.';
  }
  if (data.talking >= 3) {
    return 'Conversation is pulling your focus down. Go silent, set a 3 minute mini goal, and complete it before speaking again.';
  }
  return 'Focus dipped for a moment. Pick the next concrete action and stay with it until completion.';
}

export async function generateRealtimeCoachMessage(data: RealtimeCoachPayload): Promise<string> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 2800);

  try {
    const response = await fetch(`${PRODUCTIFI_AI_URL}/api/ai/realtime-coach`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
      signal: controller.signal,
    });

    if (!response.ok) throw new Error(`Request failed (${response.status})`);

    const payload = await response.json() as { ok?: boolean; message?: string };
    if (payload.ok && typeof payload.message === 'string' && payload.message.trim().length > 0) {
      return payload.message.trim();
    }
  } catch (error) {
    console.warn('[RealtimeCoach] backend request failed, using fallback:', error);
  } finally {
    clearTimeout(timeout);
  }

  return fallbackCoachMessage(data);
}
