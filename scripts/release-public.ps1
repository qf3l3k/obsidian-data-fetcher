param(
    [Parameter(Mandatory = $true)]
    [string]$Version
)

$ErrorActionPreference = "Stop"

function Require-CleanTree {
    $status = git status --porcelain
    if ($LASTEXITCODE -ne 0) {
        throw "Failed to read git status."
    }
    $dirty = $status | Where-Object { $_ -notmatch '^\?\?\s+DEV_NOTES\.md$' }
    if ($dirty) {
        throw "Working tree is not clean. Commit/stash changes before running release script."
    }
}

function Require-Ref([string]$RefName) {
    git rev-parse --verify $RefName *> $null
    if ($LASTEXITCODE -ne 0) {
        throw "Missing required ref: $RefName"
    }
}

Write-Host "==> Releasing version $Version"
Require-CleanTree

Write-Host "==> Internal release on origin/main"
git checkout main
git pull origin main
cmd /c npx tsc -noEmit -skipLibCheck
cmd /c npm run build
git add manifest.json versions.json package.json package-lock.json CHANGELOG.md README.md
git commit -m "release: $Version"
git tag $Version
git push origin main --tags

Write-Host "==> Preparing PR branch from public/main"
git fetch public --tags
Require-Ref "public/main"
Require-Ref $Version

$branch = "public-fix-$Version"
git checkout -B $branch public/main
git checkout $Version -- manifest.json versions.json package.json package-lock.json
git add manifest.json versions.json package.json package-lock.json
git commit -m "public: bump release metadata to $Version"
git push public $branch

Write-Host "==> Open PR:"
Write-Host "https://github.com/qf3l3k/obsidian-data-fetcher/pull/new/$branch"
