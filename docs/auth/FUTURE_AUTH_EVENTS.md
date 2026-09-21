# 🔮 Future Auth Events – Implementation Examples

This document contains **reference examples** for implementing additional authentication events. These are **not active in the codebase** but serve as a guide for future extensions.

---

## Event Reference Table

| Event | Data | Suggested Handler Behavior |
|-------|------|---------------------------|
| `email_verification_required` | `{ email: string }` | Show verification prompt with resend option |
| `account_locked` | `{ retryAfter: number }` | Show lock message with timer |
| `two_factor_required` | `{ tempToken: string }` | Redirect to 2FA page or show 2FA modal |
| `welcome_new_user` | `{ email?: string; username?: string }` | Show onboarding modal with welcome message |
| `maintenance_mode` | `{ message: string; endTime?: string }` | Show maintenance banner or redirect |
| `password_reset_requested` | `{ email: string }` | Show confirmation message "Check your email" |
| `subscription_expired` | `{ plan: string; redirectUrl?: string }` | Show upgrade prompt, optionally redirect |

---

## Example: Adding `email_verification_required`

### Step 1: Update `eventTypes.ts`

```typescript
export type AuthEventMapType = {
  // ... existing events
  email_verification_required: { email: string };
};
```

### Step 2: Update `authEventRegistry.ts`

```typescript
export const authEventRegistry = {
  // ... existing handlers
  email_verification_required: (data) => ({
    uiState: 'SIGN_IN',
    message: `Please verify your email (${data?.email}) before logging in.`,
  }),
};
```

### Step 3: Update `AuthPage.tsx` – `getEventData()`

```typescript
const getEventData = (event, navState) => {
  switch (event) {
    // ... existing cases
    case 'email_verification_required':
      return { email: navState?.email };
  }
};
```

### Step 4: Update `navigationState` type

```typescript
const navigationState = location.state as {
  authEvent?: string;
  from?: string;
  email?: string;  // ← add this
} | undefined;
```

### Step 5: Emit the event

```typescript
navigate('/auth', {
  state: {
    authEvent: 'email_verification_required',
    email: user.email
  }
});
```

---

## Example: Adding `two_factor_required`

### Step 1: Update `eventTypes.ts`

```typescript
export type AuthEventMapType = {
  // ... existing events
  two_factor_required: { tempToken: string };
};
```

### Step 2: Update `authEventRegistry.ts`

```typescript
export const authEventRegistry = {
  // ... existing handlers
  two_factor_required: (data) => ({
    uiState: 'SIGN_IN', // or a custom 2FA state
    message: 'Two-factor authentication required.',
    navigation: { to: '/2fa', state: { tempToken: data?.tempToken } },
  }),
};
```

### Step 3: Update `AuthPage.tsx` – `getEventData()`

```typescript
const getEventData = (event, navState) => {
  switch (event) {
    // ... existing cases
    case 'two_factor_required':
      return { tempToken: navState?.tempToken };
  }
};
```

### Step 4: Update `navigationState` type

```typescript
const navigationState = location.state as {
  authEvent?: string;
  from?: string;
  tempToken?: string;  // ← add this
} | undefined;
```

### Step 5: Emit the event

```typescript
navigate('/auth', {
  state: {
    authEvent: 'two_factor_required',
    tempToken: 'abc123...'
  }
});
```

---

## Example: Adding `welcome_new_user`

### Step 1: Update `eventTypes.ts`

```typescript
export type AuthEventMapType = {
  // ... existing events
  welcome_new_user: { email?: string; username?: string };
};
```

### Step 2: Update `authEventRegistry.ts`

```typescript
export const authEventRegistry = {
  // ... existing handlers
  welcome_new_user: (data) => ({
    uiState: 'SIGN_IN',
    message: `Welcome ${data?.email || data?.username || 'new user'}!`,
    prefill: { email: data?.email, username: data?.username },
  }),
};
```

### Step 3: Update `AuthPage.tsx` – `getEventData()`

```typescript
const getEventData = (event, navState) => {
  switch (event) {
    // ... existing cases
    case 'welcome_new_user':
      return { email: navState?.email, username: navState?.username };
  }
};
```

### Step 4: Update `navigationState` type

```typescript
const navigationState = location.state as {
  authEvent?: string;
  from?: string;
  email?: string;
  username?: string;  // ← add this
} | undefined;
```

### Step 5: Emit the event

```typescript
navigate('/auth', {
  state: {
    authEvent: 'welcome_new_user',
    email: newUser.email,
    username: newUser.username
  }
});
```

---

## 📌 General Pattern

To add **any new event**, follow this pattern:

1. **Add type** in `eventTypes.ts` (data shape)
2. **Add handler** in `authEventRegistry.ts` (returns `AuthEventResultType`)
3. **Add case** in `getEventData()` (extract data from `location.state`)
4. **Add property** in `navigationState` type (for TypeScript)
5. **Emit** from any component using `navigate('/auth', { state: { authEvent, ...data } })`

The orchestrator (`AuthPage`) handles everything else automatically.

---

## 🔗 Related Documentation

- [AuthEvent Architecture](./AUTH_EVENT_ARCHITECTURE.md) – Main documentation
- [Source Code](../../frontend/src/auth/authEvent) – Implementation files
