import React from 'react';
import { useStore } from '../../store/useStore';
import { Trash2, Play, Square, Sliders } from 'lucide-react';
import { KEY_LABELS } from '../../services/audio/presetKits';

export const SequencerView: React.FC = () => {
  const {
    activeBank,
    banks,
    patterns,
    toggleStep,
    clearBankPattern,
    currentStep,
    isPlaying,
    togglePlay,
    stopPlayback,
    swing,
    setSwing,
  } = useStore();

  const currentBankPads = banks[activeBank];
  const currentBankPattern = patterns[activeBank];

  return (
    <div className="w-full max-w-5xl mx-auto bg-[#12131a] p-5 rounded-xl border border-[#1e2028] font-hardware select-none animate-slide-in">
      <div className="flex flex-col md:flex-row items-center justify-between gap-4 border-b border-[#1e2028] pb-4 mb-4">
        <div>
          <h2 className="text-lg font-black text-white uppercase tracking-wider flex items-center gap-2">
            <Sliders className="w-5 h-5 text-orange-500" />
            Step Sequencer - Bank {activeBank}
          </h2>
          <p className="text-xs text-gray-500">Click steps to toggle beats. Use transport to play.</p>
        </div>

        <div className="flex items-center space-x-3">
          <div className="flex items-center bg-[#0c0d11] border border-[#1e2028] px-3 py-1.5 rounded">
            <span className="text-xs font-bold text-gray-500 mr-2 uppercase">SWING</span>
            <input
              type="range"
              min={0}
              max={75}
              value={swing}
              onChange={(e) => setSwing(Number(e.target.value))}
              className="w-20 accent-orange-500 bg-gray-700 rounded cursor-pointer"
            />
            <span className="text-xs font-mono font-bold text-orange-400 ml-2">{swing}%</span>
          </div>

          <button
            onClick={() => clearBankPattern(activeBank)}
            className="px-3 py-1.5 rounded bg-[#1a0e0e] hover:bg-red-950 border border-red-900/40 hover:border-red-800 text-red-400/80 hover:text-red-300 text-xs font-bold flex items-center space-x-1 transition-all duration-150"
          >
            <Trash2 className="w-3.5 h-3.5" />
            <span>CLEAR</span>
          </button>

          <button
            onClick={isPlaying ? stopPlayback : togglePlay}
            className={`px-4 py-1.5 rounded text-xs font-black uppercase flex items-center space-x-1.5 border transition-all duration-150 ${
              isPlaying
                ? 'bg-emerald-600 text-white border-emerald-400/60 shadow-[0_0_12px_rgba(16,185,129,0.3)]'
                : 'bg-[#1a1c22] text-gray-300 border-gray-700/50 hover:bg-[#24262e] shadow-beveled-btn'
            }`}
          >
            {isPlaying ? <Square className="w-3.5 h-3.5 fill-current" /> : <Play className="w-3.5 h-3.5 fill-current" />}
            <span>{isPlaying ? 'STOP' : 'PLAY'}</span>
          </button>
        </div>
      </div>

      <div className="grid grid-cols-[140px_1fr] gap-2 items-center mb-2">
        <div className="text-[10px] font-black text-gray-600 uppercase tracking-widest pl-2">PAD</div>
        <div className="grid grid-cols-16 gap-1">
          {Array.from({ length: 16 }, (_, i) => (
            <div
              key={i}
              className={`py-1 text-center font-mono text-[9px] font-bold rounded ${
                isPlaying && currentStep === i
                  ? 'bg-red-600 text-white font-extrabold shadow-[0_0_8px_rgba(255,0,0,0.5)]'
                  : i % 4 === 0
                  ? 'bg-[#1a1c22] text-orange-400/60 font-extrabold'
                  : 'bg-[#0c0d11] text-gray-600'
              }`}
            >
              {i + 1}
            </div>
          ))}
        </div>
      </div>

      <div className="space-y-1 max-h-[500px] overflow-y-auto pr-1 custom-scrollbar">
        {currentBankPads.map((pad, padIdx) => {
          const padPattern = currentBankPattern.pads[padIdx];
          return (
            <div
              key={`${activeBank}-${pad.id}`}
              className="grid grid-cols-[140px_1fr] gap-2 items-center bg-[#0e0f14] p-1.5 rounded border border-[#1e2028] hover:border-[#2a2d36] transition-colors"
            >
              <div className="flex items-center space-x-2 truncate">
                <span className="w-5 h-5 rounded bg-[#0c0d11] text-[9px] font-black text-orange-400/80 flex items-center justify-center border border-[#1e2028]">
                  {KEY_LABELS[padIdx]}
                </span>
                <span className="text-[10px] font-bold text-gray-300 truncate uppercase tracking-wide">
                  {pad.name}
                </span>
              </div>

              <div className="grid grid-cols-16 gap-1">
                {Array.from({ length: 16 }, (_, stepIdx) => {
                  const stepState = padPattern?.steps[stepIdx] || { active: false, velocity: 0.9 };
                  const isCurrentPlayStep = isPlaying && currentStep === stepIdx;
                  return (
                    <button
                      key={stepIdx}
                      onClick={() => toggleStep(padIdx, stepIdx)}
                      className={`h-6 rounded border transition-all duration-75 flex items-center justify-center text-[8px] font-mono ${
                        stepState.active
                          ? 'bg-gradient-to-b from-orange-500 to-amber-600 border-orange-300/60 text-black font-extrabold shadow-[inset_0_0_6px_rgba(255,102,0,0.6),_0_0_6px_rgba(255,102,0,0.3)]'
                          : stepIdx % 4 === 0
                          ? 'bg-[#14151a] border-[#2a2d36] hover:bg-[#1a1c22]'
                          : 'bg-[#0a0b0e] border-[#1e2028] hover:bg-[#14151a]'
                      } ${isCurrentPlayStep ? 'ring-1 ring-red-500/80 scale-105' : ''}`}
                    >
                      {stepState.active ? Math.round(stepState.velocity * 100) : ''}
                    </button>
                  );
                })}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
};
