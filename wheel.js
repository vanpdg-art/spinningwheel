import { CONFIG } from "./config.js";

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}


function shortName(name, entryCount) {
  const tokens = String(name).trim().split(/\s+/).filter(Boolean);
  if (tokens.length <= 1) {
    return name;
  }

  const givenName = tokens[tokens.length - 1];

  if (entryCount <= 12) {
    return name;
  }

  if (entryCount <= 18) {
    return `${tokens[0]} ${givenName}`;
  }

  if (entryCount <= 26) {
    return givenName;
  }

  const initials = tokens
    .slice(0, -1)
    .map((token) => token[0]?.toUpperCase())
    .filter(Boolean)
    .join(".");
  return initials ? `${initials}. ${givenName}` : givenName;
}

export class Wheel {
  constructor(canvas, group, getPalette, getThemeColor) {
    this.canvas = canvas;
    this.ctx = canvas.getContext("2d");
    this.group = group;
    this.rotation = 0;
    this.getPalette = getPalette;
    this.getThemeColor = getThemeColor;
  }

  draw(entries, options = {}) {
    const { skipLabels = false } = options;
    const ctx = this.ctx;
    const radius = this.canvas.width / 2;
    const center = radius;
    const sliceCount = Math.max(entries.length, 1);
    const angleStep = CONFIG.geometry.TWO_PI / sliceCount;
    const fontSize = this.getLabelFontSize(entries.length);

    ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);

    const palette = this.getPalette(this.group);

    for (let i = 0; i < sliceCount; i += 1) {
      const start = this.rotation + i * angleStep;
      const end = start + angleStep;
      ctx.beginPath();
      ctx.moveTo(center, center);
      ctx.arc(center, center, radius - 6, start, end);
      ctx.closePath();
      ctx.fillStyle = entries.length ? palette[i % palette.length] : this.getThemeColor("--theme-btn-secondary-bg", "#ffe5f4");
      ctx.fill();

      if (entries.length && !skipLabels) {
        const mid = start + angleStep / 2;
        const labelRadius = entries.length > 20 ? radius * 0.73 : radius * 0.67;
        const x = center + Math.cos(mid) * labelRadius;
        const y = center + Math.sin(mid) * labelRadius;

        ctx.save();
        ctx.translate(x, y);
        ctx.rotate(mid + Math.PI / 2);
        ctx.fillStyle = this.getThemeColor("--theme-text", "#5f1642");
        ctx.font = `bold ${fontSize}px Segoe UI, sans-serif`;
        ctx.textAlign = "center";
        const maxLabelWidth = this.getMaxLabelWidth(radius, angleStep);
        const compact = shortName(entries[i].name, entries.length);
        const safeLabel = this.truncateLabelToWidth(compact, ctx, maxLabelWidth);
        ctx.fillText(safeLabel, 0, 0);
        ctx.restore();
      }
    }

    ctx.beginPath();
    ctx.arc(center, center, radius - 6, 0, CONFIG.geometry.TWO_PI);
    ctx.strokeStyle = this.getThemeColor("--theme-wheel-border", this.getThemeColor("--theme-canvas-border", "#ffc2e3"));
    ctx.lineWidth = 3;
    ctx.stroke();

    ctx.beginPath();
    ctx.arc(center, center, 17, 0, CONFIG.geometry.TWO_PI);
    ctx.fillStyle = this.getThemeColor("--theme-center-fill", "#fff");
    ctx.fill();
    ctx.strokeStyle = this.getThemeColor("--theme-center-stroke", this.getThemeColor("--theme-base", CONFIG.theme.defaultBase));
    ctx.lineWidth = 3;
    ctx.stroke();
  }

  getLabelFontSize(entryCount) {
    if (entryCount <= 8) return 15;
    if (entryCount <= 12) return 13;
    if (entryCount <= 16) return 12;
    if (entryCount <= 22) return 10;
    if (entryCount <= 30) return 9;
    return 8;
  }

  getMaxLabelWidth(radius, angleStep) {
    const labelRadius = radius * 0.67;
    const arcChordWidth = 2 * labelRadius * Math.sin(angleStep / 2);
    return clamp(arcChordWidth * 0.9, 36, radius * 0.68);
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

  animateTo(finalRotation, entries, durationMs = CONFIG.settings.defaultSpinDurationMs) {
    const start = this.rotation;
    const startTime = performance.now();
    let lastDrawnAt = 0;

    return new Promise((resolve) => {
      const frame = (now) => {
        const elapsed = now - startTime;
        const t = Math.min(elapsed / durationMs, 1);
        const eased = 1 - (1 - t) ** 3;
        this.rotation = start + (finalRotation - start) * eased;

        if (now - lastDrawnAt >= CONFIG.animation.frameIntervalMs || t === 1) {
          this.draw(entries, { skipLabels: t < 1 });
          lastDrawnAt = now;
        }

        if (t < 1) {
          requestAnimationFrame(frame);
        } else {
          this.rotation %= CONFIG.geometry.TWO_PI;
          this.draw(entries);
          resolve();
        }
      };

      requestAnimationFrame(frame);
    });
  }
}

/**
 * Computes final wheel rotation so the winner's slice center aligns with the top pointer.
 */
export function wheelRotationForWinner(entries, winnerId, currentRotation) {
  const index = entries.findIndex((entry) => entry.id === winnerId);
  if (index === -1 || entries.length === 0) {
    return currentRotation + CONFIG.geometry.TWO_PI * CONFIG.animation.extraRotations;
  }

  const angleStep = CONFIG.geometry.TWO_PI / entries.length;
  const centerAngle = index * angleStep + angleStep / 2;
  const pointerAngle = -Math.PI / 2;
  const normalizedCurrent = ((currentRotation % CONFIG.geometry.TWO_PI) + CONFIG.geometry.TWO_PI) % CONFIG.geometry.TWO_PI;
  const targetNormalized = pointerAngle - centerAngle;
  const delta = ((targetNormalized - normalizedCurrent + CONFIG.geometry.TWO_PI) % CONFIG.geometry.TWO_PI)
    + CONFIG.geometry.TWO_PI * CONFIG.animation.extraRotations;
  return currentRotation + delta;
}
