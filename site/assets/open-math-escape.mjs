/** Target-relative escape on exactly two graphs: C6 and two disjoint triangles. */
import { ready, t } from "./i18n.mjs";
await ready;
const lab = document.querySelector(".escape-lab");
const buttons = [...lab.querySelectorAll("[data-escape]")];
const states = {
  base: {
    coordinate: "Degree sequence",
    values: ["(2,2,2,2,2,2)", "(2,2,2,2,2,2)"],
    rate: "2 / 2",
    explanation: "The same readout hides opposite connectedness answers.",
  },
  rename: {
    coordinate: "Renamed degree sequence",
    values: ["A", "A"],
    rate: "2 / 2",
    explanation: "The name changes. The two graphs remain indistinguishable.",
  },
  refine: {
    coordinate: "Added triangle count",
    values: ["0", "2"],
    rate: "0 / 2",
    explanation:
      "Triangle count separates the pair; connectedness is recoverable in this arena.",
  },
};
function show(mode) {
  const state = states[mode];
  lab.dataset.escapeMode = mode;
  for (const button of buttons)
    button.setAttribute("aria-pressed", String(button.dataset.escape === mode));
  document.getElementById("escape-coordinate").textContent = t(
    state.coordinate,
  );
  document.getElementById("escape-left").textContent = state.values[0];
  document.getElementById("escape-right").textContent = state.values[1];
  document.getElementById("escape-rate").textContent = state.rate;
  document.getElementById("escape-explanation").textContent = t(
    state.explanation,
  );
}
for (const button of buttons) {
  button.disabled = false;
  button.addEventListener("click", () => show(button.dataset.escape));
}
let printMode;
addEventListener("beforeprint", () => {
  printMode = lab.dataset.escapeMode;
  show("base");
});
addEventListener("afterprint", () => {
  if (printMode) show(printMode);
});
