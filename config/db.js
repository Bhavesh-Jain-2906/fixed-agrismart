const { Pool } = require('pg');

const pool = new Pool({
  host: 'localhost',
  port: 5432,
  database: 'cropdb',
  user: 'postgres',
  password: 'Johan@2906'
});

pool.connect((err, client, release) => {
  if (err) {
    return console.error('Error acquiring client', err.stack);
  }
  console.log('Connected to PostgreSQL database (cropdb)');
  release();
});

module.exports = pool;
