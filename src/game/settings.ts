// Persistent user settings (separate from save games).
export interface Settings {
  quality: 'low' | 'medium' | 'high' | 'ultra';
  sensitivity: number;
  invertY: boolean;
  volume: number;
  timeScale: number; // in-game minutes per real second
  language: 'en' | 'hi';
  voices: boolean;
}

const KEY = 'bharatlife.settings.v1';
export const DEFAULT_SETTINGS: Settings = { quality: 'high', sensitivity: 1, invertY: false, volume: 0.8, timeScale: 1, language: 'en', voices: true };

export function loadSettings(): Settings {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return { ...DEFAULT_SETTINGS, quality: guessQuality() };
    const s = JSON.parse(raw);
    return { ...DEFAULT_SETTINGS, ...s };
  } catch {
    return { ...DEFAULT_SETTINGS };
  }
}

export function saveSettings(s: Settings) {
  try { localStorage.setItem(KEY, JSON.stringify(s)); } catch { /* storage unavailable */ }
}

/** Pick a starting preset from the reported GPU (user can change it in Settings). */
export function guessQuality(): Settings['quality'] {
  try {
    const c = document.createElement('canvas');
    const gl = c.getContext('webgl2');
    const ext = gl?.getExtension('WEBGL_debug_renderer_info');
    const name = ext ? String(gl!.getParameter(ext.UNMASKED_RENDERER_WEBGL)) : '';
    if (/swiftshader|llvmpipe|software/i.test(name)) return 'low';
    if (/RTX\s*(40|30[6-9]0|20[7-8]0)|RX\s*(6[7-9]|7[7-9])/i.test(name)) return 'ultra';
    if (/RTX|GTX\s*16|RX\s*6|Arc/i.test(name)) return 'high';
    if (/Intel|UHD|Iris|Radeon\(TM\) Graphics/i.test(name)) return 'medium';
    return 'high';
  } catch {
    return 'medium';
  }
}
