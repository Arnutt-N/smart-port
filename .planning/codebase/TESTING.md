# Testing Patterns

**Analysis Date:** 2026-03-22

## Test Framework

**Runner:**
- **No test framework detected** in production codebase
- `package.json` has no testing dependencies (vitest, jest, mocha, etc.)
- `composer.json` (backend) has no testing dependencies (phpunit, etc.)

**Run Commands:**
- No npm test scripts configured
- No test command available in PHP backend

## Test File Organization

**Location:**
- No test files detected in `frontend/src/`
- No test directory (`__tests__/`, `tests/`, `test/`) found
- No `.test.js`, `.spec.js`, `.test.php`, or `.spec.php` files detected

**Naming:**
- Not applicable (no tests present)

**Status:**
- Testing infrastructure not yet implemented in this project

## Manual Testing Evidence

**Integration Test HTML:**
- `frontend/admin-dashboard-integration-test.html` exists (not part of automated test suite)
- Manual test file for development/QA
- Not integrated into CI/CD pipeline

## Mocking

**Framework:** None configured

**Patterns Observed (for future implementation):**
- Frontend API calls go through `useApi()` composable (`src/composables/useApi.js`)
- This is the natural injection point for mock implementations
- Could be extended with conditional mock API implementation

**What to Mock (Recommendations):**
- API responses from `useApi()` methods in unit tests
- `fetch()` calls if testing composables in isolation
- Pinia stores when testing components in isolation
- Vue Router when testing page navigation logic
- localStorage for auth store tests

**What NOT to Mock (Recommendations):**
- Tailwind CSS classes (test behavior, not styling)
- Icon components from `lucide-vue-next` (test component presence, not icons)
- Reactive primitives (ref, computed) - test the composed behavior instead
- Database schema in backend - test via integration tests with test database

## Test Data & Fixtures

**Current Approach:**
- Hardcoded demo credentials in both frontend and backend
- Frontend demo login: `admin@smartport.gov.th` / `admin123`
- Backend accepts same credentials (`backend/api.php` lines 46, 72)
- Demo token generation available: `demoLogin()` in `auth.js`

**Example from `stores/auth.js`:**
```javascript
async function demoLogin() {
  const demoToken = `demo-token-${Date.now()}`
  setAuth({
    token: demoToken,
    user: { id: 1, email: 'admin@smartport.gov.th', name: 'Administrator' },
  })
}
```

**Location:**
- No formal fixtures directory
- Test data would be stored in `tests/fixtures/` or `tests/mocks/` if added
- Backend: Test database would be separate from production database

## Coverage

**Requirements:** None enforced

**Current Status:**
- No coverage tools configured (no `@vitest/coverage-v8`, `nyc`, `xdebug`, etc.)
- No coverage reports generated or tracked
- Recommendation: Add coverage tooling before high-stakes deployments

## Test Types

**Unit Tests (Not Implemented):**
- **Scope:** Individual functions and composables
- **Approach (recommended):**
  - Test `useApi()` composable with mocked fetch
  - Test store mutations (setAuth, logout, showToast)
  - Test computed properties (isAuthenticated, isTokenValid)
  - Test utility functions (JWT token validation in frontend, base64url encoding in backend)

**Integration Tests (Not Implemented):**
- **Scope:** Component + store + composable interactions
- **Approach (recommended):**
  - Test LoginPage with real auth store
  - Test dashboard data loading with mocked API
  - Test navigation guards with auth state
  - Backend: Test API endpoints with test database

**E2E Tests (Not Implemented):**
- **Framework:** Could use Playwright, Cypress, or Selenium
- **Approach (recommended):**
  - Test login flow end-to-end
  - Test dashboard loads and displays data
  - Test profile page navigation
  - Test probation-end page functionality
  - Verify JWT token handling across browser refresh

## Manual Testing Checklist (Current Practice)

Based on repository structure, testing appears to be manual:

**Authentication Flow:**
- [ ] Login with correct credentials (admin@smartport.gov.th / admin123)
- [ ] Login with incorrect credentials shows error message
- [ ] Token persisted in localStorage after login
- [ ] Token sent in Authorization header on API requests
- [ ] 401 response triggers logout and redirect to login
- [ ] Demo login button works (if enabled)

**Navigation:**
- [ ] All sidebar menu items route to correct pages
- [ ] Protected routes require authentication
- [ ] Redirect to dashboard on successful login
- [ ] Redirect to login on unauthenticated access

**UI Components:**
- [ ] StatusBadge displays correct label for each status value
- [ ] Toast notifications appear and dismiss automatically
- [ ] Sidebar responsive behavior (collapse on mobile)
- [ ] Error messages display with proper styling

**API Integration:**
- [ ] Profile API returns civil servant data
- [ ] Photo upload creates file and database record
- [ ] Dashboard stats load and display correctly
- [ ] Pagination works on candidate lists

## Current Testing Gaps

**Critical Gaps:**
- No unit tests for authentication logic (token validation, JWT decoding)
- No tests for API error handling (401, 404, 500 responses)
- No tests for form validation (login form, file uploads)
- No tests for state management edge cases (simultaneous token refresh)
- No backend tests for SQL queries or database transactions

**High Priority for Implementation:**
1. Unit tests for `stores/auth.js` (critical business logic)
2. Unit tests for `composables/useApi.js` (API error handling)
3. Integration tests for LoginPage component
4. Backend tests for `/auth/login` endpoint
5. E2E test for complete login flow

## Recommended Testing Stack (for Future Implementation)

**Frontend:**
- **Test Runner:** Vitest (lightweight, Vite-native)
- **Testing Library:** Vue Test Utils for component testing
- **Assertion Library:** Vitest built-in assertions or `@testing-library/jest-dom`
- **Mocking:** Vitest's vi module for fetch/router mocks
- **Coverage:** `@vitest/coverage-v8`

**Config File Location:** `frontend/vitest.config.ts` (new, create if implementing)

**Backend:**
- **Test Runner:** PHPUnit (industry standard)
- **Mock/Fixtures:** Built-in PHPUnit mocks or Mockery library
- **Database:** Separate test database, fresh schema before each test
- **Coverage:** `phpunit-code-coverage` (installed via Composer)

**Config File Location:** `backend/phpunit.xml` (new, create if implementing)

## Example Test Structure (for Future Implementation)

**Frontend Vue Test (Vitest):**
```javascript
import { describe, it, expect, beforeEach, vi } from 'vitest'
import { useApi } from '@/composables/useApi'
import { useAuthStore } from '@/stores/auth'

describe('useApi composable', () => {
  let api

  beforeEach(() => {
    vi.stubGlobal('fetch', vi.fn())
    api = useApi()
  })

  it('attaches Authorization header with token', async () => {
    const auth = useAuthStore()
    auth.setAuth({ token: 'test-token', user: {} })

    global.fetch.mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: async () => ({ data: 'test' })
    })

    await api.get('/test')

    expect(global.fetch).toHaveBeenCalledWith(
      expect.any(String),
      expect.objectContaining({
        headers: expect.objectContaining({
          Authorization: 'Bearer test-token'
        })
      })
    )
  })

  it('logs out on 401 response', async () => {
    const auth = useAuthStore()
    auth.setAuth({ token: 'test-token', user: {} })

    global.fetch.mockResolvedValueOnce({
      ok: false,
      status: 401
    })

    await expect(api.get('/test')).rejects.toThrow('Unauthorized')
    expect(auth.token).toBe('')
  })
})
```

**Backend PHP Test (PHPUnit):**
```php
<?php
use PHPUnit\Framework\TestCase;

class AuthEndpointTest extends TestCase {
  private $pdo;

  protected function setUp(): void {
    // Use test database
    $this->pdo = new PDO('mysql:host=localhost;dbname=smartport_test', 'root', 'rootpassword');
    // Reset schema
    $this->pdo->exec(file_get_contents('mysql_database_design.sql'));
  }

  public function testLoginWithValidCredentials(): void {
    $payload = json_encode([
      'email' => 'admin@smartport.gov.th',
      'password' => 'admin123'
    ]);

    $_SERVER['REQUEST_METHOD'] = 'POST';
    $_SERVER['REQUEST_URI'] = '/api/auth/login';
    $_SERVER['HTTP_AUTHORIZATION'] = '';

    ob_start();
    include 'backend/api.php';
    $response = ob_get_clean();

    $data = json_decode($response, true);
    $this->assertArrayHasKey('token', $data);
    $this->assertArrayHasKey('user', $data);
    $this->assertEquals('admin@smartport.gov.th', $data['user']['email']);
  }
}
```

## Setup Commands (for Future Implementation)

**Frontend Setup:**
```bash
npm install --save-dev vitest @testing-library/vue @vitest/coverage-v8 jsdom
npm run test              # Run all tests
npm run test:watch       # Watch mode
npm run test:coverage    # Coverage report
```

**Backend Setup:**
```bash
composer require --dev phpunit/phpunit
composer require --dev mockery/mockery
vendor/bin/phpunit      # Run all tests
vendor/bin/phpunit --coverage-text  # With coverage
```

## Continuous Integration (Not Configured)

**Current Status:** No CI/CD testing pipeline detected

**Recommendation for Future:**
- GitHub Actions workflow to run tests on push/PR
- Block merge if tests fail or coverage drops
- Run both frontend and backend tests in parallel

---

*Testing analysis: 2026-03-22*
