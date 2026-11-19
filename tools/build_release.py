"""Build the Chrome Web Store ZIP and matching listing icon."""

import argparse
import json
from io import BytesIO
from pathlib import Path
from zipfile import ZIP_DEFLATED, ZipFile

from PIL import Image, ImageDraw


ROOT = Path(__file__).resolve().parents[1]
SOURCES = (
    "background.js", "client.js", "core.js", "i18n.js",
    "review.html", "review.css", "review.js",
    "_locales/en/messages.json", "_locales/zh_CN/messages.json",
)


def icon(size):
    # Draw our own speech bubble at a high resolution before downsampling.
    scale = 4
    canvas = Image.new("RGBA", (128 * scale, 128 * scale))
    draw = ImageDraw.Draw(canvas)
    scaled = lambda points: tuple(x * scale for x in points)
    draw.rounded_rectangle(scaled((16, 16, 112, 112)), radius=23 * scale, fill="#176451")
    draw.rounded_rectangle(scaled((32, 36, 96, 79)), radius=11 * scale, fill="#F2FBF7")
    draw.polygon([scaled(p) for p in ((44, 73), (61, 76), (44, 92))], fill="#F2FBF7")
    draw.rounded_rectangle(scaled((44, 49, 84, 54)), radius=2 * scale, fill="#176451")
    draw.rounded_rectangle(scaled((44, 61, 73, 66)), radius=2 * scale, fill="#176451")
    output = BytesIO()
    canvas.resize((size, size), Image.Resampling.LANCZOS).save(output, format="PNG")
    return output.getvalue()


def build(output):
    source = ROOT / "extension"
    manifest = json.loads((source / "manifest.json").read_text(encoding="utf-8"))
    output.mkdir(parents=True, exist_ok=True)
    version = manifest["version"]
    assert version == json.loads((ROOT / "package.json").read_text())["version"]
    artifacts = {name: (source / name).read_bytes() for name in SOURCES}
    artifacts["LICENSE"] = (ROOT / "LICENSE").read_bytes()
    icons = {str(size): f"icons/icon{size}.png" for size in (16, 32, 48, 128)}
    for size, path in icons.items():
        artifacts[path] = icon(int(size))
    manifest["icons"] = icons
    manifest["action"]["default_icon"] = {key: icons[key] for key in ("16", "32")}
    artifacts["manifest.json"] = (json.dumps(manifest, indent=2) + "\n").encode("utf-8")

    zip_path = output / f"overleaf-review-reader-{version}.zip"
    with ZipFile(zip_path, "w", compression=ZIP_DEFLATED) as bundle:
        for name, data in sorted(artifacts.items()):
            bundle.writestr(name, data)
    (output / "store-icon-128.png").write_bytes(artifacts[icons["128"]])
    for name in ("STORE-LISTING.md", "PRIVACY.md"):
        (output / name).write_bytes((ROOT / name).read_bytes())
    print(zip_path)


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("output", type=Path)
    build(parser.parse_args().output)
