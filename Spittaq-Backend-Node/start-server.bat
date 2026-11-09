@echo off
setlocal
set "BUNDLED_NODE=%USERPROFILE%\.cache\codex-runtimes\codex-primary-runtime\dependencies\node\bin\node.exe"
if exist "%BUNDLED_NODE%" (
  "%BUNDLED_NODE%" "%~dp0server.js"
  goto finished
)
where node >nul 2>nul
if %errorlevel%==0 (
  node "%~dp0server.js"
  goto finished
)
echo Node.js belum terpasang atau tidak ditemukan.
echo Pasang Node.js 18 atau lebih baru, lalu jalankan lagi file ini.
pause
:finished
endlocal
