# Subtitle Link Extractor

A small React frontend that fetches a subtitle page, parses anchor tags, and filters links whose text includes "Download" or whose href includes "download" or "subtitle".

## Run locally

1. Install dependencies:

	npm install

2. Start the dev server:

	npm run dev

## Notes

- Direct fetches to third-party subtitle sites may fail due to CORS.
- Toggle the proxy option to call `/api/fetch?url=...` if you add a proxy endpoint.
- Search uses `https://api3.subdl.com/auto?query=...` and returns JSON results.
