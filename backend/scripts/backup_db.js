require('dotenv').config();
const path = require('path');
const fs = require('fs');

const DB_PATH = process.env.DB_PATH || path.join(__dirname, '..', 'data', 'escape.db');
const BACKUP_DIR = process.env.BACKUP_DIR || path.join(__dirname, '..', 'backups');
const MAX_BACKUPS = parseInt(process.env.MAX_BACKUPS) || 7;

if (!fs.existsSync(BACKUP_DIR)) fs.mkdirSync(BACKUP_DIR, { recursive: true });

const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
const backupPath = path.join(BACKUP_DIR, `escape-${timestamp}.db`);

try {
  if (!fs.existsSync(DB_PATH)) {
    console.error(`Database not found at ${DB_PATH}`);
    process.exit(1);
  }
  fs.copyFileSync(DB_PATH, backupPath);
  console.log(`Backup created: ${backupPath}  (${(fs.statSync(backupPath).size / 1024).toFixed(1)} KB)`);
  const backups = fs.readdirSync(BACKUP_DIR)
    .filter(f => f.startsWith('escape-') && f.endsWith('.db'))
    .sort()
    .reverse();
  if (backups.length > MAX_BACKUPS) {
    for (const old of backups.slice(MAX_BACKUPS)) {
      fs.unlinkSync(path.join(BACKUP_DIR, old));
      console.log(`Removed old backup: ${old}`);
    }
  }
  console.log('Backup complete.');
} catch (err) {
  console.error('Backup failed:', err.message);
  process.exit(1);
}
