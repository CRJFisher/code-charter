---
id: task-6.1
title: Set up monorepo structure for code-charter packages
status: To Do
assignee: []
created_date: '2025-08-01'
labels: []
dependencies: []
parent_task_id: task-6
---

## Description

Create the foundational monorepo structure using npm/yarn workspaces to support multiple packages including the extracted UI package. This will enable proper package management and development workflows.

## Acceptance Criteria

- [ ] Monorepo structure created with packages/ directory
- [ ] Root package.json configured with workspaces
- [ ] Basic build tooling set up (Turborepo or similar)
- [ ] Development scripts work across packages
- [ ] Package linking configured for local development

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
