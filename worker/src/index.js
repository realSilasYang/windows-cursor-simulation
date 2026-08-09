const CLOUDFLARE_GRAPHQL = "https://api.cloudflare.com/client/v4/graphql";
const CACHE_TTL_SECONDS = 600;
const STATS_START = "2026-08-09T00:00:00.000Z";

const STATS_QUERY = `
  query PublicTotalVisits(
    $accountTag: string!
    $totalFilter: AccountRumPageloadEventsAdaptiveGroupsFilter_InputObject!
  ) {
    viewer {
      accounts(filter: { accountTag: $accountTag }) {
        total: rumPageloadEventsAdaptiveGroups(limit: 1, filter: $totalFilter) {
          sum { visits }
        }
      }
    }
  }
`;

function corsOrigin(request, env) {
  const origin = request.headers.get("Origin") || "";
  const allowed = new Set(String(env.ALLOWED_ORIGINS || "").split(",").map((value) => value.trim()).filter(Boolean));
  return allowed.has(origin) ? origin : "";
}

function responseHeaders(origin, cacheable = false) {
  const headers = new Headers({
    "Content-Type": "application/json; charset=utf-8",
    "X-Content-Type-Options": "nosniff",
    "Referrer-Policy": "no-referrer",
    "Cache-Control": cacheable
      ? `public, max-age=300, s-maxage=${CACHE_TTL_SECONDS}, stale-while-revalidate=60`
      : "no-store"
  });
  if (origin) {
    headers.set("Access-Control-Allow-Origin", origin);
    headers.set("Vary", "Origin");
  }
  return headers;
}

function json(body, status, origin, cacheable = false) {
  return new Response(JSON.stringify(body), {
    status,
    headers: responseHeaders(origin, cacheable)
  });
}

export function buildVariables(now, env) {
  return {
    accountTag: env.CF_ACCOUNT_ID,
    totalFilter: {
      siteTag: env.CF_SITE_TAG,
      datetime_geq: STATS_START,
      datetime_lt: now.toISOString()
    }
  };
}

function sumVisits(groups = []) {
  return Math.round(groups.reduce((total, group) => total + (group.sum?.visits || 0), 0));
}

export function normalizeStats(payload, generatedAt) {
  if (payload.errors?.length) throw new Error("Cloudflare Analytics query failed");
  const account = payload.data?.viewer?.accounts?.[0];
  if (!account) throw new Error("Cloudflare Analytics returned no account data");

  return {
    generatedAt: generatedAt.toISOString(),
    since: STATS_START,
    totalVisits: sumVisits(account.total)
  };
}

async function queryStats(env, now) {
  const response = await fetch(CLOUDFLARE_GRAPHQL, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${env.CF_ANALYTICS_TOKEN}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      query: STATS_QUERY,
      variables: buildVariables(now, env)
    })
  });

  if (!response.ok) throw new Error(`Cloudflare Analytics returned HTTP ${response.status}`);
  return normalizeStats(await response.json(), now);
}

export default {
  async fetch(request, env, context) {
    const url = new URL(request.url);
    const origin = corsOrigin(request, env);

    if (request.method === "OPTIONS") {
      const headers = responseHeaders(origin);
      headers.set("Access-Control-Allow-Methods", "GET, OPTIONS");
      headers.set("Access-Control-Allow-Headers", "Content-Type");
      return new Response(null, { status: 204, headers });
    }
    if (url.pathname !== "/stats") return json({ error: "Not found" }, 404, origin);
    if (request.method !== "GET") return json({ error: "Method not allowed" }, 405, origin);
    if (!env.CF_ACCOUNT_ID || !env.CF_ANALYTICS_TOKEN || !env.CF_SITE_TAG) {
      return json({ error: "Statistics are not configured" }, 503, origin);
    }

    const cache = caches.default;
    const cacheKey = new Request(`${url.origin}/stats`, { method: "GET" });
    const cached = await cache.match(cacheKey);
    if (cached) {
      const response = new Response(cached.body, cached);
      if (origin) {
        response.headers.set("Access-Control-Allow-Origin", origin);
        response.headers.set("Vary", "Origin");
      }
      return response;
    }

    try {
      const stats = await queryStats(env, new Date());
      const response = json(stats, 200, origin, true);
      context.waitUntil(cache.put(cacheKey, response.clone()));
      return response;
    } catch {
      return json({ error: "Statistics are temporarily unavailable" }, 502, origin);
    }
  }
};
