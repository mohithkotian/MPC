import React, { useRef } from 'react';

interface KnobProps {
  label: string;
  value: number;
  min?: number;
  max?: number;
  size?: 'sm' | 'md' | 'lg';
  onChange: (val: number) => void;
}

export const Knob: React.FC<KnobProps> = ({
  label,
  value,
  min = 0,
  max = 1,
  size = 'md',
  onChange,
}) => {
  const isDragging = useRef(false);
  const startY = useRef(0);
  const startVal = useRef(value);

  const normalized = (value - min) / (max - min);
  const angle = -135 + normalized * 270;

  const handleMouseDown = (e: React.MouseEvent) => {
    isDragging.current = true;
    startY.current = e.clientY;
    startVal.current = value;
    document.addEventListener('mousemove', handleMouseMove);
    document.addEventListener('mouseup', handleMouseUp);
  };

  const handleMouseMove = (e: MouseEvent) => {
    if (!isDragging.current) return;
    const deltaY = startY.current - e.clientY;
    const sensitivity = (max - min) / 150;
    const newVal = Math.max(min, Math.min(max, startVal.current + deltaY * sensitivity));
    onChange(newVal);
  };

  const handleMouseUp = () => {
    isDragging.current = false;
    document.removeEventListener('mousemove', handleMouseMove);
    document.removeEventListener('mouseup', handleMouseUp);
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
        onMouseDown={handleMouseDown}
        className={`relative ${dimensionClass} rounded-full bg-gradient-to-b from-[#2a2d36] via-[#1a1c22] to-[#0e0f13] shadow-knob-3d border border-[#363a46]/20 cursor-ns-resize flex items-center justify-center`}
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
