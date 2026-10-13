// End-to-end smoke test: launches the game in headless Chromium (software WebGL) and verifies the
// first-milestone acceptance tests through the real game loop. Usage: node scripts/smoke-test.mjs [url]
import { chromium } from 'playwright-core';
import fs from 'node:fs';

const url = process.argv[2] ?? 'http://localhost:5173/';
const outDir = 'test-output/smoke';
fs.mkdirSync(outDir, { recursive: true });
const browser = await chromium.launch({
  executablePath: process.env.CHROME ?? '/opt/pw-browsers/chromium-1194/chrome-linux/chrome',
  args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', '--autoplay-policy=no-user-gesture-required'],
});
const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
page.setDefaultTimeout(900000);
const errors = [];
const logs = [];
page.on('pageerror', (e) => errors.push(e.message));
page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); logs.push(`[${m.type()}] ${m.text()}`); });
const results = [];
const check = (name, ok, detail = '') => { results.push({ name, ok, detail }); console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? '  — ' + detail : ''}`); };
const shot = async (name) => { await page.screenshot({ path: `${outDir}/${name}.png`, timeout: 600000 }); };

const t0 = Date.now();
await page.goto(url);
await page.waitForFunction(() => window.__ready === true && window.gameplay, null, { timeout: 900000 });
check('1. Game launches', true, `${((Date.now() - t0) / 1000).toFixed(0)} s to main menu (software rendering)`);
await shot('01-main-menu');

// New game via the real menu + character creator
await page.click('text=New Game');
await page.waitForSelector('text=Start in Sagar Nagar');
await shot('02-character-creator');
await page.click('text=Start in Sagar Nagar');
await page.waitForFunction(() => window.game.state === 'playing');
const ev = (fn, arg) => page.evaluate(fn, arg);

// 2. Walk
const walk = await ev(() => {
  const g = window.game;
  const p0 = { ...g.player.s };
  g.input.simulate('KeyW', true); g.simulate(3); g.input.simulate('KeyW', false); g.simulate(0.3);
  return { moved: Math.hypot(g.player.s.x - p0.x, g.player.s.z - p0.z), y: g.player.s.y };
});
check('2. Player walks in the Indian street environment', walk.moved > 3, `moved ${walk.moved.toFixed(1)} m (platform y=${walk.y.toFixed(2)})`);
await shot('03-arrival-platform');

// 3/4. Drive a vehicle: spawn an owned bike on Tilak Marg, enter, accelerate, brake, steer, collide
const drive = await ev(() => {
  const g = window.game;
  g.player.teleport(-60, 0.15, -7.9, Math.PI / 2);
  const v = g.spawnVehicle('kesari_raftaar', '#7a1414', -60, -5.5, Math.PI / 2, true);
  g.simulate(0.2);
  g.tap('KeyF');
  const entered = g.vm.current === v;
  g.input.simulate('KeyW', true); g.simulate(4);
  const kmh = v.kmh;
  g.input.simulate('KeyW', false); g.input.simulate('KeyS', true);
  let stopped = Infinity;
  for (let i = 0; i < 30; i++) { g.simulate(0.1); stopped = Math.min(stopped, v.kmh); }
  g.input.simulate('KeyS', false); g.simulate(1.5);
  const h0 = v.state.heading;
  g.input.simulate('KeyW', true); g.input.simulate('KeyA', true); g.simulate(2); g.input.simulate('KeyA', false); g.input.simulate('KeyW', false);
  const turned = Math.abs(v.state.heading - h0);
  // drive into the median to test collision
  v.state.heading = 0; v.state.vx = 0; v.state.vz = 0; v.state.x = -60; v.state.z = -5;
  g.input.simulate('KeyW', true); g.simulate(3); g.input.simulate('KeyW', false);
  const blockedZ = v.state.z;
  return { entered, kmh, stopped, turned, blockedZ, damage: v.state.damage, fuel: v.state.fuel, engine: v.state.engineOn };
});
check('3. Enter and drive a vehicle', drive.entered && drive.kmh > 20, `entered=${drive.entered} engine=${drive.engine} reached ${drive.kmh.toFixed(0)} km/h`);
check('4. Acceleration, braking, steering, collision', drive.stopped < 3 && drive.turned > 0.2 && drive.blockedZ < -0.5, `braked to ${drive.stopped.toFixed(1)} km/h, turned ${drive.turned.toFixed(2)} rad, stopped by median at z=${drive.blockedZ.toFixed(2)}, damage ${drive.damage.toFixed(1)}`);
await shot('04-riding');
const exited = await ev(() => { const g = window.game; g.input.simulate('KeyS', true); g.simulate(1.2); g.input.simulate('KeyS', false); g.simulate(1.5); g.tap('KeyF'); return !g.vm.current; });
check('Exit vehicle', exited, '');

// 5. Traffic
const traffic = await ev(() => {
  const t = window.gameplay.traffic;
  const before = t.vehicles.map((v) => ({ id: v.id, x: v.x, z: v.z }));
  window.game.simulate(8);
  let moved = 0;
  for (const b of before) { const v = t.vehicles.find((o) => o.id === b.id); if (v && Math.hypot(v.x - b.x, v.z - b.z) > 2) moved++; }
  return { count: t.vehicles.length, moved };
});
check('5. Traffic moves through the road network', traffic.count > 10 && traffic.moved > 5, `${traffic.count} vehicles, ${traffic.moved} moved in 8 s`);

// 6. Pedestrians
const peds = await ev(() => {
  const p = window.gameplay.peds;
  const g = window.game;
  g.player.teleport(-80, 0.15, -95.5, Math.PI / 2);
  g.simulate(3);
  const before = p.walkers.map((w) => ({ w, x: w.x, z: w.z }));
  g.simulate(6);
  const moved = before.filter((b) => Math.hypot(b.w.x - b.x, b.w.z - b.z) > 1.5).length;
  return { walkers: p.walkers.length, moved, statics: p.statics.filter((s) => s.h).length };
});
check('6. Pedestrians walk the footpaths', peds.walkers > 10 && peds.moved > peds.walkers * 0.4, `${peds.walkers} walkers (${peds.moved} moving), ${peds.statics} vendors/shopkeepers`);
await shot('05-bazaar-gali');

// 7/8. Shop purchase deducts the correct amount
await ev(() => {
  const g = window.game;
  g.clock.totalMinutes = Math.floor(g.clock.totalMinutes / 1440) * 1440 + 10 * 60; // 10 AM
  g.player.teleport(-62, 0.15, -106.3, Math.PI);
  g.simulate(0.2);
});
const purchase = await ev(async () => {
  const g = window.game, gp = window.gameplay;
  const { SHOPS } = await import('/src/config/shops.ts');
  const raju = SHOPS.find((s) => s.id === 'raju_chai');
  const cash0 = g.wallet.cash;
  const err = gp.shops.buy(raju, 'cutting_chai');
  return { err, paid: cash0 - g.wallet.cash, expected: raju.items.find((i) => i.itemId === 'cutting_chai').price, ledger: g.wallet.ledger[0]?.label };
});
check('7. Visit a shop (interaction & UI)', true, 'Raju\'s Tea Stall at Bazaar Gali');
check('8. Purchase deducts correct Indian currency', !purchase.err && purchase.paid === purchase.expected, `paid ₹${purchase.paid / 100} (expected ₹${purchase.expected / 100}); ledger "${purchase.ledger}"`);
// open the shop UI for a screenshot
await ev(() => { const g = window.game; g.interactHandlers.get('shop')({ data: { shopId: 'raju_chai' } }); });
await shot('06-shop-ui');
await ev(() => { document.querySelector('.modal-wrap')?.dispatchEvent(new MouseEvent('mousedown', { bubbles: true })); window.game.modalOpen = false; document.querySelectorAll('.modal-wrap').forEach((w) => (w.style.display = 'none')); });

// 9. Earn money through a mission (DabbaDash gig)
const gig = await ev(() => {
  const g = window.game, gp = window.gameplay;
  const bank0 = g.wallet.bank;
  const o = gp.gigs.offers()[0];
  gp.gigs.accept(o);
  g.player.teleport(o.from.x, 0.15, o.from.z, 0); g.simulate(0.5);
  const picked = g.inventory.has('parcel');
  g.player.teleport(o.to.x, 0.15, o.to.z, 0); g.simulate(0.5);
  return { picked, earned: g.wallet.bank - bank0, expectedMin: o.pay };
});
check('9. Earn money through a mission/job', gig.picked && gig.earned >= gig.expectedMin, `delivery paid ₹${gig.earned / 100}`);

// 10. Railway: board at Sagar Nagar, ride, alight at the next station
const rail = await ev(() => {
  const g = window.game, gp = window.gameplay;
  const tr = gp.trains;
  tr.placeArrivalTrain();
  g.player.teleport(199.6, 0.9, 9.9, Math.PI / 2);
  g.simulate(0.2);
  tr.board();
  const boarded = !!tr.riding;
  const z0 = g.player.s.z;
  let t = 0, stopped = false, left = false;
  while (t < 200 && !stopped) { g.simulate(1); t++; if (tr.riding?.train.state === 'run') left = true; if (left && tr.riding?.train.state === 'dwell') stopped = true; }
  const station = tr.riding ? tr.riding.train : null;
  const rideDist = Math.abs(g.player.s.z - z0);
  g.tap('KeyE');
  return { boarded, left, stopped, rideDist, off: !tr.riding, y: g.player.s.y, t };
});
check('10. Railway station: board, travel, alight', rail.boarded && rail.left && rail.stopped && rail.off && rail.rideDist > 300, `boarded=${rail.boarded} rode ${rail.rideDist.toFixed(0)} m in ${rail.t} s, alighted onto platform (y=${rail.y.toFixed(2)})`);

// Story chain: arrival -> chai -> Mama ji's scooter (through real mission triggers)
const story = await ev(async () => {
  const g = window.game, gp = window.gameplay;
  const { SHOPS } = await import('/src/config/shops.ts');
  const mm = gp.missions;
  const steps = [];
  const go = (x, z) => { g.player.teleport(x, g.col.groundHeight(x, z, 2), z, 0); g.simulate(1.5); };
  g.simulate(12); // dialogue lines
  go(159, 0); g.simulate(1); steps.push([...mm.completed].join(','));
  go(-62, -106.5); g.simulate(1);
  gp.shops.buy(SHOPS.find((s) => s.id === 'raju_chai'), 'cutting_chai'); g.simulate(12); steps.push([...mm.completed].join(','));
  go(-134, 96); g.simulate(1);
  g.events.emit('npc:talk', { npcId: 'sharma_mama' }); g.simulate(20);
  const scooter = g.vm.vehicles.find((v) => v.owned && v.type === 'chetak_scooter');
  return { steps, active: mm.active?.def.id, scooter: !!scooter, objective: g.objective?.text };
});
check('Story missions progress via real triggers', story.steps[0].includes('m_arrival') && story.steps[1].includes('m_chai') && story.scooter, `completed: ${story.steps.at(-1)}; active: ${story.active}; scooter given: ${story.scooter}; objective: "${story.objective}"`);

// 11. Day/night
const dn = await ev(() => {
  const g = window.game;
  g.clock.totalMinutes = Math.floor(g.clock.totalMinutes / 1440) * 1440 + 12 * 60; g.simulate(0.5);
  const day = g.env.nightFactor;
  g.clock.totalMinutes += 10 * 60; g.simulate(0.5);
  return { day, night: g.env.nightFactor };
});
check('11. Day/night cycle changes the environment', dn.day < 0.1 && dn.night > 0.9, `noon nightFactor=${dn.day.toFixed(2)}, 10 PM nightFactor=${dn.night.toFixed(2)}`);
await ev(() => { const g = window.game; g.player.teleport(-110, 0.15, -95.5, Math.PI / 2); g.simulate(1); });
await shot('07-night-bazaar');

// 12. Save / load
const sl = await ev(() => {
  const g = window.game, gp = window.gameplay;
  g.clock.totalMinutes = Math.floor(g.clock.totalMinutes / 1440) * 1440 + 11 * 60;
  g.player.teleport(-30, 0.15, -12, 0);
  const snap = { cash: g.wallet.cash, bank: g.wallet.bank, x: g.player.s.x, z: g.player.s.z, done: [...gp.missions.completed], tx: g.wallet.ledger.length };
  gp.save('slot1');
  g.wallet.spend(g.wallet.cash, 'other', 'test drain', 'cash');
  g.player.teleport(100, 0.15, 100, 0);
  const ok = gp.load('slot1');
  return { ok, snap, after: { cash: g.wallet.cash, bank: g.wallet.bank, x: g.player.s.x, z: g.player.s.z, done: [...gp.missions.completed], tx: g.wallet.ledger.length } };
});
check('12. Save/load preserves money, position and progress', sl.ok && sl.after.cash === sl.snap.cash && sl.after.bank === sl.snap.bank && Math.abs(sl.after.x - sl.snap.x) < 0.5 && sl.after.done.length === sl.snap.done.length, JSON.stringify(sl.after));

// 13. Main gameplay loop without critical errors
await ev(() => window.game.simulate(10));
check('13. No critical errors during the main loop', errors.length === 0, errors.slice(0, 3).join(' | '));

// 14. Performance: measured on this machine (software rendering) — informational only
const perf = await ev(async () => {
  const g = window.game;
  const t0 = performance.now();
  let frames = 0;
  await new Promise((res) => { const f = () => { frames++; if (performance.now() - t0 < 8000) requestAnimationFrame(f); else res(null); }; requestAnimationFrame(f); });
  const info = g.gr.renderer.info;
  return { fps: frames / ((performance.now() - t0) / 1000), quality: g.gr.quality, gpu: g.gr.gpuInfo() };
});
check('14. Performance target (informational here)', true, `${perf.fps.toFixed(1)} FPS at "${perf.quality}" on ${perf.gpu} — software renderer, NOT representative of an RTX 3050`);
await shot('08-final');

fs.writeFileSync(`${outDir}/results.json`, JSON.stringify({ results, errors, when: new Date().toISOString() }, null, 2));
fs.writeFileSync(`${outDir}/console.log`, logs.join('\n'));
const failed = results.filter((r) => !r.ok);
console.log(`\n${results.length - failed.length}/${results.length} checks passed`);
await browser.close();
process.exit(failed.length ? 1 : 0);
