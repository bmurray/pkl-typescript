#!/usr/bin/env bun
/**
 * Pkl-to-Zod round-trip tests.
 *
 * Creates JSON from real Pkl class instances, then validates that
 * the generated Zod schemas accept the output. This is the strongest
 * integration test: if Pkl's own type system produces JSON that the
 * generated Zod schema rejects, the code generator has a bug.
 *
 * Pkl data files live in tests/pkl-data/ with naming convention:
 *   <schemaFile>--<SchemaName>--<description>.pkl
 *
 * The schemaFile portion maps to test-output/zod/<schemaFile>.schema.ts
 * and the SchemaName is the exported Zod schema to validate against.
 *
 * Usage:
 *   bun tests/run-pkl-data-tests.ts            # run tests
 *   bun tests/run-pkl-data-tests.ts --generate # regenerate zod output first
 */

import { execSync } from "child_process";
import { existsSync, readdirSync } from "fs";
import path from "path";

const ROOT = path.resolve(import.meta.dir, "..");
const PKL_DATA_DIR = path.join(ROOT, "tests", "pkl-data");
const ZOD_OUT = path.join(ROOT, "test-output", "zod");

let passed = 0;
let failed = 0;
const failures: string[] = [];

function test(name: string, fn: () => void) {
  try {
    fn();
    passed++;
    console.log(`  \x1b[32m✓\x1b[0m ${name}`);
  } catch (e: any) {
    failed++;
    const msg = e.message?.slice(0, 300) ?? String(e);
    console.log(`  \x1b[31m✗\x1b[0m ${name}`);
    console.log(`    ${msg}`);
    failures.push(`${name}: ${msg}`);
  }
}

function section(name: string) {
  console.log(`\n\x1b[1m${name}\x1b[0m`);
}

// ---------------------------------------------------------------------------
// Regenerate if requested
// ---------------------------------------------------------------------------

if (process.argv.includes("--generate")) {
  console.log("Regenerating Zod schemas...");
  const fixtures = readdirSync(path.join(ROOT, "tests", "fixtures"))
    .filter((f) => f.endsWith(".pkl"))
    .map((f) => `tests/fixtures/${f}`)
    .join(" ");
  execSync(`pkl run zod/gen.pkl --project-dir . -- ${fixtures} --output-path test-output/zod`, {
    cwd: ROOT,
  });
  console.log("Done.");
}

// ---------------------------------------------------------------------------
// Parse filename convention: <schemaFile>--<SchemaName>--<description>.pkl
// ---------------------------------------------------------------------------

interface PklDataFile {
  pklPath: string;
  schemaFile: string; // e.g. "multipleUnions" -> "multipleUnions.schema.ts"
  schemaName: string; // e.g. "ShapeSchema"
  description: string;
}

function parsePklDataFile(filename: string): PklDataFile | null {
  const base = path.basename(filename, ".pkl");
  const parts = base.split("--");
  if (parts.length !== 3) return null;
  return {
    pklPath: path.join(PKL_DATA_DIR, filename),
    schemaFile: parts[0],
    schemaName: parts[1],
    description: parts[2],
  };
}

// Map schemaFile prefix to actual schema file path
function resolveSchemaPath(schemaFile: string): string | null {
  // Direct match
  const direct = path.join(ZOD_OUT, `${schemaFile}.schema.ts`);
  if (existsSync(direct)) return direct;

  // Try common/ subdirectory
  const common = path.join(ZOD_OUT, "common", `${schemaFile}.schema.ts`);
  if (existsSync(common)) return common;

  return null;
}

// ---------------------------------------------------------------------------
// Run tests
// ---------------------------------------------------------------------------

async function main() {
  const pklFiles = readdirSync(PKL_DATA_DIR)
    .filter((f) => f.endsWith(".pkl"))
    .sort();

  if (pklFiles.length === 0) {
    console.log("No Pkl data files found in tests/pkl-data/");
    process.exit(0);
  }

  // Group by schema file for organized output
  const grouped = new Map<string, PklDataFile[]>();
  for (const file of pklFiles) {
    const parsed = parsePklDataFile(file);
    if (!parsed) {
      console.log(`\x1b[33mSkipping ${file} — doesn't match naming convention\x1b[0m`);
      continue;
    }
    const key = `${parsed.schemaFile} → ${parsed.schemaName}`;
    if (!grouped.has(key)) grouped.set(key, []);
    grouped.get(key)!.push(parsed);
  }

  // Cache schema modules
  const schemaModules = new Map<string, any>();

  for (const [group, files] of grouped) {
    section(`Pkl → JSON → Zod: ${group}`);

    for (const file of files) {
      const schemaPath = resolveSchemaPath(file.schemaFile);
      if (!schemaPath) {
        console.log(`  \x1b[33m-\x1b[0m ${file.description} (schema file not found: ${file.schemaFile})`);
        continue;
      }

      // Load schema module (cached)
      if (!schemaModules.has(schemaPath)) {
        schemaModules.set(schemaPath, await import(schemaPath));
      }
      const mod = schemaModules.get(schemaPath)!;
      const schema = mod[file.schemaName];

      if (!schema) {
        console.log(`  \x1b[33m-\x1b[0m ${file.description} (${file.schemaName} not found in module)`);
        continue;
      }

      test(`${file.description}`, () => {
        // Step 1: Evaluate Pkl to JSON
        let json: string;
        try {
          json = execSync(`pkl eval ${file.pklPath} --project-dir .`, {
            cwd: ROOT,
            encoding: "utf-8",
            timeout: 30000,
          });
        } catch (e: any) {
          throw new Error(`Pkl eval failed: ${e.stderr?.slice(0, 200) ?? e.message}`);
        }

        // Step 2: Parse JSON
        const data = JSON.parse(json);

        // Step 3: Validate against Zod schema
        schema.parse(data);
      });
    }
  }

  // Summary
  console.log(`\n${"─".repeat(60)}`);
  console.log(`\x1b[1mResults: ${passed} passed, ${failed} failed\x1b[0m`);

  if (failures.length > 0) {
    console.log(`\n\x1b[31mFailures:\x1b[0m`);
    for (const f of failures) {
      console.log(`  - ${f}`);
    }
  }

  process.exit(failed > 0 ? 1 : 0);
}

main();
