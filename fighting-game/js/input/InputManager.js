// Input devices: two keyboard layouts + any number of gamepads (Gamepad API).
// Each player slot is bound to exactly one device. Bindings are remappable and saved per
// device model (gamepad.id) so two identical BeTop pads share one mapping.

export const ACTIONS = [
  { id: 'up', label: 'Up (sidestep in / jump)' },
  { id: 'down', label: 'Down (sidestep out / crouch)' },
  { id: 'left', label: 'Left' },
  { id: 'right', label: 'Right' },
  { id: 'b1', label: 'Left Punch [1]' },
  { id: 'b2', label: 'Right Punch [2]' },
  { id: 'b3', label: 'Left Kick [3]' },
  { id: 'b4', label: 'Right Kick [4]' },
  { id: 'guard', label: 'Guard' },
  { id: 'throw', label: 'Throw [1+3]' },
  { id: 'm12', label: 'Macro [1+2]' },
  { id: 'm34', label: 'Macro [3+4]' },
  { id: 'pause', label: 'Pause / Start' },
  { id: 'reset', label: 'Training reset' },
];

const btn = (index) => ({ type: 'button', index });
const axis = (index, dir) => ({ type: 'axis', index, dir });
const hat = (index, dir) => ({ type: 'hat', index, dir });
const key = (code) => ({ type: 'key', code });

const KB_DEFAULTS = {
  kb1: { up: [key('KeyW')], down: [key('KeyS')], left: [key('KeyA')], right: [key('KeyD')],
    b1: [key('KeyU')], b2: [key('KeyI')], b3: [key('KeyJ')], b4: [key('KeyK')],
    guard: [key('KeyL')], throw: [key('KeyO')], m12: [key('KeyY')], m34: [key('KeyH')],
    pause: [key('Escape')], reset: [key('KeyR')] },
  kb2: { up: [key('ArrowUp')], down: [key('ArrowDown')], left: [key('ArrowLeft')], right: [key('ArrowRight')],
    b1: [key('Numpad4')], b2: [key('Numpad5')], b3: [key('Numpad1')], b4: [key('Numpad2')],
    guard: [key('Numpad3')], throw: [key('Numpad6')], m12: [key('Numpad7')], m34: [key('Numpad8')],
    pause: [key('NumpadEnter')], reset: [key('Numpad0')] },
};

// Standard mapping (XInput / "standard" Gamepad API layout): 0 A/Cross, 1 B/Circle, 2 X/Square, 3 Y/Triangle.
// Tekken-style face layout: Square = 1, Triangle = 2, Cross = 3, Circle = 4.
function standardDefaults() {
  return { up: [btn(12), axis(1, -1)], down: [btn(13), axis(1, 1)], left: [btn(14), axis(0, -1)], right: [btn(15), axis(0, 1)],
    b1: [btn(2)], b2: [btn(3)], b3: [btn(0)], b4: [btn(1)],
    guard: [btn(5)], throw: [btn(4)], m12: [btn(7)], m34: [btn(6)], pause: [btn(9)], reset: [btn(8)] };
}

// Non-standard mapping (DirectInput mode, e.g. many BeTop pads in "D" mode):
// buttons usually 0 X(left) 1 A(bottom) 2 B(right) 3 Y(top) 4 L1 5 R1 6 L2 7 R2 8 Select 9 Start.
// The D-pad is often a hat-switch axis; it is detected at runtime.
function genericDefaults(hatAxes) {
  const d = { up: [axis(1, -1), btn(12)], down: [axis(1, 1), btn(13)], left: [axis(0, -1), btn(14)], right: [axis(0, 1), btn(15)],
    b1: [btn(0)], b2: [btn(3)], b3: [btn(1)], b4: [btn(2)],
    guard: [btn(5)], throw: [btn(4)], m12: [btn(7)], m34: [btn(6)], pause: [btn(9)], reset: [btn(8)] };
  for (const h of hatAxes) for (const dir of ['up', 'down', 'left', 'right']) d[dir].unshift(hat(h, dir));
  return d;
}

const STICK_THRESHOLD = 0.45;

// Hat switch: 8 positions spread over [-1, 1] in steps of 2/7, ~1.29 when centred.
export function decodeHat(v) {
  if (v === undefined || Math.abs(v) > 1.05) return null;
  const idx = ((Math.round((v + 1) / (2 / 7)) % 8) + 8) % 8;
  return { up: idx === 7 || idx === 0 || idx === 1, right: idx >= 1 && idx <= 3, down: idx >= 3 && idx <= 5, left: idx >= 5 && idx <= 7 };
}

function storageGet(k) { try { return JSON.parse(localStorage.getItem(k)); } catch { return null; } }
function storageSet(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch { /* storage unavailable */ } }

export class InputManager {
  constructor(win = window) {
    this.win = win;
    this.keys = new Set();
    this.latched = new Set();     // keys pressed since the last poll (very short taps still register)
    this.slots = [null, null];        // device ids
    this.waiting = [null, null];      // gamepad id string a disconnected slot is waiting for
    this.pads = new Map();            // deviceId -> { index, id, mapping, hatAxes:Set, connected }
    this.listeners = new Set();
    this.capture = null;
    this.keyMenu = [];
    this.menuRepeat = new Map();
    this.prevButtonsForCapture = null;
    this.lastActivity = new Map();
    this.state = new Map();           // deviceId -> action state from latest poll
    this.prevState = new Map();
    this.bindingsCache = new Map();
    win.addEventListener('keydown', (e) => this.onKey(e, true));
    win.addEventListener('keyup', (e) => this.onKey(e, false));
    win.addEventListener('blur', () => this.keys.clear());
    win.addEventListener('gamepadconnected', (e) => this.onPadConnected(e.gamepad));
    win.addEventListener('gamepaddisconnected', (e) => this.onPadDisconnected(e.gamepad));
    this.scanPads();
    this.autoAssign();
  }

  on(fn) { this.listeners.add(fn); return () => this.listeners.delete(fn); }
  emit(ev) { for (const fn of this.listeners) fn(ev); }

  // ---------------------------------------------------------------- devices
  getGamepads() {
    try { return Array.from(this.win.navigator.getGamepads ? this.win.navigator.getGamepads() : []); }
    catch { return []; }
  }

  scanPads() {
    for (const gp of this.getGamepads()) if (gp) this.registerPad(gp);
  }

  registerPad(gp) {
    const devId = 'pad:' + gp.index;
    let p = this.pads.get(devId);
    if (!p || p.id !== gp.id) {
      p = { devId, index: gp.index, id: gp.id, mapping: gp.mapping, hatAxes: new Set(), connected: true, missing: 0 };
      this.pads.set(devId, p);
    }
    p.connected = true; p.missing = 0;
    this.detectHats(p, gp);
    return p;
  }

  detectHats(p, gp) {
    if (gp.mapping === 'standard') return;
    gp.axes.forEach((v, i) => {
      if (Math.abs(v) > 1.1 && !p.hatAxes.has(i)) { p.hatAxes.add(i); this.bindingsCache.delete(p.devId); }
    });
  }

  onPadConnected(gp) {
    const p = this.registerPad(gp);
    // A slot waiting for this controller model gets it back automatically.
    const w = this.waiting.findIndex((id) => id === gp.id);
    if (w >= 0 && (this.slots[w] === p.devId || !this.slots.includes(p.devId))) { this.waiting[w] = null; this.slots[w] = p.devId; this.emit({ type: 'reconnected', slot: w, device: p.devId }); }
    else if (!this.slots.includes(p.devId)) {
      // Fill an empty slot or replace a keyboard fallback on P1 / P2 in order.
      const free = this.slots.findIndex((s, i) => s === null && this.waiting[i] === null);
      const kbSlot = this.slots.findIndex((s, i) => s && s.startsWith('kb') && this.waiting[i] === null && !this.manual?.[i]);
      const slot = free >= 0 ? free : kbSlot;
      if (slot >= 0) { this.assign(slot, p.devId, false); }
    }
    this.emit({ type: 'connected', device: p.devId, name: gp.id });
  }

  onPadDisconnected(gp) {
    const devId = 'pad:' + gp.index;
    const p = this.pads.get(devId);
    if (p) p.connected = false;
    const slot = this.slots.indexOf(devId);
    if (slot >= 0) { this.waiting[slot] = gp.id; this.emit({ type: 'disconnected', slot, device: devId, name: gp.id }); }
    this.emit({ type: 'padRemoved', device: devId });
  }

  autoAssign() {
    const pads = [...this.pads.values()].filter((p) => p.connected).sort((a, b) => a.index - b.index);
    const order = [...pads.map((p) => p.devId), 'kb1', 'kb2'];
    this.slots = [order[0], order.find((d, i) => i > 0 && d !== order[0])];
    this.waiting = [null, null];
  }

  // Assign a device to a slot. The same device can never control both fighters: swap instead.
  assign(slot, devId, manual = true) {
    const other = 1 - slot;
    if (this.slots[other] === devId) this.slots[other] = this.slots[slot];
    this.slots[slot] = devId;
    this.waiting[slot] = null;
    if (this.slots[other] === devId) this.slots[other] = null;
    this.manual = this.manual || [false, false];
    this.manual[slot] = manual;
    this.emit({ type: 'assigned', slot, device: devId });
  }

  useKeyboardFor(slot) {
    const kb = this.slots[1 - slot] === 'kb1' ? 'kb2' : 'kb1';
    this.assign(slot, kb);
  }

  deviceName(devId) {
    if (!devId) return 'None';
    if (devId === 'kb1') return 'Keyboard (WASD + U I J K)';
    if (devId === 'kb2') return 'Keyboard (Arrows + Numpad)';
    const p = this.pads.get(devId);
    return p ? `#${p.index + 1} ${p.id}` : devId;
  }

  deviceConnected(devId) {
    if (!devId) return false;
    if (devId.startsWith('kb')) return true;
    return !!this.pads.get(devId)?.connected;
  }

  listDevices() {
    const list = [...this.pads.values()].filter((p) => p.connected).map((p) => ({ id: p.devId, name: this.deviceName(p.devId), pad: true, mapping: p.mapping || 'non-standard' }));
    return [...list, { id: 'kb1', name: this.deviceName('kb1'), pad: false }, { id: 'kb2', name: this.deviceName('kb2'), pad: false }];
  }

  // ---------------------------------------------------------------- bindings
  profileKey(devId) {
    if (devId.startsWith('kb')) return devId;
    const p = this.pads.get(devId);
    return 'pad|' + (p ? p.id : devId);
  }

  defaultBindings(devId) {
    if (devId.startsWith('kb')) return structuredClone(KB_DEFAULTS[devId]);
    const p = this.pads.get(devId);
    if (!p || p.mapping === 'standard') return standardDefaults();
    return genericDefaults([...p.hatAxes]);
  }

  bindings(devId) {
    let b = this.bindingsCache.get(devId);
    if (b) return b;
    const saved = storageGet('ifa.bind.' + this.profileKey(devId));
    b = saved && typeof saved === 'object' ? { ...this.defaultBindings(devId), ...saved } : this.defaultBindings(devId);
    this.bindingsCache.set(devId, b);
    return b;
  }

  setBinding(devId, action, binding, replace = true) {
    const b = { ...this.bindings(devId) };
    // A physical input can only trigger one action on this device.
    for (const a of Object.keys(b)) b[a] = b[a].filter((x) => !sameBinding(x, binding));
    b[action] = replace ? [binding] : [...(b[action] || []), binding];
    // Keep the analog stick working for directions even when the D-pad is remapped.
    if (replace && ['up', 'down', 'left', 'right'].includes(action) && binding.type !== 'axis' && !devId.startsWith('kb')) {
      const stick = this.defaultBindings(devId)[action].find((x) => x.type === 'axis');
      if (stick && !sameBinding(stick, binding)) b[action].push(stick);
    }
    this.bindingsCache.set(devId, b);
    storageSet('ifa.bind.' + this.profileKey(devId), b);
  }

  resetBindings(devId) {
    try { localStorage.removeItem('ifa.bind.' + this.profileKey(devId)); } catch { /* ignore */ }
    this.bindingsCache.delete(devId);
  }

  // ---------------------------------------------------------------- polling
  onKey(e, down) {
    if (down && !e.repeat && !this.capture) {
      if (e.code === 'Enter' || e.code === 'Space') this.keyMenu.push({ action: 'confirm', device: 'kb1' });
      if (e.code === 'Escape' || e.code === 'Backspace') this.keyMenu.push({ action: 'back', device: 'kb1', escape: e.code === 'Escape' });
    }
    if (this.capture && down && this.capture.devId.startsWith('kb')) {
      e.preventDefault();
      const c = this.capture; this.capture = null;
      c.done(key(e.code));
      return;
    }
    if (down) { this.keys.add(e.code); this.latched.add(e.code); } else this.keys.delete(e.code);
    if (['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Space'].includes(e.code)) e.preventDefault();
    if (down) this.lastActivity.set(e.code.startsWith('Arrow') || e.code.startsWith('Numpad') ? 'kb2' : 'kb1', performance.now());
  }

  readBinding(b, gp) {
    switch (b.type) {
      case 'key': return this.keys.has(b.code) || this.latched.has(b.code);
      case 'button': { const x = gp?.buttons[b.index]; return !!x && (x.pressed || x.value > 0.5); }
      case 'axis': { const v = gp?.axes[b.index]; return v !== undefined && v * b.dir > STICK_THRESHOLD; }
      case 'hat': { const h = decodeHat(gp?.axes[b.index]); return !!h && h[b.dir]; }
      default: return false;
    }
  }

  // Poll all devices once per frame. Returns the raw input objects for [P1, P2].
  poll() {
    const gps = this.getGamepads();
    const live = new Map();
    for (const gp of gps) {
      if (!gp) continue;
      const devId = 'pad:' + gp.index;
      const p = this.pads.get(devId);
      if (!p || p.id !== gp.id || !p.connected) this.onPadConnected(gp);
      this.detectHats(this.pads.get(devId), gp);
      live.set(devId, gp);
    }
    // Some browsers do not fire gamepaddisconnected reliably: treat a pad missing from
    // getGamepads() for ~1 second as disconnected.
    for (const p of this.pads.values()) {
      if (!p.connected) continue;
      if (live.has(p.devId)) { p.missing = 0; continue; }
      if (++p.missing > 60) this.onPadDisconnected({ index: p.index, id: p.id });
    }
    this.livePads = live;
    if (this.capture) this.checkCapture(live);

    this.prevState = this.state;
    this.state = new Map();
    const devices = ['kb1', 'kb2', ...live.keys()];
    for (const devId of devices) {
      const gp = live.get(devId) || null;
      const b = this.bindings(devId);
      const s = {};
      let any = false;
      for (const a of ACTIONS) {
        const list = b[a.id] || [];
        s[a.id] = list.some((x) => this.readBinding(x, gp));
        if (s[a.id]) any = true;
      }
      if (gp) {
        // Analog stick: 8-way with wider sectors so diagonals are reachable but deliberate.
        const ax = gp.axes[0] || 0, ay = gp.axes[1] || 0;
        if (Math.hypot(ax, ay) > 0.5 && b.left.some((x) => x.type === 'axis')) {
          s.left = s.left || (ax < -0.38 && Math.abs(ax) > Math.abs(ay) * 0.41);
          s.right = s.right || (ax > 0.38 && Math.abs(ax) > Math.abs(ay) * 0.41);
          s.up = s.up || (ay < -0.38 && Math.abs(ay) > Math.abs(ax) * 0.41);
          s.down = s.down || (ay > 0.38 && Math.abs(ay) > Math.abs(ax) * 0.41);
        }
        if (gp.buttons.some((x) => x.pressed)) { any = true; }
      }
      if (any) this.lastActivity.set(devId, performance.now());
      this.state.set(devId, s);
    }
    this.latched.clear();
    return [this.slotInput(0), this.slotInput(1)];
  }

  slotInput(slot) {
    const devId = this.slots[slot];
    if (!devId || this.waiting[slot]) return null;
    return this.state.get(devId) || null;
  }

  pressed(devId, action) {
    const s = this.state.get(devId), p = this.prevState.get(devId);
    return !!(s && s[action] && !(p && p[action]));
  }

  // Edge-triggered menu navigation from every device: [{ dir|action, device }]
  menuEvents() {
    const out = this.keyMenu;
    this.keyMenu = [];
    const now = performance.now();
    for (const [devId, s] of this.state) {
      for (const a of ['up', 'down', 'left', 'right']) {
        const k = devId + a;
        if (s[a]) {
          const r = this.menuRepeat.get(k);
          if (!r) { out.push({ action: a, device: devId }); this.menuRepeat.set(k, now + 380); }
          else if (now > r) { out.push({ action: a, device: devId }); this.menuRepeat.set(k, now + 110); }
        } else this.menuRepeat.delete(k);
      }
      const isPad = !devId.startsWith('kb');
      const start = isPad && this.pressed(devId, 'pause');
      if (this.pressed(devId, 'b1') || this.pressed(devId, 'b3') || start) out.push({ action: 'confirm', device: devId, start });
      if (this.pressed(devId, 'b4') || this.pressed(devId, 'b2')) out.push({ action: 'back', device: devId });
      if (this.pressed(devId, 'guard') || this.pressed(devId, 'm12')) out.push({ action: 'alt', device: devId });
    }
    return out;
  }

  slotOf(devId) { return this.slots.indexOf(devId); }

  // ---------------------------------------------------------------- remap capture
  startCapture(devId, done) {
    const gp = this.livePads?.get(devId);
    this.capture = { devId, done, base: gp ? { axes: [...gp.axes], buttons: gp.buttons.map((b) => b.pressed || b.value > 0.5) } : null, t: performance.now() };
  }

  cancelCapture() { this.capture = null; }

  checkCapture(live) {
    const c = this.capture;
    if (c.devId.startsWith('kb')) return;
    const gp = live.get(c.devId);
    if (!gp) return;
    if (!c.base) { c.base = { axes: [...gp.axes], buttons: gp.buttons.map((b) => b.pressed || b.value > 0.5) }; return; }
    if (performance.now() - c.t < 150) return;
    for (let i = 0; i < gp.buttons.length; i++) {
      const on = gp.buttons[i].pressed || gp.buttons[i].value > 0.5;
      if (on && !c.base.buttons[i]) { this.capture = null; c.done(btn(i)); return; }
      if (!on) c.base.buttons[i] = false;
    }
    const p = this.pads.get(c.devId);
    for (let i = 0; i < gp.axes.length; i++) {
      const v = gp.axes[i], b0 = c.base.axes[i];
      if (p?.hatAxes.has(i)) {
        const h = decodeHat(v), hb = decodeHat(b0);
        if (h && !hb) {
          const dir = ['up', 'right', 'down', 'left'].find((d) => h[d]);
          this.capture = null; c.done(hat(i, dir)); return;
        }
        if (!h) c.base.axes[i] = v;
        continue;
      }
      if (Math.abs(v - b0) > 0.6 && Math.abs(v) > 0.6) { this.capture = null; c.done(axis(i, v > 0 ? 1 : -1)); return; }
    }
  }

  // Raw controller view for the test screen.
  rawState(devId) {
    const gp = this.livePads?.get(devId);
    if (!gp) return null;
    return { id: gp.id, mapping: gp.mapping || 'non-standard', buttons: gp.buttons.map((b) => b.value || (b.pressed ? 1 : 0)), axes: [...gp.axes], hatAxes: [...(this.pads.get(devId)?.hatAxes || [])] };
  }

  rumble(slot, strength = 0.5, ms = 120) {
    const gp = this.livePads?.get(this.slots[slot]);
    try { gp?.vibrationActuator?.playEffect?.('dual-rumble', { duration: ms, strongMagnitude: strength, weakMagnitude: strength * 0.6 }); } catch { /* not supported */ }
  }
}

export function describeBinding(b) {
  if (!b) return '—';
  switch (b.type) {
    case 'key': return b.code.replace(/^Key/, '').replace(/^Digit/, '').replace('Numpad', 'Num ');
    case 'button': return `Button ${b.index}`;
    case 'axis': return `Axis ${b.index}${b.dir > 0 ? '+' : '−'}`;
    case 'hat': return `Hat ${b.index} ${b.dir}`;
    default: return '?';
  }
}

function sameBinding(a, b) {
  return a.type === b.type && a.index === b.index && a.dir === b.dir && a.code === b.code;
}
