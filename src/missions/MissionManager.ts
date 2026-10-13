// Interprets data-driven missions: step progression, event matching, timers, rewards, persistence.
// Gameplay-specific "actions" (spawn the scooter, pick up a parcel) are registered by the game.
import { MISSIONS, MissionDef, StepDef } from '../config/missions';
import { EventBus, GameEvents } from '../core/EventBus';
import { Wallet } from '../economy/Wallet';
import { formatINR } from '../economy/money';

export interface MissionHost {
  events: EventBus;
  wallet: Wallet;
  playerPos(): { x: number; z: number; inVehicle: boolean };
  setObjective(o: { title: string; text: string; x?: number; z?: number } | null): void;
  say(speaker: string, text: string, seconds: number): void;
}

export interface MissionSave { completed: string[]; active: { id: string; step: number; data: Record<string, unknown> } | null; flags: Record<string, boolean>; deliveries: number }

export class MissionManager {
  completed = new Set<string>();
  active: { def: MissionDef; step: number; data: Record<string, unknown>; timeLeft: number } | null = null;
  flags: Record<string, boolean> = {};
  deliveries = 0;
  actions = new Map<string, (args?: Record<string, unknown>) => void>();
  private sayQueue: [string, string][] = [];
  private sayTimer = 0;
  private unsub: (() => void)[] = [];
  private eventHit = false;
  enabled = true;

  constructor(private host: MissionHost, private defs: MissionDef[] = MISSIONS) {
    // listen to every event type any mission step cares about
    const types = new Set<keyof GameEvents>();
    for (const d of defs) for (const s of d.steps) if (s.kind === 'event') types.add(s.event);
    for (const t of types) this.unsub.push(host.events.on(t, (p) => this.onEvent(t, p as Record<string, unknown>)));
  }

  /** Start a mission if requirements are met. */
  start(id: string): boolean {
    const def = this.defs.find((d) => d.id === id);
    if (!def || this.active || this.completed.has(id)) return false;
    if (!def.requires.every((r) => this.completed.has(r))) return false;
    this.active = { def, step: -1, data: {}, timeLeft: def.timeLimitSec ?? Infinity };
    this.host.events.emit('mission:start', { missionId: id });
    this.host.events.emit('notify', { title: `${def.title} • ${def.titleHi}`, body: def.description, kind: 'mission' });
    this.advance();
    return true;
  }

  available(): MissionDef[] {
    return this.defs.filter((d) => !this.completed.has(d.id) && d.requires.every((r) => this.completed.has(r)));
  }

  private get step(): StepDef | null {
    const a = this.active;
    return a && a.step >= 0 && a.step < a.def.steps.length ? a.def.steps[a.step] : null;
  }

  private advance() {
    const a = this.active;
    if (!a) return;
    a.step++;
    this.eventHit = false;
    const s = this.step;
    if (!s) return this.complete();
    if (s.kind === 'say') {
      this.sayQueue.push(...s.lines);
      this.sayTimer = 0;
    } else if (s.kind === 'action') {
      const fn = this.actions.get(s.action);
      if (fn) fn(s.args);
      else console.warn('[Missions] unknown action', s.action);
      this.advance();
      return;
    }
    this.publishObjective();
  }

  private publishObjective() {
    const a = this.active, s = this.step;
    if (!a || !s) return this.host.setObjective(null);
    if (s.kind === 'goto') this.host.setObjective({ title: a.def.title, text: s.text, x: s.x, z: s.z });
    else if (s.kind === 'event') this.host.setObjective({ title: a.def.title, text: s.text, x: s.x, z: s.z });
  }

  private onEvent(type: keyof GameEvents, payload: Record<string, unknown>) {
    const s = this.step;
    if (!s || s.kind !== 'event' || s.event !== type) return;
    if (s.match && !Object.entries(s.match).every(([k, v]) => payload[k] === v)) return;
    this.eventHit = true;
  }

  update(dt: number) {
    if (!this.enabled) return;
    // dialogue queue (the timer keeps running after the last line so 'say' steps can finish)
    this.sayTimer -= dt;
    if (this.sayQueue.length) {
      if (this.sayTimer <= 0) {
        const [who, line] = this.sayQueue.shift()!;
        const secs = Math.min(7, 2.2 + line.length * 0.045);
        this.host.say(who, line, secs);
        this.sayTimer = secs;
      }
    }
    const a = this.active;
    if (!a) {
      // story flow: auto-start the next available story mission
      const next = this.available().find((d) => d.auto);
      if (next) this.start(next.id);
      return;
    }
    if (a.timeLeft !== Infinity) {
      a.timeLeft -= dt;
      if (a.timeLeft <= 0) return this.fail('Time ran out');
      const s = this.step;
      if (s && (s.kind === 'goto' || s.kind === 'event')) {
        const m = Math.floor(a.timeLeft / 60), sec = Math.floor(a.timeLeft % 60);
        this.host.setObjective({ title: `${a.def.title} • ⏱ ${m}:${String(sec).padStart(2, '0')}`, text: s.text, x: s.x, z: s.z });
      }
    }
    const s = this.step;
    if (!s) return;
    if (s.kind === 'say') {
      if (!this.sayQueue.length && this.sayTimer <= 0) this.advance();
    } else if (s.kind === 'goto') {
      const p = this.host.playerPos();
      if (Math.hypot(p.x - s.x, p.z - s.z) <= s.r && (!s.vehicle || p.inVehicle)) this.advance();
    } else if (s.kind === 'event' && this.eventHit) this.advance();
  }

  private complete() {
    const a = this.active!;
    this.completed.add(a.def.id);
    this.active = null;
    const r = a.def.reward;
    let total = 0;
    if (r.cash) { this.host.wallet.earn(r.cash, 'reward', r.label ?? a.def.title, 'cash'); total += r.cash; }
    if (r.bank) { this.host.wallet.earn(r.bank, a.def.type === 'job' || a.def.id === 'm_firstgig' ? 'gig' : 'reward', r.label ?? a.def.title, 'bank'); total += r.bank; }
    this.host.setObjective(null);
    this.host.events.emit('mission:complete', { missionId: a.def.id, reward: total });
    this.host.events.emit('notify', { title: `✔ ${a.def.title} complete`, body: total ? `Reward: ${formatINR(total)}` : 'Story continues…', kind: 'mission' });
  }

  fail(reason: string) {
    const a = this.active;
    if (!a) return;
    this.active = null;
    this.host.setObjective(null);
    this.host.events.emit('mission:fail', { missionId: a.def.id, reason });
    this.host.events.emit('notify', { title: `✖ ${a.def.title} failed`, body: `${reason}. It will be offered again.`, kind: 'warn' });
  }

  serialize(): MissionSave {
    return { completed: [...this.completed], active: this.active ? { id: this.active.def.id, step: Math.max(0, this.active.step), data: this.active.data } : null, flags: { ...this.flags }, deliveries: this.deliveries };
  }

  load(s: MissionSave) {
    const known = (id: string) => this.defs.some((d) => d.id === id);
    this.completed = new Set(s.completed.filter(known));
    this.flags = { ...s.flags };
    this.deliveries = s.deliveries;
    this.active = null;
    this.sayQueue = [];
    if (s.active && known(s.active.id)) {
      const def = this.defs.find((d) => d.id === s.active!.id)!;
      // resume at the start of the saved step (actions before it already happened)
      this.active = { def, step: s.active.step - 1, data: s.active.data, timeLeft: def.timeLimitSec ?? Infinity };
      this.advance();
    }
  }

  dispose() { this.unsub.forEach((u) => u()); }
}
