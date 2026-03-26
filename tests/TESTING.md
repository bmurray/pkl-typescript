# Testing

Three test suites provide layered validation of the generated TypeScript and Zod output.

| Suite | Tests | What it validates |
|---|---|---|
| `run-tests.ts` | 70 | Programmatic: tsc compilation + Zod schema behavior |
| `run-data-tests.ts` | 110 | Data-driven: JSON files parsed/rejected by Zod schemas |
| `run-pkl-data-tests.ts` | 30 | Round-trip: real Pkl instances → JSON → Zod validation |

## Prerequisites

- [Pkl](https://pkl-lang.org/) >= 0.31.0
- [Bun](https://bun.sh/)
- TypeScript and Zod installed: `bun add -d typescript zod`

## Running everything

```bash
# Generate once, then run all three suites
bun tests/run-tests.ts --generate && bun tests/run-data-tests.ts && bun tests/run-pkl-data-tests.ts
```

All three suites also run in CI on every push/PR and as a gate before releases.

## Test suites

### `run-tests.ts` — Integration tests

70 programmatic tests that import the generated Zod schemas and exercise them in code. Validates:

- All generated `.ts` files compile under `tsc --strict`
- Every `.schema.ts` file loads without reference errors (catches schema ordering bugs)
- Schemas accept valid data and reject invalid data
- Discriminated unions, deep inheritance chains, nullable types, collections, special types, integer constraints, string literal enums, name overrides, and cross-module references all behave correctly

```bash
bun tests/run-tests.ts              # run against existing test-output/
bun tests/run-tests.ts --generate   # regenerate from pkl first, then test
```

### `run-data-tests.ts` — Data-driven JSON tests

110 JSON files (65 valid, 45 invalid) across 21 fixture directories. Each file is parsed against its corresponding Zod schema — valid files must pass, invalid files must throw.

```bash
bun tests/run-data-tests.ts              # run against existing test-output/
bun tests/run-data-tests.ts --generate   # regenerate from pkl first, then test
```

### `run-pkl-data-tests.ts` — Pkl round-trip tests

30 Pkl data files that create real class instances, serialize them to JSON via `JsonRenderer`, then validate the JSON against the generated Zod schemas. This is the strongest integration test: if Pkl's own type system produces JSON that the generated Zod schema rejects, the code generator has a bug.

```bash
bun tests/run-pkl-data-tests.ts              # run against existing test-output/
bun tests/run-pkl-data-tests.ts --generate   # regenerate zod output first, then test
```

**Note:** Some Pkl types (Pair, Duration, DataSize, Map with non-string keys) can't be serialized directly to JSON by Pkl's `JsonRenderer`. For Duration/DataSize, use a converter (see `serviceConfig--ServiceConfigSchema--full.pkl` for an example pattern). Pair and non-string-key maps are tested via the JSON data suite instead.

## Directory structure

```
tests/
├── TESTING.md
├── run-tests.ts              # programmatic integration tests
├── run-data-tests.ts         # data-driven JSON parse/reject tests
├── run-pkl-data-tests.ts     # Pkl round-trip tests
├── fixtures/                 # Pkl source files (input to code generation)
│   ├── AbstractUnion.pkl
│   ├── AppConfig.pkl
│   ├── CollectionVariants.pkl
│   ├── ConstrainedTypes.pkl
│   ├── DeepInheritance.pkl
│   ├── DeepNesting.pkl
│   ├── DocComments.pkl
│   ├── EmptyAndMinimal.pkl
│   ├── KeywordCollisions.pkl
│   ├── MixedUnions.pkl
│   ├── MultipleUnions.pkl
│   ├── NameOverrides.pkl
│   ├── NonStringKeys.pkl
│   ├── NullableEverything.pkl
│   ├── SelfReferential.pkl
│   ├── SpecialTypes.pkl
│   ├── StringLiteralEdgeCases.pkl
│   └── common/
│       ├── Auth.pkl
│       ├── Extensible.pkl
│       └── Types.pkl
├── data/                     # JSON test data for run-data-tests.ts
│   ├── abstractUnion/{valid,invalid}/
│   ├── appConfig/{valid,invalid}/
│   ├── ...
│   └── stringLiteralEdgeCases/{valid,invalid}/
└── pkl-data/                 # Pkl instance data for run-pkl-data-tests.ts
    ├── abstractUnion--BaseSchema--variant-a.pkl
    ├── multipleUnions--ShapeSchema--circle.pkl
    ├── ...
    └── nullableEverything--NullableElementsSchema--mixed-nulls.pkl
```

Generated output goes to `test-output/` at the project root (gitignored):

```
test-output/
├── ts/        # TypeScript interfaces (.pkl.ts)
└── zod/       # Zod schemas (.schema.ts)
```

## Adding new test data

### JSON data (for `run-data-tests.ts`)

1. Create a JSON file in `tests/data/<fixture>/valid/` or `tests/data/<fixture>/invalid/`.
2. In `tests/run-data-tests.ts`, find the `SCHEMA_MAP` entry for that fixture and add a filename pattern mapping to the schema export name. The pattern matches against the start of the filename (without `.json`).

Example: to test `FooSchema` from `bar.schema.ts` with a file `tests/data/bar/valid/my-case.json`:

```ts
bar: {
  schemaFile: "bar.schema.ts",
  schemas: {
    "my-case": "FooSchema",
  },
},
```

### Pkl round-trip data (for `run-pkl-data-tests.ts`)

1. Create a `.pkl` file in `tests/pkl-data/` with the naming convention:
   ```
   <schemaFile>--<SchemaName>--<description>.pkl
   ```
   - `<schemaFile>` maps to `test-output/zod/<schemaFile>.schema.ts`
   - `<SchemaName>` is the exported Zod schema to validate against
   - `<description>` is a human-readable label
2. The Pkl file should use `JsonRenderer` and output a class instance as `value`.
3. No mapping file needed — the test runner auto-discovers `.pkl` files.

## Adding new fixtures

1. Create a `.pkl` file in `tests/fixtures/`.
2. All test scripts auto-discover fixtures when using `--generate`.
3. For `run-tests.ts`, add programmatic tests by importing the generated schema and writing `test()` calls.
4. For `run-data-tests.ts`, create a `tests/data/<name>/{valid,invalid}/` directory with JSON files and add a `SCHEMA_MAP` entry.
5. For `run-pkl-data-tests.ts`, create Pkl data files in `tests/pkl-data/` following the naming convention.
