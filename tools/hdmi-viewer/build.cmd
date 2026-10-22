@echo off
rem Double-click friendly wrapper around build.ps1 (native Windows build).
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0build.ps1" %*
if errorlevel 1 pause
