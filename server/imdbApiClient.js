const DEFAULT_BASE = 'https://api.imdbapi.dev'

function baseUrl() {
  const raw = process.env.IMDBAPI_BASE_URL?.trim()
  if (!raw) return DEFAULT_BASE
  return raw.replace(/\/$/, '')
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

/** Max parallel upstream IMDbAPI calls per server process (reduces 429 bursts). */
function maxConcurrent() {
  const n = intEnv('IMDBAPI_MAX_CONCURRENT', 3)
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

/**
 * @param {Response} res
 * @returns {number | null} ms to wait
 */
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
 * @param {string} path Absolute path beginning with / (e.g. "/titles")
 * @param {Record<string, string | string[] | undefined>} [query]
 */
export async function imdbApiGet(path, query) {
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

  const maxRetries = Math.max(0, intEnv('IMDBAPI_MAX_RETRIES', 5))
  const baseMs = Math.max(50, intEnv('IMDBAPI_RETRY_BASE_MS', 400))

  await acquireUpstream()
  try {
    for (let attempt = 0; attempt <= maxRetries; attempt++) {
      const res = await fetch(url, {
        headers: {
          Accept: 'application/json',
          'User-Agent':
            'subtitles-local-server/1.0 (+https://imdbapi.dev/)',
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
    return { status: 503, body: { error: 'IMDbAPI retries exhausted' } }
  } finally {
    releaseUpstream()
  }
}
