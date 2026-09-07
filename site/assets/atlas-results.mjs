let catalog;

export async function appendRecentResults(root, nodes, recorded = new Map()) {
  const section = document.createElement("section");
  section.className = "frontier-results";
  section.setAttribute("aria-label", "Recent resolutions");
  root.append(section);
  try {
    catalog ||= fetch(new URL("./research-news.json", import.meta.url)).then(
      (response) => {
        if (!response.ok)
          throw new Error(`Research news HTTP ${response.status}`);
        return response.json();
      },
    );
    const { results } = await catalog;
    const heading = document.createElement("h3");
    heading.className = "section-label spaced";
    heading.textContent = "RECENT RESOLUTIONS / UPSTREAM";
    section.append(heading);
    for (const item of results) {
      const link = document.createElement("a");
      link.className = "concept-row";
      link.href = `research.html#${item.id}`;
      const copy = document.createElement("span");
      const title = document.createElement("strong");
      title.textContent = item.title;
      const state = document.createElement("small");
      const present = nodes.some(
        (node) =>
          node.repo_path === `${item.module}.lean` || node.id === item.module,
      );
      state.textContent = `${item.kind === "proved" ? "Proved" : "Refuted"} in Lean / ${item.date} / ${present ? "module in current release" : "awaiting Truth release"}`;
      copy.append(title, state);
      link.append(copy);
      section.append(link);
    }
    for (const problem of recorded.values()) {
      if (results.some(item => `${item.module}.${item.declaration}` === problem.resolution.declaration_gid)) continue;
      const link = document.createElement("a");
      link.className = "concept-row";
      link.href = `research.html#${problem.slug}`;
      const copy = document.createElement("span");
      const title = document.createElement("strong");
      title.textContent = problem.title;
      const status = document.createElement("small");
      status.textContent = `Source-recorded ${problem.resolution.kind} / current release snapshot`;
      copy.append(title, status);
      link.append(copy);
      section.append(link);
    }
  } catch {
    catalog = null;
    const link = document.createElement("a");
    link.className = "research-link";
    link.href = "research.html#results";
    link.textContent = "Recent resolutions";
    section.append(link);
  }
}
