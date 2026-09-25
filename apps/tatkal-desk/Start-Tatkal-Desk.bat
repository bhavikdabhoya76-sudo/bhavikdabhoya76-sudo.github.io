@echo off
setlocal
cd /d "%~dp0"

echo ========================================
echo   Tatkal Desk — starting...
echo ========================================
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
