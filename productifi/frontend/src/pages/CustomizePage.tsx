import { useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import { useSessionStore, type SessionType, type FocusRule } from '../store/sessionStore';
import { enableNotifications } from '../services/notificationService';
import { Rocket, Brain, BellRing, Palette, Target, Gauge, Sparkles, Volume2 } from 'lucide-react';

const SESSION_TYPES: SessionType[] = [
  'Deep Study',
  'General Work',
  'Creative Flow',
  'Coding Sprint',
  'Reading / Review',
  'Custom',
];

const FOCUS_RULES: FocusRule[] = ['Strict mode', 'Balanced mode', 'Monitor only'];
const METRIC_OPTIONS = [
  'Face presence',
  'Eye movement / gaze stability',
  'Typing activity / speed',
  'Idle time',
  'Blocked site attempts',
];

export default function CustomizePage() {
  const navigate = useNavigate();
  const sessionData = useSessionStore();
  const notifPerm: NotificationPermission =
    'Notification' in window ? Notification.permission : 'denied';

  useEffect(() => {
    document.documentElement.classList.toggle('dark', sessionData.themeMode === 'dark');
    document.documentElement.style.setProperty('--gradient-start', sessionData.accentColor);
    document.documentElement.style.setProperty('--font-scale',
      sessionData.fontScale === 'compact' ? '0.95' : sessionData.fontScale === 'large' ? '1.08' : '1.0');
  }, [sessionData.themeMode, sessionData.accentColor, sessionData.fontScale]);

  const requestNotificationPermission = async () => {
    await enableNotifications();
  };

  const toggleMetric = (metric: string) => {
    const exists = sessionData.trackedMetrics.includes(metric);
    if (exists && sessionData.trackedMetrics.length === 1) return;
    const next = exists
      ? sessionData.trackedMetrics.filter((m) => m !== metric)
      : [...sessionData.trackedMetrics, metric];
    sessionData.setField('trackedMetrics', next);
  };

  const applyPreset = (preset: 'deep' | 'balanced' | 'light') => {
    if (preset === 'deep') {
      sessionData.setField('focusRule', 'Strict mode');
      sessionData.setField('sensitivity', 82);
      sessionData.setField('harshness', 'strict');
      sessionData.setField('plannedDurationMinutes', 90);
      sessionData.setField('trackedMetrics', [
        'Face presence',
        'Eye movement / gaze stability',
        'Typing activity / speed',
        'Idle time',
      ]);
      return;
    }
    if (preset === 'balanced') {
      sessionData.setField('focusRule', 'Balanced mode');
      sessionData.setField('sensitivity', 58);
      sessionData.setField('harshness', 'realistic');
      sessionData.setField('plannedDurationMinutes', 60);
      sessionData.setField('trackedMetrics', [
        'Face presence',
        'Eye movement / gaze stability',
        'Typing activity / speed',
      ]);
      return;
    }
    sessionData.setField('focusRule', 'Monitor only');
    sessionData.setField('sensitivity', 35);
    sessionData.setField('harshness', 'lenient');
    sessionData.setField('plannedDurationMinutes', 45);
    sessionData.setField('trackedMetrics', [
      'Face presence',
      'Idle time',
    ]);
  };

  const handleStartSession = async () => {
    await enableNotifications();
    navigate('/session');
  };

  const readinessScore = Math.min(
    100,
    Math.round(
      (sessionData.notificationsEnabled ? 25 : 8)
      + (sessionData.trackedMetrics.length / METRIC_OPTIONS.length) * 35
      + (sessionData.sensitivity / 100) * 25
      + (sessionData.focusRule === 'Strict mode' ? 15 : sessionData.focusRule === 'Balanced mode' ? 10 : 5),
    ),
  );

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.5 }}
      className="min-h-screen bg-[#eef2ff] bg-[radial-gradient(circle_at_8%_-12%,rgba(37,99,235,0.22),transparent_42%),radial-gradient(circle_at_92%_-10%,rgba(13,148,136,0.22),transparent_44%)] px-5 py-10 sm:px-6 sm:py-14"
    >
      <div className="max-w-6xl w-full mx-auto space-y-5">
        <div className="relative overflow-hidden rounded-3xl border border-white/80 bg-white/90 p-6 shadow-[0_12px_40px_rgba(15,23,42,0.1)] backdrop-blur sm:p-8">
          <div className="pointer-events-none absolute -top-16 -right-10 h-44 w-44 rounded-full bg-[#2563eb]/10 blur-3xl" />
          <div className="pointer-events-none absolute -bottom-20 -left-10 h-44 w-44 rounded-full bg-[#0d9488]/10 blur-3xl" />

          <div className="relative flex flex-col gap-5">
            <div className="flex flex-wrap items-center gap-2">
              <span className="inline-flex items-center gap-1.5 rounded-full border border-[#2563eb]/20 bg-[#2563eb]/10 px-3 py-1 text-[11px] font-semibold uppercase tracking-wider text-[#1d4ed8]">
                <Rocket className="h-3.5 w-3.5" /> Startup Mode
              </span>
              <span className="inline-flex items-center gap-1.5 rounded-full border border-emerald-200 bg-emerald-50 px-3 py-1 text-[11px] font-semibold uppercase tracking-wider text-emerald-700">
                <Gauge className="h-3.5 w-3.5" /> Readiness {readinessScore}%
              </span>
            </div>

            <div>
              <p className="text-[11px] uppercase tracking-[0.24em] text-slate-500">Productifi Control Room</p>
              <h1 className="mt-1 text-3xl font-extrabold text-slate-900 sm:text-4xl">Customize Your Experience</h1>
              <p className="mt-2 max-w-3xl text-sm text-slate-600 sm:text-base">
                Configure one high-performance workflow: choose how strict Productifi should be, what signals to monitor,
                and how aggressively it should pull you back into focus.
              </p>
            </div>

            <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
              <div className="rounded-2xl border border-slate-200 bg-slate-50/85 px-4 py-3">
                <p className="text-[11px] uppercase tracking-wider text-slate-500">Focus Rule</p>
                <p className="mt-1 text-sm font-semibold text-slate-800">{sessionData.focusRule}</p>
              </div>
              <div className="rounded-2xl border border-slate-200 bg-slate-50/85 px-4 py-3">
                <p className="text-[11px] uppercase tracking-wider text-slate-500">Session Target</p>
                <p className="mt-1 text-sm font-semibold text-slate-800">{sessionData.plannedDurationMinutes} min deep work</p>
              </div>
              <div className="rounded-2xl border border-slate-200 bg-slate-50/85 px-4 py-3">
                <p className="text-[11px] uppercase tracking-wider text-slate-500">Streak Mission</p>
                <p className="mt-1 text-sm font-semibold text-slate-800">{sessionData.streakGoalDays}-day consistency run</p>
              </div>
            </div>
          </div>
        </div>

        <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
          <section className="card border border-white/70 p-5 lg:col-span-2 sm:p-6">
            <div className="mb-3 flex items-center gap-2">
              <Sparkles className="h-4 w-4 text-[#2563eb]" />
              <p className="text-xs font-semibold uppercase tracking-wider text-slate-500">Launch Presets</p>
            </div>
            <p className="mb-3 text-sm text-slate-600">Start with a proven setup and then fine tune.</p>
            <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
              <button onClick={() => applyPreset('deep')} className="rounded-2xl border border-[#2563eb]/25 bg-[#2563eb]/5 px-3 py-2.5 text-sm font-medium text-[#1d4ed8] transition hover:bg-[#2563eb]/10">Deep Work Sprint</button>
              <button onClick={() => applyPreset('balanced')} className="rounded-2xl border border-[#0d9488]/25 bg-[#0d9488]/5 px-3 py-2.5 text-sm font-medium text-[#0f766e] transition hover:bg-[#0d9488]/10">Balanced Operator</button>
              <button onClick={() => applyPreset('light')} className="rounded-2xl border border-slate-200 bg-slate-50 px-3 py-2.5 text-sm font-medium text-slate-700 transition hover:bg-slate-100">Light Monitoring</button>
            </div>
          </section>

          <section className="card border border-white/70 p-5 sm:p-6">
            <div className="mb-3 flex items-center gap-2">
              <Target className="h-4 w-4 text-[#2563eb]" />
              <p className="text-xs font-semibold uppercase tracking-wider text-slate-500">Session Blueprint</p>
            </div>
            <label className="mb-2 block text-sm text-slate-600">Session Name</label>
            <input
              value={sessionData.sessionName}
              onChange={(e) => sessionData.setField('sessionName', e.target.value)}
              className="mb-4 w-full rounded-xl border border-slate-200 px-3 py-2"
            />

            <label className="mb-2 block text-sm text-slate-600">Session Type</label>
            <select
              value={sessionData.sessionType}
              onChange={(e) => sessionData.setField('sessionType', e.target.value as SessionType)}
              className="mb-4 w-full rounded-xl border border-slate-200 px-3 py-2"
            >
              {SESSION_TYPES.map((type) => (
                <option key={type} value={type}>{type}</option>
              ))}
            </select>

            <label className="mb-2 block text-sm text-slate-600">Duration: {sessionData.plannedDurationMinutes} min</label>
            <input
              type="range"
              min={15}
              max={180}
              step={5}
              value={sessionData.plannedDurationMinutes}
              onChange={(e) => sessionData.setField('plannedDurationMinutes', Number(e.target.value))}
              className="w-full"
            />

            <label className="mb-2 mt-4 block text-sm text-slate-600">Productivity Goal</label>
            <input
              value={sessionData.productivityGoal}
              onChange={(e) => sessionData.setField('productivityGoal', e.target.value)}
              className="w-full rounded-xl border border-slate-200 px-3 py-2"
            />

            <label className="mb-2 mt-4 block text-sm text-slate-600">Streak Goal: {sessionData.streakGoalDays} days</label>
            <input
              type="range"
              min={3}
              max={60}
              step={1}
              value={sessionData.streakGoalDays}
              onChange={(e) => sessionData.setField('streakGoalDays', Number(e.target.value))}
              className="w-full"
            />
            <p className="mt-2 text-xs text-slate-500">Goal lock: reach 100% focus by the end of this {sessionData.streakGoalDays}-day run.</p>
          </section>

          <section className="card border border-white/70 p-5 sm:p-6">
            <div className="mb-3 flex items-center gap-2">
              <Brain className="h-4 w-4 text-[#0d9488]" />
              <p className="text-xs font-semibold uppercase tracking-wider text-slate-500">Focus Intelligence</p>
            </div>
            <label className="mb-2 block text-sm text-slate-600">Focus Rule</label>
            <div className="mb-4 grid grid-cols-1 gap-2">
              {FOCUS_RULES.map((rule) => (
                <button
                  key={rule}
                  onClick={() => sessionData.setField('focusRule', rule)}
                  className={`px-3 py-2 rounded-xl border text-sm text-left transition-colors ${
                    sessionData.focusRule === rule
                      ? 'border-[#0f766e] bg-[#0f766e] text-white'
                      : 'border-slate-200 bg-white text-slate-700 hover:bg-slate-50'
                  }`}
                >
                  {rule}
                </button>
              ))}
            </div>

            <label className="mb-2 block text-sm text-slate-600">Detection Sensitivity: {sessionData.sensitivity}</label>
            <input
              type="range"
              min={0}
              max={100}
              value={sessionData.sensitivity}
              onChange={(e) => sessionData.setField('sensitivity', Number(e.target.value))}
              className="w-full mb-4"
            />

            <label className="mb-2 block text-sm text-slate-600">Scoring Harshness</label>
            <select
              value={sessionData.harshness}
              onChange={(e) => sessionData.setField('harshness', e.target.value as 'lenient' | 'realistic' | 'strict')}
              className="w-full px-3 py-2 border border-slate-200 rounded-xl"
            >
              <option value="lenient">Lenient</option>
              <option value="realistic">Realistic</option>
              <option value="strict">Strict</option>
            </select>

            <p className="mb-2 mt-4 text-sm text-slate-600">Tracked Metrics</p>
            <div className="grid grid-cols-1 gap-2">
              {METRIC_OPTIONS.map((metric) => {
                const enabled = sessionData.trackedMetrics.includes(metric);
                return (
                  <button
                    key={metric}
                    onClick={() => toggleMetric(metric)}
                    className={`px-3 py-2 rounded-xl border text-sm text-left transition-colors ${
                      enabled
                        ? 'border-emerald-300 bg-emerald-50 text-emerald-700'
                        : 'border-slate-200 bg-white text-slate-700 hover:bg-slate-50'
                    }`}
                  >
                    {enabled ? 'On' : 'Off'} · {metric}
                  </button>
                );
              })}
            </div>
          </section>

          <section className="card border border-white/70 p-5 sm:p-6">
            <div className="mb-3 flex items-center gap-2">
              <BellRing className="h-4 w-4 text-[#2563eb]" />
              <p className="text-xs font-semibold uppercase tracking-wider text-slate-500">Alerts and Nudges</p>
            </div>
            <label className="mb-3 flex items-center justify-between py-2">
              <span className="text-sm text-slate-700">Enable Notifications</span>
              <input
                type="checkbox"
                checked={sessionData.notificationsEnabled}
                onChange={(e) => sessionData.setField('notificationsEnabled', e.target.checked)}
              />
            </label>

            <label className="mb-2 block text-sm text-slate-600">Alert Mode</label>
            <select
              value={sessionData.alertMode}
              onChange={(e) => sessionData.setField('alertMode', e.target.value as 'notification' | 'sound' | 'both')}
              className="w-full px-3 py-2 border border-slate-200 rounded-xl mb-4"
            >
              <option value="notification">Notifications</option>
              <option value="sound">Sound only</option>
              <option value="both">Notifications + sound</option>
            </select>

            <label className="mb-4 flex items-center justify-between rounded-xl border border-slate-200 bg-slate-50/70 px-3 py-2.5">
              <span className="flex items-center gap-2 text-sm text-slate-700">
                <Volume2 className="h-4 w-4 text-[#0d9488]" />
                AI Voice Coach
              </span>
              <input
                type="checkbox"
                checked={sessionData.voiceCoachEnabled}
                onChange={(e) => sessionData.setField('voiceCoachEnabled', e.target.checked)}
              />
            </label>

            <button
              onClick={requestNotificationPermission}
              disabled={notifPerm === 'granted'}
              className={`w-full px-4 py-2 rounded-xl text-sm font-medium transition-colors ${
                notifPerm === 'granted'
                  ? 'bg-emerald-100 text-emerald-700 cursor-not-allowed'
                  : 'bg-[#1d4ed8] text-white hover:bg-[#1e40af]'
              }`}
            >
              {notifPerm === 'granted' ? 'Notifications Ready' : 'Grant Notification Permission'}
            </button>
          </section>

          <section className="card border border-white/70 p-5 sm:p-6">
            <div className="mb-3 flex items-center gap-2">
              <Palette className="h-4 w-4 text-[#0d9488]" />
              <p className="text-xs font-semibold uppercase tracking-wider text-slate-500">Visual Identity</p>
            </div>
            <label className="mb-2 block text-sm text-slate-600">Theme</label>
            <select
              value={sessionData.themeMode}
              onChange={(e) => sessionData.setField('themeMode', e.target.value as 'light' | 'dark')}
              className="w-full px-3 py-2 border border-slate-200 rounded-xl mb-4"
            >
              <option value="light">Light</option>
              <option value="dark">Dark</option>
            </select>

            <label className="mb-2 block text-sm text-slate-600">Accent Color</label>
            <input
              type="color"
              value={sessionData.accentColor}
              onChange={(e) => sessionData.setField('accentColor', e.target.value)}
              className="w-full h-10 border border-slate-200 rounded-xl mb-4"
            />

            <label className="mb-2 block text-sm text-slate-600">Font Scale</label>
            <select
              value={sessionData.fontScale}
              onChange={(e) => sessionData.setField('fontScale', e.target.value as 'compact' | 'comfortable' | 'large')}
              className="w-full px-3 py-2 border border-slate-200 rounded-xl"
            >
              <option value="compact">Compact</option>
              <option value="comfortable">Comfortable</option>
              <option value="large">Large</option>
            </select>
          </section>
        </div>

        <div className="sticky bottom-3 mt-5 rounded-2xl border border-slate-200/70 bg-white/90 p-3 shadow-[0_8px_24px_rgba(15,23,42,0.08)] backdrop-blur sm:p-4">
          <div className="flex flex-col items-center justify-between gap-3 sm:flex-row">
            <div>
              <p className="text-xs uppercase tracking-wider text-slate-500">Launch Checklist</p>
              <p className="text-sm font-semibold text-slate-800">
                Goal: 100% focus by the end of your {sessionData.streakGoalDays}-day streak.
              </p>
            </div>
            <button
              onClick={handleStartSession}
              className="inline-flex w-full items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-[#2563eb] to-[#0d9488] px-7 py-3 font-semibold text-white shadow-card transition-all hover:shadow-btn-glow sm:w-auto"
            >
              <Rocket className="h-4 w-4" /> Launch Focus Session
            </button>
          </div>
        </div>
      </div>
    </motion.div>
  );
}
