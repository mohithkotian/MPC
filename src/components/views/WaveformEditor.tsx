import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { audioEngine, PREVIEW_PAD_KEY } from '../../services/audio/AudioEngine';
import { Play, Square, Scissors } from 'lucide-react';

interface WaveformEditorProps {
  buffer: AudioBuffer | null;
  sampleStart: number;
  sampleEnd?: number;
  volume: number;
  pitch: number;
  onTrimChange: (start: number, end: number | undefined) => void;
}

const PEAK_BUCKETS = 1200;
const CANVAS_W = 900;
const CANVAS_H = 150;

/**
 * Real waveform display (min/max peaks of the decoded PCM) with draggable
 * start/end trim handles and a region-limited playback preview.
 */
export const WaveformEditor: React.FC<WaveformEditorProps> = ({
  buffer,
  sampleStart,
  sampleEnd,
  volume,
  pitch,
  onTrimChange,
}) => {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const [trim, setTrim] = useState<{ start: number; end: number }>({
    start: sampleStart,
    end: sampleEnd ?? 1,
  });
  const dragRef = useRef<'start' | 'end' | null>(null);
  const playheadRef = useRef<number | null>(null);
  const previewRef = useRef<{ startedAt: number; duration: number; startFrac: number; spanFrac: number; rate: number } | null>(null);
  const rafRef = useRef(0);
  const [isPreviewing, setIsPreviewing] = useState(false);

  // Sync local trim when the selected pad changes or an external edit lands.
  useEffect(() => {
    setTrim({ start: sampleStart, end: sampleEnd ?? 1 });
  }, [sampleStart, sampleEnd, buffer]);

  const peaks = useMemo(() => {
    if (!buffer) return null;
    const channels = Math.min(2, buffer.numberOfChannels);
    const data0 = buffer.getChannelData(0);
    const data1 = channels > 1 ? buffer.getChannelData(1) : null;
    const length = data0.length;
    const step = length / PEAK_BUCKETS;
    const mins = new Float32Array(PEAK_BUCKETS);
    const maxs = new Float32Array(PEAK_BUCKETS);
    for (let bucket = 0; bucket < PEAK_BUCKETS; bucket += 1) {
      const from = Math.floor(bucket * step);
      const to = Math.min(length, Math.floor((bucket + 1) * step));
      let min = 0;
      let max = 0;
      for (let i = from; i < to; i += 1) {
        let value = data0[i];
        if (data1) value = (value + data1[i]) / 2;
        if (value < min) min = value;
        if (value > max) max = value;
      }
      mins[bucket] = min;
      maxs[bucket] = max;
    }
    return { mins, maxs };
  }, [buffer]);

  const draw = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    const width = canvas.width;
    const height = canvas.height;
    const mid = height / 2;

    ctx.clearRect(0, 0, width, height);
    ctx.fillStyle = '#0a0b0e';
    ctx.fillRect(0, 0, width, height);

    if (!peaks || !buffer) {
      ctx.fillStyle = '#4b5563';
      ctx.font = 'bold 14px monospace';
      ctx.textAlign = 'center';
      ctx.fillText('NO AUDIO WAVEFORM', width / 2, mid + 5);
      return;
    }

    const startX = Math.round(trim.start * width);
    const endX = Math.round(trim.end * width);

    // Dimmed regions outside the selected range.
    ctx.fillStyle = 'rgba(0,0,0,0.55)';
    ctx.fillRect(0, 0, startX, height);
    ctx.fillRect(endX, 0, width - endX, height);

    // Center line.
    ctx.strokeStyle = 'rgba(255,255,255,0.12)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(0, mid);
    ctx.lineTo(width, mid);
    ctx.stroke();

    // Waveform peaks: bright inside the region, dim outside.
    for (let x = 0; x < width; x += 1) {
      const bucket = Math.min(PEAK_BUCKETS - 1, Math.floor((x / width) * PEAK_BUCKETS));
      const min = peaks.mins[bucket];
      const max = peaks.maxs[bucket];
      const top = mid - max * (height / 2 - 4);
      const bottom = mid - min * (height / 2 - 4);
      const inRegion = x >= startX && x <= endX;
      ctx.fillStyle = inRegion ? '#ff7a1a' : '#6b3a12';
      ctx.fillRect(x, top, 1, Math.max(1, bottom - top));
    }

    // Trim handles.
    for (const [x, color] of [[startX, '#ffffff'], [endX, '#ffffff']] as Array<[number, string]>) {
      ctx.strokeStyle = color;
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(x, 0);
      ctx.lineTo(x, height);
      ctx.stroke();
      ctx.fillStyle = color;
      ctx.fillRect(x - 3, 0, 6, 8);
      ctx.fillRect(x - 3, height - 8, 6, 8);
    }

    // Preview playhead.
    if (playheadRef.current !== null) {
      const playX = Math.round(playheadRef.current * width);
      ctx.strokeStyle = '#22d3ee';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(playX, 0);
      ctx.lineTo(playX, height);
      ctx.stroke();
    }
  }, [peaks, buffer, trim]);

  useEffect(() => {
    draw();
  }, [draw]);

  useEffect(() => {
    return () => {
      cancelAnimationFrame(rafRef.current);
      audioEngine.stopPadVoices(PREVIEW_PAD_KEY);
    };
  }, []);

  const previewLoop = useCallback(() => {
    const preview = previewRef.current;
    if (!preview) return;
    const ctx = audioEngine.getContext();
    const elapsed = ctx.currentTime - preview.startedAt;
    if (elapsed >= preview.duration) {
      previewRef.current = null;
      playheadRef.current = null;
      setIsPreviewing(false);
      draw();
      return;
    }
    playheadRef.current = Math.min(1, preview.startFrac + (elapsed * preview.rate) / (buffer?.duration || 1));
    draw();
    rafRef.current = requestAnimationFrame(previewLoop);
  }, [draw, buffer]);

  const startPreview = () => {
    if (!buffer) return;
    cancelAnimationFrame(rafRef.current);
    audioEngine.stopPadVoices(PREVIEW_PAD_KEY);
    audioEngine.triggerPad(
      buffer,
      undefined,
      volume,
      pitch,
      0,
      0,
      1.0,
      PREVIEW_PAD_KEY,
      undefined,
      { start: trim.start, end: trim.end }
    );
    const rate = Math.pow(2, pitch / 12);
    const regionSeconds = Math.max(0.01, (trim.end - trim.start) * buffer.duration);
    previewRef.current = {
      startedAt: audioEngine.getContext().currentTime,
      duration: regionSeconds / rate,
      startFrac: trim.start,
      spanFrac: trim.end - trim.start,
      rate,
    };
    setIsPreviewing(true);
    rafRef.current = requestAnimationFrame(previewLoop);
  };

  const stopPreview = () => {
    cancelAnimationFrame(rafRef.current);
    audioEngine.stopPadVoices(PREVIEW_PAD_KEY);
    previewRef.current = null;
    playheadRef.current = null;
    setIsPreviewing(false);
    draw();
  };

  const fractionFromEvent = (e: React.PointerEvent<HTMLCanvasElement>): number => {
    const rect = e.currentTarget.getBoundingClientRect();
    return Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
  };

  const handlePointerDown = (e: React.PointerEvent<HTMLCanvasElement>) => {
    if (!buffer) return;
    const frac = fractionFromEvent(e);
    dragRef.current = Math.abs(frac - trim.start) <= Math.abs(frac - trim.end) ? 'start' : 'end';
    e.currentTarget.setPointerCapture(e.pointerId);
    handlePointerMove(e);
  };

  const handlePointerMove = (e: React.PointerEvent<HTMLCanvasElement>) => {
    const which = dragRef.current;
    if (!which || !buffer) return;
    const frac = fractionFromEvent(e);
    setTrim((current) => {
      if (which === 'start') {
        return { start: Math.max(0, Math.min(current.end - 0.01, frac)), end: current.end };
      }
      return { start: current.start, end: Math.max(current.start + 0.01, Math.min(1, frac)) };
    });
  };

  const handlePointerUp = (e: React.PointerEvent<HTMLCanvasElement>) => {
    if (!dragRef.current) return;
    dragRef.current = null;
    if (e.currentTarget.hasPointerCapture(e.pointerId)) {
      e.currentTarget.releasePointerCapture(e.pointerId);
    }
    onTrimChange(Number(trim.start.toFixed(4)), Number(trim.end.toFixed(4)));
  };

  const resetTrim = () => {
    setTrim({ start: 0, end: 1 });
    onTrimChange(0, 1);
  };

  const duration = buffer?.duration ?? 0;

  return (
    <div className="space-y-2">
      <canvas
        ref={canvasRef}
        width={CANVAS_W}
        height={CANVAS_H}
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
        onPointerCancel={handlePointerUp}
        className={`w-full h-[120px] sm:h-[150px] rounded border border-[#2a2d36] bg-[#0a0b0e] touch-none ${buffer ? 'cursor-ew-resize' : 'cursor-not-allowed'}`}
        aria-label="Sample waveform with start and end trim handles"
      />

      <div className="flex items-center justify-between text-[9px] font-mono text-gray-500">
        <span>
          START {(trim.start * duration).toFixed(2)}s / END {(trim.end * duration).toFixed(2)}s
        </span>
        <span>REGION {((trim.end - trim.start) * duration).toFixed(2)}s</span>
      </div>

      <div className="flex items-center gap-2">
        {isPreviewing ? (
          <button
            type="button"
            onClick={stopPreview}
            className="px-3 py-1.5 rounded bg-gradient-to-b from-red-600 to-red-800 text-white text-[10px] font-black uppercase border border-red-400/60 flex items-center space-x-1.5 active:scale-95 transition-all"
          >
            <Square className="w-3 h-3 fill-current" />
            <span>STOP PREVIEW</span>
          </button>
        ) : (
          <button
            type="button"
            onClick={startPreview}
            disabled={!buffer}
            className="px-3 py-1.5 rounded bg-gradient-to-b from-orange-600 to-orange-800 disabled:from-gray-700 disabled:to-gray-800 text-white text-[10px] font-black uppercase border border-orange-400/60 disabled:border-gray-600 flex items-center space-x-1.5 active:scale-95 transition-all disabled:cursor-not-allowed"
            title="Play only the selected start/end region"
          >
            <Play className="w-3 h-3 fill-current" />
            <span>PREVIEW REGION</span>
          </button>
        )}

        <button
          type="button"
          onClick={resetTrim}
          disabled={!buffer || (trim.start === 0 && trim.end === 1)}
          className="px-3 py-1.5 rounded bg-[#1a1c22] text-gray-400 hover:text-white text-[10px] font-black uppercase border border-[#2a2d36] disabled:opacity-40 flex items-center space-x-1.5 transition-all disabled:cursor-not-allowed"
        >
          <Scissors className="w-3 h-3" />
          <span>RESET TRIM</span>
        </button>

        <span className="text-[9px] text-gray-600 ml-auto hidden sm:block">Drag the white handles to trim</span>
      </div>
    </div>
  );
};
