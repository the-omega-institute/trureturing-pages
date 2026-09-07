import { METRICS, trajectory } from "./architecture-core.mjs";

const el = (tag, className, text) => {
  const item = document.createElement(tag);
  if (className) item.className = className;
  if (text !== undefined) item.textContent = text;
  return item;
};
const percent = (value) => `${(value * 100).toFixed(2)}%`;
const delta = (value) =>
  value === null ? "--" : `${value > 0 ? "+" : ""}${value}`;
export function metricFacts(root, metrics) {
  const facts = el("dl", "architecture-facts");
  for (const [key, name] of [
    ...Object.entries(METRICS),
    ["depth", "Dependency depth"],
  ]) {
    const item = el("div");
    item.append(
      el("dt", "", name),
      el("dd", "", metrics[key].toLocaleString()),
    );
    facts.append(item);
  }
  root.append(
    facts,
    el(
      "p",
      "architecture-share",
      `${percent(metrics.share)} of this release downstream`,
    ),
  );
}

export function domainDistribution(root, metrics, onDomain) {
  const section = el("details", "architecture-domains");
  section.open = true;
  section.append(el("summary", "", `Downstream domains / ${metrics.coverage}`));
  if (!metrics.domains.length)
    section.append(el("p", "muted", "No downstream modules in this release."));
  const max = metrics.domains[0]?.[1] || 1;
  for (const [domain, count] of metrics.domains) {
    const row = el(onDomain ? "button" : "div", "architecture-domain");
    if (onDomain) {
      row.type = "button";
      row.title = `Show downstream modules in ${domain}`;
      row.addEventListener("click", () => onDomain(domain));
    }
    const bar = el("span", "architecture-domain-bar");
    bar.style.width = `${(count / max) * 100}%`;
    row.append(
      bar,
      el("span", "", domain.replace(/([a-z])([A-Z])/g, "$1 $2")),
      el("strong", "", count.toLocaleString()),
    );
    section.append(row);
  }
  root.append(section);
}

export function evolutionPanel(
  root,
  snapshots,
  id,
  { metric = "reach", error = null } = {},
) {
  const section = el("section", "architecture-evolution");
  section.append(el("h3", "section-label spaced", "EVOLUTION"));
  root.append(section);
  if (error) {
    section.append(el("p", "architecture-error", error));
    return;
  }
  if (!snapshots.length) {
    section.append(el("p", "muted", "Loading verified release history..."));
    return;
  }
  const points = trajectory(snapshots, id);
  let cursor = points.length - 1,
    selectedMetric = metric,
    normalized = false;
  const controls = el("div", "architecture-history-controls");
  const select = el("select");
  select.setAttribute("aria-label", "Evolution metric");
  for (const [key, name] of Object.entries(METRICS)) {
    const option = el("option", "", name);
    option.value = key;
    select.append(option);
  }
  select.value = selectedMetric;
  const label = el("label", "", "Release share");
  const checkbox = el("input");
  checkbox.type = "checkbox";
  label.prepend(checkbox);
  controls.append(select, label);
  section.append(controls);
  const chart = el("div", "architecture-chart");
  const slider = el("input", "architecture-scrubber");
  slider.type = "range";
  slider.min = "0";
  slider.max = String(points.length - 1);
  slider.step = "1";
  slider.value = String(cursor);
  slider.disabled = points.length === 1;
  slider.setAttribute("aria-label", "Release observation");
  const detail = el("div", "architecture-observation");
  detail.setAttribute("aria-live", "polite");
  section.append(chart, slider, detail);
  if (points.length === 1)
    section.append(
      el(
        "p",
        "architecture-baseline",
        "Baseline recorded / one published snapshot",
      ),
    );
  const tableDetails = el("details", "architecture-history-table");
  tableDetails.append(
    el("summary", "", `Release observations / ${points.length}`),
  );
  const table = el("table"),
    head = el("thead"),
    tr = el("tr");
  for (const name of [
    "Release",
    "Support",
    "Reuse",
    "Domains",
    "Share",
    "Event",
  ])
    tr.append(el("th", "", name));
  head.append(tr);
  table.append(head);
  const tbody = el("tbody");
  points.forEach((point) => {
    const row = el("tr");
    const name = el("td");
    const button = el(
      "button",
      "",
      `${point.index + 1} / ${point.release.slice(7, 15)}`,
    );
    button.type = "button";
    button.addEventListener("click", () => {
      cursor = point.index;
      slider.value = String(cursor);
      render();
    });
    name.append(button);
    row.append(name);
    for (const text of [
      point.node?.reach ?? "--",
      point.node?.direct ?? "--",
      point.node?.coverage ?? "--",
      point.node ? percent(point.node.share) : "--",
      point.event,
    ])
      row.append(el("td", "", text));
    tbody.append(row);
  });
  table.append(tbody);
  tableDetails.append(table);
  section.append(tableDetails);
  function value(point) {
    if (!point.node) return null;
    if (!normalized) return point.node[selectedMetric];
    const denominator =
      selectedMetric === "coverage"
        ? snapshots[point.index].domain_count
        : Math.max(1, snapshots[point.index].nodes.length - 1);
    return (point.node[selectedMetric] / denominator) * 100;
  }
  function render() {
    const point = points[cursor];
    chart.replaceChildren();
    detail.replaceChildren();
    detail.append(
      el(
        "strong",
        "",
        `Observation ${cursor + 1} / ${points.length} / ${point.event}`,
      ),
    );
    const code = el("code", "", point.release);
    code.title = point.graph;
    detail.append(code);
    if (point.node)
      detail.append(
        el(
          "p",
          "",
          `${point.node.reach} supported / ${point.node.direct} direct / ${point.node.coverage} domains`,
        ),
        el(
          "small",
          "",
          `Support change ${delta(point.reachDelta)} / share change ${point.shareDelta === null ? "--" : `${delta(Number((point.shareDelta * 100).toFixed(2)))} pp`}`,
        ),
      );
    else detail.append(el("p", "", "Node absent from this release"));
    if (!globalThis.d3) return;
    const width = 520,
      height = 210,
      d3 = globalThis.d3;
    const x = d3
      .scaleLinear()
      .domain(points.length === 1 ? [-1, 1] : [0, points.length - 1])
      .range([48, width - 18]);
    const y = d3
      .scaleLinear()
      .domain([0, Math.max(1, ...points.map((p) => value(p) || 0))])
      .nice()
      .range([height - 30, 18]);
    const svg = d3
      .select(chart)
      .append("svg")
      .attr("viewBox", `0 0 ${width} ${height}`)
      .attr("role", "img")
      .attr(
        "aria-label",
        `${METRICS[selectedMetric]} across ${points.length} published observations${normalized ? " as release share" : ""}`,
      );
    svg
      .append("g")
      .attr("transform", "translate(48,0)")
      .call(
        d3
          .axisLeft(y)
          .ticks(4)
          .tickFormat((v) => (normalized ? `${v}%` : d3.format("~s")(v))),
      )
      .call((g) => g.select(".domain").remove());
    svg
      .append("g")
      .attr("transform", `translate(0,${height - 30})`)
      .call(
        d3
          .axisBottom(x)
          .tickValues(
            points.length > 6
              ? [
                  ...new Set([
                    0,
                    Math.floor((points.length - 1) / 2),
                    points.length - 1,
                  ]),
                ]
              : points.map((p) => p.index),
          )
          .tickFormat((i) => `R${i + 1}`),
      );
    const line = d3
      .line()
      .x((p) => x(p.index))
      .y((p) => y(value(p)));
    for (let i = 1; i < points.length; i++)
      if (points[i].comparable && points[i].node && points[i - 1].node)
        svg
          .append("path")
          .attr("d", line([points[i - 1], points[i]]))
          .attr("class", "evolution-line");
    svg
      .selectAll("circle")
      .data(points.filter((p) => p.node))
      .join("circle")
      .attr("cx", (p) => x(p.index))
      .attr("cy", (p) => y(value(p)))
      .attr("r", (p) => (p.index === cursor ? 5 : 3))
      .attr("class", (p) => (p.index === cursor ? "is-current" : null))
      .attr("tabindex", "0")
      .attr("role", "button")
      .attr(
        "aria-label",
        (p) =>
          `Observation ${p.index + 1}: ${normalized ? value(p).toFixed(2) + "%" : value(p)}`,
      )
      .on("click", (_, p) => {
        cursor = p.index;
        slider.value = String(cursor);
        render();
      })
      .on("keydown", (event, p) => {
        if (["Enter", " "].includes(event.key)) {
          event.preventDefault();
          cursor = p.index;
          slider.value = String(cursor);
          render();
        }
      })
      .append("title")
      .text(
        (p) =>
          `${p.release}\n${METRICS[selectedMetric]}: ${value(p)}\n${p.event}`,
      );
    slider.setAttribute(
      "aria-valuetext",
      `Observation ${cursor + 1}: ${point.release}`,
    );
  }
  select.addEventListener("change", () => {
    selectedMetric = select.value;
    render();
  });
  checkbox.addEventListener("change", () => {
    normalized = checkbox.checked;
    render();
  });
  slider.addEventListener("input", () => {
    cursor = Number(slider.value);
    render();
  });
  render();
}
