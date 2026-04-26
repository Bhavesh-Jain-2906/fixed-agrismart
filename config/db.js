const { Pool } = require('pg');

const isProduction = process.env.DATABASE_URL;

const pool = new Pool(
  isProduction
    ? {
        connectionString: process.env.DATABASE_URL,
        ssl: {
          rejectUnauthorized: false
        }
      }
    : {
        host: 'localhost',
        port: 5432,
        database: 'cropdb',
        user: 'postgres',
        password: 'Johan@2906'
      }
);

// Test connection
pool.connect((err, client, release) => {
  if (err) {
    console.error('DB connection error ❌', err.stack);
  } else {
    console.log(
      isProduction
        ? 'Connected to Supabase DB ✅'
        : 'Connected to Local PostgreSQL ✅'
    );
    release();
  }
});

module.exports = pool;