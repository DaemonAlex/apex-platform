const sql = require('mssql');

// Validate required environment variables
const requiredEnvVars = ['DB_USERNAME', 'DB_PASSWORD', 'DB_HOST', 'DB_DATABASE'];
const missingEnvVars = requiredEnvVars.filter(envVar => !process.env[envVar]);

if (missingEnvVars.length > 0) {
  console.error('❌ CRITICAL: Missing required environment variables:', missingEnvVars.join(', '));
  console.error('❌ Application cannot start without database credentials.');
  console.error('❌ Please set the following environment variables:');
  missingEnvVars.forEach(envVar => console.error(`   - ${envVar}`));
  process.exit(1);
}

// Database configuration - NO HARDCODED CREDENTIALS
const dbConfig = {
  user: process.env.DB_USERNAME,
  password: process.env.DB_PASSWORD,
  server: process.env.DB_HOST,
  port: parseInt(process.env.DB_PORT || '1433'),
  database: process.env.DB_DATABASE,
  options: {
    encrypt: false,
    trustServerCertificate: true
  }
};

// Create connection pool
const poolPromise = new sql.ConnectionPool(dbConfig)
  .connect()
  .then(pool => {
    console.log('✅ Connected to SQL Server database');
    return pool;
  })
  .catch(err => {
    console.error('❌ Database connection failed:', err);
    throw err;
  });

module.exports = {
  sql,
  poolPromise,
  dbConfig
};