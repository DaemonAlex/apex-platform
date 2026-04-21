// Drizzle instance for CLI tooling (drizzle-kit push, generate, studio).
// This file is NOT imported by the running server - all route handlers use
// the shared pg Pool from ../db.js with raw SQL queries.
import 'dotenv/config';
import { drizzle } from 'drizzle-orm/node-postgres';
import { Pool } from 'pg';
import * as schema from './schema';

const pool = new Pool({
  user: process.env.DB_USERNAME,
  password: process.env.DB_PASSWORD,
  host: process.env.DB_HOST,
  port: parseInt(process.env.DB_PORT || '5432'),
  database: process.env.DB_DATABASE,
  ssl: false,
});

export const db = drizzle(pool, { schema });
export { schema };
