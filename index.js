const bitcoin = require('bitcoinjs-lib');
const bip39 = require('bip39');
const bip32 = require('bip32');
const dotenv = require('dotenv');
const axios = require('axios');

dotenv.config();

const MNEMONIC = process.env.WORDS || '';

let NETWORK = bitcoin.networks.bitcoin; // Use bitcoin.networks.testnet for testnet
let BLOCKSTREAM_API = 'https://blockstream.info/api';

if (process.env.MAINNET != 1) {
  NETWORK = bitcoin.networks.testnet; // Use bitcoin.networks.testnet for testnet
  BLOCKSTREAM_API = 'https://blockstream.info/testnet/api';
}

if (!bip39.validateMnemonic(MNEMONIC)) {
  throw new Error('Invalid BIP39 mnemonic in .env');
}

// Step 1: Convert mnemonic to seed
const seed = bip39.mnemonicToSeedSync(MNEMONIC);

// Step 2: Get HD wallet root from seed
const root = bip32.fromSeed(seed, NETWORK);

// Step 3: Derive child key from BIP44 path: m/44'/0'/0'/0/0
const child = root.derivePath(`m/44'/0'/0'/0/0`);

// Step 4: Generate Bitcoin address
const { address } = bitcoin.payments.p2pkh({
  pubkey: child.publicKey,
  network: NETWORK,
});

const privateKeyWIF = child.toWIF();

console.log('Addr:', address);
// console.log(':', privateKeyWIF);

// ---- Send / Receive Placeholders ----

async function getBalance(address) {
  const url = `${BLOCKSTREAM_API}/address/${address}`;
  const res = await axios.get(url);
  const funded = res.data.chain_stats.funded_txo_sum;
  const spent = res.data.chain_stats.spent_txo_sum;
  console.log(funded, '-', spent, `[${res.data.chain_stats.tx_count}]`)
  return funded - spent;
}

async function sendBTC(toAddress, amountSats) {
  console.log(`Sending ${amountSats} sats to ${toAddress}...`);
  console.log(`Creating transaction to send ${amountSats} sats to ${toAddress}...`);

  const utxosRes = await axios.get(`${BLOCKSTREAM_API}/address/${address}/utxo`);
  const utxos = utxosRes.data;

  if (!utxos.length) {
    throw new Error('No UTXOs available to send.');
  }

  const psbt = new bitcoin.Psbt({ network: NETWORK });
  let totalInput = 0;

  // Add UTXOs as inputs
  for (const utxo of utxos) {
    const txRes = await axios.get(`${BLOCKSTREAM_API}/tx/${utxo.txid}/hex`);
    const rawTxHex = txRes.data;

    psbt.addInput({
      hash: utxo.txid,
      index: utxo.vout,
      nonWitnessUtxo: Buffer.from(rawTxHex, 'hex'),
    });

    totalInput += utxo.value;
    if (totalInput >= amountSats + 1000) break; // assume fee ~1000 sats
  }

  const fee = 1000;
  const change = totalInput - amountSats - fee;

  if (change < 0) {
    throw new Error(`Insufficient balance: needed ${amountSats + fee}, have ${totalInput}`);
  }

  // Output: receiver
  psbt.addOutput({
    address: toAddress,
    value: amountSats,
  });

  // Output: change back to sender
  if (change > 0) {
    psbt.addOutput({
      address: address,
      value: change,
    });
  }

  // Sign all inputs
  for (let i = 0; i < psbt.inputCount; i++) {
    psbt.signInput(i, bitcoin.ECPair.fromWIF(privateKeyWIF, NETWORK));
    psbt.validateSignaturesOfInput(i);
  }

  psbt.finalizeAllInputs();

  const txHex = psbt.extractTransaction().toHex();

  // Broadcast the transaction
  const broadcastRes = await axios.post(`${BLOCKSTREAM_API}/tx`, txHex);

  console.log('Transaction broadcasted!');
  console.log('TXID:', broadcastRes.data);

  return broadcastRes.data;
}

// Demo usage
(async () => {
  try {
    const balance = await getBalance(address);
    console.log(`Balance: ${balance} sats`);

    // Example (you can replace with real destination address)
    // await sendBTC('destination_btc_address', 1000);
  } catch (err) {
    console.error('Error:', err.message);
  }
})();
