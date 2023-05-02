import {CPU, trc} from "emulator"

const mc6809 = new CPU();
mc6809.ready();
new speedSlider(mc6809, 5);
document.getElementById('assembly-code').value = document.getElementById('demo-helloworld').value
machineInterrupt('reset');
mc6809.refresh(1);
mc6809.execute();

function speedSlider(cpu, speed) {
  let readout;
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

function codeDump(id) {
  let block, element;
  let text = '';
  for (block in mc6809.codeBlocks) {
    text += mc6809.codeBlocks[block].writeCode() + '\n';
  }
//  console.log (text);
  element = document.getElementById(id);
  if (element) {
    element.value = text;
  }
}

function compileRun(id) {
  let asmLines, element;
  element = document.getElementById(id);
  if (element) {
    mc6809.assemble(element.value.split('\n'));
    mc6809.refresh(1);
  }
}

function machineRefresh() {
  let refresh= document.getElementById('refreshCheck');
  if (refresh) {
    if (refresh.checked) {
      mc6809.refresh(1);
    }
    mc6809.refreshOn = refresh.checked;
  }
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

function machineReset() {
  machineInterrupt('reset');
}

function machineInterrupt(irqName) {
  trc('machineInterrupt', irqName);
  mc6809.alu.interrupt(irqName);
  mc6809.alu.checkInterrupts();
  mc6809.refresh(1);
  mc6809.execute();
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

function doIRQ() {
  mc6809.alu.interrupt('irq');
  mc6809.alu.checkInterrupts();
}

function doFIRQ() {
  mc6809.alu.interrupt('firq');
  mc6809.alu.checkInterrupts();
}

function machineOrg(PC, force) {
  mc6809.registers['regPC'].change(PC, 0);
  mc6809.dsmTable.lineOn(mc6809.registers['regPC'].regValue, force);
}
