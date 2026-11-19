import assert from "node:assert/strict";
import test from "node:test";
import { buildSnapshot, filterThreads, projectIdFromUrl, readTarget } from "../extension/core.js";

const projectId = "0123456789abcdef01234567";
const fetchedAt = "2026-11-18T00:00:00.000Z";
const collect = (threads, anchors = null) => buildSnapshot({ title: "Test project", threads, anchors }, projectId, fetchedAt);
const bracketedText = "  检查公式 $\\alpha$。\nSecond line <img src=\"https://example.invalid\">  ";

test("recognizes only Overleaf editor URLs and binds the viewer to the original project", () => {
  assert.equal(projectIdFromUrl(`https://www.overleaf.com/project/${projectId}?foo=1#editor`), projectId);
  assert.equal(projectIdFromUrl(`https://overleaf.com/project/${projectId}/`), projectId);
  for (const url of [
    `https://www.overleaf.com/project/${projectId}/pdf`,
    `https://www.overleaf.com.evil.example/project/${projectId}`,
    `http://www.overleaf.com/project/${projectId}`,
    "https://www.overleaf.com/project", undefined
  ]) assert.equal(projectIdFromUrl(url), null);
  assert.deepEqual(readTarget(`#19/${projectId}`), { tabId: 19, projectId });
  assert.equal(readTarget(`#9007199254740993/${projectId}`), null);
});

test("puts verbatim comment bodies, replies and status together in the downloaded record", () => {
  const threads = {
    first: {
      messages: [
        { id: "m1", content: bracketedText, timestamp: "2026-11-17T19:00:00Z", user: { name: "Ada", email: "private@example.invalid" } },
        { id: "m2", content: "同意，补到方法部分。", timestamp: "2026-11-18T00:00:00Z", user: { first_name: "Jun", last_name: "Li" } }
      ]
    },
    second: { resolved: true, messages: [{ id: "m3", content: "Checked." }] }
  };
  const snapshot = JSON.parse(JSON.stringify(collect(threads)));
  assert.equal(snapshot.summary.threads, 2);
  assert.equal(snapshot.summary.open, 1);
  assert.equal(snapshot.summary.resolved, 1);
  assert.equal(snapshot.summary.messages_with_body, 3);
  assert.deepEqual(snapshot.threads[0].messages.map(({ author, body }) => [author, body]), [
    ["Ada", bracketedText], ["Jun Li", "同意，补到方法部分。"]
  ]);
  assert.equal(JSON.stringify(snapshot).includes("private@example.invalid"), false);
  assert.equal(snapshot.content_status, "read");
  assert.equal(snapshot.quote_status, "not-requested");
  assert.equal(snapshot.fetched_at, fetchedAt);
});

test("distinguishes a real empty project from an unexpected response", () => {
  assert.equal(collect({}).summary.threads, 0);
  assert.equal(collect({ threads: {} }).content_status, "read");
  for (const response of [null, "login", { error: "not accessible" }, { threads: false }, { status: "ok" }]) {
    assert.throws(() => collect(response), /error_thread_(payload|records)/);
  }
});

test("never substitutes highlighted text for a missing, blank or structured message body", () => {
  const snapshot = collect({ first: { messages: [
    { id: "empty", content: " \n " },
    { id: "structured", content: { type: "something-new" } }
  ] } }, { ok: true, data: [
    { id: "document-1", ranges: { comments: [{ op: { t: "first", p: 42, c: "highlight from manuscript" } }] } }
  ] });
  const [thread] = snapshot.threads;
  assert.deepEqual(thread.messages.map(({ body, body_status }) => [body, body_status]), [
    [null, "missing"], [null, "unsupported"]
  ]);
  assert.deepEqual(thread.anchors, [
    { doc_id: "document-1", offset_utf16: 42, quoted_text: "highlight from manuscript" }
  ]);
  assert.equal(snapshot.content_status, "unavailable");
  assert.equal(snapshot.summary.missing_bodies, 1);
  assert.equal(snapshot.summary.unsupported_bodies, 1);
});

test("recognizes explicit text/body fields without converting other fields or touching reply order", () => {
  const snapshot = collect({ threads: [
    { id: "t1", messages: [
      { id: "m1", content: null, text: "One", timestamp: 1794960000001 },
      { id: "m2", body: "Two", timestamp: 1794960000000 },
      { id: "m3", placeholder: "Not a comment body" }
    ] }
  ] });
  assert.deepEqual(snapshot.threads[0].messages.map((m) => m.body), ["One", "Two", null]);
  assert.equal(snapshot.content_status, "partial");
});

test("a ranges error or detached anchor cannot make complete bodies disappear", () => {
  const input = { first: { resolved: true, messages: [{ content: "Kept even if the selection was deleted." }] } };
  assert.equal(collect(input, { ok: false, reason: "timeout" }).quote_status, "unavailable");
  assert.equal(collect(input, { ok: false, reason: "timeout" }).content_status, "read");
  const snapshot = collect(input, { ok: true, data: [{ id: "doc", ranges: { comments: [] } }] });
  assert.equal(snapshot.threads[0].messages[0].body, "Kept even if the selection was deleted.");
  assert.deepEqual(snapshot.threads[0].anchors, []);
});

test("reports unknown threads, empty threads and unmatched range IDs explicitly", () => {
  const snapshot = collect({
    first: { messages: [{ content: "Readable" }] },
    empty: { messages: [], resolved: true },
    unexpected: 42
  }, { ok: true, data: [
    { id: "document-1", ranges: { comments: [{ op: { t: "not-returned", c: "quote" } }] } },
    { id: "invalid" }
  ] });
  assert.equal(snapshot.content_status, "partial");
  assert.equal(snapshot.quote_status, "partial");
  assert.equal(snapshot.summary.invalid_threads, 1);
  assert.equal(snapshot.summary.threads_without_messages, 1);
  assert.equal(snapshot.summary.ranges_without_threads, 1);
});

test("filters by status, author or any reply body", () => {
  const { threads } = collect({
    first: { messages: [{ content: "original" }, { content: "处理样本量", user: { name: "Lin" } }] },
    second: { resolved: true, messages: [{ content: "Done" }] }
  });
  assert.deepEqual(filterThreads(threads, "all", " 样本量 ").map((t) => t.id), ["first"]);
  assert.deepEqual(filterThreads(threads, "open", "LIN").map((t) => t.id), ["first"]);
  assert.deepEqual(filterThreads(threads, "resolved", "样本量"), []);
});
