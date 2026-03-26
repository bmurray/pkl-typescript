# Testing

Two test suites validate that generated TypeScript and Zod output is correct.

## Prerequisites

- [Pkl](https://pkl-lang.org/) >= 0.31.0
- [Bun](https://bun.sh/)
- TypeScript and Zod installed: `bun add -d typescript zod`

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

## Directory structure

```
tests/
├── TESTING.md
├── run-tests.ts              # programmatic integration tests
├── run-data-tests.ts         # data-driven JSON parse/reject tests
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
└── data/                     # JSON test data for run-data-tests.ts
    ├── abstractUnion/{valid,invalid}/
    ├── appConfig/{valid,invalid}/
    ├── collectionVariants/{valid,invalid}/
    ├── ...
    └── stringLiteralEdgeCases/{valid,invalid}/
```

Generated output goes to `test-output/` at the project root (gitignored):

```
test-output/
├── ts/        # TypeScript interfaces (.pkl.ts)
└── zod/       # Zod schemas (.schema.ts)
```

## Adding new test data

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

## Adding new fixtures

1. Create a `.pkl` file in `tests/fixtures/`.
2. Both test scripts auto-discover fixtures — `run-tests.ts` finds all `.pkl` files when using `--generate`, and `run-data-tests.ts` uses the same discovery.
3. For `run-tests.ts`, add programmatic tests by importing the generated schema and writing `test()` calls.
4. For `run-data-tests.ts`, create a `tests/data/<name>/{valid,invalid}/` directory with JSON files and add a `SCHEMA_MAP` entry.

## Running everything

```bash
bun tests/run-tests.ts --generate && bun tests/run-data-tests.ts
```
