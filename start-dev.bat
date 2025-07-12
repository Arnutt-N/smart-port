@echo off
echo 🚀 Starting Smart Port Management System (Development Mode)

echo 📊 Starting Database and Backend...
cd /d D:\hrProject\smart-port
docker-compose up -d db backend

echo ⏳ Waiting for services to start...
timeout /t 10 /nobreak > nul

echo 🔍 Checking service status...
docker-compose ps

echo.
echo ✅ Backend API available at: http://localhost:8000
echo 🗄️ Database available at: localhost:3306
echo.
echo 📱 To start Frontend:
echo cd frontend
echo npm install
echo npm run dev
echo.
echo 🌐 Frontend will be available at: http://localhost:5174
echo.
pause
