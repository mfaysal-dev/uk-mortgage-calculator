import { test } from 'node:test';
import assert from 'node:assert/strict';
import { monthlyPayment, interestOnlyPayment, amortise, overpaymentSavings, ltv, ltvBand, affordability } from '../public/mortgage.js';

const close = (a, b, eps = 0.01) => assert.ok(Math.abs(a - b) <= eps, `${a} ≈ ${b}`);

test('known repayment figures', () => {
  close(monthlyPayment(200000, 5, 25), 1169.18);
  close(monthlyPayment(150000, 4, 25), 791.76);
  close(monthlyPayment(250000, 4.5, 30), 1266.71);
  close(monthlyPayment(100000, 6, 20), 716.43);
});

test('zero rate and empty inputs', () => {
  assert.equal(monthlyPayment(120000, 0, 10), 1000);
  assert.equal(monthlyPayment(0, 5, 25), 0);
  assert.equal(monthlyPayment(100000, 5, 0), 0);
});

test('interest-only payment', () => {
  close(interestOnlyPayment(200000, 4.5), 750);
  const s = amortise({ principal: 200000, rate: 4.5, years: 25, type: 'interest-only' });
  close(s.totalInterest, 750 * 300, 0.5);
  close(s.totalPaid, 200000 + 750 * 300, 0.5);
});

test('amortisation pays off exactly and totals reconcile', () => {
  const s = amortise({ principal: 200000, rate: 5, years: 25 });
  assert.equal(s.months, 300);
  close(s.endBalance, 0);
  close(s.totalPaid, 1169.18 * 300, 3);
  close(s.totalPaid - s.totalInterest, 200000, 0.5);
  assert.equal(s.years.length, 25);
  close(s.years.reduce((a, y) => a + y.capital, 0), 200000, 0.5);
  // first month interest = 200000 * 5% / 12
  close(s.balances[0] - s.balances[1], 1169.18 - 833.33, 0.02);
});

test('overpayments shorten the term and save interest', () => {
  const o = overpaymentSavings({ principal: 200000, rate: 5, years: 25, overpayment: 200 });
  assert.ok(o.withOver.months < 300);
  assert.ok(o.monthsSaved >= 60 && o.monthsSaved <= 80, `monthsSaved=${o.monthsSaved}`);
  assert.ok(o.interestSaved > 30000 && o.interestSaved < 45000, `saved=${o.interestSaved}`);
  close(o.withOver.totalPaid - o.withOver.totalInterest, 200000, 0.5);
});

test('lump sum reduces interest', () => {
  const o = overpaymentSavings({ principal: 200000, rate: 5, years: 25, lumpSum: 20000 });
  assert.ok(o.interestSaved > 0);
  close(o.withOver.totalPaid - o.withOver.totalInterest, 200000, 0.5);
});

test('LTV and bands', () => {
  close(ltv(270000, 300000), 0.9, 1e-9);
  assert.equal(ltvBand(0.9), '90% LTV');
  assert.equal(ltvBand(0.9001), '95% LTV');
  assert.equal(ltvBand(0.5), '60% LTV');
  assert.equal(ltvBand(0.97), 'Over 95% LTV');
});

test('affordability by income multiple', () => {
  const a = affordability({ income1: 40000, income2: 30000, multiple: 4.5, deposit: 25000 });
  assert.equal(a.income, 70000);
  assert.equal(a.maxLoan, 315000);
  assert.equal(a.maxPrice, 340000);
});
