// Player finances: cash in hand, bank account, and an auditable transaction ledger.
// Pure logic, no rendering dependencies. Invariant: cash and bank are never negative
// (loans are tracked separately as liabilities).

import { Paise } from './money';

export type TxCategory =
  | 'food' | 'transport' | 'fuel' | 'rent' | 'salary' | 'gig' | 'shopping' | 'vehicle'
  | 'property' | 'repair' | 'transfer' | 'fine' | 'reward' | 'loan' | 'utilities' | 'business' | 'other';

export interface Transaction {
  id: number;
  day: number;
  minute: number;
  amount: Paise; // positive = income, negative = expense
  account: 'cash' | 'bank';
  category: TxCategory;
  label: string;
  balanceAfter: Paise;
}

export interface WalletState {
  cash: Paise;
  bank: Paise;
  loan: Paise;
  nextTxId: number;
  ledger: Transaction[];
}

export type PayMethod = 'cash' | 'bank' | 'auto';

const LEDGER_LIMIT = 200;

export class Wallet {
  cash: Paise;
  bank: Paise;
  loan: Paise;
  ledger: Transaction[] = [];
  private nextTxId = 1;
  /** Provides current in-game day/minute for ledger stamps. */
  clock: () => { day: number; minute: number } = () => ({ day: 1, minute: 0 });
  onChange: (w: Wallet) => void = () => {};

  constructor(cash: Paise = 0, bank: Paise = 0) {
    assertMoney(cash);
    assertMoney(bank);
    this.cash = cash;
    this.bank = bank;
    this.loan = 0;
  }

  get total() { return this.cash + this.bank; }

  canAfford(amount: Paise, method: PayMethod = 'auto') {
    if (method === 'cash') return this.cash >= amount;
    if (method === 'bank') return this.bank >= amount;
    return this.cash >= amount || this.bank >= amount;
  }

  /** Deduct an expense. 'auto' prefers cash for small amounts, bank (UPI) otherwise. Returns false if unaffordable. */
  spend(amount: Paise, category: TxCategory, label: string, method: PayMethod = 'auto'): boolean {
    assertMoney(amount);
    if (amount === 0) return true;
    let account: 'cash' | 'bank';
    if (method === 'auto') {
      if (this.cash >= amount && amount <= 200_00) account = 'cash';
      else if (this.bank >= amount) account = 'bank';
      else if (this.cash >= amount) account = 'cash';
      else return false;
    } else {
      account = method;
      if (this[account] < amount) return false;
    }
    this[account] -= amount;
    this.record(-amount, account, category, label);
    return true;
  }

  earn(amount: Paise, category: TxCategory, label: string, account: 'cash' | 'bank' = 'bank') {
    assertMoney(amount);
    if (amount === 0) return;
    this[account] += amount;
    this.record(amount, account, category, label);
  }

  /** Move money between cash and bank (ATM withdrawal / deposit). */
  transfer(amount: Paise, from: 'cash' | 'bank'): boolean {
    assertMoney(amount);
    const to = from === 'cash' ? 'bank' : 'cash';
    if (this[from] < amount || amount === 0) return false;
    this[from] -= amount;
    this.record(-amount, from, 'transfer', from === 'bank' ? 'ATM withdrawal' : 'Cash deposit');
    this[to] += amount;
    this.record(amount, to, 'transfer', from === 'bank' ? 'ATM withdrawal' : 'Cash deposit');
    return true;
  }

  takeLoan(amount: Paise, label = 'Personal loan disbursed') {
    assertMoney(amount);
    this.loan += amount;
    this.bank += amount;
    this.record(amount, 'bank', 'loan', label);
  }

  repayLoan(amount: Paise): boolean {
    assertMoney(amount);
    const pay = Math.min(amount, this.loan);
    if (pay === 0 || this.bank < pay) return false;
    this.bank -= pay;
    this.loan -= pay;
    this.record(-pay, 'bank', 'loan', 'Loan EMI repayment');
    return true;
  }

  private record(amount: Paise, account: 'cash' | 'bank', category: TxCategory, label: string) {
    const { day, minute } = this.clock();
    this.ledger.unshift({
      id: this.nextTxId++, day, minute: Math.floor(minute), amount, account, category, label,
      balanceAfter: this[account],
    });
    if (this.ledger.length > LEDGER_LIMIT) this.ledger.length = LEDGER_LIMIT;
    this.onChange(this);
  }

  /** Sum of income/expense by category over a day window (for the banking app). */
  summary(sinceDay: number) {
    let income = 0, expense = 0;
    const byCat: Partial<Record<TxCategory, number>> = {};
    for (const t of this.ledger) {
      if (t.day < sinceDay || t.category === 'transfer') continue;
      if (t.amount > 0) income += t.amount; else expense -= t.amount;
      byCat[t.category] = (byCat[t.category] ?? 0) + t.amount;
    }
    return { income, expense, byCat };
  }

  serialize(): WalletState {
    return { cash: this.cash, bank: this.bank, loan: this.loan, nextTxId: this.nextTxId, ledger: this.ledger.slice(0, LEDGER_LIMIT) };
  }

  load(s: WalletState) {
    this.cash = s.cash;
    this.bank = s.bank;
    this.loan = s.loan;
    this.nextTxId = s.nextTxId;
    this.ledger = s.ledger.slice();
    this.onChange(this);
  }
}

function assertMoney(v: number) {
  if (!Number.isInteger(v) || v < 0) throw new Error(`Invalid money amount: ${v}`);
}
