# ==================================
# 0. Asegúrate de que PostgreSQL esté corriendo
# (en Windows normalmente corre como servicio)
# ==================================

# ==================================
# 1. Entrar a PostgreSQL como superusuario
# ==================================
psql -U postgres

# ==================================
# 2. (DENTRO DE psql) eliminar y crear BD limpia
# ==================================
DROP DATABASE IF EXISTS fintrack_dev;
CREATE DATABASE fintrack_dev;
\q

# ==================================
# 3. Verificar variables de entorno
# ==================================
# Debe existir en tu .env:
# DATABASE_URI=postgresql://postgres:PASSWORD@localhost:5432/fintrack_dev
# ADMIN_PASSWORD=alguna_password_segura

# ==================================
# 4. Instalar dependencias (si es primera vez)
# ==================================
npm install

# ==================================
# 5. Ejecutar migraciones (estructura DB)
# ==================================
npm run db:migrate

# ==================================
# 6. Ejecutar seeds base (catálogos estáticos)
# ==================================
# Igual en Windows, Unix, Mac y Linux: el runner recibe el conjunto
# como argumento, no por variable de entorno.
npm run db:seed:base

# ==================================
# 7. Crear usuario bootstrap admin (manual)
# ==================================
npm run db:seed:admin

# ==================================
# 8. (Opcional) Verificar en psql
# ==================================
psql -U postgres -d fintrack_dev

# Dentro de psql:
\dt
SELECT email, user_role_id FROM users;
