"use client";
import React, { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { cn } from "../ui/cn";
import {
  QUICK_START_STEPS,
  QUICK_START_TABS,
  QUICK_START_VIDEOS,
  type QuickStartTab,
} from "./quick-start-data";
import { QuickStartDemoVideo, QuickStartStepCard } from "./quick-start-parts";

export function QuickStartSection() {
  const [activeTab, setActiveTab] = useState<QuickStartTab>("Plugin CLI");
  const activeSteps = QUICK_START_STEPS[activeTab];
  const activeVideo = QUICK_START_VIDEOS[activeTab];

  return (
    <section className="py-24 px-4 bg-slate-900/50 border-y border-slate-800">
      <div className="max-w-3xl mx-auto">
        {/* Heading */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ duration: 0.6 }}
          className="text-center mb-12"
        >
          <p className="text-sm font-semibold text-violet-400 uppercase tracking-widest mb-3">Quick start</p>
          <h2 className="text-4xl md:text-5xl font-bold text-white">
            Up and running in minutes
          </h2>
        </motion.div>

        {/* Tabs */}
        <div className="flex justify-center gap-2 mb-10">
          {QUICK_START_TABS.map((tab) => (
            <button
              key={tab}
              onClick={() => setActiveTab(tab)}
              className={cn(
                "px-5 py-2.5 rounded-xl text-sm font-medium border transition-all duration-200",
                activeTab === tab
                  ? "bg-violet-600/20 border-violet-500/50 text-violet-300"
                  : "border-slate-700 text-slate-400 hover:border-slate-500 hover:text-slate-200"
              )}
            >
              {tab}
            </button>
          ))}
        </div>

        {/* Steps */}
        <AnimatePresence mode="wait">
          <motion.div
            key={activeTab}
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -10 }}
            transition={{ duration: 0.25 }}
            className="space-y-4"
          >
            {activeSteps.map((step, stepIndex) => (
              <QuickStartStepCard key={stepIndex} step={step} stepIndex={stepIndex} />
            ))}

            {/* Demo video */}
            {activeVideo && (
              <QuickStartDemoVideo video={activeVideo} delay={activeSteps.length * 0.08 + 0.1} />
            )}
          </motion.div>
        </AnimatePresence>

        {/* CTA */}
        <motion.div
          initial={{ opacity: 0 }}
          whileInView={{ opacity: 1 }}
          viewport={{ once: true }}
          transition={{ delay: 0.4 }}
          className="mt-10 text-center"
        >
          <a
            href="/docs/getting-started"
            className="inline-flex items-center gap-2 px-6 py-3 rounded-xl bg-gradient-to-r from-violet-600 to-sky-500 text-white font-semibold text-sm hover:from-violet-500 hover:to-sky-400 transition-all duration-200"
          >
            Read the full guide →
          </a>
        </motion.div>
      </div>
    </section>
  );
}
