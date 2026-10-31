# Public page URLs

GitHub Pages serves `research.html` at `/research`, including when `research/`
also contains individual dossiers. Public navigation uses these extensionless
page URLs. Existing `.html` bookmarks still load the same document; the shared
interface updates the address without adding a history entry and preserves its
query string and fragment. Directory routes such as `/knowledge/` and
`/research/<slug>/` retain their trailing slash.

`site/assets/page-urls.mjs` limits normalization to known public pages within the
current site prefix. External sources, evidence downloads, APIs and the
registered authentication callback retain their original URLs. Add new public
HTML pages to this list when they need a clean address. Research's legacy
question/result redirects accept both forms.

Local previews use `lib.preview_server.PagesHTTPRequestHandler` to reproduce
the host's `.html` fallback. Files keep their existing names on disk; no release
artifact paths, proof identities, deployment workflows or upstream outputs
change. An extensionless page such as `/research` does not use a trailing slash.
