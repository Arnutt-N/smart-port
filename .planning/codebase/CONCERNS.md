# Codebase Concerns

**Analysis Date:** 2026-03-22

## Tech Debt

**Hardcoded Credentials in Backend:**
- Issue: Admin credentials hardcoded directly in code (`admin@smartport.gov.th` / `admin123`)
- Files: `backend/api.php` (lines 46, 72)
- Impact: Anyone with code access has default admin credentials; credentials cannot be rotated without code changes
- Fix approach: Migrate to proper user authentication using the `civil_servants` table with bcrypt hashed passwords; implement role-based access control (RBAC)

**Hardcoded JWT Secret:**
- Issue: JWT secret is placeholder text (`'your_secret_key_here'`) in `backend/config.php` line 25
- Files: `backend/config.php`
- Impact: JWT tokens can be forged by anyone with access to the codebase; no real cryptographic security
- Fix approach: Load JWT_SECRET from environment variable (`getenv('JWT_SECRET')`) with no fallback, require configuration before deployment

**Hardcoded CORS Origin:**
- Issue: CORS origin hardcoded to `https://smart-port.onrender.com` in `backend/api.php` line 4
- Files: `backend/api.php`
- Impact: Frontend cannot be served from different URL without modifying backend code; blocks local development and staging deployments
- Fix approach: Load from environment variable `ALLOWED_ORIGINS` with comma-separated list; validate against it at runtime

**Database Schema Gap:**
- Issue: `init.sql` creates only 3 tables (prefixes, civil_servants, civil_servant_photos) but `api.php` and stored procedures reference tables that don't exist:
  - `photo_versions` (referenced in stored procedure `sp_generate_photo_versions`)
  - `advance_notifications` (queried in `/forecast` endpoint)
  - `performance_proposals` (queried in `/dashboard` endpoint)
- Files: `init.sql` (74 lines), `backend/api.php` (lines 110, 121, 213)
- Impact: Multiple API endpoints will fail at runtime with "table not found" errors; forecast and dashboard features are non-functional
- Fix approach: Complete the database schema from `mysql_database_design.sql` directory; validate that all tables referenced in code exist in init script

**Duplicate Login Endpoints:**
- Issue: `/auth/login` and `/login` endpoints are identical, both hardcoded to same credentials
- Files: `backend/api.php` (lines 37-61, 63-87)
- Impact: Code duplication makes credential changes error-prone; confusing API contract (two ways to do the same thing)
- Fix approach: Remove one endpoint; standardize on `/auth/login`; document API contract

**SQL String Interpolation in Query:**
- Issue: LIMIT and OFFSET are interpolated as variables, not parameterized: `LIMIT {$limit} OFFSET {$offset}` in line 162
- Files: `backend/api.php` line 162
- Impact: While intval() provides some protection, violates principle of parameterized queries; other similar code may not be protected
- Fix approach: Use parameterized queries for LIMIT/OFFSET: `LIMIT ? OFFSET ?` with `execute([$searchTerm, $searchTerm, $searchTerm, $limit, $offset])`

**No Input Validation:**
- Issue: File upload endpoint accepts any filename without validation
- Files: `backend/api.php` (lines 100-116)
- Impact: Path traversal attacks possible (`../../../etc/passwd`); file type not validated; can overwrite existing files
- Fix approach: Validate file type (whitelist extensions); sanitize filename (generate random UUID); implement upload size limit

**Missing Photo Upload Directory:**
- Issue: Code references `UPLOAD_DIR` constant but directory permissions and existence are not verified
- Files: `backend/api.php` (line 104), `backend/config.php` (line 26)
- Impact: Uploads will fail silently if directory doesn't exist or has wrong permissions; no error handling
- Fix approach: Create uploads directory in Dockerfile; set proper permissions (775); verify directory exists in config with readable error message

**No Error Handling in Database Calls:**
- Issue: Most database queries lack error handling; if a query fails, exception is not caught
- Files: `backend/api.php` (lines 194-223 in dashboard endpoint)
- Impact: Unhandled PDOException returns 500 errors with no context; users see generic error messages
- Fix approach: Wrap queries in try-catch blocks; return meaningful error responses with proper HTTP status codes

**Stored Procedures Not Implemented:**
- Issue: Code calls stored procedures that likely don't exist in database:
  - `sp_generate_photo_versions` (line 110)
  - `sp_calculate_promotion_eligibility` (line 120)
- Files: `backend/api.php`
- Impact: Calling non-existent procedures will cause runtime errors; features depend on database state that isn't created
- Fix approach: Verify procedures exist in database; implement missing procedures or move logic to application layer

## Known Bugs

**Demo Token Does Not Validate:**
- Symptoms: Frontend can create demo tokens (`demo-token-{timestamp}`) that pass token validation check but don't contain valid JWT structure
- Files: `frontend/src/stores/auth.js` (lines 13, 39-44), `frontend/src/stores/auth.js` (line 13)
- Trigger: Call `useAuthStore().demoLogin()` from anywhere; token will pass `isTokenValid()` check
- Workaround: Don't use demo login in production; remove demo login feature if not needed

**Missing Tables Break Forecast and Dashboard Endpoints:**
- Symptoms: `/forecast` and `/dashboard` endpoints fail with "Unknown table" errors
- Files: `backend/api.php` (lines 118-125, 188-225)
- Trigger: Call GET `/forecast` or GET `/dashboard` with valid token
- Workaround: None; endpoints are non-functional until schema is completed

**Photo Upload Procedure Call Fails:**
- Symptoms: Photo upload returns success but procedure call fails silently
- Files: `backend/api.php` (line 110)
- Trigger: POST `/photos` with file
- Workaround: Check database logs for actual error; procedure `sp_generate_photo_versions` doesn't exist

## Security Considerations

**Exposed Default Credentials:**
- Risk: Hardcoded admin credentials in source code accessible to anyone with repo access
- Files: `backend/api.php` (lines 46, 72)
- Current mitigation: HTTPS in production (Render)
- Recommendations:
  - Implement proper user table with password hashing
  - Use environment variables for any non-production credentials
  - Rotate password immediately if repo was ever public
  - Audit who has accessed repository

**JWT Secret Not Cryptographically Secure:**
- Risk: Placeholder secret means tokens can be forged; no confidentiality or integrity protection
- Files: `backend/config.php` (line 25)
- Current mitigation: None; tokens are easily forgeable
- Recommendations:
  - Generate random 256+ bit secret using `openssl rand -base64 32`
  - Store in environment variable, never in code
  - Consider switching to signed JWTs with RS256 (asymmetric) for better key management

**Unrestricted File Upload:**
- Risk: No file type validation; path traversal possible; arbitrary file write
- Files: `backend/api.php` (lines 100-116)
- Current mitigation: `basename()` strips directory names but not sufficient
- Recommendations:
  - Use whitelist of allowed MIME types
  - Generate random UUID for filenames (don't use user-supplied names)
  - Check file content/magic bytes, not just extension
  - Store uploads outside web root or behind authentication
  - Set proper headers (`Content-Disposition: attachment`) to prevent script execution

**No Rate Limiting:**
- Risk: Login endpoint can be brute-forced; no protection against dictionary attacks
- Files: `backend/api.php` (lines 38-61)
- Current mitigation: None
- Recommendations:
  - Implement rate limiting (e.g., 5 attempts per 15 minutes per IP)
  - Add account lockout after N failed attempts
  - Log authentication failures for security monitoring

**Credentials Sent in Plaintext:**
- Risk: If TLS is not properly configured, credentials are exposed in transit
- Files: `frontend/src/pages/LoginPage.vue` (lines 30-71), `frontend/src/composables/useApi.js`
- Current mitigation: HTTPS on production (Render)
- Recommendations:
  - Enforce HTTPS in frontend Nginx config (HSTS headers)
  - Document that authentication only works over HTTPS
  - Consider implementing OAuth2/OIDC for government single sign-on

**No CSRF Protection:**
- Risk: Form submissions can be forged from other sites
- Files: `frontend/src/pages/LoginPage.vue` (line 30)
- Current mitigation: None (SPA should be safer due to CORS)
- Recommendations:
  - Implement CSRF tokens if using cookie-based sessions
  - Document that API only accepts tokens in `Authorization` header (immune to CSRF)

**Sensitive Data in localStorage:**
- Risk: JWT tokens stored in localStorage are vulnerable to XSS; accessible from JavaScript console
- Files: `frontend/src/stores/auth.js` (lines 5-7, 26-28)
- Current mitigation: None
- Recommendations:
  - Consider httpOnly cookies instead (requires cookie-based auth)
  - Implement Content Security Policy (CSP) to prevent inline script injection
  - Sanitize all user-provided data in Vue components to prevent XSS

**No Input Sanitization in API Responses:**
- Risk: Database content (especially Thai text) sent directly to frontend without escaping
- Files: `backend/api.php` (multiple json_encode calls), `frontend/src/pages/CandidateListsPage.vue`
- Current mitigation: Vue auto-escapes in templates
- Recommendations:
  - Document that all JSON responses should be escaped before display
  - Use Vue's v-text or {{ }} syntax (not v-html) for all user-provided content
  - Sanitize before storing in database if accepting user input

## Performance Bottlenecks

**N+1 Queries in Civil Servants Endpoint:**
- Problem: For each servant record returned, queries will likely join prefixes and photos separately
- Files: `backend/api.php` (lines 145-167)
- Cause: Query does LEFT JOINs correctly, but no pagination optimization
- Improvement path:
  - Add indexes on `civil_servants.is_active`, `prefixes.prefix_id`, `civil_servant_photos.servant_id`
  - Monitor slow query log in production
  - Consider caching frequently accessed data (e.g., prefix list)

**Inefficient Dashboard Query:**
- Problem: Dashboard endpoint runs multiple separate COUNT queries instead of one optimized query
- Files: `backend/api.php` (lines 188-225)
- Cause: Each statistic runs individual SELECT COUNT(*) statement
- Improvement path:
  - Combine into single query with subqueries or CTEs
  - Cache dashboard results if data doesn't change frequently
  - Add materialized views for common aggregations

**No Pagination for Forecast Results:**
- Problem: `/forecast` endpoint fetches ALL records from `advance_notifications`; could be thousands
- Files: `backend/api.php` (lines 118-125)
- Cause: No LIMIT/OFFSET applied
- Improvement path: Add pagination parameters to forecast endpoint; implement cursor-based pagination for better performance

**Large JSON Responses:**
- Problem: No response compression; candidates endpoint returns full servant records with all columns
- Files: `backend/api.php` (lines 228-268)
- Cause: SELECT * instead of specific columns
- Improvement path:
  - Implement gzip compression in Apache headers
  - Return only necessary fields (id, name, photo_path, status)
  - Implement GraphQL or field-selection API if frontend needs flexibility

## Fragile Areas

**Database Layer Brittle to Schema Changes:**
- Files: `backend/api.php` (all database queries)
- Why fragile: Queries hardcoded in PHP; no ORM or query builder; schema changes require code changes
- Safe modification: When changing table structure, update all affected queries and test endpoints; consider migration approach if possible
- Test coverage: No unit tests for database layer; endpoints untested

**Frontend Router Not Type-Safe:**
- Files: `frontend/src/router` (custom router implementation)
- Why fragile: Custom router implementation using regex patterns; easy to introduce routing bugs
- Safe modification: Test all route transitions manually; add route name constants instead of strings
- Test coverage: No tests for router; navigation may break silently

**Authentication Tightly Coupled to Login Form:**
- Files: `frontend/src/stores/auth.js`, `frontend/src/pages/LoginPage.vue`
- Why fragile: Token validation logic mixed with auth store; demo login is special case
- Safe modification: Separate token validation from token storage; remove demo login if not needed
- Test coverage: No tests for auth store; token expiry logic not tested

**Stored Procedures Not Version Controlled:**
- Files: Only referenced in `backend/api.php`, no implementation visible
- Why fragile: Procedures exist only in database; not in git; can't be reproduced in new environments
- Safe modification: Add procedure definitions to init.sql before using them
- Test coverage: Procedures untested; calls fail if procedures don't exist

**Large Monolithic API Gateway:**
- Files: `backend/api.php` (274 lines in single switch statement)
- Why fragile: All routes in one file; adding new endpoints risks breaking existing ones
- Safe modification: Split api.php by domain (auth.php, servants.php, photos.php, etc.); use router library
- Test coverage: No tests; manual regression testing required after each change

## Scaling Limits

**Single Static Admin User:**
- Current capacity: 1 admin user (hardcoded)
- Limit: Cannot add additional users, roles, or permissions
- Scaling path: Implement proper `users` table with roles; use RBAC middleware; migrate to multi-user system

**File Upload on Same Server as Application:**
- Current capacity: Uploads stored on web server; limited by disk space
- Limit: Breaks if disk fills; no backup or CDN; download speeds limited to server bandwidth
- Scaling path: Move uploads to cloud storage (AWS S3, Google Cloud Storage); implement CDN; generate pre-signed URLs

**Monolithic Frontend Build:**
- Current capacity: All pages compiled into single bundle
- Limit: Bundle size grows with every new page; slow initial load
- Scaling path: Implement code splitting by route; lazy-load page components; separate admin and user interfaces

**MySQL on Same Docker Network:**
- Current capacity: Single MySQL instance; no replication
- Limit: Database is single point of failure; no read replicas for analytics
- Scaling path: Implement primary-replica setup; consider managed database (AWS RDS); implement connection pooling

## Dependencies at Risk

**firebase/php-jwt@^6.0:**
- Risk: Custom JWT implementation in `auth.php` (lines 1-74) duplicates JWT library functionality; library not actually used
- Impact: Maintaining custom JWT instead of using proven library; potential security bugs in custom implementation
- Migration plan: Replace custom JWT with `firebase/php-jwt`; use their validateToken() and decodeToken() methods

**Tailwind CSS 4 with platform-specific builds:**
- Risk: `@tailwindcss/oxide-win32-x64-msvc` is Windows-specific binary; breaks on other platforms
- Impact: Cannot build on Linux/macOS in CI/CD; development environment specificity
- Migration plan: Use `@tailwindcss/vite` only; let npm handle platform detection; remove Windows-specific packages from package.json

**Outdated Vue Router Pattern:**
- Risk: Frontend uses Vue 3 but custom router implementation instead of official vue-router
- Impact: Missing features like route guards, lazy loading, history management; duplicating routing logic
- Migration plan: Integrate `vue-router@^4.5.0` that's already in dependencies; refactor routes to standard format

## Missing Critical Features

**No User Management System:**
- Problem: Only hardcoded admin user; no way to create, edit, or delete users; no role-based access control
- Blocks: Cannot implement multi-user system; cannot delegate permissions; cannot audit user actions

**No Database Session Management:**
- Problem: Authentication is stateless JWT only; no way to revoke tokens or track active sessions
- Blocks: Cannot implement logout on all devices; cannot force re-authentication for sensitive operations

**No Input Validation on Backend:**
- Problem: No validation framework; each endpoint validates differently or not at all
- Blocks: Cannot guarantee data quality; cannot provide consistent error responses

**No API Documentation:**
- Problem: No OpenAPI/Swagger spec; endpoints not documented
- Blocks: Frontend developers must read code to understand API; no standard for error formats

**No Logging or Monitoring:**
- Problem: No application logs; errors not recorded; no audit trail
- Blocks: Cannot debug production issues; cannot detect security incidents; cannot meet compliance requirements

**No Testing Infrastructure:**
- Problem: No test framework configured; no tests for any layer
- Blocks: Cannot refactor safely; cannot deploy with confidence; regressions undetected

## Test Coverage Gaps

**No Unit Tests:**
- What's not tested: All utility functions (JWT generation/validation, auth checks, API routes)
- Files: `backend/auth.php` (all JWT functions), `backend/api.php` (all endpoints)
- Risk: Authentication bugs undetected; endpoints break on refactoring
- Priority: High

**No API Integration Tests:**
- What's not tested: End-to-end workflows (login → fetch data → logout)
- Files: `backend/api.php` (all endpoints)
- Risk: Endpoint interactions broken; broken stored procedure calls not caught
- Priority: High

**No Database Tests:**
- What's not tested: Schema validity, stored procedure existence, foreign key constraints
- Files: `init.sql`, stored procedures
- Risk: Schema incomplete; procedures missing; constraints violated
- Priority: High

**No Frontend Component Tests:**
- What's not tested: Form validation, error handling, auth state management
- Files: `frontend/src/pages/LoginPage.vue`, `frontend/src/stores/auth.js`
- Risk: XSS vulnerabilities, broken form submissions, auth logic errors
- Priority: Medium

**No End-to-End Tests:**
- What's not tested: Full user journeys (login → navigate → view data → logout)
- Files: All frontend and backend
- Risk: Critical paths break undetected; UI/API contract mismatches
- Priority: High

---

*Concerns audit: 2026-03-22*
