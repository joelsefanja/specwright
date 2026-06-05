"use client";
import React, { useState, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import Image from "next/image";
import { cn } from "../ui/cn";
import { Pill } from "../ui/pill";

export type DesktopSlide = {
  id: string;
  label: string;
  description: string;
  src: string;
  badge?: string;
};

const DEFAULT_SLIDES: DesktopSlide[] = [
  {
    id: "welcome",
    label: "Welcome",
    description: "Open a project and Specwright is ready — zero configuration beyond your app URL and credentials.",
    src: "/screenshots/desktop-welcome.webp",
    badge: "Specwright Desktop",
  },
  {
    id: "instructions",
    label: "Instructions",
    description: "Describe test scenarios in plain English, pick a module template from the right panel, and hit Generate.",
    src: "/screenshots/desktop-instructions.webp",
    badge: "Phase 1–3 · Input",
  },
  {
    id: "plugin-mui",
    label: "MUI Plugin",
    description: "Overlay plugins extend the base framework — @specwright/plugin-mui adds MUI Select, Autocomplete, DatePicker, and Chip Input support.",
    src: "/screenshots/plugin_mui.webp",
    badge: "Plugin · Overlay",
  },
  {
    id: "explore",
    label: "Exploration",
    description: "The AI agent navigates your live app, discovers selectors, and builds a verified seed file — all automatically.",
    src: "/screenshots/desktop-explore.webp",
    badge: "Phase 4–5 · Live",
  },
  {
    id: "heal",
    label: "Auto-Healing",
    description: "When tests fail, Specwright diagnoses the root cause and rewrites selectors automatically — no manual debugging.",
    src: "/screenshots/desktop-healer.webp",
    badge: "Phase 8 · Heal",
  },
  {
    id: "review",
    label: "Final Review",
    description: "Every run ends with a quality score and a phase-by-phase breakdown. 97/100 means production-ready.",
    src: "/screenshots/desktop-review.webp",
    badge: "Phase 10 · Score",
  },
];

export function DesktopShowcaseSection({ slides = DEFAULT_SLIDES }: { slides?: DesktopSlide[] }) {
  const [active, setActive] = useState(0);
  const [isPlaying, setIsPlaying] = useState(true);

  useEffect(() => {
    if (!isPlaying || slides.length < 2) return;
    const t = setInterval(() => setActive((i) => (i + 1) % slides.length), 4000);
    return () => clearInterval(t);
  }, [isPlaying, slides.length]);

  const current = slides[active];

  return (
    <section className="py-24 px-4 bg-slate-950">
      <div className="max-w-5xl mx-auto">
        {/* Heading */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ duration: 0.6 }}
          className="text-center mb-12"
        >
          <p className="text-sm font-semibold text-purple-400 uppercase tracking-widest mb-3">Desktop App</p>
          <h2 className="text-4xl md:text-5xl font-bold text-white">
            See it in action
          </h2>
          <p className="mt-4 text-lg text-slate-400 max-w-2xl mx-auto">
            The Specwright Desktop app gives you a visual window into every phase of the pipeline.
          </p>
        </motion.div>

        {/* Screenshot frame */}
        <motion.div
          initial={{ opacity: 0, y: 30 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ duration: 0.7, delay: 0.2 }}
          className="relative"
        >
          {/* macOS-style window chrome */}
          <div className="rounded-t-2xl bg-slate-800 border border-slate-700 border-b-0 px-4 py-3 flex items-center gap-3">
            <div className="flex gap-1.5">
              <div className="w-3 h-3 rounded-full bg-red-500/80" />
              <div className="w-3 h-3 rounded-full bg-yellow-500/80" />
              <div className="w-3 h-3 rounded-full bg-emerald-500/80" />
            </div>
            <div className="flex-1 text-center">
              <span className="text-xs text-slate-400 font-medium">Specwright Desktop</span>
            </div>
            {current.badge && (
              <Pill className="bg-purple-500/20 text-purple-300">
                {current.badge}
              </Pill>
            )}
          </div>

          {/* Screenshot area */}
          <div
            className="relative rounded-b-2xl border border-slate-700 overflow-hidden bg-slate-900"
            style={{ aspectRatio: "1600/1034" }}
          >
            <AnimatePresence mode="wait">
              <motion.div
                key={current.id}
                initial={{ opacity: 0, x: 20 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: -20 }}
                transition={{ duration: 0.4 }}
                className="absolute inset-0"
              >
                <Image
                  src={current.src}
                  alt={current.label}
                  fill
                  className="object-cover object-center"
                  priority
                />
              </motion.div>
            </AnimatePresence>
          </div>
        </motion.div>

        {/* Slide controls + description */}
        <div className="mt-6 flex flex-col sm:flex-row items-start sm:items-center gap-6">
          {/* Dot navigation */}
          <div className="flex items-center gap-2 shrink-0">
            {slides.map((slide, i) => (
              <button
                key={slide.id}
                onClick={() => { setActive(i); setIsPlaying(false); }}
                className={cn(
                  "transition-all duration-300 rounded-full",
                  i === active
                    ? "w-6 h-2.5 bg-purple-500"
                    : "w-2.5 h-2.5 bg-slate-600 hover:bg-slate-400"
                )}
                aria-label={slide.label}
              />
            ))}
            <button
              onClick={() => setIsPlaying((p) => !p)}
              className="ml-2 text-slate-500 hover:text-slate-300 text-xs transition-colors"
            >
              {isPlaying ? "⏸" : "▶"}
            </button>
          </div>

          {/* Description */}
          <AnimatePresence mode="wait">
            <motion.div
              key={current.id}
              initial={{ opacity: 0, y: 5 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -5 }}
              transition={{ duration: 0.25 }}
            >
              <p className="text-sm font-semibold text-white">{current.label}</p>
              <p className="text-sm text-slate-400 mt-0.5">{current.description}</p>
            </motion.div>
          </AnimatePresence>
        </div>

        {/* Tab labels */}
        <div className="mt-4 flex gap-2 flex-wrap">
          {slides.map((slide, i) => (
            <button
              key={slide.id}
              onClick={() => { setActive(i); setIsPlaying(false); }}
              className={cn(
                "px-4 py-1.5 rounded-lg text-xs font-medium border transition-all duration-200",
                i === active
                  ? "bg-purple-600/20 border-purple-500/50 text-purple-300"
                  : "border-slate-700 text-slate-500 hover:border-slate-500 hover:text-slate-300"
              )}
            >
              {slide.label}
            </button>
          ))}
        </div>
      </div>
    </section>
  );
}
