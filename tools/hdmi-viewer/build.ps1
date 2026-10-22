# Build hdmi-viewer.exe natively on Windows (MSVC toolchain).
# Prerequisites: Rust (https://rustup.rs) + "Desktop development with C++"
# (Visual Studio Build Tools), which rustup-init offers to install.
# Usage:  powershell -ExecutionPolicy Bypass -File build.ps1 [-Debug]
param([switch]$Debug)
$ErrorActionPreference = 'Stop'
Set-Location $PSScriptRoot

if (-not (Get-Command cargo -ErrorAction SilentlyContinue)) {
    throw 'cargo not found: install Rust from https://rustup.rs and reopen the terminal.'
}

$target = 'x86_64-pc-windows-msvc'
if (-not ((rustup target list --installed) -contains $target)) { rustup target add $target }

if ($Debug) { $profile = 'debug'; cargo build --target $target }
else        { $profile = 'release'; cargo build --release --target $target }
if ($LASTEXITCODE -ne 0) { throw "cargo build failed ($LASTEXITCODE)" }

New-Item -ItemType Directory -Force dist | Out-Null
Copy-Item "target\$target\$profile\hdmi-viewer.exe" dist\hdmi-viewer.exe -Force
$size = [math]::Round((Get-Item dist\hdmi-viewer.exe).Length / 1MB, 1)
Write-Host "Built $PWD\dist\hdmi-viewer.exe ($size MB)"
