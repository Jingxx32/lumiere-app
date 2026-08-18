import { test } from "node:test";
import assert from "node:assert/strict";

import { resolveExplanationLocator } from "./explanation-locator";
import type { ExplanationLocator } from "./parse-explanation";

const BODY: ExplanationLocator = { test: 1, skill: "reading", question: 5 };
const params = (qs: string) => new URLSearchParams(qs);

test("uses the frontmatter locator when the URL names none", () => {
  const r = resolveExplanationLocator(BODY, params(""));
  assert.deepEqual(r, { ok: true, locator: BODY });
});

test("uses the URL locator when the body has no frontmatter", () => {
  const r = resolveExplanationLocator(null, params("test=2&skill=listening&q=30"));
  assert.deepEqual(r, {
    ok: true,
    locator: { test: 2, skill: "listening", question: 30 },
  });
});

test("accepts both when they agree", () => {
  const r = resolveExplanationLocator(BODY, params("test=1&skill=reading&q=5"));
  assert.deepEqual(r, { ok: true, locator: BODY });
});

test("refuses to guess when frontmatter and URL disagree", () => {
  const r = resolveExplanationLocator(BODY, params("test=1&skill=reading&q=6"));
  assert.deepEqual(r, { ok: false, error: "locator_conflict" });
});

test("reports a missing locator when neither side names one", () => {
  const r = resolveExplanationLocator(null, params(""));
  assert.deepEqual(r, { ok: false, error: "locator_missing" });
});

test("rejects a partial URL locator", () => {
  const r = resolveExplanationLocator(null, params("test=2&skill=listening"));
  assert.deepEqual(r, { ok: false, error: "invalid_query" });
});

test("rejects an unknown skill in the URL", () => {
  const r = resolveExplanationLocator(null, params("test=2&skill=speaking&q=3"));
  assert.deepEqual(r, { ok: false, error: "invalid_query" });
});

test("rejects a non-numeric or non-positive number in the URL", () => {
  assert.deepEqual(resolveExplanationLocator(null, params("test=abc&skill=reading&q=5")), {
    ok: false,
    error: "invalid_query",
  });
  assert.deepEqual(resolveExplanationLocator(null, params("test=0&skill=reading&q=5")), {
    ok: false,
    error: "invalid_query",
  });
  assert.deepEqual(resolveExplanationLocator(null, params("test=1&skill=reading&q=1.5")), {
    ok: false,
    error: "invalid_query",
  });
});

test("a malformed URL locator loses even when frontmatter is valid", () => {
  const r = resolveExplanationLocator(BODY, params("test=1&skill=reading"));
  assert.deepEqual(r, { ok: false, error: "invalid_query" });
});
