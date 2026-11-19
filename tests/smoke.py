"""Offline Chromium test with optional store screenshots from a fictional project."""

import argparse
import json
import os
import shutil
import tempfile
from pathlib import Path
from zipfile import ZipFile

from playwright.sync_api import expect, sync_playwright


PROJECT = "0123456789abcdef01234567"
EDITOR = f"https://www.overleaf.com/project/{PROJECT}"
BODY = "检查公式 $\\alpha$。\n<img src='https://example.invalid/image'>"
REPLY = "已经补在方法部分。"
THREADS = {
    "first": {"messages": [
        {"id": "m1", "content": BODY, "user": {"name": "Lin"}},
        {"id": "m2", "content": REPLY},
    ]},
    "second": {"resolved": True, "messages": [{"id": "m3", "content": "Confirmed."}]},
    "third": {"messages": [{"id": "m4", "content": None}]},
}

DEMO = {
    "en": {
        "title": "Sample manuscript: Urban gardens",
        "comment": "Could we specify the dates of the follow-up visits here?",
        "reply": "Added the dates to the Methods section.",
        "quote": "We visited each garden again after the growing season.",
        "resolved": "The revised figure caption now explains the two groups.",
    },
    "zh-CN": {
        "title": "示例论文：城市社区花园",
        "comment": "这里能不能写清楚回访的具体日期？",
        "reply": "已在方法部分补上日期。",
        "quote": "种植季结束后，我们再次走访了每个社区花园。",
        "resolved": "新版图注已经说明两组的区别。",
    },
}


def read_export(viewer):
    with viewer.expect_download() as exported:
        viewer.locator("#export").click()
    return json.loads(exported.value.path().read_text(encoding="utf-8"))


def smoke(root, package, screenshots):
    extension = root / "extension"
    if package:
        with ZipFile(package) as bundle:
            bundle.extractall(extension)
    else:
        shutil.copytree(Path(__file__).resolve().parents[1] / "extension", extension)
    manifest_file = extension / "manifest.json"
    manifest = json.loads(manifest_file.read_text(encoding="utf-8"))
    assert set(manifest["permissions"]) == {"activeTab", "scripting"}
    assert "host_permissions" not in manifest
    assert manifest["default_locale"] == "en"
    # Playwright cannot click the browser toolbar. A test-only host grant
    # stands in for activeTab when the viewer injects into the mocked page.
    manifest["host_permissions"] = ["https://www.overleaf.com/*"]
    manifest_file.write_text(json.dumps(manifest), encoding="utf-8")

    requests = []
    current = THREADS
    status_code = 200
    ranges = [
        {"id": "doc1", "ranges": {"comments": [{"op": {"t": "third", "c": "Quoted source", "p": 18}}]}},
    ]

    def mock_site(route):
        url = route.request.url
        requests.append((route.request.method, url))
        if url == EDITOR:
            route.fulfill(content_type="text/html", body="<title>Fixture - Overleaf</title>")
        elif url == EDITOR + "/threads":
            route.fulfill(status=status_code, json=current)
        elif url == EDITOR + "/ranges":
            route.fulfill(json=ranges)
        else:
            route.abort()

    with sync_playwright() as playwright:
        context = playwright.chromium.launch_persistent_context(
            str(root / "profile"), channel="chromium", headless=True,
            accept_downloads=True, downloads_path=str(root / "downloads"),
            viewport={"width": 1280, "height": 800}, device_scale_factor=1,
            color_scheme="light", timezone_id="UTC",
            ignore_default_args=["--headless=old", "--disable-extensions"],
            args=[
                "--headless=new",
                f"--disable-extensions-except={extension}",
                f"--load-extension={extension}",
                "--disable-background-networking",
            ],
        )
        try:
            context.route("http*/**", mock_site)
            original = context.pages[0] if context.pages else context.new_page()
            original.goto(EDITOR)
            def is_extension_worker(worker):
                return worker.url.startswith("chrome-extension://") and worker.url.endswith("/background.js")

            worker = next((w for w in context.service_workers if is_extension_worker(w)), None)
            worker = worker or context.wait_for_event("serviceworker", predicate=is_extension_worker, timeout=10000)
            extension_id = worker.url.split("/")[2]

            viewer = context.new_page()
            viewer_url = f"chrome-extension://{extension_id}/review.html"
            viewer.goto(viewer_url)
            tab_id = viewer.evaluate("async url => (await chrome.tabs.query({url}))[0].id", EDITOR)
            viewer.goto(f"{viewer_url}#{tab_id}/{PROJECT}")
            viewer.reload()
            expect(viewer.locator("#language")).to_have_value("auto")
            viewer.locator("#language").select_option("en")
            expect(viewer.locator("#refresh")).to_have_text("Read project comments")
            expect(viewer.locator("#notice")).to_contain_text("allow this read-only access")
            viewer.locator("#include-quotes").check()
            viewer.locator("#include-quotes").uncheck()
            assert requests == [("GET", EDITOR)], requests
            assert viewer.evaluate("chrome.i18n.getMessage('action_title')") in (
                "Read Overleaf comments", "读取 Overleaf 评论"
            )

            viewer.locator("#refresh").click()
            expect(viewer.locator(".thread")).to_have_count(3)
            expect(viewer.locator(".reply")).to_contain_text(REPLY)
            assert viewer.locator(".thread .body").first.text_content() == BODY
            expect(viewer.locator(".thread img")).to_have_count(0)
            expect(viewer.locator("#notice")).to_contain_text("Some comment text could not be read.")
            assert requests == [("GET", EDITOR), ("GET", EDITOR + "/threads")], requests

            viewer.locator("#status").select_option("resolved")
            expect(viewer.locator(".thread")).to_have_count(1)
            expect(viewer.locator(".thread")).to_contain_text("Confirmed.")
            snapshot = read_export(viewer)
            assert snapshot["content_status"] == "partial"
            assert snapshot["threads"][0]["messages"][0]["body"] == BODY
            assert snapshot["threads"][0]["messages"][1]["body"] == REPLY
            assert snapshot["threads"][2]["messages"][0]["body"] is None

            viewer.locator("#language").select_option("zh-CN")
            expect(viewer.locator("html")).to_have_attribute("lang", "zh-CN")
            expect(viewer.locator("#notice")).to_contain_text("部分正文未能读取。")
            expect(viewer.locator("#status")).to_have_value("resolved")
            assert read_export(viewer) == snapshot
            assert len(requests) == 2, requests

            viewer.reload()
            expect(viewer.locator("#language")).to_have_value("zh-CN")
            expect(viewer.locator(".thread")).to_have_count(3)
            assert requests[-1] == ("GET", EDITOR + "/threads")
            assert len(requests) == 3, requests

            current = {"third": THREADS["third"]}
            viewer.locator("#include-quotes").check()
            expect(viewer.locator("#notice")).to_contain_text("没有读到可用的评论正文。")
            expect(viewer.locator("#export")).to_be_disabled()
            viewer.locator(".thread summary").click()
            expect(viewer.locator(".quoted-text")).to_have_text("Quoted source")
            expect(viewer.locator(".message")).to_contain_text("未读到正文")
            assert sorted(requests[3:]) == sorted([
                ("GET", EDITOR + "/threads"), ("GET", EDITOR + "/ranges"),
            ]), requests

            status_code = 403
            viewer.locator("#refresh").click()
            expect(viewer.locator("#notice")).to_contain_text("当前 Overleaf 会话不能读取")
            expect(viewer.locator("#export")).to_be_disabled()
            viewer.locator("#language").select_option("en")
            expect(viewer.locator("#notice")).to_contain_text("This Overleaf session cannot read")

            if screenshots:
                screenshots.mkdir(parents=True, exist_ok=True)
                status_code = 200
                for locale, demo in DEMO.items():
                    original.evaluate("(title) => { document.title = title; }", demo["title"])
                    current = {
                        "first": {"messages": [
                            {"content": demo["comment"], "user": {"name": "Alex Chen"},
                             "timestamp": "2026-11-17T16:20:00Z"},
                            {"content": demo["reply"], "user": {"name": "Maya Lee"},
                             "timestamp": "2026-11-17T18:45:00Z"},
                        ]},
                        "second": {"resolved": True, "messages": [
                            {"content": demo["resolved"], "user": {"name": "Alex Chen"},
                             "timestamp": "2026-11-16T14:00:00Z"},
                        ]},
                    }
                    ranges = [{"id": "doc1", "ranges": {"comments": [
                        {"op": {"t": "first", "c": demo["quote"], "p": 18}}
                    ]}}]
                    viewer.locator("#language").select_option(locale)
                    viewer.locator("#refresh").click()
                    expect(viewer.locator("#project")).to_have_text(demo["title"])
                    expect(viewer.locator(".thread")).to_have_count(2)
                    viewer.locator(".thread summary").click()
                    expect(viewer.locator(".quoted-text")).to_have_text(demo["quote"])
                    viewer.screenshot(path=screenshots / f"screenshot-{locale}.png")
        finally:
            context.close()


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--package", type=Path, help="Test a built release ZIP instead of the source folder")
    parser.add_argument("--screenshots", type=Path, help="Save screenshots of fictional reviews to this directory")
    args = parser.parse_args()
    local = Path(os.environ.get("LOCALAPPDATA", tempfile.gettempdir())) / "Temp" / "opencode"
    with tempfile.TemporaryDirectory(prefix="overleaf-reader-", dir=local if local.is_dir() else None) as tmp:
        smoke(Path(tmp), args.package, args.screenshots)
    print("Chromium smoke test passed (mocked Overleaf; no real requests).")
