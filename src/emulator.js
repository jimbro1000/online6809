import {SIbaseAddress,
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
    fullRegsToValue} from "./constants"
import {ops6809} from "./opcodes"

let tracing = 1;

function trc(caption, data, force) {
    if ((tracing !== 0) || (force)) {
        console.log(caption + ': \'' + data + '\'');
    }
}

function inHex(n, l) {
    var s = n.toString(16).toUpperCase();
    while (s.length < l) {
        s = '0' + s;
    }
    return s;
}

function signedHex(n, bits, symbol) {
    let digits = (bits > 8) ? 4 : 2;
    if ((n & (1 << (bits - 1))) !== 0) {
        return '-' + symbol + inHex((1 << bits) - n, digits);
    } else {
        return symbol + inHex(n, digits);
    }
}

function inBinary(n, l) {
    let s = n.toString(2);
    while (s.length < l) {
        s = '0' + s;
    }
    return s;
}

function signed8(w) {
    var b = w & 0xff;
    return (b & 0x80) ? ((b & 0x7f) - 0x80) : b;
}

function signed16(l) {
    var w = l & 0xffff;
    return (w & 0x8000) ? ((w & 0x7fff) - 0x8000) : w;
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

function deSelect() {
    let selection = ('getSelection' in window)
        ? window.getSelection()
        : ('selection' in document)
            ? document.selection
            : null;
    if ('removeAllRanges' in selection) selection.removeAllRanges();
    else if ('empty' in selection) selection.empty();
}

function disCode(address) {
    this.address = address;
    this.label = '';
    this.bytes = [];
    this.operation = '';
    this.operand = '';
    this.maxInstructionLength = 5;
    this.show = function () {
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

function systemInterface(cpuOwner, address) {
    this.cpu = cpuOwner;
    this.base = address;
    cpuOwner.ram.addWindow(this, address, 0x20);
    this.update = function (holder, address, value) {
        var key;
        switch (address - this.base) {
            case SIrefreshOn:
                if (!this.cpu.refreshOn) {
//                          this.cpu.refreshOn=true;
//                          mc6809.refresh (1)
//                          console.log ("Refresh on");
                    machineRefresh();
                }
                break;
            case SIrefreshOff:
                this.cpu.refresh(1);
                this.cpu.refreshOn = false;
//                         console.log ("Refresh off");
                break;
            case SIgraphicsMode:
                holder.cpu.graphicsRAM.setMode(value);
                break;
            case SIkeyInterface:
                if (value === 0) {
                    key = holder.cpu.keyBuffer.shift();
                    if (key) {
                        trc('Keypress', key, 1);
                        switch (key) {
                            case 'Enter':
                                key = 13;
                                break;
                            case 'Backspace':
                                key = 8;
                                break;
                            case 'Escape':
                                key = 27;
                                break;
                            default:
                                key = key.charCodeAt();
                                break;
                        }
                        trc('Keycode', key, 1);
                        holder.cpu.ram.poke(address, key);
                    } else {
                        holder.cpu.ram.poke(address, 255);
                    }
                } else if (value === 255) {
                    holder.cpu.keyBuffer = [];
                }
                break;

        }
    };
}

function cellEdit(cellTD, cpu, cellAddress) {
    this.verify = function () {
        cpu.pcVal = this.address;
        cpu.foundError = 0;
        cpu.passNo = 2;
        var encoded = cpu.asmLine(this.input.value, false);
        if (cpu.foundError) {
            this.input.style = 'color: #f02020';
//      alert ('Machine language contains errors');
            return null;
        } else {
            if (encoded.length > 0) {
                trc('cellEdit Assemble @ ', inHex(this.address, 4));
                cpu.pcVal = cpu.ram.fill(this.address, encoded);
            }
        }
        return this.input.value;
    };
    cpu.cellEditing = this;
    this.parent = cellTD;
    this.address = cellAddress;
    this.oldContents = this.parent.innerText;
    this.input = document.createElement('input');
    this.input.setAttribute('type', 'text');
    this.input.setAttribute('value', this.oldContents);
    this.input.className = 'cellEdit';
    this.input.addEventListener('contextmenu', function (event) {
        trc('input right click', event);
        event.preventDefault();
    }, true);
    this.input.addEventListener('keydown', function (event) {
        var keyDown;
        if (!event.defaultPrevented) {
            keyDown = event.key.toString().toUpperCase();
            trc('Event triggered', keyDown);
            if (keyDown === 'ESCAPE') {
                cpu.closeEdit(false);
                event.preventDefault();
            }
            if (keyDown === 'ENTER') {
                cpu.closeEdit(true);
                event.preventDefault();
            }
        }
    }, true);
    this.parent.innerHTML = '';
    this.parent.appendChild(this.input);
    this.input.focus();
    this.input.select();
    this.input.setSelectionRange(this.oldContents.length, this.oldContents.length);

}

function memory8(size) {
    let i;
    this.mask = size - 1;
    this.windows = [];
    if (size > 0) {
        this.ram = new Array(size);
        for (i = 0; i < size; i++) {
            this.ram[i] = 0;
        }
    }
    this.wrap = function (address) {
        return address & this.mask;
    };
    this.plus = function (address) {
        return (address + 1) & this.mask;
    };
    this.plusplus = function (address) {
        return (address + 2) & this.mask;
    };
    this.peek = function (address) {
        return this.ram[address & this.mask];
    };
    this.deek = function (address) {
        return (this.ram[address & this.mask] << 8) + this.ram[(address + 1) & this.mask];
    };
    this.poke = function (address, byte) {
        byte = byte & 0xff;
        this.ram[address] = byte;
        this.checkWindow(address, byte);
    };
    this.read = function (address) {
        return [this.wrap(address + 1), this.peek(address)];
    };
    this.fill = function (address, bytes) {
        let i = 0;
        while (i < bytes.length) {
            this.poke(address + i, bytes[i]);
            trc('Fill', inHex(bytes[i], 2));
            if ((address + i + 1) !== this.wrap(address + i + 1)) {
                break;
            } else {
                i++;
            }
        }
        return address + i;
    };
    this.addWindow = function (holder, base, length) {
        var freshWin = new RAMWindow(holder, base, length);
        this.windows.push(freshWin);
        return freshWin;
    };
    this.removeWindow = function (base, length, handle) {
        let i;
        if (handle == null) {
            for (i = this.windows.length - 1; i >= 0; i--) {
                if ((this.windows[i].base === base) && (this.windows[i].ending === base + length)) {
                    this.windows.splice(i, 1);
                    trc('Removed array splice at ', i + ' with base=' + base + ' length=' + length);
                }
            }
        } else {
            i = this.windows.indexOf(handle);
            trc('removeWindow by handle', i);
            if (i >= 0) {
                this.windows.splice(i, 1);
            }
        }
    };
    this.checkWindow = function (address, value) {
//    var window=this.windows.find (function (element) {
//      return (address>=element.base) && (address<element.ending)
//    });
        for (let i = 0; i < this.windows.length; i++) {
            let window = this.windows[i];
            if ((address >= window.base) && (address < window.ending)) {
                window.holder.update(window.holder, address, value);
            }
        }
    };

}

const RAMWindow = function (holderObject, RAMbase, RAMLength) {
    this.base = RAMbase;
    this.ending = this.base + RAMLength;
    this.holder = holderObject;
//  trc ("RAMWindow ending", inHex (this.ending, 4),1);
};

function Register(called, size, n, cpuOwner, usebinary) {
    this.bits = 8;
    this.binary = '';
    this.regValue = n;
    this.regLabel = '';
    this.regName = '';
    this.cpu = cpuOwner;
    this.notify = 0;
    trc('Init Register called', called);
    this.digGroups = function (s, count) {
        var groups = [];
        while (s.length >= count) {
            groups.push(s.substr(0, count));
            s = s.substr(count);
        }
        return groups;
    };
    this.toggleBit = function (bitNo) {
        trc('toggleBit', bitNo);
        this.change(this.regValue ^ (0x01 << bitNo), 1);
        this.selectInput(null, 0);
    };
    this.selectInput = function (cell, cellno) {
        trc('Hex cell select', cellno);
        if (this.cpu.hexInputCell) {
            this.cpu.hexInputCell.style.backgroundColor = '';
        }
        if (cell !== this.cpu.hexInputCell) {
            this.cpu.hexInputCell = cell;
            this.cpu.hexInputCellNo = cellno;
            this.cpu.hexInputRegister = this;
            if (cell) {
                cell.style.backgroundColor = '#20c020';
            }
        } else {
            this.cpu.hexInputCell = null;
        }
    };
    this.digitRow = function (t, c, l, notify, labelTop) {
        var i, row, cell;
        row = t.insertRow();
        if (!labelTop) {
            cell = row.insertCell();
            cell.innerHTML = this.regLabel + '&nbsp;';
            cell.className = 'reglabel';
        }
        for (i = 0; i < l; i++) {
            cell = row.insertCell();
            cell.setAttribute('name', this.regName);
            cell.className = c;
            if (this.binary.length > 1) {
                cell.innerHTML = this.binary[i];
                if (notify) {
                    trc('Notifiable binary cell', i);
                    (function (register, cellno) {
                        cell.onclick = function (cell) {
                            register.toggleBit(cellno);
                        };
                    }(this, l - i - 1));
                }
            } else {
                cell.innerHTML = '-';
                if (notify) {
                    (function (register, cell, cellno) {
                        cell.onclick = function (e) {
                            register.selectInput(cell, cellno);
                        };
                    }(this, cell, l - i - 1));
                }
            }
        }
    };
    this.createHTML = function (calledp) {
        let table, arow, acell, cells;
        this.regLabel = called;
        this.regName = 'reg' + called;
        table = document.getElementById(this.regName);
        cells = this.bits;
        if (this.binary.length <= 1) {
            cells = cells / 4;
        }
        if (this.binary) {
            arow = table.insertRow();
            acell = arow.insertCell();
            acell.innerHTML = this.regLabel;
            acell.setAttribute('colspan', cells);
            acell.className = 'reglabel';
        }
        if (table != null) {
            switch (this.binary) {
                case '':
                    this.digitRow(table, 'anydig hex', cells, 1, 0);
                    break;
                case 'Y':
                    this.digitRow(table, 'anydig hex big', cells, 1, 1);
                    this.digitRow(table, 'anydig bin', cells, 0, 1);
                    break;
                default:
                    this.digitRow(table, 'anydig label', cells, 0, 1);
                    this.digitRow(table, 'anydig flag', cells, 1, 1);
                    break;
            }
        }
    };
    this.refresh = function (force) {
        let w, sBinary, sHex, sFlags;
        if (!(this.cpu.refreshOn || force)) {
            return;
        }
        w = this.regValue & 0xffff;
        sBinary = this.digGroups(inBinary(w, this.bits), 4);
        sFlags = this.digGroups(inBinary(w, this.bits), 1);
        sHex = this.digGroups(inHex(w, this.bits / 4), 1);
//    trc ("Register refresh", this.regName);
        document.getElementsByName(this.regName).forEach((element) => {
            switch (element.className) {
                case 'anydig hex':
                case 'anydig hex big':
                    element.innerHTML = sHex.shift();
                    break;
                case 'anydig bin':
                    element.innerHTML = sBinary.shift();
                    break;
                case 'anydig flag':
                    element.innerHTML = sFlags.shift();
                    break;
            }
        });
    };
    this.update = function (n) {
        this.setValue(n);
        this.refresh();
    };
    this.change = function (n, force) {
//    trc ("Change ", inHex (n));
        this.regValue = n;
        this.refresh(force);
        if (this.notify) {
            this.cpu.notify(this.regName, force);
        }
    };
    this.setValue = function (n) {
        var mask;
        switch (this.bits) {
            case 8:
                mask = 0xff;
                break;
            case 16:
                mask = 0xffff;
                break;
        }
        this.regValue = n & mask;
    };
    this.setbits = function (size) {
        if ((size === 8) || (size === 16)) {
            this.bits = size;
        }
    };
    this.setbinary = function (b) {
        if ((b === '') || (b === 'Y') || (b.length === this.bits)) {
            this.binary = b;
        }
    };
    this.inputHex = function (cpuCaller, hexValue) {
        let mask;
        trc('inputHex', hexValue);
        if (cpuCaller.hexInputCell) {
            mask = (0x000f << (cpuCaller.hexInputCellNo * 4)) ^ 0xffff;
            cpuCaller.hexInputRegister.change(
                (cpuCaller.hexInputRegister.regValue & mask) | (hexValue << (cpuCaller.hexInputCellNo * 4)), 1);
            if (cpuCaller.hexInputCellNo > 0) {
                cpuCaller.hexInputRegister.selectInput(cpuCaller.hexInputCell.nextSibling, cpuCaller.hexInputCellNo - 1);
            } else {
                cpuCaller.hexInputRegister.selectInput(null, 0);
            }
        }
    };
    this.setbits(size);
    this.setValue(n);
    this.setbinary(usebinary);
    this.createHTML(called);
}

function ALU816(cpu) {
    this.r1 = 0;
    this.r2 = 0;
    this.ea = 0;
    this.eaLast = 0;
    this.notick = 0;
    this.quit = 0;
    this.indexReg = '';
    this.indexInc = 0;
    this.indexBase = 0;
    this.syncing = 0;
    this.waiting = 0;
    this.condition = 0;
    this.nextPage = 0;
    this.regs = cpu.registers;
    this.cpu = cpu;
    this.iLines = {'irq': 0, 'firq': 0, 'nmi': 0, 'reset': 0};
    this.execute = function (microcode) {
        let i, ops, matches, operation, operand;
        this.notick = 0;
        this.quit = 0;
        i = 0;
        this.nextPage = 0;
        ops = microcode.split(';');
        while ((i < ops.length) && (this.quit === 0)) {
//      trc ("ops[i] ("+i+")", ops[i], 1);
            matches = /(\w+)(\s*)(\w*)/.exec(ops[i]);
            if (matches) {
                operation = matches[1];
                if (matches.length > 2) {
                    operand = matches[3];
                }
                this[operation](operand);
            } else {
                trc('Operation unknown', ops[i] + ' in ' + microcode, 1);
            }
            i++;
        }
        if (this.notick === 0) {
            this.cpu.registers['regPC'].refresh();
        }
        this.cpu.opPage = this.nextPage;
    };
    this.interrupt = function (irqName) {
        trc('ALU interrupt', irqName);
        if (irqName in this.iLines) {
            trc('set iLine', irqName);
            this.iLines[irqName] = 1;
        }
    };
    this.checkInterrupts = function () {
//    trc ("checkInterrupts", 0);
        if (this.iLines['reset']) {
            this.syncing = 0;
            this.waiting = 1;
            trc('found interrupt', 'reset');
            this.serviceInterrupt(0, 0xfffe, 'FI');
            this.iLines['reset'] = 0;
        }
        if (this.iLines['nmi']) {
            this.syncing = 0;
            trc('found interrupt', 'nmi');
            this.serviceInterrupt(1, 0xfffc, 'FI');
            this.iLines['nmi'] = 0;
        }
        if (this.iLines['firq']) {
            this.syncing = 0;
            this.iLines['firq'] = 0;
            if (!this.cpu.flagCheck('F')) {
                trc('found interrupt', 'firq');
                this.serviceInterrupt(0, 0xfff6, 'FI');
            }
        }
        if (this.iLines['irq']) {
            this.syncing = 0;
            this.iLines['irq'] = 0;
            if (!this.cpu.flagCheck('I')) {
                trc('found interrupt', 'irq');
                this.serviceInterrupt(1, 0xfff8, 'FI');
            }
        }
    };
    this.swi = function (operand) {
        switch (operand) {
            case '1':
                this.serviceInterrupt(1, 0xfffa, 'FI');
                break;
            case '2':
                this.serviceInterrupt(1, 0xfff4, '');
                break;
            case '3':
                this.serviceInterrupt(1, 0xfff2, '');
                break;
        }

    };
    this.serviceInterrupt = function (entire, vector, flags) {
        trc('serviceInterrupt', inHex(vector, 4));
        if (!this.waiting) {
            if (entire) {
                this.cpu.flags('E');
                trc('Interrupt push CC value', inHex(this.cpu.registers['regCC'].regValue));
                this.pushPostByte('regS', 0xFF);
            } else {
                this.cpu.flags('e');
                this.pushPostByte('regS', 0x81);
            }
        } else {
            this.waiting = 0;
        }
        this.cpu.flags(flags);
        this.ea = vector;
        this.ftch16();
        machineOrg(this.r1, 0);
    };
    this.chk = function (operand) {
        var cc = this.cpu.registers['regCC'].regValue;
        this.condition = 0;
//    trc ("chk CC",cc);
//    trc ("chk operand",operand);
        switch (operand) {
            case 'Z':
//        trc ("Zero",this.cpu.flagBits.Z);
                if (cc & this.cpu.flagBits.Z) {
                    this.condition = 1;
                }
                break;
            case 'C':
//        trc ("Carry",this.cpu.flagBits.C);
                if (cc & this.cpu.flagBits.C) {
                    this.condition = 1;
                }
                break;
            case 'N':
//        trc ("Negative",this.cpu.flagBits.N);
                if (cc & this.cpu.flagBits.N) {
                    this.condition = 1;
                }
                break;
            case 'V':
//        trc ("Overflow",this.cpu.flagBits.N);
                if (cc & this.cpu.flagBits.V) {
                    this.condition = 1;
                }
                break;
            case 'LS':
//        trc ("LS",this.cpu.flagBits.C);
                if ((cc & this.cpu.flagBits.C) || (cc & this.cpu.flagBits.Z)) {
                    this.condition = 1;
                }
                break;
            case 'LT':
//        trc ("LT",this.cpu.flagBits.C);
                if ((cc & this.cpu.flagBits.V) != (cc & this.cpu.flagBits.N)) {
                    this.condition = 1;
                }
                break;
            case 'LE':
//        trc ("LE",this.cpu.flagBits.C);
                if ((cc & this.cpu.flagBits.Z) ||
                    ((cc & this.cpu.flagBits.V) != (cc & this.cpu.flagBits.N))) {
                    this.condition = 1;
                }
                break;
        }
//    trc ("Chk result",this.condition);
    };
    this.sync = function () {
        this.syncing = 1;
    };
    this.exx = function () {
        var r = this.r1;
        this.r1 = this.r2;
        this.r2 = r;
    };
    this.mnus = function () {
        this.r1 = this.cpu.ram.wrap(this.r1 - 1);
    };
    this.qt = function () {
        if (this.condition != 0) {
            this.quit = 1;
        }
    };
    this.qf = function () {
        if (this.condition == 0) {
            this.quit = 1;
        }
    };
    this.ld = function (operand) {
        if (operand == 'regD') {
            return (this.regs['regA'].regValue << 8) | this.regs['regB'].regValue;
        } else {
            return this.regs[operand].regValue;
        }
    };
    this.ld1 = function (operand) {
        this.r1 = this.ld(operand);
    };
    this.ld2 = function (operand) {
        this.r2 = this.ld(operand);
    };
    this.st = function (operand, value) {
//    trc ("ST operand",operand);
//    trc ("ST value",value);
        if (operand == 'regD') {
            this.regs['regA'].change(value >>> 8, 0);
            this.regs['regB'].change(value & 0xff, 0);
        } else {
            this.regs[operand].change(value, 0);
        }
    };
    this.st1 = function (operand) {
        this.st(operand, this.r1);
    };
    this.st2 = function (operand) {
        this.st(operand, this.r2);
    };
    this.regPairRead = function (nybble) {
        var w = this.ld(pairRegsToText[nybble]);
        if (nybble & 0x08) {
            w = w | (w << 8);
        }
        return w;
    };
    this.regPairWrite = function (nybble, value) {
        var w = value;
        if (nybble & 0x08) {
            w = w & 0xff;
        }
        this.st(pairRegsToText[nybble], w);
    };
    this.rgop = function (operand) {
        this.pcb();
        var hn = this.r1 >>> 4;
        var ln = this.r1 & 0x0f;
        this.r1 = this.regPairRead(hn);
        this.r2 = this.regPairRead(ln);
        switch (operand) {
            case 'tfr':
                this.regPairWrite(ln, this.r1);
                break;
            case 'exg':
                this.regPairWrite(ln, this.r1);
                this.regPairWrite(hn, this.r2);
                break;
        }
    };
    this.stck16 = function (operand) {
        var w = this.regs[operand].regValue;
        var s = this.regs['regS'].regValue;
//    trc ("STCK16 (s='"+inHex(s,4)+"'",w);
        s = this.cpu.ram.wrap(s - 1);
        this.cpu.ram.poke(s, w);
        s = this.cpu.ram.wrap(s - 1);
        this.cpu.ram.poke(s, w >>> 8);
        this.regs['regS'].change(s, 0);
    };
    this.wait = function () {
        this.regs['regCC'].change(this.r1 | this.cpu.flagBits['E'], 0);
        trc('Wait PC', inHex(this.regs['regPC'].regValue, 4));
        this.pushPostByte('regS', 0xff);
        this.waiting = 1;
    };
    this.push = function (operand) {
        this.pcb();
        this.pushPostByte(operand, this.r1);
    };
    this.pushPostByte = function (operand, postByte) {
        var regValue;
        var stack = this.regs[operand].regValue;
        var regList = (operand == 'regS') ? fullRegsToTextS : fullRegsToTextU;
        var postByteMask = 0x80;
        var i = 8;
//    trc ("Push postbyte", postByte);
        while (postByteMask > 0) {
            i--;
            if (postByte & postByteMask) {
                regValue = this.regs[regList[i]].regValue;
//        trc ("Push register '"+regList[i]+"'",inHex (regValue,4));
                stack = this.cpu.ram.wrap(stack - 1);
                this.cpu.ram.poke(stack, regValue);
                if (i >= 4) {
                    stack = this.cpu.ram.wrap(stack - 1);
                    this.cpu.ram.poke(stack, regValue >>> 8);
                }
            }
            postByteMask >>>= 1;
        }
        this.regs[operand].change(stack, 0);
        this.eaLast = stack;
    };
    this.rti = function () {
        this.pullPostByte('regS', fullRegsToValue['CC']);
        trc('RTI cc value', inHex(this.cpu.registers['regCC'].regValue, 2));
        if (this.cpu.flagCheck('E')) {
            this.pullPostByte('regS', 0xff ^ fullRegsToValue['CC']);
        } else {
            this.pullPostByte('regS', fullRegsToValue['PC']);
        }
    };
    this.pull = function (operand) {
        this.pcb();
        this.pullPostByte(operand, this.r1);
    };
    this.pullPostByte = function (operand, postByte) {
        var regValue;
        var stack = this.regs[operand].regValue;
        var regList = (operand == 'regS') ? fullRegsToTextS : fullRegsToTextU;
        var postByteMask = 0x01;
        var i = 0;
//    trc ("Pull postbyte", postByte);
        this.eaLast = stack;
        while (postByteMask > 0) {
            if (postByte & postByteMask) {
//        trc ("Pull register",regList[i]);
                if (i >= 4) {
                    regValue = this.cpu.ram.peek(stack) << 8;
                    stack = this.cpu.ram.wrap(stack + 1);
                } else {
                    regValue = 0;
                }
                regValue |= this.cpu.ram.peek(stack);
                stack = this.cpu.ram.wrap(stack + 1);
                this.regs[regList[i]].change(regValue, 0);
            }
            i++;
            postByteMask = (postByteMask << 1) & 0xff;
        }
        this.regs[operand].change(stack, 0);
    };
    this.page = function (operand) {
        this.nextPage = operand;
    };
    this.nop = function () {
    };
    this.err = function () {
    };
    this.or8 = function () {
        var f = 'v';
        this.r1 = this.r1 | this.r2;
        this.cpu.flags(f + (this.r1 ? 'z' : 'Z') + ((this.r1 & 0x80) ? 'N' : 'n'));
    };
    this.clr8 = function () {
        this.r1 = 0;
        this.cpu.flags('nZvc');
    };
    this.tst8 = function () {
        var f = 'v';
        this.cpu.flags(f + (this.r1 ? 'z' : 'Z') + ((this.r1 & 0x80) ? 'N' : 'n'));
    };
    this.and8 = function () {
        var f = 'v';
        this.r1 = (this.r2 & this.r1) & 0xff;
        this.cpu.flags(f + (this.r1 ? 'z' : 'Z') + ((this.r1 & 0x80) ? 'N' : 'n'));
    };
    this.eor8 = function () {
        var f = 'v';
        this.r1 = (this.r2 ^ this.r1) & 0xff;
        this.cpu.flags(f + (this.r1 ? 'z' : 'Z') + ((this.r1 & 0x80) ? 'N' : 'n'));
    };
    this.or8 = function () {
        var f = 'v';
        this.r1 = (this.r2 | this.r1) & 0xff;
        this.cpu.flags(f + (this.r1 ? 'z' : 'Z') + ((this.r1 & 0x80) ? 'N' : 'n'));
    };
    this.sub8 = function () {
        // set high bit IFF signs of operand differ;
        var mask = (this.r2 ^ this.r1);
        var result = this.r2 - this.r1;
        var f = (mask & (this.r2 ^ result)) & 0x80 ? 'V' : 'v';
        this.r1 = result & 0xff;
        this.cpu.flags(f + (this.r1 ? 'z' : 'Z') + ((this.r1 & 0x80) ? 'N' : 'n') + ((result & 0x100) ? 'C' : 'c'));
    };
    this.sub16 = function () {
        // set high bit IFF signs of operand differ;
        var mask = (this.r2 ^ this.r1);
        var result = this.r2 - this.r1;
        var f = (mask & (this.r2 ^ result)) & 0x8000 ? 'V' : 'v';
        this.r1 = result & 0xffff;
        this.cpu.flags(f + (this.r1 ? 'z' : 'Z') + ((this.r1 & 0x8000) ? 'N' : 'n') + ((result & 0x10000) ? 'C' : 'c'));
    };
    this.sbc8 = function () {
        var mask = (this.r2 ^ this.r1) ^ 0x80;
        var result = this.r2 - this.r1 - (this.cpu.flagCheck('C') ? 1 : 0);
        var f = (mask & (this.r2 ^ result)) & 0x80 ? 'V' : 'v';
        this.r1 = result & 0xff;
        this.cpu.flags(f + (this.r1 ? 'z' : 'Z') + ((this.r1 & 0x80) ? 'N' : 'n') + ((result & 0x100) ? 'C' : 'c'));
    };
    this.add8 = function () {
        // set high bit IFF signs of operand the same;
        var mask = (this.r2 ^ this.r1) ^ 0x80;
        var result = this.r2 + this.r1;
        var f = ((this.r2 & 0x0f) + (this.r1 & 0x0f) >= 0x10) ? 'H' : 'h';
        // set overflow IFF signs of original and result differ, and mask bit set;
        f += (mask & (this.r2 ^ result)) & 0x80 ? 'V' : 'v';
        this.r1 = result & 0xff;
        this.cpu.flags(f + (this.r1 ? 'z' : 'Z') + ((this.r1 & 0x80) ? 'N' : 'n') + ((result & 0x100) ? 'C' : 'c'));
    };
    this.add16 = function () {
        // set high bit IFF signs of operand the same;
        var mask = (this.r2 ^ this.r1) ^ 0x8000;
        var result = this.r2 + this.r1;
        // set overflow IFF signs of original and result differ, and mask bit set;
        var f = (mask & (this.r2 ^ result)) & 0x8000 ? 'V' : 'v';
        this.r1 = result & 0xffff;
        this.cpu.flags(f + (this.r1 ? 'z' : 'Z') + ((this.r1 & 0x8000) ? 'N' : 'n') + ((result & 0x10000) ? 'C' : 'c'));
    };
    this.adc8 = function () {
        var mask = (this.r2 ^ this.r1) ^ 0x80;
        var result = this.r2 + this.r1 + (this.cpu.flagCheck('C') ? 1 : 0);
        var f = (mask & (this.r2 ^ result)) & 0x80 ? 'V' : 'v';
        this.r1 = result & 0xff;
        this.cpu.flags(f + (this.r1 ? 'z' : 'Z') + ((this.r1 & 0x80) ? 'N' : 'n') + ((result & 0x100) ? 'C' : 'c'));
    };
    this.mul = function () {
        var product = (this.regs['regA'].regValue & 0xff) * (this.regs['regB'].regValue & 0xff);
        var f = (product & 0x80) ? 'C' : 'c';
        this.regs['regA'].change(product >>> 8, 0);
        this.regs['regB'].change(product & 0xff, 0);
        this.cpu.flags(f + (product ? 'z' : 'Z'));
    };
    this.abx = function () {
        this.regs['regX'].change((this.regs['regX'].regValue + this.regs['regB'].regValue) & 0xffff, 0);
    };
    this.zero = function () {
        this.cpu.flags(this.r1 ? 'z' : 'Z');
    };
    this.tst16 = function () {
        var f = 'v';
        this.cpu.flags(f + (this.r1 ? 'z' : 'Z') + ((this.r1 & 0x8000) ? 'N' : 'n'));
    };
    this.inc8 = function () {
        var f = (this.r1 == 127) ? 'V' : 'v';
        this.r1 = (this.r1 + 1) & 0xff;
        this.cpu.flags(f + (this.r1 ? 'z' : 'Z') + ((this.r1 & 0x80) ? 'N' : 'n'));
    };
    this.dec8 = function () {
        var f = (this.r1 == 0x80) ? 'V' : 'v';
        this.r1 = (this.r1 - 1) & 0xff;
        this.cpu.flags(f + (this.r1 ? 'z' : 'Z') + ((this.r1 & 0x80) ? 'N' : 'n'));
    };
    this.neg8 = function () {
        var f = (this.r1 ? 'C' : 'c') + ((this.r1 == 0x80) ? 'V' : 'v');
        this.r1 = (0x100 - this.r1) & 0xff;
        this.cpu.flags(f + (this.r1 ? 'z' : 'Z') + ((this.r1 & 0x80) ? 'N' : 'n'));
    };
    this.com8 = function () {
        var f = 'vC';
        this.r1 = (this.r1 ^ 0xff) & 0xff;
        this.cpu.flags(f + (this.r1 ? 'z' : 'Z') + ((this.r1 & 0x80) ? 'N' : 'n'));
    };
    this.lsr8 = function () {
        var f = 'n' + ((this.r1 & 0x01) ? 'C' : 'c');
        this.r1 = (this.r1 >>> 1) & 0xff;
        this.cpu.flags(f + (this.r1 ? 'z' : 'Z'));
    };
    this.ror8 = function () {
        var f = 'n' + ((this.r1 & 0x01) ? 'C' : 'c');
        var carry = this.cpu.flagCheck('C') ? 0x80 : 0;
        this.r1 = ((this.r1 >>> 1) | carry) & 0xff;
        this.cpu.flags(f + (this.r1 ? 'z' : 'Z'));
    };
    this.asr8 = function () {
        var f = (this.r1 & 0x01) ? 'C' : 'c';
        var sign = this.r1 & 0x80;
        this.r1 = ((this.r1 >>> 1) | sign) & 0xff;
        this.cpu.flags(f + (this.r1 ? 'z' : 'Z') + ((this.r1 & 0x80) ? 'N' : 'n'));
    };
    this.lsl8 = function () {
        var sign = this.r1 & 0x80;
        var f = sign ? 'C' : 'c';
        this.r1 = (this.r1 << 1) & 0xff;
        this.cpu.flags(
            f + (((this.r1 & 0x80) != sign) ? 'V' : 'v') + (this.r1 ? 'z' : 'Z') + ((this.r1 & 0x80) ? 'N' : 'n'));
    };
    this.rol8 = function () {
        var sign = this.r1 & 0x80;
        var carry = this.cpu.flagCheck('C') ? 0x01 : 0;
        var f = sign ? 'C' : 'c';
        this.r1 = ((this.r1 << 1) | carry) & 0xff;
        this.cpu.flags(
            f + (((this.r1 & 0x80) != sign) ? 'V' : 'v') + (this.r1 ? 'z' : 'Z') + ((this.r1 & 0x80) ? 'N' : 'n'));
    };
    this.sx = function () {
        // sign extend r1
        this.r1 &= 0xff;
        this.r1 |= (this.r1 & 0x80) ? 0xff00 : 0;
    };
    this.shft = function () {
        // shift high byte to low byte of r1
        this.r1 = this.r1 >>> 8;
        var f = this.r1 ? 'z' : 'Z';
        this.cpu.flags(f + ((this.r1 & 0x80) ? 'N' : 'n'));
    };
    this.daa = function () {
        var f;
        var b = this.regs['regA'].regValue;
        trc('DAA b', b);
        var hn = b >>> 4;
        var ln = b & 0x0f;
        trc('DAA ln', ln);
        if (this.cpu.flagCheck('C') || (hn > 9) || ((hn > 8) && (ln > 9))) {
            hn += 6;
        }
        if (this.cpu.flagCheck('H') || (ln > 9)) {
            ln += 6;
            hn += 1;
        }
        f = (hn & 0x10) ? 'C' : 'c';
        b = ((hn & 0x0f) << 4) | (ln & 0x0f);
        this.regs['regA'].change(b, 0);
        this.cpu.flags(f + (b ? 'z' : 'Z') + ((b & 0x80) ? 'N' : 'n'));
    };
    this.indx = function () {
// process indexing post byte, leaving effective address in EA, index register in indexReg, auto-increment in indexInc
        var offset = 0;
        var indirect = 0;
        this.indexReg = '';
        this.indexInc = 0;
        this.indexBase = 0;
        this.pcb();
//    trc ("Index postbyte",inHex(this.r1,2));
// find index register name
        switch ((this.r1 & 0x60) >>> 5) {
            case 0:
                this.indexReg = 'regX';
                break;
            case 1:
                this.indexReg = 'regY';
                break;
            case 2:
                this.indexReg = 'regU';
                break;
            case 3:
                this.indexReg = 'regS';
                break;
        }
// extract 5 bit offset
        if (!(this.r1 & 0x80)) {
            offset = (this.r1 & 0x10) ? (this.r1 & 0x0f) - 0x10 : (this.r1 & 0x0f);
        } else {
            indirect = this.r1 & 0x10;
            switch (this.r1 & 0x0f) {
                case 0x00:
                    this.indexInc = 1;
                    break;
                case 0x01:
                    this.indexInc = 2;
                    break;
                case 0x02:
                    this.indexInc = -1;
                    break;
                case 0x03:
                    this.indexInc = -2;
                    break;
                case 0x04:
                    break;
                case 0x05:
                    offset = signed8(this.regs['regB'].regValue);
                    break;
                case 0x06:
                    offset = signed8(this.regs['regA'].regValue);
                    break;
                case 0x07:
                    break;
                case 0x08:
                    this.pcb();
                    offset = signed8(this.r1);
                    break;
                case 0x09:
                    this.pcw();
                    offset = signed16(this.r1);
                    break;
                case 0x0A:
                    break;
                case 0x0B:
                    offset = signed16(this.ld('regD'));
                    break;
                case 0x0C:
                    this.indexReg = 'regPC';
                    this.pcb();
                    offset = signed8(this.r1);
                    break;
                case 0x0D:
                    this.indexReg = 'regPC';
                    this.pcw();
                    offset = signed16(this.r1);
                    break;
                case 0x0E:
                    break;
                case 0X0F:
                    this.indexReg = '';
                    this.pcw();
                    offset = signed16(this.r1);
                    break;
            }
        }
        if (this.indexReg) {
//      trc ("Index postbyte regname",this.indexReg);
            this.indexBase = this.regs[this.indexReg].regValue;
//        trc ("Index postbyte reg",this.indexBase);
// perform pre-decrement, leave post-increment for later
            if (this.indexInc < 0) {
                this.indexBase += this.indexInc;
                this.regs[this.indexReg].change(this.indexBase & 0xffff, 0);
            }
        }
        this.ea = this.indexBase + offset;
        if (indirect) {
            trc('Indirection from', inHex(this.ea, 4));
            this.ftch16(this.ea);
            this.ea = this.r1;
            trc('Indirection ea', inHex(this.ea, 4));
        }
//    trc ("indexInc",this.indexInc);
    };
    this.idxu = function () {
//    trc ("Index update",this.indexInc);
//    trc ("Index update",this.indexBase);
        if (this.indexInc > 0) {
            this.regs[this.indexReg].change((this.indexBase + this.indexInc) & 0xffff, 0);
        }
    };
    this.pcb = function () {
        // read byte from PC+ to r1, leaving updated PC in ea
        this.ea = this.regs['regPC'].regValue;
//    trc ("PCB ea", inHex (this.ea));
        this.r1 = this.cpu.ram.peek(this.ea);
//    trc ("PCB r1", inHex (this.r1));
        this.ea = this.cpu.ram.wrap(this.ea + 1);
        this.regs['regPC'].setValue(this.ea);
    };
    this.pcw = function () {
        // read word from PC++ to r1, leaving updated PC in ea
        this.ea = this.regs['regPC'].regValue;
//    trc ("PCW ea", inHex (this.ea));
        this.r1 = this.cpu.ram.peek(this.ea);
        this.ea = this.cpu.ram.wrap(this.ea + 1);
        this.r1 = (this.r1 << 8) + this.cpu.ram.peek(this.ea);
//    trc ("PCW r1", inHex (this.r1));
        this.ea = this.cpu.ram.wrap(this.ea + 1);
        this.regs['regPC'].setValue(this.ea);
    };
    this.rel8 = function () {
        // find address via 8 bit PCR and leave in r1
        this.pcb();
        this.r1 |= this.r1 & 0x80 ? 0xff00 : 0;
        this.r1 = this.cpu.ram.wrap(this.ea + this.r1);
    };
    this.rel16 = function () {
        // find address via 16 bit PCR and leave in r1
        this.pcw();
        this.r1 = this.cpu.ram.wrap(this.ea + this.r1);
    };
    this.drct = function () {
        // set ea via direct addressing
        this.pcb();
        this.ea = (this.regs['regDP'].regValue << 8) + this.r1;
    };
    this.ea1 = function () {
        this.r1 = this.ea;
    };
    this.ea2 = function () {
        this.r2 = this.ea;
    };
    this.xtnd = function () {
        // set ea via extended addressing
        this.pcw();
        this.ea = this.r1;
    };
    this.pull8 = function (operand) {
        this.ea = this.regs[operand].regValue;
        this.r1 = this.cpu.ram.peek(this.ea);
        this.regs[operand].change(this.cpu.ram.wrap(this.ea + 1), 0);
    };
    this.pull16 = function (operand) {
        this.ea = this.regs[operand].regValue;
        this.r1 = (this.cpu.ram.peek(this.ea) << 8) | (this.cpu.ram.peek(this.cpu.ram.wrap(this.ea + 1)));
        this.regs[operand].change(this.cpu.ram.wrap(this.ea + 2), 0);
    };
    this.ftch8 = function () {
        this.eaLast = this.ea;
        this.r1 = this.cpu.ram.peek(this.ea);
    };
    this.ftch16 = function () {
        this.eaLast = this.ea;
        this.r1 = (this.cpu.ram.peek(this.ea) << 8) + this.cpu.ram.peek(this.cpu.ram.wrap(this.ea + 1));
    };
    this.stor8 = function () {
        this.eaLast = this.ea;
        this.cpu.ram.poke(this.ea, this.r1);
    };
    this.stor16 = function () {
        this.eaLast = this.ea;
        this.cpu.ram.poke(this.ea, this.r1 >>> 8);
        this.cpu.ram.poke(this.cpu.ram.wrap(this.ea + 1), this.r1);
    };
    this.r1ea = function () {
        this.ea = this.r1;
    };
//  this.adda=function () {
//    this.r1=this.cpu.ram.wrap (this.r1+this.ea);
//    trc ("ADDA", inHex (this.r1,4));
//  }
    this.ntck = function () {
        this.notick = 1;
    };
};

function watchWindow(id, cpuOwner, firstAddress) {
    this.table = null;
    this.cpu = cpuOwner;
    this.lastWatch = null;
    this.update = function (holder, address, value) {
        trc('Watchwindow update', inHex(address, 4));
        if (!this.cpu.refreshOn) {
            return;
        }
        var row;
        var base = this.cpu.ram.wrap(address & 0xfff0);
        var baseText = inHex(base, 4);
        var rowNo = 0;
//    trc ('watch update address', inHex (address, 4),1);
        while (rowNo < this.table.rows.length) {
            row = this.table.rows[rowNo];
            if (row.cells[1].innerText == baseText) {
                this.setHex(row, base);
            }
            rowNo++;
        }
//    this.table.rows.length
    };
    this.refresh = function (force) {
        var i;
        if (!(this.cpu.refreshOn || force)) {
            return;
        }
//    trc ("watchwindow refresh this", this, 1);
//    console.dir (this);
        for (i = 0; i < this.table.rows.length; i++) {
//      trc ('watchWindow refresh row', i,1);
//      trc ('address',this.table.rows[i].cells[1].innerText,1);
            this.setHex(this.table.rows[i], parseInt('0x' + this.table.rows[i].cells[1].innerText));
        }
    };
    this.createTable = function (tableId) {
        var container;
        if (container = document.getElementById(tableId + '-container')) {
            trc('Found container', tableId);
            this.table = document.createElement('table');
            this.table.setAttribute('id', tableId);
            this.table.className = 'watchWindow';
            container.appendChild(this.table);
        }
    };
    this.setHex = function (row, base) {
        var i;
        var bytes = '';
        for (i = 0; i < 0x10; i++) {
            row.cells[i + 2].innerText = inHex(this.cpu.ram.peek(base + i), 2);
        }
    };
    this.addWatch = function (address) {
        var base, i;
        var hexCells = [];
        var newRow = this.table.insertRow();
        var offCell = newRow.insertCell();
        var addrCell = newRow.insertCell();
        var cpuOwner = this.cpu;
        trc('addWatch', 0);
        for (i = 0; i < 0x10; i++) {
            hexCells[i] = newRow.insertCell();
            hexCells[i].className = 'watchHex';
            (function (ram, cellNo, register) {
                hexCells[cellNo].onclick = function (event) {
                    hexCells[cellNo].innerText = inHex(register.regValue, 2);
                    ram.poke(base + cellNo, register.regValue);
                };
            })(this.cpu.ram, i, this.cpu.registers['regA']);
            (function (ram, cellNo, register) {
                hexCells[cellNo].oncontextmenu = function (event) {
                    event.preventDefault();
                    hexCells[cellNo].innerText = inHex(register.regValue, 2);
                    ram.poke(base + cellNo, register.regValue);
                    return false;
                };
            })(this.cpu.ram, i, this.cpu.registers['regB']);
        }

        function removeWatch(row) {
            trc('removeWatch ', row.cells[1].innerText);
            cpuOwner.ram.removeWindow(parseInt(row.cells[1].innerText, 16), 0x10);
            row.parentNode.removeChild(row);
        }

        offCell.className = 'watchControl';
        offCell.innerHTML = '&#x2718;';
        offCell.onclick = function (event) {
            removeWatch(event.target.parentNode);
        };
        addrCell.className = 'watchAddr';
        base = this.cpu.ram.wrap(address & 0xfff0);
        addrCell.innerText = inHex(base, 4);
        this.setHex(newRow, base);
        this.cpu.ram.addWindow(this, base, 0x10);
//    trc ("addwatch base",inHex(base,4),1);
        this.lastWatch = base;
    };
    this.createTable(id);
    this.addWatch(firstAddress);
}

function labelList(id, cpuOwner) {
    this.cpu = cpuOwner;
    this.list = null;
    this.createList = function (listId) {
        var container;
        trc('labeList id', listId);
        if (container = document.getElementById(listId + '-container')) {
            trc('LabelList container', '');
            this.list = document.createElement('select');
//      this.list.setAttribute ('id', 'listId');
//      this.list.setAttribute ('id', listId);
            this.list.setAttribute('size', '30');
//      this.list.style='flex-grow: 1';
            this.list.className = 'labelsContainer';
            container.appendChild(this.list);
        }
    };
    this.fill = function (labels) {
        var label, option;
        trc('Labels fill', 0);
//    console.log (labels);
        for (label in labels) {
            option = document.createElement('option');
//      option=new Option (label, 1);
            option.text = label;
            option.value = 1;
//      option.innerText=label;
//      option.appendChild(document.createTextNode(label));
            trc('Label: ', label);
            option.className = 'labelList';
            (function (cpuOwner, optLabel) {
                option.onclick = function (event) {
//          cpuOwner.dsmTable.lineOff ();
                    trc('reloadtable call label \'' + optLabel + '\' value', labels[optLabel]);
                    cpuOwner.dsmTable.reloadTable(labels[optLabel]);
                    cpuOwner.dsmTable.lineOn(cpuOwner.registers['regPC'].regValue, true, true);
                };
            }(this.cpu, label));
            this.list.add(option);
        }
    };
    this.empty = function () {
        while (this.list.length > 0) {
            this.list.remove(this.list.length - 1);
        }
    };
    this.createList(id);
}

function DSMWindow(id, cpu, rows) {
    this.lineMap = [];
    this.lineHi = null;
    this.table = null;
    this.cpuOwner = cpu;
    this.rowCount = rows;
    this.editContents = null;
    this.baseAddress = 0;
    this.codeLength = 0;
    this.watch = null;
    this.createTable = function (tableId) {
        var newRow, container, rowNo;

        function newCell(thisRow, cellClass, content) {
            var cell = thisRow.insertCell();
            cell.className = cellClass;
            cell.innerHTML = content;
//      console.dir (cell);
        }

        trc('createTable tableId', tableId);
        if (container = document.getElementById(tableId + '-container')) {
            trc('Found container, rows', this.rowCount);
            this.table = document.createElement('table');
            this.table.setAttribute('id', 'tableId');
            this.table.style.backgroundColor = 'black';
            this.table.className = 'DSM';
            for (rowNo = 1; rowNo <= this.rowCount; rowNo++) {
                trc('newRow', rowNo);
                newRow = this.table.insertRow();
                newCell(newRow, 'DSM ADDR', 'addr &nbsp;');
                newCell(newRow, 'DSM BYTES', 'bytes &nbsp;');
                newCell(newRow, 'DSM MNEM', 'mnem &nbsp;');
            }
            container.appendChild(this.table);
        }
    };
    this.setRow = function (rowNo, code, cpu) {
        var row, address, bytes, mnemonic;

        function jump(event) {
            event.preventDefault();
            if (!cpu.cellEditing) {
                cpu.closeEdit(false);
                cpu.jumpTo(cpu, code.address);
            }
            return false;
        }

//    trc ("setRow", rowNo);
        if (this.table && (rowNo < this.table.rows.length)) {
            row = this.table.rows[rowNo];
            bytes = '';
            if (code) {
                this.lineMap[code.address] = row;
//        row.onclick=function (event) { cpu.closeEdit (false); cpu.jumpTo (cpu, code.address) }
                address = inHex(code.address, 4) + ':';
//        trc ("Setting dsm table address",inHex (address,4));
                for (let i = 0; i < code.maxInstructionLength; i++) {
                    if (i < code.bytes.length) {
                        bytes += inHex(code.bytes[i], 2) + ' ';
                        this.codeLength++;
                    } else {
                        bytes += '&nbsp;&nbsp; ';
                    }
                }
                mnemonic = code.operation + ' ' + code.operand;
            } else {
                address = '';
                mnemonic = '&nbsp;';
            }
            row.cells[0].innerHTML = address;
            row.cells[0].oncontextmenu = function (event) {
                cpu.setBreakpoint(cpu, event, code.address);
                return false;
            };
            row.cells[0].onclick = jump;
            row.cells[0].style.backgroundColor = (code.address in cpu.breakpoints) ? 'red' : '';
            row.cells[1].innerHTML = bytes;
            row.cells[1].onclick = jump;
            row.cells[2].innerHTML = mnemonic;
            row.cells[2].onclick = jump;
            row.cells[2].oncontextmenu = function (event) {
                if (cpu.cellEditing) {
                    cpu.cellEditing.input.focus();
                    return false;
                }
                cpu.editCode(cpu, event, code.address);
                event.preventDefault();
                return false;
            };
        }
    };
    this.reloadTable = function (address) {
        if (this.watch != null) {
            this.cpuOwner.ram.removeWindow(0, 0, this.watch);
            this.watch = null;
        }
        this.setTable(this.cpuOwner.disassemble(address, 0x10000, this.cpuOwner.dsmTableSize));
    };
    this.lineOff = function () {
        if (this.lineHi) {
            this.lineHi.className = 'DSMlo';
            this.lineHi = null;
        }
    };
    this.lineOn = function (address, force, notRequired) {
        var disassembly;
        if (!(this.cpuOwner.refreshOn || force)) {
            return;
        }
        trc('lineOn address', inHex(address, 4));
        this.lineOff();
        if (!(address in this.lineMap)) {
            if (notRequired) {
                return;
            } else {
                this.reloadTable(address);
            }
        }
        this.lineHi = this.lineMap[address];
        this.lineHi.className = 'DSMhi';
    };
    this.setTable = function (lines) {
        var i;
        trc('setTable for code lines count', lines.length);
        this.lineMap = [];
        this.baseAddress = lines[0].address;
        this.codeLength = 0;
        if (this.table) {
            trc('this.table rows length', this.table.rows.length);
            for (i = 0; i < this.table.rows.length; i++) {
//        trc ("this.table row", i);
                this.setRow(i, (i < lines.length) ? lines[i] : null, this.cpuOwner);
            }
            this.watch = this.cpuOwner.ram.addWindow(this, this.baseAddress, this.codeLength);
            trc('Add DASM watch length', this.codeLength);
        }
    };
    this.doTrace = function () {
        trc('DSMWindow doTrace', 0);
    };
    this.update = function (holder, address, value) {
        trc('DASM window update address', inHex(address, 4));
        holder.doTrace();
        trc('Assembling', holder.cpuOwner.assembling);
        if ((holder.cpuOwner.cellEditing == null) && (holder.cpuOwner.assembling == false)) {
            holder.reloadTable(holder.baseAddress);
        }
    };
    this.createTable(id);
}

function GraphicsScreen(videoRAM, videoBase, width, height, colours, zoom) {
    this.ram = videoRAM;
    this.base = videoBase;
    this.wide = width;
    this.high = height;
    this.scale = zoom;
    this.bitsPerPixel = 1;
    this.sourceBitmap = null;
    this.canvas = null;
    this.colourMap = [
        '#000000', '#a00000', '#00a000', '#a0a000', '#0000a0', '#a000a0', '#00a0a0', '#808080',
        '#404040', '#ff0000', '#00ff00', '#ffff00', '#0000ff', '#ff00ff', '#00ffff', '#ffffff'];
    this.palettes = [[], [0, 2], [0, 9, 2, 12], [], [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15]];
    this.setMode = function (colours) {
        switch (colours) {
            case 2:
                this.bitsPerPixel = 1;
                break;
            case 4:
                this.bitsPerPixel = 2;
                break;
            case 16:
                this.bitsPerPixel = 4;
                break;
            default:
                this.bitsPerPixel = 1;
                break;
        }
    };
    this.clearScreen = function () {
        var ctx = this.canvas.getContext('2d');
        ctx.fillStyle = this.colourMap[0];
        ctx.fillRect(0, 0, this.wide * this.scale, this.high * this.scale);
    };
    this.clearVideoRAM = function (colourByte) {
        var x;
        for (x = this.base; x < this.base + this.high * Defaults.lineBytes; x++) {
            this.ram.poke(x, colourByte);
        }
    };
    this.update = function (holder, address, value) {
        var pixel, dx, dy;
        var byte = value;
        switch (this.bitsPerPixel) {
            case 1:
                dx = 1;
                dy = 1;
                break;
            case 2:
                dx = 2;
                dy = 1;
                break;
            case 4:
                dx = 2;
                dy = 2;
                break;
        }
        var xPos = ((address - this.base) & ((Defaults.lineBytes * dy) - 1)) * (8 / dy);
        var yPos = Math.trunc((address - this.base) / (Defaults.lineBytes * dy)) * dy;
        var ctx = this.canvas.getContext('2d');
        for (let i = 0; i < 8; i += this.bitsPerPixel) {
//      trc ("byte",inHex(byte,2),true);
            byte <<= this.bitsPerPixel;
            pixel = byte >>> 8;
//      trc ("Pixel",inHex(pixel,2),true);
            byte &= 0xff;
            ctx.fillStyle = this.colourMap[this.palettes[this.bitsPerPixel][pixel]];
//      trc ("Colour",this.colourMap[this.palettes[this.bitsPerPixel][pixel]],true);
            ctx.fillRect(xPos * this.scale, yPos * this.scale, this.scale * dx, this.scale * dy);
            xPos += dx;
        }
    };
    if (this.canvas = document.getElementById('graphicsScreen')) {
        this.setMode(colours);
        this.clearScreen();
        this.ram.addWindow(this, this.base, (this.wide * this.high) / 8);
    }

}

function TextScreen(videoRAM, videoBase, width, height) {
    this.ram = videoRAM;
    this.base = videoBase;
    this.wide = width;
    this.high = height;
    this.charSet = '@ABCDEFGHIJKLMNO' + 'PQRSTUVWXYZ[\\]\u2191\u2190' + ' !"#$%&\'()*+,-./' + '0123456789:;<=>?';
    this.update = function (holder, address, value) {
        var cell;
        var element = document.getElementById('txtScreenTable');
        if (element) {
            trc('Update element found', '');
//      console.dir (holder);
            cell = element.rows[Math.trunc((address - holder.base) / width)].cells[Math.trunc(
                (address - holder.base) % width)];
            if (cell) {
                if (value >= 0x80) {
                    cell.innerHTML = blockChars[value & 0x0f];
                    cell.className = blockClasses[(value & 0x70) >> 4];
                } else {
                    if ((value & 0x3f) == 0x20) {
                        cell.innerHTML = '&nbsp;';
                    } else {
                        cell.innerHTML = holder.charSet[value & 0x3f];
                    }
                    switch (value & 0x40) {
                        case 0:
                            cell.className = 'txtBG';
                            break;
                        case 0x40:
                            cell.className = 'txtFG';
                            break;
                    }
                }
            }
        }
    };
    this.createScreenTable = function (tableId, width, height) {
        var rows, cells, newRow, newCell, container, table;
        table = null;
        if (container = document.getElementById(tableId + '-container')) {
//      trc ("Found table container", tableId,1);
            table = document.createElement('table');
            table.setAttribute('id', tableId);
            table.setAttribute('tabindex', 0);
            table.className = 'txtScreen';
            for (rows = 0; rows < height; rows++) {
                newRow = document.createElement('tr');
                for (cells = 0; cells < width; cells++) {
                    newCell = document.createElement('td');
                    newCell.className = 'txtBG';
                    newCell.innerText = '@';
                    newRow.appendChild(newCell);
                }
                table.appendChild(newRow);
                table.addEventListener('keypress', keyPressHandler);
            }
            container.appendChild(table);
        }
        return table;
    };
    this.ram.addWindow(this, this.base, this.wide * this.high);
    this.table = this.createScreenTable('txtScreenTable', 32, 16);
}

function keyPressHandler(event) {
    mc6809.keyBuffer.push(event.key);
    event.preventDefault();
}

function codeBlock(startAddr) {
    this.base = startAddr;
    this.bytes = [];
    this.addCode = function (code) {
        trc('addCode', code);
        this.bytes = this.bytes.concat(code);
    };
    this.writeCode = function () {
        return ('this.ram.fill (0x' + inHex(this.base, 4) + ', ' + JSON.stringify(this.bytes) + ');');
    };
}

function CPU() {
    this.flagBits = {C: 1, V: 2, Z: 4, N: 8, I: 16, H: 32, F: 64, E: 128};
    this.registers = [];
    this.ops = ops6809;
    this.ram = new memory8(64 * 1024);
    this.videoRAM = new TextScreen(this.ram, 0x400, 32, 16);
    this.graphicsRAM = new GraphicsScreen(this.ram, 0x600, 256, 192, 2, 2);
    this.dsmTableSize = 30;
    this.dsmTable = new DSMWindow('DSMTable', this, this.dsmTableSize);
    this.labelMap = new labelList('labelMap', this);
    this.watchList = null;
    this.asmText = '';
    this.labels = [];
    this.mapLabels = [];
    this.mapAddrs = [];
    this.lastLabel = '';
    this.codeBlocks = [];
    this.opPage = 0;
    this.ended = false;
    this.dpVal = 0;
    this.dpUse = false;
    this.pcVal = null;
    this.passNo = 0;
    this.assembling = false;
    this.intervalID = null;
    this.irqID = null;
    this.firqID = null;
    this.irqMils = 500;
    this.firqMils = 50;
    this.asmIntervalID = null;
    this.asmIntervalMils = 2;
    this.asmProgram = [];
    this.asmLineNo = 0;
    this.passes = 3;
    this.hexInputCell = null;
    this.hexInputCellNo = 0;
    this.hexInputRegister = null;
    this.intervalMils = 1000;
    this.intervalTimes = 1;
    this.speedMils = {'1': 1000, '2': 500, '3': 250, '4': 100, '5': 50, '6': 25, '7': 10, '8': 5, '9': 2, '10': 1};
    this.speedMils = {
        '1': 1000,
        '2': 500,
        '3': 250,
        '4': 100,
        '5': 50,
        '6': 10,
        '7': 1,
        '8': 0.1,
        '9': 0.01,
        '10': 0.002,
    };
    this.refreshOn = true;
    this.SI = null;
    this.breakpoints = [];
    this.breakpoints[Defaults.org] = true;
    this.defaultStart = 0x4000;
    this.cellEditing = null;
    this.keyBuffer = [];
    this.closeEdit = function (updateValue) {
        var newValue;
        trc('closeEdit, update=', updateValue);
        if (this.cellEditing) {
            if (updateValue) {
                newValue = this.cellEditing.verify();
                if (newValue == null) {
                    return false;
                }
            } else {
                newValue = this.cellEditing.oldContents;
            }
            trc('newValue', newValue);
            this.cellEditing.parent.removeChild(this.cellEditing.input);
            this.cellEditing.parent.innerText = newValue;
            this.cellEditing = null;
            this.dsmTable.reloadTable(this.dsmTable.baseAddress);
            return true;
        } else {
            return false;
        }
    };
    this.flags = function (flagList) {
        var i, flagsV, c, cu, b;
        flagsV = this.registers['regCC'].regValue;
//    trc ("Flags in", inHex (this.registers['regCC'].regValue, 2));
//    trc ("Flags list", flagList);

        for (i = 0; i < flagList.length; i++) {
            c = flagList[i];
            cu = c.toUpperCase(c);
            b = this.flagBits[cu];
            flagsV &= ~b;
            if (c == cu) {
                flagsV |= b;
            }
        }
        this.registers['regCC'].change(flagsV, 0);
//    trc ("Flags out", inHex (this.registers['regCC'].regValue, 2));
    };
    this.flagCheck = function (flag) {
        var flagsV = this.registers['regCC'].regValue;
        trc('flagCheck', flagsV);
        trc('flagCheck', this.flagBits[flag]);
        return (this.registers['regCC'].regValue & this.flagBits[flag]) ? 1 : 0;
    };
    this.addReg = function (called, size, n, usebinary) {
        trc('CPU addReg', 'reg' + called);
        this.registers['reg' + called] = new Register(called, size, n, this, usebinary);
    };
    this.refresh = function (force) {
        var key, refresh;
        for (key in this.registers) {
            this.registers[key].refresh(force);
        }
        this.registers['regPC'].notify = 1;
        this.dsmTable.lineOn(this.registers['regPC'].regValue, force);
        this.watchList.refresh(force);
    };
    this.notify = function (regName, force) {
//    trc ("Notify", regName);
        switch (regName) {
            case 'regPC':
                this.dsmTable.lineOn(this.registers['regPC'].regValue, force);
                break;
        }
    };
    this.opFind = function (opcode, page) {
        var instruction = this.ops.find(function (element) {
            return (element.op == opcode) && (element.page == page);
        });
        if (instruction) {
            return instruction;
        } else {
            trc('Opfind failed for ', opcode);
        }
    };
    this.mnemFind = function (mnemonic, mode) {
        var instruction = this.ops.find(function (element) {
            return (element.mnem == mnemonic) && (element.mode & mode);
        });
        if (instruction) {
            return instruction;
        } else {
            trc('Mnemfind failed for', mnemonic);
        }
    };
    this.pcr = function (target, bits, pcIn) {
        trc('this.pcr pcIn', inHex(pcIn, 4));
        var pc = this.ram.wrap(pcIn + ((bits == 8) ? 1 : 2));
        trc('PCR pc value', inHex(pc, 4), 0);
        trc('PCR target', inHex(target, 4), 0);
        trc('PCR bits', bits, 0);
        var n = this.nextVal(target, false);
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
                    this.error('PC relative offset (\'' + inHex(target, 4) + '\') outside 8 bit range', n);
                }
                return [n, n & 0xff];
            case 0:
            case 15:
            case 16:
                if (((n < -0x8000) || (n >= 0x10000)) && (this.passNo > 1)) {
                    this.error('PC relative offset (\'' + target + '\') outside 16 bit range', n);
                }
                return [n, (n & 0xffff) >>> 8, n & 0xff];
        }
    };
    this.findLabel = function (asmLabel) {
        var key, matches;
        if (matches = /\s*([a-z\_][\w\_]*)/i.exec(asmLabel)) {
            key = matches[1].toUpperCase();
            if (key in this.labels) {
                trc('Found label \'' + key + '\' of value', inHex(this.labels[key], 4));
                return this.labels[key];
            }
        }
    };
    this.assignLabel = function (asmLabel, operand) {
        var key = asmLabel.toUpperCase();
        trc('Assigning label (' + key + ') with', inHex(operand, 4));
        if ((this.findLabel(key) != null) && (this.passNo == 1)) {
            this.error('Attempt to redefine label', key);
            return 0;
        } else {
            this.labels[key] = operand;
            return 1;
        }
    };
    this.addMapLabel = function (asmLabel, value) {
        trc('Setting map label \'' + asmLabel + '\' with value', value);
//    if (!(this.excludeOSLabels && (value>=Defaults.OSBase))) {
        this.mapLabels[asmLabel] = value;
        this.mapAddrs[inHex(value, 4)] = asmLabel;
//    }
    };
    this.nextVal = function (expressionIn, needsValue) {
        var matches, value, valueNum, minus, radix;
        var total = 0;
        var valid = false;
        var matchValue = /^\s*((\'(.))|(\-|\+|)(\$|\%|0x|)([\w\_]+))/i;
        var expression = String(expressionIn);
        trc('nextVal input', expression, 0);
        while (matches = matchValue.exec(expression)) {
            minus = 0;
            radix = 10;
            if (matches[3]) {
                trc('matches[3]', matches[3], 0);
                valueNum = matches[3].charCodeAt();
            } else {
                value = matches[6].toUpperCase();
                trc('nextVal item', value, 0);
                trc('nextVal radix', matches[5], 0);
                trc('matches[5] "' + matches[5] + '"  ', matches[5].charCodeAt(), 0);
                if (matches[4] === '-') {
                    minus = 1;
                }
                if ((matches[5] === '$') || (matches[5].toUpperCase() === '0X')) {
                    radix = 16;
                }
                if (matches[5] === '%') {
                    radix = 2;
                }
                if ((radix <= 10) && value.match(/^[A-Z\_]/)) {
                    trc('findlabel value', value);
                    valueNum = this.findLabel(value);
                    if (valueNum == null) {
                        if ((this.passNo > 1) || (needsValue)) {
                            this.error('Unable to resolve label');
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
                this.error('Can\'t read numeric value', valueNum);
                return;
            }
            total = total + valueNum;
            valid = true;
            trc('Total', inHex(total, 4));
            trc('Increment', inHex(valueNum, 4));
            trc('Expression', expression);
            expression = expression.substr(matches[0].length);
        }
        if ((total < -32768) || (total >= 0x10000)) {
            this.error('Constant out of range (' + total + ')', expressionIn);
        }
        if (valid) {
            return total;
        } else {
            this.error('Unable to interpret expression\'' + expression + '\'');
        }
    };
    this.parseVal = function (s) {
        var n = Number(s);
        if (isNAN(n)) {
            this.error('Number expected \'' + s + '\'');
        } else {
            return n;
        }
    };
    this.parseSizedVal = function (s, noError, dp, useDp) {
        var matches, bits, value;
        bits = 0;
        trc('ParseSizedVal', s);
        matches = /\s*(\<|\>)(.+)/.exec(s);
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
            value = this.nextVal(matches[2], false);
//      trc ("Value",inHex (value, 4), false);
        } else {
            value = this.nextVal(s, false);
        }
        if (value != null) {
            switch (bits) {
                case 16:
                    if (((value < -32768) || (value >= 65536)) && (!noError)) {
                        this.error('Constant out of 16 bit range', value);
                    }
                    break;
                case 8:
                    if (useDp) {
                        value = (value - (dp << 8) & 0xffff);
                    }
                    if (((value < -128) || (value >= 256)) && (!noError)) {
                        this.error('Constant out of 8 bit range', value);
                    }
                    break;
            }
        }
        return [value, bits];
    };
    this.opSize = function (n) {
        var bits = 7;
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
    this.pairPostByte = function (s) {
        var reg1, reg2;

        function getRegister(regText) {
            trc('getRegister', regText);
            if (regText in pairRegsToValue) {
                return pairRegsToValue[regText];
            }
        }

        trc('pairPostByte', s);
        var matches = /(\w+)\s*\,\s*(\w+)/.exec(s);
        reg1 = getRegister(matches[1].toUpperCase());
        reg2 = getRegister(matches[2].toUpperCase());
        if ((reg1 != null) && (reg2 != null)) {
            return ((reg1 << 4) | reg2);
        } else {
            this.error('Syntax error in register pair postbyte: \'' + s + '\'');
        }
    };
    this.fullPostByte = function (mnemonic, registerString) {
        var i, reg;
        var postByte = 0;
        var thisStack = mnemonic[mnemonic.length - 1].toUpperCase();
        var regList = registerString.split(',');
        trc('fullPostByte thisStack', thisStack);
        for (i = 0; i < regList.length; i++) {
            reg = regList[i].trim().toUpperCase();
            trc('fullPostByte register', reg);
            if (reg in fullRegsToValue) {
                if (reg === thisStack) {
                    this.error('Can\'t stack register on its own stack', reg);
                } else {
                    postByte |= fullRegsToValue[reg];
                }
            } else {
                if (reg.match(/\w/)) {
                    this.error('Unknown register', reg);
                }
            }
        }
        return postByte;
    };
    this.getIndexMode = function (s) {
// determine index register and autoincrement, return index=-1 if error;
        var matches, index, increment;
        index = -1;
        increment = 0;
        trc('getIndexMode', s);
        matches = /\s*(\-{0,2})([A-z]{1,3})(\+{0,2})/.exec(s.toUpperCase());
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
                    this.error('Unrecognised index register', matches[2]);
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
                    this.error('Index mode error: Can\'t have increment and decrement at the same time', s);
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
            this.error('Syntax error in index register expression', s);
        }
        return [index, increment];
    };
    this.adrMode = function (opMode, s, pcrVal) {
        var matches, bits, forceBits, value, mode, indirect, indexmode, increment, postByte, offset, values,
            signedValue,
            withDPValue;
//    var matches=/^(\#|\<|\>)(.+)/.exec(s);
        indirect = 0;
        postByte = -1;
        let hasValue = false;
        value = 0;
        bits = 0;
        forceBits = 0;
        if (matches = /\s*\#\s*(.+)/.exec(s)) {
//      trc ("Immediate mode", matches[1],0);
            value = this.nextVal(matches[1], false);
//      trc ("this.nextVal", value, 0);
            bits = (opMode & modes.bits16) ? 16 : 8;
            mode = modes.immediate;
        } else {
            if (matches = /\s*[\(\[]\s*(.+?)[\)\]]\s*/.exec(s)) {
                trc('Indirect addressing', matches[1], 0);
                s = matches[1];
                indirect = 1;
            }
            if (matches = /\s*(\S*?)\s*\,\s*(\S+)/.exec(s)) {
                offset = matches[1].toUpperCase();
                trc('Indexed addressing', matches[2], 0);
                trc('Offset', offset, 0);
                mode = modes.indexed;
                [indexmode, increment] = this.getIndexMode(matches[2]);
                if (offset) {
                    if (matches = /^(B|A|D)$/.exec(offset)) {
                        trc('Register offset', matches[1]);
                        indexmode |= {'B': 0x05, 'A': 0x06, 'D': 0x0B}[matches[1]] | 0x80;
                    } else {
                        trc('Constant offset', inHex(offset, 4));
                        [value, forceBits] = this.parseSizedVal(offset, true, 0, false);
                        hasValue = true;
                        trc('forcebits=' + forceBits, value, 0);
                    }
                }
                trc('indexmode', indexmode, 0);
                trc('increment', increment, 0);
                postByte = indexmode | increment;
                if (increment) {
                    if ((hasValue) && (value !== 0)) {
                        this.error('Indexing error: can\'t have offset with auto inc/decrement', value);
                    }
                } else {
                    trc('non-autoinc mode postByte', inHex(postByte, 2));
                    if ((indexmode < 0x80) && (value === 0)) {
                        postByte = postByte | 0x84;
                    } else if (hasValue) {
                        trc('Indexed constant offset', value);
                        if (indexmode === '0x8D') {
                            // force 16 bit offset for PCR references unless 8 bit specified
                            if (forceBits === 0) {
                                forceBits = 16;
                            }
                            if (value === null) {
                                value = 0;
                            }
                            values = this.pcr(value, forceBits, pcrVal);
                            signedValue = values[0];
                            value = values[1];
                            if (values.length === 3) {
                                value = (value << 8) | values[2];
                            }
                            indexmode = '0x8C';
                            postByte = indexmode;
                        } else {
                            signedValue = value;
                        }
                        if (((value >= -16) && (value < 16)) && (indexmode < 0x80) && (!indirect)) {
                            postByte = postByte | (value & 0x1f);
                            trc('5 bit indexed postByte', postByte);
                        } else {
                            // choose between extended and PCR
                            postByte = postByte | ((indexmode < 0x80) ? 0x88 : 0x8C);
                            trc('PCR signed value', signedValue);
                            bits = this.opSize(signedValue);
                            trc('PCR opSize bits', bits);
                            if (forceBits > 0) {
                                trc('Deal with forceBits', forceBits);
                                if ((this.passNo > 1) && (bits + 1 > forceBits)) {
                                    this.error('Constant offset out of ' + forceBits + ' bit range', signedValue);
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
                bits = this.opSize(value);
                ;
                if ((forceBits === 8) && (indirect === 0)) {
                    mode = modes.direct;
                    trc('Direct mode bit size', bits);
//          value=(value-(this.dpVal<<8))&0xffff;
                    if ((bits > 8) || (value < 0)) {
                        this.error('Direct mode address ($' + inHex(value, 4) + ') out of range', value);
                    }
                } else {
                    if (indirect) {
                        postByte = 0x9F;
                        mode = modes.indexed;
                    } else {
                        withDPValue = (value - (this.dpVal << 8) & 0xffff);
                        trc('withDP', inHex(withDPValue, 4), 0);
                        if ((this.dpUse) && (value != null) && (withDPValue < 0x100) && (forceBits != 16)) {
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
                        this.error('Extended mode requires a 16 bit unsigned value', value);
                    }
                }
            }
        }
        return [mode, value, bits, postByte];
    };
    this.setStatus = function (colour, alert, message, source) {
        var statusBox, HTML;
        var sourceText = source;
        if (sourceText) {
            sourceText = sourceText.replace(/\</, '&lt;');
            sourceText = sourceText.replace(/\>/, '&gt;');
        }
        HTML = '<span style=\'color: ' + colour + '\' font-size:large;\'>' + alert + '</span> <i>' + message + '</i>';
        if (source != null) {
            HTML += '<br />Input: <span style=\'color: blue\'>' + sourceText + '</span>';
        }
        if (statusBox = document.getElementById('assemblyStatus')) {
            statusBox.innerHTML = HTML;
        }
    };
    this.error = function (message) {
        this.foundError = 1;
        console.log('Error ' + message);
        this.setStatus('red', 'Error @ line ' + (this.asmLineNo + 1) + ':', message, this.asmText);
        clearInterval(this.asmIntervalID);
        this.asmIntervalID = null;
    };
    this.encodeOp = function (encoding, instruction) {
        if (instruction.page) {
            encoding.push(instruction.page);
        }
        encoding.push(instruction.op);
    };
    this.encodeString = function (encoding, s) {
        var i, c;
//    trc ("Encode string", s);
        for (i = 0; i < s.length; i++) {
            c = s.charCodeAt(i);
            trc('String character', inHex(c, 2));
            if (c < 0x100) {
                encoding.push(c);
            }
        }
    };
    this.setdp = function (operand) {
        var value = this.nextVal(operand, true);
        if ((value >= 0) && (value < 0x100)) {
            this.dpVal = value;
            this.dpUse = true;
        } else {
            if (value < 0) {
                this.dpVal = 0;
                this.dpUse = false;
            } else {
                this.error('Direct page value must be 8 bits');
            }
        }
    };
    this.fillData = function (encoding, items) {
        var i, filler, count;
        if (items.length == 2) {
            filler = this.nextVal(items[0], false);
            count = this.nextVal(items[1], true);
            if (filler == null) {
                return;
            }
            if (filler < 0) {
                filler += 0x100;
            }
            if ((filler >= 0) && (filler < 0x100)) {
                if ((count > 0) && (count < 0x10000)) {
                    trc('filling ' + count + ' bytes with value', filler, 0);
                    for (i = 0; i < count; i++) {
                        encoding.push(filler);
                    }
                } else {
                    this.error('Value for fill count out of range');
                }
            } else {
                this.error('Value for data byte out of range');
            }
        } else {
            this.error('Directive requires <data byte> and <count> operands');
        }
    };
    this.encodeValue = function (encoding, value, bits) {
        var n;
        trc('Encode value initial', value, 0);
        if (value) {
            n = this.nextVal(value, false);
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
                this.error('Value (16 bits) expected', value);
            }
        } else if (bits > 0) {
            if (n < 0) {
                n += 0x100;
            }
            if ((n >= 0) && (n < 0x100)) {
                encoding.push(n);
            } else {
                this.error('Value (8 bits) expected', value);
            }
        }
    };
    this.encodeData = function (encoding, items, bits) {
        var i, item, matches, matched = 0;
        ;
        for (i = 0; i < items.length; i++) {
            item = items[i];
            trc('Encode data', item, 0);
            matched = (matches = /\s*\"(.*)\"/.exec(item));
            if (!matched) {
                trc('Try to match single quotes', item);
                matched = (matches = /\s*\'(.*)\'/.exec(item));
            }
            if (matched) {
//        trc ("Encode data string",matches[1]);
                this.encodeString(encoding, matches[1]);
            } else {
                this.encodeValue(encoding, item, bits);
            }
        }
    };
    this.encodeConstants = function (items) {
        var i, item, matches, labelValue, matched = 0;
        ;
        for (i = 0; i < items.length; i++) {
            item = items[i];
//      trc ("Encode constant", item);
            matched = (matches = /\s*([A-Z\_][\w\_]*)\s*\=\s*(.+)/i.exec(item));
            if (matched) {
                if (labelValue = this.nextVal(matches[2], true)) {
                    this.assignLabel(matches[1], labelValue);
                } else {
                    this.assignLabel(matches[1], 0);
//          this.error ("Unable to interpret value", matches[1])
                }
//        this.assignLabel (matches[1], this.nextVal (matches[2], false));
            } else {
                this.error('Unable to interpret constant assignment', item);
            }
        }
    };
    this.encodeVariables = function (items) {
        var item, matches, varSize, matched = 0;
        item = items.shift();
        if (varSize = this.nextVal(item, false)) {
            trc('varSize=', varSize);
            while (item = items.shift()) {
                if (matches = /\s*([A-Z\_][\w\_]*)/i.exec(item)) {
                    this.assignLabel(matches[1], this.pcVal);
                    this.pcVal += varSize;
                } else {
                    this.error('Invalid label in variable list', item);
                }
            }
        } else {
            this.error('Invalid variable size (usually 1 or 2)', item);
        }
        this.newOrg(this.pcVal);
    };
    this.newOrg = function (baseAddress) {
        trc('newOrg', inHex(baseAddress, 4));
        this.pcVal = baseAddress;
        this.codeBlocks.push(new codeBlock(baseAddress));
    };
    this.splitByComma = function (text) {
        let item;
        let items = [];
        let textList = text;
        trc('splitByComma', text, 0);
        while (textList.length > 0) {
            item = '';
            let matches = /^(\s*\"[^\"]*\")/.exec(textList);
            if (matches) {
                item = matches[1];
            } else {
                matches = /^([^\,]*)/.exec(textList);
                if (matches) {
                    item = matches[1];
                }
            }
            if (item === '') {
                textList = '';
            } else {
                items.push(item);
                trc('item', item, 0);
                textList = textList.substr(item.length).replace(/^\s*\,/, '');
            }
        }
        return (items);
    };
    this.encodeDirective = function (encoding, instruction, operand, label) {
        trc('Encode directive name', instruction.mnem);
        trc('Encode directive operand', operand, 0);
        switch (instruction.mnem) {
            case 'DB':
            case '.BYTE':
            case 'FCB':
//      case 'FCC': this.encodeData (encoding, operand.split (','), 8); break
            case 'FCC':
                this.encodeData(encoding, this.splitByComma(operand), 8);
                break;
            case 'DW':
            case '.WORD':
            case 'FDB':
                this.encodeData(encoding, operand.split(','), 16);
                break;
            case 'FILL':
                this.fillData(encoding, operand.split(','));
                break;
            case 'ORG':
                this.newOrg(this.nextVal(operand, true));
                break;
            case 'DS':
            case 'RMB':
                this.newOrg(this.pcVal + this.nextVal(operand, true));
                break;
            case 'SETDP':
            case 'DIRECT':
                this.setdp(operand);
                break;
            case '=':
            case 'EQU':
                if (label) {
                    this.labels[label] = this.nextVal(operand, false);
                } else {
                    this.error('EQU directive must have a label', '');
                }
                break;
            case 'CONST':
                this.encodeConstants(operand.split(','));
                break;
            case 'VAR':
                this.encodeVariables(operand.split(','));
                break;
            case 'END':
                this.ended = true;
        }
    };
    this.readLabel = function (asmLabel, value, leadingSpace) {
        var matches, key;
        trc('Readlabel', asmLabel);
        trc('leadingSpace', leadingSpace);
        if (matches = /^\s*([a-z\_][\w\_]*)\:\s*(.*)/i.exec(asmLabel)) {
            key = matches[1].toUpperCase();
            trc('readLabel key', key);
            this.assignLabel(key, value);
            return [matches[2], key];
        }
        if ((!leadingSpace) && (matches = /^([a-z\_][\w\_]*)\s*(.*)/i.exec(asmLabel))) {
            key = matches[1].toUpperCase();
            if (!this.mnemFind(key, 0xffff)) {
                this.assignLabel(key, value);
                return [matches[2], key];
            }
        }
        return [asmLabel, ''];
    };
    this.parseOutComments = function (text) {
        var trimmed = '';
        var inQuotes = null;
        var lastSpace = true;
        var i, c;
//    trc ("parseoutcomments",text,1);
        for (i = 0; i < text.length; i++) {
            c = text.charAt(i);
//      trc ("char c",c,1);
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
            if (((c === ';') || (c === '*')) && (inQuotes == null) && (lastSpace === true)) {
//        trc ("trim comment end",c,1);
                i = text.length;
            } else {
                lastSpace = ((c === ' ') || (c === '\t')) ? true : false;
                if ((!lastSpace) || (trimmed.length > 0)) {
                    trimmed += c;
                }
            }
        }
//    trc ("trimmed",trimmed,1);
        return trimmed.replace(/\s+$/, '');
    };
    this.asmLine = function (s, allowLabel) {
        var matches, opcode, instruction, mode, operand, value, bits, postByte, offsetValues;
        var encoded = [];
        var opLabel = '';
        trc('Asmline', s);
        this.asmText = this.parseOutComments(s);
//    this.asmText=s.replace(/\s*\;.*/, '');
//    this.asmText=this.asmText.replace (/^\s*\*.*/,'');
//    this.asmText=this.asmText.replace(/\s+$/, '');
        if (allowLabel) {
            [this.asmText, opLabel] = this.readLabel(this.asmText, this.pcVal, /^\s+/.test(s));
            if (opLabel) {
                this.lastLabel = opLabel;
            }
        }
        this.asmText = this.asmText.replace(/^\s*/, '');
        trc('asmText', this.asmText);
        if (matches = /\s*([a-zA-Z\=\.]\w*)($|\s*(.+))/.exec(this.asmText)) {
            let mnemonic = matches[1];
            trc('asmLine match:', mnemonic);
            if (instruction = this.mnemFind(mnemonic.toUpperCase(), 0xffff)) {
                trc('Opcode:', inHex(instruction.op, 2));
                mode = instruction.mode;
                operand = matches[3];
                if (mode & modes.simple) {
                    if (operand) {
                        this.error('Junk after instruction: \'' + operand + '\'');
                    } else {
                        this.encodeOp(encoded, instruction);
                    }
                } else if ((mode & modes.pseudo)) {
                    this.encodeDirective(encoded, instruction, operand, opLabel);
                } else if ((mode & modes.simple) == 0) {
                    trc('Memory mode', mode);
                    trc('modes.register', modes.register);
                    if (mode & modes.pcr) {
                        this.encodeOp(encoded, instruction);
//            console.dir (instruction);
                        trc('ASM mode pcr instruction length', encoded.length, 0);
                        offsetValues = this.pcr(operand, (mode & modes.bits16) ? 16 : 8, this.pcVal + encoded.length);
                        offsetValues.shift();
                        encoded = encoded.concat(offsetValues);
                    } else if (mode & modes.register) {
                        trc('Modes register', '');
                        if (mode & modes.pair) {
                            postByte = this.pairPostByte(operand);
                        } else {
                            postByte = this.fullPostByte(mnemonic, operand);
                        }
                        if (postByte != null) {
                            trc('Postbyte value', postByte);
                            this.encodeOp(encoded, instruction);
                            encoded.push(postByte);
                        }
                    } else {
                        trc('this pcVal', inHex(this.pcVal));
                        [mode, value, bits, postByte] = this.adrMode(instruction.mode, operand,
                            this.pcVal + (instruction.page ? 3 : 2));
                        trc('Mem mode', mode);
                        trc('postByte', inHex(postByte, 2));
                        if (instruction = this.mnemFind(mnemonic.toUpperCase(), mode)) {
                            trc('mnemFind Bits', bits);
                            if ((instruction.mode & modes.immediate) && (bits > 8) && ((instruction.mode & modes.bits16) == 0)) {
                                this.error('16 bit value found where 8 bit expected: \'' + value + '\'');
                            } else {
                                this.encodeOp(encoded, instruction);
                                if (postByte >= 0) {
                                    encoded.push(postByte);
                                }
                                this.encodeValue(encoded, value, bits);
                            }
                        } else {
                            this.error(modesText[mode] + ' addressing mode not allowed with instruction');
                        }
                    }
                }
            } else {
                this.error('Unknown instruction', mnemonic);
            }
        }
        if ((this.lastLabel) && (encoded.length > 0) && !(mode & modes.pseudo)) {
            this.addMapLabel(this.lastLabel, this.pcVal);
            this.lastLabel = '';
        }
        return encoded;
    };
    this.loadOS = function () {
        /*
    this.ram.fill (0, [0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,23,0,24,150,13,142,0,100,16,142,0,50,23,0,140,48,136,1,49,168,1,140,0,200,37,242,57,52,22,204,0,0,23,0,37,142,6,0,159,4,142,1,0,159,6,142,0,192,159,8,48,141,0,167,159,10,134,0,141,21,134,1,23,0,42,134,0,23,0,65,53,150,15,0,151,1,15,2,215,3,57,151,12,57,52,2,220,2,134,32,61,211,4,31,1,220,0,84,84,84,58,220,0,196,7,53,130,52,18,48,140,15,132,3,125,0,12,39,2,139,4,166,134,151,13,53,146,0,255,0,255,0,85,170,255,52,18,48,140,243,132,3,125,0,12,39,2,139,4,166,134,151,14,53,146,52,54,159,0,16,159,2,141,176,49,140,22,13,12,39,2,203,16,164,165,167,226,166,132,203,8,164,165,170,224,167,132,53,182,128,64,32,16,8,4,2,1,127,191,223,239,247,251,253,254,192,192,48,48,12,12,3,3,63,63,207,207,243,243,252,252,0,0,0,0,0,0,0,0,32,112,112,32,32,0,32,0,216,216,144,0,0,0,0,0,0,80,248,80,80,248,80,0,64,112,128,96,16,224,32,0,200,200,16,32,64,152,152,0,64,160,160,64,168,144,104,0,96,96,64,0,0,0,0,0,32,64,64,64,64,64,32,0,64,32,32,32,32,32,64,0,0,80,112,248,112,80,0,0,0,32,32,248,32,32,0,0,0,0,0,0,0,96,96,64,0,0,0,248,0,0,0,0,0,0,0,0,0,96,96,0,0,8,16,32,64,128,0,0,112,136,152,168,200,136,112,0,32,96,32,32,32,32,112,0,112,136,8,48,64,128,248,0,112,136,8,112,8,136,112,0,16,48,80,144,248,16,16,0,248,128,128,240,8,136,112,0,48,64,128,240,136,136,112,0,248,8,16,32,64,64,64,0,112,136,136,112,136,136,112,0,112,136,136,120,8,16,96,0,0,0,96,96,0,96,96,0,0,0,96,96,0,96,96,64,16,32,64,128,64,32,16,0,0,0,248,0,0,248,0,0,64,32,16,8,16,32,64,0,112,136,8,48,32,0,32,0,112,136,184,168,184,128,112,0,112,136,136,136,248,136,136,0,240,136,136,240,136,136,240,0,112,136,128,128,128,136,112,0,240,136,136,136,136,136,240,0,248,128,128,240,128,128,248,0,248,128,128,240,128,128,128,0,112,136,128,184,136,136,120,0,136,136,136,248,136,136,136,0,112,32,32,32,32,32,112,0,8,8,8,8,136,136,112,0,136,144,160,192,160,144,136,0,128,128,128,128,128,128,248,0,136,216,168,136,136,136,136,0,136,200,168,152,136,136,136,0,112,136,136,136,136,136,112,0,240,136,136,240,128,128,128,0,112,136,136,136,168,144,104,0,240,136,136,240,144,136,136,0,112,136,128,112,8,136,112,0,248,32,32,32,32,32,32,0,136,136,136,136,136,136,112,0,136,136,136,136,136,80,32,0,136,136,168,168,168,168,80,0,136,136,80,32,80,136,136,0,136,136,136,80,32,32,32,0,240,16,32,64,128,128,240,0,112,64,64,64,64,64,112,0,0,128,64,32,16,8,0,0,112,16,16,16,16,16,112,0,32,80,136,0,0,0,0,0,0,0,0,0,0,0,0,248,96,96,32,0,0,0,0,0,0,0,112,8,120,136,120,0,128,128,240,136,136,136,240,0,0,0,112,136,128,136,112,0,8,8,120,136,136,136,120,0,0,0,112,136,240,128,112,0,48,64,64,240,64,64,64,0,0,0,120,136,136,120,8,112,128,128,224,144,144,144,144,0,32,0,32,32,32,32,48,0,16,0,48,16,16,16,144,96,128,128,144,160,192,160,144,0,32,32,32,32,32,32,48,0,0,0,208,168,168,136,136,0,0,0,224,144,144,144,144,0,0,0,112,136,136,136,112,0,0,0,240,136,136,136,240,128,0,0,120,136,136,136,120,8,0,0,176,72,64,64,224,0,0,0,112,128,112,8,112,0,0,64,240,64,64,80,32,0,0,0,144,144,144,176,80,0,0,0,136,136,136,80,32,0,0,0,136,136,168,248,80,0,0,0,144,144,96,144,144,0,0,0,144,144,144,112,32,192,0,0,240,16,96,128,240,0,48,64,64,192,64,64,48,0,32,32,32,0,32,32,32,0,96,16,16,24,16,16,96,0,80,160,0,0,0,0,0,0,32,112,216,136,136,248,0,0]);
    this.ram.fill (61440, [22,0,24,22,0,20,22,0,17,22,0,14,22,0,11,22,0,8,22,0,5,23,15,247,32,251,59,16,206,128,0,141,5,28,0,22,255,239,204,0,0,31,128,31,1,31,2,31,3,57]);
    this.ram.fill (65520, []);
    this.ram.fill (65522, [240,18,240,15,240,12,240,9,240,6,240,3,240,0]);
*/
        /*
    this.ram.fill (0x4000, [57]);
    this.ram.fill (0xF000, [22,0,86,22,0,20,22,0,17,22,0,14,22,0,11,22,0,8,22,0,6,23,79,232,32,251,59,238,106,79,230,192,88,73,49,141,0,51,52,32,49,141,0,37,49,171,16,172,225,36,2,173,180,239,106,59,57,166,192,38,4,127,255,128,57,127,255,129,57,166,192,183,255,130,57,166,192,183,255,131,57,240,56,240,57,240,69,240,75,16,206,128,0,141,5,28,0,22,255,177,204,0,0,31,139,31,1,31,2,31,3,57]);
    this.ram.fill (0xFFF0, []);
    this.ram.fill (0xFFF2, [240,18,240,15,240,12,240,9,240,6,240,3,240,0]);
*/
        /*
  this.ram.fill (0x4000, [57]);
  this.ram.fill (0xF000, [22,0,75,22,0,20,22,0,17,22,0,14,22,0,11,22,0,8,22,0,6,189,64,0,32,251,59,52,4,31,137,79,88,73,49,141,0,40,52,32,49,141,0,28,49,171,16,172,225,53,4,36,2,173,180,59,57,93,38,4,127,255,128,57,127,255,129,57,247,255,130,57,240,56,240,57,240,68,16,206,128,0,141,5,28,0,22,255,188,204,0,0,31,139,31,1,31,2,31,3,57]);
  this.ram.fill (0xFFF0, []);
  this.ram.fill (0xFFF2, [240,18,240,15,240,12,240,9,240,6,240,3,240,0]);
*/
        this.ram.fill(0x4000, [57]);
        this.ram.fill(0xF000, [
            22,
            0,
            75,
            22,
            0,
            20,
            22,
            0,
            17,
            22,
            0,
            14,
            22,
            0,
            11,
            22,
            0,
            8,
            22,
            0,
            6,
            189,
            64,
            0,
            32,
            251,
            59,
            52,
            4,
            31,
            137,
            79,
            88,
            73,
            49,
            141,
            0,
            40,
            52,
            32,
            49,
            141,
            0,
            28,
            49,
            171,
            16,
            172,
            225,
            53,
            4,
            36,
            2,
            173,
            180,
            59,
            57,
            93,
            38,
            4,
            127,
            255,
            128,
            57,
            127,
            255,
            129,
            57,
            247,
            255,
            130,
            57,
            240,
            56,
            240,
            57,
            240,
            68,
            26,
            80,
            28,
            80,
            16,
            206,
            128,
            0,
            141,
            3,
            22,
            255,
            186,
            204,
            0,
            0,
            31,
            139,
            31,
            1,
            31,
            2,
            31,
            3,
            57]);
        this.ram.fill(0xFFF0, []);
        this.ram.fill(0xFFF2, [240, 18, 240, 15, 240, 12, 240, 9, 240, 6, 240, 3, 240, 0]);
    };
    this.asmFinalise = function () {
        var block, disassembly, start;
        if (this.codeBlocks.length) {
            start = this.findLabel('START');
//      if (!start) {start=this.ram.deek (0xfffe)}
            if (!start) {
                start = this.defaultStart;
            }
            machineOrg(start, 1);
            this.setStatus('green', 'Ready',
                'assembly of ' + this.asmProgram.length + ' ' + plural('line', this.asmProgram.length) + ' complete',
                null);
//      disassembly=this.disassemble (this.codeBlocks[0].base, 0x10000, this.dsmTableSize);
            disassembly = this.disassemble(start, 0x10000, this.dsmTableSize);
            this.assembling = false;
            this.dsmTable.setTable(disassembly);
            this.labelMap.fill(this.mapLabels);
        }
    };
    this.asmInit = function (pass) {
        this.passNo = pass;
        this.assembling = true;
        this.ended = false;
        this.dpVal = 0;
        this.dpUse = false;
        this.codeBlocks = [];
        this.newOrg(Defaults.org);
        this.asmLineNo = 0;
        this.lastlabel = '';
        this.asmIntervalID = setInterval(assemblyCycle, this.asmIntervalMils);
    };
    this.assemble = function (program) {
//    var i, opcode, block, encoded, outputCode;
        this.labels = [];
        this.mapLabels = [];
        this.mapAddrs = [];
        this.labelMap.empty();
        this.foundError = 0;
        this.asmProgram = program;
        this.asmInit(1);
    };
    this.regGroupList = function (postByte, regList) {
        var i;
        var theseRegs = [];
        for (i = 0; i < 8; i++) {
            if (postByte & (0x01 << i)) {
                theseRegs.push(regList[i].substr(3));
            }
        }
        return theseRegs.join(',');
    };
    this.regPairList = function (postByte, regList) {
        function regName(regNum) {
            if (regNum in regList) {
                return regList[regNum].substr(3);
            } else {
                return 'ERR';
            }
        }

        return regName((postByte & 0xf0) >>> 4) + ',' + regName((postByte & 0x0f));
    };
    this.labelled = function (mapAddresses, word, prefix) {
        if (word in mapAddresses) {
//      return "="+mapAddresses[word]+":"+word
            return mapAddresses[word];
        } else {
            return prefix + word;
        }
    };
    this.disassemble = function (startAddress, endAddress, maxLines) {
        var opCode, opPage, postByte, instruction, disassembly;
        var pc = startAddress;
        var lines = [];

        function nextByte(machine) {
            var byte;
//      trc ("nextByte from", inHex (pc, 4));
            [pc, byte] = machine.ram.read(pc);
            disassembly.bytes.push(byte);
            return byte;
        }

        function readWord(machine, bits16, prefix) {
            var word = nextByte(machine);
//      trc ("readWord", bits16);
            if (bits16) {
                word = (word << 8) | nextByte(machine);
                return machine.labelled(machine.mapAddrs, inHex(word, 4), prefix);
            } else {
                return machine.labelled(machine.mapAddrs, inHex(word, 2), prefix);
            }
        }

        function disIndexed(machine, postByte) {
            var offset = 0;
            var operand = '';
//      trc ("Disassemble Index postbyte",inHex(postByte,2));
// find index register name
            var indexReg = ['X', 'Y', 'U', 'S'][(postByte & 0x60) >>> 5];
// extract 5 bit offset
            if (!(postByte & 0x80)) {
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
                        operand = signedHex(parseInt(readWord(machine, modes.bits8, ''), 16), 8, '$') + ', ' + indexReg;
                        break;
                    case 0x09:
                        operand = signedHex(parseInt(readWord(machine, modes.bits16, ''), 16), 16, '$') + ', ' + indexReg;
                        break;
                    case 0x0A:
                        operand = 'ERR';
                        break;
                    case 0x0B:
                        operand = 'D,' + indexReg;
                        break;
                    case 0x0C:
                        operand = findPCR(machine, parseInt(readWord(machine, modes.bits8, ''), 16), modes.bits8, pc) + ',PCR';
                        break;
                    case 0x0D:
                        operand = findPCR(machine, parseInt(readWord(machine, modes.bits16, ''), 16), modes.bits16, pc) + ',PCR';
                        break;
                    case 0x0E:
                        operand = 'ERR';
                        break;
                    case 0X0F:
                        operand = readWord(machine, modes.bits16, '$');
                        break;
                }
                if (postByte & 0x10) {
                    operand = '[' + operand + ']';
                }
            }
            return operand;
        }

        function findPCR(machine, offset, bits16, pc) {
            var d = offset;
            if (!bits16) {
                d |= (offset & 0x80) ? 0xff00 : 0;
            }
            /*      trc ('findPCR offset raw',offset);
      trc ('findPCR offset',inHex (offset,4));
      trc ('findPCR pc',inHex (pc, 4)); */
            return machine.labelled(machine.mapAddrs, inHex((pc + d) & 0xffff, 4), '$');
        }

        trc('Disassembling from', inHex(startAddress, 4));
        trc('PC', inHex(pc, 4));
        trc('endAddress', inHex(endAddress, 4));
        trc('maxLines', maxLines);
        while ((pc < endAddress) && (lines.length < maxLines)) {
            opPage = 0;
            instruction = null;
            disassembly = new disCode(pc);
            opCode = nextByte(this);
            if (instruction = this.opFind(opCode, opPage)) {
                if (instruction.mode & modes.pager) {
                    trc('Pager', opCode);
                    opPage = opCode;
                    opCode = nextByte(this);
                    instruction = this.opFind(opCode, opPage);
                }
            }
            if (instruction) {
//        trc ("Disassemble mnemonic", instruction.mnem+' = '+instruction.mode);
                disassembly.operation = instruction.mnem;
                if (instruction.mode & modes.simple) {
                } else if (instruction.mode & modes.immediate) {
                    disassembly.operand = '#' + readWord(this, instruction.mode & modes.bits16, '$');
                } else if (instruction.mode & modes.direct) {
                    disassembly.operand = '<' + readWord(this, modes.bits8, '$');
                } else if (instruction.mode & modes.extended) {
                    disassembly.operand = readWord(this, modes.bits16, '$');
                } else if (instruction.mode & modes.indexed) {
                    disassembly.operand = disIndexed(this, nextByte(this));
                } else if (instruction.mode & modes.register) {
                    postByte = nextByte(this);
                    if (instruction.mode & modes.pair) {
                        disassembly.operand = this.regPairList(postByte, pairRegsToText);
                    } else {
//            trc ('dis.op', disassembly.operation[disassembly.operation.length-1]);
                        disassembly.operand = this.regGroupList(postByte,
                            (disassembly.operation[disassembly.operation.length - 1] == 'S') ? fullRegsToTextS : fullRegsToTextU);
                    }
                } else if (instruction.mode & modes.pcr) {
                    disassembly.operand = findPCR(this, parseInt(readWord(this, instruction.mode & modes.bits16, ''), 16),
                        instruction.mode & modes.bits16, pc);
                }
            } else {
                disassembly.operation = 'ERR';
            }
            lines.push(disassembly);
        }
        return lines;
    };
    this.jumpTo = function (CPU, address) {
        if (CPU.intervalID == null) {
            machineOrg(address, 1);
        }
    };
    this.editCode = function (cpu, event, address) {
        var editBox, inputBox;
        var cell = event.target.parentNode.lastChild;
        trc('editCode', 0);
//    console.dir (event.target.parentNode);
        inputBox = new cellEdit(cell, cpu, address);
        return (false);
    };
    this.setBreakpoint = function (cpu, event, address) {
        var cell = event.target.parentNode.firstChild;
        if (!(address in cpu.breakpoints)) {
            cpu.breakpoints[address] = true;
            cell.style.backgroundColor = 'red';
        } else {
            delete (cpu.breakpoints[address]);
            cell.style.backgroundColor = '';
        }
        return false;
    };
    this.asmCycle = function () {
        var encoded;
        this.setStatus('#d07010', 'Assembling pass ' + this.passNo, 'line number ' + (this.asmLineNo + 1), this.asmText);
        if ((this.asmLineNo < this.asmProgram.length) && (!this.ended)) {
            let check = this.asmProgram[this.asmLineNo].trim().toUpperCase();
            if (check.startsWith('LEA')) {
                console.log("checkpoint: " + check);
            }
            encoded = this.asmLine(this.asmProgram[this.asmLineNo], true);
            this.asmLineNo++;
            if (!this.foundError) {
                if (encoded.length > 0) {
                    trc('Assemble @ ', inHex(this.pcVal, 4));
                    if (this.pcVal != null) {
                        this.pcVal = this.ram.fill(this.pcVal, encoded);
                        this.codeBlocks [this.codeBlocks.length - 1].addCode(encoded);
                    } else {
                        this.error('No value set for origin', 0);
                    }
                }
            }
        } else {
            clearInterval(this.asmIntervalID);
            this.asmIintervalID = null;
            if (this.passNo < this.passes) {
                this.asmInit(this.passNo + 1);
            } else {
                this.asmFinalise();
            }
        }
    };
    this.cycle = function () {
        var opcode, instruction, i, numTimes, pcAddress;
        if (this.intervalID == null) {
            numTimes = 1;
        } else {
            numTimes = this.intervalTimes;
        }
        for (i = 1; i <= numTimes; i++) {
//      trc ("Cycle no.",this.cycles,1);
            this.cycles++;
            if (!(this.alu.syncing || this.alu.waiting)) {
//        trc ("Begin instruction execute PC", inHex (this.registers['regPC'].regValue,4));
                do {
//      trc ("opPage",this.opPage);
                    opcode = this.ram.peek(this.registers['regPC'].regValue);
                    this.registers['regPC'].setValue(this.ram.plus(this.registers['regPC'].regValue));
                    if (instruction = this.opFind(opcode, this.opPage)) {
//            trc ("Found mnemonic", instruction.mnem+' = '+instruction.code);
                        this.alu.execute(instruction.code);
                    } else {
//            trc ("PC: ", inHex (this.registers['regPC'].regValue,4)+" unknown opcode "+opcode);
                    }
                } while (this.opPage);
            } else {
//        trc ("Syncing or waiting, syncing=", this.alu.syncing,1);
//        trc ("Syncing or waiting, waiting=", this.alu.waiting,1);
            }
            this.alu.checkInterrupts();
            pcAddress = this.registers['regPC'].regValue;
            if (this.breakpoints[pcAddress]) {
                i = numTimes;
                this.stop();
                this.refresh(true);
            }
        }
        this.dsmTable.lineOn(pcAddress, 0);
    };
    this.stop = function () {
        function cancelInterval(id) {
            if (id != null) {
                clearInterval(id);
            }
            return null;
        }

        this.alu.waiting = 0;
        this.alu.syncing = 0;
        this.intervalID = cancelInterval(this.intervalID);
        this.irqID = cancelInterval(this.irqID);
        this.firqID = cancelInterval(this.firqID);
    };
    this.ready = function () {
        this.alu = new ALU816(this);
        this.cycles = 0;
        this.loadOS();
        this.SI = new systemInterface(this, SIbaseAddress);
    };
    this.execute = function () {
//    trc ("Execute from "+inHex (this.registers['regPC'].regValue,4)+" with "+this.intervalMils+" delay. (speed factor "+this.intervalTimes+")",0,1);
        this.stop();
        this.intervalID = setInterval(machineCycle, this.intervalMils);
//    trc ("Execute irqMils", this.irqMils,1);
        this.irqID = setInterval(doIRQ, this.irqMils);
        this.firqID = setInterval(doFIRQ, this.firqMils);
    };
    this.setSpeed = function (speed) {
        var mils = this.speedMils[speed];
        if (mils < 1) {
            this.intervalTimes = Math.round(1 / mils);
            mils = 1;
        } else {
            this.intervalTimes = 1;
        }
        this.intervalMils = mils;
        if (this.intervalID != null) {
            this.execute();
        }
    };
    this.addEvents = function () {
        var container;
        var cpu = this;
        if (container = document.getElementById('registers-container')) {
            container.addEventListener('keypress', function (event) {
                var keyPress;
                if (!event.defaultPrevented) {
                    keyPress = event.key.toString().toUpperCase();
                    trc('Event keypress triggered', keyPress);
                    if ((keyPress in keyCodesList) && (cpu.hexInputCell)) {
                        trc('Key Event triggered', keyPress, 1);
                        cpu.hexInputRegister.inputHex(cpu, keyCodesList[keyPress]);
                        event.preventDefault();
                    }
                }
            }, true);
            document.addEventListener('keydown', function (event) {
                trc('keydown event', event.key, 1);
                if ((event.key == 'Backspace') || (event.key == 'Escape')) {
                    trc('Escape or backspace', event.key, 1);
                    if (mc6809.intervalID != null) {
                        trc('Escape or backspace', 'running', 1);
                        keyPressHandler(event);
                    }
                }
            }, true);
        }
    };
    this.addRegisters = function () {
        this.addReg('PC', 16, 0, '', 0);
        this.addReg('X', 16, 0, '', 0);
        this.addReg('Y', 16, 0, '', 0);
        this.addReg('U', 16, 0, '', 0);
        this.addReg('S', 16, 0, '', 0);
        this.addReg('A', 8, 0, 'Y', 1);
        this.addReg('B', 8, 0, 'Y', 1);
        this.addReg('CC', 8, 0x50, 'EFHINZVC', 1);
        this.addReg('DP', 8, 0, '', 0);
    };
    this.addRegisters();
    this.watchList = new watchWindow('watchWindow', this, 0x7ff0);
    this.watchList.addWatch(0xff80);
    this.addEvents();
};

function machineCycle() {
    mc6809.cycle();
}

function assemblyCycle() {
    mc6809.asmCycle();
}

function machineStep() {
    mc6809.stop();
    mc6809.cycle();
    if (!mc6809.refreshOn) {
        mc6809.refresh(1);
    }
}

function machineHalt() {
    console.dir(document.getElementById('registers-container'));
    mc6809.stop();
    mc6809.refresh(1);
}

function machineRun() {
    machineRefresh();
    mc6809.execute();
}

function machineReset() {
//  mc6809.keybuffer=[];
    machineInterrupt('reset');
//  mc6809.refresh (1);
//  mc6809.execute ();
}

function doIRQ() {
    mc6809.alu.interrupt('irq');
    mc6809.alu.checkInterrupts();
}

function doFIRQ() {
    mc6809.alu.interrupt('firq');
    mc6809.alu.checkInterrupts();
}

function machineInterrupt(irqName) {
    trc('machineInterrupt', irqName);
    mc6809.alu.interrupt(irqName);
    mc6809.alu.checkInterrupts();
    mc6809.refresh(1);
    mc6809.execute();
}

function machineOrg(PC, force) {
    mc6809.registers['regPC'].change(PC, 0);
    mc6809.dsmTable.lineOn(mc6809.registers['regPC'].regValue, force);
}

function addWatchpoint(where) {
    switch (where.toUpperCase()) {
        case 'EA':
            mc6809.watchList.addWatch(mc6809.alu.eaLast);
            break;
        case 'X':
            mc6809.watchList.addWatch(mc6809.registers['regX'].regValue);
            break;
        case 'APPEND':
            mc6809.watchList.addWatch(mc6809.watchList.lastWatch + 0x10);
            break;
    }
}

function machineRefresh() {
    var refresh;
    if (refresh = document.getElementById('refreshCheck')) {
        if (refresh.checked) {
            mc6809.refresh(1);
        }
        mc6809.refreshOn = refresh.checked;
    }
}

function compileRun(id) {
    let asmLines, element;
    element = document.getElementById(id);
    if (element) {
//    trc ("Assembling program",'');
        mc6809.assemble(element.value.split('\n'));
        mc6809.refresh(1);
    }
}

function codeDump(id) {
    var block, element;
    var text = '';
    for (block in mc6809.codeBlocks) {
        text += mc6809.codeBlocks[block].writeCode() + '\n';
    }
//  console.log (text);
    if (element = document.getElementById(id)) {
        element.value = text;
    }
}

function speedSlider(cpu, speed) {
    var readout;
    this.slider = null;
    this.slider = document.getElementById('speed');
    this.slider.min = 1;
    this.slider.max = 10;
    speed = Math.max(this.slider.min, Math.trunc(speed));
    this.slider.value = Math.min(speed, this.slider.max);
    readout = document.getElementById('speedVal');
    readout.innerHTML = this.slider.value;
    cpu.intervalMils = cpu.speedMils [this.slider.value];
    this.slider.oninput = function () {
        readout.innerHTML = this.value;
        cpu.setSpeed(this.value);
    };
}

const mc6809 = new CPU();
//  console.dir (mc6809.registers);
mc6809.ready();
const speedControl = new speedSlider(mc6809, 5);
document.getElementById('assembly-code').value = document.getElementById('demo-helloworld').value
machineInterrupt('reset');
mc6809.refresh(1);
mc6809.execute();
