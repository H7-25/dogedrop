(function () {
  if (window.doge && window.doge.isDogePocket) return;
  const script = document.currentScript;
  const walletBase = new URL(script && script.dataset.wallet ? script.dataset.wallet : '.', script ? script.src : location.href);
  const walletOrigin = walletBase.origin;
  const walletUrl = new URL('index.html?embed=1', walletBase).href;
  const listeners = {};
  const pending = new Map();
  let frame;
  let phone;
  let backdrop;
  let button;
  let pinned = false;
  let readyResolve;
  const ready = new Promise((resolve) => { readyResolve = resolve; });

  function emit(name, detail) {
    (listeners[name] || []).forEach((fn) => { try { fn(detail); } catch { /* A page listener should not break the wallet. */ } });
  }

  function messageTarget() {
    if (location.protocol === 'file:' || !walletOrigin || walletOrigin === 'null') return '*';
    return walletOrigin;
  }

  function fromWallet(event) {
    if (!frame || event.source !== frame.contentWindow) return false;
    if (location.protocol === 'file:') return event.origin === 'null' || event.origin === 'file://';
    return event.origin === walletOrigin;
  }

  function call(method, params, timeout) {
    return ready.then(() => new Promise((resolve, reject) => {
      const id = Math.random().toString(36).slice(2);
      const timer = setTimeout(() => {
        pending.delete(id);
        reject(new Error('The wallet took too long to answer.'));
      }, timeout || 20000);
      pending.set(id, { resolve, reject, timer });
      frame.contentWindow.postMessage({ channel: 'doge-pocket', id, method, params: params || {} }, messageTarget());
    }));
  }

  function reveal() { setOpen(true); }

  function setOpen(open) {
    if (!phone) return;
    phone.classList.toggle('is-open', open);
    phone.hidden = !open;
    if (backdrop) backdrop.hidden = !open;
    document.documentElement.classList.toggle('doge-pocket-open', open);
    if (button) button.setAttribute('aria-expanded', open ? 'true' : 'false');
  }

  const doge = {
    isDogePocket: true,
    isDogecoin: true,
    network: 'mainnet',
    on(name, fn) { (listeners[name] = listeners[name] || []).push(fn); },
    off(name, fn) { listeners[name] = (listeners[name] || []).filter((item) => item !== fn); },
    open() { pinned = true; setOpen(true); return call('open', {}, 20000); },
    async connect() {
      reveal();
      const result = await call('connect', {}, 300000);
      emit('connect', result);
      refreshChip();
      return result;
    },
    async disconnect() {
      const result = await call('disconnect', {}, 20000);
      emit('disconnect', result);
      refreshChip();
      return result;
    },
    getConnectionStatus() { return call('getConnectionStatus', {}, 20000); },
    getBalance() { return call('getBalance', {}, 30000); },
    getAddress() { return call('getAddress', {}, 20000); },
    requestTransaction(tx) { reveal(); return call('requestTransaction', tx || {}, 300000); },
    requestSignedMessage(request) { reveal(); return call('requestSignedMessage', request || {}, 300000); },
    async request(args) {
      const method = args && args.method;
      const params = args && args.params;
      if (method === 'doge_requestAccounts' || method === 'connect') return doge.connect();
      if (method === 'doge_getBalance') return doge.getBalance();
      if (method === 'doge_sendDoge' || method === 'requestTransaction') return doge.requestTransaction(params || {});
      throw new Error('Unknown request');
    },
  };

  Object.defineProperty(window, 'doge', { value: doge, writable: false, configurable: false });

  function mount() {
    const word = (script && script.dataset.label) || 'DogeWallet';
    const logo = new URL('img/logo.png', walletBase).href;
    const text = new URL('css/fonts/inter-latin.woff2', walletBase).href;
    const mono = new URL('css/fonts/roboto-mono-latin.woff2', walletBase).href;
    const style = document.createElement('style');
    style.textContent = `@font-face{font-family:"Doge Pocket Text";src:url("${text}") format("woff2");font-weight:400 700;font-display:swap}@font-face{font-family:"Doge Pocket Mono";src:url("${mono}") format("woff2");font-weight:500;font-display:swap}#doge-pocket-button{position:fixed;z-index:2147483000;right:16px;bottom:max(16px,env(safe-area-inset-bottom,0px));display:flex;align-items:center;gap:8px;height:48px;padding:4px 10px 4px 6px;border:1px solid #cbd5e1;border-radius:0;background:#fff;color:#0f172a;font:700 16px/1 "Doge Pocket Text",Inter,system-ui,sans-serif;box-shadow:0 10px 28px rgba(15,23,42,.12);cursor:pointer;perspective:280px;overflow:hidden;animation:doge-chip-glow 2s ease-in-out infinite}#doge-pocket-button::after{content:"";position:absolute;inset:0;background:linear-gradient(110deg,transparent 30%,rgba(37,99,235,.28) 50%,transparent 70%);transform:translateX(-120%);animation:doge-chip-sheen 3.2s ease-in-out infinite;pointer-events:none}#doge-pocket-button>*{position:relative;z-index:1}#doge-pocket-button img{width:32px;height:32px;border-radius:0;display:block;transform-style:preserve-3d;animation:doge-logo-spin 3.2s linear infinite}@keyframes doge-logo-spin{0%{transform:rotateY(0deg)}37.5%{transform:rotateY(720deg)}100%{transform:rotateY(720deg)}}@keyframes doge-chip-glow{0%,100%{box-shadow:0 10px 28px rgba(15,23,42,.12),0 0 0 0 rgba(37,99,235,.55)}50%{box-shadow:0 10px 28px rgba(15,23,42,.12),0 0 0 8px rgba(37,99,235,0)}}@keyframes doge-chip-sheen{0%,55%{transform:translateX(-120%)}80%,100%{transform:translateX(120%)}}@media(prefers-reduced-motion:reduce){#doge-pocket-button,#doge-pocket-button::after,#doge-pocket-button img{animation:none}}#doge-pocket-button [data-status]{font:600 11px/1 "Doge Pocket Mono",ui-monospace,monospace;color:#475569;background:#f3f4f6;border-radius:0;padding:5px 8px}#doge-pocket-button.is-on [data-status]{color:#047857;background:#ecfdf5}#doge-pocket-backdrop{position:fixed;inset:0;z-index:2147483000;background:rgba(15,23,42,.45)}#doge-pocket-phone{box-sizing:border-box;position:fixed;z-index:2147483001;right:16px;bottom:76px;display:none;width:min(420px,calc(100vw - 32px));height:min(760px,calc(100dvh - 96px));padding:10px;overflow:hidden;background:#111827;border-radius:36px;box-shadow:0 28px 70px rgba(15,23,42,.38)}#doge-pocket-phone.is-open{display:flex}#doge-pocket-frame{display:block;flex:1;width:100%;height:100%;min-height:0;border:0;border-radius:26px;background:#f9fafb}html.doge-pocket-open,html.doge-pocket-open body{overflow:hidden}@media(max-width:700px){#doge-pocket-phone{inset:0;right:0;bottom:0;width:100%;height:100%;height:100dvh;padding:0;border-radius:0;box-shadow:none;background:transparent}#doge-pocket-frame{border-radius:0}#doge-pocket-backdrop{background:#0f172a}}`;
    document.documentElement.appendChild(style);
    backdrop = document.createElement('div');
    backdrop.id = 'doge-pocket-backdrop';
    backdrop.hidden = true;
    backdrop.addEventListener('click', () => { pinned = false; setOpen(false); });
    frame = document.createElement('iframe');
    frame.id = 'doge-pocket-frame';
    frame.title = 'DogeWallet';
    phone = document.createElement('div');
    phone.id = 'doge-pocket-phone';
    phone.hidden = true;
    phone.appendChild(frame);
    document.body.appendChild(backdrop);
    document.body.appendChild(phone);
    if (!script || script.dataset.button !== 'false') {
      button = document.createElement('button');
      button.id = 'doge-pocket-button';
      button.type = 'button';
      button.innerHTML = '<img alt=""><span data-word></span><span data-status>Not connected</span>';
      button.querySelector('img').src = logo;
      button.querySelector('[data-word]').textContent = word;
      button.setAttribute('aria-label', `${word}, not connected`);
      button.addEventListener('click', async () => {
        const opening = phone.hidden;
        pinned = opening;
        setOpen(opening);
        if (!opening) return;
        let status = { connected: false };
        try { status = await doge.getConnectionStatus(); } catch { /* The panel still opens. */ }
        if (!status.connected) {
          try { await doge.connect(); } catch { /* The visitor can refuse. */ }
        } else {
          doge.open().catch(() => {});
        }
        refreshChip();
      });
      document.body.appendChild(button);
    }
    window.addEventListener('message', (event) => {
      if (!fromWallet(event)) return;
      const data = event.data;
      if (!data || data.channel !== 'doge-pocket') return;
      if (data.event === 'ready') {
        readyResolve();
        setTimeout(() => {
          window.dispatchEvent(new Event('doge#initialized'));
          refreshChip();
        }, 0);
        return;
      }
      if (data.event === 'ui') {
        if (data.open) setOpen(true);
        else if (data.force || !pinned) {
          pinned = false;
          setOpen(false);
        }
        return;
      }
      const job = pending.get(data.id);
      if (!job) return;
      clearTimeout(job.timer);
      pending.delete(data.id);
      if (data.error) job.reject(new Error(data.error));
      else job.resolve(data.result);
    });
    frame.src = walletUrl;
  }

  async function refreshChip() {
    if (!button) return;
    const mark = button.querySelector('[data-status]');
    const label = button.querySelector('[data-word]');
    const word = label ? label.textContent : 'DogeWallet';
    try {
      const status = await doge.getConnectionStatus();
      const on = !!status.connected;
      button.classList.toggle('is-on', on);
      if (mark) mark.textContent = on ? 'Connected' : 'Not connected';
      button.setAttribute('aria-label', on ? `${word}, connected` : `${word}, not connected`);
    } catch {
      button.classList.remove('is-on');
      if (mark) mark.textContent = 'Not connected';
    }
  }

  if (document.body) mount();
  else document.addEventListener('DOMContentLoaded', mount);
})();
