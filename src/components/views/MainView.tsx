import React, { useState } from 'react';
import { OLEDDisplay } from '../oled/OLEDDisplay';
import { PadBanks } from '../controls/PadBanks';
import { Knob } from '../controls/Knob';
import { NumpadPanel } from '../controls/NumpadPanel';
import { TransportBar } from '../controls/TransportBar';
import { PadGrid } from '../pads/PadGrid';
import { useStore } from '../../store/useStore';
import { Camera, CameraOff, Download } from 'lucide-react';
import { renderProjectToWav } from '../../services/audio/wavExport';

export const MainView: React.FC = () => {
  const {
    masterVolume,
    setMasterVolume,
    recGain,
    setRecGain,
    bpm,
    setBpm,
    isCameraActive,
    toggleCamera,
    projectId,
    projectName,
    projectArtist,
    activeBank,
    banks,
    patterns,
    swing,
    kitLoadStatus,
    kitLoadError,
  } = useStore();
  const [exportState, setExportState] = useState<'idle' | 'rendering' | 'done' | 'error'>('idle');
  const [exportProgress, setExportProgress] = useState(0);
  const [exportError, setExportError] = useState('');

  const exportWav = async () => {
    setExportState('rendering');
    setExportProgress(0);
    setExportError('');
    try {
      const blob = await renderProjectToWav({ id: projectId, name: projectName, artist: projectArtist, bpm, swing, masterVolume, activeBank, banks, patterns, createdAt: Date.now(), updatedAt: Date.now() }, (done, total) => setExportProgress(Math.round((done / total) * 100)));
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = `${projectName || 'mpc-session'}.wav`;
      link.click();
      URL.revokeObjectURL(url);
      setExportState('done');
    } catch (error) {
      setExportState('error');
      setExportError(error instanceof Error ? error.message : 'WAV export failed');
    }
  };

  return (
    <div className="flex flex-col lg:flex-row gap-5 items-start justify-center w-full max-w-6xl mx-auto select-none font-hardware animate-slide-in">
      <div className="flex-1 w-full flex flex-col space-y-4">
        <div className="flex flex-col md:flex-row items-center justify-between gap-4">
          <OLEDDisplay />
          <div className="flex items-center space-x-3 bg-[#12131a] p-3 rounded-lg border border-[#1e2028]">
            <Knob label="REC GAIN" value={recGain} min={0} max={1} onChange={setRecGain} />
            <Knob label="MASTER" value={masterVolume} min={0} max={1} onChange={setMasterVolume} />

            <button
              onClick={toggleCamera}
              className={`ml-2 p-2 rounded-lg border transition-all duration-150 ${
                isCameraActive
                  ? 'bg-orange-600/20 border-orange-500/50 text-orange-400 shadow-[0_0_10px_rgba(255,102,0,0.2)]'
                  : 'bg-[#0c0d11] border-[#1e2028] text-gray-500 hover:text-gray-300 hover:border-[#2a2d36]'
              }`}
              title={isCameraActive ? 'Disable Gesture Camera' : 'Enable Gesture Camera'}
            >
              {isCameraActive ? <Camera className="w-4 h-4" /> : <CameraOff className="w-4 h-4" />}
            </button>
            <button type="button" onClick={() => void exportWav()} disabled={exportState === 'rendering'} className="p-2 rounded-lg border border-[#1e2028] text-gray-400 hover:text-orange-400 disabled:opacity-50" title={exportState === 'rendering' ? `Rendering ${exportProgress}%` : 'Export WAV'}>
              <Download className="w-4 h-4" />
            </button>
            {exportState === 'rendering' && <span className="text-[9px] font-mono text-orange-400">{exportProgress}%</span>}
            {exportState === 'error' && <span className="max-w-32 truncate text-[9px] text-red-400" title={exportError}>EXPORT ERROR</span>}
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-3 items-center bg-[#12131a] p-4 rounded-xl border border-[#1e2028]">
          <div className="md:col-span-2">
            <NumpadPanel />
          </div>
          <div className="flex flex-col items-center justify-center border-l border-[#1e2028] pl-4 w-full">
            <Knob label="TEMPO" value={bpm} min={40} max={240} size="lg" onChange={setBpm} />
          </div>
        </div>

        <TransportBar />
        {kitLoadStatus !== 'idle' && kitLoadStatus !== 'ready' && <div className="text-center text-[10px] font-mono text-amber-400" role="status">KIT {kitLoadStatus.toUpperCase()}: {kitLoadError}</div>}
      </div>

      <div className="w-full lg:w-auto flex flex-col items-center space-y-3 bg-[#12131a] p-4 rounded-xl border border-[#1e2028]">
        <div className="w-full flex items-center justify-between border-b border-[#1e2028] pb-2">
          <PadBanks />
          <div className="text-right font-mono text-xs font-black text-orange-500 uppercase tracking-widest drop-shadow">
            MPC
          </div>
        </div>
        <PadGrid />
      </div>
    </div>
  );
};
