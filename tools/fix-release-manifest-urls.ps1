[CmdletBinding()]
param(
	# Tags to fix. Matching is exact and case-sensitive.
	# Accepts a list ("v1.2.3","v1.2.4") or a single string that may contain commas/semicolons/newlines.
	[Parameter(Mandatory = $true, Position = 0)]
	[object]$Tags,

	# Name of the manifest asset in each release.
	[string]$ManifestAssetName = 'module.json',

	# Name of the zip asset in each release (used to populate the manifest's `download` URL).
	# Default: "<repo>.zip".
	[string]$ZipAssetName,

	# If set, only update when existing URLs contain `/releases/latest/`.
	[switch]$OnlyIfLatest,

	# If set, also update the `module.json` inside the release zip asset and re-upload the zip.
	[switch]$FixZip,

	# If set, rewrites JSON formatting (pretty-printed) even when URLs are already correct.
	# Useful for re-running on already-fixed releases to clean up layout.
	[switch]$ReformatJson,

	# Preview only; do not upload changes.
	[switch]$DryRun = $true,

	# Skip confirmation prompts.
	[switch]$Force,

	# Explicit repo slug "owner/repo". If omitted, derived from `git remote get-url origin`.
	[string]$Repo,

	# Optional path to gh.exe for Windows environments where PATH isn't refreshed.
	[string]$GhPath = "C:\\Program Files\\GitHub CLI\\gh.exe"
)

$ErrorActionPreference = 'Stop'

function Write-Info([string]$Message) { Write-Host $Message }
function Write-Warn([string]$Message) { Write-Warning $Message }

function Normalize-Text {
	param([string]$Text)
	if ($null -eq $Text) { return "`n" }
	$t = $Text -replace "`r`n", "`n"
	$t = $t -replace "`r", "`n"
	if (-not $t.EndsWith("`n")) { $t += "`n" }
	return $t
}

function Format-GhError {
	param([string]$Raw)
	if ($null -eq $Raw) { return '' }
	# gh can emit multi-line error text; make it warning-friendly.
	return (($Raw -replace '\s+', ' ').Trim())
}

function Invoke-GhApiJson {
	param([string]$Endpoint)

	$raw = (& gh api $Endpoint 2>&1 | Out-String)
	$exit = $LASTEXITCODE
	if ($exit -ne 0) {
		throw (Format-GhError -Raw $raw)
	}

	if ([string]::IsNullOrWhiteSpace($raw)) { return $null }
	try {
		return ($raw | ConvertFrom-Json)
	} catch {
		throw "Failed to parse JSON from 'gh api $Endpoint': $($_.Exception.Message)"
	}
}

function Resolve-RepoSlug {
	param([string]$Explicit)
	if ($Explicit) { return $Explicit }

	$git = Get-Command git -ErrorAction SilentlyContinue
	if (-not $git) { throw 'git is required to auto-detect the repo. Either install git or pass -Repo owner/repo.' }

	$originUrl = (git remote get-url origin 2>$null)
	if (-not $originUrl) { throw 'Unable to read `git remote get-url origin`. Pass -Repo owner/repo.' }

	# Supports:
	# - https://github.com/owner/repo.git
	# - https://github.com/owner/repo
	# - git@github.com:owner/repo.git
	# - git@github.com:owner/repo
	$originUrl = $originUrl.Trim()
	$owner = $null
	$repo = $null

	if ($originUrl -match '^https?://github\.com/(?<owner>[^/]+)/(?<repo>[^/]+?)(?:\.git)?$') {
		$owner = $Matches.owner
		$repo = $Matches.repo
	} elseif ($originUrl -match '^git@github\.com:(?<owner>[^/]+)/(?<repo>[^/]+?)(?:\.git)?$') {
		$owner = $Matches.owner
		$repo = $Matches.repo
	} else {
		throw "Unrecognized origin URL format: $originUrl. Pass -Repo owner/repo."
	}

	return "$owner/$repo"
}

function Parse-Tags {
	param([object]$InputTags)

	if ($InputTags -is [string]) {
		$raw = $InputTags
		return @(
			$raw -split '[,;\r\n]+' |
			ForEach-Object { $_.Trim() } |
			Where-Object { $_ -ne '' } |
			Select-Object -Unique
		)
	}

	if ($InputTags -is [System.Collections.IEnumerable]) {
		return @(
			$InputTags |
			ForEach-Object { "$_".Trim() } |
			Where-Object { $_ -ne '' } |
			Select-Object -Unique
		)
	}

	return @("$InputTags".Trim())
}

function Ensure-GhAuth {
	$gh = Get-Command gh -ErrorAction SilentlyContinue
	if (-not $gh) {
		if (-not (Test-Path $GhPath)) {
			throw 'GitHub CLI (gh) is required. Install it, then run `gh auth login`.'
		}
		Set-Alias -Name gh -Value $GhPath -Scope Script
	}

	& gh auth status 1>$null 2>$null
	if ($LASTEXITCODE -ne 0) {
		throw 'gh is not authenticated. Run `gh auth login` and try again.'
	}
}

function Get-AllReleases {
	param(
		[string]$RepoSlug
	)

	$all = New-Object System.Collections.Generic.List[object]
	$page = 1
	while ($true) {
		$endpoint = "/repos/$RepoSlug/releases?per_page=100&page=$page"
		$pageItems = @(Invoke-GhApiJson -Endpoint $endpoint)
		if (-not $pageItems -or $pageItems.Count -eq 0) { break }
		foreach ($r in $pageItems) { $all.Add($r) }
		if ($pageItems.Count -lt 100) { break }
		$page++
	}

	return $all
}

function Get-ReleaseByTag {
	param(
		[string]$RepoSlug,
		[string]$Tag
	)

	# Fast path: works for most non-draft releases
	try {
		return (Invoke-GhApiJson -Endpoint "/repos/$RepoSlug/releases/tags/$Tag")
	} catch {
		# Draft releases can make the tag endpoint 404; fall back to listing.
		$msg = $_.Exception.Message
		if ($msg -notmatch 'Not Found') {
			throw
		}
	}

	# Fall back: drafts can make the tag endpoint 404; list all releases (includes drafts) and match.
	$all = Get-AllReleases -RepoSlug $RepoSlug
	return ($all | Where-Object { $_.tag_name -eq $Tag } | Select-Object -First 1)
}

Ensure-GhAuth

$repoSlug = Resolve-RepoSlug -Explicit $Repo
$owner, $repoName = $repoSlug.Split('/', 2)
if (-not $ZipAssetName) { $ZipAssetName = "$repoName.zip" }

$tagList = Parse-Tags -InputTags $Tags
if ($tagList.Count -eq 0) { throw 'No tags provided after parsing.' }

Write-Info "Repo: $repoSlug"
Write-Info "Tags ($($tagList.Count)): $($tagList -join ', ')"
Write-Info "Manifest asset: $ManifestAssetName"
Write-Info "Zip asset:      $ZipAssetName"
$modeParts = @()
$modeParts += if ($DryRun) { 'DRY-RUN' } else { 'LIVE' }
$modeParts += if ($OnlyIfLatest) { 'OnlyIfLatest' } else { 'UpdateIfDifferent' }
$modeParts += if ($FixZip) { 'FixZip' } else { 'ManifestOnly' }
$modeParts += if ($ReformatJson) { 'ReformatJson' } else { 'NoReformat' }
Write-Info ("Mode:           " + ($modeParts -join ' '))

if (-not $Force) {
	Write-Warn 'Tag matching is exact and case-sensitive (e.g. KEEP/Tags must include the v-prefix if your tags have it).'
	$confirmation = Read-Host 'Continue? (y/N)'
	if ($confirmation -notin @('y', 'Y', 'yes', 'YES')) { Write-Info 'Aborted.'; exit 0 }
}

$tmpRoot = Join-Path $env:TEMP ("fix-release-manifest-urls-" + [Guid]::NewGuid().ToString('N'))
New-Item -ItemType Directory -Path $tmpRoot 1>$null

$updated = 0
$updatedManifest = 0
$updatedZip = 0
$skipped = 0
$unchanged = 0
$failed = 0

try {
	foreach ($tag in $tagList) {
		Write-Info "`n--- $tag ---"

		$release = $null
		try {
			$release = Get-ReleaseByTag -RepoSlug $repoSlug -Tag $tag
			if (-not $release) { throw "Release not found by tag (including drafts)." }
		} catch {
			Write-Warn "Unable to fetch release for tag '$tag' (does it exist as a release?): $($_.Exception.Message)"
			$failed++
			continue
		}

		$assets = @($release.assets)
		$manifestAsset = $assets | Where-Object { $_.name -eq $ManifestAssetName } | Select-Object -First 1
		if (-not $manifestAsset) {
			Write-Warn "Release has no asset named '$ManifestAssetName'. Skipping."
			$skipped++
			continue
		}

		$zipAsset = $assets | Where-Object { $_.name -eq $ZipAssetName } | Select-Object -First 1
		if ($FixZip -and -not $zipAsset) {
			Write-Warn "Release has no asset named '$ZipAssetName'. Will skip zip update, but may still update '$ManifestAssetName'."
		}

		$desiredManifest = "https://github.com/$repoSlug/releases/download/$tag/$ManifestAssetName"
		$desiredDownload = "https://github.com/$repoSlug/releases/download/$tag/$ZipAssetName"

		$tagDir = Join-Path $tmpRoot $tag
		New-Item -ItemType Directory -Path $tagDir 1>$null

		# Download current module.json asset
		try {
			& gh release download $tag --repo $repoSlug --pattern $ManifestAssetName --dir $tagDir 1>$null
			if ($LASTEXITCODE -ne 0) { throw "gh release download exited with code $LASTEXITCODE" }
		} catch {
			Write-Warn "Failed to download $ManifestAssetName for ${tag}: $($_.Exception.Message)"
			$failed++
			continue
		}

		$manifestPath = Join-Path $tagDir $ManifestAssetName
		if (-not (Test-Path $manifestPath)) {
			Write-Warn "Downloaded file not found at $manifestPath"
			$failed++
			continue
		}

		$manifestRaw = Get-Content -Path $manifestPath -Raw
		$manifestJson = $manifestRaw | ConvertFrom-Json
		$currentManifest = "$($manifestJson.manifest)"
		$currentDownload = "$($manifestJson.download)"
		$externalHasLatest = (($currentManifest -like '*/releases/latest/*') -or ($currentDownload -like '*/releases/latest/*'))

		$innerManifestPath = $null
		$innerJson = $null
		$innerRaw = $null
		$innerCurrentManifest = $null
		$innerCurrentDownload = $null
		$zipHasLatest = $false

		if ($FixZip -and $zipAsset) {
			# Download zip asset
			try {
				& gh release download $tag --repo $repoSlug --pattern $ZipAssetName --dir $tagDir 1>$null
				if ($LASTEXITCODE -ne 0) { throw "gh release download exited with code $LASTEXITCODE" }
			} catch {
				Write-Warn "Failed to download $ZipAssetName for ${tag}: $($_.Exception.Message)"
				$failed++
				continue
			}

			$zipPath = Join-Path $tagDir $ZipAssetName
			if (-not (Test-Path $zipPath)) {
				Write-Warn "Downloaded zip not found at $zipPath"
				$failed++
				continue
			}

			$extractDir = Join-Path $tagDir 'zip-extract'
			Remove-Item -Path $extractDir -Recurse -Force -ErrorAction SilentlyContinue
			try {
				Expand-Archive -Path $zipPath -DestinationPath $extractDir -Force
			} catch {
				Write-Warn "Failed to expand zip for ${tag}: $($_.Exception.Message)"
				$failed++
				continue
			}

			# Locate module.json inside the expanded zip
			$candidate = Join-Path $extractDir $ManifestAssetName
			if (Test-Path $candidate) {
				$innerManifestPath = $candidate
			} else {
				$rootDirs = @(Get-ChildItem -Path $extractDir -Directory -ErrorAction SilentlyContinue)
				if ($rootDirs.Count -eq 1) {
					$candidate = Join-Path $rootDirs[0].FullName $ManifestAssetName
					if (Test-Path $candidate) { $innerManifestPath = $candidate }
				}
				if (-not $innerManifestPath) {
					$firstMatch = Get-ChildItem -Path $extractDir -Recurse -File -Filter $ManifestAssetName -ErrorAction SilentlyContinue | Select-Object -First 1
					if ($firstMatch) { $innerManifestPath = $firstMatch.FullName }
				}
			}

			if (-not $innerManifestPath) {
				Write-Warn "Could not find '$ManifestAssetName' inside $ZipAssetName for $tag. Will skip zip update."
			} else {
				try {
					$innerRaw = Get-Content -Path $innerManifestPath -Raw
					$innerJson = $innerRaw | ConvertFrom-Json
					$innerCurrentManifest = "$($innerJson.manifest)"
					$innerCurrentDownload = "$($innerJson.download)"
					$zipHasLatest = (($innerCurrentManifest -like '*/releases/latest/*') -or ($innerCurrentDownload -like '*/releases/latest/*'))
				} catch {
					Write-Warn "Failed to parse '$ManifestAssetName' inside zip for ${tag}: $($_.Exception.Message)"
					$innerManifestPath = $null
					$innerJson = $null
				}
			}
		}

		if ($OnlyIfLatest) {
			if (-not ($externalHasLatest -or $zipHasLatest) -and -not $ReformatJson) {
				Write-Info 'No `/releases/latest/` URLs detected (manifest or zip); skipping due to -OnlyIfLatest.'
				$skipped++
				continue
			}
		}

		$changedManifest = $false
		if ($currentManifest -ne $desiredManifest) { $manifestJson.manifest = $desiredManifest; $changedManifest = $true }
		if ($currentDownload -ne $desiredDownload) { $manifestJson.download = $desiredDownload; $changedManifest = $true }

		$changedZip = $false
		if ($FixZip -and $innerJson -and $innerManifestPath) {
			if ($innerCurrentManifest -ne $desiredManifest) { $innerJson.manifest = $desiredManifest; $changedZip = $true }
			if ($innerCurrentDownload -ne $desiredDownload) { $innerJson.download = $desiredDownload; $changedZip = $true }
		}

		$manifestText = ($manifestJson | ConvertTo-Json -Depth 100) + "`n"
		if ($ReformatJson -and -not $changedManifest) {
			if ((Normalize-Text -Text $manifestRaw) -ne (Normalize-Text -Text $manifestText)) {
				$changedManifest = $true
			}
		}

		$innerText = $null
		if ($FixZip -and $innerJson -and $innerManifestPath) {
			$innerText = ($innerJson | ConvertTo-Json -Depth 100) + "`n"
			if ($ReformatJson -and -not $changedZip -and $null -ne $innerRaw) {
				if ((Normalize-Text -Text $innerRaw) -ne (Normalize-Text -Text $innerText)) {
					$changedZip = $true
				}
			}
		}

		if (-not $changedManifest -and -not $changedZip) {
			Write-Info 'Already correct; no changes needed.'
			$unchanged++
			continue
		}

		if ($changedManifest) {
			[System.IO.File]::WriteAllText(
				$manifestPath,
				$manifestText,
				(New-Object System.Text.UTF8Encoding($false))
			)
		}

		if ($changedZip -and $innerJson -and $innerManifestPath) {
			[System.IO.File]::WriteAllText(
				$innerManifestPath,
				$innerText,
				(New-Object System.Text.UTF8Encoding($false))
			)
		}

		$toUpdate = @()
		if ($changedManifest) { $toUpdate += $ManifestAssetName }
		if ($changedZip) { $toUpdate += $ZipAssetName }
		Write-Info 'Will set manifest:'
		Write-Info "  $desiredManifest"
		Write-Info 'Will set download:'
		Write-Info "  $desiredDownload"
		Write-Info ("Will update: " + ($toUpdate -join ', '))

		if ($DryRun) {
			Write-Info 'DRY-RUN: not uploading.'
			$updated++
			if ($changedManifest) { $updatedManifest++ }
			if ($changedZip) { $updatedZip++ }
			continue
		}

		if ($changedManifest) {
			try {
				& gh release upload $tag $manifestPath --repo $repoSlug --clobber 1>$null
				if ($LASTEXITCODE -ne 0) { throw "gh release upload exited with code $LASTEXITCODE" }
				Write-Info "Uploaded updated $ManifestAssetName (clobber)."
				$updatedManifest++
			} catch {
				Write-Warn "Upload failed for $tag ($ManifestAssetName): $($_.Exception.Message)"
				$failed++
				continue
			}
		}

		if ($changedZip -and $zipAsset) {
			try {
				$zipPath = Join-Path $tagDir $ZipAssetName
				$extractDir = Join-Path $tagDir 'zip-extract'
				Compress-Archive -Path (Join-Path $extractDir '*') -DestinationPath $zipPath -Force
				& gh release upload $tag $zipPath --repo $repoSlug --clobber 1>$null
				if ($LASTEXITCODE -ne 0) { throw "gh release upload exited with code $LASTEXITCODE" }
				Write-Info "Uploaded updated $ZipAssetName (clobber)."
				$updatedZip++
			} catch {
				Write-Warn "Upload failed for $tag ($ZipAssetName): $($_.Exception.Message)"
				$failed++
				continue
			}
		}

		$updated++
	}
} finally {
	Remove-Item -Path $tmpRoot -Recurse -Force -ErrorAction SilentlyContinue
}

Write-Info "`nDone. Tags changed: $updated (manifest: $updatedManifest, zip: $updatedZip) | Unchanged: $unchanged | Skipped: $skipped | Failed: $failed"
