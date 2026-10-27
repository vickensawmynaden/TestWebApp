// Owns the WebGL renderer, scene, post-processing and all presentation objects for a match.
import * as THREE from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { Stage, buildEnvScene } from './Stage.js';
import { FighterModel } from './FighterModel.js';
import { SkinnedFighter, hasSkinned } from './SkinnedFighter.js';
import { Animator } from './Animator.js';
import { CameraRig } from './CameraRig.js';
import { Effects } from './Effects.js';
import { APPEARANCES } from './appearance.js';

const TRAIL_COLORS = Object.fromEntries(Object.entries(APPEARANCES).map(([k, a]) => [k, a.trail]));
const AURA = Object.fromEntries(Object.entries(APPEARANCES).map(([k, a]) => [k, a.aura]));

export class GameView {
  constructor(canvas, quality = 'high') {
    this.canvas = canvas;
    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance' });
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.05;
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color(0x0a0a10);
    this.camera = new THREE.PerspectiveCamera(38, 16 / 9, 0.1, 400);
    this.rig = new CameraRig(this.camera);
    const pmrem = new THREE.PMREMGenerator(this.renderer);
    const envScene = buildEnvScene();
    this.scene.environment = pmrem.fromScene(envScene, 0.04).texture;
    this.scene.environmentIntensity = 0.55;
    pmrem.dispose();
    this.stage = new Stage(this.scene, quality);
    this.effects = new Effects(this.scene);
    this.models = []; this.animators = [];
    this.tmpA = new THREE.Vector3(); this.tmpB = new THREE.Vector3(); this.tmpL = new THREE.Vector3();
    this.composer = new EffectComposer(this.renderer);
    this.composer.addPass(new RenderPass(this.scene, this.camera));
    this.bloom = new UnrealBloomPass(new THREE.Vector2(256, 256), 0.5, 0.45, 0.82);
    this.composer.addPass(this.bloom);
    this.composer.addPass(new OutputPass());
    this.setQuality(quality);
    this.resize();
    window.addEventListener('resize', () => this.resize());
  }

  setQuality(q) {
    this.quality = q;
    const dpr = window.devicePixelRatio || 1;
    this.pixelRatio = q === 'high' ? Math.min(2, dpr) : q === 'medium' ? Math.min(1.25, dpr) : 0.75;
    this.renderer.setPixelRatio(this.pixelRatio);
    this.bloom.enabled = q !== 'low';
    this.renderer.shadowMap.type = q === 'low' ? THREE.BasicShadowMap : THREE.PCFSoftShadowMap;
    this.resize();
  }

  resize() {
    const w = this.canvas.clientWidth || window.innerWidth, h = this.canvas.clientHeight || window.innerHeight;
    this.renderer.setSize(w, h, false);
    this.composer.setPixelRatio(this.pixelRatio);
    this.composer.setSize(w, h);
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
  }

  setMatch(match) {
    for (const m of this.models) { this.scene.remove(m.root); m.dispose(); }
    this.models = []; this.animators = [];
    match.chars.forEach((c, i) => {
      const def = match.world.fighters[i].def;
      // Rigged glTF character when available; the procedural model is the fallback (and Kai's body).
      const m = hasSkinned(c) ? new SkinnedFighter(c, def) : new FighterModel(c, def);
      this.scene.add(m.root);
      this.models.push(m);
      this.animators.push(new Animator(c));
    });
    this.effects.clear();
    this.rig.snap = true;
    this.match = match;
  }

  cameraMode(match) {
    const w = match.world;
    switch (match.phase) {
      case 'intro': { const focus = match.phaseT < 100 ? 0 : 1; return { mode: 'intro', focus, t: match.phaseT % 100, cut: match.phaseT === 1 || match.phaseT === 100 }; }
      case 'ko': return match.phaseT > 20 ? { mode: 'ko', focus: w.koFighter ? w.koFighter.index : 1, t: match.phaseT, cut: match.phaseT === 21 } : { mode: 'fight' };
      case 'roundOver': if (match.roundWinner >= 0 && match.phaseT > 30) return { mode: 'win', focus: match.roundWinner, t: match.phaseT, cut: match.phaseT === 31 }; return { mode: 'fight' };
      case 'matchOver': return { mode: 'win', focus: match.winner, t: match.phaseT, cut: match.phaseT === 1 };
      default: return { mode: 'fight' };
    }
  }

  // Presentation-side reactions to simulation events.
  onEvent(e) {
    const fx = this.effects;
    switch (e.type) {
      case 'hit': fx.hit(e.pos, e.heavy, false); break;
      case 'counter': fx.hit(e.pos, true, true); break;
      case 'block': fx.block(e.pos, e.heavy); break;
      case 'parry': fx.parry(e.pos); break;
      case 'armor': fx.hit(e.pos, true, false); fx.ring(e.pos, 1.4, 0.3, 0xffffff, false); break;
      case 'land': fx.dust(e.pos, e.heavy ? 1.6 : 0.6); if (e.heavy) this.rig.shake(0.25); break;
      case 'wallsplat': case 'wallHit': fx.dust(e.pos, 1.2); fx.flash(e.pos, 1.2, 0.15, 0xffc080); break;
      case 'shake': this.rig.shake(e.amount); break;
      case 'throwBreak': fx.flash(e.pos, 1.0, 0.15, 0xffffff); fx.burst(e.pos, 20, 3, 0.25, 0.1, [1, 1, 1]); break;
      case 'ko': fx.flash(e.pos, 3, 0.35, 0xffffff); this.rig.shake(1); break;
      case 'rageArt': { const f = this.match.world.fighters[e.fighter]; fx.rage([f.pos.x, 1, f.pos.z], AURA[this.match.chars[e.fighter]]); break; }
      case 'swing':
        if (e.move === 'vik_d4') { this.pendingStomp = { fighter: e.fighter, at: 19 }; }
        break;
    }
  }

  render(match, alpha, dt) {
    const w = match.world;
    const [fa, fb] = w.fighters;
    const pa = this.tmpA.set(fa.prevPos.x + (fa.pos.x - fa.prevPos.x) * alpha, fa.prevPos.y + (fa.pos.y - fa.prevPos.y) * alpha, fa.prevPos.z + (fa.pos.z - fa.prevPos.z) * alpha);
    const pb = this.tmpB.set(fb.prevPos.x + (fb.pos.x - fb.prevPos.x) * alpha, fb.prevPos.y + (fb.pos.y - fb.prevPos.y) * alpha, fb.prevPos.z + (fb.pos.z - fb.prevPos.z) * alpha);
    const ps = [pa, pb];
    w.fighters.forEach((f, i) => {
      const m = this.models[i];
      const fx = f.prevFace.x + (f.face.x - f.prevFace.x) * alpha, fz = f.prevFace.z + (f.face.z - f.prevFace.z) * alpha;
      // Juggled / airborne fighters are drawn at their sim height; the pose handles body orientation.
      m.root.position.copy(ps[i]);
      m.root.rotation.y = Math.atan2(fx, fz);
      const pose = this.animators[i].update(f, w, w.hitstop > 0 ? 0 : alpha);
      m.applyPose(pose);
      // Trails on active strikes
      const mv = f.state === 'attack' ? f.move : null;
      const trailOn = !!(mv && mv.limb && mv.limb !== 'body' && f.mf >= mv.startup - 4 && f.mf <= mv.startup + mv.active + 1);
      m.root.updateMatrixWorld(true);
      if (mv && mv.limb) m.limbWorld(mv.limb, this.tmpL); else this.tmpL.set(ps[i].x, 1, ps[i].z);
      this.effects.updateTrail(i, trailOn, this.tmpL, this.camera, TRAIL_COLORS[match.chars[i]]);
      if (f.rage) this.effects.aura([ps[i].x, ps[i].y, ps[i].z], AURA[match.chars[i]]);
      if (this.pendingStomp && this.pendingStomp.fighter === i && f.state === 'attack' && f.move.id === 'vik_d4' && f.mf >= this.pendingStomp.at) {
        this.effects.shockwave([ps[i].x + f.face.x * 0.4, 0, ps[i].z + f.face.z * 0.4]);
        this.rig.shake(0.5);
        this.pendingStomp = null;
      }
    });
    const cm = this.cameraMode(match);
    this.rig.update(dt, { a: pa, b: pb, faceA: fa.face, faceB: fb.face, camDir: w.camDir, ...cm });
    this.stage.update(dt, { x: (pa.x + pb.x) / 2, z: (pa.z + pb.z) / 2 }, this.camera.position);
    this.effects.update(dt * (w.slowmo > 0 ? 0.4 : 1));
    if (this.bloom.enabled) this.composer.render(dt); else this.renderer.render(this.scene, this.camera);
  }

  // Idle background render for menus: slow orbit around the arena.
  renderMenu(dt) {
    this.menuT = (this.menuT || 0) + dt;
    const a = this.menuT * 0.06;
    this.camera.position.set(Math.sin(a) * 9, 2.6, Math.cos(a) * 9);
    this.camera.lookAt(0, 1.2, 0);
    this.stage.update(dt, { x: 0, z: 0 });
    this.effects.update(dt);
    if (this.models.length && this.match) {
      this.match.world.fighters.forEach((f, i) => {
        const m = this.models[i];
        m.root.position.set(f.pos.x, 0, f.pos.z);
        m.root.rotation.y = Math.atan2(f.face.x, f.face.z);
        m.applyPose(this.animators[i].update(f, this.match.world, 0));
      });
    }
    if (this.bloom.enabled) this.composer.render(dt); else this.renderer.render(this.scene, this.camera);
  }
}
