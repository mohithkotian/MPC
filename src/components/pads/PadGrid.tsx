import React, { useEffect } from 'react';
import { useStore } from '../../store/useStore';
import { Pad } from './Pad';
import { KEY_LABELS } from '../../services/audio/presetKits';

export const PadGrid: React.FC = () => {
  const {
    activeBank,
    banks,
    selectedPadIndex,
    setSelectedPadIndex,
    triggerPad,
    activeTriggeredPads,
  } = useStore();

  const currentPads = banks[activeBank];

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Ignore key repeats to prevent retriggering when key is held down
      if (e.repeat) return;

      if (
        document.activeElement?.tagName === 'INPUT' ||
        document.activeElement?.tagName === 'TEXTAREA'
      ) {
        return;
      }

      const key = e.key.toUpperCase();

      // Global control shortcuts
      if (e.key === 'Escape' || e.code === 'Space') {
        e.preventDefault();
        useStore.getState().stopAllPlayback();
        return;
      }

      if (e.key === 'Tab') {
        e.preventDefault();
        useStore.getState().toggleInfoMode();
        return;
      }

      // 16-pad keyboard mapping (ASDF / GHJK / ZXCV / BNML)
      const padIdx = KEY_LABELS.indexOf(key);
      if (padIdx !== -1) {
        e.preventDefault();
        triggerPad(padIdx);
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [triggerPad]);

  return (
    <div className="w-full max-w-[500px] aspect-square bg-gradient-to-b from-[#191b20] to-[#111216] p-3 sm:p-4 rounded-xl border border-[#2b2e38] shadow-hardware-panel font-hardware flex flex-col justify-between">
      <div className="grid grid-cols-4 grid-rows-4 gap-2.5 sm:gap-3 w-full h-full">
        {currentPads.map((pad, idx) => (
          <Pad
            key={`${activeBank}-${pad.id}`}
            pad={pad}
            isSelected={selectedPadIndex === idx}
            isTriggered={!!activeTriggeredPads[idx]}
            onSelect={() => setSelectedPadIndex(idx)}
            onTrigger={(vel) => triggerPad(idx, vel)}
          />
        ))}
      </div>
    </div>
  );
};
