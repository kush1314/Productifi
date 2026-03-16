import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import { useSessionStore } from '../store/sessionStore';
import { generateReportSummary } from '../services/aiReportService';
import type { ReportSummary } from '../services/aiReportService';
import { ArrowRight, Flame, Trophy, Target, Zap, ShieldAlert, Activity, Sparkles, Bell, MessageSquare, Eye, CheckCircle, AlertTriangle, Goal, TrendingUp } from 'lucide-react';
import React from 'react';

function computeScores(avgAttention: number, distractions: number, harshness: string) {
  const penalty     = harshness === 'strict' ? 1.6 : harshness === 'lenient' ? 0.6 : 1.0;
  const distPenalty = Math.min(distractions * 3 * penalty, 40);
  const attn        = Math.max(0, avgAttention);
  return {
    overallScore:          Math.round(Math.max(0, Math.min(100, attn * 0.7 + (100 - distPenalty) * 0.3))),
    focusConsistency:      Math.round(Math.max(0, Math.min(100, attn - distPenalty * 0.5))),
    distractionResistance: Math.round(Math.max(0, Math.min(100, 100 - distPenalty))),
    workIntensity:         Math.round(Math.max(0, Math.min(100, attn * 0.8 + 20))),
    energyLevel:           Math.round(Math.max(0, Math.min(100, 100 - distPenalty * 0.6))),
  };
}

function MetricCard({ title, value, icon: Icon }: { title: string; value: number; icon: React.ElementType }) {
  const color  = value >= 75 ? '#059669' : value >= 50 ? '#d97706' : '#dc2626';
  const barBg  = value >= 75 ? '#10b981' : value >= 50 ? '#f59e0b' : '#ef4444';
  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      className="bg-white border border-slate-100 rounded-2xl p-5 shadow-card hover:shadow-card-hover transition-shadow"
    >
      <div className="flex items-center justify-between mb-3">
        <span className="text-xs font-semibold text-slate-400 uppercase tracking-wider">{title}</span>
        <div className="w-8 h-8 rounded-xl bg-gradient-to-br from-[#2563eb]/10 to-[#0d9488]/10 flex items-center justify-center">
          <Icon style={{ width: 15, height: 15 }} className="text-[#5B8CFF]" />
        </div>
      </div>
      <div className="text-3xl font-bold mb-2" style={{ color }}>
        {value}<span className="text-lg font-normal text-slate-400 ml-0.5">%</span>
      </div>
      <div className="w-full h-1.5 bg-slate-100 rounded-full overflow-hidden">
        <motion.div
          className="h-full rounded-full"
          style={{ backgroundColor: barBg }}
          initial={{ width: 0 }}
          animate={{ width: `${value}%` }}
          transition={{ duration: 0.8, ease: 'easeOut' }}
        />
      </div>
    </motion.div>
  );
}

export default function ReportPage() {
  const navigate    = useNavigate();
  const sessionData = useSessionStore();
  const [aiReport, setAiReport] = useState<ReportSummary | null>(null);

  const scoreInfo = computeScores(
    sessionData.avgAttention,
    sessionData.sessionDistractions,
    sessionData.harshness,
  );

  const streakPct = Math.min(
    100,
    Math.round((sessionData.currentStreak / Math.max(1, sessionData.streakGoalDays)) * 100),
  );

  useEffect(() => {
    generateReportSummary(sessionData, scoreInfo).then(setAiReport);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const fmt = (sec: number) => {
    const m = Math.floor(sec / 60);
    const s = sec % 60;
    return m > 0 ? `${m}m ${s}s` : `${s}s`;
  };

  const overallColor = scoreInfo.overallScore >= 75 ? '#059669' : scoreInfo.overallScore >= 50 ? '#d97706' : '#dc2626';
  const circumference = 2 * Math.PI * 54;
  const focusGap = Math.max(0, 100 - scoreInfo.overallScore);
  const streakDaysLeft = Math.max(0, sessionData.streakGoalDays - sessionData.currentStreak);
  const goalTrackPct = Math.min(100, Math.round(scoreInfo.overallScore * 0.6 + streakPct * 0.4));
  const goalOnTrack = goalTrackPct >= 70;

  return (
    <div className="min-h-screen bg-[#eef2ff] bg-[radial-gradient(circle_at_10%_-12%,rgba(37,99,235,0.2),transparent_38%),radial-gradient(circle_at_90%_-15%,rgba(13,148,136,0.2),transparent_42%)] py-8 px-5 sm:px-6">
      <div className="max-w-5xl mx-auto flex flex-col gap-6">

        {/* Header */}
        <div className="relative overflow-hidden rounded-3xl border border-white/80 bg-white/90 p-6 shadow-[0_12px_40px_rgba(15,23,42,0.1)] backdrop-blur sm:p-7">
          <div className="pointer-events-none absolute -top-16 -right-10 h-44 w-44 rounded-full bg-[#2563eb]/10 blur-3xl" />
          <div className="pointer-events-none absolute -bottom-16 -left-10 h-44 w-44 rounded-full bg-[#0d9488]/10 blur-3xl" />

          <div className="relative flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
            <div>
              <span className="inline-flex items-center gap-2 rounded-full border border-[#2563eb]/20 bg-[#2563eb]/10 px-3 py-1.5 text-xs font-semibold uppercase tracking-wider text-[#1d4ed8]">
                <TrendingUp className="h-3.5 w-3.5" /> Startup Intelligence Report
              </span>
              <h1 className="mt-3 text-2xl font-extrabold text-slate-900 sm:text-3xl">{sessionData.sessionName}</h1>
              {sessionData.sessionSeconds > 0 && (
                <p className="mt-1 text-sm text-slate-500">Session length: {fmt(sessionData.sessionSeconds)}</p>
              )}

              <div className="mt-3 flex flex-wrap gap-2">
                <span className="inline-flex items-center gap-1 rounded-full border border-slate-200 bg-slate-50 px-2.5 py-1 text-[11px] font-medium text-slate-600">
                  Score {scoreInfo.overallScore}%
                </span>
                <span className="inline-flex items-center gap-1 rounded-full border border-slate-200 bg-slate-50 px-2.5 py-1 text-[11px] font-medium text-slate-600">
                  {sessionData.notificationCount} notifications to refocus
                </span>
                <span className="inline-flex items-center gap-1 rounded-full border border-slate-200 bg-slate-50 px-2.5 py-1 text-[11px] font-medium text-slate-600">
                  Streak {sessionData.currentStreak}/{sessionData.streakGoalDays} days
                </span>
              </div>
            </div>

            <button
              onClick={() => navigate('/')}
              className="inline-flex items-center gap-2 rounded-xl bg-gradient-to-r from-[#2563eb] to-[#0d9488] px-5 py-2.5 text-sm font-medium text-white shadow-card transition-all duration-300 hover:shadow-btn-glow shrink-0"
            >
              New Session <ArrowRight className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* Score + Summary */}
        <div className="grid grid-cols-1 md:grid-cols-5 gap-5">

          {/* Score circle */}
          <motion.div
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            className="md:col-span-2 bg-white border border-slate-100 rounded-2xl p-8 flex flex-col items-center text-center gap-3 shadow-card"
          >
            <p className="text-xs font-semibold text-slate-400 uppercase tracking-widest">Overall Score</p>
            <div className="relative w-36 h-36 flex items-center justify-center">
              <svg className="absolute inset-0 w-full h-full -rotate-90" viewBox="0 0 120 120">
                <circle cx="60" cy="60" r="54" fill="none" stroke="#e2e8f0" strokeWidth="8" />
                <motion.circle
                  cx="60" cy="60" r="54" fill="none"
                  stroke="url(#scoreGradient)" strokeWidth="8"
                  strokeDasharray={circumference}
                  initial={{ strokeDashoffset: circumference }}
                  animate={{ strokeDashoffset: circumference - (circumference * scoreInfo.overallScore) / 100 }}
                  transition={{ duration: 1.2, ease: 'easeOut' }}
                  strokeLinecap="round"
                />
                <defs>
                  <linearGradient id="scoreGradient" x1="0%" y1="0%" x2="100%" y2="0%">
                    <stop offset="0%" stopColor="#2563eb" />
                    <stop offset="100%" stopColor="#0d9488" />
                  </linearGradient>
                </defs>
              </svg>
              <div>
                <div className="text-4xl font-bold" style={{ color: overallColor }}>{scoreInfo.overallScore}</div>
                <div className="text-xs text-slate-400 font-medium">/ 100</div>
              </div>
            </div>
            <p className="text-sm font-semibold" style={{ color: overallColor }}>
              {scoreInfo.overallScore >= 85 ? 'Exceptional' : scoreInfo.overallScore >= 65 ? 'Solid session' : 'Room to improve'}
            </p>
            <p className="text-xs text-slate-400">
              {sessionData.sessionDistractions} distraction{sessionData.sessionDistractions !== 1 ? 's' : ''}
              {' · '}avg {sessionData.avgAttention}%
            </p>
          </motion.div>

          {/* AI Summary */}
          <motion.div
            initial={{ opacity: 0, x: 12 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ delay: 0.1 }}
            className="md:col-span-3 bg-white border border-slate-100 rounded-2xl p-6 flex flex-col gap-4 shadow-card"
          >
            <p className="text-xs font-semibold text-slate-400 uppercase tracking-widest flex items-center gap-1.5">
              <Sparkles className="w-3.5 h-3.5 text-[#0d9488]" />
              AI Session Summary
            </p>
            {!aiReport ? (
              <p className="text-slate-400 text-sm animate-pulse">Generating session insights with Gemini…</p>
            ) : (
              <p className="text-slate-600 leading-relaxed text-sm flex-1">{aiReport.summary}</p>
            )}

            {/* Session event stats */}
            <div className="grid grid-cols-3 gap-2">
              {[
                { icon: Bell,          label: 'Notifications',    value: sessionData.notificationCount },
                { icon: MessageSquare, label: 'Talking Events',   value: sessionData.talkingDetections },
                { icon: Eye,           label: 'Look-Away Events', value: sessionData.lookAwayCount },
              ].map(({ icon: Icon, label, value }) => (
                <div key={label} className="flex flex-col items-center gap-1 p-3 bg-slate-50 rounded-xl border border-slate-100">
                  <Icon className="w-4 h-4 text-slate-400" />
                  <span className="text-xl font-bold text-slate-800">{value ?? 0}</span>
                  <span className="text-[10px] text-slate-400 text-center leading-tight">{label}</span>
                </div>
              ))}
            </div>
          </motion.div>
        </div>

        {/* Metric grid */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <MetricCard title="Focus Consistency"      value={scoreInfo.focusConsistency}      icon={Target}      />
          <MetricCard title="Distraction Resistance" value={scoreInfo.distractionResistance} icon={ShieldAlert} />
          <MetricCard title="Work Intensity"         value={scoreInfo.workIntensity}         icon={Zap}         />
          <MetricCard title="Energy Level"           value={scoreInfo.energyLevel}           icon={Activity}    />
        </div>

        {/* Focus Goal */}
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.12 }}
          className="rounded-2xl border border-slate-200 bg-white p-6 shadow-card"
        >
          <div className="mb-3 flex items-center gap-2">
            <Goal className="h-4 w-4 text-[#1d4ed8]" />
            <p className="text-xs font-semibold uppercase tracking-wider text-slate-500">Focus Goal</p>
          </div>

          <p className="text-base font-semibold text-slate-800">
            Goal: Reach 100% focus by the end of your {sessionData.streakGoalDays}-day streak.
          </p>
          <p className="mt-1 text-sm text-slate-600">
            Current focus is {scoreInfo.overallScore}%. You are {focusGap}% away from perfect focus,
            with {streakDaysLeft} day{streakDaysLeft !== 1 ? 's' : ''} left in your streak window.
          </p>

          <div className="mt-4 grid grid-cols-1 gap-4 md:grid-cols-2">
            <div>
              <div className="mb-1 flex items-center justify-between text-xs text-slate-500">
                <span>Focus Progress</span>
                <span>{scoreInfo.overallScore}% / 100%</span>
              </div>
              <div className="h-2.5 w-full overflow-hidden rounded-full bg-slate-100">
                <motion.div
                  className="h-full rounded-full bg-gradient-to-r from-[#2563eb] to-[#0d9488]"
                  initial={{ width: 0 }}
                  animate={{ width: `${scoreInfo.overallScore}%` }}
                  transition={{ duration: 0.8, ease: 'easeOut' }}
                />
              </div>
            </div>

            <div>
              <div className="mb-1 flex items-center justify-between text-xs text-slate-500">
                <span>Streak Progress</span>
                <span>{sessionData.currentStreak}/{sessionData.streakGoalDays} days</span>
              </div>
              <div className="h-2.5 w-full overflow-hidden rounded-full bg-slate-100">
                <motion.div
                  className="h-full rounded-full bg-gradient-to-r from-[#0d9488] to-[#10b981]"
                  initial={{ width: 0 }}
                  animate={{ width: `${streakPct}%` }}
                  transition={{ duration: 0.8, ease: 'easeOut' }}
                />
              </div>
            </div>
          </div>

          <div className={`mt-4 rounded-xl border px-3 py-2 text-sm ${goalOnTrack ? 'border-emerald-200 bg-emerald-50 text-emerald-700' : 'border-amber-200 bg-amber-50 text-amber-700'}`}>
            {goalOnTrack
              ? `On track: keep your consistency and reduce distractions to close the remaining ${focusGap}% gap.`
              : `Recovery plan: reduce look-away events and conversation breaks next session to move toward 100%.`}
          </div>
        </motion.div>

        {/* Gemini Intelligence */}
        {aiReport && (
          <motion.div
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.15 }}
            className="bg-white border border-slate-100 rounded-2xl p-6 shadow-card flex flex-col gap-5"
          >
            <p className="text-xs font-semibold text-slate-400 uppercase tracking-widest flex items-center gap-1.5">
              <Sparkles className="w-3.5 h-3.5 text-[#0d9488]" />
              Gemini Session Intelligence
            </p>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
              {/* Strengths */}
              <div>
                <p className="text-xs font-semibold text-emerald-600 mb-2 flex items-center gap-1.5">
                  <CheckCircle className="w-3.5 h-3.5" /> What went well
                </p>
                <ul className="flex flex-col gap-2">
                  {aiReport.strengths.map((s, i) => (
                    <li key={i} className="flex items-start gap-2 text-sm text-slate-600">
                      <span className="mt-0.5 w-1.5 h-1.5 rounded-full bg-emerald-400 shrink-0" />
                      {s}
                    </li>
                  ))}
                </ul>
              </div>

              {/* Improvements */}
              <div>
                <p className="text-xs font-semibold text-amber-600 mb-2 flex items-center gap-1.5">
                  <AlertTriangle className="w-3.5 h-3.5" /> Areas to improve
                </p>
                <ul className="flex flex-col gap-2">
                  {aiReport.improvements.map((tip, i) => (
                    <li key={i} className="flex items-start gap-2 text-sm text-slate-600">
                      <span className="mt-0.5 w-1.5 h-1.5 rounded-full bg-amber-400 shrink-0" />
                      {tip}
                    </li>
                  ))}
                </ul>
              </div>
            </div>

            {aiReport.distractionPattern && (
              <div className="p-3 bg-slate-50 rounded-xl border border-slate-100 text-sm text-slate-600">
                <span className="font-medium text-slate-700">Distraction pattern: </span>
                {aiReport.distractionPattern}
              </div>
            )}

            {aiReport.nextSessionTip && (
              <div className="p-4 bg-gradient-to-br from-[#2563eb]/5 to-[#0d9488]/5 rounded-xl border border-[#2563eb]/10">
                <p className="text-xs font-semibold text-slate-500 mb-1">Next session recommendation</p>
                <p className="text-sm text-slate-700">{aiReport.nextSessionTip}</p>
              </div>
            )}
          </motion.div>
        )}

        {/* Streak */}
        <motion.div
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.2 }}
          className="bg-white border border-slate-100 rounded-2xl p-6 shadow-card"
        >
          <div className="flex items-center justify-between mb-5">
            <h3 className="font-semibold text-slate-900 flex items-center gap-2">
              <Flame className="w-4 h-4 text-orange-400" /> Productivity Streak
            </h3>
            <span className="flex items-center gap-1.5 text-sm text-slate-500">
              <Trophy className="w-4 h-4 text-yellow-500" />
              Best: <strong className="text-slate-800 ml-1">{sessionData.longestStreak} days</strong>
            </span>
          </div>

          <div className="flex items-end gap-4 mb-4">
            <span className="text-5xl font-bold text-orange-500">{sessionData.currentStreak}</span>
            <div className="pb-1 text-sm text-slate-500">
              day streak
              <div className="text-xs text-slate-400">Goal: {sessionData.streakGoalDays} days</div>
            </div>
          </div>

          <div className="w-full h-2 bg-slate-100 rounded-full overflow-hidden mb-2">
            <motion.div
              className="h-full rounded-full bg-orange-400"
              initial={{ width: 0 }}
              animate={{ width: `${streakPct}%` }}
              transition={{ duration: 0.8, ease: 'easeOut' }}
            />
          </div>
          <div className="flex justify-between text-xs text-slate-400 mb-5">
            <span>0</span>
            <span>{streakPct}% to goal</span>
            <span>{sessionData.streakGoalDays} days</span>
          </div>

          <div className="flex gap-1.5 flex-wrap">
            {Array.from({ length: Math.min(sessionData.streakGoalDays, 30) }).map((_, i) => (
              <div
                key={i}
                className="w-7 h-7 rounded-full border text-xs font-bold flex items-center justify-center transition-colors"
                style={{
                  backgroundColor: i < sessionData.currentStreak ? 'rgba(249,115,22,0.1)' : 'transparent',
                  borderColor:     i < sessionData.currentStreak ? '#f97316' : '#e2e8f0',
                  color:           i < sessionData.currentStreak ? '#f97316' : '#94a3b8',
                }}
              >
                {i + 1}
              </div>
            ))}
          </div>

          {sessionData.currentStreak >= sessionData.streakGoalDays && (
            <div className="mt-4 p-3 bg-gradient-to-r from-[#2563eb]/10 to-[#0d9488]/10 border border-[#2563eb]/20 rounded-xl text-slate-700 text-sm font-medium text-center">
              Streak goal reached! Set a new goal in session setup.
            </div>
          )}
        </motion.div>

      </div>
    </div>
  );
}
