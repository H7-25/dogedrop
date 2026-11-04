/* Sets html[data-theme] before the page paints.
   A saved dark or light choice wins. A saved "auto", or no choice and no
   ?theme=, follows the device on desktop and mobile and updates if it changes. */
(function () {
  const KEY = 'dogedrop.theme';
  function read() {
    try { return localStorage.getItem(KEY) || ''; } catch (e) { return ''; }
  }
  function query() {
    try { return new URLSearchParams(location.search).get('theme') || ''; } catch (e) { return ''; }
  }
  function system() {
    try { return window.matchMedia && matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light'; } catch (e) { return 'light'; }
  }
  function pick(value) { return value === 'dark' || value === 'light' ? value : ''; }
  function mode() {
    const saved = read();
    if (saved === 'dark' || saved === 'light' || saved === 'auto') return saved;
    return pick(query()) || 'auto';
  }
  function followsSystem() {
    const saved = read();
    if (saved === 'auto') return true;
    if (saved === 'dark' || saved === 'light') return false;
    return !pick(query());
  }
  function resolve() {
    const saved = read();
    if (saved === 'dark' || saved === 'light') return saved;
    if (saved === 'auto') return system();
    return pick(query()) || system();
  }
  function paint() {
    document.documentElement.dataset.theme = resolve();
    document.documentElement.dataset.themeMode = mode();
  }
  paint();
  try {
    const media = window.matchMedia && matchMedia('(prefers-color-scheme: dark)');
    if (media && media.addEventListener) media.addEventListener('change', function () {
      if (!followsSystem()) return;
      paint();
      document.documentElement.dispatchEvent(new Event('dogedrop-theme'));
    });
  } catch (e) { /* The first look still follows the device. */ }
  window.DogeTheme = {
    key: KEY,
    current: function () { return document.documentElement.dataset.theme === 'dark' ? 'dark' : 'light'; },
    mode: function () { return mode(); },
    apply: function (value) {
      document.documentElement.dataset.theme = value === 'dark' ? 'dark' : 'light';
      return document.documentElement.dataset.theme;
    },
    refresh: function () {
      paint();
      return this.current();
    },
    choose: function (value) {
      const next = value === 'auto' ? 'auto' : (value === 'dark' ? 'dark' : 'light');
      try { localStorage.setItem(KEY, next); } catch (e) { /* The look stays for this visit. */ }
      paint();
      document.documentElement.dispatchEvent(new Event('dogedrop-theme'));
      return next;
    },
  };
})();
