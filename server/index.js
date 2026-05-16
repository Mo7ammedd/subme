import express from 'express'
import { registerMovieRoutes } from './moviesRoutes.js'

const PORT = Number(process.env.PORT) || 3001
const UA =
  'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36'

const app = express()

const ALLOWED_ORIGINS = (process.env.ALLOWED_ORIGINS ?? '*')
  .split(',')
  .map((s) => s.trim())
  .filter(Boolean)

app.use((req, res, next) => {
  const origin = req.headers.origin
  if (ALLOWED_ORIGINS.includes('*')) {
    res.setHeader('Access-Control-Allow-Origin', '*')
  } else if (origin && ALLOWED_ORIGINS.includes(origin)) {
    res.setHeader('Access-Control-Allow-Origin', origin)
    res.setHeader('Vary', 'Origin')
  }
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS')
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type')
  res.setHeader('Access-Control-Max-Age', '86400')
  if (req.method === 'OPTIONS') return res.status(204).end()
  next()
})

registerMovieRoutes(app)

app.get('/api', (_req, res) => {
  res.json({
    name: 'subme backend',
    upstream: {
      tmdb: 'https://www.themoviedb.org/',
      tmdbApiBase: 'https://api.themoviedb.org/3',
      subdl: 'https://subdl.com/',
    },
    routes: [
      'GET /api — this index',
      'GET /api/home — bundled home (trending, popular movies, top rated, popular tv, genres)',
      'GET /api/movies?sort=popular|top_rated|now_playing|upcoming',
      'GET /api/movies/search?q= — TMDB /search/multi',
      'GET /api/movies/genres — TMDB /genre/movie/list',
      'GET /api/movies/discover — TMDB /discover/movie',
      'GET /api/movies/:id?media=movie|tv — TMDB details + credits + videos',
      'GET /api/search?q= — SubDL search',
      'GET /api/subtitles?url= — SubDL subtitle page payload',
    ],
  })
})

function extractPageProps(payload) {
  if (!payload || typeof payload !== 'object') return null
  return payload.pageProps || payload?.props?.pageProps || null
}

app.get('/api/search', async (req, res) => {
  const q = String(req.query.q ?? '').trim()
  if (!q) return res.status(400).json({ error: 'Missing q' })

  try {
    const upstream = await fetch(
      `https://api3.subdl.com/auto?query=${encodeURIComponent(q)}`,
      { headers: { 'User-Agent': UA, Accept: 'application/json' } }
    )
    if (!upstream.ok) {
      return res
        .status(502)
        .json({ error: `Upstream search failed (${upstream.status})` })
    }
    const data = await upstream.json()
    res.json(data)
  } catch (err) {
    res.status(502).json({ error: err?.message || 'Upstream search failed' })
  }
})

app.get('/api/subtitles', async (req, res) => {
  const raw = String(req.query.url ?? '').trim()
  if (!raw) return res.status(400).json({ error: 'Missing url' })

  let parsed
  try {
    parsed = new URL(raw)
  } catch {
    return res.status(400).json({ error: 'Invalid url' })
  }
  if (parsed.host !== 'subdl.com' && parsed.host !== 'www.subdl.com') {
    return res.status(400).json({ error: 'Only subdl.com URLs are allowed' })
  }

  try {
    const upstream = await fetch(parsed.toString(), {
      headers: { 'User-Agent': UA, Accept: 'text/html' },
    })
    if (!upstream.ok) {
      return res
        .status(502)
        .json({ error: `Upstream page failed (${upstream.status})` })
    }
    const html = await upstream.text()
    const match = html.match(
      /<script[^>]*id="__NEXT_DATA__"[^>]*>([\s\S]*?)<\/script>/
    )
    if (!match) {
      return res.status(404).json({ error: 'Next.js payload not found' })
    }
    let data
    try {
      data = JSON.parse(match[1])
    } catch {
      return res.status(502).json({ error: 'Could not parse Next.js payload' })
    }
    const pageProps = extractPageProps(data)
    if (!pageProps) {
      return res.status(404).json({ error: 'pageProps not present' })
    }
    res.json({ pageProps })
  } catch (err) {
    res.status(502).json({ error: err?.message || 'Upstream page failed' })
  }
})

app.listen(PORT, () => {
  console.log(`subme backend listening on ${PORT}`)
})
