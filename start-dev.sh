#!/bin/bash
# Quick Test Script for Smart Port System

echo "🚀 Starting Smart Port Management System (Development Mode)"

# Start Database and Backend only
echo "📊 Starting Database and Backend..."
cd smartport
docker-compose up -d db backend

# Wait for services
echo "⏳ Waiting for services to start..."
sleep 10

# Check service status
echo "🔍 Checking service status..."
docker-compose ps

echo "✅ Backend API available at: http://localhost:8000"
echo "🗄️ Database available at: localhost:3306"
echo ""
echo "📱 To start Frontend:"
echo "cd ../frontend"
echo "npm install"
echo "npm run dev"
echo ""
echo "🌐 Frontend will be available at: http://localhost:5174"
