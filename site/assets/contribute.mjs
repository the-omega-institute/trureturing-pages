import { ready, t, languageURL, locale } from './i18n.mjs';
await ready;
const repo = 'https://github.com/the-omega-institute/trureturing';
const routes = {
  library: ['Explore the knowledge graph ↗', 'atlas.html', 'Help me extend the mathematical library with a useful result or a justified connection between existing results. Search D5 and the pinned mathlib for reuse before proposing a new proof.'],
  problem: ['Browse curated questions ↗', 'conjectures.html', 'Help me investigate a question from the research catalogue. Check its exact source, assumptions, and literature status. Follow the repository preregistration rules before probing a proposed open-problem resolution.'],
  theory: ['Explore the library ↗', 'knowledge/', 'Help me bring a paper or theory into the library through its existing theory-ingest and digestion workflow. Establish the source and license, reuse existing atoms, and distinguish ingestion from proof.'],
  improve: ['Read recent research ↗', 'research.html', 'Help me improve one explanation, source reference, or tool in the repository. Find the owning source, preserve the mathematical assumptions, and keep the change focused.'],
};
const target = document.querySelector('#contribution-target');
const prompt = document.querySelector('#agent-prompt');
const browse = document.querySelector('#browse-work');
const status = document.querySelector('#copy-status');
const copy = document.querySelector('#copy-prompt');
function update() {
  const [label, path, task] = routes[document.querySelector('[name=kind]:checked').value];
  browse.textContent = t(label);
  browse.href = languageURL(path, locale);
  prompt.value = `Open ${repo} on branch dev. Read AGENTS.md and docs/CONTRIBUTING.md, then follow the relevant repository skills.

${task}

${target.value.trim() ? 'My starting point: ' + target.value.trim() : 'Help me choose a small, useful starting point before implementation.'}

Work in an isolated checkout. Follow the current repository admission rules, run appropriate checks, and arrange independent review. Prepare a focused pull request to dev explaining the change, reuse search where applicable, evidence, and producer/reviewer provenance. State unresolved or unverified claims honestly. A green build alone does not establish that an informal question was solved.`;
  status.textContent = t('Paste into your coding agent.');
}
document.querySelector('#contribution-kind').addEventListener('change', update);
target.addEventListener('input', update);
copy.hidden = false;
copy.addEventListener('click', async () => {
  const text = prompt.value;
  try {
    await navigator.clipboard.writeText(text);
    if (prompt.value === text) status.textContent = t('Copied. Paste into your coding agent.');
  } catch {
    prompt.focus(); prompt.select();
    status.textContent = t('Instructions selected. Copy with Ctrl+C or ⌘C.');
  }
});
update();
