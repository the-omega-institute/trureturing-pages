// Existing release/history handlers remain byte-for-byte unchanged in this module.
import "./living-library-release.js";

// Research enrichment is optional and cannot prevent the source dossiers from loading.
if (document.querySelector(".research-home")) {
  import("./research-workbench.mjs")
    .then(({ mountResearchWorkbench }) => mountResearchWorkbench())
    .catch(() => {
      const message = document.createElement("p");
      message.className = "rw-load-error";
      message.setAttribute("role", "status");
      message.textContent = "The research workbench is unavailable. Release-bound dossiers remain available below.";
      document.querySelector(".research-home").prepend(message);
    });
}
