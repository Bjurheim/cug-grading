import type { DatabaseSync } from 'node:sqlite'
import { fields } from '../shared/contracts'
export const migrations = [
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
     BEGIN SELECT RAISE(ABORT, 'Card identity and serial are permanent'); END;`,
  `CREATE TABLE serial_reservations (
     serial TEXT PRIMARY KEY NOT NULL
       CHECK(length(serial)=10 AND serial NOT GLOB '*[^0-9]*' AND serial <> '0000000000'),
     allocationId TEXT NOT NULL REFERENCES allocations(id),
     originalCardId TEXT NOT NULL UNIQUE,
     assignedAt TEXT NOT NULL,
     deletedAt TEXT
   );
   INSERT INTO serial_reservations(serial,allocationId,originalCardId,assignedAt)
     SELECT serial,allocationId,id,createdAt FROM cards;
   CREATE TRIGGER immutable_serial_reservation BEFORE UPDATE OF serial,allocationId,originalCardId,assignedAt ON serial_reservations
     BEGIN SELECT RAISE(ABORT, 'Serial reservations are permanent'); END;
   CREATE TRIGGER no_serial_reservation_delete BEFORE DELETE ON serial_reservations
     BEGIN SELECT RAISE(ABORT, 'Serial reservations are permanent'); END;
   CREATE TRIGGER no_serial_reservation_reactivation BEFORE UPDATE OF deletedAt ON serial_reservations
     WHEN OLD.deletedAt IS NOT NULL OR NEW.deletedAt IS NULL
     BEGIN SELECT RAISE(ABORT, 'Deleted serial reservations are permanent'); END;
   CREATE TRIGGER card_requires_live_reservation BEFORE INSERT ON cards
     WHEN NOT EXISTS (
       SELECT 1 FROM serial_reservations
       WHERE serial=NEW.serial AND allocationId=NEW.allocationId AND originalCardId=NEW.id AND deletedAt IS NULL
     ) BEGIN SELECT RAISE(ABORT, 'Card serial must have a new reservation'); END;
   CREATE TRIGGER tombstone_deleted_card AFTER DELETE ON cards
     BEGIN UPDATE serial_reservations SET deletedAt=strftime('%Y-%m-%dT%H:%M:%fZ','now') WHERE originalCardId=OLD.id; END;

   ALTER TABLE cards ADD COLUMN finalizedAt TEXT;
   ALTER TABLE cards ADD COLUMN finalizedAssessmentRevision INTEGER CHECK(finalizedAssessmentRevision IS NULL OR finalizedAssessmentRevision >= 0);
   CREATE TABLE inspections (
     cardId TEXT PRIMARY KEY NOT NULL REFERENCES cards(id) ON DELETE CASCADE,
     cornersGrade INTEGER CHECK(cornersGrade BETWEEN 0 AND 100),
     edgesGrade INTEGER CHECK(edgesGrade BETWEEN 0 AND 100),
     surfaceGrade INTEGER CHECK(surfaceGrade BETWEEN 0 AND 100),
     defectsGrade INTEGER CHECK(defectsGrade BETWEEN 0 AND 100),
     estimatedGrade INTEGER CHECK(estimatedGrade BETWEEN 0 AND 100),
     verticalLeftTop INTEGER CHECK(verticalLeftTop >= 0),
     verticalLeftBottom INTEGER CHECK(verticalLeftBottom >= 0),
     verticalRightTop INTEGER CHECK(verticalRightTop >= 0),
     verticalRightBottom INTEGER CHECK(verticalRightBottom >= 0),
     horizontalUpperLeft INTEGER CHECK(horizontalUpperLeft >= 0),
     horizontalUpperRight INTEGER CHECK(horizontalUpperRight >= 0),
     horizontalLowerLeft INTEGER CHECK(horizontalLowerLeft >= 0),
     horizontalLowerRight INTEGER CHECK(horizontalLowerRight >= 0),
     cornersNote TEXT, edgesNote TEXT, surfaceNote TEXT, defectsNote TEXT, estimatedNote TEXT, centeringNote TEXT,
     assessmentRevision INTEGER NOT NULL DEFAULT 0 CHECK(assessmentRevision >= 0)
   );
   INSERT INTO inspections(cardId) SELECT id FROM cards;
   CREATE TABLE defect_markers (
     id TEXT PRIMARY KEY NOT NULL,
     cardId TEXT NOT NULL REFERENCES cards(id) ON DELETE CASCADE,
     side TEXT NOT NULL CHECK(side IN ('front','back')),
     x REAL NOT NULL CHECK(x BETWEEN 0.0 AND 1.0),
     y REAL NOT NULL CHECK(y BETWEEN 0.0 AND 1.0),
     note TEXT,
     createdAt TEXT NOT NULL,
     updatedAt TEXT NOT NULL
   );
   CREATE INDEX defect_markers_card ON defect_markers(cardId,createdAt,id);`,
  `ALTER TABLE inspections RENAME TO inspections_milestone2;
   CREATE TABLE inspections (
     cardId TEXT PRIMARY KEY NOT NULL REFERENCES cards(id) ON DELETE CASCADE,
     centeringGrade INTEGER CHECK(centeringGrade BETWEEN 0 AND 100),
     cornersGrade INTEGER CHECK(cornersGrade BETWEEN 0 AND 100),
     edgesGrade INTEGER CHECK(edgesGrade BETWEEN 0 AND 100),
     surfaceGrade INTEGER CHECK(surfaceGrade BETWEEN 0 AND 100),
     estimatedGrade INTEGER CHECK(estimatedGrade BETWEEN 0 AND 100),
     verticalLeftTop INTEGER CHECK(verticalLeftTop >= 0),
     verticalLeftBottom INTEGER CHECK(verticalLeftBottom >= 0),
     verticalRightTop INTEGER CHECK(verticalRightTop >= 0),
     verticalRightBottom INTEGER CHECK(verticalRightBottom >= 0),
     horizontalUpperLeft INTEGER CHECK(horizontalUpperLeft >= 0),
     horizontalUpperRight INTEGER CHECK(horizontalUpperRight >= 0),
     horizontalLowerLeft INTEGER CHECK(horizontalLowerLeft >= 0),
     horizontalLowerRight INTEGER CHECK(horizontalLowerRight >= 0),
     centeringNote TEXT, cornersNote TEXT, edgesNote TEXT, surfaceNote TEXT, estimatedNote TEXT,
     assessmentRevision INTEGER NOT NULL DEFAULT 0 CHECK(assessmentRevision >= 0)
   );
   INSERT INTO inspections(
     cardId,cornersGrade,edgesGrade,surfaceGrade,estimatedGrade,
     verticalLeftTop,verticalLeftBottom,verticalRightTop,verticalRightBottom,
     horizontalUpperLeft,horizontalUpperRight,horizontalLowerLeft,horizontalLowerRight,
     centeringNote,cornersNote,edgesNote,surfaceNote,estimatedNote,assessmentRevision
   ) SELECT
     cardId,cornersGrade,edgesGrade,surfaceGrade,estimatedGrade,
     verticalLeftTop,verticalLeftBottom,verticalRightTop,verticalRightBottom,
     horizontalUpperLeft,horizontalUpperRight,horizontalLowerLeft,horizontalLowerRight,
     centeringNote,cornersNote,edgesNote,surfaceNote,estimatedNote,assessmentRevision + 1
   FROM inspections_milestone2;
   DROP TABLE inspections_milestone2;`,
  `CREATE TABLE photos (
     id TEXT PRIMARY KEY NOT NULL,
     cardId TEXT NOT NULL REFERENCES cards(id) ON DELETE CASCADE,
     slot TEXT CHECK(slot IS NULL OR slot IN (
       'full_front','full_back','corner_top_left','corner_top_right',
       'corner_bottom_left','corner_bottom_right','edge_top','edge_right','edge_bottom','edge_left'
     )),
     title TEXT,
     locked INTEGER NOT NULL DEFAULT 0 CHECK(locked IN (0,1)),
     originalRelativePath TEXT NOT NULL,
     thumbnailRelativePath TEXT NOT NULL,
     originalFilename TEXT NOT NULL,
     mimeType TEXT NOT NULL CHECK(mimeType IN ('image/jpeg','image/png','image/webp')),
     createdAt TEXT NOT NULL,
     updatedAt TEXT NOT NULL,
     UNIQUE(id,cardId),
     CHECK(slot IS NULL OR title IS NULL)
   );
   CREATE UNIQUE INDEX photos_primary_slot ON photos(cardId,slot) WHERE slot IS NOT NULL;
   CREATE INDEX photos_card ON photos(cardId,createdAt,id);
   CREATE UNIQUE INDEX defect_marker_card_identity ON defect_markers(id,cardId);
   CREATE TABLE photo_defect_markers (
     photoId TEXT NOT NULL,
     markerId TEXT NOT NULL,
     cardId TEXT NOT NULL,
     PRIMARY KEY(photoId,markerId),
     FOREIGN KEY(photoId,cardId) REFERENCES photos(id,cardId) ON DELETE CASCADE,
     FOREIGN KEY(markerId,cardId) REFERENCES defect_markers(id,cardId) ON DELETE CASCADE
   );
   CREATE INDEX photo_defect_markers_marker ON photo_defect_markers(markerId,photoId);`,
  `CREATE TABLE library_metadata (
     singleton INTEGER PRIMARY KEY NOT NULL CHECK(singleton=1),
     libraryId TEXT NOT NULL UNIQUE CHECK(length(libraryId)=36),
     createdAt TEXT NOT NULL
   );
   INSERT INTO library_metadata(singleton,libraryId,createdAt) VALUES (
     1,
     lower(hex(randomblob(4))) || '-' || lower(hex(randomblob(2))) || '-4' ||
       substr(lower(hex(randomblob(2))),2) || '-' || substr('89ab',(random() & 3)+1,1) ||
       substr(lower(hex(randomblob(2))),2) || '-' || lower(hex(randomblob(6))),
     strftime('%Y-%m-%dT%H:%M:%fZ','now')
   );
   CREATE TRIGGER no_library_identity_update BEFORE UPDATE OF libraryId ON library_metadata
     BEGIN SELECT RAISE(ABORT, 'Library identity is permanent'); END;
   CREATE TRIGGER no_library_metadata_delete BEFORE DELETE ON library_metadata
     BEGIN SELECT RAISE(ABORT, 'Library identity is permanent'); END;`
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
