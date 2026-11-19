// A small seeded random number generator (xorshift32): the same seed gives
// the same stream, which is what makes the screenshot scenes repeatable and
// the city layout stable between loads.

export function createRandom(seed) {
  let state = (seed | 0) || 0x9e3779b9;
  return function random() {
    state ^= state << 13;
    state ^= state >>> 17;
    state ^= state << 5;
    return (state >>> 0) / 4294967296;
  };
}

/** Pick one element of an array with the given random stream. */
export function pick(random, array) {
  return array[Math.floor(random() * array.length)];
}

/** An integer in [min, max). */
export function intBetween(random, min, max) {
  return min + Math.floor(random() * (max - min));
}
