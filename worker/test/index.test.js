import assert from "node:assert/strict";
import test from "node:test";
import { CACHE_TTL_SECONDS, STATS_QUERY, buildVariables, normalizeStats } from "../src/index.js";

test("shared statistics cache refreshes every minute", () => {
  assert.equal(CACHE_TTL_SECONDS, 60);
});

test("query requests page views without visit totals", () => {
  assert.match(STATS_QUERY, /rumPageloadEventsAdaptiveGroups[\s\S]*\bcount\b/);
  assert.doesNotMatch(STATS_QUERY, /sum\s*\{\s*visits/);
});

test("buildVariables creates a cumulative window from launch", () => {
  const now = new Date("2026-08-09T12:00:00.000Z");
  const variables = buildVariables(now, {
    CF_ACCOUNT_ID: "account-id",
    CF_RUM_SITE_TAG: "rum-site-tag"
  });

  assert.equal(variables.accountTag, "account-id");
  assert.deepEqual(variables.totalFilter, {
    siteTag: "rum-site-tag",
    datetime_geq: "2026-08-09T00:00:00.000Z",
    datetime_lt: "2026-08-09T12:00:00.000Z"
  });
});

test("normalizeStats returns only the cumulative page-view count", () => {
  const generatedAt = new Date("2026-08-09T12:00:00.000Z");
  const result = normalizeStats({
    data: {
      viewer: {
        accounts: [{
          total: [{ count: 20 }, { count: 12 }]
        }]
      }
    }
  }, generatedAt);

  assert.deepEqual(result, {
    generatedAt: "2026-08-09T12:00:00.000Z",
    since: "2026-08-09T00:00:00.000Z",
    totalPageViews: 32
  });
});

test("normalizeStats rejects GraphQL errors", () => {
  assert.throws(
    () => normalizeStats({ errors: [{ message: "denied" }] }, new Date()),
    /query failed/
  );
});
