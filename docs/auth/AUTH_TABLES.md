
# 📋 ALL STATE INDICATORS IN THE AUTHENTICATION SYSTEM

---

## 🗃️ 1. BACKEND – DATABASE

### Table: `users`

| Column          | Data Type    | Possible Values      | Description                                                  |
| --------------- | ------------ | -------------------- | ------------------------------------------------------------ |
| user_id         | UUID         | UUID v4              | Primary key                                                   |
| username        | VARCHAR(50)  | Unique text          | Username for login                                            |
| email           | VARCHAR(255) | Unique email         | User email address                                            |
| password_hashed | VARCHAR(255) | bcrypt hash          | Secure hashed password                                        |
| user_firstname  | VARCHAR(25)  | Text                 | First name                                                    |
| user_lastname   | VARCHAR(25)  | Text                 | Last name                                                     |
| user_contact    | VARCHAR(25)  | Text or NULL         | Contact information                                           |
| currency_id     | INTEGER      | Currency ID          | Preferred currency                                            |
| timezone        | TEXT         | An IANA zone name    | Defaults to `'UTC'`. A trigger rejects a name Postgres does not know, because a CHECK cannot consult the zone catalog |
| google_id       | VARCHAR(255) | Unique text or NULL  | Set only for an account opened through Google                 |
| display_name    | VARCHAR(255) | Text or NULL         | The name the provider supplied                                |
| auth_method     | VARCHAR(50)  | `'password'`, …      | How the account authenticates                                 |
| user_role_id    | INTEGER      | Role ID              | User role                                                     |
| token_version   | INTEGER      | `0` and upward       | **Bumped on password change.** An access token carrying an older value stops verifying at once, instead of staying valid for the rest of its hour |
| created_at      | TIMESTAMPTZ  | Date/time            | Record creation timestamp                                     |
| updated_at      | TIMESTAMPTZ  | Date/time            | Last update timestamp                                         |
| deleted_at      | TIMESTAMPTZ  | Date/time or NULL    | Set when the account is closed; the row is kept               |

**Why `token_version` exists.** Revoking the refresh tokens on a password change invalidates
only the credential that would issue a *future* access token. The access token already in the
browser is stateless — verified by signature against no table — so it kept authenticating for up
to its full hour after the change, which matters most in exactly the case the password was
changed because it leaked. A counter costs one column, one write on change and one read on
verification, and unlike a denylist of token ids it does not grow.

---

### Table: `currencies`

| Column        | Data Type   | Possible Values     | Description         |
| ------------- | ----------- | ------------------- | ------------------- |
| currency_id   | INTEGER     | ID                  | Currency identifier |
| currency_code | VARCHAR(3)  | 'usd', 'eur', 'cop' | Currency code       |
| currency_name | VARCHAR(50) | Text                | Currency name       |

---

### Table: `user_roles`

| Column         | Data Type   | Possible Values                                  | Description     |
| -------------- | ----------- | ------------------------------------------------ | --------------- |
| user_role_id   | SERIAL      | ID                                               | Role identifier |
| user_role_name | VARCHAR(15) | 'user', 'admin', 'super_admin', 'system_admin'   | Role name, constrained by a CHECK to exactly these four |

**Four roles, not three.** `system_admin` exists alongside `super_admin` and the CHECK admits
it. The hierarchy in §5 ranks only the three a person can hold.

---

### Table: `refresh_tokens`

| Column          | Data Type   | Possible Values         | Description                                        |
| --------------- | ----------- | ----------------------- | -------------------------------------------------- |
| token_id        | UUID        | UUID v4                 | Primary key, defaulted from `gen_random_uuid()`     |
| user_id         | UUID        | UUID                    | Associated user, `ON DELETE CASCADE`                |
| token           | TEXT UNIQUE | 64 hex characters       | **The SHA-256 digest of the JWT, not the JWT**      |
| expiration_date | TIMESTAMPTZ | Date/time               | When the row stops being accepted                   |
| revoked         | BOOLEAN     | true / false            | Set on logout, on rotation and on password change   |
| user_agent      | TEXT        | String                  | Client user agent                                   |
| ip_address      | TEXT        | String                  | Client IP address                                   |
| created_at      | TIMESTAMPTZ | Date/time               | Issue time                                          |
| updated_at      | TIMESTAMPTZ | Date/time               | Last rotation                                       |

**The `token` column holds a digest, not a credential.** The refresh endpoint hashes what the
cookie presents and looks the digest up, so a reader of this table cannot mint a session from
it. SHA-256 rather than bcrypt: the input is a signed JWT with full entropy, not a human
password, and it is hashed on every refresh — bcrypt's slowness defends against guessing a
low-entropy secret, which is not the threat, and would tax every request.

---

## 📡 2. BACKEND – HTTP RESPONSES (ENDPOINTS)

### POST `/sign-in`

| HTTP Code | Field               | Possible Values      | Description           |
| --------- | ------------------- | -------------------- | --------------------- |
| 200       | message             | "Login successful"   | Success message       |
| 200       | accessToken         | JWT string           | Access token          |
| 200       | user.user_id        | UUID                 | User ID               |
| 200       | user.username       | String               | Username              |
| 200       | user.email          | Email                | User email            |
| 200       | user.user_firstname | String               | First name            |
| 200       | user.user_lastname  | String               | Last name             |
| 200       | user.user_contact   | String or null       | Contact info          |
| 200       | user.user_role_name | String               | User role             |
| 200       | user.currency       | 'usd', 'eur', 'cop'  | Currency              |
| 200       | expiresIn           | Number               | Expiration in seconds |
| 400       | success             | false                | Error indicator       |
| 400       | error               | "ValidationError"    | Error type            |
| 400       | message             | String               | Descriptive message   |
| 400       | fieldErrors         | Object               | Field-level errors    |
| 401       | success             | false                | Error indicator       |
| 401       | error               | "InvalidCredentials" | Error type            |
| 401       | message             | "Invalid password"   | Error message         |
| 429       | success             | false                | Error indicator       |
| 429       | error               | "RateLimitExceeded"  | Error type            |
| 429       | message             | String               | Message               |
| 429       | retryAfter          | Number               | Seconds to retry      |

---

### POST `/sign-up`

| HTTP Code | Field       | Possible Values   | Description           |
| --------- | ----------- | ----------------- | --------------------- |
| 201       | message     | String            | Success message       |
| 201       | accessToken | JWT (optional)    | Access token          |
| 201       | user        | Object            | User data             |
| 201       | expiresIn   | Number (optional) | Expiration in seconds |

---

### POST `/sign-out`

| HTTP Code | Field   | Possible Values           | Description     |
| --------- | ------- | ------------------------- | --------------- |
| 200       | message | "Logged out successfully" | Success message |

---

### GET `/validate-session`

| HTTP Code | Field   | Possible Values | Description  |
| --------- | ------- | --------------- | ------------ |
| 200       | message | String          | Info message |
| 200       | user    | Object          | User data    |

---

### POST `/refresh-token`

Reads the refresh token from the HttpOnly cookie; nothing is sent in the body. Guarded by an
origin check before the cookie is trusted.

| HTTP Code | Field       | Possible Values | Description                                          |
| --------- | ----------- | --------------- | ---------------------------------------------------- |
| 200       | accessToken | JWT string      | A new access token; a rotated refresh token is set as a cookie when rotation applies |
| 401       | error       | String          | No cookie, a bad signature, or a row that is revoked, expired or absent |

---

### GET `/profile`

Returns the authenticated caller, read from the token. **It takes no user id**: a `/:userId`
route existed, promised to fetch an arbitrary user, could not do it, and shadowed this one.

| HTTP Code | Field | Possible Values | Description                |
| --------- | ----- | --------------- | -------------------------- |
| 200       | user  | Object          | The caller's own user data |

---

### PATCH `/update-profile`

| HTTP Code | Field       | Possible Values   | Description        |
| --------- | ----------- | ----------------- | ------------------ |
| 200       | success     | true              | Success indicator  |
| 200       | message     | String            | Success message    |
| 200       | user        | Object            | Updated user data  |
| 400       | success     | false             | Error indicator    |
| 400       | error       | "ValidationError" | Error type         |
| 400       | message     | String            | Error message      |
| 400       | fieldErrors | Object            | Field-level errors |

---

### PATCH `/change-password`

| HTTP Code | Field       | Possible Values          | Description        |
| --------- | ----------- | ------------------------ | ------------------ |
| 200       | success     | true                     | Success indicator  |
| 200       | message     | String                   | Success message    |
| 403       | success     | false                    | Error indicator    |
| 403       | error       | "InvalidCurrentPassword" | Error type         |
| 403       | message     | String                   | Error message      |
| 403       | fieldErrors | Object                   | Field-level errors |

---

# 🏪 3. FRONTEND – ZUSTAND STORES

### 3.1 useAuthStore – Session State

| Indicator               | Type          | Possible Values                | Initial | Description                          |
| ----------------------- | ------------- | ------------------------------ | ------- | ------------------------------------ |
| isAuthenticated         | boolean       | true / false                   | false   | User has an active session           |
| userData                | object / null | UserDataType or null           | null    | Complete user data                   |
| userData.user_id        | string        | UUID                           | -       | User ID                              |
| userData.username       | string        | Text                           | -       | Username                             |
| userData.email          | string        | Email                          | -       | Email address                        |
| userData.user_firstname | string        | Text                           | -       | First name                           |
| userData.user_lastname  | string        | Text                           | -       | Last name                            |
| userData.currency       | string        | 'usd', 'eur', 'cop'            | 'usd'   | Preferred currency                   |
| userData.role           | string        | 'user', 'admin', 'super_admin' | 'user'  | User role                            |
| userData.contact        | string / null | Text or null                   | null    | Contact info                         |
| isCheckingAuth          | boolean       | true / false                   | true    | Initial session verification         |
| isLoading               | boolean       | true / false                   | false   | Indicates auth operation in progress |
| error                   | string / null | Message or null                | null    | Global authentication error          |
| successMessage          | string        | Message or empty               | ''      | Success message                      |

---

### 3.2 useAuthUIStore – Auth UI State

| Indicator         | Type          | Possible Values                                                     | Initial | Description                    |
| ----------------- | ------------- | ------------------------------------------------------------------- | ------- | ------------------------------ |
| uiState           | enum          | 'IDLE', 'REMEMBERED_VISITOR', 'SESSION_EXPIRED', 'PASSWORD_CHANGED' | 'IDLE'  | Current UI state               |
| message           | string / null | Text or null                                                        | null    | Global message (success/error) |
| prefilledEmail    | string / null | Email or null                                                       | null    | Prefill email for login        |
| prefilledUsername | string / null | Username or null                                                    | null    | Prefill username               |

---

## 💾 4. FRONTEND – STORAGE

### 4.1 localStorage

| Key                      | Type          | Possible Values                         | Persistence | Description                                       |
| ------------------------ | ------------- | --------------------------------------- | ----------- | ------------------------------------------------- |
| auth_identity            | object / null | { email, username, rememberMe } or null | Yes         | Stored user identity data                         |
| auth_identity.email      | string        | Email                                   | Yes         | Stored email                                      |
| auth_identity.username   | string        | Text                                    | Yes         | Stored username                                   |
| auth_identity.rememberMe | boolean       | true / false                            | Yes         | Indicates whether the user wants to be remembered |

---

### 4.2 sessionStorage

| Key         | Type          | Possible Values   | Persistence   | Description           |
| ----------- | ------------- | ----------------- | ------------- | --------------------- |
| accessToken | string / null | JWT or null       | Session (tab) | Current access token  |
| tokenExpiry | number / null | Timestamp or null | Session (tab) | Token expiration time |

---

## 🧭 5. FRONTEND – REACT ROUTER

| Indicator                        | Type                | Possible Values             | Description                              |
| -------------------------------- | ------------------- | --------------------------- | ---------------------------------------- |
| location.pathname                | string              | '/', '/auth', '/fintrack/*' | Current application route                |
| location.state.from              | string / undefined  | Origin route                | Route from which navigation occurred     |
| location.state.fromLogout        | boolean / undefined | true / undefined            | Indicates navigation after manual logout |
| location.state.hasIdentity       | boolean / undefined | true / undefined            | Indicates if identity exists for prefill |
| location.state.prefilledEmail    | string / undefined  | Email                       | Email used to prefill login              |
| location.state.prefilledUsername | string / undefined  | Username                    | Username used to prefill login           |

---

## 📐 6. DERIVED (COMPUTED) INDICATORS

| Indicator           | Where Calculated        | Calculation                                   | Values       | Description                                  |
| ------------------- | ----------------------- | --------------------------------------------- | ------------ | -------------------------------------------- |
| showModal           | AuthPage.tsx            | uiState !== 'IDLE' && pathname === AUTH_ROUTE | true / false | Determines whether modal is visible on /auth |
| isDirty             | UpdateProfileContainer  | formData !== initialData                      | true / false | Indicates unsaved changes exist              |
| isSubmittingAllowed | Form hooks              | allTouched && !hasErrors && !isSubmitting     | true / false | Determines if submit is allowed              |
| hasIdentity         | ProtectedRoute          | getIdentity() !== null                        | true / false | Indicates stored identity exists             |
| canReset            | ChangePasswordContainer | isDirty && !isSubmitting                      | true / false | Determines if Reset button is enabled        |
| showDone            | Containers              | status === 'success'                          | true / false | Determines if Done button should be shown    |

---

## 🧩 7. FRONTEND – COMPOUND TYPES

### UserDataType (Store)

```ts
type UserDataType = {
  user_id: string;
  username: string;
  email: string;
  user_firstname: string;
  user_lastname: string;
  currency: 'usd' | 'eur' | 'cop';
  role: 'user' | 'admin' | 'super_admin';
  contact: string | null;
}
```

---

### UserIdentityType (localStorage)

```ts
type UserIdentityType = {
  email: string;
  username: string;
  rememberMe: boolean;
}
```

---

### UpdateProfileFormDataType (Form)

```ts
type UpdateProfileFormDataType = {
  firstname: string;
  lastname: string;
  currency: 'usd' | 'eur' | 'cop';
  contact: string | null;
}
```

---

### ChangePasswordFormDataType (Form)

```ts
type ChangePasswordFormDataType = {
  currentPassword: string;
  newPassword: string;
  confirmPassword: string;
}
```

### AuthEventResultType (Event handler)

`frontend/src/auth/authEvent/types/eventTypes.ts`. What a handler returns rather
than performs: the handler executes nothing, and `AuthPage` reads this object and
carries out the actions in it.

```ts
type AuthEventResultType = {
  uiState?: AuthUIStateType;            // 'IDLE' | 'SIGN_IN' | 'SIGN_UP'
  message?: string | null;
  prefill?: { identity?: string | null } | null;
  navigation?: {
    to: string;
    replace?: boolean;
    state?: Record<string, unknown>;
  };
  returnTo?: string | null;             // where a session expiry should return to
}
```

---

## 🎯 8. STATE MATRIX BY SCENARIO

| Scenario                           | isAuthenticated | identity      | uiState            | Destination Route | Modal | Prefill |
| ---------------------------------- | --------------- | ------------- | ------------------ | ----------------- | ----- | ------- |
| First visit                        | false           | null          | IDLE               | /                 | No    | No      |
| Successful login (remember)        | true            | {...}         | IDLE               | /fintrack         | No    | N/A     |
| Successful login (no remember)     | true            | null          | IDLE               | /fintrack         | No    | N/A     |
| Manual logout (with identity)      | false           | {...}         | IDLE               | /                 | No    | No      |
| Manual logout (without identity)   | false           | null          | IDLE               | /                 | No    | No      |
| Session expired (with identity)    | false           | {...}         | SESSION_EXPIRED    | /auth             | Yes   | Yes     |
| Session expired (without identity) | false           | null          | SESSION_EXPIRED    | /                 | No    | No      |
| Successful password change         | false           | {...} or null | PASSWORD_CHANGED   | /auth             | Yes   | No      |
| Remembered visitor on /auth        | false           | {...}         | REMEMBERED_VISITOR | /auth             | Yes   | Yes     |

---

## ✅ COMPONENT SUMMARY

| Component               | Consumes                                  | Produces             |
| ----------------------- | ----------------------------------------- | -------------------- |
| ProtectedRoute          | isAuthenticated, identity, location       | redirectTo, state    |
| AuthPage                | uiState, message, prefilled*, location    | showModal            |
| AuthUI                  | isSignInInitial, error, messageToUser     | isSignIn (local)     |
| SignInForm              | formData, validationErrors, touchedFields | onSignIn             |
| ChangePasswordContainer | status, countdown, isDirty                | showDone, showCancel |
| UpdateProfileContainer  | isDirty, isLoading, successMessage        | status               |

---

