/** @type {import('jest').Config} */
const config = {
  preset: "ts-jest",
  testEnvironment: "node",
  roots: ["<rootDir>/src"],
  moduleNameMapper: {
    "^@code-charter/types$": "<rootDir>/../types/src/index.ts",
  },
};

module.exports = config;
