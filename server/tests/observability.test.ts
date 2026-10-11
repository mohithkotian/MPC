import assert from 'node:assert/strict';
import test from 'node:test';
import { getMetricSnapshot, incrementMetric, resetMetricsForTests, sanitizeLogText } from '../observability';

test('sanitizeLogText redacts credentials, URLs, and local paths', () => {
  const result = sanitizeLogText('Authorization: Bearer secret-token password=hunter2 https://private.example/a C:\\private\\sample.mp3');
  assert.equal(result.includes('secret-token'), false);
  assert.equal(result.includes('hunter2'), false);
  assert.equal(result.includes('private.example'), false);
  assert.equal(result.includes('sample.mp3'), false);
  assert.match(result, /REDACTED/);
});

test('metrics preserve bounded labels and support reset for isolated tests', () => {
  resetMetricsForTests();
  incrementMetric('http_requests_total', { method: 'GET', route: '/api/health', status_class: '2xx' });
  assert.deepEqual(getMetricSnapshot(), { 'http_requests_total{method=GET,route=/api/health,status_class=2xx}': 1 });
  resetMetricsForTests();
  assert.deepEqual(getMetricSnapshot(), {});
});
