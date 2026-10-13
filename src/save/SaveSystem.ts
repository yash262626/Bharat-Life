// Save games: versioned JSON with checksum, schema validation and safe defaults.
// Pure functions (serialize/validate) are unit-tested; storage uses localStorage.
import { fnv1a } from '../core/math';
import type { WalletState, Transaction } from '../economy/Wallet';

export const SAVE_VERSION = 1;
export const SLOTS = ['auto', 'slot1', 'slot2', 'slot3'] as const;
export type SlotId = (typeof SLOTS)[number];

export interface SaveVehicle { id: string; type: string; color: string; plate: string; owned: boolean; x: number; z: number; heading: number; fuel: number; damage: number }

export interface SaveData {
  version: number;
  savedAt: string;
  playtime: number;
  appearance: { skin: string; top: string; bottom: string; hair: string; female: boolean; longSleeve: boolean; beard: number; bag: boolean; height: number; build: number };
  player: { x: number; y: number; z: number; heading: number; health: number; hunger: number; energy: number; stamina: number };
  time: { totalMinutes: number; timeScale: number };
  weather: { weather: string; season: string; next: number; wet: number };
  wallet: WalletState;
  inventory: Record<string, number>;
  vehicles: SaveVehicle[];
  properties: { rented: string[]; owned: string[]; home: string | null; rentDueDay: number };
  career: { job: string | null; level: number; shifts: number; xp: number; reputation: number; pendingSalary: number };
  missions: { completed: string[]; active: { id: string; step: number; data: Record<string, unknown> } | null; flags: Record<string, boolean>; deliveries: number };
  shops: { visits: Record<string, number> };
  stats: { distanceWalked: number; distanceDriven: number; trainRides: number; moneyEarned: number };
}

export function defaultSave(): SaveData {
  return {
    version: SAVE_VERSION,
    savedAt: new Date(0).toISOString(),
    playtime: 0,
    appearance: { skin: '#a0662f', top: '#f2f2ee', bottom: '#1f2a44', hair: '#151110', female: false, longSleeve: false, beard: 1, bag: true, height: 1, build: 1 },
    player: { x: 197.5, y: 0.9, z: 10, heading: -Math.PI / 2, health: 100, hunger: 80, energy: 85, stamina: 100 },
    time: { totalMinutes: 7 * 60 + 40, timeScale: 1 },
    weather: { weather: 'cloudy', season: 'monsoon', next: 0, wet: 0 },
    wallet: { cash: 150000, bank: 350000, loan: 0, nextTxId: 1, ledger: [] },
    inventory: {},
    vehicles: [],
    properties: { rented: [], owned: [], home: null, rentDueDay: 0 },
    career: { job: null, level: 0, shifts: 0, xp: 0, reputation: 0, pendingSalary: 0 },
    missions: { completed: [], active: null, flags: {}, deliveries: 0 },
    shops: { visits: {} },
    stats: { distanceWalked: 0, distanceDriven: 0, trainRides: 0, moneyEarned: 0 },
  };
}

// ----------------------------------------------------------------- validation helpers
const num = (v: unknown, d: number, min = -Infinity, max = Infinity) => (typeof v === 'number' && Number.isFinite(v) ? Math.min(max, Math.max(min, v)) : d);
const int = (v: unknown, d: number, min = 0, max = Number.MAX_SAFE_INTEGER) => (typeof v === 'number' && Number.isInteger(v) ? Math.min(max, Math.max(min, v)) : d);
const str = (v: unknown, d: string, max = 200) => (typeof v === 'string' && v.length <= max ? v : d);
const bool = (v: unknown, d: boolean) => (typeof v === 'boolean' ? v : d);
const color = (v: unknown, d: string) => (typeof v === 'string' && /^#[0-9a-fA-F]{6}$/.test(v) ? v : d);
const obj = (v: unknown): Record<string, any> => (v && typeof v === 'object' && !Array.isArray(v) ? (v as Record<string, any>) : {});
const arr = (v: unknown): unknown[] => (Array.isArray(v) ? v : []);
const MAX_MONEY = 1e13; // paise (₹1 lakh crore) — guards against corrupted/hacked values

/** Validate untrusted save data, repairing anything invalid with defaults. Never throws. */
export function validateSave(input: unknown): { data: SaveData; repaired: string[] } {
  const d = defaultSave();
  const r: string[] = [];
  const s = obj(input);
  const note = (field: string, ok: boolean) => { if (!ok) r.push(field); };
  if (s.version !== SAVE_VERSION) r.push('version');
  d.savedAt = str(s.savedAt, d.savedAt, 40);
  d.playtime = num(s.playtime, 0, 0);
  const a = obj(s.appearance);
  d.appearance = {
    skin: color(a.skin, d.appearance.skin), top: color(a.top, d.appearance.top), bottom: color(a.bottom, d.appearance.bottom), hair: color(a.hair, d.appearance.hair),
    female: bool(a.female, false), longSleeve: bool(a.longSleeve, false), beard: int(a.beard, 1, 0, 2), bag: bool(a.bag, true),
    height: num(a.height, 1, 0.85, 1.12), build: num(a.build, 1, 0.85, 1.2),
  };
  const p = obj(s.player);
  d.player = {
    x: num(p.x, d.player.x, -3000, 3000), y: num(p.y, d.player.y, -10, 100), z: num(p.z, d.player.z, -3000, 3000), heading: num(p.heading, d.player.heading),
    health: num(p.health, 100, 1, 100), hunger: num(p.hunger, 80, 0, 100), energy: num(p.energy, 85, 0, 100), stamina: num(p.stamina, 100, 0, 100),
  };
  note('player', Object.keys(p).length > 0);
  const t = obj(s.time);
  d.time = { totalMinutes: num(t.totalMinutes, d.time.totalMinutes, 0), timeScale: num(t.timeScale, 1, 0.1, 60) };
  const w = obj(s.weather);
  d.weather = { weather: str(w.weather, 'cloudy', 20), season: ['monsoon', 'summer', 'winter'].includes(w.season) ? w.season : 'monsoon', next: num(w.next, 0, 0), wet: num(w.wet, 0, 0, 1) };
  const wl = obj(s.wallet);
  const ledger: Transaction[] = [];
  for (const tx of arr(wl.ledger).slice(0, 200)) {
    const o = obj(tx);
    if (typeof o.label !== 'string' || !Number.isInteger(o.amount)) continue;
    ledger.push({ id: int(o.id, 0), day: int(o.day, 1, 1), minute: int(o.minute, 0, 0, 1440), amount: o.amount, account: o.account === 'cash' ? 'cash' : 'bank', category: str(o.category, 'other', 20) as Transaction['category'], label: str(o.label, '', 120), balanceAfter: int(o.balanceAfter, 0, 0, MAX_MONEY) });
  }
  d.wallet = { cash: int(wl.cash, d.wallet.cash, 0, MAX_MONEY), bank: int(wl.bank, d.wallet.bank, 0, MAX_MONEY), loan: int(wl.loan, 0, 0, MAX_MONEY), nextTxId: int(wl.nextTxId, ledger.length + 1, 1), ledger };
  note('wallet', Number.isInteger(wl.cash) && Number.isInteger(wl.bank) && wl.cash >= 0 && wl.bank >= 0);
  const inv = obj(s.inventory);
  for (const [k, v] of Object.entries(inv)) if (/^[a-z0-9_]{1,40}$/.test(k) && Number.isInteger(v) && (v as number) > 0 && (v as number) < 10000) d.inventory[k] = v as number;
  for (const v of arr(s.vehicles).slice(0, 50)) {
    const o = obj(v);
    if (typeof o.type !== 'string' || typeof o.id !== 'string') { r.push('vehicle'); continue; }
    d.vehicles.push({ id: str(o.id, 'veh', 40), type: o.type, color: color(o.color, '#888888'), plate: str(o.plate, 'MH 02 XX 0000', 20), owned: bool(o.owned, true), x: num(o.x, 0, -3000, 3000), z: num(o.z, 0, -3000, 3000), heading: num(o.heading, 0), fuel: num(o.fuel, 0, 0, 500), damage: num(o.damage, 0, 0, 100) });
  }
  const pr = obj(s.properties);
  d.properties = { rented: arr(pr.rented).filter((x): x is string => typeof x === 'string').slice(0, 20), owned: arr(pr.owned).filter((x): x is string => typeof x === 'string').slice(0, 20), home: typeof pr.home === 'string' ? pr.home : null, rentDueDay: int(pr.rentDueDay, 0, 0) };
  const c = obj(s.career);
  d.career = { job: typeof c.job === 'string' ? c.job : null, level: int(c.level, 0, 0, 20), shifts: int(c.shifts, 0, 0), xp: int(c.xp, 0, 0), reputation: num(c.reputation, 0, -100, 100), pendingSalary: int(c.pendingSalary, 0, 0, MAX_MONEY) };
  const m = obj(s.missions);
  const act = obj(m.active);
  d.missions = {
    completed: arr(m.completed).filter((x): x is string => typeof x === 'string').slice(0, 500),
    active: typeof act.id === 'string' ? { id: act.id, step: int(act.step, 0, 0, 100), data: obj(act.data) } : null,
    flags: Object.fromEntries(Object.entries(obj(m.flags)).filter(([, v]) => typeof v === 'boolean')) as Record<string, boolean>,
    deliveries: int(m.deliveries, 0, 0),
  };
  d.shops = { visits: Object.fromEntries(Object.entries(obj(obj(s.shops).visits)).filter(([, v]) => Number.isInteger(v))) as Record<string, number> };
  const st = obj(s.stats);
  d.stats = { distanceWalked: num(st.distanceWalked, 0, 0), distanceDriven: num(st.distanceDriven, 0, 0), trainRides: int(st.trainRides, 0, 0), moneyEarned: int(st.moneyEarned, 0, 0, MAX_MONEY) };
  return { data: d, repaired: r };
}

export function encodeSave(data: SaveData): string {
  const payload = JSON.stringify(data);
  return JSON.stringify({ v: SAVE_VERSION, sum: fnv1a(payload), payload });
}

export type DecodeResult = { ok: true; data: SaveData; repaired: string[] } | { ok: false; error: string };

export function decodeSave(raw: string | null): DecodeResult {
  if (!raw) return { ok: false, error: 'empty' };
  let env: any;
  try { env = JSON.parse(raw); } catch { return { ok: false, error: 'corrupt: not JSON' }; }
  if (!env || typeof env.payload !== 'string') return { ok: false, error: 'corrupt: missing payload' };
  if (fnv1a(env.payload) !== env.sum) return { ok: false, error: 'corrupt: checksum mismatch' };
  let data: unknown;
  try { data = JSON.parse(env.payload); } catch { return { ok: false, error: 'corrupt: payload not JSON' }; }
  const { data: valid, repaired } = validateSave(data);
  return { ok: true, data: valid, repaired };
}

export interface StorageLike { getItem(k: string): string | null; setItem(k: string, v: string): void; removeItem(k: string): void }

export class SaveStore {
  constructor(private storage: StorageLike, private prefix = 'bharatlife.save.') {}

  write(slot: SlotId, data: SaveData) {
    data.savedAt = new Date().toISOString();
    const enc = encodeSave(data);
    // keep the previous good save as a backup in case this write is interrupted
    const prev = this.storage.getItem(this.prefix + slot);
    if (prev) this.storage.setItem(this.prefix + slot + '.bak', prev);
    this.storage.setItem(this.prefix + slot, enc);
  }

  read(slot: SlotId): DecodeResult {
    const main = decodeSave(this.storage.getItem(this.prefix + slot));
    if (main.ok) return main;
    const bak = decodeSave(this.storage.getItem(this.prefix + slot + '.bak'));
    if (bak.ok) return { ...bak, repaired: [...bak.repaired, `restored from backup (${main.error})`] };
    return main;
  }

  list() {
    return SLOTS.map((slot) => {
      const r = this.read(slot);
      return r.ok ? { slot, savedAt: r.data.savedAt, day: Math.floor(r.data.time.totalMinutes / 1440) + 1, money: r.data.wallet.cash + r.data.wallet.bank } : { slot, empty: true as const };
    });
  }

  delete(slot: SlotId) {
    this.storage.removeItem(this.prefix + slot);
    this.storage.removeItem(this.prefix + slot + '.bak');
  }
}
