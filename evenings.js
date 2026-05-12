const STATION_HOSTS = new Set([
  'evenings.fm',
  'evenings.co',
  'www.evenings.fm',
  'www.evenings.co',
]);
const MEDIA_HOST = 'media.evenings.co';
const API_BASE = 'https://api.evenings.co/v1/streams';

const MEDIA_BARE_RE = /^[A-Za-z0-9_-]{6,16}$/;
const STATION_BARE_RE = /^[a-zA-Z0-9_-]+$/;

class InvalidInput extends Error {
  constructor(input) {
    super(`Invalid station input: ${JSON.stringify(input)}`);
    this.name = 'InvalidInput';
    this.input = input;
  }
}

class StationNotFoundError extends Error {
  constructor(slug) {
    super(`Station not found: ${slug}`);
    this.name = 'StationNotFoundError';
    this.slug = slug;
  }
}

class EveningsApiUnreachable extends Error {
  constructor(slug, cause) {
    super(`Evenings API unreachable for ${slug}: ${cause?.message ?? cause}`);
    this.name = 'EveningsApiUnreachable';
    this.slug = slug;
    this.cause = cause;
  }
}

function extractSlug(input) {
  if (typeof input !== 'string') throw new InvalidInput(input);
  const trimmed = input.trim();
  if (!trimmed) throw new InvalidInput(input);

  let url = null;
  try { url = new URL(trimmed); } catch { /* not a URL */ }

  if (url) {
    const host = url.host.toLowerCase();
    const segments = url.pathname.split('/').filter(Boolean);
    if (host === MEDIA_HOST) {
      if (segments[0] === 's' && segments[1]) {
        return { kind: 'media', slug: segments[1] };
      }
      throw new InvalidInput(input);
    }
    if (STATION_HOSTS.has(host) && segments[0]) {
      return { kind: 'station', slug: segments[0] };
    }
    throw new InvalidInput(input);
  }

  // Bare token. Mixed-case alphanumeric without hyphens looks like a media ID;
  // anything else defaults to station slug.
  const hasUpper = /[A-Z]/.test(trimmed);
  const hasLower = /[a-z]/.test(trimmed);
  const hasHyphen = trimmed.includes('-');
  if (!hasHyphen && hasUpper && hasLower && MEDIA_BARE_RE.test(trimmed)) {
    return { kind: 'media', slug: trimmed };
  }
  if (STATION_BARE_RE.test(trimmed)) {
    return { kind: 'station', slug: trimmed };
  }
  throw new InvalidInput(input);
}

function classify(slugOrInput) {
  if (typeof slugOrInput === 'string') return extractSlug(slugOrInput);
  if (slugOrInput && typeof slugOrInput === 'object'
      && typeof slugOrInput.slug === 'string'
      && (slugOrInput.kind === 'station' || slugOrInput.kind === 'media')) {
    return { kind: slugOrInput.kind, slug: slugOrInput.slug };
  }
  throw new InvalidInput(slugOrInput);
}

function mediaStation(slug) {
  return {
    slug,
    kind: 'media',
    streamUrl: `https://${MEDIA_HOST}/s/${slug}`,
    name: null,
    image: null,
    host: null,
    description: null,
    online: null,
    listeners: null,
    fetchedAt: null,
    apiReachable: null,
  };
}

async function resolveStation(slugOrInput, options = {}) {
  const { fetchFn = fetch, timeoutMs = 5000 } = options;
  const { kind, slug } = classify(slugOrInput);

  if (kind === 'media') return mediaStation(slug);

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  let res;
  try {
    res = await fetchFn(`${API_BASE}/${encodeURIComponent(slug)}/live`, {
      signal: controller.signal,
    });
  } catch (err) {
    throw new EveningsApiUnreachable(slug, err);
  } finally {
    clearTimeout(timer);
  }

  if (res.status === 404) throw new StationNotFoundError(slug);
  if (!res.ok) throw new EveningsApiUnreachable(slug, new Error(`HTTP ${res.status}`));

  let body;
  try { body = await res.json(); }
  catch (err) { throw new EveningsApiUnreachable(slug, err); }

  const streamUrl = typeof body.streamUrl === 'string' && /^https?:\/\//.test(body.streamUrl)
    ? body.streamUrl
    : null;
  return {
    slug,
    kind: 'station',
    streamUrl,
    name: typeof body.name === 'string' ? body.name : null,
    image: typeof body.image === 'string' ? body.image : null,
    host: typeof body.host === 'string' ? body.host : null,
    description: typeof body.description === 'string' ? body.description : null,
    online: typeof body.online === 'boolean' ? body.online : null,
    listeners: typeof body.listeners === 'number' ? body.listeners : null,
    fetchedAt: new Date().toISOString(),
    apiReachable: true,
  };
}

module.exports = {
  extractSlug,
  resolveStation,
  InvalidInput,
  StationNotFoundError,
  EveningsApiUnreachable,
};
