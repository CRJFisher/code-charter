/** @type {import('jest').Config} */
const config = {
  preset: "ts-jest",
  testEnvironment: "node",
  roots: ["<rootDir>/src"],
  moduleNameMapper: {
    "^@code-charter/types$": "<rootDir>/../types/src/index.ts",
    "^@code-charter/core$": "<rootDir>/../core/src/index.ts",
  },
  transform: {
    "^.+\\.tsx?$": ["ts-jest", { tsconfig: "packages/drift/tsconfig.jest.json" }],
  },
};

// Ariadne Project state accumulates per worker process; once several HeadlessProject-heavy suites
// share one worker, indexing starts returning empty results mid-run. The package `test` script
// therefore runs each Ariadne-heavy reconcile suite in its own jest process (a fresh worker is what
// running a suite in isolation does); this config is shared by all of those invocations.

module.exports = config;
