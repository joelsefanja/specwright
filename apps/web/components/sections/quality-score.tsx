"use client";
import React, { useEffect, useRef, useState } from "react";
import { motion, useInView } from "framer-motion";
import { SparklesCore } from "../ui/sparkles";
import { Pill } from "../ui/pill";

const SCORE_BARS = [
  { label: "Exploration", score: 100 },
  { label: "Feature File", score: 100 },
  { label: "Step Definitions", score: 97 },
  { label: "Test Execution", score: 100 },
  { label: "Healing", score: 97 },
];

function AnimatedCounter({ target, duration = 1.5 }: { target: number; duration?: number }) {
  const ref = useRef<HTMLSpanElement>(null);
  const isInView = useInView(ref, { once: true });
  const [count, setCount] = useState(0);

  useEffect(() => {
    if (!isInView) return;
    const start = Date.now();
    const timer = setInterval(() => {
      const elapsed = (Date.now() - start) / 1000;
      const progress = Math.min(elapsed / duration, 1);
      const eased = 1 - Math.pow(1 - progress, 3);
      setCount(Math.round(eased * target));
      if (progress >= 1) clearInterval(timer);
    }, 16);
    return () => clearInterval(timer);
  }, [isInView, target, duration]);

  return <span ref={ref}>{count}</span>;
}

export function QualityScoreSection() {
  const ref = useRef<HTMLDivElement>(null);
  const isInView = useInView(ref, { once: true });

  return (
    <section ref={ref} className="py-24 px-4 bg-slate-900/50 relative overflow-hidden">
      {/* Sparkles background */}
      <div className="absolute inset-0 z-0">
        <SparklesCore
          particleDensity={60}
          particleColor="#eab308"
          minSize={0.4}
          maxSize={1.2}
          speed={0.5}
          className="w-full h-full"
        />
      </div>

      <div className="relative z-10 max-w-4xl mx-auto text-center">
        {/* Heading */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ duration: 0.6 }}
          className="mb-12"
        >
          <p className="text-sm font-semibold text-yellow-400 uppercase tracking-widest mb-3">Quality scoring</p>
          <h2 className="text-4xl md:text-5xl font-bold text-white">
            Every run is graded
          </h2>
          <p className="mt-4 text-lg text-slate-400 max-w-xl mx-auto">
            Phase-by-phase quality scoring with actionable feedback. Know exactly
            what to fix before shipping.
          </p>
        </motion.div>

        {/* Score card */}
        <motion.div
          initial={{ opacity: 0, scale: 0.95 }}
          whileInView={{ opacity: 1, scale: 1 }}
          viewport={{ once: true }}
          transition={{ duration: 0.7, delay: 0.2 }}
          className="bg-slate-900/90 border border-yellow-500/20 rounded-2xl p-8 backdrop-blur-sm shadow-2xl shadow-yellow-500/5"
        >
          {/* Main score */}
          <div className="mb-8">
            <p className="text-slate-500 text-sm mb-1">Quality Score</p>
            <div className="text-8xl font-bold text-white">
              {isInView ? <AnimatedCounter target={99} duration={1.5} /> : 0}
            </div>
            <div className="flex items-center justify-center gap-1 mt-2">
              {"⭐⭐⭐⭐⭐".split("").map((star, i) => (
                <motion.span
                  key={i}
                  initial={{ opacity: 0, scale: 0 }}
                  animate={isInView ? { opacity: 1, scale: 1 } : {}}
                  transition={{ delay: 1.5 + i * 0.1 }}
                  className="text-2xl"
                >
                  {star}
                </motion.span>
              ))}
            </div>
            <motion.p
              initial={{ opacity: 0 }}
              animate={isInView ? { opacity: 1 } : {}}
              transition={{ delay: 2 }}
              className="text-emerald-400 font-semibold mt-2 text-sm"
            >
              PRODUCTION READY — issues auto-resolved
            </motion.p>
          </div>

          {/* Stats pills */}
          <div className="flex flex-wrap justify-center gap-3 mb-8">
            {[
              { label: "Scenarios", value: "12" },
              { label: "Coverage", value: "94%" },
              { label: "Auto-healed", value: "2 failures" },
            ].map((stat, i) => (
              <motion.div
                key={stat.label}
                initial={{ opacity: 0, x: -10 }}
                animate={isInView ? { opacity: 1, x: 0 } : {}}
                transition={{ delay: 1.8 + i * 0.1 }}
                className="contents"
              >
                <Pill className="bg-slate-800/80 px-4 py-2 text-sm text-slate-400">
                  <span className="text-white font-semibold">{stat.value}</span>
                  <span className="ml-1">{stat.label}</span>
                </Pill>
              </motion.div>
            ))}
          </div>

          {/* Score bars */}
          <div className="space-y-3 text-left">
            {SCORE_BARS.map((bar, i) => (
              <div key={bar.label}>
                <div className="flex justify-between text-xs mb-1">
                  <span className="text-slate-400">{bar.label}</span>
                  <span className="text-white font-semibold">{bar.score}/100</span>
                </div>
                <div className="h-1.5 bg-slate-800 rounded-full overflow-hidden">
                  <motion.div
                    className="h-full rounded-full bg-gradient-to-r from-yellow-500 to-amber-400"
                    initial={{ width: 0 }}
                    animate={isInView ? { width: `${bar.score}%` } : {}}
                    transition={{ duration: 1, delay: 0.5 + i * 0.15, ease: "easeOut" }}
                  />
                </div>
              </div>
            ))}
          </div>
        </motion.div>
      </div>
    </section>
  );
}
