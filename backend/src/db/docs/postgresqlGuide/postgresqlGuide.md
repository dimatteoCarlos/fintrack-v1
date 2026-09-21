Aquí tienes una guía paso a paso para usar **PostgreSQL en localhost**, configurar tu aplicación, y obtener la **cadena de conexión (connection string)** usando **pgAdmin**.

---

## ✅ 1. **Instalar PostgreSQL y pgAdmin**

1. Descarga PostgreSQL desde: [https://www.postgresql.org/download/](https://www.postgresql.org/download/)
2. Durante la instalación:

   * Crea una **contraseña para el usuario `postgres`** (admin por defecto).
   * Instala **pgAdmin** (viene incluido normalmente).

---

## ✅ 2. **Usar PostgreSQL en localhost**

Una vez instalado:

* **Servidor**: corre en `localhost` por defecto (puerto 5432).
* Puedes conectarte usando el cliente de línea de comandos (`psql`) o `pgAdmin`.

### 🧪 Probar conexión por consola:

```bash
psql -U postgres -h localhost
```

* Te pedirá la contraseña que pusiste en la instalación.

---

## ✅ 3. **Configurar tu App (Cadena de Conexión)**

Una cadena de conexión típica en PostgreSQL se ve así:

```
postgresql://USUARIO:CONTRASEÑA@HOST:PUERTO/BASEDATOS
```

Ejemplo:

```
postgresql://postgres:miClaveSegura@localhost:5432/mibase
```

En una app (por ejemplo en Node.js con `pg`, Django o SQLAlchemy en Python), usarás esta cadena.

---

## ✅ 4. **Usar pgAdmin para obtener datos de conexión**

1. Abre **pgAdmin**.
2. En el panel izquierdo, haz clic derecho en **"Servers" > Create > Server...**
3. En la pestaña **"General"**, pon un nombre (ej. "localhost").
4. En la pestaña **"Connection"**, pon:

   * **Host name/address**: `localhost`
   * **Port**: `5432`
   * **Username**: `postgres` (o el que hayas creado)
   * **Password**: tu clave
   * Marca **"Save password"**

Después de conectar, podrás ver tus bases de datos y configuraciones.

---

## ✅ 5. **Ver los datos para la cadena de conexión desde pgAdmin**

Una vez conectado al servidor:

1. Ve a **"Dashboard"** o haz clic en una base de datos específica.
2. Haz clic derecho sobre la base de datos → **Properties**.
3. Puedes ver el nombre de la base de datos, usuario, puerto y host.
4. Usa esa info para construir tu connection string:

   ```
   postgresql://<usuario>:<clave>@<host>:<puerto>/<nombreBD>
   ```

---

## ✅ 6. **Ejemplo: Configurar en Node.js (con pg)**

```javascript
const { Pool } = require('pg');

const pool = new Pool({
  connectionString: 'postgresql://postgres:miClave@localhost:5432/mibase'
});

pool.query('SELECT NOW()', (err, res) => {
  console.log(err, res);
  pool.end();
});
```

---
