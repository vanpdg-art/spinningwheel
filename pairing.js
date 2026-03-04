import { CONFIG } from "./config.js";

export function sortByQueue(a, b) {
  if (a.priority !== b.priority) {
    return a.priority - b.priority;
  }
  if (a.order !== b.order) {
    return a.order - b.order;
  }
  return a.name.localeCompare(b.name);
}

function pairKey(maleId, femaleId) {
  return `${maleId}::${femaleId}`;
}

function spinOrder(state) {
  return state.pairHistory.length + 1;
}

function randomPriority(usedPriorities) {
  const totalSlots = CONFIG.randomPriority.max - CONFIG.randomPriority.min + 1;
  const randomStart = Math.floor(Math.random() * totalSlots) + CONFIG.randomPriority.min;

  for (let offset = 0; offset < totalSlots; offset += 1) {
    const candidate = CONFIG.randomPriority.min + ((randomStart - CONFIG.randomPriority.min + offset) % totalSlots);
    if (!usedPriorities.has(candidate)) {
      usedPriorities.add(candidate);
      return candidate;
    }
  }

  const fallback = CONFIG.randomPriority.max + usedPriorities.size + 1;
  usedPriorities.add(fallback);
  return fallback;
}

export function normalizeGroup(list, group) {
  if (!Array.isArray(list)) {
    return [];
  }

  const usedPriorities = new Set(
    list.map((entry) => Number(entry?.priority)).filter((priority) => Number.isFinite(priority)),
  );

  return list
    .map((entry, index) => {
      if (!entry || typeof entry.name !== "string") {
        return null;
      }

      const sourceId = entry.id ?? entry.sourceId ?? entry.sourceID;
      const id = sourceId != null && String(sourceId).trim() !== "" ? String(sourceId) : `${group}:${index}`;
      const priority = Number.isFinite(Number(entry.priority)) ? Number(entry.priority) : randomPriority(usedPriorities);
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

export function refillPool(allEntries) {
  return [...allEntries].filter((student) => !student.excluded).sort(sortByQueue);
}

function isExclusiveCompatible(maleEntry, femaleEntry) {
  if (maleEntry.exclusiveID == null && femaleEntry.exclusiveID == null) {
    return true;
  }

  return maleEntry.exclusiveID != null && maleEntry.exclusiveID === femaleEntry.exclusiveID;
}

function randomSample(entries, count) {
  const shuffled = [...entries];
  for (let i = shuffled.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1));
    [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
  }

  return shuffled.slice(0, count);
}

/**
 * Ensures each active pool has participants by sampling from eligible students when empty.
 */
export function ensurePoolsForSpin(state) {
  const messages = [];
  const nextMale = [...state.activeMale];
  const nextFemale = [...state.activeFemale];

  for (const group of ["male", "female"]) {
    const pool = group === "male" ? nextMale : nextFemale;
    if (pool.length > 0) {
      continue;
    }

    const all = group === "male" ? state.allMale : state.allFemale;
    const candidates = all.filter((student) => !student.excluded);
    if (candidates.length === 0) {
      continue;
    }

    const refillCount = Math.max(CONFIG.pool.refillSampleMin, Math.min(CONFIG.pool.refillSampleMax, candidates.length));
    const refillEntries = randomSample(candidates, refillCount).sort(sortByQueue);
    if (group === "male") {
      nextMale.splice(0, nextMale.length, ...refillEntries);
    } else {
      nextFemale.splice(0, nextFemale.length, ...refillEntries);
    }
    messages.push(`Refilled ${group} pool with ${refillEntries.length} students`);
  }

  return { male: nextMale, female: nextFemale, messages };
}

export function isEitherPoolBelowThreshold(state, threshold = CONFIG.pool.lowThreshold) {
  return state.activeMale.length < threshold || state.activeFemale.length < threshold;
}

/**
 * Builds sorted candidate pairs from active pools while enforcing exclusivity and pair history.
 */
export function buildCandidatePairs(state) {
  const pairs = [];
  const forcedPairs = [];
  let hasExclusiveCompatiblePair = false;
  let hasUsedPairMatch = false;
  const currentSpin = spinOrder(state);

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

      const isLockedExclusivePair = (
        maleEntry.exclusiveID != null
        && maleEntry.exclusiveID === femaleEntry.exclusiveID
        && maleEntry.priority === femaleEntry.priority
      );

      if (isLockedExclusivePair && maleEntry.priority !== currentSpin) {
        continue;
      }

      pairs.push({
        male: maleEntry,
        female: femaleEntry,
        key,
        rank: Math.min(maleEntry.priority, femaleEntry.priority),
      });

      if (isLockedExclusivePair && maleEntry.priority === currentSpin) {
        forcedPairs.push({
          male: maleEntry,
          female: femaleEntry,
          key,
          rank: currentSpin,
        });
      }
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
    forcedPairs,
    reason,
  };
}

function timeSaltedRandomIndex(length) {
  if (length <= 1) {
    return 0;
  }

  const now = Date.now();
  const highRes = Math.floor((typeof performance !== "undefined" ? performance.now() : 0) * 1000);

  if (typeof crypto !== "undefined" && typeof crypto.getRandomValues === "function") {
    const randomChunk = new Uint32Array(1);
    crypto.getRandomValues(randomChunk);
    const mixed = (randomChunk[0] ^ now ^ highRes) >>> 0;
    return mixed % length;
  }

  return Math.floor((Math.random() * length + (now % length) + (highRes % length)) % length);
}

export function pickPairFromCurrentPools(state) {
  const { pairs: candidatePairs, forcedPairs, reason } = buildCandidatePairs(state);
  const nextPair = forcedPairs[0] ?? candidatePairs[timeSaltedRandomIndex(candidatePairs.length)];
  if (!nextPair) {
    return { pair: null, reason, male: state.activeMale, female: state.activeFemale, usedPairs: state.usedPairs, pairHistory: state.pairHistory };
  }

  const nextMalePool = [...state.activeMale];
  const nextFemalePool = [...state.activeFemale];
  const maleIndex = nextMalePool.findIndex((entry) => entry.id === nextPair.male.id);
  const femaleIndex = nextFemalePool.findIndex((entry) => entry.id === nextPair.female.id);

  if (maleIndex === -1 || femaleIndex === -1) {
    return { pair: null, reason: "exclusive_mismatch", male: state.activeMale, female: state.activeFemale, usedPairs: state.usedPairs, pairHistory: state.pairHistory };
  }

  const [maleWinner] = nextMalePool.splice(maleIndex, 1);
  const [femaleWinner] = nextFemalePool.splice(femaleIndex, 1);
  const nextUsedPairs = new Set(state.usedPairs);
  nextUsedPairs.add(nextPair.key);
  const nextHistory = [...state.pairHistory, { male: maleWinner.name, female: femaleWinner.name, rank: nextPair.rank }];

  return {
    pair: { male: maleWinner, female: femaleWinner, rank: nextPair.rank },
    reason: null,
    male: nextMalePool,
    female: nextFemalePool,
    usedPairs: nextUsedPairs,
    pairHistory: nextHistory,
  };
}
