import type { DatabaseSync } from 'node:sqlite'
import { fields } from '../shared/contracts'
const migrations = [
  `CREATE TABLE installations (id TEXT PRIMARY KEY NOT NULL, name TEXT NOT NULL);
   CREATE TABLE allocations (
     id TEXT PRIMARY KEY NOT NULL, installationId TEXT NOT NULL REFERENCES installations(id),
     start INTEGER NOT NULL CHECK(start BETWEEN 1 AND 9999999999),
     end INTEGER NOT NULL CHECK(end BETWEEN start AND 9999999999),
     next INTEGER NOT NULL CHECK(next BETWEEN start AND end + 1), retiredAt TEXT
   );
   CREATE UNIQUE INDEX one_current_range ON allocations(installationId) WHERE retiredAt IS NULL;
   CREATE TABLE cards (
     id TEXT PRIMARY KEY NOT NULL, serial TEXT NOT NULL UNIQUE
       CHECK(length(serial)=10 AND serial NOT GLOB '*[^0-9]*' AND serial <> '0000000000'),
     allocationId TEXT NOT NULL REFERENCES allocations(id),
     ${Object.keys(fields).map(f => `${f} TEXT`).join(',')},
     status TEXT NOT NULL DEFAULT 'in_progress' CHECK(status IN ('in_progress','finalized')),
     includePublic INTEGER NOT NULL DEFAULT 1 CHECK(includePublic IN (0,1)),
     createdAt TEXT NOT NULL, updatedAt TEXT NOT NULL, revision INTEGER NOT NULL DEFAULT 0
   );
   CREATE INDEX cards_updated ON cards(updatedAt DESC, id DESC);
   CREATE TRIGGER immutable_card_identity BEFORE UPDATE OF id, serial, allocationId ON cards
     WHEN NEW.id IS NOT OLD.id OR NEW.serial IS NOT OLD.serial OR NEW.allocationId IS NOT OLD.allocationId
     BEGIN SELECT RAISE(ABORT, 'Card identity and serial are permanent'); END;`
]
export function migrate(db: DatabaseSync): void {
  db.exec('CREATE TABLE IF NOT EXISTS schema_migrations (version INTEGER PRIMARY KEY, appliedAt TEXT NOT NULL)')
  const rows = db.prepare('SELECT version FROM schema_migrations ORDER BY version').all()
  if (rows.some((r, i) => r.version !== i + 1) || rows.length > migrations.length)
    throw new Error('This library uses an unsupported schema. Open it with a compatible app version.')
  db.exec('BEGIN IMMEDIATE')
  try {
    for (let i = rows.length; i < migrations.length; i++) {
      db.exec(migrations[i])
      db.prepare('INSERT INTO schema_migrations VALUES (?, ?)').run(i + 1, new Date().toISOString())
    }
    db.exec('COMMIT')
  } catch (error) { db.exec('ROLLBACK'); throw error }
}
