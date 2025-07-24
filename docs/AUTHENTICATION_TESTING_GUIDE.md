# Employee Management System - Authentication Testing Guide

## Overview
This guide provides comprehensive test cases for the employee management system's authentication and security features, including user creation, login, portal access, and record updates.

## Prerequisites
- System is running at http://localhost:5000 (development) or production URL
- PostgreSQL database is accessible and schema is up to date
- Test data is available (employees, users, etc.)

## Test Environment Setup

### 1. Create Test Users
```bash
# Create admin user via API (requires existing admin or direct DB insert)
curl -X POST http://localhost:5000/api/users \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer <admin_token>" \
  -d '{
    "username": "testadmin",
    "password": "TestAdmin123!",
    "role": "ADMIN",
    "isActive": true
  }'

# Create HR user
curl -X POST http://localhost:5000/api/users \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer <admin_token>" \
  -d '{
    "username": "testhr",
    "password": "TestHR123!",
    "role": "HR",
    "employeeId": 1,
    "isActive": true
  }'

# Create regular employee user
curl -X POST http://localhost:5000/api/users \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer <admin_token>" \
  -d '{
    "username": "testemployee",
    "password": "TestEmp123!",
    "role": "EMPLOYEE",
    "employeeId": 2,
    "isActive": true
  }'
```

### 2. Create Test Employee Records
```bash
# Create test employee
curl -X POST http://localhost:5000/api/employees \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer <admin_token>" \
  -d '{
    "employeeId": "EMP002",
    "firstName": "Test",
    "lastName": "Employee",
    "email": "test.employee@company.com",
    "phone": "555-0123",
    "department": "Manufacturing",
    "position": "Technician",
    "hireDate": "2024-01-15",
    "isActive": true
  }'
```

## Test Cases

### 1. User Authentication Tests

#### Test 1.1: Successful Login
**Purpose**: Verify users can log in with valid credentials
**Steps**:
1. POST to `/api/auth/login` with valid username/password
2. Verify successful response with user data
3. Verify session cookie is set
4. Verify subsequent authenticated requests work

```bash
# Test successful login
curl -X POST http://localhost:5000/api/auth/login \
  -H "Content-Type: application/json" \
  -c cookies.txt \
  -d '{
    "username": "testadmin",
    "password": "TestAdmin123!"
  }'

# Expected Response:
# {
#   "success": true,
#   "user": {
#     "id": 1,
#     "username": "testadmin",
#     "role": "ADMIN",
#     "employeeId": null,
#     "canOverridePrices": false,
#     "isActive": true
#   }
# }

# Test authenticated request
curl -X GET http://localhost:5000/api/auth/user \
  -b cookies.txt

# Expected: User data returned
```

**Expected Result**: 
- Status 200
- User object returned
- Session cookie set
- Subsequent requests authenticated

#### Test 1.2: Failed Login - Invalid Credentials
**Purpose**: Verify failed login attempts are handled securely
**Steps**:
```bash
# Test invalid password
curl -X POST http://localhost:5000/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{
    "username": "testadmin",
    "password": "wrongpassword"
  }'

# Expected Response: Status 401
# { "error": "Invalid username or password" }

# Test invalid username
curl -X POST http://localhost:5000/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{
    "username": "nonexistent",
    "password": "TestAdmin123!"
  }'

# Expected Response: Status 401
```

**Expected Result**: Status 401, appropriate error message, no session created

#### Test 1.3: Account Lockout
**Purpose**: Verify accounts lock after multiple failed attempts
**Steps**:
1. Attempt login with wrong password 5+ times
2. Verify account is locked
3. Verify correct password fails during lockout
4. Wait for lockout period to expire
5. Verify login works after lockout expires

```bash
# Attempt multiple failed logins
for i in {1..6}; do
  curl -X POST http://localhost:5000/api/auth/login \
    -H "Content-Type: application/json" \
    -d '{
      "username": "testemployee",
      "password": "wrongpassword"
    }'
  echo "Attempt $i"
done

# Attempt with correct password during lockout
curl -X POST http://localhost:5000/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{
    "username": "testemployee",
    "password": "TestEmp123!"
  }'

# Expected Response: Status 423
# { "error": "Account locked for 15 minutes due to too many failed login attempts" }
```

**Expected Result**: Account locked after 5 failed attempts, lockout message returned

#### Test 1.4: Session Management
**Purpose**: Verify session tokens work correctly
**Steps**:
```bash
# Login and get session
curl -X POST http://localhost:5000/api/auth/login \
  -H "Content-Type: application/json" \
  -c cookies.txt \
  -d '{
    "username": "testadmin",
    "password": "TestAdmin123!"
  }'

# Test session persistence
curl -X GET http://localhost:5000/api/auth/user \
  -b cookies.txt

# Logout
curl -X POST http://localhost:5000/api/auth/logout \
  -b cookies.txt

# Test session invalidated
curl -X GET http://localhost:5000/api/auth/user \
  -b cookies.txt

# Expected Response: Status 401
```

**Expected Result**: Session persists after login, invalidated after logout

### 2. Role-Based Access Control Tests

#### Test 2.1: Admin Access
**Purpose**: Verify admin users can access all endpoints
**Steps**:
```bash
# Login as admin
curl -X POST http://localhost:5000/api/auth/login \
  -H "Content-Type: application/json" \
  -c admin_cookies.txt \
  -d '{
    "username": "testadmin",
    "password": "TestAdmin123!"
  }'

# Test admin-only endpoints
curl -X GET http://localhost:5000/api/users \
  -b admin_cookies.txt

curl -X GET http://localhost:5000/api/employees \
  -b admin_cookies.txt

# Expected: All endpoints accessible
```

**Expected Result**: Admin can access all protected endpoints

#### Test 2.2: HR Access
**Purpose**: Verify HR users have appropriate access
**Steps**:
```bash
# Login as HR
curl -X POST http://localhost:5000/api/auth/login \
  -H "Content-Type: application/json" \
  -c hr_cookies.txt \
  -d '{
    "username": "testhr",
    "password": "TestHR123!"
  }'

# Test HR endpoints
curl -X GET http://localhost:5000/api/employees \
  -b hr_cookies.txt

curl -X POST http://localhost:5000/api/users \
  -H "Content-Type: application/json" \
  -b hr_cookies.txt \
  -d '{
    "username": "newuser",
    "password": "NewUser123!",
    "role": "EMPLOYEE"
  }'

# Expected: HR can manage employees and users
```

**Expected Result**: HR can access employee management and user creation

#### Test 2.3: Employee Access Restrictions
**Purpose**: Verify employees can only access their own data
**Steps**:
```bash
# Login as employee
curl -X POST http://localhost:5000/api/auth/login \
  -H "Content-Type: application/json" \
  -c emp_cookies.txt \
  -d '{
    "username": "testemployee",
    "password": "TestEmp123!"
  }'

# Test employee trying to access all users (should fail)
curl -X GET http://localhost:5000/api/users \
  -b emp_cookies.txt

# Expected Response: Status 403
# { "error": "Insufficient permissions" }

# Test employee accessing their own data (should work)
curl -X GET http://localhost:5000/api/employees/2 \
  -b emp_cookies.txt

# Expected: Employee data returned

# Test employee trying to access other employee data (should fail)
curl -X GET http://localhost:5000/api/employees/1 \
  -b emp_cookies.txt

# Expected Response: Status 403
```

**Expected Result**: Employees can only access their own data

### 3. Employee Portal Access Tests

#### Test 3.1: Portal Token Generation
**Purpose**: Verify secure portal tokens are generated correctly
**Steps**:
```bash
# Login as admin
curl -X POST http://localhost:5000/api/auth/login \
  -H "Content-Type: application/json" \
  -c admin_cookies.txt \
  -d '{
    "username": "testadmin",
    "password": "TestAdmin123!"
  }'

# Generate portal token for employee
curl -X POST http://localhost:5000/api/employees/2/portal-token \
  -b admin_cookies.txt

# Expected Response:
# {
#   "token": "portal_<base64_encoded_data>",
#   "portalUrl": "http://localhost:5000/portal/portal_<base64_encoded_data>",
#   "expiresIn": "24 hours"
# }
```

**Expected Result**: Secure portal token generated with expiration

#### Test 3.2: Portal Access Validation
**Purpose**: Verify portal tokens provide secure access
**Steps**:
```bash
# Use token from previous test
PORTAL_TOKEN="portal_<from_previous_test>"

# Test portal employee access
curl -X GET http://localhost:5000/api/portal/$PORTAL_TOKEN/employee

# Expected: Employee data returned

# Test portal time clock access
curl -X GET http://localhost:5000/api/portal/$PORTAL_TOKEN/timeclock

# Expected: Time clock status returned
```

**Expected Result**: Valid tokens provide access, invalid tokens rejected

#### Test 3.3: Portal Token Expiration
**Purpose**: Verify portal tokens expire correctly
**Steps**:
1. Generate portal token
2. Wait for expiration (or modify token to be expired)
3. Attempt to use expired token
4. Verify access is denied

```bash
# Test with invalid/expired token
curl -X GET http://localhost:5000/api/portal/invalid_token/employee

# Expected Response: Status 403
# { "error": "Invalid or expired portal token" }
```

**Expected Result**: Expired tokens are rejected with appropriate error

### 4. Time Clock Portal Tests

#### Test 4.1: Clock In/Out Functionality
**Purpose**: Verify time tracking works through portal
**Steps**:
```bash
PORTAL_TOKEN="portal_<valid_token>"

# Clock in
curl -X POST http://localhost:5000/api/portal/$PORTAL_TOKEN/timeclock/clock-in

# Expected: Time entry created with clock-in time

# Check status
curl -X GET http://localhost:5000/api/portal/$PORTAL_TOKEN/timeclock

# Expected: Status shows "IN" with clock-in time

# Clock out
curl -X POST http://localhost:5000/api/portal/$PORTAL_TOKEN/timeclock/clock-out

# Expected: Time entry updated with clock-out time

# Check final status
curl -X GET http://localhost:5000/api/portal/$PORTAL_TOKEN/timeclock

# Expected: Status shows "OUT" with both times
```

**Expected Result**: Time clock functionality works correctly through portal

#### Test 4.2: Clock In/Out Validation
**Purpose**: Verify proper validation of time clock operations
**Steps**:
```bash
PORTAL_TOKEN="portal_<valid_token>"

# Try to clock out without clocking in
curl -X POST http://localhost:5000/api/portal/$PORTAL_TOKEN/timeclock/clock-out

# Expected Response: Status 400
# { "error": "Must clock in first" }

# Clock in
curl -X POST http://localhost:5000/api/portal/$PORTAL_TOKEN/timeclock/clock-in

# Try to clock in again
curl -X POST http://localhost:5000/api/portal/$PORTAL_TOKEN/timeclock/clock-in

# Expected Response: Status 400
# { "error": "Already clocked in" }
```

**Expected Result**: Proper validation prevents invalid time clock operations

### 5. Daily Checklist Portal Tests

#### Test 5.1: Checklist Retrieval
**Purpose**: Verify employees can access their daily checklist
**Steps**:
```bash
PORTAL_TOKEN="portal_<valid_token>"

# Get daily checklist
curl -X GET http://localhost:5000/api/portal/$PORTAL_TOKEN/checklist

# Expected: Array of checklist items for today
```

**Expected Result**: Employee's daily checklist returned

#### Test 5.2: Checklist Updates
**Purpose**: Verify employees can update their checklist
**Steps**:
```bash
PORTAL_TOKEN="portal_<valid_token>"

# Update checklist
curl -X POST http://localhost:5000/api/portal/$PORTAL_TOKEN/checklist \
  -H "Content-Type: application/json" \
  -d '{
    "items": [
      {
        "label": "Safety equipment check",
        "type": "checkbox",
        "value": "true",
        "required": true
      },
      {
        "label": "Work area inspection",
        "type": "checkbox", 
        "value": "true",
        "required": true
      }
    ]
  }'

# Expected: Updated checklist returned
```

**Expected Result**: Checklist items updated successfully

### 6. Password Management Tests

#### Test 6.1: Password Change
**Purpose**: Verify users can change their passwords
**Steps**:
```bash
# Login
curl -X POST http://localhost:5000/api/auth/login \
  -H "Content-Type: application/json" \
  -c cookies.txt \
  -d '{
    "username": "testemployee",
    "password": "TestEmp123!"
  }'

# Change password
curl -X POST http://localhost:5000/api/auth/change-password \
  -H "Content-Type: application/json" \
  -b cookies.txt \
  -d '{
    "currentPassword": "TestEmp123!",
    "newPassword": "NewPassword123!"
  }'

# Expected Response: Status 200
# { "message": "Password changed successfully" }

# Test login with new password
curl -X POST http://localhost:5000/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{
    "username": "testemployee",
    "password": "NewPassword123!"
  }'

# Expected: Successful login
```

**Expected Result**: Password changed successfully, old password no longer works

#### Test 6.2: Password Change Validation
**Purpose**: Verify password change validation
**Steps**:
```bash
# Try to change with wrong current password
curl -X POST http://localhost:5000/api/auth/change-password \
  -H "Content-Type: application/json" \
  -b cookies.txt \
  -d '{
    "currentPassword": "wrongpassword",
    "newPassword": "NewPassword123!"
  }'

# Expected Response: Status 400
# { "error": "Current password is incorrect" }

# Try weak new password
curl -X POST http://localhost:5000/api/auth/change-password \
  -H "Content-Type: application/json" \
  -b cookies.txt \
  -d '{
    "currentPassword": "TestEmp123!",
    "newPassword": "weak"
  }'

# Expected Response: Status 400 (validation error)
```

**Expected Result**: Proper validation of password change requests

## Manual Testing Scenarios

### Scenario 1: Complete Employee Onboarding
1. Admin creates employee record
2. HR creates user account for employee
3. HR generates portal token and shares with employee
4. Employee accesses portal using token
5. Employee completes daily checklist
6. Employee uses time clock functionality
7. Verify all actions are logged properly

### Scenario 2: Security Breach Response
1. Detect suspicious login attempts
2. Admin reviews audit logs
3. Admin disables compromised user account
4. Admin generates new portal token for employee
5. Verify old tokens no longer work
6. Verify new access works correctly

### Scenario 3: Role Changes
1. Employee promoted to manager
2. Admin updates user role
3. Verify new permissions take effect
4. Verify previous restrictions no longer apply
5. Test access to newly available features

## Security Validation Checklist

- [ ] Passwords are properly hashed (never stored in plain text)
- [ ] Session tokens are cryptographically secure
- [ ] Portal tokens have proper expiration
- [ ] Failed login attempts trigger account lockout
- [ ] Role-based access control works correctly
- [ ] Employees can only access their own data
- [ ] Admin/HR can access appropriate data
- [ ] All sensitive operations are logged
- [ ] Session invalidation works on logout
- [ ] Password requirements are enforced
- [ ] No sensitive data in error messages
- [ ] CSRF protection in place (cookies with sameSite)
- [ ] SQL injection protection (parameterized queries)
- [ ] Input validation on all endpoints

## Performance Testing

### Load Testing Login Endpoint
```bash
# Use Apache Bench or similar tool
ab -n 1000 -c 10 -p login_data.json -T application/json http://localhost:5000/api/auth/login
```

### Concurrent Session Testing
```bash
# Test multiple simultaneous logins
for i in {1..10}; do
  curl -X POST http://localhost:5000/api/auth/login \
    -H "Content-Type: application/json" \
    -d "{\"username\":\"user$i\",\"password\":\"password$i\"}" &
done
wait
```

## Cleanup
After testing, clean up test data:
```bash
# Delete test users and employees
# Reset any modified data
# Clear test sessions
```

## Troubleshooting Common Issues

1. **Database Connection Errors**: Verify DATABASE_URL is set correctly
2. **Authentication Failures**: Check password hashing is working
3. **Token Validation Issues**: Verify token generation and parsing logic
4. **Role Access Denied**: Confirm role assignments and middleware logic
5. **Portal Access Problems**: Check token expiration and employee associations

## Monitoring and Logging

Monitor these key metrics during testing:
- Login success/failure rates
- Session creation/invalidation
- Portal token usage
- Failed authentication attempts
- Role-based access violations
- Performance metrics for auth endpoints