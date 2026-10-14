import React from 'react';
import { OLEDDisplay } from '../oled/OLEDDisplay';
import { PadBanks } from '../controls/PadBanks';
import { Knob } from '../controls/Knob';
import { LevelMeter } from '../controls/LevelMeter';
import { NumpadPanel } from '../controls/NumpadPanel';
import { TransportBar } from '../controls/TransportBar';
import { PadGrid } from '../pads/PadGrid';
import { useStore } from '../../store/useStore';
import { Camera, CameraOff, Cloud, HardDrive, CloudOff } from 'lucide-react';

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
    padSampleState,
    kitLoadStatus,
    kitLoadError,
    saveStatus,
    lastSaveError,
  } = useStore();

  const failedPadCount = Object.values(padSampleState).filter((entry) => entry.status === 'failed').length;

  return (
    <div className="flex flex-col lg:flex-row gap-5 items-start justify-center w-full max-w-6xl mx-auto select-none font-hardware animate-slide-in">
      <div className="flex-1 w-full flex flex-col space-y-4">
        <div className="flex flex-col md:flex-row items-center justify-between gap-4">
          <OLEDDisplay />
          <div className="flex items-center space-x-3 bg-[#12131a] p-3 rounded-lg border border-[#1e2028]">
            <Knob label="REC GAIN" value={recGain} min={0} max={1} onChange={setRecGain} />
            <div className="flex flex-col items-center">
              <Knob label="MASTER" value={masterVolume} min={0} max={1} onChange={setMasterVolume} />
              <LevelMeter source="master" className="h-8 mt-1" />
            </div>

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
            <div
              className="ml-1 flex items-center gap-1.5 px-2 py-1.5 rounded border border-[#1e2028] bg-[#0c0d11]"
              title={saveStatus === 'cloud-success'
                ? 'Project metadata is saved to the cloud; sample audio lives in this browser\u2019s local storage.'
                : saveStatus === 'local-only'
                  ? `Local-only save (not synced to the cloud): ${lastSaveError ?? ''}`
                  : saveStatus === 'failed'
                    ? `Save failed: ${lastSaveError ?? ''}`
                    : 'Project has not been saved yet. Save it in the KITS view.'}
            >
              {saveStatus === 'cloud-success' ? (
                <><Cloud className="w-3.5 h-3.5 text-emerald-400" /><span className="text-[9px] font-black text-emerald-400 tracking-wider">CLOUD</span></>
              ) : saveStatus === 'local-only' ? (
                <><HardDrive className="w-3.5 h-3.5 text-sky-400" /><span className="text-[9px] font-black text-sky-400 tracking-wider">LOCAL</span></>
              ) : saveStatus === 'failed' ? (
                <><CloudOff className="w-3.5 h-3.5 text-red-400" /><span className="text-[9px] font-black text-red-400 tracking-wider">SAVE ERR</span></>
              ) : (
                <><Cloud className="w-3.5 h-3.5 text-gray-500" /><span className="text-[9px] font-black text-gray-500 tracking-wider">UNSAVED</span></>
              )}
            </div>
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
        {kitLoadStatus === 'loading' && (
          <div className="text-center text-[10px] font-mono text-amber-400 animate-pulse" role="status">
            LOADING SAMPLES...
          </div>
        )}
        {kitLoadStatus !== 'idle' && kitLoadStatus !== 'ready' && kitLoadStatus !== 'loading' && (
          <div className="text-center text-[10px] font-mono text-amber-400" role="status">
            {kitLoadStatus.toUpperCase()}: {kitLoadError}
            {failedPadCount > 0 && ' — pads with a red ERR badge have no sound; hover the badge for details.'}
          </div>
        )}
      </div>

      <div className="w-full lg:w-auto flex flex-col items-center space-y-1.5 bg-[#12131a] p-3 rounded-xl border border-[#1e2028]">
        <div className="w-full max-w-[500px] flex flex-col items-center gap-1">
          <div className="text-center font-mono text-xs font-black text-orange-500 uppercase tracking-widest drop-shadow">
            MPC
          </div>
          <PadBanks />
        </div>
        <PadGrid />
      </div>
    </div>
  );
};
