/** A finite, explicitly scoped illustration; not measurements of the research cases. */
import { ready, t } from "./i18n.mjs";
await ready;
const lab = document.querySelector(".escape-lab");
const buttons = [...lab.querySelectorAll("[data-escape]")];
const explanations = {
  base: "Two unresolved pairs, counted in both directions.",
  rename: "Relabeling changes no distinctions. The rate stays the same.",
  refine: "One pair is separated. One unresolved pair remains.",
};
function show(mode) {
  lab.dataset.escapeMode = mode;
  for (const button of buttons)
    button.setAttribute("aria-pressed", String(button.dataset.escape === mode));
  document.getElementById("escape-rate").textContent =
    mode === "refine" ? "2 / 12" : "4 / 12";
  document.getElementById("escape-explanation").textContent = t(
    explanations[mode],
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
