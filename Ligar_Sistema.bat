@echo off
start "Gestor SENAI - Frontend (porta 8080)" cmd /c "python serve.py"
start "Gestor SENAI - API (porta 8000)" cmd /c "cd /d %~dp0backend && python -m uvicorn app.main:app --host 0.0.0.0 --port 8000"
exit /b 0
