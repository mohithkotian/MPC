import React from 'react';
import { useStore } from '../../store/useStore';
import { Knob } from '../controls/Knob';
import { KEY_LABELS } from '../../services/audio/presetKits';
import { Volume2 } from 'lucide-react';

export const MixerView: React.FC = () => {
  const { activeBank, banks, updatePad, masterVolume, setMasterVolume } = useStore();
  const currentPads = banks[activeBank];

  return (
    <div className="w-full max-w-6xl mx-auto bg-[#12131a] p-5 rounded-xl border border-[#1e2028] font-hardware select-none animate-slide-in">
      <div className="flex items-center justify-between border-b border-[#1e2028] pb-3 mb-4">
        <div>
          <h2 className="text-lg font-black text-white uppercase tracking-wider flex items-center gap-2">
            <Volume2 className="w-5 h-5 text-orange-500" />
            Pad Mixer - Bank {activeBank}
          </h2>
          <p className="text-xs text-gray-500">Adjust volume, pan, pitch, and choke groups per pad.</p>
        </div>
        <div className="bg-[#0c0d11] px-4 py-2 rounded border border-[#1e2028] flex items-center space-x-3">
          <span className="text-[10px] font-extrabold text-gray-500 uppercase tracking-wider">MASTER</span>
          <Knob label="" value={masterVolume} onChange={setMasterVolume} size="sm" />
          <span className="text-xs font-mono font-bold text-oled-red-bright">{Math.round(masterVolume * 100)}%</span>
        </div>
      </div>

      <div className="flex space-x-2 overflow-x-auto pb-4 custom-scrollbar">
        {currentPads.map((pad, idx) => (
          <div
            key={`${activeBank}-${pad.id}`}
            className="flex-shrink-0 w-24 bg-[#0e0f14] p-2 rounded-lg border border-[#1e2028] flex flex-col items-center justify-between space-y-2"
          >
            <div className="w-full flex items-center justify-between border-b border-[#1e2028] pb-1">
              <span className="text-[10px] font-black text-orange-400/80 bg-black/40 px-1.5 py-0.5 rounded border border-[#1e2028]">
                {KEY_LABELS[idx]}
              </span>
              <span className="text-[8px] font-mono text-gray-600">
                {pad.chokeGroup > 0 ? `CH${pad.chokeGroup}` : ''}
              </span>
            </div>

            <span className="text-[9px] font-extrabold text-white/80 text-center truncate w-full uppercase tracking-wide">
              {pad.name}
            </span>

            <Knob
              label="PAN"
              value={(pad.pan + 1) / 2}
              onChange={(v) => updatePad(activeBank, idx, { pan: v * 2 - 1 })}
              size="sm"
            />

            <div className="flex flex-col items-center bg-[#0a0b0e] p-1 rounded w-full border border-[#1e2028]">
              <span className="text-[7px] font-extrabold text-gray-600 uppercase mb-0.5 tracking-wider">PITCH</span>
              <div className="flex items-center space-x-1">
                <button
                  onClick={() => updatePad(activeBank, idx, { pitch: Math.max(-12, pad.pitch - 1) })}
                  className="w-5 h-5 rounded bg-[#1a1c22] text-[10px] font-bold text-gray-400 hover:text-white border border-[#1e2028] transition-colors"
                >
                  -
                </button>
                <span className="text-[9px] font-mono font-bold text-orange-300/80 w-5 text-center">
                  {pad.pitch > 0 ? `+${pad.pitch}` : pad.pitch}
                </span>
                <button
                  onClick={() => updatePad(activeBank, idx, { pitch: Math.min(12, pad.pitch + 1) })}
                  className="w-5 h-5 rounded bg-[#1a1c22] text-[10px] font-bold text-gray-400 hover:text-white border border-[#1e2028] transition-colors"
                >
                  +
                </button>
              </div>
            </div>

            <div className="flex items-center space-x-2 h-32 bg-[#0a0b0e] p-1.5 rounded border border-[#1e2028]">
              <div className="w-2 h-full bg-[#08080a] rounded overflow-hidden flex flex-col justify-end p-px border border-[#1e2028]">
                <div
                  className="w-full bg-gradient-to-t from-emerald-600 via-amber-500 to-red-500 rounded-sm transition-all duration-100"
                  style={{ height: `${pad.volume * 100}%` }}
                />
              </div>
              <input
                type="range"
                min={0}
                max={1}
                step={0.01}
                value={pad.volume}
                onChange={(e) => updatePad(activeBank, idx, { volume: Number(e.target.value) })}
                className="w-2 h-24 accent-orange-500 bg-gray-800 rounded cursor-pointer rotate-270 my-auto"
              />
            </div>

            <span className="text-[9px] font-mono font-bold text-gray-400">
              {Math.round(pad.volume * 100)}%
            </span>
          </div>
        ))}
      </div>
    </div>
  );
};
