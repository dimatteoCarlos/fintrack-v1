# 🛠️ Utilities Reference

A technical reference for the utility modules of the project, divided into
**backend (server-side)** and **frontend (client-side)** layers.

Every heading names the module's real path, and each function is listed under
the file that exports it, so a name here can be opened without searching for it.

---

## 🏗️ Backend utilities

### 1. Authentication (`backend/src/utils/authUtils/authFn.js`)

Password encryption and the lifecycle of a JWT session.

- **`hashed(word)`**: Salts and hashes a password with [bcrypt](https://www.npmjs.com/package/bcrypt), using the salt rounds set in the environment.
- **`isRight(userPwd, hashedPwd)`**: Compares a plain-text password against a stored hash at login.
- **`createToken(id, role)`**: Issues a short-lived **access token** (1 hour) carrying the user id and role.
- **`createRefreshToken(id)`**: Issues a long-lived **refresh token** (7 days) so a session survives without re-authentication.
- **`rotateRefreshToken(oldToken, userId, req)`**: Revokes the used token in the database and issues a new one, recording the IP address and user agent as audit metadata.
- **`cleanRevokedTokens()`**: Maintenance worker that deletes expired and revoked rows from `refresh_tokens`.
- **`revokeAllUserRefreshTokens(userId)`**: Invalidates every active token of one user — the global logout, and the reset after a password change.

The token model these functions implement, and the flows that call them, are in
[the auth guide](AUTH_GUIDE.md).

#### Environment configuration

```env
SALT_ROUNDS=10
JWT_SECRET=your_access_secret
JWT_REFRESH_TOKEN_SECRET=your_refresh_secret
JWT_ISSUER=fintrack_app
```

> The module reaches the database pool directly. The connection has to be
> initialized before rotation or cleanup is called.

### 2. Account lookups (`backend/src/utils/fintrackUtils/accountDataRetrieval/accountUtils.js`)

Relationships and queries over the account tables.

- **`USER_CREATABLE_ACCOUNT_TYPES` and `assertUserCreatableAccountType(accountTypeName, field)`**: The account types a request may create; the assertion returns the normalised type name or throws a **400** naming the field.
- **`NOT_BOUNDARY_ACCOUNT` and `LIVE_ACCOUNT`**: SQL predicates shared by the queries that publish a user's money. The first excludes the compensation account by type, the second excludes deleted and closed accounts.
- **`getAccountsByType(userId, accountType, timeZone, clientOrPool)`**: Lists every account of one type the user has ever had, closed ones included, with the ends of each account's own window.

### 3. General helpers (`backend/src/utils/helpers.js`)

Name normalization, transaction classification and date formatting.

- **`normalizeAccountName(text)`**: The stored form of an account name: trimmed and lowercase. Display capitalization is the frontend's job.
- **`normalizePersonName(text)`**: Whitespace cleaned, case kept, because capitalization such as McCartney or O'Connor is user data.
- **`determineTransactionType(amount, accountType)`**: For account-creation transactions only: the transaction type and its counter type from the sign of the amount and the account type. Zero is an account opening; on a debtor account a positive amount is a `borrow` and a negative one a `lend`, on any other account a positive amount is a `deposit` and a negative one a `withdraw`.
- **`formatDateToDDMMYYYY(isoDate)`**: Renders an ISO 8601 string as `dd-mm-yyyy`, read in UTC.
- **`formatDate(date)`**: Formats a date as `DD/MM/YYYY HH:MM` (en-GB).
- **`formatDateToVenezuelanStyle(date)`**: Returns `{ dateStr, timeStr }` in Venezuelan style (es-VE).

Currency identifiers are not resolved here. `getCurrencyId(clientOrPool, code)`
is exported by `backend/src/utils/currencyLookup.js`, which answers from the
loaded catalog and falls back to the database.

#### Usage

```javascript
// A positive amount on a 'debtor' account is a borrow
const type = determineTransactionType(500, 'debtor');
// { transactionType: 'borrow', counterTransactionType: 'lend' }
```

---

## 🎨 Frontend utilities

### 1. Presentation and formatting (`frontend/src/fintrack/helpers/functions.ts`)

Internationalization and display, on the native `Intl` API with no external
dependency.

- **`currencyFormat` and `numberFormatCurrency`**: Render a raw number as a localized currency string, with the decimal precision and the regional setting given — `en-US` against `es-CO`.
- **`getCurrencySymbol(currencyCode)`**: Returns the narrow symbol — `$`, `€`, `£` — falling back to the ISO code where no symbol exists.
- **`isValidCurrencyCode(code)`**: Guard over the supported ISO 4217 codes.

```typescript
numberFormatCurrency(50000, 0, 'COP', 'es-CO'); // "COP 50.000"
getCurrencySymbol('USD');                       // "$"
```

### 2. Identity storage (`frontend/src/auth/auth_utils/localStorageHandle/authStorage.ts`)

Pure functions over `localStorage` for the identity the login form prefills.
This is the only place that reads or writes it.

- **`saveIdentity(identity)`**: Called when a user signs in or edits their profile.
- **`getIdentity()`**: Prefills the login form and restores the identity on load. A stored object whose shape does not match is treated as corrupt and cleared.
- **`clearIdentity()`**: Called on logout, and when the user withdraws consent to be remembered.

Every call is wrapped so that a disabled or full `localStorage` cannot bring the
application down. Written in TypeScript against `UserIdentityType`.

#### Stored shape

| Property     | Type    | Description                   |
| ------------ | ------- | ----------------------------- |
| `email`      | string  | Registered email address      |
| `username`   | string  | Display name                  |
| `rememberMe` | boolean | Whether persistence was asked |

```typescript
import { saveIdentity, getIdentity, clearIdentity } from './authStorage';

saveIdentity({ email: 'user@example.com', username: 'johndoe', rememberMe: true });

const identity = getIdentity();
if (identity) {
 // prefill the form
}

clearIdentity();
```

> This module holds identity only. No token is stored here: the access token
> lives in `sessionStorage` and the refresh token in an HttpOnly cookie.

---

## 🚀 Environment requirements

| Variable      | Usage            | Source                                      |
| ------------- | ---------------- | ------------------------------------------- |
| `SALT_ROUNDS` | Password hashing | Backend `.env`                              |
| `JWT_SECRET`  | Access tokens    | Backend `.env`                              |
| `PG_DATABASE` | Data persistence | [PostgreSQL](https://www.postgresql.org)    |
| `Intl` API    | Localization     | The browser; no package is installed for it |
