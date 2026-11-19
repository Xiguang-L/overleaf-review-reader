const record = (value) => value !== null && typeof value === "object" && !Array.isArray(value);
const text = (value) => typeof value === "string" && value.trim() ? value : null;
const idOf = (value) => text(value)?.trim() ?? null;

export function projectIdFromUrl(url) {
  try {
    const { origin, pathname } = new URL(url);
    if (!["https://www.overleaf.com", "https://overleaf.com"].includes(origin)) return null;
    return /^\/project\/([0-9a-f]{24})\/?$/i.exec(pathname)?.[1]?.toLowerCase() ?? null;
  } catch {
    return null;
  }
}

export function readTarget(hash) {
  const match = /^#(\d+)\/([0-9a-f]{24})$/i.exec(hash);
  if (!match || !Number.isSafeInteger(Number(match[1]))) return null;
  return { tabId: Number(match[1]), projectId: match[2].toLowerCase() };
}

function threadEntries(payload) {
  const threads = record(payload) && Object.hasOwn(payload, "threads") ? payload.threads : payload;
  if (Array.isArray(threads)) {
    return threads.map((thread) => [thread?.id ?? thread?.thread_id ?? thread?._id, thread]);
  }
  if (record(threads)) return Object.entries(threads);
  throw new Error("error_thread_payload");
}

function isThread(thread) {
  return record(thread) && (Object.hasOwn(thread, "messages") || typeof thread.resolved === "boolean");
}

function normalizeMessage(message) {
  // The public editor uses `content`. Only accept explicit text fields, never
  // stringify an object or substitute the selected manuscript text.
  const fields = record(message) ? [message.content, message.text, message.body] : [];
  const body = fields.map(text).find((value) => value !== null) ?? null;
  const user = record(message?.user) ? message.user : {};
  const fullname = [user.first_name, user.last_name].map(text).filter(Boolean).join(" ");
  return {
    id: idOf(message?.id ?? message?._id),
    author: text(user.name) ?? text(fullname) ?? text(message?.author),
    timestamp: text(message?.timestamp) ?? (Number.isFinite(message?.timestamp) ? message.timestamp : null),
    body,
    body_status: body !== null ? "read" : fields.some((value) => value != null && typeof value !== "string")
      ? "unsupported" : "missing"
  };
}

function quoteIndex(result) {
  const index = new Map();
  if (!result?.ok) return { index, state: result ? "unavailable" : "not-requested" };
  if (!Array.isArray(result.data)) return { index, state: "unavailable" };
  let incomplete = false;
  for (const doc of result.data) {
    const docId = idOf(doc?.id ?? doc?.docId);
    const comments = doc?.ranges?.comments;
    if (!docId || !Array.isArray(comments)) {
      incomplete = true;
      continue;
    }
    for (const entry of comments) {
      const op = entry?.op ?? entry;
      const threadId = idOf(op?.t);
      if (!threadId) {
        incomplete = true;
        continue;
      }
      const quote = {
        doc_id: docId,
        offset_utf16: Number.isSafeInteger(op.p) && op.p >= 0 ? op.p : null,
        quoted_text: text(op.c)
      };
      if (!index.has(threadId)) index.set(threadId, []);
      index.get(threadId).push(quote);
    }
  }
  return { index, state: incomplete ? "partial" : "read" };
}

export function buildSnapshot(result, projectId, fetchedAt = new Date().toISOString()) {
  const entries = threadEntries(result.threads);
  if (entries.length && !entries.some(([id, thread]) => idOf(id) && isThread(thread))) {
    throw new Error("error_thread_records");
  }

  const { index, state: quoteState } = quoteIndex(result.anchors);
  const threads = [];
  const seen = new Set();
  const summary = {
    threads: 0,
    open: 0,
    resolved: 0,
    unknown_status: 0,
    messages_with_body: 0,
    missing_bodies: 0,
    unsupported_bodies: 0,
    threads_without_messages: 0,
    invalid_threads: 0,
    ranges_without_threads: 0
  };

  for (const [rawId, raw] of entries) {
    const id = idOf(rawId);
    if (!id || seen.has(id) || !isThread(raw)) {
      summary.invalid_threads++;
      continue;
    }
    seen.add(id);
    const status = raw.resolved === true ? "resolved"
      : raw.resolved === false || raw.resolved == null ? "open" : "unknown_status";
    const messages = Array.isArray(raw.messages) ? raw.messages.map(normalizeMessage) : [];
    summary[status]++;
    if (!messages.length) summary.threads_without_messages++;
    for (const message of messages) {
      if (message.body_status === "read") summary.messages_with_body++;
      else if (message.body_status === "unsupported") summary.unsupported_bodies++;
      else summary.missing_bodies++;
    }
    threads.push({
      id, status, messages,
      anchors: index.get(id) ?? []
    });
  }

  summary.threads = threads.length;
  summary.ranges_without_threads = [...index.keys()].filter((id) => !seen.has(id)).length;
  const missing = summary.missing_bodies + summary.unsupported_bodies;
  const incomplete = missing || summary.threads_without_messages || summary.invalid_threads
    || summary.ranges_without_threads;

  return {
    schema_version: 1,
    project_id: projectId,
    title: text(result.title) ?? "Overleaf",
    fetched_at: fetchedAt,
    content_status: incomplete ? (summary.messages_with_body ? "partial" : "unavailable") : "read",
    quote_status: quoteState,
    summary,
    threads
  };
}

export function filterThreads(threads, status, query) {
  const needle = query.trim().toLowerCase();
  return threads.filter((thread) => {
    if (status !== "all" && thread.status !== status) return false;
    return !needle || thread.messages.some(({ body, author }) =>
      body?.toLowerCase().includes(needle) || author?.toLowerCase().includes(needle));
  });
}
