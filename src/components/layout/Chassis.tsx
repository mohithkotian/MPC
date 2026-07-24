import React from 'react';
import { useStore } from '../../store/useStore';
import { ViewMode } from '../../types';
import { Grid, Layers, Sliders, Music, Disc } from 'lucide-react';

interface ChassisProps {
  children: React.ReactNode;
}

export const Chassis: React.FC<ChassisProps> = ({ children }) => {
  const { viewMode, setViewMode } = useStore();

  const tabs: { mode: ViewMode; label: string; icon: React.ReactNode }[] = [
    { mode: 'MAIN', label: 'MAIN', icon: <Grid className="w-3.5 h-3.5" /> },
    { mode: 'STEP_EDIT', label: 'SEQUENCER', icon: <Layers className="w-3.5 h-3.5" /> },
    { mode: 'MIXER', label: 'MIXER', icon: <Sliders className="w-3.5 h-3.5" /> },
    { mode: 'SAMPLING', label: 'SAMPLE', icon: <Music className="w-3.5 h-3.5" /> },
  ];

  return (
    <div className="min-h-screen bg-[#07080a] py-6 px-2 md:px-6 flex flex-col items-center justify-start select-none font-hardware text-gray-200">
      <div className="relative w-full max-w-7xl bg-metal-pattern p-3 md:p-6 rounded-2xl border-2 border-[#0e0f14] shadow-[0_20px_60px_rgba(0,0,0,0.7),_inset_0_1px_0_rgba(255,255,255,0.03)]">

        <div className="absolute top-3 left-3 screw-head" />
        <div className="absolute top-3 right-3 screw-head" />
        <div className="absolute bottom-3 left-3 screw-head" />
        <div className="absolute bottom-3 right-3 screw-head" />

        <div className="flex flex-col md:flex-row items-center justify-between gap-3 border-b border-[#1e2028] pb-3 mb-4 px-2">
          <div className="flex items-center space-x-2">
            <div className="relative">
              <div className="w-2.5 h-6 bg-gradient-to-b from-orange-500 to-amber-600 rounded-sm" />
              <div className="absolute inset-0 w-2.5 h-6 bg-gradient-to-b from-orange-400 to-transparent rounded-sm opacity-50 blur-sm" />
            </div>
            <h1 className="text-xl font-black tracking-[0.2em] text-orange-500 uppercase drop-shadow-[0_0_8px_rgba(255,102,0,0.4)]">
              MCP
            </h1>
          </div>

          <div className="flex items-center space-x-1 bg-[#0c0d11] p-1 rounded-lg border border-[#1e2028]">
            {tabs.map((tab) => {
              const isActive = viewMode === tab.mode;
              return (
                <button
                  key={tab.mode}
                  onClick={() => setViewMode(tab.mode)}
                  className={`px-3 py-1.5 rounded-md text-[10px] font-black tracking-wider uppercase flex items-center space-x-1.5 transition-all duration-150 ${
                    isActive
                      ? 'bg-gradient-to-b from-orange-600 to-orange-800 text-white border border-orange-400/60 shadow-[inset_0_0_8px_rgba(255,165,0,0.6),_0_0_12px_rgba(255,102,0,0.3)]'
                      : 'bg-transparent text-gray-500 border border-transparent hover:text-gray-300 hover:bg-[#1a1c23]'
                  }`}
                >
                  {tab.icon}
                  <span className="hidden sm:inline">{tab.label}</span>
                </button>
              );
            })}
          </div>
        </div>

        <div className="w-full bg-[#12131a] p-2 md:p-5 rounded-xl border border-[#1e2028] min-h-[600px] flex items-center justify-center animate-slide-in">
          {children}
        </div>

        <div className="flex items-center justify-between pt-3 mt-3 border-t border-[#1e2028] text-[9px] font-mono text-gray-600 px-2">
          <div className="flex space-x-1">
            {Array.from({ length: 12 }, (_, i) => (
              <div key={i} className="w-3.5 h-0.5 bg-[#0c0d11] rounded-full border border-black/60" />
            ))}
          </div>
          <div className="tracking-wider">MCP-2026 // WEB AUDIO WORKSTATION</div>
        </div>
      </div>
    </div>
  );
};
