import assert from 'node:assert/strict';
import test from 'node:test';
import {
  IDENTIFICATION_CLIENT_TIMEOUT_MS,
  IdentificationTimeoutError,
  withIdentificationDeadline,
} from './identification-deadline.ts';

test('client budget leaves room beyond the 45-second backend deadline', () => {
  assert.equal(IDENTIFICATION_CLIENT_TIMEOUT_MS, 55_000);
});

test('a slow successful response settles normally without aborting', async () => {
  const controller = new AbortController();
  const result = await withIdentificationDeadline(
    async () => {
      await new Promise((resolve) => setTimeout(resolve, 20));
      return 'actual result';
    }, controller, 100,
  );
  assert.equal(result, 'actual result');
  assert.equal(controller.signal.aborted, false);
});

test('a stalled operation that ignores abort still stops loading at the deadline', async () => {
  const controller = new AbortController();
  let loading = true;
  try {
    await assert.rejects(
      withIdentificationDeadline(() => new Promise(() => {}), controller, 5),
      IdentificationTimeoutError,
    );
  } finally {
    loading = false;
  }
  assert.equal(loading, false);
  assert.equal(controller.signal.aborted, true);
});

test('provider errors propagate immediately and allow a fresh retry', async () => {
  const failure = new Error('quota test');
  await assert.rejects(
    withIdentificationDeadline(async () => { throw failure; }, new AbortController(), 100),
    (error) => error === failure,
  );
  assert.equal(await withIdentificationDeadline(async () => 'retry result', new AbortController(), 100), 'retry result');
});

test('leaving or replacing a photo cancels a stalled operation promptly', async () => {
  const controller = new AbortController();
  const pending = withIdentificationDeadline(() => new Promise(() => {}), controller, 100);
  controller.abort();
  await assert.rejects(pending, { name: 'AbortError' });
});

test('already canceled requests never invoke the operation', async () => {
  const controller = new AbortController();
  controller.abort();
  let calls = 0;
  await assert.rejects(withIdentificationDeadline(async () => { calls++; }, controller), { name: 'AbortError' });
  assert.equal(calls, 0);
});
