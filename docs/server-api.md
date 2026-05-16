# Subme — server HTTP API

Base URL (local default): `http://127.0.0.1:3001`  
Upstream movie data: **[IMDbAPI](https://imdbapi.dev/)** (`https://api.imdbapi.dev`, overridable with `IMDBAPI_BASE_URL`).

---

## This server (subtitles backend)

| Method | Path | Description |
|--------|------|-------------|
| GET | `/api` | JSON index of routes and pointers to this doc and IMDbAPI. |
| GET | `/api/home` | **Home bundle**: popular titles, IMDb star meter sample, browse interests preview, optional spotlight title search (wraps several upstream calls). |
| GET | `/api/movies` | Proxy to IMDbAPI `GET /titles`. Query string passed through (`pageSize`, `pageToken`, filters, etc.). |
| GET | `/api/movies/search` | Proxy to `GET /search/titles`. Requires `q` or `query` (mapped to upstream `query`). |
| GET | `/api/movies/interests` | Proxy to `GET /interests`. |
| GET | `/api/movies/:id` | Proxy to `GET /titles/{titleId}`. Accepts `tt…` or numeric IMDb id. |
| GET | `/api/search` | SubDL subtitle search (not IMDbAPI). Query: `q`. |
| GET | `/api/subtitles` | SubDL page scrape. Query: `url` (subdl.com only). |

### `GET /api/home`

Single response for a dashboard / home screen. Runs multiple upstream requests (respects `IMDBAPI_MAX_CONCURRENT` and retry settings in `server/imdbApiClient.js`).

| Query | Default | Description |
|-------|---------|-------------|
| `titlesLimit` | `12` | `pageSize` for popular titles (`GET /titles`). |
| `namesLimit` | `8` | `pageSize` for star meter (`GET /chart/starmeter`). |
| `interestCategories` | `6` | Max number of top-level interest **categories** returned (each category still lists its interests from upstream). |
| `spotlight` | _(empty)_ | If set, adds a `GET /search/titles` call with this string as `query`. |

Response shape (each section is either `{ ok: true, data: … }` or `{ ok: false, status, data }`):

- `popularTitles` — from `GET /titles`
- `starMeter` — from `GET /chart/starmeter`
- `browseInterests` — from `GET /interests` (categories array may be truncated)
- `spotlightTitles` — present only if `spotlight` was non-empty; from `GET /search/titles`

---

## Upstream: IMDbAPI (`api.imdbapi.dev`)

Official docs / OpenAPI: **[imdbapi.dev](https://imdbapi.dev/)** (base URL `https://api.imdbapi.dev`).

### Title

| Upstream | Description |
|----------|-------------|
| `GET /titles` | List titles (cursor / `pageToken`, filters, sort). |
| `GET /titles/{titleId}` | Title by id (`tt…`). |
| `GET /titles:batchGet` | Batch titles by ids. |
| `GET /titles/{titleId}/credits` | Credits. |
| `GET /titles/{titleId}/releaseDates` | Release dates. |
| `GET /titles/{titleId}/akas` | Alternative titles. |
| `GET /titles/{titleId}/seasons` | Seasons (series). |
| `GET /titles/{titleId}/episodes` | Episodes. |
| `GET /titles/{titleId}/images` | Images. |
| `GET /titles/{titleId}/videos` | Videos. |
| `GET /titles/{titleId}/awardNominations` | Award nominations. |
| `GET /titles/{titleId}/parentsGuide` | Parents guide. |
| `GET /titles/{titleId}/certificates` | Certificates. |
| `GET /titles/{titleId}/companyCredits` | Company credits. |
| `GET /titles/{titleId}/boxOffice` | Box office. |

### Search

| Upstream | Description |
|----------|-------------|
| `GET /search/titles` | Search titles; query param `query` (min length 1). |

### Name

| Upstream | Description |
|----------|-------------|
| `GET /names/{nameId}` | Person by id (`nm…`). |
| `GET /names/{nameId}/images` | Person images. |
| `GET /names/{nameId}/filmography` | Filmography. |
| `GET /names/{nameId}/relationships` | Relationships. |
| `GET /names/{nameId}/trivia` | Trivia. |
| `GET /names:batchGet` | Batch names. |

### Chart

| Upstream | Description |
|----------|-------------|
| `GET /chart/starmeter` | IMDb STARmeter-style rankings. |

### Interest (browse / genre-style)

| Upstream | Description |
|----------|-------------|
| `GET /interests` | Interest categories and interests. |
| `GET /interests/{interestId}` | Single interest. |

---

## Environment (IMDb proxy)

| Variable | Default | Purpose |
|----------|---------|---------|
| `IMDBAPI_BASE_URL` | `https://api.imdbapi.dev` | Upstream base URL. |
| `IMDBAPI_MAX_CONCURRENT` | `3` | Limits parallel upstream calls per process. |
| `IMDBAPI_MAX_RETRIES` | `5` | Retries on `429` / `503`. |
| `IMDBAPI_RETRY_BASE_MS` | `400` | Backoff base + jitter. |
