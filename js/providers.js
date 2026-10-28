(function () {
  const PRESETS = [
    { id: 'dogechain', label: 'Dogechain', detail: 'Free Dogechain API at dogechain.com, no key. Balance, activity and unspent coins come from there. Signed payments go out through a public explorer, because Dogechain does not broadcast.' },
    { id: 'public', label: 'Public explorers', detail: 'Dogechain for history, Blockchair for coins and sending. No account.' },
    { id: 'blockcypher', label: 'BlockCypher', detail: 'Free BlockCypher Dogecoin API. An optional token raises the limit.' },
    { id: 'sochain', label: 'SoChain', detail: 'SoChain finds coins. An API key is required. Sending still uses a public explorer unless you pick a node.' },
    { id: 'core', label: 'Dogecoin Core', detail: 'Your node, through JSON-RPC. Keys stay in the browser. The node only sees addresses and the signed transaction.' },
    { id: 'dogego', label: 'DogeGo', detail: 'A DogeGo node, through the same JSON-RPC methods as Dogecoin Core.' },
    { id: 'memetracker', label: 'MemeTracker', detail: 'Your MemeTracker node. It lists coins for addresses it is watching, through /getUTXOs. The recovery phrase stays in this browser.' },
  ];

  function defaultSettings() {
    return {
      preset: 'dogechain',
      broadcast: 'same',
      fee: 'normal',
      autolockMinutes: 15,
      blockcypherToken: '',
      sochainKey: '',
      coreUrl: '',
      coreUser: '',
      corePassword: '',
      dogegoUrl: '',
      dogegoUser: '',
      dogegoPassword: '',
      memetrackerUrl: '',
      vmPreset: 'metaldoge',
      vmUrl: 'https://vm.dogedrop.org',
      vmBroadcast: 'same',
      vmBroadcastUrl: 'https://vm.dogedrop.org',
    };
  }

  function createProvider(settings) {
    const config = { ...defaultSettings(), ...settings };
    if (config.preset === 'blockbook') config.preset = 'memetracker';
    if (config.broadcast === 'blockbook') config.broadcast = 'memetracker';
    if (!config.memetrackerUrl && settings && settings.blockbookUrl) config.memetrackerUrl = settings.blockbookUrl;
    return {
      id: config.preset,
      label: labelFor(config.preset),
      broadcastLabel: labelFor(sendPreset(config)),
      trustsNode: config.preset === 'core' || config.preset === 'dogego' || config.preset === 'memetracker',
      inspect: (addresses) => inspect(config, addresses),
      history: (addresses) => history(config, addresses),
      fees: () => fees(config),
      broadcast: (raw) => broadcast(config, raw),
      verifyInputs: (inputs) => verifyInputs(config, inputs),
      test: () => testConnection(config),
    };
  }

  function createVmProvider(settings) {
    const config = normalizeVm({ ...defaultSettings(), ...settings });
    const explorer = vmEndpoint(config, 'explorer');
    const send = vmEndpoint(config, 'broadcast');
    return {
      id: 'dogecoinvm',
      label: hostOf(explorer),
      broadcastLabel: hostOf(send),
      explorer,
      inspect: (addresses) => vmInspect(explorer, addresses),
      history: (addresses) => vmHistory(explorer, addresses),
      broadcast: (raw) => vmBroadcast(send, raw),
      verifyInputs: async () => {},
      test: async () => {
        const lookup = await vmTest(explorer, 'explorer');
        if (send === explorer) return lookup;
        return `${lookup} ${await vmTest(send, 'broadcast')}`;
      },
    };
  }

  function normalizeVm(config) {
    const url = String(config.vmUrl || '').trim().replace(/\/$/, '');
    const known = !url || url === 'https://vm.dogedrop.org' || url === 'https://metaldoge.dogedrop.org' || url === 'https://metaldoge.com';
    if (!config.vmPreset) config.vmPreset = known ? 'metaldoge' : 'custom';
    if (!config.vmBroadcast) config.vmBroadcast = 'same';
    if (!config.vmUrl || config.vmUrl === 'https://metaldoge.com' || config.vmUrl === 'https://metaldoge.dogedrop.org') config.vmUrl = 'https://vm.dogedrop.org';
    if (!config.vmBroadcastUrl || config.vmBroadcastUrl === 'https://metaldoge.com' || config.vmBroadcastUrl === 'https://metaldoge.dogedrop.org') config.vmBroadcastUrl = 'https://vm.dogedrop.org';
    return config;
  }

  function vmEndpoint(config, kind) {
    if (kind === 'broadcast') {
      if (config.vmBroadcast === 'custom') return vmBase(config.vmBroadcastUrl, 'broadcast');
      if (config.vmBroadcast === 'metaldoge') return 'https://vm.dogedrop.org';
    }
    if (config.vmPreset === 'custom') return vmBase(config.vmUrl, 'explorer');
    return 'https://vm.dogedrop.org';
  }

  function hostOf(url) {
    return String(url).replace(/^https?:\/\//, '');
  }

  function labelFor(id) {
    return PRESETS.find((preset) => preset.id === id)?.label || 'Public explorers';
  }

  function sendPreset(config) {
    const which = config.broadcast === 'same' ? config.preset : config.broadcast;
    return which === 'dogechain' ? 'public' : which;
  }

  async function inspect(config, addresses) {
    const list = unique(addresses);
    if (!list.length) return {};
    if (config.preset === 'core') return rpcInspect(config.coreUrl, config.coreUser, config.corePassword, list);
    if (config.preset === 'dogego') return rpcInspect(config.dogegoUrl, config.dogegoUser, config.dogegoPassword, list);
    if (config.preset === 'memetracker') return memeTrackerInspect(config, list);
    if (config.preset === 'blockcypher') return blockcypherInspect(config, list);
    if (config.preset === 'sochain') return sochainInspect(config, list);
    if (config.preset === 'dogechain') return dogechainInspect(list);
    try {
      return await blockchairInspect(list);
    } catch (error) {
      try {
        return await blockcypherInspect(config, list);
      } catch {
        throw error;
      }
    }
  }

  async function history(config, addresses) {
    const list = unique(addresses).slice(0, 8);
    if (config.preset === 'memetracker') return memeTrackerHistory(config, list);
    if (config.preset === 'core' || config.preset === 'dogego') return [];
    const rows = [];
    let misses = 0;
    const pages = config.preset === 'dogechain' ? 5 : 1;
    for (const address of list) {
      try {
        rows.push(...await dogechainHistory(address, pages));
      } catch {
        misses += 1;
      }
    }
    if (list.length && misses === list.length) throw new Error('Activity could not be loaded.');
    return dedupeHistory(rows);
  }

  async function fees() {
    try {
      const body = await getJson('https://dogechain.com/api/v3/fees');
      const rates = body.data.fee_rate_koinu_per_byte;
      return {
        slow: Math.max(1000, Math.ceil(rates.min || 1000)),
        normal: Math.max(1000, Math.ceil(rates.median || 10000)),
        fast: Math.max(1000, Math.ceil(body.data.suggested_fee_rate_koinu_per_byte || rates.max || 50000)),
        priceUsd: Number(body.data.price_usd) || 0,
      };
    } catch {
      return { slow: 1000, normal: 10000, fast: 50000, priceUsd: 0 };
    }
  }

  async function broadcast(config, raw) {
    const which = config.broadcast === 'same' ? config.preset : config.broadcast;
    if (which === 'core') return rpcBroadcast(config.coreUrl, config.coreUser, config.corePassword, raw);
    if (which === 'dogego') return rpcBroadcast(config.dogegoUrl, config.dogegoUser, config.dogegoPassword, raw);
    if (which === 'memetracker') return memeTrackerBroadcast(config, raw);
    if (which === 'blockcypher') return blockcypherBroadcast(config, raw);
    if (which === 'sochain') return blockchairBroadcast(raw);
    try {
      return await blockchairBroadcast(raw);
    } catch (error) {
      try {
        return await blockcypherBroadcast(config, raw);
      } catch {
        throw error;
      }
    }
  }

  async function verifyInputs(config, inputs) {
    if (config.preset === 'core' || config.preset === 'dogego' || config.preset === 'memetracker') return;
    for (const input of inputs) {
      const output = await lookupOutput(input.txid, input.vout);
      if (output.address !== input.address || output.value !== input.value) {
        throw new Error('A second explorer disagreed about a coin that would be spent. Nothing was sent.');
      }
    }
  }

  async function lookupOutput(txid, vout) {
    try {
      const body = await getJson(`https://dogechain.com/api/v3/tx/${txid}`);
      const output = (body.data?.transaction?.outputs || []).find((item) => Number(item.index) === Number(vout));
      if (!output) throw new Error('missing');
      return { address: output.address, value: window.DogeChain.dogeToKoinu(output.value, true) };
    } catch {
      const body = await getJson(`https://api.blockcypher.com/v1/doge/main/txs/${txid}`);
      const output = (body.outputs || [])[vout];
      if (!output) throw new Error('Could not double-check a coin before signing. Nothing was sent.');
      return { address: (output.addresses || [])[0], value: BigInt(output.value) };
    }
  }

  async function testConnection(config) {
    if (config.preset === 'core') {
      const height = await rpc(config.coreUrl, config.coreUser, config.corePassword, 'getblockcount', [], 20000);
      return `Dogecoin Core answered. Block height ${height}.`;
    }
    if (config.preset === 'dogego') {
      const height = await rpc(config.dogegoUrl, config.dogegoUser, config.dogegoPassword, 'getblockcount', [], 20000);
      return `DogeGo answered. Block height ${height}.`;
    }
    if (config.preset === 'memetracker') {
      const text = await getText(`${nodeBase(config.memetrackerUrl)}/getChaintip`);
      const height = (text.match(/(\d[\d,]*)/) || [])[1];
      return height ? `MemeTracker answered. Chain tip ${height}.` : 'MemeTracker answered.';
    }
    if (config.preset === 'sochain') {
      if (!config.sochainKey) throw new Error('SoChain needs an API key.');
      await getJson('https://chain.so/api/v3/network_info/DOGE', { headers: { 'API-KEY': config.sochainKey } });
      return 'SoChain answered.';
    }
    if (config.preset === 'blockcypher') {
      await getJson(withToken('https://api.blockcypher.com/v1/doge/main', config.blockcypherToken));
      return 'BlockCypher answered.';
    }
    if (config.preset === 'dogechain') {
      const body = await getJson('https://dogechain.com/api/v3/network');
      const height = body.data?.info?.block_count;
      return height ? `Dogechain answered. Block height ${height}.` : 'Dogechain answered.';
    }
    await getJson('https://dogechain.com/api/v3/network');
    await getJson('https://api.blockchair.com/dogecoin/stats');
    return 'Dogechain and Blockchair answered.';
  }

  async function blockchairInspect(addresses) {
    const url = `https://api.blockchair.com/dogecoin/dashboards/addresses/${addresses.map(encodeURIComponent).join(',')}?limit=1`;
    let body;
    try {
      body = await getJson(url);
    } catch (error) {
      if (addresses.length === 1 && /not found|unknown address|404/i.test(error.message || '')) {
        return { [addresses[0]]: { used: false, utxos: [] } };
      }
      if (addresses.length < 2) throw error;
      const out = {};
      for (const address of addresses) Object.assign(out, await blockchairInspect([address]));
      return out;
    }
    if (body.context?.error) throw new Error(body.context.error);
    const out = {};
    for (const address of addresses) {
      const row = body.data?.[address];
      if (!row) {
        out[address] = { used: false, utxos: [] };
        continue;
      }
      const utxos = (row.utxo || []).map((coin) => ({
        txid: coin.transaction_hash,
        vout: coin.index,
        value: asKoinu(coin.value),
        confirmations: coin.block_id ? 1 : 0,
        address,
      }));
      out[address] = { used: Number(row.address?.transaction_count) > 0 || utxos.length > 0, utxos };
    }
    return out;
  }

  async function blockcypherInspect(config, addresses) {
    const out = {};
    for (const address of addresses) {
      const body = await getJson(withToken(`https://api.blockcypher.com/v1/doge/main/addrs/${address}?unspentOnly=true&limit=200`, config.blockcypherToken));
      const utxos = (body.txrefs || []).filter((coin) => coin.tx_output_n >= 0 && coin.spent !== true).map((coin) => ({
        txid: coin.tx_hash,
        vout: coin.tx_output_n,
        value: asKoinu(coin.value),
        confirmations: Number(coin.confirmations) || 0,
        address,
      }));
      out[address] = { used: Number(body.n_tx) > 0 || utxos.length > 0, utxos };
    }
    return out;
  }

  async function sochainInspect(config, addresses) {
    if (!config.sochainKey) throw new Error('Add a SoChain API key in settings.');
    const out = {};
    for (const address of addresses) {
      const body = await getJson(`https://chain.so/api/v3/unspent_outputs/DOGE/${address}`, { headers: { 'API-KEY': config.sochainKey } });
      const utxos = (body.data?.outputs || []).map((coin) => ({
        txid: coin.hash,
        vout: Number(coin.index),
        value: window.DogeChain.dogeToKoinu(coin.value, true),
        confirmations: coin.block == null ? 0 : 1,
        address,
        script: coin.script,
      }));
      out[address] = { used: utxos.length > 0, utxos };
    }
    return out;
  }

  async function memeTrackerInspect(config, addresses) {
    const base = nodeBase(config.memetrackerUrl);
    const [utxoText, spentText] = await Promise.all([
      getText(`${base}/getUTXOs`),
      getText(`${base}/getTransactions`).catch(() => ''),
    ]);
    const wanted = new Set(addresses);
    const out = Object.fromEntries(addresses.map((address) => [address, { used: false, utxos: [] }]));
    for (const coin of parseSpvRecords(spentText)) {
      if (wanted.has(coin.address)) out[coin.address].used = true;
    }
    for (const coin of parseSpvRecords(utxoText)) {
      if (!wanted.has(coin.address) || coin.spendable === '0') continue;
      out[coin.address].used = true;
      out[coin.address].utxos.push({
        txid: coin.txid,
        vout: Number(coin.vout),
        value: window.DogeChain.dogeToKoinu(coin.amount, true),
        confirmations: Number(coin.confirmations) || 0,
        address: coin.address,
      });
    }
    return out;
  }

  async function rpcInspect(url, user, password, addresses) {
    const descriptors = addresses.map((address) => `addr(${address})`);
    const result = await rpc(url, user, password, 'scantxoutset', ['start', descriptors], 120000);
    if (result && result.success === false) throw new Error('The node could not scan coins. Try again in a moment.');
    const out = Object.fromEntries(addresses.map((address) => [address, { used: false, utxos: [] }]));
    for (const coin of result?.unspents || []) {
      const address = addressFromDesc(coin.desc, addresses);
      if (!address) continue;
      out[address].used = true;
      out[address].utxos.push({
        txid: coin.txid,
        vout: Number(coin.vout),
        value: window.DogeChain.dogeToKoinu(Number(coin.amount).toFixed(8), true),
        confirmations: coin.height ? 1 : 0,
        address,
        script: coin.scriptPubKey,
      });
    }
    return out;
  }

  function dogeAmount(value) {
    const text = String(value ?? '0').trim();
    if (!text) return 0n;
    const negative = text.startsWith('-');
    const koinu = window.DogeChain.dogeToKoinu(negative ? text.slice(1) : text, true);
    return negative ? -koinu : koinu;
  }

  async function dogechainAddress(address, page) {
    const body = await getJson(`https://dogechain.com/api/v3/address/${address}?page=${page}`);
    if (body.status === 'fail') throw new Error(body.data?.error_message || 'Dogechain could not read that address.');
    return body.data || {};
  }

  async function dogechainInspect(addresses) {
    const out = {};
    for (const address of addresses) {
      let data;
      try {
        data = await dogechainAddress(address, 1);
      } catch (error) {
        if (/not found|404/i.test(error.message || '')) {
          out[address] = { used: false, utxos: [] };
          continue;
        }
        throw error;
      }
      const summary = data.summary || {};
      const target = dogeAmount(summary.confirmed_balance) + dogeAmount(summary.unconfirmed_balance);
      const utxos = target > 0n ? await dogechainUnspent(address, data, target) : [];
      out[address] = { used: Number(summary.txs_total) > 0 || utxos.length > 0, utxos };
    }
    return out;
  }

  async function dogechainUnspent(address, firstPage, target) {
    const utxos = [];
    let collected = 0n;
    let data = firstPage;
    for (let page = 1; page <= 8 && collected < target; page += 1) {
      if (page > 1) data = await dogechainAddress(address, page);
      const txs = data.transactions || [];
      for (const tx of txs) {
        if (collected >= target) break;
        if (dogeAmount(tx.value_received) <= 0n) continue;
        const body = await getJson(`https://dogechain.com/api/v3/tx/${tx.hash}`);
        if (body.status === 'fail') throw new Error(body.data?.error_message || 'Dogechain could not read a transaction.');
        for (const output of body.data?.transaction?.outputs || []) {
          if (output.address !== address || output.spent) continue;
          const value = dogeAmount(output.value);
          if (value <= 0n) continue;
          utxos.push({
            txid: tx.hash,
            vout: Number(output.index),
            value,
            confirmations: tx.block == null ? 0 : 1,
            address,
          });
          collected += value;
        }
      }
      if (txs.length < 10) break;
    }
    if (collected < target) throw new Error('Dogechain reported a balance, but not every unspent coin was listed. Try again in a moment.');
    return utxos;
  }

  async function dogechainHistory(address, pages = 1) {
    const rows = [];
    for (let page = 1; page <= pages; page += 1) {
      const data = await dogechainAddress(address, page);
      const txs = data.transactions || [];
      rows.push(...txs.map((tx) => ({
        txid: tx.hash,
        time: Number(tx.time) || 0,
        change: tx.balance_change,
        address,
      })));
      if (txs.length < 10) break;
    }
    return rows;
  }

  async function memeTrackerHistory(config, addresses) {
    const text = await getText(`${nodeBase(config.memetrackerUrl)}/getTransactions`).catch(() => '');
    const wanted = new Set(addresses);
    return dedupeHistory(parseSpvRecords(text).filter((row) => wanted.has(row.address)).map((row) => ({
      txid: row.txid,
      time: 0,
      change: row.amount ? `${row.amount} DOGE` : '',
      address: row.address,
    })));
  }

  async function blockchairBroadcast(raw) {
    const body = await getJson('https://api.blockchair.com/dogecoin/push/transaction', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: `data=${encodeURIComponent(raw)}`,
    });
    const txid = body.data?.transaction_hash;
    if (!txid) throw new Error(body.context?.error || 'The network did not accept the transaction.');
    return txid;
  }

  async function blockcypherBroadcast(config, raw) {
    const body = await getJson(withToken('https://api.blockcypher.com/v1/doge/main/txs/push', config.blockcypherToken), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ tx: raw }),
    });
    const txid = body.tx?.hash;
    if (!txid) throw new Error(body.error || 'The network did not accept the transaction.');
    return txid;
  }

  async function memeTrackerBroadcast(config, raw) {
    const text = await getText(`${nodeBase(config.memetrackerUrl)}/sendtx`, {
      method: 'POST',
      headers: { 'Content-Type': 'text/plain' },
      body: raw,
    });
    const txid = (String(text).match(/[0-9a-f]{64}/i) || [])[0];
    if (!txid) throw new Error('MemeTracker did not accept the payment. In Settings, send it through Public explorers, Dogecoin Core, or DogeGo.');
    return txid;
  }

  async function rpcBroadcast(url, user, password, raw) {
    const txid = await rpc(url, user, password, 'sendrawtransaction', [raw], 30000);
    if (!/^[0-9a-f]{64}$/i.test(String(txid))) throw new Error('The node did not return a transaction id.');
    return txid;
  }

  async function rpc(url, user, password, method, params, timeout) {
    if (!url) throw new Error('Enter the node address in settings.');
    const headers = { 'Content-Type': 'application/json' };
    if (user || password) headers.Authorization = `Basic ${btoa(`${user}:${password}`)}`;
    let body;
    try {
      body = await getJson(url, {
        method: 'POST',
        headers,
        body: JSON.stringify({ jsonrpc: '1.0', id: 'doge-pocket', method, params }),
      }, timeout);
    } catch (error) {
      if (error instanceof TypeError || /Failed to fetch|NetworkError|Load failed/i.test(error.message || '')) {
        throw new Error('The browser could not reach that node. It needs HTTPS and a CORS header that allows this page. An https wallet cannot call http://127.0.0.1.');
      }
      throw error;
    }
    if (body.error) throw new Error(body.error.message || 'The node returned an error.');
    return body.result;
  }

  async function getJson(url, options = {}, timeout = 20000, extraHeaders) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeout);
    try {
      const response = await fetch(url, { ...options, headers: { Accept: 'application/json', ...extraHeaders, ...options.headers }, signal: controller.signal });
      const text = await response.text();
      let body = {};
      if (text) {
        try { body = JSON.parse(text); } catch { body = { raw: text }; }
      }
      if (!response.ok) {
        const message = body.error || body.context?.error || body.data?.error_message || body.raw || `Request failed (${response.status})`;
        throw new Error(typeof message === 'string' ? message : 'Request failed.');
      }
      return body;
    } catch (error) {
      if (error.name === 'AbortError') throw new Error('The network took too long to answer.');
      throw error;
    } finally {
      clearTimeout(timer);
    }
  }

  async function getText(url, options = {}, timeout = 20000) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeout);
    try {
      const response = await fetch(url, { ...options, signal: controller.signal });
      const text = await response.text();
      if (!response.ok) throw new Error(text.trim().slice(0, 180) || `Request failed (${response.status})`);
      return text;
    } catch (error) {
      if (error.name === 'AbortError') throw new Error('The network took too long to answer.');
      if (error instanceof TypeError || /Failed to fetch|NetworkError|Load failed/i.test(error.message || '')) {
        throw new Error('The browser could not reach MemeTracker. It needs HTTPS and a CORS header that allows this page. An https wallet cannot call http://127.0.0.1.');
      }
      throw error;
    } finally {
      clearTimeout(timer);
    }
  }

  function nodeBase(url) {
    if (!url || !/^https?:\/\//i.test(String(url).trim())) throw new Error('Enter the MemeTracker address, starting with https://');
    return String(url).trim().replace(/\/$/, '');
  }

  function parseSpvRecords(text) {
    const records = [];
    let current = null;
    for (const line of String(text || '').split(/\r?\n/)) {
      const match = line.match(/^\s*([A-Za-z][A-Za-z _]*):\s*(.+?)\s*$/);
      if (!match) continue;
      const key = match[1].trim().toLowerCase().replace(/\s+/g, '_');
      if (key === 'txid') {
        current = { txid: match[2].trim() };
        records.push(current);
      } else if (current) current[key] = match[2].trim();
    }
    return records;
  }

  function withToken(url, token) {
    if (!token) return url;
    return `${url}${url.includes('?') ? '&' : '?'}token=${encodeURIComponent(token)}`;
  }

  function asKoinu(value) {
    if (!Number.isSafeInteger(value)) throw new Error('A coin is too large for the public explorer. Use your own node for this wallet.');
    return BigInt(value);
  }

  function addressFromDesc(desc, addresses) {
    const match = String(desc || '').match(/addr\(([^)]+)\)/);
    if (match && addresses.includes(match[1])) return match[1];
    return addresses.find((address) => String(desc || '').includes(address)) || null;
  }

  function dedupeHistory(rows) {
    const seen = new Set();
    return rows.filter((row) => {
      if (!row.txid || seen.has(row.txid)) return false;
      seen.add(row.txid);
      return true;
    }).sort((a, b) => b.time - a.time).slice(0, 30);
  }

  function unique(addresses) {
    return [...new Set((addresses || []).filter((address) => window.DogeChain.isAddress(address)))];
  }

  function vmBase(url, kind) {
    const text = String(url || '').trim();
    const name = kind === 'broadcast' ? 'DogecoinVM send address' : 'DogecoinVM explorer';
    if (!text) throw new Error(`Enter a ${name}.`);
    if (!/^https?:\/\//i.test(text)) throw new Error(`The ${name} must start with http:// or https://.`);
    return text.replace(/\/$/, '');
  }

  function vmKoinu(value) {
    const text = String(value ?? '0').trim();
    if (/^\d+$/.test(text)) return BigInt(text);
    if (!/^\d+(\.\d{1,8})?$/.test(text)) throw new Error('The DogecoinVM explorer returned an amount this wallet cannot read.');
    const [whole, fraction = ''] = text.split('.');
    return BigInt(whole || '0') * 100000000n + BigInt(fraction.padEnd(8, '0') || '0');
  }

  async function vmCall(url, options, kind) {
    try {
      return await getJson(url, options);
    } catch (error) {
      if (error instanceof TypeError || /Failed to fetch|NetworkError|Load failed/i.test(error.message || '')) {
        const which = kind === 'broadcast' ? 'send address' : 'explorer';
        throw new Error(`The browser could not read the DogecoinVM ${which}. It needs HTTPS and a CORS header that allows this page. Host your own, or change it in Settings.`);
      }
      throw error;
    }
  }

  async function vmInspect(base, addresses) {
    const out = {};
    for (const address of unique(addresses)) {
      let body;
      try {
        body = await vmCall(`${base}/api/address/${encodeURIComponent(address)}`, undefined, 'explorer');
      } catch (error) {
        if (/404|not found/i.test(error.message || '')) {
          out[address] = { used: false, utxos: [] };
          continue;
        }
        throw error;
      }
      const utxos = (body.utxos || []).map((coin) => ({
        txid: String(coin.txid || ''),
        vout: Number(coin.vout),
        value: vmKoinu(coin.value),
        script: coin.script || '',
        confirmations: Number(coin.confirmations) || 0,
      }));
      out[address] = { used: utxos.length > 0 || (body.history || []).length > 0, utxos };
    }
    return out;
  }

  async function vmHistory(base, addresses) {
    const rows = [];
    let misses = 0;
    const list = unique(addresses).slice(0, 8);
    for (const address of list) {
      try {
        const body = await vmCall(`${base}/api/address/${encodeURIComponent(address)}`, undefined, 'explorer');
        for (const item of body.history || []) rows.push({ txid: item.txid, time: Number(item.time) || 0, change: item.net || '' });
      } catch {
        misses += 1;
      }
    }
    if (list.length && misses === list.length) throw new Error('DogecoinVM did not return activity.');
    return dedupeHistory(rows);
  }

  async function vmBroadcast(base, raw) {
    const body = await vmCall(`${base}/api/tx`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ hex: raw }),
    }, 'broadcast');
    const txid = body.txid || body.txId;
    if (!/^[0-9a-fA-F]{64}$/.test(String(txid || ''))) throw new Error('The DogecoinVM send address did not accept the payment.');
    return txid;
  }

  async function vmTest(base, kind) {
    const body = await vmCall(`${base}/api/info`, undefined, kind);
    const name = kind === 'broadcast' ? 'send address' : 'explorer';
    return `DogecoinVM ${name} answered${body.dogecoinvmNetwork ? ` (${body.dogecoinvmNetwork})` : ''}.`;
  }

  window.DogeNet = { PRESETS, defaultSettings, createProvider, createVmProvider };
})();
