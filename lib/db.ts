import Database from 'better-sqlite3';
import path from 'path';
import fs from 'fs';

const DB_DIR = path.join(process.cwd(), 'data');
const DB_PATH = path.join(DB_DIR, 'wardrobe.db');

if (!fs.existsSync(DB_DIR)) {
  fs.mkdirSync(DB_DIR, { recursive: true });
}

let db: Database.Database;

export function getDb(): Database.Database {
  if (!db) {
    db = new Database(DB_PATH);
    db.pragma('journal_mode = WAL');
    db.pragma('foreign_keys = ON');
    initDb(db);
  }
  return db;
}

function initDb(db: Database.Database) {
  db.exec(`
    CREATE TABLE IF NOT EXISTS personas (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      style_vibe TEXT,
      occasions TEXT,
      color_palette TEXT,
      budget TEXT,
      body_notes TEXT,
      wardrobe_level INTEGER DEFAULT 0,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS wardrobe_items (
      id TEXT PRIMARY KEY,
      persona_id TEXT NOT NULL,
      name TEXT NOT NULL,
      category TEXT NOT NULL,
      subcategory TEXT,
      colors TEXT,
      description TEXT,
      image_path TEXT,
      is_owned INTEGER DEFAULT 0,
      is_key_piece INTEGER DEFAULT 0,
      notes TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (persona_id) REFERENCES personas(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS looks (
      id TEXT PRIMARY KEY,
      persona_id TEXT NOT NULL,
      name TEXT NOT NULL,
      description TEXT,
      occasion TEXT,
      temperature TEXT DEFAULT 'all',
      item_ids TEXT NOT NULL,
      is_approved INTEGER DEFAULT 0,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (persona_id) REFERENCES personas(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS build_conversations (
      id TEXT PRIMARY KEY,
      persona_id TEXT NOT NULL UNIQUE,
      messages TEXT NOT NULL DEFAULT '[]',
      current_step INTEGER DEFAULT 0,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (persona_id) REFERENCES personas(id) ON DELETE CASCADE
    );
  `);

  // Migrations for existing databases
  try { db.exec(`ALTER TABLE looks ADD COLUMN temperature TEXT DEFAULT 'all'`); } catch {}
  try { db.exec(`ALTER TABLE looks ADD COLUMN is_approved INTEGER DEFAULT 0`); } catch {}
}

export type Persona = {
  id: string;
  name: string;
  style_vibe: string;
  occasions: string;
  color_palette: string;
  budget: string;
  body_notes: string;
  wardrobe_level: number;
  created_at: string;
};

export type WardrobeItem = {
  id: string;
  persona_id: string;
  name: string;
  category: string;
  subcategory: string;
  colors: string;
  description: string;
  image_path: string;
  is_owned: number;
  is_key_piece: number;
  notes: string;
  created_at: string;
};

export type Look = {
  id: string;
  persona_id: string;
  name: string;
  description: string;
  occasion: string;
  temperature: string;
  item_ids: string;
  is_approved: number;
  created_at: string;
};
