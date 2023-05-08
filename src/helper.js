import winston from 'winston';
import 'setimmediate';

function inHex(n, l) {
  let s = n.toString(16).toUpperCase();
  while (s.length < l) {
    s = '0' + s;
  }
  return s;
}

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

function trc(caption, data, force) {
  if ((tracing !== 0) || (force)) {
    logger.info(caption + ' : ' + data);
  }
  // console.log(caption + ": " + data);
}

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

export {inHex, signedHex, trc, plural};
