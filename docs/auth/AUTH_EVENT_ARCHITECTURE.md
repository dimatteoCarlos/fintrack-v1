# 🧠 AuthEvent Architecture – Declarative Event-Driven Authentication

## 🎯 Objective

The **AuthEvent** architecture provides a **centralized, type-safe, and declarative** way to handle authentication-related navigation events (e.g., password changed, session expired, user logged out) in a React + TypeScript application.

It replaces scattered, imperative logic with a clean, maintainable, and extensible event-driven system.

---

## 📌 What It Solves

| Problem | Solution |
|---------|----------|
| Authentication logic scattered across components | Centralized in `authEventRegistry.ts` |
| Navigation side effects hidden inside handlers | Handlers are pure – they return **descriptions** of what should happen |
| Hard to add new events without touching multiple files | Add a type, a handler, and one switch case |
| TypeScript errors when mixing event data | Strongly typed `AuthEventMapType` ensures each event has correct data shape |

---

## 🧱 Core Approach – Declarative Event Handling

### ❌ Imperative (what we avoid)

```typescript
// Handler executes actions directly
password_changed: (data, ctx) => {
  ctx.setUIState('SIGN_IN');
  ctx.setPrefilledData(email, username);
  ctx.navigate('/dashboard');
}
```

### ✅ Declarative (what we use)

```typescript
// Handler describes what should happen
password_changed: (data, ctx) => {
  return {
    uiState: 'SIGN_IN',
    prefill: { email, username },
    navigation: { to: '/dashboard' }
  };
}
```

**Why declarative?**
- Testable without mocks (just compare objects)
- Side effects are centralized in the orchestrator (`AuthPage`)
- Easier to reason about and debug

---

## 🔄 Logical Flow (End-to-End)

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                              1. EMITTER                                     │
│  (ChangePasswordContainer, ProtectedRoute, LogoMenuIcon, etc.)              │
│                                                                             │
│  navigate('/auth', {                                                        │
│    state: { authEvent: 'session_expired', from: currentPath }               │
│  })                                                                         │
└─────────────────────────────────────────────────────────────────────────────┘
                                      │
                                      ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│                         2. ORCHESTRATOR (AuthPage)                          │
│                                                                             │
│  useEffect(() => {                                                          │
│    if (!authEvent) return;                                                  │
│    setUIState(IDLE);                        // reset previous state         │
│    const handler = authEventRegistry[authEvent];                            │
│    const data = getEventData(authEvent);    // extract from location.state  │
│    const result = handler(data, ctx);       // execute handler              │
│    applyResult(result);                     // UI + navigation              │
│  }, [authEvent]);                                                           │
└─────────────────────────────────────────────────────────────────────────────┘
                                      │
                                      ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│                         3. HANDLER (authEventRegistry.ts)                   │
│                                                                             │
│  session_expired: (data) => ({                                              │
│    uiState: 'SIGN_IN',                                                      │
│    message: 'Your session has expired. Please sign in again.',              │
│    returnTo: data?.from                                                     │
│  })                                                                         │
└─────────────────────────────────────────────────────────────────────────────┘
                                      │
                                      ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│                         4. RESULT APPLIED (AuthPage)                        │
│                                                                             │
│  if (result.uiState) setUIState(result.uiState);     // opens modal         │
│  if (result.message) setMessage(result.message);     // shows message       │
│  if (result.prefill) setPrefilledData(...);          // pre-fills form      │
│  if (result.returnTo) returnToRef.current = ...;     // stores return path  │
│  if (result.navigation) navigateTo(...);             // redirects           │
└─────────────────────────────────────────────────────────────────────────────┘
                                      │
                                      ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│                              5. USER ACTION                                 │
│                                                                             │
│  After login, handleSignInWithNavigation reads returnToRef and redirects    │
│  back to the original page (for session_expired).                           │
└─────────────────────────────────────────────────────────────────────────────┘
```

---

## 📁 File Structure

```
src/auth/authEvent/
├── types/
│   ├── eventTypes.ts          # Event contracts (payload + result)
│   └── eventContextTypes.ts   # Read-only context for handlers
├── config/
│   └── authEventRegistry.ts   # Central event handler registry
src/auth/components/authPage/
└── AuthPage.tsx               # Orchestrator (consumes events)
```

---

## 📄 Current Events

| Event | Data | Handler Returns |
|-------|------|-----------------|
| `password_changed` | `undefined` | `{ uiState: 'SIGN_IN', prefill: identity }` |
| `session_expired` | `{ from?: string }` | `{ uiState: 'SIGN_IN', message: '...', returnTo: from }` |
| `user_logged_out` | `undefined` | `{ uiState: 'IDLE' }` |

---

## 🚀 How to Add a New Event

To add a new event (e.g., `email_verification_required`), follow these steps:

| Step | File | Action |
|------|------|--------|
| 1 | `eventTypes.ts` | Add to `AuthEventMapType`: `email_verification_required: { email: string }` |
| 2 | `authEventRegistry.ts` | Add handler: `email_verification_required: (data) => ({ uiState: 'SIGN_IN', message: \`Verify ${data?.email}\` })` |
| 3 | `AuthPage.tsx` | Add case in `getEventData()`: `case 'email_verification_required': return { email: navState?.email }` |
| 4 | `navigationState` type | Add property: `email?: string` |
| 5 | Emitter | `navigate('/auth', { state: { authEvent: 'email_verification_required', email: user.email } })` |

> ✅ No changes needed in `AuthPage`'s core logic beyond these steps.

---

## 🧪 Testing Example

```typescript
import { authEventRegistry } from './config/authEventRegistry';

describe('authEventRegistry', () => {
  it('session_expired returns correct result', () => {
    const result = authEventRegistry.session_expired({ from: '/dashboard' });
    expect(result).toEqual({
      uiState: 'SIGN_IN',
      message: 'Your session has expired. Please sign in again.',
      returnTo: '/dashboard',
    });
  });
});
```

---

## 📚 Summary

| Aspect | Description |
|--------|-------------|
| Architecture | Event-driven, declarative, type-safe |
| Core files | `eventTypes.ts`, `authEventRegistry.ts`, `AuthPage.tsx` |
| Adding events | 5 steps: type → handler → switch case → navigationState property → emitter |
| Testing | Pure functions, no mocks needed |
| Scalability | Easy to add new events without touching existing logic |

---

## 🔗 Related Files

- `src/auth/authEvent/types/eventTypes.ts`
- `src/auth/authEvent/types/eventContextTypes.ts`
- `src/auth/authEvent/config/authEventRegistry.ts`
- `src/auth/components/authPage/AuthPage.tsx`
- `src/auth/auth_utils/localStorageHandle/authStorage.ts` (provides `getIdentity`)
