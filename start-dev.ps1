# Starts backend and frontend in two windows and opens the app.
# Run setup first (README). Usage:  powershell -ExecutionPolicy Bypass -File .\start-dev.ps1
$root = $PSScriptRoot
Start-Process powershell -ArgumentList "-NoExit", "-Command", "cd '$root\backend'; .\venv\Scripts\Activate.ps1; uvicorn app.main:app --reload"
Start-Process powershell -ArgumentList "-NoExit", "-Command", "cd '$root\frontend'; npm run dev"
Start-Sleep -Seconds 6
Start-Process "http://localhost:5173"
