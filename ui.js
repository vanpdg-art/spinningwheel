import { CONFIG } from "./config.js";
import { clamp } from "./theme.js";

export function createElements() {
  return {
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
    allowRespinInput: document.getElementById("allow-respin-input"),
    maleCanvas: document.getElementById("male-wheel"),
    femaleCanvas: document.getElementById("female-wheel"),
    maleWheelCard: document.getElementById("male-wheel-card"),
    femaleWheelCard: document.getElementById("female-wheel-card"),
    maleName: document.getElementById("male-name"),
    femaleName: document.getElementById("female-name"),
    malePoolStatus: document.getElementById("male-pool-status"),
    femalePoolStatus: document.getElementById("female-pool-status"),
    pairResult: document.getElementById("pair-result"),
    pairMeta: document.getElementById("pair-meta"),
    refillStatus: document.getElementById("refill-status"),
    newRoundBtn: document.getElementById("new-round-btn"),
    particleLayer: document.getElementById("particle-layer"),
    resultBackdrop: document.getElementById("result-backdrop"),
    resultPopup: document.getElementById("result-popup"),
    resultPopupMessage: document.getElementById("result-popup-message"),
    resultPopupPair: document.getElementById("result-popup-pair"),
    resultPopupHint: document.getElementById("result-popup-hint"),
    resultKeepBtn: document.getElementById("result-keep-btn"),
    resultRespinBtn: document.getElementById("result-respin-btn"),
  };
}

const focusableSettingsSelector = [
  "button:not([disabled])",
  "[href]",
  "input:not([disabled]):not([type='hidden'])",
  "select:not([disabled])",
  "textarea:not([disabled])",
  "[tabindex]:not([tabindex='-1'])",
].join(",");

export function createUiController(elements, { renderResult, setSpinDuration, setRecentCount, setAllowRespin }) {
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

  function updateSpinDurationLabel(state) {
    if (!elements.spinDurationValue) {
      return;
    }

    const seconds = (state.settings.spinDurationMs / 1000).toFixed(1);
    elements.spinDurationValue.textContent = `${seconds}s`;
  }

  function syncSettingsInputs(state) {
    if (elements.spinDurationRange) {
      elements.spinDurationRange.value = String(state.settings.spinDurationMs);
    }
    if (elements.historyCountInput) {
      elements.historyCountInput.value = String(state.settings.recentCount);
    }
    if (elements.allowRespinInput) {
      elements.allowRespinInput.checked = Boolean(state.settings.allowRespin);
    }
    updateSpinDurationLabel(state);
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
        setSpinDuration(clamp(nextValue, CONFIG.settings.minSpinDurationMs, CONFIG.settings.maxSpinDurationMs));
      });
    }

    if (elements.historyCountInput) {
      elements.historyCountInput.addEventListener("input", (event) => {
        const nextValue = Number(event.target.value);
        const bounded = clamp(
          Math.round(nextValue) || CONFIG.settings.defaultRecentCount,
          CONFIG.settings.minHistoryCount,
          CONFIG.settings.maxHistoryCount,
        );
        setRecentCount(bounded);
        event.target.value = String(bounded);
        renderResult();
      });
    }

    if (elements.allowRespinInput) {
      elements.allowRespinInput.addEventListener("change", (event) => {
        setAllowRespin(event.target.checked);
      });
    }
  }

  return {
    updateSpinDurationLabel,
    syncSettingsInputs,
    bindSettingsPanelControls,
    bindAdditionalSettings,
  };
}

export function getRoundStateMessage(roundState) {
  if (!roundState) {
    return "";
  }

  if (roundState.reason === "used_pairs_exhausted") {
    return "All valid pairs used this round.";
  }

  return "No compatible exclusiveID pairs available.";
}

export function renderResult(elements, state) {
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

export function renderStatus(elements, state) {
  const roundMessage = getRoundStateMessage(state.roundState);
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
