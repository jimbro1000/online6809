const SIbaseAddress = 0xff80;
const SIrefreshOff = 0;
const SIrefreshOn = 1;
const SIgraphicsMode = 2;
const SIkeyInterface = 3;
/* System Interface
  SIrefreshOff
    Write <any> to force OFF register refresh and display animation
  SIrefreshOn
    Write <any> to re-enable register refresh and display animation
  SIgraphicsMode
    Write <number of colours> to select graphics mode (2, 4, 16 allowed values)
  SIkeyInterface
    Write 0 then read an ASCII code (if<128),
    write 255 to clear the keyboard buffer
*/

const Defaults = {org: 0x4000, lineBytes: 0x20};

const keyCodesList = {
  '0': 0,
  '1': 1,
  '2': 2,
  '3': 3,
  '4': 4,
  '5': 5,
  '6': 6,
  '7': 7,
  '8': 8,
  '9': 9,
  'A': 10,
  'B': 11,
  'C': 12,
  'D': 13,
  'E': 14,
  'F': 15,
};

const blockChars = [
  '&nbsp;',
  '&#x2597;',
  '&#x2596;',
  '&#x2584;',
  '&#x259D;',
  '&#x2590;',
  '&#x259E;',
  '&#x259F;',
  '&#x2598;',
  '&#x259A;',
  '&#x258C;',
  '&#x2599;',
  '&#x2580;',
  '&#x259C;',
  '&#x259B;',
  '&#x2588;',
  '&nbsp;'];

const blockClasses = [
  'txtGGreen',
  'txtGYellow',
  'txtGBlue',
  'txtGRed',
  'txtGWhite',
  'txtGCyan',
  'txtGMagenta',
  'txtGOrange'];

const modes = {
  simple: 0x01,
  bits8: 0x00,
  bits16: 0x02,
  immediate: 0x04,
  direct: 0x08,
  indexed: 0x10,
  extended: 0x20,
  pcr: 0x40,
  register: 0x80,
  pager: 0x100,
  pair: 0x02,
  pseudo: 0x8000,
};

const modesText = {
  0x04: 'Immediate',
  0x08: 'Direct',
  0x10: 'Indexed',
  0x20: 'Extended',
  0x40: 'PCR',
  0x80: 'Register',
};

const pairRegsToText = {
  0: 'regD',
  1: 'regX',
  2: 'regY',
  3: 'regU',
  4: 'regS',
  5: 'regPC',
  6: '',
  7: '',
  8: 'regA',
  9: 'regB',
  10: 'regCC',
  11: 'regDP',
};

const pairRegsToValue = {
  'D': 0, 'X': 1, 'Y': 2, 'U': 3, 'S': 4,
  'PC': 5, 'A': 8, 'B': 9, 'CC': 10, 'DP': 11,
};

const fullRegsToTextS = [
  'regCC', 'regA', 'regB', 'regDP', 'regX', 'regY', 'regU', 'regPC',
];

const fullRegsToTextU = [
  'regCC', 'regA', 'regB', 'regDP', 'regX', 'regY', 'regS', 'regPC',
];

const fullRegsToValue = {
  'CC': 0x01,
  'A': 0x02,
  'B': 0x04,
  'D': 0x06,
  'DP': 0x08,
  'X': 0x10,
  'Y': 0x20,
  'U': 0x40,
  'S': 0x40,
  'PC': 0x80,
};

export {
  SIbaseAddress,
  SIrefreshOff,
  SIrefreshOn,
  SIgraphicsMode,
  SIkeyInterface,
  Defaults,
  keyCodesList,
  blockChars,
  blockClasses,
  modes,
  modesText,
  pairRegsToText,
  pairRegsToValue,
  fullRegsToTextS,
  fullRegsToTextU,
  fullRegsToValue,
};
