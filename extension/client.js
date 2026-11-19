// Chrome serializes this function into the original editor tab. It cannot
// reference anything in the extension's module scope.
export async function readFromEditor(expectedProjectId, withAnchors) {
  const origins = ["https://www.overleaf.com", "https://overleaf.com"];
  const currentProjectId = () => origins.includes(location.origin)
    ? /^\/project\/([0-9a-f]{24})\/?$/i.exec(location.pathname)?.[1]?.toLowerCase()
    : undefined;

  if (!expectedProjectId || currentProjectId() !== expectedProjectId) {
    return { ok: false, reason: "wrong-project" };
  }

  const prefix = `/project/${expectedProjectId}/`;

  async function get(resource, timeoutMs) {
    try {
      const response = await fetch(prefix + resource, {
        method: "GET",
        credentials: "same-origin",
        mode: "same-origin",
        redirect: "manual",
        cache: "no-store",
        headers: { Accept: "application/json" },
        signal: AbortSignal.timeout(timeoutMs)
      });

      if (response.type === "opaqueredirect" || response.status === 401) {
        return { ok: false, reason: "sign-in" };
      }
      if (!response.ok) return { ok: false, reason: "http", status: response.status };

      try {
        return { ok: true, data: await response.json() };
      } catch (error) {
        if (error?.name === "TimeoutError" || error?.name === "AbortError") {
          return { ok: false, reason: "timeout" };
        }
        return { ok: false, reason: "not-json" };
      }
    } catch (error) {
      return {
        ok: false,
        reason: error?.name === "TimeoutError" || error?.name === "AbortError" ? "timeout" : "network"
      };
    }
  }

  const [threads, anchors] = await Promise.all([
    get("threads", 12000),
    withAnchors ? get("ranges", 5000) : null
  ]);

  if (currentProjectId() !== expectedProjectId) return { ok: false, reason: "wrong-project" };
  if (!threads.ok) return threads;

  return {
    ok: true,
    title: document.title.replace(/\s+[-–—|]\s+Overleaf\b.*$/i, "").trim(),
    threads: threads.data,
    anchors
  };
}
