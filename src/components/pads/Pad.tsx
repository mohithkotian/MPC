import React, { useState } from 'react';
import { PadConfig } from '../../types';
import { useStore } from '../../store/useStore';

interface PadProps {
  pad: PadConfig;
  isSelected: boolean;
  isTriggered: boolean;
  onTrigger: (velocity?: number) => void;
  onSelect: () => void;
}

export const Pad: React.FC<PadProps> = ({
  pad,
  isSelected,
  isTriggered,
  onTrigger,
  onSelect,
}) => {
  const [isPressed, setIsPressed] = useState(false);

  const handleMouseDown = (e: React.MouseEvent<HTMLButtonElement>) => {
    setIsPressed(true);
    onSelect();
    const rect = e.currentTarget.getBoundingClientRect();
    const offsetY = e.clientY - rect.top;
    const calcVel = Math.max(0.3, Math.min(1.0, 1.0 - (offsetY / rect.height) * 0.5));
    onTrigger(calcVel);
  };

  const handleMouseUp = () => setIsPressed(false);

  const handleTouchStart = (e: React.TouchEvent) => {
    e.preventDefault();
    setIsPressed(true);
    onSelect();
    onTrigger(0.95);
  };

  const handleTouchEnd = () => setIsPressed(false);

  const [isEditing, setIsEditing] = useState(false);
  const [padName, setPadName] = useState(pad.name);

  const handleDoubleClick = (e: React.MouseEvent) => {
    e.stopPropagation();
    e.preventDefault();
    setIsEditing(true);
    setPadName(pad.name);
  };

  const handleSaveName = () => {
    if (padName.trim()) {
      useStore.getState().renamePad(pad.bank, pad.bankPadIndex, padName.trim());
    }
    setIsEditing(false);
  };

  const isLit = isTriggered || isPressed;

  const padClasses = isLit
    ? 'bg-gradient-to-b from-[#e65c00] to-[#b33600] border-2 border-orange-300/80 shadow-[0_0_24px_#ff6600,0_0_48px_rgba(255,102,0,0.3)] scale-[0.96]'
    : isSelected
    ? 'bg-gradient-to-b from-[#2d3038] to-[#1c1e24] border-2 border-white/60 shadow-[0_0_14px_rgba(255,255,255,0.4),_inset_0_0_4px_rgba(255,255,255,0.1)]'
    : 'bg-gradient-to-b from-[#262830] to-[#17181f] border border-[#363a46]/50 shadow-[inset_1px_1px_2px_rgba(255,255,255,0.06),_inset_-2px_-2px_4px_rgba(0,0,0,0.8),_0_4px_8px_rgba(0,0,0,0.4)] hover:border-gray-500/50 hover:shadow-[inset_1px_1px_2px_rgba(255,255,255,0.06),_inset_-2px_-2px_4px_rgba(0,0,0,0.8),_0_4px_12px_rgba(0,0,0,0.5),_0_0_8px_rgba(255,102,0,0.1)]';

  return (
    <button
      onMouseDown={handleMouseDown}
      onMouseUp={handleMouseUp}
      onMouseLeave={handleMouseUp}
      onTouchStart={handleTouchStart}
      onTouchEnd={handleTouchEnd}
      onDoubleClick={handleDoubleClick}
      className={`relative w-full h-full aspect-square rounded-lg p-1.5 sm:p-2 flex flex-col justify-between items-center select-none cursor-pointer transition-all duration-75 font-hardware overflow-hidden min-w-0 min-h-0 ${padClasses}`}
    >
      <span className="text-[10px] font-black text-gray-400 tracking-wider block shrink-0">
        {pad.keyLabel}
      </span>

      <div className="my-auto text-center w-full px-0.5 min-w-0 overflow-hidden shrink flex flex-col justify-center items-center">
        {isEditing ? (
          <input
            type="text"
            value={padName}
            onChange={(e) => setPadName(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') handleSaveName();
              if (e.key === 'Escape') setIsEditing(false);
            }}
            onBlur={handleSaveName}
            autoFocus
            onClick={(e) => e.stopPropagation()}
            onMouseDown={(e) => e.stopPropagation()}
            className="w-full bg-black text-white px-1 py-0.5 rounded text-[10px] font-bold text-center border border-orange-400 outline-none uppercase min-w-0"
          />
        ) : (
          <h3
            title="Double-click to rename pad"
            className="text-[10px] sm:text-[11px] font-bold tracking-tight text-white/90 drop-shadow uppercase leading-tight max-w-full block overflow-hidden text-ellipsis whitespace-nowrap"
          >
            {pad.name}
          </h3>
        )}

        {/* Reserved fixed-height slot for sub-label / channel tag so all pads have identical layout */}
        <div className="h-3 flex items-center justify-center mt-0.5 shrink-0">
          {pad.chokeGroup > 0 ? (
            <span className="text-[7px] font-mono text-orange-400/80 font-bold leading-none block">
              CH{pad.chokeGroup}
            </span>
          ) : (
            <span className="text-[7px] font-mono opacity-0 leading-none block select-none">
              CH0
            </span>
          )}
        </div>
      </div>

      <div className="w-7 h-0.5 bg-gray-700/50 rounded-full overflow-hidden shrink-0">
        <div
          className="h-full bg-gradient-to-r from-orange-600 to-orange-400 transition-all duration-200"
          style={{ width: `${pad.volume * 100}%` }}
        />
      </div>
    </button>
  );
};
