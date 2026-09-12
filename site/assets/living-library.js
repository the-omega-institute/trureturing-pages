import "./living-library-release.js";

const home = document.querySelector('.research-home');
if (home?.hasAttribute('data-reading-home')) {
  // The first viewport is server-rendered. Expensive notebook enhancement is explicit.
  const shell = document.querySelector('[data-notebook-shell]');
  const slot = document.getElementById('research-workbench-slot');
  let task;
  function loadNotebook() {
    return task ||= import('./research-workbench.mjs').then(async ({mountResearchWorkbench}) => {
      await mountResearchWorkbench();
      const workbench = document.getElementById('research-workbench');
      if (workbench) slot.replaceChildren(workbench);
      dispatchEvent(new Event('reading-notebook-ready'));
    }).catch(error => {
      const message = document.createElement('p'); message.setAttribute('role','status');
      message.textContent = 'The notebook could not load. The source dossiers above remain available.';
      const retry = document.createElement('button'); retry.type='button';retry.textContent='Retry notebook';
      retry.addEventListener('click', () => {task=null;loadNotebook();});
      slot.replaceChildren(message, retry);
    });
  }
  function routeNotebook() {
    const h = location.hash.slice(1), p = new URLSearchParams(h);
    const notebookRoute = [...p.keys()].some(k => ['rp','rq','ra','rk','rh','rs','rl','ro','rw'].includes(k)) ||
      ['research-bank','research-workbench'].includes(h);
    if (notebookRoute) {shell.open=true;loadNotebook();}
  }
  shell.addEventListener('toggle', () => {if(shell.open) loadNotebook();});
  addEventListener('hashchange', routeNotebook); routeNotebook();
} else if (home) {
  // Older generated pages remain compatible until their renderer refresh is deployed.
  import('./research-workbench.mjs').then(({mountResearchWorkbench}) => mountResearchWorkbench()).catch(() => {});
  import('./millennium.mjs').then(({mountMillenniumEntry}) => mountMillenniumEntry()).catch(() => {});
}
