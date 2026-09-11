import { test, type TestContext } from 'node:test'
import assert from 'node:assert/strict'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { DatabaseSync } from 'node:sqlite'
import { Library, validateSetup } from '../src/main/library'
import { fields, type Metadata } from '../src/shared/contracts'
import { migrate, migrations } from '../src/main/migrations'
const blank = (): Metadata => Object.fromEntries(Object.keys(fields).map(k => [k, null])) as Metadata
function fixture(t: TestContext): { folder: string; lib: Library } {
  const folder = mkdtempSync(join(tmpdir(), 'cug-test-'))
  const lib = new Library(folder, 'installation-a', true)
  t.after(() => { try { lib.close() } catch { /* test may already close it */ } rmSync(folder, { recursive: true, force: true }) })
  lib.configure({ name: 'Workstation A', start: 1, end: 50000, next: 1 })
  return { folder, lib }
}
test('serial allocation is permanent, padded, unique and persists with blank metadata', t => {
  const { folder, lib } = fixture(t)
  const a = lib.create().card, b = lib.create().card
  assert.match(a.id, /^[0-9a-f-]{36}$/)
  assert.notEqual(a.id, b.id)
  assert.equal(a.serial, '0000000001'); assert.equal(b.serial, '0000000002')
  assert.equal(a.cardName, null); assert.equal(a.includePublic, true)
  const saved = lib.save(a.id, 0, { ...blank(), cardName: 'Pikachu', notes: 'Line 1\nLine 2', year: '1999', game: '  ' })
  assert.equal(saved.game, null)
  lib.close()
  const reopened = new Library(folder, 'installation-a')
  try {
    assert.equal(reopened.list(0).cards.find(c => c.id === a.id)?.notes, 'Line 1\nLine 2')
    assert.equal(reopened.create().card.serial, '0000000003')
  } finally { reopened.close() }
})
test('range changes retain history, skip collisions and never change existing cards', t => {
  const { lib } = fixture(t)
  const original = lib.create().card
  lib.configure({ name: 'Renamed', start: 50001, end: 100000, next: 50001 })
  assert.equal(lib.create().card.serial, '0000050001')
  assert.equal(lib.info().history.filter(r => r.retiredAt).length, 1)
  assert.equal(lib.list(0).cards.find(c => c.id === original.id)?.serial, original.serial)
  assert.throws(() => lib.configure({ name: 'A', start: 1, end: 10, next: 1 }), /permanently reserved/)
  lib.configure({ name: 'A', start: 1, end: 60000, next: 50000 })
  assert.equal(lib.create().card.serial, '0000050000'); assert.equal(lib.create().card.serial, '0000050002')
})
test('exhaustion rolls back and allocation can be replaced', t => {
  const { lib } = fixture(t)
  lib.configure({ name: 'A', start: 9999999999, end: 9999999999, next: 9999999999 })
  assert.equal(lib.create().card.serial, '9999999999')
  assert.throws(() => lib.create(), /exhausted/)
  assert.equal(lib.list(0).total, 1)
  lib.configure({ name: 'A', start: 2, end: 3, next: 2 })
  assert.equal(lib.create().card.serial, '0000000002')
})
test('database enforces immutable identity and unique serials even outside app service', t => {
  const { lib, folder } = fixture(t); const card = lib.create().card
  const db = new DatabaseSync(join(folder, 'catalogue.sqlite'))
  try {
    assert.throws(() => db.prepare('UPDATE cards SET serial=? WHERE id=?').run('0000000008', card.id), /permanent/)
    assert.throws(() => db.prepare('UPDATE cards SET id=? WHERE id=?').run('another', card.id), /permanent/)
    assert.throws(() => db.exec("INSERT INTO cards(id,serial,allocationId,createdAt,updatedAt) SELECT 'another',serial,allocationId,createdAt,updatedAt FROM cards"), /reservation/)
    assert.throws(() => db.exec("INSERT INTO cards(id,serial,allocationId,createdAt,updatedAt) SELECT 'zero','0000000000',allocationId,createdAt,updatedAt FROM cards"), /CHECK|reservation/)
  } finally { db.close() }
})
test('invalid input and stale revisions cannot overwrite saved data', t => {
  const { lib } = fixture(t); const card = lib.create().card
  lib.save(card.id, 0, { ...blank(), cardName: 'Kept' })
  assert.throws(() => lib.save(card.id, 0, { ...blank(), cardName: 'Lost' }), /changed elsewhere/)
  assert.throws(() => lib.save(card.id, 1, { ...blank(), serial: '123' }), /Unsupported/)
  assert.throws(() => lib.save(card.id, 1, { ...blank(), cardName: 12 }), /Metadata/)
  assert.equal(lib.list(0).cards[0].cardName, 'Kept')
  for (const next of [0, -1, 1.5, 10000000000, NaN]) assert.throws(() => validateSetup({ name: 'A', start: 1, end: 50000, next }))
  assert.throws(() => validateSetup({ name: ' ', start: 1, end: 5, next: 1 }))
  assert.throws(() => validateSetup({ name: 'A', start: 5, end: 4, next: 1 }))
})
test('migrations are idempotent, transactional, and reject future versions', () => {
  const db = new DatabaseSync(':memory:')
  try {
    migrate(db); migrate(db)
    assert.equal(db.prepare('SELECT count(*) AS n FROM schema_migrations').get()!.n, 5)
    db.exec("INSERT INTO schema_migrations VALUES (6,'future')")
    assert.throws(() => migrate(db), /unsupported schema/)
  } finally { db.close() }
  const broken = new DatabaseSync(':memory:')
  try {
    broken.exec('CREATE TABLE cards(id TEXT)')
    assert.throws(() => migrate(broken))
    assert.equal(broken.prepare("SELECT name FROM sqlite_master WHERE name='installations'").get(), undefined)
    assert.equal(broken.prepare('SELECT count(*) AS n FROM schema_migrations').get()!.n, 0)
  } finally { broken.close() }
})
test('migration 5 assigns one stable immutable library identity', t => {
  const folder = mkdtempSync(join(tmpdir(), 'cug-library-identity-'))
  t.after(() => rmSync(folder, { recursive: true, force: true }))
  const database = new DatabaseSync(join(folder, 'catalogue.sqlite')), now = new Date().toISOString()
  database.exec('PRAGMA foreign_keys=ON; CREATE TABLE schema_migrations (version INTEGER PRIMARY KEY, appliedAt TEXT NOT NULL)')
  for (let index = 0; index < 4; index++) {
    database.exec(migrations[index])
    database.prepare('INSERT INTO schema_migrations VALUES (?,?)').run(index + 1, now)
  }
  database.close()
  const migrated = new Library(folder, 'installation-a')
  const libraryId = migrated.info().libraryId
  assert.match(libraryId, /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/)
  migrated.close()
  const reopened = new Library(folder, 'installation-a')
  try {
    assert.equal(reopened.info().libraryId, libraryId)
    const check = new DatabaseSync(join(folder, 'catalogue.sqlite'))
    try {
      assert.throws(() => check.prepare('UPDATE library_metadata SET libraryId=? WHERE singleton=1').run('00000000-0000-4000-8000-000000000000'), /permanent/)
      assert.throws(() => check.prepare('DELETE FROM library_metadata WHERE singleton=1').run(), /permanent/)
    } finally { check.close() }
  } finally { reopened.close() }
})
test('installations require their own allocation and cannot overlap other recorded ranges', t => {
  const { lib, folder } = fixture(t); lib.create()
  const second = new Library(folder, 'installation-b')
  try {
    assert.equal(second.info().allocation, null)
    assert.throws(() => second.create(), /Configure/)
    assert.throws(() => second.configure({ name: 'B', start: 1, end: 50000, next: 2 }), /overlaps/)
    second.configure({ name: 'B', start: 50001, end: 100000, next: 50001 })
    assert.equal(second.create().card.serial, '0000050001')
  } finally { second.close() }
})
test('bounded pages and safe folder selection', t => {
  const { lib, folder } = fixture(t)
  for (let i = 0; i < 105; i++) lib.create()
  assert.equal(lib.list(0).cards.length, 100); assert.equal(lib.list(100).cards.length, 5)
  assert.equal(lib.list(0).cards[0].serial, '0000000105')
  assert.equal(lib.list(100).cards[4].serial, '0000000001')
  assert.equal(lib.list(0).total, 105)
  assert.throws(() => lib.list(-1), /Invalid page/)
  assert.throws(() => new Library(folder, 'a', true), /empty folder/)
  assert.throws(() => new Library(join(folder, 'missing'), 'a'), /No Cards/)
})
test('library order is permanent serial descending and ignores later edits', t => {
  const { lib } = fixture(t)
  const first = lib.create().card
  lib.create(); lib.create()
  assert.deepEqual(lib.list(0).cards.map(card => card.serial), ['0000000003', '0000000002', '0000000001'])
  lib.save(first.id, first.revision, { ...blank(), cardName: 'Edited after newer cards' })
  assert.deepEqual(lib.list(0).cards.map(card => card.serial), ['0000000003', '0000000002', '0000000001'])
  assert.equal(lib.create().card.serial, '0000000004')
  assert.deepEqual(lib.list(0).cards.map(card => card.serial), ['0000000004', '0000000003', '0000000002', '0000000001'])
})
test('failed card insert rolls back the serial pointer along with the card', t => {
  const { lib, folder } = fixture(t)
  const db = new DatabaseSync(join(folder, 'catalogue.sqlite'))
  try {
    db.exec("CREATE TRIGGER simulate_failure BEFORE INSERT ON cards BEGIN SELECT RAISE(ABORT,'simulated write failure'); END")
    assert.throws(() => lib.create(), /simulated write failure/)
    assert.equal(lib.info().allocation!.next, 1)
    assert.equal(lib.list(0).total, 0)
    db.exec('DROP TRIGGER simulate_failure')
    assert.equal(lib.create().card.serial, '0000000001')
  } finally { db.close() }
})
