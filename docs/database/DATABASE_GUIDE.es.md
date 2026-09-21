# 📘 FinTrack Backend – Guía de Administración y Mantenimiento de Base de Datos

Esta guía está dedicada **exclusivamente a la administración y mantenimiento de la base de datos** de FinTrack. Aquí encontrarás todo lo necesario para gestionar el ciclo de vida completo de los datos: desde la creación inicial hasta la operación en producción, pasando por migraciones, seeds y protocolos de seguridad.

> ⚠️ **Nota**: Esta documentación cubre únicamente aspectos de base de datos. Para otros aspectos del sistema (API, autenticación, frontend), consulta la documentación específica.

**English version:** [DATABASE_GUIDE.md](DATABASE_GUIDE.md).

---

## 📊 Resumen Consolidado: Ciclo de Vida de Base de Datos FinTrack

| # | Etapa | Propósito | Windows (cmd) | Linux/Mac | ¿Producción? |
|---|-------|-----------|---------------|-----------|--------------|
| **1** | **Crear DB** | Base de datos limpia | `createdb fintrack_dev` | `createdb fintrack_dev` | ❌ No |
| **2** | **Migraciones** | Estructura (tablas, FKs) | `set DB_EXPECTED=fintrack_dev && npm run db:migrate` | `DB_EXPECTED=fintrack_dev npm run db:migrate` | ✅ Sí |
| **3** | **Seeds Base** | Catálogos (monedas, roles) | `npm run db:seed:base` | `npm run db:seed:base` | ❌ No |
| **4** | **Seeds Admin** | Usuario sistema (bootstrap) | `npm run db:seed:admin` | `npm run db:seed:admin` | ❌ Manual |
| **5** | **Verificar** | Comprobar datos | `psql -U postgres -d fintrack_dev -c "SELECT * FROM users;"` | `psql -U postgres -d fintrack_dev -c "SELECT * FROM users;"` | ✅ Sí |
| **6** | **Iniciar App** | Levantar servidor | `npm run dev` | `npm run dev` | `npm start` |

**`DB_EXPECTED` no elige la base, la confirma.** `db:migrate`, `db:seed:base`,
`db:seed:admin` y `db:state` preguntan a la conexión ya abierta qué base
alcanzaron, con `current_database()`, y se niegan si no coincide con
`DB_EXPECTED` o si la variable falta. La negativa imprime la base que alcanzó,
así que nombrarla es un solo paso. `NODE_ENV` no sirve para esto: en
`dbEnvironmentConfig.js` los bloques `development` y `production` son idénticos y
los dos leen `DATABASE_URI`.

**Para leer sin escribir nada** — el libro mayor, lo pendiente y los objetos que
crean las migraciones 031 a 035 — está `npm run db:state`, dos `SELECT` y
ninguna escritura.

### 🔄 Comandos de Utilidad Rápida

| Operación | Windows (cmd) | Linux/Mac |
|-----------|---------------|-----------|
| **Reset completo** | `dropdb fintrack_dev --if-exists && createdb fintrack_dev && npm run db:migrate` | `dropdb fintrack_dev --if-exists && createdb fintrack_dev && npm run db:migrate` |
| **Seed combinado** | `npm run db:seed:base && npm run db:seed:admin` | `npm run db:seed:base && npm run db:seed:admin` |
| **Ver tablas** | `psql -U postgres -d fintrack_dev -c "\dt"` | `psql -U postgres -d fintrack_dev -c "\dt"` |
| **Conectar a PSQL** | `psql -U postgres -d fintrack_dev` | `psql -U postgres -d fintrack_dev` |

### ⚡ Flujo Rápido (Desarrollo)

**Windows:**
```cmd
createdb fintrack_dev && npm run db:migrate && npm run db:seed:base
```

**Linux/Mac:**
```bash
createdb fintrack_dev && npm run db:migrate && npm run db:seed:base
```

---

## 📑 Tabla de Contenidos

1. [Arquitectura y Filosofía](#-arquitectura-y-filosofía)
2. [Requisitos Previos](#-requisitos-previos)
3. [Configuración Inicial](#-configuración-inicial)
4. [Ciclo de Vida de la Base de Datos (Detallado)](#-ciclo-de-vida-de-la-base-de-datos-detallado)
   - [Creación de Base de Datos](#-creación-de-base-de-datos)
   - [Migraciones](#-migraciones-estructura)
   - [Seeds (Datos Iniciales)](#-seeds-datos-iniciales)
   - [Usuario Administrador](#-usuario-administrador-bootstrap)
5. [Entornos](#-entornos)
6. [Protocolo de Seguridad](#-protocolo-de-seguridad)
7. [Comandos Útiles (Referencia Completa)](#-comandos-útiles-referencia-completa)
8. [Resolución de Problemas](#-resolución-de-problemas)

---

## 🏗️ Arquitectura y Filosofía

FinTrack sigue una filosofía de **separación estricta** entre estructura y datos:

| Concepto | Propósito | ¿Automático en Producción? |
|----------|-----------|---------------------------|
| **Migraciones** | Estructura (tablas, constraints) | ✅ Sí |
| **Seeds Base** | Catálogos estáticos | ❌ No |
| **Seeds Admin** | Usuario sistema | ❌ No (manual) |
| **Reset** | Desarrollo local | ❌ No |

> ⚠️ **Regla de oro**: La aplicación en runtime **nunca** modifica la estructura de la base de datos.

---

## 📋 Requisitos Previos

Antes de comenzar, asegúrate de tener:

- ✅ Node.js (versión LTS recomendada)
- ✅ npm instalado
- ✅ PostgreSQL (versión 12 o superior)
- ✅ Acceso a superusuario de PostgreSQL (generalmente `postgres`)
- ✅ Git (opcional, para clonar el repositorio)

---

## ⚙️ Configuración Inicial

### 1. Clonar el repositorio (si aplica)

```bash
git clone <url-del-repositorio>
cd fintrack-backend
```

### 2. Instalar dependencias

```bash
npm install
```

### 3. Configurar variables de entorno

Crea un archivo `.env` en la raíz del proyecto:

```env
# Entorno
NODE_ENV=development

# Base de datos
DATABASE_URI=postgresql://postgres:tu_password@localhost:5432/fintrack_dev

# Usuario administrador (para bootstrap)
SYSTEM_ADMIN_EMAIL=system_admin@fintrack.local
SYSTEM_ADMIN_PASSWORD=

# La base que se espera alcanzar. Sin ella, db:migrate, db:seed:base,
# db:seed:admin y db:state se niegan a correr.
DB_EXPECTED=fintrack_dev
```

No hay `ALLOW_SEEDS`: ninguna parte del código la lee. `backend/.env.example`
tiene la lista completa, con un comentario por clave.

---

## 🔄 Ciclo de Vida de la Base de Datos (Detallado)

### 🗄️ Creación de Base de Datos

#### Windows (cmd):

```cmd
:: Verificar que PostgreSQL está corriendo
net start postgresql-x64-15

:: Entrar a PostgreSQL
psql -U postgres

:: Dentro de psql:
DROP DATABASE IF EXISTS fintrack_dev;
CREATE DATABASE fintrack_dev;
\q
```

#### Linux/Mac:

```bash
# Entrar a PostgreSQL
sudo -u postgres psql

# Dentro de psql:
DROP DATABASE IF EXISTS fintrack_dev;
CREATE DATABASE fintrack_dev;
\q
```

#### Comandos rápidos (alternativa):

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

### 📦 Migraciones (Estructura)

Las migraciones definen el **esqueleto** de la base de datos:

- Tablas
- Relaciones (claves foráneas)
- Índices
- Catálogos base

**Ejecutar migraciones:**

```bash
npm run db:migrate
```

**Características:**
- ✅ Idempotente (puede ejecutarse múltiples veces)
- ✅ Seguro para producción
- ✅ Mantiene historial en tabla `migrations`

---

### 🌱 Seeds (Datos Iniciales)

Los seeds insertan **datos contextuales**. Se dividen en dos tipos:

#### Seeds Base (Catálogos)

**Windows (cmd):**
```cmd
npm run db:seed:base
```

**Linux/Mac:**
```bash
npm run db:seed:base
```

**Ejemplos de datos base:**
- Monedas (USD, EUR, COP)
- Roles de usuario
- Tipos de transacción
- Categorías predefinidas

#### Seeds Admin (Usuario del Sistema)

**Windows (cmd):**
```cmd
npm run db:seed:admin
```

**Linux/Mac:**
```bash
npm run db:seed:admin
```

**Seed combinado (múltiples flags):**

**Windows (cmd):**
```cmd
npm run db:seed:base && npm run db:seed:admin
```

**Linux/Mac:**
```bash
npm run db:seed:base && npm run db:seed:admin
```

---

### 👤 Usuario Administrador (Bootstrap)

El primer administrador se crea **una sola vez** mediante seed manual.

**Requisitos:**
- `SYSTEM_ADMIN_EMAIL` definido en `.env`
- `SYSTEM_ADMIN_PASSWORD` definido en `.env`

**Características:**
- La contraseña se hashea con `bcrypt` (nunca en texto plano)
- El script verifica existencia previa
- No se puede ejecutar accidentalmente

---

## 🌍 Entornos

| Entorno | Migraciones | Seeds Base | Seeds Admin | Reset |
|---------|-------------|------------|-------------|-------|
| **Desarrollo** | ✅ Manual / CI | ✅ Manual | ✅ Manual | ✅ Permitido |
| **Staging** | ✅ Automático | ⚠️ Opcional | ❌ Manual | ⚠️ Restringido |
| **Producción** | ✅ Automático | ❌ No | ❌ Manual | ❌ Prohibido |

---

## 🛡️ Protocolo de Seguridad

### 1. Protección por Entorno

```javascript
// runSeeds.js
if (isProduction()) {
  console.error('❌ Seeds are not allowed under NODE_ENV=production.');
  process.exit(1);
}
```

**No existe una variable que levante esta restricción.** Las instrucciones
anteriores describían un `ALLOW_SEEDS` que permitiría sembrar en producción;
el código nunca ha leído esa variable. La negativa es incondicional, que es
más estricto que lo documentado, no menos.

### 2. La base se confirma, no se elige

Después, `runSeeds.js` llama a `assertExpectedDatabase`, que le pregunta a la
**conexión ya abierta** cuál alcanzó, con `current_database()`, y se niega si
no coincide con `DB_EXPECTED`. Si la variable falta, también se niega.

### 3. Aislamiento del Runtime

- Los seeds **nunca** se importan en controladores
- Solo se ejecutan desde la línea de comandos
- No hay endpoints HTTP que activen seeds
- Todo el conjunto corre en una transacción: si uno falla, se revierte entero

---

## ⚠️ TABLA DE ADVERTENCIA: Operaciones Destructivas

Esta tabla documenta **operaciones que modifican o borran datos de forma permanente**. Verificá siempre tu entorno antes de ejecutar.

| # | Operación | Comando | Nivel Destructivo | Irreversible | Permitido en Producción | Precaución |
|---|-----------|---------|--------------------|--------------|--------------------------|------------|
| **1** | **Drop Database** | `dropdb fintrack_dev --if-exists` | 🔴 TOTAL | ✅ Sí | ❌ No | Borra TODAS las tablas y los datos. Sin recuperación. |
| **2** | **Ejecutar Reset DB** | `npm run db:reset` | 🔴 TOTAL | ✅ Sí | ❌ No | Borra la base y la crea vacía. No vuelve a correr migraciones ni seeds — eso es un comando aparte. |
| **3** | **Drop Schema** | `DROP SCHEMA public CASCADE;` | 🔴 TOTAL | ✅ Sí | ❌ No | Elimina todas las tablas, funciones y vistas. |
| **4** | **Truncate Tables** | `TRUNCATE TABLE users CASCADE;` | 🟠 ALTO | ⚠️ Sí (sin chequeo de FK) | ❌ No | Borra todas las filas. Reinicia las secuencias. |
| **5** | **Delete Records** | `DELETE FROM users WHERE id = 1;` | 🟡 MEDIO | ⚠️ Sí (sin backup) | ⚠️ Con WHERE | Puede borrar usuarios administradores críticos. |
| **6** | **Ejecutar Migraciones** | `npm run db:migrate` | 🟢 BAJO | ❌ No | ✅ Sí | Seguro. Solo agrega estructura. |
| **7** | **Ejecutar Seeds Base** | `npm run db:seed:base` | 🟡 MEDIO | ⚠️ Parcial | ❌ No | Puede duplicar datos de catálogo si se corre dos veces. |
| **8** | **Ejecutar Seeds Admin** | `npm run db:seed:admin` | 🟡 MEDIO | ⚠️ Parcial | ❌ Manual | Crea el administrador del sistema. Verifica existencia primero. |
| **9** | **ALTER TABLE DROP COLUMN** | `ALTER TABLE users DROP COLUMN email;` | 🔴 TOTAL | ✅ Sí | ❌ No | Borrado permanente de columna. Pérdida de datos. |
| **10** | **UPDATE sin WHERE** | `UPDATE users SET role = 'admin';` | 🔴 TOTAL | ✅ Sí | ❌ No | Actualiza TODAS las filas. Riesgo de escalada de privilegios. |

### 🟢 Leyenda de Nivel Destructivo

| Nivel | Color | Significado | Ejemplo |
|-------|-------|--------------|---------|
| **BAJO** | 🟢 | Seguro, reversible | Agregar columnas, correr migraciones |
| **MEDIO** | 🟡 | Potencialmente destructivo, parcialmente reversible | Borrar registros puntuales, truncar tablas |
| **ALTO** | 🟠 | Muy destructivo, difícil de revertir | Truncate en cascada, borrados masivos |
| **TOTAL** | 🔴 | Completamente destructivo, irreversible | Drop database, drop schema, drop column |

### ⚡ Checklist Antes de Ejecutar

Antes de correr cualquier operación destructiva **TOTAL** o **ALTA**:

- [ ] Verificar que `NODE_ENV` NO sea `production` (o entender los riesgos)
- [ ] Crear un backup: `pg_dump fintrack_dev > backup_$(date +%Y%m%d_%H%M%S).sql`
- [ ] Confirmar el comando con otra persona (entorno de equipo)
- [ ] Ensayar antes contra una base local descartable — este proyecto no tiene entorno de staging
- [ ] Tener listo un plan de reversión

### 🛡️ Reglas de Seguridad en Producción

| Regla | Descripción |
|-------|-------------|
| **Regla 1** | Nunca correr `db:reset` en producción |
| **Regla 2** | Nunca correr seeds automáticamente en producción |
| **Regla 3** | Siempre hacer backup antes de una operación destructiva |
| **Regla 4** | Usar transacciones para `DELETE`/`UPDATE` manuales |
| **Regla 5** | Fijar `DB_EXPECTED` en cada corrida. Es lo que convierte una base equivocada en una negativa en vez de en una escritura |

### 🔐 Mecanismos de Protección en el Código

```javascript
// Ejemplo: proteccion de db:reset (runResetDb.js)
if (isProduction()) {
  console.error('❌ db:reset is forbidden in production');
  process.exit(1);
}
await assertExpectedDatabase(targetClient, 'db:reset');

// Ejemplo: proteccion de runSeeds.js
if (isProduction()) {
  console.error('❌ Seeds are not allowed under NODE_ENV=production.');
  process.exit(1);
}
await assertExpectedDatabase(client, `db:seed:${seedType}`);

// Ejemplo: proteccion de migraciones (PostgreSQL)
BEGIN;
  -- tu migracion aca
COMMIT;  -- Solo confirma si tuvo exito
-- ROLLBACK; -- Usar si algo salio mal
```

### 📝 Referencia Rápida: Seguro vs Inseguro

| ✅ SEGURO en cualquier momento | ❌ NUNCA correr automaticamente | ⚠️ SOLO con cuidado |
|-------------------------------|----------------------------------|----------------------|
| `npm run db:migrate` | `dropdb fintrack_dev` | `npm run db:seed:base` / `db:seed:admin` |
| `npm run dev` | `npm run db:reset` | `DELETE FROM ...` (con WHERE) |
| `psql -c "SELECT ..."` | `DROP SCHEMA public CASCADE` | `UPDATE ... SET ...` (con WHERE) |
| Consultas de lectura | `TRUNCATE TABLE ... CASCADE` | `ALTER TABLE ... DROP COLUMN` |

---

## 🚀 Comandos Útiles (Referencia Completa)

### Configuración Completa (Desarrollo)

**Windows (cmd):**
```cmd
:: 1. Resetear base de datos
dropdb fintrack_dev --if-exists
createdb fintrack_dev

:: 2. Ejecutar migraciones
npm run db:migrate

:: 3. Seeds base
npm run db:seed:base

:: 4. Admin (opcional)
npm run db:seed:admin

:: 5. Iniciar aplicación
npm run dev
```

**Linux/Mac:**
```bash
# 1. Resetear base de datos
dropdb fintrack_dev --if-exists
createdb fintrack_dev

# 2. Ejecutar migraciones
npm run db:migrate

# 3. Seeds base
npm run db:seed:base

# 4. Admin (opcional)
npm run db:seed:admin

# 5. Iniciar aplicación
npm run dev
```

### Scripts NPM Disponibles

| Comando | Descripción |
|---------|-------------|
| `npm run db:migrate` | Ejecuta migraciones |
| `npm run db:seed:base` / `db:seed:admin` | Ejecuta el conjunto de seeds elegido por argumento posicional, no por flag |
| `DB_EXPECTED=<base> npm run db:reset` | Reset completo (solo desarrollo). Confirma conectandose a la base que va a borrar |
| `npm run dev` | Inicia servidor de desarrollo |
| `npm start` | Inicia servidor en producción |

### Verificación de Datos

**Windows (cmd):**
```cmd
:: Conectar a la base de datos
psql -U postgres -d fintrack_dev

:: Comandos útiles dentro de psql:
\dt                    :: Listar tablas
SELECT * FROM users;   :: Ver usuarios
\q                     :: Salir
```

**Linux/Mac:**
```bash
# Conectar a la base de datos
psql -U postgres -d fintrack_dev

# Comandos útiles dentro de psql:
\dt                    # Listar tablas
SELECT * FROM users;   # Ver usuarios
\q                     # Salir
```

---

## 🔧 Resolución de Problemas

### Error: "Database does not exist"

**Windows (cmd):**
```cmd
:: Solución: Crear la base de datos
createdb fintrack_dev
```

**Linux/Mac:**
```bash
# Solución: Crear la base de datos
createdb fintrack_dev
```

### Error: "Seeds are disabled in production"

```bash
# Verificar variables de entorno
echo %NODE_ENV%        # Windows
echo $NODE_ENV         # Linux/Mac
echo %DB_EXPECTED%     # Windows
echo $DB_EXPECTED      # Linux/Mac

# Con NODE_ENV=production el runner de seeds sale, y ninguna variable
# cambia eso. Para saber qué base alcanzó la conexión:
npm run db:state
```

### Error: "Relation already exists"

```bash
# Las migraciones ya se ejecutaron
# Verificar estado:
psql -U postgres -d fintrack_dev -c "SELECT * FROM migrations;"
```

### Error de autenticación en PostgreSQL

**Windows (cmd):**
```cmd
:: Verificar que PostgreSQL está corriendo
net start postgresql-x64-15

:: Verificar versión instalada
pg_config --version
```

**Linux/Mac:**
```bash
# Verificar que PostgreSQL está corriendo
sudo systemctl status postgresql

# Verificar versión
postgres --version
```

---

## 📚 Resumen del Flujo

```
┌─────────────────┐
│   Crear DB      │  createdb fintrack_dev
└────────┬────────┘
         ↓
┌─────────────────┐
│  Migraciones    │  npm run db:migrate
└────────┬────────┘
         ↓
┌─────────────────┐
│  Seeds Base     │  Windows: npm run db:seed:base
│                 │  Linux/Mac: npm run db:seed:base
└────────┬────────┘
         ↓
┌─────────────────┐
│  Seeds Admin    │  Windows: npm run db:seed:admin
│                 │  Linux/Mac: npm run db:seed:admin
└────────┬────────┘
         ↓
┌─────────────────┐
│  Iniciar App    │  npm run dev
└─────────────────┘
```

---

## 📖 Notas Adicionales

- **Siempre** verificar el entorno antes de ejecutar comandos destructivos
- Los seeds admin son **irreversibles** pero seguros (verifican existencia)
- En producción, **solo migraciones automáticas**
- Mantén tu archivo `.env` fuera del control de versiones
- En Windows, usa `&&` para encadenar comandos y `set` para variables de entorno temporales

---

**finTrack** - Gestión financiera inteligente © 2024