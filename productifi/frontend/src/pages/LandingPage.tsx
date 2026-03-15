import { useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import { Activity, ShieldCheck, BarChart3, ArrowRight, Sparkles } from 'lucide-react';

const fade = (delay = 0) => ({
  initial: { opacity: 0, y: 12 },
  animate: { opacity: 1, y: 0 },
  transition: { duration: 0.4, delay },
});

function FeatureCard({
  icon: Icon,
  title,
  description,
}: {
  icon: React.ElementType;
  title: string;
  description: string;
}) {
  return (
    <div className="bg-white rounded-2xl p-6 shadow-card hover:shadow-card-hover transition-all duration-300 border border-slate-200">
      <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-[#2563eb]/20 to-[#0d9488]/20 flex items-center justify-center mb-4">
        <Icon className="w-5 h-5 text-[#5B8CFF]" />
      </div>
      <h3 className="text-base font-semibold text-slate-900 mb-2">{title}</h3>
      <p className="text-sm text-slate-500 leading-relaxed">{description}</p>
    </div>
  );
}

export default function LandingPage() {
  const navigate = useNavigate();

  return (
    <div className="min-h-screen bg-[#f4f6f9] flex flex-col">
      <motion.header
        {...fade(0)}
        className="bg-white shadow-card px-6 py-12 text-center border-b border-slate-100"
      >
        <div className="max-w-4xl mx-auto">
          <div className="flex items-center justify-center mb-4">
            <div className="w-12 h-12 bg-gradient-productifi rounded-xl flex items-center justify-center mr-3">
              <Sparkles className="w-6 h-6 text-white" />
            </div>
            <h1 className="text-3xl font-bold text-slate-900">Productifi</h1>
          </div>
          <p className="text-lg text-slate-600 mb-8 max-w-2xl mx-auto">
            The AI-powered productivity companion that keeps you focused, engaged, and on track to achieve your goals.
          </p>
          <motion.button
            {...fade(0.2)}
            onClick={() => navigate('/customize')}
            className="inline-flex items-center gap-2 bg-gradient-productifi hover:shadow-btn-glow text-white font-semibold px-8 py-4 rounded-xl transition-all duration-300"
          >
            Start Your Focus Journey <ArrowRight className="w-5 h-5" />
          </motion.button>
        </div>
      </motion.header>

      <motion.main
        {...fade(0.4)}
        className="flex-1 px-6 py-16"
      >
        <div className="max-w-6xl mx-auto">
          <div className="text-center mb-12">
            <h2 className="text-2xl font-bold text-slate-900 mb-4">Why Productifi?</h2>
            <p className="text-slate-600 max-w-2xl mx-auto">
              Harness the power of AI to maintain focus and productivity in a world full of distractions.
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            <FeatureCard
              icon={Activity}
              title="Real-time Attention Tracking"
              description="Advanced computer vision monitors your focus using your webcam, providing instant feedback on your attention levels."
            />
            <FeatureCard
              icon={ShieldCheck}
              title="Distraction Prevention"
              description="Get notified when conversations or looking away are detected, helping you stay on task during focus sessions."
            />
            <FeatureCard
              icon={BarChart3}
              title="Detailed Analytics"
              description="Review your session performance with comprehensive reports on focus consistency, distractions, and productivity metrics."
            />
          </div>
        </div>
      </motion.main>

      <footer className="bg-slate-900 text-white px-6 py-8">
        <div className="max-w-6xl mx-auto text-center">
          <div className="flex items-center justify-center mb-4">
            <div className="w-8 h-8 bg-gradient-productifi rounded-lg flex items-center justify-center mr-2">
              <Sparkles className="w-4 h-4 text-white" />
            </div>
            <span className="text-lg font-semibold">Productifi</span>
          </div>
          <p className="text-slate-400 mb-4">Revolutionizing productivity with AI-driven focus tools.</p>
          <p className="text-sm text-slate-500">© 2026 Productifi Inc. All rights reserved.</p>
        </div>
      </footer>
    </div>
  );
}
