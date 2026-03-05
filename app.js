import { CONFIG } from "./config.js";
import {
  applyTheme,
  clearStoredThemeBaseColor,
  createWheelPalettes,
  getStoredThemeBaseColor,
  getThemeColor,
  storeThemeBaseColor,
} from "./theme.js";
import {
  ensurePoolsForSpin,
  isEitherPoolBelowThreshold,
  normalizeGroup,
  pickPairFromCurrentPools,
  refillPool,
} from "./pairing.js";
import { Wheel, wheelRotationForWinner } from "./wheel.js";
import { createElements, createUiController, renderResult, renderStatus } from "./ui.js";

const state = {
  allMale: [],
  allFemale: [],
  activeMale: [],
  activeFemale: [],
  current: { male: null, female: null },
  spinning: false,
  usedPairs: new Set(),
  pairHistory: [],
  roundState: null,
  settings: {
    spinDurationMs: CONFIG.settings.defaultSpinDurationMs,
    recentCount: CONFIG.settings.defaultRecentCount,
  },
  theme: null,
};

const elements = createElements();

const themeRuntime = {
  base: CONFIG.theme.defaultBase,
  palettes: createWheelPalettes(CONFIG.theme.defaultBase),
};

const getWheelPalette = (group) => themeRuntime.palettes[group] ?? themeRuntime.palettes.male;

const getCachedThemeColor = (variableName, fallback) => {
  if (variableName === "--theme-base") {
    return themeRuntime.base;
  }
  return getThemeColor(variableName, fallback);
};

const maleWheel = new Wheel(elements.maleCanvas, "male", getWheelPalette, getCachedThemeColor);
const femaleWheel = new Wheel(elements.femaleCanvas, "female", getWheelPalette, getCachedThemeColor);

const ui = createUiController(elements, {
  renderResult: () => renderResult(elements, state),
  setSpinDuration: (nextDuration) => {
    state.settings.spinDurationMs = nextDuration;
    ui.updateSpinDurationLabel(state);
  },
  setRecentCount: (nextCount) => {
    state.settings.recentCount = nextCount;
  },
});

function drawWheels() {
  maleWheel.draw(state.activeMale);
  femaleWheel.draw(state.activeFemale);
}

function renderAll() {
  renderResult(elements, state);
  renderStatus(elements, state);
  drawWheels();
}

function applyAndRenderTheme(baseHex) {
  const theme = applyTheme(baseHex, { themeColorInput: elements.themeColorInput });
  state.theme = theme;
  themeRuntime.base = theme.base;
  themeRuntime.palettes = createWheelPalettes(theme.base);
  drawWheels();
  return theme.base;
}

function bindThemeControls() {
  if (elements.themeColorInput) {
    elements.themeColorInput.addEventListener("input", (event) => {
      const appliedBase = applyAndRenderTheme(event.target.value);
      storeThemeBaseColor(appliedBase);
    });
  }

  if (elements.themeResetBtn) {
    elements.themeResetBtn.addEventListener("click", () => {
      const appliedBase = applyAndRenderTheme(CONFIG.theme.defaultBase);
      storeThemeBaseColor(appliedBase);
    });
  }
}

function setPools(nextMale, nextFemale) {
  state.activeMale = nextMale;
  state.activeFemale = nextFemale;
}

function startNewRound(message = "Started a new round.") {
  state.usedPairs = new Set();
  setPools(refillPool(state.allMale), refillPool(state.allFemale));
  state.roundState = null;
  elements.refillStatus.textContent = message;
}

function updateRoundState(reason) {
  state.roundState = reason
    ? {
      reason,
      requiresConfirmation: reason === "used_pairs_exhausted",
    }
    : null;
}


function updateLiveSpinLabel(element, candidate) {
  if (!element) {
    return;
  }

  element.textContent = candidate?.name ?? "…";
  element.title = candidate?.name ?? "";
}

async function spinBoth() {
  if (state.spinning || state.roundState?.requiresConfirmation) {
    return;
  }

  const ensured = ensurePoolsForSpin(state);
  setPools(ensured.male, ensured.female);
  const refillMessages = [...ensured.messages];

  const maleEntries = [...state.activeMale];
  const femaleEntries = [...state.activeFemale];
  const picked = pickPairFromCurrentPools(state);

  if (!picked.pair) {
    updateRoundState(picked.reason);

    if (picked.reason === "used_pairs_exhausted") {
      elements.pairResult.textContent = "All valid pairs used this round.";
      elements.refillStatus.textContent = "Press Start New Round to continue spinning.";
    } else {
      elements.pairResult.textContent = "No compatible exclusiveID pairs available.";
      elements.refillStatus.textContent = refillMessages.join(" • ");
    }

    renderStatus(elements, state);
    drawWheels();
    return;
  }

  state.activeMale = picked.male;
  state.activeFemale = picked.female;
  state.usedPairs = picked.usedPairs;
  state.pairHistory = picked.pairHistory;
  updateRoundState(null);

  state.spinning = true;
  elements.spinBtn.disabled = true;
  elements.resetBtn.disabled = true;
  elements.maleWheelCard?.classList.add("spinning");
  elements.femaleWheelCard?.classList.add("spinning");

  const maleFinal = wheelRotationForWinner(maleEntries, picked.pair.male.id, maleWheel.rotation);
  const femaleFinal = wheelRotationForWinner(femaleEntries, picked.pair.female.id, femaleWheel.rotation);

  const maleDuration = state.settings.spinDurationMs;
  const femaleDuration = Math.max(
    CONFIG.animation.minFemaleDurationMs,
    state.settings.spinDurationMs - CONFIG.animation.femaleDurationOffsetMs,
  );

  await Promise.all([
    maleWheel.animateTo(maleFinal, maleEntries, maleDuration, {
      onTick: (entry) => updateLiveSpinLabel(elements.maleName, entry),
    }),
    femaleWheel.animateTo(femaleFinal, femaleEntries, femaleDuration, {
      onTick: (entry) => updateLiveSpinLabel(elements.femaleName, entry),
    }),
  ]);

  state.current = picked.pair;
  state.spinning = false;
  elements.spinBtn.disabled = false;
  elements.resetBtn.disabled = false;
  elements.maleWheelCard?.classList.remove("spinning");
  elements.femaleWheelCard?.classList.remove("spinning");

  if (isEitherPoolBelowThreshold(state)) {
    const nextEnsured = ensurePoolsForSpin(state);
    setPools(nextEnsured.male, nextEnsured.female);
    refillMessages.push(...nextEnsured.messages);
  }

  elements.refillStatus.textContent = refillMessages.join(" • ");
  renderAll();
}

function resetPools() {
  startNewRound("Pools reset for a new round.");
  state.current = { male: null, female: null };
  state.pairHistory = [];
  maleWheel.rotation = 0;
  femaleWheel.rotation = 0;
  clearStoredThemeBaseColor();
  applyAndRenderTheme(CONFIG.theme.defaultBase);
  renderAll();
}

async function init() {
  try {
    const response = await fetch("./data/students.json");
    if (!response.ok) {
      throw new Error(`Failed to load student data (${response.status})`);
    }

    const data = await response.json();
    state.allMale = normalizeGroup(data.male, "male");
    state.allFemale = normalizeGroup(data.female, "female");
    state.usedPairs = new Set();
    state.pairHistory = [];
    setPools(refillPool(state.allMale), refillPool(state.allFemale));
    renderAll();
  } catch (error) {
    elements.pairResult.textContent = `Error: ${error.message}`;
    elements.spinBtn.disabled = true;
  }
}

elements.spinBtn.addEventListener("click", spinBoth);
elements.resetBtn.addEventListener("click", resetPools);
elements.newRoundBtn.addEventListener("click", () => {
  startNewRound();
  renderAll();
});

bindThemeControls();
ui.bindSettingsPanelControls();
ui.bindAdditionalSettings();
ui.syncSettingsInputs(state);
applyAndRenderTheme(getStoredThemeBaseColor() ?? CONFIG.theme.defaultBase);


init();
