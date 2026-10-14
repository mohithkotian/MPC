import React, { useRef, useState } from 'react';

interface KnobProps {
  label: string;
  value: number;
  min?: number;
  max?: number;
  step?: number;
  size?: 'sm' | 'md' | 'lg';
  onChange: (val: number) => void;
}

export const Knob: React.FC<KnobProps> = ({
  label,
  value,
  min = 0,
  max = 1,
  step,
  size = 'md',
  onChange,
}) => {
  const isDragging = useRef(false);
  const startY = useRef(0);
  const startVal = useRef(value);
  const [isFocused, setIsFocused] = useState(false);

  const normalized = (value - min) / (max - min);
  const angle = -135 + normalized * 270;
  const kbStep = step ?? (max - min) / 20;

  const clampAndEmit = (next: number) => {
    onChange(Math.max(min, Math.min(max, next)));
  };

  const handlePointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    isDragging.current = true;
    startY.current = e.clientY;
    startVal.current = value;
    e.currentTarget.setPointerCapture(e.pointerId);
  };

  const handlePointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    if (!isDragging.current) return;
    const deltaY = startY.current - e.clientY;
    const sensitivity = (max - min) / 150;
    clampAndEmit(startVal.current + deltaY * sensitivity);
  };

  const handlePointerEnd = (e: React.PointerEvent<HTMLDivElement>) => {
    if (!isDragging.current) return;
    isDragging.current = false;
    if (e.currentTarget.hasPointerCapture(e.pointerId)) {
      e.currentTarget.releasePointerCapture(e.pointerId);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLDivElement>) => {
    if (e.key === 'ArrowUp' || e.key === 'ArrowRight') {
      e.preventDefault();
      clampAndEmit(value + kbStep);
    } else if (e.key === 'ArrowDown' || e.key === 'ArrowLeft') {
      e.preventDefault();
      clampAndEmit(value - kbStep);
    } else if (e.key === 'PageUp') {
      e.preventDefault();
      clampAndEmit(value + kbStep * 4);
    } else if (e.key === 'PageDown') {
      e.preventDefault();
      clampAndEmit(value - kbStep * 4);
    } else if (e.key === 'Home') {
      e.preventDefault();
      clampAndEmit(min);
    } else if (e.key === 'End') {
      e.preventDefault();
      clampAndEmit(max);
    }
  };

  const dimensionClass =
    size === 'sm' ? 'w-9 h-9' : size === 'lg' ? 'w-14 h-14' : 'w-11 h-11';

  return (
    <div className="flex flex-col items-center select-none font-hardware">
      {label && (
        <span className="text-[8px] font-extrabold tracking-[0.15em] text-gray-500 uppercase mb-1">
          {label}
        </span>
      )}
      <div
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerEnd}
        onPointerCancel={handlePointerEnd}
        onKeyDown={handleKeyDown}
        onFocus={() => setIsFocused(true)}
        onBlur={() => setIsFocused(false)}
        role="slider"
        tabIndex={0}
        aria-label={label || 'knob'}
        aria-valuemin={min}
        aria-valuemax={max}
        aria-valuenow={Number(value.toFixed(2))}
        className={`relative ${dimensionClass} rounded-full bg-gradient-to-b from-[#2a2d36] via-[#1a1c22] to-[#0e0f13] shadow-knob-3d border ${isFocused ? 'border-orange-400/70 shadow-[0_0_8px_rgba(255,102,0,0.35)]' : 'border-[#363a46]/20'} cursor-ns-resize flex items-center justify-center touch-none focus:outline-none`}
        style={{ touchAction: 'none' }}
      >
        <div className="absolute inset-0.5 rounded-full border border-black/40 bg-gradient-to-tr from-[#12131a] to-[#1e2028]" />

        <div
          className="absolute inset-1.5 rounded-full bg-gradient-to-br from-[#1e2028] to-[#0a0b0e] border border-gray-700/20 flex justify-center"
          style={{ transform: `rotate(${angle}deg)` }}
        >
          <div className="w-[2px] h-[36%] bg-gradient-to-b from-[#ff3333] to-[#cc0000] rounded-t-full shadow-[0_0_4px_#ff3333] mt-0.5" />
        </div>
      </div>
    </div>
  );
};
