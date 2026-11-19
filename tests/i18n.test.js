import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { catalogPaths, formatMessage, languageChoice, resolveLanguage } from "../extension/i18n.js";

const source = (path) => readFileSync(new URL(`../extension/${path}`, import.meta.url), "utf8");
const catalog = (language) => JSON.parse(source(catalogPaths[language]));

test("follows Chrome's UI locale, with English as the fallback", () => {
  for (const locale of ["zh", "zh-CN", "zh_CN", "zh-Hans-SG"]) {
    assert.equal(resolveLanguage("auto", locale), "zh-CN");
  }
  for (const locale of ["en-GB", "fr-FR", "zh-TW", "", undefined]) {
    assert.equal(resolveLanguage("auto", locale), "en");
  }
});

test("manual language selection overrides Chrome's locale", () => {
  assert.equal(resolveLanguage("en", "zh-CN"), "en");
  assert.equal(resolveLanguage("zh-CN", "en-US"), "zh-CN");
  assert.equal(languageChoice("constructor"), "auto");
  assert.equal(languageChoice(null), "auto");
});

test("both catalogs cover the viewer and manifest, with matching template arguments", () => {
  const en = catalog("en");
  const zh = catalog("zh-CN");
  assert.deepEqual(Object.keys(en).sort(), Object.keys(zh).sort());
  const tokens = (message) => Array.from(message.matchAll(/\{[a-z_]+\}/g), ([m]) => m).sort();
  for (const [key, entry] of Object.entries(en)) {
    assert.ok(entry.message && zh[key].message, key);
    assert.deepEqual(tokens(entry.message), tokens(zh[key].message), key);
  }
  for (const [, key] of source("review.html").matchAll(/data-message="([a-z_]+)"/g)) assert.ok(en[key], key);
  for (const [, key] of source("manifest.json").matchAll(/__MSG_([a-z_]+)__/g)) assert.ok(en[key], key);
  for (const [, key] of source("review.js").matchAll(/\bt\("([a-z_]+)"/g)) assert.ok(en[key], key);
  assert.ok(en.description.message.length <= 132);
  assert.ok(zh.description.message.length <= 132);
});

test("interpolates counts and HTTP status for both locales", () => {
  const values = { total: 9, open: 4, resolved: 5, messages: 12 };
  assert.equal(formatMessage(catalog("en"), "counts", values), "Threads: 9 (4 open, 5 resolved). Messages read: 12.");
  assert.equal(formatMessage(catalog("zh-CN"), "counts", values), "9 个讨论（4 个未解决、5 个已解决），读到 12 条正文。");
  assert.match(formatMessage(catalog("en"), "error_http", { status: 502 }), /HTTP 502/);
});
