// Production entry: loading screen -> main menu -> game.
import { Game } from './Game';
import { Quality } from '../render/GameRenderer';
import { setupGameplay } from './setup';
import { loadSettings, Settings } from './settings';

export async function boot() {
  const settings: Settings = loadSettings();
  const loading = document.createElement('div');
  loading.className = 'loading';
  loading.innerHTML = `<div style="text-align:center"><div class="logo">BHARAT <span>LIFE</span></div>
    <div class="logo-sub">SAGAR NAGAR • MUMBAI</div><div class="msg" style="color:var(--muted);font-size:13px">Loading…</div>
    <div class="bar"><i style="width:0%"></i></div></div>`;
  document.body.append(loading);
  const game = new Game();
  (window as any).game = game; // debug / automated tests
  await game.init(document.getElementById('app')!, settings.quality as Quality, (p, msg) => {
    (loading.querySelector('.bar > i') as HTMLElement).style.width = `${Math.round(p * 100)}%`;
    (loading.querySelector('.msg') as HTMLElement).textContent = msg;
  });
  setupGameplay(game, settings);
  loading.remove();
}
