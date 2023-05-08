import {ops6809} from './opcodes';
import {labelList} from './interface';
import {
  Defaults, fullRegsToTextS, fullRegsToTextU,
  fullRegsToValue,
  modes,
  modesText, pairRegsToText,
  pairRegsToValue,
} from './constants';
import {inHex, plural, signedHex, trc} from './helper';
import {Memory8} from './memory8';

function codeBlock(startAddr) {
  this.base = startAddr;
  this.bytes = [];
  this.addCode = function(code) {
    trc('addCode', code);
    this.bytes = this.bytes.concat(code);
  };
  this.writeCode = function() {
    return ('this.ram.fill (0x' + inHex(this.base, 4) + ', ' + JSON.stringify(this.bytes) + ');');
  };
}

export class Assembler {
  labelMap;
  asmText;
  labels;
  mapLabels;
  mapAddrs;
  passNo;
  passes;
  asmLineNo;
  asmProgram;
  foundError;
  asmIntervalID;
  asmIntervalMils;
  defaultStart;
  dsmTable;
  dsmTableSize;
  ram;

  constructor(ram, cpu, dsmWindow) {
    this.labelMap = new labelList('labelMap', this);
    this.asmText = '';
    this.labels = [];
    this.asmProgram = [];
    this.passNo = 0;
    this.passes = 3;
    this.asmLineNo = 0;
    this.asmIntervalID = null;
    this.asmIntervalMils = 2;
    this.defaultStart = 0x4000;
    this.dsmTable = dsmWindow;
    this.dsmTableSize = 30;
    this.ram = ram;
    if (ram == null) {
      this.ram = new Memory8(64 * 1024);
    }
    this.cpu = cpu;
  }

  assemble(program) {
    this.asmProgram = program;
    this.labels = [];
    this.mapLabels = [];
    this.mapAddrs = [];
    this.labelMap.empty();
    this.foundError = 0;
    this.#asmInit(1);
  }

  #asmInit(pass) {
    this.passNo = pass;
    this.assembling = true;
    this.ended = false;
    this.dpVal = 0;
    this.dpUse = false;
    this.codeBlocks = [];
    this.newOrg(Defaults.org);
    this.asmLineNo = 0;
    this.lastlabel = '';
    const cycle = this.asmCycle.bind(this);
    this.asmIntervalID = setInterval(cycle, this.asmIntervalMils);
  }

  asmFinalise() {
    if (this.codeBlocks.length) {
      let start = this.#findLabel('START');
      if (!start) {
        start = this.defaultStart;
      }
      machineOrg(start, 1);
      this.#setStatus('green', 'Ready',
          'assembly of ' + this.asmProgram.length + ' ' + plural('line', this.asmProgram.length) + ' complete',
          null);
      if (this.dsmTable != null) {
        const disassembly = this.disassemble(start, 0x10000, this.dsmTableSize);
        this.dsmTable.setTable(disassembly);
      }
      this.assembling = false;
      this.labelMap.fill(this.mapLabels);
    }
  };

  asmCycle() {
    let encoded;
    this.#setStatus('#d07010', 'Assembling pass ' + this.passNo, 'line number ' + (this.asmLineNo + 1), this.asmText);
    if ((this.asmLineNo < this.asmProgram.length) && (!this.ended)) {
      encoded = this.asmLine(this.asmProgram[this.asmLineNo], true);
      this.asmLineNo++;
      if (!this.foundError) {
        if (encoded.length > 0) {
          trc('Assemble @ ', inHex(this.pcVal, 4));
          if (this.pcVal != null) {
            this.pcVal = this.ram.fill(this.pcVal, encoded);
            this.codeBlocks [this.codeBlocks.length - 1].addCode(encoded);
          } else {
            this.#error('No value set for origin', 0);
          }
        }
      }
    } else {
      clearInterval(this.asmIntervalID);
      this.asmIintervalID = null;
      if (this.passNo < this.passes) {
        this.#asmInit(this.passNo + 1);
      } else {
        this.asmFinalise();
      }
    }
  }

  #findLabel(asmLabel) {
    const matches = /\s*([a-z_][\w_]*)/i.exec(asmLabel);
    if (matches !== null ) {
      const key = matches[1].toUpperCase();
      if (key in this.labels) {
        trc('Found label \'' + key + '\' of value', inHex(this.labels[key], 4));
        return this.labels[key];
      }
    }
  };

  #assignLabel(asmLabel, operand) {
    const key = asmLabel.toUpperCase();
    trc('Assigning label (' + key + ') with', inHex(operand, 4));
    if ((this.#findLabel(key) != null) && (this.passNo === 1)) {
      this.#error('Attempt to redefine label', key);
      return 0;
    } else {
      this.labels[key] = operand;
      return 1;
    }
  };

  opFind(opcode, page) {
    const opPage = parseInt(page);
    const instruction = ops6809.find(function(element) {
      return (element.op === opcode) && (element.page === opPage);
    });
    if (instruction) {
      return instruction;
    } else {
      const errorCode = inHex((page * 256) + opcode);
      trc('OpFind failed for ', errorCode);
      // this.#error('halt on opFind failed');
      // throw new Error('halt on opFind failed');
    }
  };

  #mnemonicFind(mnemonic, mode) {
    const instruction = ops6809.find((element) => {
      return (element.mnem === mnemonic) && ((element.mode & mode) !== 0);
    });
    if (instruction) {
      return instruction;
    } else {
      trc('MnemonicFind failed for', mnemonic);
    }
  };

  #readLabel(asmLabel, value, leadingSpace) {
    let matches; let key;
    trc('ReadLabel', asmLabel);
    trc('leadingSpace', leadingSpace);
    matches = /^\s*([a-z_][\w_]*):\s*(.*)/i.exec(asmLabel);
    if (matches !== null) {
      key = matches[1].toUpperCase();
      trc('readLabel key', key);
      this.#assignLabel(key, value);
      return [matches[2], key];
    }
    matches = /^([a-z_][\w_]*)\s*(.*)/i.exec(asmLabel);
    if ((!leadingSpace) && (matches !== null)) {
      key = matches[1].toUpperCase();
      if (!this.#mnemonicFind(key, 0xffff)) {
        this.#assignLabel(key, value);
        return [matches[2], key];
      }
    }
    return [asmLabel, ''];
  };

  #nextVal(expressionIn, needsValue) {
    let matches; let value; let valueNum; let minus; let radix;
    let total = 0;
    let valid = false;
    const matchValue = /^\s*(('(.))|(-|\+|)(\$|%|0x|)([\w_]+))/i;
    let expression = String(expressionIn);
    trc('nextVal input', expression, 0);
    while (matches = matchValue.exec(expression)) {
      minus = 0;
      radix = 10;
      if (matches[3]) {
        trc('matches[3]', matches[3], 0);
        valueNum = matches[3].charCodeAt(0);
      } else {
        value = matches[6].toUpperCase();
        trc('nextVal item', value, 0);
        trc('nextVal radix', matches[5], 0);
        trc('matches[5] "' + matches[5] + '"  ', matches[5].charCodeAt(0), 0);
        if (matches[4] === '-') {
          minus = 1;
        }
        if ((matches[5] === '$') || (matches[5].toUpperCase() === '0X')) {
          radix = 16;
        }
        if (matches[5] === '%') {
          radix = 2;
        }
        if ((radix <= 10) && value.match(/^[A-Z_]/)) {
          trc('FindLabel value', value);
          valueNum = this.#findLabel(value);
          if (valueNum == null) {
            if ((this.passNo > 1) || (needsValue)) {
              this.#error('Unable to resolve label');
              return null;
            } else {
              trc('Label not yet defined', value);
              return null;
            }
          }
        } else {
          trc('Radix', radix, 0);
          valueNum = parseInt(value, radix);
        }
      }
      if (!isNaN(valueNum)) {
        if (minus) {
          valueNum = -valueNum;
        }
      } else {
        this.#error('Can\'t read numeric value', valueNum);
        return;
      }
      total = total + valueNum;
      valid = true;
      trc('Total', inHex(total, 4));
      trc('Increment', inHex(valueNum, 4));
      trc('Expression', expression);
      expression = expression.substring(matches[0].length);
    }
    if ((total < -32768) || (total >= 0x10000)) {
      this.#error('Constant out of range (' + total + ')', expressionIn);
    }
    if (valid) {
      return total;
    } else {
      this.#error('Unable to interpret expression\'' + expression + '\'');
    }
  };

  #parseOutComments(text) {
    let trimmed = '';
    let inQuotes = null;
    let lastSpace = true;
    for (let i = 0; i < text.length; i++) {
      const c = text.charAt(i);
      //      if ((c=="'") || (c=='"')) {
      if (c === '"') {
        if (inQuotes === c) {
          inQuotes = null;
        } else {
          if (inQuotes == null) {
            inQuotes = c;
          }
        }
      }
      if (
        ((c === ';') || (c === '*')) &&
          (inQuotes === null) &&
          (lastSpace === true)
      ) {
        i = text.length;
      } else {
        lastSpace = ((c === ' ') || (c === '\t'));
        if ((!lastSpace) || (trimmed.length > 0)) {
          trimmed += c;
        }
      }
    }
    return trimmed.replace(/\s+$/, '');
  };

  #encodeOp(encoding, instruction) {
    if (instruction.page) {
      encoding.push(instruction.page);
    }
    encoding.push(instruction.op);
  };

  #encodeValue(encoding, value, bits) {
    let n;
    trc('Encode value initial', value, 0);
    if (value) {
      n = this.#nextVal(value, false);
    } else {
      n = 0;
    }
    trc('Encode value', n, 0);
    trc('Encode bits', bits, 0);
    if (bits > 8) {
      if (n < 0) {
        n += 0x10000;
      }
      if ((n >= 0) && (n < 0x10000)) {
        encoding.push(n >>> 8);
        encoding.push(n & 0xff);
      } else {
        this.#error('Value (16 bits) expected', value);
      }
    } else if (bits > 0) {
      if (n < 0) {
        n += 0x100;
      }
      if ((n >= 0) && (n < 0x100)) {
        encoding.push(n);
      } else {
        this.#error('Value (8 bits) expected', value);
      }
    }
  };

  #encodeString(encoding, s) {
    for (let i = 0; i < s.length; i++) {
      const c = s.charCodeAt(i);
      trc('String character', inHex(c, 2));
      if (c < 0x100) {
        encoding.push(c);
      }
    }
  };

  #encodeData(encoding, items, bits) {
    let matches = 0;
    for (let i = 0; i < items.length; i++) {
      const item = items[i];
      trc('Encode data', item, 0);
      matches = /\s*"(.*)"/.exec(item);
      if (matches === null) {
        trc('Try to match single quotes', item);
        matches = /\s*'(.*)'/.exec(item);
      }
      if (matches !== null) {
        this.#encodeString(encoding, matches[1]);
      } else {
        this.#encodeValue(encoding, item, bits);
      }
    }
  };

  newOrg(baseAddress) {
    trc('newOrg', inHex(baseAddress, 4));
    this.pcVal = baseAddress;
    this.codeBlocks.push(new codeBlock(baseAddress));
  };

  splitByComma(text) {
    let item;
    const items = [];
    let textList = text;
    trc('splitByComma', text, 0);
    while (textList.length > 0) {
      item = '';
      let matches = /^("(?:[^"\\]|\\.)*")|^('(?:[^'\\]|\\.)*)'/.exec(textList);
      if (matches !== null) {
        item = matches[0];
      } else {
        matches = /^([^,]*)/.exec(textList);
        if (matches) {
          item = matches[1];
        }
      }
      if (item === '') {
        textList = '';
      } else {
        items.push(item);
        trc('item', item, 0);
        textList = textList.substring(item.length).replace(/^\s*,/, '');
      }
    }
    return items;
  };

  #setDp(operand) {
    const value = this.#nextVal(operand, true);
    if ((value >= 0) && (value < 0x100)) {
      this.dpVal = value;
      this.dpUse = true;
    } else {
      if (value < 0) {
        this.dpVal = 0;
        this.dpUse = false;
      } else {
        this.#error('Direct page value must be 8 bits');
      }
    }
  };

  #fillData(encoding, items) {
    let filler;
    if (items.length === 2) {
      filler = this.#nextVal(items[0], false);
      const count = this.#nextVal(items[1], true);
      if (filler == null) {
        return;
      }
      if (filler < 0) {
        filler += 0x100;
      }
      if ((filler >= 0) && (filler < 0x100)) {
        if ((count > 0) && (count < 0x10000)) {
          trc('filling ' + count + ' bytes with value', filler, 0);
          for (let i = 0; i < count; i++) {
            encoding.push(filler);
          }
        } else {
          this.#error('Value for fill count out of range');
        }
      } else {
        this.#error('Value for data byte out of range');
      }
    } else {
      this.#error('Directive requires <data byte> and <count> operands');
    }
  };

  #encodeConstants(items) {
    for (let i = 0; i < items.length; i++) {
      const item = items[i];
      const matches = /\s*([A-Z_][\w_]*)\s*=\s*(.+)/i.exec(item);
      if (matches != null) {
        const labelValue = this.#nextVal(matches[2], true);
        if (labelValue) {
          this.#assignLabel(matches[1], labelValue);
        } else {
          this.#assignLabel(matches[1], 0);
        }
      } else {
        this.#error('Unable to interpret constant assignment', item);
      }
    }
  };

  #encodeVariables(items) {
    let item = items.shift();
    const varSize = this.#nextVal(item, false);
    if (varSize != null) {
      trc('varSize=', varSize);
      while (item = items.shift()) {
        const matches = /\s*([A-Z_][\w_]*)/i.exec(item);
        if (matches != null ) {
          this.#assignLabel(matches[1], this.pcVal);
          this.pcVal += varSize;
        } else {
          this.#error('Invalid label in variable list', item);
        }
      }
    } else {
      this.#error('Invalid variable size (usually 1 or 2)', item);
    }
    this.newOrg(this.pcVal);
  };

  #encodeDirective(encoding, instruction, operand, label) {
    trc('Encode directive name', instruction.mnem);
    trc('Encode directive operand', operand, 0);
    switch (instruction.mnem) {
      case 'DB':
      case '.BYTE':
      case 'FCB':
        //      case 'FCC': this.encodeData (encoding, operand.split (','), 8); break
      case 'FCC':
        this.#encodeData(encoding, this.splitByComma(operand), 8);
        break;
      case 'DW':
      case '.WORD':
      case 'FDB':
        this.#encodeData(encoding, operand.split(','), 16);
        break;
      case 'FILL':
        this.#fillData(encoding, operand.split(','));
        break;
      case 'ORG':
        this.newOrg(this.#nextVal(operand, true));
        break;
      case 'DS':
      case 'RMB':
        this.newOrg(this.pcVal + this.#nextVal(operand, true));
        break;
      case 'SETDP':
      case 'DIRECT':
        this.#setDp(operand);
        break;
      case '=':
      case 'EQU':
        if (label) {
          this.labels[label] = this.#nextVal(operand, false);
        } else {
          this.#error('EQU directive must have a label', '');
        }
        break;
      case 'CONST':
        this.#encodeConstants(operand.split(','));
        break;
      case 'VAR':
        this.#encodeVariables(operand.split(','));
        break;
      case 'END':
        this.ended = true;
    }
  };

  #pcr(target, bits, pcIn) {
    trc('this.pcr pcIn', inHex(pcIn, 4));
    const pc = this.ram.wrap(pcIn + ((bits === 8) ? 1 : 2));
    trc('PCR pc value', inHex(pc, 4), 0);
    trc('PCR target', inHex(target, 4), 0);
    trc('PCR bits', bits, 0);
    let n = this.#nextVal(target, false);
    trc('this.pcr nextVal', n, 0);
    if (n == null) {
      if (bits > 8) {
        return [null, 0, 0];
      } else {
        return [null, 0];
      }
    }
    n = n - pc;
    if (n < -0x8000) {
      n += 0x10000;
    }
    trc('PCR offset value', inHex(n), 0);
    switch (bits) {
      case 7:
      case 8:
        if (((n < -0x80) || (n >= 0x80)) && (this.passNo > 1)) {
          this.#error('PC relative offset (\'' + inHex(target, 4) + '\') outside 8 bit range', n);
        }
        return [n, n & 0xff];
      case 0:
      case 15:
      case 16:
        if (((n < -0x8000) || (n >= 0x10000)) && (this.passNo > 1)) {
          this.#error('PC relative offset (\'' + target + '\') outside 16 bit range', n);
        }
        return [n, (n & 0xffff) >>> 8, n & 0xff];
    }
  };

  #pairPostByte(s) {
    function getRegister(regText) {
      trc('getRegister', regText);
      if (regText in pairRegsToValue) {
        return pairRegsToValue[regText];
      }
    }
    trc('pairPostByte', s);
    const matches = /(\w+)\s*,\s*(\w+)/.exec(s);
    const reg1 = getRegister(matches[1].toUpperCase());
    const reg2 = getRegister(matches[2].toUpperCase());
    if ((reg1 != null) && (reg2 != null)) {
      return ((reg1 << 4) | reg2);
    } else {
      this.#error('Syntax error in register pair postbyte: \'' + s + '\'');
    }
  };

  #fullPostByte(mnemonic, registerString) {
    let postByte = 0;
    const thisStack = mnemonic[mnemonic.length - 1].toUpperCase();
    const regList = registerString.split(',');
    trc('fullPostByte thisStack', thisStack);
    for (let i = 0; i < regList.length; i++) {
      const reg = regList[i].trim().toUpperCase();
      trc('fullPostByte register', reg);
      if (reg in fullRegsToValue) {
        if (reg === thisStack) {
          this.#error('Can\'t stack register on its own stack', reg);
        } else {
          postByte |= fullRegsToValue[reg];
        }
      } else {
        if (reg.match(/\w/)) {
          this.#error('Unknown register', reg);
        }
      }
    }
    return postByte;
  };

  #addMapLabel(asmLabel, value) {
    trc('Setting map label \'' + asmLabel + '\' with value', value);
    this.mapLabels[asmLabel] = value;
    this.mapAddrs[inHex(value, 4)] = asmLabel;
  };

  #opSize(n) {
    let bits = 7;
    if (n < -0x80) {
      bits = 15;
      if (n < -0x8000) {
        bits = 32;
      }
    } else {
      if (n >= 0x80) {
        bits = 8;
        if (n >= 0x100) {
          bits = 15;
          if (n >= 0x8000) {
            bits = 16;
            if (n >= 0x10000) {
              bits = 32;
            }
          }
        }
      }
    }
    return bits;
  };

  #getIndexMode(s) {
    // determine index register and autoincrement, return index=-1 if error;
    let index = -1;
    let increment = 0;
    trc('getIndexMode', s);
    const matches = /\s*(-{0,2})([A-z]{1,3})(\+{0,2})/.exec(s.toUpperCase());
    if (matches) {
      trc('Index mode match', matches[2]);
      switch (matches[2]) {
        case 'X':
          index = 0x00;
          break;
        case 'Y':
          index = 0x20;
          break;
        case 'U':
          index = 0x40;
          break;
        case 'S':
          index = 0x60;
          break;
        case 'PC':
          index = 0x8C;
          break;
        case 'PCR':
          index = 0x8D;
          break;
        default:
          this.#error('Unrecognised index register', matches[2]);
      }
      trc('index postbyte', inHex(index, 2));
      trc('Postincrement', matches[3]);
      switch (matches[3]) {
        case '+':
          increment = 0x80;
          break;
        case '++':
          increment = 0x81;
          break;
      }
      trc('Predecrement', matches[1]);
      if (matches[1]) {
        if (increment > 0) {
          index = -1;
          this.#error('Index mode error: Can\'t have increment and decrement at the same time', s);
        } else {
          switch (matches[1]) {
            case '-':
              increment = 0x82;
              break;
            case '--':
              increment = 0x83;
              break;
          }
        }
      }
    } else {
      this.#error('Syntax error in index register expression', s);
    }
    return [index, increment];
  };

  parseSizedVal(s, noError, dp, useDp) {
    let value;
    let bits = 0;
    trc('ParseSizedVal', s);
    const matches = /\s*([<>])(.+)/.exec(s);
    if (matches) {
      trc('SizedVal match', matches[1]);
      switch (matches[1]) {
        case '<':
          bits = 8;
          break;
        case '>':
          bits = 16;
          break;
      }
      value = this.#nextVal(matches[2], false);
    } else {
      value = this.#nextVal(s, false);
    }
    if (value != null) {
      switch (bits) {
        case 16:
          if (((value < -32768) || (value >= 65536)) && (!noError)) {
            this.#error('Constant out of 16 bit range', value);
          }
          break;
        case 8:
          if (useDp) {
            value = (value - (dp << 8) & 0xffff);
          }
          if (((value < -128) || (value >= 256)) && (!noError)) {
            this.#error('Constant out of 8 bit range', value);
          }
          break;
      }
    }
    return [value, bits];
  };

  #adrMode(opMode, s, pcrVal) {
    let matches; let bits; let forceBits; let value; let mode; let indirect; let indexMode; let increment; let postByte; let offset; let values;
    let signedValue;
    let withDPValue;
    indirect = 0;
    postByte = -1;
    let hasValue = false;
    value = 0;
    bits = 0;
    forceBits = 0;
    matches = /\s*#\s*(.+)/.exec(s);
    if (matches != null) {
      value = this.#nextVal(matches[1], false);
      bits = (opMode & modes.bits16) !== 0 ? 16 : 8;
      mode = modes.immediate;
    } else {
      matches = /\s*[(\[]\s*(.+?)[)\]]\s*/.exec(s);
      if (matches != null) {
        trc('Indirect addressing', matches[1], 0);
        s = matches[1];
        indirect = 1;
      }
      matches = /\s*(\S*?)\s*,\s*(\S+)/.exec(s);
      if (matches != null) {
        offset = matches[1].toUpperCase();
        trc('Indexed addressing', matches[2], 0);
        trc('Offset', offset, 0);
        mode = modes.indexed;
        [indexMode, increment] = this.#getIndexMode(matches[2]);
        if (offset) {
          matches = /^([BAD])$/.exec(offset);
          if (matches != null) {
            trc('Register offset', matches[1]);
            indexMode |= {'B': 0x05, 'A': 0x06, 'D': 0x0B}[matches[1]] | 0x80;
          } else {
            trc('Constant offset', inHex(offset, 4));
            [value, forceBits] = this.parseSizedVal(offset, true, 0, false);
            hasValue = true;
            trc('forceBits=' + forceBits, value, 0);
          }
        }
        trc('indexMode', indexMode, 0);
        trc('increment', increment, 0);
        postByte = indexMode | increment;
        if (increment) {
          if ((hasValue) && (value !== 0)) {
            this.#error('Indexing error: can\'t have offset with auto inc/decrement', value);
          }
        } else {
          trc('non-autoincrement mode postByte', inHex(postByte, 2));
          if ((indexMode < 0x80) && (value === 0)) {
            postByte = postByte | 0x84;
          } else if (hasValue) {
            trc('Indexed constant offset', value);
            if (indexMode === 0x8D) {
              // force 16 bit offset for PCR references unless 8 bit specified
              if (forceBits === 0) {
                forceBits = 16;
              }
              if (value === null) {
                value = 0;
              }
              values = this.#pcr(value, forceBits, pcrVal);
              signedValue = values[0];
              value = values[1];
              if (values.length === 3) {
                value = (value << 8) | values[2];
              }
              indexMode = 0x8C;
              postByte = indexMode;
            } else {
              signedValue = value;
            }
            if (
              ((value >= -16) && (value < 16)) &&
                (indexMode < 0x80) && (!indirect)
            ) {
              postByte = postByte | (value & 0x1f);
              trc('5 bit indexed postByte', postByte);
            } else {
              // choose between extended and PCR
              postByte = postByte | ((indexMode < 0x80) ? 0x88 : 0x8C);
              trc('PCR signed value', signedValue);
              bits = this.#opSize(signedValue);
              trc('PCR opSize bits', bits);
              if (forceBits > 0) {
                trc('Deal with forceBits', forceBits);
                if ((this.passNo > 1) && (bits + 1 > forceBits)) {
                  this.#error('Constant offset out of ' + forceBits + ' bit range', signedValue);
                }
                bits = forceBits - 1;
              }
              if (bits > 7) {
                postByte = postByte | 0x01;
                bits = 16;
              }
              trc(bits + ' bit indexed postByte', inHex(postByte, 2));
            }
          }
        }
        if (indirect) {
          postByte |= 0x10;
        }
      } else {
        [value, forceBits] = this.parseSizedVal(s, 0, this.dpVal, this.dpUse);
        trc('Extended or indirect mode', value);
        bits = this.#opSize(value);
        if ((forceBits === 8) && (indirect === 0)) {
          mode = modes.direct;
          trc('Direct mode bit size', bits);
          if ((bits > 8) || (value < 0)) {
            this.#error('Direct mode address ($' + inHex(value, 4) + ') out of range', value);
          }
        } else {
          if (indirect) {
            postByte = 0x9F;
            mode = modes.indexed;
          } else {
            withDPValue = (value - (this.dpVal << 8) & 0xffff);
            trc('withDP', inHex(withDPValue, 4), 0);
            if ((this.dpUse) && (value != null) && (withDPValue < 0x100) && (forceBits !== 16)) {
              trc('Using DP', value, 0);
              value = withDPValue;
              bits = 8;
              mode = modes.direct;
            } else {
              mode = modes.extended;
              bits = 16;
            }
          }
          if (value < 0) {
            this.#error('Extended mode requires a 16 bit unsigned value', value);
          }
        }
      }
    }
    return [mode, value, bits, postByte];
  };

  /**
   * Assemble next line of source code.
   *
   * @param {String} s source code
   * @param {boolean} allowLabel
   * @returns {number[]} encoded bytes
   */
  asmLine(s, allowLabel) {
    let encoded = [];
    let opLabel = '';
    let matches; let instruction; let mode; let operand; let value; let bits; let postByte; let offsetValues;
    this.asmText = this.#parseOutComments(s);
    if (allowLabel) {
      [this.asmText, opLabel] = this.#readLabel(this.asmText, this.pcVal, /^\s+/.test(s));
      if (opLabel) {
        this.lastLabel = opLabel;
      }
    }
    this.asmText = this.asmText.replace(/^\s*/, '');
    trc('asmText', this.asmText);
    matches = /\s*([a-zA-Z=.]\w*)($|\s*(.+))/.exec(this.asmText);
    if (matches !== null) {
      const mnemonic = matches[1];
      trc('asmLine match:', mnemonic);
      instruction = this.#mnemonicFind(mnemonic.toUpperCase(), 0xffff);
      if (instruction !== null) {
        trc('Opcode:', inHex(instruction.op, 2));
        mode = instruction.mode;
        operand = matches[3];
        if ((mode & modes.simple) !== 0) {
          if (operand) {
            this.#error('Junk after instruction: \'' + operand + '\'');
          } else {
            this.#encodeOp(encoded, instruction);
          }
        } else if ((mode & modes.pseudo) !== 0) {
          this.#encodeDirective(encoded, instruction, operand, opLabel);
        } else if ((mode & modes.simple) === 0) {
          trc('Memory mode', mode);
          trc('modes.register', modes.register);
          if ((mode & modes.pcr) !== 0) {
            this.#encodeOp(encoded, instruction);
            //            console.dir (instruction);
            trc('ASM mode pcr instruction length', encoded.length, 0);
            offsetValues = this.#pcr(operand, (mode & modes.bits16) !== 0 ? 16 : 8, this.pcVal + encoded.length);
            offsetValues.shift();
            encoded = encoded.concat(offsetValues);
          } else if ((mode & modes.register) !== 0) {
            trc('Modes register', '');
            if ((mode & modes.pair) !== 0) {
              postByte = this.#pairPostByte(operand);
            } else {
              postByte = this.#fullPostByte(mnemonic, operand);
            }
            if (postByte !== null) {
              trc('Postbyte value', postByte);
              this.#encodeOp(encoded, instruction);
              encoded.push(postByte);
            }
          } else {
            trc('this pcVal', inHex(this.pcVal));
            [mode, value, bits, postByte] = this.#adrMode(instruction.mode, operand,
                this.pcVal + (instruction.page ? 3 : 2));
            trc('Mem mode', mode);
            trc('postByte', inHex(postByte, 2));
            instruction = this.#mnemonicFind(mnemonic.toUpperCase(), mode);
            if (instruction !== null) {
              trc('mnemonicFind Bits', bits);
              if (
                ((instruction.mode & modes.immediate) !== 0) &&
                  (bits > 8) &&
                  ((instruction.mode & modes.bits16) === 0)
              ) {
                this.#error('16 bit value found where 8 bit expected: \'' + value + '\'');
              } else {
                this.#encodeOp(encoded, instruction);
                if (postByte >= 0) {
                  encoded.push(postByte);
                }
                this.#encodeValue(encoded, value, bits);
              }
            } else {
              this.#error(modesText[mode] + ' addressing mode not allowed with instruction');
            }
          }
        }
      } else {
        this.#error('Unknown instruction', mnemonic);
      }
    }
    if (
      (this.lastLabel) && (encoded.length > 0) &&
        ((mode & modes.pseudo) === 0)
    ) {
      this.#addMapLabel(this.lastLabel, this.pcVal);
      this.lastLabel = '';
    }
    return encoded;
  }

  #setStatus(statusColour, alert, message, source) {
    let event; let HTML;
    let sourceText = source;
    if (sourceText) {
      sourceText = sourceText.replace(/</, '&lt;');
      sourceText = sourceText.replace(/>/, '&gt;');
    }
    HTML = '<span style=\'color: ' + statusColour + '\' font-size:large;\'>' + alert + '</span> <i>' + message + '</i>';
    if (source != null) {
      HTML += '<br />Input: <span style=\'color: blue\'>' + sourceText + '</span>';
    }
    event = new CustomEvent('assemblerEvent', {
      detail: {
        message: HTML,
      },
    });
    document.dispatchEvent(event);
  }

  #error(message) {
    this.foundError = 1;
    console.log('Error ' + message);
    this.#setStatus('red', 'Error @ line ' + (this.asmLineNo + 1) + ':', message, this.asmText);
    clearInterval(this.asmIntervalID);
    this.asmIntervalID = null;
  }

  #regGroupList = function(postByte, regList) {
    const theseRegs = [];
    for (let i = 0; i < 8; ++i) {
      if ((postByte & (0x01 << i)) !== 0) {
        theseRegs.push(regList[i].substring(3));
      }
    }
    return theseRegs.join(',');
  };

  #regPairList(postByte, regList) {
    /**
     * Convert post byte nybble pairs to register names.
     *
     * @param {number} regNum
     * @return {string} register names
     */
    function regName(regNum) {
      if (regNum in regList) {
        return regList[regNum].substring(3);
      } else {
        return 'ERR';
      }
    }

    return regName((postByte & 0xf0) >>> 4) + ',' + regName((postByte & 0x0f));
  };

  /**
   * Disassemble.
   *
   * @param {number} startAddress
   * @param {number} endAddress
   * @param {number} maxLines
   * @return {String[]}
   */
  disassemble(startAddress, endAddress, maxLines) {
    let opCode; let opPage; let postByte; let instruction; let disassembly;
    let pc = startAddress;
    const lines = [];

    /**
     * Get next byte at PC.
     *
     * @param {CPU} machine host CPU
     * @return {number}
     */
    function nextByte(machine) {
      let byte;
      [pc, byte] = machine.ram.read(pc);
      disassembly.bytes.push(byte);
      return byte;
    }

    /**
     * Find label associated with next address.
     *
     * @param {CPU} machine host CPU
     * @param {boolean} bits16 read 2 bytes when true
     * @param {String} prefix default
     * @return {String}
     */
    function readWord(machine, bits16, prefix) {
      let word = nextByte(machine);
      if (bits16) {
        word = (word << 8) | nextByte(machine);
        return machine.labelled(machine.mapAddrs, inHex(word, 4), prefix);
      } else {
        return machine.labelled(machine.mapAddrs, inHex(word, 2), prefix);
      }
    }

    /**
     * Convert indexed post byte details to text.
     *
     * @param {CPU} machine
     * @param {number} postByte
     * @return {string}
     */
    function disIndexed(machine, postByte) {
      let operand = '';
      // find index register name
      const indexReg = ['X', 'Y', 'U', 'S'][(postByte & 0x60) >>> 5];
      // extract 5 bit offset
      if ((postByte & 0x80) === 0) {
        trc('5 bit', '');
        operand = signedHex(postByte & 0x1f, 5, '$') + ',' + indexReg;
      } else {
        switch (postByte & 0x0f) {
          case 0x00:
            operand = ',' + indexReg + '+';
            break;
          case 0x01:
            operand = ',' + indexReg + '++';
            break;
          case 0x02:
            operand = ',' + '-' + indexReg;
            break;
          case 0x03:
            operand = ',' + '--' + indexReg;
            break;
          case 0x04:
            operand = ',' + indexReg;
            break;
          case 0x05:
            operand = 'B,' + indexReg;
            break;
          case 0x06:
            operand = 'A,' + indexReg;
            break;
          case 0x07:
            operand = 'ERR';
            break;
          case 0x08:
            operand = signedHex(parseInt(
                readWord(machine, modes.bits8, ''), 16),
                8, '$') + ', ' + indexReg;
            break;
          case 0x09:
            operand = signedHex(parseInt(
                readWord(machine, modes.bits16, ''), 16),
                16, '$') + ', ' + indexReg;
            break;
          case 0x0A:
            operand = 'ERR';
            break;
          case 0x0B:
            operand = 'D,' + indexReg;
            break;
          case 0x0C:
            operand = findPCR(machine, parseInt(
                readWord(machine, modes.bits8, ''),
                16), modes.bits8, pc) + ',PCR';
            break;
          case 0x0D:
            operand = findPCR(machine, parseInt(
                readWord(machine, modes.bits16, ''),
                16), modes.bits16, pc) + ',PCR';
            break;
          case 0x0E:
            operand = 'ERR';
            break;
          case 0X0F:
            operand = readWord(machine, modes.bits16, '$');
            break;
        }
        if ((postByte & 0x10) !== 0) {
          operand = '[' + operand + ']';
        }
      }
      return operand;
    }

    /**
     * Disassemble code at program counter.
     *
     * @param {CPU} machine host CPU
     * @param {number} offset offset from PC
     * @param {boolean} bits16
     * @param {number} pc PC
     * @return {String[]} List of disassembled instructions
     */
    function findPCR(machine, offset, bits16, pc) {
      let d = offset;
      if (!bits16) {
        d |= (offset & 0x80) !== 0 ? 0xff00 : 0;
      }
      return machine.labelled(
          machine.mapAddrs, inHex((pc + d) & 0xffff, 4), '$');
    }

    trc('Disassembling from', inHex(startAddress, 4));
    trc('PC', inHex(pc, 4));
    trc('endAddress', inHex(endAddress, 4));
    trc('maxLines', maxLines);
    while ((pc < endAddress) && (lines.length < maxLines)) {
      opPage = 0;
      instruction = null;
      disassembly = new DisCode(pc);
      opCode = nextByte(this);
      instruction = this.opFind(opCode, opPage);
      if (instruction != null) {
        if ((instruction.mode & modes.pager) !== 0) {
          trc('Pager', opCode);
          opPage = opCode;
          opCode = nextByte(this);
          instruction = this.opFind(opCode, opPage);
        }
      }
      if (instruction) {
        disassembly.operation = instruction.mnem;
        if ((instruction.mode & modes.simple) !== 0) {
        } else if ((instruction.mode & modes.immediate) !== 0) {
          disassembly.operand = '#' + readWord(
              this.cpu, instruction.mode & modes.bits16, '$');
        } else if ((instruction.mode & modes.direct) !== 0) {
          disassembly.operand = '<' + readWord(
              this.cpu, modes.bits8, '$');
        } else if ((instruction.mode & modes.extended) !== 0) {
          disassembly.operand = readWord(this.cpu, modes.bits16, '$');
        } else if ((instruction.mode & modes.indexed) !== 0) {
          disassembly.operand = disIndexed(this.cpu, nextByte(this.cpu));
        } else if ((instruction.mode & modes.register) !== 0) {
          postByte = nextByte(this.cpu);
          if ((instruction.mode & modes.pair) !== 0) {
            disassembly.operand = this.#regPairList(postByte, pairRegsToText);
          } else {
            disassembly.operand = this.#regGroupList(
                postByte, (disassembly
                    .operation[disassembly.operation.length - 1] === 'S'
                ) ? fullRegsToTextS : fullRegsToTextU,
            );
          }
        } else if ((instruction.mode & modes.pcr) !== 0) {
          disassembly.operand = findPCR(this.cpu, parseInt(readWord(
              this.cpu, instruction.mode & modes.bits16, ''),
              16), instruction.mode & modes.bits16, pc);
        }
      } else {
        disassembly.operation = 'ERR';
      }
      lines.push(disassembly);
    }
    return lines;
  };
}

/**
 * Disassemble byte code.
 *
 * @param {number} address
 * @constructor
 */
function DisCode(address) {
  this.address = address;
  this.label = '';
  this.bytes = [];
  this.operation = '';
  this.operand = '';
  this.maxInstructionLength = 5;
  this.show = function() {
    let s = inHex(this.address, 4) + ': ';
    for (let i = 0; i < this.maxInstructionLength; i++) {
      if (i < this.bytes.length) {
        s += inHex(this.bytes[i], 2) + ' ';
      } else {
        s += '   ';
      }
    }
    return s + this.operation + ' ' + this.operand;
  };
}
