import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

const source = fs.readFileSync(new URL('../js/i18n.js', import.meta.url), 'utf8');
function load({ languages = ['en-US'], saved = null, blocked = false } = {}) {
  const storage = new Map(saved === null ? [] : [['dogedrop.language.v1', saved]]);
  const context = vm.createContext({
    navigator: { languages, language: languages[0] },
    localStorage: {
      getItem(key) { if (blocked) throw new Error('Denied'); return storage.get(key) ?? null; },
      setItem(key, value) { if (blocked) throw new Error('Denied'); storage.set(key, value); },
    },
    document: { documentElement: { lang: 'en' } },
    window: { dispatchEvent() {} }, Event: class {},
  });
  vm.runInContext(source, context);
  return { i18n: context.window.DogeI18n, storage, document: context.document };
}

test('detects supported browser locales and defaults to English', () => {
  for (const [languages, expected] of [
    [['it-IT'], 'it'], [['it_CH'], 'it'], [['en-GB', 'it'], 'en'],
    [['fr', 'it'], 'it'], [['fr-FR'], 'en'], [[], 'en'],
  ]) assert.equal(load({ languages }).i18n.language, expected);
  assert.equal(load({ languages: ['it'], saved: 'en' }).i18n.language, 'en');
  assert.equal(load({ languages: ['it'], saved: 'invalid' }).i18n.language, 'it');
});

test('persists explicit choices independently of wallet/provider data', () => {
  const { i18n, storage, document } = load();
  i18n.setLanguage('it');
  assert.equal(document.documentElement.lang, 'it');
  assert.deepEqual([...storage.entries()], [['dogedrop.language.v1', 'it']]);
  assert.equal(i18n.t('Send'), 'Invia');
  i18n.setLanguage('en');
  assert.equal(i18n.t('Send'), 'Send');
  i18n.setLanguage('unsupported');
  assert.equal(i18n.language, 'en');
});

test('storage denial still permits detection and in-memory selection', () => {
  const { i18n } = load({ languages: ['it'], blocked: true });
  assert.equal(i18n.language, 'it');
  assert.doesNotThrow(() => i18n.setLanguage('en'));
  assert.equal(i18n.language, 'en');
});

test('fallback and interpolation preserve user content literally', () => {
  const { i18n } = load({ languages: ['it'] });
  assert.equal(i18n.t('Unknown English source'), 'Unknown English source');
  assert.equal(i18n.t('Word {number}', { number: 7 }), 'Parola 7');
  assert.equal(i18n.t('{host} is waiting for a wallet.', { host: '$& {number} <script>' }), '$& {number} <script> è in attesa di un wallet.');
  assert.equal(i18n.t('constructor'), 'constructor');
});

test('localizes provider/signing diagnostics only when displayed', () => {
  const { i18n } = load({ languages: ['it'] });
  const cases = [
    ['Wrong password, or the wallet file is damaged.', 'Password errata oppure file del wallet danneggiato.'],
    ['Dogecoin Core answered. Block height 123.', 'Dogecoin Core ha risposto. Altezza del blocco 123.'],
    ['Dogecoin Core answered. Block height 123. DogecoinVM explorer answered.', 'Dogecoin Core ha risposto. Altezza del blocco 123. La risorsa DogecoinVM (explorer) ha risposto.'],
    ['MemeTracker answered. Chain tip 1,234.', 'MemeTracker ha risposto. Ultimo blocco 1,234.'],
    ['DogecoinVM explorer answered (mainnet).', 'La risorsa DogecoinVM (explorer) ha risposto (mainnet).'],
    ['Enter a DogecoinVM send address.', 'Inserisci un valore per Indirizzo di invio DogecoinVM.'],
    ['Request failed (503)', 'Richiesta non riuscita (503)'],
    ['SoChain answered. DogecoinVM send address answered.', 'SoChain ha risposto. La risorsa DogecoinVM (indirizzo di invio) ha risposto.'],
  ];
  for (const [input, expected] of cases) assert.equal(i18n.message(input), expected);
  const cached = i18n.message('The network did not answer (Request failed (503)). Showing the last saved balance and activity.');
  assert.match(cached, /La rete non ha risposto \(Richiesta non riuscita \(503\)\)/);
  assert.equal(i18n.message('Remote error code XYZ'), 'Si è verificato un errore: Remote error code XYZ');
  i18n.setLanguage('en');
  for (const [input] of cases) assert.equal(i18n.message(input), input);
});

test('form validation follows selection and clears stale custom errors', () => {
  const { i18n } = load({ languages: ['it'] });
  const listeners = {};
  let custom = '';
  let missing = true;
  const field = {
    type: 'checkbox', tagName: 'INPUT',
    get validity() { return { valueMissing: missing, valid: !missing && !custom }; },
    setCustomValidity(value) { custom = value; },
    addEventListener(name, callback) { listeners[name] = callback; },
  };
  i18n.localizeValidation({ querySelectorAll: () => [field] });
  assert.equal(custom, 'Seleziona questa casella per continuare.');
  missing = false;
  listeners.change();
  assert.equal(custom, '');
});

test('published wallet assets match development translations and UI', () => {
  for (const path of ['js/i18n.js', 'js/app.js', 'connect.js']) {
    assert.equal(fs.readFileSync(new URL('../' + path, import.meta.url), 'utf8'), fs.readFileSync(new URL('../docs/wallet/' + path, import.meta.url), 'utf8'));
  }
});

test('every Italian entry preserves its English interpolation parameters', () => {
  const catalog = JSON.parse(source.match(/const it = (\{[\s\S]*?\});\n  const supported/)[1]);
  const placeholders = (value) => [...value.matchAll(/\{(\w+)\}/g)].map((match) => match[1]).sort();
  for (const [english, italian] of Object.entries(catalog)) {
    assert.ok(italian.trim(), english);
    assert.deepEqual(placeholders(italian), placeholders(english), english);
  }
});

test('site approval and payment messages escape the complete translation exactly once', () => {
  const appSource = fs.readFileSync(new URL('../js/app.js', import.meta.url), 'utf8');
  const renderers = appSource.slice(appSource.indexOf('  function approve() {'), appSource.indexOf('  function externalPayLink() {'));
  const escapeFunction = appSource.split('\n').find((line) => line.startsWith('  function esc('));
  const host = '<img src=x onerror="alert(1)"> & \'site\' &lt;host&gt;';
  const escapeHtml = (value) => value.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');
  for (const language of ['en', 'it']) {
    const { i18n } = load({ languages: [language] });
    // Include markup in the surrounding translated text to enforce escaping after
    // interpolation, rather than escaping only the external host beforehand.
    const t = (key, params) => i18n.t(key, params) + (key.startsWith('{host}') ? ' <translation & "text">' : '');
    const context = vm.createContext({
      state: { request: { origin: 'https://example.com', message: 'Message' }, draft: {}, pub: null },
      t, siteName: () => host,
      shell: (_title, body) => body, icon: () => '', button: () => '',
      currentReceive: () => ({ address: '' }), addressField: () => '',
      externalPayLink: () => '', payAddress: () => '',
    });
    vm.runInContext(escapeFunction + '\n' + renderers, context);
    for (const [type, renderer, key] of [
      ['sign', 'approve', '{host} wants a signature from your wallet. This does not spend coins.'],
      ['connect', 'approve', '{host} wants to see your Dogecoin address and ask before each payment. It cannot see your recovery phrase.'],
      ['pay', 'payChoice', '{host} is asking for a payment, and DogeDrop is not connected.'],
    ]) {
      context.state.request.type = type;
      const html = vm.runInContext(renderer + '()', context);
      assert.equal(html.match(/<p>(.*?)<\/p>/)[1], escapeHtml(t(key, { host })), `${language}: ${type}`);
      assert.ok(!html.includes('<img'));
      assert.ok(!html.includes('<translation'));
    }
  }
});
