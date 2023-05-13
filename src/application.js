/**
 * Custom slider for controlling CPU step interval.
 */
class SlideControl {
  #cpu;
  #value;
  #speed;
  #readout;
  #slider;

  /**
   * Inject CPU and set default interval.
   *
   * @param {CPU} cpu bound CPU
   * @param {number} speed default step interval
   */
  constructor(cpu, speed) {
    this.#cpu = cpu;
    this.#speed = Math.trunc(speed);
    this.#slider = null;
    this.#readout = null;
    this.#value = 0;
  }

  /**
   * Bind control to given UI elements.
   *
   * @param {String} slideElement slide control element name
   * @param {String} textElement text readout element name
   */
  bindId(slideElement, textElement) {
    this.#readout = document.getElementById(textElement);
    this.#slider = document.getElementById(slideElement);
    this.#slider.addEventListener('click', this.update.bind(this), false);
    this.#slider.min = 1;
    this.#slider.max = 10;
    this.#speed = Math.max(this.#slider.min, this.#speed);
    this.#slider.value = Math.min(this.#speed, this.#slider.max);
    this.#cpu.intervalMils = this.#cpu.speedMils[this.#slider.value];
    this.#value = parseInt(this.#slider.value);
    this.#readout.innerHTML = this.#value;
  }

  /**
   * Update CPU with new interval step.
   *
   * @param {Object} event slide control change event
   */
  update(event) {
    this.#value = parseInt(event.srcElement.value);
    this.#readout.innerHTML = this.#value;
    this.#cpu.setSpeed(this.#value);
  }
}

/**
 * Event consumer for assembly status updates.
 *
 * @param {Object} event assembly status event
 */
function statusEventHandler(event) {
  const statusBox = document.getElementById('assemblyStatus');
  if (statusBox != null) {
    statusBox.innerHTML = event.detail.message;
  }
  event.preventDefault();
}

/**
 * Disassemble visible code.
 *
 * @param {String} id target elementId name
 */
function codeDump(id) { // eslint-disable-line no-unused-vars
  let block;
  let text = '';
  for (block in mc6809.codeBlocks) {
    if (Object.prototype.hasOwnProperty.call(mc6809.codeBlocks, block)) {
      text += mc6809.codeBlocks[block].writeCode() + '\n';
    }
  }
  const element = document.getElementById(id);
  if (element !== null) {
    element.value = text;
  }
}

/**
 * Start assembly process.
 *
 * @param {String} id elementId name of source container
 */
function compileRun(id) { // eslint-disable-line no-unused-vars
  const element = document.getElementById(id);
  if (element) {
    mc6809.assemble(element.value.split('\n'));
    mc6809.refresh(1);
  }
}

/**
 * Refresh UI with machine state.
 */
function machineRefresh() {
  const refresh= document.getElementById('refreshCheck');
  if (refresh) {
    if (refresh.checked) {
      mc6809.refresh(1);
    }
    mc6809.refreshOn = refresh.checked;
  }
}

/**
 * Add watchpoint frame.
 *
 * @param {String} where address reference (EA/X/APPEND)
 */
function addWatchpoint(where) { // eslint-disable-line no-unused-vars
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

/**
 * Force CPU reset.
 */
function machineReset() { // eslint-disable-line no-unused-vars
  machineInterrupt('reset');
}

/**
 * Trigger named interrupt.
 *
 * @param {String} irqName interrupt name (NMI/IRQ/FIRQ)
 */
function machineInterrupt(irqName) {
  bundle.trc('machineInterrupt', irqName);
  mc6809.alu.interrupt(irqName);
  mc6809.alu.checkInterrupts();
  mc6809.refresh(1);
  mc6809.execute();
}

/**
 * Stop CPU auto-cycle.
 */
function machineHalt() { // eslint-disable-line no-unused-vars
  console.dir(document.getElementById('registers-container'));
  mc6809.stop();
  mc6809.refresh(1);
}

/**
 * Start CPU auto-cycle.
 */
function machineRun() { // eslint-disable-line no-unused-vars
  machineRefresh();
  mc6809.execute();
}

/**
 * CPU cycle callback.
 */
function machineCycle() { // eslint-disable-line no-unused-vars
  mc6809.cycle();
}

/**
 * Step CPU by 1 instruction.
 */
function machineStep() { // eslint-disable-line no-unused-vars
  mc6809.stop();
  mc6809.cycle();
  if (!mc6809.refreshOn) {
    mc6809.refresh(1);
  }
}

/**
 * Trigger Interrupt (IRQ).
 */
function doIRQ() { // eslint-disable-line no-unused-vars
  mc6809.alu.interrupt('irq');
  mc6809.alu.checkInterrupts();
}

/**
 * Trigger Fast Interrupt (FIRQ).
 */
function doFIRQ() { // eslint-disable-line no-unused-vars
  mc6809.alu.interrupt('firq');
  mc6809.alu.checkInterrupts();
}

/**
 * Refresh UI with updated program counter.
 *
 * @param {number} PC program counter
 * @param {boolean} force force update
 */
function machineOrg(PC, force) { // eslint-disable-line no-unused-vars
  mc6809.registers['regPC'].change(PC, 0);
  mc6809.dsmTable.lineOn(mc6809.registers['regPC'].regValue, force);
}

document.addEventListener('assemblerEvent', statusEventHandler);
const mc6809 = new bundle.CPU();
mc6809.ready();
const speed = new SlideControl(mc6809, 5);
speed.bindId('speed', 'speedVal');
document.getElementById('assembly-code').value =
    document.getElementById('demo-helloworld').value;
machineInterrupt('reset');
mc6809.refresh(1);
mc6809.execute();
