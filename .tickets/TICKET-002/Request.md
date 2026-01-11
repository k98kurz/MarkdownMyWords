# [TICKET-002] Project Setup and Tooling

## Metadata
- **Status**: done
- **Complexity**: simple
- **Service(s)**: frontend
- **Created**: 2026-01-11
- **Estimate**: 2h

## Request

Set up the project foundation with React, Vite, TypeScript, and all necessary dependencies for the MarkdownMyWords application.

### User Story

As a developer, I want a properly configured project with all tooling and dependencies so that I can start building the application features.

### Requirements

1. **Project Initialization**
   - Initialize Vite project with React + TypeScript template
   - Configure TypeScript with strict mode
   - Set up project structure (src/, public/, etc.)

2. **Dependencies**
   - React 18.0.0+
   - TypeScript 5.0.0+
   - Vite 4.0.0+
   - Zustand for state management
   - CodeMirror 6 for editor
   - react-markdown for rendering
   - GunDB for database
   - ESLint and Prettier for code quality

3. **Configuration**
   - Vite configuration optimized for production
   - TypeScript configuration with strict types
   - ESLint configuration for React + TypeScript
   - Prettier configuration
   - Git configuration (.gitignore)

4. **Project Structure**
   - Organized folder structure
   - Component organization
   - Service layer structure
   - Type definitions

## Acceptance Criteria

- [ ] Vite project initialized with React + TypeScript
- [ ] All dependencies installed and configured
- [ ] TypeScript configured with strict mode
- [ ] ESLint and Prettier configured
- [ ] Project structure created
- [ ] Development server runs successfully
- [ ] Build process works correctly
- [ ] .gitignore configured appropriately

## Technical Notes

### Dependencies to Install

**Production**:
- react, react-dom
- gun
- zustand
- @codemirror/view, @codemirror/state, @codemirror/lang-markdown
- react-markdown, remark-gfm
- Web Crypto API (native, no package needed)

**Development**:
- typescript
- vite
- @types/react, @types/react-dom
- @typescript-eslint/eslint-plugin, @typescript-eslint/parser
- eslint, eslint-plugin-react
- prettier

### Project Structure

```
markdownmywords/
├── src/
│   ├── components/
│   ├── services/
│   ├── stores/
│   ├── types/
│   ├── utils/
│   ├── App.tsx
│   └── main.tsx
├── public/
├── .gitignore
├── package.json
├── tsconfig.json
├── vite.config.ts
├── eslint.config.js
└── prettier.config.js
```

## Related

- TICKET-001: Architecture planning (reference for decisions)
- Vite Documentation: https://vitejs.dev/
- React Documentation: https://react.dev/
- TypeScript Documentation: https://www.typescriptlang.org/
