import sqlite3 from 'sqlite3';
import { resolve } from 'path';
import { fileURLToPath } from 'url';
import { dirname } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Set up the database connection
const dbPath = resolve(__dirname, 'interpreter.db');
const database = new sqlite3.Database(dbPath);

// Create the users table if it doesn't exist
const createUsersTable = `
CREATE TABLE IF NOT EXISTS users (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  username TEXT UNIQUE NOT NULL,
  password TEXT NOT NULL
);
`;

database.run(createUsersTable, (err) => {
    if (err) {
        console.error('Error creating users table:', err);
    } else {
        console.log('Database initialized and users table created (if it did not exist).');
    }
});

// Create a wrapper object that provides synchronous-like interface
const db = {
    prepare: (sql) => {
        const stmt = database.prepare(sql);
        return {
            run: (...params) => {
                return new Promise((resolve, reject) => {
                    stmt.run(...params, function(err) {
                        if (err) reject(err);
                        else resolve({ lastInsertRowid: this.lastID, changes: this.changes });
                    });
                });
            },
            get: (...params) => {
                return new Promise((resolve, reject) => {
                    stmt.get(...params, (err, row) => {
                        if (err) reject(err);
                        else resolve(row);
                    });
                });
            }
        };
    }
};

export default db;
