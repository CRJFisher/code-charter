---
id: task-6.1
title: Set up monorepo structure for code-charter packages
status: Done
assignee:
  - '@claude'
created_date: '2025-08-01'
updated_date: '2025-08-01'
labels: []
dependencies: []
parent_task_id: task-6
---

## Description

Create the foundational monorepo structure using npm/yarn workspaces to support multiple packages including the extracted UI package. This will enable proper package management and development workflows.

## Acceptance Criteria

- [x] Monorepo structure created with packages/ directory
- [x] Root package.json configured with workspaces
- [x] Basic build tooling set up (Turborepo or similar)
- [x] Development scripts work across packages
- [x] Package linking configured for local development


## Implementation Plan

1. Research current project structure and dependencies
2. Create packages/ directory structure
3. Move existing code to packages/vscode-extension
4. Configure npm workspaces in root package.json
5. Set up Turborepo for build orchestration
6. Configure TypeScript paths for cross-package imports
7. Update build scripts to work with monorepo structure
8. Test development workflow across packages

## Implementation Notes

Successfully set up monorepo structure with npm workspaces and Turborepo. Created packages/ directory containing ui/ and vscode/ (moved from code-charter-vscode). Configured root package.json with npm workspaces, added Turborepo for build orchestration, and integrated Changesets for version management. All build scripts (build, dev, lint, test, typecheck, clean) work across packages. Package linking is configured - @code-charter/ui can be imported by @code-charter/vscode. Modified files: package.json, turbo.json, tsconfig.json, .changeset/config.json, packages/ui/*, packages/vscode/package.json
## Technical Details

### Proposed Package Structure
```
code-charter/
├── packages/
│   ├── ui/                    # @code-charter/ui package
│   │   ├── src/
│   │   │   ├── components/    # React components
│   │   │   ├── backends/      # Backend implementations
│   │   │   ├── themes/        # Theme providers
│   │   │   └── index.ts       # Main exports
│   │   ├── package.json
│   │   └── webpack.config.js
│   └── vscode-extension/      # Current code-charter-vscode
│       └── ...
└── package.json               # Root package.json for workspaces
```

### Key Requirements
- Use npm/yarn workspaces for package management
- Configure build orchestration for efficient builds
- Support for TypeScript project references
- Shared configuration files (tsconfig, eslint, etc.)
