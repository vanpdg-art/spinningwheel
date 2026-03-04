const TWO_PI = Math.PI * 2;

const state = {
  allStudents: { male: [], female: [] },
  pools: { male: [], female: [] },
  current: { male: null, female: null },
  spinning: false,
  usedPairs: new Set(),
  pairHistory: [],
  config: {
    priorityMode: false,
    priorityPairs: [],
    exclusiveMap: { male: new Map(), female: new Map() },
  },
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
    state.allStudents.male = normalizeGroup(data.male);
    state.allStudents.female = normalizeGroup(data.female);
    state.config = normalizeConfig(data);
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

  return list
    .map((entry) => {
      if (typeof entry === "string") {
        return { name: entry, excluded: false, priority: false };
      }
      if (entry && typeof entry.name === "string") {
        return {
          name: entry.name,
          excluded: Boolean(entry.excluded),
          priority: Boolean(entry.priority),
        };
      }
      return null;
    })
    .filter(Boolean);
}

function normalizeConfig(data) {
  const priorityPairs = Array.isArray(data.priorityPairs)
    ? data.priorityPairs.filter((pair) => typeof pair?.male === "string" && typeof pair?.female === "string")
    : [];

  const exclusivePairs = Array.isArray(data.exclusivePairs)
    ? data.exclusivePairs.filter((pair) => typeof pair?.male === "string" && typeof pair?.female === "string")
    : [];

  const exclusiveMale = new Map();
  const exclusiveFemale = new Map();
  for (const pair of exclusivePairs) {
    exclusiveMale.set(pair.male, pair.female);
    exclusiveFemale.set(pair.female, pair.male);
  }

  return {
    priorityMode: Boolean(data.priorityMode),
    priorityPairs,
    exclusiveMap: {
      male: exclusiveMale,
      female: exclusiveFemale,
    },
  };
}

function filteredGroup(group) {
  return state.allStudents[group].filter((student) => !student.excluded);
}

function refillPool(group) {
  state.pools[group] = shuffle([...filteredGroup(group)]);
}

function pairKey(maleName, femaleName) {
  return `${maleName}::${femaleName}`;
}

function removeByName(group, name) {
  const index = state.pools[group].findIndex((entry) => entry.name === name);
  if (index === -1) {
    return null;
  }
  return state.pools[group].splice(index, 1)[0];
}

function candidateFemalesForMale(maleName) {
  const requiredFemale = state.config.exclusiveMap.male.get(maleName);
  if (requiredFemale) {
    const match = state.pools.female.find((entry) => entry.name === requiredFemale);
    if (!match) {
      return [];
    }

    const key = pairKey(maleName, requiredFemale);
    return state.usedPairs.has(key) ? [] : [match];
  }

  return state.pools.female.filter((femaleEntry) => {
    const reservedMale = state.config.exclusiveMap.female.get(femaleEntry.name);
    if (reservedMale && reservedMale !== maleName) {
      return false;
    }

    return !state.usedPairs.has(pairKey(maleName, femaleEntry.name));
  });
}

function attemptPair(maleName, femaleName) {
  const maleWinner = removeByName("male", maleName);
  const femaleWinner = removeByName("female", femaleName);

  if (!maleWinner || !femaleWinner) {
    if (maleWinner) {
      state.pools.male.push(maleWinner);
    }
    if (femaleWinner) {
      state.pools.female.push(femaleWinner);
    }
    return null;
  }

  const key = pairKey(maleWinner.name, femaleWinner.name);
  state.usedPairs.add(key);
  state.pairHistory.push({ male: maleWinner.name, female: femaleWinner.name });
  return { male: maleWinner, female: femaleWinner };
}

function pickPairFromCurrentPools() {
  if (state.config.priorityMode) {
    for (const pair of state.config.priorityPairs) {
      if (state.usedPairs.has(pairKey(pair.male, pair.female))) {
        continue;
      }

      const maleInPool = state.pools.male.some((entry) => entry.name === pair.male);
      const femaleInPool = state.pools.female.some((entry) => entry.name === pair.female);
      if (!maleInPool || !femaleInPool) {
        continue;
      }

      const femaleOptions = candidateFemalesForMale(pair.male);
      if (!femaleOptions.some((entry) => entry.name === pair.female)) {
        continue;
      }

      const selected = attemptPair(pair.male, pair.female);
      if (selected) {
        return selected;
      }
    }
  }

  for (let i = state.pools.male.length - 1; i >= 0; i -= 1) {
    const maleName = state.pools.male[i].name;
    const femaleOptions = candidateFemalesForMale(maleName);
    if (femaleOptions.length === 0) {
      continue;
    }

    const femaleName = femaleOptions[femaleOptions.length - 1].name;
    const selected = attemptPair(maleName, femaleName);
    if (selected) {
      return selected;
    }
  }

  return null;
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

  if (state.pools.male.length === 0) {
    refillPool("male");
  }
  if (state.pools.female.length === 0) {
    refillPool("female");
  }

  let maleEntries = [...state.pools.male];
  let femaleEntries = [...state.pools.female];
  let pair = pickPairFromCurrentPools();

  if (!pair) {
    refillPool("male");
    refillPool("female");
    maleEntries = [...state.pools.male];
    femaleEntries = [...state.pools.female];
    pair = pickPairFromCurrentPools();
  }

  if (!pair) {
    elements.pairResult.textContent = "No valid pair can be formed with current constraints.";
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
  renderResult();
  renderStatus();
  maleWheel.draw(state.pools.male);
  femaleWheel.draw(state.pools.female);
}

function resetPools() {
  refillPool("male");
  refillPool("female");
  state.current = { male: null, female: null };
  state.usedPairs = new Set();
  state.pairHistory = [];
  renderAll();
}

function renderResult() {
  elements.maleName.textContent = state.current.male?.name ?? "—";
  elements.femaleName.textContent = state.current.female?.name ?? "—";

  if (!state.current.male && !state.current.female) {
    elements.pairResult.textContent = "Spin to choose a pair.";
    return;
  }

  const latest = `${state.current.male?.name ?? "(none)"} + ${state.current.female?.name ?? "(none)"}`;
  const history = state.pairHistory.slice(-3).map((pair) => `${pair.male}+${pair.female}`).join(" | ");
  elements.pairResult.textContent = history ? `${latest} (recent: ${history})` : latest;
}

function renderStatus() {
  elements.malePoolStatus.textContent = `${state.pools.male.length} names left in active male pool`;
  elements.femalePoolStatus.textContent = `${state.pools.female.length} names left in active female pool`;
}

function renderAll() {
  renderResult();
  renderStatus();
  maleWheel.draw(state.pools.male);
  femaleWheel.draw(state.pools.female);
}

function shuffle(list) {
  for (let i = list.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1));
    [list[i], list[j]] = [list[j], list[i]];
  }
  return list;
}

elements.spinBtn.addEventListener("click", spinBoth);
elements.resetBtn.addEventListener("click", resetPools);

init();
