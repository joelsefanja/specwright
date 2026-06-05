"use client";
import React, { useId, useEffect, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { cn } from "./cn";

type Particle = {
  id: string;
  x: string;
  y: string;
  duration: number;
  delay: number;
  opacity: number;
  size: number;
};

export const SparklesCore = ({
  id,
  background,
  minSize = 0.4,
  maxSize = 1,
  speed = 1,
  particleColor = "#FFF",
  className,
  particleDensity = 120,
}: {
  id?: string;
  background?: string;
  minSize?: number;
  maxSize?: number;
  speed?: number;
  particleColor?: string;
  className?: string;
  particleDensity?: number;
}) => {
  const [particles, setParticles] = useState<Particle[]>([]);
  const generatedId = useId();

  useEffect(() => {
    const frame = requestAnimationFrame(() => {
      const generated: Particle[] = Array.from({ length: particleDensity }, (_, i) => ({
        id: `particle-${i}`,
        x: `${Math.random() * 100}%`,
        y: `${Math.random() * 100}%`,
        duration: Math.random() * 3 + 1,
        delay: Math.random() * 2,
        opacity: Math.random() * 0.5 + 0.3,
        size: Math.random() * (maxSize - minSize) + minSize,
      }));
      setParticles(generated);
    });

    return () => cancelAnimationFrame(frame);
  }, [particleDensity, minSize, maxSize]);

  return (
    <div className={cn("relative w-full h-full", className)}>
      <svg
        className="absolute inset-0 w-full h-full"
        style={{ background: background || "transparent" }}
      >
        <defs>
          <radialGradient id={`${id || generatedId}-glow`}>
            <stop offset="0%" stopColor={particleColor} stopOpacity="1" />
            <stop offset="100%" stopColor={particleColor} stopOpacity="0" />
          </radialGradient>
        </defs>
        <AnimatePresence>
          {particles.map((particle) => (
            <motion.circle
              key={particle.id}
              cx={particle.x}
              cy={particle.y}
              r={particle.size}
              fill={particleColor}
              initial={{ opacity: 0, scale: 0 }}
              animate={{
                opacity: [0, particle.opacity, 0],
                scale: [0, 1, 0],
                y: [0, -20, -40],
              }}
              transition={{
                duration: particle.duration / speed,
                delay: particle.delay,
                repeat: Infinity,
                ease: "easeInOut",
              }}
            />
          ))}
        </AnimatePresence>
      </svg>
    </div>
  );
};
