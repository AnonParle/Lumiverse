#Requires -Version 5.1
<#
.SYNOPSIS
    Lumiverse Launcher (Windows)

.DESCRIPTION
    Build frontend + start backend (default)

.PARAMETER Mode
    all          - Build frontend + start backend (default)
    build-only   - Build frontend only
    backend-only - Start backend only
    dev          - Start backend in watch mode
    setup        - Run setup wizard only

.PARAMETER FrontendPath
    Path to frontend directory (default: ./frontend)

.PARAMETER NoRunner
    Start without the visual terminal runner
#>

param(
    [ValidateSet("all", "build-only", "backend-only", "dev", "setup")]
    [string]$Mode = "all",

    [string]$FrontendPath,

    [switch]$NoRunner
)

$ErrorActionPreference = "Stop"

# ─── Helpers ─────────────────────────────────────────────────────────────────

function Write-Info  { param([string]$Msg) Write-Host "[info]  $Msg" -ForegroundColor Cyan }
function Write-Ok    { param([string]$Msg) Write-Host "[ok]    $Msg" -ForegroundColor Green }
function Write-Warn  { param([string]$Msg) Write-Host "[warn]  $Msg" -ForegroundColor Yellow }
function Write-Err   { param([string]$Msg) Write-Host "[error] $Msg" -ForegroundColor Red }

# ─── Resolve paths ───────────────────────────────────────────────────────────

$BackendDir  = $PSScriptRoot

if (-not $FrontendPath) { $FrontendPath = Join-Path $BackendDir "frontend" }

# ─── Ensure Bun is installed ────────────────────────────────────────────────

function Ensure-Bun {
    $bunCmd = Get-Command bun -ErrorAction SilentlyContinue
    if ($bunCmd) {
        $version = & bun --version
        Write-Ok "Bun $version found"
        return
    }

    Write-Warn "Bun not found. Installing..."

    try {
        irm bun.sh/install.ps1 | iex
    } catch {
        Write-Err "Bun installation failed: $_"
        Write-Err "Please install manually: https://bun.sh"
        exit 1
    }

    # Refresh PATH for this session
    $bunInstall = if ($env:BUN_INSTALL) { $env:BUN_INSTALL } else { Join-Path $env:USERPROFILE ".bun" }
    $bunBin = Join-Path $bunInstall "bin"
    if (Test-Path $bunBin) {
        $env:PATH = "$bunBin;$env:PATH"
    }

    $bunCmd = Get-Command bun -ErrorAction SilentlyContinue
    if (-not $bunCmd) {
        Write-Err "Bun installation failed. Please install manually: https://bun.sh"
        exit 1
    }

    $version = & bun --version
    Write-Ok "Bun $version installed successfully"
}

# ─── First-run setup wizard ─────────────────────────────────────────────────

function Invoke-SetupIfNeeded {
    $identityFile = Join-Path $BackendDir "data\lumiverse.identity"
    $envFile = Join-Path $BackendDir ".env"

    if (-not (Test-Path $identityFile) -or -not (Test-Path $envFile)) {
        Write-Info "First run detected - launching setup wizard..."
        Write-Host ""
        Install-Deps $BackendDir "backend"
        Push-Location $BackendDir
        try { & bun run scripts/setup-wizard.ts } finally { Pop-Location }
    }
}

function Invoke-Setup {
    Install-Deps $BackendDir "backend"
    Push-Location $BackendDir
    try { & bun run scripts/setup-wizard.ts } finally { Pop-Location }
}

# ─── Load .env into current process ─────────────────────────────────────────

function Load-EnvFile {
    $envFile = Join-Path $BackendDir ".env"
    if (-not (Test-Path $envFile)) { return }

    Get-Content $envFile | ForEach-Object {
        $line = $_.Trim()
        if ($line -and -not $line.StartsWith("#") -and $line -match '^([^=]+)=(.*)$') {
            [Environment]::SetEnvironmentVariable($Matches[1], $Matches[2], "Process")
        }
    }
}

# ─── Install dependencies ───────────────────────────────────────────────────

function Install-Deps {
    param([string]$Dir, [string]$Name)

    $nodeModules = Join-Path $Dir "node_modules"
    if (-not (Test-Path $nodeModules)) {
        Write-Info "Installing $Name dependencies..."
        Push-Location $Dir
        try { & bun install } finally { Pop-Location }
        Write-Ok "$Name dependencies installed"
    } else {
        Write-Info "$Name dependencies already installed"
    }
}

# ─── Build frontend ─────────────────────────────────────────────────────────

function Build-Frontend {
    if (-not (Test-Path $FrontendPath)) {
        Write-Err "Frontend directory not found at: $FrontendPath"
        Write-Err "Pass -FrontendPath to specify the correct location."
        exit 1
    }

    Install-Deps $FrontendPath "frontend"

    Write-Info "Building frontend..."
    Push-Location $FrontendPath
    try { & bun run build } finally { Pop-Location }

    $distDir = Join-Path $FrontendPath "dist"
    Write-Ok "Frontend built -> $distDir"
}

# ─── Start backend ──────────────────────────────────────────────────────────

function Start-Backend {
    $frontendDist = ""
    $distDir = Join-Path $FrontendPath "dist"

    if ($Mode -ne "dev" -and (Test-Path $distDir)) {
        $frontendDist = $distDir
        Write-Info "Serving frontend from: $frontendDist"
    } elseif ($Mode -ne "dev") {
        Write-Warn "No frontend build found. Backend will start without serving frontend."
        Write-Warn "Run './start.ps1 -Mode build-only' first, or use default mode to build + start."
    }

    Install-Deps $BackendDir "backend"

    $env:FRONTEND_DIR = $frontendDist
    Load-EnvFile

    # Decide: visual runner or plain process
    $isTTY = [Environment]::UserInteractive -and -not $NoRunner
    if ($isTTY) {
        $runnerArgs = @("run", "scripts/runner.ts")
        if ($Mode -eq "dev") { $runnerArgs += @("--", "--dev") }
        Push-Location $BackendDir
        try { & bun @runnerArgs } finally { Pop-Location }
    } else {
        $port = if ($env:PORT) { $env:PORT } else { "7860" }
        Write-Host ""
        Write-Host "Starting Lumiverse Backend on port $port..." -ForegroundColor White
        Write-Host ""

        Push-Location $BackendDir
        try {
            if ($Mode -eq "dev") {
                & bun run dev
            } else {
                & bun run start
            }
        } finally { Pop-Location }
    }
}

# ─── Main ────────────────────────────────────────────────────────────────────

Write-Host ""
Write-Host "Lumiverse - Launcher" -ForegroundColor White
Write-Host ""

Ensure-Bun

switch ($Mode) {
    "all" {
        Invoke-SetupIfNeeded
        Build-Frontend
        Start-Backend
    }
    "build-only" {
        Build-Frontend
    }
    "backend-only" {
        Invoke-SetupIfNeeded
        Start-Backend
    }
    "dev" {
        Invoke-SetupIfNeeded
        Start-Backend
    }
    "setup" {
        Invoke-Setup
    }
}
