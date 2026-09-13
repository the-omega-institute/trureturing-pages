// A presentation layer over authored questions. Scrolling never changes proof status.
const root = document.querySelector('.research-journey');
if (root?.querySelector('[data-guided-route]')) {
  const routes = [...root.querySelectorAll('[data-guided-route]')];
  const choices = [...root.querySelectorAll('[data-route-choice]')];
  const reduced = matchMedia('(prefers-reduced-motion: reduce)');
  const desktop = matchMedia('(min-width: 961px)');
  let selected, frame = 0;
  const states = new Map();
  function emphasize(route, stage) {
    const state = states.get(route);
    state.stage = stage;
    route.dataset.readingStage = String(stage);
    route.querySelectorAll('[data-route-step]').forEach(button => button.setAttribute('aria-pressed', String(Number(button.dataset.routeStep) === stage)));
    const box = state.map.getBoundingClientRect();
    const active = state.nodes.filter(n => stage === 2 || Number(n.dataset.stage) === stage).map(n => n.getBoundingClientRect());
    const x = Math.min(...active.map(n => n.left)) - box.left - 8;
    const y = Math.min(...active.map(n => n.top)) - box.top - 8;
    Object.assign(state.focus.style, {
      transform: `translate(${x}px,${y}px)`,
      width: `${Math.max(...active.map(n => n.right)) - box.left - x + 8}px`,
      height: `${Math.max(...active.map(n => n.bottom)) - box.top - y + 8}px`,
    });
    for (const path of state.svg.children) path.toggleAttribute('data-active', Number(path.dataset.stage) === stage);
  }
  function geometry(route) {
    if (route.hidden) return;
    const state = states.get(route), box = state.map.getBoundingClientRect();
    state.svg.setAttribute('viewBox', `0 0 ${box.width} ${box.height}`);
    state.svg.replaceChildren();
    const node = key => state.nodes.find(n => n.dataset.routeNode === key).getBoundingClientRect();
    const mobile = matchMedia('(max-width: 650px)').matches;
    state.nodes.filter(n => n.dataset.routeNode.startsWith('target-')).forEach(target => {
      for (const [from, to, stage] of [['result', target.dataset.routeNode, 1], [target.dataset.routeNode, 'horizon', 2]]) {
        const a = node(from), b = node(to);
        const x1 = (mobile ? a.left + a.width / 2 : a.right) - box.left;
        const y1 = (mobile ? a.bottom : a.top + a.height / 2) - box.top;
        const x2 = (mobile ? b.left + b.width / 2 : b.left) - box.left;
        const y2 = (mobile ? b.top : b.top + b.height / 2) - box.top;
        const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
        path.dataset.stage = String(stage);
        path.setAttribute('d', mobile ? `M${x1},${y1} C${x1},${(y1+y2)/2} ${x2},${(y1+y2)/2} ${x2},${y2}` : `M${x1},${y1} C${(x1+x2)/2},${y1} ${(x1+x2)/2},${y2} ${x2},${y2}`);
        state.svg.append(path);
      }
    });
    emphasize(route, state.stage);
  }
  function select(route) {
    if (!route) return;
    selected = route;
    for (const item of routes) item.hidden = item !== route;
    for (const choice of choices) {
      if (choice.dataset.routeChoice === route.id) choice.setAttribute('aria-current', 'true');
      else choice.removeAttribute('aria-current');
    }
    geometry(route);
  }
  for (const route of routes) {
    const map = route.querySelector('.route-map');
    const chapters = [...route.querySelectorAll('[data-route-chapter]')];
    states.set(route, {map, chapters, nodes: [...map.querySelectorAll('[data-route-node]')], svg: map.querySelector('svg'), focus: map.querySelector('.route-focus'), stage: 0});
    route.querySelectorAll('[data-route-step], [data-route-node]').forEach(button => button.addEventListener('click', () => {
      const stage = Number(button.dataset.routeStep ?? button.dataset.stage);
      emphasize(route, stage);
      if (button.dataset.routeNode?.startsWith('target-')) {
        const detail = route.querySelectorAll('.route-target-detail')[Number(button.dataset.routeNode.slice(7))];
        detail.open = true;
      }
      // Keep the map in view on small screens; show the selected short chapter below it.
      if (desktop.matches) chapters[stage].scrollIntoView({block: 'center', behavior: reduced.matches ? 'instant' : 'smooth'});
      else {
        chapters.forEach((chapter, i) => {chapter.hidden = i !== stage;});
      }
    }));
  }
  root.setAttribute('data-route-enhanced', '');
  const fromHash = () => {
    const target = document.getElementById(location.hash.slice(1));
    const route = target?.closest('[data-guided-route]');
    if (route) {
      select(route);
      if (target.dataset.routeChapter !== undefined) {
        emphasize(route, Number(target.dataset.routeChapter));
        viewport();
      }
    }
  };
  select(routes.find(route => location.hash.startsWith('#' + route.id)) || routes[0]);
  choices.forEach(choice => choice.addEventListener('click', event => {
    event.preventDefault();
    select(document.getElementById(choice.dataset.routeChoice));
    history.replaceState(null, '', choice.getAttribute('href'));
    selected.scrollIntoView({block:'start', behavior: reduced.matches ? 'instant' : 'smooth'});
  }));
  const resize = new ResizeObserver(() => { if (selected) geometry(selected); });
  routes.forEach(route => resize.observe(route.querySelector('.route-map')));
  function viewport() {
    for (const route of routes) {
      const state = states.get(route);
      state.chapters.forEach((chapter, i) => {chapter.hidden = !desktop.matches && i !== state.stage;});
    }
    if (selected) geometry(selected);
  }
  viewport();
  fromHash();
  desktop.addEventListener('change', viewport);
  function scroll() {
    if (frame || !desktop.matches || !selected) return;
    frame = requestAnimationFrame(() => {
      frame = 0;
      const state = states.get(selected);
      const middle = innerHeight * .5;
      const chapter = state.chapters.reduce((best, next) => Math.abs(next.getBoundingClientRect().top + next.offsetHeight / 2 - middle) < Math.abs(best.getBoundingClientRect().top + best.offsetHeight / 2 - middle) ? next : best);
      const stage = Number(chapter.dataset.routeChapter);
      if (stage !== state.stage) emphasize(selected, stage);
    });
  }
  addEventListener('scroll', scroll, {passive:true});
  addEventListener('hashchange', fromHash);
  // Keep observers active through back/forward cache restores.
  addEventListener('pagehide', event => { if (!event.persisted) {resize.disconnect(); cancelAnimationFrame(frame);} });
}
