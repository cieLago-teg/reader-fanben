import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";

test("package.json regenerates Prisma Client after install to keep schema in sync", async () => {
  const packageJsonPath = path.join(process.cwd(), "package.json");
  const raw = await readFile(packageJsonPath, "utf8");
  const pkg = JSON.parse(raw) as {
    scripts?: Record<string, string>;
  };

  assert.equal(pkg.scripts?.["db:generate"], "prisma generate");
  assert.equal(pkg.scripts?.postinstall, "npm run db:generate");
});
