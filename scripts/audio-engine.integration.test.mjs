import test from 'node:test';
import assert from 'node:assert/strict';

class Param {
  constructor(value = 1) {
    this.value = value;
    this.calls = [];
  }
  setValueAtTime(value, time) { this.value = value; this.calls.push(['set', value, time]); }
  setTargetAtTime(value, time, duration) { this.value = value; this.calls.push(['target', value, time, duration]); }
  exponentialRampToValueAtTime(value, time) { this.value = value; this.calls.push(['ramp', value, time]); }
}

class Node {
  constructor() { this.connections = []; this.disconnected = false; }
  connect(node) { this.connections.push(node); return node; }
  disconnect() { this.disconnected = true; }
}

class MockGain extends Node { constructor() { super(); this.gain = new Param(1); } }
class MockPanner extends Node { constructor() { super(); this.pan = new Param(0); } }
class MockAnalyser extends Node { constructor() { super(); this.fftSize = 0; this.frequencyBinCount = 32; } getByteFrequencyData(data) { data.fill(0); } }
class MockSource extends Node {
  constructor() { super(); this.playbackRate = new Param(1); this.started = []; this.stopped = []; this.onended = null; this.buffer = null; }
  start(time) { this.started.push(time); }
  stop(time) { this.stopped.push(time ?? null); }
}
class MockOscillator extends MockSource {
  constructor() { super(); this.frequency = new Param(220); this.type = 'sine'; }
}
class MockBufferSource extends MockSource {}
class MockAudioBuffer {
  constructor() { this.duration = 1; this.numberOfChannels = 1; this.length = 44100; this.sampleRate = 44100; }
  getChannelData() { return new Float32Array(this.length); }
}
class MockAudioContext {
  constructor() { this.currentTime = 10; this.sampleRate = 44100; this.state = 'running'; this.destination = new Node(); this.createdGains = []; this.createdSources = []; }
  createGain() { const node = new MockGain(); this.createdGains.push(node); return node; }
  createAnalyser() { return new MockAnalyser(); }
  createStereoPanner() { return new MockPanner(); }
  createBufferSource() { const node = new MockBufferSource(); this.createdSources.push(node); return node; }
  createOscillator() { const node = new MockOscillator(); this.createdSources.push(node); return node; }
  createBiquadFilter() { return new Node(); }
  createBuffer() { return new MockAudioBuffer(); }
  resume() {}
}

globalThis.AudioBufferSourceNode = MockBufferSource;
globalThis.window = { AudioContext: MockAudioContext };

const { audioEngine } = await import('../src/services/audio/AudioEngine.ts');

function sampleBuffer() { return new MockAudioBuffer(); }

test('mute and solo change gain of a currently playing voice and block new voices', () => {
  const ctx = audioEngine.getContext();
  audioEngine.setPadMuted('A-0', false);
  audioEngine.setSoloPads([]);
  audioEngine.triggerPad(sampleBuffer(), undefined, 1, 0, 0, 0, 1, 'A-0');
  const voiceGain = ctx.createdGains.at(-1);
  assert.equal(voiceGain.gain.value, 1);

  audioEngine.setPadMuted('A-0', true);
  assert.equal(voiceGain.gain.value, 0);
  const sourcesBeforeMuteTrigger = ctx.createdSources.length;
  audioEngine.triggerPad(sampleBuffer(), undefined, 1, 0, 0, 0, 1, 'A-0');
  assert.equal(ctx.createdSources.length, sourcesBeforeMuteTrigger, 'muted pads do not create sources');

  audioEngine.setPadMuted('A-0', false);
  audioEngine.setSoloPads(['B-0']);
  assert.equal(voiceGain.gain.value, 0, 'non-solo active voice is silenced');
  const sourcesBeforeSoloTrigger = ctx.createdSources.length;
  audioEngine.triggerPad(sampleBuffer(), undefined, 1, 0, 0, 0, 1, 'A-0');
  assert.equal(ctx.createdSources.length, sourcesBeforeSoloTrigger, 'non-solo pads do not create sources');
  audioEngine.setSoloPads([]);
  audioEngine.stopAllPlayback();
});

test('stopAllPlayback fades and stops active voices', async () => {
  audioEngine.setPadMuted('B-0', false);
  audioEngine.setSoloPads([]);
  const ctx = audioEngine.getContext();
  audioEngine.triggerPad(undefined, { type: 'lead', frequency: 220, decay: 0.1 }, 1, 0, 0, 0, 1, 'B-0');
  const source = ctx.createdSources.at(-1);
  audioEngine.stopAllPlayback();
  assert.ok(source.stopped.length >= 1, 'stopAllPlayback stops active sources');
  assert.equal(source.disconnected, false, 'disconnect is deferred for the short fade window');
  await new Promise((resolve) => setTimeout(resolve, 30));
  assert.equal(source.disconnected, true, 'stopped voices are disconnected after fade cleanup');
});
