const TWO_PI = Math.PI * 2;
const RANDOM_PRIORITY_MIN = 1;
const RANDOM_PRIORITY_MAX = 9999;

const state = {
  allMale: [],
  allFemale: [],
  activeMale: [],
  activeFemale: [],
  current: { male: null, female: null },
  spinning: false,
  usedPairs: new Set(),
  pairHistory: [],
};

const elements = {
  spinBtn: document.getElementById("spin-btn"),
  resetBtn: document.getElementById("reset-btn"),
  maleCanvas: document.getElementById("male-wheel"),
  femaleCanvas: document.getElementById("female-wheel"),
  maleName: document.getElementById("male-name"),
  femaleName: document.getElementById("female-name"),
  malePoolStatus: document.getElementById("male-pool-status"),
  femalePoolStatus: document.getElementById("female-pool-status"),
  pairResult: document.getElementById("pair-result"),
  pairMeta: document.getElementById("pair-meta"),
  refillStatus: document.getElementById("refill-status"),
};

const palettes = {
  male: ["#ff9ecf", "#ff7dc0", "#ffaed8", "#ff92cb", "#ffbede", "#ff8fc6"],
  female: ["#ffb6df", "#ff97d0", "#ffc9e8", "#ff84c7", "#ffaddb", "#ff6dbc"],
};

class Wheel {
  constructor(canvas, group) {
    this.canvas = canvas;
    this.ctx = canvas.getContext("2d");
    this.group = group;
    this.rotation = 0;
  }

  draw(entries) {
    const ctx = this.ctx;
    const radius = this.canvas.width / 2;
    const center = radius;
    const sliceCount = Math.max(entries.length, 1);
    const angleStep = TWO_PI / sliceCount;

    ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);

    for (let i = 0; i < sliceCount; i += 1) {
      const start = this.rotation + i * angleStep;
      const end = start + angleStep;
      ctx.beginPath();
      ctx.moveTo(center, center);
      ctx.arc(center, center, radius - 6, start, end);
      ctx.closePath();
      ctx.fillStyle = entries.length ? palettes[this.group][i % palettes[this.group].length] : "#ffe5f4";
      ctx.fill();

      if (entries.length) {
        const mid = start + angleStep / 2;
        const labelRadius = radius * 0.67;
        const x = center + Math.cos(mid) * labelRadius;
        const y = center + Math.sin(mid) * labelRadius;

        ctx.save();
        ctx.translate(x, y);
        ctx.rotate(mid + Math.PI / 2);
        ctx.fillStyle = "#5f1642";
        ctx.font = "bold 15px Segoe UI, sans-serif";
        ctx.textAlign = "center";
        ctx.fillText(entries[i].name, 0, 0);
        ctx.restore();
      }
    }

    ctx.beginPath();
    ctx.arc(center, center, 17, 0, TWO_PI);
    ctx.fillStyle = "#fff";
    ctx.fill();
    ctx.strokeStyle = "#ff5eaf";
    ctx.lineWidth = 3;
    ctx.stroke();
  }

  animateTo(finalRotation, entries, durationMs = 3600) {
    const start = this.rotation;
    const startTime = performance.now();

    return new Promise((resolve) => {
      const frame = (now) => {
        const elapsed = now - startTime;
        const t = Math.min(elapsed / durationMs, 1);
        const eased = 1 - (1 - t) ** 3;
        this.rotation = start + (finalRotation - start) * eased;
        this.draw(entries);

        if (t < 1) {
          requestAnimationFrame(frame);
        } else {
          this.rotation %= TWO_PI;
          this.draw(entries);
          resolve();
        }
      };

      requestAnimationFrame(frame);
    });
  }
}

const maleWheel = new Wheel(elements.maleCanvas, "male");
const femaleWheel = new Wheel(elements.femaleCanvas, "female");

async function init() {
  try {
    const response = await fetch("./data/students.json");
    if (!response.ok) {
      throw new Error(`Failed to load student data (${response.status})`);
    }

    const data = await response.json();
    state.allMale = normalizeGroup(data.male);
    state.allFemale = normalizeGroup(data.female);
    state.usedPairs = new Set();
    state.pairHistory = [];
    refillPool("male");
    refillPool("female");
    renderAll();
  } catch (error) {
    elements.pairResult.textContent = `Error: ${error.message}`;
    elements.spinBtn.disabled = true;
  }
}

function normalizeGroup(list) {
  if (!Array.isArray(list)) {
    return [];
  }

  const usedPriorities = new Set(
    list
      .map((entry) => Number(entry?.priority))
      .filter((priority) => Number.isFinite(priority)),
  );

  return list
    .map((entry, index) => {
      if (!entry || typeof entry.name !== "string") {
        return null;
      }

      const priority = Number.isFinite(Number(entry.priority))
        ? Number(entry.priority)
        : randomPriority(usedPriorities);
      const exclusiveID = Number.isFinite(Number(entry.exclusiveID)) ? Number(entry.exclusiveID) : null;

      return {
        name: entry.name,
        excluded: Boolean(entry.excluded),
        priority,
        exclusiveID,
        order: index,
      };
    })
    .filter(Boolean);
}

function randomPriority(usedPriorities) {
  const totalSlots = RANDOM_PRIORITY_MAX - RANDOM_PRIORITY_MIN + 1;
  const randomStart = Math.floor(Math.random() * totalSlots) + RANDOM_PRIORITY_MIN;

  for (let offset = 0; offset < totalSlots; offset += 1) {
    const candidate = RANDOM_PRIORITY_MIN + ((randomStart - RANDOM_PRIORITY_MIN + offset) % totalSlots);
    if (!usedPriorities.has(candidate)) {
      usedPriorities.add(candidate);
      return candidate;
    }
  }

  const fallback = RANDOM_PRIORITY_MAX + usedPriorities.size + 1;
  usedPriorities.add(fallback);
  return fallback;
}

function fullGroup(group) {
  return group === "male" ? state.allMale : state.allFemale;
}

function activePool(group) {
  return group === "male" ? state.activeMale : state.activeFemale;
}

function setActivePool(group, entries) {
  if (group === "male") {
    state.activeMale = entries;
    return;
  }

  state.activeFemale = entries;
}

function filteredGroup(group) {
  return fullGroup(group).filter((student) => !student.excluded);
}

function sortByQueue(a, b) {
  if (a.priority !== b.priority) {
    return a.priority - b.priority;
  }
  if (a.order !== b.order) {
    return a.order - b.order;
  }
  return a.name.localeCompare(b.name);
}

function refillPool(group) {
  const entries = [...filteredGroup(group)].sort(sortByQueue);
  setActivePool(group, entries);
  return entries.length;
}

function pairKey(maleName, femaleName) {
  return `${maleName}::${femaleName}`;
}

function isExclusiveCompatible(maleEntry, femaleEntry) {
  if (maleEntry.exclusiveID == null && femaleEntry.exclusiveID == null) {
    return true;
  }

  return maleEntry.exclusiveID != null && maleEntry.exclusiveID === femaleEntry.exclusiveID;
}

function removeByName(group, name) {
  const pool = activePool(group);
  const index = pool.findIndex((entry) => entry.name === name);
  if (index === -1) {
    return null;
  }
  return pool.splice(index, 1)[0];
}

function randomSample(entries, count) {
  const shuffled = [...entries];
  for (let i = shuffled.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1));
    [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
  }

  return shuffled.slice(0, count);
}

function ensurePoolsForSpin() {
  const messages = [];

  for (const group of ["male", "female"]) {
    const pool = activePool(group);
    if (pool.length > 0) {
      continue;
    }

    const candidates = filteredGroup(group);
    if (candidates.length === 0) {
      continue;
    }

    const refillCount = Math.max(1, Math.min(3, candidates.length));
    const refillEntries = randomSample(candidates, refillCount).sort(sortByQueue);
    setActivePool(group, refillEntries);
    messages.push(`Refilled ${group} pool with ${refillEntries.length} students`);
  }

  return messages;
}

function isEitherPoolBelowThreshold(threshold = 1) {
  return state.activeMale.length < threshold || state.activeFemale.length < threshold;
}

function buildCandidatePairs() {
  const pairs = [];

  for (const maleEntry of state.activeMale) {
    for (const femaleEntry of state.activeFemale) {
      if (!isExclusiveCompatible(maleEntry, femaleEntry)) {
        continue;
      }

      const key = pairKey(maleEntry.name, femaleEntry.name);
      if (state.usedPairs.has(key)) {
        continue;
      }

      pairs.push({
        male: maleEntry,
        female: femaleEntry,
        key,
        rank: Math.min(maleEntry.priority, femaleEntry.priority),
      });
    }
  }

  return pairs.sort((a, b) => {
    if (a.rank !== b.rank) {
      return a.rank - b.rank;
    }
    if (a.male.priority !== b.male.priority) {
      return a.male.priority - b.male.priority;
    }
    if (a.female.priority !== b.female.priority) {
      return a.female.priority - b.female.priority;
    }
    if (a.male.order !== b.male.order) {
      return a.male.order - b.male.order;
    }
    return a.female.order - b.female.order;
  });
}

function pickPairFromCurrentPools() {
  const candidatePairs = buildCandidatePairs();
  const nextPair = candidatePairs[0];
  if (!nextPair) {
    return null;
  }

  const maleWinner = removeByName("male", nextPair.male.name);
  const femaleWinner = removeByName("female", nextPair.female.name);
  if (!maleWinner || !femaleWinner) {
    if (maleWinner) {
      state.activeMale.push(maleWinner);
      state.activeMale.sort(sortByQueue);
    }
    if (femaleWinner) {
      state.activeFemale.push(femaleWinner);
      state.activeFemale.sort(sortByQueue);
    }
    return null;
  }

  state.usedPairs.add(nextPair.key);
  state.pairHistory.push({ male: maleWinner.name, female: femaleWinner.name, rank: nextPair.rank });
  return { male: maleWinner, female: femaleWinner, rank: nextPair.rank };
}

function wheelRotationForWinner(entries, winnerName, currentRotation) {
  const index = entries.findIndex((entry) => entry.name === winnerName);
  if (index === -1 || entries.length === 0) {
    return currentRotation + TWO_PI * 5;
  }

  const angleStep = TWO_PI / entries.length;
  const centerAngle = index * angleStep + angleStep / 2;
  const pointerAngle = -Math.PI / 2;
  const normalizedCurrent = ((currentRotation % TWO_PI) + TWO_PI) % TWO_PI;
  const targetNormalized = pointerAngle - centerAngle;
  const delta = ((targetNormalized - normalizedCurrent + TWO_PI) % TWO_PI) + TWO_PI * 5;
  return currentRotation + delta;
}

async function spinBoth() {
  if (state.spinning) {
    return;
  }

  const refillMessages = ensurePoolsForSpin();
  const maleEntries = [...state.activeMale];
  const femaleEntries = [...state.activeFemale];
  const pair = pickPairFromCurrentPools();

  if (!pair) {
    elements.pairResult.textContent = "No valid pair can be formed with current constraints.";
    elements.refillStatus.textContent = refillMessages.join(" • ");
    renderStatus();
    return;
  }

  state.spinning = true;
  elements.spinBtn.disabled = true;

  const maleFinal = wheelRotationForWinner(maleEntries, pair.male.name, maleWheel.rotation);
  const femaleFinal = wheelRotationForWinner(femaleEntries, pair.female.name, femaleWheel.rotation);

  await Promise.all([
    maleWheel.animateTo(maleFinal, maleEntries, 3800),
    femaleWheel.animateTo(femaleFinal, femaleEntries, 3500),
  ]);

  state.current = pair;
  state.spinning = false;
  elements.spinBtn.disabled = false;

  if (isEitherPoolBelowThreshold()) {
    refillMessages.push(...ensurePoolsForSpin());
  }

  elements.refillStatus.textContent = refillMessages.join(" • ");
  renderResult();
  renderStatus();
  maleWheel.draw(state.activeMale);
  femaleWheel.draw(state.activeFemale);
}

function resetPools() {
  refillPool("male");
  refillPool("female");
  state.current = { male: null, female: null };
  state.usedPairs = new Set();
  state.pairHistory = [];
  elements.refillStatus.textContent = "Pools reset for a new round.";
  renderAll();
}

function renderResult() {
  elements.maleName.textContent = state.current.male?.name ?? "—";
  elements.femaleName.textContent = state.current.female?.name ?? "—";

  if (!state.current.male && !state.current.female) {
    elements.pairResult.textContent = "Spin to choose a pair.";
    elements.pairMeta.textContent = "";
    return;
  }

  const latest = `${state.current.male?.name ?? "(none)"} + ${state.current.female?.name ?? "(none)"}`;
  const history = state.pairHistory
    .slice(-3)
    .map((pair) => `${pair.male} + ${pair.female}`)
    .join(" • ");

  elements.pairResult.textContent = latest;
  elements.pairMeta.textContent = history ? `Recent: ${history}` : "";
}

function renderStatus() {
  elements.malePoolStatus.textContent = `${state.activeMale.length} names left in active male pool`;
  elements.femalePoolStatus.textContent = `${state.activeFemale.length} names left in active female pool`;
}

function renderAll() {
  renderResult();
  renderStatus();
  maleWheel.draw(state.activeMale);
  femaleWheel.draw(state.activeFemale);
}

elements.spinBtn.addEventListener("click", spinBoth);
elements.resetBtn.addEventListener("click", resetPools);

init();
