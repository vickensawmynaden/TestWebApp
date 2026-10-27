// Presentation metrics in a real browser: character load time, frame rate, and foot glide.
// Usage: (server running) node tests/e2e/visual-metrics.cjs [url] [p1] [p2] [frames] [models=skinned|procedural]
//
// A CPU-vs-CPU match runs for N simulation frames. After every rendered frame the world positions
// of both fighters' ankles are sampled. A foot counts as planted when the Animator's plant weight
// for it is above 0.5 on both samples; "glide" is horizontal ankle travel between consecutive
// samples in which the foot stayed planted, i.e. feet sliding on the floor.
// Note: in this container Chromium renders with SwiftShader (CPU), so fps is far below real GPUs;
// compare runs against each other, not against the 60 fps target.
const { chromium } = require('playwright');

const [url = 'http://localhost:8080/', p1 = 'ren', p2 = 'maya', frames = '600', models = 'skinned'] = process.argv.slice(2);

(async () => {
  const browser = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
  const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  const t0 = Date.now();
  await page.goto(url + (models === 'procedural' ? '?models=procedural' : ''));
  await page.waitForFunction(() => window.__app && window.__app.ui && window.__app.ui.stack && window.__app.ui.stack.length, null, { timeout: 180000 });
  const loadMs = Date.now() - t0;
  await page.evaluate(async ([a, b]) => {
    const app = window.__app;
    app.startMatch('cpu', a, b);
    const { CpuAI } = await import('/js/sim/ai.js');
    const m = app.match, cpu1 = new CpuAI(3), orig = m.tick.bind(m);
    m.tick = (inputs) => orig([cpu1.input(m.world, m.world.fighters[0]), inputs[1]]);
    m.skipIntro();
    const view = app.view, render = view.render.bind(view);
    const S = window.__metrics = { samples: [], fps: [] };
    view.render = (match, alpha, dt) => {
      render(match, alpha, dt);
      const row = { f: match.world.frame, feet: [] };
      view.models.forEach((mod, i) => {
        for (const limb of ['lFoot', 'rFoot']) {
          const p = mod.limbWorld(limb, view.tmpL.clone());
          row.feet.push([p.x, p.y, p.z, match.world.fighters[i].state, view.animators[i].pose[48 + (limb === 'lFoot' ? 0 : 1)]]);
        }
      });
      S.samples.push(row);
      S.fps.push(app.fps);
    };
  }, [p1, p2]);
  const start = await page.evaluate(() => window.__app.match.world.frame);
  await page.waitForFunction(([s, n]) => window.__app.match.world.frame >= s + n, [start, +frames], { timeout: 900000 });
  const S = await page.evaluate(() => window.__metrics);
  await browser.close();

  // ---- analysis
  const nFeet = 4;
  const minY = Array(nFeet).fill(Infinity);
  for (const r of S.samples) r.feet.forEach((p, k) => { minY[k] = Math.min(minY[k], p[1]); });
  let glide = 0, plantedFrames = 0, worst = 0;
  const perFrame = [];
  for (let i = 1; i < S.samples.length; i++) {
    const a = S.samples[i - 1], b = S.samples[i];
    const df = b.f - a.f;
    if (df <= 0 || df > 8) continue; // skip pauses / long gaps
    for (let k = 0; k < nFeet; k++) {
      const pa = a.feet[k], pb = b.feet[k];
      // planted = the animation timeline's plant weight (what the foot lock follows) on both samples
      if (!(pa[4] > 0.5 && pb[4] > 0.5)) continue;
      const d = Math.hypot(pb[0] - pa[0], pb[2] - pa[2]) / df;
      glide += d * df; plantedFrames += df; worst = Math.max(worst, d); perFrame.push(d);
    }
  }
  perFrame.sort((x, y) => x - y);
  const p95 = perFrame.length ? perFrame[Math.floor(perFrame.length * 0.95)] : 0;
  const fpsAvg = S.fps.slice(10).reduce((s, x) => s + x, 0) / Math.max(1, S.fps.length - 10);
  const out = {
    models, matchup: `${p1} vs ${p2}`, simFrames: +frames, renderedFrames: S.samples.length, loadMs,
    fpsAvg: +fpsAvg.toFixed(1),
    plantedFootFrames: plantedFrames,
    glideMeanMmPerFrame: +(1000 * glide / Math.max(1, plantedFrames)).toFixed(2),
    glideP95MmPerFrame: +(1000 * p95).toFixed(2),
    glideWorstMmPerFrame: +(1000 * worst).toFixed(2),
    errors,
  };
  console.log(JSON.stringify(out));
  process.exit(errors.length ? 1 : 0);
})();
