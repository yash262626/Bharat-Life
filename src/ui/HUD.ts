// Gameplay HUD: clock/weather, wallet, vitals, objective, prompts, toasts, speedometer, minimap.
import { formatINR } from '../economy/money';
import { renderDistrictMap, worldToMap, MAP_SCALE, POIS } from './MapRenderer';

export function el<K extends keyof HTMLElementTagNameMap>(tag: K, cls = '', html = ''): HTMLElementTagNameMap[K] {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (html) e.innerHTML = html;
  return e;
}

export interface HudState {
  clock: string; day: string; weather: string;
  cash: number; bank: number;
  health: number; stamina: number; hunger: number; energy: number;
  objective?: { title: string; text: string; dist?: number } | null;
  prompt?: { key: string; text: string } | null;
  vehicle?: { kmh: number; gear: number; rpm: number; fuel: number; fuelMax: number; damage: number; lights: boolean; name: string } | null;
  px: number; pz: number; heading: number; camYaw: number;
  target?: { x: number; z: number } | null;
}

export class HUD {
  root = el('div');
  private clock = el('div', 'hud-clock');
  private sub = el('div', 'hud-sub');
  private cash = el('div', 'money cash');
  private bank = el('div', 'money bank');
  private objective = el('div', 'objective panel');
  private prompt = el('div', 'prompt panel');
  private toasts = el('div', 'toasts');
  private speedo = el('div', 'speedo panel');
  private vitals = el('div', 'vitals panel');
  private bars: Record<string, HTMLElement> = {};
  private mini = el('div', 'minimap');
  private miniCanvas = el('canvas');
  private mapImg: HTMLCanvasElement;
  private subtitle = el('div', 'subtitle panel');
  private subTimer = 0;
  private lastCash = -1;
  private lastBank = -1;

  constructor(container: HTMLElement) {
    this.root.className = 'hud';
    const tl = el('div', 'hud-top-left panel');
    tl.append(this.clock, this.sub);
    const tr = el('div', 'hud-top-right panel');
    tr.append(this.cash, this.bank);
    for (const [k, label, color] of [['health', 'HEALTH', '#ff5a52'], ['stamina', 'STAMINA', '#5ab0ff'], ['hunger', 'FOOD', '#ffb35c'], ['energy', 'ENERGY', '#3ccf7a']] as const) {
      const row = el('div', 'vital-row', `<span>${label}</span>`);
      const bar = el('div', 'bar');
      const fill = el('i');
      fill.style.background = color;
      bar.append(fill);
      row.append(bar);
      this.vitals.append(row);
      this.bars[k] = fill;
    }
    this.miniCanvas.width = 380;
    this.miniCanvas.height = 380;
    this.mini.append(this.miniCanvas, el('div', 'north', 'N'));
    this.mapImg = renderDistrictMap();
    this.root.append(tl, tr, this.objective, this.vitals, this.mini, this.prompt, this.toasts, this.speedo, this.subtitle, el('div', 'crosshair'));
    container.append(this.root);
  }

  get mapCanvas() { return this.mapImg; }

  toast(title: string, body = '', kind: 'info' | 'money' | 'mission' | 'warn' = 'info', ms = 4200) {
    const t = el('div', `toast panel ${kind}`, `<b>${title}</b>${body ? `<span>${body}</span>` : ''}`);
    this.toasts.prepend(t);
    while (this.toasts.children.length > 4) this.toasts.lastChild!.remove();
    setTimeout(() => { t.style.transition = 'opacity 0.5s'; t.style.opacity = '0'; setTimeout(() => t.remove(), 500); }, ms);
  }

  say(speaker: string, text: string, seconds = 4) {
    this.subtitle.innerHTML = `<b>${speaker}:</b> ${text}`;
    this.subtitle.style.display = 'block';
    this.subTimer = seconds;
  }

  update(s: HudState, dt: number) {
    this.clock.textContent = s.clock;
    this.sub.textContent = `${s.day} • ${s.weather}`;
    if (s.cash !== this.lastCash || s.bank !== this.lastBank) {
      this.cash.textContent = formatINR(s.cash);
      this.bank.textContent = formatINR(s.bank);
      this.lastCash = s.cash; this.lastBank = s.bank;
    }
    this.bars.health.style.width = `${s.health}%`;
    this.bars.stamina.style.width = `${s.stamina}%`;
    this.bars.hunger.style.width = `${s.hunger}%`;
    this.bars.energy.style.width = `${s.energy}%`;
    if (s.objective) {
      this.objective.style.display = 'block';
      const d = s.objective.dist !== undefined ? `<span class="dist">${s.objective.dist < 1000 ? Math.round(s.objective.dist) + ' m' : (s.objective.dist / 1000).toFixed(1) + ' km'}</span>` : '';
      this.objective.innerHTML = `<b>${s.objective.title}</b>${s.objective.text}${d}`;
    } else this.objective.style.display = 'none';
    if (s.prompt) {
      this.prompt.style.display = 'flex';
      this.prompt.innerHTML = `<span class="key">${s.prompt.key}</span>${s.prompt.text}`;
    } else this.prompt.style.display = 'none';
    if (s.vehicle) {
      const v = s.vehicle;
      this.speedo.style.display = 'block';
      const fuelPct = Math.round((v.fuel / v.fuelMax) * 100);
      this.speedo.innerHTML = `<div class="gear">${v.gear === 0 ? 'R' : v.gear}</div>
        <div class="kmh">${Math.round(v.kmh)}</div><div class="unit">KM/H • ${v.name.toUpperCase()}</div>
        <div class="rpm bar"><i style="width:${Math.min(100, (v.rpm / 6500) * 100)}%;background:${v.rpm > 5600 ? 'var(--red)' : 'var(--saffron)'}"></i></div>
        <div class="meta"><span>⛽ ${fuelPct}%</span><span>🔧 ${Math.round(100 - v.damage)}%</span><span>${v.lights ? '💡 ON' : '💡 OFF'}</span></div>
        <div class="bar" style="margin-top:6px"><i style="width:${fuelPct}%;background:${fuelPct < 15 ? 'var(--red)' : 'var(--green)'}"></i></div>`;
    } else this.speedo.style.display = 'none';
    if (this.subTimer > 0) { this.subTimer -= dt; if (this.subTimer <= 0) this.subtitle.style.display = 'none'; }
    this.drawMinimap(s);
  }

  private drawMinimap(s: HudState) {
    const g = this.miniCanvas.getContext('2d')!;
    const W = this.miniCanvas.width;
    const viewMetres = 170;
    const k = W / (viewMetres * MAP_SCALE);
    const { u, v } = worldToMap(s.px, s.pz);
    g.save();
    g.fillStyle = '#1a1d21';
    g.fillRect(0, 0, W, W);
    g.translate(W / 2, W / 2);
    // rotate so the camera's forward points up
    g.rotate(Math.PI + s.camYaw);
    g.scale(k, k);
    g.translate(-u, -v);
    g.drawImage(this.mapImg, 0, 0);
    // POIs
    g.font = `${26 / k}px sans-serif`;
    g.textAlign = 'center';
    g.textBaseline = 'middle';
    for (const p of POIS) {
      const m = worldToMap(p.x, p.z);
      if (Math.abs(m.u - u) > viewMetres * MAP_SCALE || Math.abs(m.v - v) > viewMetres * MAP_SCALE) continue;
      g.save(); g.translate(m.u, m.v); g.rotate(-(Math.PI + s.camYaw)); g.fillText(p.icon, 0, 0); g.restore();
    }
    g.restore();
    // objective marker (clamped to edge)
    if (s.target) {
      const dx = s.target.x - s.px, dz = s.target.z - s.pz;
      const a = Math.PI + s.camYaw;
      const rx = dx * Math.cos(a) - dz * Math.sin(a), rz = dx * Math.sin(a) + dz * Math.cos(a);
      let mx = rx * MAP_SCALE * k, my = rz * MAP_SCALE * k;
      const r = Math.hypot(mx, my), max = W / 2 - 16;
      if (r > max) { mx *= max / r; my *= max / r; }
      g.fillStyle = '#ffb35c';
      g.strokeStyle = '#1a1206';
      g.lineWidth = 3;
      g.beginPath(); g.arc(W / 2 + mx, W / 2 + my, 11, 0, Math.PI * 2); g.fill(); g.stroke();
    }
    // player arrow
    g.save();
    g.translate(W / 2, W / 2);
    g.rotate(-(s.heading - s.camYaw));
    g.fillStyle = '#ffffff';
    g.strokeStyle = '#ff9933';
    g.lineWidth = 3;
    g.beginPath(); g.moveTo(0, -16); g.lineTo(11, 12); g.lineTo(0, 6); g.lineTo(-11, 12); g.closePath(); g.fill(); g.stroke();
    g.restore();
  }
}
