import React, { useRef } from 'react';
import { useStore } from '../../store/useStore';
import { KEY_LABELS } from '../../services/audio/presetKits';
import { SynthType } from '../../types';
import { Upload, Music } from 'lucide-react';

export const SamplingView: React.FC = () => {
  const {
    activeBank,
    selectedPadIndex,
    banks,
    updatePad,
    assignSynthToPad,
    uploadSampleToPad,
    triggerPad,
  } = useStore();

  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const pad = banks[activeBank][selectedPadIndex];

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      await uploadSampleToPad(activeBank, selectedPadIndex, file);
    }
  };

  const synthOptions: { type: SynthType; label: string }[] = [
    { type: 'kick', label: '808 Kick' },
    { type: 'snare', label: 'Snare' },
    { type: 'hihat', label: 'Hi-Hat' },
    { type: 'clap', label: 'Clap' },
    { type: 'tom', label: 'Tom' },
    { type: 'subbass', label: 'Sub Bass' },
    { type: 'lead', label: 'Lead' },
    { type: 'piano', label: 'Piano' },
  ];

  return (
    <div className="w-full max-w-4xl mx-auto bg-[#12131a] p-6 rounded-xl border border-[#1e2028] font-hardware select-none animate-slide-in">
      <div className="flex items-center justify-between border-b border-[#1e2028] pb-3 mb-5">
        <div>
          <h2 className="text-lg font-black text-white uppercase tracking-wider flex items-center gap-2">
            <Music className="w-5 h-5 text-orange-500" />
            Pad Editor - {KEY_LABELS[selectedPadIndex]}
          </h2>
          <p className="text-xs text-gray-500">Upload audio or assign a synthesizer to this pad.</p>
        </div>
        <button
          onClick={() => triggerPad(selectedPadIndex)}
          className="px-4 py-2 rounded bg-gradient-to-b from-orange-600 to-orange-800 text-white font-extrabold text-xs uppercase border border-orange-400/60 shadow-[0_0_12px_rgba(255,102,0,0.3)] hover:brightness-110 active:scale-95 transition-all duration-150"
        >
          TEST
        </button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <div className="bg-[#0e0f14] p-4 rounded-lg border border-[#1e2028] space-y-4">
          <h3 className="text-xs font-black text-gray-400 uppercase tracking-widest border-b border-[#1e2028] pb-2">
            AUDIO FILE
          </h3>

          <div
            className="flex flex-col items-center justify-center p-6 border-2 border-dashed border-gray-700/50 hover:border-orange-500/50 rounded-lg bg-[#0a0b0e] transition-all cursor-pointer group"
            onClick={() => fileInputRef.current?.click()}
          >
            <Upload className="w-8 h-8 text-orange-400/60 mb-2 group-hover:text-orange-400 transition-colors" />
            <span className="text-xs font-bold text-gray-300 group-hover:text-white transition-colors">
              Upload Audio File
            </span>
            <span className="text-[10px] text-gray-600 mt-1">.wav, .mp3, .ogg</span>
            <input
              ref={fileInputRef}
              type="file"
              accept="audio/*"
              onChange={handleFileChange}
              className="hidden"
            />
          </div>

          <div className="bg-[#0a0b0e] p-3 rounded border border-[#1e2028] space-y-1">
            <span className="text-[9px] font-bold text-gray-600 uppercase block tracking-wider">ACTIVE</span>
            <div className="text-sm font-extrabold text-white truncate">
              {pad?.name || 'EMPTY'}
            </div>
            <div className="text-[10px] font-mono text-orange-400/70">
              {pad?.audioBuffer
                ? `${Math.round(pad.audioBuffer.duration * 100) / 100}s`
                : pad?.synthParams?.type !== 'none'
                ? `SYNTH: ${pad.synthParams?.type}`
                : 'NO SOUND'}
            </div>
          </div>
        </div>

        <div className="bg-[#0e0f14] p-4 rounded-lg border border-[#1e2028] space-y-4">
          <h3 className="text-xs font-black text-gray-400 uppercase tracking-widest border-b border-[#1e2028] pb-2">
            SYNTHESIZER
          </h3>

          <div className="grid grid-cols-2 gap-2">
            {synthOptions.map((opt) => (
              <button
                key={opt.type}
                onClick={() => assignSynthToPad(activeBank, selectedPadIndex, opt.type, opt.label)}
                className={`p-2.5 rounded text-xs font-bold text-left border transition-all duration-150 ${
                  pad?.synthParams?.type === opt.type
                    ? 'bg-orange-600 text-white border-orange-400/60 shadow-[0_0_10px_rgba(255,102,0,0.3)]'
                    : 'bg-[#0a0b0e] text-gray-400 border-[#1e2028] hover:border-gray-600 hover:text-white'
                }`}
              >
                {opt.label}
              </button>
            ))}
          </div>

          <div className="pt-2 border-t border-[#1e2028]">
            <span className="text-[9px] font-black text-gray-500 uppercase block mb-1 tracking-wider">
              CHOKE GROUP
            </span>
            <div className="flex items-center space-x-2">
              {[0, 1, 2, 3, 4].map((group) => (
                <button
                  key={group}
                  onClick={() => updatePad(activeBank, selectedPadIndex, { chokeGroup: group })}
                  className={`flex-1 py-1.5 rounded text-xs font-bold border transition-all duration-150 ${
                    pad?.chokeGroup === group
                      ? 'bg-orange-600 text-black border-orange-400/60 font-extrabold'
                      : 'bg-[#0a0b0e] text-gray-500 border-[#1e2028] hover:text-white'
                  }`}
                >
                  {group === 0 ? 'OFF' : `GRP ${group}`}
                </button>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
