// Suburban trains: two 6-coach EMUs shuttling on their own tracks between the termini,
// stopping at every station (dwell with open doors). Boarding/alighting, tickets, TC checks,
// track hazards, platform announcements.
import * as THREE from 'three';
import { Game } from '../game/Game';
import { STATIONS, RAIL, StationDef } from '../world/layout';
import { buildCoach, COACH_LEN, COACH_W, FLOOR_Y, DOOR_Z } from './TrainModel';
import { ECONOMY } from '../config/economy';
import { formatINR } from '../economy/money';
import { makeRng, clamp } from '../core/math';
import { Pose } from '../npc/HumanRenderer';

const CARS = 6;
const GAP = 0.9;
const TRAIN_LEN = CARS * COACH_LEN + (CARS - 1) * GAP;
const VMAX = 20; // m/s (72 km/h)
const ACC = 0.9, DEC = 1.0;
const DWELL = 22;

export interface Train {
  id: string;
  trackX: number;
  side: 1 | -1; // platform side: -1 = west (P1), +1 = east (P2)
  front: number; // z of the leading end
  dir: 1 | -1; // +1 = southbound
  v: number;
  state: 'run' | 'dwell';
  timer: number;
  stopIdx: number; // index into STATIONS of the next/current stop
  coaches: THREE.Group[];
  announced: Set<string>;
}

export class TrainSystem {
  trains: Train[] = [];
  riding: { train: Train; coach: number; lx: number; lz: number; from: string } | null = null;
  onAnnounce: (st: StationDef, train: Train, kind: 'arriving' | 'departing') => void = () => {};
  private rng = makeRng(4);
  private stations = [...STATIONS].sort((a, b) => a.z - b.z);

  constructor(private g: Game) {
    const mk = (id: string, trackX: number, side: 1 | -1, startIdx: number, dir: 1 | -1, phase: number) => {
      const coaches: THREE.Group[] = [];
      for (let i = 0; i < CARS; i++) {
        const c = buildCoach(g.mats, i === 0 ? 'front' : i === CARS - 1 ? 'rear' : 'none', i % 2 === 1);
        g.scene.add(c);
        coaches.push(c);
      }
      const st = this.stations[startIdx];
      const t: Train = { id, trackX, side, front: st.z + dir * (TRAIN_LEN / 2) - dir * phase, dir, v: 0, state: 'dwell', timer: 5 + phase / 50, stopIdx: startIdx, coaches, announced: new Set() };
      this.trains.push(t);
      this.place(t);
    };
    mk('UP', RAIL.westTrackX, -1, 1, -1, 0);
    mk('DN', RAIL.eastTrackX, 1, 2, 1, 0);
    g.interactHandlers.set('train_door', () => this.board());
  }

  /** New-game opening: the west-track train is standing at Sagar Nagar with the player beside it. */
  placeArrivalTrain() {
    const t = this.trains[0];
    const idx = this.stations.findIndex((s) => s.home);
    t.stopIdx = idx;
    t.dir = -1;
    t.front = this.stations[idx].z - TRAIN_LEN / 2;
    t.state = 'dwell';
    t.timer = 18;
    t.v = 0;
    this.place(t);
  }

  private stopFront(t: Train, idx: number) { return this.stations[idx].z + t.dir * (TRAIN_LEN / 2); }

  private place(t: Train) {
    for (let i = 0; i < CARS; i++) {
      const cz = t.front - t.dir * (i * (COACH_LEN + GAP) + COACH_LEN / 2);
      const c = t.coaches[i];
      c.position.set(t.trackX, 0.22, cz);
      c.rotation.y = t.dir > 0 ? 0 : Math.PI;
    }
  }

  fixed(dt: number) {
    for (const t of this.trains) {
      if (t.state === 'dwell') {
        t.timer -= dt;
        if (t.timer <= 0) {
          // next stop (reverse at termini)
          let next = t.stopIdx + t.dir;
          if (next < 0 || next >= this.stations.length) {
            t.dir = (t.dir * -1) as 1 | -1;
            // flip the consist: the old rear is now the front
            t.front = t.front + t.dir * TRAIN_LEN;
            next = t.stopIdx + t.dir;
          }
          t.stopIdx = next;
          t.state = 'run';
          t.announced.clear();
          const here = this.stations[t.stopIdx - t.dir];
          if (here) this.onAnnounce(here, t, 'departing');
        }
      } else {
        const target = this.stopFront(t, t.stopIdx);
        const remain = (target - t.front) * t.dir;
        const brakeDist = (t.v * t.v) / (2 * DEC);
        if (remain <= brakeDist + 0.5) t.v = Math.max(0.6, t.v - DEC * dt);
        else t.v = Math.min(VMAX, t.v + ACC * dt);
        t.front += t.dir * t.v * dt;
        const st = this.stations[t.stopIdx];
        if (remain < 380 && !t.announced.has(st.id)) { t.announced.add(st.id); this.onAnnounce(st, t, 'arriving'); }
        if ((target - t.front) * t.dir <= 0.05) {
          t.front = target;
          t.v = 0;
          t.state = 'dwell';
          t.timer = st.home ? DWELL + 6 : DWELL;
          if (t.stopIdx === 0 || t.stopIdx === this.stations.length - 1) t.timer += 20;
        }
      }
      this.place(t);
    }
    this.trackHazard();
  }

  private trackHazard() {
    const ps = this.g.player.s;
    if (this.riding || ps.y > 0.6) return;
    for (const t of this.trains) {
      if (Math.abs(ps.x - t.trackX) > COACH_W / 2 + 0.3) continue;
      const rear = t.front - t.dir * TRAIN_LEN;
      const lo = Math.min(t.front, rear) - 0.5, hi = Math.max(t.front, rear) + 0.5;
      if (ps.z > lo && ps.z < hi) {
        const push = ps.x < t.trackX ? -1 : 1;
        this.g.player.teleport(t.trackX + push * (COACH_W / 2 + 0.6), ps.y, ps.z);
        if (t.v > 1) {
          this.g.player.knock(push, 0, Math.min(10, t.v));
          this.g.player.s.health = Math.max(0, this.g.player.s.health - 35);
          this.g.events.emit('notify', { title: 'Hit by a train!', body: 'Never walk on the tracks. Use the foot over-bridge.', kind: 'warn' });
        }
      }
    }
  }

  /** Door positions of dwelling trains on the platform side (world). */
  private doors(t: Train) {
    const out: { x: number; z: number; coach: number; lz: number }[] = [];
    for (let i = 0; i < CARS; i++) {
      const c = t.coaches[i];
      for (const d of DOOR_Z) {
        const wz = c.position.z + (t.dir > 0 ? d : -d);
        out.push({ x: t.trackX + t.side * (COACH_W / 2 + 0.55), z: wz, coach: i, lz: d });
      }
    }
    return out;
  }

  private stationAt(t: Train) { return this.stations[t.stopIdx]; }

  board() {
    const ps = this.g.player.s;
    for (const t of this.trains) {
      if (t.state !== 'dwell') continue;
      for (const d of this.doors(t)) {
        if (Math.hypot(d.x - ps.x, d.z - ps.z) < 2.6) {
          const st = this.stationAt(t);
          this.riding = { train: t, coach: d.coach, lx: t.side * 0.7, lz: d.lz + (this.rng.chance(0.5) ? 1.4 : -1.4), from: st.id };
          this.g.events.emit('train:board', { station: st.name });
          const tickets = this.g.inventory.count('rail_ticket') + this.g.inventory.count('rail_ticket_fc');
          this.g.hud.toast('Boarded the local', tickets || this.g.inventory.has('rail_pass') ? `Towards ${t.dir < 0 ? 'Chandni Bandar' : 'Sahyadri Park'}. Press E at a stop to get off.` : 'No ticket! TCs check randomly — fine ₹250.', tickets ? 'info' : 'warn');
          return;
        }
      }
    }
  }

  private alight() {
    const r = this.riding!;
    const t = r.train;
    const st = this.stationAt(t);
    const coach = t.coaches[r.coach];
    const x = t.trackX + t.side * (COACH_W / 2 + 1.0);
    const z = coach.position.z + (t.dir > 0 ? r.lz : -r.lz);
    this.riding = null;
    this.g.ridingProvider = null;
    this.g.player.frozen = false;
    this.g.player.teleport(x, RAIL.platformH, z, t.side > 0 ? Math.PI / 2 : -Math.PI / 2);
    if (st.id !== r.from) {
      const inv = this.g.inventory;
      if (inv.has('rail_pass')) { /* season pass */ }
      else if (inv.remove('rail_ticket_fc') || inv.remove('rail_ticket')) { /* single journey ticket used */ }
      else if (this.rng.chance(0.4)) {
        const paid = this.g.wallet.spend(ECONOMY.ticketlessFine, 'fine', `Ticketless travel fine (${st.name})`);
        this.g.hud.say('TC', paid ? `Ticket dikhao... nahi hai? ${formatINR(ECONOMY.ticketlessFine)} fine. Agli baar ticket lena!` : 'Ticket nahi, paise bhi nahi? Chalo, warning de raha hoon.', 4);
      }
      this.g.events.emit('train:alight', { station: st.name, fromStation: r.from });
    }
  }

  update(dt: number) {
    const g = this.g;
    const ps = g.player.s;
    g.dynamicInteractables = g.dynamicInteractables.filter((i) => i.kind !== 'train_door');
    if (this.riding) {
      const r = this.riding;
      const t = r.train;
      const c = t.coaches[r.coach];
      const wz = c.position.z + (t.dir > 0 ? r.lz : -r.lz);
      // standing commuters sway a little with acceleration
      const sway = Math.sin(performance.now() / 700) * 0.04 * clamp(t.v / VMAX, 0, 1);
      g.ridingProvider = () => ({ x: t.trackX + r.lx + sway, y: FLOOR_Y + 0.22, z: wz, heading: t.dir > 0 ? 0 : Math.PI, pose: Pose.Stand });
      if (t.state === 'dwell') {
        const st = this.stationAt(t);
        g.extraPrompt = { key: 'E', text: `Get off at ${st.name} (${st.nameHi})` };
        if (g.input.just('interact')) { g.extraPrompt = null; this.alight(); }
      } else g.extraPrompt = { key: '⏵', text: `Next: ${this.stationAt(t).name} • ${Math.round(t.v * 3.6)} km/h` };
      return;
    }
    g.extraPrompt = null;
    for (const t of this.trains) {
      if (t.state !== 'dwell') continue;
      for (const d of this.doors(t)) {
        if (Math.abs(d.z - ps.z) < 4 && Math.abs(d.x - ps.x) < 3) {
          g.dynamicInteractables.push({ id: `door_${t.id}_${d.coach}`, kind: 'train_door', x: d.x, y: RAIL.platformH, z: d.z, radius: 2.6, label: `Board local towards ${t.dir < 0 ? 'Chandni Bandar' : 'Sahyadri Park'}` });
        }
      }
    }
    void dt;
  }
}
