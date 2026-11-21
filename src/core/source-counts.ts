import type { Source, SourceProvider } from "./contracts";

export function countSourcesByProvider(sources: Source[]) {
  const counts = new Map<SourceProvider | undefined, number>();
  for (const source of sources)
    counts.set(source.provider, (counts.get(source.provider) ?? 0) + 1);
  return counts;
}
