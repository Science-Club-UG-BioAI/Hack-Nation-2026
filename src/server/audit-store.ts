import { createHash } from "node:crypto";
import { mkdirSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { DatabaseSync } from "node:sqlite";
import { AppError } from "@/core/errors";
import { maskPersonalData } from "@/core/privacy";
import type { VerificationResult } from "@/core/contracts";

const RETENTION_MS = 24 * 60 * 60_000;
const MAX_RECORDS = 5000;
const hash = (value: string) =>
  createHash("sha256").update(value).digest("hex");
type Store = {
  path: string;
  db: DatabaseSync;
  timer: ReturnType<typeof setInterval>;
};
const globalStore = globalThis as typeof globalThis & {
  prawdowidAudit?: Store;
};

function prune(db: DatabaseSync) {
  db.prepare("DELETE FROM checks WHERE expires_at <= ?").run(Date.now());
  db.prepare("DELETE FROM revoked_sessions WHERE expires_at <= ?").run(
    Date.now(),
  );
}
function openStore() {
  // Mutable private data is created at runtime, never traced into a deployment.
  const path = resolve(
    /* turbopackIgnore: true */ process.env.AUDIT_DB_PATH ||
      ".runtime/audit.sqlite",
  );
  if (globalStore.prawdowidAudit?.path === path)
    return globalStore.prawdowidAudit.db;
  closeAuditStore();
  mkdirSync(dirname(path), { recursive: true });
  const db = new DatabaseSync(path);
  // DELETE journal + secure_delete avoids keeping deleted record content in a WAL.
  db.exec(`PRAGMA journal_mode=DELETE; PRAGMA secure_delete=ON; PRAGMA busy_timeout=3000;
    CREATE TABLE IF NOT EXISTS checks (id TEXT PRIMARY KEY, session_hash TEXT NOT NULL, at INTEGER NOT NULL, expires_at INTEGER NOT NULL, payload TEXT NOT NULL);
    CREATE INDEX IF NOT EXISTS checks_session ON checks(session_hash);
    CREATE INDEX IF NOT EXISTS checks_expiry ON checks(expires_at);
    CREATE TABLE IF NOT EXISTS revoked_sessions (session_hash TEXT PRIMARY KEY, expires_at INTEGER NOT NULL);`);
  prune(db);
  const timer = setInterval(() => {
    try {
      prune(db);
    } catch {
      console.error(JSON.stringify({ event: "audit_retention_failed" }));
    }
  }, 60_000);
  timer.unref();
  globalStore.prawdowidAudit = { path, db, timer };
  return db;
}
function store() {
  try {
    return openStore();
  } catch {
    throw new AppError(
      "AUDIT_UNAVAILABLE",
      "Lokalny zapis sprawdzeń jest niedostępny. Spróbuj ponownie.",
      503,
      true,
    );
  }
}
export function closeAuditStore() {
  const current = globalStore.prawdowidAudit;
  if (current) {
    clearInterval(current.timer);
    current.db.close();
    delete globalStore.prawdowidAudit;
  }
}
export function assertSessionActive(session: string) {
  if (
    store()
      .prepare(
        "SELECT 1 FROM revoked_sessions WHERE session_hash = ? AND expires_at > ?",
      )
      .get(hash(session), Date.now())
  )
    throw new AppError(
      "SESSION_DELETED",
      "Ta sesja została usunięta. Rozpocznij nowe sprawdzenie.",
      409,
    );
}

function sourceUrl(value: string) {
  try {
    const url = new URL(value);
    url.username = "";
    url.password = "";
    url.hash = "";
    url.pathname = url.pathname
      .split("/")
      .map((part) =>
        encodeURIComponent(maskPersonalData(decodeURIComponent(part)).text),
      )
      .join("/");
    for (const key of [...url.searchParams.keys()])
      if (
        key !== "oldid" ||
        !/^\d{1,12}$/.test(url.searchParams.get(key) ?? "")
      )
        url.searchParams.delete(key);
    return url.toString();
  } catch {
    return "[NIEPRAWIDŁOWY URL]";
  }
}
export type AuditEntry = {
  requestId: string;
  channel: "web" | "discord_demo";
  claim: string;
  statedAt?: string;
  durationMs: number;
  result?: VerificationResult;
  errorCode?: string;
};
export function writeAudit(session: string, entry: AuditEntry) {
  const db = store();
  db.exec("BEGIN IMMEDIATE");
  try {
    assertSessionActive(session);
    prune(db);
    const result = entry.result;
    const graph = result?.evidenceGraph;
    const graphVerdict = graph?.nodes.find(
      (node) => node.id === "verdict" && node.type === "VERDICT",
    );
    const payload = {
      requestId: entry.requestId,
      verificationId: result?.requestId ?? null,
      at: new Date().toISOString(),
      channel: entry.channel,
      claim: maskPersonalData(entry.claim).text,
      statedAt: entry.statedAt ?? null,
      durationMs: entry.durationMs,
      status: result?.status ?? "technical_error",
      verdict: result?.verdict ?? null,
      errorCode: entry.errorCode ?? null,
      explanation: result ? maskPersonalData(result.explanation).text : null,
      limitations:
        result?.limitations.map((v) => maskPersonalData(v).text) ?? [],
      retrieval: result?.retrieval ?? [],
      sources:
        result?.sources.map((s) => ({
          id: s.id,
          title: maskPersonalData(s.title).text,
          url: sourceUrl(s.url),
          publishedAt: s.publishedAt,
          retrievedAt: s.retrievedAt,
          publisherGroup: s.publisherGroup ?? null,
        })) ?? [],
      evidence:
        result?.evidence.map((e) => ({
          sourceId: e.sourceId,
          chunkId: e.chunkId,
          relation: e.relation,
          quoteSha256: hash(e.quote),
        })) ?? [],
      ...(graph && {
        evidenceGraph: {
          analysisId: graph.analysisId,
          version: graph.version,
          technical: graph.validation.technical,
          verdict:
            graphVerdict?.type === "VERDICT" ? graphVerdict.verdict : null,
          nodes: graph.nodes.length,
          edges: graph.edges.length,
          sha256: hash(JSON.stringify(graph)),
        },
      }),
      // Metadata and hashes only: no source bodies or full quotations archived.
      expiresAt: new Date(Date.now() + RETENTION_MS).toISOString(),
    };
    db.prepare(
      "INSERT INTO checks(id, session_hash, at, expires_at, payload) VALUES (?, ?, ?, ?, ?)",
    ).run(
      entry.requestId,
      hash(session),
      Date.now(),
      Date.now() + RETENTION_MS,
      JSON.stringify(payload),
    );
    db.exec(
      `DELETE FROM checks WHERE id IN (SELECT id FROM checks ORDER BY at DESC, rowid DESC LIMIT -1 OFFSET ${MAX_RECORDS})`,
    );
    db.exec("COMMIT");
  } catch (error) {
    db.exec("ROLLBACK");
    throw error;
  }
}
export function sessionAudit(session: string) {
  assertSessionActive(session);
  const db = store();
  prune(db);
  return db
    .prepare(
      "SELECT payload FROM checks WHERE session_hash = ? ORDER BY at, rowid",
    )
    .all(hash(session))
    .map((row) => JSON.parse(String(row.payload)) as Record<string, unknown>);
}
export function deleteSessionAudit(session: string) {
  const db = store();
  db.exec("BEGIN IMMEDIATE");
  try {
    db.prepare("DELETE FROM checks WHERE session_hash = ?").run(hash(session));
    // Tombstone contains no input or result, prevents late/replayed writes.
    db.prepare("INSERT OR REPLACE INTO revoked_sessions VALUES (?, ?)").run(
      hash(session),
      Date.now() + RETENTION_MS,
    );
    db.exec("COMMIT");
  } catch (error) {
    db.exec("ROLLBACK");
    throw error;
  }
}
