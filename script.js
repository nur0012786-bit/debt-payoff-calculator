const state = {
  nextId: 2,
  debts: [
    { id: 1, name: "Credit Card 1", balance: 5000, apr: 24.99, min: 150 },
    { id: 2, name: "Credit Card 2", balance: 3000, apr: 18.99, min: 100 }
  ]
};

const $ = (id) => document.getElementById(id);
const money = new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 });
const money2 = new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", minimumFractionDigits: 2, maximumFractionDigits: 2 });

function renderDebts() {
  const list = $("debtList");
  list.innerHTML = state.debts.map((d, index) => `
    <div class="debt-card" data-id="${d.id}">
      <div class="debt-card-head">
        <input class="debt-name" value="${escapeHtml(d.name)}" aria-label="Debt name">
        ${state.debts.length > 1 ? `<button class="remove-debt" type="button" data-remove="${d.id}">Remove</button>` : ""}
      </div>
      <div class="field-grid">
        <div class="field">
          <label>Balance</label>
          <input data-field="balance" type="number" min="0" step="0.01" value="${d.balance}" inputmode="decimal">
        </div>
        <div class="field">
          <label>APR %</label>
          <input data-field="apr" type="number" min="0" max="100" step="0.01" value="${d.apr}" inputmode="decimal">
        </div>
        <div class="field">
          <label>Minimum / month</label>
          <input data-field="min" type="number" min="0" step="1" value="${d.min}" inputmode="decimal">
        </div>
      </div>
    </div>`).join("");

  list.querySelectorAll(".debt-card").forEach(card => {
    const id = Number(card.dataset.id);
    const debt = state.debts.find(x => x.id === id);
    card.querySelector(".debt-name").addEventListener("input", e => debt.name = e.target.value);
    card.querySelectorAll("[data-field]").forEach(input => {
      input.addEventListener("input", e => debt[e.target.dataset.field] = Number(e.target.value));
    });
  });

  list.querySelectorAll("[data-remove]").forEach(btn => {
    btn.addEventListener("click", () => {
      state.debts = state.debts.filter(d => d.id !== Number(btn.dataset.remove));
      renderDebts();
    });
  });
}

function escapeHtml(value) {
  return String(value).replace(/[&<>"']/g, c => ({ "&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#039;" }[c]));
}

function cloneDebts() {
  return state.debts.map(d => ({...d}));
}

function validate(debts, extra) {
  if (!debts.length) return "Add at least one debt.";
  for (const d of debts) {
    if (!d.balance || d.balance < 0) return "Enter a valid balance for every debt.";
    if (d.apr < 0 || d.apr > 100) return "APR must be between 0% and 100%.";
    if (!d.min || d.min <= 0) return "Each debt needs a minimum monthly payment.";
  }
  if (extra < 0) return "Extra payment cannot be negative.";
  return "";
}

function simulate(inputDebts, extra, method) {
  let debts = inputDebts.map(d => ({...d, balance: Number(d.balance)}));
  let month = 0;
  let totalInterest = 0;
  let schedule = [];
  let guard = 0;

  while (debts.some(d => d.balance > 0.005) && guard++ < 1200) {
    month++;
    if (month > 1200) return { error: "The entered payments are not enough to pay off the debt within 100 years." };

    let monthInterest = 0;
    debts.forEach(d => {
      if (d.balance <= 0) return;
      const interest = d.balance * (d.apr / 100 / 12);
      d.interest = interest;
      d.balance += interest;
      monthInterest += interest;
    });
    totalInterest += monthInterest;

    let availableExtra = extra;
    const active = debts.filter(d => d.balance > 0.005);
    const order = [...active].sort((a,b) => method === "avalanche"
      ? (b.apr - a.apr) || (a.balance - b.balance)
      : (a.balance - b.balance) || (b.apr - a.apr));

    // Pay required minimums first, capped at the current balance.
    let totalPaid = 0;
    for (const d of active) {
      const payment = Math.min(d.min, d.balance);
      d.balance -= payment;
      totalPaid += payment;
    }

    // Any extra money goes to the current priority debt, rolling over as debts disappear.
    for (const d of order) {
      if (availableExtra <= 0) break;
      if (d.balance <= 0) continue;
      const payment = Math.min(availableExtra, d.balance);
      d.balance -= payment;
      availableExtra -= payment;
      totalPaid += payment;
    }

    // If a minimum payment paid off a debt, its unused amount is also rolled into the priority debt.
    let freed = 0;
    active.forEach(d => {
      if (d.balance <= 0.005) {
        const minPaid = Math.min(d.min, d.balance + d.min);
        // The exact rollover is approximated by the remaining scheduled minimum.
        freed += Math.max(0, d.min - minPaid);
      }
    });

    // Recalculate remaining balances for the schedule.
    const remaining = debts.reduce((sum,d) => sum + Math.max(0,d.balance), 0);
    schedule.push({ month, payment: totalPaid, interest: monthInterest, balance: remaining });

    if (month > 1 && totalPaid <= monthInterest && remaining >= inputDebts.reduce((s,d)=>s+d.balance,0)) {
      return { error: "The payment amounts do not reduce the debt. Increase the minimum payments." };
    }
  }

  return {
    months: month,
    totalInterest,
    totalPaid: inputDebts.reduce((s,d)=>s+d.balance,0) + totalInterest,
    schedule
  };
}

function simulateRolling(inputDebts, extra, method) {
  let debts = inputDebts.map(d => ({...d, balance:Number(d.balance)}));
  let month = 0, totalInterest = 0, schedule = [], guard = 0;

  while (debts.some(d => d.balance > 0.005) && guard++ < 1200) {
    month++;
    let active = debts.filter(d => d.balance > 0.005);
    let interestThisMonth = 0;
    active.forEach(d => {
      const interest = d.balance * d.apr / 100 / 12;
      d.balance += interest;
      interestThisMonth += interest;
    });
    totalInterest += interestThisMonth;

    // Minimums are paid first.
    let basePayment = 0;
    active.forEach(d => {
      const p = Math.min(d.min, d.balance);
      d.balance -= p;
      basePayment += p;
    });

    // Roll every freed minimum plus the chosen extra into the target debt.
    let pool = extra;
    const targetOrder = [...debts.filter(d => d.balance > 0.005)].sort((a,b) =>
      method === "avalanche"
        ? (b.apr-a.apr) || (a.balance-b.balance)
        : (a.balance-b.balance) || (b.apr-a.apr)
    );

    // Track debts that were fully paid by minimums and add their scheduled minimums.
    debts.forEach(d => {
      if (d.balance <= 0.005 && d.min > 0) {
        pool += d.min;
      }
    });

    if (targetOrder[0]) {
      const target = targetOrder[0];
      const p = Math.min(pool, target.balance);
      target.balance -= p;
      basePayment += p;
    }

    const remaining = debts.reduce((sum,d)=>sum+Math.max(0,d.balance),0);
    schedule.push({month, payment:basePayment, interest:interestThisMonth, balance:remaining});
  }

  if (guard >= 1200) return {error:"The entered payments are not enough to pay off the debt within 100 years."};
  return {months:month,totalInterest,totalPaid:inputDebts.reduce((s,d)=>s+d.balance,0)+totalInterest,schedule};
}

function formatDate(months) {
  const date = new Date();
  date.setMonth(date.getMonth() + months);
  return date.toLocaleDateString("en-US",{month:"short",year:"numeric"});
}

function renderResults(base, extra, avalanche) {
  const results = $("results");
  const savedInterest = Math.max(0, base.totalInterest - avalanche.totalInterest);
  const baseDate = formatDate(base.months);
  results.innerHTML = `
    <div class="result-hero">
      <div class="label">Projected debt-free date</div>
      <div class="result-date">${baseDate}</div>
      <div class="snapshot-line"><span>Based on your current payments</span><strong>${base.months} months</strong></div>
    </div>
    <div class="result-grid">
      <div class="result-stat"><span>Total interest</span><strong>${money2.format(base.totalInterest)}</strong></div>
      <div class="result-stat"><span>Total paid</span><strong>${money2.format(base.totalPaid)}</strong></div>
      <div class="result-stat"><span>Monthly extra</span><strong>${money2.format(extra)}</strong></div>
      <div class="result-stat"><span>Potential avalanche saving</span><strong>${money2.format(savedInterest)}</strong></div>
    </div>
    <div class="result-subtitle">Projected remaining balance by month</div>
    <div class="chart" id="balanceChart" aria-label="Debt balance chart"></div>
    <div class="result-subtitle">Monthly payoff schedule</div>
    <div class="schedule-wrap">
      <table class="schedule">
        <thead><tr><th>Month</th><th>Payment</th><th>Interest</th><th>Remaining</th></tr></thead>
        <tbody>
          ${base.schedule.slice(0,240).map(r => `<tr><td>${r.month}</td><td>${money2.format(r.payment)}</td><td>${money2.format(r.interest)}</td><td>${money2.format(r.balance)}</td></tr>`).join("")}
        </tbody>
      </table>
    </div>`;
  const chart = $("balanceChart");
  const points = base.schedule.length > 60 ? base.schedule.filter((_,i)=>i%Math.ceil(base.schedule.length/60)===0) : base.schedule;
  const max = Math.max(...points.map(x=>x.balance),1);
  chart.innerHTML = points.map(x=>`<span class="chart-bar" style="height:${Math.max(3,(x.balance/max)*100)}%" title="Month ${x.month}: ${money2.format(x.balance)}"></span>`).join("");
}

function calculate() {
  const debts = cloneDebts();
  const extra = Number($("extraPayment").value) || 0;
  const error = validate(debts, extra);
  $("formError").textContent = error;
  if (error) return;

  const baseline = simulateRolling(debts, extra, "avalanche");
  const snowball = simulateRolling(debts, extra, "snowball");
  const avalanche = simulateRolling(debts, extra, "avalanche");

  if (baseline.error || snowball.error || avalanche.error) {
    $("formError").textContent = baseline.error || snowball.error || avalanche.error;
    return;
  }

  renderResults(baseline, extra, avalanche);

  $("snowballMonths").textContent = snowball.months + " months";
  $("snowballInterest").textContent = money2.format(snowball.totalInterest);
  $("avalancheMonths").textContent = avalanche.months + " months";
  $("avalancheInterest").textContent = money2.format(avalanche.totalInterest);

  const note = $("comparisonNote");
  if (avalanche.totalInterest < snowball.totalInterest) {
    note.textContent = `With these inputs, the avalanche projection pays the modeled debt ${snowball.months - avalanche.months} month(s) sooner and uses ${money2.format(snowball.totalInterest - avalanche.totalInterest)} less interest than the snowball projection.`;
  } else {
    note.textContent = "With these inputs, the two modeled strategies produce the same projected interest cost. Your actual result can vary with lender terms and payment timing.";
  }
  $("comparison").classList.remove("hidden");
}

$("addDebt").addEventListener("click", () => {
  if (state.debts.length >= 6) {
    $("formError").textContent = "You can add up to 6 debts.";
    return;
  }
  state.debts.push({id:state.nextId++,name:`Debt ${state.debts.length+1}`,balance:2000,apr:18,min:75});
  $("formError").textContent = "";
  renderDebts();
});

$("calculate").addEventListener("click", calculate);
renderDebts();
