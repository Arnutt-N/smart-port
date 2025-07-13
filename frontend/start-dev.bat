@echo off
echo === Smart Port Development Server ===
echo.

REM Change to project directory
cd /d "D:\hrProject\smart-port\frontend"
echo Working directory: %cd%
echo.

REM Kill any existing processes on ports 5174-5176
echo Cleaning up existing processes...
for /f "tokens=5" %%a in ('netstat -ano ^| findstr :5174') do taskkill /f /pid %%a 2>nul
for /f "tokens=5" %%a in ('netstat -ano ^| findstr :5175') do taskkill /f /pid %%a 2>nul
for /f "tokens=5" %%a in ('netstat -ano ^| findstr :5176') do taskkill /f /pid %%a 2>nul
echo.

REM Start Vite development server
echo Starting Vite development server...
echo URL will be: http://localhost:5174
echo.
node_modules\.bin\vite --host 0.0.0.0 --port 5174

pause
