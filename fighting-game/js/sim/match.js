// Match flow: intro, round announcements, timer, KO / time-out, round wins, training mode.
import { World } from './world.js';
import { CHARACTERS } from './characters.js';
import { CpuAI, TrainingDummy } from './ai.js';
import { FPS, DEFAULT_RULES } from './constants.js';

export class Match {
  constructor({ p1 = 'ren', p2 = 'maya', mode = 'versus', roundsToWin = DEFAULT_RULES.roundsToWin,
    roundTime = DEFAULT_RULES.roundTime, cpuLevel = 2, skipIntro = false } = {}) {
    this.mode = mode;
    this.chars = [p1, p2];
    this.world = new World(CHARACTERS[p1], CHARACTERS[p2]);
    this.roundsToWin = roundsToWin;
    this.roundTime = roundTime;     // seconds, 0 = infinite
    this.wins = [0, 0];
    this.round = 1;
    this.events = [];
    this.cpu = mode === 'cpu' ? new CpuAI(cpuLevel) : null;
    this.dummy = mode === 'training' ? new TrainingDummy() : null;
    this.training = mode === 'training';
    this.world.trainingInfinite = this.training;
    this.calm = [0, 0];
    this.slowAcc = 0;
    this.winner = null;
    this.roundWinner = null;
    this.timeUp = false;
    this.startRound(skipIntro || this.training);
  }

  emit(type, data = {}) { this.events.push({ type, ...data }); }

  startRound(skipIntro) {
    this.world.resetPositions();
    this.timer = this.roundTime * FPS;
    this.roundWinner = null; this.timeUp = false;
    if (this.training) { this.setPhase('fight'); this.world.frozen = false; return; }
    this.setPhase(skipIntro || this.round > 1 ? 'roundCall' : 'intro');
    this.world.frozen = true;
    for (const f of this.world.fighters) f.state = 'intro';
  }

  setPhase(p) { this.phase = p; this.phaseT = 0; }

  skipIntro() { if (this.phase === 'intro') this.setPhase('roundCall'); }

  // Inputs: [raw P1, raw P2]. The CPU / dummy replaces P2 input.
  tick(inputs) {
    const w = this.world;
    const ins = [inputs[0], inputs[1]];
    if (this.cpu) ins[1] = this.cpu.input(w, w.fighters[1]);
    if (this.dummy) ins[1] = this.dummy.input(w, w.fighters[1]);
    this.phaseT++;
    switch (this.phase) {
      case 'intro':
        if (this.phaseT >= 200) this.setPhase('roundCall');
        break;
      case 'roundCall':
        if (this.phaseT === 1) {
          for (const f of w.fighters) if (f.state === 'intro') f.state = 'idle';
          const final = this.wins[0] === this.roundsToWin - 1 && this.wins[1] === this.roundsToWin - 1;
          this.emit('announce', { text: final ? 'FINAL ROUND' : `ROUND ${this.round}`, sound: 'round' });
        }
        if (this.phaseT === 75) this.emit('announce', { text: 'FIGHT!', sound: 'fight' });
        if (this.phaseT >= 85) { w.frozen = false; this.setPhase('fight'); }
        break;
      case 'fight':
        if (!this.training && this.roundTime > 0 && w.hitstop === 0) {
          this.timer--;
          if (this.timer <= 0) { this.timer = 0; this.endByTime(); }
        }
        if (w.koFighter) { this.setPhase('ko'); this.emit('announce', { text: 'K.O.', sound: 'ko', big: true }); }
        break;
      case 'ko':
        if (this.phaseT === 150) this.finishRound();
        break;
      case 'roundOver':
        if (this.phaseT === 30) {
          const wf = this.roundWinner;
          if (wf !== null && wf >= 0) { const f = w.fighters[wf]; if (f.isNeutral() || f.state === 'block') { w.setState(f, 'win'); } }
        }
        if (this.phaseT >= 170) this.nextRoundOrEnd();
        break;
      case 'matchOver':
        break;
    }
    // Slow motion after a KO.
    if (w.slowmo > 0) {
      w.slowmo--;
      this.slowAcc++;
      if (this.slowAcc % 3 !== 0) { this.collect(); return; }
    }
    w.step(ins);
    if (this.training) this.trainingUpkeep(inputs[0]);
    this.collect();
  }

  collect() {
    const w = this.world;
    if (w.events.length) { for (const e of w.events) this.events.push(e); w.events.length = 0; }
  }

  endByTime() {
    const w = this.world;
    this.timeUp = true;
    w.frozen = true;
    const [a, b] = w.fighters;
    const ra = a.hp / a.def.hp, rb = b.hp / b.def.hp;
    this.roundWinner = ra > rb ? 0 : rb > ra ? 1 : -1;
    this.emit('announce', { text: 'TIME UP', sound: 'ko', big: true });
    this.awardRound();
    this.setPhase('roundOver');
  }

  finishRound() {
    const w = this.world;
    const [a, b] = w.fighters;
    w.frozen = true;
    if (a.hp <= 0 && b.hp <= 0) this.roundWinner = -1;
    else this.roundWinner = a.hp <= 0 ? 1 : 0;
    this.awardRound();
    this.setPhase('roundOver');
  }

  awardRound() {
    const wi = this.roundWinner;
    if (wi === -1) {
      // Draw: both score, unless that would end the match for both (then replay the round).
      if (!(this.wins[0] + 1 >= this.roundsToWin && this.wins[1] + 1 >= this.roundsToWin)) { this.wins[0]++; this.wins[1]++; }
      this.emit('announce', { text: 'DRAW', sound: 'round' });
    } else {
      this.wins[wi]++;
      const f = this.world.fighters[wi];
      const perfect = f.hp >= f.def.hp;
      this.emit('roundWin', { winner: wi, perfect });
      if (perfect) this.emit('announce', { text: 'PERFECT', sound: 'ko', big: true });
    }
  }

  nextRoundOrEnd() {
    const champ = this.wins.findIndex(v => v >= this.roundsToWin);
    if (champ >= 0) {
      this.winner = champ;
      this.setPhase('matchOver');
      const f = this.world.fighters[champ];
      if (f.state !== 'win') { this.world.setState(f, 'win'); }
      this.emit('matchWin', { winner: champ });
      return;
    }
    this.round++;
    this.startRound(true);
  }

  trainingUpkeep(p1raw) {
    const w = this.world;
    // Refill health once a fighter has been out of combo for a moment.
    w.fighters.forEach((f, i) => {
      const calm = !f.combo.active && f.isNeutral();
      this.calm[i] = calm ? this.calm[i] + 1 : 0;
      if (this.calm[i] === 45 && f.hp < f.def.hp) { f.hp = f.def.hp; f.displayHp = f.hp; f.rage = false; f.rageUsed = false; }
    });
    if (p1raw && p1raw.reset && !this.resetHeld) this.resetTraining();
    this.resetHeld = !!(p1raw && p1raw.reset);
  }

  resetTraining() {
    this.world.resetPositions();
    this.emit('announce', { text: 'RESET', sound: null, small: true });
  }

  // Rage toggle for training: lets the player try Rage Arts at any health.
  setTrainingRage(on) {
    const f = this.world.fighters[0];
    f.rage = on; f.rageUsed = !on;
  }
}
