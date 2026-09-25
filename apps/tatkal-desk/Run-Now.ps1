# Tatkal Desk - copy to Desktop and start (right-click, Run with PowerShell).
# ASCII only. Never runs next from AgentStores / docs / nested Tatkal-Desk-Desktop.
$ErrorActionPreference = 'Continue'

Write-Host "========================================"
Write-Host "  Tatkal Desk - starting..."
Write-Host "========================================"
Write-Host ""

$desktop = Join-Path $env:USERPROFILE 'Desktop'
$appDir = Join-Path $desktop 'Tatkal-Desk'
$here = $PSScriptRoot
if (-not $here) {
  $here = Split-Path -Parent $MyInvocation.MyCommand.Path
}
$here = [IO.Path]::GetFullPath($here).TrimEnd('\')
$appDir = [IO.Path]::GetFullPath($appDir)
$zipNext = Join-Path $here 'Tatkal-Desk-Desktop.zip'
$pkgNext = Join-Path $here 'package.json'

function Pause-Window {
  cmd /c pause
}

function Test-LongPath([string]$path) {
  if ($path -match 'AgentStores|\\docs\\Tatkal-Desk-Desktop|\\.cursor\\projects') {
    return $true
  }
  return $false
}

if (Test-LongPath $appDir) {
  Write-Host "ERROR: Desktop path looks like a long AgentStores / Context path."
  Write-Host "Expected: $env:USERPROFILE\Desktop\Tatkal-Desk"
  Write-Host ""
  Pause-Window
  exit 1
}

if (-not (Test-Path -LiteralPath $desktop)) {
  New-Item -ItemType Directory -Path $desktop | Out-Null
}

$same = [string]::Equals($here, $appDir, [StringComparison]::OrdinalIgnoreCase)
$ready = $false

if ($same -and (Test-Path -LiteralPath (Join-Path $appDir 'package.json'))) {
  Write-Host "Already in Desktop\Tatkal-Desk"
  Write-Host "  $appDir"
  Write-Host ""
  $ready = $true
}
elseif (Test-Path -LiteralPath $pkgNext) {
  Write-Host "Found package.json next to this script."
  Write-Host "Copying to Desktop\Tatkal-Desk (excluding node_modules and .next)..."
  Write-Host "From:"
  Write-Host "  $here"
  Write-Host "To:"
  Write-Host "  $appDir"
  Write-Host ""
  if (-not (Test-Path -LiteralPath $appDir)) {
    New-Item -ItemType Directory -Path $appDir | Out-Null
  }
  & robocopy $here $appDir /E /XD node_modules .next /NFL /NDL /NJH /NJS /nc /ns /np | Out-Host
  if ($LASTEXITCODE -ge 8) {
    Write-Host "robocopy failed (code $LASTEXITCODE). Trying xcopy..."
    $xex = Join-Path $env:TEMP 'tatkal-desk-xcopy-exclude.txt'
    Set-Content -LiteralPath $xex -Value "node_modules\`r`n.next\" -Encoding Ascii
    & xcopy "$here\*" "$appDir\" /E /I /Y /EXCLUDE:$xex | Out-Host
  }
  $ready = Test-Path -LiteralPath (Join-Path $appDir 'package.json')
  if (-not $ready) {
    Write-Host ""
    Write-Host "Copy failed. package.json was not created at:"
    Write-Host "  $appDir"
    Write-Host ""
    Pause-Window
    exit 1
  }
  Write-Host "Copied to: $appDir"
  Write-Host ""
}
elseif (Test-Path -LiteralPath $zipNext) {
  Write-Host "Found Tatkal-Desk-Desktop.zip next to this script"
  Write-Host "Extracting to Desktop (refresh Desktop\Tatkal-Desk)..."
  Write-Host ""
  try {
    Expand-Archive -LiteralPath $zipNext -DestinationPath $desktop -Force
  } catch {
    Write-Host "Expand-Archive failed. Trying tar..."
    & tar -xf $zipNext -C $desktop
  }
  $ready = Test-Path -LiteralPath (Join-Path $appDir 'package.json')
  if (-not $ready) {
    Write-Host ""
    Write-Host "Extract failed. Manually extract Tatkal-Desk-Desktop.zip to your Desktop"
    Write-Host "so you get: Desktop\Tatkal-Desk\package.json"
    Write-Host ""
    Write-Host "Gujarati: Zip ne Desktop par extract karo."
    Write-Host ""
    Pause-Window
    exit 1
  }
  Write-Host "Extracted / refreshed: $appDir"
  Write-Host ""
}
elseif (Test-Path -LiteralPath (Join-Path $appDir 'package.json')) {
  Write-Host "Using existing: $appDir"
  Write-Host ""
  $ready = $true
}

if (-not $ready) {
  Write-Host ""
  Write-Host "Tatkal Desk app folder not found at:"
  Write-Host "  $appDir"
  Write-Host ""
  Write-Host "Do one of the following:"
  Write-Host "  1. Right-click this script inside the Tatkal-Desk folder (it copies to Desktop)"
  Write-Host "  2. Put Tatkal-Desk-Desktop.zip next to this script and run again"
  Write-Host "  3. Or extract the zip to your Desktop (get Desktop\Tatkal-Desk)"
  Write-Host ""
  Write-Host "Gujarati: Folder Desktop\Tatkal-Desk ma copy thase. Script farithi chalao."
  Write-Host ""
  Pause-Window
  exit 1
}

$pkgPath = Join-Path $appDir 'package.json'
if (-not (Test-Path -LiteralPath $pkgPath)) {
  Write-Host "ERROR: package.json missing in:"
  Write-Host "  $appDir"
  Write-Host "Cannot run npm here."
  Pause-Window
  exit 1
}

$text = [IO.File]::ReadAllText($pkgPath)
$stripped = $text.Replace('next dev --turbopack', 'next dev')
if ($stripped -ne $text) {
  $utf8 = New-Object System.Text.UTF8Encoding $false
  [IO.File]::WriteAllText($pkgPath, $stripped, $utf8)
  Write-Host "Removed turbopack from package.json"
}

Set-Location -LiteralPath $appDir
$cwd = (Get-Location).Path
if (Test-LongPath $cwd) {
  Write-Host "ERROR: Still in a long path. Aborting."
  Write-Host "Current: $cwd"
  Write-Host "Next.js is not started."
  Pause-Window
  exit 1
}

Write-Host "App folder (short path):"
Write-Host "  $cwd"
Write-Host ""

if (-not (Get-Command node -ErrorAction SilentlyContinue)) {
  Write-Host "Node.js was not found on this PC."
  Write-Host ""
  Write-Host "Install Node.js LTS from:"
  Write-Host "  https://nodejs.org"
  Write-Host ""
  Write-Host "After installing, close this window and run this script again."
  Write-Host ""
  Pause-Window
  exit 1
}

Write-Host "Node.js found:"
& node -v
Write-Host ""

if (-not (Test-Path -LiteralPath (Join-Path $appDir 'node_modules'))) {
  Write-Host "First run: installing dependencies (npm install)..."
  Write-Host "This can take a few minutes."
  Write-Host ""
  & npm install
  if ($LASTEXITCODE -ne 0) {
    Write-Host ""
    Write-Host "npm install failed. Check the errors above."
    Pause-Window
    exit 1
  }
  Write-Host ""
  Write-Host "Dependencies installed."
  Write-Host ""
}

$envLocal = Join-Path $appDir '.env.local'
$envExample = Join-Path $appDir '.env.example'
if ((-not (Test-Path -LiteralPath $envLocal)) -and (Test-Path -LiteralPath $envExample)) {
  Write-Host "Creating .env.local from .env.example ..."
  Copy-Item -LiteralPath $envExample -Destination $envLocal -Force
}

Write-Host "Opening browser in a few seconds..."
Write-Host "Server: http://localhost:3000"
Write-Host ""
Write-Host "Keep this window open while Tatkal Desk is running."
Write-Host "Press Ctrl+C to stop the server."
Write-Host ""

Start-Process -FilePath "cmd.exe" -ArgumentList '/c','timeout /t 5 /nobreak >nul & start http://localhost:3000' -WindowStyle Hidden

& npm run dev
$code = $LASTEXITCODE
if ($null -eq $code) { $code = 0 }

Write-Host ""
if ($code -ne 0) {
  Write-Host "Server stopped with an error (exit code $code)."
} else {
  Write-Host "Server stopped."
}
Pause-Window
exit $code
