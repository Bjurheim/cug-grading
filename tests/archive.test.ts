import { createHash } from 'node:crypto'
import { test, type TestContext } from 'node:test'
import assert from 'node:assert/strict'
import { existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, statSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { Readable } from 'node:stream'
import { DatabaseSync } from 'node:sqlite'
import { open as openZip, type Entry, type ZipFile as ZipReader } from 'yauzl'
import { ZipFile as ZipWriter } from 'yazl'
import {
  ARCHIVE_FORMAT_VERSION, createLibraryArchive, inspectLibraryArchive, restoreLibraryArchive,
  type ArchiveManifest
} from '../src/main/archive'
import { Library, type ThumbnailWriter } from '../src/main/library'
import { fields, gradeFields, measurementFields, type Inspection, type Metadata } from '../src/shared/contracts'

const blankMetadata = (): Metadata => Object.fromEntries(Object.keys(fields).map(key => [key, null])) as Metadata
const digest = (value: Buffer): string => createHash('sha256').update(value).digest('hex')

function completedInspection(inspection: Inspection): Inspection {
  const next = { ...inspection }
  for (const key of Object.keys(gradeFields) as (keyof typeof gradeFields)[]) next[key] = 95
  for (const key of Object.keys(measurementFields) as (keyof typeof measurementFields)[]) next[key] = 225
  next.backVerticalLeftTop = 300
  next.backVerticalLeftBottom = 250
  next.centeringNote = 'Balanced by eye'
  next.surfaceNote = 'See linked evidence'
  return next
}

function fixture(t: TestContext): { root: string; folder: string; lib: Library; thumbnail: ThumbnailWriter } {
  const root = mkdtempSync(join(tmpdir(), 'cug-archive-test-')), folder = join(root, 'library')
  mkdirSync(folder)
  const thumbnail: ThumbnailWriter = async (source, destination) => writeFileSync(destination, Buffer.concat([Buffer.from('thumbnail:'), readFileSync(source)]), { flush: true })
  const lib = new Library(folder, 'installation-a', true, thumbnail)
  lib.configure({ name: 'Archive workstation', start: 1, end: 50000, next: 1 })
  t.after(() => { try { lib.close() } catch { /* already closed */ } rmSync(root, { recursive: true, force: true }) })
  return { root, folder, lib, thumbnail }
}

async function populate(lib: Library, root: string): Promise<{ cardId: string; photoId: string; markerId: string; original: string }> {
  const retired = lib.create()
  assert.equal(retired.card.serial, '0000000001')
  lib.delete(retired.card.id)

  let detail = lib.create()
  const metadata = {
    ...blankMetadata(), cardName: 'Archived Charizard', game: 'Pokémon', setName: 'Base Set',
    submittedBy: 'Private collector', notes: 'Private archive data'
  }
  const saved = lib.save(detail.card.id, detail.card.revision, metadata)
  const inspection = lib.saveInspection(detail.card.id, saved.revision, completedInspection(detail.inspection))
  const card = lib.setIncludePublic(detail.card.id, inspection.card.revision, false)
  const marker = lib.addMarker(detail.card.id, 'front', 0.25, 0.75)
  lib.saveMarker(marker.id, 'Print line under raking light')
  const source = join(root, 'outside-source.png')
  writeFileSync(source, 'ORIGINAL_PHOTO_BYTES')
  detail = await lib.importPhotos(detail.card.id, null, [source])
  const photo = detail.photos[0]
  lib.savePhotoTitle(photo.id, 'Microscope — lower edge')
  lib.setPhotoMarkers(photo.id, [marker.id])
  detail = lib.setPhotoLocked(photo.id, true)
  detail = lib.finalize(detail.card.id, card.revision)
  assert.equal(detail.card.finalizationState, 'finalized')
  return { cardId: detail.card.id, photoId: photo.id, markerId: marker.id, original: await lib.photoFile(photo.id, 'original') }
}

function openArchive(path: string): Promise<ZipReader> {
  return new Promise((resolve, reject) => openZip(path, { lazyEntries: true, autoClose: false }, (error, zip) => error || !zip ? reject(error ?? new Error('ZIP open failed')) : resolve(zip)))
}

async function readEntry(zip: ZipReader, entry: Entry): Promise<Buffer> {
  const stream = await new Promise<Readable>((resolve, reject) => zip.openReadStream(entry, (error, opened) => error || !opened ? reject(error ?? new Error('ZIP entry failed')) : resolve(opened)))
  const chunks: Buffer[] = []
  for await (const chunk of stream) chunks.push(chunk as Buffer)
  return Buffer.concat(chunks)
}

async function readZip(path: string): Promise<Map<string, Buffer>> {
  const zip = await openArchive(path)
  const entries = new Map<string, Buffer>()
  try {
    for await (const entry of zip.eachEntry()) if (!entry.fileName.endsWith('/')) entries.set(entry.fileName, await readEntry(zip, entry))
  } finally { zip.close() }
  return entries
}

async function writeZip(path: string, entries: Map<string, Buffer>): Promise<void> {
  const zip = new ZipWriter()
  const chunks: Buffer[] = []
  const complete = new Promise<void>((resolve, reject) => {
    zip.outputStream.on('data', chunk => chunks.push(chunk as Buffer))
    zip.outputStream.once('error', reject)
    zip.outputStream.once('end', resolve)
  })
  for (const [name, value] of entries) zip.addBuffer(value, name)
  zip.end()
  await complete
  writeFileSync(path, Buffer.concat(chunks))
}

function manifestFrom(entries: Map<string, Buffer>): ArchiveManifest {
  return JSON.parse(entries.get('manifest.json')!.toString('utf8')) as ArchiveManifest
}

function replaceManifest(entries: Map<string, Buffer>, manifest: ArchiveManifest): void {
  entries.set('manifest.json', Buffer.from(`${JSON.stringify(manifest, null, 2)}\n`))
}

test('a .cug is an inspectable complete ZIP and restores a usable library', async t => {
  const { root, lib, thumbnail } = fixture(t)
  const populated = await populate(lib, root)
  const sourceLibraryId = lib.info().libraryId
  const archive = join(root, 'Complete Library.cug')
  const progress: string[] = []
  const manifest = await createLibraryArchive(lib, archive, '1.2.3-test', value => progress.push(`${value.operation}:${value.stage}`))

  assert.equal(readFileSync(archive).subarray(0, 2).toString(), 'PK')
  assert.equal(manifest.archiveFormatVersion, ARCHIVE_FORMAT_VERSION)
  assert.equal(manifest.applicationVersion, '1.2.3-test')
  assert.equal(manifest.library.id, sourceLibraryId)
  assert.equal(manifest.originatingInstallation.id, 'installation-a')
  assert.equal(manifest.originatingInstallation.name, 'Archive workstation')
  assert.equal(manifest.database.schemaVersion, 6)
  assert.deepEqual(manifest.excluded, ['cache/thumbnails'])
  assert.ok(progress.includes('create:database')); assert.ok(progress.includes('create:photos')); assert.ok(progress.includes('create:complete'))

  const indexed = await inspectLibraryArchive(archive)
  assert.equal(indexed.manifest.library.id, sourceLibraryId)
  assert.ok(indexed.entries.has('database/catalogue.sqlite'))
  assert.ok(indexed.entries.has(lib.get(populated.cardId).photos[0].originalFilename) === false)
  assert.ok([...indexed.entries.keys()].some(path => path.startsWith(`media/originals/${populated.cardId}/`)))
  assert.equal([...indexed.entries.keys()].some(path => path.startsWith('cache/')), false)

  const destination = join(root, 'restored-library')
  const restoredManifest = await restoreLibraryArchive(archive, destination)
  assert.equal(restoredManifest.library.id, sourceLibraryId)
  assert.equal(existsSync(join(destination, 'catalogue.sqlite')), true)
  assert.deepEqual(readdirSync(join(destination, 'cache/thumbnails')), [])
  const restored = new Library(destination, restoredManifest.originatingInstallation.id, false, thumbnail)
  try {
    const info = restored.info(), detail = restored.get(populated.cardId)
    assert.equal(info.libraryId, sourceLibraryId)
    assert.equal(info.installationName, 'Archive workstation')
    assert.equal(info.allocation?.next, 3)
    assert.equal(detail.card.serial, '0000000002')
    assert.equal(detail.card.cardName, 'Archived Charizard')
    assert.equal(detail.card.submittedBy, 'Private collector')
    assert.equal(detail.card.notes, 'Private archive data')
    assert.equal(detail.card.includePublic, false)
    assert.equal(detail.card.finalizationState, 'finalized')
    assert.equal(detail.inspection.centeringGrade, 95)
    assert.equal(detail.inspection.centeringNote, 'Balanced by eye')
    assert.equal(detail.inspection.frontVerticalLeftTop, 225)
    assert.equal(detail.inspection.backVerticalLeftTop, 300)
    assert.equal(detail.inspection.backVerticalLeftBottom, 250)
    assert.equal(detail.markers[0].id, populated.markerId)
    assert.equal(detail.markers[0].note, 'Print line under raking light')
    assert.equal(detail.photos[0].id, populated.photoId)
    assert.equal(detail.photos[0].title, 'Microscope — lower edge')
    assert.equal(detail.photos[0].locked, true)
    assert.deepEqual(detail.photos[0].markerIds, [populated.markerId])
    const restoredOriginal = await restored.photoFile(populated.photoId, 'original')
    assert.equal(readFileSync(restoredOriginal, 'utf8'), 'ORIGINAL_PHOTO_BYTES')
    const thumbnailPath = await restored.photoFile(populated.photoId, 'thumbnail')
    assert.equal(existsSync(thumbnailPath), true)
    assert.match(readFileSync(thumbnailPath, 'utf8'), /^thumbnail:/)
    assert.throws(() => restored.configure({ name: 'Archive workstation', start: 1, end: 50000, next: 1 }), /permanently reserved/)
    assert.equal(restored.create().card.serial, '0000000003')
  } finally { restored.close() }

  const restoredDb = new DatabaseSync(join(destination, 'catalogue.sqlite'), { readOnly: true })
  try {
    const retired = restoredDb.prepare("SELECT * FROM serial_reservations WHERE serial='0000000001'").get()
    assert.ok(retired); assert.equal(typeof retired.deletedAt, 'string')
  } finally { restoredDb.close() }
  assert.equal(statSync(populated.original).isFile(), true)
})

test('archive creation fails safely for missing media and excludes cache and nested backups', async t => {
  const { root, folder, lib } = fixture(t)
  const populated = await populate(lib, root)
  writeFileSync(join(folder, 'old-backup.cug'), 'do not recurse')
  writeFileSync(join(folder, 'cache/thumbnails/disposable.jpg'), 'cache')
  const cleanArchive = join(root, 'clean.cug')
  await createLibraryArchive(lib, cleanArchive, 'test')
  const entries = await readZip(cleanArchive)
  assert.equal([...entries.keys()].some(name => name.endsWith('.cug') || name.startsWith('cache/')), false)

  const cardBefore = lib.get(populated.cardId)
  rmSync(populated.original)
  const failedArchive = join(root, 'must-not-exist.cug')
  await assert.rejects(() => createLibraryArchive(lib, failedArchive, 'test'), /original photo.*missing/i)
  assert.equal(existsSync(failedArchive), false)
  const previousArchive = join(root, 'previous-backup.cug')
  writeFileSync(previousArchive, 'PREVIOUS_WORKING_BACKUP')
  await assert.rejects(() => createLibraryArchive(lib, previousArchive, 'test'), /original photo.*missing/i)
  assert.equal(readFileSync(previousArchive, 'utf8'), 'PREVIOUS_WORKING_BACKUP')
  assert.equal(lib.get(populated.cardId).card.cardName, cardBefore.card.cardName)
  assert.equal(lib.get(populated.cardId).photos.length, 1)
})

test('restore rejects malformed, unsupported, incomplete and tampered archives without committing a destination', async t => {
  const { root, lib } = fixture(t)
  await populate(lib, root)
  const valid = join(root, 'valid.cug')
  await createLibraryArchive(lib, valid, 'test')
  const originalEntries = await readZip(valid)

  const malformed = join(root, 'malformed.cug')
  writeFileSync(malformed, 'not a ZIP')
  await assert.rejects(() => inspectLibraryArchive(malformed), /valid Cards Under Glass archive|ZIP/i)

  const noManifest = join(root, 'no-manifest.cug')
  await writeZip(noManifest, new Map([['database/catalogue.sqlite', originalEntries.get('database/catalogue.sqlite')!]]))
  await assert.rejects(() => inspectLibraryArchive(noManifest), /manifest is missing/i)

  const unsupportedEntries = new Map(originalEntries)
  const unsupported = manifestFrom(unsupportedEntries) as unknown as { archiveFormatVersion: number }
  unsupported.archiveFormatVersion = 999
  unsupportedEntries.set('manifest.json', Buffer.from(`${JSON.stringify(unsupported, null, 2)}\n`))
  const unsupportedPath = join(root, 'unsupported.cug')
  await writeZip(unsupportedPath, unsupportedEntries)
  await assert.rejects(() => inspectLibraryArchive(unsupportedPath), /format version.*not supported/i)

  const incompatibleEntries = new Map(originalEntries)
  const incompatible = manifestFrom(incompatibleEntries)
  incompatible.compatibility.maximumSchemaVersion = 1
  replaceManifest(incompatibleEntries, incompatible)
  const incompatiblePath = join(root, 'incompatible-manifest.cug')
  await writeZip(incompatiblePath, incompatibleEntries)
  await assert.rejects(() => inspectLibraryArchive(incompatiblePath), /compatibility information/i)

  const missingEntries = new Map(originalEntries)
  const mediaName = [...missingEntries.keys()].find(name => name.startsWith('media/originals/'))!
  missingEntries.delete(mediaName)
  const missingPath = join(root, 'missing-media.cug')
  await writeZip(missingPath, missingEntries)
  await assert.rejects(() => inspectLibraryArchive(missingPath), /missing required content/i)

  for (const target of ['tampered-media', 'tampered-database']) {
    const entries = new Map(originalEntries)
    const name = target === 'tampered-media' ? mediaName : 'database/catalogue.sqlite'
    const bytes = Buffer.from(entries.get(name)!)
    bytes[Math.max(0, bytes.length - 1)] ^= 0xff
    entries.set(name, bytes)
    const path = join(root, `${target}.cug`), destination = join(root, `${target}-destination`)
    await writeZip(path, entries)
    await assert.rejects(() => restoreLibraryArchive(path, destination), /checksum validation failed/i)
    assert.equal(existsSync(destination), false)
    assert.equal(lib.list(0).total, 1)
  }

  const corruptEntries = new Map(originalEntries)
  const corruptManifest = manifestFrom(corruptEntries)
  const corruptDatabase = Buffer.from('not a SQLite database')
  corruptEntries.set('database/catalogue.sqlite', corruptDatabase)
  const databaseRecord = corruptManifest.files.find(file => file.role === 'database')!
  databaseRecord.size = corruptDatabase.length; databaseRecord.sha256 = digest(corruptDatabase)
  replaceManifest(corruptEntries, corruptManifest)
  const corruptPath = join(root, 'corrupt-database.cug'), corruptDestination = join(root, 'corrupt-destination')
  await writeZip(corruptPath, corruptEntries)
  await assert.rejects(() => restoreLibraryArchive(corruptPath, corruptDestination), /corrupt|integrity|SQLite/i)
  assert.equal(existsSync(corruptDestination), false)

  const occupied = join(root, 'occupied')
  mkdirSync(occupied); writeFileSync(join(occupied, 'keep.txt'), 'untouched')
  await assert.rejects(() => restoreLibraryArchive(valid, occupied), /new or empty folder/i)
  assert.equal(readFileSync(join(occupied, 'keep.txt'), 'utf8'), 'untouched')
})

test('restore rejects Zip Slip paths before extraction', async t => {
  const { root } = fixture(t)
  const ordinary = join(root, 'ordinary.zip')
  await writeZip(ordinary, new Map([['aa/evil', Buffer.from('escape')]]))
  const bytes = readFileSync(ordinary)
  const from = Buffer.from('aa/evil'), to = Buffer.from('../evil')
  let offset = 0, replaced = 0
  while ((offset = bytes.indexOf(from, offset)) !== -1) { to.copy(bytes, offset); offset += to.length; replaced++ }
  assert.ok(replaced >= 2)
  const malicious = join(root, 'zip-slip.cug')
  writeFileSync(malicious, bytes)
  await assert.rejects(() => inspectLibraryArchive(malicious), /unsafe|relative path|valid Cards Under Glass archive/i)
  assert.equal(existsSync(join(root, 'evil')), false)
})
