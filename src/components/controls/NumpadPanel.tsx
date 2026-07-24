import React from 'react';
import { useStore } from '../../store/useStore';
import { ViewMode } from '../../types';
import { Layers, Sliders, Music, Settings, Grid, VolumeX, Info, Camera } from 'lucide-react';

export const NumpadPanel: React.FC = () => {
  const { viewMode, setViewMode, noteVariation, setNoteVariation, stopAllPlayback } = useStore();

  const modeButtons: { mode: ViewMode; label: string; icon: React.ReactNode }[] = [
    { mode: 'MAIN', label: 'MAIN', icon: <Grid className="w-4 h-4" /> },
    { mode: 'STEP_EDIT', label: 'STEP EDIT', icon: <Layers className="w-4 h-4" /> },
    { mode: 'MIXER', label: 'MIXER', icon: <Sliders className="w-4 h-4" /> },
    { mode: 'SAMPLING', label: 'SAMPLE', icon: <Music className="w-4 h-4" /> },
  ];

  return (
    <div className="flex flex-col space-y-3 select-none font-hardware">
      <div className="grid grid-cols-4 gap-1.5">
        {modeButtons.map((btn) => {
          const isActive = viewMode === btn.mode;
          return (
            <button
              key={btn.mode}
              onClick={() => setViewMode(btn.mode)}
              className={`p-2 rounded flex flex-col items-center justify-center border transition-all duration-150 ${
                isActive
                  ? 'bg-gradient-to-b from-orange-600 to-orange-800 text-white border-orange-400 shadow-[inset_0_0_8px_rgba(255,165,0,0.8)]'
                  : 'bg-gradient-to-b from-[#262830] to-[#18191e] text-gray-300 border-gray-700 shadow-beveled-btn hover:bg-[#30333d] hover:text-white'
              }`}
            >
              {btn.icon}
              <span className="text-[9px] font-extrabold tracking-wider uppercase mt-0.5">{btn.label}</span>
            </button>
          );
        })}
      </div>

      <div className="flex items-center justify-between pt-2 border-t border-gray-800">
        <div className="flex items-center space-x-2">
          {/* STOP ALL Button */}
          <button
            onClick={stopAllPlayback}
            className="px-2.5 py-1.5 rounded bg-gradient-to-b from-[#2a2d36] to-[#17181f] text-red-400 border border-red-900/60 shadow-beveled-btn hover:bg-red-950/40 hover:border-red-600 flex items-center space-x-1 transition-all"
            title="Stop All Sounds (ESC / N)"
          >
            <VolumeX className="w-3.5 h-3.5" />
            <span className="text-[9px] font-extrabold tracking-wider">STOP ALL</span>
          </button>

          {/* INFO Button */}
          <button
            onClick={useStore.getState().toggleInfoMode}
            className={`px-2.5 py-1.5 rounded border transition-all flex items-center space-x-1 ${
              useStore((s) => s.isInfoActive)
                ? 'bg-amber-500/20 text-amber-300 border-amber-500/60 shadow-[0_0_8px_rgba(245,158,11,0.3)]'
                : 'bg-gradient-to-b from-[#2a2d36] to-[#17181f] text-gray-300 border-gray-700 shadow-beveled-btn hover:text-amber-300'
            }`}
            title="Show Pad Info in OLED (I)"
          >
            <Info className="w-3.5 h-3.5 text-amber-400" />
            <span className="text-[9px] font-extrabold tracking-wider">INFO</span>
          </button>

          {/* CAM TOGGLE Button */}
          <button
            onClick={useStore.getState().toggleCamera}
            className={`px-2.5 py-1.5 rounded border transition-all flex items-center space-x-1 ${
              useStore((s) => s.isCameraActive)
                ? 'bg-orange-600/20 text-orange-400 border-orange-500/60 shadow-[0_0_8px_rgba(255,102,0,0.3)]'
                : 'bg-gradient-to-b from-[#2a2d36] to-[#17181f] text-gray-300 border-gray-700 shadow-beveled-btn hover:text-orange-400'
            }`}
            title="Toggle Gesture Camera (K)"
          >
            <Camera className="w-3.5 h-3.5 text-orange-400" />
            <span className="text-[9px] font-extrabold tracking-wider">CAM</span>
          </button>

          <div className="flex flex-col items-center bg-[#15161a] px-2 py-1 rounded border border-gray-800">
            <span className="text-[7px] font-extrabold text-gray-400 uppercase mb-0.5">VAR</span>
            <input
              type="range"
              min={0}
              max={100}
              value={noteVariation}
              onChange={(e) => setNoteVariation(Number(e.target.value))}
              className="w-12 h-1.5 accent-orange-500 bg-gray-800 rounded cursor-pointer"
            />
            <span className="text-[8px] font-bold text-orange-400">{noteVariation}%</span>
          </div>
        </div>

        <div className="text-[9px] font-mono text-gray-500 hidden sm:block">
          A-F/G-K/Z-V/B-L
        </div>
      </div>
    </div>
  );
};
