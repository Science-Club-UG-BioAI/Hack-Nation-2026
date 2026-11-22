import { AsyncLocalStorage } from "node:async_hooks";
import { createHash } from "node:crypto";

// Process memory only. Searches and public date metadata stay within a session.
const MAX_ENTRIES = 128;
const MAX_BYTES = 16 * 1024 * 1024;
const MAX_ENTRY_BYTES = 2 * 1024 * 1024;
type Owner = { active: boolean; id: string };
type Entry = {
  owner: Owner;
  json: string;
  bytes: number;
  expires: number;
  timer: ReturnType<typeof setTimeout>;
};
const globals = globalThis as typeof globalThis & {
  prawdowidSearchCacheV1?: {
    owners: Map<string, Owner>;
    entries: Map<string, Entry>;
    context: AsyncLocalStorage<Owner>;
  };
};
const state = (globals.prawdowidSearchCacheV1 ??= {
  owners: new Map(),
  entries: new Map(),
  context: new AsyncLocalStorage<Owner>(),
});
const hash = (value: string) =>
  createHash("sha256").update(value).digest("hex");

function remove(key: string) {
  const entry = state.entries.get(key);
  if (entry) clearTimeout(entry.timer);
  state.entries.delete(key);
}
function forget(owner: Owner) {
  owner.active = false;
  for (const [key, entry] of state.entries)
    if (entry.owner === owner) remove(key);
  state.owners.delete(owner.id);
}
export function clearSessionSearchCache(session: string) {
  const owner = state.owners.get(hash(session));
  if (owner) forget(owner);
}
export function withSearchCache<T>(session: string, run: () => T): T {
  const id = hash(session);
  let owner = state.owners.get(id);
  if (!owner) {
    if (state.owners.size >= 100) forget(state.owners.values().next().value!);
    owner = { id, active: true };
    state.owners.set(id, owner);
  }
  return state.context.run(owner, run);
}

export async function cachedSearch<T>(
  identity: string,
  signal: AbortSignal,
  load: () => Promise<T>,
  ttlMs = 5 * 60_000,
  cacheable: (value: T) => boolean = () => true,
): Promise<{ value: T; reused: boolean }> {
  signal.throwIfAborted();
  const owner = state.context.getStore();
  const key = hash(`${owner?.id}:${identity}`);
  const entry = state.entries.get(key);
  if (owner?.active && entry?.owner === owner && entry.expires > Date.now())
    return { value: JSON.parse(entry.json) as T, reused: true };
  if (entry && (entry.owner === owner || entry.expires <= Date.now()))
    remove(key);
  // No shared pending promise: cancellation and usage remain attributable to
  // the request that actually pays. Identical analyses already share a task.
  const value = await load();
  signal.throwIfAborted();
  if (owner?.active && cacheable(value)) {
    const json = JSON.stringify(value);
    const bytes = Buffer.byteLength(json);
    if (bytes <= MAX_ENTRY_BYTES) {
      for (const [id, stored] of state.entries)
        if (stored.expires <= Date.now()) remove(id);
      remove(key);
      let total = [...state.entries.values()].reduce(
        (sum, e) => sum + e.bytes,
        0,
      );
      while (state.entries.size >= MAX_ENTRIES || total + bytes > MAX_BYTES) {
        const oldest = state.entries.keys().next().value!;
        total -= state.entries.get(oldest)!.bytes;
        remove(oldest);
      }
      const timer = setTimeout(() => remove(key), ttlMs);
      timer.unref();
      state.entries.set(key, {
        owner,
        json,
        bytes,
        expires: Date.now() + ttlMs,
        timer,
      });
    }
  }
  return { value, reused: false };
}
