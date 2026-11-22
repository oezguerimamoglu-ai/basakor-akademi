@echo off
cd /d "%~dp0"
echo BasAkor Akademi yerel sunucusu basliyor...
echo Tarayici: http://localhost:8765
start "" cmd /c "timeout /t 2 /nobreak >nul & start http://localhost:8765"
where py >nul 2>nul
if %ERRORLEVEL%==0 (
    py -3 -m http.server 8765
) else (
    python -m http.server 8765
)
pause
