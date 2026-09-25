@echo off
setlocal EnableExtensions EnableDelayedExpansion
title Tatkal Desk

echo ========================================
echo   Tatkal Desk - starting...
echo ========================================
echo.

rem Always start Next from the short Desktop path. If this .bat sits in a
rem long AgentStores / docs / nested folder, copy that folder to Desktop
rem first. Never run next from the long path.
set "DESKTOP=%USERPROFILE%\Desktop"
set "APPDIR=%DESKTOP%\Tatkal-Desk"
set "ZIPNEXT=%~dp0Tatkal-Desk-Desktop.zip"
set "BATSRC=%~f0"
set "BATDIR=%~dp0"
set "BATDIR=%BATDIR:~0,-1%"
set "XEX=%TEMP%\tatkal-desk-xcopy-exclude.txt"

if not exist "%DESKTOP%" mkdir "%DESKTOP%" >nul 2>&1

rem APPDIR must stay the short Desktop folder, never a long Context path.
echo %APPDIR%| findstr /I /L /C:"AgentStores" /C:"\docs\Tatkal-Desk-Desktop" /C:"\.cursor\projects" >nul
if not errorlevel 1 (
  echo ERROR: Desktop path looks like a long AgentStores / Context path.
  echo Expected: %%USERPROFILE%%\Desktop\Tatkal-Desk
  echo.
  pause
  exit /b 1
)

rem 1) Already in Desktop\Tatkal-Desk with package.json -> run there.
if /I "%BATDIR%"=="%APPDIR%" (
  if exist "%APPDIR%\package.json" (
    echo Already in Desktop\Tatkal-Desk
    echo   %APPDIR%
    echo.
    goto :prepare_appdir
  )
)

rem 2) package.json next to this .bat, but not Desktop -> copy, then run from Desktop.
if exist "%~dp0package.json" (
  echo Found package.json next to this .bat.
  echo Copying to Desktop\Tatkal-Desk ^(excluding node_modules and .next^)...
  echo From:
  echo   %BATDIR%
  echo To:
  echo   %APPDIR%
  echo.
  if not exist "%APPDIR%" mkdir "%APPDIR%"
  robocopy "%BATDIR%" "%APPDIR%" /E /XD node_modules .next /NFL /NDL /NJH /NJS /nc /ns /np
  set "RC=!ERRORLEVEL!"
  if !RC! GEQ 8 (
    echo robocopy failed ^(code !RC!^). Trying xcopy...
    > "%XEX%" echo node_modules\
    >> "%XEX%" echo .next\
    xcopy "%BATDIR%\*" "%APPDIR%" /E /I /Y /EXCLUDE:"!XEX!"
  )
  if not exist "%APPDIR%\package.json" (
    echo.
    echo Copy failed. package.json was not created at:
    echo   %APPDIR%
    echo.
    pause
    exit /b 1
  )
  echo Copied to: %APPDIR%
  echo.
  goto :prepare_appdir
)

rem 3) Zip next to this .bat -> expand/refresh Desktop\Tatkal-Desk
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

rem 4) Desktop app already present (this .bat was launched from somewhere else)
if exist "%APPDIR%\package.json" (
  echo Using existing: %APPDIR%
  echo.
  goto :prepare_appdir
)

echo.
echo Tatkal Desk app folder not found at:
echo   %APPDIR%
echo.
echo Do one of the following:
echo   1. Double-click this .bat inside the Tatkal-Desk folder ^(it copies to Desktop^)
echo   2. Put Tatkal-Desk-Desktop.zip next to this .bat and run again
echo   3. Or extract the zip to your Desktop ^(get Desktop\Tatkal-Desk^)
echo.
echo Gujarati: Folder Desktop\Tatkal-Desk ma copy thase. Bat farithi double-click karo.
echo.
pause
exit /b 1

:prepare_appdir
if not exist "%APPDIR%\package.json" (
  echo ERROR: package.json missing in:
  echo   %APPDIR%
  echo Cannot run npm here.
  pause
  exit /b 1
)

rem Strip turbopack before npm so next dev stays on the short path.
powershell -NoProfile -ExecutionPolicy Bypass -Command "$p='%APPDIR%\package.json'; if (Test-Path -LiteralPath $p) { $t=[IO.File]::ReadAllText($p); $n=$t.Replace('next dev --turbopack','next dev'); if ($n -ne $t) { $u=New-Object System.Text.UTF8Encoding $false; [IO.File]::WriteAllText($p,$n,$u); Write-Output 'Removed turbopack from package.json' } }"

rem Keep launchers in the Desktop app folder in sync with this .bat
copy /Y "%BATSRC%" "%APPDIR%\Start-Tatkal-Desk.bat" >nul 2>&1
if exist "%~dp0Run-Now.ps1" copy /Y "%~dp0Run-Now.ps1" "%APPDIR%\Run-Now.ps1" >nul 2>&1

cd /d "%APPDIR%"
if errorlevel 1 (
  echo ERROR: Could not cd to %APPDIR%
  pause
  exit /b 1
)

rem Final safety: never run next from AgentStores / docs / nested extract.
echo %CD%| findstr /I /L /C:"AgentStores" /C:"\docs\Tatkal-Desk-Desktop" /C:"\.cursor\projects" >nul
if not errorlevel 1 (
  echo ERROR: Still in a long path. Aborting.
  echo Current: %CD%
  echo Next.js is not started.
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
echo Open IRCTC button — install Chromium once in this folder if needed:
echo   npx playwright install chromium
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
