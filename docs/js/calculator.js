import { calculateLoan, LIMITS, FEES, RATE_TIERS, rateForTerm } from "./loan.js";
import { nok, pct } from "./common.js";

// Renders the loan calculator (Bootstrap markup) into `root`. Calls onChange(result)
// whenever amount or period changes. Returns { get: () => current result }.
export function mountCalculator(root, { amount = 150000, months = 36, onChange } = {}) {
  root.innerHTML = `
    <div class="row g-4">
      <div class="col-lg-7">
        <div class="mb-4">
          <div class="d-flex justify-content-between align-items-center mb-2">
            <label for="amount" class="form-label fw-semibold mb-0">Loan amount (NOK)</label>
            <input type="number" class="form-control text-end" style="max-width:150px" id="amountNum" step="1000">
          </div>
          <input type="range" class="form-range" id="amount" min="${LIMITS.minAmount}" max="${LIMITS.maxAmount}" step="5000">
          <div class="d-flex justify-content-between small text-body-secondary"><span>${nok(LIMITS.minAmount)}</span><span>${nok(LIMITS.maxAmount)}</span></div>
        </div>
        <div class="mb-4">
          <div class="d-flex justify-content-between align-items-center mb-2">
            <label for="months" class="form-label fw-semibold mb-0">Repayment period</label>
            <div class="input-group" style="max-width:170px">
              <input type="number" class="form-control text-end" id="monthsNum">
              <span class="input-group-text">months</span>
            </div>
          </div>
          <input type="range" class="form-range" id="months" min="${LIMITS.minMonths}" max="${LIMITS.maxMonths}" step="1">
          <div class="d-flex justify-content-between small text-body-secondary"><span>${LIMITS.minMonths} months</span><span>${LIMITS.maxMonths / 12} years</span></div>
        </div>
        <div class="row row-cols-2 row-cols-sm-4 g-2 mb-3" id="tiers">
          ${RATE_TIERS.map((t) => `
            <div class="col"><div class="border rounded p-2 small tier" data-rate="${t.rate}">
              <div class="text-body-secondary">${t.label}</div><div class="fw-bold">${pct(t.rate)}</div>
            </div></div>`).join("")}
        </div>
        <p class="small text-body-secondary mb-0">Establishment fee ${nok(FEES.establishment)} · monthly fee ${nok(FEES.monthly)}. The longer the period, the higher the interest rate.</p>
      </div>
      <div class="col-lg-5">
        <div class="card text-bg-success h-100">
          <div class="card-body">
            <div class="opacity-75">Monthly payment</div>
            <div class="display-6 fw-bold mb-3" id="rMonthly"></div>
            <ul class="list-group list-group-flush mb-3">
              <li class="list-group-item d-flex justify-content-between">Nominal rate <span id="rNominal"></span></li>
              <li class="list-group-item d-flex justify-content-between">Effective rate <span id="rEffective"></span></li>
              <li class="list-group-item d-flex justify-content-between">Total interest <span id="rInterest"></span></li>
              <li class="list-group-item d-flex justify-content-between">Total fees <span id="rFees"></span></li>
              <li class="list-group-item d-flex justify-content-between fw-bold">Cost of the loan <span id="rCost"></span></li>
              <li class="list-group-item d-flex justify-content-between">Total to repay <span id="rTotal"></span></li>
            </ul>
            <button type="button" class="btn btn-outline-light btn-sm" id="toggleSchedule">Show repayment plan</button>
          </div>
        </div>
      </div>
    </div>
    <div class="mt-4" id="schedule" hidden></div>`;

  const $ = (id) => root.querySelector("#" + id);
  const state = { amount, months, result: null };
  const clamp = (v, min, max) => Math.min(max, Math.max(min, v));

  function update(source) {
    if (source !== "num") { $("amountNum").value = state.amount; $("monthsNum").value = state.months; }
    if (source !== "range") { $("amount").value = state.amount; $("months").value = state.months; }
    const r = calculateLoan(state.amount, state.months);
    state.result = r;
    $("rMonthly").textContent = nok(r.monthlyPayment);
    $("rNominal").textContent = pct(r.nominalRate);
    $("rEffective").textContent = pct(r.effectiveRate);
    $("rInterest").textContent = nok(r.totalInterest);
    $("rFees").textContent = nok(r.totalFees);
    $("rCost").textContent = nok(r.totalCost);
    $("rTotal").textContent = nok(r.totalRepayment);
    const rate = rateForTerm(state.months);
    root.querySelectorAll(".tier").forEach((t) => {
      const on = +t.dataset.rate === rate;
      t.classList.toggle("border-success", on);
      t.classList.toggle("bg-success-subtle", on);
    });
    if (!$("schedule").hidden) renderSchedule();
    onChange?.(r);
  }

  function renderSchedule() {
    const rows = state.result.schedule
      .map((s) => `<tr><td>${s.month}</td><td class="text-end">${nok(s.payment, 2)}</td><td class="text-end">${nok(s.principal, 2)}</td><td class="text-end">${nok(s.interest, 2)}</td><td class="text-end">${nok(s.fee)}</td><td class="text-end">${nok(s.balance, 2)}</td></tr>`)
      .join("");
    $("schedule").innerHTML = `
      <div class="table-responsive border rounded" style="max-height:480px">
        <table class="table table-sm table-striped mb-0">
          <thead class="table-light sticky-top"><tr><th>Month</th><th class="text-end">Payment</th><th class="text-end">Principal</th><th class="text-end">Interest</th><th class="text-end">Fee</th><th class="text-end">Remaining</th></tr></thead>
          <tbody>${rows}</tbody>
        </table>
      </div>`;
  }

  $("amount").addEventListener("input", (e) => { state.amount = +e.target.value; update("range"); });
  $("months").addEventListener("input", (e) => { state.months = +e.target.value; update("range"); });
  $("amountNum").addEventListener("change", (e) => { state.amount = clamp(Math.round(+e.target.value || 0), LIMITS.minAmount, LIMITS.maxAmount); update(); });
  $("monthsNum").addEventListener("change", (e) => { state.months = clamp(Math.round(+e.target.value || 0), LIMITS.minMonths, LIMITS.maxMonths); update(); });
  $("toggleSchedule").addEventListener("click", () => {
    const s = $("schedule");
    s.hidden = !s.hidden;
    $("toggleSchedule").textContent = s.hidden ? "Show repayment plan" : "Hide repayment plan";
    if (!s.hidden) renderSchedule();
  });

  update();
  return { get: () => state.result };
}
