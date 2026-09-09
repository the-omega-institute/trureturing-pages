/** Site interface localization. Research sources, proofs and user notes are originals. */
export const LOCALES = Object.freeze({ en: 'English', 'zh-CN': '中文' });
const STORAGE_KEY = 'trureturing.language.v1';
const base = new URL('../', import.meta.url);
let dictionary = {}, reverse = new Map();
export function chooseLocale(href, stored) {
  const requested = new URL(href).searchParams.get('lang');
  return Object.hasOwn(LOCALES, requested) ? requested : Object.hasOwn(LOCALES, stored) ? stored : 'en';
}
let stored;
try { if (typeof document !== 'undefined') stored = globalThis.localStorage?.getItem(STORAGE_KEY); } catch { /* URL works without storage. */ }
export let locale = chooseLocale(globalThis.location?.href || base.href, stored);
export function t(key, ...values) {
  if (typeof key !== 'string') return key;
  const text = locale !== 'en' && Object.hasOwn(dictionary, key) ? dictionary[key] : key;
  return values.length ? text.replace(/\{(\d+)\}/g, (match, index) => values[index] ?? match) : text;
}
export function canonicalText(text) { return reverse.get(text) || text; }
// Only editorial display fields are localized. IDs, source paths, status enums and receipts stay canonical.
const fields = new Set(['title', 'subtitle', 'summary', 'question', 'gap', 'reason', 'label', 'excerpt']);
export function localizeData(value, field = '') {
  if (typeof value === 'string') return fields.has(field) ? t(value) : value;
  if (Array.isArray(value)) {
    if (field === 'catalogue') return value.map(row => row.map((item, i) => i === 1 ? t(item) : item));
    return value.map(item => localizeData(item, field));
  }
  if (value && typeof value === 'object') return Object.fromEntries(Object.entries(value).map(([key, item]) => [key, localizeData(item, key)]));
  return value;
}
export function languageURL(href, language, root = base.href) {
  const scope = new URL(root), url = new URL(href, scope);
  if (!Object.hasOwn(LOCALES, language) || url.origin !== scope.origin || !url.pathname.startsWith(scope.pathname)
      || !(/\/$/.test(url.pathname) || /\.html$/.test(url.pathname)) || /\/(assets|proofs)\//.test(url.pathname) || /\/api\/v\d+(?:\/|$)/.test(url.pathname)) return url.href;
  url.searchParams.set('lang', language);
  return url.href;
}
let loadFailed = false;
export const ready = (async () => {
  if (locale !== 'en') {
    try {
      const response = await fetch(new URL(`./locales/${locale}.json`, import.meta.url), { signal: AbortSignal.timeout(8000) });
      if (!response.ok) throw new Error(`Locale HTTP ${response.status}`);
      dictionary = await response.json();
      if (!dictionary || Array.isArray(dictionary) || typeof dictionary !== 'object' || Object.values(dictionary).some(value => typeof value !== 'string')) throw new Error('Invalid locale dictionary');
      reverse = new Map(Object.entries(dictionary).map(([en, translated]) => [translated, en]));
    } catch { locale = 'en'; loadFailed = true; }
  }
  if (typeof document !== 'undefined') {
    document.documentElement.lang = locale;
    // A shared language URL also becomes the preference for later direct visits.
    if (!loadFailed && Object.hasOwn(LOCALES, new URL(location.href).searchParams.get('lang'))) {
      try { localStorage.setItem(STORAGE_KEY, locale); } catch { /* Navigation still carries lang. */ }
    }
  }
})();
const skip = 'script, style, noscript, code, pre, textarea, math, .katex, [contenteditable], [translate="no"], [data-i18n-original]';
function translateNode(node) {
  if (node.nodeType === 3) {
    if (locale === 'en' || node.parentElement?.closest(skip)) return;
    const original = node.nodeValue, trimmed = original.trim(), translated = t(trimmed);
    if (translated !== trimmed) node.nodeValue = original.replace(trimmed, translated);
    return;
  }
  if (node.nodeType !== 1 || node.matches(skip)) return;
  if (node.matches('a[href]:not([download])')) {
    const raw = node.getAttribute('href');
    if (raw && !raw.startsWith('#')) {
      const href = languageURL(new URL(raw, location.href).href, locale);
      if (href !== raw) node.setAttribute('href', href);
    }
  }
  for (const attribute of locale === 'en' ? [] : ['aria-label', 'title', 'placeholder']) {
    const value = node.getAttribute(attribute);
    if (value && t(value) !== value) node.setAttribute(attribute, t(value));
  }
  for (const child of node.childNodes) translateNode(child);
}
function install() {
  const header = document.querySelector('body > :is(.site-header, .knowledge-header, .atlas-header)');
  if (header && !header.querySelector('.site-language')) {
    const tools = document.createElement('div'); tools.className = 'header-tools';
    const coordinate = header.querySelector(':scope > .header-coordinate, :scope > .release-state');
    if (coordinate) tools.append(coordinate);
    const label = document.createElement('label'); label.className = 'site-language'; label.setAttribute('translate', 'no');
    const select = document.createElement('select'); select.setAttribute('aria-label', 'Language / 语言');
    select.title = 'Interface language. Source texts and proofs remain in their original language.';
    for (const [value, text] of Object.entries(LOCALES)) { const option = document.createElement('option'); option.value = value; option.textContent = text; select.append(option); }
    select.value = locale;
    select.addEventListener('change', () => {
      try { localStorage.setItem(STORAGE_KEY, select.value); } catch { /* Keep preference in the URL. */ }
      const url = new URL(location.href); url.searchParams.set('lang', select.value); location.assign(url.href);
    });
    label.append(select); tools.append(label); header.append(tools);
    if (loadFailed) { const message = document.createElement('span'); message.className = 'language-warning'; message.setAttribute('role', 'status'); message.textContent = 'Translation unavailable; showing English.'; header.after(message); }
  }
  translateNode(document.body);
  const observer = new MutationObserver(records => {
    for (const record of records) {
      if (record.type === 'childList') for (const node of record.addedNodes) translateNode(node);
      else translateNode(record.target);
    }
  });
  observer.observe(document.body, { childList: true, subtree: true, characterData: true, attributes: true, attributeFilter: ['href', 'aria-label', 'title', 'placeholder'] });
  // Capture links before client-side routers inspect them, including middle-click navigation.
  for (const event of ['click', 'auxclick']) document.addEventListener(event, e => {
    const anchor = e.target.closest?.('a[href]:not([download])');
    if (anchor) translateNode(anchor);
  }, true);
}
if (typeof document !== 'undefined') {
  await ready;
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', install, { once: true }); else install();
}
