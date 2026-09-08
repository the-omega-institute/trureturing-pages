const copy = document.querySelector("[data-copy-theorem]");
if (copy && navigator.clipboard?.writeText) {
  copy.hidden = false;
  copy.addEventListener("click", async () => {
    const status = document.querySelector(".result-copy-status");
    try {
      await navigator.clipboard.writeText(document.querySelector("#result-theorem").textContent);
      status.textContent = "Theorem copied.";
    } catch {
      status.textContent = "Copy unavailable. The Lean source is available to download.";
    }
  });
}
