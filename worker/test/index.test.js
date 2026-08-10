import assert from "node:assert/strict";
import test from "node:test";
import { COUNTER_STORAGE_KEY, PageViewCounter } from "../src/index.js";

function createState(initialEntries = []) {
  const values = new Map(initialEntries);
  const storage = {
    async get(key) {
      return values.get(key);
    },
    async put(key, value) {
      values.set(key, value);
    },
    async transaction(callback) {
      return callback(storage);
    }
  };
  return { storage, values };
}

test("counter starts at the configured historical total", async () => {
  const state = createState();
  const counter = new PageViewCounter(state, { INITIAL_TOTAL_PAGE_VIEWS: "18" });
  const response = await counter.fetch(new Request("https://counter.invalid/stats"));

  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), { totalPageViews: 18 });
});

test("page-view requests increment and persist the total", async () => {
  const state = createState();
  const counter = new PageViewCounter(state, { INITIAL_TOTAL_PAGE_VIEWS: "18" });
  const first = await counter.fetch(new Request("https://counter.invalid/pageview", { method: "POST" }));
  const second = await counter.fetch(new Request("https://counter.invalid/pageview", { method: "POST" }));

  assert.deepEqual(await first.json(), { totalPageViews: 19 });
  assert.deepEqual(await second.json(), { totalPageViews: 20 });
  assert.equal(state.values.get(COUNTER_STORAGE_KEY), 20);
});

test("stored totals take precedence over the historical baseline", async () => {
  const state = createState([[COUNTER_STORAGE_KEY, 41]]);
  const counter = new PageViewCounter(state, { INITIAL_TOTAL_PAGE_VIEWS: "18" });
  const response = await counter.fetch(new Request("https://counter.invalid/pageview", { method: "POST" }));

  assert.deepEqual(await response.json(), { totalPageViews: 42 });
});

test("invalid historical totals fall back to zero", async () => {
  const state = createState();
  const counter = new PageViewCounter(state, { INITIAL_TOTAL_PAGE_VIEWS: "invalid" });
  const response = await counter.fetch(new Request("https://counter.invalid/stats"));

  assert.deepEqual(await response.json(), { totalPageViews: 0 });
});

test("unknown counter routes return 404", async () => {
  const counter = new PageViewCounter(createState(), { INITIAL_TOTAL_PAGE_VIEWS: "18" });
  const response = await counter.fetch(new Request("https://counter.invalid/unknown"));

  assert.equal(response.status, 404);
});
