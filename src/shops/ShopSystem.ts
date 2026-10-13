// Shops & services: purchases in rupees (cash or UPI), ATM, fuel, repairs, tickets, hospital, showroom.
import { Game } from '../game/Game';
import { SHOPS, ShopDef, shopById } from '../config/shops';
import { ITEMS } from '../config/items';
import { ECONOMY, railFare } from '../config/economy';
import { VEHICLES, SHOWROOM_STOCK } from '../config/vehicles';
import { formatINR, formatINRShort, rupees } from '../economy/money';
import { Modal } from '../ui/Modal';
import { el } from '../ui/HUD';
import { Interactable } from '../world/BuildContext';
import { clamp } from '../core/math';

export interface ShopMemory { visits: Record<string, number> }

/** Apply the "regular customer" discount after repeated visits (shopkeepers remember you). */
export function priceFor(base: number, visits: number) {
  return visits >= 5 ? Math.round((base * 0.95) / 100) * 100 : base;
}

export class ShopSystem {
  modal: Modal;
  memory: ShopMemory = { visits: {} };

  constructor(private g: Game) {
    this.modal = new Modal(g.ui);
    this.modal.onClose = () => { g.modalOpen = false; };
    g.interactHandlers.set('shop', (it) => this.openShop(String(it.data?.shopId)));
    g.interactHandlers.set('atm', () => this.openAtm());
    g.interactHandlers.set('pump', () => this.openPump());
    g.interactHandlers.set('garage', () => this.openGarage());
    g.interactHandlers.set('showroom', () => this.openShowroom());
    g.interactHandlers.set('ticket', (it) => this.openTickets(it));
    g.interactHandlers.set('hospital', () => this.openHospital());
  }

  private show(...a: Parameters<Modal['show']>) {
    this.g.modalOpen = true;
    this.modal.show(...a);
  }

  isOpen(s: ShopDef) { return this.g.clock.isOpen(s.open, s.close); }

  /** Buy an item from a shop. Returns an error string or null on success. */
  buy(shop: ShopDef, itemId: string): string | null {
    const entry = shop.items.find((i) => i.itemId === itemId);
    if (!entry) return 'Item not sold here';
    const item = ITEMS[itemId];
    const price = priceFor(entry.price, this.memory.visits[shop.id] ?? 0);
    if (!this.g.wallet.spend(price, item.consumable && (item.hunger || item.energy) ? 'food' : 'shopping', `${item.name} @ ${shop.name}`)) return `Not enough money (${formatINR(price)})`;
    const p = this.g.player.s;
    if (item.consumable) {
      p.hunger = clamp(p.hunger + (item.hunger ?? 0), 0, 100);
      p.energy = clamp(p.energy + (item.energy ?? 0), 0, 100);
    } else this.g.inventory.add(itemId);
    this.g.events.emit('shop:purchase', { shopId: shop.id, itemId, price });
    return null;
  }

  openShop(id: string) {
    const shop = shopById(id);
    if (!shop) return;
    if (shop.kind === 'bank') return this.openAtm();
    if (shop.kind === 'realestate') return this.g.events.emit('notify', { title: shop.name, body: 'Open the phone (Tab) → Ghar Dekho app to browse rooms and flats.', kind: 'info' });
    if (!this.isOpen(shop)) {
      this.show(shop.name, shop.nameHi, `<p>Closed right now. Opening hours: ${fmtHour(shop.open)} – ${fmtHour(shop.close)}.</p>`);
      return;
    }
    const visits = (this.memory.visits[shop.id] = (this.memory.visits[shop.id] ?? 0) + 1);
    const greeting = visits >= 5 ? `Arre, regular customer! 5% kam laga denge. ${shop.greeting}` : visits > 1 ? `Phir se aaye! ${shop.greeting}` : shop.greeting;
    const render = (msg = '') => {
      const list = el('div');
      for (const it of shop.items) {
        const item = ITEMS[it.itemId];
        const price = priceFor(it.price, visits);
        const row = el('div', 'item-row', `<div class="ico">${item.icon}</div><div class="nm">${item.name}<small>${item.nameHi}${item.hunger ? ` • food +${item.hunger}` : ''}${item.energy ? ` • energy ${item.energy > 0 ? '+' : ''}${item.energy}` : ''}</small></div><div class="pr">${formatINR(price)}</div>`);
        const b = el('button', 'btn', 'Buy');
        b.disabled = !this.g.wallet.canAfford(price);
        b.onclick = () => {
          const err = this.buy(shop, it.itemId);
          render(err ? `⚠️ ${err}` : `✅ Bought ${item.name}. Paid ${formatINR(price)} ${this.g.wallet.cash >= 0 ? '' : ''}`);
        };
        row.append(b);
        list.append(row);
      }
      if (msg) list.append(el('p', '', msg));
      list.append(el('p', 'hi', `Cash ${formatINR(this.g.wallet.cash)} • Bank/UPI ${formatINR(this.g.wallet.bank)} — small purchases are paid in cash, larger ones by UPI.`));
      this.show(shop.name, `${shop.nameHi} • ${shop.keeper}`, list, [], greeting);
    };
    render();
  }

  openAtm() {
    const w = this.g.wallet;
    const body = el('div');
    const render = (msg = '') => {
      body.innerHTML = `<p>Bank balance: <b>${formatINR(w.bank)}</b> • Cash in hand: <b>${formatINR(w.cash)}</b></p>${msg ? `<p>${msg}</p>` : ''}`;
    };
    render();
    const amounts = [500, 1000, 2000, 5000];
    this.show('Sagar Co-op Bank ATM', 'एटीएम • Withdraw or deposit cash', body, [
      ...amounts.map((a) => ({ label: `Withdraw ₹${a.toLocaleString('en-IN')}`, onClick: () => { render(w.transfer(rupees(a), 'bank') ? `✅ Withdrew ${formatINR(rupees(a))}` : '⚠️ Insufficient balance'); this.g.events.emit('money:changed', { cash: w.cash, bank: w.bank }); } })),
      { label: 'Deposit all cash', onClick: () => { const c = w.cash; render(c > 0 && w.transfer(c, 'cash') ? `✅ Deposited ${formatINR(c)}` : '⚠️ No cash to deposit'); } },
    ]);
  }

  openPump() {
    const v = this.g.vm.nearestEnterable(this.g.player.s.x, this.g.player.s.z, 8) ?? this.g.vm.current;
    if (!v || (!v.owned && !(v as any).rentedBy)) {
      this.show('Sagar Fuels', 'सागर फ़्यूल्स', '<p>Bring your vehicle next to the pump to refuel.</p>');
      return;
    }
    const spec = v.spec;
    const perL = spec.fuel === 'cng' ? ECONOMY.cngPerKg : spec.fuel === 'electric' ? rupees(9) : ECONOMY.petrolPerLitre;
    const unit = spec.fuel === 'cng' ? 'kg CNG' : spec.fuel === 'electric' ? 'kWh' : 'L';
    const missing = Math.max(0, spec.tankLitres - v.state.fuel);
    const body = el('div');
    const render = (msg = '') => {
      body.innerHTML = `<p>${spec.brand} ${spec.name} • <span class="tag">${spec.fuel.toUpperCase()}</span></p>
        <p>Tank: <b>${v.state.fuel.toFixed(1)} / ${spec.tankLitres} ${unit}</b> • Rate ${formatINR(perL, { paise: true })}/${unit}</p>${msg ? `<p>${msg}</p>` : ''}`;
    };
    render();
    const fill = (litres: number) => {
      litres = Math.min(litres, spec.tankLitres - v.state.fuel);
      if (litres <= 0.05) return render('Tank already full.');
      const cost = Math.round(litres * perL);
      if (!this.g.wallet.spend(cost, 'fuel', `${litres.toFixed(1)} ${unit} @ Sagar Fuels`)) return render(`⚠️ Not enough money for ${formatINR(cost)}`);
      v.state.fuel += litres;
      this.g.events.emit('vehicle:refuel', { vehicleId: v.id, litres, cost });
      render(`✅ Filled ${litres.toFixed(1)} ${unit} for ${formatINR(cost)}. “Zero dekh liya na sir?”`);
    };
    this.show('Sagar Fuels', 'सागर फ़्यूल्स • Petrol • Diesel • CNG', body, [
      { label: `${formatINR(rupees(100))} worth`, onClick: () => fill(rupees(100) / perL) },
      { label: `${formatINR(rupees(500))} worth`, onClick: () => fill(rupees(500) / perL) },
      { label: `Full tank (${formatINR(Math.round(missing * perL))})`, onClick: () => fill(missing) },
    ]);
  }

  openGarage() {
    const owned = this.g.vm.vehicles.filter((v) => v.owned);
    const body = el('div');
    const render = (msg = '') => {
      body.innerHTML = '';
      if (!owned.length) body.append(el('p', '', 'You have no vehicles yet.'));
      for (const v of owned) {
        const cost = Math.round(v.state.damage * ECONOMY.repairPerPoint * (v.spec.category === 'two_wheeler' ? 0.5 : 1));
        const row = el('div', 'item-row', `<div class="ico">${v.twoWheeler ? '🛵' : '🚗'}</div><div class="nm">${v.spec.brand} ${v.spec.name}<small>${v.plate} • condition ${Math.round(100 - v.state.damage)}% • fuel ${Math.round((v.state.fuel / v.spec.tankLitres) * 100)}%</small></div><div class="pr">${cost ? formatINR(cost) : '—'}</div>`);
        const b = el('button', 'btn', 'Repair');
        b.disabled = !cost;
        b.onclick = () => {
          if (!this.g.wallet.spend(cost, 'repair', `Repair ${v.spec.name} @ Sharma Auto Works`)) return render('⚠️ Not enough money.');
          v.state.damage = 0;
          render(`✅ ${v.spec.name} repaired.`);
        };
        row.append(b);
        body.append(row);
      }
      if (msg) body.append(el('p', '', msg));
    };
    render();
    this.g.events.emit('npc:talk', { npcId: 'sharma_mama' });
    this.show('Sharma Auto Works', 'शर्मा ऑटो वर्क्स • Repairs & servicing', body, [
      { label: 'Deliver my vehicles here', onClick: () => { this.g.events.emit('notify', { title: 'Sharma Mama', body: 'Chhotu will bring your vehicles to the garage.', kind: 'info' }); this.recallVehicles(); render('Vehicles parked at the garage.'); } },
    ], 'Aa gaya beta! Gaadi ka kya haal hai?');
  }

  recallVehicles() {
    let i = 0;
    for (const v of this.g.vm.vehicles) {
      if (!v.owned || v === this.g.vm.current) continue;
      const a = this.g.city.ctx.anchors.get(`garage_spot_${i++ % 4}`);
      if (!a) continue;
      Object.assign(v.state, { x: a.x, z: a.z, heading: a.heading ?? 0, vx: 0, vz: 0 });
    }
  }

  openShowroom() {
    const body = el('div');
    const render = (msg = '') => {
      body.innerHTML = '';
      for (const id of SHOWROOM_STOCK) {
        const s = VEHICLES[id];
        const row = el('div', 'item-row', `<div class="ico">${s.category === 'two_wheeler' ? '🏍️' : '🚗'}</div><div class="nm">${s.brand} ${s.name}<small>${s.topSpeedKmh} km/h • ${s.fuel} • ${s.seats} seats</small></div><div class="pr">${formatINRShort(s.price)}</div>`);
        const b = el('button', 'btn', 'Buy');
        b.disabled = this.g.wallet.bank < s.price;
        b.onclick = () => {
          if (!this.g.wallet.spend(s.price, 'vehicle', `${s.brand} ${s.name} (ex-showroom)`, 'bank')) return render('⚠️ Insufficient bank balance. Vehicle loans unlock with a steady job.');
          const a = this.g.city.ctx.anchors.get('showroom_delivery')!;
          const v = this.g.vm.spawn(id, s.colors[0], a.x, a.z, a.heading ?? 0, true, undefined, 0.3);
          this.g.events.emit('vehicle:buy', { model: id });
          render(`🎉 Congratulations! ${s.brand} ${s.name} (${v.plate}) is waiting outside.`);
        };
        row.append(b);
        body.append(row);
      }
      body.append(el('p', 'hi', `Bank balance: ${formatINR(this.g.wallet.bank)} • Prices are fictional ex-showroom figures for game balance.`));
      if (msg) body.append(el('p', '', msg));
    };
    render();
    this.show('Rajhans Motors', 'राजहंस मोटर्स • New & certified vehicles', body, [], 'Welcome! Test drive karna hai?');
  }

  openTickets(it: Interactable) {
    const from = it.id === 'ticket_window' || it.id === 'atvm_sagar' ? 'sagar' : it.id.replace('ticket_', '');
    const body = el('div');
    const inv = this.g.inventory;
    const render = (msg = '') => {
      body.innerHTML = `<p>Western-line local • From <b>${from === 'sagar' ? 'Sagar Nagar' : from}</b></p>
        <p>Held: 🎫 ${inv.count('rail_ticket')} second class • ${inv.count('rail_ticket_fc')} first class • ${inv.count('rail_pass') ? 'Monthly pass ✅' : 'no pass'}</p>${msg ? `<p>${msg}</p>` : ''}`;
    };
    render();
    const buy = (item: string, price: number, label: string) => {
      if (!this.g.wallet.spend(price, 'transport', label)) return render('⚠️ Not enough money.');
      inv.add(item);
      this.g.events.emit('ticket:buy', { kind: item, price });
      render(`✅ ${label} — ${formatINR(price)}`);
    };
    this.show('Booking Office', 'तिकीट घर • टिकट घर • Ticket counter', body, [
      { label: `2nd class single ${formatINR(railFare(3, false))}`, onClick: () => buy('rail_ticket', railFare(3, false), '2nd class single journey') },
      { label: `1st class single ${formatINR(railFare(3, true))}`, onClick: () => buy('rail_ticket_fc', railFare(3, true), '1st class single journey') },
      { label: `Monthly pass ${formatINR(rupees(220))}`, onClick: () => { if (inv.has('rail_pass')) return render('You already have a pass.'); buy('rail_pass', rupees(220), 'Monthly season pass (2nd class)'); } },
    ], 'Kahan ka ticket? Change dena, bhai.');
  }

  openHospital() {
    const p = this.g.player.s;
    const fee = rupees(300);
    this.show('Lifeline Hospital', 'लाइफ़लाइन अस्पताल • OPD', `<p>Health: <b>${Math.round(p.health)}%</b></p><p>OPD consultation & treatment restores health.</p>`, [
      { label: `Consult doctor (${formatINR(fee)})`, disabled: p.health > 95, onClick: () => {
        if (!this.g.wallet.spend(fee, 'other', 'OPD consultation, Lifeline Hospital')) return;
        p.health = 100;
        this.modal.close();
        this.g.events.emit('notify', { title: 'Feeling better', body: 'Health restored.', kind: 'info' });
      } },
    ]);
  }

  serialize(): ShopMemory { return { visits: { ...this.memory.visits } }; }
  load(m: ShopMemory) { this.memory = { visits: { ...(m?.visits ?? {}) } }; }
}

function fmtHour(h: number) {
  const hh = Math.floor(h) % 24, mm = Math.round((h - Math.floor(h)) * 60);
  return `${((hh + 11) % 12) + 1}:${String(mm).padStart(2, '0')} ${hh < 12 ? 'AM' : 'PM'}`;
}

export { SHOPS };
