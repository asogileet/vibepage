@echo off
cd /d "%~dp0"
uvicorn script.thsr_api:app --reload
pause
