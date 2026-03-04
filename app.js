const TWO_PI = Math.PI * 2;
const RANDOM_PRIORITY_MIN = 1;
const RANDOM_PRIORITY_MAX = 9999;

const DEFAULT_THEME_BASE = "#ff5eaf";
const THEME_BASE_STORAGE_KEY = "pairSpinner.theme.baseColor";

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
    spinDurationMs: 3600,
    recentCount: 3,
  },
  theme: null,
};

const elements = {
  appShell: document.querySelector(".app-shell"),
  spinBtn: document.getElementById("spin-btn"),
  resetBtn: document.getElementById("reset-btn"),
  settingsBtn: document.getElementById("settings-btn"),
  settingsCloseBtn: document.getElementById("settings-close-btn"),
  settingsBackdrop: document.getElementById("settings-backdrop"),
  settingsPanel: document.getElementById("settings-panel"),
  themeColorInput: document.getElementById("theme-color"),
  themeResetBtn: document.getElementById("theme-reset-btn"),
  spinDurationRange: document.getElementById("spin-duration-range"),
  spinDurationValue: document.getElementById("spin-duration-value"),
  historyCountInput: document.getElementById("history-count-input"),
  maleCanvas: document.getElementById("male-wheel"),
  femaleCanvas: document.getElementById("female-wheel"),
  maleName: document.getElementById("male-name"),
  femaleName: document.getElementById("female-name"),
  malePoolStatus: document.getElementById("male-pool-status"),
  femalePoolStatus: document.getElementById("female-pool-status"),
  pairResult: document.getElementById("pair-result"),
  pairMeta: document.getElementById("pair-meta"),
  refillStatus: document.getElementById("refill-status"),
  newRoundBtn: document.getElementById("new-round-btn"),
};

const focusableSettingsSelector = [
  "button:not([disabled])",
  "[href]",
  "input:not([disabled]):not([type='hidden'])",
  "select:not([disabled])",
  "textarea:not([disabled])",
  "[tabindex]:not([tabindex='-1'])",
].join(",");

let settingsPanelOpener = null;
let settingsPanelKeydownHandler = null;

function getSettingsPanelFocusableElements() {
  if (!elements.settingsPanel) {
    return [];
  }

  return Array.from(elements.settingsPanel.querySelectorAll(focusableSettingsSelector)).filter((element) => {
    if (!(element instanceof HTMLElement)) {
      return false;
    }

    return element.offsetParent !== null || element === document.activeElement;
  });
}

function setBackgroundInertState(isOpen) {
  if (!elements.appShell) {
    return;
  }

  if ("inert" in HTMLElement.prototype) {
    elements.appShell.inert = isOpen;
    elements.appShell.removeAttribute("aria-hidden");
    return;
  }

  if (isOpen) {
    elements.appShell.setAttribute("aria-hidden", "true");
  } else {
    elements.appShell.removeAttribute("aria-hidden");
  }
}

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

function hexToRgb(hex) {
  const normalized = hex.trim().replace("#", "");
  const expanded = normalized.length === 3
    ? normalized
        .split("")
        .map((char) => `${char}${char}`)
        .join("")
    : normalized;

  if (!/^[0-9a-fA-F]{6}$/.test(expanded)) {
    return null;
  }

  return {
    r: parseInt(expanded.slice(0, 2), 16),
    g: parseInt(expanded.slice(2, 4), 16),
    b: parseInt(expanded.slice(4, 6), 16),
  };
}

function rgbToHex({ r, g, b }) {
  return `#${[r, g, b]
    .map((value) => clamp(Math.round(value), 0, 255).toString(16).padStart(2, "0"))
    .join("")}`;
}

function rgbToHsl({ r, g, b }) {
  const rNorm = r / 255;
  const gNorm = g / 255;
  const bNorm = b / 255;
  const max = Math.max(rNorm, gNorm, bNorm);
  const min = Math.min(rNorm, gNorm, bNorm);
  const delta = max - min;
  let h = 0;
  const l = (max + min) / 2;
  let s = 0;

  if (delta !== 0) {
    s = delta / (1 - Math.abs(2 * l - 1));
    switch (max) {
      case rNorm:
        h = 60 * (((gNorm - bNorm) / delta) % 6);
        break;
      case gNorm:
        h = 60 * ((bNorm - rNorm) / delta + 2);
        break;
      default:
        h = 60 * ((rNorm - gNorm) / delta + 4);
        break;
    }
  }

  if (h < 0) {
    h += 360;
  }

  return { h, s, l };
}

function hslToRgb({ h, s, l }) {
  const c = (1 - Math.abs(2 * l - 1)) * s;
  const x = c * (1 - Math.abs(((h / 60) % 2) - 1));
  const m = l - c / 2;
  let rPrime = 0;
  let gPrime = 0;
  let bPrime = 0;

  if (h >= 0 && h < 60) {
    rPrime = c;
    gPrime = x;
  } else if (h < 120) {
    rPrime = x;
    gPrime = c;
  } else if (h < 180) {
    gPrime = c;
    bPrime = x;
  } else if (h < 240) {
    gPrime = x;
    bPrime = c;
  } else if (h < 300) {
    rPrime = x;
    bPrime = c;
  } else {
    rPrime = c;
    bPrime = x;
  }

  return {
    r: (rPrime + m) * 255,
    g: (gPrime + m) * 255,
    b: (bPrime + m) * 255,
  };
}

function adjustLightness(hex, amount) {
  const rgb = hexToRgb(hex);
  if (!rgb) {
    return DEFAULT_THEME_BASE;
  }

  const hsl = rgbToHsl(rgb);
  hsl.l = clamp(hsl.l + amount, 0, 1);
  return rgbToHex(hslToRgb(hsl));
}

function buildTheme(baseHex) {
  const baseRgb = hexToRgb(baseHex);
  const safeBase = baseRgb ? rgbToHex(baseRgb) : DEFAULT_THEME_BASE;

  return {
    base: safeBase,
    light: adjustLightness(safeBase, 0.18),
    dark: adjustLightness(safeBase, -0.3),
    text: adjustLightness(safeBase, -0.36),
    cardBorder: adjustLightness(safeBase, 0.1),
    bgStart: adjustLightness(safeBase, 0.24),
    bgEnd: adjustLightness(safeBase, 0.31),
    secondaryBg: adjustLightness(safeBase, 0.27),
    canvasBorder: adjustLightness(safeBase, 0.2),
    wheelBorder: adjustLightness(safeBase, 0.15),
    pointer: adjustLightness(safeBase, -0.06),
    mutedAccent: adjustLightness(safeBase, -0.18),
    centerFill: "#fff",
    centerStroke: adjustLightness(safeBase, -0.1),
  };
}

function createWheelPalettes(baseHex) {
  return {
    male: [0.15, 0.07, 0.2, 0.1, 0.24, 0.05].map((offset) => adjustLightness(baseHex, offset)),
    female: [0.19, 0.11, 0.26, 0.03, 0.16, -0.02].map((offset) => adjustLightness(baseHex, offset)),
  };
}

function getThemeValue(variableName, fallback) {
  if (typeof window === "undefined") {
    return fallback;
  }

  return getThemeColor(variableName, fallback);
}

function getWheelPalette(group) {
  const fallbackBase = state.theme?.base ?? DEFAULT_THEME_BASE;
  const base = getThemeValue("--theme-base", fallbackBase);
  const palettes = createWheelPalettes(base);
  return palettes[group] ?? palettes.male;
}

function getThemeColor(variableName, fallback) {
  const value = getComputedStyle(document.documentElement).getPropertyValue(variableName).trim();
  return value || fallback;
}

function applyTheme(baseHex) {
  const theme = buildTheme(baseHex);
  state.theme = theme;
  const rootStyle = document.documentElement.style;

  rootStyle.setProperty("--theme-base", theme.base);
  rootStyle.setProperty("--theme-light", theme.light);
  rootStyle.setProperty("--theme-dark", theme.dark);
  rootStyle.setProperty("--theme-text", theme.text);
  rootStyle.setProperty("--theme-card-border", theme.cardBorder);
  rootStyle.setProperty("--theme-bg-start", theme.bgStart);
  rootStyle.setProperty("--theme-bg-end", theme.bgEnd);
  rootStyle.setProperty("--theme-btn-secondary-bg", theme.secondaryBg);
  rootStyle.setProperty("--theme-canvas-border", theme.canvasBorder);
  rootStyle.setProperty("--theme-wheel-border", theme.wheelBorder);
  rootStyle.setProperty("--theme-pointer", theme.pointer);
  rootStyle.setProperty("--theme-accent-muted", theme.mutedAccent);
  rootStyle.setProperty("--theme-center-fill", theme.centerFill);
  rootStyle.setProperty("--theme-center-stroke", theme.centerStroke);

  if (elements.themeColorInput) {
    elements.themeColorInput.value = theme.base;
  }

  maleWheel.draw(state.activeMale);
  femaleWheel.draw(state.activeFemale);

  return theme.base;
}

function getStoredThemeBaseColor() {
  try {
    const value = sessionStorage.getItem(THEME_BASE_STORAGE_KEY);
    if (!value || !hexToRgb(value)) {
      return null;
    }
    return rgbToHex(hexToRgb(value));
  } catch (_error) {
    return null;
  }
}

function storeThemeBaseColor(baseHex) {
  try {
    sessionStorage.setItem(THEME_BASE_STORAGE_KEY, baseHex);
  } catch (_error) {
    // Ignore storage write failures (private mode/quota/etc.).
  }
}

function clearStoredThemeBaseColor() {
  try {
    sessionStorage.removeItem(THEME_BASE_STORAGE_KEY);
  } catch (_error) {
    // Ignore storage removal failures.
  }
}

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
    const fontSize = this.getLabelFontSize(entries.length);

    ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);

    const palette = getWheelPalette(this.group);

    for (let i = 0; i < sliceCount; i += 1) {
      const start = this.rotation + i * angleStep;
      const end = start + angleStep;
      ctx.beginPath();
      ctx.moveTo(center, center);
      ctx.arc(center, center, radius - 6, start, end);
      ctx.closePath();
      ctx.fillStyle = entries.length ? palette[i % palette.length] : getThemeColor("--theme-btn-secondary-bg", "#ffe5f4");
      ctx.fill();

      if (entries.length) {
        const mid = start + angleStep / 2;
        const labelRadius = radius * 0.67;
        const x = center + Math.cos(mid) * labelRadius;
        const y = center + Math.sin(mid) * labelRadius;

        ctx.save();
        ctx.translate(x, y);
        ctx.rotate(mid + Math.PI / 2);
        ctx.fillStyle = getThemeColor("--theme-text", "#5f1642");
        ctx.font = `bold ${fontSize}px Segoe UI, sans-serif`;
        ctx.textAlign = "center";
        const maxLabelWidth = this.getMaxLabelWidth(radius, angleStep);
        const safeLabel = this.truncateLabelToWidth(entries[i].name, ctx, maxLabelWidth);
        ctx.fillText(safeLabel, 0, 0);
        ctx.restore();
      }
    }

    ctx.beginPath();
    ctx.arc(center, center, radius - 6, 0, TWO_PI);
    ctx.strokeStyle = getThemeColor("--theme-wheel-border", getThemeColor("--theme-canvas-border", "#ffc2e3"));
    ctx.lineWidth = 3;
    ctx.stroke();

    ctx.beginPath();
    ctx.arc(center, center, 17, 0, TWO_PI);
    ctx.fillStyle = getThemeColor("--theme-center-fill", "#fff");
    ctx.fill();
    ctx.strokeStyle = getThemeColor("--theme-center-stroke", getThemeColor("--theme-base", DEFAULT_THEME_BASE));
    ctx.lineWidth = 3;
    ctx.stroke();
  }

  getLabelFontSize(entryCount) {
    if (entryCount <= 8) {
      return 15;
    }
    if (entryCount <= 12) {
      return 14;
    }
    if (entryCount <= 16) {
      return 13;
    }
    if (entryCount <= 22) {
      return 12;
    }
    return 11;
  }

  getMaxLabelWidth(radius, angleStep) {
    const labelRadius = radius * 0.67;
    const arcChordWidth = 2 * labelRadius * Math.sin(angleStep / 2);
    return clamp(arcChordWidth * 0.88, 56, radius * 0.62);
  }

  truncateLabelToWidth(label, ctx, maxWidth) {
    if (ctx.measureText(label).width <= maxWidth) {
      return label;
    }

    const ellipsis = "…";
    const ellipsisWidth = ctx.measureText(ellipsis).width;
    if (ellipsisWidth > maxWidth) {
      return "";
    }

    let clipped = label;
    while (clipped.length > 0 && ctx.measureText(`${clipped}${ellipsis}`).width > maxWidth) {
      clipped = clipped.slice(0, -1);
    }

    return `${clipped}${ellipsis}`;
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

function updateSpinDurationLabel() {
  if (!elements.spinDurationValue) {
    return;
  }

  const seconds = (state.settings.spinDurationMs / 1000).toFixed(1);
  elements.spinDurationValue.textContent = `${seconds}s`;
}

function syncSettingsInputs() {
  if (elements.spinDurationRange) {
    elements.spinDurationRange.value = String(state.settings.spinDurationMs);
  }
  if (elements.historyCountInput) {
    elements.historyCountInput.value = String(state.settings.recentCount);
  }
  updateSpinDurationLabel();
}

function setSettingsPanelOpen(isOpen) {
  if (!elements.settingsPanel || !elements.settingsBackdrop || !elements.settingsBtn) {
    return;
  }

  if (isOpen) {
    settingsPanelOpener = document.activeElement instanceof HTMLElement ? document.activeElement : elements.settingsBtn;
  }

  elements.settingsPanel.classList.toggle("open", isOpen);
  elements.settingsPanel.setAttribute("aria-hidden", String(!isOpen));
  elements.settingsBackdrop.hidden = !isOpen;
  elements.settingsBtn.setAttribute("aria-expanded", String(isOpen));
  setBackgroundInertState(isOpen);

  if (isOpen) {
    const focusTargets = getSettingsPanelFocusableElements();
    const preferredFocus = elements.settingsCloseBtn ?? focusTargets[0] ?? elements.settingsPanel;
    preferredFocus.focus();
    return;
  }

  if (settingsPanelKeydownHandler) {
    document.removeEventListener("keydown", settingsPanelKeydownHandler);
    settingsPanelKeydownHandler = null;
  }

  const restoreTarget = settingsPanelOpener instanceof HTMLElement && settingsPanelOpener.isConnected
    ? settingsPanelOpener
    : elements.settingsBtn;
  restoreTarget.focus();
}

function bindSettingsPanelControls() {
  if (elements.settingsBtn) {
    elements.settingsBtn.addEventListener("click", () => {
      setSettingsPanelOpen(true);

      if (settingsPanelKeydownHandler) {
        return;
      }

      settingsPanelKeydownHandler = (event) => {
        if (!elements.settingsPanel?.classList.contains("open")) {
          return;
        }

        if (event.key === "Escape") {
          setSettingsPanelOpen(false);
          return;
        }

        if (event.key !== "Tab") {
          return;
        }

        const focusables = getSettingsPanelFocusableElements();
        if (focusables.length === 0) {
          event.preventDefault();
          elements.settingsPanel.focus();
          return;
        }

        const firstFocusable = focusables[0];
        const lastFocusable = focusables[focusables.length - 1];
        const activeElement = document.activeElement;
        const activeOutsidePanel = !elements.settingsPanel.contains(activeElement);

        if (activeOutsidePanel) {
          event.preventDefault();
          (event.shiftKey ? lastFocusable : firstFocusable).focus();
          return;
        }

        if (event.shiftKey && activeElement === firstFocusable) {
          event.preventDefault();
          lastFocusable.focus();
          return;
        }

        if (!event.shiftKey && activeElement === lastFocusable) {
          event.preventDefault();
          firstFocusable.focus();
        }
      };

      document.addEventListener("keydown", settingsPanelKeydownHandler);
    });
  }

  if (elements.settingsCloseBtn) {
    elements.settingsCloseBtn.addEventListener("click", () => setSettingsPanelOpen(false));
  }

  if (elements.settingsBackdrop) {
    elements.settingsBackdrop.addEventListener("click", () => setSettingsPanelOpen(false));
  }

  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape" && elements.settingsPanel?.classList.contains("open")) {
      setSettingsPanelOpen(false);
    }
  });
}

function bindAdditionalSettings() {
  if (elements.spinDurationRange) {
    elements.spinDurationRange.addEventListener("input", (event) => {
      const nextValue = Number(event.target.value);
      state.settings.spinDurationMs = clamp(nextValue, 1800, 6000);
      updateSpinDurationLabel();
    });
  }

  if (elements.historyCountInput) {
    elements.historyCountInput.addEventListener("input", (event) => {
      const nextValue = Number(event.target.value);
      state.settings.recentCount = clamp(Math.round(nextValue) || 3, 1, 8);
      event.target.value = String(state.settings.recentCount);
      renderResult();
    });
  }
}

function bindThemeControls() {
  if (elements.themeColorInput) {
    elements.themeColorInput.addEventListener("input", (event) => {
      const appliedBase = applyTheme(event.target.value);
      storeThemeBaseColor(appliedBase);
    });
  }

  if (elements.themeResetBtn) {
    elements.themeResetBtn.addEventListener("click", () => {
      const appliedBase = applyTheme(DEFAULT_THEME_BASE);
      storeThemeBaseColor(appliedBase);
    });
  }
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
    refillPool("male");
    refillPool("female");
    renderAll();
  } catch (error) {
    elements.pairResult.textContent = `Error: ${error.message}`;
    elements.spinBtn.disabled = true;
  }
}

function normalizeGroup(list, group) {
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

      const sourceId = entry.id ?? entry.sourceId ?? entry.sourceID;
      const id = sourceId != null && String(sourceId).trim() !== ""
        ? String(sourceId)
        : `${group}:${index}`;

      const priority = Number.isFinite(Number(entry.priority))
        ? Number(entry.priority)
        : randomPriority(usedPriorities);
      const exclusiveID = Number.isFinite(Number(entry.exclusiveID)) ? Number(entry.exclusiveID) : null;

      return {
        id,
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

function pairKey(maleId, femaleId) {
  return `${maleId}::${femaleId}`;
}

function isExclusiveCompatible(maleEntry, femaleEntry) {
  if (maleEntry.exclusiveID == null || femaleEntry.exclusiveID == null) {
    return true;
  }

  return maleEntry.exclusiveID === femaleEntry.exclusiveID;
}

function removeById(group, id) {
  const pool = activePool(group);
  const index = pool.findIndex((entry) => entry.id === id);
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
  let hasExclusiveCompatiblePair = false;
  let hasUsedPairMatch = false;

  for (const maleEntry of state.activeMale) {
    for (const femaleEntry of state.activeFemale) {
      if (!isExclusiveCompatible(maleEntry, femaleEntry)) {
        continue;
      }

      hasExclusiveCompatiblePair = true;
      const key = pairKey(maleEntry.id, femaleEntry.id);
      if (state.usedPairs.has(key)) {
        hasUsedPairMatch = true;
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

  const reason = pairs.length > 0
    ? null
    : hasExclusiveCompatiblePair && hasUsedPairMatch
      ? "used_pairs_exhausted"
      : "exclusive_mismatch";

  return {
    pairs: pairs.sort((a, b) => {
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
    }),
    reason,
  };
}

function pickPairFromCurrentPools() {
  const { pairs: candidatePairs, reason } = buildCandidatePairs();
  const nextPair = candidatePairs[0];
  if (!nextPair) {
    return { pair: null, reason };
  }

  const maleWinner = removeById("male", nextPair.male.id);
  const femaleWinner = removeById("female", nextPair.female.id);
  if (!maleWinner || !femaleWinner) {
    if (maleWinner) {
      state.activeMale.push(maleWinner);
      state.activeMale.sort(sortByQueue);
    }
    if (femaleWinner) {
      state.activeFemale.push(femaleWinner);
      state.activeFemale.sort(sortByQueue);
    }
    return { pair: null, reason: "exclusive_mismatch" };
  }

  state.usedPairs.add(nextPair.key);
  state.pairHistory.push({ male: maleWinner.name, female: femaleWinner.name, rank: nextPair.rank });
  return { pair: { male: maleWinner, female: femaleWinner, rank: nextPair.rank }, reason: null };
}

function startNewRound(message = "Started a new round.") {
  state.usedPairs = new Set();
  refillPool("male");
  refillPool("female");
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

function getRoundStateMessage() {
  if (!state.roundState) {
    return "";
  }

  if (state.roundState.reason === "used_pairs_exhausted") {
    return "All valid pairs used this round.";
  }

  return "No compatible exclusiveID pairs available.";
}

function wheelRotationForWinner(entries, winnerId, currentRotation) {
  const index = entries.findIndex((entry) => entry.id === winnerId);
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
  if (state.spinning || state.roundState?.requiresConfirmation) {
    return;
  }

  const refillMessages = ensurePoolsForSpin();
  const maleEntries = [...state.activeMale];
  const femaleEntries = [...state.activeFemale];
  const { pair, reason } = pickPairFromCurrentPools();

  if (!pair) {
    updateRoundState(reason);

    if (reason === "used_pairs_exhausted") {
      elements.pairResult.textContent = "All valid pairs used this round.";
      elements.refillStatus.textContent = "Press Start New Round to continue spinning.";
    } else {
      elements.pairResult.textContent = "No compatible exclusiveID pairs available.";
      elements.refillStatus.textContent = refillMessages.join(" • ");
    }

    renderStatus();
    maleWheel.draw(state.activeMale);
    femaleWheel.draw(state.activeFemale);
    return;
  }

  updateRoundState(null);

  state.spinning = true;
  elements.spinBtn.disabled = true;

  const maleFinal = wheelRotationForWinner(maleEntries, pair.male.id, maleWheel.rotation);
  const femaleFinal = wheelRotationForWinner(femaleEntries, pair.female.id, femaleWheel.rotation);

  const maleDuration = state.settings.spinDurationMs;
  const femaleDuration = Math.max(1600, state.settings.spinDurationMs - 250);

  await Promise.all([
    maleWheel.animateTo(maleFinal, maleEntries, maleDuration),
    femaleWheel.animateTo(femaleFinal, femaleEntries, femaleDuration),
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
  startNewRound("Pools reset for a new round.");
  state.current = { male: null, female: null };
  state.pairHistory = [];
  maleWheel.rotation = 0;
  femaleWheel.rotation = 0;
  clearStoredThemeBaseColor();
  applyTheme(DEFAULT_THEME_BASE);
  renderAll();
}

function renderResult() {
  elements.maleName.textContent = state.current.male?.name ?? "—";
  elements.femaleName.textContent = state.current.female?.name ?? "—";
  elements.maleName.title = state.current.male?.name ?? "";
  elements.femaleName.title = state.current.female?.name ?? "";

  if (!state.current.male && !state.current.female) {
    elements.pairResult.textContent = "Spin to choose a pair.";
    elements.pairMeta.textContent = "";
    return;
  }

  const latest = `${state.current.male?.name ?? "(none)"} + ${state.current.female?.name ?? "(none)"}`;
  const history = state.pairHistory
    .slice(-state.settings.recentCount)
    .map((pair) => `${pair.male} + ${pair.female}`)
    .join(" • ");

  elements.pairResult.textContent = latest;
  elements.pairResult.title = latest;
  elements.pairMeta.textContent = history ? `Recent: ${history}` : "";
}

function renderStatus() {
  const roundMessage = getRoundStateMessage();
  const requiresConfirmation = Boolean(state.roundState?.requiresConfirmation);

  elements.malePoolStatus.textContent = `${state.activeMale.length} names left in active male pool`;
  elements.femalePoolStatus.textContent = `${state.activeFemale.length} names left in active female pool`;

  elements.spinBtn.disabled = state.spinning || requiresConfirmation;
  elements.newRoundBtn.hidden = !requiresConfirmation;

  if (roundMessage) {
    elements.refillStatus.textContent = requiresConfirmation
      ? `${roundMessage} Start a new round to continue.`
      : roundMessage;
  }
}

function renderAll() {
  renderResult();
  renderStatus();
  maleWheel.draw(state.activeMale);
  femaleWheel.draw(state.activeFemale);
}

elements.spinBtn.addEventListener("click", spinBoth);
elements.resetBtn.addEventListener("click", resetPools);
elements.newRoundBtn.addEventListener("click", () => {
  startNewRound();
  renderAll();
});
bindThemeControls();
bindSettingsPanelControls();
bindAdditionalSettings();
syncSettingsInputs();
applyTheme(getStoredThemeBaseColor() ?? DEFAULT_THEME_BASE);

init();
