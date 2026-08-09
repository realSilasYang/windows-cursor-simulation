import assert from "node:assert/strict";
import test from "node:test";
import { buildVariables, normalizeStats } from "../src/index.js";

test("buildVariables creates a cumulative window from launch", () => {
  const now = new Date("2026-08-09T12:00:00.000Z");
  const variables = buildVariables(now, {
    CF_ACCOUNT_ID: "account-id",
    CF_SITE_TAG: "site-tag"
  });

  assert.equal(variables.accountTag, "account-id");
  assert.deepEqual(variables.totalFilter, {
    siteTag: "site-tag",
    datetime_geq: "2026-08-09T00:00:00.000Z",
    datetime_lt: "2026-08-09T12:00:00.000Z"
  });
});

test("normalizeStats returns only the cumulative visit count", () => {
  const generatedAt = new Date("2026-08-09T12:00:00.000Z");
  const result = normalizeStats({
    data: {
      viewer: {
        accounts: [{
          total: [{ sum: { visits: 31.7 } }]
        }]
      }
    }
  }, generatedAt);

  assert.deepEqual(result, {
    generatedAt: "2026-08-09T12:00:00.000Z",
    since: "2026-08-09T00:00:00.000Z",
    totalVisits: 32
  });
});

test("normalizeStats rejects GraphQL errors", () => {
  assert.throws(
    () => normalizeStats({ errors: [{ message: "denied" }] }, new Date()),
    /query failed/
  );
});
