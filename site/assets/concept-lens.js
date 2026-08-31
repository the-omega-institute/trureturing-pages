(function () {
  "use strict";

  const current = document.currentScript;
  const base = current && current.src
    ? new URL(".", current.src)
    : new URL("assets/", document.baseURI);
  const style = document.createElement("style");
  style.textContent = ".concept-local-arrow{fill:#7fae9d}.concept-hop-controls{display:flex;gap:.35rem}";
  document.head.append(style);

  function load(name) {
    return new Promise((resolve, reject) => {
      const script = document.createElement("script");
      script.src = new URL(name, base).toString();
      script.onload = resolve;
      script.onerror = () => reject(new Error(`Unable to load ${name}`));
      document.head.append(script);
    });
  }

  load("concept-lens-core.js")
    .then(() => load("concept-lens-runtime.js"))
    .catch((error) => {
      const root = document.querySelector("#node-detail");
      if (!root) return;
      const message = document.createElement("p");
      message.className = "concept-lens-error";
      message.textContent = error.message;
      root.replaceChildren(message);
    });
}());
