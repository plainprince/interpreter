import { Database } from "bun:sqlite";
import { resolve } from "path";

// Set up the database connection
const dbPath = resolve(import.meta.dir, 'interpreter.db');
const db = new Database(dbPath, { create: true });

// Create the users table if it doesn't exist
const createUsersTable = `
CREATE TABLE IF NOT EXISTS users (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  username TEXT UNIQUE NOT NULL,
  password TEXT NOT NULL
);
`;

db.exec(createUsersTable);

console.log('Database initialized and users table created (if it did not exist).');

export default db;
