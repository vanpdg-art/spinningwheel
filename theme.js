import { CONFIG } from "./config.js";

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
    return CONFIG.theme.defaultBase;
  }

  const hsl = rgbToHsl(rgb);
  hsl.l = clamp(hsl.l + amount, 0, 1);
  return rgbToHex(hslToRgb(hsl));
}

/**
 * Generates all CSS theme tokens from a single base color.
 */
export function buildTheme(baseHex) {
  const baseRgb = hexToRgb(baseHex);
  const safeBase = baseRgb ? rgbToHex(baseRgb) : CONFIG.theme.defaultBase;

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

/**
 * Creates wheel slice palettes for male/female groups based on the same base color.
 */
export function createWheelPalettes(baseHex) {
  return {
    male: [0.15, 0.07, 0.2, 0.1, 0.24, 0.05].map((offset) => adjustLightness(baseHex, offset)),
    female: [0.19, 0.11, 0.26, 0.03, 0.16, -0.02].map((offset) => adjustLightness(baseHex, offset)),
  };
}

export function getThemeColor(variableName, fallback) {
  const value = getComputedStyle(document.documentElement).getPropertyValue(variableName).trim();
  return value || fallback;
}

export function getStoredThemeBaseColor() {
  try {
    const value = sessionStorage.getItem(CONFIG.theme.storageKey);
    if (!value || !hexToRgb(value)) {
      return null;
    }
    return rgbToHex(hexToRgb(value));
  } catch (_error) {
    return null;
  }
}

export function storeThemeBaseColor(baseHex) {
  try {
    sessionStorage.setItem(CONFIG.theme.storageKey, baseHex);
  } catch (_error) {
    // Ignore storage write failures (private mode/quota/etc.).
  }
}

export function clearStoredThemeBaseColor() {
  try {
    sessionStorage.removeItem(CONFIG.theme.storageKey);
  } catch (_error) {
    // Ignore storage removal failures.
  }
}

export function applyTheme(baseHex, { themeColorInput, onApplied } = {}) {
  const theme = buildTheme(baseHex);
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

  if (themeColorInput) {
    themeColorInput.value = theme.base;
  }

  if (onApplied) {
    onApplied(theme);
  }

  return theme;
}

export { clamp };
