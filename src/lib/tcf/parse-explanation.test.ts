import { test } from "node:test";
import assert from "node:assert/strict";

import { parseExplanationFile, expectedFileName } from "./parse-explanation";

const SAMPLE = `---
test: 1
skill: reading
question: 5
written: 2026-08-13
---

## 全文翻译

**Question** — What is Elsa's nationality?

**Options** — A. Canadian · B. Spanish · C. Italian · D. Mexican

## 题干

Quelle est la nationalité d'Elsa ?

**答案：B**
`;

test("parses the frontmatter locator", () => {
  const p = parseExplanationFile(SAMPLE);
  assert.equal(p.test, 1);
  assert.equal(p.skill, "reading");
  assert.equal(p.question, 5);
});

test("body starts after the frontmatter and keeps the whole explanation", () => {
  const p = parseExplanationFile(SAMPLE);
  assert.ok(p.body.startsWith("## 全文翻译"));
  assert.ok(p.body.includes("**答案：B**"));
  assert.ok(!p.body.includes("written:"));
});

test("extracts the 全文翻译 section, stopping at the next heading", () => {
  const p = parseExplanationFile(SAMPLE);
  assert.ok(p.translationEn !== null);
  assert.ok(p.translationEn.startsWith("**Question**"));
  assert.ok(p.translationEn.includes("D. Mexican"));
  assert.ok(!p.translationEn.includes("题干"));
});

test("translationEn is null when the section is absent", () => {
  const raw = `---
test: 2
skill: listening
question: 30
written: 2026-08-13
---

## 题干

Rien à traduire.
`;
  assert.equal(parseExplanationFile(raw).translationEn, null);
});

test("throws when frontmatter is missing", () => {
  assert.throws(() => parseExplanationFile("## 题干\nfoo\n"), /frontmatter/i);
});

test("throws on an unknown skill", () => {
  const raw = `---
test: 1
skill: speaking
question: 5
written: 2026-08-13
---

## 题干
foo
`;
  assert.throws(() => parseExplanationFile(raw), /skill/i);
});

test("throws when a locator field is missing", () => {
  const raw = `---
test: 1
skill: reading
written: 2026-08-13
---

## 题干
foo
`;
  assert.throws(() => parseExplanationFile(raw), /question/i);
});

test("expectedFileName builds the CE/CO convention", () => {
  assert.equal(expectedFileName({ test: 1, skill: "reading", question: 5 }), "CE-T1-Q5.md");
  assert.equal(expectedFileName({ test: 13, skill: "listening", question: 30 }), "CO-T13-Q30.md");
});
