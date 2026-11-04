(function () {
  try { if (window.opener) window.opener = null; } catch { /* The opener is already gone. */ }
  // Bump this when a fix or feature ships. Settings shows it.
  const WALLET_VERSION = '1.4.0';
  const VAULT_KEY = 'doge-pocket.vault.v1';
  const PUBLIC_KEY = 'doge-pocket.public.v1';
  const SETTINGS_KEY = 'doge-pocket.settings.v1';
  const CAUTION_KEY = 'dogedrop.caution.wallet.v1';
  const VM_HELP_KEY = 'dogedrop.vm-help.v1';
  const NOTE_KEY = 'dogedrop.notes.v1';
  const SITES_KEY = 'doge-pocket.sites.v1';
  const CHAIN_CACHE_KEY = 'doge-pocket.chain.v1';
  const embed = new URLSearchParams(location.search).get('embed') === '1' && window.parent !== window;
  if (embed) document.documentElement.classList.add('is-embed');
  if (window.DogeI18n) window.DogeI18n.start();
  function tr(key, vars) { return window.DogeI18n ? window.DogeI18n.t(key, vars) : key; }
  function trLines(key) { return window.DogeI18n ? window.DogeI18n.lines(key) : []; }
  window.addEventListener('storage', (event) => {
    if (event.key === 'dogedrop.theme' && window.DogeTheme) {
      window.DogeTheme.refresh();
      render();
      return;
    }
    if (event.key !== 'dogedrop.lang' || !event.newValue || !window.DogeI18n) return;
    if (window.DogeI18n.lang() === event.newValue) return;
    window.DogeI18n.start();
    render();
  });

  const state = {
    screen: 'boot',
    pub: null,
    vault: null,
    settings: window.DogeNet.defaultSettings(),
    sites: {},
    secret: null,
    pending: null,
    chain: 'dogecoin',
    balances: { dogecoin: null, dogecoinvm: null },
    coins: { dogecoin: [], dogecoinvm: [] },
    histories: { dogecoin: [], dogecoinvm: [] },
    chainError: { dogecoin: '', dogecoinvm: '' },
    stale: { dogecoin: false, dogecoinvm: false },
    lastChain: 'dogecoin',
    fees: { slow: 1000, normal: 10000, fast: 50000, priceUsd: 0 },
    syncedAt: 0,
    error: '',
    notice: '',
    busy: false,
    draft: { to: '', amount: '', fee: 'normal', customRate: 0, chain: 'dogecoin', locked: false, label: '', message: '' },
    bridgeDirection: 'tovm',
    bridgeAmount: '',
    bridgeDest: '',
    bridgeInfo: null,
    bridgeError: '',
    bridgeLoading: false,
    request: null,
    approval: null,
    parentOrigin: '',
    lockTimer: 0,
    tip: '',
    docsQuery: '',
    docsTopic: '',
    langBack: 'welcome',
  };

  const app = document.getElementById('app');
  app.addEventListener('click', onClick);
  app.addEventListener('submit', onSubmit);
  window.addEventListener('submit', (event) => { event.preventDefault(); }, true);
  app.addEventListener('change', onChange);
  app.addEventListener('input', onAmount);
  window.addEventListener('beforeunload', (event) => {
    if (!state.pending) return;
    event.preventDefault();
    event.returnValue = '';
  });
  if (embed) window.addEventListener('message', onParentMessage);

  boot();
  startPolling();

  async function boot() {
    if (embed) parent.postMessage({ channel: 'doge-pocket', event: 'ready' }, '*');
    if (embed && document.hasStorageAccess) {
      try { state.needsAccess = !(await document.hasStorageAccess()); } catch { state.needsAccess = false; }
    }
    if (state.needsAccess) {
      state.screen = 'access';
      render();
      return;
    }
    loadFromDisk();
  }

  function loadFromDisk() {
    state.needsAccess = false;
    state.vault = readJson(VAULT_KEY);
    state.pub = readJson(PUBLIC_KEY);
    const savedSettings = readJson(SETTINGS_KEY) || {};
    state.settings = { ...window.DogeNet.defaultSettings(), ...savedSettings };
    if (savedSettings.autolockSeconds == null && savedSettings.autolockMinutes != null && Number(savedSettings.autolockMinutes) > 0) {
      state.settings.autolockSeconds = Number(savedSettings.autolockMinutes) * 60;
    }
    if (state.settings.preset === 'blockbook') state.settings.preset = 'memetracker';
    if (state.settings.broadcast === 'blockbook') state.settings.broadcast = 'memetracker';
    const savedVm = String(state.settings.vmUrl || '').trim().replace(/\/$/, '');
    if (!state.settings.vmPreset) state.settings.vmPreset = savedVm && savedVm !== 'https://metaldoge.com' && savedVm !== 'https://metaldoge.dogedrop.org' && savedVm !== 'https://vm.dogedrop.org' ? 'custom' : 'metaldoge';
    if (!state.settings.vmBroadcast) state.settings.vmBroadcast = 'same';
    if (!state.settings.vmUrl || state.settings.vmUrl === 'https://metaldoge.com' || state.settings.vmUrl === 'https://metaldoge.dogedrop.org') state.settings.vmUrl = 'https://vm.dogedrop.org';
    if (!state.settings.vmBroadcastUrl || state.settings.vmBroadcastUrl === 'https://metaldoge.com' || state.settings.vmBroadcastUrl === 'https://metaldoge.dogedrop.org') state.settings.vmBroadcastUrl = 'https://vm.dogedrop.org';
    if (!state.settings.presetChosen && state.settings.preset === 'public') state.settings.preset = 'dogechain';
    if (!hostChain() && state.settings.enableDogecoin === false && state.settings.enableDogecoinvm === false) state.settings.enableDogecoin = true;
    settleChains();
    state.sites = readJson(SITES_KEY) || {};
    if (state.pub) {
      if (chainEnabled('dogecoin')) applyChainCache('dogecoin');
      if (chainEnabled('dogecoinvm')) applyChainCache('dogecoinvm');
    }
    state.draft.fee = state.settings.fee || 'normal';
    let next = !featureOn('wallet') ? 'checkout' : (state.pub ? 'home' : 'welcome');
    if (state.request?.type === 'pay' && state.pub) next = 'review';
    else if (state.request && state.pub) next = 'approve';
    state.screen = present(holdForCaution(next));
    render();
    if (state.pub) refresh().catch(() => {});
  }

  function parentOriginAllowed(origin) {
    if (origin === 'null' || origin === 'file://') return location.protocol === 'file:';
    try {
      const protocol = new URL(origin).protocol;
      return protocol === 'http:' || protocol === 'https:';
    } catch {
      return false;
    }
  }

  function siteName(origin) {
    if (!origin || origin === 'null' || origin === 'file://') return tr('common.computer');
    try {
      const url = new URL(origin);
      if (url.protocol !== 'http:' && url.protocol !== 'https:') return tr('common.computer');
      return url.origin;
    } catch { return 'This computer'; }
  }

  function siteAsk(origin) {
    return `<p class="site-line">${icon('link')}<span>${esc(siteName(origin))}</span></p>`;
  }

  function publicReply(result) {
    if (!result || typeof result !== 'object') return result;
    const copy = { ...result };
    ['mnemonic', 'wif', 'passphrase', 'privateKey', 'secret', 'password', 'vault', 'xprv', 'seed'].forEach((key) => { delete copy[key]; });
    return copy;
  }

  function replyOrigin() {
    if (location.protocol === 'file:' || !state.parentOrigin || state.parentOrigin === 'null') return '*';
    return state.parentOrigin;
  }

  async function onParentMessage(event) {
    if (event.source !== parent || !event.data || event.data.channel !== 'doge-pocket') return;
    const origin = event.origin;
    if (!parentOriginAllowed(origin)) return;
    state.parentOrigin = origin;
    const { id, method, params } = event.data;
    const request = params || {};
    if (request.lang) {
      applyHostLang(request.lang);
      delete request.lang;
    }
    try {
      const result = await handleParent(method, request, origin);
      parent.postMessage({ channel: 'doge-pocket', id, result: publicReply(result) }, replyOrigin());
    } catch (error) {
      parent.postMessage({ channel: 'doge-pocket', id, error: error.message || tr('error.requestFailed') }, replyOrigin());
    }
  }

  function applyHostLang(lang) {
    if (!window.DogeI18n || !lang) return;
    const before = window.DogeI18n.lang();
    const next = window.DogeI18n.choose(String(lang));
    if (next !== before) render();
  }

  async function handleParent(method, params, origin) {
    if (method === 'getConnectionStatus') return connectionStatus(origin);
    if (method === 'getBalance') {
      if (!state.sites[origin]?.connected) throw new Error('Not connected');
      await ensureFresh();
      return balancePayload();
    }
    if (method === 'getAddress') {
      if (!state.sites[origin]?.connected) throw new Error('Not connected');
      const current = currentReceive();
      return { address: current.address, publicKey: current.publicKey };
    }
    if (method === 'disconnect') {
      delete state.sites[origin];
      writeJson(SITES_KEY, state.sites);
      state.secret = null;
      clearTimeout(state.lockTimer);
      if (state.request?.origin === origin && state.request.type === 'pay') state.screen = present(holdForCaution('pay-choice'));
      else if (!state.request && state.pub) state.screen = present('home');
      render();
      return { disconnected: true };
    }
    if (method === 'open') {
      showPanel();
      if (!featureOn('wallet')) state.screen = 'checkout';
      else if (!state.pub) state.screen = 'welcome';
      else state.screen = present(state.screen);
      render();
      return { open: true };
    }
    if (method === 'connect') {
      if (!featureOn('wallet')) throw new Error(tr('error.featureOff'));
      return ask(origin, { type: 'connect' });
    }
    if (method === 'requestTransaction') {
      if (!featureOn('send')) throw new Error(tr('error.featureOff'));
      return ask(origin, { type: 'pay', ...params });
    }
    if (method === 'showPayment') {
      if (!featureOn('pay')) throw new Error(tr('error.featureOff'));
      const body = { ...(params || {}) };
      if (!featureOn('wallet')) body.externalOnly = true;
      return ask(origin, { type: 'invoice', ...body });
    }
    if (method === 'requestSignedMessage') {
      if (!featureOn('sign')) throw new Error(tr('error.featureOff'));
      return ask(origin, { type: 'sign', message: String(params.message || '') });
    }
    throw new Error('Unknown request');
  }

  function connectionStatus(origin) {
    if (!state.pub || !state.sites[origin]?.connected) return { connected: false };
    const current = currentReceive();
    return { connected: true, address: current.address, publicKey: current.publicKey };
  }

  function grantSite(origin) {
    if (!origin) return;
    state.sites[origin] = { connected: true, at: Date.now() };
    writeJson(SITES_KEY, state.sites);
  }

  function ask(origin, request) {
    showPanel();
    state.error = '';
    return new Promise((resolve, reject) => {
      state.request = { ...request, origin };
      state.approval = {
        resolve: (value) => { state.approval = null; state.request = null; resolve(value); if (!state.pinned) hidePanel(); },
        reject: (error) => { state.approval = null; state.request = null; reject(error); if (!state.pinned) hidePanel(); },
      };
      let next = 'welcome';
      if (state.needsAccess) next = 'access';
      else if (request.type === 'pay' || request.type === 'invoice') {
        applyPayRequest(request);
        next = request.type === 'invoice' || !(state.pub && state.sites[origin]?.connected) ? 'pay-choice' : 'review';
      } else if (!state.pub) next = 'welcome';
      else next = 'approve';
      state.screen = present(holdForCaution(next));
      render();
    });
  }

  function showPanel() { if (embed) parent.postMessage({ channel: 'doge-pocket', event: 'ui', open: true }, replyOrigin()); }
  function hidePanel(force) { if (embed) parent.postMessage({ channel: 'doge-pocket', event: 'ui', open: false, force: !!force }, replyOrigin()); }

  function onClick(event) {
    if (state.tip && !event.target.closest('.helptip')) {
      state.tip = '';
      app.querySelectorAll('.helptip-pop').forEach((node) => node.remove());
      app.querySelectorAll('.help[aria-expanded="true"]').forEach((node) => node.setAttribute('aria-expanded', 'false'));
    }
    if (event.target.closest('.tabbar, .top-actions, .chains')) noteActivity();
    const button = event.target.closest('[data-action]');
    if (!button || button.disabled || button.tagName === 'FORM') return;
    if (button.dataset.action === 'toggle-tip') event.preventDefault();
    const action = actions[button.dataset.action];
    if (!action) return;
    Promise.resolve(action(button)).catch((error) => fail(error.message));
  }

  function onSubmit(event) {
    event.preventDefault();
    const action = actions[event.target.dataset.action];
    if (action) Promise.resolve(action(event.target)).catch((error) => fail(error.message));
  }

  function onAmount(event) {
    noteActivity();
    const field = event.target;
    if (field.id === 'docs-search') {
      state.docsQuery = field.value;
      const list = document.querySelector('.docs-list');
      if (list) list.innerHTML = docsListHtml().list;
      return;
    }
    if (field.id === 'send-to') {
      const raw = field.value.trim();
      try {
        const parsed = window.DogeChain.parsePayment(raw);
        if (parsed.chain && !chainEnabled(parsed.chain)) {
          state.draft.to = raw;
          state.draft.locked = false;
          state.draft.chain = preferredChain(state.chain);
          return fail(tr('error.chainOff', { chain: chainName(parsed.chain) }));
        }
        const amount = document.getElementById('send-amount');
        if (parsed.amount && amount && !amount.value.trim()) amount.value = parsed.amount;
        const nextLocked = Boolean(parsed.chain);
        const chainChanged = Boolean(parsed.chain) && parsed.chain !== state.draft.chain;
        const lockChanged = nextLocked !== Boolean(state.draft.locked);
        if (parsed.chain) state.draft.chain = parsed.chain;
        state.draft.locked = nextLocked;
        state.draft.to = raw;
        state.draft.label = parsed.label || '';
        state.draft.message = parsed.message || '';
        if (amount && amount.value.trim()) state.draft.amount = amount.value.trim();
        else if (parsed.amount) state.draft.amount = parsed.amount;
        if (chainChanged || lockChanged) render();
      } catch {
        if (state.draft.locked) {
          state.draft.locked = false;
          state.draft.to = raw;
          render();
        }
      }
      return;
    }
    if (field.id === 'custom-fee') {
      state.draft.fee = 'custom';
      state.draft.customRate = stepToRate(field.value);
      field.style.setProperty('--fill', `${Number(field.value) / 10}%`);
      const readout = document.getElementById('custom-fee-readout');
      if (readout) readout.textContent = `${window.DogeChain.formatDoge(window.DogeChain.feeFor(1, 2, state.draft.customRate))} DOGE`;
      field.closest('.fee-custom')?.classList.add('active');
      app.querySelectorAll('button.choice').forEach((button) => button.classList.remove('active'));
      return;
    }
    if (!field.dataset || field.dataset.amount == null) return;
    const cleaned = String(field.value).replace(/[^\d.]/g, '');
    const parts = cleaned.split('.');
    const next = parts.length < 2 ? parts[0] : `${parts[0]}.${parts.slice(1).join('').slice(0, 8)}`;
    if (next === field.value) return;
    const at = field.selectionStart;
    field.value = next;
    if (at != null) field.setSelectionRange(Math.min(at, next.length), Math.min(at, next.length));
  }

  function onChange(event) {
    if (!event.target.closest('#settings-form')) return;
    if (event.target.name === 'enableDogecoin' || event.target.name === 'enableDogecoinvm') {
      const form = event.target.form;
      if (!form.enableDogecoin.checked && !form.enableDogecoinvm.checked) {
        event.target.checked = true;
        return fail(tr('error.keepOne'));
      }
      readSettings();
      const disk = readJson(SETTINGS_KEY) || {};
      disk.enableDogecoin = state.settings.enableDogecoin;
      disk.enableDogecoinvm = state.settings.enableDogecoinvm;
      try { writeJson(SETTINGS_KEY, disk); } catch { /* The choice still applies for this visit. */ }
      settleChains();
      render();
      return;
    }
    if (event.target.name === 'fixedReceive') {
      readSettings();
      const disk = readJson(SETTINGS_KEY) || {};
      disk.fixedReceive = state.settings.fixedReceive === true;
      try { writeJson(SETTINGS_KEY, disk); } catch { /* The choice still applies for this visit. */ }
      render();
      return;
    }
    readSettings();
    if (event.target.name === 'preset' || event.target.name === 'broadcast' || event.target.name === 'vmPreset' || event.target.name === 'vmBroadcast') render();
  }

  function cautionSeen() {
    try { return localStorage.getItem(CAUTION_KEY) === '1'; } catch { return false; }
  }

  function holdForCaution(next) {
    if (cautionSeen()) return next;
    state.afterCaution = next;
    return 'caution';
  }

  const actions = {
    'dismiss-caution': () => {
      try { localStorage.setItem(CAUTION_KEY, '1'); } catch { /* The warning can still be closed for this visit. */ }
      const next = state.afterCaution || (state.pub ? 'home' : 'welcome');
      state.afterCaution = '';
      go(next);
    },
    'dismiss-vm-help': () => {
      try { localStorage.setItem(VM_HELP_KEY, '1'); } catch { /* Closed for this visit only. */ }
      render();
    },
    'dismiss-note': (button) => {
      stashDraft();
      const id = button.dataset.note || '';
      const hidden = notesHidden();
      if (id) hidden[id] = 1;
      try { localStorage.setItem(NOTE_KEY, JSON.stringify(hidden)); } catch { /* Closed for this visit only. */ }
      if (id === 'vm') {
        try { localStorage.setItem(VM_HELP_KEY, '1'); } catch { /* Closed for this visit only. */ }
      }
      state.keepFocus = true;
      render();
    },
    'toggle-tip': (button) => {
      stashDraft();
      const id = button.dataset.tip || '';
      state.tip = state.tip === id ? '' : id;
      state.keepFocus = true;
      render();
    },
    docs: () => go('docs'),
    'docs-filter': (button) => {
      state.docsTopic = button.dataset.filter || '';
      state.tip = '';
      state.keepFocus = true;
      render();
      const field = document.getElementById('docs-search');
      if (field) field.focus();
    },
    'allow-storage': async () => {
      try {
        if (document.requestStorageAccess) await document.requestStorageAccess();
      } catch {
        return fail(tr('error.storage'));
      }
      loadFromDisk();
    },
    'start-create': () => { state.pending = { mode: 'create' }; go('password'); },
    'start-restore': () => { state.pending = { mode: 'restore', restore: 'words' }; go('restore'); },
    'back-welcome': () => {
      state.pending = null;
      if ((state.request?.type === 'pay' || state.request?.type === 'invoice') && !state.sites[state.request.origin]?.connected) return go('pay-choice');
      go('welcome');
    },
    'cancel-request': () => { closeRequest(); go(state.pub ? 'home' : 'welcome'); },
    'to-reveal': (form) => {
      const password = form.password.value;
      if (password.length < 8) return fail(tr('error.passwordShort'));
      if (password !== form.confirm.value) return fail(tr('error.passwordMismatch'));
      state.pending.password = password;
      state.pending.passphrase = form.passphrase.value;
      state.pending.mnemonic = window.DogeChain.createMnemonic();
      state.pending.quiz = quizIndexes(state.pending.mnemonic);
      form.password.value = '';
      form.confirm.value = '';
      go('reveal');
    },
    'to-quiz': () => go('confirm'),
    'finish-create': async (form) => {
      const words = state.pending.mnemonic.split(' ');
      const ok = state.pending.quiz.every((index, position) => form[`word${position}`].value.trim().toLowerCase() === words[index]);
      if (!form.saved.checked || !ok) return fail(tr('error.wordsMismatch'));
      await persistHd(state.pending.mnemonic, state.pending.passphrase, state.pending.password);
      state.pending.password = '';
      state.pending = null;
      if (state.request) grantSite(state.request.origin);
      if (state.request?.type === 'pay' || state.request?.type === 'invoice') go('review', 'This browser now has your wallet.');
      else if (state.request) go('approve', 'This browser now has your wallet.');
      else go('home', 'This browser now has your wallet. Keep the 12 words somewhere safe.');
      refresh().catch(() => {});
    },
    'set-restore': (button) => { state.pending.restore = button.dataset.mode; render(); },
    'finish-restore': async (form) => {
      const password = form.password.value;
      if (password.length < 8) return fail(tr('error.passwordShort'));
      if (password !== form.confirm.value) return fail(tr('error.passwordMismatch'));
      const passphrase = form.passphrase?.value || '';
      if (state.pending.restore === 'file') {
        const file = form.file.files[0];
        if (!file) return fail(tr('error.chooseFile'));
        const parsed = JSON.parse(await file.text());
        const vault = parsed.vault || parsed;
        const secret = await window.DogeChain.decryptSecret(vault, password);
        await storeSecret(secret, password, vault);
      } else if (state.pending.restore === 'wif') {
        const account = window.DogeChain.accountFromWif(form.secret.value.trim());
        await storeSecret({ type: 'single', wif: account.wif, address: account.address, publicKey: account.publicKey }, password);
        form.secret.value = '';
      } else {
        const phrase = window.DogeChain.normalizeMnemonic(form.secret.value);
        if (!window.DogeChain.isMnemonic(phrase)) return fail(tr('error.badPhrase'));
        const account = window.DogeChain.accountFromMnemonic(phrase, passphrase);
        await storeSecret({ type: 'hd', mnemonic: phrase, passphrase, xpub: account.xpub }, password);
        form.secret.value = '';
      }
      state.pending = null;
      if (state.request) grantSite(state.request.origin);
      state.pub.deepScan = state.pub.type === 'hd';
      state.pub.vmDeepScan = state.pub.type === 'hd';
      writeJson(PUBLIC_KEY, state.pub);
      if (state.request?.type === 'pay' || state.request?.type === 'invoice') go('review', 'Wallet restored on this browser.');
      else if (state.request) go('approve', 'Wallet restored on this browser.');
      else go('home', 'Wallet restored on this browser.');
      refresh().catch(() => {});
    },
    home: () => go('home'),
    language: () => {
      if (state.screen !== 'language') state.langBack = state.screen;
      go('language');
    },
    'set-lang': (button) => {
      if (window.DogeI18n) window.DogeI18n.choose(button.dataset.lang);
      render();
    },
    'set-theme': (button) => {
      if (!window.DogeTheme) return;
      const value = button.dataset.theme === 'dark' || button.dataset.theme === 'light' ? button.dataset.theme : 'auto';
      window.DogeTheme.choose(value);
      render();
    },
    'lang-back': () => go(state.langBack && state.langBack !== 'language' ? state.langBack : (state.pub ? 'home' : 'welcome')),
    send: () => { state.draft = { to: '', amount: '', fee: state.settings.fee || 'normal', customRate: 0, chain: state.chain || 'dogecoin', locked: false, label: '', message: '' }; go('send'); },
    'set-chain': (button) => {
      const chain = button.dataset.chain === 'dogecoinvm' ? 'dogecoinvm' : 'dogecoin';
      if (!chainEnabled(chain)) return;
      const to = document.getElementById('send-to');
      const amount = document.getElementById('send-amount');
      if (to) state.draft.to = to.value.trim();
      if (amount) state.draft.amount = amount.value.trim();
      if (state.screen === 'send' || state.screen === 'review' || state.screen === 'pay-choice') {
        if (state.draft.locked) return;
        state.draft.chain = chain;
        state.error = '';
      } else {
        state.chain = chain;
        state.error = state.chainError[chain] || '';
      }
      render();
    },
    'edit-send': () => go('send'),
    receive: () => go('receive'),
    activity: () => go('activity'),
    bridge: () => {
      if (!bothChains()) return go('home');
      if (!state.bridgeDest) state.bridgeDest = currentReceive('dogecoin').address;
      go('bridge');
      loadBridge().catch(() => {});
    },
    'bridge-dir': (button) => {
      const amount = document.getElementById('bridge-amount');
      const dest = document.getElementById('bridge-dest');
      if (amount) state.bridgeAmount = amount.value.trim();
      if (dest) state.bridgeDest = dest.value.trim();
      state.bridgeDirection = button.dataset.direction === 'todoge' ? 'todoge' : 'tovm';
      render();
    },
    'bridge-review': async () => {
      const amount = document.getElementById('bridge-amount');
      const dest = document.getElementById('bridge-dest');
      if (amount) state.bridgeAmount = amount.value.trim();
      if (dest) state.bridgeDest = dest.value.trim();
      state.bridgePrepared = await buildBridgePlan();
      go('bridge-review');
    },
    'confirm-bridge': async (form) => {
      if (!state.secret) {
        await openVault(form.password.value);
        form.password.value = '';
      }
      state.busy = true;
      render();
      try {
        const plan = await buildBridgePlan();
        const shown = state.bridgePrepared;
        if (!shown || shown.direction !== plan.direction || shown.amount !== plan.amount) throw new Error(tr('error.reviewAgain'));
        if (plan.direction === 'tovm' && shown.depositAddress !== plan.depositAddress) throw new Error(tr('error.depositChanged'));
        if (plan.direction === 'todoge' && shown.destination !== plan.destination) throw new Error(tr('error.destChanged'));
        const provider = plan.chain === 'dogecoinvm' ? window.DogeNet.createVmProvider(state.settings) : window.DogeNet.createProvider(state.settings);
        await provider.verifyInputs(plan.inputs);
        const privateKeys = keysFor(plan.inputs);
        let signed;
        try {
          signed = window.DogeChain.signPayment({ inputs: plan.inputs, outputs: plan.outputs, privateKeys });
        } finally {
          Object.values(privateKeys).forEach((key) => key.fill(0));
        }
        const txid = await provider.broadcast(signed.hex);
        if (plan.change > 0n && state.pub.type === 'hd' && !state.settings.fixedReceive) {
          if (plan.chain === 'dogecoinvm') state.pub.vmChangeIndex = (state.pub.vmChangeIndex || 0) + 1;
          else state.pub.changeIndex = (state.pub.changeIndex || 0) + 1;
          writeJson(PUBLIC_KEY, state.pub);
        }
        state.lastTx = txid;
        state.lastChain = plan.chain;
        const notice = plan.direction === 'tovm'
          ? tr('notice.sentVm')
          : tr('notice.sentDoge');
        go('home', notice);
        refresh().catch(() => {});
      } finally {
        state.busy = false;
      }
    },
    settings: () => {
      state.settingsTab = state.chain === 'dogecoinvm' ? 'dogecoinvm' : 'dogecoin';
      go('settings');
    },
    'settings-tab': (button) => {
      const chain = button.dataset.chain === 'dogecoinvm' ? 'dogecoinvm' : 'dogecoin';
      if (!chainEnabled(chain)) return;
      readSettings();
      state.settingsTab = chain;
      render();
    },
    backup: () => { state.unlockNext = 'backup'; if (!state.secret) return go('unlock'); go('backup'); },
    'fee': (button) => {
      state.draft.fee = button.dataset.fee;
      const to = document.getElementById('send-to');
      const amount = document.getElementById('send-amount');
      if (to) state.draft.to = to.value.trim();
      if (amount) state.draft.amount = amount.value.trim();
      render();
    },
    'fill-max': () => {
      const plan = window.DogeChain.selectAll(coinsFor(state.draft.chain), feeRate());
      const input = document.getElementById('send-amount');
      if (input) input.value = window.DogeChain.formatDoge(plan.amount);
    },
    'to-review': () => {
      try { readDestination(); } catch (error) { return fail(error.message); }
      if (!state.draft.chain) return fail(tr('error.chooseChain'));
      if (!chainEnabled(state.draft.chain)) return fail(tr('error.chainOff', { chain: chainName(state.draft.chain) }));
      go('review');
    },
    'confirm-pay': async (form) => {
      if (!state.secret) {
        await openVault(form.password.value);
        form.password.value = '';
      }
      state.busy = true;
      render();
      try {
        const plan = paymentPlan();
        const chain = state.draft.chain;
        const provider = chain === 'dogecoinvm' ? window.DogeNet.createVmProvider(state.settings) : window.DogeNet.createProvider(state.settings);
        await provider.verifyInputs(plan.inputs);
        const privateKeys = keysFor(plan.inputs);
        let signed;
        try {
          signed = window.DogeChain.signPayment({ inputs: plan.inputs, outputs: plan.outputs, privateKeys });
        } finally {
          Object.values(privateKeys).forEach((key) => key.fill(0));
        }
        const txid = await provider.broadcast(signed.hex);
        if (plan.change > 0n && state.pub.type === 'hd' && !state.settings.fixedReceive) {
          if (chain === 'dogecoinvm') state.pub.vmChangeIndex = (state.pub.vmChangeIndex || 0) + 1;
          else state.pub.changeIndex = (state.pub.changeIndex || 0) + 1;
        }
        writeJson(PUBLIC_KEY, state.pub);
        state.lastTx = txid;
        state.lastChain = chain;
        state.error = '';
        if (state.approval && state.request?.type === 'pay') {
          const done = state.approval;
          go('home', 'Payment sent.');
          done.resolve({ approved: true, txid, txId: txid });
        } else go('home', 'Payment sent.');
        refresh().catch(() => {});
      } finally {
        state.busy = false;
      }
    },
    'approve-connect': async (form) => {
      if (!state.secret) {
        const password = form?.password?.value || '';
        if (!password) return fail(tr('error.enterPassword'));
        await openVault(password);
        if (form.password) form.password.value = '';
      }
      grantSite(state.request.origin);
      const current = currentReceive();
      const payload = { approved: true, address: current.address, publicKey: current.publicKey, balance: balancePayload().balance };
      const done = state.approval;
      go('home');
      done.resolve(payload);
    },
    'unlock-and-pay': async (form) => {
      const password = form?.password?.value || '';
      if (!password) return fail(tr('error.enterPassword'));
      await openVault(password);
      form.password.value = '';
      grantSite(state.request.origin);
      go('review');
    },
    'pay-here': () => {
      if (!state.secret || !state.request) return;
      grantSite(state.request.origin);
      go('review');
    },
    'back-invoice': () => go('pay-choice'),
    'approve-sign': async (form) => {
      if (!state.secret) {
        await openVault(form.password.value);
        form.password.value = '';
      }
      const current = currentReceive();
      const privateKey = state.pub.type === 'single'
        ? window.DogeChain.privateKeyFromWif(state.secret.wif)
        : window.DogeChain.privateKeyForPath(state.secret.mnemonic, state.secret.passphrase, current.chain, current.index);
      let signature;
      try { signature = window.DogeChain.signMessage(privateKey, state.request.message); }
      finally { privateKey.fill(0); }
      const done = state.approval;
      go('home');
      done.resolve({ approved: true, signature, address: current.address });
    },
    copy: async (button) => {
      const text = button.dataset.copy || '';
      let copied = false;
      try {
        await navigator.clipboard.writeText(text);
        copied = true;
      } catch { /* This frame can block the clipboard API. */ }
      if (!copied) {
        const area = document.createElement('textarea');
        area.value = text;
        area.setAttribute('readonly', '');
        area.style.position = 'fixed';
        area.style.opacity = '0';
        document.body.appendChild(area);
        area.focus();
        area.select();
        try { copied = document.execCommand('copy'); } catch { copied = false; }
        area.remove();
      }
      if (!copied) return fail(tr('error.copyBlocked'));
      const label = button.querySelector('span:not(.mi)');
      if (label) label.textContent = tr('common.copied');
      else {
        const mark = button.querySelector('.mi');
        if (mark) mark.textContent = 'check';
        else button.textContent = tr('common.copied');
      }
    },
    'download-words': () => download('dogecoin-recovery-phrase.txt', `${tr('download.phraseTitle')}\n\n${state.pending.mnemonic}\n\n${tr('download.phraseWarn')}\n`, 'text/plain'),
    'download-backup': () => download('dogecoin-wallet-backup.json', JSON.stringify({ app: 'doge-pocket', version: 1, vault: state.vault }, null, 2), 'application/json'),
    'save-settings': async () => {
      readSettings();
      state.settings.presetChosen = true;
      writeJson(SETTINGS_KEY, state.settings);
      armLockTimer();
      go('home', 'Settings saved on this browser.');
      refresh().catch(() => {});
    },
    'test-connection': async (button) => {
      readSettings();
      button.disabled = true;
      button.textContent = 'Checking…';
      try {
        const notes = [];
        const problems = [];
        if (chainEnabled('dogecoin')) {
          try { notes.push(await window.DogeNet.createProvider(state.settings).test()); } catch (error) { problems.push(error.message); }
        }
        if (chainEnabled('dogecoinvm')) {
          try { notes.push(await window.DogeNet.createVmProvider(state.settings).test()); } catch (error) { problems.push(error.message); }
        }
        state.notice = notes.join(' ');
        state.error = problems.join(' ');
      } catch (error) {
        state.error = error.message;
      }
      render();
    },
    'refresh': () => refresh(),
    'lock': () => {
      state.secret = null;
      clearTimeout(state.lockTimer);
      state.unlockNext = 'home';
      go('unlock');
    },
    'go-unlock': (button) => { state.unlockNext = button.dataset.next || 'home'; go('unlock'); },
    'do-unlock': async (form) => {
      const password = form.password.value;
      await openVault(password);
      form.password.value = '';
      const next = state.unlockNext && state.unlockNext !== 'unlock' ? state.unlockNext : 'home';
      state.unlockNext = '';
      go(next);
    },
    'delete-wallet': () => {
      const typed = document.getElementById('delete-address')?.value.trim();
      if (typed !== currentReceive().address) return fail(tr('error.typeAddress'));
      localStorage.removeItem(VAULT_KEY);
      localStorage.removeItem(PUBLIC_KEY);
      localStorage.removeItem(SITES_KEY);
      localStorage.removeItem(CHAIN_CACHE_KEY);
      state.vault = null;
      state.pub = null;
      state.secret = null;
      state.sites = {};
      state.balances = { dogecoin: null, dogecoinvm: null };
      state.coins = { dogecoin: [], dogecoinvm: [] };
      state.histories = { dogecoin: [], dogecoinvm: [] };
      state.stale = { dogecoin: false, dogecoinvm: false };
      go('welcome', 'The wallet was removed from this browser. The coins are still safe if you kept the 12 words.');
    },
    'close-panel': () => {
      state.pinned = false;
      closeRequest();
      hidePanel(true);
    },
  };

  async function persistHd(mnemonic, passphrase, password) {
    const account = window.DogeChain.accountFromMnemonic(mnemonic, passphrase);
    await storeSecret({ type: 'hd', mnemonic, passphrase, xpub: account.xpub }, password);
    markUnlocked(state.secret);
  }

  async function storeSecret(secret, password, existingVault) {
    const vault = existingVault || await window.DogeChain.encryptSecret(secret, password);
    state.vault = vault;
    writeJson(VAULT_KEY, vault);
    if (secret.type === 'single') {
      state.pub = { v: 1, type: 'single', address: secret.address, publicKey: secret.publicKey, createdAt: Date.now() };
    } else {
      state.pub = { v: 1, type: 'hd', xpub: secret.xpub, receiveIndex: 0, changeIndex: 0, deepScan: false, createdAt: Date.now() };
    }
    writeJson(PUBLIC_KEY, state.pub);
    markUnlocked(secret);
  }

  async function openVault(password) {
    const secret = await window.DogeChain.decryptSecret(state.vault, password);
    markUnlocked(secret);
  }

  function screenNeedsUnlock(screen) {
    return ['home', 'send', 'receive', 'activity', 'bridge', 'bridge-review', 'settings', 'backup', 'review', 'approve'].includes(screen);
  }

  function present(screen) {
    if (state.pub && !state.secret && screenNeedsUnlock(screen)) {
      state.unlockNext = screen;
      return 'unlock';
    }
    return screen;
  }

  function lockSeconds() {
    const saved = Number(state.settings.autolockSeconds);
    if (Number.isFinite(saved) && saved > 0) return saved;
    const minutes = Number(state.settings.autolockMinutes);
    if (Number.isFinite(minutes) && minutes > 0) return minutes * 60;
    return 60;
  }

  function lockWaitLabel() {
    const seconds = lockSeconds();
    if (seconds < 120) return tr('time.seconds', { n: seconds });
    const minutes = seconds / 60;
    if (Number.isInteger(minutes)) return minutes === 1 ? tr('time.minute') : tr('time.minutes', { n: minutes });
    return tr('time.seconds', { n: seconds });
  }

  function armLockTimer() {
    clearTimeout(state.lockTimer);
    if (!state.secret) return;
    state.lockTimer = setTimeout(lockFromIdle, lockSeconds() * 1000);
  }

  function noteActivity() {
    if (!state.secret) return;
    armLockTimer();
  }

  function lockFromIdle() {
    if (!state.secret) return;
    stashDraft();
    state.secret = null;
    clearTimeout(state.lockTimer);
    if (screenNeedsUnlock(state.screen)) {
      state.unlockNext = state.screen;
      state.screen = 'unlock';
      state.notice = '';
      state.tip = '';
    }
    render();
  }

  function markUnlocked(secret) {
    state.secret = secret;
    armLockTimer();
  }

  async function ensureFresh() {
    const dogeReady = !chainEnabled('dogecoin') || state.balances.dogecoin != null;
    const vmReady = !chainEnabled('dogecoinvm') || state.balances.dogecoinvm != null;
    if (dogeReady && vmReady && Date.now() - state.syncedAt < 15000) return;
    await refresh();
  }

  async function refresh(options = {}) {
    if (!state.pub) return;
    if (state.pulling) return;
    const quiet = Boolean(options.quiet);
    state.pulling = true;
    if (!quiet) {
      state.busy = true;
      if (state.screen === 'home') render();
    }
    try {
      const dogeWatch = watchList('dogecoin');
      const vmWatch = watchList('dogecoinvm');
      const [dogeScan, vmScan, dogeFees] = await Promise.all([
        chainEnabled('dogecoin') ? scanChain('dogecoin', dogeWatch) : Promise.resolve(),
        chainEnabled('dogecoinvm') ? scanChain('dogecoinvm', vmWatch) : Promise.resolve(),
        chainEnabled('dogecoin')
          ? window.DogeNet.createProvider(state.settings).fees().then((fees) => ({ ok: true, fees })).catch(() => ({ ok: false }))
          : Promise.resolve({ ok: false }),
      ]);
      if (dogeFees.ok) state.fees = dogeFees.fees;
      state.syncedAt = Date.now();
      state.error = state.chainError[state.chain] || '';
    } finally {
      state.pulling = false;
      state.busy = false;
    }
    if (quiet) paintLive();
    else if (['home', 'activity', 'receive', 'send', 'review'].includes(state.screen)) render();
  }

  function paintLive() {
    if (!['home', 'send', 'receive', 'bridge', 'activity'].includes(state.screen)) return;
    document.querySelectorAll('[data-chain-balance]').forEach((node) => {
      const text = `${balanceText(node.dataset.chainBalance)} DOGE`;
      if (node.textContent !== text) node.textContent = text;
    });
    const chain = state.screen === 'send'
      ? (state.draft.chain === 'dogecoinvm' ? 'dogecoinvm' : 'dogecoin')
      : (state.chain === 'dogecoinvm' ? 'dogecoinvm' : 'dogecoin');
    const balance = document.querySelector('[data-live="balance"]');
    if (balance && balance.firstChild) {
      const text = `${balanceText(chain)} `;
      if (balance.firstChild.textContent !== text) balance.firstChild.textContent = text;
    }
    const badges = document.querySelector('[data-live="badges"]');
    if (badges) {
      const dollars = chain === 'dogecoin' ? money(state.balances.dogecoin) : '';
      const provider = chain === 'dogecoinvm' ? vmProvider().label : window.DogeNet.createProvider(state.settings).label;
      const html = badgeBits(dollars, chain, provider, state.stale[chain]);
      if (badges.innerHTML !== html) badges.innerHTML = html;
    }
    const activity = document.querySelector('[data-live="activity"]');
    if (activity && (state.screen === 'home' || state.screen === 'activity')) {
      const html = txRows(chain);
      if (activity.innerHTML !== html) activity.innerHTML = html;
    }
    document.querySelectorAll('[data-fee-label]').forEach((node) => {
      const text = feeLabel(node.dataset.feeLabel);
      if (node.textContent !== text) node.textContent = text;
    });
    if (state.screen !== 'receive') return;
    const current = currentReceive(chain);
    const address = document.querySelector('[data-live="address"]');
    const qr = document.querySelector('[data-live="qr"]');
    if (address && address.value !== current.address) {
      address.value = current.address;
      const copy = address.parentElement?.querySelector('[data-copy]');
      if (copy) copy.dataset.copy = current.address;
      if (qr) qr.innerHTML = window.DogeChain.qrSvg(window.DogeChain.paymentUri(chain, current.address));
    }
  }

  function startPolling() {
    if (state.pollTimer) return;
    state.pollTimer = setInterval(() => {
      if (document.hidden || !state.pub || !state.secret || state.pulling) return;
      if (!['home', 'send', 'receive', 'bridge', 'activity'].includes(state.screen)) return;
      refresh({ quiet: true }).catch(() => {});
    }, 3000);
  }

  async function scanChain(chain, watched) {
    const provider = chain === 'dogecoinvm' ? window.DogeNet.createVmProvider(state.settings) : window.DogeNet.createProvider(state.settings);
    try {
      const info = await provider.inspect(watched.map((row) => row.address));
      if (state.pub.type === 'hd') {
        const receiveKey = chain === 'dogecoinvm' ? 'vmReceiveIndex' : 'receiveIndex';
        const changeKey = chain === 'dogecoinvm' ? 'vmChangeIndex' : 'changeIndex';
        const deepKey = chain === 'dogecoinvm' ? 'vmDeepScan' : 'deepScan';
        state.pub[receiveKey] = advance(chain, 0, watched, info);
        state.pub[changeKey] = advance(chain, 1, watched, info);
        state.pub[deepKey] = false;
        writeJson(PUBLIC_KEY, state.pub);
      }
      const coins = [];
      watched.forEach((row) => {
        for (const coin of info[row.address]?.utxos || []) coins.push({ ...coin, chain: row.chain, index: row.index, address: row.address });
      });
      state.coins[chain] = coins;
      state.balances[chain] = coins.reduce((sum, coin) => sum + coin.value, 0n);
      const used = watched.filter((row) => info[row.address]?.used).map((row) => row.address);
      try {
        state.histories[chain] = used.length ? await provider.history(used) : [];
      } catch (error) {
        const saved = readChainStore()?.chains?.[chain];
        state.histories[chain] = saved?.history || [];
        state.stale[chain] = false;
        state.chainError[chain] = state.histories[chain].length
          ? 'Activity could not be refreshed. Showing the last saved payments. The balance is current.'
          : error.message;
        saveChainCache(chain);
        return;
      }
      state.chainError[chain] = '';
      state.stale[chain] = false;
      saveChainCache(chain);
    } catch (error) {
      if (applyChainCache(chain)) {
        state.chainError[chain] = `The network did not answer (${error.message}). Showing the last saved balance and activity.`;
      } else {
        state.chainError[chain] = error.message;
      }
    }
  }

  function watchList(chain) {
    if (state.pub.type === 'single') return [{ chain: 0, index: 0, address: state.pub.address, publicKey: state.pub.publicKey }];
    const deep = chain === 'dogecoinvm' ? state.pub.vmDeepScan : state.pub.deepScan;
    const receiveIndex = chain === 'dogecoinvm' ? (state.pub.vmReceiveIndex || 0) : (state.pub.receiveIndex || 0);
    const changeIndex = chain === 'dogecoinvm' ? (state.pub.vmChangeIndex || 0) : (state.pub.changeIndex || 0);
    const extra = deep ? 20 : 1;
    const rows = [];
    for (let index = 0; index <= receiveIndex + extra; index++) rows.push(window.DogeChain.deriveAddress(state.pub.xpub, 0, index));
    for (let index = 0; index <= changeIndex + extra; index++) rows.push(window.DogeChain.deriveAddress(state.pub.xpub, 1, index));
    return rows;
  }

  function advance(which, branch, rows, info) {
    const deep = which === 'dogecoinvm' ? state.pub.vmDeepScan : state.pub.deepScan;
    const gap = deep ? 20 : 1;
    const stored = branch === 0
      ? (which === 'dogecoinvm' ? state.pub.vmReceiveIndex : state.pub.receiveIndex)
      : (which === 'dogecoinvm' ? state.pub.vmChangeIndex : state.pub.changeIndex);
    let index = stored || 0;
    if (branch === 0 && state.settings.fixedReceive) return index;
    let missed = 0;
    let cursor = index;
    while (missed < gap) {
      const row = rows.find((item) => item.chain === branch && item.index === cursor);
      if (!row) break;
      if (info[row.address]?.used) { index = cursor + 1; missed = 0; }
      else missed += 1;
      cursor += 1;
    }
    return index;
  }

  function paymentPlan() {
    if (state.draft.chain !== 'dogecoin' && state.draft.chain !== 'dogecoinvm') throw new Error(tr('error.chooseChain'));
    if (!chainEnabled(state.draft.chain)) throw new Error(tr('error.chainOff', { chain: chainName(state.draft.chain) }));
    const amount = window.DogeChain.dogeToKoinu(state.draft.amount);
    const rate = feeRate();
    const coins = coinsFor(state.draft.chain);
    const max = window.DogeChain.selectAll(coins, rate);
    const plan = amount === max.amount ? max : window.DogeChain.selectCoins(coins, amount, rate);
    const destination = window.DogeChain.parsePayment(state.draft.to).address;
    const outputs = [{ address: destination, value: plan.amount || amount }];
    if (plan.change > 0n) outputs.push({ address: changeReceive(state.draft.chain).address, value: plan.change });
    return { ...plan, outputs, amount: plan.amount || amount };
  }

  function keysFor(inputs) {
    const keys = {};
    if (state.pub.type === 'single') {
      keys[state.pub.address] = window.DogeChain.privateKeyFromWif(state.secret.wif);
      return keys;
    }
    for (const input of inputs) {
      if (!keys[input.address]) keys[input.address] = window.DogeChain.privateKeyForPath(state.secret.mnemonic, state.secret.passphrase, input.chain, input.index);
    }
    return keys;
  }

  function feeSpan() {
    if ((state.draft.chain || state.chain) === 'dogecoinvm') return { min: 10, max: 5000 };
    const min = 1000;
    const max = Math.max(min * 2, state.fees.fast || 0, state.fees.normal || 0, state.fees.slow || 0);
    return { min, max };
  }

  function presetRate(name) {
    if ((state.draft.chain || state.chain) === 'dogecoinvm') return { slow: 100, normal: 200, fast: 500 }[name] || 200;
    return state.fees[name] || state.fees.normal || 10000;
  }

  function shownFeeRate() {
    if (state.draft.fee === 'custom') return stepToRate(rateToStep(state.draft.customRate || feeSpan().min));
    const name = ['slow', 'normal', 'fast'].includes(state.draft.fee) ? state.draft.fee : 'normal';
    return presetRate(name);
  }

  function rateToStep(rate) {
    const { min, max } = feeSpan();
    const clamped = Math.min(max, Math.max(min, Number(rate) || min));
    if (max === min) return 0;
    const t = (Math.log(clamped) - Math.log(min)) / (Math.log(max) - Math.log(min));
    return Math.round(t * 1000);
  }

  function stepToRate(step) {
    const { min, max } = feeSpan();
    const t = Math.min(1000, Math.max(0, Number(step) || 0)) / 1000;
    if (max === min) return min;
    return Math.round(Math.exp(Math.log(min) + t * (Math.log(max) - Math.log(min))));
  }

  function feeSlider() {
    const step = rateToStep(shownFeeRate());
    const readout = `${window.DogeChain.formatDoge(window.DogeChain.feeFor(1, 2, shownFeeRate()))} DOGE`;
    return `<div class="fee-custom${state.draft.fee === 'custom' ? ' active' : ''}"><div class="fee-custom-head"><span>${esc(tr('fee.custom'))}</span><strong class="num" id="custom-fee-readout">${esc(readout)}</strong></div><input class="fee-range" id="custom-fee" type="range" min="0" max="1000" step="1" value="${step}" style="--fill:${step / 10}%" aria-label="${esc(tr('aria.customFee'))}"><span class="hint">${esc(tr('fee.customHint'))}</span></div>`;
  }

  function feeRate() {
    const chain = state.draft.chain || state.chain;
    if (state.draft.fee === 'custom') {
      const { min, max } = feeSpan();
      const rate = Math.min(max, Math.max(min, Number(state.draft.customRate) || min));
      return BigInt(Math.round(rate));
    }
    if (chain === 'dogecoinvm') {
      const table = { slow: 100, normal: 200, fast: 500 };
      return BigInt(table[state.draft.fee || 'normal'] || 200);
    }
    return BigInt(state.fees[state.draft.fee || state.settings.fee] || state.fees.normal || 10000);
  }

  function currentReceive(chain) {
    if (!state.pub) return { address: '', publicKey: '' };
    if (state.pub.type === 'single') return { chain: 0, index: 0, address: state.pub.address, publicKey: state.pub.publicKey };
    const savedIndex = chain === 'dogecoinvm' ? (state.pub.vmReceiveIndex || 0) : (state.pub.receiveIndex || 0);
    const index = state.settings.fixedReceive ? 0 : savedIndex;
    return window.DogeChain.deriveAddress(state.pub.xpub, 0, index);
  }

  function changeReceive(chain) {
    if (state.pub.type === 'single' || state.settings.fixedReceive) return currentReceive(chain);
    const index = chain === 'dogecoinvm' ? (state.pub.vmChangeIndex || 0) : (state.pub.changeIndex || 0);
    return window.DogeChain.deriveAddress(state.pub.xpub, 1, index);
  }

  async function loadBridge() {
    if (state.bridgeLoading) return;
    state.bridgeLoading = true;
    try {
      const result = await window.DogeNet.createVmProvider(state.settings).bridgeInfo();
      state.bridgeInfo = result.info;
      state.bridgeError = '';
    } catch (error) {
      state.bridgeInfo = null;
      state.bridgeError = error.message;
    } finally {
      state.bridgeLoading = false;
      if (state.screen === 'bridge') {
        state.error = state.bridgeError;
        render();
      }
    }
  }

  async function buildBridgePlan() {
    const { info } = await window.DogeNet.createVmProvider(state.settings).bridgeInfo();
    state.bridgeInfo = info;
    const direction = state.bridgeDirection === 'todoge' ? 'todoge' : 'tovm';
    const amount = window.DogeChain.dogeToKoinu(state.bridgeAmount);
    const vmFee = window.DogeChain.dogeToKoinu(info.vmFee, true);
    const dogeFee = window.DogeChain.dogeToKoinu(info.dogeFee, true);
    const creditTo = currentReceive('dogecoinvm').address;
    if (direction === 'tovm') {
      const min = window.DogeChain.dogeToKoinu(info.minDeposit, true);
      const max = window.DogeChain.dogeToKoinu(info.maxDeposit, true);
      if (amount < min) throw new Error(tr('error.minVm', { min: info.minDeposit }));
      if (max > 0n && amount > max) throw new Error(tr('error.maxVm', { max: info.maxDeposit }));
      if (amount <= vmFee) throw new Error(tr('error.feeBigger'));
      const quoted = await window.DogeNet.createVmProvider(state.settings).depositAddress(creditTo);
      const depositAddress = window.DogeChain.checkBridgeDeposit({
        address: creditTo,
        signers: info.signers,
        depositAddress: quoted.depositAddress,
        redeemScript: quoted.redeemScript,
      });
      if (quoted.creditTo && quoted.creditTo !== creditTo) throw new Error(tr('error.creditMismatch'));
      const picked = selectBridgeCoins(coinsFor('dogecoin'), amount, BigInt(state.fees.slow || 1000), 1);
      const outputs = [{ address: depositAddress, value: amount }];
      if (picked.change > 0n) outputs.push({ address: changeReceive('dogecoin').address, value: picked.change });
      return {
        direction, amount, info, depositAddress, creditTo, bridgeFee: vmFee, receive: amount - vmFee,
        inputs: picked.inputs, outputs, fee: picked.fee, change: picked.change, chain: 'dogecoin',
        confirmations: confirmationsFor(amount, info),
      };
    }
    const destination = String(state.bridgeDest || '').trim();
    if (!window.DogeChain.isAddress(destination)) throw new Error(tr('error.needD'));
    if (destination === info.pegAddress || destination === info.reserveAddress) throw new Error(tr('error.bridgeAddress'));
    const minOut = window.DogeChain.dogeToKoinu(info.minPegOut, true);
    if (amount < minOut) throw new Error(tr('error.minDoge', { min: info.minPegOut }));
    if (amount <= dogeFee) throw new Error(tr('error.feeBigger'));
    const tag = window.DogeChain.bridgeWithdrawTag(destination);
    if (window.DogeChain.addressFromBridgeTag(tag) !== destination) throw new Error(tr('error.tagMismatch'));
    if (!info.reserveAddress || info.reserveAddress !== info.pegAddress) throw new Error(tr('error.reserveMismatch'));
    const picked = selectBridgeCoins(coinsFor('dogecoinvm'), amount, 100n, 2);
    const outputs = [{ address: info.reserveAddress, value: amount }, { script: tag, value: 0n }];
    if (picked.change > 0n) outputs.push({ address: changeReceive('dogecoinvm').address, value: picked.change });
    return {
      direction, amount, info, destination, reserveAddress: info.reserveAddress, bridgeFee: dogeFee, receive: amount - dogeFee,
      inputs: picked.inputs, outputs, fee: picked.fee, change: picked.change, chain: 'dogecoinvm',
    };
  }

  function confirmationsFor(amount, info) {
    let best = null;
    for (const tier of info.confirmationTiers || []) {
      try {
        const upTo = window.DogeChain.dogeToKoinu(tier.upTo, true);
        const confirmations = Number(tier.confirmations);
        if (amount <= upTo && confirmations > 0 && (best == null || upTo < best.upTo)) best = { upTo, confirmations };
      } catch { /* Skip a tier this wallet cannot read. */ }
    }
    return best ? best.confirmations : (Number(info.depositConfirmations) || 6);
  }

  function selectBridgeCoins(utxos, amount, rate, outputsWithoutChange) {
    const spendable = [...utxos].filter((coin) => coin.value > 0n).sort((a, b) => (a.value > b.value ? -1 : 1));
    const chosen = [];
    let total = 0n;
    for (const coin of spendable) {
      chosen.push(coin);
      total += coin.value;
      const withChange = window.DogeChain.feeFor(chosen.length, outputsWithoutChange + 1, rate);
      if (total < amount + withChange) continue;
      const change = total - amount - withChange;
      if (change === 0n || change >= 1000000n) return { inputs: chosen, fee: withChange, change };
      const noChange = window.DogeChain.feeFor(chosen.length, outputsWithoutChange, rate);
      if (total >= amount + noChange) return { inputs: chosen, fee: total - amount, change: 0n };
    }
    throw new Error(tr('error.notEnough'));
  }

  function bridge() {
    if (state.bridgeError) state.error = state.bridgeError;
    const direction = state.bridgeDirection === 'todoge' ? 'todoge' : 'tovm';
    const info = state.bridgeInfo;
    const dirs = ['tovm', 'todoge'].map((id) => {
      const toVm = id === 'tovm';
      return `<button type="button" class="chain ${direction === id ? 'active' : ''}" data-action="bridge-dir" data-direction="${id}">${icon(toVm ? 'payments' : 'bolt')}<span><strong>${esc(toVm ? tr('bridge.toVm') : tr('bridge.toDoge'))}</strong><span class="num">${esc(balanceText(toVm ? 'dogecoin' : 'dogecoinvm'))} DOGE</span></span></button>`;
    }).join('');
    const note = !info
      ? (state.bridgeError ? '' : `<p class="hint">${esc(tr('bridge.checking'))}</p>`)
      : direction === 'tovm'
        ? `<p class="hint">${esc(tr('bridge.vmHint', { fee: info.vmFee, min: info.minDeposit }))}</p>`
        : `<p class="hint">${esc(tr('bridge.dogeHint', { fee: info.dogeFee, min: info.minPegOut }))}</p>`;
    const dest = direction === 'todoge' ? `<label>${esc(tr('bridge.dest'))}<input id="bridge-dest" class="num" value="${esc(state.bridgeDest || currentReceive('dogecoin').address)}" autocomplete="off" spellcheck="false" required></label>` : '';
    const lead = direction === 'tovm' ? tr('bridge.leadVm') : tr('bridge.leadDoge');
    return shell(tr('bridge.title'), `<form class="stack" data-action="bridge-review"><div class="chains">${dirs}</div><p class="lead">${esc(lead)}</p>${note}<label>${esc(tr('common.amount'))}<input id="bridge-amount" class="num" data-amount="1" value="${esc(state.bridgeAmount)}" inputmode="decimal" autocomplete="off" required></label>${dest}<p class="hint">${esc(tr('bridge.alpha'))}</p><button class="primary" type="submit" ${info ? '' : 'disabled'}>${icon('fact_check')}<span>${esc(tr('common.review'))}</span></button></form>`, 'link');
  }

  function bridgeReview() {
    const plan = state.bridgePrepared;
    if (!plan) return bridge();
    const password = state.secret ? '' : `<label>${esc(tr('review.walletPassword'))}<input name="password" type="password" autocomplete="current-password" required></label>`;
    const where = plan.direction === 'tovm'
      ? `<p>${esc(tr('bridge.deposit'))}<br><span class="num">${esc(plan.depositAddress)}</span></p><p>${esc(tr('bridge.credited'))}<br><span class="num">${esc(plan.creditTo)}</span></p><p class="hint">${esc(tr('bridge.depositHint', { count: plan.confirmations, amount: window.DogeChain.formatDoge(plan.receive) }))}</p>`
      : `<p>${esc(tr('bridge.tag'))}<br><span class="num">${esc(plan.destination)}</span></p><p class="hint">${esc(tr('bridge.tagHint', { amount: window.DogeChain.formatDoge(plan.receive) }))}</p>`;
    return shell(tr('bridge.confirm'), `<form class="stack" data-action="confirm-bridge"><div class="card"><p>${esc(tr('bridge.from'))}<br><strong>${esc(chainName(plan.chain))}</strong></p><p>${esc(tr('bridge.amount'))}<br><strong class="num">${esc(window.DogeChain.formatDoge(plan.amount))} DOGE</strong></p><p>${esc(tr('bridge.bridgeFee'))}<br><strong class="num">${esc(window.DogeChain.formatDoge(plan.bridgeFee))} DOGE</strong></p><p>${esc(tr('bridge.youReceive'))}<br><strong class="num">${esc(window.DogeChain.formatDoge(plan.receive))} DOGE</strong></p><p>${esc(tr('bridge.networkFee'))}<br><strong class="num">${esc(window.DogeChain.formatDoge(plan.fee))} DOGE</strong></p>${where}</div>${password}<button class="primary" type="submit" ${state.busy ? 'disabled' : ''}>${icon('verified')}<span>${esc(state.busy ? tr('common.sending') : tr('common.moveNow'))}</span></button>${button('ghost', 'bridge', 'arrow_back', tr('common.back'))}</form>`, 'link');
  }

  function coinsFor(chain) {
    return state.coins[chain] || [];
  }

  function balanceText(chain) {
    const value = state.balances[chain];
    return value == null ? '...' : window.DogeChain.formatDoge(value);
  }

  function hostChain() {
    const raw = String(new URLSearchParams(location.search).get('chains') || '').toLowerCase();
    return raw === 'dogecoin' || raw === 'dogecoinvm' ? raw : '';
  }

  function featureSet() {
    const raw = String(new URLSearchParams(location.search).get('features') || '').toLowerCase();
    if (!raw || raw === 'all') return null;
    const allow = new Set(['pay', 'wallet', 'send', 'sign']);
    const picked = new Set(raw.split(/[^a-z]+/).filter((id) => allow.has(id)));
    if (picked.has('send') || picked.has('sign')) picked.add('wallet');
    return picked.size ? picked : null;
  }

  function featureOn(id) {
    const picked = featureSet();
    return !picked || picked.has(id);
  }

  function chainEnabled(id) {
    const host = hostChain();
    if (host) return id === host;
    const flag = id === 'dogecoinvm' ? state.settings.enableDogecoinvm : state.settings.enableDogecoin;
    return flag !== false && flag !== 'false';
  }

  function bothChains() {
    return chainEnabled('dogecoin') && chainEnabled('dogecoinvm');
  }

  function preferredChain(chain) {
    const doge = chainEnabled('dogecoin');
    const vm = chainEnabled('dogecoinvm');
    if (chain === 'dogecoinvm' && vm) return 'dogecoinvm';
    if (chain !== 'dogecoinvm' && doge) return 'dogecoin';
    if (vm) return 'dogecoinvm';
    return 'dogecoin';
  }

  function settleChains() {
    state.chain = preferredChain(state.chain);
    if (state.draft.locked && state.draft.chain && !chainEnabled(state.draft.chain)) {
      state.draft.locked = false;
      state.draft.chain = preferredChain(state.chain);
    } else if (!state.draft.locked) {
      state.draft.chain = preferredChain(state.draft.chain || state.chain);
    }
    state.settingsTab = preferredChain(state.settingsTab || state.chain);
  }

  function chainName(chain) {
    return chain === 'dogecoinvm' ? 'DogecoinVM' : 'Dogecoin';
  }

  function txLink(chain, txid) {
    if (chain === 'dogecoinvm') {
      return `${vmProvider().explorer}/api/tx/${encodeURIComponent(txid)}`;
    }
    return `https://dogechain.com/tx/${encodeURIComponent(txid)}`;
  }

  function vmProvider() {
    try { return window.DogeNet.createVmProvider(state.settings); }
    catch (error) { return { label: 'DogecoinVM', broadcastLabel: error.message, explorer: 'https://vm.dogedrop.org' }; }
  }

  function chainWait(chain) {
    return chain === 'dogecoinvm' ? tr('wait.vm') : tr('wait.doge');
  }

  function balancePayload() {
    const dogeOn = chainEnabled('dogecoin');
    const vmOn = chainEnabled('dogecoinvm');
    const koinu = dogeOn ? (state.balances.dogecoin || 0n) : 0n;
    const vmKnown = vmOn && state.balances.dogecoinvm != null;
    const vm = vmKnown ? state.balances.dogecoinvm : 0n;
    const safe = (value) => (value <= BigInt(Number.MAX_SAFE_INTEGER) ? Number(value) : value.toString());
    return {
      balance: safe(koinu),
      balanceKoinu: koinu.toString(),
      balanceDoge: window.DogeChain.formatDoge(koinu),
      balanceVm: vmKnown ? safe(vm) : null,
      balanceVmKoinu: vmKnown ? vm.toString() : null,
      balanceVmDoge: vmKnown ? window.DogeChain.formatDoge(vm) : null,
    };
  }

  function applyPayRequest(request) {
    const raw = String(request.recipientAddress || request.to || '').trim();
    const explicit = request.dogeAmount ?? request.amount;
    state.draft.externalOnly = request.externalOnly === true;
    try {
      const parsed = window.DogeChain.parsePayment(raw);
      state.draft.to = raw;
      state.draft.amount = explicit != null && explicit !== '' ? String(explicit) : (parsed.amount || '');
      state.draft.label = parsed.label || '';
      state.draft.message = parsed.message || '';
      if (parsed.chain && !chainEnabled(parsed.chain)) {
        state.draft.chain = preferredChain('');
        state.draft.locked = false;
        state.error = tr('error.chainOff', { chain: chainName(parsed.chain) });
      } else if (parsed.chain) {
        state.draft.chain = parsed.chain;
        state.draft.locked = true;
        state.error = '';
      } else if (!bothChains()) {
        state.draft.chain = preferredChain('');
        state.draft.locked = false;
        state.error = '';
      } else {
        state.draft.chain = '';
        state.draft.locked = false;
        state.error = '';
      }
      if (request.label) state.draft.label = String(request.label);
      if (request.message) state.draft.message = String(request.message);
      // H7-25: a site may ask for slow, normal, or fast. Any other value keeps the wallet setting.
      state.draft.fee = ['slow', 'normal', 'fast'].includes(request.fee) ? request.fee : (state.settings.fee || 'normal');
    } catch (error) {
      state.draft.to = raw;
      state.draft.chain = '';
      state.draft.locked = false;
      state.draft.amount = explicit != null ? String(explicit) : '';
      state.error = error.message;
    }
  }

  function readDestination() {
    const field = document.getElementById('send-to');
    const amount = document.getElementById('send-amount');
    const raw = field ? field.value.trim() : state.draft.to;
    const parsed = window.DogeChain.parsePayment(raw);
    if (parsed.chain && !chainEnabled(parsed.chain)) throw new Error(tr('error.chainOff', { chain: chainName(parsed.chain) }));
    state.draft.to = raw;
    if (parsed.chain) {
      state.draft.chain = parsed.chain;
      state.draft.locked = true;
    } else if (!bothChains()) {
      state.draft.chain = preferredChain(state.chain);
      state.draft.locked = false;
    } else if (!state.draft.chain) state.draft.chain = state.chain || '';
    else state.draft.locked = false;
    if (amount && amount.value.trim()) state.draft.amount = amount.value.trim();
    else if (parsed.amount) state.draft.amount = parsed.amount;
    state.draft.label = parsed.label || '';
    state.draft.message = parsed.message || '';
  }

  function readSettings() {
    const form = document.getElementById('settings-form');
    if (!form) return;
    const data = new FormData(form);
    for (const [key, value] of data.entries()) state.settings[key] = String(value);
    if (form.enableDogecoin && form.enableDogecoinvm) {
      state.settings.enableDogecoin = form.enableDogecoin.checked;
      state.settings.enableDogecoinvm = form.enableDogecoinvm.checked;
    }
    if (form.fixedReceive) state.settings.fixedReceive = form.fixedReceive.checked;
    state.settings.autolockSeconds = Number(state.settings.autolockSeconds) || 60;
  }

  function stashDraft() {
    const to = document.getElementById('send-to');
    const amount = document.getElementById('send-amount');
    if (to) state.draft.to = to.value.trim();
    if (amount) state.draft.amount = amount.value.trim();
    const bridgeAmount = document.getElementById('bridge-amount');
    const dest = document.getElementById('bridge-dest');
    if (bridgeAmount) state.bridgeAmount = bridgeAmount.value.trim();
    if (dest) state.bridgeDest = dest.value.trim();
    const search = document.getElementById('docs-search');
    if (search) state.docsQuery = search.value;
    readSettings();
  }

  function quizIndexes(mnemonic) {
    const count = mnemonic.split(' ').length;
    const picks = new Set();
    while (picks.size < 3) picks.add(crypto.getRandomValues(new Uint8Array(1))[0] % count);
    return [...picks];
  }

  function go(screen, notice = '') {
    if ((screen === 'bridge' || screen === 'bridge-review') && !bothChains()) screen = 'home';
    state.screen = present(screen);
    state.tip = '';
    state.notice = notice;
    if (state.screen !== 'home') state.error = '';
    render();
  }

  function fail(message) {
    state.error = message;
    state.busy = false;
    render();
  }

  function render() {
    settleChains();
    if (!featureOn('wallet') && !['checkout', 'pay-choice', 'caution', 'access', 'docs', 'language'].includes(state.screen)) state.screen = 'checkout';
    if ((state.screen === 'send' || state.screen === 'review') && !featureOn('send') && state.request?.type !== 'invoice') state.screen = 'home';
    if ((state.screen === 'bridge' || state.screen === 'bridge-review') && !bothChains()) state.screen = 'home';
    state.screen = present(state.screen);
    const previous = state.painted;
    const screen = {
      caution, welcome, access, 'own-tab': ownTab, password, reveal, confirm, restore, home, send, review, receive, activity, bridge, 'bridge-review': bridgeReview, settings, backup, unlock, approve, 'pay-choice': payChoice, docs, language: languageScreen, checkout,
    }[state.screen] || welcome;
    app.innerHTML = screen();
    const view = app.querySelector('.screen');
    const tab = state.settingsTab === 'dogecoinvm' ? 'dogecoinvm' : 'dogecoin';
    const opened = previous !== state.screen || (state.screen === 'settings' && state.paintedTab !== tab);
    state.painted = state.screen;
    state.paintedTab = tab;
    if (opened && view) view.scrollTop = 0;
    const field = app.querySelector('.screen input:not([readonly]):not(#delete-address):not(#docs-search), .screen textarea');
    const keepTop = state.screen === 'home' || state.screen === 'receive' || state.screen === 'activity' || state.screen === 'settings' || state.screen === 'bridge' || state.screen === 'docs' || state.screen === 'language';
    if (field && !keepTop && !state.keepFocus) field.focus({ preventScroll: true });
    state.keepFocus = false;
    if (opened && view) view.scrollTop = 0;
  }

  function icon(name) {
    return `<span class="mi" aria-hidden="true">${name}</span>`;
  }

  function button(kind, action, glyph, label, extra = '') {
    return `<button class="${kind}" type="button" data-action="${action}" ${extra}>${icon(glyph)}<span>${esc(label)}</span></button>`;
  }

  function addressField(address) {
    return `<div class="copybox"><input class="num" data-live="address" readonly value="${esc(address)}" aria-label="${esc(tr('aria.address'))}" spellcheck="false"><button type="button" class="copy" data-action="copy" data-copy="${esc(address)}" aria-label="${esc(tr('aria.copyAddress'))}">${icon('content_copy')}</button></div>`;
  }

  function qrBlock(address) {
    return `<div class="qr-frame" data-live="qr">${window.DogeChain.qrSvg(address)}</div>`;
  }

  function shell(title, body, glyph) {
    const fit = ['approve', 'review', 'pay-choice'].includes(state.screen);
    const sameOrigin = !fit && embed && location.protocol !== 'file:' && state.parentOrigin && state.parentOrigin === location.origin
      ? `<div class="banner">${icon('shield')}<span>${esc(tr('banner.sameOrigin'))}</span></div>`
      : '';
    const help = helpButton(state.screen);
    const heading = title
      ? `<div class="section-head"><h1>${glyph ? icon(glyph) : ''}<span>${esc(title)}</span></h1>${help}</div>`
      : (help ? `<div class="section-tools">${help}</div>` : '');
    const unlocked = Boolean(state.pub && state.secret && state.screen !== 'caution');
    const here = ['home', 'send', 'receive', 'bridge', 'activity', 'settings', 'docs', 'language'].includes(state.screen) ? state.screen : 'home';
    const docsBtn = state.screen !== 'caution'
      ? `<button class="icon-btn${state.screen === 'docs' ? ' is-on' : ''}" type="button" data-action="docs" aria-label="${esc(tr('aria.docs'))}"${state.screen === 'docs' ? ' aria-current="page"' : ''}>${helpMark()}</button>`
      : '';
    const lock = !state.pub || state.screen === 'caution' ? '' : state.secret
      ? `<button class="icon-btn" type="button" data-action="lock" aria-label="${esc(tr('aria.lock'))}">${icon('lock')}</button>`
      : (state.screen === 'unlock' ? '' : `<button class="icon-btn" type="button" data-action="go-unlock" data-next="${here}" aria-label="${esc(tr('aria.unlock'))}">${icon('lock_open')}</button>`);
    const gear = unlocked && featureOn('wallet') ? `<button class="icon-btn${state.screen === 'settings' ? ' is-on' : ''}" type="button" data-action="settings" aria-label="${esc(tr('aria.settings'))}"${state.screen === 'settings' ? ' aria-current="page"' : ''}>${icon('settings')}</button>` : '';
    const close = embed ? `<button class="icon-btn" type="button" data-action="close-panel" aria-label="${esc(tr('aria.close'))}">${icon('close')}</button>` : '';
    const brand = embed ? 'DogeWallet' : 'DogeDrop';
    const status = walletStatus();
    const statusLabel = status.url ? tr('status.connectedTo', { url: status.url }) : status.text;
    const hostBit = status.url ? `<span class="host">${esc(status.url)}</span>` : '';
    return `<header class="top"><div class="brand"><img class="logo" src="img/logo.png" alt=""><div class="brand-text"><strong>${brand}</strong><span class="brand-meta" aria-label="${esc(statusLabel)}"><span class="pill ${status.cls}">${esc(status.text)}</span>${hostBit}</span></div></div><div class="top-actions">${docsBtn}${lock}${gear}${close}</div></header><div class="screen${fit ? ' fit' : ''}">${sameOrigin}${heading}${banners()}${body}</div>${tabBar()}`;
  }

  function walletStatus() {
    if (!state.pub) return { cls: '', text: tr('status.new'), url: '' };
    const url = embed && state.parentOrigin && state.sites[state.parentOrigin]?.connected ? siteName(state.parentOrigin) : '';
    if (!state.secret) return { cls: 'wait', text: tr('status.locked'), url };
    if (url) return { cls: 'on', text: tr('status.connected'), url };
    return { cls: 'on', text: tr('status.unlocked'), url: '' };
  }

  function tabsVisible() {
    if (!featureOn('wallet')) return false;
    if (!state.pub || !state.secret) return false;
    const hidden = ['caution', 'welcome', 'access', 'password', 'reveal', 'confirm', 'restore', 'unlock', 'approve', 'review', 'bridge-review', 'pay-choice', 'backup', 'own-tab'];
    return !hidden.includes(state.screen);
  }

  function tabBar() {
    if (!tabsVisible()) return '';
    const tabs = [
      ['home', 'account_balance_wallet', tr('tab.home')],
      ['send', 'send', tr('tab.send')],
      ['receive', 'qr_code_2', tr('tab.receive')],
      ['bridge', 'link', tr('tab.bridge')],
    ].filter(([action]) => (action !== 'bridge' || bothChains()) && (action !== 'send' || featureOn('send')));
    return `<nav class="tabbar" aria-label="${esc(tr('aria.wallet'))}">${tabs.map(([action, glyph, label]) => `<button type="button" class="tab${state.screen === action ? ' active' : ''}" data-action="${action}"${state.screen === action ? ' aria-current="page"' : ''}>${glyph === '?' ? helpMark() : icon(glyph)}<span>${esc(label)}</span></button>`).join('')}</nav>`;
  }

  function banners() {
    return `${state.error ? `<div class="banner bad">${esc(state.error)}</div>` : ''}${state.notice ? `<div class="banner good">${esc(state.notice)}</div>` : ''}`;
  }

  function ownTab() {
    return shell(tr('own.title'), `<p class="lead">${esc(tr('own.lead'))}</p><p><a href="index.html" target="_blank" rel="noopener">${esc(tr('own.link'))}</a></p>`, 'shield');
  }

  function caution() {
    return shell(tr('caution.title'), `<p class="lead">${esc(tr('caution.lead'))}</p>${button('primary', 'dismiss-caution', 'check', tr('caution.ok'))}`, 'shield');
  }

  function access() {
    return shell(tr('access.title'), `<p class="lead">${esc(tr('access.lead'))}</p>${button('primary', 'allow-storage', 'shield', tr('access.allow'))}<p class="foot"><a href="index.html" target="_blank" rel="noopener">${esc(tr('access.foot'))}</a> ${esc(tr('access.footRest'))}</p>`, 'shield');
  }

  function welcome() {
    const waiting = state.request ? `${siteAsk(state.request.origin)}<p class="hint">${esc(tr('welcome.waiting'))}</p>` : '';
    const lead = bothChains()
      ? tr('welcome.both')
      : tr('welcome.one', { chain: chainName(preferredChain('')) });
    return shell(tr('welcome.title'), `${waiting}<p class="lead">${esc(lead)}</p><div class="stack">${button('primary', 'start-create', 'add_card', tr('welcome.create'))}${button('ghost', 'start-restore', 'key', tr('welcome.restore'))}</div>`, 'account_balance_wallet');
  }

  function password() {
    return shell(tr('password.title'), `<p class="lead">${esc(tr('password.lead'))}</p><form class="stack" data-action="to-reveal"><label>${esc(tr('common.password'))}<input name="password" type="password" minlength="8" autocomplete="new-password" required></label><label>${esc(tr('common.passwordAgain'))}<input name="confirm" type="password" minlength="8" autocomplete="new-password" required></label><label>${esc(tr('password.extra'))}<span class="hint">${esc(tr('password.extraHint'))}</span><input name="passphrase" autocomplete="off"></label><button class="primary" type="submit">${icon('visibility')}<span>${esc(tr('password.show'))}</span></button>${button('ghost', 'back-welcome', 'arrow_back', tr('common.back'))}</form>`, 'password');
  }

  function reveal() {
    const words = state.pending.mnemonic.split(' ').map((word, index) => `<div class="word"><b>${index + 1}</b>${esc(word)}</div>`).join('');
    return shell(tr('reveal.title'), `<p class="lead">${esc(tr('reveal.lead'))}</p><div class="words">${words}</div><div class="row">${button('ghost', 'copy', 'content_copy', tr('reveal.copy'), `data-copy="${esc(state.pending.mnemonic)}"`)}${button('ghost', 'download-words', 'download', tr('reveal.download'))}</div>${button('primary', 'to-quiz', 'check', tr('reveal.wrote'))}`, 'edit_note');
  }

  function confirm() {
    const fields = state.pending.quiz.map((index, position) => `<label>${esc(tr('common.word', { n: index + 1 }))}<input name="word${position}" autocomplete="off" autocapitalize="off" spellcheck="false" required></label>`).join('');
    return shell(tr('confirm.title'), `<form class="stack" data-action="finish-create">${fields}<label class="switch"><input name="saved" type="checkbox" role="switch" required><span class="track" aria-hidden="true"></span><span>${esc(tr('confirm.saved'))}</span></label><button class="primary" type="submit">${icon('save')}<span>${esc(tr('confirm.save'))}</span></button></form>`, 'fact_check');
  }

  function restore() {
    const mode = state.pending.restore || 'words';
    const choices = [
      ['words', 'edit_note', tr('restore.words'), tr('restore.wordsDetail')],
      ['wif', 'key', tr('restore.key'), tr('restore.keyDetail')],
      ['file', 'download', tr('restore.file'), tr('restore.fileDetail')],
    ].map(([id, glyph, title, detail]) => `<button type="button" class="mode${mode === id ? ' active' : ''}" data-action="set-restore" data-mode="${id}" role="radio" aria-checked="${mode === id}"><span class="mode-icon">${icon(glyph)}</span><span class="mode-copy"><strong>${esc(title)}</strong><span>${esc(detail)}</span></span><span class="mi mode-check" aria-hidden="true">check</span></button>`).join('');
    const secret = mode === 'file'
      ? `<label>${esc(tr('restore.fileLabel'))}<input name="file" type="file" accept="application/json,.json" required></label>`
      : `<label>${esc(mode === 'wif' ? tr('restore.key') : tr('restore.wordsLabel'))}<textarea name="secret" autocomplete="off" autocapitalize="off" spellcheck="false" required></textarea></label>${mode === 'words' ? `<label>${esc(tr('restore.extra'))}<span class="hint">${esc(tr('restore.extraHint'))}</span><input name="passphrase" autocomplete="off"></label>` : ''}`;
    return shell(tr('restore.title'), `<div class="modes" role="radiogroup" aria-label="${esc(tr('aria.restore'))}">${choices}</div><form class="stack" data-action="finish-restore">${secret}<label>${esc(tr('restore.browserPassword'))}<input name="password" type="password" minlength="8" autocomplete="new-password" required></label><label>${esc(tr('common.passwordAgain'))}<input name="confirm" type="password" minlength="8" autocomplete="new-password" required></label><button class="primary" type="submit">${icon('key')}<span>${esc(tr('restore.button'))}</span></button>${button('ghost', 'back-welcome', 'arrow_back', tr('common.back'))}</form>`, 'key');
  }

  function languageScreen() {
    const current = window.DogeI18n ? window.DogeI18n.lang() : 'en';
    const choices = (window.DogeI18n ? window.DogeI18n.list() : []).map((item) => `<button type="button" class="mode${item.id === current ? ' active' : ''}" data-action="set-lang" data-lang="${esc(item.id)}" role="radio" aria-checked="${item.id === current}"><span class="mode-copy"><strong>${esc(item.label)}</strong></span><span class="mi mode-check" aria-hidden="true">check</span></button>`).join('');
    return shell(tr('lang.title'), `<p class="lead">${esc(tr('lang.lead'))}</p><div class="modes" role="radiogroup" aria-label="${esc(tr('lang.menu'))}">${choices}</div>${button('ghost', 'lang-back', 'arrow_back', tr('common.back'))}`, 'settings');
  }

  function chainButtons(selected, locked) {
    const ids = ['dogecoin', 'dogecoinvm'].filter(chainEnabled);
    if (ids.length < 2) return '';
    return `<div class="chains">${ids.map((id) => `<button type="button" class="chain ${selected === id ? 'active' : ''}" data-action="set-chain" data-chain="${id}" ${locked ? 'disabled' : ''}>${icon(id === 'dogecoinvm' ? 'bolt' : 'payments')}<span><strong>${chainName(id)}</strong><span class="num" data-chain-balance="${id}">${esc(balanceText(id))} DOGE</span></span></button>`).join('')}</div>`;
  }

  function notesHidden() {
    try {
      const saved = JSON.parse(localStorage.getItem(NOTE_KEY) || '{}');
      return saved && typeof saved === 'object' ? saved : {};
    } catch { return {}; }
  }

  function note(id, html) {
    if (id === 'vm') {
      try { if (localStorage.getItem(VM_HELP_KEY) === '1') return ''; } catch { /* Show the note when storage is blocked. */ }
    }
    if (notesHidden()[id]) return '';
    return `<div class="note"><p>${html}</p><button type="button" class="note-x" data-action="dismiss-note" data-note="${esc(id)}" aria-label="${esc(tr('aria.dismiss'))}">${icon('close')}</button></div>`;
  }

  function vmHelp() {
    return note('vm', `${esc(tr('note.vm'))} <a href="https://metaldoge.com/" target="_blank" rel="noopener">${esc(tr('note.vmLink'))}</a>`);
  }

  function badgeBits(dollars, chain, provider, stale) {
    return [
      dollars ? `<span class="badge">${esc(dollars)}</span>` : '',
      `<span class="badge">${esc(chainName(chain))}</span>`,
      `<span class="badge">${esc(provider)}</span>`,
      stale ? `<span class="badge">${esc(tr('common.savedCopy'))}</span>` : '',
    ].filter(Boolean).join('');
  }

  function balanceBadges(chain, dollars, provider, stale) {
    return `<div class="badges" data-live="badges">${badgeBits(dollars, chain, provider, stale)}</div>`;
  }

  function txRows(chain) {
    const quiet = chain === 'dogecoin' && (state.settings.preset === 'core' || state.settings.preset === 'dogego');
    const empty = quiet ? tr('empty.node') : tr('empty.none');
    const list = state.histories[chain] || [];
    if (!list.length) return state.chainError[chain] ? '' : `<p class="hint empty">${esc(empty)}</p>`;
    return list.map((tx) => `<a class="tx" href="${esc(txLink(chain, tx.txid))}" target="_blank" rel="noopener"><span>${tx.time ? esc(new Date(tx.time * 1000).toLocaleString()) : esc(tr('common.watched'))}</span><strong>${esc(tx.change || '')}</strong></a>`).join('');
  }

  function home() {
    const chain = state.chain === 'dogecoinvm' ? 'dogecoinvm' : 'dogecoin';
    const dollars = chain === 'dogecoin' ? money(state.balances.dogecoin) : '';
    const provider = chain === 'dogecoinvm'
      ? vmProvider().label
      : (state.busy ? tr('common.checking') : window.DogeNet.createProvider(state.settings).label);
    if (state.chainError[chain]) state.error = state.chainError[chain];
    const last = state.lastTx ? `<p class="foot">${icon('receipt_long')}<a href="${esc(txLink(state.lastChain, state.lastTx))}" target="_blank" rel="noopener"><span class="num">${esc(state.lastTx.slice(0, 10))}…</span></a></p>` : '';
    return shell('', `${chainButtons(chain, false)}${chain === 'dogecoinvm' ? vmHelp() : ''}<p class="balance" data-live="balance">${esc(balanceText(chain))} <span>DOGE</span></p>${balanceBadges(chain, dollars, provider, state.stale[chain])}<h2 class="activity-title">${icon('receipt_long')}<span>${esc(tr('common.activity', { chain: chainName(chain) }))}</span></h2><div class="card list" data-live="activity">${txRows(chain)}</div>${last}`);
  }

  function send() {
    const fees = [
      ['slow', tr('fee.slow'), 'schedule'],
      ['normal', tr('fee.normal'), 'payments'],
      ['fast', tr('fee.fast'), 'bolt'],
    ].map(([name, label, glyph]) => `<button type="button" class="choice ${state.draft.fee === name ? 'active' : ''}" data-action="fee" data-fee="${name}">${icon(glyph)}<span><strong>${esc(label)}</strong><span class="fee" data-fee-label="${name}">${esc(feeLabel(name))}</span></span></button>`).join('');
    const addressNote = bothChains()
      ? note('send-address', esc(tr('note.sendEither')))
      : note('send-one', esc(tr('note.sendOne', { chain: chainName(preferredChain('')) })));
    const locked = state.draft.locked
      ? `<p class="hint">${esc(tr('note.locked'))}</p>`
      : addressNote;
    return shell(tr('send.title', { chain: chainName(state.draft.chain) }), `<form class="stack" data-action="to-review">${chainButtons(state.draft.chain, state.draft.locked)}${state.draft.chain === 'dogecoinvm' ? vmHelp() : ''}${locked}<label>${esc(tr('common.to'))}<input id="send-to" value="${esc(state.draft.to)}" autocomplete="off" spellcheck="false" required></label><div class="field"><div class="field-head"><span>${esc(tr('common.amount'))}</span><button type="button" class="link" data-action="fill-max">${icon('account_balance_wallet')}<span>${esc(tr('common.sendAll'))}</span></button></div><input id="send-amount" class="num" data-amount="1" value="${esc(state.draft.amount)}" inputmode="decimal" autocomplete="off"></div><div class="row">${fees}</div>${feeSlider()}<button class="primary" type="submit">${icon('fact_check')}<span>${esc(tr('common.review'))}</span></button></form>`, 'send');
  }

  function review() {
    let plan;
    try { plan = paymentPlan(); } catch (error) {
      const choose = state.draft.chain
        ? `<div class="card"><p>${esc(tr('common.chain'))}<br><strong>${esc(chainName(state.draft.chain))}</strong></p><p>${esc(tr('common.to'))}<br><span class="num">${esc(payAddress())}</span></p><p>${esc(tr('common.amount'))}<br><strong class="num">${esc(state.draft.amount)} DOGE</strong></p></div>`
        : chainButtons('', false);
      const asker = state.request?.type === 'pay' ? siteAsk(state.request.origin) : '';
      return shell(tr('review.title'), `<div class="stack">${asker}${choose}<div class="banner bad"><span>${esc(error.message)}</span></div><div class="row">${button('ghost', state.request?.type === 'invoice' ? 'back-invoice' : (state.request ? 'cancel-request' : 'edit-send'), 'arrow_back', tr('common.back'))}</div></div>`, 'verified');
    }
    const change = plan.change > 0n
      ? `<p class="hint">${esc(tr('common.dogeStays', { amount: window.DogeChain.formatDoge(plan.change), chain: chainName(state.draft.chain) }))}</p>`
      : `<p class="hint">${esc(tr('common.leftover'))}</p>`;
    const password = state.secret ? '' : `<label>${esc(tr('review.walletPassword'))}<input name="password" type="password" autocomplete="current-password" required></label>`;
    const back = state.request?.type === 'invoice' ? 'back-invoice' : (state.request?.type === 'pay' ? 'cancel-request' : 'edit-send');
    const noteText = [state.draft.label, state.draft.message].filter(Boolean).map((item) => `<p class="hint">${esc(item)}</p>`).join('');
    const via = state.draft.chain === 'dogecoinvm' ? vmProvider().broadcastLabel : window.DogeNet.createProvider(state.settings).broadcastLabel;
    const site = state.request ? siteAsk(state.request.origin) : '';
    return shell(tr('review.title'), `<form class="stack" data-action="confirm-pay">${site}<div class="card pay-lines"><span>${esc(tr('common.chain'))}</span><strong>${esc(chainName(state.draft.chain))}</strong><span>${esc(tr('common.to'))}</span><strong class="num">${esc(payAddress())}</strong><span>${esc(tr('common.amount'))}</span><strong class="num">${esc(window.DogeChain.formatDoge(plan.amount || plan.outputs[0].value))} DOGE</strong><span>${esc(tr('common.fee'))}</span><strong class="num">${esc(window.DogeChain.formatDoge(plan.fee))} DOGE</strong></div>${noteText}${change}<p class="hint">${esc(tr('review.signed', { via }))}</p>${password}<div class="row">${button('ghost', back, 'arrow_back', tr('common.back'))}<button class="primary" type="submit" ${state.busy ? 'disabled' : ''}>${icon('verified')}<span>${esc(state.busy ? tr('common.sending') : tr('common.sendNow'))}</span></button></div></form>`, 'verified');
  }

  function payAddress() {
    try { return window.DogeChain.parsePayment(state.draft.to).address; } catch { return state.draft.to; }
  }

  function receive() {
    const chain = state.chain === 'dogecoinvm' ? 'dogecoinvm' : 'dogecoin';
    if (state.chainError[chain]) state.error = state.chainError[chain];
    const current = currentReceive(chain);
    const link = window.DogeChain.paymentUri(chain, current.address);
    const noteKey = state.settings.fixedReceive ? 'note.receiveFixed' : 'note.receive';
    const qrNote = note('receive', `${esc(tr(noteKey, { scheme: chain === 'dogecoinvm' ? 'dogecoinvm:' : 'dogecoin:', chain: chainName(chain), wait: chainWait(chain) }))}`);
    return shell(tr('receive.title'), `${chainButtons(chain, false)}${chain === 'dogecoinvm' ? vmHelp() : ''}${qrBlock(link)}${qrNote}${addressField(current.address)}`, 'qr_code_2');
  }

  function activity() {
    const chain = state.chain === 'dogecoinvm' ? 'dogecoinvm' : 'dogecoin';
    if (state.chainError[chain]) state.error = state.chainError[chain];
    return shell(tr('activity.title'), `${chainButtons(chain, false)}<h2 class="activity-title">${icon('receipt_long')}<span>${esc(tr('common.activity', { chain: chainName(chain) }))}</span></h2><div class="card list" data-live="activity">${txRows(chain)}</div>`, 'receipt_long');
  }

  function settingsTabs(selected) {
    const ids = ['dogecoin', 'dogecoinvm'].filter(chainEnabled);
    if (ids.length < 2) return '';
    return `<div class="chains" role="tablist" aria-label="${esc(tr('aria.chains'))}">${ids.map((id) => `<button type="button" class="chain ${selected === id ? 'active' : ''}" role="tab" aria-selected="${selected === id}" data-action="settings-tab" data-chain="${id}">${icon(id === 'dogecoinvm' ? 'bolt' : 'payments')}<span><strong>${chainName(id)}</strong></span></button>`).join('')}</div>`;
  }

  function networkChoices() {
    const host = hostChain();
    if (host) return `<p class="hint">${esc(tr('settings.hostLock', { chain: chainName(host) }))}</p>${fixedReceiveChoice()}`;
    const dogeOn = chainEnabled('dogecoin');
    const vmOn = chainEnabled('dogecoinvm');
    const card = (name, on, glyph, title) => `<label class="net"><input name="${name}" type="checkbox" role="switch" ${on ? 'checked' : ''}><span class="net-box">${icon(glyph)}<strong>${title}</strong><span class="track" aria-hidden="true"></span></span></label>`;
    return `<p class="lead">${esc(tr('settings.networks'))}</p><div class="nets">${card('enableDogecoin', dogeOn, 'payments', 'Dogecoin')}${card('enableDogecoinvm', vmOn, 'bolt', 'DogecoinVM')}</div>${fixedReceiveChoice()}`;
  }

  function fixedReceiveChoice() {
    if (state.pub && state.pub.type !== 'hd') return '';
    const on = state.settings.fixedReceive === true;
    return `<label class="net one-addr"><input name="fixedReceive" type="checkbox" role="switch" ${on ? 'checked' : ''}><span class="net-box"><strong>${esc(tr('settings.fixedReceive'))}</strong>${helpButton('fixedReceive')}<span class="track" aria-hidden="true"></span></span></label>`;
  }

  function dogeSettings(s) {
    const options = window.DogeNet.PRESETS.map((preset) => `<option value="${preset.id}" ${s.preset === preset.id ? 'selected' : ''}>${esc(tr('preset.' + preset.id + '.label'))}</option>`).join('');
    const broadcasts = [['same', tr('settings.same')], ['public', tr('settings.public')], ['blockcypher', 'BlockCypher'], ['core', tr('settings.core')], ['dogego', tr('settings.dogego')], ['memetracker', tr('settings.meme')]].map(([id, label]) => `<option value="${id}" ${s.broadcast === id ? 'selected' : ''}>${esc(label)}</option>`).join('');
    const detail = tr('preset.' + s.preset + '.detail');
    const core = s.preset === 'core' || s.broadcast === 'core';
    const dogego = s.preset === 'dogego' || s.broadcast === 'dogego';
    const meme = s.preset === 'memetracker' || s.broadcast === 'memetracker';
    return `<p class="lead">${esc(detail === 'preset.' + s.preset + '.detail' ? '' : detail)}</p><label>${esc(tr('settings.lookup'))}<select name="preset">${options}</select></label><label>${esc(tr('settings.broadcast'))}<select name="broadcast">${broadcasts}</select></label>${s.preset === 'blockcypher' || s.broadcast === 'blockcypher' ? field('blockcypherToken', tr('settings.token'), s.blockcypherToken) : ''}${s.preset === 'sochain' ? field('sochainKey', tr('settings.sochain'), s.sochainKey) : ''}${core ? `${field('coreUrl', tr('settings.coreUrl'), s.coreUrl, 'https://node.example.com:22555')}${field('coreUser', tr('settings.rpcUser'), s.coreUser)}${field('corePassword', tr('settings.rpcPassword'), s.corePassword, '', 'password')}` : ''}${dogego ? `${field('dogegoUrl', tr('settings.dogegoUrl'), s.dogegoUrl, 'https://node.example.com:22555')}${field('dogegoUser', tr('settings.rpcUser'), s.dogegoUser)}${field('dogegoPassword', tr('settings.rpcPassword'), s.dogegoPassword, '', 'password')}` : ''}${meme ? field('memetrackerUrl', tr('settings.memeUrl'), s.memetrackerUrl, 'https://tracker.example.com') : ''}`;
  }

  function vmSettings(s) {
    const preset = s.vmPreset === 'custom' ? 'custom' : 'metaldoge';
    const broadcast = s.vmBroadcast === 'custom' ? 'custom' : (s.vmBroadcast === 'metaldoge' ? 'metaldoge' : 'same');
    const lookup = `<label>${esc(tr('settings.lookup'))}<select name="vmPreset"><option value="metaldoge" ${preset === 'metaldoge' ? 'selected' : ''}>${esc(tr('settings.vmMetal'))}</option><option value="custom" ${preset === 'custom' ? 'selected' : ''}>${esc(tr('settings.custom'))}</option></select></label>`;
    const lookupUrl = preset === 'custom' ? field('vmUrl', tr('settings.explorer'), s.vmUrl, 'https://vm.dogedrop.org') : '';
    const send = `<label>${esc(tr('settings.broadcast'))}<select name="vmBroadcast"><option value="same" ${broadcast === 'same' ? 'selected' : ''}>${esc(tr('settings.sameExplorer'))}</option><option value="metaldoge" ${broadcast === 'metaldoge' ? 'selected' : ''}>${esc(tr('settings.vmMetal'))}</option><option value="custom" ${broadcast === 'custom' ? 'selected' : ''}>${esc(tr('settings.custom'))}</option></select></label>`;
    const sendUrl = broadcast === 'custom' ? field('vmBroadcastUrl', tr('settings.sendAddress'), s.vmBroadcastUrl, 'https://vm.dogedrop.org') : '';
    return `<p class="lead">${esc(tr('settings.vmLead'))}</p>${lookup}${lookupUrl}${send}${sendUrl}`;
  }

  function lockAfterField(s) {
    const seconds = Number(s.autolockSeconds) > 0 ? Number(s.autolockSeconds) : lockSeconds();
    const options = [[30, tr('time.seconds', { n: 30 })], [60, tr('time.seconds', { n: 60 })], [120, tr('time.minutes', { n: 2 })], [300, tr('time.minutes', { n: 5 })], [900, tr('time.minutes', { n: 15 })]];
    const known = options.some(([value]) => value === seconds);
    const extra = known ? '' : `<option value="${seconds}" selected>${esc(tr('time.seconds', { n: seconds }))}</option>`;
    const list = options.map(([value, label]) => `<option value="${value}" ${seconds === value ? 'selected' : ''}>${esc(label)}</option>`).join('');
    return `<label>${esc(tr('settings.lock'))}<span class="hint">${esc(tr('settings.lockHint'))}</span><select name="autolockSeconds">${extra}${list}</select></label>`;
  }

  function appearance() {
    const lang = window.DogeI18n ? window.DogeI18n.current() : { short: 'EN', label: 'English' };
    const mode = window.DogeTheme && window.DogeTheme.mode ? window.DogeTheme.mode() : 'auto';
    const choices = [['auto', tr('theme.system')], ['light', tr('theme.light')], ['dark', tr('theme.dark')]];
    const chips = choices.map(([id, label]) => `<button type="button" class="chip${mode === id ? ' on' : ''}" data-action="set-theme" data-theme="${id}" role="radio" aria-checked="${mode === id}">${esc(label)}</button>`).join('');
    return `<div class="pref"><button type="button" class="pref-row" data-action="language"><span class="pref-code">${esc(lang.short)}</span><span class="pref-copy"><strong>${esc(tr('settings.language'))}</strong><span>${esc(lang.label)}</span></span></button></div><div class="chips" role="radiogroup" aria-label="${esc(tr('theme.system'))}">${chips}</div>`;
  }

  function checkout() {
    return shell(tr('pay.onlyTitle'), `<p class="lead">${esc(tr('pay.onlyLead'))}</p>`, 'qr_code_2');
  }

  function settings() {
    const s = state.settings;
    const tab = preferredChain(state.settingsTab === 'dogecoinvm' ? 'dogecoinvm' : 'dogecoin');
    const chainFields = tab === 'dogecoinvm' ? vmSettings(s) : dogeSettings(s);
    return shell(tr('settings.title'), `<form id="settings-form" class="stack" data-action="save-settings">${appearance()}${networkChoices()}${settingsTabs(tab)}${chainFields}${lockAfterField(s)}<button class="primary" type="submit">${icon('save')}<span>${esc(tr('common.save'))}</span></button>${button('ghost', 'test-connection', 'wifi_tethering', tr('settings.test'))}${button('ghost', 'download-backup', 'download', tr('settings.download'))}${button('ghost', 'go-unlock', 'visibility', tr('settings.showPhrase'), 'data-next="backup"')}</form><div class="card"><p>${esc(tr('settings.removeLead'))}</p><input id="delete-address" class="num" autocomplete="off" spellcheck="false">${button('danger', 'delete-wallet', 'delete', tr('settings.remove'))}</div><p class="foot">${icon('shield')}<span>${esc(tr('settings.foot'))}</span></p><p class="version">${esc(tr('common.version', { version: WALLET_VERSION }))}</p>`, 'settings');
  }

  function backup() {
    if (!state.secret) return unlock();
    const words = state.secret.mnemonic ? state.secret.mnemonic.split(' ').map((word, index) => `<div class="word"><b>${index + 1}</b>${esc(word)}</div>`).join('') : addressField(state.secret.wif || '');
    return shell(state.secret.mnemonic ? tr('backup.phrase') : tr('backup.key'), `<div class="card">${words}${state.secret.passphrase ? `<p>${esc(tr('backup.extra'))} <strong>${esc(state.secret.passphrase)}</strong></p>` : ''}</div>${button('ghost', 'home', 'visibility', tr('common.hide'))}`, state.secret.mnemonic ? 'visibility' : 'key');
  }

  function unlock() {
    const back = state.request ? button('ghost', 'cancel-request', 'close', tr('common.cancel')) : '';
    return shell(tr('unlock.title'), `<p class="lead">${esc(tr('unlock.lead', { time: lockWaitLabel() }))}</p><form class="stack" data-action="do-unlock"><label>${esc(tr('common.password'))}<input name="password" type="password" autocomplete="current-password" required></label><button class="primary" type="submit">${icon('lock_open')}<span>${esc(tr('common.unlock'))}</span></button>${back}</form>`, 'lock_open');
  }

  function approve() {
    if (!state.request) return home();
    const actionsRow = (glyph, label) => `<div class="row">${button('ghost', 'cancel-request', 'close', tr('common.cancel'))}<button class="primary" type="submit">${icon(glyph)}<span>${esc(label)}</span></button></div>`;
    if (state.request.type === 'sign') {
      const password = state.secret ? '' : `<label>${esc(tr('review.walletPassword'))}<input name="password" type="password" autocomplete="current-password" required></label>`;
      return shell(tr('approve.signTitle'), `<form class="stack" data-action="approve-sign">${siteAsk(state.request.origin)}<p class="hint">${esc(tr('approve.signHint'))}</p><div class="card message">${esc(state.request.message)}</div>${password}${actionsRow('draw', tr('approve.sign'))}</form>`, 'draw');
    }
    const current = currentReceive();
    const password = state.secret ? '' : `<label>${esc(tr('review.walletPassword'))}<input name="password" type="password" autocomplete="current-password" required></label>`;
    return shell(tr('approve.connectTitle'), `<form class="stack" data-action="approve-connect">${siteAsk(state.request.origin)}<p class="hint">${esc(tr('approve.connectHint'))}</p>${addressField(current.address)}${password}${actionsRow('lock_open', tr('common.connect'))}</form>`, 'lock');
  }

  function closeRequest() {
    const done = state.approval;
    if (!done) return;
    if (state.request?.type === 'invoice') done.resolve(invoicePayload());
    else done.reject(new Error('Cancelled'));
  }

  function invoicePayload() {
    const chain = state.draft.chain === 'dogecoinvm' ? 'dogecoinvm' : (state.draft.chain === 'dogecoin' ? 'dogecoin' : '');
    const address = payAddress();
    let uri = '';
    try {
      if (chain && address) uri = window.DogeChain.paymentUri(chain, address, state.draft.amount, { label: state.draft.label, message: state.draft.message });
    } catch { uri = ''; }
    return { displayed: true, address, amount: state.draft.amount || '', chain, uri, label: state.draft.label || '' };
  }

  function payChoice() {
    const chain = state.draft.chain === 'dogecoinvm' ? 'dogecoinvm' : (state.draft.chain === 'dogecoin' ? 'dogecoin' : '');
    const address = payAddress();
    const uri = chain && address ? externalPayLink() : '';
    const product = state.draft.label ? `<p class="pay-product">${esc(state.draft.label)}</p>` : '';
    const detail = state.draft.message ? `<p class="hint">${esc(state.draft.message)}</p>` : '';
    const picker = state.draft.locked ? '' : chainButtons(chain, false);
    const qr = uri
      ? `<div class="qr-frame">${window.DogeChain.qrSvg(uri)}</div>`
      : `<p class="hint">${esc(tr('pay.pickChain'))}</p>`;
    const hint = uri ? `<p class="hint">${esc(tr('pay.qrHint'))}</p>` : '';
    const open = uri
      ? `<a class="primary" href="${esc(uri)}" target="_blank" rel="noopener">${icon('payments')}<span>${esc(tr('pay.openWallet'))}</span></a>`
      : '';
    const local = state.draft.externalOnly ? '' : state.pub && state.secret
      ? button('ghost', 'pay-here', 'account_balance_wallet', tr('pay.here'))
      : state.pub
        ? `<form class="stack" data-action="unlock-and-pay"><label>${esc(tr('review.walletPassword'))}<input name="password" type="password" autocomplete="current-password" required></label><button class="ghost" type="submit">${icon('lock_open')}<span>${esc(tr('pay.unlock'))}</span></button></form>`
        : `<details class="pay-more"><summary>${esc(tr('pay.makeHere'))}</summary><div class="row">${button('ghost', 'start-create', 'add_card', tr('common.create'))}${button('ghost', 'start-restore', 'key', tr('common.import'))}</div></details>`;
    return shell(tr('pay.title'), `<div class="stack">${siteAsk(state.request?.origin)}${product}${detail}${picker}<div class="card pay-lines"><span>${esc(tr('common.amount'))}</span><strong class="num">${esc(state.draft.amount || '0')} DOGE</strong><span>${esc(tr('common.chain'))}</span><strong>${esc(chain ? chainName(chain) : tr('pay.unnamed'))}</strong></div>${qr}${address ? addressField(address) : ''}${open}${hint}${local}${button('ghost', 'cancel-request', 'close', tr('aria.close'))}</div>`, 'qr_code_2');
  }

  function externalPayLink() {
    const chain = state.draft.chain === 'dogecoinvm' ? 'dogecoinvm' : (state.draft.chain === 'dogecoin' ? 'dogecoin' : '');
    if (!chain) return '';
    return window.DogeChain.paymentUri(chain, payAddress(), state.draft.amount, { label: state.draft.label, message: state.draft.message });
  }

  function field(name, label, value, placeholder = '', type = 'text') {
    return `<label>${esc(label)}<input name="${name}" type="${type}" value="${esc(value || '')}" placeholder="${esc(placeholder)}" autocomplete="off"></label>`;
  }

  function feeLabel(name) {
    try {
      const vm = { slow: 100, normal: 200, fast: 500 };
      const rate = state.draft.chain === 'dogecoinvm' ? vm[name] : (state.fees[name] || 1000);
      const fee = window.DogeChain.feeFor(1, 2, rate);
      return `${window.DogeChain.formatDoge(fee)} DOGE`;
    } catch {
      return '';
    }
  }

  function money(koinu) {
    if (koinu == null || !state.fees.priceUsd) return '';
    const value = Number(koinu) / 1e8 * state.fees.priceUsd;
    if (!Number.isFinite(value)) return '';
    return value.toLocaleString(undefined, { style: 'currency', currency: 'USD' });
  }

  function walletCacheId() {
    if (!state.pub) return '';
    return state.pub.type === 'single' ? `single:${state.pub.address}` : `hd:${state.pub.xpub}`;
  }

  function readChainStore() {
    const saved = readJson(CHAIN_CACHE_KEY);
    if (!saved || saved.wallet !== walletCacheId()) return null;
    return saved;
  }

  function saveChainCache(chain) {
    const id = walletCacheId();
    if (!id) return;
    const store = readChainStore() || { v: 1, wallet: id, chains: {} };
    store.chains[chain] = {
      savedAt: Date.now(),
      balance: state.balances[chain] == null ? null : state.balances[chain].toString(),
      coins: (state.coins[chain] || []).map((coin) => ({
        txid: coin.txid,
        vout: coin.vout,
        value: coin.value.toString(),
        confirmations: coin.confirmations || 0,
        address: coin.address,
        chain: coin.chain,
        index: coin.index,
        script: coin.script || '',
      })),
      history: (state.histories[chain] || []).map((tx) => ({
        txid: tx.txid,
        time: tx.time || 0,
        change: tx.change || '',
        address: tx.address || '',
      })),
    };
    writeJson(CHAIN_CACHE_KEY, store);
  }

  function applyChainCache(chain) {
    const row = readChainStore()?.chains?.[chain];
    if (!row) return false;
    state.coins[chain] = (row.coins || []).map((coin) => ({ ...coin, value: coinKoinu(coin.value) }));
    state.balances[chain] = row.balance == null
      ? state.coins[chain].reduce((sum, coin) => sum + coin.value, 0n)
      : coinKoinu(row.balance);
    state.histories[chain] = row.history || [];
    state.stale[chain] = true;
    return true;
  }

  function coinKoinu(value) {
    try { return BigInt(value || '0'); } catch { return 0n; }
  }

  function helpMark() {
    return '<span class="help-mark" aria-hidden="true">?</span>';
  }

  function helpButton(id) {
    const text = tr('help.' + id);
    if (!text || text === 'help.' + id) return '';
    const open = state.tip === id;
    return `<span class="helptip"><button type="button" class="help" data-action="toggle-tip" data-tip="${esc(id)}" aria-expanded="${open ? 'true' : 'false'}" aria-label="${esc(tr('aria.help'))}"><span aria-hidden="true">?</span></button>${open ? `<span class="helptip-pop" role="tooltip">${esc(text)}</span>` : ''}</span>`;
  }

  function docArticles() {
    const article = (id, extra = {}) => ({
      id,
      title: tr('docs.' + id + '.title'),
      paragraphs: trLines('docs.' + id + '.paragraphs'),
      more: trLines('docs.' + id + '.more'),
      after: trLines('docs.' + id + '.after'),
      ...extra,
    });
    return [
      article('works'),
      article('keys'),
      article('storage'),
      article('care'),
      article('website', {
        tags: ['integrate'],
        code: ['<script src="https://dogedrop.org/wallet/connect.js" data-label="DogeWallet"></script>'],
        code2: [
          '<script src="https://dogedrop.org/wallet/connect.js" data-label="DogeWallet" data-chains="dogecoin"></script>',
          "const linked = await doge.connect();\nconst sent = await doge.requestTransaction({\n  recipientAddress: 'dogecoin:D...?amount=1.5'\n});",
        ],
        shop: [
          "await doge.showPayment({\n  recipientAddress: 'dogecoin:DMerchant...?amount=5',\n  label: 'Sticker'\n});",
        ],
      }),
      article('host', {
        tags: ['integrate'],
        code: ['<script src="https://example.com/wallet/connect.js" data-label="DogeWallet" data-wallet="https://example.com/wallet/"></script>'],
      }),
      article('bridge', { link: { href: 'https://metaldoge.com/', label: tr('docs.bridge.link') } }),
    ];
  }
  function docsListHtml() {
    const articles = docArticles();
    const filters = [
      ['', tr('docs.filter.all')],
      ['works', tr('docs.filter.works')],
      ['keys', tr('docs.filter.keys')],
      ['storage', tr('docs.filter.storage')],
      ['care', tr('docs.filter.care')],
      ['integrate', tr('docs.filter.integrate')],
      ['bridge', tr('docs.filter.bridge')],
    ];
    const query = state.docsQuery.trim().toLowerCase();
    const topic = state.docsTopic;
    const shown = articles.filter((doc) => {
      if (topic && doc.id !== topic && !(doc.tags || []).includes(topic)) return false;
      if (!query) return true;
      const blob = [doc.title, ...(doc.paragraphs || []), ...(doc.more || []), ...(doc.after || []), ...(doc.code || []), ...(doc.code2 || []), doc.link?.label || ''].join(' ').toLowerCase();
      return blob.includes(query);
    });
    const chips = filters.map(([id, label]) => `<button type="button" class="chip${topic === id ? ' on' : ''}" data-action="docs-filter" data-filter="${esc(id)}">${esc(label)}</button>`).join('');
    const list = shown.length
      ? shown.map((doc) => {
        const body = (doc.paragraphs || []).map((part) => `<p>${esc(part)}</p>`).join('');
        const sample = (doc.code || []).map((part) => `<pre>${esc(part)}</pre>`).join('');
        const more = (doc.more || []).map((part) => `<p>${esc(part)}</p>`).join('');
        const sample2 = (doc.code2 || []).map((part) => `<pre>${esc(part)}</pre>`).join('');
        const after = (doc.after || []).map((part) => `<p>${esc(part)}</p>`).join('');
        const shop = (doc.shop || []).map((part) => `<pre>${esc(part)}</pre>`).join('');
        const link = doc.link ? `<p><a href="${esc(doc.link.href)}" target="_blank" rel="noopener">${esc(doc.link.label)}</a></p>` : '';
        return `<article class="doc"><h2>${esc(doc.title)}</h2>${body}${sample}${more}${sample2}${after}${shop}${link}</article>`;
      }).join('')
      : `<p class="hint empty">${esc(tr('docs.empty'))}</p>`;
    return { chips, list };
  }

  function docs() {
    const view = docsListHtml();
    return shell(tr('docs.title'), `<label class="docs-find">${esc(tr('docs.search'))}<input id="docs-search" type="search" value="${esc(state.docsQuery)}" placeholder="${esc(tr('docs.placeholder'))}" autocomplete="off" spellcheck="false"></label><div class="chips" role="toolbar" aria-label="${esc(tr('aria.filter'))}">${view.chips}</div><div class="docs-list">${view.list}</div>`);
  }

  function readJson(key) {
    try { return JSON.parse(localStorage.getItem(key) || 'null'); } catch { return null; }
  }
  function writeJson(key, value) { localStorage.setItem(key, JSON.stringify(value)); }
  function esc(value) { return String(value ?? '').replace(/[&<>"']/g, (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[char])); }
  function download(name, text, type) {
    const link = document.createElement('a');
    link.href = URL.createObjectURL(new Blob([text], { type }));
    link.download = name;
    link.click();
    URL.revokeObjectURL(link.href);
  }
})();
