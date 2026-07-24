import React, { useRef } from 'react';
import { useStore } from '../../store/useStore';
import { Play, Square, Music } from 'lucide-react';

export const TransportBar: React.FC = () => {
  const {
    isPlaying,
    isRecording,
    isOverdubbing,
    bpm,
    setBpm,
    togglePlay,
    stopPlayback,
    toggleRecord,
    toggleOverdub,
    metronome,
    toggleMetronome,
  } = useStore();

  const tapTimes = useRef<number[]>([]);

  const handleTapTempo = () => {
    const now = Date.now();
    tapTimes.current.push(now);
    if (tapTimes.current.length > 4) {
      tapTimes.current.shift();
    }
    if (tapTimes.current.length >= 2) {
      const intervals: number[] = [];
      for (let i = 1; i < tapTimes.current.length; i++) {
        intervals.push(tapTimes.current[i] - tapTimes.current[i - 1]);
      }
      const avgInterval = intervals.reduce((a, b) => a + b, 0) / intervals.length;
      const calculatedBpm = Math.round(60000 / avgInterval);
      if (calculatedBpm >= 40 && calculatedBpm <= 240) {
        setBpm(calculatedBpm);
      }
    }
  };

  return (
    <div className="flex items-center justify-between bg-gradient-to-b from-[#18191f] to-[#0e0f13] p-3 rounded-lg border border-[#1e2028] shadow-[inset_1px_1px_2px_rgba(255,255,255,0.04),_0_4px_12px_rgba(0,0,0,0.4)] font-hardware">
      <div className="flex items-center space-x-2">
        <button
          onClick={toggleRecord}
          className={`relative px-4 py-2 rounded font-black text-xs uppercase flex items-center space-x-1.5 transition-all duration-150 border ${
            isRecording
              ? 'bg-gradient-to-b from-red-600 to-red-800 text-white border-red-400/60 shadow-[inset_0_0_8px_rgba(238,17,17,0.6),_0_0_12px_rgba(238,17,17,0.3)]'
              : 'bg-gradient-to-b from-[#1a0e0e] to-[#0e0707] text-red-500/70 border-red-900/30 shadow-beveled-btn hover:text-red-400 hover:border-red-800/50'
          }`}
        >
          <div className={`w-2 h-2 rounded-full ${isRecording ? 'bg-white animate-rec-pulse' : 'bg-red-600/40'}`} />
          <span>REC</span>
        </button>

        <button
          onClick={toggleOverdub}
          className={`relative px-3.5 py-2 rounded font-black text-xs uppercase flex items-center space-x-1.5 transition-all duration-150 border ${
            isOverdubbing
              ? 'bg-gradient-to-b from-orange-600 to-orange-800 text-white border-orange-400/60 shadow-[inset_0_0_8px_rgba(255,102,0,0.6),_0_0_12px_rgba(255,102,0,0.3)]'
              : 'bg-gradient-to-b from-[#1a120a] to-[#0e0805] text-orange-600/70 border-orange-900/30 shadow-beveled-btn hover:text-orange-400 hover:border-orange-800/50'
          }`}
        >
          <div className={`w-2 h-2 rounded-full ${isOverdubbing ? 'bg-white animate-rec-pulse' : 'bg-orange-600/40'}`} />
          <span>DUB</span>
        </button>

        <button
          onClick={stopPlayback}
          className={`px-4 py-2 rounded font-bold text-xs uppercase flex items-center space-x-1.5 transition-all duration-150 border ${
            !isPlaying
              ? 'bg-gradient-to-b from-[#2a2d36] to-[#1a1c22] text-white/60 border-gray-500/30'
              : 'bg-gradient-to-b from-[#2a2d36] to-[#17181f] text-gray-300 border-gray-700/50 shadow-beveled-btn hover:bg-[#343844]'
          }`}
        >
          <Square className="w-3.5 h-3.5 fill-current" />
          <span>STOP</span>
        </button>

        <button
          onClick={togglePlay}
          className={`px-4 py-2 rounded font-black text-xs uppercase flex items-center space-x-1.5 transition-all duration-150 border ${
            isPlaying && !isRecording
              ? 'bg-gradient-to-b from-emerald-600 to-emerald-800 text-white border-emerald-400/60 shadow-[0_0_14px_rgba(16,185,129,0.4)]'
              : 'bg-gradient-to-b from-[#2a2d36] to-[#17181f] text-gray-200 border-gray-700/50 shadow-beveled-btn hover:bg-[#343844]'
          }`}
        >
          <Play className="w-3.5 h-3.5 fill-current" />
          <span>PLAY</span>
        </button>
      </div>

      <div className="flex items-center space-x-3">
        <button
          onClick={toggleMetronome}
          className={`px-3 py-2 rounded text-xs font-bold uppercase border flex items-center space-x-1 transition-all duration-150 ${
            metronome
              ? 'bg-led-orange text-black border-orange-300/60 shadow-[0_0_10px_rgba(255,102,0,0.4)]'
              : 'bg-[#16171c] text-gray-500 border-gray-700/50 hover:text-gray-300'
          }`}
        >
          <Music className="w-3.5 h-3.5" />
          <span>METRO</span>
        </button>

        <button
          onClick={handleTapTempo}
          className="px-3 py-2 rounded text-xs font-bold uppercase bg-[#16171c] text-gray-400 border border-gray-700/50 shadow-beveled-btn hover:text-white hover:border-gray-600 active:scale-95 transition-all duration-150"
        >
          TAP
        </button>

        <div className="flex items-center bg-[#0c0d11] border border-[#1e2028] px-2.5 py-1 rounded">
          <span className="text-[10px] font-black text-gray-600 mr-2 tracking-wider">BPM</span>
          <input
            type="number"
            min={40}
            max={240}
            value={bpm}
            onChange={(e) => setBpm(Number(e.target.value))}
            className="w-12 bg-transparent text-sm font-bold text-oled-red-bright font-oled text-center focus:outline-none"
          />
        </div>
      </div>
    </div>
  );
};
