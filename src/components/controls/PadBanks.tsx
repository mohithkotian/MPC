import React from 'react';
import { useStore } from '../../store/useStore';
import { BankId } from '../../types';
import { PRESET_KITS } from '../../services/audio/presetKits';

export const PadBanks: React.FC = () => {
  const { activeBank, setActiveBank, activePresetId, loadPresetKit, customKitNames } = useStore();
  const banks: BankId[] = ['A', 'B', 'C', 'D'];

  const kitIds = ['kit1', 'kit2', 'synth808'];

  return (
    <div className="flex flex-col w-full gap-3 select-none font-hardware">
      <div className="flex flex-col items-center sm:items-start">
        <span className="text-[9px] font-black text-gray-500 tracking-widest uppercase mb-1">PAD BANK</span>
        <div className="flex items-center space-x-1.5">
          {banks.map((bank) => {
            const isActive = activeBank === bank;
            return (
              <div key={bank} className="flex flex-col items-center space-y-0.5">
                <div
                  className={`w-2 h-2 rounded-full border border-black/80 transition-all duration-150 ${
                    isActive
                      ? 'bg-led-red shadow-[0_0_6px_#ee1111,0_0_12px_rgba(238,17,17,0.4)] border-red-400/50'
                      : 'bg-[#1a0505]'
                  }`}
                />
                <button
                  onClick={() => setActiveBank(bank)}
                  className={`w-8 h-6 rounded text-[10px] font-black uppercase transition-all duration-100 flex items-center justify-center border ${
                    isActive
                      ? 'bg-gradient-to-b from-[#3d424e] to-[#252830] text-white border-gray-400/40 shadow-beveled-btn-pressed translate-y-px'
                      : 'bg-gradient-to-b from-[#1a1c22] to-[#12131a] text-gray-500 border-[#0e0f14] shadow-beveled-btn hover:text-gray-300'
                  }`}
                >
                  {bank}
                </button>
              </div>
            );
          })}
        </div>
      </div>

      <div className="flex flex-col items-center sm:items-end justify-end">
        <div className="flex items-center space-x-1.5">
          {kitIds.map((id) => {
            const isActive = activePresetId === id;
            const displayName = customKitNames[id] || PRESET_KITS[id]?.name || id;
            return (
              <div key={id} className="flex flex-col items-center space-y-0.5">
                <div
                  className={`w-2 h-2 rounded-full border border-black/80 transition-all duration-150 ${
                    isActive
                      ? 'bg-led-orange shadow-[0_0_6px_#ff6600,0_0_12px_rgba(255,102,0,0.4)] border-orange-400/50'
                      : 'bg-[#1a1005]'
                  }`}
                />
                <button
                  onClick={() => loadPresetKit(id)}
                  className={`w-16 h-6 px-1 rounded text-[9px] font-black tracking-wider uppercase transition-all duration-100 flex items-center justify-center border truncate shrink-0 ${
                    isActive
                      ? 'bg-gradient-to-b from-orange-600 to-orange-800 text-white border-orange-400/40 shadow-beveled-btn-pressed translate-y-px'
                      : 'bg-gradient-to-b from-[#1a1c22] to-[#12131a] text-gray-400 border-[#0e0f14] shadow-beveled-btn hover:text-orange-400/70'
                  }`}
                  title={displayName}
                >
                  <span className="truncate">{displayName}</span>
                </button>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
};
