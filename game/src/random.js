// A small seeded random stream (mulberry32) plus the helpers the game
// reaches for: ranges, picks, shuffles and a deterministic id counter.
// Every random choice in the city, traffic and missions draws from one
// stream, so ?seed=N replays the same city and the same staged shots.

export function createRandom(seed) {
  let state = (seed >>> 0) || 0x9e3779b9;

  function next() {
    state = (state + 0x6d2b79f5) | 0;
    let t = Math.imul(state ^ (state >>> 15), 1 | state);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  }

  return {
    next,
    // Uniform float in [min, max).
    range(min, max) {
      return min + next() * (max - min);
    },
    // Uniform integer in [min, max] inclusive.
    int(min, max) {
      return min + Math.floor(next() * (max - min + 1));
    },
    // One element of a non-empty array.
    pick(list) {
      return list[Math.floor(next() * list.length)];
    },
    // True with the given probability.
    chance(p) {
      return next() < p;
    },
    // A shuffled copy of the list.
    shuffle(list) {
      const copy = list.slice();
      for (let i = copy.length - 1; i > 0; i -= 1) {
        const j = Math.floor(next() * (i + 1));
        [copy[i], copy[j]] = [copy[j], copy[i]];
      }
      return copy;
    },
  };
}

// A tiny counter that hands out stable ids for cars, pedestrians and
// officers, so collision cooldowns can be keyed per pair.
export function createIdCounter(start = 1) {
  let nextId = start;
  return function nextIdValue() {
    const id = nextId;
    nextId += 1;
    return id;
  };
}
