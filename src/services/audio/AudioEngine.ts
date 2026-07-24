import { SynthParams, SynthType } from '../../types';
import { secureAudioLoader } from './SecureAudioLoader';

class AudioEngineService {
  private ctx: AudioContext | null = null;
  private masterGain: GainNode | null = null;
  private analyser: AnalyserNode | null = null;
  private bufferCache: Map<string, AudioBuffer> = new Map();
  private activeChokeNodes: Map<number, { source: AudioBufferSourceNode | OscillatorNode; gain: GainNode }[]> = new Map();
  private activePadVoices: Map<string, { source: AudioBufferSourceNode | OscillatorNode; gain: GainNode }[]> = new Map();
  private allActiveVoices: Set<{ source: AudioBufferSourceNode | OscillatorNode; gain: GainNode }> = new Set();

  constructor() {
    // AudioContext will be initialized on first user gesture or resume
  }

  public getContext(): AudioContext {
    if (!this.ctx) {
      const AudioCtxClass = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      this.ctx = new AudioCtxClass();
      
      this.masterGain = this.ctx.createGain();
      this.analyser = this.ctx.createAnalyser();
      this.analyser.fftSize = 64;

      this.masterGain.connect(this.analyser);
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

  public async loadAudioFromUrl(url: string): Promise<AudioBuffer | null> {
    if (this.bufferCache.has(url)) {
      return this.bufferCache.get(url)!;
    }
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
      console.warn(`Failed to load audio securely from ${url}:`, err);
      return null;
    }
  }

  public async decodeArrayBuffer(buffer: ArrayBuffer): Promise<AudioBuffer> {
    const ctx = this.getContext();
    return await ctx.decodeAudioData(buffer.slice(0));
  }

  public registerBuffer(id: string, buffer: AudioBuffer) {
    this.bufferCache.set(id, buffer);
  }

  public triggerPad(
    audioBuffer: AudioBuffer | null,
    synthParams: SynthParams | undefined,
    volume: number = 1.0,
    pitch: number = 0,
    pan: number = 0,
    chokeGroup: number = 0,
    velocity: number = 1.0,
    padKey?: string
  ) {
    const ctx = this.getContext();
    const now = ctx.currentTime;

    // Per-pad self choke: pressing the same pad while playing restarts it cleanly
    if (padKey && this.activePadVoices.has(padKey)) {
      const existingPadNodes = this.activePadVoices.get(padKey) || [];
      existingPadNodes.forEach(({ source, gain }) => {
        try {
          gain.gain.setTargetAtTime(0, now, 0.005);
          setTimeout(() => {
            try {
              source.stop();
              source.disconnect();
            } catch {
              // ignore
            }
          }, 20);
        } catch {
          // ignore
        }
      });
      this.activePadVoices.set(padKey, []);
    }

    // Handle Choke Groups (e.g. Hi-hat choking)
    if (chokeGroup > 0 && this.activeChokeNodes.has(chokeGroup)) {
      const nodes = this.activeChokeNodes.get(chokeGroup) || [];
      nodes.forEach(({ source, gain }) => {
        try {
          gain.gain.setTargetAtTime(0, now, 0.005);
          setTimeout(() => {
            try {
              source.stop();
              source.disconnect();
            } catch {
              // ignore if already stopped
            }
          }, 20);
        } catch {
          // ignore
        }
      });
      this.activeChokeNodes.set(chokeGroup, []);
    }

    // Node chain: Source -> Panner -> Gain -> MasterGain
    const gainNode = ctx.createGain();
    const finalVol = Math.max(0.001, Math.min(1.0, volume * velocity));
    gainNode.gain.setValueAtTime(finalVol, now);

    let pannerNode: StereoPannerNode | GainNode = gainNode;
    if (ctx.createStereoPanner) {
      const panner = ctx.createStereoPanner();
      panner.pan.setValueAtTime(Math.max(-1, Math.min(1, pan)), now);
      gainNode.connect(panner);
      pannerNode = panner;
    }

    pannerNode.connect(this.masterGain!);

    if (audioBuffer) {
      // Trigger recorded / loaded sample from start
      const source = ctx.createBufferSource();
      source.buffer = audioBuffer;
      
      // Pitch tuning adjustment
      const playbackRate = Math.pow(2, pitch / 12);
      source.playbackRate.setValueAtTime(playbackRate, now);
      
      source.connect(gainNode);
      source.start(now);
      this.trackVoice(source, gainNode, padKey);

      if (chokeGroup > 0) {
        this.trackChokeNode(chokeGroup, source, gainNode);
      }
    } else if (synthParams && synthParams.type !== 'none') {
      // Trigger Web Audio Synthesizer
      this.triggerSynthSound(synthParams.type, synthParams, gainNode, pitch, chokeGroup, padKey);
    }
  }

  private triggerSynthSound(
    type: SynthType,
    params: SynthParams,
    outputNode: GainNode,
    pitch: number,
    chokeGroup: number,
    padKey?: string
  ) {
    const ctx = this.getContext();
    const now = ctx.currentTime;
    const pitchRatio = Math.pow(2, pitch / 12);

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
        this.trackVoice(osc, gain, padKey);

        if (chokeGroup > 0) this.trackChokeNode(chokeGroup, osc, gain);
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
        this.trackVoice(noiseSource, noiseGain, padKey);
        this.trackVoice(osc, oscGain, padKey);

        if (chokeGroup > 0) this.trackChokeNode(chokeGroup, noiseSource, noiseGain);
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
        this.trackVoice(noiseSource, gain, padKey);

        if (chokeGroup > 0) this.trackChokeNode(chokeGroup, noiseSource, gain);
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
        this.trackVoice(noiseSource, gain, padKey);

        if (chokeGroup > 0) this.trackChokeNode(chokeGroup, noiseSource, gain);
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
        this.trackVoice(osc, gain, padKey);

        if (chokeGroup > 0) this.trackChokeNode(chokeGroup, osc, gain);
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

  private trackChokeNode(chokeGroup: number, source: AudioBufferSourceNode | OscillatorNode, gain: GainNode) {
    if (!this.activeChokeNodes.has(chokeGroup)) {
      this.activeChokeNodes.set(chokeGroup, []);
    }
    this.activeChokeNodes.get(chokeGroup)!.push({ source, gain });
  }

  private trackVoice(
    source: AudioBufferSourceNode | OscillatorNode,
    gain: GainNode,
    padKey?: string
  ) {
    const voice = { source, gain };
    this.allActiveVoices.add(voice);

    if (padKey) {
      if (!this.activePadVoices.has(padKey)) {
        this.activePadVoices.set(padKey, []);
      }
      this.activePadVoices.get(padKey)!.push(voice);
    }
    
    // Automatically remove when finished playing
    if (source instanceof AudioBufferSourceNode) {
      source.onended = () => {
        this.allActiveVoices.delete(voice);
        if (padKey && this.activePadVoices.has(padKey)) {
          const arr = this.activePadVoices.get(padKey)!;
          const idx = arr.indexOf(voice);
          if (idx !== -1) arr.splice(idx, 1);
        }
      };
    } else {
      setTimeout(() => {
        this.allActiveVoices.delete(voice);
        if (padKey && this.activePadVoices.has(padKey)) {
          const arr = this.activePadVoices.get(padKey)!;
          const idx = arr.indexOf(voice);
          if (idx !== -1) arr.splice(idx, 1);
        }
      }, 2000);
    }
  }

  public stopAllPlayback() {
    if (!this.ctx) return;
    const now = this.ctx.currentTime;
    
    this.allActiveVoices.forEach(({ source, gain }) => {
      try {
        gain.gain.setTargetAtTime(0, now, 0.005);
        setTimeout(() => {
          try {
            source.stop();
            source.disconnect();
          } catch {
            // ignore
          }
        }, 20);
      } catch {
        // ignore
      }
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
