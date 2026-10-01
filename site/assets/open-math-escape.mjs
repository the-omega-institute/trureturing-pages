/** Intrinsic catalog escape on two Hankel sequences with the same leading rate and distinct next-order constants. */
import { ready, t } from "./i18n.mjs";
await ready;
const lab = document.querySelector(".escape-lab");
const buttons = [...lab.querySelectorAll("[data-escape]")];
const states = {
  base: {
    coordinate: "Leading growth",
    values: ["log 4", "log 4"],
    rate: "100%",
    explanation: "Both sequences give the same leading rate.",
  },
  rename: {
    coordinate: "Renamed leading rate",
    values: ["A", "A"],
    rate: "100%",
    explanation: "A new name still gives the same answer.",
  },
  refine: {
    coordinate: "Next-order constant",
    values: ["c₁", "4c₁"],
    rate: "0%",
    explanation:
      "Now distinct. Remove the next-order term and they look the same again.",
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
