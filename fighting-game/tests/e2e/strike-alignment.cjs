// Visible-strike vs collision alignment, measured in the real renderer.
// Usage: (server running) node tests/e2e/strike-alignment.cjs [url] [screenshotDir]
// For every hand / foot strike of every fighter, the move is started in a training match, the
// simulation is stepped to its first active frame, the frame is rendered, and the distance between
// the model's striking limb (limbWorld) and the simulation's hit point is measured. A strike is
// aligned when that distance is within the move's hit radius.
const { chromium } = require('playwright');

const URL = process.argv[2] || 'http://localhost:8080/';
const SHOTS = process.argv[3] || null;

(async () => {
  const browser = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
  const page = await browser.newPage({ viewport: { width: 960, height: 540 } });
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.goto(URL + '?debug=hitboxes' + (process.env.ALIGN === 'off' ? '&align=off' : ''));
  await page.waitForFunction(() => window.__app && window.__app.ui && window.__app.ui.stack && window.__app.ui.stack.length, null, { timeout: 180000 });
  const ids = ['ren', 'maya', 'viktor', 'leila', 'caio', 'sora', 'kai'];
  const report = {};
  for (const id of ids) {
    report[id] = await page.evaluate((id) => {
      const app = window.__app;
      app.startMatch('training', id, 'ren');
      app.paused = true;                       // drive the simulation by hand
      const m = app.match, w = m.world, [A, D] = w.fighters;
      const out = [];
      for (const mv of A.commandMoves) {
        if (!mv.hitPointLocal || !['lHand', 'rHand', 'lFoot', 'rFoot'].includes(mv.limb) || mv.spec.special) continue;
        m.resetTraining();
        A.pos.x = -0.6; D.pos.x = 1.6; A.pos.z = D.pos.z = 0; A.face.x = 1; A.face.z = 0;
        w.startMove(A, mv);
        let guard = 0;
        while (A.mf < mv.startup && guard++ < 80) { w.step([null, null]); }
        A.prevPos.x = A.pos.x; A.prevPos.z = A.pos.z; A.prevPos.y = A.pos.y; A.prevFace.x = A.face.x; A.prevFace.z = A.face.z;
        app.view.render(m, 1, 0);
        const [hr, hy, hf] = mv.hitPointLocal;
        const rx = -A.face.z, rz = A.face.x;
        const sim = [A.pos.x + A.face.x * hf + rx * hr, A.pos.y + hy, A.pos.z + A.face.z * hf + rz * hr];
        const v = app.view.models[0].limbWorld(mv.limb, app.view.tmpL.clone());
        // collision semantics: ground-plane reach within the hit radius, height within the level band
        const err = Math.hypot(v.x - sim[0], v.z - sim[2]);
        const [hl, hh] = w.hitboxRange(A);
        const inBand = v.y >= hl - 0.1 && v.y <= hh + 0.1;
        out.push({ move: mv.id, limb: mv.limb, err: +err.toFixed(3), y: +v.y.toFixed(2), band: [hl, hh], inBand, radius: mv.radius || 0.2, lunge: +(app.view.models[0].lunge?.length() || 0).toFixed(3) });
      }
      app.paused = false;
      return out;
    }, id);
  }
  if (SHOTS) {
    // overlay screenshots: a jab and a kick at contact for two fighters
    for (const [id, mv] of [['ren', 'ren_1'], ['caio', 'caio_4'], ['viktor', 'vik_1'], ['sora', 'sora_f4']]) {
      await page.evaluate(([id, mv]) => {
        const app = window.__app; app.startMatch('training', id, 'maya'); app.paused = true;
        const m = app.match, w = m.world, [A, D] = w.fighters;
        A.pos.x = -0.45; D.pos.x = 0.45; const move = A.moveMap.get(mv); w.startMove(A, move);
        while (A.mf < move.startup) w.step([null, null]);
        A.prevPos.x = A.pos.x; D.prevPos.x = D.pos.x;
        for (let k = 0; k < 3; k++) app.view.render(m, 1, 0);
      }, [id, mv]);
      await page.screenshot({ path: `${SHOTS}/overlay_${id}.png` });
    }
  }
  await browser.close();
  let worst = 0, misaligned = 0, total = 0, bandMiss = 0;
  for (const [id, rows] of Object.entries(report)) {
    const errs = rows.map((r) => r.err);
    const bad = rows.filter((r) => r.err > r.radius);
    const outBand = rows.filter((r) => !r.inBand);
    total += rows.length; misaligned += bad.length; worst = Math.max(worst, ...errs); bandMiss += outBand.length;
    console.log(`${id.padEnd(7)} strikes ${rows.length}  reach error mean ${(errs.reduce((a, b) => a + b, 0) / errs.length).toFixed(3)} m  max ${Math.max(...errs).toFixed(3)} m  outside radius: ${bad.map((b) => `${b.move} ${b.err}`).join(', ') || 'none'}  outside height band: ${outBand.map((b) => `${b.move} y${b.y}`).join(', ') || 'none'}  max lunge ${Math.max(...rows.map((r) => r.lunge)).toFixed(2)} m`);
  }
  console.log(`\n${total - misaligned}/${total} strikes: visible limb within the hit radius at contact (worst ${worst.toFixed(3)} m); ${total - bandMiss}/${total} inside the level's height band`);
  if (errors.length) console.log('page errors:', errors);
  process.exit(misaligned || bandMiss || errors.length ? 1 : 0);
})();
