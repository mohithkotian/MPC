import test from 'node:test';
import assert from 'node:assert/strict';

const { AudioBufferCache } = await import('../src/services/audio/AudioBufferCache.ts');

test('cache returns a stored value without invoking the loader', async () => {
  const cache = new AudioBufferCache(2);
  cache.set('sample-a', 'decoded-a');
  let loaderCalls = 0;

  const value = await cache.load('sample-a', async () => {
    loaderCalls += 1;
    return 'unexpected';
  });

  assert.equal(value, 'decoded-a');
  assert.equal(loaderCalls, 0);
});

test('concurrent loads for one sample share a single loader promise', async () => {
  const cache = new AudioBufferCache(2);
  let loaderCalls = 0;
  let resolveLoad;
  const loading = new Promise((resolve) => { resolveLoad = resolve; });

  const first = cache.load('sample-a', async () => {
    loaderCalls += 1;
    await loading;
    return 'decoded-a';
  });
  const second = cache.load('sample-a', async () => {
    loaderCalls += 1;
    return 'unexpected';
  });

  assert.strictEqual(first, second);
  assert.equal(loaderCalls, 0, 'loader starts on the next microtask');
  await Promise.resolve();
  assert.equal(loaderCalls, 1);
  resolveLoad();
  assert.equal(await first, 'decoded-a');
  assert.equal(await second, 'decoded-a');
  assert.equal(cache.get('sample-a'), 'decoded-a');
});

test('a rejected load is removed so a later request can retry', async () => {
  const cache = new AudioBufferCache(2);
  let loaderCalls = 0;

  await assert.rejects(cache.load('sample-a', async () => {
    loaderCalls += 1;
    throw new Error('decode failed');
  }), /decode failed/);

  const value = await cache.load('sample-a', async () => {
    loaderCalls += 1;
    return 'decoded-after-retry';
  });

  assert.equal(value, 'decoded-after-retry');
  assert.equal(loaderCalls, 2);
});

test('cache evicts the oldest decoded sample when full', () => {
  const cache = new AudioBufferCache(2);
  cache.set('sample-a', 'decoded-a');
  cache.set('sample-b', 'decoded-b');
  cache.set('sample-c', 'decoded-c');

  assert.equal(cache.size, 2);
  assert.equal(cache.has('sample-a'), false);
  assert.equal(cache.get('sample-b'), 'decoded-b');
  assert.equal(cache.get('sample-c'), 'decoded-c');
});
