import { useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import { useSessionStore, type SessionType, type FocusRule } from '../store/sessionStore';

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
    if (!('Notification' in window)) return;
    await Notification.requestPermission();
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
    if (sessionData.notificationsEnabled && notifPerm === 'default') {
      await requestNotificationPermission();
    }
    navigate('/session');
  };

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.5 }}
      className="min-h-screen bg-[#f4f6f9] flex flex-col items-center justify-center px-6 py-16"
    >
      <div className="max-w-5xl w-full mx-auto">
        <div className="text-center mb-7">
          <p className="text-xs uppercase tracking-[0.25em] text-slate-500 mb-2">Session Control Center</p>
          <h1 className="text-3xl font-bold text-slate-900">Build Your Ideal Focus Environment</h1>
          <p className="text-slate-600 mt-2">Tune detection strictness, visual style, and alert behavior in one place.</p>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          <section className="card p-5 lg:col-span-2">
            <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-3">Focus Presets</p>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
              <button onClick={() => applyPreset('deep')} className="px-3 py-2 rounded-xl border border-slate-200 text-sm text-slate-700 hover:bg-slate-50">Deep Work Sprint</button>
              <button onClick={() => applyPreset('balanced')} className="px-3 py-2 rounded-xl border border-slate-200 text-sm text-slate-700 hover:bg-slate-50">Balanced Operator</button>
              <button onClick={() => applyPreset('light')} className="px-3 py-2 rounded-xl border border-slate-200 text-sm text-slate-700 hover:bg-slate-50">Light Monitoring</button>
            </div>
          </section>

          <section className="card p-5">
            <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-3">Session Blueprint</p>
            <label className="block text-sm text-slate-600 mb-2">Session Name</label>
            <input
              value={sessionData.sessionName}
              onChange={(e) => sessionData.setField('sessionName', e.target.value)}
              className="w-full px-3 py-2 border border-slate-200 rounded-xl mb-4"
            />

            <label className="block text-sm text-slate-600 mb-2">Session Type</label>
            <select
              value={sessionData.sessionType}
              onChange={(e) => sessionData.setField('sessionType', e.target.value as SessionType)}
              className="w-full px-3 py-2 border border-slate-200 rounded-xl mb-4"
            >
              {SESSION_TYPES.map((type) => (
                <option key={type} value={type}>{type}</option>
              ))}
            </select>

            <label className="block text-sm text-slate-600 mb-2">Duration: {sessionData.plannedDurationMinutes} min</label>
            <input
              type="range"
              min={15}
              max={180}
              step={5}
              value={sessionData.plannedDurationMinutes}
              onChange={(e) => sessionData.setField('plannedDurationMinutes', Number(e.target.value))}
              className="w-full"
            />

            <label className="block text-sm text-slate-600 mt-4 mb-2">Productivity Goal</label>
            <input
              value={sessionData.productivityGoal}
              onChange={(e) => sessionData.setField('productivityGoal', e.target.value)}
              className="w-full px-3 py-2 border border-slate-200 rounded-xl"
            />

            <label className="block text-sm text-slate-600 mt-4 mb-2">Streak Goal: {sessionData.streakGoalDays} days</label>
            <input
              type="range"
              min={3}
              max={60}
              step={1}
              value={sessionData.streakGoalDays}
              onChange={(e) => sessionData.setField('streakGoalDays', Number(e.target.value))}
              className="w-full"
            />
          </section>

          <section className="card p-5">
            <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-3">Focus Intelligence</p>
            <label className="block text-sm text-slate-600 mb-2">Focus Rule</label>
            <div className="grid grid-cols-1 gap-2 mb-4">
              {FOCUS_RULES.map((rule) => (
                <button
                  key={rule}
                  onClick={() => sessionData.setField('focusRule', rule)}
                  className={`px-3 py-2 rounded-xl border text-sm text-left transition-colors ${
                    sessionData.focusRule === rule
                      ? 'border-slate-900 bg-slate-900 text-white'
                      : 'border-slate-200 bg-white text-slate-700 hover:bg-slate-50'
                  }`}
                >
                  {rule}
                </button>
              ))}
            </div>

            <label className="block text-sm text-slate-600 mb-2">Detection Sensitivity: {sessionData.sensitivity}</label>
            <input
              type="range"
              min={0}
              max={100}
              value={sessionData.sensitivity}
              onChange={(e) => sessionData.setField('sensitivity', Number(e.target.value))}
              className="w-full mb-4"
            />

            <label className="block text-sm text-slate-600 mb-2">Scoring Harshness</label>
            <select
              value={sessionData.harshness}
              onChange={(e) => sessionData.setField('harshness', e.target.value as 'lenient' | 'realistic' | 'strict')}
              className="w-full px-3 py-2 border border-slate-200 rounded-xl"
            >
              <option value="lenient">Lenient</option>
              <option value="realistic">Realistic</option>
              <option value="strict">Strict</option>
            </select>

            <p className="text-sm text-slate-600 mt-4 mb-2">Tracked Metrics</p>
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

          <section className="card p-5">
            <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-3">Alerts and Nudges</p>
            <label className="flex items-center justify-between py-2 mb-3">
              <span className="text-sm text-slate-700">Enable Notifications</span>
              <input
                type="checkbox"
                checked={sessionData.notificationsEnabled}
                onChange={(e) => sessionData.setField('notificationsEnabled', e.target.checked)}
              />
            </label>

            <label className="block text-sm text-slate-600 mb-2">Alert Mode</label>
            <select
              value={sessionData.alertMode}
              onChange={(e) => sessionData.setField('alertMode', e.target.value as 'notification' | 'sound' | 'both')}
              className="w-full px-3 py-2 border border-slate-200 rounded-xl mb-4"
            >
              <option value="notification">Notifications</option>
              <option value="sound">Sound only</option>
              <option value="both">Notifications + sound</option>
            </select>

            <button
              onClick={requestNotificationPermission}
              disabled={notifPerm === 'granted'}
              className={`w-full px-4 py-2 rounded-xl text-sm font-medium transition-colors ${
                notifPerm === 'granted'
                  ? 'bg-emerald-100 text-emerald-700 cursor-not-allowed'
                  : 'bg-slate-900 text-white hover:bg-slate-800'
              }`}
            >
              {notifPerm === 'granted' ? 'Notifications Ready' : 'Grant Notification Permission'}
            </button>
          </section>

          <section className="card p-5">
            <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-3">Visual Identity</p>
            <label className="block text-sm text-slate-600 mb-2">Theme</label>
            <select
              value={sessionData.themeMode}
              onChange={(e) => sessionData.setField('themeMode', e.target.value as 'light' | 'dark')}
              className="w-full px-3 py-2 border border-slate-200 rounded-xl mb-4"
            >
              <option value="light">Light</option>
              <option value="dark">Dark</option>
            </select>

            <label className="block text-sm text-slate-600 mb-2">Accent Color</label>
            <input
              type="color"
              value={sessionData.accentColor}
              onChange={(e) => sessionData.setField('accentColor', e.target.value)}
              className="w-full h-10 border border-slate-200 rounded-xl mb-4"
            />

            <label className="block text-sm text-slate-600 mb-2">Font Scale</label>
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

        <div className="mt-6 text-center">
          <button
            onClick={handleStartSession}
            className="inline-flex items-center justify-center px-7 py-3 bg-gradient-productifi text-white font-semibold rounded-xl shadow-card hover:shadow-btn-glow transition-all"
          >
            Launch Focus Session
          </button>
        </div>
      </div>
    </motion.div>
  );
}
