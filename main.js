const COINS_PER_DRAW = 200;
const DEFAULT_DRAWS = 1500;
const DEFAULT_COINS = DEFAULT_DRAWS * COINS_PER_DRAW;

const DROP_TABLE = [
  // 綠（罕見）
  { rarity: "green", qty: 5, prob: 0.0100 },
  { rarity: "green", qty: 10, prob: 0.0100 },
  { rarity: "green", qty: 20, prob: 0.0100 },
  // 藍（稀有）
  { rarity: "blue", qty: 5, prob: 0.0400 },
  { rarity: "blue", qty: 10, prob: 0.0400 },
  { rarity: "blue", qty: 20, prob: 0.0400 },
  // 紫（史詩）
  { rarity: "purple", qty: 5, prob: 0.04992 },
  { rarity: "purple", qty: 10, prob: 0.0400 },
  { rarity: "purple", qty: 20, prob: 0.0110 },
];

const EV_PER_VALID_DRAW = 0.1854425926;
const EV_PER_REAL_DRAW = 0.1668983333;
const EFFECTIVE_DRAWS_PER_ROUND = 9;
const VISIBLE_HISTORY_ENTRIES = 2;

const RARITY_META = {
  green: { label: "綠書", className: "text-green", order: 0 },
  blue: { label: "藍書", className: "text-blue", order: 1 },
  purple: { label: "紫書", className: "text-purple", order: 2 },
};

const DROP_TABLE_INDEX = DROP_TABLE.reduce((acc, entry) => {
  acc[getDropKey(entry)] = entry;
  return acc;
}, {});

let dropTableStats = {};

const state = {
  totalDraws: 0,
  effectiveDraws: 0,
  totals: {
    green: 0,
    blue: 0,
    purple: 0,
  },
  hitCounts: createEmptyHitCounts(),
};

const elements = {
  coinInput: document.getElementById("coin-input"),
  availableDraws: document.getElementById("available-draws"),
  usedDraws: document.getElementById("used-draws"),
  drawButton: document.getElementById("draw-button"),
  drawAllButton: document.getElementById("draw-all-button"),
  resetButton: document.getElementById("reset-button"),
  statusMessage: document.getElementById("status-message"),
  historyList: document.getElementById("history-list"),
  totalDraws: document.getElementById("total-draws"),
  totalGreen: document.getElementById("total-green"),
  totalBlue: document.getElementById("total-blue"),
  totalPurple: document.getElementById("total-purple"),
  totalGold: document.getElementById("total-gold"),
  expectationRatio: document.getElementById("expectation-ratio"),
  expectationTag: document.getElementById("expectation-tag"),
  expectationDiff: document.getElementById("expectation-diff"),
  dropTableBody: document.getElementById("drop-table-body"),
};

function createEmptyHitCounts() {
  return DROP_TABLE.reduce((acc, entry) => {
    acc[getDropKey(entry)] = 0;
    return acc;
  }, {});
}

function parseCoinInput() {
  const coins = parseInt(elements.coinInput.value || "0", 10);
  return Number.isNaN(coins) ? 0 : coins;
}

function coinsToTotalDraws(coins) {
  return Math.floor(coins / COINS_PER_DRAW);
}

function getAllowedDraws() {
  return coinsToTotalDraws(parseCoinInput());
}

function getRemainingDraws() {
  return Math.max(0, getAllowedDraws() - state.totalDraws);
}

function getDropKey(entry) {
  return `${entry.rarity}-${entry.qty}`;
}

function formatNumber(value) {
  return value.toLocaleString("zh-TW");
}

function formatFloat(value) {
  return value.toLocaleString("zh-TW", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

function formatGold(value) {
  return value.toFixed(5);
}

function normalizeFloat(value) {
  return Math.abs(value) < 1e-9 ? 0 : value;
}

function calculateGoldEquivalent(totals) {
  const purpleGold = totals.purple / 6;
  const blueGold = totals.blue / 36;
  const greenGold = totals.green / 216;
  return purpleGold + blueGold + greenGold;
}

function rollDrop() {
  const roll = Math.random();
  let cumulative = 0;

  for (const entry of DROP_TABLE) {
    cumulative += entry.prob;
    if (roll < cumulative) {
      return entry;
    }
  }

  return null;
}

function buildHistoryEntry(round, hitsText, roundTotals, roundGold) {
  const entry = document.createElement("article");
  entry.className = "history-entry";

  const title = document.createElement("div");
  title.className = "history-title";
  title.textContent = `第 ${round} 輪結果`;

  const detail = document.createElement("div");
  detail.className = "history-detail";
  detail.textContent = hitsText;

  const gold = document.createElement("div");
  gold.className = "history-gold mono";
  gold.textContent = `本輪折合金書：${formatGold(roundGold)} 本`;

  const list = document.createElement("ul");
  list.className = "rarity-list";

  Object.entries(RARITY_META)
    .sort((a, b) => a[1].order - b[1].order)
    .forEach(([rarity, meta]) => {
      const value = roundTotals[rarity];
      const item = document.createElement("li");
      item.innerHTML = `<span class="${meta.className}">${meta.label}</span> <span class="mono">${formatNumber(value)} 本</span>`;
      list.appendChild(item);
    });

  entry.append(title, detail, gold, list);
  return entry;
}

function renderHistory(round, roundHits, roundTotals, roundGold) {
  if (elements.historyList.querySelector(".empty-placeholder")) {
    elements.historyList.innerHTML = "";
  }

  const hitsText = roundHits.length
    ? `本輪抽中 ${roundHits.join("、")}`
    : "本輪無命中";

  const entry = buildHistoryEntry(round, hitsText, roundTotals, roundGold);
  elements.historyList.append(entry);
  updateHistoryViewport();
}

function updateHistoryViewport() {
  const list = elements.historyList;
  const entries = Array.from(list.querySelectorAll(".history-entry"));

  list.classList.remove("scrollable");
  list.style.removeProperty("max-height");

  if (entries.length === 0) {
    list.scrollTop = 0;
    return;
  }

  if (entries.length > VISIBLE_HISTORY_ENTRIES) {
    list.getBoundingClientRect();
    const computedStyle = window.getComputedStyle(list);
    const gapValue =
      parseFloat(computedStyle.rowGap || computedStyle.gap || "0") || 0;

    const recentEntries = entries.slice(-VISIBLE_HISTORY_ENTRIES);
    let visibleHeight = 0;
    for (const entry of recentEntries) {
      visibleHeight += entry.offsetHeight;
    }
    visibleHeight += gapValue * Math.max(recentEntries.length - 1, 0);

    list.style.maxHeight = `${visibleHeight}px`;
    list.classList.add("scrollable");
  }

  list.scrollTop = list.scrollHeight;
}

function updateDropTableStats() {
  Object.entries(dropTableStats).forEach(([key, cells]) => {
    const count = state.hitCounts[key] || 0;
    const entry = DROP_TABLE_INDEX[key];
    const expected = entry ? state.effectiveDraws * entry.prob : 0;
    const diff = normalizeFloat(count - expected);

    cells.actual.textContent = formatNumber(count);
    cells.expected.textContent = formatFloat(expected);
    const diffText = formatFloat(diff);
    cells.diff.textContent = diff > 0 ? `+${diffText}` : diffText;
  });
}

function updateSummary() {
  const totalDraws = state.totalDraws;
  const totals = state.totals;
  const totalGold = calculateGoldEquivalent(totals);

  const allowedDraws = getAllowedDraws();
  const available = Math.max(0, allowedDraws - totalDraws);

  elements.usedDraws.textContent = formatNumber(totalDraws);
  elements.availableDraws.textContent = formatNumber(available);
  elements.drawButton.disabled = available < 10;
  elements.drawAllButton.disabled = available < 10;

  elements.totalDraws.textContent = formatNumber(totalDraws);
  elements.totalGreen.textContent = formatNumber(totals.green);
  elements.totalBlue.textContent = formatNumber(totals.blue);
  elements.totalPurple.textContent = formatNumber(totals.purple);
  elements.totalGold.textContent = formatGold(totalGold);

  updateDropTableStats();

  if (totalDraws === 0) {
    elements.expectationRatio.textContent = "--";
    elements.expectationTag.textContent = "";
    elements.expectationTag.className = "expectation-tag";
    elements.expectationDiff.textContent = "";
    return;
  }

  const expectedGold = totalDraws * EV_PER_REAL_DRAW;
  const diffValue = normalizeFloat(totalGold - expectedGold);
  const isHigh = diffValue >= 0;

  elements.expectationRatio.textContent = `${formatGold(totalGold)} 本 / ${formatGold(expectedGold)} 本`;
  elements.expectationTag.textContent = isHigh ? "高於期望" : "低於期望";
  elements.expectationTag.className = `expectation-tag ${isHigh ? "high" : "low"}`;

  const diffText = `${diffValue >= 0 ? "+" : ""}${formatGold(diffValue)} 本`;
  elements.expectationDiff.textContent = `（差距 ${diffText}）`;
}

function handleCoinChange() {
  updateSummary();
  elements.statusMessage.textContent = "";
}

function performTenDraws() {
  const wasteIndex = Math.floor(Math.random() * 10);
  const roundTotals = { green: 0, blue: 0, purple: 0 };
  const hitMap = new Map();

  for (let i = 0; i < 10; i += 1) {
    if (i === wasteIndex) {
      continue;
    }

    const result = rollDrop();
    if (!result) {
      continue;
    }

    roundTotals[result.rarity] += result.qty;
    state.totals[result.rarity] += result.qty;

    const key = getDropKey(result);
    state.hitCounts[key] = (state.hitCounts[key] || 0) + 1;

    const meta = RARITY_META[result.rarity];
    const current = hitMap.get(key) || {
      count: 0,
      order: meta.order,
      qty: result.qty,
      label: `${meta.label}${result.qty}本`,
    };

    current.count += 1;
    hitMap.set(key, current);
  }

  state.totalDraws += 10;
  state.effectiveDraws += EFFECTIVE_DRAWS_PER_ROUND;

  const roundNumber = state.totalDraws / 10;

  const roundHits = Array.from(hitMap.values())
    .sort((a, b) => {
      if (a.order !== b.order) {
        return a.order - b.order;
      }
      return a.qty - b.qty;
    })
    .map((entry) => `${entry.label} ×${formatNumber(entry.count)}`);

  const roundGold = calculateGoldEquivalent(roundTotals);
  renderHistory(roundNumber, roundHits, roundTotals, roundGold);
  updateSummary();
}

function handleDraw() {
  if (getRemainingDraws() < 10) {
    elements.statusMessage.textContent = "可抽次數不足，至少需保有 10 抽才能進行模擬。";
    return;
  }

  elements.statusMessage.textContent = "";
  performTenDraws();
}

function handleDrawAll() {
  let rounds = 0;

  while (getRemainingDraws() >= 10) {
    performTenDraws();
    rounds += 1;
  }

  if (rounds === 0) {
    elements.statusMessage.textContent = "可抽次數不足，至少需保有 10 抽才能進行模擬。";
  } else {
    elements.statusMessage.textContent = `一次抽光完成，共進行 ${formatNumber(rounds)} 輪。`;
  }
}

function handleReset() {
  state.totalDraws = 0;
  state.effectiveDraws = 0;
  state.totals = { green: 0, blue: 0, purple: 0 };
  state.hitCounts = createEmptyHitCounts();

  elements.coinInput.value = DEFAULT_COINS;
  elements.historyList.innerHTML = '<p class="empty-placeholder">尚未進行抽卡</p>';
  elements.statusMessage.textContent = "";

  updateHistoryViewport();
  updateSummary();
}

function getRarityColor(rarity) {
  switch (rarity) {
    case "green":
      return "var(--green)";
    case "blue":
      return "var(--blue)";
    case "purple":
      return "var(--purple)";
    default:
      return "var(--gold)";
  }
}

function renderDropTable() {
  elements.dropTableBody.innerHTML = "";
  dropTableStats = {};
  const fragment = document.createDocumentFragment();

  DROP_TABLE.forEach((entry) => {
    const row = document.createElement("tr");
    const meta = RARITY_META[entry.rarity];

    const rarityCell = document.createElement("td");
    rarityCell.innerHTML = `
      <span class="rarity-label ${meta.className}">
        <span class="rarity-dot" style="background:${getRarityColor(entry.rarity)}"></span>
        ${meta.label}
      </span>`;

    const qtyCell = document.createElement("td");
    qtyCell.textContent = `${entry.qty} 本`;

    const probCell = document.createElement("td");
    probCell.textContent = `${(entry.prob * 100).toFixed(3)}%`;

    const actualCell = document.createElement("td");
    actualCell.className = "mono";
    actualCell.textContent = "0";

    const expectedCell = document.createElement("td");
    expectedCell.className = "mono";
    expectedCell.textContent = "0.00";

    const diffCell = document.createElement("td");
    diffCell.className = "mono";
    diffCell.textContent = "0.00";

    row.append(rarityCell, qtyCell, probCell, actualCell, expectedCell, diffCell);
    fragment.appendChild(row);

    dropTableStats[getDropKey(entry)] = {
      actual: actualCell,
      expected: expectedCell,
      diff: diffCell,
    };
  });

  elements.dropTableBody.appendChild(fragment);
}

function init() {
  elements.coinInput.value = DEFAULT_COINS;
  renderDropTable();
  updateSummary();
  updateHistoryViewport();

  elements.coinInput.addEventListener("input", handleCoinChange);
  elements.drawButton.addEventListener("click", handleDraw);
  elements.drawAllButton.addEventListener("click", handleDrawAll);
  elements.resetButton.addEventListener("click", handleReset);
}

init();

