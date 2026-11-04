/* Add a language:
   1. Copy js/locales/en.js to js/locales/xx.js.
   2. Set id, label, short, and htmlLang, then translate strings. Missing keys stay in English.
   3. Add 'xx' to the list below.
   The wallet and the website load every id in that list. */
(function () {
  const order = ['en', 'fr', 'pt', 'de', 'zh', 'ja'];
  const packs = {};
  const KEY = 'dogedrop.lang';
  let current = 'en';

  function add(pack) {
    if (!pack || !pack.id || !pack.strings) return;
    packs[pack.id] = pack;
  }

  function normalize(code) {
    const value = String(code || '').toLowerCase().replace('_', '-');
    if (!value) return '';
    if (packs[value]) return value;
    const base = value.split('-')[0];
    return packs[base] ? base : '';
  }

  function read(id, key) {
    const root = packs[id] && packs[id].strings;
    if (!root) return undefined;
    return String(key || '').split('.').reduce((node, part) => (node == null ? undefined : node[part]), root);
  }

  function fill(value, vars) {
    if (!vars) return value;
    return value.replace(/\{(\w+)\}/g, (token, name) => (vars[name] == null ? token : String(vars[name])));
  }

  function t(key, vars) {
    const local = read(current, key);
    const value = typeof local === 'string' ? local : read('en', key);
    if (typeof value !== 'string') return key;
    return fill(value, vars);
  }

  function lines(key) {
    const local = read(current, key);
    if (Array.isArray(local) && local.length) return local.slice();
    const english = read('en', key);
    return Array.isArray(english) ? english.slice() : [];
  }

  function apply(id) {
    const next = packs[id] ? id : 'en';
    current = next;
    const pack = packs[next];
    document.documentElement.lang = (pack && pack.htmlLang) || next;
    return next;
  }

  function choose(id) {
    const next = apply(normalize(id) || (packs[id] ? id : 'en'));
    try { localStorage.setItem(KEY, next); } catch { /* The choice still applies for this visit. */ }
    try { document.documentElement.dispatchEvent(new CustomEvent('dogedrop-lang', { detail: { lang: next } })); } catch { /* The page still has the new language. */ }
    return next;
  }

  function start() {
    let saved = '';
    try { saved = localStorage.getItem(KEY) || ''; } catch { /* Use the browser language when storage is blocked. */ }
    let query = '';
    try { query = new URLSearchParams(location.search).get('lang') || ''; } catch { /* No query language. */ }
    const browser = (navigator.languages || [navigator.language || '']).map(normalize).find(Boolean) || '';
    const pick = [normalize(saved), normalize(query), browser, 'en'].find((id) => id && packs[id]) || 'en';
    apply(pick);
  }

  function list() {
    return order.filter((id) => packs[id]).map((id) => ({
      id,
      label: packs[id].label || id,
      short: packs[id].short || id.toUpperCase(),
    }));
  }

  function currentPack() {
    return list().find((item) => item.id === current) || { id: current, label: current, short: current.toUpperCase() };
  }

  window.DogeI18n = { add, t, lines, choose, start, list, lang: () => current, current: currentPack };

  const here = document.currentScript && document.currentScript.src;
  if (here) {
    order.forEach((id) => {
      const url = new URL('locales/' + id + '.js', here).href;
      document.write('<script src="' + url + '"><\/script>');
    });
  }
})();
