// Generic modal window used by shops, ATM, showroom, garage, phone dialogs.
import { el } from './HUD';

export interface ModalButton { label: string; ghost?: boolean; disabled?: boolean; onClick: () => void }

export class Modal {
  private wrap = el('div', 'modal-wrap');
  private box = el('div', 'modal panel');
  onClose: () => void = () => {};
  open = false;

  constructor(container: HTMLElement) {
    this.wrap.append(this.box);
    container.append(this.wrap);
    this.wrap.addEventListener('mousedown', (e) => { if (e.target === this.wrap) this.close(); });
    window.addEventListener('keydown', (e) => { if (this.open && (e.code === 'Escape' || e.code === 'Backspace')) { e.stopPropagation(); this.close(); } }, true);
  }

  show(title: string, sub: string, body: HTMLElement | string, buttons: ModalButton[] = [], quote?: string) {
    this.box.innerHTML = '';
    this.box.append(el('h2', '', title));
    if (sub) this.box.append(el('div', 'hi', sub));
    if (quote) this.box.append(el('div', 'quote', `“${quote}”`));
    if (typeof body === 'string') this.box.append(el('div', '', body));
    else this.box.append(body);
    const actions = el('div', 'row-actions');
    for (const b of [...buttons, { label: 'Close (Esc)', ghost: true, onClick: () => this.close() }]) {
      const btn = el('button', `btn ${b.ghost ? 'ghost' : ''}`, b.label);
      btn.disabled = !!b.disabled;
      btn.onclick = () => b.onClick();
      actions.append(btn);
    }
    this.box.append(actions);
    this.wrap.style.display = 'grid';
    this.open = true;
    document.exitPointerLock?.();
  }

  close() {
    if (!this.open) return;
    this.wrap.style.display = 'none';
    this.open = false;
    this.onClose();
  }
}
