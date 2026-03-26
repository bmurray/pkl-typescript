#!/usr/bin/env bun
/**
 * Data-driven integration tests for pkl-zod code generation.
 *
 * Loads JSON files from tests/data/<fixture>/{valid,invalid}/ and validates
 * them against the corresponding generated Zod schemas.
 *
 * Each data directory maps to a schema file and one or more schema names.
 * Valid JSON files must parse successfully; invalid ones must throw.
 *
 * Usage:
 *   bun tests/run-data-tests.ts            # run all data tests
 *   bun tests/run-data-tests.ts --generate # regenerate output first
 */

import { execSync } from "child_process";
import { existsSync, readdirSync, readFileSync } from "fs";
import path from "path";

const ROOT = path.resolve(import.meta.dir, "..");
const DATA_DIR = path.join(ROOT, "tests", "data");
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
    const msg = e.message?.slice(0, 200) ?? String(e);
    console.log(`  \x1b[31m✗\x1b[0m ${name}`);
    console.log(`    ${msg}`);
    failures.push(`${name}: ${msg}`);
  }
}

function section(name: string) {
  console.log(`\n\x1b[1m${name}\x1b[0m`);
}

// ---------------------------------------------------------------------------
// Schema mapping: data dir -> { schemaFile, schemas }
//
// Each entry maps a test data directory to the generated .schema.ts file
// and a map of JSON filename patterns to the schema export name to test.
//
// If a JSON file matches multiple patterns, the first match wins.
// The special pattern "*" matches any file not matched by a prior pattern.
// ---------------------------------------------------------------------------

interface SchemaTarget {
  schemaFile: string;
  schemas: Record<string, string>; // filename pattern -> SchemaName
}

const SCHEMA_MAP: Record<string, SchemaTarget> = {
  abstractUnion: {
    schemaFile: "abstractUnion.schema.ts",
    schemas: {
      "variant-a": "BaseSchema",
      "variant-b": "BaseSchema",
      "unknown-variant": "BaseSchema",
      "missing-discriminator": "BaseSchema",
      "missing-inherited": "BaseSchema",
      "wrong-value": "BaseSchema",
    },
  },
  appConfig: {
    schemaFile: "appConfig.schema.ts",
    schemas: {
      "full-config": "AppConfigSchema",
      webserver: "WebServerSchema",
      database: "DatabaseConfigSchema",
      "bad-environment": "WebServerSchema",
      "missing-required": "AppConfigSchema",
      "wrong-port": "DatabaseConfigSchema",
    },
  },
  multipleUnions: {
    schemaFile: "multipleUnions.schema.ts",
    schemas: {
      circle: "ShapeSchema",
      rectangle: "ShapeSchema",
      triangle: "ShapeSchema",
      "click-event": "EventSchema",
      "key-event": "EventSchema",
      "scroll-event": "EventSchema",
      metadata: "MetadataSchema",
      "unknown-shape": "ShapeSchema",
      "missing-kind": "ShapeSchema",
      "wrong-field": "EventSchema",
      "missing-event": "EventSchema",
    },
  },
  deepInheritance: {
    schemaFile: "deepInheritance.schema.ts",
    schemas: {
      document: "DocumentSchema",
      "audit-log": "AuditLogSchema",
      "tag-with-color": "TagSchema",
      "tag-null-color": "TagSchema",
      "tag-omitted-color": "TagSchema",
      category: "CategorySchema",
      "document-missing": "DocumentSchema",
      "document-wrong": "DocumentSchema",
      "tag-wrong": "TagSchema",
    },
  },
  nullableEverything: {
    schemaFile: "nullableEverything.schema.ts",
    schemas: {
      "all-null": "AllOptionalSchema",
      "all-omitted": "AllOptionalSchema",
      "all-present": "AllOptionalSchema",
      "nullable-elements": "NullableElementsSchema",
      "partially-optional": "PartiallyOptionalSchema",
      "deep-nullable": "DeepNullableSchema",
      "missing-required": "PartiallyOptionalSchema",
      "wrong-type": "AllOptionalSchema",
    },
  },
  collectionVariants: {
    schemaFile: "collectionVariants.schema.ts",
    schemas: {
      lists: "ListVariantsSchema",
      maps: "MapVariantsSchema",
      mappings: "MappingVariantsSchema",
      pairs: "PairVariantsSchema",
      "wrong-list": "ListVariantsSchema",
      "wrong-map": "MapVariantsSchema",
      "wrong-pair": "PairVariantsSchema",
    },
  },
  specialTypes: {
    schemaFile: "specialTypes.schema.ts",
    schemas: {
      durations: "DurationFieldsSchema",
      datasizes: "DataSizeFieldsSchema",
      pairs: "PairFieldsSchema",
      "loose-types": "LooseTypesSchema",
      "wrong-duration": "DurationFieldsSchema",
      "wrong-pair": "PairFieldsSchema",
    },
  },
  emptyAndMinimal: {
    schemaFile: "emptyAndMinimal.schema.ts",
    schemas: {
      empty: "EmptySchema",
      "single-field": "SingleFieldSchema",
      "kitchen-sink": "KitchenSinkSchema",
      "with-parent": "WithParentSchema",
      "float-for-int": "KitchenSinkSchema",
      "negative-uint": "KitchenSinkSchema",
      "single-field-wrong": "SingleFieldSchema",
    },
  },
  stringLiteralEdgeCases: {
    schemaFile: "stringLiteralEdgeCases.schema.ts",
    schemas: {
      endpoint: "EndpointSchema",
      "endpoint-all": "EndpointSchema",
      "unknown-method": "EndpointSchema",
      "wrong-case": "EndpointSchema",
      "unknown-content": "EndpointSchema",
    },
  },
  mixedUnions: {
    schemaFile: "mixedUnions.schema.ts",
    schemas: {
      "task-config": "TaskConfigSchema",
      "inline-unions": "InlineUnionsSchema",
      "optional-unions-null": "OptionalUnionsSchema",
      "optional-unions-omitted": "OptionalUnionsSchema",
      "bad-status": "TaskConfigSchema",
      "bad-direction": "InlineUnionsSchema",
      "bad-singleton": "TaskConfigSchema",
    },
  },
  deepNesting: {
    schemaFile: "deepNesting.schema.ts",
    schemas: {
      matrix: "MatrixSchema",
      "nullable-collections": "NullableCollectionsSchema",
      "nullable-collections-null": "NullableCollectionsSchema",
      "cache-config": "CacheConfigSchema",
      "wrong-nested": "MatrixSchema",
      "flat-instead": "CacheConfigSchema",
    },
  },
  nameOverrides: {
    schemaFile: "nameOverrides.schema.ts",
    schemas: {
      "user-profile": "UserProfileSchema",
      "server-config": "ServerConfigSchema",
      "api-response": "APIResponseSchema",
      "original-field": "UserProfileSchema",
      "missing-renamed": "UserProfileSchema",
    },
  },
  selfReferential: {
    schemaFile: "selfReferential.schema.ts",
    schemas: {
      "org-chart": "OrgChartSchema",
      company: "CompanySchema",
      "missing-nested": "CompanySchema",
      "wrong-nested": "CompanySchema",
    },
  },
  keywordCollisions: {
    schemaFile: "keywordCollisions.schema.ts",
    schemas: {
      "all-keywords": "ConfigSchema",
      "wrong-types": "ConfigSchema",
    },
  },
  nonStringKeys: {
    schemaFile: "nonStringKeys.schema.ts",
    schemas: {
      "int-keyed": "IntKeyedMapSchema",
      "mixed-maps": "MixedMapsSchema",
      "wrong-value": "IntKeyedMapSchema",
    },
  },
  docComments: {
    schemaFile: "docComments.schema.ts",
    schemas: {
      user: "UserSchema",
      location: "LocationSchema",
      "location-no-label": "LocationSchema",
      "missing-user": "UserSchema",
      "wrong-lat": "LocationSchema",
    },
  },
  constrainedTypes: {
    schemaFile: "constrainedTypes.schema.ts",
    schemas: {
      "server-config": "ServerConfigSchema",
      "wrong-types": "ServerConfigSchema",
    },
  },
  "common-auth": {
    schemaFile: "common/auth.schema.ts",
    schemas: {
      user: "UserSchema",
      "api-key": "ApiKeySchema",
      "bad-role": "UserSchema",
    },
  },
  "common-extensible": {
    schemaFile: "common/extensible.schema.ts",
    schemas: {
      provider: "ProviderSchema",
      "missing-name": "ProviderSchema",
    },
  },
  "common-types": {
    schemaFile: "common/types.schema.ts",
    schemas: {
      "geo-point": "GeoPointSchema",
      address: "AddressSchema",
      "wrong-geo": "GeoPointSchema",
    },
  },
  serviceConfig: {
    schemaFile: "serviceConfig.schema.ts",
    schemas: {
      "service-config": "ServiceConfigSchema",
      "missing-service": "ServiceConfigSchema",
    },
  },
};

// ---------------------------------------------------------------------------
// Regenerate if requested
// ---------------------------------------------------------------------------

if (process.argv.includes("--generate")) {
  console.log("Regenerating output...");
  const fixtures = readdirSync(path.join(ROOT, "tests", "fixtures"))
    .filter((f) => f.endsWith(".pkl"))
    .map((f) => `tests/fixtures/${f}`)
    .join(" ");
  execSync(`rm -rf test-output`, { cwd: ROOT });
  execSync(`pkl run gen.pkl --project-dir . -- ${fixtures} --output-path test-output/ts`, {
    cwd: ROOT,
  });
  execSync(`pkl run zod/gen.pkl --project-dir . -- ${fixtures} --output-path test-output/zod`, {
    cwd: ROOT,
  });
  console.log("Done.");
}

// ---------------------------------------------------------------------------
// Find the right schema for a given JSON filename
// ---------------------------------------------------------------------------

function findSchemaName(target: SchemaTarget, jsonFile: string): string | null {
  const base = path.basename(jsonFile, ".json");
  for (const [pattern, schema] of Object.entries(target.schemas)) {
    if (base.startsWith(pattern)) return schema;
  }
  return null;
}

// ---------------------------------------------------------------------------
// Run tests
// ---------------------------------------------------------------------------

async function main() {
  const dataDirs = readdirSync(DATA_DIR).filter((d) =>
    existsSync(path.join(DATA_DIR, d, "valid")) || existsSync(path.join(DATA_DIR, d, "invalid"))
  ).sort();

  for (const dir of dataDirs) {
    const target = SCHEMA_MAP[dir];
    if (!target) {
      console.log(`\n\x1b[33mSkipping ${dir} — no schema mapping defined\x1b[0m`);
      continue;
    }

    const schemaPath = path.join(ZOD_OUT, target.schemaFile);
    if (!existsSync(schemaPath)) {
      console.log(`\n\x1b[33mSkipping ${dir} — schema file not found: ${target.schemaFile}\x1b[0m`);
      continue;
    }

    const mod = await import(schemaPath);

    // --- valid ---
    const validDir = path.join(DATA_DIR, dir, "valid");
    if (existsSync(validDir)) {
      const validFiles = readdirSync(validDir).filter((f) => f.endsWith(".json")).sort();
      if (validFiles.length > 0) {
        section(`${dir} — valid data`);
        for (const file of validFiles) {
          const schemaName = findSchemaName(target, file);
          if (!schemaName) {
            console.log(`  \x1b[33m-\x1b[0m ${file} (no schema pattern match)`);
            continue;
          }
          const schema = mod[schemaName];
          if (!schema) {
            console.log(`  \x1b[33m-\x1b[0m ${file} (schema ${schemaName} not found in module)`);
            continue;
          }
          const data = JSON.parse(readFileSync(path.join(validDir, file), "utf-8"));
          test(`${schemaName}.parse(${file})`, () => {
            schema.parse(data);
          });
        }
      }
    }

    // --- invalid ---
    const invalidDir = path.join(DATA_DIR, dir, "invalid");
    if (existsSync(invalidDir)) {
      const invalidFiles = readdirSync(invalidDir).filter((f) => f.endsWith(".json")).sort();
      if (invalidFiles.length > 0) {
        section(`${dir} — invalid data (must reject)`);
        for (const file of invalidFiles) {
          const schemaName = findSchemaName(target, file);
          if (!schemaName) {
            console.log(`  \x1b[33m-\x1b[0m ${file} (no schema pattern match)`);
            continue;
          }
          const schema = mod[schemaName];
          if (!schema) {
            console.log(`  \x1b[33m-\x1b[0m ${file} (schema ${schemaName} not found in module)`);
            continue;
          }
          const data = JSON.parse(readFileSync(path.join(invalidDir, file), "utf-8"));
          test(`${schemaName}.parse(${file}) throws`, () => {
            let threw = false;
            try {
              schema.parse(data);
            } catch {
              threw = true;
            }
            if (!threw) {
              throw new Error(`Expected ${schemaName} to reject ${file}, but it parsed successfully`);
            }
          });
        }
      }
    }
  }

  // --- summary ---
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
