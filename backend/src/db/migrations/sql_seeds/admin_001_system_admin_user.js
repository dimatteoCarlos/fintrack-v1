/**
 * Seed: creates the first system admin from SYSTEM_ADMIN_EMAIL and
 * SYSTEM_ADMIN_PASSWORD. Manual only: npm run db:seed:admin
 */

import bcrypt from 'bcrypt';

export default async function seedAdminUser(client) {
const {
 SYSTEM_ADMIN_EMAIL,
 SYSTEM_ADMIN_PASSWORD,
 } = process.env;

if (!SYSTEM_ADMIN_EMAIL || !SYSTEM_ADMIN_PASSWORD) {
 throw new Error(
  'SYSTEM_ADMIN_EMAIL and SYSTEM_ADMIN_PASSWORD must be defined in environment variables'
 );
 }

 // Case-folded like the INSERT below, so a capitalised address finds the
 // existing admin instead of creating a second one.
 const { rowCount } = await client.query(
  'SELECT 1 FROM users WHERE lower(email) = lower(btrim($1))',
  [SYSTEM_ADMIN_EMAIL]
 );

if (rowCount > 0) {
  console.log('ℹ️ System Admin User already exists, skipping system admin seed');
  return;
}

// Hashed with the same algorithm as the auth flow.
const passwordHash = await bcrypt.hash(SYSTEM_ADMIN_PASSWORD, 10);

await client.query(
 `
INSERT INTO users (
 user_id,
 username,
 email,
 user_firstname,
 user_lastname,
 password_hashed,
 user_role_id,
 auth_method,
 created_at
)
VALUES (
 gen_random_uuid(),
 'system_admin',
 lower(btrim($1)),
 'System',
 'Administrator',
 $2,
 (SELECT user_role_id FROM user_roles WHERE user_role_name = 'system_admin'),
 'password',
 CURRENT_TIMESTAMP
)
`,
 [SYSTEM_ADMIN_EMAIL, passwordHash]
);
 console.log('👑 Admin user created successfully');
}
