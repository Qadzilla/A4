#!/usr/bin/env tsx
/**
 * One-time migration script: moves all data from dev-user-001 to a real Clerk user ID.
 *
 * Usage: npx tsx scripts/migrate-dev-user.ts user_2xXXXXXX
 */

import Database from 'better-sqlite3';
import fs from 'node:fs';
import path from 'node:path';

const OLD_USER_ID = 'dev-user-001';

// All tables with a user_id column
const TABLES = [
  'workspaces',
  'canvas_items',
  'canvas_connections',
  'files',
  'categories',
  'transactions',
  'account_groups',
  'accounts',
  'receipts',
  'subscriptions',
  'invoices',
  'budget_groups',
  'budget_categories',
  'holdings',
  'debts',
  'networth_categories',
  'networth_entries',
  'categorization_rules',
  'conversations',
  'messages',
  'ai_usage',
  'workspace_insights',
  'document_chunks',
  'vault_config',
];

function main() {
  const newUserId = process.argv[2];

  if (!newUserId || !newUserId.startsWith('user_')) {
    console.error('Usage: npx tsx scripts/migrate-dev-user.ts user_2xXXXXXX');
    console.error('  The new user ID must start with "user_"');
    process.exit(1);
  }

  if (newUserId === OLD_USER_ID) {
    console.error('New user ID cannot be the same as the old one.');
    process.exit(1);
  }

  const dbPath = path.resolve(__dirname, '..', 'data', 'a4.db');
  if (!fs.existsSync(dbPath)) {
    console.error(`Database not found at ${dbPath}`);
    process.exit(1);
  }

  // Backup
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
  const backupPath = `${dbPath}.backup-${timestamp}`;
  console.log(`Backing up database to ${path.basename(backupPath)} ...`);
  fs.copyFileSync(dbPath, backupPath);

  // Open DB
  const db = new Database(dbPath);
  db.pragma('journal_mode = WAL');
  db.pragma('foreign_keys = ON');

  console.log(`\nMigrating: ${OLD_USER_ID} → ${newUserId}\n`);

  const summary: Record<string, number> = {};

  const migrate = db.transaction(() => {
    for (const table of TABLES) {
      const stmt = db.prepare(`UPDATE ${table} SET user_id = ? WHERE user_id = ?`);
      const result = stmt.run(newUserId, OLD_USER_ID);
      summary[table] = result.changes;
    }

    // Fix storage_path references in files table
    const fixPaths = db.prepare(
      `UPDATE files SET storage_path = REPLACE(storage_path, '/${OLD_USER_ID}/', '/${newUserId}/') WHERE user_id = ?`
    );
    fixPaths.run(newUserId);
  });

  migrate();

  // Print summary
  console.log('Table                     Rows updated');
  console.log('─'.repeat(45));
  let total = 0;
  for (const table of TABLES) {
    const count = summary[table];
    total += count;
    if (count > 0) {
      console.log(`${table.padEnd(26)}${count}`);
    }
  }
  console.log('─'.repeat(45));
  console.log(`Total                     ${total}`);

  // Rename upload directory
  const uploadsBase = path.resolve(__dirname, '..', 'data', 'uploads');
  const oldDir = path.join(uploadsBase, OLD_USER_ID);
  const newDir = path.join(uploadsBase, newUserId);

  if (fs.existsSync(oldDir)) {
    if (fs.existsSync(newDir)) {
      console.warn(`\n⚠ Target upload dir already exists: ${newDir}`);
      console.warn('  Skipping directory rename. Move files manually if needed.');
    } else {
      fs.renameSync(oldDir, newDir);
      const fileCount = fs.readdirSync(newDir).length;
      console.log(`\nRenamed uploads: ${OLD_USER_ID}/ → ${newUserId}/ (${fileCount} files)`);
    }
  } else {
    console.log('\nNo upload directory found to rename.');
  }

  db.close();
  console.log('\nDone! Verify with:');
  console.log(`  sqlite3 data/a4.db "SELECT DISTINCT user_id FROM workspaces"`);
}

main();
