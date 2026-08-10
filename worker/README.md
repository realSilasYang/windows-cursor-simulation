# Public site statistics Worker

This Worker exposes only the cumulative page-view count from Cloudflare Web Analytics. The count starts at the site's analytics launch date. The Cloudflare Analytics API token remains encrypted as a Worker secret and is never sent to the website.

Required secrets:

```powershell
npx wrangler secret put CF_ANALYTICS_TOKEN
```

Create `CF_ANALYTICS_TOKEN` with only `Account → Account Analytics → Read` access, restricted to the account that owns the Web Analytics site.

`CF_RUM_SITE_TAG` is the `siteTag` dimension returned by `rumPageloadEventsAdaptiveGroups`. It is not the public beacon token embedded in the page.

Deploy:

```powershell
npm install
npm test
npm run deploy
```

The public endpoint is `https://<worker-host>/stats`. Responses use a one-minute shared cache, are not retained by browsers, and restrict CORS to the production site and local preview origins. Cloudflare Web Analytics ingestion may add a short delay before a new page view appears.
