export interface PadSegment {
  padIndex: number;
  start: number;
  end: number;
  score: number;
  label: string;
  blob: Blob;
  buffer: AudioBuffer;
}

export interface SplitResult {
  sourceName: string;
  duration: number;
  segments: PadSegment[];
}

function rms(buffer: AudioBuffer, startFrame: number, endFrame: number): number {
  let sum = 0;
  let count = 0;
  const channels = Math.min(buffer.numberOfChannels, 2);
  for (let channel = 0; channel < channels; channel += 1) {
    const data = buffer.getChannelData(channel);
    const end = Math.min(endFrame, data.length);
    for (let i = Math.max(0, startFrame); i < end; i += 1) {
      const value = data[i];
      sum += value * value;
      count += 1;
    }
  }
  return count ? Math.sqrt(sum / count) : 0;
}

function sliceBuffer(source: AudioBuffer, start: number, end: number): AudioBuffer {
  const frameCount = Math.max(1, Math.ceil((end - start) * source.sampleRate));
  const output = new AudioContext().createBuffer(source.numberOfChannels, frameCount, source.sampleRate);
  const startFrame = Math.floor(start * source.sampleRate);
  const endFrame = Math.min(source.length, startFrame + frameCount);
  for (let channel = 0; channel < source.numberOfChannels; channel += 1) {
    const src = source.getChannelData(channel).subarray(startFrame, endFrame);
    output.getChannelData(channel).set(src.subarray(0, frameCount));
  }
  return output;
}

function writeString(view: DataView, offset: number, value: string): void {
  for (let i = 0; i < value.length; i += 1) view.setUint8(offset + i, value.charCodeAt(i));
}

function encodeWav(buffer: AudioBuffer): Blob {
  const channels = buffer.numberOfChannels;
  const sampleRate = buffer.sampleRate;
  const bytesPerSample = 2;
  const dataLength = buffer.length * channels * bytesPerSample;
  const arrayBuffer = new ArrayBuffer(44 + dataLength);
  const view = new DataView(arrayBuffer);
  writeString(view, 0, 'RIFF');
  view.setUint32(4, 36 + dataLength, true);
  writeString(view, 8, 'WAVE');
  writeString(view, 12, 'fmt ');
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true);
  view.setUint16(22, channels, true);
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, sampleRate * channels * bytesPerSample, true);
  view.setUint16(32, channels * bytesPerSample, true);
  view.setUint16(34, 16, true);
  writeString(view, 36, 'data');
  view.setUint32(40, dataLength, true);

  const channelData = Array.from({ length: channels }, (_, i) => buffer.getChannelData(i));
  let offset = 44;
  for (let frame = 0; frame < buffer.length; frame += 1) {
    for (let channel = 0; channel < channels; channel += 1) {
      const sample = Math.max(-1, Math.min(1, channelData[channel][frame]));
      view.setInt16(offset, sample < 0 ? sample * 0x8000 : sample * 0x7fff, true);
      offset += 2;
    }
  }
  return new Blob([arrayBuffer], { type: 'audio/wav' });
}

function makeCandidates(duration: number, count: number): Array<{ start: number; end: number }> {
  const window = Math.min(2, Math.max(0.75, duration / Math.max(count * 1.5, 1)));
  const step = Math.max(0.25, duration / Math.max(count * 4, 1));
  const candidates: Array<{ start: number; end: number }> = [];
  for (let start = 0; start + window <= duration; start += step) candidates.push({ start, end: Math.min(duration, start + window) });
  return candidates;
}

export async function decodeMusic(file: File): Promise<AudioBuffer> {
  const AudioCtx = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
  const context = new AudioCtx();
  try {
    return await context.decodeAudioData(await file.arrayBuffer());
  } finally {
    await context.close();
  }
}

export function createManualPadSegment(source: AudioBuffer, padIndex: number, start: number, end: number): PadSegment {
  const safeStart = Math.max(0, Math.min(source.duration, Math.round(start * 100) / 100));
  const safeEnd = Math.max(safeStart + 0.01, Math.min(source.duration, Math.round(end * 100) / 100));
  const buffer = sliceBuffer(source, safeStart, safeEnd);
  return {
    padIndex,
    start: safeStart,
    end: safeEnd,
    score: rms(source, Math.floor(safeStart * source.sampleRate), Math.floor(safeEnd * source.sampleRate)),
    label: `PAD ${String(padIndex + 1).padStart(2, '0')}`,
    blob: encodeWav(buffer),
    buffer,
  };
}

export async function splitMusicIntoPads(file: File, count = 16): Promise<SplitResult> {
  const source = await decodeMusic(file);
  const duration = source.duration;
  const candidates = makeCandidates(duration, count);
  const scored = candidates.map((candidate) => ({
    ...candidate,
    score: rms(source, Math.floor(candidate.start * source.sampleRate), Math.floor(candidate.end * source.sampleRate)),
  }));

  scored.sort((a, b) => b.score - a.score);
  const minimumSpacing = Math.max(0.35, duration / Math.max(count * 2, 1));
  const selected: typeof scored = [];
  for (const candidate of scored) {
    if (!selected.some((existing) => Math.abs(existing.start - candidate.start) < minimumSpacing)) selected.push(candidate);
    if (selected.length === count) break;
  }

  if (selected.length < count) {
    for (let index = 0; index < count; index += 1) {
      const start = (duration * index) / count;
      const end = Math.min(duration, (duration * (index + 1)) / count);
      if (!selected.some((item) => Math.abs(item.start - start) < minimumSpacing / 2)) {
        selected.push({ start, end, score: rms(source, Math.floor(start * source.sampleRate), Math.floor(end * source.sampleRate)) });
      }
      if (selected.length === count) break;
    }
  }

  selected.sort((a, b) => a.start - b.start);
  const segments = selected.slice(0, count).map((segment, index) => createManualPadSegment(source, index, segment.start, segment.end));
  return { sourceName: file.name, duration, segments };
}
