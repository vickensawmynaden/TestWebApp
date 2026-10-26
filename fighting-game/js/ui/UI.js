// Menus and HUD. Every screen is navigable with any controller (D-pad/stick + face buttons),
// the keyboard (arrows/WASD + Enter/Escape) or the mouse.
import { ACTIONS, describeBinding } from '../input/InputManager.js';
import { CHARACTERS } from '../sim/characters.js';
import { DUMMY_MODES } from '../sim/ai.js';

const $ = (sel, root = document) => root.querySelector(sel);
const el = (tag, cls, html) => { const e = document.createElement(tag); if (cls) e.className = cls; if (html !== undefined) e.innerHTML = html; return e; };
const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const CHAR_IDS = Object.keys(CHARACTERS);

export class UI {
  constructor(app) {
    this.app = app;
    this.root = $('#screens');
    this.stack = [];
    this.hud = new HUD(app);
  }

  get top() { return this.stack[this.stack.length - 1] || null; }

  push(screen) { this.stack.push(screen); screen.mount(this.root); }
  pop() { const s = this.stack.pop(); s?.unmount(); this.top?.refresh?.(); return s; }
  replace(screen) { while (this.stack.length) this.stack.pop().unmount(); this.push(screen); }
  clear() { while (this.stack.length) this.stack.pop().unmount(); }

  handle(events) {
    const s = this.top;
    if (!s) return;
    for (const e of events) {
      if (this.top !== s) break;
      s.onInput(e);
    }
    s.tick?.();
  }
}

// ------------------------------------------------------------------ generic list menu
export class MenuScreen {
  constructor(app, { title = '', logo = false, items = [], overlay = false, hint = '', onBack = null, extra = null }) {
    Object.assign(this, { app, title, logo, items, overlay, hint, onBack, extra });
    this.sel = 0;
  }
  mount(root) {
    this.node = el('div', 'screen' + (this.overlay ? ' overlay' : ''));
    if (this.logo) this.node.appendChild(el('div', 'logo', '<h1>IRON FIST<br>ARENA</h1><div class="sub">3D FIGHTING</div>'));
    const wrap = el('div', this.logo ? '' : 'panel');
    if (this.title) wrap.appendChild(el('div', 'title', esc(this.title)));
    if (this.extra) wrap.appendChild(this.extra());
    this.list = el('div', 'menu');
    wrap.appendChild(this.list);
    if (this.hint) wrap.appendChild(el('div', 'hint', this.hint));
    this.node.appendChild(wrap);
    this.node.appendChild(el('div', 'foot', 'Navigate: D-pad / stick / arrows · Select: [1]/[3] / Enter · Back: [4]/[2] / Esc'));
    root.appendChild(this.node);
    this.refresh();
  }
  unmount() { this.node?.remove(); }
  visibleItems() { return this.items.filter((i) => !i.hidden || !i.hidden()); }
  refresh() {
    if (!this.list) return;
    this.list.innerHTML = '';
    const items = this.visibleItems();
    this.sel = Math.min(this.sel, items.length - 1);
    items.forEach((it, i) => {
      const d = el('div', 'item' + (i === this.sel ? ' sel' : '') + (it.disabled?.() ? ' disabled' : ''));
      d.innerHTML = esc(typeof it.label === 'function' ? it.label() : it.label) + (it.value ? `<span class="val">${esc(it.value())}</span>` : '');
      d.addEventListener('mouseenter', () => { this.sel = i; this.refresh(); });
      d.addEventListener('click', () => { this.app.audio.unlock(); this.sel = i; this.activate(it, 1); });
      if (it.value) d.addEventListener('contextmenu', (e) => { e.preventDefault(); it.adjust?.(-1); this.refresh(); });
      this.list.appendChild(d);
    });
  }
  activate(it, dir) {
    if (it.disabled?.()) return;
    if (it.adjust) { it.adjust(dir); this.app.audio.play('menuMove'); this.refresh(); return; }
    this.app.audio.play('menuOk');
    it.action?.();
    this.refresh();
  }
  onInput(e) {
    const items = this.visibleItems();
    if (e.action === 'up') { this.sel = (this.sel - 1 + items.length) % items.length; this.app.audio.play('menuMove'); this.refresh(); }
    else if (e.action === 'down') { this.sel = (this.sel + 1) % items.length; this.app.audio.play('menuMove'); this.refresh(); }
    else if ((e.action === 'left' || e.action === 'right') && items[this.sel]?.adjust) { items[this.sel].adjust(e.action === 'left' ? -1 : 1); this.app.audio.play('menuMove'); this.refresh(); }
    else if (e.action === 'confirm') this.activate(items[this.sel], 1);
    else if (e.action === 'back' && this.onBack) { this.app.audio.play('menuBack'); this.onBack(); }
  }
}

// ------------------------------------------------------------------ title
export class TitleScreen {
  constructor(app) { this.app = app; }
  mount(root) {
    this.node = el('div', 'screen');
    this.node.innerHTML = `<div class="logo"><h1>IRON FIST<br>ARENA</h1><div class="sub">3D FIGHTING</div></div>
      <div class="hint" style="font-size:22px;letter-spacing:0.4em;color:#fff;animation:pulse 0.8s infinite alternate">PRESS ANY BUTTON</div>
      <div class="hint">Connect two controllers (USB or Bluetooth) and press a button on each so the browser exposes them.</div>
      <div class="foot">Original characters & assets · Built with Three.js / WebGL</div>`;
    this.node.addEventListener('click', () => this.go());
    root.appendChild(this.node);
  }
  unmount() { this.node.remove(); }
  go() { this.app.audio.unlock(); this.app.audio.play('menuOk'); this.app.audio.startMusic('menu'); this.app.showMain(); }
  onInput(e) { if (e.action === 'confirm' || e.action === 'back') this.go(); }
}

// ------------------------------------------------------------------ character select
export class CharSelectScreen {
  constructor(app, mode) {
    this.app = app; this.mode = mode;
    this.cur = [0, 1 % CHAR_IDS.length];
    this.ready = [false, false];
    this.single = mode !== 'versus';
    this.phase = 0; // single-player: 0 = choosing P1, 1 = choosing opponent
  }
  mount(root) {
    this.node = el('div', 'screen');
    this.node.appendChild(el('div', 'title', this.mode === 'training' ? 'TRAINING — SELECT' : this.mode === 'cpu' ? 'VERSUS CPU — SELECT' : 'VERSUS — SELECT'));
    this.body = el('div', 'cs');
    this.node.appendChild(this.body);
    this.node.appendChild(el('div', 'hint', this.single ? 'Left/Right to choose · [1]/Enter to confirm · [4]/Esc to go back' : 'Each player uses their own controller · Left/Right to choose · confirm with [1] or [3] · cancel with [4]'));
    root.appendChild(this.node);
    this.refresh();
  }
  unmount() { this.node.remove(); }
  side(i) {
    const c = CHARACTERS[CHAR_IDS[this.cur[i]]];
    const pips = (n) => Array.from({ length: 5 }, (_, k) => `<i class="${k < n ? 'on' : ''}"></i>`).join('');
    const label = this.single && i === 1 ? (this.mode === 'training' ? 'DUMMY' : 'CPU') : `PLAYER ${i + 1}`;
    const dev = this.single && i === 1 ? '' : `<div class="device">${esc(this.app.input.deviceName(this.app.input.slots[i]))}</div>`;
    return `<div class="who">${label}</div><div class="cname">${c.name}</div><div class="style">${esc(c.style)}</div>
      <div class="blurb">${esc(c.blurb)}</div>
      ${Object.entries(c.stats).map(([k, v]) => `<div class="stat"><span>${k.toUpperCase()}</span><span class="pips">${pips(v)}</span></div>`).join('')}
      ${this.ready[i] ? '<div class="ready">READY</div>' : (this.single && i !== this.phase ? '<div class="device">waiting…</div>' : '<div class="device">choosing…</div>')}${dev}`;
  }
  refresh() {
    this.body.innerHTML = '';
    const s1 = el('div', 'cs-side p1', this.side(0));
    const grid = el('div', 'cs-grid');
    CHAR_IDS.forEach((id, k) => {
      const p = el('div', `portrait ${id}` + (this.cur[0] === k ? ' p1sel' : '') + (this.cur[1] === k ? ' p2sel' : ''), CHARACTERS[id].name);
      if (this.cur[0] === k) p.appendChild(el('span', 'cur c1', '1P'));
      if (this.cur[1] === k) p.appendChild(el('span', 'cur c2', this.single ? 'CPU' : '2P'));
      p.addEventListener('click', () => { const s = this.single ? this.phase : 0; if (!this.ready[s]) { this.cur[s] = k; this.confirm(s); } });
      grid.appendChild(p);
    });
    const s2 = el('div', 'cs-side p2', this.side(1));
    this.body.append(s1, grid, s2);
  }
  confirm(slot) {
    this.app.audio.play('menuOk');
    this.ready[slot] = true;
    if (this.single && slot === 0) this.phase = 1;
    if (this.ready[0] && this.ready[1]) this.app.startMatch(this.mode, CHAR_IDS[this.cur[0]], CHAR_IDS[this.cur[1]]);
    else this.refresh();
  }
  onInput(e) {
    let slot;
    if (this.single) slot = this.phase;
    else { slot = this.app.input.slotOf(e.device); if (slot < 0) slot = e.device === 'kb1' ? 0 : -1; if (slot < 0) return; }
    if (e.action === 'left' || e.action === 'right') {
      if (this.ready[slot]) return;
      this.cur[slot] = (this.cur[slot] + (e.action === 'left' ? -1 : 1) + CHAR_IDS.length) % CHAR_IDS.length;
      this.app.audio.play('menuMove'); this.refresh();
    } else if (e.action === 'confirm') {
      if (!this.ready[slot]) this.confirm(slot);
    } else if (e.action === 'back') {
      this.app.audio.play('menuBack');
      if (this.single && this.phase === 1 && !this.ready[1]) { this.phase = 0; this.ready[0] = false; this.refresh(); return; }
      if (this.ready[slot]) { this.ready[slot] = false; this.refresh(); }
      else this.app.showMain();
    }
  }
}

// ------------------------------------------------------------------ controllers
export class ControllerScreen {
  constructor(app) { this.app = app; this.joining = -1; this.sel = 0; this.last = 0; }
  mount(root) {
    this.node = el('div', 'screen');
    const panel = el('div', 'panel');
    panel.appendChild(el('div', 'title', 'Controllers'));
    this.grid = el('div', 'ctrl-grid');
    panel.appendChild(this.grid);
    this.btnRow = el('div', 'btns');
    panel.appendChild(this.btnRow);
    this.devs = el('div', 'devlist');
    panel.appendChild(this.devs);
    panel.appendChild(el('div', 'hint', 'Join: choose "Assign P1/P2", then press any button on the controller you want. A controller can only drive one fighter — assigning it to the other slot swaps them.<br>No controller detected? Press a button on it: browsers only expose gamepads after a button press.'));
    this.node.appendChild(panel);
    root.appendChild(this.node);
    this.buttons = [
      { label: 'Assign P1', act: () => this.startJoin(0) },
      { label: 'Assign P2', act: () => this.startJoin(1) },
      { label: 'Swap P1 ⇄ P2', act: () => { const [a, b] = this.app.input.slots; this.app.input.assign(0, b); this.app.input.assign(1, a); } },
      { label: 'P1 → Keyboard', act: () => this.app.input.useKeyboardFor(0) },
      { label: 'P2 → Keyboard', act: () => this.app.input.useKeyboardFor(1) },
      { label: 'Remap P1', act: () => this.app.ui.push(new RemapScreen(this.app, 0)) },
      { label: 'Remap P2', act: () => this.app.ui.push(new RemapScreen(this.app, 1)) },
      { label: 'Back', act: () => this.back() },
    ];
    this.renderButtons();
    this.refresh(true);
  }
  unmount() { this.node.remove(); }
  back() { this.app.audio.play('menuBack'); this.app.ui.pop(); }
  startJoin(slot) { this.joining = slot; this.joinT = performance.now(); this.refresh(true); }
  renderButtons() {
    this.btnRow.innerHTML = '';
    this.buttons.forEach((b, i) => {
      const d = el('button', 'btn' + (i === this.sel ? ' sel' : ''), esc(b.label));
      d.addEventListener('click', () => { this.sel = i; b.act(); this.renderButtons(); this.refresh(true); });
      this.btnRow.appendChild(d);
    });
  }
  slotHtml(i) {
    const inp = this.app.input;
    const dev = inp.slots[i];
    const waiting = inp.waiting[i];
    const ok = !waiting && inp.deviceConnected(dev);
    let status = waiting ? `DISCONNECTED — waiting for “${esc(waiting)}”` : ok ? 'CONNECTED' : 'NO DEVICE';
    if (this.joining === i) status = 'PRESS ANY BUTTON ON A CONTROLLER…';
    return `<h3>PLAYER ${i + 1}</h3><div class="dev">${esc(inp.deviceName(dev))}</div><div class="status ${ok ? 'ok' : 'bad'}">${status}</div><div class="live"></div>`;
  }
  refresh(full) {
    if (full || !this.slotNodes) {
      this.grid.innerHTML = '';
      this.slotNodes = [0, 1].map((i) => { const d = el('div', `slot p${i + 1}`, this.slotHtml(i)); this.grid.appendChild(d); return d; });
      const list = this.app.input.listDevices();
      this.devs.innerHTML = '<b>Detected devices:</b> ' + list.map((d) => `${esc(d.name)}${d.pad ? ` <i>(${esc(d.mapping)} mapping)</i>` : ''}`).join(' · ');
    }
    // live controller test view
    this.slotNodes.forEach((node, i) => {
      const inp = this.app.input;
      const dev = inp.slots[i];
      const live = $('.live', node);
      const st = inp.state.get(dev) || {};
      let html = '<div class="actions-state">' + ACTIONS.map((a) => `<span class="${st[a.id] ? 'on' : ''}">${esc(a.id)}</span>`).join('') + '</div>';
      const raw = dev ? inp.rawState(dev) : null;
      if (raw) {
        html += `<div class="livebox">Buttons:<div class="chips">${raw.buttons.map((v, k) => `<span class="chip ${v > 0.5 ? 'on' : ''}">${k}</span>`).join('')}</div>`;
        html += 'Axes: ' + raw.axes.map((v, k) => `<span class="axis">${k}${raw.hatAxes.includes(k) ? '(hat)' : ''} <span class="axbar"><b style="left:${Math.round((Math.max(-1, Math.min(1, v)) + 1) * 28.5)}px"></b></span></span>`).join('') + '</div>';
      }
      live.innerHTML = html;
    });
  }
  tick() {
    const now = performance.now();
    if (this.joining >= 0 && now - this.joinT > 250) {
      // first pad with any pressed button joins the waiting slot
      for (const [devId, gp] of this.app.input.livePads || []) {
        if (gp.buttons.some((b) => b.pressed)) {
          this.app.input.assign(this.joining, devId);
          this.app.audio.play('menuOk');
          this.joining = -1; this.joinBlock = now + 300;
          this.refresh(true);
          return;
        }
      }
    }
    if (now - this.last > 50) { this.last = now; this.refresh(false); }
  }
  onInput(e) {
    if (this.joining >= 0) { if (e.action === 'back' && e.device.startsWith('kb')) { this.joining = -1; this.refresh(true); } return; }
    if (this.joinBlock && performance.now() < this.joinBlock) return;
    if (e.action === 'left' || e.action === 'up') { this.sel = (this.sel - 1 + this.buttons.length) % this.buttons.length; this.renderButtons(); }
    else if (e.action === 'right' || e.action === 'down') { this.sel = (this.sel + 1) % this.buttons.length; this.renderButtons(); }
    else if (e.action === 'confirm') { this.app.audio.play('menuOk'); this.buttons[this.sel].act(); if (this.app.ui.top === this) { this.renderButtons(); this.refresh(true); } }
    else if (e.action === 'back') this.back();
  }
  // re-render device names when the list changes
  onDevicesChanged() { this.refresh(true); }
}

export class RemapScreen {
  constructor(app, slot) { this.app = app; this.slot = slot; this.sel = 0; this.capturing = false; }
  get dev() { return this.app.input.slots[this.slot]; }
  mount(root) {
    this.node = el('div', 'screen');
    this.panel = el('div', 'panel');
    this.node.appendChild(this.panel);
    root.appendChild(this.node);
    this.refresh();
  }
  unmount() { this.node.remove(); this.app.input.cancelCapture(); }
  rows() { return [...ACTIONS.map((a) => ({ type: 'action', a })), { type: 'reset' }, { type: 'back' }]; }
  refresh() {
    const inp = this.app.input, dev = this.dev;
    if (!dev) { this.panel.innerHTML = '<div class="title">No device</div><div class="hint">Assign a device to this player first.</div>'; return; }
    const b = inp.bindings(dev);
    const rows = this.rows();
    let html = `<div class="title">Remap — Player ${this.slot + 1}</div><div class="hint" style="margin:0 0 10px">${esc(inp.deviceName(dev))}</div><table class="map">`;
    rows.forEach((r, i) => {
      const cls = (i === this.sel ? 'sel' : '') + (this.capturing && i === this.sel ? ' capturing' : '');
      if (r.type === 'action') html += `<tr class="${cls}" data-i="${i}"><td>${esc(r.a.label)}</td><td class="b">${this.capturing && i === this.sel ? 'PRESS INPUT… (Esc / wait 5s to cancel)' : esc((b[r.a.id] || []).map(describeBinding).join(' / ') || '—')}</td></tr>`;
      else html += `<tr class="${cls}" data-i="${i}"><td colspan="2">${r.type === 'reset' ? 'Reset to defaults' : 'Back'}</td></tr>`;
    });
    html += '</table><div class="hint">Select an action and press the new button / direction on this device. Bindings are saved per controller model.</div>';
    this.panel.innerHTML = html;
    this.panel.querySelectorAll('tr').forEach((tr) => tr.addEventListener('click', () => { this.sel = +tr.dataset.i; this.choose(); }));
  }
  choose() {
    const r = this.rows()[this.sel];
    if (r.type === 'back') { this.app.audio.play('menuBack'); this.app.ui.pop(); return; }
    if (r.type === 'reset') { this.app.input.resetBindings(this.dev); this.app.audio.play('menuOk'); this.refresh(); return; }
    this.capturing = true;
    this.captureStart = performance.now();
    this.refresh();
    this.app.input.startCapture(this.dev, (binding) => {
      this.capturing = false;
      this.app.input.setBinding(this.dev, r.a.id, binding);
      this.app.audio.play('menuOk');
      this.ignoreUntil = performance.now() + 250;
      this.refresh();
    });
  }
  tick() {
    if (this.capturing && performance.now() - this.captureStart > 5000) { this.capturing = false; this.app.input.cancelCapture(); this.refresh(); }
  }
  onInput(e) {
    if (this.capturing) { if (e.action === 'back' && e.escape) { this.capturing = false; this.app.input.cancelCapture(); this.refresh(); } return; }
    if (this.ignoreUntil && performance.now() < this.ignoreUntil) return;
    const n = this.rows().length;
    if (e.action === 'up') { this.sel = (this.sel - 1 + n) % n; this.refresh(); }
    else if (e.action === 'down') { this.sel = (this.sel + 1) % n; this.refresh(); }
    else if (e.action === 'confirm') this.choose();
    else if (e.action === 'back') { this.app.audio.play('menuBack'); this.app.ui.pop(); }
  }
}

// ------------------------------------------------------------------ move list
export function moveListTable(charId) {
  const c = CHARACTERS[charId];
  const rows = c.moves.filter((m) => !m.inString || m.cmd !== 'auto').map((m) => {
    const cmd = m.cmd === 'air' ? 'jump + any' : m.cmd === 'auto' ? '(after parry)' : m.inString ? '↳ ' + m.cmd : m.cmd;
    const adv = m.level === 'throw' ? `break ${m.breakMask === 3 ? '1+2' : m.breakMask === 1 ? '1' : '2'}` : m.level === 'parry' ? 'parries high/mid' : `${fmt(m.block)} / ${m.onHit ? m.onHit : fmt(m.hit)}`;
    return `<tr><td>${esc(m.name)}${m.rage ? ' <b style="color:#ff6a50">(RAGE)</b>' : ''}</td><td>${esc(cmd)}</td><td>${m.level}</td><td>${m.dmg || ''}</td><td>${m.level === 'parry' ? '' : 'i' + m.startup}</td><td>${esc(adv)}</td></tr>`;
  });
  return `<table class="movetable"><tr><th>Move</th><th>Command</th><th>Level</th><th>Dmg</th><th>Start</th><th>Block / Hit</th></tr>${rows.join('')}</table>`;
}
const fmt = (n) => (n > 0 ? '+' + n : String(n));

export class MoveListScreen {
  constructor(app, charId = 'kai') { this.app = app; this.charId = charId; }
  mount(root) {
    this.node = el('div', 'screen overlay');
    this.panel = el('div', 'panel');
    this.node.appendChild(this.panel);
    root.appendChild(this.node);
    this.refresh();
  }
  unmount() { this.node.remove(); }
  refresh() {
    const c = CHARACTERS[this.charId];
    this.panel.innerHTML = `<div class="title">${c.name} — Move List</div>${moveListTable(this.charId)}
      <div class="hint">Notation: f/b/u/d = toward/away/up/down relative to your fighter · 1 LP · 2 RP · 3 LK · 4 RK · f,f = dash · qcf = d, df, f<br>
      Tap up/down to sidestep, hold to jump/crouch · Hold back (or Guard) to block high/mid, hold down-back to block lows · Left/Right: switch character · Back to close</div>`;
  }
  onInput(e) {
    if (e.action === 'left' || e.action === 'right') { const i = CHAR_IDS.indexOf(this.charId); this.charId = CHAR_IDS[(i + 1) % CHAR_IDS.length]; this.refresh(); }
    else if (e.action === 'back' || e.action === 'confirm') { this.app.audio.play('menuBack'); this.app.ui.pop(); }
  }
}

// ------------------------------------------------------------------ results
export class ResultScreen {
  constructor(app, match) { this.app = app; this.match = match; this.sel = 0; }
  mount(root) {
    const m = this.match;
    const name = CHARACTERS[m.chars[m.winner]].name;
    const who = m.mode === 'cpu' && m.winner === 1 ? 'CPU' : `PLAYER ${m.winner + 1}`;
    this.node = el('div', 'screen overlay result');
    this.node.innerHTML = `<div class="winner">${name} WINS</div><div class="sub">${who} · ${m.wins[0]} – ${m.wins[1]}</div>`;
    this.menu = new MenuScreen(this.app, { items: [
      { label: 'Rematch', action: () => this.app.rematch() },
      { label: 'Character Select', action: () => this.app.toCharSelect(m.mode) },
      { label: 'Main Menu', action: () => this.app.showMain() },
    ] });
    this.menu.list = el('div', 'menu');
    this.node.appendChild(this.menu.list);
    root.appendChild(this.node);
    this.menu.refresh();
  }
  unmount() { this.node.remove(); }
  onInput(e) { this.menu.onInput(e); }
}

// ------------------------------------------------------------------ HUD
class HUD {
  constructor(app) {
    this.app = app;
    this.root = $('#hud');
    this.ann = $('#announce');
    this.annTimer = 0;
    this.comboT = [0, 0];
    this.callT = [0, 0];
    this.lastTimer = -1;
  }
  show(on) { this.root.classList.toggle('hidden', !on); }
  setup(match) {
    $('#p1name').textContent = CHARACTERS[match.chars[0]].name;
    $('#p2name').textContent = CHARACTERS[match.chars[1]].name + (match.mode === 'cpu' ? ' (CPU)' : '');
    $('#timer').style.visibility = match.training || match.roundTime === 0 ? 'hidden' : 'visible';
    $('#training-panel').classList.toggle('hidden', !match.training);
    if (match.training) $('#movelist').innerHTML = '';
    this.ann.classList.remove('show');
    this.comboT = [0, 0];
  }
  announce(text, big, small) {
    this.ann.textContent = text;
    this.ann.className = 'show' + (big ? ' ko' : '') + (small ? ' small' : '');
    this.annTimer = small ? 40 : 75;
  }
  callout(side, text) {
    const n = $(side === 0 ? '#callout1' : '#callout2');
    n.textContent = text; n.classList.add('show');
    this.callT[side] = 70;
  }
  combo(side, hits, dmg) {
    const n = $(side === 0 ? '#combo1' : '#combo2');
    $('.hits', n).textContent = hits;
    $('.dmg', n).textContent = `${dmg} DAMAGE`;
    n.classList.add('show');
    this.comboT[side] = 80;
  }
  rounds(node, wins, need) {
    let h = '';
    for (let i = 0; i < need; i++) h += `<i class="${i < wins ? 'won' : ''}"></i>`;
    if (node.innerHTML !== h) node.innerHTML = h;
  }
  update(match) {
    const w = match.world;
    w.fighters.forEach((f, i) => {
      const pct = Math.max(0, f.hp / f.def.hp * 100), lag = Math.max(0, f.displayHp / f.def.hp * 100);
      const fill = $(i === 0 ? '#p1hp' : '#p2hp'), lagN = $(i === 0 ? '#p1lag' : '#p2lag');
      fill.style.width = pct + '%'; lagN.style.width = lag + '%';
      fill.classList.toggle('low', pct <= 25);
      $(i === 0 ? '#p1rage' : '#p2rage').classList.toggle('on', f.rage);
      // live combo counter for the attacker (on the defender's combo state)
      const d = w.fighters[1 - i];
      if (d.combo.active && d.combo.hits >= 2) this.combo(i, d.combo.hits, d.combo.dmg);
    });
    this.rounds($('#p1rounds'), match.wins[0], match.roundsToWin);
    this.rounds($('#p2rounds'), match.wins[1], match.roundsToWin);
    const secs = Math.ceil(match.timer / 60);
    if (secs !== this.lastTimer) { const t = $('#timer'); t.textContent = match.roundTime === 0 ? '∞' : secs; t.classList.toggle('urgent', secs <= 10); this.lastTimer = secs; }
    for (const i of [0, 1]) {
      if (this.comboT[i] > 0 && --this.comboT[i] === 0) $(i === 0 ? '#combo1' : '#combo2').classList.remove('show');
      if (this.callT[i] > 0 && --this.callT[i] === 0) $(i === 0 ? '#callout1' : '#callout2').classList.remove('show');
    }
    if (this.annTimer > 0 && --this.annTimer === 0) this.ann.classList.remove('show');
    if (match.training) this.training(match);
  }
  training(match) {
    const f = match.world.fighters[0], d = match.world.fighters[1];
    const info = f.lastMoveInfo;
    let txt = '';
    if (info) {
      const adv = info.result === 'block' ? fmt(info.block) : (info.result === 'hit' || info.result === 'ch') ? (info.onHit || fmt(info.hit)) : '—';
      txt += `Last move : ${info.name} (${info.cmd})\nStartup   : i${info.startup}   Level: ${info.level}\nResult    : ${info.result.toUpperCase()}   Adv: ${adv}\n`;
    } else txt += 'Last move : —\n\n\n';
    txt += `Combo     : ${d.combo.hits} hits / ${d.combo.dmg} dmg\nP1 state  : ${f.state}${f.move ? ' ' + f.move.name + ' f' + f.mf : ''}\nDummy     : ${d.state}`;
    $('#tp-info').textContent = txt;
    $('#tp-dummy').textContent = match.dummy.mode;
  }
}

export { DUMMY_MODES };
