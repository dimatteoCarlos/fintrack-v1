# 📘 FinTrack Backend – Database Administration and Maintenance Guide

This guide is dedicated **exclusively to the administration and maintenance of the FinTrack database**. Here you will find everything needed to manage the complete data lifecycle: from initial creation to production operation, including migrations, seeds, and security protocols.

> ⚠️ **Note**: This documentation covers database aspects only. For other system aspects (API, authentication, frontend), consult the specific documentation.

**Versión en español:** [DATABASE_GUIDE.es.md](DATABASE_GUIDE.es.md). Misma
estructura y contenido.

---

## 📊 Consolidated Summary: FinTrack Database Lifecycle

| # | Stage | Purpose | Windows (cmd) | Linux/Mac | Production? |
| --- | --- | --- | --- | --- | --- |
| 1 | Create DB | Clean database | `createdb fintrack_dev` | `createdb fintrack_dev` | ❌ |
| 2 | Migrations | Structure (tables, FKs) | `set DB_EXPECTED=fintrack_dev && npm run db:migrate` | `DB_EXPECTED=fintrack_dev npm run db:migrate` | ✅ |
| 3 | Base Seeds | Catalogs (currencies, roles) | `npm run db:seed:base` | `npm run db:seed:base` | ❌ |
| 4 | Admin Seeds | System user (bootstrap) | `npm run db:seed:admin` | `npm run db:seed:admin` | ❌ |
| 5 | Verify | Check data | `psql -U postgres -d fintrack_dev -c "SELECT * FROM users;"` | `psql -U postgres -d fintrack_dev -c "SELECT * FROM users;"` | ✅ |
| 6 | Start App | Launch server | `npm run dev` | `npm run dev` | ✅ |

---

## 🔄 Full Database Reset Sequence

This sequence is necessary when you want to start from scratch, after a failed reset, or when migrations did not run correctly.

### Step-by-Step Commands:

| # | Command | Purpose |
|:---:|:---|:---|
| 1 | `dropdb fintrack_dev --if-exists` | Drop existing database |
| 2 | `createdb fintrack_dev` | Create new database |
| 3 | `npm run db:migrate` | Run migrations (creates all tables) |
| 4 | `npm run db:seed:base` | Run base seeds (catalogs) |
| 5 | `npm run db:seed:admin` | Run admin seed (creates system admin user) |
| 6 | `npm run dev` | Start the application |

### Quick Copy-Paste (Windows):

```cmd
dropdb fintrack_dev --if-exists && createdb fintrack_dev && npm run db:migrate && npm run db:seed:base && npm run db:seed:admin && npm run dev
```

### Quick Copy-Paste (Linux/Mac):

```bash
dropdb fintrack_dev --if-exists && createdb fintrack_dev && npm run db:migrate && npm run db:seed:base && npm run db:seed:admin && npm run dev
```

### Verification:

```bash
psql -U postgres -d fintrack_dev -c \
  "SELECT u.user_id, u.email, r.user_role_name
     FROM users u
     JOIN user_roles r ON r.user_role_id = u.user_role_id;"
```

The table has no `id` and no `role`: the key is `user_id` and the role is a foreign key,
`user_role_id`, into `user_roles`.

### The bootstrap admin

**There are no default credentials.** `src/db/migrations/sql_seeds/admin_001_system_admin_user.js`
reads both values from the environment and **throws if either is missing**, so the account cannot
be created with a value this repository knows:

| Variable | What it sets |
|:---|:---|
| `SYSTEM_ADMIN_EMAIL` | The address the account is opened under. A `.local` address is the sensible choice: the TLD is reserved, so it resolves nowhere and can receive no mail |
| `SYSTEM_ADMIN_PASSWORD` | Hashed with bcrypt at 10 rounds before insertion, the same algorithm the sign-up path uses |

The seed is idempotent: it checks for the address case-insensitively and does nothing if a user
already holds it.

> ⚠️ **Important:** The order of commands matters. Migrations must run before seeds.

---

### 🔄 Quick Utility Commands

| Operation | Windows (cmd) | Linux/Mac |
|:---|:---|:---|
| **Full reset** | `dropdb fintrack_dev --if-exists && createdb fintrack_dev && npm run db:migrate` | `dropdb fintrack_dev --if-exists && createdb fintrack_dev && npm run db:migrate` |
| **Base seeds only** | `npm run db:seed:base` | `npm run db:seed:base` |
| **Admin seed only** | `npm run db:seed:admin` | `npm run db:seed:admin` |
| **View tables** | `psql -U postgres -d fintrack_dev -c "\dt"` | `psql -U postgres -d fintrack_dev -c "\dt"` |
| **Connect to PSQL** | `psql -U postgres -d fintrack_dev` | `psql -U postgres -d fintrack_dev` |

---

## 📑 Table of Contents

1. [Architecture and Philosophy](#-architecture-and-philosophy)
2. [Prerequisites](#-prerequisites)
3. [Initial Configuration](#-initial-configuration)
4. [Database Lifecycle (Detailed)](#-database-lifecycle-detailed)
   - [Database Creation](#-database-creation)
   - [Migrations](#-migrations-structure)
   - [Seeds (Initial Data)](#-seeds-initial-data)
   - [Admin User](#-admin-user-bootstrap)
5. [Environments](#-environments)
6. [Security Protocol](#-security-protocol)
7. [⚠️ WARNING TABLE: Destructive Operations](#️-warning-table-destructive-operations)
8. [Useful Commands (Complete Reference)](#-useful-commands-complete-reference)
9. [Troubleshooting](#-troubleshooting)

---

## 🏗️ Architecture and Philosophy

FinTrack follows a philosophy of **strict separation** between structure and data:

| Concept | Purpose | Automatic in Production? |
|---------|---------|-------------------------|
| **Migrations** | Structure (tables, constraints) | ✅ Yes |
| **Base Seeds** | Static catalogs | ❌ No |
| **Admin Seeds** | System user | ❌ No (manual) |
| **Reset** | Local development | ❌ No |

> ⚠️ **Golden rule**: The runtime application **never** modifies the database structure.

---

## 📋 Prerequisites

Before starting, make sure you have:

- ✅ Node.js (LTS version recommended)
- ✅ npm installed
- ✅ PostgreSQL (version 12 or higher)
- ✅ Access to PostgreSQL superuser (usually `postgres`)
- ✅ Git (optional, for cloning the repository)

---

## ⚙️ Initial Configuration

### 1. Clone the repository (if applicable)

```bash
git clone <repository-url>
cd fintrack-backend
```

### 2. Install dependencies

```bash
npm install
```

### 3. Configure environment variables

Create a `.env` file in the project root:

```env
# Environment
NODE_ENV=development

# Database
DATABASE_URI=postgresql://postgres:your_password@localhost:5432/fintrack_dev

# Bootstrap admin. Both are required by db:seed:admin, which throws
# without them; neither has a default.
SYSTEM_ADMIN_EMAIL=system_admin@fintrack.local
SYSTEM_ADMIN_PASSWORD=
```

`backend/.env.example` is the full list, every key commented. **There is no `ALLOW_SEEDS`** —
older instructions named one and nothing in the source has ever read it.

---

## 🔄 Database Lifecycle (Detailed)

### 🗄️ Database Creation

#### Windows (cmd):

```cmd
:: Verify PostgreSQL is running
net start postgresql-x64-15

:: Enter PostgreSQL
psql -U postgres

:: Inside psql:
DROP DATABASE IF EXISTS fintrack_dev;
CREATE DATABASE fintrack_dev;
\q
```

#### Linux/Mac:

```bash
# Enter PostgreSQL
sudo -u postgres psql

# Inside psql:
DROP DATABASE IF EXISTS fintrack_dev;
CREATE DATABASE fintrack_dev;
\q
```

#### Quick commands (alternative):

**Windows (cmd):**
```cmd
dropdb fintrack_dev --if-exists
createdb fintrack_dev
```

**Linux/Mac:**
```bash
dropdb fintrack_dev --if-exists
createdb fintrack_dev
```

---

### 📦 Migrations (Structure)

Migrations define the database **skeleton**:

- Tables
- Relationships (foreign keys)
- Indexes
- Base catalogs

**Run migrations:**

```bash
npm run db:migrate
```

**Characteristics:**
- ✅ Idempotent (can be run multiple times)
- ✅ Safe for production
- ✅ Maintains history in `migrations` table

---

### 🌱 Seeds (Initial Data)

Seeds insert **contextual data**. They are divided into two types:

#### Base Seeds (Catalogs)

**Windows (cmd):**
```cmd
npm run db:seed:base
```

**Linux/Mac:**
```bash
npm run db:seed:base
```

**Examples of base data:**
- Currencies (USD, EUR, COP)
- User roles
- Transaction types
- Predefined categories

#### Admin Seeds (System User)

**Windows (cmd):**
```cmd
npm run db:seed:admin
```

**Linux/Mac:**
```bash
npm run db:seed:admin
```

---

### 👤 Admin User (Bootstrap)

The first administrator is created **once** through manual seed.

**Requirements:**
- `SYSTEM_ADMIN_EMAIL` defined in `.env`

**Characteristics:**
- Password is hashed with `bcrypt` (never in plain text)
- Script checks for existing records
- Cannot be executed accidentally

---

## 🌍 Environments

| Environment | Migrations | Base Seeds | Admin Seeds | Reset |
|-------------|------------|------------|-------------|-------|
| **Development** | ✅ Manual / CI | ✅ Manual | ✅ Manual | ✅ Allowed |
| **Staging** | ✅ Automatic | ⚠️ Optional | ❌ Manual | ⚠️ Restricted |
| **Production** | ✅ Automatic | ❌ No | ❌ Manual | ❌ Prohibited |

---

## 🛡️ Security Protocol

### 1. Environment protection

```javascript
// runSeeds.js
if (isProduction()) {
  console.error('❌ Seeds are not allowed under NODE_ENV=production.');
  process.exit(1);
}
```

**There is no flag that overrides this.** Older instructions described an `ALLOW_SEEDS`
variable that would permit seeding in production; no such variable has ever been read by the
source. The refusal is unconditional, which is stricter than what was documented, not looser.

### 2. The database is confirmed, not chosen

`runSeeds.js` then calls `assertExpectedDatabase`, which asks the **open connection** what it
reached, with `current_database()`, and refuses unless the answer matches `DB_EXPECTED`. A
missing `DB_EXPECTED` is also a refusal.

`NODE_ENV` cannot serve this purpose: in `dbEnvironmentConfig.js` the `development` and
`production` blocks are identical and both read `DATABASE_URI`.

### 3. Runtime isolation

- Seeds are **never** imported in controllers
- Only executed from the command line
- No HTTP endpoint triggers a seed
- Every seed runs inside one transaction, and a failure rolls the whole set back

---

## ⚠️ WARNING TABLE: Destructive Operations

This table documents **operations that permanently modify or delete data**. Always verify your environment before executing.

| # | Operation | Command | Destructive Level | Irreversible | Production Allowed | Precaution |
|---|-----------|---------|-------------------|--------------|-------------------|------------|
| **1** | **Drop Database** | `dropdb fintrack_dev --if-exists` | 🔴 FULL | ✅ Yes | ❌ No | Deletes ALL tables and data. No recovery. |
| **2** | **Run Reset DB** | `npm run db:reset` | 🔴 FULL | ✅ Yes | ❌ No | Drops the database and creates it empty. Does not re-run migrations or seeds — that is a separate command. |
| **3** | **Drop Schema** | `DROP SCHEMA public CASCADE;` | 🔴 FULL | ✅ Yes | ❌ No | Removes all tables, functions, views. |
| **4** | **Truncate Tables** | `TRUNCATE TABLE users CASCADE;` | 🟠 HIGH | ⚠️ Yes (no FK check) | ❌ No | Deletes all rows. Resets sequences. |
| **5** | **Delete Records** | `DELETE FROM users WHERE id = 1;` | 🟡 MEDIUM | ⚠️ Yes (no backup) | ⚠️ With WHERE | Can delete critical admin users. |
| **6** | **Run Migrations** | `npm run db:migrate` | 🟢 LOW | ❌ No | ✅ Yes | Safe. Only adds structure. |
| **7** | **Run Base Seeds** | `npm run db:seed:base` | 🟡 MEDIUM | ⚠️ Partial | ❌ No | Can duplicate catalog data if run twice. |
| **8** | **Run Admin Seeds** | `npm run db:seed:admin` | 🟡 MEDIUM | ⚠️ Partial | ❌ Manual | Creates system admin. Checks existence first. |
| **9** | **ALTER TABLE DROP COLUMN** | `ALTER TABLE users DROP COLUMN email;` | 🔴 FULL | ✅ Yes | ❌ No | Permanent column deletion. Data loss. |
| **10** | **UPDATE without WHERE** | `UPDATE users SET role = 'admin';` | 🔴 FULL | ✅ Yes | ❌ No | Updates ALL rows. Privilege escalation risk. |

### 🟢 Destructive Level Legend

| Level | Color | Meaning | Example |
|-------|-------|---------|---------|
| **LOW** | 🟢 | Safe, reversible | Adding columns, running migrations |
| **MEDIUM** | 🟡 | Potentially destructive, partially reversible | Deleting specific records, truncating tables |
| **HIGH** | 🟠 | Very destructive, difficult to reverse | Truncate cascade, bulk deletes |
| **FULL** | 🔴 | Completely destructive, irreversible | Drop database, drop schema, drop column |

### ⚡ Pre-Run Checklist

Before executing any **FULL** or **HIGH** destructive operation:

- [ ] Verify `NODE_ENV` is NOT `production` (or understand the risks)
- [ ] Create a database backup: `pg_dump fintrack_dev > backup_$(date +%Y%m%d_%H%M%S).sql`
- [ ] Confirm the command with a second person (team environment)
- [ ] Rehearse against a scratch local database first — this project has no staging environment
- [ ] Have a rollback plan ready

### 🛡️ Production Safety Rules

| Rule | Description |
|------|-------------|
| **Rule 1** | Never run `db:reset` in production |
| **Rule 2** | Never run seeds automatically in production |
| **Rule 3** | Always backup before destructive operations |
| **Rule 4** | Use transactions for manual `DELETE`/`UPDATE` |
| **Rule 5** | Set `DB_EXPECTED` on every run. It is what makes a wrong database a refusal instead of a write |

### 🔐 Protection Mechanisms in Code

```javascript
// Example: db:reset protection (runResetDb.js)
if (isProduction()) {
  console.error('❌ db:reset is forbidden in production');
  process.exit(1);
}
await assertExpectedDatabase(targetClient, 'db:reset');

// Example: runSeeds.js protection
if (isProduction()) {
  console.error('❌ Seeds are not allowed under NODE_ENV=production.');
  process.exit(1);
}
await assertExpectedDatabase(client, `db:seed:${seedType}`);

// Example: Migration protection (PostgreSQL)
BEGIN;
  -- Your migration here
COMMIT;  -- Only commit if successful
-- ROLLBACK; -- Use if something went wrong
```

### 📝 Quick Reference: Safe vs Unsafe

| ✅ SAFE to run anytime | ❌ NEVER run automatically | ⚠️ ONLY with caution |
|----------------------|---------------------------|---------------------|
| `npm run db:migrate` | `dropdb fintrack_dev` | `npm run db:seed:base` / `db:seed:admin` |
| `npm run dev` | `npm run db:reset` | `DELETE FROM ...` (with WHERE) |
| `psql -c "SELECT ..."` | `DROP SCHEMA public CASCADE` | `UPDATE ... SET ...` (with WHERE) |
| View queries | `TRUNCATE TABLE ... CASCADE` | `ALTER TABLE ... DROP COLUMN` |

---

## 🚀 Useful Commands (Complete Reference)

### Full Setup (Development)

**Windows (cmd):**
```cmd
:: 1. Reset database
dropdb fintrack_dev --if-exists
createdb fintrack_dev

:: 2. Run migrations
npm run db:migrate

:: 3. Base seeds
npm run db:seed:base

:: 4. Admin (optional)
npm run db:seed:admin

:: 5. Start application
npm run dev
```

**Linux/Mac:**
```bash
# 1. Reset database
dropdb fintrack_dev --if-exists
createdb fintrack_dev

# 2. Run migrations
npm run db:migrate

# 3. Base seeds
npm run db:seed:base

# 4. Admin (optional)
npm run db:seed:admin

# 5. Start application
npm run dev
```

### Available NPM Scripts

| Command | Description |
|---------|-------------|
| `npm run init-db` | Build the schema from the boot-time DDL, without the migration chain |
| `npm run db:migrate` | Apply the migration chain |
| `npm run db:seed:base` | Seed the static catalogs — currencies, roles, account and movement types |
| `npm run db:seed:admin` | Create the bootstrap admin user. Run by hand, never automatically |
| `npm run db:reset` | Full reset (development only) |
| `npm run db:state` | Report what the connected database currently contains |
| `npm run db:parity` | Compare the two build paths and report where they disagree |
| `npm run dev` | Start development server |
| `npm start` | Start production server |

**The seeds take the set as an argument, not as an environment flag.** `SEED_BASE=true` and
`SEED_ADMIN=true` were retired; `runSeeds.js` reads `process.argv[2]` and accepts only `base` or
`admin`. The two commands above are identical on Windows and on Unix, which the older
instructions split into two columns for no remaining reason.

**The schema has two build paths and either one builds it.** `db:migrate` replays the numbered
SQL chain; `init-db` runs the JavaScript DDL under `src/db/run_time_db_init/`. `db:parity`
exists to prove the two agree, and is the command to run after adding a table to one of them.

### Data Verification

**Windows (cmd):**
```cmd
:: Connect to database
psql -U postgres -d fintrack_dev

:: Useful commands inside psql:
\dt                    :: List tables
SELECT * FROM users;   :: View users
\q                     :: Exit
```

**Linux/Mac:**
```bash
# Connect to database
psql -U postgres -d fintrack_dev

# Useful commands inside psql:
\dt                    # List tables
SELECT * FROM users;   # View users
\q                     # Exit
```

---

## 🔧 Troubleshooting

### Error: "Database does not exist"

**Windows (cmd):**
```cmd
:: Solution: Create the database
createdb fintrack_dev
```

**Linux/Mac:**
```bash
# Solution: Create the database
createdb fintrack_dev
```

### Error: "Seeds are disabled in production"

```bash
# Check environment variables
echo %NODE_ENV%        # Windows
echo $NODE_ENV         # Linux/Mac
echo %DB_EXPECTED%     # Windows
echo $DB_EXPECTED      # Linux/Mac

# Under NODE_ENV=production the seed runner exits, and no variable
# changes that. Ask instead which database the connection reached:
npm run db:state
```

### Error: "Relation already exists"

```bash
# Migrations have already been executed
# Check status:
psql -U postgres -d fintrack_dev -c "SELECT * FROM migrations;"
```

### Error: "relation 'users' does not exist"

**Solution:** Run migrations first, then seeds:

```cmd
npm run db:migrate
npm run db:seed:base
npm run db:seed:admin
```

### PostgreSQL authentication error

**Windows (cmd):**
```cmd
:: Verify PostgreSQL is running
net start postgresql-x64-15

:: Check installed version
pg_config --version
```

**Linux/Mac:**
```bash
# Verify PostgreSQL is running
sudo systemctl status postgresql

# Check version
postgres --version
```

---

## 📚 Flow Summary

```
┌─────────────────┐
│   Create DB     │  createdb fintrack_dev
└────────┬────────┘
         ↓
┌─────────────────┐
│   Migrations    │  npm run db:migrate
└────────┬────────┘
         ↓
┌─────────────────┐
│   Base Seeds    │  npm run db:seed:base
└────────┬────────┘
         ↓
┌─────────────────┐
│   Admin Seeds   │  npm run db:seed:admin
└────────┬────────┘
         ↓
┌─────────────────┐
│   Start App     │  npm run dev
└─────────────────┘
```

---

## 📖 Additional Notes

- **Always** verify the environment before executing destructive commands
- Admin seeds are **irreversible** but safe (they check for existence)
- In production, **only automatic migrations**
- Keep your `.env` file out of version control
- In Windows, use `&&` to chain commands and `set` for temporary environment variables
- Refer to the **Warning Table** above before running any destructive operation

---

**finTrack** - Smart Financial Management © 2024

---