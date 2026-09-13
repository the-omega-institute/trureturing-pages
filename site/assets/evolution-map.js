export function mountEvolution(host, { onSelect }) {
  const canvas = document.createElement("canvas"),
    tooltip = document.createElement("div");
  canvas.setAttribute(
    "aria-label",
    "Mathematical dependency and release lineage",
  );
  canvas.setAttribute("role", "img");
  tooltip.className = "evolution-tooltip";
  tooltip.hidden = true;
  host.append(canvas, tooltip);
  const ctx = canvas.getContext("2d"),
    d3 = window.d3;
  let scene,
    selected,
    changesOnly = false, changedIds = new Set(), reusedIds = new Set(),
    selectedIds = new Set(),
    size = { width: 1, height: 1 },
    transform = d3.zoomIdentity,
    positions,
    hover;
  const zoom = d3
    .zoom()
    .scaleExtent([0.08, 8])
    .on("zoom", (event) => {
      transform = event.transform;
      draw();
    });
  const selection = d3.select(canvas).call(zoom).on("dblclick.zoom", null);
  const radius = (node) => 3.5 + Math.log2(node.nodes.length + 1) * 1.25;
  function draw() {
    const ratio = Math.min(devicePixelRatio || 1, 2);
    ctx.setTransform(ratio, 0, 0, ratio, 0, 0);
    ctx.fillStyle = "#0a1012";
    ctx.fillRect(0, 0, size.width, size.height);
    if (!scene) return;
    ctx.save();
    ctx.translate(transform.x, transform.y);
    ctx.scale(transform.k, transform.k);
    const selectedGroups = new Set(
      scene.nodes
        .filter((n) => n.nodes.some((m) => selectedIds.has(m.id)))
        .map((n) => n.id),
    );
    if(scene.kind==='time') {
      const x=120+scene.selectedObservation*260;
      ctx.fillStyle='#7ec9b018';ctx.fillRect(x-95,0,190,Math.max(...scene.nodes.map(n=>n.y))+45);
      ctx.strokeStyle='#79bfa8';ctx.lineWidth=2/transform.k;ctx.beginPath();ctx.moveTo(x,0);ctx.lineTo(x,Math.max(...scene.nodes.map(n=>n.y))+45);ctx.stroke();
    }
    for (const lane of scene.lanes) {
      ctx.strokeStyle = "#1c2c2e";
      ctx.lineWidth = 0.7 / transform.k;
      ctx.beginPath();
      ctx.moveTo(30, lane.y + 125);
      ctx.lineTo(Math.max(...scene.nodes.map((n) => n.x)) + 120, lane.y + 125);
      ctx.stroke();
    }
    for (const edge of scene.edges) {
      const a = positions.get(edge.source),
        b = positions.get(edge.target),
        active = selectedGroups.has(a.id) && selectedGroups.has(b.id);
      const changed=edge.pairs?.some(([a,b])=>changedIds.has(a)||changedIds.has(b));
      const inStep=scene.kind==='dependency'||b.observation===scene.selectedObservation;
      ctx.globalAlpha = selected ? (active ? 0.78 : 0.045) : changesOnly ? (changed && inStep ? .55 : .035) : .22;
      const introduced = (scene.kind === 'dependency' || b.observation === scene.selectedObservation) &&
        edge.pairs?.some(pair=>scene.addedEdges?.has(JSON.stringify(pair)));
      ctx.strokeStyle = introduced ? '#e8c474' : active ? "#cae6ca" : a.color;
      if (introduced && !selected) ctx.globalAlpha = .65;
      ctx.setLineDash(
        edge.kind === "new-dependency"
          ? [5 / transform.k, 4 / transform.k]
          : [],
      );
      ctx.lineWidth =
        Math.min(7, 0.7 + Math.log2(edge.count + 1) * 0.65) /
        Math.sqrt(transform.k);
      const mid = (a.x + b.x) / 2;
      ctx.beginPath();
      ctx.moveTo(a.x, a.y);
      ctx.bezierCurveTo(mid, a.y, mid, b.y, b.x, b.y);
      ctx.stroke();
      // A small midpoint arrow makes prerequisite → consumer readable on a selected path.
      if (active && selected) {
        const x=(a.x+b.x)/2,y=(a.y+b.y)/2;
        const angle=Math.atan2(b.y-a.y,(b.x-a.x)/2),length=5/transform.k;
        ctx.save();ctx.translate(x,y);ctx.rotate(angle);ctx.setLineDash([]);
        ctx.beginPath();ctx.moveTo(-length,-length*.6);ctx.lineTo(0,0);ctx.lineTo(-length,length*.6);ctx.stroke();ctx.restore();
      }
    }
    ctx.setLineDash([]);
    for (const node of scene.nodes) {
      const active = selectedGroups.has(node.id),
        isSelected = node.nodes.some((n) => n.id === selected);
      const inStep=scene.kind==='dependency'||node.observation===scene.selectedObservation;
      const changed=node.nodes.some(n=>changedIds.has(n.id));
      ctx.globalAlpha = selected ? (active ? 1 : .22) : changesOnly ? (changed && inStep ? 1 : .18) : 1;
      ctx.fillStyle = node.color;
      ctx.beginPath();
      ctx.arc(node.x, node.y, radius(node), 0, Math.PI * 2);
      ctx.fill();
      if (node.addedCount > 0) {
        ctx.strokeStyle = "#e8c474";
        ctx.lineWidth = 2 / transform.k;
        ctx.beginPath();
        ctx.arc(node.x, node.y, radius(node) + 6 / transform.k, 0, Math.PI * 2);
        ctx.stroke();
      }
      if(inStep && node.nodes.some(n=>reusedIds.has(n.id))) {
        ctx.strokeStyle='#78cbb6';ctx.lineWidth=2/transform.k;ctx.beginPath();ctx.arc(node.x,node.y,radius(node)+10/transform.k,0,Math.PI*2);ctx.stroke();
      }
      if (isSelected || node === hover) {
        ctx.strokeStyle = "#f1faf5";
        ctx.lineWidth = 1.2 / transform.k;
        ctx.beginPath();
        ctx.arc(node.x, node.y, radius(node) + 4 / transform.k, 0, Math.PI * 2);
        ctx.stroke();
      }
    }
    ctx.globalAlpha = 1;
    ctx.restore();
    // Labels reserve screen space independently of zoom.
    const boxes = [],
      candidates = scene.nodes
        .slice()
        .sort(
          (a, b) =>
            (b.nodes.some((n) => n.id === selected) ? 1 : 0) -
              (a.nodes.some((n) => n.id === selected) ? 1 : 0) ||
            b.nodes.length - a.nodes.length,
        );
    ctx.font = "11px Arial";
    if(scene.kind==='time') {
      for(const i of new Set(scene.nodes.map(n=>n.observation))) {
        const [x]=transform.apply([120+i*260,0]);ctx.fillStyle=i===scene.selectedObservation?'#d8ede3':'#809995';ctx.fillText(`O${i+1}${i===scene.selectedObservation?' · selected':''}`,x-15,18);
      }
    }
    for (const node of candidates) {
      if(scene.kind==='time' && node.observation!==scene.selectedObservation)continue;
      if (selected && !selectedGroups.has(node.id)) continue;
      const [mappedX, y] = transform.apply([node.x, node.y]);
      const x = scene.kind === "time" ? 4 : mappedX;
      if (x < 0 || y < 12 || x > size.width - 30 || y > size.height - 10)
        continue;
      if (
        transform.k < 0.45 &&
        node.nodes.length < 8 &&
        !node.nodes.some((n) => n.id === selected)
      )
        continue;
      let title = node.title;
      if (title.length > 31) title = title.slice(0, 29) + "...";
      const w = ctx.measureText(title).width + 12,
        box = { x: x + 8, y: y - 17, w, h: 17 };
      if (
        box.x + w > size.width ||
        boxes.some(
          (b) =>
            box.x < b.x + b.w &&
            box.x + w > b.x &&
            box.y < b.y + b.h &&
            box.y + box.h > b.y,
        )
      )
        continue;
      boxes.push(box);
      ctx.fillStyle = "#0a1012e6";
      ctx.fillRect(box.x - 2, box.y - 2, w, 17);
      ctx.fillStyle = node.color;
      ctx.fillText(title, box.x, box.y + 10);
    }
  }
  function fit() {
    if (!scene?.nodes.length) return;
    const xs = scene.nodes.map((n) => n.x),
      ys = scene.nodes.map((n) => n.y),
      minX = Math.min(...xs) - 50,
      maxX = Math.max(...xs) + 140,
      minY = Math.min(...ys) - 35,
      maxY = Math.max(...ys) + 40,
      k = Math.min(
        (size.width - 40) / (maxX - minX),
        (size.height - 50) / (maxY - minY),
        1.7,
      );
    selection.call(
      zoom.transform,
      d3.zoomIdentity
        .translate(
          (size.width - k * (minX + maxX)) / 2,
          (size.height - k * (minY + maxY)) / 2,
        )
        .scale(k),
    );
  }
  const observer = new ResizeObserver(() => {
    size = { width: host.clientWidth, height: host.clientHeight };
    const ratio = Math.min(devicePixelRatio || 1, 2);
    canvas.width = Math.round(size.width * ratio);
    canvas.height = Math.round(size.height * ratio);
    canvas.style.width = size.width + "px";
    canvas.style.height = size.height + "px";
    fit();
    draw();
  });
  observer.observe(host);
  function hit(event) {
    if (!scene) return null;
    const bounds = canvas.getBoundingClientRect(),
      [x, y] = transform.invert([
        event.clientX - bounds.left,
        event.clientY - bounds.top,
      ]);
    return scene.nodes.reduce((nearest, n) => {
      const distance = Math.hypot(n.x - x, n.y - y);
      return distance < Math.max(radius(n) + 3, 12 / transform.k) &&
        (!nearest || distance < nearest.distance)
        ? { node: n, distance }
        : nearest;
    }, null)?.node;
  }
  canvas.addEventListener("pointermove", (event) => {
    hover = hit(event);
    canvas.style.cursor = hover ? "pointer" : "grab";
    tooltip.hidden = !hover;
    if (hover) {
      tooltip.textContent = (hover.hint || `${hover.title} / ${hover.nodes.length} modules`) +
        (hover.addedCount ? ` Includes ${hover.addedCount} newly present modules.` : "");
      tooltip.style.left =
        Math.max(4, Math.min(event.offsetX + 14, size.width - 220)) + "px";
      tooltip.style.top = Math.max(8, event.offsetY - 38) + "px";
    }
    draw();
  });
  canvas.addEventListener("pointerleave", () => {
    hover = null;
    tooltip.hidden = true;
    draw();
  });
  canvas.addEventListener("click", (event) => {
    const node = hit(event);
    if (node) onSelect(node);
  });
  return {
    update(next, { selectedId, ids = new Set(), reset = false, changesOnly: nextChanges = false, changedIds: nextIds = new Set(), reusedIds: nextReuse = new Set() } = {}) {
      scene = next; changesOnly=nextChanges;changedIds=nextIds;reusedIds=nextReuse;
      positions = new Map(scene.nodes.map((n) => [n.id, n]));
      selected = selectedId;
      selectedIds = ids;
      if (reset) fit();
      draw();
    },
    fit,
    zoomBy(factor) {
      selection.call(zoom.scaleBy, factor);
    },
    destroy() {
      observer.disconnect();
      selection.on(".zoom", null);
      canvas.remove();
      tooltip.remove();
    },
  };
}
