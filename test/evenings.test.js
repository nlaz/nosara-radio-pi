const { test } = require('node:test');
const assert = require('node:assert/strict');
const {
  extractSlug,
  resolveStation,
  InvalidInput,
  StationNotFoundError,
  EveningsApiUnreachable,
} = require('../evenings');

test('U1.T1: extractSlug parses evenings.fm station URL', () => {
  assert.deepEqual(
    extractSlug('https://evenings.fm/nosara-pirate-radio'),
    { kind: 'station', slug: 'nosara-pirate-radio' },
  );
});

test('U1.T1b: extractSlug parses evenings.co station URL', () => {
  assert.deepEqual(
    extractSlug('https://evenings.co/nosara-pirate-radio'),
    { kind: 'station', slug: 'nosara-pirate-radio' },
  );
});

test('U1.T2: extractSlug parses media.evenings.co/s/<id>', () => {
  assert.deepEqual(
    extractSlug('https://media.evenings.co/s/elkVE8rA8'),
    { kind: 'media', slug: 'elkVE8rA8' },
  );
});

test('U1.T3: extractSlug accepts bare station slug', () => {
  assert.deepEqual(extractSlug('nosara-pirate-radio'), { kind: 'station', slug: 'nosara-pirate-radio' });
});

test('U1.T3b: extractSlug heuristically classifies bare mixed-case token as media ID', () => {
  assert.deepEqual(extractSlug('Kwekx1JG0'), { kind: 'media', slug: 'Kwekx1JG0' });
  assert.deepEqual(extractSlug('elkVE8rA8'), { kind: 'media', slug: 'elkVE8rA8' });
});

test('U1.T4: extractSlug rejects empty / whitespace / non-string', () => {
  assert.throws(() => extractSlug(''), InvalidInput);
  assert.throws(() => extractSlug('   '), InvalidInput);
  assert.throws(() => extractSlug(null), InvalidInput);
  assert.throws(() => extractSlug(undefined), InvalidInput);
  assert.throws(() => extractSlug(42), InvalidInput);
});

test('U1.T4b: extractSlug rejects malformed URL (unknown host)', () => {
  assert.throws(() => extractSlug('https://example.com/foo'), InvalidInput);
});

test('U1.T4c: extractSlug rejects media URL without /s/<id>', () => {
  assert.throws(() => extractSlug('https://media.evenings.co/'), InvalidInput);
});

test('U1.T5: resolveStation hits /live and parses response shape', async () => {
  const calls = [];
  const fakeFetch = async (url) => {
    calls.push(url);
    return {
      ok: true, status: 200,
      async json() {
        return {
          id: 'elkVE8rA8',
          name: 'Nosara Pirate Radio',
          host: null,
          url: '',
          description: 'Putting the freak in frequency @ 87.7 fm',
          streamUrl: 'https://media.evenings.co/s/elkVE8rA8',
          image: 'https://example.com/img.jpg',
          online: true,
          listeners: 3,
          tags: [], type: 'live',
        };
      },
    };
  };
  const result = await resolveStation('nosara-pirate-radio', { fetchFn: fakeFetch });
  assert.equal(calls[0], 'https://api.evenings.co/v1/streams/nosara-pirate-radio/live');
  assert.equal(result.kind, 'station');
  assert.equal(result.slug, 'nosara-pirate-radio');
  assert.equal(result.name, 'Nosara Pirate Radio');
  assert.equal(result.streamUrl, 'https://media.evenings.co/s/elkVE8rA8');
  assert.equal(result.image, 'https://example.com/img.jpg');
  assert.equal(result.online, true);
  assert.equal(result.listeners, 3);
  assert.ok(result.fetchedAt);
  assert.equal(result.apiReachable, true);
});

test('U1.T6: resolveStation throws StationNotFoundError on 404', async () => {
  const fakeFetch = async () => ({ ok: false, status: 404 });
  await assert.rejects(
    () => resolveStation('does-not-exist', { fetchFn: fakeFetch }),
    StationNotFoundError,
  );
});

test('U1.T7: resolveStation throws EveningsApiUnreachable on network failure', async () => {
  const fakeFetch = async () => { throw new Error('ECONNREFUSED'); };
  await assert.rejects(
    () => resolveStation('anything', { fetchFn: fakeFetch }),
    EveningsApiUnreachable,
  );
});

test('U1.T7b: resolveStation throws EveningsApiUnreachable on non-2xx, non-404', async () => {
  const fakeFetch = async () => ({ ok: false, status: 500 });
  await assert.rejects(
    () => resolveStation('anything', { fetchFn: fakeFetch }),
    EveningsApiUnreachable,
  );
});

test('U1.T8: resolveStation skips API for media-kind classification', async () => {
  let called = false;
  const fakeFetch = async () => { called = true; return { ok: true, status: 200, json: async () => ({}) }; };
  const result = await resolveStation({ kind: 'media', slug: 'elkVE8rA8' }, { fetchFn: fakeFetch });
  assert.equal(called, false);
  assert.equal(result.kind, 'media');
  assert.equal(result.streamUrl, 'https://media.evenings.co/s/elkVE8rA8');
  assert.equal(result.name, null);
  assert.equal(result.image, null);
  assert.equal(result.apiReachable, null);
});

test('U1.T8b: resolveStation skips API for media URL input', async () => {
  let called = false;
  const fakeFetch = async () => { called = true; return { ok: true, status: 200, json: async () => ({}) }; };
  const result = await resolveStation('https://media.evenings.co/s/Kwekx1JG0', { fetchFn: fakeFetch });
  assert.equal(called, false);
  assert.equal(result.kind, 'media');
  assert.equal(result.slug, 'Kwekx1JG0');
  assert.equal(result.streamUrl, 'https://media.evenings.co/s/Kwekx1JG0');
});
