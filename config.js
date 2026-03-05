export const CONFIG = {
  geometry: {
    TWO_PI: Math.PI * 2,
  },
  randomPriority: {
    min: 1,
    max: 9999,
  },
  theme: {
    defaultBase: "#ff5eaf",
    storageKey: "pairSpinner.theme.baseColor",
  },
  settings: {
    defaultSpinDurationMs: 3600,
    defaultRecentCount: 3,
    minSpinDurationMs: 1800,
    maxSpinDurationMs: 6000,
    minHistoryCount: 1,
    maxHistoryCount: 8,
  },
  pool: {
    refillSampleMin: 1,
    refillSampleMax: 3,
    lowThreshold: 1,
  },
  animation: {
    minFemaleDurationMs: 1700,
    femaleDurationOffsetMs: 220,
    extraRotations: 6,
    frameIntervalMs: 16,
  },
};
