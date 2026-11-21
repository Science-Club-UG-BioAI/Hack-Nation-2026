import { afterAll } from "vitest";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve, dirname, basename } from "node:path";
import { closeAuditStore } from "@/server/audit-store";
const directory = mkdtempSync(join(tmpdir(), "prawdowid-tests-"));
process.env.AUDIT_DB_PATH = join(directory, "audit.sqlite");
afterAll(() => {
  closeAuditStore();
  if (
    dirname(resolve(directory)) !== resolve(tmpdir()) ||
    !basename(directory).startsWith("prawdowid-tests-")
  )
    throw new Error("Unsafe test cleanup path");
  rmSync(directory, { recursive: true, force: true });
});
