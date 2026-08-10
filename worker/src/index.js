export const COUNTER_STORAGE_KEY = "totalPageViews";
export const DEFAULT_INITIAL_TOTAL = 0;

function parseInitialTotal(value) {
  const total = Number(value);
  return Number.isSafeInteger(total) && total >= 0 ? total : DEFAULT_INITIAL_TOTAL;
}

function allowedOrigins(env) {
  return new Set(
    String(env.ALLOWED_ORIGINS || "")
      .split(",")
      .map((value) => value.trim())
      .filter(Boolean)
  );
}

function corsOrigin(request, env) {
  const origin = request.headers.get("Origin") || "";
  return allowedOrigins(env).has(origin) ? origin : "";
}

function responseHeaders(origin) {
  const headers = new Headers({
    "Content-Type": "application/json; charset=utf-8",
    "X-Content-Type-Options": "nosniff",
    "Referrer-Policy": "no-referrer",
    "Cache-Control": "no-store"
  });
  if (origin) {
    headers.set("Access-Control-Allow-Origin", origin);
    headers.set("Vary", "Origin");
  }
  return headers;
}

function json(body, status, origin) {
  return new Response(JSON.stringify(body), {
    status,
    headers: responseHeaders(origin)
  });
}

export class PageViewCounter {
  constructor(state, env) {
    this.state = state;
    this.initialTotal = parseInitialTotal(env.INITIAL_TOTAL_PAGE_VIEWS);
  }

  async currentTotal(storage = this.state.storage) {
    const stored = await storage.get(COUNTER_STORAGE_KEY);
    return Number.isSafeInteger(stored) && stored >= 0 ? stored : this.initialTotal;
  }

  async increment() {
    return this.state.storage.transaction(async (storage) => {
      const next = (await this.currentTotal(storage)) + 1;
      await storage.put(COUNTER_STORAGE_KEY, next);
      return next;
    });
  }

  async fetch(request) {
    const url = new URL(request.url);
    if (url.pathname === "/stats" && request.method === "GET") {
      return json({ totalPageViews: await this.currentTotal() }, 200, "");
    }
    if (url.pathname === "/pageview" && request.method === "POST") {
      return json({ totalPageViews: await this.increment() }, 200, "");
    }
    return json({ error: "Not found" }, 404, "");
  }
}

async function counterRequest(env, path, method) {
  const id = env.PAGE_VIEW_COUNTER.idFromName("public-total-page-views");
  const stub = env.PAGE_VIEW_COUNTER.get(id);
  const response = await stub.fetch(`https://counter.invalid${path}`, { method });
  if (!response.ok) throw new Error(`Page-view counter returned HTTP ${response.status}`);
  const payload = await response.json();
  if (!Number.isSafeInteger(payload.totalPageViews) || payload.totalPageViews < 0) {
    throw new Error("Page-view counter returned an invalid total");
  }
  return payload.totalPageViews;
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    const origin = corsOrigin(request, env);

    if (request.method === "OPTIONS") {
      if (!origin) return json({ error: "Origin not allowed" }, 403, "");
      const headers = responseHeaders(origin);
      headers.set("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
      headers.set("Access-Control-Allow-Headers", "Content-Type");
      return new Response(null, { status: 204, headers });
    }

    if (url.pathname === "/stats") {
      if (request.method !== "GET") return json({ error: "Method not allowed" }, 405, origin);
    } else if (url.pathname === "/pageview") {
      if (request.method !== "POST") return json({ error: "Method not allowed" }, 405, origin);
      if (!origin) return json({ error: "Origin not allowed" }, 403, "");
    } else {
      return json({ error: "Not found" }, 404, origin);
    }

    if (!env.PAGE_VIEW_COUNTER) return json({ error: "Statistics are not configured" }, 503, origin);

    try {
      const totalPageViews = await counterRequest(env, url.pathname, request.method);
      return json({
        generatedAt: new Date().toISOString(),
        totalPageViews
      }, 200, origin);
    } catch {
      return json({ error: "Statistics are temporarily unavailable" }, 502, origin);
    }
  }
};
