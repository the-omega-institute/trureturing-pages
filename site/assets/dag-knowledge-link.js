(function () {
  "use strict";

  const detail = document.querySelector("#node-detail");
  if (!detail) return;

  let releaseDigest = null;
  fetch("data/truth-graph.v1.json")
    .then((response) => {
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      return response.json();
    })
    .then((graph) => {
      releaseDigest = graph.source_snapshot && graph.source_snapshot.truth_release_digest;
      refresh();
    })
    .catch(() => {
      releaseDigest = null;
    });

  function nodeIdFromDetail() {
    const terms = [...detail.querySelectorAll("dt")];
    const term = terms.find((candidate) => candidate.textContent.trim() === "Node ID");
    return term && term.nextElementSibling
      ? term.nextElementSibling.textContent.trim()
      : null;
  }

  function refresh() {
    const existing = detail.querySelector(".knowledge-read-link");
    const nodeId = nodeIdFromDetail();
    if (!nodeId) {
      if (existing) existing.remove();
      return;
    }

    const params = new URLSearchParams({ id: nodeId });
    if (releaseDigest) params.set("release", releaseDigest);
    const link = existing || document.createElement("a");
    link.className = "knowledge-read-link";
    link.textContent = "Open the full concept page";
    link.href = `knowledge/node.html?${params.toString()}`;
    if (!existing) detail.appendChild(link);
  }

  new MutationObserver(refresh).observe(detail, {
    childList: true,
    subtree: true,
    characterData: true,
  });
}());
