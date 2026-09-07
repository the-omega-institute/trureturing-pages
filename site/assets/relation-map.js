(function () {
  "use strict";
  const workerUrl = new URL(
    "relation-map-worker.js",
    document.currentScript.src,
  );
  const namespace = "http://www.w3.org/2000/svg";
  const colors = {
    proof: "#80cbbd",
    affinity: "#d7a0ca",
    document: "#82b5e0",
    authored: "#a7b5c1",
    advisory: "#e5c26c",
  };
  let serial = 0;
  function svgElement(tag, attrs = {}) {
    const node = document.createElementNS(namespace, tag);
    Object.entries(attrs).forEach(([key, value]) =>
      node.setAttribute(key, value),
    );
    return node;
  }
  function button(name, glyph, handler) {
    const result = document.createElement("button");
    result.type = "button";
    result.className = "icon-button";
    result.title = name;
    result.setAttribute("aria-label", name);
    const icon = document.createElement("i");
    icon.dataset.lucide = glyph;
    result.append(icon);
    result.addEventListener("click", handler);
    return result;
  }
  function wrapTitle(value) {
    const words = String(value)
      .replace(/([a-z])([A-Z])/g, "$1 $2")
      .split(/\s+/);
    const lines = [""];
    for (const word of words) {
      if ((lines.at(-1) + " " + word).trim().length > 27 && lines.at(-1))
        lines.push("");
      lines[lines.length - 1] = (lines.at(-1) + " " + word).trim();
    }
    return lines
      .slice(0, 3)
      .map((line, i) =>
        line.length > 27 || (i === 2 && lines.length > 3)
          ? line.slice(0, 25) + "..."
          : line,
      );
  }
  function mount(host, { onSelect, compact = false } = {}) {
    const instance = ++serial;
    const shell = document.createElement("div");
    shell.className = `relation-viewer${compact ? " is-compact" : ""}`;
    const toolbar = document.createElement("div");
    toolbar.className = "relation-map-toolbar";
    const count = document.createElement("span");
    count.setAttribute("role", "status");
    const controls = document.createElement("div");
    controls.className = "relation-map-tools";
    const viewport = document.createElement("div");
    viewport.className = "relation-map-viewport";
    const svg = svgElement("svg", {
      role: "img",
      "aria-label": "Concept relationship graph",
      tabindex: "0",
    });
    const defs = svgElement("defs"),
      group = svgElement("g");
    for (const [category, color] of Object.entries(colors)) {
      const marker = svgElement("marker", {
        id: `relation-arrow-${instance}-${category}`,
        viewBox: "0 0 10 10",
        refX: "9",
        refY: "5",
        markerWidth: "6",
        markerHeight: "6",
        orient: "auto-start-reverse",
      });
      marker.append(
        svgElement("path", { d: "M0 0 L10 5 L0 10 Z", fill: color }),
      );
      defs.append(marker);
    }
    svg.append(defs, group);
    viewport.append(svg);
    toolbar.append(count, controls);
    shell.append(toolbar, viewport);
    host.append(shell);
    const selection = d3.select(svg);
    const zoom = d3
      .zoom()
      .scaleExtent([0.015, 4])
      .on("zoom", (event) => group.setAttribute("transform", event.transform));
    selection.call(zoom).on("dblclick.zoom", null);
    let layout = null,
      worker = null,
      selected = null;
    function fit() {
      if (!layout || !viewport.clientWidth || !viewport.clientHeight) return;
      const w = viewport.clientWidth,
        h = viewport.clientHeight;
      const scale = Math.max(
        0.015,
        Math.min((w - 28) / layout.width, (h - 28) / layout.height, 1.15),
      );
      selection.call(
        zoom.transform,
        d3.zoomIdentity
          .translate(
            (w - layout.width * scale) / 2,
            (h - layout.height * scale) / 2,
          )
          .scale(scale),
      );
    }
    function focus() {
      const node = layout?.nodes.find((node) => node.id === selected);
      if (!node) return fit();
      const scale = Math.min(1, viewport.clientWidth / 310);
      selection.call(
        zoom.transform,
        d3.zoomIdentity
          .translate(
            viewport.clientWidth / 2 - node.x * scale,
            viewport.clientHeight / 2 - node.y * scale,
          )
          .scale(scale),
      );
    }
    function expand() {
      shell.classList.toggle("is-expanded");
      const expanded = shell.classList.contains("is-expanded");
      expandButton.setAttribute("aria-pressed", String(expanded));
      expandButton.setAttribute(
        "aria-label",
        expanded ? "Collapse relationship graph" : "Expand relationship graph",
      );
      requestAnimationFrame(fit);
    }
    const expandButton = button(
      "Expand relationship graph",
      "maximize-2",
      expand,
    );
    controls.append(
      button("Zoom relationship graph in", "plus", () =>
        selection.call(zoom.scaleBy, 1.4),
      ),
      button("Zoom relationship graph out", "minus", () =>
        selection.call(zoom.scaleBy, 1 / 1.4),
      ),
      button("Focus current concept", "locate-fixed", focus),
      button("Fit relationship graph", "scan", fit),
      expandButton,
    );
    const onKey = (event) => {
      if (event.key === "Escape" && shell.classList.contains("is-expanded")) {
        event.stopPropagation();
        expand();
      }
    };
    document.addEventListener("keydown", onKey, true);
    const resize = new ResizeObserver(fit);
    resize.observe(viewport);
    window.lucide?.createIcons();
    function update(data) {
      worker?.terminate();
      layout = null;
      selected = data.selectedId;
      group.replaceChildren();
      delete shell.dataset.nodeCount;
      delete shell.dataset.edgeCount;
      count.textContent = `Arranging ${data.nodes.length} nodes / ${data.edges.length} relations`;
      const taskWorker = new Worker(workerUrl);
      worker = taskWorker;
      taskWorker.onmessage = ({ data: next }) => {
        if (worker !== taskWorker) return;
        taskWorker.terminate();
        worker = null;
        if (next.error) {
          count.textContent = "Relationship diagram unavailable";
          return;
        }
        layout = next;
        count.textContent = `${data.nodes.length} nodes / ${data.edges.length} relations`;
        shell.dataset.nodeCount = String(data.nodes.length);
        shell.dataset.edgeCount = String(data.edges.length);
        for (const edge of next.edges) {
          const category = edge.category || "proof";
          const path = svgElement("path", {
            d: d3
              .line()
              .x((p) => p.x)
              .y((p) => p.y)
              .curve(d3.curveBasis)(edge.points),
            fill: "none",
            stroke: colors[category],
            "stroke-width": category === "proof" ? 1.7 : 1.25,
            "stroke-dasharray":
              category === "affinity"
                ? "5 4"
                : category === "document"
                  ? "2 4"
                  : "",
            "marker-end":
              category === "affinity"
                ? ""
                : `url(#relation-arrow-${instance}-${category})`,
          });
          const title = svgElement("title");
          title.textContent = edge.layer || category;
          path.append(title);
          group.append(path);
        }
        for (const node of next.nodes) {
          const current = node.id === selected;
          const item = svgElement("g", {
            transform: `translate(${node.x - 95} ${node.y - 34})`,
            role: "button",
            tabindex: "0",
            "aria-label": node.human_title || node.title || node.id,
            class: `relation-map-node${current ? " is-selected" : ""}`,
            "data-node-id": node.id,
          });
          const name = node.human_title || node.title || node.id;
          const title = svgElement("title");
          title.textContent = name;
          item.append(
            title,
            svgElement("rect", { width: 190, height: 68, rx: 5 }),
          );
          const lines = wrapTitle(name);
          lines.forEach((line, i) => {
            const text = svgElement("text", {
              x: 13,
              y: 34 - (lines.length - 1) * 7 + i * 14,
            });
            text.textContent = line;
            item.append(text);
          });
          item.addEventListener("click", () => onSelect?.(node.id));
          item.addEventListener("keydown", (event) => {
            if (["Enter", " "].includes(event.key)) {
              event.preventDefault();
              onSelect?.(node.id);
            }
          });
          group.append(item);
        }
        fit();
      };
      taskWorker.onerror = () => {
        if (worker !== taskWorker) return;
        taskWorker.terminate();
        worker = null;
        count.textContent = "Relationship diagram unavailable";
      };
      taskWorker.postMessage({
        nodes: data.nodes.map((n) => ({
          id: n.id,
          title: n.human_title || n.title || n.id,
        })),
        edges: data.edges.map((e) => ({
          source: e.source,
          target: e.target,
          category: e.category,
          layer: e.layer,
        })),
      });
    }
    return {
      update,
      destroy() {
        worker?.terminate();
        resize.disconnect();
        selection.on(".zoom", null);
        document.removeEventListener("keydown", onKey, true);
        shell.remove();
      },
    };
  }
  window.TrureturingRelationMap = Object.freeze({ mount });
})();
