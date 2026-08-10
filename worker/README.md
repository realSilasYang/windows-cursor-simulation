# Public page-view counter Worker

This Worker exposes the cumulative page-view count shown in the site footer. A Durable Object stores one integer only: no IP address, user agent, cookie, or page content is retained. `INITIAL_TOTAL_PAGE_VIEWS` preserves the count that existed before the counter was made immediate.

Endpoints:

- `POST /pageview` records one page load and returns the new total. The request must come from an origin listed in `ALLOWED_ORIGINS`.
- `GET /stats` returns the current total and is safe to poll from the site.

Cloudflare Web Analytics remains enabled separately for anonymous aggregate analysis. It is not used as the live footer counter, because RUM data can arrive later than the page load and its GraphQL result can be cached at the edge.

Deploy:

```powershell
npm install
npm test
npm run deploy
```

The public endpoint is `https://<worker-host>/stats`. Both endpoints return `Cache-Control: no-store`; the page-view request is deliberately a `POST` so ordinary browser caching and speculative prefetching cannot create stale or accidental counts.
