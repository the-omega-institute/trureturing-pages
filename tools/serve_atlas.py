"""Serve local source with a cached, verified public release for visual work."""
import argparse
import hashlib
import json
import sys
import subprocess
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from urllib.parse import unquote, urlsplit
from urllib.request import urlopen

ROOT = Path(__file__).resolve().parents[1]
SITE = ROOT / "site"
CACHE = ROOT / "artifacts" / "atlas-preview"
PUBLISHED = "https://the-omega-institute.github.io/trureturing-pages/"
sys.path.insert(0, str(ROOT))


def prepare():
    data = CACHE / "data"
    data.mkdir(parents=True, exist_ok=True)
    for name in ("pages-atlas-manifest.v1.json", "pages-atlas-view.v1.json", "pages-conformation.v1.json"):
        path = data / name
        if not path.exists():
            with urlopen(PUBLISHED + "data/" + name, timeout=60) as response:
                path.write_bytes(response.read())
    manifest = json.loads((data / "pages-atlas-manifest.v1.json").read_text())
    for name, key in (("pages-atlas-view.v1.json", "atlas_graph_digest"), ("pages-conformation.v1.json", "conformation_digest")):
        digest = "sha256:" + hashlib.sha256((data / name).read_bytes()).hexdigest()
        if digest != manifest[key]:
            raise ValueError(f"Cached {name} does not match the manifest; remove artifacts/atlas-preview/data and retry.")
    from lib.knowledge_pages import render_knowledge_site
    subprocess.run([
        "node", str(ROOT / "tools/build_atlas_startup.mjs"),
        str(data / "pages-atlas-view.v1.json"), str(data / "pages-atlas-manifest.v1.json"), str(CACHE),
    ], check=True)
    print("Rendering local Wiki pages from the verified Atlas...", flush=True)
    render_knowledge_site(json.loads((data / "pages-atlas-view.v1.json").read_text()), CACHE)
    subprocess.run([
        "node", str(ROOT / "tools/build_architecture_history.mjs"),
        str(data / "pages-atlas-view.v1.json"), str(data / "pages-atlas-manifest.v1.json"), str(CACHE),
    ], check=True)
    from lib.living_library import build_library
    build_library(data / "pages-atlas-view.v1.json", data / "pages-atlas-manifest.v1.json", CACHE, ROOT.parent / "trureturing")


class Handler(SimpleHTTPRequestHandler):
    def translate_path(self, path):
        relative = Path(unquote(urlsplit(path).path).lstrip("/"))
        if ".." in relative.parts:
            return str(SITE / "not-found")
        if relative.as_posix() in ("data/truth-graph.v1.json", "data/certified-topology-view.v1.json"):
            return str(CACHE / "data/pages-atlas-view.v1.json")
        local = SITE / relative
        return str(local if local.exists() else CACHE / relative)

if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--port", type=int, default=8765)
    args = parser.parse_args()
    prepare()
    server = ThreadingHTTPServer(("127.0.0.1", args.port), Handler)
    print(f"Atlas preview: http://127.0.0.1:{args.port}/atlas.html", flush=True)
    server.serve_forever()
