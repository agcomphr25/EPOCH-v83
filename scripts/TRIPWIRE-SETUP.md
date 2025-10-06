# 🔒 Tripwire Protection Setup

## What This Does
Prevents PRs from modifying critical files that could cause regressions. If a protected file is changed, the CI check fails and blocks the merge.

## Files Created
- `.github/workflows/tripwire-check.yml` - GitHub Actions workflow
- `scripts/tripwire-check.js` - The tripwire check script

## How to Enable (Required Steps)

### 1. Push These Files to GitHub
```bash
git add .github/workflows/tripwire-check.yml scripts/tripwire-check.js
git commit -m "Add tripwire protection for critical files"
git push
```

### 2. Enable Branch Protection on GitHub
1. Go to your repo: `https://github.com/agcomphr25/EPOCH-v83`
2. Click **Settings** → **Branches**
3. Click **Add rule** (or edit existing rule for `main`)
4. In "Branch name pattern": enter `main`
5. Check these boxes:
   - ✅ **Require status checks to pass before merging**
   - ✅ **Require branches to be up to date before merging**
   - Search for and select: **check-protected-files**
   - ✅ **Do not allow bypassing the above settings** (optional but recommended)
6. Click **Save changes**

## How to Use

### Protect More Files
Edit `scripts/tripwire-check.js` and add patterns to the `protectedPatterns` array:

```javascript
const protectedPatterns = [
  /^server\/src\/routes\/customers\.ts$/,
  /^server\/src\/utils\/upsAddressValidation\.ts$/,
  /^client\/src\/pages\/OrdersManagementPage\.tsx$/,  // Add this
  /^server\/schema\.ts$/,  // Protect schema file
];
```

### Allow Changes to a Protected File
1. Edit `scripts/tripwire-check.js`
2. Comment out or remove the pattern
3. Commit and push the change
4. Now PRs can modify that file

### Test Locally
```bash
node scripts/tripwire-check.js
```

## Pattern Examples

```javascript
// Exact file match
/^server\/src\/routes\/customers\.ts$/

// Any file in a directory
/^server\/src\/routes\//

// Specific file types in a directory
/^client\/src\/pages\/.*\.tsx$/

// Multiple directories
/^(server|client)\/.*\.ts$/

// Anything in a folder (recursive)
/^config\//
```

## How It Works
1. PR is opened/updated
2. GitHub Actions runs tripwire check
3. Script compares PR branch to `main`
4. If protected files changed → CI fails → PR blocked
5. If no protected files changed → CI passes → PR can merge

## Current Protected Files
- `server/src/routes/customers.ts`
- `server/src/utils/upsAddressValidation.ts`
