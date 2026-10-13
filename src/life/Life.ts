// Life-simulation systems: property rental, office career, repeatable delivery gigs.
import { Game } from '../game/Game';
import { rupees, formatINR } from '../economy/money';
import { ECONOMY } from '../config/economy';
import { el } from '../ui/HUD';
import { Modal } from '../ui/Modal';
import { PhoneApp } from '../ui/Phone';
import { SHOPS } from '../config/shops';
import { makeRng } from '../core/math';

// ------------------------------------------------------------------------------- property
export interface PropertyDef { id: string; name: string; area: string; kind: 'room' | 'pg' | 'flat' | 'premium'; monthlyRent: number; deposit: number; price?: number; door: string; desc: string }

export const PROPERTIES: PropertyDef[] = [
  { id: 'room_shanti', name: 'Room 14, Shanti Niwas Chawl', area: 'Gokhale Road', kind: 'room', monthlyRent: rupees(7500), deposit: rupees(5000), door: 'chawl_door', desc: '10x12 ft room, shared toilet, 2nd floor. Water 6–8 AM.' },
  { id: 'pg_sagar', name: 'Sai Krupa PG (twin sharing)', area: 'Bazaar Gali', kind: 'pg', monthlyRent: rupees(9500), deposit: rupees(9500), door: 'chawl_door', desc: 'Meals included, Wi-Fi, curfew 11 PM.' },
  { id: 'flat_seabreeze', name: '1 BHK, Sea Breeze Towers', area: 'Sagar Setu Marg', kind: 'flat', monthlyRent: rupees(32000), deposit: rupees(150000), price: rupees(14500000), door: 'chawl_door', desc: 'Sea-facing, lift, 24x7 security. (Purchase unlocks with a home loan.)' },
];

export class PropertySystem {
  rented = new Set<string>();
  owned = new Set<string>();
  home: string | null = null;
  rentDueDay = 0;
  constructor(private g: Game) {
    g.events.on('time:newday', ({ day }) => this.onNewDay(day));
  }

  rent(id: string): string | null {
    const p = PROPERTIES.find((x) => x.id === id);
    if (!p) return 'Unknown property';
    if (this.rented.has(id)) return 'Already rented';
    const first = p.deposit + Math.round(p.monthlyRent / 4);
    if (!this.g.wallet.spend(first, 'rent', `Deposit + first week rent — ${p.name}`)) return `Need ${formatINR(first)} (deposit + first week)`;
    this.rented.add(id);
    this.home = id;
    this.rentDueDay = this.g.clock.day + 7;
    this.g.events.emit('property:rent', { propertyId: id });
    return null;
  }

  private onNewDay(day: number) {
    if (!this.home || !this.rented.has(this.home) || day < this.rentDueDay) return;
    const p = PROPERTIES.find((x) => x.id === this.home)!;
    const weekly = Math.round(p.monthlyRent / 4);
    if (this.g.wallet.spend(weekly, 'rent', `Weekly rent — ${p.name}`, 'auto')) {
      this.rentDueDay = day + 7;
      this.g.events.emit('notify', { title: 'Rent paid', body: `${formatINR(weekly)} auto-debited for ${p.name}`, kind: 'money' });
    } else {
      this.g.events.emit('notify', { title: 'Rent overdue!', body: `The landlord wants ${formatINR(weekly)}. Pay soon or lose the room.`, kind: 'warn' });
      if (day > this.rentDueDay + 3) { this.rented.delete(this.home); this.home = null; this.g.events.emit('notify', { title: 'Evicted', body: 'You lost your room for not paying rent.', kind: 'warn' }); }
    }
  }

  app(): PhoneApp {
    return {
      id: 'ghar', name: 'Ghar Dekho', icon: '🏠', color: '#ef6c00',
      render: (s) => {
        for (const p of PROPERTIES) {
          const c = el('div', 'card', `<b>${p.name}</b><div style="color:var(--muted)">${p.area} • ${p.kind.toUpperCase()}</div><div>${p.desc}</div>
            <div style="margin-top:6px">Rent <b>${formatINR(p.monthlyRent)}/month</b> (billed weekly) • Deposit ${formatINR(p.deposit)}</div>`);
          const b = el('button', 'btn', this.rented.has(p.id) ? 'Rented ✓' : 'Rent now');
          b.style.marginTop = '8px';
          b.disabled = this.rented.has(p.id);
          b.onclick = () => { const err = this.rent(p.id); b.textContent = err ? err : 'Rented ✓'; b.disabled = !err; };
          c.append(b);
          s.append(c);
        }
      },
    };
  }

  serialize() { return { rented: [...this.rented], owned: [...this.owned], home: this.home, rentDueDay: this.rentDueDay }; }
  load(s: { rented: string[]; owned: string[]; home: string | null; rentDueDay: number }) {
    this.rented = new Set(s.rented); this.owned = new Set(s.owned); this.home = s.home; this.rentDueDay = s.rentDueDay;
  }
}

// ------------------------------------------------------------------------------- career
export interface CareerDef { id: string; title: string; employer: string; dailyPay: number; startHour: number; endHour: number; levels: string[] }
export const CAREERS: CareerDef[] = [
  { id: 'office', title: 'Data Entry Associate', employer: 'Infinity Tower — Sahyog Services Pvt Ltd', dailyPay: rupees(950), startHour: 9.5, endHour: 18, levels: ['Data Entry Associate', 'Senior Associate', 'Team Lead', 'Business Analyst', 'Operations Manager'] },
];

export class CareerSystem {
  job: string | null = null;
  level = 0;
  shifts = 0;
  xp = 0;
  reputation = 0;
  pendingSalary = 0;
  private modal: Modal;
  constructor(private g: Game) {
    this.modal = new Modal(g.ui);
    this.modal.onClose = () => (g.modalOpen = false);
    g.events.on('time:newday', ({ day }) => {
      if (day % 7 === 1 && this.pendingSalary > 0) {
        g.wallet.earn(this.pendingSalary, 'salary', `Salary credit — ${CAREERS[0].employer}`, 'bank');
        g.events.emit('notify', { title: 'Salary credited 💰', body: `${formatINR(this.pendingSalary)} to your bank account`, kind: 'money' });
        this.pendingSalary = 0;
      }
    });
  }

  get def() { return CAREERS.find((c) => c.id === this.job) ?? null; }

  /** Office door: interview if unemployed, otherwise work a shift during office hours. */
  officeDoor() {
    const g = this.g;
    g.modalOpen = true;
    const h = g.clock.hour;
    if (!this.job) {
      if (h < 10 || h >= 17) return this.modal.show('Infinity Tower', 'Reception', '<p>Walk-in interviews are held 10 AM – 5 PM. Please come back then.</p>');
      const qs: [string, [string, number][]][] = [
        ['Why do you want this job?', [['I want to learn and grow with the company.', 2], ['Paisa chahiye, bas.', 0], ['My uncle said so.', 0]]],
        ['A client sends a spreadsheet with errors at 6 PM. You…', [['Flag it politely and fix what I can before leaving.', 2], ['Ignore it till tomorrow.', 0], ['Delete the file.', -1]]],
        ['How fast can you type?', [['About 40 words per minute, improving daily.', 2], ['Typing? Using two fingers.', 0], ['I prefer voice notes.', 0]]],
      ];
      let score = 0, i = 0;
      const ask = () => {
        if (i >= qs.length) {
          if (score >= 4) {
            this.job = 'office'; this.level = 0;
            g.events.emit('job:hired', { careerId: 'office' });
            this.modal.show('Congratulations!', 'Sahyog Services Pvt Ltd', `<p>You are hired as <b>${CAREERS[0].title}</b>. Shift ${fmt(CAREERS[0].startHour)} – ${fmt(CAREERS[0].endHour)}, Mon–Sat. Pay ${formatINR(CAREERS[0].dailyPay)}/day, credited weekly.</p><p>Come to the office between 9:30 and 11 AM to work a shift.</p>`);
          } else this.modal.show('Thank you for coming', 'HR', '<p>We will get back to you. (Try again tomorrow — be more professional!)</p>');
          return;
        }
        const [q, opts] = qs[i];
        const body = el('div');
        body.append(el('p', '', q));
        for (const [a, pts] of opts) {
          const b = el('button', 'btn ghost', a);
          b.style.display = 'block'; b.style.margin = '6px 0'; b.style.width = '100%'; b.style.textAlign = 'left';
          b.onclick = () => { score += pts; i++; ask(); };
          body.append(b);
        }
        this.modal.show(`Interview (${i + 1}/${qs.length})`, 'Ms. Fernandes, HR Manager', body);
      };
      return ask();
    }
    const d = this.def!;
    if (g.clock.isWeekend && g.clock.weekday === 'Sunday') return this.modal.show('Infinity Tower', 'Closed', '<p>Sunday! Office is closed. Enjoy the day.</p>');
    if (h < d.startHour - 0.5 || h > 11) return this.modal.show('Infinity Tower', d.employer, `<p>Your shift starts at ${fmt(d.startHour)}. Arrive between 9:00 and 11:00 AM to work today.</p>`);
    const late = h > d.startHour + 0.25;
    this.modal.show('Work shift', `${d.levels[this.level]} • ${d.employer}`, `<p>Work today's shift? Time will skip to ${fmt(d.endHour)}.</p>${late ? '<p class="hi">You are late — pay will be cut by 10%.</p>' : ''}`, [
      { label: 'Work the shift', onClick: () => {
        this.modal.close();
        g.fade(() => {
          g.clock.skipTo(d.endHour);
          const pay = Math.round(d.dailyPay * (1 + this.level * 0.25) * (late ? 0.9 : 1));
          this.pendingSalary += pay;
          this.shifts++;
          this.xp += late ? 6 : 10;
          g.player.s.energy = Math.max(5, g.player.s.energy - 35);
          g.player.s.hunger = Math.max(5, g.player.s.hunger - 25);
          g.events.emit('job:shift', { careerId: d.id, pay });
          let msg = `Shift done. ${formatINR(pay)} added to this week's salary.`;
          if (this.xp >= (this.level + 1) * 60 && this.level < d.levels.length - 1) { this.level++; msg += ` 🎉 Promoted to ${d.levels[this.level]}!`; }
          g.events.emit('notify', { title: 'Work done', body: msg, kind: 'money' });
        });
      } },
    ]);
  }

  serialize() { return { job: this.job, level: this.level, shifts: this.shifts, xp: this.xp, reputation: this.reputation, pendingSalary: this.pendingSalary }; }
  load(s: { job: string | null; level: number; shifts: number; xp: number; reputation: number; pendingSalary: number }) { Object.assign(this, s); }
}

const fmt = (h: number) => `${((Math.floor(h) + 11) % 12) + 1}:${String(Math.round((h % 1) * 60)).padStart(2, '0')} ${h < 12 ? 'AM' : 'PM'}`;

// ------------------------------------------------------------------------------- delivery gigs
export interface DeliveryOrder { id: string; from: { name: string; x: number; z: number }; to: { name: string; x: number; z: number }; pay: number; timeLimit: number }

const DROPS = [
  { name: 'Sea Breeze Towers gate', x: -219.5, z: -212 }, { name: 'Shanti Niwas Chawl', x: -107, z: 118 },
  { name: 'Lifeline Hospital', x: 117, z: 37 }, { name: 'Vidya Mandir School', x: -40, z: 120 },
  { name: 'Police Chowki', x: 19, z: 8.5 }, { name: 'Sagar Nagar Station', x: 158, z: 0 },
  { name: 'Ambedkar Nagar lane', x: 130, z: 118 }, { name: 'Nana-Nani Park gate', x: -110, z: -137 },
];

export class DeliveryGigs {
  current: DeliveryOrder | null = null;
  stage: 'none' | 'pickup' | 'drop' = 'none';
  timeLeft = 0;
  completed = 0;
  private rng = makeRng(Date.now() % 100000);
  constructor(private g: Game, private isStoryBusy: () => boolean) {}

  offers(): DeliveryOrder[] {
    const food = SHOPS.filter((s) => ['restaurant', 'street_food', 'cafe', 'tea'].includes(s.kind));
    const out: DeliveryOrder[] = [];
    for (let i = 0; i < 3; i++) {
      const f = this.rng.pick(food), t = this.rng.pick(DROPS);
      const dist = Math.hypot(f.x - t.x, f.z - t.z);
      out.push({
        id: `ord_${Date.now()}_${i}`, from: { name: f.name, x: f.x, z: f.z }, to: t,
        pay: ECONOMY.deliveryBase + Math.round((dist / 100) * ECONOMY.deliveryPer100m),
        timeLimit: Math.round(90 + dist / 4),
      });
    }
    return out;
  }

  accept(o: DeliveryOrder) {
    if (this.current) return false;
    this.current = o;
    this.stage = 'pickup';
    this.timeLeft = o.timeLimit + 60;
    this.g.events.emit('notify', { title: 'DabbaDash order accepted', body: `Pick up at ${o.from.name}`, kind: 'mission' });
    return true;
  }

  update(dt: number) {
    const o = this.current;
    if (!o) return;
    this.timeLeft -= dt;
    const p = this.g.player.s;
    const target = this.stage === 'pickup' ? o.from : o.to;
    const m = Math.max(0, Math.floor(this.timeLeft / 60)), s = Math.max(0, Math.floor(this.timeLeft % 60));
    if (!this.isStoryBusy()) this.g.setObjective({ title: `DabbaDash • ⏱ ${m}:${String(s).padStart(2, '0')}`, text: this.stage === 'pickup' ? `Pick up order at ${o.from.name}` : `Deliver to ${o.to.name}`, x: target.x, z: target.z });
    if (Math.hypot(p.x - target.x, p.z - target.z) < 5) {
      if (this.stage === 'pickup') {
        this.stage = 'drop';
        this.g.inventory.add('parcel');
        this.g.events.emit('delivery:pickup', { orderId: o.id });
        this.g.hud.say('Restaurant', 'Order ready! Jaldi pahunchao, garam hai.', 3);
      } else {
        this.g.inventory.remove('parcel');
        const onTime = this.timeLeft > 0;
        const pay = o.pay + (onTime ? ECONOMY.deliveryOnTimeTip : 0);
        this.g.wallet.earn(pay, 'gig', `DabbaDash delivery → ${o.to.name}${onTime ? ' (+tip)' : ''}`, 'bank');
        this.completed++;
        this.g.events.emit('delivery:dropoff', { orderId: o.id });
        this.g.events.emit('notify', { title: 'Delivered!', body: `${formatINR(pay)} credited${onTime ? ' incl. on-time tip' : ' (late, no tip)'}`, kind: 'money' });
        this.current = null;
        this.stage = 'none';
        if (!this.isStoryBusy()) this.g.setObjective(null);
      }
    }
  }

  app(): PhoneApp {
    return {
      id: 'dabba', name: 'DabbaDash', icon: '🍱', color: '#d81b60',
      render: (s, phone) => {
        s.append(el('div', 'card', `Rider stats: <b>${this.completed}</b> deliveries today.<br><small style="color:var(--muted)">Any vehicle (or on foot!) — tips for on-time delivery.</small>`));
        if (this.current) {
          s.append(el('div', 'card', `<b>Active order</b><br>${this.current.from.name} → ${this.current.to.name}<br>Pay ${formatINR(this.current.pay)}`));
          return;
        }
        for (const o of this.offers()) {
          const c = el('div', 'card', `<b>${o.from.name}</b> → ${o.to.name}<br>Pay <b>${formatINR(o.pay)}</b> + ${formatINR(ECONOMY.deliveryOnTimeTip)} tip • ${Math.round(o.timeLimit / 60)} min`);
          const b = el('button', 'btn', 'Accept');
          b.style.marginTop = '6px';
          b.onclick = () => { this.accept(o); phone.toggle(false); };
          c.append(b);
          s.append(c);
        }
      },
    };
  }
}
