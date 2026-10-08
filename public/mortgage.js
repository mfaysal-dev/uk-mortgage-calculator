// UK mortgage maths: repayment & interest-only payments, amortisation,
// overpayment savings and income-multiple affordability. Pure functions, no DOM.

/** Standard annuity (capital & interest) monthly payment. */
export function monthlyPayment(principal, annualRatePct, years) {
  const P = Math.max(0, +principal || 0);
  const n = Math.round(Math.max(0, +years || 0) * 12);
  if (P === 0 || n === 0) return 0;
  const r = (+annualRatePct || 0) / 100 / 12;
  if (r === 0) return P / n;
  return (P * r) / (1 - Math.pow(1 + r, -n));
}

/** Interest-only monthly payment. */
export function interestOnlyPayment(principal, annualRatePct) {
  return Math.max(0, +principal || 0) * ((+annualRatePct || 0) / 100 / 12);
}

/**
 * Month-by-month schedule. Overpayments keep the contractual payment the same
 * and shorten the term (how most UK lenders apply regular overpayments).
 * @returns {{months:number,totalInterest:number,totalPaid:number,payment:number,years:Array,balances:number[],endBalance:number}}
 */
export function amortise({ principal, rate, years, type = 'repayment', overpayment = 0, lumpSum = 0 }) {
  const P = Math.max(0, +principal || 0);
  const n = Math.round(Math.max(0, +years || 0) * 12);
  const r = (+rate || 0) / 100 / 12;
  const payment = type === 'interest-only' ? interestOnlyPayment(P, rate) : monthlyPayment(P, rate, years);
  let bal = Math.max(0, P - Math.max(0, +lumpSum || 0));
  const over = Math.max(0, +overpayment || 0);
  let totalInterest = 0, totalPaid = Math.min(P, Math.max(0, +lumpSum || 0)), months = 0;
  const balances = [bal];
  const yearsOut = [];
  let yInt = 0, yCap = 0;
  for (let m = 1; m <= n && bal > 0.005; m++) {
    const interest = bal * r;
    let scheduled = type === 'interest-only' ? interest : payment;
    let capital = scheduled - interest + over;
    if (type === 'interest-only' && m === n) capital = bal; // balloon repayment at the end
    if (capital > bal) capital = bal;
    bal -= capital;
    totalInterest += interest;
    totalPaid += interest + capital;
    yInt += interest; yCap += capital;
    months = m;
    balances.push(Math.max(0, bal));
    if (m % 12 === 0 || bal <= 0.005 || m === n) {
      yearsOut.push({ year: Math.ceil(m / 12), interest: yInt, capital: yCap, balance: Math.max(0, bal) });
      yInt = 0; yCap = 0;
    }
  }
  return { payment, months, totalInterest, totalPaid, years: yearsOut, balances, endBalance: Math.max(0, bal) };
}

/** Compare a baseline mortgage with one that has overpayments. */
export function overpaymentSavings(opts) {
  const base = amortise({ ...opts, overpayment: 0, lumpSum: 0 });
  const withOver = amortise(opts);
  return {
    base, withOver,
    interestSaved: Math.max(0, base.totalInterest - withOver.totalInterest),
    monthsSaved: Math.max(0, base.months - withOver.months),
  };
}

/** Loan-to-value as a fraction. */
export function ltv(loan, price) { return price > 0 ? Math.max(0, loan) / price : 0; }

/** Typical UK LTV pricing tier label. */
export function ltvBand(fraction) {
  const p = fraction * 100;
  for (const b of [60, 75, 80, 85, 90, 95]) if (p <= b + 1e-9) return `${b}% LTV`;
  return 'Over 95% LTV';
}

/** Rough affordability using a lender income multiple (typically 4–4.5x, up to 5.5x for some). */
export function affordability({ income1 = 0, income2 = 0, multiple = 4.5, deposit = 0 }) {
  const income = Math.max(0, +income1 || 0) + Math.max(0, +income2 || 0);
  const maxLoan = income * (+multiple || 0);
  return { income, maxLoan, maxPrice: maxLoan + Math.max(0, +deposit || 0) };
}
