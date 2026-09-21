# Estrategia de datos — cómo se construye, se llena y se protege la base

Reglas vigentes, leídas del código el 2026-09-20. Documentos acompañantes:
`db-lifecycle.md` (qué son migraciones, seeds y resets) y
`db-migration-procedure.md` (cómo se corre una migración contra producción).

---

## 1. Hay dos caminos que construyen el esquema, y cualquiera lo construye entero

| Camino | Comando | Qué hace |
| --- | --- | --- |
| **Cadena de migraciones** | `npm run db:migrate` | Aplica en orden los archivos numerados de `src/db/migrations/sql_migrations/`, uno por transacción, y registra cada uno en la tabla `migrations` |
| **DDL de arranque** | `npm run init-db` | Corre `initDatabase.js`, que llama a `createTables.js` (27 tablas) y a `populateDB.js` (catálogos) |

**No son alternativas históricas: las dos están vivas.** `npm run db:parity`
existe justamente para comparar lo que declara cada una y reportar dónde
difieren. Una tabla agregada a un camino hay que agregarla al otro a mano.

**Ninguno de los dos archivos del arranque se elimina.** Una versión anterior de
este documento anunciaba que `createTables.js` se borraba y que `populateDB.js`
se convertía en seeds. No ocurrió ni debe ocurrir: `initDatabase.js` importa los
dos y es lo único que `init-db.js` ejecuta.

---

## 2. Migración y seed no son lo mismo

- **Migración** → estructura: tablas, claves foráneas, constraints, índices.
- **Seed** → datos: catálogos y el usuario administrador de arranque.

Un seed no corre solo, no vive en el runtime de la aplicación, y se ejecuta
únicamente desde la línea de comandos.

### Dónde viven

```
src/db/
 ├── migrations/
 │    ├── sql_migrations/      ← la cadena numerada
 │    ├── sql_seeds/           ← los seeds
 │    ├── runMigrations.js
 │    └── runSeeds.js
 ├── run_time_db_init/         ← el camino de arranque
 └── config/configDB.js
```

---

## 3. Qué siembra cada comando, hoy

| Comando | Qué corre |
| --- | --- |
| `npm run db:seed:base` | **Nada todavía.** No existe ningún archivo `base_*` en `sql_seeds/`; el runner reporta «No base seeds found» y revierte |
| `npm run db:seed:admin` | `admin_001_system_admin_user.js`, el único archivo que hay |

**Los catálogos base no los siembra este runner.** Los inserta
`005_base_catalogs.sql` dentro de la cadena de migraciones, con `008` y `030`
encima, y `populateDB.js` en el camino de arranque.

**El conjunto se elige por argumento, no por variable de entorno.** `SEED_BASE`
y `SEED_ADMIN` están retirados: `runSeeds.js` lee `process.argv[2]` y solo
acepta `base` o `admin`. El comando es idéntico en Windows y en Unix.

---

## 4. Cómo se protege producción

### La negativa es incondicional

```js
// runSeeds.js
if (isProduction()) {
  console.error('❌ Seeds are not allowed under NODE_ENV=production.');
  process.exit(1);
}
```

**No hay ninguna variable que levante esta restricción.** Una versión anterior
de este documento describía un `ALLOW_SEEDS` que permitiría sembrar en
producción; el código nunca ha leído esa variable.

### La base se confirma, no se elige

Después, `runSeeds.js` llama a `assertExpectedDatabase`, que le pregunta a la
**conexión ya abierta** cuál alcanzó, con `current_database()`, y se niega si no
coincide con `DB_EXPECTED`. Si la variable falta, también se niega, y el mensaje
imprime la base que alcanzó, así que nombrarla es un solo paso.

`NODE_ENV` no sirve para esto: en `dbEnvironmentConfig.js` los bloques
`development` y `production` son idénticos y los dos leen `DATABASE_URI`.

### El camino de arranque tiene su propia guardia

`initDatabase.js` llama a `assertLocalDestination` antes de crear nada, así que
el DDL de arranque no puede alcanzar producción.

### No toca el runtime

- `runSeeds.js` no lo importa ningún controlador.
- Ningún endpoint HTTP activa un seed.
- Todo el conjunto corre en una transacción: si uno falla, se revierte entero.

---

## 5. El primer administrador

**No se crea por el flujo normal de registro.** Es un bootstrap: el auth depende
de tablas y de catálogos que en ese momento pueden no estar poblados, y el
usuario tiene que existir antes de que haya alguien que pueda crearlo.

**No hay credenciales por defecto.** `admin_001_system_admin_user.js` lee
`SYSTEM_ADMIN_EMAIL` y `SYSTEM_ADMIN_PASSWORD` del entorno y **lanza si falta
cualquiera de las dos**, así que la cuenta no puede crearse con un valor que
este repositorio conozca.

**La contraseña se hashea dentro del seed**, con bcrypt a 10 rondas — el mismo
algoritmo que usa el registro. Nunca se pega un hash a mano en SQL.

**Es idempotente:** busca la dirección sin distinguir mayúsculas y no hace nada
si ya existe un usuario con ella.

---

## 6. Flujo completo

### En desarrollo

```bash
# 1. Crear la base (una sola vez)
createdb fintrack_dev

# 2. Estructura y catálogos
DB_EXPECTED=fintrack_dev npm run db:migrate

# 3. Administrador de arranque (opcional, manual)
DB_EXPECTED=fintrack_dev npm run db:seed:admin

# 4. Comprobar que los dos caminos siguen de acuerdo
npm run db:parity
```

En Windows, `set DB_EXPECTED=fintrack_dev && npm run db:migrate`.

### En producción

```bash
# Solo migraciones, y con el procedimiento de db-migration-procedure.md
npm run db:migrate
```

- **Nunca** seeds automáticos.
- **Nunca** `init-db`: el DDL de arranque es para una base local y su guardia lo
  impide.

---

## 7. Qué recordar

- **Migración** = estructura. **Seed** = datos.
- **Producción** = solo la cadena de migraciones.
- **`DB_EXPECTED` en cada corrida**: es lo que convierte una base equivocada en
  una negativa en vez de en una escritura.
- **Dos caminos de construcción**, y `db:parity` es quien avisa si se separan.
