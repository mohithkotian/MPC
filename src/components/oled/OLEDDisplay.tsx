import React, { useEffect, useRef } from 'react';
import { useStore } from '../../store/useStore';
import { audioEngine } from '../../services/audio/AudioEngine';

export const OLEDDisplay: React.FC = () => {
  const {
    projectName,
    projectArtist,
    activeBank,
    bpm,
    viewMode,
    isPlaying,
    isRecording,
    isOverdubbing,
    currentStep,
  } = useStore();

  const isInfoActive = useStore(state => state.isInfoActive);
  const selectedPadIndex = useStore(state => state.selectedPadIndex);
  const activePad = useStore(state => state.banks[state.activeBank][state.selectedPadIndex]);

  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  useEffect(() => {
    let animId: number;
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const renderVisualizer = () => {
      const freqData = audioEngine.getAnalyserData();
      ctx.clearRect(0, 0, canvas.width, canvas.height);

      ctx.strokeStyle = 'rgba(255, 30, 30, 0.08)';
      ctx.lineWidth = 1;
      for (let y = 0; y < canvas.height; y += 4) {
        ctx.beginPath();
        ctx.moveTo(0, y);
        ctx.lineTo(canvas.width, y);
        ctx.stroke();
      }

      const barWidth = (canvas.width / freqData.length) * 1.2;
      let x = 0;

      for (let i = 0; i < freqData.length; i++) {
        const barHeight = (freqData[i] / 255) * canvas.height;
        const gradient = ctx.createLinearGradient(0, canvas.height - barHeight, 0, canvas.height);
        gradient.addColorStop(0, '#ff4444');
        gradient.addColorStop(0.5, '#ff2222');
        gradient.addColorStop(1, '#991111');
        ctx.fillStyle = gradient;
        ctx.fillRect(x, canvas.height - barHeight, barWidth - 1, barHeight);
        x += barWidth;
      }

      animId = requestAnimationFrame(renderVisualizer);
    };

    renderVisualizer();
    return () => cancelAnimationFrame(animId);
  }, []);

  const activePresetId = useStore(state => state.activePresetId);
  const customKitNames = useStore(state => state.customKitNames);
  const currentSongName = customKitNames[activePresetId] || (activePresetId === 'kit1' ? 'FATHER' : activePresetId === 'kit2' ? 'RUNAWAY' : 'SAMPLE');

  const sampleDuration = activePad ? audioEngine.getPadDuration(activePad.audioBuffer || null, activePad.synthParams) : 'N/A';

  return (
    <div className="relative w-full max-w-[440px] h-[190px] rounded-sm p-4 bg-oled-bay oled-scanlines flex flex-col justify-between select-none overflow-hidden font-oled text-oled-red border-2 border-black shadow-oled-glow">
      <div className="flex items-start justify-between border-b border-oled-red/20 pb-1.5">
        <div>
          <h1 className="text-xl font-black tracking-[0.15em] leading-none text-oled-red-bright uppercase drop-shadow-[0_0_10px_rgba(255,50,50,0.6)]">
            {projectName}
          </h1>
          <p className="text-[10px] font-semibold tracking-[0.1em] text-oled-red/70 mt-0.5 uppercase">
            {projectArtist || 'MPC ENGINE'}
          </p>
        </div>
        <div className="text-right">
          <div className="flex items-center space-x-1 justify-end">
            {isInfoActive && (
              <span className="bg-yellow-500 text-black text-[8px] font-extrabold px-1.5 py-0.5 rounded tracking-wider animate-pulse">
                INFO
              </span>
            )}
            {isPlaying && (
              <span className="animate-pulse bg-oled-red text-black text-[8px] font-extrabold px-1.5 py-0.5 rounded tracking-wider">
                PLAY
              </span>
            )}
            {isRecording && (
              <span className="animate-rec-pulse bg-oled-red-bright text-black text-[8px] font-extrabold px-1.5 py-0.5 rounded tracking-wider">
                REC
              </span>
            )}
            {isOverdubbing && (
              <span className="bg-led-orange text-black text-[8px] font-extrabold px-1.5 py-0.5 rounded tracking-wider">
                DUB
              </span>
            )}
          </div>
          <div className="text-[9px] text-oled-red/60 font-mono mt-1 tracking-wider">
            STEP {isPlaying ? `${currentStep + 1}/16` : '--/16'}
          </div>
        </div>
      </div>

      <div className="my-1.5 flex justify-between items-center text-xs tracking-wider">
        <div className="flex items-center space-x-2">
          <span className="bg-oled-red/15 px-1.5 py-0.5 border border-oled-red/30 rounded text-[10px] font-bold text-oled-red-bright tracking-wider">
            BANK {activeBank}
          </span>
          <span className="bg-oled-red/15 px-1.5 py-0.5 border border-oled-red/30 rounded text-[10px] font-bold text-oled-red-bright tracking-wider">
            {bpm} BPM
          </span>
          <span className="text-[10px] font-bold text-oled-red/60 tracking-wider">
            {viewMode}
          </span>
        </div>
        {activePad && (
          <div className="text-[10px] text-oled-red-bright/80 font-mono truncate max-w-[140px] text-right">
            {activePad.keyLabel}: {activePad.name}
          </div>
        )}
      </div>

      {isInfoActive ? (
        <div className="relative w-full h-[55px] border border-oled-red/40 rounded bg-black/80 p-1.5 flex flex-col justify-between text-[10px] font-mono leading-tight animate-fade-in">
          <div className="flex justify-between items-center text-oled-red-bright font-bold border-b border-oled-red/30 pb-0.5">
            <span>SONG INFO [KEY L]</span>
            <span className="text-yellow-400 font-extrabold tracking-wider">{currentSongName}</span>
          </div>
          <div className="grid grid-cols-2 gap-1 text-[9px] mt-0.5">
            <div>SONG: <span className="text-white font-bold">{currentSongName}</span></div>
            <div>PAD: <span className="text-white font-bold">PAD {selectedPadIndex + 1} [{activePad?.keyLabel}]</span></div>
            <div>SAMPLE: <span className="text-white font-bold">{activePad?.name}</span></div>
            <div>TEMPO: <span className="text-white font-bold">{bpm} BPM ({activeBank})</span></div>
          </div>
        </div>
      ) : (
        <div className="relative w-full h-[50px] border border-oled-red/20 rounded bg-black/40 p-1 flex items-center justify-center overflow-hidden">
          <canvas
            ref={canvasRef}
            width={380}
            height={44}
            className="w-full h-full block opacity-80"
          />
        </div>
      )}
    </div>
  );
};
