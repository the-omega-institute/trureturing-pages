(function () {
  "use strict";

  function emptyGuide(root) {
    const shell = document.createElement("div");
    shell.className = "concept-lens-empty";
    const eyebrow = document.createElement("p");
    eyebrow.className = "eyebrow";
    eyebrow.textContent = "Concept Lens";
    const title = document.createElement("h2");
    title.textContent = "Select a concept";
    const copy = document.createElement("p");
    copy.textContent = "Click any node to read its explanation, inspect certified prerequisites and consequences, follow documents, or begin release-bound research.";
    const note = document.createElement("small");
    note.textContent = "The global 3D Atlas provides structure. The local 2D view provides exact dependency direction.";
    shell.append(eyebrow, title, copy, note);
    root.replaceChildren(shell);
  }

  function install() {
    const root = document.querySelector("#node-detail");
    if (!root) return;
    let repairing = false;
    const ownsContent = () => Boolean(root.querySelector(
      ".concept-lens-article, .concept-lens-empty, .concept-lens-error"
    ));

    new MutationObserver(() => {
      if (repairing || ownsContent()) return;
      const selected = root.dataset.nodeId || null;
      if (!selected) {
        emptyGuide(root);
        return;
      }

      repairing = true;
      delete root.dataset.nodeId;
      window.setTimeout(() => {
        root.dataset.nodeId = selected;
        window.setTimeout(() => { repairing = false; }, 0);
      }, 0);
    }).observe(root, { childList: true });
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", install, { once: true });
  } else {
    install();
  }
}());
