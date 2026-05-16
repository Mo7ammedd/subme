import { useEffect, useMemo, useRef, useState } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import './App.css'

const TMDB_IMG = 'https://image.tmdb.org/t/p'

function normalizeApiBase(raw) {
  if (raw == null) return ''
  const s = String(raw).trim().replace(/\/+$/, '')
  if (!s) return ''
  if (/^https?:\/\//i.test(s)) return s
  if (s.startsWith('//')) return `https:${s}`
  if (s.startsWith('/')) return s
  return `https://${s}`
}
const API_BASE = normalizeApiBase(import.meta.env.VITE_API_BASE_URL)
const HOME_ENDPOINT = `${API_BASE}/api/home`
const SEARCH_ENDPOINT = `${API_BASE}/api/movies/search?q=`
const DETAILS_ENDPOINT = `${API_BASE}/api/movies/`
const SUBDL_SEARCH_ENDPOINT = `${API_BASE}/api/search?q=`
const SUBDL_SUBTITLES_ENDPOINT = `${API_BASE}/api/subtitles?url=`

const ease = [0.16, 1, 0.3, 1]

function posterUrl(path, size = 'w342') {
  if (!path) return ''
  return `${TMDB_IMG}/${size}${path}`
}
function backdropUrl(path, size = 'w1280') {
  if (!path) return ''
  return `${TMDB_IMG}/${size}${path}`
}
function mediaKind(t) {
  return t === 'tv' ? 'tv' : 'movie'
}
function titleOf(item) {
  return (
    item?.title || item?.name || item?.original_title || item?.original_name || 'Untitled'
  )
}
function yearOf(item) {
  const date = item?.release_date || item?.first_air_date
  return date ? String(date).slice(0, 4) : ''
}
function classNames(...xs) {
  return xs.filter(Boolean).join(' ')
}

function useDebounced(value, delay) {
  const [v, setV] = useState(value)
  useEffect(() => {
    const t = window.setTimeout(() => setV(value), delay)
    return () => window.clearTimeout(t)
  }, [value, delay])
  return v
}

function PosterCard({ item, onClick }) {
  const title = titleOf(item)
  const year = yearOf(item)
  return (
    <button type="button" className="poster-card" onClick={onClick}>
      <div className="poster-frame">
        {item.poster_path ? (
          <img src={posterUrl(item.poster_path)} alt="" loading="lazy" decoding="async" />
        ) : (
          <div className="poster-fallback">{title.slice(0, 1)}</div>
        )}
      </div>
      <div className="poster-meta">
        <span className="poster-title">{title}</span>
        <span className="poster-year">{year || '—'}</span>
      </div>
    </button>
  )
}

function Slider({ children, className = '' }) {
  const ref = useRef(null)
  const [canPrev, setCanPrev] = useState(false)
  const [canNext, setCanNext] = useState(false)

  const update = () => {
    const el = ref.current
    if (!el) return
    const max = el.scrollWidth - el.clientWidth - 2
    setCanPrev(el.scrollLeft > 4)
    setCanNext(el.scrollLeft < max)
  }

  useEffect(() => {
    const el = ref.current
    if (!el) return
    update()
    el.addEventListener('scroll', update, { passive: true })
    const ro = new ResizeObserver(update)
    ro.observe(el)
    return () => {
      el.removeEventListener('scroll', update)
      ro.disconnect()
    }
  }, [])

  const nudge = (dir) => {
    const el = ref.current
    if (!el) return
    const delta = el.clientWidth * 0.85 * dir
    el.scrollBy({ left: delta, behavior: 'smooth' })
  }

  return (
    <div className="slider">
      <button
        type="button"
        className="slider-arrow slider-arrow--prev"
        onClick={() => nudge(-1)}
        aria-label="Scroll left"
        disabled={!canPrev}
      >
        ‹
      </button>
      <div ref={ref} className={`slider-track ${className}`}>
        {children}
      </div>
      <button
        type="button"
        className="slider-arrow slider-arrow--next"
        onClick={() => nudge(1)}
        aria-label="Scroll right"
        disabled={!canNext}
      >
        ›
      </button>
    </div>
  )
}

function CoverStrip({ items, onPick }) {
  const picks = (items || []).filter((t) => t.backdrop_path).slice(0, 8)
  if (picks.length < 2) return null
  return (
    <section className="cover-strip" aria-label="In the spotlight">
      <header className="row-head">
        <h2 className="row-title">In the spotlight</h2>
        <span className="row-hint">scroll →</span>
      </header>
      <Slider className="cover-track">
        {picks.map((t) => (
          <button
            key={`cv-${t.id}`}
            type="button"
            className="cover-tile"
            onClick={() => onPick(t)}
          >
            <img
              src={backdropUrl(t.backdrop_path, 'w780')}
              alt=""
              loading="lazy"
              decoding="async"
            />
            <div className="cover-shade" aria-hidden />
            <div className="cover-meta">
              <span className="cover-title">{titleOf(t)}</span>
              <span className="cover-sub">
                {yearOf(t) || '—'}
                {t.vote_average ? ` · ★ ${t.vote_average.toFixed(1)}` : ''}
              </span>
            </div>
          </button>
        ))}
      </Slider>
    </section>
  )
}

function Row({ title, items, onPick }) {
  if (!items?.length) return null
  return (
    <section className="row">
      <header className="row-head">
        <h2 className="row-title">{title}</h2>
        <span className="row-hint">scroll →</span>
      </header>
      <Slider className="row-track">
        {items.map((it, i) => (
          <PosterCard key={`${it.id}-${i}`} item={it} onClick={() => onPick(it)} />
        ))}
      </Slider>
    </section>
  )
}

function GenrePills({ movieGenres, tvGenres, onPick }) {
  const all = useMemo(() => {
    const m = (movieGenres || []).map((g) => ({ ...g, media: 'movie' }))
    const t = (tvGenres || []).map((g) => ({ ...g, media: 'tv' }))
    const seen = new Set()
    return [...m, ...t].filter((g) => {
      if (seen.has(g.name)) return false
      seen.add(g.name)
      return true
    })
  }, [movieGenres, tvGenres])
  if (!all.length) return null
  return (
    <section className="genres">
      <h2 className="row-title">Browse genres</h2>
      <div className="genre-grid">
        {all.map((g) => (
          <button
            key={`${g.media}-${g.id}`}
            type="button"
            className="genre-chip"
            onClick={() => onPick(g.name)}
          >
            {g.name}
          </button>
        ))}
      </div>
    </section>
  )
}

function Spinner() {
  return (
    <span className="spinner" role="status" aria-label="Loading">
      <span className="spinner-dot" />
      <span className="spinner-dot" />
      <span className="spinner-dot" />
    </span>
  )
}

function DetailModal({ open, item, onClose, onWantSubtitles }) {
  const [details, setDetails] = useState(null)
  const [status, setStatus] = useState('idle')
  const [error, setError] = useState('')

  useEffect(() => {
    if (!open || !item) return
    let abort = false
    const media = item.media_type === 'tv' || item.first_air_date ? 'tv' : 'movie'
    const id = item.id
    setStatus('loading')
    setError('')
    setDetails(null)
    fetch(`${DETAILS_ENDPOINT}${id}?media=${media}`)
      .then(async (r) => {
        const body = await r.json().catch(() => null)
        if (!r.ok) throw new Error(body?.error || `Failed (${r.status})`)
        return body
      })
      .then((body) => {
        if (abort) return
        setDetails(body)
        setStatus('done')
      })
      .catch((err) => {
        if (abort) return
        setStatus('error')
        setError(err.message || 'Failed to load')
      })
    return () => {
      abort = true
    }
  }, [open, item])

  useEffect(() => {
    if (!open) return
    const onKey = (e) => {
      if (e.key === 'Escape') onClose()
    }
    document.addEventListener('keydown', onKey)
    document.body.style.overflow = 'hidden'
    return () => {
      document.removeEventListener('keydown', onKey)
      document.body.style.overflow = ''
    }
  }, [open, onClose])

  return (
    <AnimatePresence>
      {open && item && (
        <motion.div
          className="modal-backdrop"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.18 }}
          onClick={onClose}
        >
          <motion.div
            className="modal"
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 8 }}
            transition={{ duration: 0.22, ease }}
            onClick={(e) => e.stopPropagation()}
            role="dialog"
            aria-modal="true"
            aria-label={titleOf(item)}
          >
            <button
              type="button"
              className="modal-close"
              onClick={onClose}
              aria-label="Close"
            >
              ✕
            </button>

            {(details?.backdrop_path || item.backdrop_path) && (
              <div
                className="modal-backdrop-img"
                style={{
                  backgroundImage: `url(${backdropUrl(
                    details?.backdrop_path || item.backdrop_path
                  )})`,
                }}
              />
            )}

            <div className="modal-body">
              <div className="modal-poster">
                {(details?.poster_path || item.poster_path) ? (
                  <img
                    src={posterUrl(details?.poster_path || item.poster_path, 'w500')}
                    alt=""
                  />
                ) : (
                  <div className="poster-fallback poster-fallback--lg">
                    {titleOf(item).slice(0, 1)}
                  </div>
                )}
              </div>

              <div className="modal-info">
                <h2 className="modal-title">{titleOf(details || item)}</h2>
                <div className="modal-meta">
                  <span
                    className={`media-pill media-pill--${mediaKind(
                      details?.first_air_date ? 'tv' : 'movie'
                    )}`}
                  >
                    {details?.first_air_date ? 'TV' : 'Movie'}
                  </span>
                  {yearOf(details || item) && <span>{yearOf(details || item)}</span>}
                  {details?.runtime ? <span>{details.runtime} min</span> : null}
                  {(details?.vote_average ?? item.vote_average) != null && (
                    <span className="rating-inline">
                      ★ {(details?.vote_average ?? item.vote_average).toFixed(1)}
                    </span>
                  )}
                </div>

                {details?.genres?.length ? (
                  <div className="modal-genres">
                    {details.genres.map((g) => (
                      <span key={g.id} className="genre-tag">
                        {g.name}
                      </span>
                    ))}
                  </div>
                ) : null}

                <p className="modal-overview">
                  {details?.overview || item.overview || 'No overview available.'}
                </p>

                {details?.credits?.cast?.length ? (
                  <div className="cast-row">
                    <h3 className="section-h">Cast</h3>
                    <div className="cast-track">
                      {details.credits.cast.slice(0, 12).map((p) => (
                        <div
                          className="cast-card"
                          key={p.cast_id || p.credit_id || p.id}
                        >
                          <div className="cast-avatar">
                            {p.profile_path ? (
                              <img
                                src={posterUrl(p.profile_path, 'w185')}
                                alt=""
                                loading="lazy"
                                decoding="async"
                              />
                            ) : (
                              <div className="poster-fallback">
                                {p.name?.slice(0, 1)}
                              </div>
                            )}
                          </div>
                          <span className="cast-name">{p.name}</span>
                          <span className="cast-char">{p.character}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                ) : null}

                <div className="modal-actions">
                  <button
                    type="button"
                    className="btn-primary"
                    onClick={() =>
                      onWantSubtitles({
                        label: titleOf(details || item),
                        query:
                          details?.external_ids?.imdb_id ||
                          titleOf(details || item),
                      })
                    }
                  >
                    Get subtitles
                  </button>
                </div>

                {status === 'loading' ? <Spinner /> : null}
                {error ? (
                  <div className="alert alert--error" role="alert">
                    {error}
                  </div>
                ) : null}
              </div>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  )
}

function SubtitleDrawer({ open, label, query, onClose }) {
  const [status, setStatus] = useState('idle')
  const [error, setError] = useState('')
  const [results, setResults] = useState([])
  const [subStatus, setSubStatus] = useState('idle')
  const [subError, setSubError] = useState('')
  const [pageProps, setPageProps] = useState(null)
  const [seriesUrl, setSeriesUrl] = useState('')
  const [selectedTitle, setSelectedTitle] = useState('')
  const [languageFilter, setLanguageFilter] = useState('all')
  const [copyNotice, setCopyNotice] = useState('')

  useEffect(() => {
    if (!open || !query) return
    let abort = false
    setStatus('loading')
    setError('')
    setResults([])
    setPageProps(null)
    setSelectedTitle('')
    setSeriesUrl('')
    fetch(`${SUBDL_SEARCH_ENDPOINT}${encodeURIComponent(query)}`)
      .then(async (r) => {
        const body = await r.json().catch(() => null)
        if (!r.ok) throw new Error(body?.error || `Failed (${r.status})`)
        return body
      })
      .then((body) => {
        if (abort) return
        const arr = Array.isArray(body?.results) ? body.results : []
        setResults(arr)
        setStatus('done')
        if (arr.length === 1) {
          void loadResult(arr[0])
        }
      })
      .catch((err) => {
        if (abort) return
        setStatus('error')
        setError(err.message || 'Search failed')
      })
    return () => {
      abort = true
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, query])

  useEffect(() => {
    if (!open) return
    const onKey = (e) => {
      if (e.key === 'Escape') onClose()
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [open, onClose])

  const loadUrl = async (url, displayName) => {
    if (!url) return
    setSubStatus('loading')
    setSubError('')
    setPageProps(null)
    if (displayName !== undefined) setSelectedTitle(displayName)
    setLanguageFilter('all')
    try {
      const response = await fetch(
        `${SUBDL_SUBTITLES_ENDPOINT}${encodeURIComponent(url)}`
      )
      const body = await response.json().catch(() => null)
      if (!response.ok) throw new Error(body?.error || `Failed (${response.status})`)
      setPageProps(body?.pageProps || null)
      setSubStatus('done')
    } catch (err) {
      setSubStatus('error')
      setSubError(err.message || 'Failed to load subtitles')
    }
  }

  const loadResult = async (result) => {
    const url = result?.link ? `https://subdl.com${result.link}` : ''
    if (!url) return
    setSeriesUrl(url)
    await loadUrl(url, result.name || '')
  }

  const loadSeason = async (seasonNumber, seasonName) => {
    if (!seriesUrl || !seasonNumber) return
    const base = seriesUrl.replace(/\/$/, '')
    const seasonUrl = `${base}/${seasonNumber}`
    const label = selectedTitle
      ? `${selectedTitle} · ${seasonName || seasonNumber}`
      : seasonName || seasonNumber
    await loadUrl(seasonUrl, label)
  }

  const handleCopy = async (value) => {
    if (!value) return
    try {
      await navigator.clipboard.writeText(value)
      setCopyNotice('Download URL copied.')
    } catch {
      setCopyNotice('Unable to copy — select the URL manually.')
    }
    window.setTimeout(() => setCopyNotice(''), 2200)
  }

  const rawGrouped = pageProps?.groupedSubtitles
  const groupedIsEmpty =
    !rawGrouped ||
    (Array.isArray(rawGrouped) && rawGrouped.length === 0) ||
    (typeof rawGrouped === 'object' && !Array.isArray(rawGrouped) && Object.keys(rawGrouped).length === 0)
  const seasons = pageProps?.movieInfo?.seasons || []
  const showSeasonPicker =
    groupedIsEmpty && (pageProps?.showSeasons || seasons.length > 0)
  const grouped =
    rawGrouped && !Array.isArray(rawGrouped) && typeof rawGrouped === 'object'
      ? rawGrouped
      : {}
  const languages = Object.keys(grouped)
  const items = useMemo(() => {
    if (languageFilter === 'all') {
      return Object.entries(grouped).flatMap(([lang, list]) =>
        (list || []).map((s) => ({ ...s, language: lang }))
      )
    }
    return grouped[languageFilter] || []
  }, [grouped, languageFilter])

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          className="drawer-backdrop"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.18 }}
          onClick={onClose}
        >
          <motion.aside
            className="drawer"
            initial={{ x: '100%' }}
            animate={{ x: 0 }}
            exit={{ x: '100%' }}
            transition={{ duration: 0.28, ease }}
            onClick={(e) => e.stopPropagation()}
            role="dialog"
            aria-modal="true"
            aria-label="Subtitles"
          >
            <header className="drawer-head">
              <div>
                <span className="drawer-eyebrow">Subtitles</span>
                <h2 className="drawer-title">{label || query}</h2>
              </div>
              <button
                className="modal-close"
                onClick={onClose}
                aria-label="Close"
              >
                ✕
              </button>
            </header>

            {!pageProps ? (
              <>
                <p className="drawer-sub">Pick a release to load subtitles.</p>
                {status === 'loading' ? <Spinner /> : null}
                {error ? <div className="alert alert--error">{error}</div> : null}
                <div className="subdl-results">
                  {results.map((r, i) => (
                    <button
                      key={`${r.link || r.name}-${i}`}
                      type="button"
                      className="subdl-result"
                      onClick={() => loadResult(r)}
                    >
                      <div className="subdl-poster">
                        {r.poster_url ? (
                          <img
                            src={r.poster_url}
                            alt=""
                            loading="lazy"
                            decoding="async"
                          />
                        ) : (
                          <div className="poster-fallback">
                            {(r.name || '?').slice(0, 1)}
                          </div>
                        )}
                      </div>
                      <div className="subdl-result-body">
                        <span className="subdl-result-title">{r.name}</span>
                        <span className="subdl-result-meta">
                          {r.year || '—'} · {r.type || 'title'}
                        </span>
                      </div>
                      <span className="subdl-result-cta">Open →</span>
                    </button>
                  ))}
                  {status === 'done' && results.length === 0 ? (
                    <div className="alert alert--muted">
                      No matches for “{query}”.
                    </div>
                  ) : null}
                </div>
              </>
            ) : (
              <div className="subs-block">
                <button
                  type="button"
                  className="btn-ghost"
                  onClick={() => {
                    setPageProps(null)
                    setSeriesUrl('')
                  }}
                >
                  ← Back to releases
                </button>
                <h3 className="subs-title">
                  {selectedTitle || pageProps?.movieInfo?.name}
                </h3>

                {showSeasonPicker ? (
                  <>
                    <p className="drawer-sub" style={{ padding: 0 }}>
                      Pick a season to load subtitles.
                    </p>
                    <div className="season-grid">
                      {seasons.map((s) => (
                        <button
                          key={s.number}
                          type="button"
                          className="season-tile"
                          onClick={() => loadSeason(s.number, s.name)}
                        >
                          {s.poster ? (
                            <img
                              src={s.poster}
                              alt=""
                              loading="lazy"
                              decoding="async"
                            />
                          ) : (
                            <div className="poster-fallback">
                              {(s.name || '?').slice(0, 1)}
                            </div>
                          )}
                          <span className="season-name">{s.name}</span>
                        </button>
                      ))}
                    </div>
                  </>
                ) : (
                  <div className="lang-row">
                    <button
                      type="button"
                      className={classNames(
                        'lang-chip',
                        languageFilter === 'all' && 'is-active'
                      )}
                      onClick={() => setLanguageFilter('all')}
                    >
                      All
                    </button>
                    {languages.map((lang) => (
                      <button
                        key={lang}
                        type="button"
                        className={classNames(
                          'lang-chip',
                          languageFilter === lang && 'is-active'
                        )}
                        onClick={() => setLanguageFilter(lang)}
                      >
                        {lang}
                      </button>
                    ))}
                  </div>
                )}

                {subStatus === 'loading' ? <Spinner /> : null}
                {subError ? (
                  <div className="alert alert--error">{subError}</div>
                ) : null}
                {copyNotice ? (
                  <div className="alert alert--success">{copyNotice}</div>
                ) : null}

                {!showSeasonPicker && items.length === 0 && subStatus === 'done' ? (
                  <div className="alert alert--muted">
                    No subtitles match this filter.
                  </div>
                ) : null}

                <div className="sub-list">
                  {items.map((s, i) => {
                    const dl = s.link
                      ? `https://dl.subdl.com/subtitle/${s.link}`
                      : ''
                    return (
                      <article
                        key={`${s.id}-${s.link}-${i}`}
                        className="sub-card"
                      >
                        <div className="sub-card-main">
                          <p className="sub-card-title">
                            {s.title || 'Untitled release'}
                          </p>
                          <div className="sub-tags">
                            <span>{s.language || '—'}</span>
                            <span>{s.quality || '—'}</span>
                            <span>{s.author || '—'}</span>
                          </div>
                          {s.comment ? (
                            <p className="sub-comment">{s.comment}</p>
                          ) : null}
                        </div>
                        <div className="sub-card-foot">
                          <span className="sub-stats">
                            ↓ {s.downloads ?? 0} ·{' '}
                            {s.date
                              ? new Date(s.date).toLocaleDateString()
                              : '—'}
                          </span>
                          <div className="sub-buttons">
                            <button
                              type="button"
                              className="btn-ghost"
                              onClick={() => handleCopy(dl)}
                              disabled={!dl}
                            >
                              Copy
                            </button>
                            {dl ? (
                              <a
                                className="btn-primary btn-sm"
                                href={dl}
                                target="_blank"
                                rel="noreferrer"
                              >
                                Download
                              </a>
                            ) : null}
                          </div>
                        </div>
                      </article>
                    )
                  })}
                </div>
              </div>
            )}
          </motion.aside>
        </motion.div>
      )}
    </AnimatePresence>
  )
}

export default function App() {
  const [home, setHome] = useState(null)
  const [homeStatus, setHomeStatus] = useState('idle')
  const [homeError, setHomeError] = useState('')
  const [search, setSearch] = useState('')
  const debouncedSearch = useDebounced(search, 350)
  const [searchResults, setSearchResults] = useState([])
  const [searchStatus, setSearchStatus] = useState('idle')
  const [selected, setSelected] = useState(null)
  const [subtitleTarget, setSubtitleTarget] = useState(null)
  const subSeq = useRef(0)

  useEffect(() => {
    let abort = false
    setHomeStatus('loading')
    setHomeError('')
    fetch(HOME_ENDPOINT)
      .then(async (r) => {
        const body = await r.json().catch(() => null)
        if (!r.ok) throw new Error(body?.error || `Failed (${r.status})`)
        return body
      })
      .then((body) => {
        if (abort) return
        setHome(body)
        setHomeStatus('done')
      })
      .catch((err) => {
        if (abort) return
        setHomeError(err.message || 'Failed to load')
        setHomeStatus('error')
      })
    return () => {
      abort = true
    }
  }, [])

  useEffect(() => {
    const q = debouncedSearch.trim()
    if (!q) {
      setSearchResults([])
      setSearchStatus('idle')
      return
    }
    let abort = false
    setSearchStatus('loading')
    fetch(`${SEARCH_ENDPOINT}${encodeURIComponent(q)}`)
      .then(async (r) => {
        const body = await r.json().catch(() => null)
        if (!r.ok) throw new Error(body?.error || `Failed (${r.status})`)
        return body
      })
      .then((body) => {
        if (abort) return
        const arr = Array.isArray(body?.results) ? body.results : []
        const filtered = arr.filter(
          (x) => x.media_type === 'movie' || x.media_type === 'tv'
        )
        setSearchResults(filtered)
        setSearchStatus('done')
      })
      .catch(() => {
        if (abort) return
        setSearchStatus('error')
      })
    return () => {
      abort = true
    }
  }, [debouncedSearch])

  const trending = home?.trending?.ok ? home.trending.data?.results || [] : []
  const popularMovies = home?.popularMovies?.ok
    ? home.popularMovies.data?.results || []
    : []
  const topRated = home?.topRated?.ok ? home.topRated.data?.results || [] : []
  const popularTv = home?.popularTv?.ok
    ? home.popularTv.data?.results || []
    : []
  const movieGenres = home?.movieGenres?.ok
    ? home.movieGenres.data?.genres || []
    : []
  const tvGenres = home?.tvGenres?.ok ? home.tvGenres.data?.genres || [] : []

  const featured = useMemo(
    () => trending.find((t) => t.backdrop_path) || null,
    [trending]
  )

  const openSubtitles = (target) => {
    subSeq.current += 1
    if (typeof target === 'string') {
      setSubtitleTarget({ label: target, query: target })
    } else {
      setSubtitleTarget(target)
    }
  }

  return (
    <div className="app">
      <header className="topbar">
        <div className="topbar-inner">
          <a className="brand" href="#top">
            <span className="brand-mark">◇</span>
            <span className="brand-name">subme</span>
          </a>
          <nav className="nav">
            <a href="#trending">Trending</a>
            <a href="#movies">Movies</a>
            <a href="#tv">TV</a>
            <a href="#genres">Genres</a>
          </nav>
        </div>
      </header>

      <main className="main" id="top">
        <section className="hero">
          {featured?.backdrop_path ? (
            <div className="hero-cover" aria-hidden>
              <picture>
                <source
                  media="(min-width: 1100px)"
                  srcSet={backdropUrl(featured.backdrop_path, 'original')}
                />
                <source
                  media="(min-width: 700px)"
                  srcSet={backdropUrl(featured.backdrop_path, 'w1280')}
                />
                <img
                  src={backdropUrl(featured.backdrop_path, 'w780')}
                  alt=""
                  decoding="async"
                  fetchpriority="high"
                />
              </picture>
              <div className="hero-shade" />
            </div>
          ) : null}
          <motion.div
            className="hero-inner"
            initial={{ opacity: 0, y: 14 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.45, ease }}
          >
            <span className="hero-eyebrow">Movies · TV · Subtitles</span>
            <h1 className="hero-title">
              Find what to watch.
              <br />
              <span className="grad">Then grab the subtitles.</span>
            </h1>
            <p className="hero-sub">
              Browse trending films and shows, dive into details, and pull
              subtitles for any release in one click.
            </p>

            <div className="search-wrap">
              <div className="search-shell">
                <svg viewBox="0 0 24 24" width="18" height="18" aria-hidden>
                  <path
                    fill="currentColor"
                    d="M10 2a8 8 0 015.3 13.94l4.88 4.88a1 1 0 01-1.42 1.42l-4.88-4.88A8 8 0 1110 2zm0 2a6 6 0 100 12 6 6 0 000-12z"
                  />
                </svg>
                <input
                  type="search"
                  className="search-input"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder="Search any movie or TV show…"
                  aria-label="Search movies and TV"
                />
                {search ? (
                  <button
                    type="button"
                    className="search-clear"
                    onClick={() => setSearch('')}
                    aria-label="Clear search"
                  >
                    ✕
                  </button>
                ) : null}
              </div>
              <div className="hero-shortcuts">
                {featured ? (
                  <button
                    type="button"
                    className="hero-cta"
                    onClick={() => setSelected(featured)}
                  >
                    Open “{titleOf(featured)}”
                  </button>
                ) : null}
                <span className="hero-hint">Esc to close · ↵ to open</span>
              </div>
            </div>
          </motion.div>
        </section>

        {search ? (
          <section className="search-results">
            <header className="row-head">
              <h2 className="row-title">Search · “{search}”</h2>
              <span className="row-hint">
                {searchStatus === 'loading'
                  ? 'searching…'
                  : `${searchResults.length} result${searchResults.length === 1 ? '' : 's'}`}
              </span>
            </header>
            {searchStatus === 'loading' ? <Spinner /> : null}
            {searchStatus === 'done' && searchResults.length === 0 ? (
              <div className="alert alert--muted">
                Nothing found. Try another query.
              </div>
            ) : null}
            <div className="grid">
              {searchResults.slice(0, 24).map((r, i) => (
                <PosterCard
                  key={`s-${r.id}-${i}`}
                  item={r}
                  onClick={() => setSelected(r)}
                />
              ))}
            </div>
          </section>
        ) : null}

        {homeError ? (
          <div className="alert alert--error">
            Failed to load home: {homeError}
          </div>
        ) : null}
        {homeStatus === 'loading' && !home ? <Spinner /> : null}

        {!search ? (
          <CoverStrip items={trending.slice(1)} onPick={setSelected} />
        ) : null}

        <div id="trending">
          <Row title="Trending this week" items={trending} onPick={setSelected} />
        </div>
        <div id="movies">
          <Row title="Popular movies" items={popularMovies} onPick={setSelected} />
        </div>
        <div>
          <Row title="Top rated" items={topRated} onPick={setSelected} />
        </div>
        <div id="tv">
          <Row title="Popular TV" items={popularTv} onPick={setSelected} />
        </div>
        <div id="genres">
          <GenrePills
            movieGenres={movieGenres}
            tvGenres={tvGenres}
            onPick={(name) => setSearch(name)}
          />
        </div>

        <footer className="footer">
          <span>subme</span>
          <span>made for late-night watching</span>
        </footer>
      </main>

      <DetailModal
        open={!!selected}
        item={selected}
        onClose={() => setSelected(null)}
        onWantSubtitles={openSubtitles}
      />

      <SubtitleDrawer
        open={!!subtitleTarget}
        label={subtitleTarget?.label}
        query={subtitleTarget?.query}
        onClose={() => setSubtitleTarget(null)}
      />
    </div>
  )
}
