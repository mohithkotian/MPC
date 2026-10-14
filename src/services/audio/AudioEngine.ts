import { SynthParams, SynthType } from '../../types';
import { secureAudioLoader } from './SecureAudioLoader';

interface Voice {
  source: AudioBufferSourceNode | OscillatorNode;
  gain: GainNode;
  /** Gain the voice should have when audible (pad volume * velocity). */
  baseGain: number;
  /** Pad volume captured at trigger time, so volume edits can be re-applied live. */
  padVolume: number;
  /** Trigger velocity captured at trigger time. */
  velocity: number;
  /** AudioContext time at which this voice starts (may be in the future). */
  startTime: number;
}

const LEVEL_FFT_SIZE = 1024;

/** Pad key used for editor previews: bypasses mute/solo gating and self-choke groups. */
export const PREVIEW_PAD_KEY = '__preview__';

class AudioEngineService {
  private ctx: AudioContext | null = null;
  private masterGain: GainNode | null = null;
  private analyser: AnalyserNode | null = null;
  private levelAnalyser: AnalyserNode | null = null;
  private padAnalysers: Map<string, AnalyserNode> = new Map();
  private levelScratchFloat: Float32Array<ArrayBuffer> | null = null;
  private levelScratchByte: Uint8Array<ArrayBuffer> | null = null;
  private bufferCache: Map<string, AudioBuffer> = new Map();
  private inflightLoads: Map<string, Promise<AudioBuffer>> = new Map();
  private activeChokeNodes: Map<number, Voice[]> = new Map();
  private activePadVoices: Map<string, Voice[]> = new Map();
  private allActiveVoices: Set<Voice> = new Set();
  private mutedPads = new Set<string>();
  private soloPads = new Set<string>();

  constructor() {
    // AudioContext will be initialized on first user gesture or resume
  }

  public getContext(): AudioContext {
    if (!this.ctx) {
      const AudioCtxClass = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      this.ctx = new AudioCtxClass();

      this.masterGain = this.ctx.createGain();
      this.levelAnalyser = this.ctx.createAnalyser();
      this.levelAnalyser.fftSize = LEVEL_FFT_SIZE;
      this.analyser = this.ctx.createAnalyser();
      this.analyser.fftSize = 64;

      // masterGain -> levelAnalyser (RMS/peak metering) -> analyser (OLED spectrum) -> out
      this.masterGain.connect(this.levelAnalyser);
      this.levelAnalyser.connect(this.analyser);
      this.analyser.connect(this.ctx.destination);
    }

    if (this.ctx.state === 'suspended') {
      this.ctx.resume();
    }

    return this.ctx;
  }

  public setMasterVolume(volume: number) {
    const ctx = this.getContext();
    if (this.masterGain) {
      this.masterGain.gain.setTargetAtTime(Math.max(0, Math.min(1, volume)), ctx.currentTime, 0.01);
    }
  }

  public getAnalyserData(): Uint8Array {
    if (!this.analyser) return new Uint8Array(32);
    const dataArray = new Uint8Array(this.analyser.frequencyBinCount);
    this.analyser.getByteFrequencyData(dataArray);
    return dataArray;
  }

  /** Peak level (0..1) of the master signal, measured from actual audio. */
  public getMasterLevel(): number {
    if (!this.levelAnalyser) return 0;
    return this.readPeakLevel(this.levelAnalyser);
  }

  /** Peak level (0..1) measured on the pad's own signal branch, 0 when silent. */
  public getPadLevel(padKey: string): number {
    const analyser = this.padAnalysers.get(padKey);
    if (!analyser) return 0;
    return this.readPeakLevel(analyser);
  }

  private readPeakLevel(analyser: AnalyserNode): number {
    try {
      if (typeof analyser.getFloatTimeDomainData === 'function') {
        if (!this.levelScratchFloat || this.levelScratchFloat.length !== analyser.fftSize) {
          this.levelScratchFloat = new Float32Array(analyser.fftSize);
        }
        const data = this.levelScratchFloat;
        analyser.getFloatTimeDomainData(data);
        let peak = 0;
        for (let i = 0; i < data.length; i += 1) {
          const abs = Math.abs(data[i]);
          if (abs > peak) peak = abs;
        }
        return Math.min(1, peak);
      }
      if (!this.levelScratchByte || this.levelScratchByte.length !== analyser.fftSize) {
        this.levelScratchByte = new Uint8Array(analyser.fftSize);
      }
      const bytes = this.levelScratchByte;
      analyser.getByteTimeDomainData(bytes);
      let peakByte = 128;
      for (let i = 0; i < bytes.length; i += 1) {
        const distance = Math.abs(bytes[i] - 128);
        if (distance > peakByte - 128) peakByte = distance + 128;
      }
      return Math.min(1, (peakByte - 128) / 127);
    } catch {
      return 0;
    }
  }

  /**
   * Fetch and decode audio for a URL/sample id. Returns a shared in-flight
   * promise for duplicate requests and caches decoded buffers. Throws an
   * explicit Error with a user-facing message on failure.
   */
  public async loadAudioFromUrl(url: string): Promise<AudioBuffer> {
    const cached = this.bufferCache.get(url);
    if (cached) return cached;
    const inflight = this.inflightLoads.get(url);
    if (inflight) return inflight;

    const promise = this.fetchAndDecode(url);
    this.inflightLoads.set(url, promise);
    promise.then(
      () => this.inflightLoads.delete(url),
      () => this.inflightLoads.delete(url)
    );
    return promise;
  }

  private async fetchAndDecode(url: string): Promise<AudioBuffer> {
    try {
      let arrayBuffer: ArrayBuffer;

      // Check if URL is an obfuscated secure sample ID or endpoint
      if (url.startsWith('sample:') || url.startsWith('/api/audio/') || url.includes('-pad')) {
        const sampleId = url.replace(/^sample:/, '');
        arrayBuffer = await secureAudioLoader.fetchAndDecryptSample(sampleId);
      } else {
        const response = await fetch(url, { headers: { 'Cache-Control': 'no-store' } });
        if (!response.ok) throw new Error(`HTTP error ${response.status}`);
        arrayBuffer = await response.arrayBuffer();
      }

      const ctx = this.getContext();
      const decodedBuffer = await ctx.decodeAudioData(arrayBuffer);
      this.bufferCache.set(url, decodedBuffer);
      return decodedBuffer;
    } catch (err) {
      const message = this.describeLoadError(err);
      throw new Error(message);
    }
  }

  private describeLoadError(err: unknown): string {
    const raw = err instanceof Error ? err.message : String(err);
    if (/HTTP error 404/.test(raw)) return 'Sample not found on server (HTTP 404)';
    if (/HTTP error 401|403/.test(raw)) return 'Not authorized to load this sample';
    if (/HTTP error 429/.test(raw)) return 'Rate limit reached while loading samples';
    if (/HTTP error (\d+)/.test(raw)) return `Sample download failed (${raw})`;
    if (/Unable to determine organization/.test(raw) || /must be signed in/.test(raw)) return raw;
    if (/Unable to decode|EncodingError|index size/i.test(raw)) return 'Audio could not be decoded (unsupported format)';
    if (/network|fetch|Failed to load/i.test(raw)) return 'Network error while loading sample';
    return `Sample failed to load: ${raw}`;
  }

  public async decodeArrayBuffer(buffer: ArrayBuffer): Promise<AudioBuffer> {
    const ctx = this.getContext();
    return await ctx.decodeAudioData(buffer.slice(0));
  }

  public registerBuffer(id: string, buffer: AudioBuffer) {
    this.bufferCache.set(id, buffer);
  }

  public getCachedBuffer(id: string): AudioBuffer | undefined {
    return this.bufferCache.get(id);
  }

  public triggerPad(
    audioBuffer: AudioBuffer | null,
    synthParams: SynthParams | undefined,
    volume: number = 1.0,
    pitch: number = 0,
    pan: number = 0,
    chokeGroup: number = 0,
    velocity: number = 1.0,
    padKey?: string,
    when?: number,
    trim?: { start?: number; end?: number }
  ) {
    if (padKey && padKey !== PREVIEW_PAD_KEY && (this.mutedPads.has(padKey) || (this.soloPads.size > 0 && !this.soloPads.has(padKey)))) return;
    const ctx = this.getContext();
    const now = ctx.currentTime;
    const startTime = when !== undefined && when > now ? when : now;
    const baseGain = Math.max(0.001, Math.min(1.0, volume * velocity));

    // Per-pad self choke: retriggering the same pad restarts it cleanly at its scheduled time
    if (padKey && this.activePadVoices.has(padKey)) {
      const existingPadNodes = this.activePadVoices.get(padKey) || [];
      existingPadNodes.forEach((voice) => this.stopVoice(voice, startTime));
      this.activePadVoices.set(padKey, []);
    }

    // Handle Choke Groups (e.g. Hi-hat choking): silence previous voices at the new voice's start
    if (chokeGroup > 0 && this.activeChokeNodes.has(chokeGroup)) {
      const nodes = this.activeChokeNodes.get(chokeGroup) || [];
      nodes.forEach((voice) => this.stopVoice(voice, startTime));
      this.activeChokeNodes.set(chokeGroup, []);
    }

    // Node chain: Source -> Panner -> [PadAnalyser] -> MasterGain
    const gainNode = ctx.createGain();
    gainNode.gain.setValueAtTime(baseGain, startTime);

    let outputNode: AudioNode = gainNode;
    if (ctx.createStereoPanner) {
      const panner = ctx.createStereoPanner();
      panner.pan.setValueAtTime(Math.max(-1, Math.min(1, pan)), startTime);
      gainNode.connect(panner);
      outputNode = panner;
    }

    if (padKey) {
      outputNode.connect(this.getOrCreatePadAnalyser(padKey));
    }
    outputNode.connect(this.masterGain!);

    if (audioBuffer) {
      const source = ctx.createBufferSource();
      source.buffer = audioBuffer;

      // Pitch tuning adjustment
      const playbackRate = Math.pow(2, pitch / 12);
      source.playbackRate.setValueAtTime(playbackRate, startTime);

      const offset = Math.max(0, Math.min(1, trim?.start ?? 0)) * audioBuffer.duration;
      const hasEnd = trim?.end !== undefined && trim.end > (trim.start ?? 0);
      const regionDuration = hasEnd
        ? Math.max(0.01, (trim.end! - Math.max(0, trim.start ?? 0)) * audioBuffer.duration)
        : undefined;

      source.connect(gainNode);
      if (regionDuration !== undefined) source.start(startTime, offset, regionDuration);
      else source.start(startTime, offset);

      const voice: Voice = { source, gain: gainNode, baseGain, padVolume: volume, velocity, startTime };
      this.trackVoice(voice, padKey);
      if (chokeGroup > 0) this.trackChokeNode(chokeGroup, voice);
    } else if (synthParams && synthParams.type !== 'none') {
      this.triggerSynthSound(synthParams.type, synthParams, gainNode, pitch, chokeGroup, padKey, startTime, baseGain, volume, velocity);
    }
  }

  private stopVoice(voice: Voice, atTime: number) {
    const ctx = this.ctx;
    const when = ctx ? Math.max(atTime, ctx.currentTime) : atTime;
    try {
      voice.gain.gain.setTargetAtTime(0, when, 0.005);
    } catch {
      // voice may already be fully stopped
    }
    const stopAt = when + 0.02;
    try {
      // For not-yet-started scheduled voices stop() must be >= their start time.
      voice.source.stop(stopAt);
    } catch {
      try {
        voice.source.stop();
      } catch {
        // already stopped
      }
    }
    setTimeout(() => {
      try {
        voice.source.disconnect();
      } catch {
        // ignore
      }
    }, Math.max(0, (stopAt - (ctx?.currentTime ?? 0)) * 1000) + 30);
    this.forgetVoice(voice);
  }

  private forgetVoice(voice: Voice) {
    this.allActiveVoices.delete(voice);
    for (const [key, voices] of this.activePadVoices) {
      const idx = voices.indexOf(voice);
      if (idx !== -1) voices.splice(idx, 1);
      if (voices.length === 0) this.activePadVoices.delete(key);
    }
    for (const [group, voices] of this.activeChokeNodes) {
      const idx = voices.indexOf(voice);
      if (idx !== -1) voices.splice(idx, 1);
      if (voices.length === 0) this.activeChokeNodes.delete(group);
    }
  }

  private triggerSynthSound(
    type: SynthType,
    params: SynthParams,
    outputNode: GainNode,
    pitch: number,
    chokeGroup: number,
    padKey?: string,
    when?: number,
    baseGain?: number,
    padVolume?: number,
    velocity?: number
  ) {
    const ctx = this.getContext();
    const now = when !== undefined && when > ctx.currentTime ? when : ctx.currentTime;
    const pitchRatio = Math.pow(2, pitch / 12);
    const voiceGain = baseGain ?? 1;

    const track = (source: AudioBufferSourceNode | OscillatorNode, gain: GainNode) => {
      const voice: Voice = {
        source,
        gain,
        baseGain: voiceGain,
        padVolume: padVolume ?? 1,
        velocity: velocity ?? 1,
        startTime: now,
      };
      this.trackVoice(voice, padKey);
      if (chokeGroup > 0) this.trackChokeNode(chokeGroup, voice);
    };

    switch (type) {
      case 'kick': {
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        const baseFreq = (params.frequency || 150) * pitchRatio;

        osc.frequency.setValueAtTime(baseFreq, now);
        osc.frequency.exponentialRampToValueAtTime(0.001, now + (params.decay || 0.4));

        gain.gain.setValueAtTime(1.0, now);
        gain.gain.exponentialRampToValueAtTime(0.001, now + (params.decay || 0.4));

        osc.connect(gain);
        gain.connect(outputNode);

        osc.start(now);
        osc.stop(now + (params.decay || 0.4));
        track(osc, gain);
        break;
      }

      case 'snare': {
        // Noise + triangle body
        const noiseBuffer = this.createNoiseBuffer(ctx, 0.3);
        const noiseSource = ctx.createBufferSource();
        noiseSource.buffer = noiseBuffer;

        const noiseFilter = ctx.createBiquadFilter();
        noiseFilter.type = 'highpass';
        noiseFilter.frequency.setValueAtTime((params.noiseFilter || 800) * pitchRatio, now);

        const noiseGain = ctx.createGain();
        noiseGain.gain.setValueAtTime(0.8, now);
        noiseGain.gain.exponentialRampToValueAtTime(0.01, now + (params.decay || 0.25));

        noiseSource.connect(noiseFilter);
        noiseFilter.connect(noiseGain);
        noiseGain.connect(outputNode);

        // Body oscillator
        const osc = ctx.createOscillator();
        osc.type = 'triangle';
        osc.frequency.setValueAtTime(180 * pitchRatio, now);
        osc.frequency.exponentialRampToValueAtTime(0.01, now + 0.15);

        const oscGain = ctx.createGain();
        oscGain.gain.setValueAtTime(0.7, now);
        oscGain.gain.exponentialRampToValueAtTime(0.01, now + 0.15);

        osc.connect(oscGain);
        oscGain.connect(outputNode);

        noiseSource.start(now);
        osc.start(now);
        noiseSource.stop(now + 0.25);
        osc.stop(now + 0.15);
        track(noiseSource, noiseGain);
        track(osc, oscGain);
        break;
      }

      case 'hihat': {
        const noiseBuffer = this.createNoiseBuffer(ctx, 0.15);
        const noiseSource = ctx.createBufferSource();
        noiseSource.buffer = noiseBuffer;

        const filter = ctx.createBiquadFilter();
        filter.type = 'highpass';
        filter.frequency.setValueAtTime(7000 * pitchRatio, now);

        const gain = ctx.createGain();
        const decay = params.decay || 0.08;
        gain.gain.setValueAtTime(0.6, now);
        gain.gain.exponentialRampToValueAtTime(0.001, now + decay);

        noiseSource.connect(filter);
        filter.connect(gain);
        gain.connect(outputNode);

        noiseSource.start(now);
        noiseSource.stop(now + decay + 0.02);
        track(noiseSource, gain);
        break;
      }

      case 'clap': {
        const decay = params.decay || 0.3;
        const noiseBuffer = this.createNoiseBuffer(ctx, decay);
        const noiseSource = ctx.createBufferSource();
        noiseSource.buffer = noiseBuffer;

        const filter = ctx.createBiquadFilter();
        filter.type = 'bandpass';
        filter.frequency.setValueAtTime(1200 * pitchRatio, now);
        filter.Q.setValueAtTime(3, now);

        const gain = ctx.createGain();
        // Burst envelopes
        gain.gain.setValueAtTime(0, now);
        gain.gain.setValueAtTime(0.8, now + 0.01);
        gain.gain.setValueAtTime(0.1, now + 0.02);
        gain.gain.setValueAtTime(0.9, now + 0.03);
        gain.gain.setValueAtTime(0.1, now + 0.04);
        gain.gain.setValueAtTime(0.7, now + 0.05);
        gain.gain.exponentialRampToValueAtTime(0.001, now + decay);

        noiseSource.connect(filter);
        filter.connect(gain);
        gain.connect(outputNode);

        noiseSource.start(now);
        noiseSource.stop(now + decay);
        track(noiseSource, gain);
        break;
      }

      case 'subbass':
      case 'lead':
      case 'piano':
      case 'tom': {
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();

        if (type === 'subbass') {
          osc.type = 'sine';
          osc.frequency.setValueAtTime((params.frequency || 55) * pitchRatio, now);
          gain.gain.setValueAtTime(0.9, now);
          gain.gain.exponentialRampToValueAtTime(0.001, now + (params.decay || 0.6));
        } else if (type === 'lead') {
          osc.type = 'sawtooth';
          osc.frequency.setValueAtTime((params.frequency || 220) * pitchRatio, now);
          gain.gain.setValueAtTime(0.5, now);
          gain.gain.exponentialRampToValueAtTime(0.001, now + (params.decay || 0.5));
        } else if (type === 'piano') {
          osc.type = 'triangle';
          osc.frequency.setValueAtTime((params.frequency || 330) * pitchRatio, now);
          gain.gain.setValueAtTime(0.8, now);
          gain.gain.exponentialRampToValueAtTime(0.001, now + (params.decay || 0.7));
        } else {
          // tom
          osc.type = 'sine';
          osc.frequency.setValueAtTime((params.frequency || 120) * pitchRatio, now);
          osc.frequency.exponentialRampToValueAtTime(40, now + (params.decay || 0.3));
          gain.gain.setValueAtTime(0.8, now);
          gain.gain.exponentialRampToValueAtTime(0.001, now + (params.decay || 0.3));
        }

        osc.connect(gain);
        gain.connect(outputNode);

        osc.start(now);
        osc.stop(now + (params.decay || 0.6));
        track(osc, gain);
        break;
      }
    }
  }

  private createNoiseBuffer(ctx: AudioContext, duration: number): AudioBuffer {
    const bufferSize = ctx.sampleRate * duration;
    const buffer = ctx.createBuffer(1, bufferSize, ctx.sampleRate);
    const output = buffer.getChannelData(0);
    for (let i = 0; i < bufferSize; i++) {
      output[i] = Math.random() * 2 - 1;
    }
    return buffer;
  }

  private getOrCreatePadAnalyser(padKey: string): AnalyserNode {
    let analyser = this.padAnalysers.get(padKey);
    if (!analyser) {
      const ctx = this.getContext();
      analyser = ctx.createAnalyser();
      analyser.fftSize = LEVEL_FFT_SIZE;
      this.padAnalysers.set(padKey, analyser);
    }
    return analyser;
  }

  public setPadMuted(padKey: string, muted: boolean) {
    if (muted) this.mutedPads.add(padKey);
    else this.mutedPads.delete(padKey);
    this.updatePadVoiceGains();
  }

  public setSoloPads(padKeys: string[]) {
    this.soloPads = new Set(padKeys);
    this.updatePadVoiceGains();
  }

  /** Replace the full mute/solo routing state in one step (used on kit/project load). */
  public applyPadRouting(mutedKeys: string[], soloKeys: string[]) {
    this.mutedPads = new Set(mutedKeys);
    this.soloPads = new Set(soloKeys);
    this.updatePadVoiceGains();
  }

  /** Live-update the audible level of currently sounding voices for a pad. */
  public setPadVoiceVolume(padKey: string, volume: number) {
    const voices = this.activePadVoices.get(padKey) || [];
    const ctx = this.ctx;
    const clamped = Math.max(0, Math.min(1, volume));
    for (const voice of voices) {
      voice.padVolume = clamped;
      voice.baseGain = Math.max(0.001, Math.min(1, clamped * voice.velocity));
      const audible = !this.mutedPads.has(padKey) && (this.soloPads.size === 0 || this.soloPads.has(padKey));
      if (audible) {
        try {
          voice.gain.gain.setTargetAtTime(voice.baseGain, ctx?.currentTime ?? 0, 0.01);
        } catch {
          // voice may have ended
        }
      }
    }
  }

  private updatePadVoiceGains() {
    for (const [padKey, voices] of this.activePadVoices) {
      const audible = !this.mutedPads.has(padKey) && (this.soloPads.size === 0 || this.soloPads.has(padKey));
      for (const voice of voices) {
        try {
          voice.gain.gain.setTargetAtTime(audible ? voice.baseGain : 0, this.ctx?.currentTime ?? 0, 0.005);
        } catch {
          // A voice may have ended between iteration and gain update.
        }
      }
    }
  }

  private trackChokeNode(chokeGroup: number, voice: Voice) {
    if (!this.activeChokeNodes.has(chokeGroup)) {
      this.activeChokeNodes.set(chokeGroup, []);
    }
    this.activeChokeNodes.get(chokeGroup)!.push(voice);
  }

  private trackVoice(voice: Voice, padKey?: string) {
    this.allActiveVoices.add(voice);

    if (padKey) {
      if (!this.activePadVoices.has(padKey)) {
        this.activePadVoices.set(padKey, []);
      }
      this.activePadVoices.get(padKey)!.push(voice);
    }

    // Automatically remove when finished playing
    if (voice.source instanceof AudioBufferSourceNode) {
      voice.source.onended = () => {
        this.allActiveVoices.delete(voice);
        if (padKey && this.activePadVoices.has(padKey)) {
          const arr = this.activePadVoices.get(padKey)!;
          const idx = arr.indexOf(voice);
          if (idx !== -1) arr.splice(idx, 1);
        }
        for (const [, arr] of this.activeChokeNodes) {
          const idx = arr.indexOf(voice);
          if (idx !== -1) arr.splice(idx, 1);
        }
      };
    } else {
      const decayMs = Math.max(0, (voice.startTime - (this.ctx?.currentTime ?? 0)) * 1000) + 2000;
      setTimeout(() => {
        this.allActiveVoices.delete(voice);
        if (padKey && this.activePadVoices.has(padKey)) {
          const arr = this.activePadVoices.get(padKey)!;
          const idx = arr.indexOf(voice);
          if (idx !== -1) arr.splice(idx, 1);
        }
        for (const [, arr] of this.activeChokeNodes) {
          const idx = arr.indexOf(voice);
          if (idx !== -1) arr.splice(idx, 1);
        }
      }, decayMs);
    }
  }

  /** Stop all currently sounding voices for one pad (used by editor preview stop). */
  public stopPadVoices(padKey: string) {
    if (!this.ctx) return;
    const voices = this.activePadVoices.get(padKey) || [];
    for (const voice of Array.from(voices)) {
      this.stopVoice(voice, this.ctx.currentTime);
    }
    this.activePadVoices.set(padKey, []);
  }

  /**
   * Cancel events that were scheduled ahead of time (e.g. swing-delayed steps)
   * but have not started yet. Already-sounding voices are left to ring out.
   */
  public stopScheduledEvents() {
    if (!this.ctx) return;
    const now = this.ctx.currentTime;
    for (const voice of Array.from(this.allActiveVoices)) {
      if (voice.startTime > now + 0.001) {
        try {
          voice.source.stop(now);
        } catch {
          // ignore: source may not accept stop before start in exotic cases
        }
        this.forgetVoice(voice);
      }
    }
  }

  public stopAllPlayback() {
    if (!this.ctx) return;
    const now = this.ctx.currentTime;

    this.allActiveVoices.forEach((voice) => {
      try {
        voice.gain.gain.setTargetAtTime(0, now, 0.005);
      } catch {
        // ignore
      }
      setTimeout(() => {
        try {
          voice.source.stop();
          voice.source.disconnect();
        } catch {
          // ignore: already stopped
        }
      }, 20);
    });

    this.allActiveVoices.clear();
    this.activeChokeNodes.clear();
    this.activePadVoices.clear();
  }

  public getPadDuration(audioBuffer: AudioBuffer | null, synthParams?: SynthParams): string {
    if (audioBuffer) {
      return `${audioBuffer.duration.toFixed(2)}s`;
    }
    if (synthParams && synthParams.type !== 'none') {
      return `${(synthParams.decay || 0.4).toFixed(2)}s (Synth)`;
    }
    return '0.00s';
  }
}

export const audioEngine = new AudioEngineService();
