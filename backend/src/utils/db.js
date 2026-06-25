const Database = require('better-sqlite3');
const path = require('path');
const fs = require('fs');
const crypto = require('crypto');

const DATA_DIR = path.join(__dirname, '../../data');
if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });

const db = new Database(path.join(DATA_DIR, 'escape.db'));
db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');

// Register UUID function for SQLite (replaces PostgreSQL's uuid_generate_v4)
db.function('uuid_generate_v4', () => crypto.randomUUID());

function translateSql(text) {
  return text
    .replace(/::int/g, '')
    .replace(/\bNOW\(\)/g, "datetime('now')")
    .replace(/TIMESTAMPTZ/g, 'TEXT')
    .replace(/\bTRUE\b/g, '1')
    .replace(/\bFALSE\b/g, '0')
    .replace(/\bILIKE\b/g, 'LIKE')
    .replace(/\bGREATEST\(([^,]+),\s*([^)]+)\)/g, 'MAX($1, $2)')
    .replace(/\bCOALESCE\(/g, 'IFNULL(')
    .replace(/INTERVAL\s+'(\d+)\s+days'/gi, "-$1 days")
    .replace(/INTERVAL\s+'(\d+)\s+day'/gi, "-$1 days");
}

function prepareQuery(text, params = []) {
  const sql = translateSql(text);
  const indices = [];
  const converted = sql.replace(/\$(\d+)/g, (_, idx) => {
    indices.push(parseInt(idx));
    return '?';
  });
  const orderedParams = indices.map(i => params[i - 1]);
  return { sql: converted, params: orderedParams };
}

const query = (text, params = []) => {
  const { sql, params: sqlParams } = prepareQuery(text, params);
  // Convert Date objects to ISO strings for SQLite compatibility
  const bindParams = sqlParams.map(p => p instanceof Date ? p.toISOString() : p);
  try {
    const stmt = db.prepare(sql);
    const hasReturning = /\bRETURNING\b/i.test(sql);

    if (hasReturning) {
      const rows = stmt.all(...bindParams);
      return { rows, rowCount: rows.length };
    }

    const upper = sql.trim().toUpperCase();
    if (upper.startsWith('SELECT') || upper.startsWith('WITH')) {
      const rows = stmt.all(...bindParams);
      return { rows, rowCount: rows.length };
    }

    const result = stmt.run(...bindParams);
    return { rows: [], rowCount: result.changes, lastInsertRowid: result.lastInsertRowid };
  } catch (err) {
    console.error('[DB Error]', err.message);
    console.error('[SQL]', sql);
    console.error('[Params]', bindParams);
    throw err;
  }
};

const getClient = () => ({
  query: (text, params) => query(text, params),
  release: () => {},
});

const testConnection = () => {
  try { db.prepare('SELECT 1').get(); return true; }
  catch { return false; }
};

module.exports = { query, getClient, testConnection, db };
