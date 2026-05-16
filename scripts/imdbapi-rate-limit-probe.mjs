#!/usr/bin/env node
/**
 * Fire many requests against IMDbAPI (or your local proxy) to see if/when
 * rate limits appear (429, Retry-After, Ratelimit-* headers, etc.).
 *
 * Usage:
 *   node scripts/imdbapi-rate-limit-probe.mjs --requests 300 --concurrency 20
 *   node scripts/imdbapi-rate-limit-probe.mjs --requests=300 --concurrency=20 --delay-ms=500
 *   npm run probe:imdb-rate -- --requests 200 --concurrency 10
 *
 *   IMDBAPI_BASE_URL=https://api.imdbapi.dev node scripts/imdbapi-rate-limit-probe.mjs
 *
 *   # Through your Express server (must be running):
 *   node scripts/imdbapi-rate-limit-probe.mjs --target local --port 3001 --requests 200
 */

function parseArgs(argv) {
  /** @type {Record<string, string | boolean>} */
  const out = { _: [] }
  for (let i = 2; i < argv.length; i++) {
    const a = argv[i]
    if (a.startsWith('--')) {
      const eq = a.indexOf('=')
      const rawKey = eq === -1 ? a.slice(2) : a.slice(2, eq)
      const key = rawKey.replace(/-/g, '')
      let val
      if (eq !== -1) {
        val = a.slice(eq + 1)
      } else if (argv[i + 1] && !argv[i + 1].startsWith('-')) {
        val = argv[++i]
      } else {
        val = 'true'
      }
      out[key] = val
    } else {
      out._.push(a)
    }
  }
  return out
}

function numArg(args, key, fallback) {
  const v = args[key]
  if (v === undefined || v === 'true') return fallback
  const n = Number(v)
  return Number.isFinite(n) ? n : fallback
}

function baseFromEnv() {
  const raw = process.env.IMDBAPI_BASE_URL?.trim()
  return (raw || 'https://api.imdbapi.dev').replace(/\/$/, '')
}

/** @param {Headers} h */
function pickRateHeaders(h) {
  const names = [
    'retry-after',
    'ratelimit-limit',
    'ratelimit-remaining',
    'ratelimit-reset',
    'x-ratelimit-limit',
    'x-ratelimit-remaining',
    'x-ratelimit-reset',
    'x-rate-limit-limit',
    'x-rate-limit-remaining',
    'x-rate-limit-reset',
  ]
  /** @type {Record<string, string>} */
  const o = {}
  for (const n of names) {
    const v = h.get(n)
    if (v != null && v !== '') o[n] = v
  }
  return o
}

/**
 * @param {string} url
 * @param {number} timeoutMs
 */
async function hitOnce(url, timeoutMs) {
  const t0 = performance.now()
  const signal =
    typeof AbortSignal !== 'undefined' && 'timeout' in AbortSignal
      ? AbortSignal.timeout(timeoutMs)
      : undefined
  const res = await fetch(url, {
    signal,
    headers: {
      Accept: 'application/json',
      'User-Agent': 'imdbapi-rate-limit-probe/1.0',
    },
  })
  const text = await res.text()
  const ms = Math.round(performance.now() - t0)
  const rate = pickRateHeaders(res.headers)
  return {
    status: res.status,
    ms,
    rate,
    bytes: text.length,
    bodyPreview:
      res.status >= 400 ? text.slice(0, 240).replace(/\s+/g, ' ') : undefined,
  }
}

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms))
}

async function main() {
  const args = parseArgs(process.argv)
  const requests = Math.max(1, Math.floor(numArg(args, 'requests', 120)))
  const concurrency = Math.max(1, Math.floor(numArg(args, 'concurrency', 15)))
  const delayMs = Math.max(0, Math.floor(numArg(args, 'delayms', 0)))
  const target = String(args.target || 'direct').toLowerCase()
  const port = Math.floor(numArg(args, 'port', 3001))
  const mode = String(args.mode || 'titles').toLowerCase()
  const verbose = args.verbose === 'true' || args.verbose === true
  const timeoutMs = Math.floor(numArg(args, 'timeoutms', 30000))

  /** @type {(i: number) => string} */
  let buildUrl
  if (target === 'local') {
    const host = `http://127.0.0.1:${port}`
    if (mode === 'search') {
      buildUrl = (i) =>
        `${host}/api/movies/search?q=${encodeURIComponent(`rate-probe-${i}`)}`
    } else if (mode === 'mix') {
      buildUrl = (i) =>
        i % 2 === 0
          ? `${host}/api/movies?pageSize=1&_=${i}`
          : `${host}/api/movies/search?q=${encodeURIComponent(`p-${i}`)}`
    } else {
      buildUrl = (i) => `${host}/api/movies?pageSize=1&_=${i}`
    }
  } else {
    const base = baseFromEnv()
    if (mode === 'search') {
      buildUrl = (i) =>
        `${base}/search/titles?query=${encodeURIComponent(`rate-probe-${i}`)}`
    } else if (mode === 'mix') {
      buildUrl = (i) =>
        i % 2 === 0
          ? `${base}/titles?pageSize=1&_=${i}`
          : `${base}/search/titles?query=${encodeURIComponent(`p-${i}`)}`
    } else {
      buildUrl = (i) => `${base}/titles?pageSize=1&_=${i}`
    }
  }

  console.log(
    JSON.stringify(
      {
        target,
        base: target === 'local' ? `http://127.0.0.1:${port}` : baseFromEnv(),
        mode,
        requests,
        concurrency,
        delayMsBetweenBatches: delayMs,
        timeoutMs,
      },
      null,
      2
    )
  )

  /** @type {Record<number, number>} */
  const byStatus = {}
  let first429 = null
  const samples429 = []
  const samplesNon200 = []
  const errors = []

  const batchSize = concurrency
  const batches = Math.ceil(requests / batchSize)

  let seq = 0
  let loggedNon200 = 0
  const maxNon200Logs = verbose ? Infinity : 8
  for (let b = 0; b < batches; b++) {
    const inBatch = Math.min(batchSize, requests - b * batchSize)
    const tasks = []
    for (let k = 0; k < inBatch; k++) {
      const i = seq++
      tasks.push(
        hitOnce(buildUrl(i), timeoutMs).catch((err) => ({
          status: 0,
          ms: 0,
          rate: {},
          bytes: 0,
          bodyPreview: undefined,
          err: err?.name || String(err),
        }))
      )
    }
    const results = await Promise.all(tasks)

    for (const r of results) {
      const st = r.status
      byStatus[st] = (byStatus[st] || 0) + 1
      if (st === 429) {
        if (!first429) first429 = { ...r }
        if (samples429.length < 5) samples429.push({ ...r })
      }
      if ('err' in r && r.err) {
        errors.push(r.err)
      }
      const interesting = st !== 200 && st !== 0
      if (interesting && loggedNon200 < maxNon200Logs) {
        loggedNon200++
        console.log(
          JSON.stringify({
            status: st,
            ms: r.ms,
            rate: r.rate,
            bodyPreview: r.bodyPreview,
            err: 'err' in r ? r.err : undefined,
          })
        )
      } else if (interesting) {
        samplesNon200.push({ status: st, ms: r.ms, bodyPreview: r.bodyPreview })
      }
    }

    if (delayMs > 0 && b + 1 < batches) await sleep(delayMs)
  }

  console.log('\n--- summary ---')
  console.log('status histogram:', byStatus)
  if (byStatus[429]) {
    console.log(
      '429 Too Many Requests: present (no Retry-After / Ratelimit-* headers observed on samples).'
    )
  }
  if (Object.keys(byStatus).length === 1 && byStatus[200] === requests) {
    console.log(
      'No non-200 responses in this run (does not prove there is no limit at higher volume).'
    )
  }
  if (first429) {
    console.log('first 429 sample:', JSON.stringify(first429, null, 2))
    console.log('extra 429 samples:', JSON.stringify(samples429, null, 2))
  }
  if (samplesNon200.length && !verbose) {
    console.log(
      `… suppressed ${samplesNon200.length} further non-200 lines (use --verbose for all)`
    )
    console.log('last non-200:', JSON.stringify(samplesNon200.at(-1), null, 2))
  }
  if (errors.length) {
    const ec = {}
    for (const e of errors) ec[e] = (ec[e] || 0) + 1
    console.log('client/transport errors:', ec)
  }
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
