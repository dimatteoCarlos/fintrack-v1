// Shared pg connection pool (a global singleton) and a startup connectivity check.
import pg from 'pg';
import pc from 'picocolors';
import { activeConfig } from './dbEnvironmentConfig.js';
import 'dotenv/config';

 
 function createPool (){
 const dbConfig = activeConfig.database;
 const pool = new pg.Pool(dbConfig);

// Required: an unhandled 'error' event on the pool would crash the process.
 pool.on('error', (err) => {
   console.error(
     pc.red(
       'Error inesperado en un cliente inactivo de la DB / Unexpected error on idle client:',
     ),
     err,
   );
 });

 return pool;

}

// Singleton on global so the module never creates a second pool.
export const pool = global._pool || (global._pool = createPool());

export async function checkConnection() {
  try {
    const client = await pool.connect();
    await client.query('SELECT 1');
    client.release();

    console.log(
      pc.italic(
        pc.yellowBright(
          'Conexión a la base de datos verificada / Database connection verified.',
        ),
      ),
    );
  } catch (error) {
    console.error(error);
    console.error(error.stack);
    console.error(
      pc.red(
        '❌ Error crítico al conectar con la base de datos / Critical error connecting to database:',
        error,
        error.message,
      ),
    );
    throw error;
  }
}

