import React, { useEffect, useRef } from 'react';
import { audioEngine } from '../../services/audio/AudioEngine';

interface LevelMeterProps {
  source: 'master' | 'pad';
  padKey?: string;
  className?: string;
}

/**
 * Vertical level meter driven by peak measurements taken from the actual
 * audio signal (master bus or per-pad analyser), with a decaying peak-hold
 * indicator. Renders nothing visible when the engine has no signal.
 */
export const LevelMeter: React.FC<LevelMeterProps> = ({ source, padKey, className = '' }) => {
  const barRef = useRef<HTMLDivElement | null>(null);
  const peakRef = useRef<HTMLDivElement | null>(null);
  const peakHoldRef = useRef(0);
  const lastDecayRef = useRef(0);

  useEffect(() => {
    let rafId = 0;
    const loop = () => {
      const level = source === 'master'
        ? audioEngine.getMasterLevel()
        : padKey ? audioEngine.getPadLevel(padKey) : 0;

      const now = performance.now();
      if (level >= peakHoldRef.current) {
        peakHoldRef.current = level;
        lastDecayRef.current = now;
      } else if (now - lastDecayRef.current > 700) {
        peakHoldRef.current = Math.max(level, peakHoldRef.current - 0.015);
      }

      if (barRef.current) barRef.current.style.height = `${Math.round(level * 100)}%`;
      if (peakRef.current) peakRef.current.style.bottom = `${Math.round(peakHoldRef.current * 100)}%`;

      rafId = requestAnimationFrame(loop);
    };
    rafId = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(rafId);
  }, [source, padKey]);

  return (
    <div
      className={`relative w-2 bg-[#08080a] rounded overflow-hidden border border-[#1e2028] ${className}`}
      role="meter"
      aria-label={source === 'master' ? 'Master output level' : 'Pad output level'}
      aria-valuemin={0}
      aria-valuemax={100}
    >
      <div
        ref={barRef}
        className="absolute bottom-0 left-0 w-full bg-gradient-to-t from-emerald-600 via-amber-500 to-red-500 transition-none"
        style={{ height: '0%' }}
      />
      <div
        ref={peakRef}
        className="absolute left-0 w-full h-[1px] bg-orange-300 shadow-[0_0_3px_rgba(255,180,0,0.9)]"
        style={{ bottom: '0%' }}
      />
    </div>
  );
};

export const LevelMeterHorizontal: React.FC<{ source: 'master' | 'pad'; padKey?: string; className?: string }> = ({ source, padKey, className = '' }) => {
  const barRef = useRef<HTMLDivElement | null>(null);
  const peakRef = useRef<HTMLDivElement | null>(null);
  const peakHoldRef = useRef(0);
  const lastDecayRef = useRef(0);

  useEffect(() => {
    let rafId = 0;
    const loop = () => {
      const level = source === 'master'
        ? audioEngine.getMasterLevel()
        : padKey ? audioEngine.getPadLevel(padKey) : 0;
      const now = performance.now();
      if (level >= peakHoldRef.current) {
        peakHoldRef.current = level;
        lastDecayRef.current = now;
      } else if (now - lastDecayRef.current > 700) {
        peakHoldRef.current = Math.max(level, peakHoldRef.current - 0.015);
      }
      if (barRef.current) barRef.current.style.width = `${Math.round(level * 100)}%`;
      if (peakRef.current) peakRef.current.style.left = `${Math.round(peakHoldRef.current * 100)}%`;
      rafId = requestAnimationFrame(loop);
    };
    rafId = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(rafId);
  }, [source, padKey]);

  return (
    <div
      className={`relative h-2 bg-[#08080a] rounded overflow-hidden border border-[#1e2028] ${className}`}
      role="meter"
      aria-label={source === 'master' ? 'Master output level' : 'Pad output level'}
      aria-valuemin={0}
      aria-valuemax={100}
    >
      <div ref={barRef} className="absolute top-0 left-0 h-full bg-gradient-to-r from-emerald-600 via-amber-500 to-red-500" style={{ width: '0%' }} />
      <div ref={peakRef} className="absolute top-0 h-full w-[1px] bg-orange-300" style={{ left: '0%' }} />
    </div>
  );
};
