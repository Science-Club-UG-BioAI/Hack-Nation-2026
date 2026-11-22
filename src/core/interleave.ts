// Yield one item from each group in turn, preserving group and item order.
export function* interleave<T>(
  groups: readonly (readonly T[])[],
): Generator<T> {
  let active = groups.map((group) => group.values());
  while (active.length) {
    const remaining: typeof active = [];
    for (const iterator of active) {
      const next = iterator.next();
      if (next.done) continue;
      remaining.push(iterator);
      yield next.value;
    }
    active = remaining;
  }
}
