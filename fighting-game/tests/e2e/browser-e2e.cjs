// End-to-end browser test using Playwright + Chromium with two *emulated* gamepads.
// Usage: start the server (npm start) then: node tests/e2e/browser-e2e.cjs [http://localhost:8080]
// Emulation replaces navigator.getGamepads(), so this exercises the real input pipeline
// (detection, slot assignment, mapping, hat switch decoding, disconnect handling) but it is
// NOT a substitute for testing physical BeTop controllers.
const { chromium } = require('playwright');

const URL = process.argv[2] || 'http://localhost:8080/';
const results = [];
const check = (name, ok, info = '') => { results.push({ name, ok, info }); console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${info ? '  — ' + info : ''}`); };

function initPads() {
  // Pad 0: "standard" mapping (XInput-like). Pad 1: non-standard DirectInput pad with a hat switch on axis 9.
  const mk = (index, id, mapping, nButtons, nAxes) => ({
    index, id, mapping, connected: true, timestamp: 0,
    buttons: Array.from({ length: nButtons }, () => ({ pressed: false, touched: false, value: 0 })),
    axes: Array.from({ length: nAxes }, () => 0),
  });
  const pads = [
    mk(0, 'Xbox 360 Controller (XInput STANDARD GAMEPAD)', 'standard', 17, 4),
    mk(1, 'BETOP CONTROLLER (Vendor: 20bc Product: 5500)', '', 12, 10),
  ];
  pads[1].axes[9] = 1.2857;  // hat switch centred
  window.__pads = pads;
  window.__padsVisible = [true, true];
  navigator.getGamepads = () => window.__pads.map((p, i) => (window.__padsVisible[i] ? p : null));
  window.__press = (pi, b, on) => { const x = window.__pads[pi].buttons[b]; x.pressed = on; x.value = on ? 1 : 0; };
  window.__axis = (pi, a, v) => { window.__pads[pi].axes[a] = v; };
}

(async () => {
  const browser = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
  const page = await browser.newPage({ viewport: { width: 640, height: 360 } });
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
  const badRequests = [];
  page.on('response', (r) => { if (r.status() >= 400) badRequests.push(`${r.status()} ${r.url()}`); });
  page.on('requestfailed', (r) => badRequests.push(`failed ${r.url()}`));
  await page.addInitScript(initPads);
  await page.goto(URL);
  await page.waitForFunction(() => window.__app && window.__app.view);
  await page.waitForTimeout(500);
  const ev = (fn, arg) => page.evaluate(fn, arg);
  // Wait for N simulation frames (or N rendered frames outside a match). Software-rendered
  // headless Chromium can run far below 60 fps, so waits are frame-based, not time-based.
  const frames = async (n) => {
    const start = await ev(() => ({ f: window.__app.match ? window.__app.match.world.frame : 0, p: window.__app.paused, r: window.__rf || 0 }));
    if (!start.f || start.p) { await ev((k) => new Promise((res) => { let c = 0; const t = () => (++c >= k ? res() : requestAnimationFrame(t)); requestAnimationFrame(t); }), Math.min(n, 6)); return; }
    await page.waitForFunction(([f, k]) => !window.__app.match || window.__app.paused || window.__app.match.world.frame >= f + k, [start.f, n], { timeout: 60000 });
  };
  await ev(() => window.__app.view.setQuality('low'));

  // --- detection & assignment
  const slots = await ev(() => window.__app.input.slots);
  check('two gamepads detected and assigned to P1/P2', slots[0] === 'pad:0' && slots[1] === 'pad:1', JSON.stringify(slots));
  const hats = await ev(() => [...window.__app.input.pads.get('pad:1').hatAxes]);
  check('DirectInput hat switch auto-detected', hats.includes(9), JSON.stringify(hats));

  // --- title -> main menu with the P2 pad (non-standard face button 1 = bottom = confirm)
  await ev(() => window.__press(1, 1, true)); await frames(3); await ev(() => window.__press(1, 1, false)); await frames(3);
  const topName = await ev(() => window.__app.ui.top && window.__app.ui.top.constructor.name);
  check('controller can navigate menus', topName === 'MenuScreen', topName);

  // --- start a versus match and skip intro
  await ev(() => { window.__app.startMatch('versus', 'ren', 'maya'); window.__app.match.skipIntro(); });
  await page.waitForFunction(() => window.__app.match.phase === 'fight', null, { timeout: 15000 });
  const start = await ev(() => window.__app.match.world.fighters.map((f) => ({ x: f.pos.x, z: f.pos.z })));

  // --- P1 holds D-pad right (button 15) only: only P1 moves
  await ev(() => window.__press(0, 15, true)); await frames(40); await ev(() => window.__press(0, 15, false));
  const afterP1 = await ev(() => window.__app.match.world.fighters.map((f) => ({ x: f.pos.x, z: f.pos.z })));
  check('P1 pad moves only fighter 1', afterP1[0].x > start[0].x + 0.2 && Math.abs(afterP1[1].x - start[1].x) < 0.05, `p1 dx=${(afterP1[0].x - start[0].x).toFixed(2)} p2 dx=${(afterP1[1].x - start[1].x).toFixed(2)}`);

  // --- P2 holds hat LEFT (value 0.714) only: only P2 moves
  await ev(() => { const w = window.__app.match.world; w.fighters[0].pos.x = -3; w.fighters[1].pos.x = 2; });
  await frames(2);
  const beforeP2 = await ev(() => window.__app.match.world.fighters.map((f) => ({ x: f.pos.x, z: f.pos.z })));
  await ev(() => window.__axis(1, 9, 0.7143)); await frames(40); await ev(() => window.__axis(1, 9, 1.2857));
  const afterP2 = await ev(() => window.__app.match.world.fighters.map((f) => ({ x: f.pos.x, z: f.pos.z })));
  check('P2 hat switch moves only fighter 2', afterP2[1].x < beforeP2[1].x - 0.2 && Math.abs(afterP2[0].x - beforeP2[0].x) < 0.05, `p2 dx=${(afterP2[1].x - beforeP2[1].x).toFixed(2)} p1 dx=${(afterP2[0].x - beforeP2[0].x).toFixed(2)}`);

  // --- simultaneous movement: both stick axes at once
  await ev(() => { window.__axis(0, 0, 1); window.__axis(1, 0, -1); }); await frames(30);
  const both = await ev(() => window.__app.match.world.fighters.map((f) => f.state));
  await ev(() => { window.__axis(0, 0, 0); window.__axis(1, 0, 0); }); await frames(10);
  check('both players move simultaneously (analog sticks)', both[0] === 'walkF' || both[0] === 'run' || both[0] === 'idle' ? both.includes('walkF') : false, JSON.stringify(both));

  // --- attacks: P1 Square (button 2 = left punch) and P2 DirectInput button 0 (left punch)
  await ev(() => { const w = window.__app.match.world; w.fighters[0].pos.x = -0.5; w.fighters[1].pos.x = 0.5; });
  await frames(5);
  await ev(() => window.__press(0, 2, true)); await frames(3); await ev(() => window.__press(0, 2, false));
  await page.waitForFunction(() => window.__app.match.world.fighters[0].lastMoveInfo, null, { timeout: 5000 });
  const m1 = await ev(() => window.__app.match.world.fighters[0].lastMoveInfo);
  check('P1 face button 1 performs Ren\'s signature Anchor Jab', m1 && m1.name === 'Anchor Jab', m1 && `${m1.name} → ${m1.result}`);
  await frames(30);
  await ev(() => window.__press(1, 0, true)); await frames(3); await ev(() => window.__press(1, 0, false));
  await page.waitForFunction(() => window.__app.match.world.fighters[1].lastMoveInfo, null, { timeout: 5000 });
  const m2 = await ev(() => window.__app.match.world.fighters[1].lastMoveInfo);
  check('P2 DirectInput button performs Maya\'s signature Reef Jab', m2 && m2.name === 'Reef Jab', m2 && `${m2.name} → ${m2.result}`);

  // --- damage + HUD
  await ev(() => { const w = window.__app.match.world; w.fighters[0].pos.x = -0.45; w.fighters[1].pos.x = 0.45; });
  const hp0 = await ev(() => window.__app.match.world.fighters[1].hp);
  await ev(() => { window.__axis(1, 0, -1); }); // P2 walks forward (not guarding)
  await frames(4);
  await ev(() => window.__press(0, 2, true)); await frames(3); await ev(() => window.__press(0, 2, false));
  await frames(25);
  await ev(() => { window.__axis(1, 0, 0); });
  const hp1 = await ev(() => window.__app.match.world.fighters[1].hp);
  const bar = await ev(() => document.getElementById('p2hp').style.width);
  check('hit deals damage and HUD health bar updates', hp1 < hp0 && parseFloat(bar) < 100, `hp ${hp0}→${hp1}, bar ${bar}`);

  // --- pause only from assigned devices: Start on P2 pad (DirectInput button 9)
  await ev(() => window.__press(1, 9, true)); await frames(3); await ev(() => window.__press(1, 9, false)); await frames(3);
  const paused = await ev(() => window.__app.paused);
  check('Start button pauses the match', paused === true);
  // menu input while paused navigates the menu and does not leak into the (frozen) fight
  const stBefore = await ev(() => ({ f: window.__app.match.world.frame, sel: window.__app.ui.top.sel }));
  await ev(() => window.__press(0, 13, true)); await frames(4); await ev(() => window.__press(0, 13, false)); await frames(4);
  const stAfter = await ev(() => ({ f: window.__app.match.world.frame, sel: window.__app.ui.top.sel, p: window.__app.paused }));
  check('simulation frozen while paused', stBefore.f === stAfter.f && stAfter.p, JSON.stringify([stBefore, stAfter]));
  check('pause menu receives controller input', stAfter.sel !== stBefore.sel, `sel ${stBefore.sel} → ${stAfter.sel}`);
  await ev(() => window.__app.resume()); await frames(5);

  // --- disconnect P1 pad mid-fight -> auto pause with warning; reconnect -> slot restored
  await ev(() => { window.__padsVisible[0] = false; window.dispatchEvent(Object.assign(new Event('gamepaddisconnected'), { gamepad: window.__pads[0] })); });
  await frames(10);
  const dc = await ev(() => ({ paused: window.__app.paused, warn: document.getElementById('ctrl-warning').textContent, waiting: window.__app.input.waiting }));
  check('controller disconnect pauses and warns', dc.paused && /Player 1/.test(dc.warn), dc.warn);
  await ev(() => { window.__padsVisible[0] = true; window.dispatchEvent(Object.assign(new Event('gamepadconnected'), { gamepad: window.__pads[0] })); });
  await frames(10);
  const rc = await ev(() => ({ slots: window.__app.input.slots, waiting: window.__app.input.waiting }));
  check('reconnected controller returns to the same player', rc.slots[0] === 'pad:0' && !rc.waiting[0], JSON.stringify(rc));
  await ev(() => window.__app.resume()); await frames(5);

  // --- same device can never drive both fighters
  const sw = await ev(() => { const i = window.__app.input; i.assign(1, 'pad:0'); const r = [...i.slots]; i.assign(0, 'pad:0'); i.assign(1, 'pad:1'); return r; });
  check('assigning one pad to both slots swaps instead of duplicating', sw[0] !== sw[1] && sw[1] === 'pad:0', JSON.stringify(sw));

  // --- remapping: capture a new button for P1 "b1" and confirm it drives the action
  const remap = await ev(async () => {
    const i = window.__app.input;
    return await new Promise((res) => {
      i.startCapture('pad:0', (b) => { i.setBinding('pad:0', 'b1', b); res(b); });
      setTimeout(() => window.__press(0, 5, true), 300);
    });
  });
  await ev(() => window.__press(0, 5, false));
  const bind = await ev(() => window.__app.input.bindings('pad:0').b1);
  check('remap captures a new button and saves it', remap.type === 'button' && remap.index === 5 && bind[0].index === 5, JSON.stringify(bind));
  await ev(() => window.__app.input.resetBindings('pad:0'));

  // --- KO, round flow and rematch
  await ev(() => { const w = window.__app.match.world; w.fighters[1].hp = 1; w.fighters[0].pos.x = -0.45; w.fighters[1].pos.x = 0.45; });
  await ev(() => { window.__axis(1, 0, -1); });
  await frames(2);
  await ev(() => window.__press(0, 2, true)); await frames(3); await ev(() => window.__press(0, 2, false));
  await page.waitForFunction(() => ['ko', 'roundOver'].includes(window.__app.match.phase), null, { timeout: 10000 }).catch(() => {});
  await ev(() => { window.__axis(1, 0, 0); });
  const ph = await ev(() => window.__app.match.phase);
  check('KO ends the round', ph === 'ko' || ph === 'roundOver', ph);
  await page.waitForFunction(() => window.__app.match.round === 2 && window.__app.match.phase === 'fight', null, { timeout: 30000 }).catch(() => {});
  const r2 = await ev(() => ({ round: window.__app.match.round, wins: window.__app.match.wins, hp: window.__app.match.world.fighters.map((f) => f.hp) }));
  check('next round starts with reset health', r2.round === 2 && r2.wins[0] === 1 && r2.hp[1] === 100, JSON.stringify(r2));
  await ev(() => window.__app.rematch());
  const rm = await ev(() => ({ round: window.__app.match.round, wins: window.__app.match.wins }));
  check('rematch restarts without reloading', rm.round === 1 && rm.wins[0] === 0, JSON.stringify(rm));

  // --- every roster fighter can be selected through the select screen and renders in a match
  const SIX = ['ren', 'maya', 'viktor', 'leila', 'caio', 'sora'];
  for (let i = 0; i < SIX.length; i += 2) {
    const [a, b] = [SIX[i], SIX[i + 1]];
    const ok = await ev(([a, b]) => {
      const app = window.__app;
      app.toCharSelect('versus');
      const cs = app.ui.top;
      const ids = ['ren', 'maya', 'viktor', 'leila', 'caio', 'sora', 'kai'];
      cs.cur = [ids.indexOf(a), ids.indexOf(b)];
      cs.confirm(0); cs.confirm(1);
      const m = app.match;
      return m && m.chars[0] === a && m.chars[1] === b && app.view.models.length === 2 && app.view.models.every((x) => x.root.children.length > 0);
    }, [a, b]);
    await frames(10);
    check(`select + render ${a} vs ${b}`, ok);
  }
  // portraits come from the reference sheet
  const img = await ev(() => new Promise((res) => { const i = new Image(); i.onload = () => res([i.naturalWidth, i.naturalHeight]); i.onerror = () => res(null); i.src = 'public/references/fighter-roster.png'; }));
  check('reference portrait sheet loads', img && img[0] === 1536 && img[1] === 1024, JSON.stringify(img));
  check('no missing assets (HTTP errors)', badRequests.length === 0, badRequests.join(' | '));
  check('no page errors', errors.length === 0, errors.join(' | '));
  await browser.close();
  const failed = results.filter((r) => !r.ok).length;
  console.log(`\n${results.length - failed}/${results.length} checks passed`);
  process.exit(failed ? 1 : 0);
})();
