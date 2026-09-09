@echo off
cd /d "%~dp0"
echo SPPARKS Material Lab - http://127.0.0.1:8765
echo Keep this window open. Press Ctrl+C to stop.
python -B server.py --port 8765
pause
