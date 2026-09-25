@echo off
setlocal EnableExtensions
title Tatkal Desk

echo ========================================
echo   Tatkal Desk - starting...
echo ========================================
echo.

rem ALWAYS run from a short path. Long AgentStores / Context / nested docs
rem paths break Next.js (wrong root) and Turbopack (MAX_PATH).
set "DESKTOP=%USERPROFILE%\Desktop"
set "APPDIR=%DESKTOP%\Tatkal-Desk"
set "ZIPNEXT=%~dp0Tatkal-Desk-Desktop.zip"
set "BATSRC=%~f0"

if not exist "%DESKTOP%" mkdir "%DESKTOP%" >nul 2>&1

rem Guard: never treat AgentStores / Context / nested extract as APPDIR.
echo %APPDIR%| findstr /I /C:"AgentStores" /C:"\docs\Tatkal-Desk-Desktop" /C:"\.cursor\projects" >nul
if not errorlevel 1 (
  echo ERROR: Refusing long AgentStores / Context path as APPDIR.
  echo Expected short path: %%USERPROFILE%%\Desktop\Tatkal-Desk
  echo.
  pause
  exit /b 1
)

rem 1) Zip next to this .bat -> expand/refresh Desktop\Tatkal-Desk
if exist "%ZIPNEXT%" (
  echo Found Tatkal-Desk-Desktop.zip next to this .bat
  echo Extracting to Desktop ^(refresh Desktop\Tatkal-Desk^)...
  echo.
  powershell -NoProfile -ExecutionPolicy Bypass -Command "Expand-Archive -LiteralPath '%ZIPNEXT%' -DestinationPath '%DESKTOP%' -Force"
  if errorlevel 1 (
    tar -xf "%ZIPNEXT%" -C "%DESKTOP%" 2>nul
  )
  if not exist "%APPDIR%\package.json" (
    echo.
    echo Extract failed. Manually extract Tatkal-Desk-Desktop.zip to your Desktop
    echo so you get: Desktop\Tatkal-Desk\package.json
    echo.
    echo Gujarati: Zip ne Desktop par extract karo.
    echo.
    pause
    exit /b 1
  )
  echo Extracted / refreshed: %APPDIR%
  echo.
  goto :prepare_appdir
)

rem 2) Already on Desktop with package.json -> use that
if exist "%APPDIR%\package.json" (
  echo Using existing: %APPDIR%
  echo.
  goto :prepare_appdir
)

rem 3) Bat sits inside a folder that has package.json, but it is NOT Desktop.
rem    Refuse long paths; ask user to put app on Desktop.
if exist "%~dp0package.json" (
  echo.
  echo Found package.json next to this .bat, but that folder is NOT
  echo   %APPDIR%
  echo.
  echo Refusing to run from a long / nested path ^(AgentStores, docs,
  echo Tatkal-Desk-Desktop under Context, etc.^).
  echo.
  echo FIX:
  echo   1. Delete leftover junk if present:
  echo        docs\node_modules
  echo        docs\package-lock.json
  echo        docs\Tatkal-Desk-Desktop\
  echo   2. Put Tatkal-Desk-Desktop.zip on Desktop ^(or next to this .bat^)
  echo      and run this .bat again - it extracts to Desktop\Tatkal-Desk
  echo   3. Or copy the whole Tatkal-Desk folder to:
  echo        %APPDIR%
  echo      then double-click Start-Tatkal-Desk.bat there.
  echo.
  echo Gujarati: Lambe path thi nahi chalavu. Desktop\Tatkal-Desk use karo.
  echo.
  pause
  exit /b 1
)

echo.
echo Tatkal Desk app folder not found at:
echo   %APPDIR%
echo.
echo Do one of the following:
echo   1. Put Tatkal-Desk-Desktop.zip next to this .bat and run again
echo   2. Or extract the zip to your Desktop ^(get Desktop\Tatkal-Desk^)
echo.
echo Gujarati: Zip ne Desktop par extract karo, pachhi
echo Desktop\Tatkal-Desk\Start-Tatkal-Desk.bat double-click karo.
echo.
pause
exit /b 1

:prepare_appdir
if not exist "%APPDIR%\package.json" (
  echo ERROR: package.json missing in:
  echo   %APPDIR%
  echo Refusing to run npm here.
  pause
  exit /b 1
)

rem Keep launcher in the Desktop app folder in sync with this .bat
copy /Y "%BATSRC%" "%APPDIR%\Start-Tatkal-Desk.bat" >nul 2>&1

cd /d "%APPDIR%"
if errorlevel 1 (
  echo ERROR: Could not cd to %APPDIR%
  pause
  exit /b 1
)

rem Final safety: cwd must be the short Desktop path
echo %CD%| findstr /I /C:"AgentStores" /C:"\docs\Tatkal-Desk-Desktop" >nul
if not errorlevel 1 (
  echo ERROR: Still in a long path. Aborting.
  echo Current: %CD%
  pause
  exit /b 1
)

echo App folder ^(short path^):
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
