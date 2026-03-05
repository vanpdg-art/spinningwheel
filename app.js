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
  buildCandidatePairs,
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
    allowRespin: CONFIG.settings.defaultAllowRespin,
  },
  theme: null,
  pendingSpin: null,
};

const FUNNY_SPIN_MESSAGES = [
  "✨ Đang kiểm tra độ hợp nhau... thuật toán tình yêu đang chạy.",
  "😭 Nếu ghép đôi này hơi ngại, bạn được quay lại 1 lần để cứu tình thế.",
  "🎉 Định mệnh đã chọn rồi. Nhưng bạn vẫn có 1 lần xin quay lại.",
  "🫶 Cặp đôi dễ thương đã xuất hiện! Muốn quay lại không? Bạn có 1 lần thôi nhé.",
];

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
  setAllowRespin: (allowRespin) => {
    state.settings.allowRespin = allowRespin;
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

function randomFunnyMessage() {
  return FUNNY_SPIN_MESSAGES[Math.floor(Math.random() * FUNNY_SPIN_MESSAGES.length)];
}

function toggleResultPopup(open) {
  if (!elements.resultPopup || !elements.resultBackdrop) {
    return;
  }

  elements.resultPopup.hidden = !open;
  elements.resultBackdrop.hidden = !open;
  elements.resultPopup.setAttribute("aria-hidden", String(!open));
  document.body.classList.toggle("popup-open", open);

  if (!state.spinning) {
    elements.spinBtn.disabled = open;
    elements.resetBtn.disabled = open;
  }
}

function emitParticles() {
  if (!elements.particleLayer) {
    return;
  }

  for (let i = 0; i < 24; i += 1) {
    const piece = document.createElement("span");
    piece.className = "particle";
    piece.style.left = `${Math.random() * 100}%`;
    piece.style.background = `hsl(${315 + Math.random() * 70} 95% ${58 + Math.random() * 18}%)`;
    piece.style.animationDelay = `${Math.random() * 130}ms`;
    piece.style.setProperty("--drift", `${-30 + Math.random() * 60}px`);
    elements.particleLayer.append(piece);
    setTimeout(() => piece.remove(), 1400);
  }
}

function applyAcceptedSpin(pending) {
  state.activeMale = pending.picked.male;
  state.activeFemale = pending.picked.female;
  state.usedPairs = pending.picked.usedPairs;
  state.pairHistory = pending.picked.pairHistory;
  state.current = pending.picked.pair;

  if (isEitherPoolBelowThreshold(state)) {
    const nextEnsured = ensurePoolsForSpin(state);
    setPools(nextEnsured.male, nextEnsured.female);
    pending.refillMessages.push(...nextEnsured.messages);
  }

  elements.refillStatus.textContent = pending.refillMessages.join(" • ");
}

function showSpinDecisionPopup() {
  if (!state.pendingSpin) {
    return;
  }

  const { picked, respinUsed } = state.pendingSpin;
  const pairText = `${picked.pair.male.name} + ${picked.pair.female.name}`;
  elements.resultPopupPair.textContent = pairText;
  elements.resultPopupMessage.textContent = randomFunnyMessage();

  if (!state.settings.allowRespin) {
    elements.resultPopupHint.textContent = "Đã tắt tính năng quay lại trong phần cài đặt.";
    elements.resultRespinBtn.disabled = true;
  } else if (respinUsed) {
    elements.resultPopupHint.textContent = "Đã sử dụng hết lượt quay lại, phải chịu thui 💞";
    elements.resultRespinBtn.disabled = true;
  } else {
    elements.resultPopupHint.textContent = "Bạn có thể quay lại nếu một trong hai không mong muốn kết quả này 🎲";
    elements.resultRespinBtn.disabled = false;
  }

  toggleResultPopup(true);
}

async function animatePickedPair(maleEntries, femaleEntries, pickedPair) {
  state.spinning = true;
  elements.spinBtn.disabled = true;
  elements.resetBtn.disabled = true;
  elements.maleWheelCard?.classList.add("spinning");
  elements.femaleWheelCard?.classList.add("spinning");

  const maleFinal = wheelRotationForWinner(maleEntries, pickedPair.male.id, maleWheel.rotation);
  const femaleFinal = wheelRotationForWinner(femaleEntries, pickedPair.female.id, femaleWheel.rotation);

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

  state.current = pickedPair;
  state.spinning = false;
  elements.spinBtn.disabled = false;
  elements.resetBtn.disabled = false;
  elements.maleWheelCard?.classList.remove("spinning");
  elements.femaleWheelCard?.classList.remove("spinning");
}

function pickFemaleOnlyRespin(beforePending) {
  const fixedMale = beforePending.picked.pair.male;
  const previousFemale = beforePending.picked.pair.female;
  const replayState = {
    activeMale: [fixedMale],
    activeFemale: beforePending.baseFemale,
    usedPairs: state.usedPairs,
    pairHistory: state.pairHistory,
  };

  const { pairs } = buildCandidatePairs(replayState);
  if (!pairs.length) {
    return null;
  }

  const alternatives = pairs.filter((entry) => entry.female.id !== previousFemale.id);
  const candidateList = alternatives.length ? alternatives : pairs;
  const selected = candidateList[Math.floor(Math.random() * candidateList.length)];

  if (!selected) {
    return null;
  }

  return {
    pair: {
      male: fixedMale,
      female: selected.female,
      rank: selected.rank,
    },
    male: beforePending.baseMale.filter((entry) => entry.id !== fixedMale.id),
    female: beforePending.baseFemale.filter((entry) => entry.id !== selected.female.id),
    usedPairs: new Set(state.usedPairs).add(selected.key),
    pairHistory: [...state.pairHistory, { male: fixedMale.name, female: selected.female.name, rank: selected.rank }],
  };
}

async function spinBoth() {
  if (state.spinning || state.roundState?.requiresConfirmation || state.pendingSpin) {
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

  updateRoundState(null);

  await animatePickedPair(maleEntries, femaleEntries, picked.pair);
  state.pendingSpin = {
    baseMale: maleEntries,
    baseFemale: femaleEntries,
    picked,
    refillMessages,
    respinUsed: !state.settings.allowRespin,
  };

  if (!state.settings.allowRespin) {
    applyAcceptedSpin(state.pendingSpin);
    state.pendingSpin = null;
    renderAll();
    emitParticles();
    return;
  }

  renderAll();
  showSpinDecisionPopup();
}

function resetPools() {
  state.pendingSpin = null;
  toggleResultPopup(false);
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
elements.resultKeepBtn?.addEventListener("click", () => {
  if (!state.pendingSpin) {
    return;
  }

  applyAcceptedSpin(state.pendingSpin);
  state.pendingSpin = null;
  toggleResultPopup(false);
  emitParticles();
  renderAll();
});

elements.resultRespinBtn?.addEventListener("click", async () => {
  if (!state.settings.allowRespin || !state.pendingSpin || state.pendingSpin.respinUsed) {
    return;
  }

  const before = state.pendingSpin;
  const repicked = pickFemaleOnlyRespin(before);
  if (!repicked.pair) {
    state.pendingSpin.respinUsed = true;
    showSpinDecisionPopup();
    return;
  }

  toggleResultPopup(false);
  state.current = { male: repicked.pair.male, female: null };
  updateLiveSpinLabel(elements.maleName, repicked.pair.male);
  updateLiveSpinLabel(elements.femaleName, null);
  await animatePickedPair([repicked.pair.male], before.baseFemale, repicked.pair);

  state.pendingSpin = {
    ...before,
    picked: repicked,
    respinUsed: true,
  };
  renderAll();
  showSpinDecisionPopup();
});

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
