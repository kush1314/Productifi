import { GoogleGenerativeAI } from "@google/generative-ai";

export async function generateReportSummary(sessionData: any, scoreInfo: any) {
  // Check if Gemini key is set in env
  const apiKey = import.meta.env.VITE_GEMINI_API_KEY || import.meta.env.VITE_OPENAI_API_KEY;
  
  if (apiKey) {
    // For MVP, calling Gemini directly from frontend.
    // WARNING: For production, NEVER do this on the frontend.
    try {
      const genAI = new GoogleGenerativeAI(apiKey);
      const model = genAI.getGenerativeModel({ model: "gemini-1.5-flash" });

      const prompt = `You are a productivity intelligence AI. Give a 2-3 sentence summary of the user's focus session.
Session: ${sessionData.sessionName}
Score: ${scoreInfo.overallScore}/100
Distractions: ${scoreInfo.distractionResistance}
Focus: ${scoreInfo.focusConsistency}`;

      const result = await model.generateContent(prompt);
      const response = await result.response;
      return response.text();
    } catch (e) {
      console.error("Gemini call failed, using fallback.", e);
    }
  }

  // Fallback Deterministic AI generation
  if (scoreInfo.overallScore > 85) {
    return "You maintained exceptional focus throughout the session. Your typing cadence suggests strong engagement, and you successfully resisted almost all distractions. Keep up this momentum for future deep work.";
  } else if (scoreInfo.overallScore > 65) {
    return "You had a solid session with brief periods of lost attention. While your distraction resistance was fair, minor fatigue spikes slightly lowered your overall score. Consider taking a 5-minute break before your next task.";
  } else {
    return "This session showed signs of heavy context-switching and fatigue. Several distraction attempts and extended idle periods were detected. We recommend switching to 'Strict Mode' and resting before continuing.";
  }
}
