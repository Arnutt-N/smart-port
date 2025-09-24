# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

**Smart Port Management System** is an enterprise-grade civil service management system designed for Thai government agencies. The system provides comprehensive personnel management, career forecasting, talent search, and government networking capabilities.

## Development Environment

### Prerequisites
- Docker & Docker Compose
- Node.js (for frontend development)
- PHP 8.0+ with Composer (for backend development)

### Development Commands

#### Quick Start Development Environment
```bash
# Start database and backend services only
./start-dev.sh          # Linux/macOS
start-dev.bat           # Windows

# This starts:
# - Database (MySQL): localhost:3306
# - Backend API: http://localhost:8000
```

#### Frontend Development
```bash
cd frontend
npm install
npm run dev             # Starts Vite dev server at http://localhost:5174
npm run build           # Build for production
npm run preview         # Preview production build
```

#### Full Stack Development
```bash
# Start all services (database, backend, frontend)
docker-compose up -d

# View logs
docker-compose logs -f

# Stop all services
docker-compose down
```

#### Backend Development
```bash
cd backend
composer install        # Install PHP dependencies
```

### Service URLs
- **Frontend**: http://localhost:5174 (dev) / http://localhost:8081 (Docker)
- **Backend API**: http://localhost:8000
- **Database**: localhost:3306

## Architecture Overview

### Technology Stack

**Frontend**:
- **Framework**: Vite + Vanilla JavaScript (SPA architecture)
- **Styling**: Tailwind CSS v4.1.11 with custom configuration
- **UI Libraries**: Chart.js for data visualization
- **HTTP Client**: Axios for API communication
- **Architecture Pattern**: Component-based SPA with centralized state management

**Backend**:
- **Language**: Pure PHP (no frameworks)
- **API Style**: RESTful API with JWT authentication
- **Database**: PDO with MySQL
- **Authentication**: JWT tokens with Firebase PHP-JWT library
- **Security**: CORS configured for production deployment

**Database**:
- **Engine**: MySQL 8.0 with UTF8MB4 character set
- **Primary Database**: `civil_service_mgmt`
- **Key Features**: Full-text search, photo management, audit trails

### Project Structure

```
smart-port/
├── frontend/                    # Vite-based SPA frontend
│   ├── src/
│   │   ├── components/         # Reusable UI components
│   │   ├── pages/             # Page-level components
│   │   ├── services/          # API and auth services
│   │   └── main.js           # Application entry point
│   ├── admin.html            # Admin interface entry point
│   ├── index.html            # Main application entry point
│   └── vite.config.js        # Vite configuration
├── backend/                     # Pure PHP API backend
│   ├── api.php               # Main API gateway/router
│   ├── auth.php              # JWT authentication logic
│   ├── config.php            # Database configuration
│   └── index.php             # Backend entry point
├── *.sql                       # Database schema and sample data
├── docker-compose.yaml         # Multi-service orchestration
└── start-dev.*                # Development startup scripts
```

### Database Schema

The system uses a comprehensive schema centered around civil servants management:

**Core Tables**:
- `prefixes` - Name prefixes (Mr., Mrs., etc.)
- `civil_servants` - Main personnel records
- `civil_servant_photos` - Photo management system

**Key Features**:
- Employee ID and citizen ID uniqueness constraints
- Photo management with approval workflow
- Audit trail timestamps on all tables
- Support for both active and retired personnel

### API Architecture

**Authentication Flow**:
- JWT-based authentication with refresh tokens
- Default credentials: `admin@smartport.gov.th` / `admin123`
- Protected routes require valid JWT token

**API Endpoints Structure**:
```
/auth/login          # POST - User authentication
/civil_servants/*    # CRUD operations for personnel
/photos/*           # Photo management endpoints
```

### Frontend Architecture

**Routing System**:
- Template-based SPA routing
- Multi-entry point configuration (main app + admin)
- Centralized state management

**Component Organization**:
- Page-level components in `/pages/`
- Reusable UI components in `/components/`
- Service layer for API communication
- Centralized authentication service

## Environment Configuration

### Docker Environment Variables
Create a `.env` file in the root directory:

```env
MYSQL_ROOT_PASSWORD=your_root_password
MYSQL_DATABASE=civil_service_mgmt
MYSQL_USER=your_user
MYSQL_PASSWORD=your_password
JWT_SECRET=your_jwt_secret_key
```

### Development vs Production
- **Development**: Uses Vite dev server with hot reload
- **Production**: Nginx serves built static files with PHP-FPM backend
- **CORS**: Configured for `https://smart-port.onrender.com` in production

## Testing and Debugging

### Available Test Files
- `simple-test.html` - Basic functionality testing
- `admin-dashboard-integration-test.html` - Admin dashboard integration
- `loading-screen.html` - UI loading states

### Database Testing
```bash
# Connect to database container
docker exec -it smartport-db mysql -u root -p

# Use the database
USE civil_service_mgmt;

# Check tables
SHOW TABLES;
```

### API Testing
```bash
# Test authentication
curl -X POST http://localhost:8000/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"admin@smartport.gov.th","password":"admin123"}'
```

## Key Development Notes

### Frontend Development Patterns
- Uses ES6 modules with Vite bundling
- Tailwind CSS with component-first approach
- Centralized API service layer
- Event-driven architecture for component communication

### Backend Development Patterns
- Pure PHP with PDO for database operations
- RESTful API design with proper HTTP status codes
- JWT authentication with proper error handling
- Environment-based configuration

### Database Development
- UTF8MB4 character set for Thai language support
- Comprehensive foreign key relationships
- Audit trail timestamps on all entities
- Photo management with file system integration

### Security Considerations
- JWT token validation on protected routes
- PDO prepared statements for SQL injection prevention
- CORS policy configured for production domain
- File upload security for photo management