import { tmdbGet } from './tmdbClient.js'

function queryFromReq(req) {
  /** @type {Record<string, string | string[]>} */
  const out = {}
  for (const [k, v] of Object.entries(req.query)) {
    if (v === undefined) continue
    if (Array.isArray(v)) {
      out[k] = v.map(String)
    } else {
      out[k] = String(v)
    }
  }
  return out
}

function section(r) {
  if (r.status >= 200 && r.status < 300) {
    return { ok: true, data: r.body }
  }
  return { ok: false, status: r.status, data: r.body }
}

/**
 * @param {import('express').Application} app
 */
export function registerMovieRoutes(app) {
  /**
   * GET /api/home — bundled home feed (trending, popular movies, top rated, popular TV, genres).
   */
  app.get('/api/home', async (_req, res) => {
    try {
      const [trending, popularMovies, topRated, popularTv, movieGenres, tvGenres] =
        await Promise.all([
          tmdbGet('/trending/all/week', { page: '1' }),
          tmdbGet('/movie/popular', { page: '1' }),
          tmdbGet('/movie/top_rated', { page: '1' }),
          tmdbGet('/tv/popular', { page: '1' }),
          tmdbGet('/genre/movie/list', {}),
          tmdbGet('/genre/tv/list', {}),
        ])

      const payload = {
        trending: section(trending),
        popularMovies: section(popularMovies),
        topRated: section(topRated),
        popularTv: section(popularTv),
        movieGenres: section(movieGenres),
        tvGenres: section(tvGenres),
      }

      const anyOk = Object.values(payload).some((s) => s.ok)
      if (!anyOk) {
        return res.status(502).json({
          error: 'Home feed: all upstream segments failed',
          ...payload,
        })
      }
      res.json(payload)
    } catch (err) {
      res.status(502).json({
        error: err?.message || 'Home feed failed',
      })
    }
  })

  /**
   * GET /api/movies — TMDB /movie/popular by default; supports ?sort=top_rated|now_playing|upcoming|popular
   */
  app.get('/api/movies', async (req, res) => {
    const allowed = new Set(['popular', 'top_rated', 'now_playing', 'upcoming'])
    const sort = String(req.query.sort ?? 'popular').trim()
    const path = allowed.has(sort) ? `/movie/${sort}` : '/movie/popular'
    const params = queryFromReq(req)
    delete params.sort
    try {
      const { status, body } = await tmdbGet(path, params)
      res.status(status).json(body)
    } catch (err) {
      res.status(502).json({ error: err?.message || 'TMDB request failed' })
    }
  })

  /**
   * GET /api/movies/search?q=… — TMDB /search/multi (movies + tv + people).
   */
  app.get('/api/movies/search', async (req, res) => {
    const q = String(req.query.q ?? req.query.query ?? '').trim()
    if (!q) {
      return res
        .status(400)
        .json({ error: 'Missing q (or query) query parameter' })
    }
    const params = queryFromReq(req)
    delete params.q
    params.query = q
    params.include_adult = 'false'

    try {
      const { status, body } = await tmdbGet('/search/multi', params)
      res.status(status).json(body)
    } catch (err) {
      res.status(502).json({ error: err?.message || 'TMDB request failed' })
    }
  })

  /**
   * GET /api/movies/genres — TMDB /genre/movie/list
   */
  app.get('/api/movies/genres', async (_req, res) => {
    try {
      const { status, body } = await tmdbGet('/genre/movie/list', {})
      res.status(status).json(body)
    } catch (err) {
      res.status(502).json({ error: err?.message || 'TMDB request failed' })
    }
  })

  /**
   * GET /api/movies/discover — TMDB /discover/movie with arbitrary filters.
   */
  app.get('/api/movies/discover', async (req, res) => {
    try {
      const { status, body } = await tmdbGet('/discover/movie', queryFromReq(req))
      res.status(status).json(body)
    } catch (err) {
      res.status(502).json({ error: err?.message || 'TMDB request failed' })
    }
  })

  /**
   * GET /api/movies/:id — TMDB /movie/:id with credits, videos, images appended.
   * Accepts ?media=tv to fetch /tv/:id instead.
   */
  app.get('/api/movies/:id', async (req, res) => {
    const id = String(req.params.id).trim()
    const media = String(req.query.media ?? 'movie').trim() === 'tv' ? 'tv' : 'movie'
    const params = queryFromReq(req)
    delete params.media
    if (!params.append_to_response) {
      params.append_to_response = 'credits,videos,images,similar,recommendations,external_ids'
    }
    try {
      const { status, body } = await tmdbGet(`/${media}/${encodeURIComponent(id)}`, params)
      res.status(status).json(body)
    } catch (err) {
      res.status(502).json({ error: err?.message || 'TMDB request failed' })
    }
  })
}
