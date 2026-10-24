(function () {
  const VAULT_KEY = 'doge-pocket.vault.v1';
  const PUBLIC_KEY = 'doge-pocket.public.v1';
  const SETTINGS_KEY = 'doge-pocket.settings.v1';
  const CAUTION_KEY = 'dogedrop.caution.wallet.v1';
  const SITES_KEY = 'doge-pocket.sites.v1';
  const embed = new URLSearchParams(location.search).get('embed') === '1' && window.parent !== window;
  if (embed) document.documentElement.classList.add('is-embed');

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
    lastChain: 'dogecoin',
    fees: { slow: 1000, normal: 10000, fast: 50000, priceUsd: 0 },
    syncedAt: 0,
    error: '',
    notice: '',
    busy: false,
    draft: { to: '', amount: '', fee: 'normal', chain: 'dogecoin', locked: false, label: '', message: '' },
    request: null,
    approval: null,
    parentOrigin: '',
    lockTimer: 0,
  };

  const app = document.getElementById('app');
  app.addEventListener('click', onClick);
  app.addEventListener('submit', onSubmit);
  app.addEventListener('change', onChange);
  app.addEventListener('input', onAmount);
  window.addEventListener('beforeunload', (event) => {
    if (!state.pending) return;
    event.preventDefault();
    event.returnValue = '';
  });
  if (embed) window.addEventListener('message', onParentMessage);

  boot();

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
    state.settings = { ...window.DogeNet.defaultSettings(), ...readJson(SETTINGS_KEY) };
    if (state.settings.preset === 'blockbook') state.settings.preset = 'memetracker';
    if (state.settings.broadcast === 'blockbook') state.settings.broadcast = 'memetracker';
    const savedVm = String(state.settings.vmUrl || '').trim().replace(/\/$/, '');
    if (!state.settings.vmPreset) state.settings.vmPreset = savedVm && savedVm !== 'https://metaldoge.com' && savedVm !== 'https://metaldoge.dogedrop.org' && savedVm !== 'https://vm.dogedrop.org' ? 'custom' : 'metaldoge';
    if (!state.settings.vmBroadcast) state.settings.vmBroadcast = 'same';
    if (!state.settings.vmUrl || state.settings.vmUrl === 'https://metaldoge.com' || state.settings.vmUrl === 'https://metaldoge.dogedrop.org') state.settings.vmUrl = 'https://vm.dogedrop.org';
    if (!state.settings.vmBroadcastUrl || state.settings.vmBroadcastUrl === 'https://metaldoge.com' || state.settings.vmBroadcastUrl === 'https://metaldoge.dogedrop.org') state.settings.vmBroadcastUrl = 'https://vm.dogedrop.org';
    state.sites = readJson(SITES_KEY) || {};
    state.draft.fee = state.settings.fee || 'normal';
    let next = state.pub ? 'home' : 'welcome';
    if (state.request?.type === 'pay' && state.pub) next = 'review';
    else if (state.request && state.pub) next = 'approve';
    state.screen = holdForCaution(next);
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
    if (!origin || origin === 'null' || origin === 'file://') return 'This computer';
    try { return new URL(origin).host || 'This computer'; } catch { return 'This computer'; }
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
    try {
      const result = await handleParent(method, params || {}, origin);
      parent.postMessage({ channel: 'doge-pocket', id, result }, replyOrigin());
    } catch (error) {
      parent.postMessage({ channel: 'doge-pocket', id, error: error.message || 'Request failed' }, replyOrigin());
    }
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
      if (state.request?.origin === origin && state.request.type === 'pay') state.screen = holdForCaution('pay-choice');
      else if (!state.request && state.pub) state.screen = 'home';
      render();
      return { disconnected: true };
    }
    if (method === 'open') {
      showPanel();
      if (!state.pub) state.screen = 'welcome';
      render();
      return { open: true };
    }
    if (method === 'connect') return ask(origin, { type: 'connect' });
    if (method === 'requestTransaction') return ask(origin, { type: 'pay', ...params });
    if (method === 'requestSignedMessage') return ask(origin, { type: 'sign', message: String(params.message || '') });
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
      else if (request.type === 'pay') {
        applyPayRequest(request);
        next = state.pub && state.sites[origin]?.connected ? 'review' : 'pay-choice';
      } else if (!state.pub) next = 'welcome';
      else next = 'approve';
      state.screen = holdForCaution(next);
      render();
    });
  }

  function showPanel() { if (embed) parent.postMessage({ channel: 'doge-pocket', event: 'ui', open: true }, replyOrigin()); }
  function hidePanel(force) { if (embed) parent.postMessage({ channel: 'doge-pocket', event: 'ui', open: false, force: !!force }, replyOrigin()); }

  function onClick(event) {
    const button = event.target.closest('[data-action]');
    if (!button || button.disabled || button.tagName === 'FORM') return;
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
    const field = event.target;
    if (field.id === 'send-to') {
      const raw = field.value.trim();
      try {
        const parsed = window.DogeChain.parsePayment(raw);
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
    'allow-storage': async () => {
      try {
        if (document.requestStorageAccess) await document.requestStorageAccess();
      } catch {
        return fail('The browser did not share the wallet. Open it in its own tab once, then come back and try again.');
      }
      loadFromDisk();
    },
    'start-create': () => { state.pending = { mode: 'create' }; go('password'); },
    'start-restore': () => { state.pending = { mode: 'restore', restore: 'words' }; go('restore'); },
    'back-welcome': () => {
      state.pending = null;
      if (state.request?.type === 'pay' && !state.sites[state.request.origin]?.connected) return go('pay-choice');
      go('welcome');
    },
    'cancel-request': () => { state.approval?.reject(new Error('Cancelled')); go(state.pub ? 'home' : 'welcome'); },
    'to-reveal': (form) => {
      const password = form.password.value;
      if (password.length < 8) return fail('Use a password of at least 8 characters.');
      if (password !== form.confirm.value) return fail('Those passwords do not match.');
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
      if (!form.saved.checked || !ok) return fail('The words do not match your written copy yet.');
      await persistHd(state.pending.mnemonic, state.pending.passphrase, state.pending.password);
      state.pending.password = '';
      state.pending = null;
      if (state.request) grantSite(state.request.origin);
      if (state.request?.type === 'pay') go('review', 'This browser now has your wallet.');
      else if (state.request) go('approve', 'This browser now has your wallet.');
      else go('home', 'This browser now has your wallet. Keep the 12 words somewhere safe.');
      refresh().catch(() => {});
    },
    'set-restore': (button) => { state.pending.restore = button.dataset.mode; render(); },
    'finish-restore': async (form) => {
      const password = form.password.value;
      if (password.length < 8) return fail('Use a password of at least 8 characters.');
      if (password !== form.confirm.value) return fail('Those passwords do not match.');
      const passphrase = form.passphrase?.value || '';
      if (state.pending.restore === 'file') {
        const file = form.file.files[0];
        if (!file) return fail('Choose the backup file.');
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
        if (!window.DogeChain.isMnemonic(phrase)) return fail('Those words are not a valid recovery phrase.');
        const account = window.DogeChain.accountFromMnemonic(phrase, passphrase);
        await storeSecret({ type: 'hd', mnemonic: phrase, passphrase, xpub: account.xpub }, password);
        form.secret.value = '';
      }
      state.pending = null;
      if (state.request) grantSite(state.request.origin);
      state.pub.deepScan = state.pub.type === 'hd';
      state.pub.vmDeepScan = state.pub.type === 'hd';
      writeJson(PUBLIC_KEY, state.pub);
      if (state.request?.type === 'pay') go('review', 'Wallet restored on this browser.');
      else if (state.request) go('approve', 'Wallet restored on this browser.');
      else go('home', 'Wallet restored on this browser.');
      refresh().catch(() => {});
    },
    home: () => go('home'),
    send: () => { state.draft = { to: '', amount: '', fee: state.settings.fee || 'normal', chain: state.chain || 'dogecoin', locked: false, label: '', message: '' }; go('send'); },
    'set-chain': (button) => {
      const chain = button.dataset.chain === 'dogecoinvm' ? 'dogecoinvm' : 'dogecoin';
      const to = document.getElementById('send-to');
      const amount = document.getElementById('send-amount');
      if (to) state.draft.to = to.value.trim();
      if (amount) state.draft.amount = amount.value.trim();
      if (state.screen === 'send' || state.screen === 'review') {
        if (state.draft.locked) return;
        state.draft.chain = chain;
      } else {
        state.chain = chain;
        state.error = state.chainError[chain] || '';
      }
      render();
    },
    'edit-send': () => go('send'),
    receive: () => go('receive'),
    activity: () => go('activity'),
    settings: () => {
      state.settingsTab = state.chain === 'dogecoinvm' ? 'dogecoinvm' : 'dogecoin';
      go('settings');
    },
    'settings-tab': (button) => {
      readSettings();
      state.settingsTab = button.dataset.chain === 'dogecoinvm' ? 'dogecoinvm' : 'dogecoin';
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
      readDestination();
      if (!state.draft.chain) return fail('Choose Dogecoin or DogecoinVM. The same address is not the same coins.');
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
        if (plan.change > 0n && state.pub.type === 'hd') {
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
      const password = form?.password?.value || '';
      if (!password) return fail('Enter the wallet password.');
      await openVault(password);
      form.password.value = '';
      grantSite(state.request.origin);
      const current = currentReceive();
      const payload = { approved: true, address: current.address, publicKey: current.publicKey, balance: balancePayload().balance };
      const done = state.approval;
      go('home');
      done.resolve(payload);
    },
    'unlock-and-pay': async (form) => {
      const password = form?.password?.value || '';
      if (!password) return fail('Enter the wallet password.');
      await openVault(password);
      form.password.value = '';
      grantSite(state.request.origin);
      go('review');
    },
    'pay-external': () => {
      const done = state.approval;
      setTimeout(() => {
        if (!done || state.approval !== done) return;
        go(state.pub ? 'home' : 'welcome');
        done.reject(new Error('Continue in your other wallet. DogeDrop did not send this payment.'));
      }, 50);
    },
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
      await navigator.clipboard.writeText(button.dataset.copy);
      button.textContent = 'Copied';
    },
    'download-words': () => download('dogecoin-recovery-phrase.txt', `Dogecoin recovery phrase\n\n${state.pending.mnemonic}\n\nAnyone with these words can spend the coins. Keep them offline.\n`, 'text/plain'),
    'download-backup': () => download('dogecoin-wallet-backup.json', JSON.stringify({ app: 'doge-pocket', version: 1, vault: state.vault }, null, 2), 'application/json'),
    'save-settings': async () => {
      readSettings();
      writeJson(SETTINGS_KEY, state.settings);
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
        try { notes.push(await window.DogeNet.createProvider(state.settings).test()); } catch (error) { problems.push(error.message); }
        try { notes.push(await window.DogeNet.createVmProvider(state.settings).test()); } catch (error) { problems.push(error.message); }
        state.notice = notes.join(' ');
        state.error = problems.join(' ');
      } catch (error) {
        state.error = error.message;
      }
      render();
    },
    'refresh': () => refresh(),
    'lock': () => { state.secret = null; clearTimeout(state.lockTimer); go('home'); },
    'go-unlock': (button) => { state.unlockNext = button.dataset.next || 'home'; go('unlock'); },
    'do-unlock': async (form) => {
      const password = form.password.value;
      await openVault(password);
      form.password.value = '';
      go(state.unlockNext || 'home');
    },
    'delete-wallet': () => {
      const typed = document.getElementById('delete-address')?.value.trim();
      if (typed !== currentReceive().address) return fail('Type the current receive address to remove the wallet from this browser.');
      localStorage.removeItem(VAULT_KEY);
      localStorage.removeItem(PUBLIC_KEY);
      localStorage.removeItem(SITES_KEY);
      state.vault = null;
      state.pub = null;
      state.secret = null;
      state.sites = {};
      state.balances = { dogecoin: null, dogecoinvm: null };
      state.coins = { dogecoin: [], dogecoinvm: [] };
      state.histories = { dogecoin: [], dogecoinvm: [] };
      go('welcome', 'The wallet was removed from this browser. The coins are still safe if you kept the 12 words.');
    },
    'close-panel': () => {
      state.pinned = false;
      if (state.approval) state.approval.reject(new Error('Cancelled'));
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

  function markUnlocked(secret) {
    state.secret = secret;
    clearTimeout(state.lockTimer);
    const minutes = Number(state.settings.autolockMinutes) || 0;
    if (minutes > 0) state.lockTimer = setTimeout(() => { state.secret = null; render(); }, minutes * 60000);
  }

  async function ensureFresh() {
    if (state.balances.dogecoin != null && Date.now() - state.syncedAt < 15000) return;
    await refresh();
  }

  async function refresh() {
    if (!state.pub) return;
    state.busy = true;
    if (state.screen === 'home') render();
    const dogeWatch = watchList('dogecoin');
    const vmWatch = watchList('dogecoinvm');
    const [dogeScan, vmScan, dogeFees] = await Promise.all([
      scanChain('dogecoin', dogeWatch),
      scanChain('dogecoinvm', vmWatch),
      window.DogeNet.createProvider(state.settings).fees().then((fees) => ({ ok: true, fees })).catch(() => ({ ok: false })),
    ]);
    if (dogeFees.ok) state.fees = dogeFees.fees;
    state.syncedAt = Date.now();
    state.busy = false;
    state.error = state.chainError[state.chain] || '';
    if (['home', 'activity', 'receive', 'send', 'review'].includes(state.screen)) render();
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
      state.histories[chain] = used.length ? await provider.history(used) : [];
      state.chainError[chain] = '';
    } catch (error) {
      state.chainError[chain] = error.message;
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
    if (state.draft.chain !== 'dogecoin' && state.draft.chain !== 'dogecoinvm') throw new Error('Choose Dogecoin or DogecoinVM. The same address is not the same coins.');
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

  function feeRate() {
    const chain = state.draft.chain || state.chain;
    if (chain === 'dogecoinvm') {
      const table = { slow: 100, normal: 200, fast: 500 };
      return BigInt(table[state.draft.fee || 'normal'] || 200);
    }
    return BigInt(state.fees[state.draft.fee || state.settings.fee] || state.fees.normal || 10000);
  }

  function currentReceive(chain) {
    if (!state.pub) return { address: '', publicKey: '' };
    if (state.pub.type === 'single') return { chain: 0, index: 0, address: state.pub.address, publicKey: state.pub.publicKey };
    const index = chain === 'dogecoinvm' ? (state.pub.vmReceiveIndex || 0) : (state.pub.receiveIndex || 0);
    return window.DogeChain.deriveAddress(state.pub.xpub, 0, index);
  }

  function changeReceive(chain) {
    if (state.pub.type === 'single') return currentReceive(chain);
    const index = chain === 'dogecoinvm' ? (state.pub.vmChangeIndex || 0) : (state.pub.changeIndex || 0);
    return window.DogeChain.deriveAddress(state.pub.xpub, 1, index);
  }

  function coinsFor(chain) {
    return state.coins[chain] || [];
  }

  function balanceText(chain) {
    const value = state.balances[chain];
    return value == null ? '...' : window.DogeChain.formatDoge(value);
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
    return chain === 'dogecoinvm'
      ? 'A DogecoinVM payment is final in about a fifth of a second.'
      : 'A Dogecoin confirmation usually takes 1 to 10 minutes.';
  }

  function balancePayload() {
    const koinu = state.balances.dogecoin || 0n;
    const vmKnown = state.balances.dogecoinvm != null;
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
    try {
      const parsed = window.DogeChain.parsePayment(raw);
      state.draft.to = raw;
      state.draft.chain = parsed.chain || '';
      state.draft.locked = Boolean(parsed.chain);
      state.draft.amount = explicit != null && explicit !== '' ? String(explicit) : (parsed.amount || '');
      state.draft.label = parsed.label || '';
      state.draft.message = parsed.message || '';
      state.draft.fee = state.settings.fee || 'normal';
      state.error = state.draft.chain ? '' : 'Choose Dogecoin or DogecoinVM. The same address is not the same coins.';
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
    state.draft.to = raw;
    if (parsed.chain) {
      state.draft.chain = parsed.chain;
      state.draft.locked = true;
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
    state.settings.autolockMinutes = Number(state.settings.autolockMinutes) || 0;
  }

  function quizIndexes(mnemonic) {
    const count = mnemonic.split(' ').length;
    const picks = new Set();
    while (picks.size < 3) picks.add(crypto.getRandomValues(new Uint8Array(1))[0] % count);
    return [...picks];
  }

  function go(screen, notice = '') {
    state.screen = screen;
    state.notice = notice;
    if (screen !== 'home') state.error = '';
    render();
  }

  function fail(message) {
    state.error = message;
    state.busy = false;
    render();
  }

  function render() {
    const previous = state.painted;
    const screen = {
      caution, welcome, access, password, reveal, confirm, restore, home, send, review, receive, activity, settings, backup, unlock, approve, 'pay-choice': payChoice,
    }[state.screen] || welcome;
    app.innerHTML = screen();
    const view = app.querySelector('.screen');
    const tab = state.settingsTab === 'dogecoinvm' ? 'dogecoinvm' : 'dogecoin';
    const opened = previous !== state.screen || (state.screen === 'settings' && state.paintedTab !== tab);
    state.painted = state.screen;
    state.paintedTab = tab;
    if (opened && view) view.scrollTop = 0;
    const field = app.querySelector('.screen input:not([readonly]):not(#delete-address), .screen textarea');
    const keepTop = state.screen === 'home' || state.screen === 'receive' || state.screen === 'activity' || state.screen === 'settings';
    if (field && !keepTop) field.focus({ preventScroll: true });
    if (opened && view) view.scrollTop = 0;
  }

  function icon(name) {
    return `<span class="mi" aria-hidden="true">${name}</span>`;
  }

  function button(kind, action, glyph, label, extra = '') {
    return `<button class="${kind}" type="button" data-action="${action}" ${extra}>${icon(glyph)}<span>${label}</span></button>`;
  }

  function addressField(address) {
    return `<div class="copybox"><input class="num" readonly value="${esc(address)}" aria-label="Dogecoin address" spellcheck="false"><button type="button" class="copy" data-action="copy" data-copy="${esc(address)}" aria-label="Copy address">${icon('content_copy')}</button></div>`;
  }

  function qrBlock(address) {
    return `<div class="qr-frame">${window.DogeChain.qrSvg(address)}</div>`;
  }

  function shell(title, body, glyph) {
    let host = '';
    if (state.parentOrigin === 'null') host = 'this computer';
    else if (state.parentOrigin) {
      try { host = new URL(state.parentOrigin).host; } catch { host = ''; }
    }
    const sameOrigin = embed && location.protocol !== 'file:' && state.parentOrigin && state.parentOrigin === location.origin
      ? `<div class="banner">${icon('shield')}<span>This site is hosting the wallet itself, so its scripts can reach the wallet. For a real integration, load the wallet from its own address.</span></div>`
      : '';
    const heading = title ? `<h1>${glyph ? icon(glyph) : ''}<span>${esc(title)}</span></h1>` : '';
    const status = walletStatus();
    const tools = state.pub && state.screen !== 'caution';
    const here = ['home', 'send', 'receive', 'activity', 'settings'].includes(state.screen) ? state.screen : 'home';
    const refresh = tools ? `<button class="icon-btn" type="button" data-action="refresh" aria-label="Refresh">${icon('refresh')}</button>` : '';
    const lock = !tools ? '' : state.secret
      ? `<button class="icon-btn" type="button" data-action="lock" aria-label="Lock">${icon('lock')}</button>`
      : `<button class="icon-btn" type="button" data-action="go-unlock" data-next="${here}" aria-label="Unlock">${icon('lock_open')}</button>`;
    const close = embed ? `<button class="icon-btn" type="button" data-action="close-panel" aria-label="Close">${icon('close')}</button>` : '';
    const brand = embed ? 'DogeWallet' : 'DogeDrop';
    const hostBit = host ? `<span class="host">${esc(host)}</span>` : '';
    return `<header class="top"><div class="brand"><img class="logo" src="img/logo.png" alt=""><div class="brand-text"><strong>${brand}</strong><span class="brand-meta"><span class="pill ${status.cls}">${esc(status.text)}</span>${hostBit}</span></div></div><div class="top-actions">${refresh}${lock}${close}</div></header><div class="screen">${sameOrigin}${heading}${banners()}${body}</div>${tabBar()}`;
  }

  function walletStatus() {
    if (!state.pub) return { cls: '', text: 'New' };
    const linked = !!(embed && state.parentOrigin && state.sites[state.parentOrigin]?.connected);
    if (!state.secret) return { cls: 'wait', text: 'Locked' };
    if (linked) return { cls: 'on', text: 'Connected' };
    return { cls: 'on', text: 'Unlocked' };
  }

  function tabBar() {
    if (!state.pub) return '';
    const hidden = ['caution', 'welcome', 'access', 'password', 'reveal', 'confirm', 'restore', 'unlock', 'approve', 'review', 'pay-choice', 'backup'];
    if (hidden.includes(state.screen)) return '';
    const tabs = [
      ['home', 'account_balance_wallet', 'Home'],
      ['send', 'send', 'Send'],
      ['receive', 'qr_code_2', 'Receive'],
      ['activity', 'receipt_long', 'Activity'],
      ['settings', 'settings', 'Settings'],
    ];
    return `<nav class="tabbar" aria-label="Wallet">${tabs.map(([action, glyph, label]) => `<button type="button" class="tab${state.screen === action ? ' active' : ''}" data-action="${action}"${state.screen === action ? ' aria-current="page"' : ''}>${icon(glyph)}<span>${label}</span></button>`).join('')}</nav>`;
  }

  function banners() {
    return `${state.error ? `<div class="banner bad">${esc(state.error)}</div>` : ''}${state.notice ? `<div class="banner good">${esc(state.notice)}</div>` : ''}`;
  }

  function caution() {
    return shell('Read this first', `<p class="lead">DogeDrop has not been audited. Be careful. Test with a small amount only. A payment cannot be undone, and coins can be lost if something goes wrong.</p>${button('primary', 'dismiss-caution', 'check', 'I understand')}`, 'shield');
  }

  function access() {
    return shell('Use the same wallet here', `<p class="lead">Browsers keep an embedded wallet separate until you allow it. Allowing it lets this page open the wallet you already created, instead of making a new one.</p>${button('primary', 'allow-storage', 'shield', 'Use my wallet here')}<p class="foot"><a href="index.html" target="_blank" rel="noopener">Open the wallet in its own tab</a> if the browser asks you to visit it first.</p>`, 'shield');
  }

  function welcome() {
    const waiting = state.request ? `<div class="banner">${icon('link')}<span>${esc(siteName(state.request.origin))} is waiting for a wallet.</span></div>` : '';
    return shell('DogeDrop stays with you', `${waiting}<p class="lead">Coins are created and kept in this browser. The same 12 words also work on DogecoinVM. The coins on each chain stay separate. The website you are visiting never receives the keys.</p><div class="stack">${button('primary', 'start-create', 'add_card', 'Create a new wallet')}${button('ghost', 'start-restore', 'key', 'I already have a wallet')}</div>`, 'account_balance_wallet');
  }

  function password() {
    return shell('Choose a password', `<p class="lead">This password locks the wallet on this browser. It is not sent anywhere. The 12 words, which come next, are what can restore the coins on another computer.</p><form class="stack" data-action="to-reveal"><label>Password<input name="password" type="password" minlength="8" autocomplete="new-password" required></label><label>Password again<input name="confirm" type="password" minlength="8" autocomplete="new-password" required></label><label>Extra word, optional<span class="hint">Leave this empty unless you already use a BIP39 passphrase.</span><input name="passphrase" autocomplete="off"></label><button class="primary" type="submit">${icon('visibility')}<span>Show my 12 words</span></button>${button('ghost', 'back-welcome', 'arrow_back', 'Back')}</form>`, 'password');
  }

  function reveal() {
    const words = state.pending.mnemonic.split(' ').map((word, index) => `<div class="word"><b>${index + 1}</b>${esc(word)}</div>`).join('');
    return shell('Write down these 12 words', `<p class="lead">This is the only backup. If you lose the words, the coins cannot be recovered by anyone. The next step asks for three of them.</p><div class="words">${words}</div><div class="row">${button('ghost', 'copy', 'content_copy', 'Copy words', `data-copy="${esc(state.pending.mnemonic)}"`)}${button('ghost', 'download-words', 'download', 'Download')}</div>${button('primary', 'to-quiz', 'check', 'I wrote them down')}`, 'edit_note');
  }

  function confirm() {
    const fields = state.pending.quiz.map((index, position) => `<label>Word ${index + 1}<input name="word${position}" autocomplete="off" autocapitalize="off" spellcheck="false" required></label>`).join('');
    return shell('Check the backup', `<form class="stack" data-action="finish-create">${fields}<label class="switch"><input name="saved" type="checkbox" role="switch" required><span class="track" aria-hidden="true"></span><span>I understand nobody, including this website, can restore the words for me.</span></label><button class="primary" type="submit">${icon('save')}<span>Save wallet on this browser</span></button></form>`, 'fact_check');
  }

  function restore() {
    const mode = state.pending.restore || 'words';
    const choices = [
      ['words', 'edit_note', 'Words', '12 or 24 word phrase'],
      ['wif', 'key', 'Private key', 'Starts with Q'],
      ['file', 'download', 'File', 'Encrypted backup'],
    ].map(([id, glyph, title, detail]) => `<button type="button" class="mode${mode === id ? ' active' : ''}" data-action="set-restore" data-mode="${id}" role="radio" aria-checked="${mode === id}"><span class="mode-icon">${icon(glyph)}</span><span class="mode-copy"><strong>${title}</strong><span>${detail}</span></span><span class="mi mode-check" aria-hidden="true">check</span></button>`).join('');
    const secret = mode === 'file'
      ? '<label>Encrypted backup<input name="file" type="file" accept="application/json,.json" required></label>'
      : `<label>${mode === 'wif' ? 'Private key' : '12 or 24 words'}<textarea name="secret" autocomplete="off" autocapitalize="off" spellcheck="false" required></textarea></label>${mode === 'words' ? '<label>Extra word, optional<span class="hint">Only if you created the phrase with a passphrase.</span><input name="passphrase" autocomplete="off"></label>' : ''}`;
    return shell('Restore a wallet', `<div class="modes" role="radiogroup" aria-label="How to restore">${choices}</div><form class="stack" data-action="finish-restore">${secret}<label>Password for this browser<input name="password" type="password" minlength="8" autocomplete="new-password" required></label><label>Password again<input name="confirm" type="password" minlength="8" autocomplete="new-password" required></label><button class="primary" type="submit">${icon('key')}<span>Restore</span></button>${button('ghost', 'back-welcome', 'arrow_back', 'Back')}</form>`, 'key');
  }

  function chainButtons(selected, locked) {
    return `<div class="chains">${['dogecoin', 'dogecoinvm'].map((id) => `<button type="button" class="chain ${selected === id ? 'active' : ''}" data-action="set-chain" data-chain="${id}" ${locked ? 'disabled' : ''}>${icon(id === 'dogecoinvm' ? 'bolt' : 'payments')}<span><strong>${chainName(id)}</strong><span class="num">${esc(balanceText(id))} DOGE</span></span></button>`).join('')}</div>`;
  }

  function vmHelp() {
    return `<p class="hint">DogecoinVM is a Dogecoin-compatible chain. It uses the same address, and the coins are separate. Choose it above, or pay with a dogecoinvm: link. A payment is final in about a fifth of a second. <a href="https://metaldoge.com/" target="_blank" rel="noopener">What it is and how to use it</a></p>`;
  }

  function home() {
    const chain = state.chain === 'dogecoinvm' ? 'dogecoinvm' : 'dogecoin';
    const current = currentReceive(chain);
    const link = window.DogeChain.paymentUri(chain, current.address);
    const dollars = chain === 'dogecoin' ? money(state.balances.dogecoin) : '';
    const provider = chain === 'dogecoinvm'
      ? vmProvider().label
      : (state.busy ? 'Checking the network…' : window.DogeNet.createProvider(state.settings).label);
    const last = state.lastTx ? `<p class="foot">${icon('receipt_long')}<a href="${esc(txLink(state.lastChain, state.lastTx))}" target="_blank" rel="noopener"><span class="num">${esc(state.lastTx.slice(0, 10))}…</span></a></p>` : '';
    return shell('', `${chainButtons(chain, false)}${chain === 'dogecoinvm' ? vmHelp() : ''}<p class="balance">${esc(balanceText(chain))} <span>DOGE</span></p><p class="sub">${dollars ? `<span class="num">${esc(dollars)}</span> · ` : ''}${esc(chainName(chain))}, ${esc(provider)}</p>${qrBlock(link)}<div class="card flat">${addressField(current.address)}</div><p class="hint">The QR is a payment link for ${esc(chainName(chain))}. The address you copy is only the address. It is the same on both chains, and copying it does not choose a chain. The keys stay in this browser.</p><p class="foot">${icon('shield')}<span>Keys stay in this browser.</span></p>${last}`);
  }

  function send() {
    const fees = [
      ['slow', 'Slow', 'schedule'],
      ['normal', 'Normal', 'payments'],
      ['fast', 'Fast', 'bolt'],
    ].map(([name, label, glyph]) => `<button type="button" class="choice ${state.draft.fee === name ? 'active' : ''}" data-action="fee" data-fee="${name}">${icon(glyph)}<span><strong>${label}</strong><span class="fee">${esc(feeLabel(name))}</span></span></button>`).join('');
    const locked = state.draft.locked ? '<p class="hint">This payment link already chooses the chain. It will not be paid on the other chain.</p>' : '<p class="hint">A bare address can be paid on either chain. A dogecoin: or dogecoinvm: link chooses for you. Amount example: dogecoin:D...?amount=1.5</p>';
    return shell(`Send on ${chainName(state.draft.chain)}`, `<form class="stack" data-action="to-review">${chainButtons(state.draft.chain, state.draft.locked)}${state.draft.chain === 'dogecoinvm' ? vmHelp() : ''}${locked}<label>To<input id="send-to" value="${esc(state.draft.to)}" autocomplete="off" spellcheck="false" required></label><div class="field"><div class="field-head"><span>Amount</span><button type="button" class="link" data-action="fill-max">${icon('account_balance_wallet')}<span>Send all</span></button></div><input id="send-amount" class="num" data-amount="1" value="${esc(state.draft.amount)}" inputmode="decimal" autocomplete="off"></div><div class="row">${fees}</div><button class="primary" type="submit">${icon('fact_check')}<span>Review</span></button></form>`, 'send');
  }

  function review() {
    let plan;
    try { plan = paymentPlan(); } catch (error) {
      const choose = state.draft.chain
        ? `<div class="card"><p>Chain<br><strong>${esc(chainName(state.draft.chain))}</strong></p><p>To<br><span class="num">${esc(payAddress())}</span></p><p>Amount<br><strong class="num">${esc(state.draft.amount)} DOGE</strong></p></div>`
        : chainButtons('', false);
      return shell('Confirm payment', `${choose}<div class="banner bad"><span>${esc(error.message)}</span></div>${button('ghost', state.request?.type === 'pay' ? 'cancel-request' : 'edit-send', 'arrow_back', 'Back')}`, 'verified');
    }
    const change = plan.change > 0n ? `<p>Leftover <strong class="num">${esc(window.DogeChain.formatDoge(plan.change))} DOGE</strong> goes to a new address on ${esc(chainName(state.draft.chain))}.</p>` : '<p>The leftover is small, so it is added to the fee. No change address is used.</p>';
    const password = state.secret ? '' : '<label>Wallet password<input name="password" type="password" autocomplete="current-password" required></label>';
    const back = state.request?.type === 'pay' ? 'cancel-request' : 'edit-send';
    const note = [state.draft.label, state.draft.message].filter(Boolean).map((item) => `<p>${esc(item)}</p>`).join('');
    const via = state.draft.chain === 'dogecoinvm' ? vmProvider().broadcastLabel : window.DogeNet.createProvider(state.settings).broadcastLabel;
    return shell('Confirm payment', `<form class="stack" data-action="confirm-pay"><div class="card"><p>Chain<br><strong>${esc(chainName(state.draft.chain))}</strong></p><p>To<br><span class="num">${esc(payAddress())}</span></p>${note}<p>Amount<br><strong class="num">${esc(window.DogeChain.formatDoge(plan.amount || plan.outputs[0].value))} DOGE</strong></p><p>Network fee<br><strong class="num">${esc(window.DogeChain.formatDoge(plan.fee))} DOGE</strong></p>${change}<p class="hint">Signed in this browser, then sent through ${esc(via)}. ${esc(chainWait(state.draft.chain))}</p></div>${password}<button class="primary" type="submit" ${state.busy ? 'disabled' : ''}>${icon('verified')}<span>${state.busy ? 'Sending…' : 'Send now'}</span></button>${button('ghost', back, 'arrow_back', 'Back')}</form>`, 'verified');
  }

  function payAddress() {
    try { return window.DogeChain.parsePayment(state.draft.to).address; } catch { return state.draft.to; }
  }

  function receive() {
    const chain = state.chain === 'dogecoinvm' ? 'dogecoinvm' : 'dogecoin';
    if (state.chainError[chain]) state.error = state.chainError[chain];
    const current = currentReceive(chain);
    const link = window.DogeChain.paymentUri(chain, current.address);
    return shell('Receive', `${chainButtons(chain, false)}${chain === 'dogecoinvm' ? vmHelp() : ''}${qrBlock(link)}${addressField(current.address)}<p class="hint">The QR is a ${chain === 'dogecoinvm' ? 'dogecoinvm:' : 'dogecoin:'} link, so a scan pays ${esc(chainName(chain))}. ${esc(chainWait(chain))} The address below is only the address. After it receives a payment, the next one appears here.</p>`, 'qr_code_2');
  }

  function activity() {
    const chain = state.chain === 'dogecoinvm' ? 'dogecoinvm' : 'dogecoin';
    if (state.chainError[chain]) state.error = state.chainError[chain];
    const quiet = chain === 'dogecoin' && (state.settings.preset === 'core' || state.settings.preset === 'dogego');
    const empty = quiet ? 'A node can find coins to spend, but it does not keep an address history.' : 'No payments found for this wallet yet.';
    const rows = (state.histories[chain] || []).length
      ? state.histories[chain].map((tx) => `<a class="tx" href="${esc(txLink(chain, tx.txid))}" target="_blank" rel="noopener"><span>${tx.time ? esc(new Date(tx.time * 1000).toLocaleString()) : 'Watched'}</span><strong>${esc(tx.change || '')}</strong></a>`).join('')
      : (state.chainError[chain] ? '' : `<p class="hint">${esc(empty)}</p>`);
    return shell('Activity', `${chainButtons(chain, false)}<div class="card list">${rows}</div>`, 'receipt_long');
  }

  function settingsTabs(selected) {
    return `<div class="chains" role="tablist" aria-label="Which chain to configure">${['dogecoin', 'dogecoinvm'].map((id) => `<button type="button" class="chain ${selected === id ? 'active' : ''}" role="tab" aria-selected="${selected === id}" data-action="settings-tab" data-chain="${id}">${icon(id === 'dogecoinvm' ? 'bolt' : 'payments')}<span><strong>${chainName(id)}</strong></span></button>`).join('')}</div>`;
  }

  function dogeSettings(s) {
    const options = window.DogeNet.PRESETS.map((preset) => `<option value="${preset.id}" ${s.preset === preset.id ? 'selected' : ''}>${esc(preset.label)}</option>`).join('');
    const broadcasts = [['same', 'Same as above'], ['public', 'Public explorers'], ['blockcypher', 'BlockCypher'], ['core', 'Dogecoin Core'], ['dogego', 'DogeGo'], ['memetracker', 'MemeTracker']].map(([id, label]) => `<option value="${id}" ${s.broadcast === id ? 'selected' : ''}>${label}</option>`).join('');
    const detail = window.DogeNet.PRESETS.find((preset) => preset.id === s.preset)?.detail || '';
    const core = s.preset === 'core' || s.broadcast === 'core';
    const dogego = s.preset === 'dogego' || s.broadcast === 'dogego';
    const meme = s.preset === 'memetracker' || s.broadcast === 'memetracker';
    return `<p class="lead">${esc(detail)}</p><label>Where to look up coins<select name="preset">${options}</select></label><label>Where to send the signed payment<select name="broadcast">${broadcasts}</select></label>${s.preset === 'blockcypher' || s.broadcast === 'blockcypher' ? field('blockcypherToken', 'BlockCypher token, optional', s.blockcypherToken) : ''}${s.preset === 'sochain' ? field('sochainKey', 'SoChain API key', s.sochainKey) : ''}${core ? `${field('coreUrl', 'Dogecoin Core URL', s.coreUrl, 'https://node.example.com:22555')}${field('coreUser', 'RPC user', s.coreUser)}${field('corePassword', 'RPC password', s.corePassword, '', 'password')}` : ''}${dogego ? `${field('dogegoUrl', 'DogeGo URL', s.dogegoUrl, 'https://node.example.com:22555')}${field('dogegoUser', 'RPC user', s.dogegoUser)}${field('dogegoPassword', 'RPC password', s.dogegoPassword, '', 'password')}` : ''}${meme ? field('memetrackerUrl', 'MemeTracker URL', s.memetrackerUrl, 'https://tracker.example.com') : ''}`;
  }

  function vmSettings(s) {
    const preset = s.vmPreset === 'custom' ? 'custom' : 'metaldoge';
    const broadcast = s.vmBroadcast === 'custom' ? 'custom' : (s.vmBroadcast === 'metaldoge' ? 'metaldoge' : 'same');
    const lookup = `<label>Where to look up coins<select name="vmPreset"><option value="metaldoge" ${preset === 'metaldoge' ? 'selected' : ''}>MetalDoge (vm.dogedrop.org)</option><option value="custom" ${preset === 'custom' ? 'selected' : ''}>Custom</option></select></label>`;
    const lookupUrl = preset === 'custom' ? field('vmUrl', 'Explorer address', s.vmUrl, 'https://vm.dogedrop.org') : '';
    const send = `<label>Where to send the signed payment<select name="vmBroadcast"><option value="same" ${broadcast === 'same' ? 'selected' : ''}>Same as the explorer</option><option value="metaldoge" ${broadcast === 'metaldoge' ? 'selected' : ''}>MetalDoge (vm.dogedrop.org)</option><option value="custom" ${broadcast === 'custom' ? 'selected' : ''}>Custom</option></select></label>`;
    const sendUrl = broadcast === 'custom' ? field('vmBroadcastUrl', 'Send address', s.vmBroadcastUrl, 'https://vm.dogedrop.org') : '';
    return `<p class="lead">Coins are looked up and the signed payment is sent through vm.dogedrop.org unless you choose a custom address. The keys are not sent there.</p>${lookup}${lookupUrl}${send}${sendUrl}`;
  }

  function settings() {
    const s = state.settings;
    const tab = state.settingsTab === 'dogecoinvm' ? 'dogecoinvm' : 'dogecoin';
    const chainFields = tab === 'dogecoinvm' ? vmSettings(s) : dogeSettings(s);
    return shell('Connection', `${settingsTabs(tab)}<form id="settings-form" class="stack" data-action="save-settings">${chainFields}<label>Lock after<select name="autolockMinutes"><option value="5" ${s.autolockMinutes == 5 ? 'selected' : ''}>5 minutes</option><option value="15" ${s.autolockMinutes == 15 ? 'selected' : ''}>15 minutes</option><option value="60" ${s.autolockMinutes == 60 ? 'selected' : ''}>1 hour</option><option value="0" ${s.autolockMinutes == 0 ? 'selected' : ''}>When I close this page</option></select></label><button class="primary" type="submit">${icon('save')}<span>Save</span></button>${button('ghost', 'test-connection', 'wifi_tethering', 'Test connection')}${button('ghost', 'download-backup', 'download', 'Download encrypted backup')}${button('ghost', 'go-unlock', 'visibility', 'Show recovery phrase', 'data-next="backup"')}</form><div class="card"><p>Removing the wallet from this browser does not move the coins. Type the receive address to confirm.</p><input id="delete-address" class="num" autocomplete="off" spellcheck="false">${button('danger', 'delete-wallet', 'delete', 'Remove from this browser')}</div><p class="foot">${icon('shield')}<span>A node password is stored only in this browser and is sent only to the node address above. The recovery phrase is never sent.</span></p>`, 'settings');
  }

  function backup() {
    if (!state.secret) return unlock();
    const words = state.secret.mnemonic ? state.secret.mnemonic.split(' ').map((word, index) => `<div class="word"><b>${index + 1}</b>${esc(word)}</div>`).join('') : addressField(state.secret.wif || '');
    return shell(state.secret.mnemonic ? 'Recovery phrase' : 'Private key', `<div class="card">${words}${state.secret.passphrase ? `<p>Extra word: <strong>${esc(state.secret.passphrase)}</strong></p>` : ''}</div>${button('ghost', 'home', 'visibility', 'Hide')}`, state.secret.mnemonic ? 'visibility' : 'key');
  }

  function unlock() {
    return shell('Unlock', `<form class="stack" data-action="do-unlock"><label>Password<input name="password" type="password" autocomplete="current-password" required></label><button class="primary" type="submit">${icon('lock_open')}<span>Unlock</span></button>${button('ghost', 'home', 'arrow_back', 'Back')}</form>`, 'lock_open');
  }

  function approve() {
    if (!state.request) return home();
    const host = esc(siteName(state.request.origin));
    if (state.request.type === 'sign') {
      const password = state.secret ? '' : '<label>Wallet password<input name="password" type="password" autocomplete="current-password" required></label>';
      return shell('Sign a message', `<form class="stack" data-action="approve-sign"><p>${host} wants a signature from your wallet. This does not spend coins.</p><div class="card">${esc(state.request.message)}</div>${password}<button class="primary" type="submit">${icon('draw')}<span>Sign</span></button>${button('ghost', 'cancel-request', 'close', 'Cancel')}</form>`, 'draw');
    }
    const current = currentReceive();
    return shell('Connect', `<form class="stack" data-action="approve-connect"><p>${host} wants to see your Dogecoin address and ask before each payment. It cannot see your recovery phrase.</p>${addressField(current.address)}<label>Wallet password<input name="password" type="password" autocomplete="current-password" required></label><button class="primary" type="submit">${icon('lock_open')}<span>Connect</span></button>${button('ghost', 'cancel-request', 'close', 'Cancel')}</form>`, 'lock');
  }

  function payChoice() {
    const host = esc(siteName(state.request?.origin));
    const chain = state.draft.chain === 'dogecoinvm' ? 'dogecoinvm' : (state.draft.chain === 'dogecoin' ? 'dogecoin' : '');
    const named = chain ? chainName(chain) : 'Choose a chain in the payment link';
    const uri = externalPayLink();
    const unlock = state.pub
      ? `<form class="stack" data-action="unlock-and-pay"><label>Wallet password<input name="password" type="password" autocomplete="current-password" required></label><button class="primary" type="submit">${icon('lock_open')}<span>Unlock this wallet and continue</span></button></form><p class="hint">Creating or importing replaces the wallet in this browser. The coins stay safe only if you kept the 12 words.</p>`
      : '<p class="hint">This browser does not have a DogeDrop wallet yet.</p>';
    const other = chain === 'dogecoinvm'
      ? 'This opens a dogecoinvm: link for a wallet already installed on this device. DogeDrop does not sign that payment.'
      : 'This opens a dogecoin: link for a wallet already installed on this device. DogeDrop does not sign that payment.';
    return shell('Choose how to pay', `<p>${host} is asking for a payment, and DogeDrop is not connected.</p><div class="card"><p>Chain<br><strong>${esc(named)}</strong></p><p>To<br><span class="num">${esc(payAddress())}</span></p><p>Amount<br><strong class="num">${esc(state.draft.amount)} DOGE</strong></p></div><div class="stack">${unlock}${button('ghost', 'start-create', 'add_card', 'Create a new wallet')}${button('ghost', 'start-restore', 'key', 'Import a wallet')}<a class="ghost" href="${esc(uri)}" target="_blank" rel="noopener" data-action="pay-external">${icon('payments')}<span>Pay with another wallet</span></a><p class="hint">${other}</p>${button('ghost', 'cancel-request', 'close', 'Cancel')}</div>`, 'payments');
  }

  function externalPayLink() {
    const chain = state.draft.chain === 'dogecoinvm' ? 'dogecoinvm' : 'dogecoin';
    return window.DogeChain.paymentUri(chain, payAddress(), state.draft.amount);
  }

  function field(name, label, value, placeholder = '', type = 'text') {
    return `<label>${label}<input name="${name}" type="${type}" value="${esc(value || '')}" placeholder="${esc(placeholder)}" autocomplete="off"></label>`;
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
