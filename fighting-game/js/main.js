// Entry point: owns the app state machine, the fixed-timestep game loop and wiring between
// input, simulation, rendering, audio and UI.
import { InputManager } from './input/InputManager.js';
import { AudioEngine } from './audio/Audio.js';
import { Match } from './sim/match.js';
import { DUMMY_MODES } from './sim/ai.js';
import { UI, MenuScreen, TitleScreen, CharSelectScreen, ControllerScreen, MoveListScreen, ResultScreen, moveListTable } from './ui/UI.js';

const STEP = 1 / 60;

function loadSettings() {
  const d = { roundsToWin: 2, roundTime: 60, cpuLevel: 2, quality: 'high' };
  try { return { ...d, ...JSON.parse(localStorage.getItem('ifa.settings') || '{}') }; } catch { return d; }
}

class App {
  constructor() {
    this.settings = loadSettings();
    this.input = new InputManager(window);
    this.audio = new AudioEngine();
    this.ui = new UI(this);
    this.state = 'menu';
    this.match = null;
    this.paused = false;
    this.acc = 0;
    this.last = performance.now();
    this.fps = 60;
    this.view = null;
    this.input.on((e) => this.onInputEvent(e));
  }

  async init() {
    try {
      const { GameView } = await import('./render/GameView.js');
      this.view = new GameView(document.getElementById('game'), this.settings.quality);
      // A background match for the menu scenery
      this.menuMatch = new Match({ p1: 'kai', p2: 'viktor', mode: 'versus', skipIntro: true, roundTime: 0 });
      this.menuMatch.world.frozen = false;
      this.view.setMatch(this.menuMatch);
    } catch (err) {
      console.error(err);
      document.getElementById('screens').innerHTML = `<div class="screen"><div class="panel"><div class="title">WebGL unavailable</div><div class="hint">${String(err.message || err)}<br>This game needs a browser with WebGL 2 enabled.</div></div></div>`;
      return;
    }
    this.ui.push(new TitleScreen(this));
    window.__app = this; // handy for debugging and automated tests
    requestAnimationFrame((t) => this.frame(t));
  }

  saveSettings() { try { localStorage.setItem('ifa.settings', JSON.stringify(this.settings)); } catch { /* ignore */ } }

  // ------------------------------------------------------------------ screens
  showMain() {
    this.endMatch();
    this.audio.startMusic('menu');
    this.ui.replace(new MenuScreen(this, { logo: true, items: [
      { label: 'Versus (2 Players)', action: () => this.toCharSelect('versus') },
      { label: 'Versus CPU', action: () => this.toCharSelect('cpu') },
      { label: 'Training', action: () => this.toCharSelect('training') },
      { label: 'Controllers', action: () => this.ui.push(new ControllerScreen(this)) },
      { label: 'Settings', action: () => this.showSettings() },
      { label: 'Move List', action: () => this.ui.push(new MoveListScreen(this, 'kai')) },
    ], hint: this.controllerHint() }));
  }

  controllerHint() {
    const n = this.input.listDevices().filter((d) => d.pad).length;
    return `${n} controller${n === 1 ? '' : 's'} detected · P1: ${this.input.deviceName(this.input.slots[0])} · P2: ${this.input.deviceName(this.input.slots[1])}`;
  }

  showSettings() {
    const s = this.settings, a = this.audio;
    const cyc = (list, v, d) => list[(list.indexOf(v) + d + list.length) % list.length];
    const vol = (k) => ({ label: k[0].toUpperCase() + k.slice(1) + ' volume', value: () => Math.round(a.vol[k] * 10) + ' / 10', adjust: (d) => a.setVolume(k, Math.max(0, Math.min(1, Math.round(a.vol[k] * 10 + d) / 10))) });
    this.ui.push(new MenuScreen(this, { title: 'Settings', items: [
      { label: 'Rounds to win', value: () => String(s.roundsToWin), adjust: (d) => { s.roundsToWin = cyc([1, 2, 3], s.roundsToWin, d); this.saveSettings(); } },
      { label: 'Round time', value: () => (s.roundTime ? s.roundTime + ' s' : '∞'), adjust: (d) => { s.roundTime = cyc([30, 60, 99, 0], s.roundTime, d); this.saveSettings(); } },
      { label: 'CPU difficulty', value: () => ['', 'Easy', 'Normal', 'Hard'][s.cpuLevel], adjust: (d) => { s.cpuLevel = cyc([1, 2, 3], s.cpuLevel, d); this.saveSettings(); } },
      { label: 'Graphics', value: () => s.quality, adjust: (d) => { s.quality = cyc(['low', 'medium', 'high'], s.quality, d); this.view.setQuality(s.quality); this.saveSettings(); } },
      vol('master'), vol('sfx'), vol('music'), vol('voice'),
      { label: 'Back', action: () => this.ui.pop() },
    ], onBack: () => this.ui.pop(), hint: 'Left / Right to change values' }));
  }

  toCharSelect(mode) {
    this.endMatch();
    this.ui.replace(new CharSelectScreen(this, mode));
  }

  // ------------------------------------------------------------------ match
  startMatch(mode, p1, p2) {
    this.lastSetup = { mode, p1, p2 };
    const s = this.settings;
    this.match = new Match({ p1, p2, mode, roundsToWin: s.roundsToWin, roundTime: s.roundTime, cpuLevel: s.cpuLevel });
    this.view.setMatch(this.match);
    this.ui.clear();
    this.ui.hud.setup(this.match);
    this.ui.hud.show(true);
    this.state = 'fight';
    this.paused = false;
    this.acc = 0;
    this.resultShown = false;
    this.audio.startMusic('battle');
    this.audio.musicStyle = 'battle';
  }

  rematch() { const l = this.lastSetup; this.startMatch(l.mode, l.p1, l.p2); }

  endMatch() {
    if (this.state === 'fight') {
      this.state = 'menu';
      this.match = null;
      this.ui.hud.show(false);
      this.view.setMatch(this.menuMatch);
      this.audio.musicStyle = 'menu';
    }
    this.paused = false;
  }

  pause(reason = '') {
    if (this.paused || this.state !== 'fight') return;
    this.paused = true;
    const m = this.match;
    const items = [
      { label: 'Resume', action: () => this.resume() },
      { label: 'Dummy behaviour', hidden: () => !m.training, value: () => m.dummy.mode, adjust: (d) => { const i = DUMMY_MODES.indexOf(m.dummy.mode); m.dummy.mode = DUMMY_MODES[(i + d + DUMMY_MODES.length) % DUMMY_MODES.length]; } },
      { label: 'P1 Rage', hidden: () => !m.training, value: () => (m.world.fighters[0].rage ? 'ON' : 'OFF'), adjust: () => m.setTrainingRage(!m.world.fighters[0].rage) },
      { label: 'Show move list in HUD', hidden: () => !m.training, value: () => (document.getElementById('movelist').classList.contains('hidden') ? 'OFF' : 'ON'), adjust: () => this.toggleHudMoves() },
      { label: 'Reset positions', hidden: () => !m.training, action: () => { m.resetTraining(); this.resume(); } },
      { label: 'Restart match', hidden: () => m.training, action: () => this.rematch() },
      { label: 'Move List', action: () => this.ui.push(new MoveListScreen(this, m.chars[0])) },
      { label: 'Controllers', action: () => this.ui.push(new ControllerScreen(this)) },
      { label: 'Settings', action: () => this.showSettings() },
      { label: 'Character Select', action: () => this.toCharSelect(m.mode) },
      { label: 'Main Menu', action: () => this.showMain() },
    ];
    this.ui.push(new MenuScreen(this, { title: reason ? 'Paused — ' + reason : 'Paused', items, overlay: true, onBack: () => this.resume() }));
  }

  toggleHudMoves() {
    const n = document.getElementById('movelist');
    n.classList.toggle('hidden');
    if (!n.classList.contains('hidden')) n.innerHTML = moveListTable(this.match.chars[0]);
  }

  resume() {
    if (this.input.waiting[0] || this.input.waiting[1]) {
      const s = this.input.waiting[0] ? 1 : 2;
      document.getElementById('ctrl-warning').textContent = `Player ${s}'s controller is disconnected — reconnect it, or assign another device in Controllers.`;
      document.getElementById('ctrl-warning').classList.remove('hidden');
      return;
    }
    document.getElementById('ctrl-warning').classList.add('hidden');
    this.ui.clear();
    this.paused = false;
    this.acc = 0;
    this.pauseBlock = 2;
  }

  onInputEvent(e) {
    if (e.type === 'disconnected' && this.state === 'fight') {
      if (!(this.match.mode !== 'versus' && e.slot === 1)) {
        const w = document.getElementById('ctrl-warning');
        w.textContent = `Player ${e.slot + 1}'s controller disconnected — reconnect it or reassign in Controllers.`;
        w.classList.remove('hidden');
        this.pause(`P${e.slot + 1} controller lost`);
      }
    }
    if (e.type === 'reconnected') {
      document.getElementById('ctrl-warning').classList.add('hidden');
    }
    const top = this.ui.top;
    if (top instanceof ControllerScreen) top.onDevicesChanged();
  }

  // ------------------------------------------------------------------ loop
  frame(now) {
    const dt = Math.min(0.1, (now - this.last) / 1000);
    this.last = now;
    this.fps = this.fps * 0.95 + (dt > 0 ? 1 / dt : 60) * 0.05;
    const raw = this.input.poll();
    const menuEvents = this.input.menuEvents();

    if (this.state === 'fight' && this.match) {
      const m = this.match;
      // Pause is only read from the two assigned devices (or Esc) so menus never steal fight input.
      let justPaused = false;
      if (!this.paused) {
        if (this.pauseBlock > 0) this.pauseBlock--;
        else {
          const wantPause = [0, 1].some((i) => this.input.slots[i] && this.input.pressed(this.input.slots[i], 'pause')) || menuEvents.some((e) => e.escape);
          if (wantPause && m.phase !== 'matchOver') { this.pause(); justPaused = true; }
        }
        if (m.phase === 'intro' && menuEvents.some((e) => e.action === 'confirm')) m.skipIntro();
      }
      if (!this.paused && !this.debugFreeze) {
        this.acc += dt;
        let steps = 0;
        while (this.acc >= STEP && steps < 5) {
          m.tick(raw);
          this.handleEvents(m);
          this.acc -= STEP; steps++;
        }
        if (steps === 5) this.acc = 0;
        this.ui.hud.update(m);
        if (m.phase === 'matchOver' && m.phaseT > 150 && !this.resultShown) {
          this.resultShown = true;
          this.ui.push(new ResultScreen(this, m));
        }
      }
      // The press that opened the pause menu must not also select its first item.
      if ((this.paused || this.resultShown) && !justPaused) this.ui.handle(menuEvents);
      this.view.render(m, this.paused ? 0 : this.acc / STEP, this.paused ? 0 : dt);
    } else {
      this.ui.handle(menuEvents);
      if (this.menuMatch) { this.menuMatch.tick([null, null]); this.menuMatch.events.length = 0; }
      this.view.renderMenu(dt);
    }
    requestAnimationFrame((t) => this.frame(t));
  }

  handleEvents(m) {
    const a = this.audio, hud = this.ui.hud;
    for (const e of m.events) {
      this.view.onEvent(e);
      switch (e.type) {
        case 'swing': {
          const heavy = e.sfx === 'heavy';
          a.play('whoosh', { heavy });
          if (heavy && Math.random() < 0.6) a.play('grunt', { char: m.chars[e.fighter] });
          break;
        }
        case 'hit': case 'counter':
          a.play(e.type === 'counter' ? 'counter' : e.sfx === 'heavy' || e.heavy ? 'hitHeavy' : e.sfx === 'light' ? 'hitLight' : 'hitMedium');
          if (e.heavy || Math.random() < 0.3) a.play('grunt', { char: m.chars[e.defender], big: e.heavy });
          this.input.rumble(e.defender, e.heavy ? 0.9 : 0.5, e.heavy ? 200 : 90);
          this.input.rumble(e.attacker, 0.25, 60);
          if (e.type === 'counter') hud.callout(e.attacker, 'COUNTER HIT');
          if (e.reaction === 'launch' && e.combo <= 1) hud.callout(e.attacker, 'LAUNCH!');
          break;
        case 'block': a.play('block'); this.input.rumble(e.defender, 0.2, 50); break;
        case 'parry': a.play('parry'); hud.callout(e.defender, 'PARRY!'); break;
        case 'armor': a.play('hitHeavy'); hud.callout(e.defender, 'POWER CRUSH'); break;
        case 'land': if (e.heavy) a.play('land'); else a.play('step'); break;
        case 'step': a.play('step', { soft: e.soft }); break;
        case 'throw': a.play('throw'); break;
        case 'throwBreak': a.play('tech'); if (e.defender !== undefined) hud.callout(e.defender, 'THROW ESCAPE'); break;
        case 'wallsplat': a.play('wall'); hud.callout(1 - e.fighter, 'WALL SPLAT'); break;
        case 'wallHit': a.play('wall'); break;
        case 'crumple': hud.callout(1 - e.fighter, 'CRUMPLE'); break;
        case 'rage': hud.callout(e.fighter, 'RAGE'); a.play('rage'); break;
        case 'rageArt': a.play('rage'); hud.callout(e.fighter, 'RAGE ART'); break;
        case 'ko': a.play('ko'); break;
        case 'announce':
          hud.announce(e.text, e.big, e.small);
          if (e.sound === 'round' || e.sound === 'fight') a.play('bell');
          if (e.sound) a.say(e.text.replace('K.O.', 'K. O.').toLowerCase());
          break;
        case 'matchWin': a.say(`${m.world.fighters[e.winner].def.name.toLowerCase()} wins`); break;
      }
    }
    m.events.length = 0;
  }
}

const app = new App();
app.init();
