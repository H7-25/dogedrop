import assert from 'node:assert/strict';
import { test } from 'node:test';
import { sha256 } from '@noble/hashes/sha2.js';
import { ripemd160 } from '@noble/hashes/legacy.js';
import { base58check } from '@scure/base';
import * as secp from '@noble/secp256k1';
import { hmac } from '@noble/hashes/hmac.js';
import { Transaction } from '@scure/btc-signer';
import { hex } from '@scure/base';
import {
  accountFromMnemonic,
  createMnemonic,
  decryptSecret,
  deriveAddress,
  DOGE,
  dogeToKoinu,
  encryptSecret,
  formatDoge,
  isAddress,
  isMnemonic,
  parsePayment,
  paymentUri,
  privateKeyForPath,
  scriptForAddress,
  signMessage,
  signPayment,
} from '../src/chain.mjs';

secp.hashes.sha256 = sha256;
secp.hashes.hmacSha256 = (key, message) => hmac(sha256, key, message);

const PHRASE = 'abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon about';

test('recovery phrase validates and a new phrase has 12 words', () => {
  assert.equal(isMnemonic(PHRASE), true);
  assert.equal(isMnemonic('abandon abandon abandon'), false);
  assert.equal(createMnemonic().split(' ').length, 12);
});

test('HD receive address matches an independent hash160', () => {
  const { xpub } = accountFromMnemonic(PHRASE);
  const derived = deriveAddress(xpub, 0, 0);
  const change = deriveAddress(xpub, 1, 0);
  const privateKey = privateKeyForPath(PHRASE, '', 0, 0);
  try {
    const publicKey = secp.getPublicKey(privateKey, true);
    const hash160 = ripemd160(sha256(publicKey));
    const manual = base58check(sha256).encode(new Uint8Array([0x1e, ...hash160]));
    assert.equal(derived.address, manual);
    assert.equal(derived.address.startsWith('D'), true);
    assert.notEqual(derived.address, change.address);
    assert.equal(scriptForAddress(derived.address), `76a914${hex.encode(hash160)}88ac`);
    assert.equal(isAddress(derived.address), true);
    assert.equal(isAddress('not-an-address'), false);
  } finally {
    privateKey.fill(0);
  }
});

test('signed transaction pays the recipient and sends change to the change address', () => {
  const { xpub } = accountFromMnemonic(PHRASE);
  const receive = deriveAddress(xpub, 0, 0);
  const change = deriveAddress(xpub, 1, 0);
  const privateKey = privateKeyForPath(PHRASE, '', 0, 0);
  try {
    const signed = signPayment({
      inputs: [{
        txid: '11'.repeat(32),
        vout: 0,
        value: 200000000n,
        address: receive.address,
        script: scriptForAddress(receive.address),
      }],
      outputs: [
        { address: change.address, value: 50000000n },
        { address: receive.address, value: 140000000n },
      ],
      privateKeys: { [receive.address]: privateKey },
    });
    assert.match(signed.txid, /^[0-9a-f]{64}$/);
    const tx = Transaction.fromRaw(hex.decode(signed.hex), { allowUnknownOutputs: true });
    assert.equal(tx.inputsLength, 1);
    assert.equal(tx.outputsLength, 2);
    assert.equal(tx.getOutput(0).amount, 50000000n);
    assert.equal(tx.getOutputAddress(0, DOGE), change.address);
    assert.equal(Transaction.fromRaw(hex.decode(signed.hex), { allowUnknownOutputs: true }).id, signed.txid);
  } finally {
    privateKey.fill(0);
  }
});

test('message signature is 65-byte compressed Dogecoin format', () => {
  const privateKey = privateKeyForPath(PHRASE, '', 0, 0);
  try {
    const signature = signMessage(privateKey, 'much sign');
    const bytes = Uint8Array.from(atob(signature), (char) => char.charCodeAt(0));
    assert.equal(bytes.length, 65);
    assert.ok(bytes[0] === 31 || bytes[0] === 32);
  } finally {
    privateKey.fill(0);
  }
});

test('password encryption round-trips and rejects the wrong password', async () => {
  const vault = await encryptSecret({ mnemonic: PHRASE, passphrase: '' }, 'correct horse');
  const opened = await decryptSecret(vault, 'correct horse');
  assert.equal(opened.mnemonic, PHRASE);
  await assert.rejects(() => decryptSecret(vault, 'wrong password'), /Wrong password/);
});

test('DIP 21 payment links choose the chain and the amount', () => {
  const address = deriveAddress(accountFromMnemonic(PHRASE).xpub, 0, 0).address;
  assert.deepEqual(parsePayment(address), { chain: '', address, amount: '', label: '', message: '' });
  assert.deepEqual(parsePayment(`dogecoin:${address}?amount=123&label=Shop&message=Order%20123`), {
    chain: 'dogecoin', address, amount: '123', label: 'Shop', message: 'Order 123',
  });
  assert.equal(parsePayment(`DogecoinVM:${address}?amount=1.5`).chain, 'dogecoinvm');
  assert.equal(paymentUri('dogecoinvm', address, '1.5'), `dogecoinvm:${address}?amount=1.5`);
  assert.throws(() => parsePayment(`dogecoin://${address}`), /does not use/);
  assert.throws(() => parsePayment(`dogecoin:${address}?amount=50,000.00`), /amount/);
  assert.throws(() => parsePayment(`dogecoinvm:${address}?req-bridge=1`), /required part/);
  assert.throws(() => parsePayment('bitcoin:not-doge'), /dogecoin:/);
});

test('DOGE amounts use exact koinu', () => {
  assert.equal(dogeToKoinu('1.5'), 150000000n);
  assert.equal(dogeToKoinu('0.00000001'), 1n);
  assert.equal(formatDoge(150000000n), '1.50');
  assert.throws(() => dogeToKoinu('1.123456789'));
});
