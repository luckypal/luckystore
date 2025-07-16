const bip39 = require('bip39');
const dotenv = require('dotenv');

dotenv.config();

function completeMnemonicWithChecksum(words11) {
  if (!Array.isArray(words11) || words11.length !== 11) {
    throw new Error('You must provide exactly 11 words.');
  }

  // Check that all words are valid BIP39 words
  const wordlist = bip39.wordlists.english;
  for (const word of words11) {
    if (!wordlist.includes(word)) {
      throw new Error(`Invalid word in list: "${word}"`);
    }
  }

  // Brute force all 2048 possible 12th words
  for (const word of wordlist) {
    const mnemonic12 = [...words11, word].join(' ');
    if (bip39.validateMnemonic(mnemonic12)) {
      return word; // Found the valid checksum word
    }
  }

  throw new Error('No valid 12th word found — input may be invalid.');
}


const MNEMONIC = process.env.WORDS || '';

// Example usage:
const elevenWords = MNEMONIC.split(' ').filter((v, index) => index < 11)

const twelfthWord = completeMnemonicWithChecksum(elevenWords);
console.log('New:', twelfthWord);

const fullMnemonic = [...elevenWords, twelfthWord].join(' ');
// console.log('Full 12-word mnemonic:', fullMnemonic);

module.exports = { completeMnemonicWithChecksum };