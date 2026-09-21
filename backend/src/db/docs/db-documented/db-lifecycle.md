# Database Lifecycle – FinTrack Backend

How the database is created, migrated, seeded and reset during the lifecycle of
the FinTrack backend. PostgreSQL and Node.js (ESM).

**Nothing here runs at runtime, and nothing here runs on deploy.** Every command
in this document is typed by a person. Companion documents:
`data_base_strategy.md` (the two paths that build the schema) and
`db-migration-procedure.md` (how a migration is run against production).

---

## 1. Environments

There are two: local development and production. **There is no staging** — the
word appears nowhere in `backend/src`.

| Action | Development | Production |
|---|---|---|
| Schema | `npm run db:migrate` | typed, following `db-migration-procedure.md` |
| Base catalogs | arrive with the migrations, or with `npm run init-db` | arrive with the migrations |
| Admin seed | `npm run db:seed:admin` | refused by the runner |
| Reset | `npm run db:reset` | refused by the runner |

### The deploy applies no schema change

A Vercel deploy ships code. `backend/vercel.json` builds `index.js` and nothing
else, there is no `build` and no `postinstall` script, and `db:migrate` is named
in no workflow. **A merged migration file is not an applied migration**: it is
applied when someone runs the command.

---

## 2. Two refusals guard every command

Each runner asks two independent questions. Passing one does not retire the
other, because they are not the same question.

| Question | Mechanism |
|---|---|
| **Is this a deployed process migrating itself?** | `if (isProduction())` then exit 1 — `runMigrations.js:61`, `runSeeds.js:64`, `runResetDb.js:50` |
| **Is this the database you meant?** | `assertExpectedDatabase` asks the open connection for `current_database()` and refuses unless it matches `DB_EXPECTED`. An absent `DB_EXPECTED` is also a refusal, and the message prints the database it reached |

**`NODE_ENV` cannot answer the second question.** In `dbEnvironmentConfig.js` the
`development` and `production` blocks are identical and both read
`DATABASE_URI`, so the mode says nothing about which database the connection
string actually reached.

**A production migration is therefore not run with `NODE_ENV=production`.** It is
run from a workstation against the production connection string with the
destination named explicitly. The full procedure, including the confirmation
variable it requires, is in `db-migration-procedure.md`.

---

## 3. Database creation

Creating or dropping a database is **never automated in production**.

Local development:

```bash
psql -U postgres
DROP DATABASE IF EXISTS fintrack_dev;
CREATE DATABASE fintrack_dev;
\q
```

---

## 4. Migrations

### Purpose

Migrations define **schema structure and base reference data**. Each applied
file is recorded in the `migrations` table, which is what makes a second run a
skip rather than a repeat.

### Location

```
src/db/migrations/sql_migrations/
```

### Execution

```bash
DB_EXPECTED=fintrack_dev npm run db:migrate
```

### Rules

* Migrations run **in order**, one per transaction
* Already executed migrations are skipped
* The `migrations` table is the source of truth for what has been applied
* They may include tables, constraints, indexes and base catalogs — currencies,
  roles, account types, movement types

---

## 5. Seeds

Seeds are **NOT migrations**. They insert contextual or sensitive data that must
not run automatically.

### Location

```
src/db/migrations/sql_seeds/
```

### Naming, and how a set is chosen

`runSeeds.js` reads `process.argv[2]`, accepts only `base` or `admin`, and loads
the files whose names start with that prefix.

| Type | Prefix | Files present today |
| --- | --- | --- |
| Base seeds | `base_` | **none** |
| Admin / system seeds | `admin_` | `admin_001_system_admin_user.js` |

**`SEED_BASE` and `SEED_ADMIN` are retired.** No source file reads either one.

---

## 6. Base seeds

```bash
DB_EXPECTED=fintrack_dev npm run db:seed:base
```

* **Runs nothing today.** No `base_*` file exists, so the runner reports
  `No base seeds found` and rolls back
* **The base catalogs are not seeded by this runner.** They are inserted by
  `005_base_catalogs.sql` in the migration chain, with `008` and `030` on top,
  and by `populateDB.js` on the boot path
* Never required in production

---

## 7. Admin / system seeds

### Purpose

Bootstrap the **initial system administrator**. It cannot come through
registration: the account has to exist before there is anyone able to create it.

### Execution (MANUAL ONLY)

```bash
DB_EXPECTED=fintrack_dev npm run db:seed:admin
```

### Rules

* Never auto-run, and refused outright under `NODE_ENV=production`
* **There are no default credentials.** `admin_001_system_admin_user.js:25`
  throws unless both `SYSTEM_ADMIN_EMAIL` and `SYSTEM_ADMIN_PASSWORD` are in the
  environment, so the account cannot be created with a value this repository
  knows
* The password is hashed inside the seed with bcrypt at 10 rounds, the same
  algorithm registration uses. A hash is never pasted into SQL by hand
* Safe to re-run: it matches the address case-insensitively and does nothing if
  a user already holds it

---

## 8. Reset (development only)

```bash
DB_EXPECTED=fintrack_dev npm run db:reset
```

`runResetDb.js` drops the database and creates it again, empty. It refuses under
`NODE_ENV=production` (`:50`) and calls `assertExpectedDatabase` (`:161`) before
the `DROP`.

**It does not re-run the migrations.** Rebuilding the schema after a reset is a
second command, `db:migrate` or `init-db`.

---

## 9. Runtime rule (critical)

🚫 **No migrations**  🚫 **No seeds**  🚫 **No schema changes**

The application runtime assumes the database is already prepared. No controller
imports a runner, and no HTTP endpoint triggers one.

---

## 10. Summary

* Migrations define **structure**; seeds define **initial context**
* Administrator accounts are **bootstrap-only**
* **`DB_EXPECTED` on every run** is what turns a wrong database into a refusal
  instead of a write
* Nothing runs automatically — not at runtime, and not on deploy
