# CI/CD & Code Quality Setup

This project now has automated code quality checks to prevent incomplete or broken code from reaching the main branch.

## ⚠️ **SETUP INCOMPLETE - ACTION REQUIRED**

**Layer 3 (Branch Protection) is NOT yet enabled!**

To complete the setup and fully protect your main branch:
1. Go to GitHub repo → **Settings** → **Branches**
2. Add protection rule for `main` branch (see instructions below)
3. This should be done when co-worker returns from vacation

**Current Status:**
- ✅ Layer 1: Pre-commit hooks (ACTIVE)
- ✅ Layer 2: GitHub Actions CI/CD (ACTIVE)
- ⏳ Layer 3: Branch Protection (PENDING - see section below)

---

## 🛡️ Three Layers of Protection

### 1. **Pre-Commit Hooks (Local Machine)**
**Runs automatically when you commit code**

When you run `git commit`, the following checks happen automatically:
- ✅ **ESLint** - Checks for code quality issues and auto-fixes them
- ✅ **Prettier** - Formats your code consistently
- ✅ **TypeScript** - Type checks all files

**If any check fails, the commit is blocked until you fix the issues.**

#### Bypass (Emergency Only)
```bash
# Only use this in emergencies - NOT recommended!
git commit --no-verify -m "emergency fix"
```

---

### 2. **GitHub Actions CI (Pull Requests)**
**Runs automatically on every PR and push to main**

The CI workflow includes:
- ℹ️ TypeScript type checking (advisory only - shows warnings but doesn't block)
- ℹ️ ESLint code quality checks (advisory only - shows warnings but doesn't block)
- ℹ️ Prettier formatting validation (advisory only - shows warnings but doesn't block)
- ✅ **Build verification (REQUIRED - BLOCKS merges - this is the real validation)**
- ✅ Security audit (moderate level - advisory only)

**Only the BUILD check is required to pass. It catches real breaking issues - missing imports, broken code, etc.**

**Why checks are advisory:**
- **TypeScript**: 379 existing type warnings (Drizzle ORM compatibility issues) - technical debt that doesn't affect runtime
- **ESLint**: Mix of real issues and formatting/style drift - scheduled for cleanup sprint
- **Prettier**: Formatting consistency issues - can be fixed in batches
- **Build**: This is the true validator - if the build passes, the code actually works
- Making linting checks blocking would fail PRs unnecessarily when code is functional

---

### 3. **Branch Protection (GitHub Settings)**
**Enforces quality gates before merging**

To complete the setup, enable branch protection:

1. Go to your GitHub repo → **Settings** → **Branches**
2. Click **Add rule** for `main` branch
3. Enable these settings:
   - ☑️ **Require status checks to pass before merging**
   - ☑️ **Require branches to be up to date before merging**
   - Select: `quality-checks` and `security-audit`
   - ☑️ **Require pull request reviews before merging** (optional but recommended)
4. Click **Create** or **Save changes**

---

## 🚀 Available Commands

### Development
```bash
npm run dev          # Start development server
npm run check        # Run TypeScript type checking
npm run lint         # Run ESLint (fails on warnings)
npm run lint:fix     # Run ESLint and auto-fix issues
npm run format       # Format all files with Prettier
npm run build        # Build for production
```

### Database
```bash
npm run db:push      # Push schema changes to database
```

---

## 📝 What Gets Checked

### TypeScript Files (*.ts, *.tsx)
1. **ESLint** checks for:
   - Code quality issues
   - Unused variables
   - Missing dependencies
   - React best practices
   - TypeScript-specific issues

2. **Prettier** formats:
   - Consistent indentation
   - Semicolons, quotes, etc.
   - Line length limits

3. **TypeScript** verifies:
   - Type correctness
   - Missing imports/exports
   - Type definitions

### Other Files (*.js, *.jsx, *.json, *.css, *.md)
- **Prettier** formatting only

---

## ❌ What Would've Prevented Your Issue

With this setup, incomplete GitHub pulls will be caught:

### Before Your Scenario:
```
Developer commits code with missing User type export
  ↓
❌ Pre-commit hook fails: "Cannot find type 'User'"
⛔ Commit blocked
```

### If They Bypassed Pre-commit:
```
Developer pushes to PR anyway
  ↓
GitHub Actions CI runs...
  ↓
❌ Build check fails: "Cannot find module 'User'"
⛔ PR shows "Checks failed"
🚫 Merge button disabled
  ↓
Developer must fix before merging
```

**Note:** TypeScript check is advisory only (shows 379 warnings but doesn't block). The **build check is the real validator** - it catches missing imports, broken code, and other breaking changes while allowing existing type warnings.

---

## 📁 ESLint Ignore Configuration

ESLint is configured to ignore the following directories to prevent linting errors on non-source files:
- `node_modules/` - Dependencies
- `dist/`, `build/` - Build outputs
- `coverage/` - Test coverage reports
- **`attached_assets/`** - User-uploaded assets (should not be linted)
- `*.config.js`, `*.config.ts` - Configuration files

**Important:** The `attached_assets/` directory contains user-uploaded files and should NOT be committed to the repository. If you see ESLint errors from this directory:
1. Files are already ignored by ESLint (see `eslint.config.js`)
2. Files are excluded from future commits (see `.gitignore`)
3. **Manual cleanup needed:** Run `git rm -r --cached attached_assets/` to untrack files already in the repository

---

## 🧹 Code Quality Debt & Cleanup Plan

**Current Status:**
- **TypeScript**: 379 warnings (Drizzle ORM type compatibility) - non-blocking, doesn't affect runtime
- **ESLint**: Various linting issues - now advisory-only to prevent blocking development
- **Prettier**: Some formatting inconsistencies

**Strategy:**
1. **Build check** remains the gatekeeper - catches real breaking issues
2. **Linting checks** are advisory - show warnings but don't block PRs
3. **Cleanup sprint planned** - Will address ESLint/Prettier technical debt in focused effort
4. **Service worker globals fixed** - Added `/* eslint-env serviceworker */` to `client/public/sw.js`

**Next Steps:**
- Monitor advisory warnings in CI output
- Schedule cleanup sprint when feature velocity stabilizes
- Address high-priority linting issues as they arise

---

## 🔧 Troubleshooting

### Pre-commit hook not running?
```bash
# Reinstall git hooks
npm run prepare
```

### Too many ESLint errors?
```bash
# Auto-fix what's possible
npm run lint:fix

# Then manually fix remaining issues
npm run lint
```

### TypeScript errors?
```bash
# Check what's wrong
npm run check

# Fix the type errors, then commit again
```

---

## 📋 Code Review Checklist

When reviewing PRs, ensure:
- ✅ All CI checks pass (green checkmarks)
- ✅ No TypeScript errors
- ✅ No ESLint warnings
- ✅ Code is properly formatted
- ✅ No security vulnerabilities
- ✅ Changes align with requirements

---

## 🎯 Best Practices

1. **Commit often** - Small commits are easier to review and fix
2. **Fix issues immediately** - Don't bypass checks unless absolutely necessary
3. **Run checks locally** - Use `npm run check` and `npm run lint` before pushing
4. **Keep dependencies updated** - Run `npm audit fix` regularly
5. **Review your own PR** - Check the diff before requesting review

---

## ⚙️ Configuration Files

- `.husky/pre-commit` - Pre-commit hook configuration
- `.github/workflows/ci.yml` - GitHub Actions CI workflow
- `eslint.config.js` - ESLint configuration
- `package.json` - lint-staged configuration

---

**Remember:** These checks exist to catch issues early and maintain code quality. They save time in the long run!
