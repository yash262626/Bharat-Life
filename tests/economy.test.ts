import { describe, it, expect } from 'vitest';
import { formatINR, formatINRShort, groupIndian, rupees } from '../src/economy/money';
import { Wallet } from '../src/economy/Wallet';
import { railFare } from '../src/config/economy';

describe('Indian rupee formatting', () => {
  it('groups digits the Indian way (lakh / crore)', () => {
    expect(groupIndian('999')).toBe('999');
    expect(groupIndian('1000')).toBe('1,000');
    expect(groupIndian('100000')).toBe('1,00,000');
    expect(groupIndian('10000000')).toBe('1,00,00,000');
    expect(groupIndian('123456789')).toBe('12,34,56,789');
  });
  it('formats paise as INR', () => {
    expect(formatINR(rupees(100000))).toBe('₹1,00,000');
    expect(formatINR(rupees(1e7))).toBe('₹1,00,00,000');
    expect(formatINR(rupees(104.5))).toBe('₹104.50');
    expect(formatINR(rupees(-20))).toBe('-₹20');
    expect(formatINR(rupees(20), { sign: true })).toBe('+₹20');
    expect(formatINRShort(rupees(485000))).toBe('₹4.85 lakh');
    expect(formatINRShort(rupees(32000000))).toBe('₹3.2 crore');
  });
  it('rail fares are cheap and first class costs more', () => {
    expect(railFare(1, false)).toBe(rupees(5));
    expect(railFare(3, false)).toBe(rupees(10));
    expect(railFare(3, true)).toBeGreaterThan(railFare(3, false));
  });
});

describe('Wallet accounting', () => {
  it('deducts exact amounts and records the ledger', () => {
    const w = new Wallet(rupees(500), rupees(1000));
    expect(w.spend(rupees(12), 'food', 'Cutting chai')).toBe(true);
    expect(w.cash).toBe(rupees(488));
    expect(w.ledger[0]).toMatchObject({ amount: -rupees(12), account: 'cash', category: 'food', balanceAfter: rupees(488) });
  });
  it('pays large amounts by bank (UPI) and refuses unaffordable purchases without side effects', () => {
    const w = new Wallet(rupees(100), rupees(5000));
    expect(w.spend(rupees(1299), 'shopping', 'Jeans')).toBe(true);
    expect(w.bank).toBe(rupees(3701));
    expect(w.cash).toBe(rupees(100));
    const before = w.ledger.length;
    expect(w.spend(rupees(999999), 'vehicle', 'Car')).toBe(false);
    expect(w.ledger.length).toBe(before);
    expect(w.total).toBe(rupees(3801));
  });
  it('ATM transfers conserve money', () => {
    const w = new Wallet(rupees(0), rupees(2000));
    expect(w.transfer(rupees(500), 'bank')).toBe(true);
    expect(w.cash + w.bank).toBe(rupees(2000));
    expect(w.transfer(rupees(5000), 'bank')).toBe(false);
  });
  it('rejects invalid amounts', () => {
    const w = new Wallet(0, 0);
    expect(() => w.earn(-5, 'gig', 'x')).toThrow();
    expect(() => w.spend(1.5, 'food', 'x')).toThrow();
  });
  it('loans add bank balance and EMIs repay', () => {
    const w = new Wallet(0, 0);
    w.takeLoan(rupees(10000));
    expect(w.bank).toBe(rupees(10000));
    expect(w.repayLoan(rupees(4000))).toBe(true);
    expect(w.loan).toBe(rupees(6000));
    expect(w.bank).toBe(rupees(6000));
  });
  it('serialises and restores', () => {
    const w = new Wallet(rupees(1), rupees(2));
    w.earn(rupees(50), 'gig', 'Delivery');
    const w2 = new Wallet();
    w2.load(w.serialize());
    expect(w2.bank).toBe(w.bank);
    expect(w2.ledger).toEqual(w.ledger);
  });
});
