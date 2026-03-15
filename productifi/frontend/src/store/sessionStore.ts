import { create } from 'zustand'

export type SessionType = 'Deep Study' | 'General Work' | 'Creative Flow' | 'Coding Sprint' | 'Reading / Review' | 'Custom';
export type FocusRule = 'Strict mode' | 'Balanced mode' | 'Monitor only';
export type AlertMode = 'notification' | 'sound' | 'both';
export type ThemeMode = 'light' | 'dark';
export type FontScale = 'compact' | 'comfortable' | 'large';

// ── Streak persistence helpers ────────────────────────────────────────────────
function loadStreakFromStorage() {
  try {
    const raw = localStorage.getItem('productifi_streak');
    if (!raw) return { currentStreak: 0, longestStreak: 0, lastSessionDate: '', streakGoalDays: 7 };
    return JSON.parse(raw);
  } catch {
    return { currentStreak: 0, longestStreak: 0, lastSessionDate: '', streakGoalDays: 7 };
  }
}

function saveStreakToStorage(data: {
  currentStreak: number;
  longestStreak: number;
  lastSessionDate: string;
  streakGoalDays: number;
}) {
  try {
    localStorage.setItem('productifi_streak', JSON.stringify(data));
  } catch { /* ignore storage errors */ }
}

const savedStreak = loadStreakFromStorage();

type UserPreferences = {
  notificationsEnabled: boolean;
  alertMode: AlertMode;
  sensitivity: number;
  themeMode: ThemeMode;
  accentColor: string;
  fontScale: FontScale;
};

const defaultPreferences: UserPreferences = {
  notificationsEnabled: true,
  alertMode: 'notification',
  sensitivity: 55,
  themeMode: 'light',
  accentColor: '#2563eb',
  fontScale: 'comfortable',
};

function loadPreferencesFromStorage(): UserPreferences {
  try {
    const raw = localStorage.getItem('productifi_preferences');
    if (!raw) return defaultPreferences;
    const parsed = JSON.parse(raw) as Partial<UserPreferences>;
    return {
      notificationsEnabled: typeof parsed.notificationsEnabled === 'boolean'
        ? parsed.notificationsEnabled
        : defaultPreferences.notificationsEnabled,
      alertMode: (parsed.alertMode === 'notification' || parsed.alertMode === 'sound' || parsed.alertMode === 'both')
        ? parsed.alertMode
        : defaultPreferences.alertMode,
      sensitivity: typeof parsed.sensitivity === 'number'
        ? Math.max(0, Math.min(100, parsed.sensitivity))
        : defaultPreferences.sensitivity,
      themeMode: parsed.themeMode === 'dark' ? 'dark' : 'light',
      accentColor: typeof parsed.accentColor === 'string' && parsed.accentColor.length > 0
        ? parsed.accentColor
        : defaultPreferences.accentColor,
      fontScale: (parsed.fontScale === 'compact' || parsed.fontScale === 'comfortable' || parsed.fontScale === 'large')
        ? parsed.fontScale
        : defaultPreferences.fontScale,
    };
  } catch {
    return defaultPreferences;
  }
}

function savePreferencesToStorage(data: UserPreferences) {
  try {
    localStorage.setItem('productifi_preferences', JSON.stringify(data));
  } catch {
    // Ignore storage failures
  }
}

const savedPreferences = loadPreferencesFromStorage();

// ── Store ─────────────────────────────────────────────────────────────────────
interface SessionState {
  // Setup fields
  sessionType: SessionType;
  focusRule: FocusRule;
  trackedMetrics: string[];
  productivityGoal: string;
  sessionName: string;
  plannedDurationMinutes: number;
  harshness: 'lenient' | 'realistic' | 'strict';
  notificationsEnabled: boolean;
  alertMode: AlertMode;
  sensitivity: number;
  themeMode: ThemeMode;
  accentColor: string;
  fontScale: FontScale;

  // Streak
  streakGoalDays: number;
  currentStreak: number;
  longestStreak: number;
  lastSessionDate: string;

  // Real session result (populated when ending a session)
  sessionDistractions: number;
  avgAttention: number;
  sessionSeconds: number;

  // Actions
  setField: <K extends keyof SessionState>(field: K, value: SessionState[K]) => void;
  recordCompletedSession: (distractions: number, avgAttention: number, seconds: number) => void;
}

export const useSessionStore = create<SessionState>((set, get) => ({
  sessionType: 'Deep Study',
  focusRule: 'Balanced mode',
  trackedMetrics: ['Face presence', 'Eye movement / gaze stability', 'Typing activity / speed', 'Idle time', 'Blocked site attempts'],
  productivityGoal: 'Maintain deep focus',
  sessionName: 'Focus Session',
  plannedDurationMinutes: 60,
  harshness: 'realistic',
  notificationsEnabled: savedPreferences.notificationsEnabled,
  alertMode: savedPreferences.alertMode,
  sensitivity: savedPreferences.sensitivity,
  themeMode: savedPreferences.themeMode,
  accentColor: savedPreferences.accentColor,
  fontScale: savedPreferences.fontScale,

  // Streak — loaded from localStorage
  streakGoalDays: savedStreak.streakGoalDays,
  currentStreak: savedStreak.currentStreak,
  longestStreak: savedStreak.longestStreak,
  lastSessionDate: savedStreak.lastSessionDate,

  // Session result — zeroed until a session ends
  sessionDistractions: 0,
  avgAttention: 0,
  sessionSeconds: 0,

  setField: (field, value) => set(state => {
    const next = { ...state, [field]: value } as SessionState;
    savePreferencesToStorage({
      notificationsEnabled: next.notificationsEnabled,
      alertMode: next.alertMode,
      sensitivity: next.sensitivity,
      themeMode: next.themeMode,
      accentColor: next.accentColor,
      fontScale: next.fontScale,
    });
    if (field === 'streakGoalDays') {
      saveStreakToStorage({
        currentStreak: next.currentStreak,
        longestStreak: next.longestStreak,
        lastSessionDate: next.lastSessionDate,
        streakGoalDays: next.streakGoalDays,
      });
    }
    return next;
  }),

  recordCompletedSession: (distractions, avgAttention, seconds) => {
    const state = get();
    const today = new Date().toDateString();
    const yesterday = new Date(Date.now() - 86_400_000).toDateString();

    let newStreak = state.currentStreak;

    if (state.lastSessionDate === today) {
      // Already counted a session today — don't increment streak again
    } else if (state.lastSessionDate === yesterday) {
      // Consecutive day — extend streak
      newStreak = state.currentStreak + 1;
    } else {
      // Missed a day or first ever session — reset to 1
      newStreak = 1;
    }

    const newLongest = Math.max(state.longestStreak, newStreak);

    saveStreakToStorage({
      currentStreak: newStreak,
      longestStreak: newLongest,
      lastSessionDate: today,
      streakGoalDays: state.streakGoalDays,
    });

    set({
      sessionDistractions: distractions,
      avgAttention,
      sessionSeconds: seconds,
      currentStreak: newStreak,
      longestStreak: newLongest,
      lastSessionDate: today,
    });
  },
}));
