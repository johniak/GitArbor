import initSqlJs, { type Database as SqlJsDatabase } from 'sql.js';
import { drizzle } from 'drizzle-orm/sql-js';
import { sqliteTable, integer, text } from 'drizzle-orm/sqlite-core';
import { asc, desc, eq } from 'drizzle-orm';
import path from 'node:path';
import fs from 'node:fs';

// Schema
export const repositories = sqliteTable('repositories', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  path: text('path').notNull().unique(),
  name: text('name').notNull(),
  lastOpenedAt: integer('last_opened_at').notNull(),
  isFavourite: integer('is_favourite').notNull().default(0),
});

export type Repository = typeof repositories.$inferSelect;

// Keep reference to raw sql.js DB for persistence
let rawDb: SqlJsDatabase | null = null;
let dbFilePath: string | null = null;

/** Save in-memory DB to disk */
export function saveDatabase() {
  if (rawDb && dbFilePath) {
    const data = rawDb.export();
    const dir = path.dirname(dbFilePath);
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(dbFilePath, Buffer.from(data));
  }
}

function initSchema(db: SqlJsDatabase) {
  db.run(`
    CREATE TABLE IF NOT EXISTS repositories (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      path TEXT NOT NULL UNIQUE,
      name TEXT NOT NULL,
      last_opened_at INTEGER NOT NULL,
      is_favourite INTEGER NOT NULL DEFAULT 0
    )
  `);

  // Migrate pre-existing DBs that pre-date is_favourite. SQLite throws
  // "duplicate column name" if already present — safe to swallow.
  try {
    db.run(
      `ALTER TABLE repositories ADD COLUMN is_favourite INTEGER NOT NULL DEFAULT 0`,
    );
  } catch {
    // Column already exists — no-op.
  }
}

/** Create or open the database (async — loads WASM) */
export async function createDatabase(filePath: string) {
  const SQL = await initSqlJs();

  let db: SqlJsDatabase;
  if (fs.existsSync(filePath)) {
    const buffer = fs.readFileSync(filePath);
    db = new SQL.Database(buffer);
  } else {
    db = new SQL.Database();
  }

  rawDb = db;
  dbFilePath = filePath;

  initSchema(db);

  return drizzle(db);
}

/** In-memory DB for tests (async) */
export async function createTestDatabase() {
  const SQL = await initSqlJs();
  const db = new SQL.Database();

  initSchema(db);

  // Don't set rawDb/dbFilePath — test DB doesn't persist
  return drizzle(db);
}

export type AppDatabase = Awaited<ReturnType<typeof createDatabase>>;

// Queries
const MAX_RECENT = 5;

export function addRecentRepo(db: AppDatabase, repoPath: string) {
  const name = path.basename(repoPath);
  const now = Date.now();

  db.insert(repositories)
    .values({ path: repoPath, name, lastOpenedAt: now })
    .onConflictDoUpdate({
      target: repositories.path,
      // Intentionally do NOT touch is_favourite — re-opening a repo must
      // preserve its favourite state.
      set: { lastOpenedAt: now, name },
    })
    .run();

  saveDatabase();
}

export function getRecentRepos(db: AppDatabase): Repository[] {
  return db
    .select()
    .from(repositories)
    .orderBy(desc(repositories.lastOpenedAt))
    .limit(MAX_RECENT)
    .all();
}

export function clearRecentRepos(db: AppDatabase) {
  db.delete(repositories).where(eq(repositories.isFavourite, 0)).run();
  saveDatabase();
}

export function setFavourite(
  db: AppDatabase,
  repoPath: string,
  isFavourite: boolean,
) {
  db.update(repositories)
    .set({ isFavourite: isFavourite ? 1 : 0 })
    .where(eq(repositories.path, repoPath))
    .run();
  saveDatabase();
}

export function getFavouriteRepos(db: AppDatabase): Repository[] {
  return db
    .select()
    .from(repositories)
    .where(eq(repositories.isFavourite, 1))
    .orderBy(asc(repositories.name))
    .all();
}

export function isFavouriteRepo(db: AppDatabase, repoPath: string): boolean {
  const row = db
    .select({ isFavourite: repositories.isFavourite })
    .from(repositories)
    .where(eq(repositories.path, repoPath))
    .get();
  return row?.isFavourite === 1;
}
