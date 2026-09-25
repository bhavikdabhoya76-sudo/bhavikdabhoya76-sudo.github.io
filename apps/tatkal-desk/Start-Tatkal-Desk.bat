@echo off
setlocal EnableExtensions
cd /d "%~dp0"

echo ========================================
echo   Tatkal Desk - starting...
echo ========================================
echo.

rem Resolve APPDIR: never run npm without package.json in the working directory.
set "APPDIR="

if exist "%~dp0package.json" (
  set "APPDIR=%~dp0"
  goto :have_appdir
)

if exist "%~dp0Tatkal-Desk-Desktop.zip" (
  echo package.json not found next to this .bat
  echo Found Tatkal-Desk-Desktop.zip - extracting to Desktop...
  echo.
  set "DEST=%USERPROFILE%\Desktop"
  if not exist "%DEST%" mkdir "%DEST%" >nul 2>&1

  rem Prefer PowerShell Expand-Archive; fall back to tar if available.
  powershell -NoProfile -ExecutionPolicy Bypass -Command "Expand-Archive -LiteralPath '%~dp0Tatkal-Desk-Desktop.zip' -DestinationPath '%USERPROFILE%\Desktop' -Force" 2>nul
  if errorlevel 1 (
    tar -xf "%~dp0Tatkal-Desk-Desktop.zip" -C "%USERPROFILE%\Desktop" 2>nul
  )

  if exist "%USERPROFILE%\Desktop\Tatkal-Desk\package.json" (
    set "APPDIR=%USERPROFILE%\Desktop\Tatkal-Desk"
    echo Extracted to: %USERPROFILE%\Desktop\Tatkal-Desk
    echo.
    goto :have_appdir
  )

  echo.
  echo Extract failed. Please extract Tatkal-Desk-Desktop.zip manually
  echo to your Desktop, then double-click Start-Tatkal-Desk.bat inside
  echo Desktop\Tatkal-Desk\
  echo.
  echo Zip extract karo Desktop par, pachhi Tatkal-Desk folder ma
  echo Start-Tatkal-Desk.bat double-click karo.
  echo.
  pause
  exit /b 1
)

if exist "%USERPROFILE%\Desktop\Tatkal-Desk\package.json" (
  echo package.json not next to this .bat - using Desktop\Tatkal-Desk
  echo.
  set "APPDIR=%USERPROFILE%\Desktop\Tatkal-Desk"
  goto :have_appdir
)

echo.
echo Tatkal Desk app folder not found.
echo.
echo Do one of the following:
echo   1. Extract Tatkal-Desk-Desktop.zip to your Desktop
echo      ^(you should get Desktop\Tatkal-Desk\ with package.json^)
echo   2. Or put this .bat inside the Tatkal-Desk folder
echo      next to package.json, then double-click it there.
echo.
echo Do NOT run this .bat from the Context docs folder alone
echo unless Tatkal-Desk-Desktop.zip is also in that folder
echo ^(newer bat can auto-extract^).
echo.
echo Gujarati: Zip ne Desktop par extract karo, pachhi
echo Desktop\Tatkal-Desk\Start-Tatkal-Desk.bat double-click karo.
echo.
pause
exit /b 1

:have_appdir
cd /d "%APPDIR%"
if not exist "package.json" (
  echo ERROR: package.json missing in:
  echo   %CD%
  echo Refusing to run npm here.
  pause
  exit /b 1
)

echo App folder:
echo   %CD%
echo.

where node >nul 2>&1
if errorlevel 1 (
  echo Node.js was not found on this PC.
  echo.
  echo Install Node.js LTS from:
  echo   https://nodejs.org
  echo.
  echo After installing, close this window and double-click
  echo Start-Tatkal-Desk.bat again.
  echo.
  pause
  exit /b 1
)

echo Node.js found:
node -v
echo.

if not exist "node_modules\" (
  echo First run: installing dependencies ^(npm install^)...
  echo This can take a few minutes.
  echo.
  call npm install
  if errorlevel 1 (
    echo.
    echo npm install failed. Check the errors above.
    pause
    exit /b 1
  )
  echo.
  echo Dependencies installed.
  echo.
)

if not exist ".env.local" (
  if exist ".env.example" (
    echo Creating .env.local from .env.example ...
    copy /Y ".env.example" ".env.local" >nul
  )
)

echo Opening browser in a few seconds...
echo Server: http://localhost:3000
echo.
echo Keep this window open while Tatkal Desk is running.
echo Press Ctrl+C to stop the server.
echo.

rem Open browser after a short delay while the server starts
start "" cmd /c "timeout /t 5 /nobreak >nul & start http://localhost:3000"

call npm run dev
set "EXITCODE=%ERRORLEVEL%"

echo.
if not "%EXITCODE%"=="0" (
  echo Server stopped with an error ^(exit code %EXITCODE%^).
) else (
  echo Server stopped.
)
pause
exit /b %EXITCODE%
