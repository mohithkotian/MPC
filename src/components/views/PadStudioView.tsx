import React, { useMemo, useState } from 'react';
import { Play, Upload, Sparkles, Hand, Send, Loader2, CheckCircle2 } from 'lucide-react';
import { audioEngine } from '../../services/audio/AudioEngine';
import { createManualPadSegment, decodeMusic, splitMusicIntoPads, type PadSegment } from '../../services/audio/padSplitter';
import { publishPadPack } from '../../services/community/communityApi';
import { useStore } from '../../store/useStore';

const padKeys = ['A1', 'A2', 'A3', 'A4', 'B1', 'B2', 'B3', 'B4', 'C1', 'C2', 'C3', 'C4', 'D1', 'D2', 'D3', 'D4'];

export const PadStudioView: React.FC = () => {
  const { updatePad, activeBank } = useStore();
  const [sourceFile, setSourceFile] = useState<File | null>(null);
  const [sourceBuffer, setSourceBuffer] = useState<AudioBuffer | null>(null);
  const [segments, setSegments] = useState<PadSegment[]>([]);
  const [mode, setMode] = useState<'SMART' | 'MANUAL'>('SMART');
  const [selectedPad, setSelectedPad] = useState(0);
  const [manualStart, setManualStart] = useState(0);
  const [manualEnd, setManualEnd] = useState(1);
  const [busy, setBusy] = useState(false);
  const [publishBusy, setPublishBusy] = useState(false);
  const [message, setMessage] = useState('');
  const [packName, setPackName] = useState('MY COMMUNITY KIT');

  const duration = sourceBuffer?.duration ?? 0;
  const assignedCount = segments.length;

  const selectedSegment = useMemo(() => segments.find((segment) => segment.padIndex === selectedPad), [segments, selectedPad]);

  async function handleSource(file: File) {
    setBusy(true);
    setMessage('Decoding source locally…');
    try {
      const buffer = await decodeMusic(file);
      setSourceFile(file);
      setSourceBuffer(buffer);
      setSegments([]);
      setSelectedPad(0);
      setManualStart(0);
      setManualEnd(Math.min(1, Math.round((duration || buffer.duration) / 16 * 100) / 100));
      setMessage(`Loaded ${file.name} • ${buffer.duration.toFixed(2)}s`);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Unable to decode audio');
    } finally {
      setBusy(false);
    }
  }

  async function runSmartSplit() {
    if (!sourceFile) return;
    setBusy(true);
    setMessage('Smart analysis: finding high-energy musical moments…');
    try {
      const result = await splitMusicIntoPads(sourceFile, 16);
      setSegments(result.segments);
      result.segments.forEach((segment) => {
        audioEngine.registerBuffer(`pad-studio-${segment.padIndex}`, segment.buffer);
        updatePad(activeBank, segment.padIndex, {
          name: `PAD ${String(segment.padIndex + 1).padStart(2, '0')}`,
          sampleId: `pad-studio-${segment.padIndex}`,
          audioBuffer: segment.buffer,
          audioUrl: undefined,
          synthParams: { type: 'none' },
        });
      });
      setMessage('16 smart pads created. Review, audition, or manually replace any pad.');
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Smart split failed');
    } finally {
      setBusy(false);
    }
  }

  function assignManualPad() {
    if (!sourceBuffer) return;
    const segment = createManualPadSegment(sourceBuffer, selectedPad, manualStart, manualEnd);
    setSegments((current) => [...current.filter((item) => item.padIndex !== selectedPad), segment].sort((a, b) => a.padIndex - b.padIndex));
    audioEngine.registerBuffer(`pad-studio-${selectedPad}`, segment.buffer);
    updatePad(activeBank, selectedPad, {
      name: `PAD ${String(selectedPad + 1).padStart(2, '0')}`,
      sampleId: `pad-studio-${selectedPad}`,
      audioBuffer: segment.buffer,
      audioUrl: undefined,
      synthParams: { type: 'none' },
    });
    setMessage(`Pad ${selectedPad + 1} assigned from ${segment.start.toFixed(2)}s → ${segment.end.toFixed(2)}s.`);
  }

  function selectPad(index: number) {
    setSelectedPad(index);
    const existing = segments.find((segment) => segment.padIndex === index);
    if (existing) {
      setManualStart(existing.start);
      setManualEnd(existing.end);
    } else if (sourceBuffer) {
      setManualStart(Math.round((sourceBuffer.duration * index / 16) * 100) / 100);
      setManualEnd(Math.round((sourceBuffer.duration * (index + 1) / 16) * 100) / 100);
    }
  }

  function playPad(index: number) {
    const segment = segments.find((item) => item.padIndex === index);
    if (!segment) return;
    audioEngine.triggerPad(segment.buffer, { type: 'none' }, 1, 0, 0, 0, 1, `pad-studio-preview-${index}`);
  }

  async function handlePublish() {
    if (!segments.length) return;
    setPublishBusy(true);
    setMessage('Publishing derived pad audio only…');
    try {
      await publishPadPack(packName.trim() || 'MPC COMMUNITY KIT', 'Generated from a user-selected source track. Only derived pad clips are published.', segments.map((segment) => ({ index: segment.padIndex, name: segment.label, blob: segment.blob })));
      setMessage('Published. The original source track was not uploaded to the community pack.');
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Publish failed');
    } finally {
      setPublishBusy(false);
    }
  }

  return (
    <div className="w-full max-w-6xl font-hardware text-gray-200 space-y-4">
      <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-3 border-b border-[#292c34] pb-4">
        <div>
          <div className="flex items-center gap-2 text-orange-500"><Sparkles className="w-5 h-5" /><h2 className="text-xl font-black tracking-widest">MUSIC → PAD STUDIO</h2></div>
          <p className="text-xs text-gray-500 mt-1">Upload a full track locally, find useful sections, distribute them across one 4×4 pad grid, then publish only the derived pads.</p>
        </div>
        <label className="cursor-pointer inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-orange-600 text-white text-xs font-black uppercase tracking-wider hover:bg-orange-500">
          <Upload className="w-4 h-4" /> {sourceFile ? 'Replace Source' : 'Add Whole Music'}
          <input type="file" accept="audio/*" className="hidden" onChange={(event) => { const file = event.target.files?.[0]; if (file) void handleSource(file); }} />
        </label>
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-[1fr_360px] gap-4">
        <div className="space-y-4">
          <div className="flex gap-2">
            <button onClick={() => setMode('SMART')} className={`flex-1 py-3 rounded-lg border text-xs font-black tracking-widest ${mode === 'SMART' ? 'border-orange-500 bg-orange-500/10 text-orange-400' : 'border-[#292c34] text-gray-500'}`}><Sparkles className="inline w-4 h-4 mr-2" />SMART ANALYSIS</button>
            <button onClick={() => setMode('MANUAL')} className={`flex-1 py-3 rounded-lg border text-xs font-black tracking-widest ${mode === 'MANUAL' ? 'border-orange-500 bg-orange-500/10 text-orange-400' : 'border-[#292c34] text-gray-500'}`}><Hand className="inline w-4 h-4 mr-2" />MANUAL DISTRIBUTION</button>
          </div>

          <div className="bg-[#0d0f14] border border-[#242731] rounded-xl p-4">
            <div className="flex items-center justify-between text-[10px] uppercase tracking-widest text-gray-500 mb-3"><span>{sourceFile?.name ?? 'No source selected'}</span><span>{duration ? `${duration.toFixed(2)}s` : '—'}</span></div>
            <div className="h-20 rounded-lg bg-[#08090c] border border-[#1e2028] overflow-hidden flex items-center px-2">
              {sourceBuffer ? <div className="w-full h-12 flex items-end gap-px">{Array.from({ length: 100 }, (_, index) => { const h = 10 + ((Math.sin(index * 1.7) + 1) * 0.5) * 30; return <div key={index} className="flex-1 bg-orange-500/50" style={{ height: `${h}px` }} />; })}</div> : <span className="w-full text-center text-xs text-gray-700">SOURCE WAVEFORM</span>}
            </div>
          </div>

          {mode === 'SMART' ? (
            <div className="bg-[#12131a] border border-[#242731] rounded-xl p-4 space-y-3">
              <div className="flex justify-between items-center"><div><div className="text-sm font-black">Smart section finder</div><div className="text-[10px] text-gray-500 mt-1">Local energy analysis highlights stronger musical moments. This is the first model adapter; it does not claim true stem separation.</div></div><button disabled={!sourceFile || busy} onClick={() => void runSmartSplit()} className="px-4 py-2 rounded-lg bg-orange-600 text-white text-xs font-black disabled:opacity-40">{busy ? <Loader2 className="w-4 h-4 animate-spin" /> : 'CREATE 16 PADS'}</button></div>
            </div>
          ) : (
            <div className="bg-[#12131a] border border-[#242731] rounded-xl p-4 space-y-4">
              <div className="text-sm font-black">Manual pad distribution</div>
              <div className="text-[10px] text-gray-500">Choose a pad and define its source range. Values use 0.01 second resolution.</div>
              <div className="grid grid-cols-4 gap-2">{padKeys.map((key, index) => <button key={key} onClick={() => selectPad(index)} className={`py-3 rounded-lg border text-[10px] font-black ${selectedPad === index ? 'border-orange-500 text-orange-400 bg-orange-500/10' : 'border-[#292c34] text-gray-500'}`}>{key}</button>)}</div>
              <div className="grid grid-cols-2 gap-3">
                <label className="text-[10px] text-gray-500">START {manualStart.toFixed(2)}s<input disabled={!sourceBuffer} type="range" min="0" max={duration || 1} step="0.01" value={manualStart} onChange={(e) => setManualStart(Math.min(Number(e.target.value), manualEnd - 0.01))} className="w-full" /></label>
                <label className="text-[10px] text-gray-500">END {manualEnd.toFixed(2)}s<input disabled={!sourceBuffer} type="range" min="0.01" max={duration || 1} step="0.01" value={manualEnd} onChange={(e) => setManualEnd(Math.max(Number(e.target.value), manualStart + 0.01))} className="w-full" /></label>
              </div>
              <button disabled={!sourceBuffer} onClick={assignManualPad} className="w-full py-3 rounded-lg border border-orange-500/60 text-orange-400 text-xs font-black disabled:opacity-40">ASSIGN TO PAD {selectedPad + 1}</button>
            </div>
          )}
        </div>

        <div className="bg-[#0d0f14] border border-[#242731] rounded-xl p-4">
          <div className="flex items-center justify-between mb-3"><span className="text-xs font-black tracking-widest">ONE 4×4 PAD GRID</span><span className="text-[10px] text-orange-500">{assignedCount}/16 READY</span></div>
          <div className="grid grid-cols-4 gap-2">{padKeys.map((key, index) => { const segment = segments.find((item) => item.padIndex === index); return <button key={key} onClick={() => playPad(index)} className={`aspect-square rounded-lg border flex flex-col items-center justify-center gap-1 ${segment ? 'border-orange-500/60 bg-orange-500/10 text-orange-300' : 'border-[#292c34] bg-[#11131a] text-gray-700'}`}><span className="text-[10px] font-black">{key}</span>{segment && <><Play className="w-3 h-3" /><span className="text-[8px]">{segment.start.toFixed(2)}–{segment.end.toFixed(2)}</span></>}</button>; })}</div>
          <div className="mt-4 text-[10px] text-gray-600">Click a ready pad to audition it. The existing MPC pad grid can then use the same assigned buffers.</div>
        </div>
      </div>

      <div className="bg-[#12131a] border border-[#242731] rounded-xl p-4 flex flex-col md:flex-row gap-3 md:items-center">
        <div className="flex-1"><div className="text-xs font-black tracking-widest">COMMUNITY PUBLISH</div><div className="text-[10px] text-gray-500 mt-1">Only derived pad WAV files are uploaded. The original full track stays local to the user's browser.</div></div>
        <input value={packName} onChange={(e) => setPackName(e.target.value)} className="bg-[#090a0d] border border-[#292c34] rounded-lg px-3 py-2 text-xs text-gray-200 outline-none" placeholder="Pack name" />
        <button disabled={!segments.length || publishBusy} onClick={() => void handlePublish()} className="inline-flex items-center justify-center gap-2 px-4 py-2 rounded-lg bg-orange-600 text-white text-xs font-black disabled:opacity-40">{publishBusy ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />} PUBLISH PADS</button>
      </div>

      {message && <div className="flex items-center gap-2 text-[10px] text-gray-400"><CheckCircle2 className="w-4 h-4 text-orange-500" />{message}</div>}
      {selectedSegment && mode === 'MANUAL' && <div className="text-[9px] text-gray-600">Selected pad {selectedPad + 1}: current segment {selectedSegment.start.toFixed(2)}s → {selectedSegment.end.toFixed(2)}s.</div>}
    </div>
  );
};
