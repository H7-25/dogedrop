import { hmac } from '@noble/hashes/hmac.js';
import { sha256 } from '@noble/hashes/sha2.js';
import * as secp from '@noble/secp256k1';
import { HDKey } from '@scure/bip32';
import { generateMnemonic, mnemonicToSeedSync, validateMnemonic } from '@scure/bip39';
import { wordlist } from '@scure/bip39/wordlists/english.js';
import { hex } from '@scure/base';
import { Address, p2pkh, Transaction, WIF } from '@scure/btc-signer';
import { qrcode } from 'qrcode-generator';

secp.hashes.sha256 = sha256;
secp.hashes.hmacSha256 = (key, message) => hmac(sha256, key, message);

export const DOGE = Object.freeze({
  bech32: 'doge',
  pubKeyHash: 0x1e,
  scriptHash: 0x16,
  wif: 0x9e,
});

const BIP32 = Object.freeze({
  private: 0x02fac398,
  public: 0x02facafd,
});

const ACCOUNT_PATH = "m/44'/3'/0'";
const KOINU = 100000000n;
const PBKDF2_ITERATIONS = 250000;

export function createMnemonic() {
  return generateMnemonic(wordlist, 128);
}

export function normalizeMnemonic(phrase) {
  return String(phrase || '').trim().toLowerCase().split(/\s+/).filter(Boolean).join(' ');
}

export function isMnemonic(phrase) {
  return validateMnemonic(normalizeMnemonic(phrase), wordlist);
}

export function accountFromMnemonic(phrase, passphrase = '') {
  const mnemonic = normalizeMnemonic(phrase);
  if (!validateMnemonic(mnemonic, wordlist)) throw new Error('Those words are not a valid recovery phrase.');
  const seed = mnemonicToSeedSync(mnemonic, passphrase);
  try {
    const master = HDKey.fromMasterSeed(seed, BIP32);
    const account = master.derive(ACCOUNT_PATH);
    const xpub = account.publicExtendedKey;
    account.wipePrivateData();
    master.wipePrivateData();
    return { type: 'hd', mnemonic, passphrase, xpub };
  } finally {
    seed.fill(0);
  }
}

export function accountFromWif(wif) {
  const privateKey = WIF(DOGE).decode(String(wif || '').trim());
  try {
    const address = addressFromPrivateKey(privateKey);
    return { type: 'single', wif: WIF(DOGE).encode(privateKey), address, publicKey: hex.encode(secp.getPublicKey(privateKey, true)) };
  } finally {
    privateKey.fill(0);
  }
}

export function deriveAddress(xpub, chain, index) {
  const node = HDKey.fromExtendedKey(xpub, BIP32).derive(`m/${Number(chain)}/${Number(index) >>> 0}`);
  const payment = p2pkh(node.publicKey, DOGE);
  return { chain: Number(chain), index: Number(index) >>> 0, address: payment.address, publicKey: hex.encode(node.publicKey) };
}

export function privateKeyForPath(phrase, passphrase, chain, index) {
  const seed = mnemonicToSeedSync(normalizeMnemonic(phrase), passphrase || '');
  try {
    const master = HDKey.fromMasterSeed(seed, BIP32);
    const child = master.derive(`${ACCOUNT_PATH}/${Number(chain)}/${Number(index) >>> 0}`);
    const privateKey = new Uint8Array(child.privateKey);
    child.wipePrivateData();
    master.wipePrivateData();
    return privateKey;
  } finally {
    seed.fill(0);
  }
}

export function privateKeyFromWif(wif) {
  return WIF(DOGE).decode(String(wif).trim());
}

export function addressFromPrivateKey(privateKey) {
  return p2pkh(secp.getPublicKey(privateKey, true), DOGE).address;
}

export function isAddress(address) {
  try {
    const decoded = Address(DOGE).decode(String(address || '').trim());
    return decoded?.type === 'pkh';
  } catch {
    return false;
  }
}

export function scriptForAddress(address) {
  const decoded = Address(DOGE).decode(String(address || '').trim());
  if (!decoded || decoded.type !== 'pkh' || decoded.hash?.length !== 20) {
    throw new Error('Enter a Dogecoin address that starts with D.');
  }
  const script = new Uint8Array(25);
  script[0] = 0x76;
  script[1] = 0xa9;
  script[2] = 0x14;
  script.set(decoded.hash, 3);
  script[23] = 0x88;
  script[24] = 0xac;
  return hex.encode(script);
}

export function dogeToKoinu(amount, allowZero = false) {
  const text = String(amount ?? '').trim();
  if (!/^\d+(\.\d{0,8})?$/.test(text)) throw new Error('Enter a DOGE amount like 12.5');
  const [whole, fraction = ''] = text.split('.');
  const koinu = BigInt(whole || '0') * KOINU + BigInt(fraction.padEnd(8, '0') || '0');
  if (!allowZero && koinu <= 0n) throw new Error('Enter an amount greater than zero.');
  return koinu;
}

export function formatDoge(koinu, digits = 8) {
  const value = BigInt(koinu);
  const negative = value < 0n;
  const abs = negative ? -value : value;
  const whole = abs / KOINU;
  const fraction = (abs % KOINU).toString().padStart(8, '0').slice(0, digits).replace(/0+$/, '');
  const frac = fraction.length < 2 ? (abs % KOINU).toString().padStart(8, '0').slice(0, 2) : fraction;
  return `${negative ? '-' : ''}${whole}.${frac}`;
}

export function feeFor(inputCount, outputCount, koinuPerByte) {
  const size = 10n + BigInt(inputCount) * 148n + BigInt(outputCount) * 34n + 2n;
  return size * BigInt(koinuPerByte);
}

export function selectCoins(utxos, amount, koinuPerByte) {
  const spendable = [...utxos].filter((coin) => coin.value > 0n).sort((a, b) => (a.value > b.value ? -1 : 1));
  const chosen = [];
  let total = 0n;
  for (const coin of spendable) {
    chosen.push(coin);
    total += coin.value;
    const withChange = feeFor(chosen.length, 2, koinuPerByte);
    if (total < amount + withChange) continue;
    const change = total - amount - withChange;
    if (change === 0n || change >= 1000000n) {
      return { inputs: chosen, fee: withChange, change, sendAll: false };
    }
    const noChange = feeFor(chosen.length, 1, koinuPerByte);
    if (total >= amount + noChange) {
      return { inputs: chosen, fee: total - amount, change: 0n, sendAll: false };
    }
  }
  throw new Error('Not enough coins for that amount and fee.');
}

export function selectAll(utxos, koinuPerByte) {
  const inputs = utxos.filter((coin) => coin.value > 0n);
  if (!inputs.length) throw new Error('This wallet has no coins to spend yet.');
  const total = inputs.reduce((sum, coin) => sum + coin.value, 0n);
  const fee = feeFor(inputs.length, 1, koinuPerByte);
  if (total <= fee) throw new Error('The balance is smaller than the network fee.');
  return { inputs, fee, change: 0n, amount: total - fee, sendAll: true };
}

export function signPayment({ inputs, outputs, privateKeys }) {
  const tx = new Transaction({ allowLegacyWitnessUtxo: true });
  inputs.forEach((input) => {
    tx.addInput({
      txid: hex.decode(input.txid),
      index: input.vout,
      witnessUtxo: {
        amount: input.value,
        script: hex.decode(input.script || scriptForAddress(input.address)),
      },
      sighashType: 1,
    });
  });
  outputs.forEach((output) => {
    if (output.value <= 0n) throw new Error('A payment output must be greater than zero.');
    tx.addOutputAddress(output.address, output.value, DOGE);
  });
  inputs.forEach((input, index) => {
    const privateKey = privateKeys[input.address];
    if (!privateKey) throw new Error('Missing the key for an input.');
    if (!tx.signIdx(privateKey, index)) throw new Error('Could not sign one of the coins.');
    tx.finalizeIdx(index);
  });
  const raw = tx.extract();
  const signed = Transaction.fromRaw(raw, { allowUnknownOutputs: true });
  return { hex: hex.encode(raw), txid: signed.id };
}

export function signMessage(privateKey, message) {
  const prefix = new TextEncoder().encode('Dogecoin Signed Message:\n');
  const body = new TextEncoder().encode(String(message));
  const payload = concat(compactSize(prefix.length), prefix, compactSize(body.length), body);
  const digest = sha256(sha256(payload));
  const signature = secp.sign(digest, privateKey, { prehash: false, format: 'recovered' });
  const compact = new Uint8Array(65);
  compact[0] = 31 + signature[0];
  compact.set(signature.subarray(1), 1);
  return bytesToBase64(compact);
}

export async function encryptSecret(secret, password) {
  if (!password || password.length < 8) throw new Error('Use a password of at least 8 characters.');
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const key = await deriveKey(password, salt);
  const plaintext = new TextEncoder().encode(JSON.stringify(secret));
  try {
    const ciphertext = new Uint8Array(await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, key, plaintext));
    return {
      v: 1,
      kdf: 'pbkdf2-sha256',
      iterations: PBKDF2_ITERATIONS,
      salt: bytesToBase64(salt),
      iv: bytesToBase64(iv),
      ct: bytesToBase64(ciphertext),
    };
  } finally {
    plaintext.fill(0);
  }
}

export async function decryptSecret(vault, password) {
  if (!password) throw new Error('Enter your password.');
  if (!vault || vault.v !== 1 || !vault.salt || !vault.iv || !vault.ct) throw new Error('This backup file is not a wallet this app understands.');
  const salt = base64ToBytes(vault.salt);
  const iv = base64ToBytes(vault.iv);
  const ciphertext = base64ToBytes(vault.ct);
  const key = await deriveKey(password, salt, vault.iterations || PBKDF2_ITERATIONS);
  try {
    const plaintext = await crypto.subtle.decrypt({ name: 'AES-GCM', iv }, key, ciphertext);
    return JSON.parse(new TextDecoder().decode(plaintext));
  } catch {
    throw new Error('Wrong password, or the wallet file is damaged.');
  }
}

export function parsePayment(input) {
  const text = String(input || '').trim();
  if (!text) throw new Error('Enter an address or a payment link.');
  const schemeMatch = text.match(/^([A-Za-z][A-Za-z0-9+.-]*):(.*)$/);
  if (!schemeMatch) {
    if (!isAddress(text)) throw new Error('Enter a Dogecoin address that starts with D.');
    return { chain: '', address: text, amount: '', label: '', message: '' };
  }
  const scheme = schemeMatch[1].toLowerCase();
  if (scheme !== 'dogecoin' && scheme !== 'dogecoinvm') throw new Error('Use a dogecoin: or dogecoinvm: payment link.');
  const rest = schemeMatch[2];
  if (rest.startsWith('//')) throw new Error('A payment link does not use //. The form is dogecoin:D... or dogecoinvm:D...');
  const split = rest.indexOf('?');
  let address = '';
  try { address = decodeURIComponent(split < 0 ? rest : rest.slice(0, split)); } catch { throw new Error('That payment link is not valid.'); }
  if (!isAddress(address)) throw new Error('That payment link does not contain a Dogecoin address.');
  const params = new URLSearchParams(split < 0 ? '' : rest.slice(split + 1));
  let amount = '';
  let label = '';
  let message = '';
  for (const [key, value] of params) {
    if (key === 'amount' || key === 'req-amount') {
      if (value && !/^\d+(\.\d{1,8})?$/.test(value)) throw new Error('The amount in the payment link must look like 1.5');
      amount = value;
    } else if (key === 'label') label = value;
    else if (key === 'message') message = value;
    else if (key.startsWith('req-')) throw new Error('This wallet does not understand a required part of that payment link.');
  }
  return { chain: scheme, address, amount, label, message };
}

export function paymentUri(chain, address, amount = '') {
  const scheme = chain === 'dogecoinvm' ? 'dogecoinvm' : 'dogecoin';
  const base = `${scheme}:${address}`;
  return amount ? `${base}?amount=${amount}` : base;
}

export function qrSvg(text) {
  const qr = qrcode(0, 'M');
  qr.addData(String(text));
  qr.make();
  return qr.createSvgTag({ cellSize: 4, margin: 1, scalable: true });
}

async function deriveKey(password, salt, iterations = PBKDF2_ITERATIONS) {
  const material = await crypto.subtle.importKey('raw', new TextEncoder().encode(password), 'PBKDF2', false, ['deriveKey']);
  return crypto.subtle.deriveKey(
    { name: 'PBKDF2', salt, iterations, hash: 'SHA-256' },
    material,
    { name: 'AES-GCM', length: 256 },
    false,
    ['encrypt', 'decrypt']
  );
}

function compactSize(length) {
  if (length < 253) return new Uint8Array([length]);
  if (length <= 0xffff) return new Uint8Array([253, length & 255, length >> 8]);
  throw new Error('Message is too long to sign.');
}

function concat(...parts) {
  const size = parts.reduce((sum, part) => sum + part.length, 0);
  const out = new Uint8Array(size);
  let offset = 0;
  for (const part of parts) {
    out.set(part, offset);
    offset += part.length;
  }
  return out;
}

function bytesToBase64(bytes) {
  let binary = '';
  for (let i = 0; i < bytes.length; i += 0x8000) binary += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(binary);
}

function base64ToBytes(value) {
  const binary = atob(value);
  const out = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) out[i] = binary.charCodeAt(i);
  return out;
}
