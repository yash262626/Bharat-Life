// In-game smartphone: Bank (PaisaPay), Maps, DabbaDash gigs, Ghar Dekho property, Garage/vehicles,
// Missions, Messages. Fictional services inspired by everyday Indian apps (no real branding).
import { el } from './HUD';
import { formatINR } from '../economy/money';
import { Wallet } from '../economy/Wallet';

export interface PhoneApp { id: string; name: string; icon: string; color: string; render: (screen: HTMLElement, phone: Phone) => void }

export class Phone {
  root = el('div', 'phone');
  private screen = el('div', 'screen');
  private status = el('div', 'status');
  apps: PhoneApp[] = [];
  open = false;
  messages: { from: string; text: string; time: string }[] = [];
  onToggle: (open: boolean) => void = () => {};

  constructor(container: HTMLElement, private clock: () => string) {
    this.root.append(this.status, this.screen);
    container.append(this.root);
  }

  toggle(force?: boolean) {
    this.open = force ?? !this.open;
    this.root.classList.toggle('open', this.open);
    if (this.open) { this.home(); document.exitPointerLock?.(); }
    this.onToggle(this.open);
  }

  home() {
    this.status.innerHTML = `<span>${this.clock()}</span><span>Jio-ish 4G ▮▮▮▯ 82%</span>`;
    this.screen.innerHTML = '';
    this.screen.append(el('div', '', `<div style="font-size:42px;font-weight:200;margin-top:18px;text-align:center">${this.clock()}</div><div style="text-align:center;color:var(--muted);font-size:12px">Sagar Nagar, Mumbai</div>`));
    const grid = el('div', 'apps');
    for (const a of this.apps) {
      const b = el('button', 'app', `<div class="ic" style="background:${a.color}">${a.icon}</div>${a.name}`);
      b.onclick = () => this.openApp(a);
      grid.append(b);
    }
    this.screen.append(grid);
  }

  openApp(a: PhoneApp) {
    this.screen.innerHTML = '';
    const back = el('button', 'back', '‹ Home');
    back.onclick = () => this.home();
    this.screen.append(back, el('h3', '', `${a.icon} ${a.name}`));
    const body = el('div');
    this.screen.append(body);
    a.render(body, this);
  }

  pushMessage(from: string, text: string) {
    this.messages.unshift({ from, text, time: this.clock() });
  }
}

/** PaisaPay banking app: balances, monthly summary, transaction history. */
export function bankApp(wallet: Wallet, day: () => number): PhoneApp {
  return {
    id: 'bank', name: 'PaisaPay', icon: '₹', color: '#2e7d32',
    render: (s) => {
      const sum = wallet.summary(Math.max(1, day() - 6));
      s.append(el('div', 'card', `<div style="color:var(--muted);font-size:11px">SAGAR CO-OP BANK • SAVINGS</div><div style="font-size:26px;font-weight:800">${formatINR(wallet.bank)}</div>
        <div style="margin-top:6px">Cash in hand: <b>${formatINR(wallet.cash)}</b>${wallet.loan ? ` • Loan: <b>${formatINR(wallet.loan)}</b>` : ''}</div>`));
      s.append(el('div', 'card', `<b>Last 7 days</b><div class="tx"><span>Income</span><span class="amt pos">+${formatINR(sum.income)}</span></div><div class="tx"><span>Spending</span><span class="amt">-${formatINR(sum.expense)}</span></div>`));
      const list = el('div', 'card');
      list.append(el('b', '', 'Transactions'));
      if (!wallet.ledger.length) list.append(el('div', 'tx', '<span>No transactions yet</span>'));
      for (const t of wallet.ledger.slice(0, 40)) {
        const hh = Math.floor(t.minute / 60), mm = t.minute % 60;
        list.append(el('div', 'tx', `<span>${t.label}<br><small style="color:var(--muted)">Day ${t.day} ${String(hh).padStart(2, '0')}:${String(mm).padStart(2, '0')} • ${t.account.toUpperCase()} • ${t.category}</small></span><span class="amt ${t.amount > 0 ? 'pos' : 'neg'}">${formatINR(t.amount, { sign: true })}</span>`));
      }
      s.append(list);
    },
  };
}

export function messagesApp(phone: Phone): PhoneApp {
  return {
    id: 'messages', name: 'Messages', icon: '💬', color: '#1565c0',
    render: (s) => {
      if (!phone.messages.length) s.append(el('div', 'card', 'No messages.'));
      for (const m of phone.messages) s.append(el('div', 'card', `<b>${m.from}</b> <span style="color:var(--muted);font-size:11px">${m.time}</span><div>${m.text}</div>`));
    },
  };
}
