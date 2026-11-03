@echo off
setlocal
cd /d "%~dp0"
echo User Study - keep this window open during collection.
echo Local URL: http://localhost:8080
echo Participants: http://YOUR_WIFI_IPV4:8080
echo Results: study-data\results.csv
echo.
where py >nul 2>nul
if not errorlevel 1 (
    py -3 study_server.py --port 8080
) else (
    python study_server.py --port 8080
)
echo.
echo Server stopped. If Python was not found, install Python 3.9 or newer.
pause
