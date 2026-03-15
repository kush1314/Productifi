import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import { useSessionStore } from '../store/sessionStore';
import { generateReportSummary } from '../services/aiReportService';
import { ArrowRight, Flame, Trophy, Target, Zap, ShieldAlert, Activity, Sparkles } from 'lucide-react';
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
  const [aiSummary, setAiSummary] = useState('Generating session insights…');

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
    generateReportSummary(sessionData, scoreInfo).then(setAiSummary);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const fmt = (sec: number) => {
    const m = Math.floor(sec / 60);
    const s = sec % 60;
    return m > 0 ? `${m}m ${s}s` : `${s}s`;
  };

  const overallColor = scoreInfo.overallScore >= 75 ? '#059669' : scoreInfo.overallScore >= 50 ? '#d97706' : '#dc2626';
  const circumference = 2 * Math.PI * 54;

  return (
    <div className="min-h-screen bg-[#f4f6f9] py-10 px-6">
      <div className="max-w-5xl mx-auto flex flex-col gap-6">

        {/* Header */}
        <div className="flex items-start justify-between gap-4">
          <div>
            <span className="inline-flex items-center gap-2 text-xs font-medium text-slate-500 bg-white px-3 py-1.5 rounded-full shadow-card border border-slate-100 mb-3">
              <span className="w-1.5 h-1.5 rounded-full bg-gradient-to-r from-[#2563eb] to-[#0d9488]" />
              Productifi · Session Report
            </span>
            <h1 className="text-2xl font-bold text-slate-900">{sessionData.sessionName}</h1>
            {sessionData.sessionSeconds > 0 && (
              <p className="text-sm text-slate-500 mt-0.5">{fmt(sessionData.sessionSeconds)}</p>
            )}
          </div>
          <button
            onClick={() => navigate('/')}
            className="flex items-center gap-2 bg-gradient-to-r from-[#2563eb] to-[#0d9488] hover:shadow-btn-glow text-white text-sm font-medium px-5 py-2.5 rounded-xl transition-all duration-300 shadow-card shrink-0"
          >
            New Session <ArrowRight className="w-4 h-4" />
          </button>
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
            <p className="text-slate-600 leading-relaxed text-sm flex-1">{aiSummary}</p>
            <div className="p-4 bg-gradient-to-br from-[#2563eb]/5 to-[#0d9488]/5 rounded-xl border border-[#2563eb]/10">
              <p className="text-xs font-semibold text-slate-500 mb-1">Recommendation</p>
              <p className="text-xs text-slate-500 leading-relaxed">
                {scoreInfo.overallScore >= 80
                  ? 'Great work! Keep session length consistent and take a short break before your next task.'
                  : scoreInfo.distractionResistance < 60
                  ? 'Try Strict mode and close unnecessary tabs to reduce distractions.'
                  : 'Consider a 5-minute break — fatigue tends to spike around the 45-minute mark.'}
              </p>
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
