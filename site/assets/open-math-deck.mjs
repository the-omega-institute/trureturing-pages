/** Slide navigation for open-math.html. Without this module the page stays a readable document. */
const STAGE_WIDTH = 1280;
const STAGE_HEIGHT = 720;
const MIN_PRESENT_WIDTH = 760;
const MIN_PRESENT_HEIGHT = 420;

const body = document.body;
const deck = document.getElementById('deck');
const slides = [...deck.querySelectorAll('.deck-slide')];
const controls = document.querySelector('.deck-controls');
const counter = document.getElementById('deck-counter');
const bar = document.getElementById('deck-progress-bar');
const prev = document.getElementById('deck-prev');
const next = document.getElementById('deck-next');
const notesToggle = document.getElementById('deck-notes-toggle');
const readToggle = document.getElementById('deck-read-toggle');
const fullscreen = document.getElementById('deck-fullscreen');
const notesPanel = document.getElementById('deck-notes-panel');

const clamp = i => Math.max(0, Math.min(slides.length - 1, i));
const requested = new URL(location.href).searchParams.get('view');
// A user choice (button or ?view=) wins over the automatic width-based choice.
let chosenMode = requested === 'read' || requested === 'present' ? requested : null;
let index = indexFromHash();

function indexFromHash() {
  const match = /^#s(\d+)$/.exec(location.hash);
  return match ? clamp(Number(match[1]) - 1) : 0;
}

function automaticMode() {
  return innerWidth >= MIN_PRESENT_WIDTH && innerHeight >= MIN_PRESENT_HEIGHT ? 'present' : 'read';
}

function currentMode() {
  return body.dataset.mode;
}

function fit() {
  if (currentMode() !== 'present') return;
  const box = deck.getBoundingClientRect();
  const margin = body.classList.contains('is-fullscreen') ? 1 : 0.97;
  const scale = Math.min(box.width / STAGE_WIDTH, box.height / STAGE_HEIGHT) * margin;
  deck.style.setProperty('--deck-scale', scale.toFixed(4));
}

function renderNotes() {
  const note = slides[index].querySelector('.deck-notes');
  notesPanel.textContent = note ? note.textContent.trim() : '';
  notesPanel.hidden = !(body.classList.contains('show-notes') && currentMode() === 'present' && notesPanel.textContent);
}

function show(target, { updateHash = true } = {}) {
  index = clamp(target);
  const present = currentMode() === 'present';
  slides.forEach((slide, position) => {
    const current = position === index;
    slide.classList.toggle('is-current', current);
    slide.inert = present && !current;
    if (present && !current) slide.setAttribute('aria-hidden', 'true');
    else slide.removeAttribute('aria-hidden');
  });
  counter.textContent = `${index + 1} / ${slides.length}`;
  bar.style.width = `${((index + 1) / slides.length) * 100}%`;
  prev.disabled = index === 0;
  next.disabled = index === slides.length - 1;
  if (updateHash) {
    const url = new URL(location.href);
    url.hash = `s${index + 1}`;
    history.replaceState(history.state, '', url);
  }
  renderNotes();
}

function slideNearestViewportTop() {
  const found = slides.findIndex(slide => slide.getBoundingClientRect().bottom > 96);
  return found === -1 ? slides.length - 1 : found;
}

function setMode(mode) {
  if (mode === currentMode()) return;
  const leavingRead = currentMode() === 'read';
  const target = leavingRead ? slideNearestViewportTop() : index;
  body.dataset.mode = mode;
  readToggle.textContent = mode === 'read' ? 'Slide view' : 'Reading view';
  show(target);
  if (mode === 'present') {
    scrollTo(0, 0);
    fit();
  } else {
    slides[index].scrollIntoView({ block: 'start' });
  }
}

function step(delta) {
  if (currentMode() === 'present') show(index + delta);
}

function toggleNotes() {
  const on = !body.classList.contains('show-notes');
  body.classList.toggle('show-notes', on);
  notesToggle.setAttribute('aria-pressed', String(on));
  renderNotes();
}

function toggleFullscreen() {
  if (document.fullscreenElement) document.exitFullscreen?.();
  else document.documentElement.requestFullscreen?.().catch(() => { /* Refused by the browser; stay windowed. */ });
}

prev.addEventListener('click', () => step(-1));
next.addEventListener('click', () => step(1));
notesToggle.addEventListener('click', toggleNotes);
readToggle.addEventListener('click', () => {
  chosenMode = currentMode() === 'read' ? 'present' : 'read';
  setMode(chosenMode);
});

if (document.fullscreenEnabled) {
  fullscreen.addEventListener('click', toggleFullscreen);
  document.addEventListener('fullscreenchange', () => {
    body.classList.toggle('is-fullscreen', Boolean(document.fullscreenElement));
    if (document.fullscreenElement && currentMode() !== 'present') setMode('present');
    fit();
  });
} else {
  fullscreen.hidden = true;
}

document.addEventListener('keydown', event => {
  if (event.defaultPrevented || event.altKey || event.ctrlKey || event.metaKey) return;
  if (event.target.closest?.('input, textarea, select, [contenteditable]')) return;
  const key = event.key;
  if (key === 'n' || key === 'N') { toggleNotes(); return; }
  if (currentMode() !== 'present') return;
  const forward = ['ArrowRight', 'ArrowDown', 'PageDown'].includes(key) || (key === ' ' && !event.shiftKey);
  const backward = ['ArrowLeft', 'ArrowUp', 'PageUp'].includes(key) || (key === ' ' && event.shiftKey);
  if (forward) step(1);
  else if (backward) step(-1);
  else if (key === 'Home') show(0);
  else if (key === 'End') show(slides.length - 1);
  else if ((key === 'f' || key === 'F') && document.fullscreenEnabled) toggleFullscreen();
  else return;
  event.preventDefault();
});

let touchStart = null;
deck.addEventListener('touchstart', event => {
  touchStart = event.touches.length === 1 ? { x: event.touches[0].clientX, y: event.touches[0].clientY } : null;
}, { passive: true });
deck.addEventListener('touchend', event => {
  if (!touchStart || currentMode() !== 'present') return;
  const dx = event.changedTouches[0].clientX - touchStart.x;
  const dy = event.changedTouches[0].clientY - touchStart.y;
  touchStart = null;
  if (Math.abs(dx) > 48 && Math.abs(dx) > Math.abs(dy)) step(dx < 0 ? 1 : -1);
}, { passive: true });

addEventListener('hashchange', () => show(indexFromHash(), { updateHash: false }));
addEventListener('resize', () => {
  if (!chosenMode) setMode(automaticMode());
  fit();
});

controls.hidden = false;
body.dataset.mode = chosenMode || automaticMode();
readToggle.textContent = currentMode() === 'read' ? 'Slide view' : 'Reading view';
show(index, { updateHash: Boolean(location.hash) });
fit();
if (currentMode() === 'read' && location.hash) slides[index].scrollIntoView({ block: 'start' });
