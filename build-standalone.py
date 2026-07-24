#!/usr/bin/env python3
"""Build a single self-contained HTML file from the app.

Inlines css/styles.css and all js/*.js referenced by index.html into one file
that runs by itself (open it directly or share it). The manifest, icons and
service-worker registration are dropped since a standalone file has no server.

Usage:  python3 build-standalone.py   ->  writes Project-Review-app.html
"""
import re
from pathlib import Path

ROOT = Path(__file__).resolve().parent
OUT = ROOT / "Project-Review-app.html"


def read(rel):
    return (ROOT / rel).read_text(encoding="utf-8")


def safe_js(js):
    # Prevent a literal </script> inside JS string content from ending the tag.
    return js.replace("</script", "<\\/script")


def main():
    html = read("index.html")

    # Inline the stylesheet.
    css = read("css/styles.css")
    html = re.sub(
        r'<link rel="stylesheet" href="css/styles\.css">',
        "<style>\n" + css + "\n</style>",
        html,
    )

    # Drop things that only make sense for the hosted PWA.
    html = re.sub(r'\s*<link rel="manifest"[^>]*>', "", html)
    html = re.sub(r'\s*<link rel="apple-touch-icon"[^>]*>', "", html)
    html = re.sub(r'\s*<link rel="icon"[^>]*>', "", html)
    html = re.sub(
        r"\s*<script>\s*if \('serviceWorker' in navigator\).*?</script>",
        "",
        html,
        flags=re.DOTALL,
    )

    # Inline each external script in place, preserving order.
    def inline(match):
        src = match.group(1)
        return "<script>\n" + safe_js(read(src)) + "\n</script>"

    html = re.sub(r'<script src="(js/[^"]+)"></script>', inline, html)

    # Leave a small marker comment.
    html = html.replace(
        "<title>Project Review</title>",
        "<title>Project Review</title>\n  <!-- Standalone build: all CSS/JS inlined. Regenerate with build-standalone.py -->",
    )

    OUT.write_text(html, encoding="utf-8")
    size_kb = len(html.encode("utf-8")) / 1024
    print(f"Wrote {OUT.name} ({size_kb:.0f} KB)")


if __name__ == "__main__":
    main()
