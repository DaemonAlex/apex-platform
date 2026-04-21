import 'dotenv/config';
import { defineConfig } from 'drizzle-kit';

// Drizzle-kit prefers DDL_USERNAME / DDL_PASSWORD when set (a superuser-ish
// account that can CREATE / ALTER / DROP). Runtime DB_USERNAME is now
// apex_app which is CRUD-only (2026-04-18, P1-5), so using it for schema
// push would fail on CREATE TABLE / ALTER TABLE.
export default defineConfig({
  schema: './drizzle/schema.ts',
  out: './drizzle/migrations',
  dialect: 'postgresql',
  dbCredentials: {
    host: process.env.DB_HOST || 'localhost',
    port: parseInt(process.env.DB_PORT || '5432'),
    user: process.env.DDL_USERNAME || process.env.DB_USERNAME || 'apex_user',
    password: process.env.DDL_PASSWORD || process.env.DB_PASSWORD || '',
    database: process.env.DB_DATABASE || 'apex_db',
    ssl: false,
  },
});
