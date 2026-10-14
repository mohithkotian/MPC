import React, { useRef } from 'react';
import { useStore } from '../../store/useStore';
import { KEY_LABELS } from '../../services/audio/presetKits';
import { SynthType } from '../../types';
import { Upload, Music, Loader2, AlertTriangle, RefreshCw, CheckCircle2 } from 'lucide-react';
import { WaveformEditor } from './WaveformEditor';

export const SamplingView: React.FC = () => {
  const {
    activeBank,
    selectedPadIndex,
    banks,
    updatePad,
    assignSynthToPad,
    uploadSampleToPad,
    triggerPad,
    setSelectedPadIndex,
    sampleUpload,
    padSampleState,
    reloadPadSample,
  } = useStore();

  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const pad = banks[activeBank][selectedPadIndex];
  const padKey = `${activeBank}-${selectedPadIndex}`;
  const sampleState = padSampleState[padKey];
  const isUploading = sampleUpload.status === 'decoding' || sampleUpload.status === 'saving';

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      await uploadSampleToPad(activeBank, selectedPadIndex, file);
    }
    e.target.value = '';
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
    <div className="w-full max-w-5xl mx-auto bg-[#12131a] p-5 sm:p-6 rounded-xl border border-[#1e2028] font-hardware select-none animate-slide-in">
      <div className="flex items-center justify-between border-b border-[#1e2028] pb-3 mb-5 gap-3 flex-wrap">
        <div>
          <h2 className="text-lg font-black text-white uppercase tracking-wider flex items-center gap-2">
            <Music className="w-5 h-5 text-orange-500" />
            Sample Editor - Pad {selectedPadIndex + 1} [{KEY_LABELS[selectedPadIndex]}] - Bank {activeBank}
          </h2>
          <p className="text-xs text-gray-500">Upload audio, trim it, and assign it to any of the 16 pads.</p>
        </div>
        <button
          onClick={() => triggerPad(selectedPadIndex)}
          className="px-4 py-2 rounded bg-gradient-to-b from-orange-600 to-orange-800 text-white font-extrabold text-xs uppercase border border-orange-400/60 shadow-[0_0_12px_rgba(255,102,0,0.3)] hover:brightness-110 active:scale-95 transition-all duration-150"
        >
          TEST PAD
        </button>
      </div>

      {/* 16-pad selector: choose which pad receives the sample */}
      <div className="mb-5">
        <span className="text-[9px] font-black text-gray-500 uppercase block mb-1.5 tracking-widest">
          TARGET PAD (BANK {activeBank})
        </span>
        <div className="grid grid-cols-8 sm:grid-cols-16 gap-1.5 max-w-xl">
          {banks[activeBank].map((bankPad, idx) => {
            const state = padSampleState[`${activeBank}-${idx}`];
            const isSelected = idx === selectedPadIndex;
            return (
              <button
                key={idx}
                type="button"
                onClick={() => setSelectedPadIndex(idx)}
                className={`relative aspect-square rounded border flex flex-col items-center justify-center transition-all duration-100 min-w-0 px-0.5 ${
                  isSelected
                    ? 'bg-orange-600 text-white border-orange-300 shadow-[0_0_10px_rgba(255,102,0,0.4)]'
                    : 'bg-[#0e0f14] text-gray-400 border-[#1e2028] hover:border-gray-500'
                }`}
                title={`Pad ${idx + 1}: ${bankPad.name}`}
              >
                <span className="text-[9px] font-black leading-none">{KEY_LABELS[idx]}</span>
                <span className="text-[6px] truncate w-full text-center leading-none mt-0.5 opacity-80">
                  {bankPad.name}
                </span>
                {state?.status === 'failed' && (
                  <span className="absolute -top-1 -right-1 w-2 h-2 rounded-full bg-red-500 border border-red-300" title={state.error || 'Sample failed'} />
                )}
                {state?.status === 'loading' && (
                  <span className="absolute -top-1 -right-1 w-2 h-2 rounded-full bg-amber-400 animate-pulse border border-amber-200" />
                )}
              </button>
            );
          })}
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <div className="bg-[#0e0f14] p-4 rounded-lg border border-[#1e2028] space-y-4">
          <h3 className="text-xs font-black text-gray-400 uppercase tracking-widest border-b border-[#1e2028] pb-2">
            AUDIO FILE
          </h3>

          <div
            className={`flex flex-col items-center justify-center p-5 border-2 border-dashed transition-all rounded-lg bg-[#0a0b0e] group ${isUploading ? 'border-amber-500/60 cursor-wait' : 'border-gray-700/50 hover:border-orange-500/50 cursor-pointer'}`}
            onClick={() => { if (!isUploading) fileInputRef.current?.click(); }}
          >
            {isUploading ? (
              <Loader2 className="w-8 h-8 text-amber-400 mb-2 animate-spin" />
            ) : (
              <Upload className="w-8 h-8 text-orange-400/60 mb-2 group-hover:text-orange-400 transition-colors" />
            )}
            <span className="text-xs font-bold text-gray-300 group-hover:text-white transition-colors">
              {isUploading ? sampleUpload.message : 'Upload Audio File'}
            </span>
            <span className="text-[10px] text-gray-600 mt-1">.wav, .mp3, .ogg, .m4a, .flac — max 30 MB</span>
            <input
              ref={fileInputRef}
              type="file"
              accept="audio/*,.wav,.mp3,.ogg,.m4a,.flac,.aif,.aiff"
              onChange={handleFileChange}
              className="hidden"
            />
          </div>

          {sampleUpload.status === 'error' && (
            <div className="flex items-start space-x-1.5 text-[10px] text-red-300 bg-red-950/40 border border-red-800/50 rounded px-2 py-1.5" role="alert">
              <AlertTriangle className="w-3.5 h-3.5 shrink-0 mt-0.5" />
              <span>{sampleUpload.message}</span>
            </div>
          )}
          {sampleUpload.status === 'success' && (
            <div className={`flex items-start space-x-1.5 text-[10px] rounded px-2 py-1.5 border ${/session only/i.test(sampleUpload.message) ? 'text-amber-300 bg-amber-950/40 border-amber-800/50' : 'text-emerald-300 bg-emerald-950/40 border-emerald-800/50'}`} role="status">
              <CheckCircle2 className="w-3.5 h-3.5 shrink-0 mt-0.5" />
              <span>{sampleUpload.message}</span>
            </div>
          )}

          <div className="bg-[#0a0b0e] p-3 rounded border border-[#1e2028] space-y-1">
            <span className="text-[9px] font-bold text-gray-600 uppercase block tracking-wider">ACTIVE</span>
            <div className="text-sm font-extrabold text-white truncate">
              {pad?.name || 'EMPTY'}
            </div>
            <div className="text-[10px] font-mono text-orange-400/70">
              {sampleState?.status === 'loading'
                ? 'LOADING SAMPLE...'
                : pad?.audioBuffer
                ? `${Math.round(pad.audioBuffer.duration * 100) / 100}s${sampleState?.status === 'loaded' ? '' : ''}`
                : pad?.synthParams?.type && pad.synthParams.type !== 'none'
                ? `SYNTH: ${pad.synthParams.type}`
                : 'NO SOUND'}
            </div>
          </div>

          {sampleState?.status === 'failed' && (
            <div className="flex items-start space-x-1.5 text-[10px] text-red-300 bg-red-950/40 border border-red-800/50 rounded px-2 py-1.5" role="alert">
              <AlertTriangle className="w-3.5 h-3.5 shrink-0 mt-0.5" />
              <span className="flex-1">{sampleState.error || 'This pad sample failed to load.'}</span>
              <button
                type="button"
                onClick={() => void reloadPadSample(activeBank, selectedPadIndex)}
                className="shrink-0 flex items-center gap-1 text-[9px] font-black text-orange-300 hover:text-orange-200 border border-orange-700/60 rounded px-1.5 py-0.5"
              >
                <RefreshCw className="w-3 h-3" />
                RETRY
              </button>
            </div>
          )}
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
                  pad?.synthParams?.type === opt.type && !pad?.audioBuffer
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

      {/* Waveform + trim */}
      <div className="mt-6 bg-[#0e0f14] p-4 rounded-lg border border-[#1e2028] space-y-3">
        <div className="flex items-center justify-between border-b border-[#1e2028] pb-2">
          <h3 className="text-xs font-black text-gray-400 uppercase tracking-widest">
            WAVEFORM &amp; TRIM
          </h3>
          <span className="text-[9px] font-mono text-gray-600">
            PAD {selectedPadIndex + 1} // {pad?.name}
          </span>
        </div>

        {pad?.audioBuffer ? (
          <WaveformEditor
            buffer={pad.audioBuffer}
            sampleStart={pad.sampleStart ?? 0}
            sampleEnd={pad.sampleEnd}
            volume={pad.volume}
            pitch={pad.pitch}
            onTrimChange={(start, end) =>
              updatePad(activeBank, selectedPadIndex, {
                sampleStart: start,
                sampleEnd: end !== undefined && end >= 0.9999 ? undefined : end,
              })
            }
          />
        ) : sampleState?.status === 'loading' ? (
          <div className="flex items-center gap-2 text-[11px] text-amber-400 font-mono py-6 justify-center">
            <Loader2 className="w-4 h-4 animate-spin" />
            LOADING AUDIO...
          </div>
        ) : sampleState?.status === 'failed' ? (
          <div className="text-[11px] text-red-300 font-mono py-6 text-center">
            NO WAVEFORM — {sampleState.error || 'sample failed to load'}
          </div>
        ) : pad?.synthParams?.type && pad.synthParams.type !== 'none' ? (
          <div className="text-[11px] text-gray-500 font-mono py-6 text-center">
            SYNTHESIZED VOICE ({pad.synthParams.type}) — no sample waveform. Upload audio to this pad to edit a waveform.
          </div>
        ) : (
          <div className="text-[11px] text-gray-600 font-mono py-6 text-center">
            EMPTY PAD — upload an audio file or assign a synthesizer above.
          </div>
        )}
      </div>
    </div>
  );
};
