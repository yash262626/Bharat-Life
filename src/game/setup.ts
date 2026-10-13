// Wires gameplay systems, UI and persistence onto the Game.
import * as THREE from 'three';
import { Game } from './Game';
import { Settings } from './settings';
import { ShopSystem } from '../shops/ShopSystem';
import { MissionManager } from '../missions/MissionManager';
import { PropertySystem, CareerSystem, DeliveryGigs, PROPERTIES } from '../life/Life';
import { Menus } from '../ui/Menus';
import { Phone, bankApp, messagesApp } from '../ui/Phone';
import { el } from '../ui/HUD';
import { SaveStore, SaveData, defaultSave, SlotId, SLOTS } from '../save/SaveSystem';
import { randomAppearance, Appearance } from '../npc/HumanRenderer';
import { makeRng } from '../core/math';
import { ECONOMY } from '../config/economy';
import { formatINR } from '../economy/money';
import { missionById } from '../config/missions';
import { renderDistrictMap, worldToMap, POIS } from '../ui/MapRenderer';
import { PLAYER_SPAWN, RAIL } from '../world/layout';
import { WeatherKind, Season } from '../world/Environment';
import { Modal } from '../ui/Modal';
import { TrafficSystem } from '../traffic/TrafficSystem';
import { PedestrianSystem } from '../npc/PedestrianSystem';
import { TrainSystem } from '../rail/TrainSystem';
import { AudioSystem } from '../audio/AudioSystem';

export interface Gameplay {
  shops: ShopSystem; missions: MissionManager; property: PropertySystem; career: CareerSystem; gigs: DeliveryGigs;
  phone: Phone; menus: Menus; store: SaveStore; save(slot: SlotId): void; load(slot: SlotId): boolean;
  traffic: TrafficSystem; peds: PedestrianSystem; trains: TrainSystem; audio: AudioSystem;
}

export function setupGameplay(game: Game, settings: Settings): Gameplay {
  game.cam.sensitivity = settings.sensitivity;
  game.cam.invertY = settings.invertY;
  game.clock.timeScale = settings.timeScale;
  const ui = game.ui;
  const store = new SaveStore(safeStorage());
  let playtime = 0;

  // ------------------------------------------------------------------ systems
  const shops = new ShopSystem(game);
  const property = new PropertySystem(game);
  const career = new CareerSystem(game);
  const missions = new MissionManager({
    events: game.events, wallet: game.wallet,
    playerPos: () => ({ x: game.player.s.x, z: game.player.s.z, inVehicle: !!game.vm.current }),
    setObjective: (o) => game.setObjective(o),
    say: (who, text, secs) => game.hud.say(who, text, secs),
  });
  const gigs = new DeliveryGigs(game, () => !!missions.active);
  const traffic = new TrafficSystem(game);
  const peds = new PedestrianSystem(game);
  const trains = new TrainSystem(game);
  const audio = new AudioSystem(game, settings);
  game.addSystem({ update: (dt) => { missions.update(dt); gigs.update(dt); playtime += dt; } });
  game.addSystem(traffic);
  game.addSystem(peds);
  game.addSystem(trains);
  game.addSystem(audio);

  // mission actions
  missions.actions.set('giveScooter', () => {
    if (game.vm.vehicles.some((v) => v.owned && v.type === 'chetak_scooter')) return;
    const a = game.city.ctx.anchors.get('garage_spot_0')!;
    const v = game.vm.spawn('chetak_scooter', '#2f5d8a', a.x, a.z, a.heading ?? 0, true, 'MH 02 AK 7316', 0.02);
    game.events.emit('notify', { title: 'New vehicle', body: `Kesari Chetna 110 (${v.plate}) — fuel nearly empty`, kind: 'info' });
  });
  missions.actions.set('pickupParcel', () => { game.inventory.add('parcel'); game.hud.say('Shetty anna', '2 thali, packed. Garam hai, jaldi jao!', 3); });
  missions.actions.set('dropParcel', () => { game.inventory.remove('parcel'); game.hud.say('Customer', 'Thank you bhaiya! 5 star dunga.', 3); });
  game.events.on('mission:complete', () => save('auto'));
  game.events.on('job:hired', () => phone.pushMessage('Sahyog Services HR', 'Welcome aboard! Shift 9:30 AM – 6 PM, Mon–Sat.'));

  // ------------------------------------------------------------------ doors, NPCs
  const modal = new Modal(ui);
  modal.onClose = () => (game.modalOpen = false);
  game.interactHandlers.set('door', (it) => {
    const interior = String(it.data?.interior);
    if (interior === 'office') return career.officeDoor();
    if (interior === 'room') {
      game.modalOpen = true;
      if (!property.home) return modal.show('Shanti Niwas Chawl', 'शांति निवास', '<p>You don\'t live here yet. Rent a room through Ghar Dekho (phone → Tab).</p>');
      const p = PROPERTIES.find((x) => x.id === property.home)!;
      modal.show('Your room', p.name, `<p>A small room — a mattress, a steel cupboard, a calendar of Ganpati Bappa on the wall.</p><p>Energy ${Math.round(game.player.s.energy)}% • Food ${Math.round(game.player.s.hunger)}%</p>`, [
        { label: 'Sleep until 7 AM (saves game)', onClick: () => { modal.close(); sleep(7); } },
        { label: 'Nap for 2 hours', onClick: () => { modal.close(); game.fade(() => { game.clock.advanceMinutes(120); game.player.s.energy = Math.min(100, game.player.s.energy + 25); }); } },
        { label: 'Change clothes', onClick: () => { modal.close(); menus.showCreator(game.appearance, (a) => game.setAppearance(a), (a) => game.setAppearance(a)); } },
      ]);
    }
  });
  game.interactHandlers.set('npc', (it) => {
    if (it.data?.npc === 'pujari') {
      game.modalOpen = true;
      modal.show('Shree Ganesh Mandir', 'श्री गणेश मंदिर', '<p>The bell rings. The pujari offers you prasad.</p>', [
        { label: 'Offer prayers (₹21 dakshina)', onClick: () => { if (game.wallet.spend(2100, 'other', 'Dakshina, Ganesh Mandir')) { game.player.s.energy = Math.min(100, game.player.s.energy + 10); game.hud.say('Pujari ji', 'Ganpati Bappa Morya! Sab accha hoga, beta.', 3); } modal.close(); } },
      ]);
    }
  });
  function sleep(wakeHour: number) {
    game.fade(() => {
      const mins = game.clock.skipTo(wakeHour);
      game.player.s.energy = 100;
      game.player.s.hunger = Math.max(10, game.player.s.hunger - mins * 0.02);
      game.player.s.health = Math.min(100, game.player.s.health + 20);
      save('auto');
      game.events.emit('player:sleep', { hours: mins / 60 });
      game.events.emit('notify', { title: `Good morning! Day ${game.clock.day}`, body: `${game.clock.weekday} • Game saved`, kind: 'info' });
    });
  }

  // collapse -> hospital
  game.addSystem({ update: () => {
    const p = game.player.s;
    if (p.health <= 0 && game.state === 'playing') {
      p.health = 60;
      game.fade(() => {
        if (game.vm.current) game.vm.exit();
        const a = game.city.ctx.anchors.get('hospital')!;
        game.player.teleport(a.x, a.y, a.z, a.heading);
        game.clock.advanceMinutes(240);
        const bill = Math.min(ECONOMY.hospitalBill, game.wallet.cash + game.wallet.bank);
        if (bill > 0) game.wallet.spend(Math.min(bill, game.wallet.bank >= bill ? bill : game.wallet.cash), 'other', 'Lifeline Hospital — emergency treatment', game.wallet.bank >= bill ? 'bank' : 'cash');
        game.events.emit('notify', { title: 'You woke up at Lifeline Hospital', body: `Treatment bill ${formatINR(ECONOMY.hospitalBill)}. Take care on Mumbai roads!`, kind: 'warn' });
      });
    }
  } });

  // ------------------------------------------------------------------ phone
  const phone = new Phone(ui, () => game.clock.format());
  phone.onToggle = (open) => (game.modalOpen = open);
  phone.apps.push(
    bankApp(game.wallet, () => game.clock.day),
    { id: 'map', name: 'Maps', icon: '🗺️', color: '#00838f', render: () => { phone.toggle(false); toggleMap(true); } },
    gigs.app(),
    property.app(),
    { id: 'garage', name: 'My Garage', icon: '🛵', color: '#455a64', render: (s) => {
      const owned = game.vm.vehicles.filter((v) => v.owned);
      if (!owned.length) s.append(el('div', 'card', 'No vehicles yet.'));
      for (const v of owned) s.append(el('div', 'card', `<b>${v.spec.brand} ${v.spec.name}</b><br>${v.plate}<br>Fuel ${Math.round((v.state.fuel / v.spec.tankLitres) * 100)}% • Condition ${Math.round(100 - v.state.damage)}%<br><small style="color:var(--muted)">${Math.round(Math.hypot(v.state.x - game.player.s.x, v.state.z - game.player.s.z))} m away</small>`));
      const b = el('button', 'btn', 'Send vehicles to Sharma Auto Works');
      b.onclick = () => { shops.recallVehicles(); b.textContent = 'Done ✓'; };
      s.append(b);
    } },
    { id: 'missions', name: 'Missions', icon: '📋', color: '#5e35b1', render: (s) => {
      const a = missions.active;
      s.append(el('div', 'card', a ? `<b>Active: ${a.def.title}</b><br>${a.def.description}` : 'No active story mission.'));
      if (career.job) s.append(el('div', 'card', `<b>Job:</b> ${career.def!.levels[career.level]} • ${career.shifts} shifts • pending salary ${formatINR(career.pendingSalary)}`));
      for (const id of missions.completed) { const d = missionById(id); if (d) s.append(el('div', 'card', `✔ ${d.title} <small style="color:var(--muted)">${d.titleHi}</small>`)); }
    } },
    messagesApp(phone),
  );
  phone.pushMessage('Mama ji', 'Beta, station se seedha garage aana. Sharma Auto Works, Gokhale Road.');
  phone.pushMessage('Maa', 'Pahunch gaya? Khana time pe khana. Paise ki tension mat lena.');

  // ------------------------------------------------------------------ full map
  const bigmap = el('div', 'bigmap panel');
  const mapCanvas = el('canvas');
  bigmap.append(mapCanvas, el('div', 'legend panel', '🟠 Objective &nbsp; ⬆ You &nbsp; ☕🍔🛒 Shops &nbsp; ⛽ Fuel &nbsp; 🔧 Garage &nbsp; 🚉 Station<br>Press M or Esc to close'));
  ui.append(bigmap);
  const mapImg = renderDistrictMap();
  function toggleMap(force?: boolean) {
    const open = force ?? bigmap.style.display !== 'block';
    bigmap.style.display = open ? 'block' : 'none';
    game.modalOpen = open;
    if (!open) return;
    mapCanvas.width = bigmap.clientWidth * devicePixelRatio;
    mapCanvas.height = bigmap.clientHeight * devicePixelRatio;
    const g = mapCanvas.getContext('2d')!;
    const k = Math.min(mapCanvas.width / mapImg.width, mapCanvas.height / mapImg.height);
    const ox = (mapCanvas.width - mapImg.width * k) / 2, oy = (mapCanvas.height - mapImg.height * k) / 2;
    g.fillStyle = '#1e2a33'; g.fillRect(0, 0, mapCanvas.width, mapCanvas.height);
    g.drawImage(mapImg, ox, oy, mapImg.width * k, mapImg.height * k);
    g.font = `${18 * devicePixelRatio}px sans-serif`;
    g.textAlign = 'center'; g.textBaseline = 'middle';
    for (const p of POIS) { const m = worldToMap(p.x, p.z); g.fillText(p.icon, ox + m.u * k, oy + m.v * k); }
    const o = game.objective;
    if (o?.x !== undefined) { const m = worldToMap(o.x, o.z!); g.fillStyle = '#ffb35c'; g.beginPath(); g.arc(ox + m.u * k, oy + m.v * k, 9 * devicePixelRatio, 0, 7); g.fill(); }
    const m = worldToMap(game.player.s.x, game.player.s.z);
    g.save(); g.translate(ox + m.u * k, oy + m.v * k); g.rotate(-game.player.s.heading + Math.PI);
    g.fillStyle = '#fff'; g.strokeStyle = '#ff9933'; g.lineWidth = 3;
    g.beginPath(); g.moveTo(0, -14); g.lineTo(10, 10); g.lineTo(0, 5); g.lineTo(-10, 10); g.closePath(); g.fill(); g.stroke(); g.restore();
  }

  // ------------------------------------------------------------------ save / load
  function gather(): SaveData {
    const d = defaultSave();
    const p = game.player.s;
    const a = game.appearance;
    d.playtime = playtime;
    d.appearance = { skin: '#' + a.skin.getHexString(), top: '#' + a.top.getHexString(), bottom: '#' + a.bottom.getHexString(), hair: '#' + a.hair.getHexString(), female: a.female, longSleeve: a.longSleeve, beard: a.beard, bag: a.bag, height: a.height, build: a.build };
    const v = game.vm.current;
    d.player = { x: v ? v.state.x : p.x, y: v ? v.state.y : p.y, z: v ? v.state.z : p.z, heading: p.heading, health: p.health, hunger: p.hunger, energy: p.energy, stamina: p.stamina };
    if (v) { const o = { x: v.state.x - Math.cos(v.state.heading) * 1.6, z: v.state.z + Math.sin(v.state.heading) * 1.6 }; d.player.x = o.x; d.player.z = o.z; }
    d.time = { totalMinutes: game.clock.totalMinutes, timeScale: game.clock.timeScale };
    const ws = game.env.serialize();
    d.weather = { weather: ws.weather, season: ws.season, next: ws.next, wet: ws.wet };
    d.wallet = game.wallet.serialize();
    d.inventory = game.inventory.serialize();
    d.vehicles = game.vm.vehicles.filter((x) => x.owned).map((x) => x.serialize());
    d.properties = property.serialize();
    d.career = career.serialize();
    d.missions = missions.serialize();
    d.shops = shops.serialize();
    return d;
  }

  function apply(d: SaveData) {
    game.setAppearance({ skin: new THREE.Color(d.appearance.skin), top: new THREE.Color(d.appearance.top), bottom: new THREE.Color(d.appearance.bottom), hair: new THREE.Color(d.appearance.hair), female: d.appearance.female, longSleeve: d.appearance.longSleeve, beard: d.appearance.beard as 0 | 1 | 2, bag: d.appearance.bag, height: d.appearance.height, build: d.appearance.build });
    for (const v of [...game.vm.vehicles]) game.vm.despawn(v);
    game.vm.current = null;
    const p = d.player;
    const gy = game.col.groundHeight(p.x, p.z, p.y + 0.5);
    game.player.teleport(p.x, Math.max(gy, p.y), p.z, p.heading);
    Object.assign(game.player.s, { health: p.health, hunger: p.hunger, energy: p.energy, stamina: p.stamina });
    game.clock.totalMinutes = d.time.totalMinutes;
    game.env.load({ weather: d.weather.weather as WeatherKind, season: d.weather.season as Season, next: d.weather.next, wet: d.weather.wet });
    game.wallet.load(d.wallet);
    game.inventory.load(d.inventory);
    for (const v of d.vehicles) game.vm.spawn(v.type, v.color, v.x, v.z, v.heading, v.owned, v.plate, 0, v.id, v.damage).state.fuel = v.fuel;
    property.load(d.properties);
    career.load(d.career);
    missions.load(d.missions);
    shops.load(d.shops);
    playtime = d.playtime;
    game.cam.snapBehind(p.heading);
    game.setObjective(null);
  }

  function save(slot: SlotId) {
    try {
      store.write(slot, gather());
      if (slot !== 'auto') game.events.emit('notify', { title: 'Game saved', body: `Slot ${slot.toUpperCase()} • Day ${game.clock.day} ${game.clock.format()}`, kind: 'info' });
    } catch (e) {
      console.error(e);
      game.events.emit('notify', { title: 'Save failed', body: String(e), kind: 'warn' });
    }
  }

  function load(slot: SlotId): boolean {
    const r = store.read(slot);
    if (!r.ok) { game.events.emit('notify', { title: 'Could not load', body: r.error, kind: 'warn' }); return false; }
    apply(r.data);
    if (r.repaired.length) console.warn('[Save] repaired fields', r.repaired);
    game.events.emit('notify', { title: 'Game loaded', body: `Day ${game.clock.day} • ${game.clock.format()}`, kind: 'info' });
    return true;
  }

  // autosave every 3 real minutes while playing
  let autosaveT = 0;
  game.addSystem({ update: (dt) => { if (game.state !== 'playing') return; autosaveT += dt; if (autosaveT > 180) { autosaveT = 0; save('auto'); } } });

  // ------------------------------------------------------------------ menus & new game
  function startPlaying() {
    game.state = 'playing';
    menus.hideMain();
    game.hud.root.style.display = '';
    audio.resume();
  }
  function newGame(a: Appearance) {
    apply(defaultSave());
    game.setAppearance(a);
    game.player.teleport(PLAYER_SPAWN.x, RAIL.platformH, PLAYER_SPAWN.z, PLAYER_SPAWN.heading);
    game.clock.totalMinutes = 7 * 60 + 40;
    game.env.setWeather('cloudy', true);
    game.wallet.load({ cash: ECONOMY.startingCash, bank: ECONOMY.startingBank, loan: 0, nextTxId: 1, ledger: [] });
    game.wallet.earn(0, 'other', 'Account opened');
    game.inventory.add('rail_ticket');
    trains.placeArrivalTrain();
    startPlaying();
    save('auto');
  }
  const menus = new Menus(ui, settings, {
    newGame: () => {
      game.hud.root.style.display = 'none';
      const a = randomAppearance(makeRng(Date.now() % 1000), false);
      a.bag = true;
      game.setAppearance(a);
      // stand the preview avatar in front of the menu camera
      game.player.teleport(176, RAIL.platformH, -3, Math.PI / 2);
      game.state = 'paused';
      game.camera.position.set(181.5, RAIL.platformH + 1.5, -1.5);
      game.camera.lookAt(176, RAIL.platformH + 1.1, -3);
      game.avatar.set(game.avatarHandle, 176, RAIL.platformH, -3, Math.PI / 2 - 0.4, 0, 0);
      game.avatar.update(0);
      menus.showCreator(a, (fin) => newGame(fin), (ch) => { game.setAppearance(ch); game.avatar.set(game.avatarHandle, 176, RAIL.platformH, -3, Math.PI / 2 - 0.4, 0, 0); game.avatar.update(0); });
    },
    continueGame: () => { const latest = latestSlot(); if (latest && load(latest)) startPlaying(); else menus.showMain(); },
    hasSave: () => !!latestSlot(),
    resume: () => { if (game.state === 'paused') game.state = 'playing'; game.modalOpen = false; },
    save: (slot) => save(slot as SlotId),
    load: (slot) => { if (load(slot as SlotId)) startPlaying(); },
    slots: () => store.list().map((s) => ({ slot: s.slot, empty: 'empty' in s, label: 'empty' in s ? 'Empty' : `Day ${s.day} • ${formatINR(s.money)} • ${new Date(s.savedAt).toLocaleString('en-IN')}` })),
    applySettings: (s) => {
      game.gr.setQuality(s.quality);
      game.env.setShadowExtent(game.gr.settings.shadowExtent);
      game.env.setShadowQuality(game.gr.settings.shadowMap, game.gr.settings.shadows);
      game.cam.sensitivity = s.sensitivity;
      game.cam.invertY = s.invertY;
      game.clock.timeScale = s.timeScale;
      audio.setVolume(s.volume);
      Object.assign(settings, s);
    },
    quitToMenu: () => { save('auto'); game.state = 'menu'; game.hud.root.style.display = 'none'; menus.showMain(); },
  });
  function latestSlot(): SlotId | null {
    let best: SlotId | null = null, t = '';
    for (const s of store.list()) if (!('empty' in s) && s.savedAt > t) { t = s.savedAt; best = s.slot as SlotId; }
    return best;
  }

  // global keys: pause, phone, map
  game.addSystem({ update: () => {
    const i = game.input;
    if (game.state === 'menu') return;
    if (i.just('pause')) {
      if (bigmap.style.display === 'block') toggleMap(false);
      else if (phone.open) phone.toggle(false);
      else if (menus.pauseOpen) menus.hidePause();
      else if (game.state === 'playing' && !game.modalOpen) { game.state = 'paused'; game.input.releasePointer(); menus.showPause(); }
    }
    if (game.state !== 'playing') return;
    if (i.just('phone') && bigmap.style.display !== 'block') phone.toggle();
    if (i.just('map') && !phone.open) toggleMap();
  } });

  // menu loop runs systems with state 'menu' too (city animates behind the menu)
  game.state = 'menu';
  game.hud.root.style.display = 'none';
  menus.showMain();

  const gp: Gameplay = { shops, missions, property, career, gigs, phone, menus, store, save, load, traffic, peds, trains, audio };
  (window as any).gameplay = gp;
  (window as any).__ready = true;
  return gp;
}

function safeStorage() {
  try {
    const k = '__bl_test';
    localStorage.setItem(k, '1');
    localStorage.removeItem(k);
    return localStorage;
  } catch {
    const mem = new Map<string, string>();
    return { getItem: (k: string) => mem.get(k) ?? null, setItem: (k: string, v: string) => void mem.set(k, v), removeItem: (k: string) => void mem.delete(k) };
  }
}

export { SLOTS };
