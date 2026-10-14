import test from 'node:test';
import assert from 'node:assert/strict';

// --- Browser/WebAudio mocks (installed before importing the store) ---
class Param {
  constructor(value = 1) { this.value = value; }
  setValueAtTime(value) { this.value = value; }
  setTargetAtTime(value) { this.value = value; }
  exponentialRampToValueAtTime() {}
}
class MockNode {
  constructor() { this.connections = []; this.disconnected = false; }
  connect(node) { this.connections.push(node); return node; }
  disconnect() { this.disconnected = true; }
}
class MockGain extends MockNode { constructor() { super(); this.gain = new Param(1); } }
class MockPanner extends MockNode { constructor() { super(); this.pan = new Param(0); } }
class MockAnalyser extends MockNode {
  constructor() { super(); this.fftSize = 32; this.frequencyBinCount = 16; }
  getByteFrequencyData(data) { data.fill(0); }
  getFloatTimeDomainData(data) { data.fill(0); }
}
class MockSource extends MockNode {
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
  constructor() {
    this.currentTime = 10;
    this.sampleRate = 44100;
    this.state = 'running';
    this.destination = new MockNode();
    this.createdSources = [];
    this.createdGains = [];
  }
  createGain() { const node = new MockGain(); this.createdGains.push(node); return node; }
  createAnalyser() { return new MockAnalyser(); }
  createStereoPanner() { return new MockPanner(); }
  createBufferSource() { const node = new MockBufferSource(); this.createdSources.push(node); return node; }
  createOscillator() { const node = new MockOscillator(); this.createdSources.push(node); return node; }
  createBiquadFilter() { return new MockNode(); }
  createBuffer() { return new MockAudioBuffer(); }
  resume() { return Promise.resolve(); }
}

globalThis.AudioBufferSourceNode = MockBufferSource;
globalThis.window = {
  AudioContext: MockAudioContext,
  setInterval: (fn, ms) => setInterval(fn, ms),
  clearInterval: (id) => clearInterval(id),
  localStorage: {
    getItem: () => null,
    setItem: () => {},
    removeItem: () => {},
  },
  location: { origin: 'http://localhost' },
};

const { useStore } = await import('../src/store/useStore.ts');
const { PRESET_KITS } = await import('../src/services/audio/presetKits.ts');
const { audioEngine } = await import('../src/services/audio/AudioEngine.ts');

const state = () => useStore.getState();
const ctx = audioEngine.getContext();

test('every kit exposes 16 musical pads with no STOP/CAMERA/INFO utility pads', () => {
  for (const kit of Object.values(PRESET_KITS)) {
    assert.equal(kit.banks.A.length, 16, `${kit.name} has 16 pads`);
    for (const index of [13, 14, 15]) {
      const name = kit.banks.A[index].name.toUpperCase();
      assert.ok(!['STOP', 'CAMERA', 'INFO'].includes(name), `${kit.name} pad ${index + 1} is musical (${name})`);
    }
  }
});

test('kit loading reports explicit per-pad failure instead of silent fallback', async () => {
  await state().loadPresetKit('kit1');
  assert.equal(state().activePresetId, 'kit1');
  assert.equal(state().kitLoadStatus, 'failed', 'unauthenticated sample loads must surface as failure');
  assert.ok(state().kitLoadError, 'kit load error message is populated');

  const sampleStates = state().padSampleState;
  const failed = Object.entries(sampleStates).filter(([, entry]) => entry.status === 'failed');
  assert.ok(failed.length > 0, 'failed pads are reported');
  assert.ok(failed.every(([, entry]) => typeof entry.error === 'string' && entry.error.length > 0), 'each failure carries a message');
  assert.ok(!Object.values(sampleStates).some((entry) => entry.status === 'loaded'), 'no failed sample reports success');
  assert.equal(state().banks.A.length, 16, 'pad layout still committed');
});

test('pads with failed samples stay silent while synth pads still play', () => {
  const before = ctx.createdSources.length;
  state().triggerPad(0, 1); // kit1 pad 1 has an audioUrl whose load failed
  assert.equal(ctx.createdSources.length, before, 'failed sample does not fall back to synth and plays nothing');
  state().triggerPad(13, 1); // kit1 pad 14 is a pure synth voice
  assert.ok(ctx.createdSources.length > before, 'synth pads still play');
});

test('REC records hits at the current step scaled by REC GAIN; DUB only adds', async () => {
  await state().loadPresetKit('synth808');
  assert.equal(state().activePresetId, 'synth808');
  assert.equal(state().kitLoadStatus, 'ready', 'synth kit needs no samples');

  state().toggleRecord();
  assert.equal(state().isPlaying, true, 'REC starts the transport');
  assert.equal(state().isRecording, true);

  state().triggerPad(0, 1.0);
  let step = state().patterns.A.pads[0].steps[0];
  assert.equal(step.active, true, 'REC writes the step');
  assert.ok(Math.abs(step.velocity - state().recGain) < 1e-9, 'recorded velocity is scaled by REC GAIN');

  state().toggleOverdub();
  assert.equal(state().isOverdubbing, true);
  assert.equal(state().isRecording, false);
  state().triggerPad(0, 0.5);
  step = state().patterns.A.pads[0].steps[0];
  assert.ok(Math.abs(step.velocity - state().recGain) < 1e-9, 'overdub does not overwrite an existing step');

  state().toggleRecord();
  assert.equal(state().isRecording, true);
  state().triggerPad(0, 0.5);
  step = state().patterns.A.pads[0].steps[0];
  assert.ok(Math.abs(step.velocity - 0.5 * state().recGain) < 1e-9, 'REC overwrites the step velocity');

  state().stopPlayback();
  assert.equal(state().isPlaying, false);
  assert.equal(state().currentStep, 0);
});

test('a superseded kit load never overwrites the newer selection', async () => {
  const stale = state().loadPresetKit('kit1');
  const fresh = state().loadPresetKit('synth808');
  await Promise.all([stale, fresh]);

  assert.equal(state().activePresetId, 'synth808', 'newest selection wins');
  assert.equal(state().kitLoadStatus, 'ready', 'stale failures do not pollute the new kit status');
  assert.equal(state().kitLoadError, null);
  assert.ok(
    !Object.values(state().padSampleState).some((entry) => entry.status === 'failed'),
    'stale request cannot write statuses into the new kit'
  );
  assert.equal(
    state().patterns.A.pads[0].steps[0].active,
    false,
    "a previous kit's demo pattern must not leak into the newly selected kit"
  );
});

test('undo and redo cover step edits', () => {
  state().toggleStep(1, 5);
  assert.equal(state().patterns.A.pads[1].steps[5].active, true);
  assert.equal(state().canUndo, true);

  state().undo();
  assert.equal(state().patterns.A.pads[1].steps[5].active, false, 'undo reverts the step');
  assert.equal(state().canRedo, true);

  state().redo();
  assert.equal(state().patterns.A.pads[1].steps[5].active, true, 'redo restores the step');
  state().stopPlayback();
});

test('sample uploads validate file type, emptiness, and decodability with clear errors', async () => {
  await state().uploadSampleToPad('A', 0, new File(['plain'], 'notes.txt', { type: 'text/plain' }));
  assert.equal(state().sampleUpload.status, 'error');
  assert.match(state().sampleUpload.message, /not a supported audio file/);

  await state().uploadSampleToPad('A', 0, new File([], 'empty.wav', { type: 'audio/wav' }));
  assert.equal(state().sampleUpload.status, 'error');
  assert.match(state().sampleUpload.message, /is empty/);

  await state().uploadSampleToPad('A', 0, new File([new Uint8Array([1, 2, 3, 4])], 'broken.wav', { type: 'audio/wav' }));
  assert.equal(state().sampleUpload.status, 'error');
  assert.match(state().sampleUpload.message, /could not be decoded/);
});
