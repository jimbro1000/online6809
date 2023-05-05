import {blockChars, blockClasses, Defaults} from "./constants";
import {trc} from "./emulator";
import {inHex} from "./helper";

function labelList(id, cpuOwner) {
    this.cpu = cpuOwner;
    this.list = null;
    this.createList = function (listId) {
        let container = document.getElementById(listId + '-container');
        trc('labelList id', listId);
        if (container !== null) {
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
        let label, option;
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
        let newRow, container, rowNo;

        function newCell(thisRow, cellClass, content) {
            var cell = thisRow.insertCell();
            cell.className = cellClass;
            cell.innerHTML = content;
//      console.dir (cell);
        }

        trc('createTable tableId', tableId);
        container = document.getElementById(tableId + '-container');
        if (container !== null) {
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
        let row, address, bytes, mnemonic;

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
    this.canvas = document.getElementById('graphicsScreen');
    if (this.canvas !== null) {
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

export {labelList, DSMWindow, GraphicsScreen, TextScreen, keyPressHandler}
