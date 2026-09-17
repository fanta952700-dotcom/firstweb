@echo off
cd /d "%~dp0"

echo Starting dashboard...

start "DashboardServer" /min python -m http.server 8000

timeout /t 2 /nobreak >nul

start "" http://127.0.0.1:8000

echo.
echo Dashboard started.
echo URL: http://127.0.0.1:8000
echo.
echo Keep this window open while using the dashboard.
echo Close the server window when finished.
echo.

pause