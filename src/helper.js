import winston from 'winston';
import 'setimmediate';

/**
 * Convert decimal to hexadecimal.
 *
 * @param {number} n number to convert
 * @param {number} l bit length of result
 * @return {string}
 */
function inHex(n, l = 8) {
  let s = n.toString(16).toUpperCase();
  while (s.length < l) {
    s = '0' + s;
  }
  return s;
}

/**
 * Convert decimal to signed hexadecimal.
 *
 * @param {number} n number to convert
 * @param {number} bits bit length of result
 * @param {string} symbol symbol prefix
 * @return {string}
 */
function signedHex(n, bits, symbol) {
  const digits = (bits > 8) ? 4 : 2;
  if ((n & (1 << (bits - 1))) !== 0) {
    return '-' + symbol + inHex((1 << bits) - n, digits);
  } else {
    return symbol + inHex(n, digits);
  }
}

const tracing = 1;

const logger = winston.createLogger({
  level: 'info',
  format: winston.format.json(),
  defaultMeta: {service: 'online6809assembler'},
  transports: [
    new winston.transports.Console(),
  ],
});

/**
 * Create an info level log entry.
 *
 * @param {string} caption log message
 * @param {Object} data object data to log
 * @param {boolean} force override logging flag
 */
function trc(caption, data, force= false) {
  if ((tracing !== 0) || (force)) {
    logger.info(caption + ' : ' + data);
  }
}

/**
 * Pluralise a word if needed.
 *
 * @param {string} word
 * @param {number} n
 * @param {string} wordPlural
 * @return {string}
 */
function plural(word, n, wordPlural) {
  if (n === 1) {
    return word;
  } else {
    if (wordPlural) {
      return (wordPlural);
    } else {
      return word + 's';
    }
  }
}

/**
 * Convert hex and binary to integer.
 *
 * @param {string} source
 */
function toInt(source) {
  if (source.trim() === '') {
    return 0;
  }
  let polarity = 1;
  if (source[0] === '-') {
    polarity = -1;
    source = source.substring(1)
  }
  const prefix = source[0];
  switch (prefix) {
    case '%':
      return parseInt(source.substring(1), 2) * polarity;
    case '&':
    case '$':
      return parseInt(source.substring(1), 16) * polarity;
    case '0':
      if (source.length > 1 && source[1].toUpperCase() === 'X') {
        return parseInt(source.substring(2), 16) * polarity;
      }
      return parseInt(source) * polarity;
    default:
      return parseInt(source) * polarity;
  }
}

export {inHex, signedHex, trc, plural, toInt};
