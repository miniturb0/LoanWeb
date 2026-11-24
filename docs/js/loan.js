// Shared loan maths. Used by the browser (calculator) and by the server
// (which re-calculates every application so nobody can tamper with the numbers).

export const LIMITS = {
  minAmount: 10000,
  maxAmount: 500000,
  minMonths: 6,
  maxMonths: 120,
};

// One-time establishment fee and a monthly account fee (NOK).
export const FEES = {
  establishment: 950,
  monthly: 45,
};

// Longer repayment period = higher nominal interest rate (% per year).
export const RATE_TIERS = [
  { maxMonths: 12, rate: 7.9, label: "6–12 months" },
  { maxMonths: 36, rate: 9.9, label: "13–36 months" },
  { maxMonths: 60, rate: 11.9, label: "37–60 months" },
  { maxMonths: 120, rate: 13.9, label: "61–120 months" },
];

export function rateForTerm(months) {
  const tier = RATE_TIERS.find((t) => months <= t.maxMonths);
  return (tier || RATE_TIERS[RATE_TIERS.length - 1]).rate;
}

export function validateLoan(amount, months) {
  if (!Number.isFinite(amount) || !Number.isFinite(months)) return "Amount and period must be numbers.";
  if (!Number.isInteger(months)) return "Period must be a whole number of months.";
  if (amount < LIMITS.minAmount || amount > LIMITS.maxAmount)
    return `Amount must be between ${LIMITS.minAmount} and ${LIMITS.maxAmount} NOK.`;
  if (months < LIMITS.minMonths || months > LIMITS.maxMonths)
    return `Period must be between ${LIMITS.minMonths} and ${LIMITS.maxMonths} months.`;
  return null;
}

const round2 = (n) => Math.round(n * 100) / 100;

// Annuity loan: same monthly instalment every month.
export function calculateLoan(amount, months) {
  const error = validateLoan(amount, months);
  if (error) throw new Error(error);

  const nominalRate = rateForTerm(months);
  const r = nominalRate / 100 / 12;
  const installment = r === 0 ? amount / months : (amount * r) / (1 - Math.pow(1 + r, -months));

  const schedule = [];
  let balance = amount;
  let totalInterest = 0;
  for (let m = 1; m <= months; m++) {
    const interest = balance * r;
    let principal = installment - interest;
    if (m === months) principal = balance; // clear rounding leftovers
    balance -= principal;
    totalInterest += interest;
    schedule.push({
      month: m,
      payment: round2(principal + interest + FEES.monthly),
      principal: round2(principal),
      interest: round2(interest),
      fee: FEES.monthly,
      balance: round2(Math.max(balance, 0)),
    });
  }

  const totalFees = FEES.establishment + FEES.monthly * months;
  const totalCost = totalInterest + totalFees; // what the loan costs you
  const monthlyPayment = installment + FEES.monthly;

  return {
    amount,
    months,
    nominalRate,
    effectiveRate: round2(effectiveRate(amount, monthlyPayment, months) * 100),
    installment: round2(installment),
    monthlyPayment: round2(monthlyPayment),
    totalInterest: round2(totalInterest),
    totalFees: round2(totalFees),
    totalCost: round2(totalCost),
    totalRepayment: round2(amount + totalCost),
    schedule,
  };
}

// Effective annual rate incl. fees: find the monthly rate where the money
// you actually receive equals the present value of all your payments.
function effectiveRate(amount, monthlyPayment, months) {
  const received = amount - FEES.establishment;
  const pv = (i) => (i === 0 ? monthlyPayment * months : (monthlyPayment * (1 - Math.pow(1 + i, -months))) / i);
  let lo = 0, hi = 1;
  for (let k = 0; k < 100; k++) {
    const mid = (lo + hi) / 2;
    if (pv(mid) > received) lo = mid; else hi = mid;
  }
  return Math.pow(1 + (lo + hi) / 2, 12) - 1;
}
