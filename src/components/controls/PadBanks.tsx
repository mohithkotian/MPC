import React from 'react';
import { useStore } from '../../store/useStore';
import { PRESET_KITS } from '../../services/audio/presetKits';

export const PadBanks: React.FC = () => {
  const { activePresetId, loadPresetKit, customKitNames } = useStore();
  const kitIds = ['kit1', 'kit2', 'synth808'];

  return (
    <div
      role="tablist"
      aria-label="Select kit"
      className="inline-flex h-9 w-full max-w-full min-w-0 items-center rounded-lg border border-[#2a2d36] bg-[#0c0d11] p-1 font-hardware select-none"
    >
      {kitIds.map((id) => {
        const isActive = activePresetId === id;
        const displayName = customKitNames[id] || PRESET_KITS[id]?.name || id;
        return (
          <button
            key={id}
            type="button"
            role="tab"
            aria-selected={isActive}
            onClick={() => loadPresetKit(id)}
            className={`h-7 min-w-0 flex-1 truncate rounded-md px-2 text-[9px] font-black tracking-wider uppercase transition-colors sm:text-[10px] ${
              isActive ? 'bg-orange-600 text-white' : 'bg-transparent text-gray-400 hover:text-white'
            }`}
            title={displayName}
          >
            {displayName}
          </button>
        );
      })}
    </div>
  );
};
