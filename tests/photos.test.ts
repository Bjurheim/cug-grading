import { test, type TestContext } from 'node:test'
import assert from 'node:assert/strict'
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { mkdtempSync } from 'node:fs'
import { DatabaseSync } from 'node:sqlite'
import { Library, type ThumbnailWriter } from '../src/main/library'
import { migrations } from '../src/main/migrations'
import { gradeFields, measurementFields, type Inspection } from '../src/shared/contracts'

function fixture(t: TestContext): { root: string; folder: string; lib: Library; image: (name: string, content?: string) => string } {
  const root = mkdtempSync(join(tmpdir(), 'cug-photos-')), folder = join(root, 'library')
  mkdirSync(folder)
  const thumbnail: ThumbnailWriter = async (source, destination) => {
    const content = readFileSync(source)
    if (content.toString().includes('FAIL_THUMBNAIL')) throw new Error('thumbnail failed')
    writeFileSync(destination, Buffer.concat([Buffer.from('thumbnail:'), content]), { flush: true })
  }
  const lib = new Library(folder, 'installation-a', true, thumbnail)
  lib.configure({ name: 'Photo desk', start: 1, end: 50000, next: 1 })
  t.after(() => { try { lib.close() } catch { /* already closed */ } rmSync(root, { recursive: true, force: true }) })
  return {
    root, folder, lib,
    image: (name, content = name) => { const path = join(root, name); writeFileSync(path, content); return path }
  }
}

function complete(inspection: Inspection): Inspection {
  const next = { ...inspection }
  for (const key of Object.keys(gradeFields) as (keyof typeof gradeFields)[]) next[key] = 95
  for (const key of Object.keys(measurementFields) as (keyof typeof measurementFields)[]) next[key] = 200
  return next
}

test('photo imports copy originals, create thumbnails, persist titles and replace safely', async t => {
  const { lib, image } = fixture(t)
  const card = lib.create()
  const firstSource = image('front.png', 'ORIGINAL_ONE')
  let detail = await lib.importPhotos(card.card.id, 'full_front', [firstSource])
  const first = detail.photos[0]
  assert.equal(first.slot, 'full_front'); assert.equal(first.locked, false); assert.equal(first.originalFilename, 'front.png')
  const firstOriginal = await lib.photoFile(first.id, 'original'), firstThumbnail = await lib.photoFile(first.id, 'thumbnail')
  assert.notEqual(firstOriginal, firstSource); assert.equal(readFileSync(firstOriginal, 'utf8'), 'ORIGINAL_ONE')
  assert.match(readFileSync(firstThumbnail, 'utf8'), /^thumbnail:/)
  rmSync(firstSource)
  assert.equal(readFileSync(await lib.photoFile(first.id, 'original'), 'utf8'), 'ORIGINAL_ONE')
  assert.throws(() => lib.savePhotoTitle(first.id, 'Not allowed'), /Primary photos/)

  const additionalSource = image('detail.webp', 'ADDITIONAL')
  detail = await lib.importPhotos(card.card.id, null, [additionalSource])
  const additional = detail.photos.find(photo => photo.slot === null)!
  assert.equal(lib.savePhotoTitle(additional.id, 'Foil scratch').title, 'Foil scratch')
  assert.equal(lib.savePhotoTitle(additional.id, '   ').title, null)

  const replacementSource = image('replacement.jpg', 'ORIGINAL_TWO')
  detail = await lib.importPhotos(card.card.id, 'full_front', [replacementSource])
  const replacement = detail.photos.find(photo => photo.slot === 'full_front')!
  assert.notEqual(replacement.id, first.id); assert.equal(existsSync(firstOriginal), false); assert.equal(existsSync(firstThumbnail), false)
  assert.equal(readFileSync(await lib.photoFile(replacement.id, 'original'), 'utf8'), 'ORIGINAL_TWO')

  const replacementPath = await lib.photoFile(replacement.id, 'original')
  await assert.rejects(() => lib.importPhotos(card.card.id, 'full_front', [image('bad.png', 'FAIL_THUMBNAIL')]), /thumbnail failed/)
  const afterFailure = lib.get(card.card.id).photos.find(photo => photo.slot === 'full_front')!
  assert.equal(afterFailure.id, replacement.id); assert.equal(existsSync(replacementPath), true)
})

test('primary uniqueness and photo locks are enforced persistently', async t => {
  const { folder, lib, image } = fixture(t)
  const card = lib.create()
  let detail = await lib.importPhotos(card.card.id, 'corner_top_left', [image('corner.png')])
  let photo = detail.photos[0]
  detail = lib.setPhotoLocked(photo.id, true)
  photo = detail.photos[0]
  assert.equal(photo.locked, true)
  assert.throws(() => lib.removePhoto(photo.id), /Unlock/)
  await assert.rejects(() => lib.importPhotos(card.card.id, 'corner_top_left', [image('other.png')]), /Unlock/)
  const db = new DatabaseSync(join(folder, 'catalogue.sqlite'))
  try {
    assert.throws(() => db.prepare(`INSERT INTO photos(id,cardId,slot,locked,originalRelativePath,thumbnailRelativePath,originalFilename,mimeType,createdAt,updatedAt)
      SELECT 'duplicate-photo',cardId,slot,0,originalRelativePath,thumbnailRelativePath,originalFilename,mimeType,createdAt,updatedAt FROM photos WHERE id=?`).run(photo.id), /UNIQUE/)
  } finally { db.close() }
  detail = lib.setPhotoLocked(photo.id, false)
  assert.equal(detail.photos[0].locked, false)
  const original = await lib.photoFile(photo.id, 'original'), thumbnail = await lib.photoFile(photo.id, 'thumbnail')
  lib.removePhoto(photo.id)
  assert.equal(existsSync(original), false); assert.equal(existsSync(thumbnail), false)
  assert.equal(lib.get(card.card.id).photos.length, 0)
})

test('photo-marker links are same-card, many-to-many, and cascade independently', async t => {
  const { folder, lib, image } = fixture(t)
  const first = lib.create(), second = lib.create()
  const markerOne = lib.addMarker(first.card.id, 'front', 0.1, 0.2)
  const markerTwo = lib.addMarker(first.card.id, 'back', 0.8, 0.9)
  const otherMarker = lib.addMarker(second.card.id, 'front', 0.5, 0.5)
  let detail = await lib.importPhotos(first.card.id, null, [image('one.png'), image('two.jpg')])
  const [photoOne, photoTwo] = detail.photos
  detail = lib.setPhotoMarkers(photoOne.id, [markerOne.id, markerTwo.id])
  detail = lib.setPhotoMarkers(photoTwo.id, [markerOne.id])
  assert.deepEqual(detail.photos.find(photo => photo.id === photoOne.id)!.markerIds.sort(), [markerOne.id, markerTwo.id].sort())
  assert.equal(detail.markers.find(marker => marker.id === markerOne.id)!.linkedPhotoCount, 2)
  assert.throws(() => lib.setPhotoMarkers(photoOne.id, [otherMarker.id]), /same card/)
  const db = new DatabaseSync(join(folder, 'catalogue.sqlite'))
  try {
    assert.throws(() => db.prepare('INSERT INTO photo_defect_markers(photoId,markerId,cardId) VALUES (?,?,?)').run(photoOne.id, otherMarker.id, first.card.id), /FOREIGN KEY/)
  } finally { db.close() }
  lib.removeMarker(markerOne.id)
  assert.deepEqual(lib.get(first.card.id).photos.find(photo => photo.id === photoOne.id)!.markerIds, [markerTwo.id])
  lib.removePhoto(photoOne.id)
  const check = new DatabaseSync(join(folder, 'catalogue.sqlite'))
  try { assert.equal(check.prepare('SELECT count(*) AS total FROM photo_defect_markers').get()!.total, 0) } finally { check.close() }
  assert.equal(lib.get(first.card.id).markers.find(marker => marker.id === markerTwo.id)!.linkedPhotoCount, 0)
})

test('photo changes do not affect grading revisions and card deletion cleans owned media', async t => {
  const { folder, lib, image } = fixture(t)
  let detail = lib.create()
  let saved = lib.saveInspection(detail.card.id, detail.card.revision, complete(detail.inspection))
  detail = lib.finalize(detail.card.id, saved.card.revision)
  const cardRevision = detail.card.revision, assessmentRevision = detail.inspection.assessmentRevision
  const marker = lib.addMarker(detail.card.id, 'front', 0.4, 0.4)
  detail = await lib.importPhotos(detail.card.id, 'edge_bottom', [image('edge.png')])
  let photo = detail.photos[0]
  detail = lib.setPhotoMarkers(photo.id, [marker.id])
  detail = lib.setPhotoLocked(photo.id, true)
  photo = detail.photos[0]
  assert.equal(detail.card.revision, cardRevision)
  assert.equal(detail.inspection.assessmentRevision, assessmentRevision)
  assert.equal(detail.card.finalizationState, 'finalized')
  const original = await lib.photoFile(photo.id, 'original'), thumbnail = await lib.photoFile(photo.id, 'thumbnail')
  rmSync(thumbnail)
  assert.equal(existsSync(await lib.photoFile(photo.id, 'thumbnail')), true)
  lib.delete(detail.card.id)
  assert.equal(existsSync(original), false); assert.equal(existsSync(thumbnail), false)
  const db = new DatabaseSync(join(folder, 'catalogue.sqlite'))
  try {
    assert.equal(db.prepare('SELECT count(*) AS total FROM photos').get()!.total, 0)
    assert.equal(db.prepare('SELECT count(*) AS total FROM photo_defect_markers').get()!.total, 0)
  } finally { db.close() }
})

test('migration 4 upgrades the corrected Milestone 2 schema and preserves markers', t => {
  const root = mkdtempSync(join(tmpdir(), 'cug-photo-migration-')), folder = join(root, 'library')
  mkdirSync(folder)
  t.after(() => rmSync(root, { recursive: true, force: true }))
  const db = new DatabaseSync(join(folder, 'catalogue.sqlite')), now = new Date().toISOString()
  db.exec('PRAGMA foreign_keys=ON; CREATE TABLE schema_migrations (version INTEGER PRIMARY KEY, appliedAt TEXT NOT NULL)')
  for (let index = 0; index < 3; index++) {
    db.exec(migrations[index])
    db.prepare('INSERT INTO schema_migrations VALUES (?,?)').run(index + 1, now)
  }
  db.prepare('INSERT INTO installations VALUES (?,?)').run('installation-a', 'Existing desk')
  db.prepare('INSERT INTO allocations VALUES (?,?,?,?,?,NULL)').run('allocation-a', 'installation-a', 1, 50000, 2)
  db.prepare('INSERT INTO serial_reservations(serial,allocationId,originalCardId,assignedAt) VALUES (?,?,?,?)').run('0000000001', 'allocation-a', 'existing-card', now)
  db.prepare('INSERT INTO cards(id,serial,allocationId,createdAt,updatedAt) VALUES (?,?,?,?,?)').run('existing-card', '0000000001', 'allocation-a', now, now)
  db.prepare('INSERT INTO inspections(cardId) VALUES (?)').run('existing-card')
  db.prepare('INSERT INTO defect_markers(id,cardId,side,x,y,note,createdAt,updatedAt) VALUES (?,?,?,?,?,?,?,?)').run('existing-marker', 'existing-card', 'front', 0.25, 0.75, 'Still here', now, now)
  db.close()
  const lib = new Library(folder, 'installation-a', false, async (source, destination) => { writeFileSync(destination, readFileSync(source)) })
  try {
    const detail = lib.get('existing-card')
    assert.equal(detail.photos.length, 0)
    assert.equal(detail.markers[0].note, 'Still here')
    const migrated = new DatabaseSync(join(folder, 'catalogue.sqlite'))
    try { assert.equal(migrated.prepare('SELECT count(*) AS total FROM schema_migrations').get()!.total, 4); assert.ok(migrated.prepare("SELECT name FROM sqlite_master WHERE name='photos'").get()) } finally { migrated.close() }
  } finally { lib.close() }
})

test('media serving rejects stored paths outside the active library', async t => {
  const { folder, lib, image } = fixture(t)
  const card = lib.create(), detail = await lib.importPhotos(card.card.id, null, [image('safe.png')]), photo = detail.photos[0]
  const db = new DatabaseSync(join(folder, 'catalogue.sqlite'))
  try { db.prepare("UPDATE photos SET originalRelativePath='../../outside.png' WHERE id=?").run(photo.id) } finally { db.close() }
  await assert.rejects(() => lib.photoFile(photo.id, 'original'), /Invalid library media path/)
})
