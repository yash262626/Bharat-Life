// Main menu, pause menu, settings and character creator.
import { el } from './HUD';
import { Settings, saveSettings } from '../game/settings';
import { Appearance } from '../npc/HumanRenderer';
import * as THREE from 'three';

export interface MenuCallbacks {
  newGame(): void;
  continueGame(): void;
  hasSave(): boolean;
  resume(): void;
  save(slot: string): void;
  load(slot: string): void;
  slots(): { slot: string; label: string; empty: boolean }[];
  applySettings(s: Settings): void;
  quitToMenu(): void;
}

export class Menus {
  private main = el('div', 'menu');
  private pauseWrap = el('div', 'modal-wrap pause');
  constructor(ui: HTMLElement, private settings: Settings, private cb: MenuCallbacks) {
    ui.append(this.main, this.pauseWrap);
  }

  showMain() {
    this.main.style.display = 'grid';
    this.main.innerHTML = '';
    const side = el('div', 'side');
    side.append(el('div', 'logo', 'BHARAT<br><span>LIFE</span>'), el('div', 'logo-sub', 'SAGAR NAGAR • MUMBAI • VERTICAL SLICE'));
    const btn = (title: string, sub: string, fn: () => void, enabled = true) => {
      const b = el('button', 'menu-btn', `${title}<small>${sub}</small>`);
      if (!enabled) { b.style.opacity = '0.4'; b.style.pointerEvents = 'none'; }
      b.onclick = fn;
      side.append(b);
    };
    btn('Continue', 'Resume your latest save', () => { this.hideMain(); this.cb.continueGame(); }, this.cb.hasSave());
    btn('New Game', 'Arrive in Mumbai with one bag and big dreams', () => { this.hideMain(); this.cb.newGame(); });
    btn('Load Game', 'Choose a save slot', () => this.showSlots('load'));
    btn('Settings', 'Graphics, controls, audio, time', () => this.showSettings(() => this.showMain()));
    side.append(el('div', 'foot', `WASD move • Shift sprint • Space jump/handbrake • E interact • F enter/exit vehicle<br>
      H horn • L lights • V camera • Tab phone • M map • Esc pause<br>
      Browser prototype — stylised visuals. See docs/UE5_PLAN.md for the high-fidelity PC plan.`));
    this.main.append(side, el('div'));
  }

  hideMain() { this.main.style.display = 'none'; }

  get pauseOpen() { return this.pauseWrap.style.display === 'grid'; }

  showPause() {
    this.pauseWrap.style.display = 'grid';
    this.pauseWrap.innerHTML = '';
    const p = el('div', 'panel');
    p.append(el('h2', '', 'Paused'));
    const add = (label: string, fn: () => void, ghost = false) => { const b = el('button', `btn ${ghost ? 'ghost' : ''}`, label); b.onclick = fn; p.append(b); };
    add('Resume', () => this.hidePause());
    add('Save game', () => this.showSlots('save'), true);
    add('Load game', () => this.showSlots('load'), true);
    add('Settings', () => this.showSettings(() => this.showPause()), true);
    add('Quit to main menu', () => { this.hidePause(); this.cb.quitToMenu(); }, true);
    this.pauseWrap.append(p);
  }

  hidePause() {
    this.pauseWrap.style.display = 'none';
    this.cb.resume();
  }

  private showSlots(mode: 'save' | 'load') {
    this.pauseWrap.style.display = 'grid';
    this.pauseWrap.innerHTML = '';
    const p = el('div', 'panel');
    p.append(el('h2', '', mode === 'save' ? 'Save game' : 'Load game'));
    for (const s of this.cb.slots()) {
      if (mode === 'save' && s.slot === 'auto') continue;
      const b = el('button', `btn ${s.empty ? 'ghost' : ''}`, `${s.slot.toUpperCase()} — ${s.label}`);
      b.disabled = mode === 'load' && s.empty;
      b.onclick = () => {
        if (mode === 'save') { this.cb.save(s.slot); this.showSlots('save'); }
        else { this.pauseWrap.style.display = 'none'; this.hideMain(); this.cb.load(s.slot); }
      };
      p.append(b);
    }
    const back = el('button', 'btn ghost', 'Back');
    back.onclick = () => (this.main.style.display === 'grid' ? (this.pauseWrap.style.display = 'none') : this.showPause());
    p.append(back);
    this.pauseWrap.append(p);
  }

  showSettings(back: () => void) {
    this.pauseWrap.style.display = 'grid';
    this.pauseWrap.innerHTML = '';
    const s = this.settings;
    const p = el('div', 'panel');
    p.style.width = '460px';
    p.append(el('h2', '', 'Settings'));
    const grid = el('div', 'settings-grid');
    const select = (label: string, value: string, opts: [string, string][], on: (v: string) => void) => {
      grid.append(el('label', '', label));
      const sel = el('select');
      for (const [v, t] of opts) { const o = el('option', '', t); o.value = v; if (v === value) o.selected = true; sel.append(o); }
      sel.onchange = () => on(sel.value);
      grid.append(sel);
    };
    const range = (label: string, value: number, min: number, max: number, step: number, on: (v: number) => void) => {
      grid.append(el('label', '', label));
      const r = el('input');
      r.type = 'range'; r.min = String(min); r.max = String(max); r.step = String(step); r.value = String(value);
      r.oninput = () => on(Number(r.value));
      grid.append(r);
    };
    select('Graphics quality', s.quality, [['low', 'Low (integrated GPUs)'], ['medium', 'Medium'], ['high', 'High (GTX 1650 / RTX 3050)'], ['ultra', 'Ultra (RTX 3060+)']], (v) => (s.quality = v as Settings['quality']));
    range('Mouse sensitivity', s.sensitivity, 0.3, 2.5, 0.1, (v) => (s.sensitivity = v));
    select('Invert Y', s.invertY ? '1' : '0', [['0', 'Off'], ['1', 'On']], (v) => (s.invertY = v === '1'));
    range('Master volume', s.volume, 0, 1, 0.05, (v) => (s.volume = v));
    select('Time speed', String(s.timeScale), [['0.5', '48 min per game day'], ['1', '24 min per game day'], ['2', '12 min per game day'], ['6', '4 min per game day (fast)']], (v) => (s.timeScale = Number(v)));
    select('Synthesised voices', s.voices ? '1' : '0', [['1', 'On (station announcements, vendors)'], ['0', 'Off']], (v) => (s.voices = v === '1'));
    p.append(grid);
    const actions = el('div', 'row-actions');
    const apply = el('button', 'btn', 'Apply');
    apply.onclick = () => { saveSettings(s); this.cb.applySettings(s); back(); };
    const cancel = el('button', 'btn ghost', 'Back');
    cancel.onclick = back;
    actions.append(cancel, apply);
    p.append(actions);
    this.pauseWrap.append(p);
  }

  /** Character creator shown on New Game. */
  showCreator(initial: Appearance, onDone: (a: Appearance, name: string) => void, onChange: (a: Appearance) => void) {
    const a: Appearance = { ...initial, skin: initial.skin.clone(), top: initial.top.clone(), bottom: initial.bottom.clone(), hair: initial.hair.clone() };
    this.pauseWrap.style.display = 'grid';
    this.pauseWrap.style.background = 'transparent';
    this.pauseWrap.style.justifyItems = 'start';
    this.pauseWrap.innerHTML = '';
    const p = el('div', 'panel');
    p.style.width = '380px';
    p.style.marginLeft = '40px';
    p.append(el('h2', '', 'Create your character'), el('div', 'hi', 'Stylised placeholder body — see docs/ASSETS.md'));
    const grid = el('div', 'settings-grid');
    const swatches = (label: string, key: 'skin' | 'top' | 'bottom' | 'hair', colors: string[]) => {
      grid.append(el('label', '', label));
      const row = el('div');
      row.style.display = 'flex'; row.style.flexWrap = 'wrap'; row.style.gap = '6px';
      for (const c of colors) {
        const b = el('button');
        Object.assign(b.style, { width: '24px', height: '24px', borderRadius: '50%', border: '2px solid rgba(255,255,255,0.3)', background: c, cursor: 'pointer' });
        b.onclick = () => { a[key] = new THREE.Color(c); onChange(a); };
        row.append(b);
      }
      grid.append(row);
    };
    grid.append(el('label', '', 'Name'));
    const name = el('input');
    name.value = 'Arjun';
    Object.assign(name.style, { background: '#20242a', color: 'var(--text)', border: '1px solid var(--line)', borderRadius: '8px', padding: '6px' });
    grid.append(name);
    grid.append(el('label', '', 'Body'));
    const g = el('select');
    for (const [v, t] of [['m', 'Masculine'], ['f', 'Feminine (sari)']]) { const o = el('option', '', t); o.value = v; g.append(o); }
    g.value = a.female ? 'f' : 'm';
    g.onchange = () => { a.female = g.value === 'f'; if (a.female) a.beard = 0; onChange(a); };
    grid.append(g);
    swatches('Skin tone', 'skin', ['#5e3a1e', '#6b3e1e', '#7a4a2a', '#8d5524', '#a0662f', '#b97a4a', '#c68642', '#d39b6a']);
    swatches('Hair', 'hair', ['#0b0908', '#1c1512', '#3b2a1e', '#6b5a4a', '#9a9792']);
    swatches('Top / kurta', 'top', ['#f2f2ee', '#cfe1f2', '#7b1e2b', '#c9a227', '#556b2f', '#1f3a5f', '#e8a0b4', '#2f6f8f', '#c2185b', '#f57c00']);
    swatches('Trousers / sari', 'bottom', ['#2f3437', '#1f2a44', '#8b7d62', '#151515', '#3b4a6b', '#d32f2f', '#2e7d32', '#6a1b9a', '#fbc02d']);
    grid.append(el('label', '', 'Facial hair'));
    const beard = el('select');
    for (const [v, t] of [['0', 'Clean shaven'], ['1', 'Moustache'], ['2', 'Full beard']]) { const o = el('option', '', t); o.value = v; beard.append(o); }
    beard.value = String(a.beard);
    beard.onchange = () => { a.beard = Number(beard.value) as 0 | 1 | 2; onChange(a); };
    grid.append(beard);
    grid.append(el('label', '', 'Sleeves'));
    const sl = el('select');
    for (const [v, t] of [['0', 'Short'], ['1', 'Full']]) { const o = el('option', '', t); o.value = v; sl.append(o); }
    sl.value = a.longSleeve ? '1' : '0';
    sl.onchange = () => { a.longSleeve = sl.value === '1'; onChange(a); };
    grid.append(sl);
    grid.append(el('label', '', 'Height'));
    const h = el('input');
    h.type = 'range'; h.min = '0.9'; h.max = '1.08'; h.step = '0.01'; h.value = String(a.height);
    h.oninput = () => { a.height = Number(h.value); onChange(a); };
    grid.append(h);
    p.append(grid);
    const go = el('button', 'btn', 'Start in Sagar Nagar →');
    go.style.marginTop = '16px';
    go.onclick = () => { this.pauseWrap.style.display = 'none'; this.pauseWrap.style.background = ''; this.pauseWrap.style.justifyItems = ''; onDone(a, name.value || 'Arjun'); };
    p.append(go);
    this.pauseWrap.append(p);
  }
}
