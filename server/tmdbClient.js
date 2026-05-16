const DEFAULT_BASE = 'https://api.themoviedb.org/3'
const DEFAULT_BEARER =
  'eyJhbGciOiJIUzI1NiJ9.eyJhdWQiOiIzMTViOGM5ZmIzMzFmNGI3MzQ4NzllNDU4NjQ2NjEzMiIsIm5iZiI6MTc3ODg4ODA5OS41Nywic3ViIjoiNmEwN2FkYTMxNjZmMDYxYWE3OGI3OGFkIiwic2NvcGVzIjpbImFwaV9yZWFkIl0sInZlcnNpb24iOjF9.9vhrCclI2PidXv-ykn4673AN_RSH9c8wURwja8QlNVA'

export const TMDB_IMAGE_BASE = 'https://image.tmdb.org/t/p'

function baseUrl() {
  const raw = process.env.TMDB_BASE_URL?.trim()
  if (!raw) return DEFAULT_BASE
  return raw.replace(/\/$/, '')
}

function bearer() {
  return process.env.TMDB_BEARER?.trim() || DEFAULT_BEARER
}

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms))
}

function intEnv(name, fallback) {
  const raw = process.env[name]
  if (raw === undefined || raw === '') return fallback
  const n = Number.parseInt(String(raw), 10)
  return Number.isFinite(n) ? n : fallback
}

function maxConcurrent() {
  const n = intEnv('TMDB_MAX_CONCURRENT', 6)
  if (n < 1) return Number.POSITIVE_INFINITY
  return n
}

let upstreamActive = 0
/** @type {(() => void)[]} */
const upstreamWaiters = []

async function acquireUpstream() {
  const limit = maxConcurrent()
  if (!Number.isFinite(limit)) return
  if (upstreamActive < limit) {
    upstreamActive++
    return
  }
  await new Promise((resolve) => {
    upstreamWaiters.push(() => {
      upstreamActive++
      resolve()
    })
  })
}

function releaseUpstream() {
  const limit = maxConcurrent()
  if (!Number.isFinite(limit)) return
  upstreamActive--
  const next = upstreamWaiters.shift()
  if (next) next()
}

function parseRetryAfterMs(res) {
  const raw = res.headers.get('retry-after')
  if (!raw) return null
  const sec = Number(raw)
  if (Number.isFinite(sec) && sec >= 0)
    return Math.min(Math.round(sec * 1000), 120_000)
  const when = Date.parse(raw)
  if (!Number.isNaN(when))
    return Math.min(Math.max(0, when - Date.now()), 120_000)
  return null
}

function backoffMs(attempt, baseMs) {
  const exp = baseMs * 2 ** attempt
  const jitter = Math.floor(Math.random() * baseMs)
  return Math.min(Math.round(exp + jitter), 30_000)
}

/**
 * @param {string} path Absolute path beginning with / (e.g. "/movie/popular")
 * @param {Record<string, string | string[] | number | undefined>} [query]
 */
export async function tmdbGet(path, query) {
  const root = `${baseUrl()}/`
  const url = new URL(path.startsWith('/') ? path.slice(1) : path, root)
  if (query) {
    for (const [key, value] of Object.entries(query)) {
      if (value === undefined || value === '') continue
      const parts = Array.isArray(value) ? value : [value]
      for (const v of parts) {
        url.searchParams.append(key, String(v))
      }
    }
  }
  if (!url.searchParams.has('language')) {
    url.searchParams.set('language', 'en-US')
  }

  const maxRetries = Math.max(0, intEnv('TMDB_MAX_RETRIES', 4))
  const baseMs = Math.max(50, intEnv('TMDB_RETRY_BASE_MS', 300))

  await acquireUpstream()
  try {
    for (let attempt = 0; attempt <= maxRetries; attempt++) {
      const res = await fetch(url, {
        headers: {
          Accept: 'application/json',
          Authorization: `Bearer ${bearer()}`,
          'User-Agent': 'subme-local-server/2.0 (+https://themoviedb.org)',
        },
      })
      const text = await res.text()

      const retryable =
        (res.status === 429 || res.status === 503) && attempt < maxRetries

      if (retryable) {
        const ra = parseRetryAfterMs(res)
        const waitMs = ra ?? backoffMs(attempt, baseMs)
        await sleep(waitMs)
        continue
      }

      let body
      try {
        body = text ? JSON.parse(text) : null
      } catch {
        body = { raw: text }
      }
      return { status: res.status, body }
    }
    return { status: 503, body: { error: 'TMDB retries exhausted' } }
  } finally {
    releaseUpstream()
  }
}
