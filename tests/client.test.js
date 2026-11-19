import assert from "node:assert/strict";
import test from "node:test";
import { readFromEditor } from "../extension/client.js";

const projectId = "0123456789abcdef01234567";
const origin = "https://www.overleaf.com";
const href = `${origin}/project/${projectId}`;

function editor(t, request, url = href) {
  const previous = { fetch: globalThis.fetch, document: globalThis.document, location: globalThis.location };
  t.after(() => Object.assign(globalThis, previous));
  globalThis.fetch = request;
  globalThis.document = { title: "Demo paper - Overleaf, Online LaTeX Editor" };
  globalThis.location = new URL(url);
}

test("single same-origin read-only request by default; does not download manuscript files", async (t) => {
  const requests = [];
  editor(t, async (path, init) => {
    requests.push(path);
    assert.equal(init.method, "GET");
    assert.equal(init.mode, "same-origin");
    assert.equal(init.credentials, "same-origin");
    assert.equal(init.redirect, "manual");
    assert.equal(init.cache, "no-store");
    assert.ok(init.signal instanceof AbortSignal);
    return Response.json({ a: { messages: [{ content: "Actual text" }] } });
  });
  const result = await readFromEditor(projectId, false);
  assert.equal(result.ok, true);
  assert.equal(result.title, "Demo paper");
  assert.equal(result.threads.a.messages[0].content, "Actual text");
  assert.equal(result.anchors, null);
  assert.deepEqual(requests, [`/project/${projectId}/threads`]);
});

test("an optional quote request failing still returns every thread", async (t) => {
  const requests = [];
  editor(t, async (path) => {
    requests.push(path);
    if (path.endsWith("/ranges")) return new Response(null, { status: 404 });
    return Response.json({ a: { messages: [{ content: "Still here." }] } });
  });
  const result = await readFromEditor(projectId, true);
  assert.equal(result.ok, true);
  assert.equal(result.threads.a.messages[0].content, "Still here.");
  assert.deepEqual(result.anchors, { ok: false, reason: "http", status: 404 });
  assert.deepEqual(requests, [`/project/${projectId}/threads`, `/project/${projectId}/ranges`]);
});

test("fails explicitly for authentication, permission errors, login HTML and timeout", async (t) => {
  let response;
  editor(t, async () => response());
  for (const [makeResponse, expected] of [
    [() => ({ type: "opaqueredirect" }), { ok: false, reason: "sign-in" }],
    [() => new Response(null, { status: 401 }), { ok: false, reason: "sign-in" }],
    [() => new Response(null, { status: 403 }), { ok: false, reason: "http", status: 403 }],
    [() => new Response("<!doctype html><title>Sign in</title>"), { ok: false, reason: "not-json" }],
    [() => { throw new DOMException("Timed out", "TimeoutError"); }, { ok: false, reason: "timeout" }]
  ]) {
    response = makeResponse;
    assert.deepEqual(await readFromEditor(projectId, false), expected);
  }
});

test("does not fetch if the editor is now another project or origin", async (t) => {
  const fetch = () => assert.fail("unexpected request");
  editor(t, fetch, `https://www.overleaf.com.invalid/project/${projectId}`);
  assert.deepEqual(await readFromEditor(projectId, true), { ok: false, reason: "wrong-project" });
  globalThis.location = new URL(`${origin}/project/aaaaaaaaaaaaaaaaaaaaaaaa`);
  assert.deepEqual(await readFromEditor(projectId, true), { ok: false, reason: "wrong-project" });
});

test("discards a result when the project changes during the request", async (t) => {
  editor(t, async () => {
    globalThis.location = new URL(`${origin}/project/aaaaaaaaaaaaaaaaaaaaaaaa`);
    return Response.json({ a: { messages: [{ content: "Wrong view now." }] } });
  });
  assert.deepEqual(await readFromEditor(projectId, false), { ok: false, reason: "wrong-project" });
});

test("the action opens a viewer bound to the clicked editor tab, not to the next active tab", async (t) => {
  const previous = globalThis.chrome;
  t.after(() => { globalThis.chrome = previous; });
  let onClicked;
  const opened = [];
  globalThis.chrome = {
    action: { onClicked: { addListener: (listener) => { onClicked = listener; } } },
    runtime: { getURL: (path) => `chrome-extension://fixture/${path}` },
    tabs: { create: (tab) => opened.push(tab.url) }
  };
  await import("../extension/background.js");
  onClicked({ id: 19, url: href });
  onClicked({ id: 20, url: `${origin}/project` });
  assert.deepEqual(opened, [
    `chrome-extension://fixture/review.html#19/${projectId}`,
    "chrome-extension://fixture/review.html"
  ]);
});
