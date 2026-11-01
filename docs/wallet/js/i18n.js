(function () {
  'use strict';

  const language = navigator.language.toLowerCase().split('-')[0] === 'it' ? 'it' : 'en';
  let messages = {};

  window.t = function (key, params = {}) {
    let value = messages[key] || key;

    for (const [name, replacement] of Object.entries(params)) {
      value = value.replaceAll(`{${name}}`, String(replacement));
    }

    return value;
  };

  window.i18nReady = (async function () {
    const response = await fetch('locales/en.json');
    if (!response.ok) throw new Error('Cannot load English translations');

    const english = await response.json();

    if (language === 'it') {
      try {
        const italianResponse = await fetch('locales/it.json');
        if (!italianResponse.ok) throw new Error('Cannot load Italian translations');

        messages = { ...english, ...await italianResponse.json() };
      } catch {
        messages = english;
      }
    } else {
      messages = english;
    }

    document.documentElement.lang = language;
  })();
})();
