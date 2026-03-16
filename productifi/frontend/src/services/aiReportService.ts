export interface ReportSummary {
  summary: string;
  strengths: string[];
  improvements: string[];
  distractionPattern: string;
  nextSessionTip: string;
  encouragement?: string;
}

const PRODUCTIFI_AI_URL = import.meta.env.VITE_PRODUCTIFI_API_URL || 'http://localhost:5001';

function buildFallback(sessionData: any, scoreInfo: any): ReportSummary {
  const { overallScore, focusConsistency, distractionResistance } = scoreInfo;
  const notifCount: number = sessionData.notificationCount ?? 0;
  const talkCount: number = sessionData.talkingDetections ?? 0;
  const lookCount: number = sessionData.lookAwayCount ?? 0;
  const mins = Math.round((sessionData.sessionSeconds ?? 0) / 60);

  const strengths: string[] = [];
  const improvements: string[] = [];

  if (focusConsistency >= 70) strengths.push('Strong focus consistency throughout the session.');
  if (distractionResistance >= 70) strengths.push('Good distraction resistance - you stayed on task.');
  if (overallScore >= 80) strengths.push('High overall attention score - great deep work.');
  if (notifCount <= 2) strengths.push('Minimal refocus nudges needed - very self-directed.');
  if (strengths.length === 0) strengths.push('You completed the session and tracked your focus.');

  if (talkCount > 3) improvements.push('Reduce verbal distractions - consider a quieter workspace or do-not-disturb mode.');
  if (lookCount > 3) improvements.push('Minimize looking away from screen - try closing unneeded browser tabs.');
  if (notifCount > 5) improvements.push('You needed frequent refocus nudges - try Strict Mode next session.');
  if (focusConsistency < 60) improvements.push('Work on consistency - Pomodoro (25/5) can help stabilize attention.');
  if (distractionResistance < 60) improvements.push('Disable phone notifications before your next session.');
  if (improvements.length === 0) improvements.push('Keep momentum - increase session length by 10 minutes next time.');

  const distractionPattern = talkCount > lookCount
    ? `The dominant distraction type was verbal (${talkCount} talking event${talkCount !== 1 ? 's' : ''}).`
    : lookCount > 0
      ? `The dominant distraction type was visual (${lookCount} look-away event${lookCount !== 1 ? 's' : ''}).`
      : 'No dominant distraction pattern - well controlled session.';

  const nextSessionTip = overallScore >= 80
    ? `Great session. Try extending to ${mins + 10} minutes next time.`
    : notifCount > 4
      ? 'Next session: enable Strict Mode and put your phone in another room before starting.'
      : 'Next session: set one clear intention before starting and keep only one primary tab open.';

  const summary = overallScore >= 80
    ? `You achieved a strong ${overallScore}/100 score over ${mins} minutes. ${distractionPattern}`
    : overallScore >= 60
      ? `Solid ${mins}-minute session scoring ${overallScore}/100 with ${notifCount} refocus notification${notifCount !== 1 ? 's' : ''}.`
      : `A challenging ${mins}-minute session scoring ${overallScore}/100 with frequent interruptions.`;

  return {
    summary,
    strengths,
    improvements,
    distractionPattern,
    nextSessionTip,
    encouragement: overallScore >= 75
      ? 'Great work - your consistency is improving.'
      : 'Progress is real. Keep stacking focused minutes every day.',
  };
}

export async function generateReportSummary(sessionData: any, scoreInfo: any): Promise<ReportSummary> {
  const payload = {
    score: Number(scoreInfo?.overallScore ?? 0),
    focusConsistency: Number(scoreInfo?.focusConsistency ?? 0),
    distractionResistance: Number(scoreInfo?.distractionResistance ?? 0),
    distractions: Number(sessionData?.sessionDistractions ?? 0),
    away: Number(sessionData?.lookAwayCount ?? 0),
    talking: Number(sessionData?.talkingDetections ?? 0),
    notifications: Number(sessionData?.notificationCount ?? 0),
    sessionName: String(sessionData?.sessionName ?? 'Focus Session'),
    sessionType: String(sessionData?.sessionType ?? 'General Work'),
    goal: String(sessionData?.productivityGoal ?? 'Maintain focus'),
    durationMinutes: Math.round(Number(sessionData?.sessionSeconds ?? 0) / 60),
    plannedMinutes: Number(sessionData?.plannedDurationMinutes ?? 0),
    harshness: String(sessionData?.harshness ?? 'realistic'),
  };

  try {
    const response = await fetch(`${PRODUCTIFI_AI_URL}/api/ai/focus-report`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ data: payload }),
    });

    if (!response.ok) throw new Error(`Backend returned ${response.status}`);

    const result = await response.json() as {
      ok?: boolean;
      report?: Partial<ReportSummary>;
    };

    if (result.ok && result.report) {
      return {
        summary: String(result.report.summary || ''),
        strengths: Array.isArray(result.report.strengths) ? result.report.strengths.map(String) : [],
        improvements: Array.isArray(result.report.improvements) ? result.report.improvements.map(String) : [],
        distractionPattern: String(result.report.distractionPattern || ''),
        nextSessionTip: String(result.report.nextSessionTip || ''),
        encouragement: result.report.encouragement ? String(result.report.encouragement) : undefined,
      };
    }
  } catch (error) {
    console.warn('[aiReportService] backend report failed, using fallback:', error);
  }

  return buildFallback(sessionData, scoreInfo);
}
