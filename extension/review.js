import { readFromEditor } from "./client.js";
import { buildSnapshot, filterThreads, readTarget } from "./core.js";
import { catalogPaths, formatMessage, languageChoice, resolveLanguage } from "./i18n.js";

const $ = (id) => document.getElementById(id);
const target = readTarget(location.hash);
const refresh = $("refresh");
const download = $("export");
const quoteToggle = $("include-quotes");
const threadList = $("threads");
const languageSelect = $("language");
const languageKey = "overleaf-review-reader.language";
const consentKey = "overleaf-review-reader.read-consent-v1";
const catalogs = {};
let language = "en";
let phase = "ready";
let snapshot = null;
let failure = null;
let mayRead = readPreference(consentKey) === "yes";

function readPreference(key) {
  try { return localStorage.getItem(key); }
  catch { return null; }
}

function remember(key, value) {
  try { localStorage.setItem(key, value); }
  catch { /* The current tab still works if storage is blocked. */ }
}

const t = (key, values) => formatMessage(catalogs[language], key, values);

function element(tag, text, className) {
  const el = document.createElement(tag);
  el.textContent = text;
  if (className) el.className = className;
  return el;
}

function notice(text, warning = false) {
  $("notice").textContent = text;
  $("notice").classList.toggle("warning", warning);
}

function formatDate(timestamp) {
  if (timestamp === null) return "";
  const date = new Date(timestamp);
  return Number.isNaN(date.getTime()) ? timestamp : date.toLocaleString(language);
}

function showThreads() {
  threadList.replaceChildren();
  if (!snapshot?.threads.length) return;

  const visible = filterThreads(snapshot.threads, $("status").value, $("query").value);
  if (!visible.length) {
    threadList.append(element("p", t("no_matches")));
    return;
  }

  const fragment = document.createDocumentFragment();
  for (const thread of visible) {
    const card = element("article", "", "thread");
    card.append(element("div", t(thread.status), "status-label"));
    const list = element("ol", "", "list");
    thread.messages.forEach((message, index) => {
      const item = element("li", "", index === 0 ? "message" : "message reply");
      const heading = [
        t(index === 0 ? "comment" : "reply"),
        message.author ?? t("unknown_author"),
        formatDate(message.timestamp)
      ].filter(Boolean).join(" · ");
      item.append(
        element("div", heading, "metadata"),
        message.body !== null
          ? element("p", message.body, "body")
          : element("p", t(message.body_status === "unsupported" ? "unsupported_body" : "missing_body"), "body warning")
      );
      list.append(item);
    });
    card.append(thread.messages.length ? list : element("p", t("missing_messages"), "warning"));

    const quotes = [...new Set(thread.anchors.map((anchor) => anchor.quoted_text).filter(Boolean))];
    if (quotes.length) {
      const details = element("details", "");
      details.append(element("summary", t("quote")));
      for (const quote of quotes) details.append(element("blockquote", quote, "quoted-text"));
      card.append(details);
    }
    fragment.append(card);
  }
  threadList.append(fragment);
}

function showResult() {
  const s = snapshot.summary;
  const lines = s.threads || snapshot.content_status !== "read"
    ? [t("counts", { total: s.threads, open: s.open, resolved: s.resolved, messages: s.messages_with_body })]
    : [t("no_comments")];
  if (snapshot.content_status !== "read") {
    lines.push(t(snapshot.content_status === "partial" ? "partial_bodies" : "no_bodies"));
  }
  for (const [key, count] of [
    ["missing_bodies_count", s.missing_bodies + s.unsupported_bodies],
    ["missing_messages_count", s.threads_without_messages],
    ["invalid_threads_count", s.invalid_threads],
    ["unmatched_ranges_count", s.ranges_without_threads],
    ["unknown_status_count", s.unknown_status]
  ]) {
    if (count) lines.push(t(key, { count }));
  }
  if (snapshot.quote_status === "unavailable") lines.push(t("no_quotes"));
  if (snapshot.quote_status === "partial") lines.push(t("partial_quotes"));
  notice(lines.join("\n"), lines.length > 1);

  $("diagnostic-text").textContent = JSON.stringify({
    content_status: snapshot.content_status,
    quote_status: snapshot.quote_status,
    ...s
  }, null, 2);
}

function editorError(result) {
  switch (result?.reason) {
    case "wrong-project": return { key: "error_wrong_project" };
    case "sign-in": return { key: "error_sign_in" };
    case "not-json": return { key: "error_not_json" };
    case "timeout": return { key: "error_timeout" };
    case "http":
      if (result.status === 403) return { key: "error_forbidden" };
      return { key: "error_http", values: { status: result.status } };
    default: return { key: "error_read" };
  }
}

function render() {
  refresh.textContent = t(mayRead ? "refresh" : "read");
  refresh.disabled = quoteToggle.disabled = !target || phase === "loading";
  download.disabled = !snapshot?.summary.messages_with_body;
  $("project").hidden = $("diagnostics").hidden = !snapshot;
  $("project").textContent = snapshot?.title ?? "";
  $("filters").hidden = !snapshot?.threads.length;

  if (snapshot) showResult();
  else if (!target) notice(t("open_editor"));
  else if (phase === "loading") notice(t("loading"));
  else if (failure) notice(t(failure.key, failure.values), true);
  else notice(mayRead ? "" : t("first_read"));
  showThreads();
}

async function load() {
  if (!target || !mayRead || phase === "loading") return;
  phase = "loading";
  snapshot = null;
  failure = null;
  render();

  try {
    const [execution] = await chrome.scripting.executeScript({
      target: { tabId: target.tabId },
      func: readFromEditor,
      args: [target.projectId, quoteToggle.checked]
    });
    if (execution?.result?.ok) snapshot = buildSnapshot(execution.result, target.projectId);
    else failure = editorError(execution?.result);
  } catch (error) {
    const key = ["error_thread_payload", "error_thread_records"].includes(error?.message)
      ? error.message : "error_read";
    failure = { key };
  } finally {
    phase = "ready";
    render();
  }
}

function applyLanguage(choice) {
  language = resolveLanguage(choice, chrome.i18n.getUILanguage());
  document.documentElement.lang = language;
  for (const el of document.querySelectorAll("[data-message]")) {
    el.textContent = t(el.dataset.message);
  }
  $("query").placeholder = t("search_placeholder");
  render();
}

download.addEventListener("click", () => {
  if (!snapshot?.summary.messages_with_body) return;
  const json = new Blob([JSON.stringify(snapshot, null, 2) + "\n"], { type: "application/json" });
  const link = document.createElement("a");
  link.href = URL.createObjectURL(json);
  link.download = `overleaf-review-${snapshot.project_id}.json`;
  link.click();
  setTimeout(() => URL.revokeObjectURL(link.href), 1000);
});
refresh.addEventListener("click", () => {
  if (!mayRead) {
    mayRead = true;
    remember(consentKey, "yes");
  }
  void load();
});
quoteToggle.addEventListener("change", load);
$("query").addEventListener("input", showThreads);
$("status").addEventListener("change", showThreads);
languageSelect.addEventListener("change", () => {
  const choice = languageChoice(languageSelect.value);
  remember(languageKey, choice);
  applyLanguage(choice);
});

async function initialize() {
  await Promise.all(Object.entries(catalogPaths).map(async ([locale, path]) => {
    const response = await fetch(chrome.runtime.getURL(path));
    if (!response.ok) throw new Error(`Missing locale: ${locale}`);
    catalogs[locale] = await response.json();
  }));
  languageSelect.disabled = false;
  languageSelect.value = languageChoice(readPreference(languageKey));
  applyLanguage(languageSelect.value);
  if (mayRead) void load();
}

initialize().catch(() => notice("Could not load the extension's language files. Reload the extension and try again.", true));
