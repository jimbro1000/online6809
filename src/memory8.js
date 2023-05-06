import {inHex, trc} from './helper';

export function Memory8(size) {
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
    let freshWin = new RAMWindow(holder, base, length);
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
};
