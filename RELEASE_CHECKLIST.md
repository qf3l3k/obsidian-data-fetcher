# Release Checklist (Public GitHub)

Use this flow when publishing `1.0.7`, `1.0.8`, `1.0.9`, etc. to the public repo without force-pushing `main`.

## 1) Pick release version

- Set a target version, for example: `1.0.7`.
- Ensure these files match that version:
  - `manifest.json`
  - `versions.json` (must include the target entry)
  - `package.json`
  - `package-lock.json`

## 2) Validate locally

```powershell
cmd /c npx tsc -noEmit -skipLibCheck
cmd /c npm run build
```

## 3) Create release commit/tag on internal main

```powershell
git checkout main
git pull origin main
git status --short
git add manifest.json versions.json package.json package-lock.json CHANGELOG.md README.md
git commit -m "release: 1.0.7"
git tag 1.0.7
git push origin main --tags
```

## 4) Prepare public PR branch from `public/main`

```powershell
git fetch public --tags
git checkout -B public-fix-1.0.7 public/main
```

## 5) Copy release metadata from tag to PR branch

```powershell
git checkout 1.0.7 -- manifest.json versions.json package.json package-lock.json
```

## 6) Sanity check diff (must be version metadata only)

```powershell
git diff -- manifest.json versions.json package.json package-lock.json
git status --short
```

## 7) Commit and push PR branch

```powershell
git add manifest.json versions.json package.json package-lock.json
git commit -m "public: bump release metadata to 1.0.7"
git push public public-fix-1.0.7
```

## 8) Open and merge PR

- Open:
  - `https://github.com/qf3l3k/obsidian-data-fetcher/pull/new/public-fix-1.0.7`
- Merge into `public/main`.

## 9) Publish GitHub release assets for tag `1.0.7`

- Upload files built from the same tag:
  - `manifest.json`
  - `main.js`
  - `styles.css`

## 10) Verify end-user update path

- In Obsidian:
  - Check plugin version visible in Community Plugins.
  - Run update from previous version and confirm it upgrades to target.

---

## Quick Command Template

Replace `1.0.7` with your target version before running:

```powershell
# 0) Variables
$V = "1.0.7"

# 1) Internal release
git checkout main
git pull origin main
cmd /c npx tsc -noEmit -skipLibCheck
cmd /c npm run build
git add manifest.json versions.json package.json package-lock.json CHANGELOG.md README.md
git commit -m "release: $V"
git tag $V
git push origin main --tags

# 2) Public PR branch
git fetch public --tags
git checkout -B "public-fix-$V" public/main
git checkout $V -- manifest.json versions.json package.json package-lock.json
git add manifest.json versions.json package.json package-lock.json
git commit -m "public: bump release metadata to $V"
git push public "public-fix-$V"

# 3) Open PR URL manually
Write-Output "Open: https://github.com/qf3l3k/obsidian-data-fetcher/pull/new/public-fix-$V"
```
