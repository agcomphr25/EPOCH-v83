# Code Quality Guide

## Overview
This project now has comprehensive linting and formatting setup to prevent code drift and maintain consistent code quality.

## Tools Installed

### ESLint (v9.32.0)
- **Purpose**: Code quality and style enforcement
- **Configuration**: `eslint.config.js`
- **Rules**: TypeScript, React, React Hooks, Import ordering, Prettier integration

### Prettier (v3.6.2)
- **Purpose**: Code formatting
- **Configuration**: `.prettierrc`
- **Integration**: Works with ESLint via `eslint-plugin-prettier`

### Lint-staged
- **Purpose**: Run linting only on staged files
- **Configuration**: `.lintstagedrc.json`

## Available Commands

Since we cannot modify package.json, use these direct commands:

```bash
# Lint all files
npx eslint . --ext .js,.jsx,.ts,.tsx

# Lint and auto-fix issues
npx eslint . --ext .js,.jsx,.ts,.tsx --fix

# Format all files
npx prettier --write .

# Check formatting without changing files
npx prettier --check .

# Type check
npm run check

# Run lint-staged manually
npx lint-staged
```

## Development Workflow

### Daily Development
1. **Write code normally**
2. **Before committing**: Run `npx eslint . --fix && npx prettier --write .`
3. **Type check**: Run `npm run check`
4. **Fix any remaining issues manually**

### VS Code Integration
- Install these extensions:
  - ESLint (dbaeumer.vscode-eslint)
  - Prettier (esbenp.prettier-vscode)
- VS Code settings are configured in `.vscode/settings.json`
- Auto-formatting and linting will happen on save

## Common Issues and Fixes

### Import Ordering
```javascript
// ❌ Wrong
import { Button } from '@/components/ui/button';
import React from 'react';
import axios from 'axios';

// ✅ Correct
import React from 'react';

import axios from 'axios';

import { Button } from '@/components/ui/button';
```

### Unused Imports
```javascript
// ❌ Wrong - unused imports
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Building } from 'lucide-react';

// ✅ Correct - remove unused
// (only import what you use)
```

### Formatting Issues
- Use single quotes for strings
- Trailing commas where appropriate
- Consistent spacing and indentation
- Line length limit of 80 characters

## Code Quality Rules

### TypeScript Rules
- Unused variables prefixed with `_` are allowed
- `any` type triggers warnings (should be avoided)
- Implicit return types are allowed

### React Rules
- No need to import React (JSX transform handles it)
- Hooks rules enforced (rules of hooks, dependency arrays)
- Prop types not required (TypeScript handles this)

### Import Rules
- Organized in groups: builtin, external, internal, relative
- Empty lines between groups
- Alphabetical sorting within groups

## Preventing Code Drift

### Before Each Commit
```bash
# Full quality check
npx eslint . --fix
npx prettier --write .
npm run check
```

### Weekly Maintenance
```bash
# Check for new linting issues
npx eslint . --ext .js,.jsx,.ts,.tsx

# Audit formatting consistency
npx prettier --check .
```

### Monthly Review
- Review and update ESLint rules as needed
- Check for new best practices
- Update dependencies: `npm update`

## Benefits

✅ **Consistent Code Style**: All code follows the same formatting rules  
✅ **Early Error Detection**: Catch issues before they reach production  
✅ **Import Organization**: Clean, organized import statements  
✅ **TypeScript Integration**: Full type checking with linting  
✅ **React Best Practices**: Hooks rules and component patterns enforced  
✅ **Automated Fixing**: Most issues auto-fixable with `--fix` flag  

## Current Status

The linting setup caught several existing issues:
- Import ordering problems
- Unused imports (Alert, AlertDescription, Building)
- Formatting inconsistencies
- Missing empty lines between import groups

These are normal for an existing codebase and can be fixed gradually or all at once with the auto-fix commands.