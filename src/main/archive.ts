import { createHash, randomUUID } from 'node:crypto'
import { createReadStream, createWriteStream, existsSync, lstatSync, mkdirSync, mkdtempSync, readdirSync, renameSync, rmSync, statSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { basename, dirname, isAbsolute, join, relative, resolve } from 'node:path'
import { Readable, Transform } from 'node:stream'
import { pipeline } from 'node:stream/promises'
import { DatabaseSync } from 'node:sqlite'
import { ZipFile as ZipWriter } from 'yazl'
import { open as openZip, type Entry, type ZipFile as ZipReader } from 'yauzl'
import { migrations } from './migrations'
import type { Library } from './library'
import type { ArchiveProgress } from '../shared/contracts'

export const ARCHIVE_FORMAT_VERSION = 1
const DATABASE_ARCHIVE_PATH = 'database/catalogue.sqlite'
const MANIFEST_PATH = 'manifest.json'
const MAX_MANIFEST_BYTES = 1024 * 1024
const MAX_ARCHIVE_ENTRIES = 500_000

export interface ArchiveFileRecord {
  path: string
  role: 'database' | 'original-media'
  size: number
  sha256: string
}

export interface ArchiveManifest {
  archiveFormatVersion: 1
  applicationVersion: string
  createdAt: string
  library: { id: string; sourceFolderName: string }
  originatingInstallation: { id: string; name: string | null }
  database: { path: typeof DATABASE_ARCHIVE_PATH; schemaVersion: number }
  compatibility: { minimumArchiveFormatVersion: 1; maximumSchemaVersion: number }
  files: ArchiveFileRecord[]
  excluded: ['cache/thumbnails']
}

export interface IndexedArchive {
  manifest: ArchiveManifest
  entries: Map<string, { size: number; directory: boolean }>
}

type ProgressReporter = (progress: ArchiveProgress) => void

function report(reporter: ProgressReporter | undefined, operation: ArchiveProgress['operation'], stage: ArchiveProgress['stage'], completed?: number, total?: number): void {
  reporter?.({ operation, stage, completed, total })
}

function archivePath(value: string): string {
  const path = value.endsWith('/') ? value.slice(0, -1) : value
  if (!path || value.length > 1024 || value.includes('\0') || value.includes('\\') || value.startsWith('/') || /^[A-Za-z]:/.test(value) || isAbsolute(value)) throw new Error('Archive contains an unsafe path.')
  const segments = path.split('/')
  if (segments.some(segment => !segment || segment === '.' || segment === '..')) throw new Error('Archive contains an unsafe path.')
  return path
}

function ownedPath(root: string, relativePath: string): string {
  const safe = archivePath(relativePath), absoluteRoot = resolve(root), target = resolve(absoluteRoot, ...safe.split('/')), child = relative(absoluteRoot, target)
  if (!child || child.startsWith('..') || isAbsolute(child)) throw new Error('Archive contains an unsafe path.')
  return target
}

function libraryOriginalPath(root: string, relativePath: string): string {
  const safe = archivePath(relativePath)
  if (!safe.startsWith('media/originals/')) throw new Error('The catalogue contains an invalid original-media path.')
  return ownedPath(root, safe)
}

async function fileDigest(path: string): Promise<{ size: number; sha256: string }> {
  const hash = createHash('sha256')
  let size = 0
  for await (const chunk of createReadStream(path)) {
    const buffer = chunk as Buffer
    size += buffer.length
    hash.update(buffer)
  }
  return { size, sha256: hash.digest('hex') }
}

function assertHealthyDatabase(db: DatabaseSync): void {
  const integrity = db.prepare('PRAGMA integrity_check').all()
  if (integrity.length !== 1 || String(integrity[0].integrity_check) !== 'ok') throw new Error('The archive database failed its SQLite integrity check.')
  if (db.prepare('PRAGMA foreign_key_check').all().length) throw new Error('The archive database contains broken relationships.')
}

function schemaVersion(db: DatabaseSync): number {
  if (!db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='schema_migrations'").get()) throw new Error('The archive database is not a Cards Under Glass catalogue.')
  const rows = db.prepare('SELECT version FROM schema_migrations ORDER BY version').all()
  if (!rows.length || rows.some((row, index) => Number(row.version) !== index + 1)) throw new Error('The archive database has an invalid migration history.')
  const version = Number(rows.at(-1)!.version)
  if (version > migrations.length) throw new Error('This archive uses a newer unsupported database schema.')
  return version
}

async function snapshotDescription(snapshotPath: string, libraryFolder: string, installationId: string): Promise<{ libraryId: string; installationName: string | null; version: number; media: { archivePath: string; sourcePath: string }[] }> {
  const db = new DatabaseSync(snapshotPath, { readOnly: true })
  try {
    assertHealthyDatabase(db)
    const version = schemaVersion(db)
    const metadata = db.prepare('SELECT libraryId FROM library_metadata WHERE singleton=1').get()
    if (!metadata || typeof metadata.libraryId !== 'string') throw new Error('The library identity is missing.')
    const installation = db.prepare('SELECT name FROM installations WHERE id=?').get(installationId)
    const rows = db.prepare('SELECT originalRelativePath FROM photos ORDER BY originalRelativePath').all()
    const seen = new Set<string>()
    const media = rows.map(row => {
      const path = archivePath(String(row.originalRelativePath))
      if (seen.has(path)) throw new Error('The catalogue contains duplicate original-media paths.')
      seen.add(path)
      const sourcePath = libraryOriginalPath(libraryFolder, path)
      if (!existsSync(sourcePath) || !statSync(sourcePath).isFile()) throw new Error(`The original photo required by the catalogue is missing: ${path}`)
      return { archivePath: path, sourcePath }
    })
    return { libraryId: String(metadata.libraryId), installationName: installation ? String(installation.name) : null, version, media }
  } finally { db.close() }
}

async function writeZip(destination: string, manifest: ArchiveManifest, sources: Map<string, string>): Promise<void> {
  mkdirSync(dirname(destination), { recursive: true })
  const temporary = join(dirname(destination), `.${basename(destination)}.${randomUUID()}.tmp`)
  const previous = join(dirname(destination), `.${basename(destination)}.${randomUUID()}.previous`)
  const zip = new ZipWriter()
  const output = createWriteStream(temporary, { flags: 'wx', mode: 0o600 })
  const completed = pipeline(zip.outputStream as Readable, output)
  let movedPrevious = false
  try {
    zip.addBuffer(Buffer.from(`${JSON.stringify(manifest, null, 2)}\n`), MANIFEST_PATH, { compress: true })
    for (const file of manifest.files) zip.addFile(sources.get(file.path)!, file.path, { compress: file.role === 'database' })
    zip.end()
    await completed
    if (existsSync(destination) && !lstatSync(destination).isFile()) throw new Error('The archive destination must be a file.')
    if (existsSync(destination)) { renameSync(destination, previous); movedPrevious = true }
    renameSync(temporary, destination)
    if (movedPrevious) rmSync(previous, { force: true })
  } catch (error) {
    output.destroy()
    rmSync(temporary, { force: true })
    if (movedPrevious && !existsSync(destination)) renameSync(previous, destination)
    throw error
  }
}

export async function createLibraryArchive(library: Library, destination: string, applicationVersion: string, reporter?: ProgressReporter): Promise<ArchiveManifest> {
  const staging = mkdtempSync(join(tmpdir(), 'cug-archive-'))
  const snapshot = join(staging, 'catalogue.sqlite')
  try {
    report(reporter, 'create', 'preparing')
    await library.snapshot(snapshot)
    report(reporter, 'create', 'database')
    const description = await snapshotDescription(snapshot, library.folder, library.installationId)
    const files: ArchiveFileRecord[] = []
    const sources = new Map<string, string>([[DATABASE_ARCHIVE_PATH, snapshot]])
    const databaseDigest = await fileDigest(snapshot)
    files.push({ path: DATABASE_ARCHIVE_PATH, role: 'database', ...databaseDigest })
    for (let index = 0; index < description.media.length; index++) {
      const media = description.media[index]
      report(reporter, 'create', 'photos', index, description.media.length)
      const digest = await fileDigest(media.sourcePath)
      files.push({ path: media.archivePath, role: 'original-media', ...digest })
      sources.set(media.archivePath, media.sourcePath)
    }
    report(reporter, 'create', 'photos', description.media.length, description.media.length)
    const manifest: ArchiveManifest = {
      archiveFormatVersion: ARCHIVE_FORMAT_VERSION,
      applicationVersion,
      createdAt: new Date().toISOString(),
      library: { id: description.libraryId, sourceFolderName: basename(library.folder) },
      originatingInstallation: { id: library.installationId, name: description.installationName },
      database: { path: DATABASE_ARCHIVE_PATH, schemaVersion: description.version },
      compatibility: { minimumArchiveFormatVersion: 1, maximumSchemaVersion: migrations.length },
      files,
      excluded: ['cache/thumbnails']
    }
    report(reporter, 'create', 'finalizing')
    await writeZip(destination, manifest, sources)
    report(reporter, 'create', 'complete', files.length, files.length)
    return manifest
  } catch (error) {
    throw error instanceof Error ? error : new Error('Library archive creation failed.')
  } finally { rmSync(staging, { recursive: true, force: true }) }
}

function openArchive(path: string): Promise<ZipReader> {
  return new Promise((resolvePromise, reject) => openZip(path, { lazyEntries: true, autoClose: false, decodeStrings: true, validateEntrySizes: true, strictFileNames: true }, (error, zip) => error || !zip ? reject(error ?? new Error('Invalid ZIP archive.')) : resolvePromise(zip)))
}

async function entryBuffer(zip: ZipReader, entry: Entry, maximum: number): Promise<Buffer> {
  if (entry.uncompressedSize > maximum) throw new Error('Archive manifest is too large.')
  const stream = await new Promise<Readable>((resolvePromise, reject) => zip.openReadStream(entry, (error, opened) => error || !opened ? reject(error ?? new Error('Could not read archive entry.')) : resolvePromise(opened)))
  const chunks: Buffer[] = []
  let size = 0
  for await (const chunk of stream) {
    const buffer = chunk as Buffer
    size += buffer.length
    if (size > maximum) throw new Error('Archive manifest is too large.')
    chunks.push(buffer)
  }
  return Buffer.concat(chunks)
}

function fileType(entry: Entry): number { return (entry.externalFileAttributes >>> 16) & 0o170000 }

function validateEntry(entry: Entry): { path: string; directory: boolean } {
  const path = archivePath(entry.fileName)
  const directory = entry.fileName.endsWith('/')
  const type = fileType(entry)
  if (entry.isEncrypted() || !entry.canDecodeFileData()) throw new Error('Archive contains an unsupported or encrypted entry.')
  if (type && type !== 0o100000 && type !== 0o040000) throw new Error('Archive contains an unsupported filesystem entry.')
  if ((type === 0o040000) !== directory && type !== 0) throw new Error('Archive contains an invalid directory entry.')
  return { path, directory }
}

function manifestInput(value: unknown): ArchiveManifest {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('Archive manifest is invalid.')
  const manifest = value as Partial<ArchiveManifest>
  if (manifest.archiveFormatVersion !== ARCHIVE_FORMAT_VERSION) throw new Error('This archive format version is not supported.')
  if (typeof manifest.applicationVersion !== 'string' || !manifest.applicationVersion || typeof manifest.createdAt !== 'string' || !Number.isFinite(Date.parse(manifest.createdAt))) throw new Error('Archive manifest is invalid.')
  if (!manifest.library || typeof manifest.library.id !== 'string' || !/^[0-9a-f-]{36}$/i.test(manifest.library.id) || typeof manifest.library.sourceFolderName !== 'string') throw new Error('Archive manifest library identity is invalid.')
  if (!manifest.originatingInstallation || typeof manifest.originatingInstallation.id !== 'string' || manifest.originatingInstallation.id.length < 1 || manifest.originatingInstallation.id.length > 100 || (manifest.originatingInstallation.name !== null && typeof manifest.originatingInstallation.name !== 'string')) throw new Error('Archive manifest installation identity is invalid.')
  if (!manifest.database || manifest.database.path !== DATABASE_ARCHIVE_PATH || !Number.isSafeInteger(manifest.database.schemaVersion) || manifest.database.schemaVersion! < 1 || manifest.database.schemaVersion! > migrations.length) throw new Error('Archive database version is not supported.')
  if (!manifest.compatibility || manifest.compatibility.minimumArchiveFormatVersion !== 1 || !Number.isSafeInteger(manifest.compatibility.maximumSchemaVersion) || manifest.compatibility.maximumSchemaVersion! < manifest.database.schemaVersion!) throw new Error('Archive compatibility information is invalid.')
  if (!Array.isArray(manifest.files) || !manifest.files.length || !Array.isArray(manifest.excluded) || manifest.excluded.length !== 1 || manifest.excluded[0] !== 'cache/thumbnails') throw new Error('Archive contents manifest is invalid.')
  const seen = new Set<string>()
  for (const file of manifest.files) {
    if (!file || typeof file !== 'object') throw new Error('Archive contents manifest is invalid.')
    const path = archivePath(file.path)
    if (path === MANIFEST_PATH || seen.has(path) || (file.role !== 'database' && file.role !== 'original-media') || !Number.isSafeInteger(file.size) || file.size < 0 || typeof file.sha256 !== 'string' || !/^[0-9a-f]{64}$/.test(file.sha256)) throw new Error('Archive contents manifest is invalid.')
    if ((file.role === 'database') !== (path === DATABASE_ARCHIVE_PATH) || (file.role === 'original-media' && !path.startsWith('media/originals/'))) throw new Error('Archive contents manifest is invalid.')
    seen.add(path)
  }
  if (manifest.files.filter(file => file.role === 'database').length !== 1) throw new Error('Archive database entry is missing.')
  return manifest as ArchiveManifest
}

export async function inspectLibraryArchive(path: string): Promise<IndexedArchive> {
  if (!existsSync(path) || !statSync(path).isFile()) throw new Error('Choose a valid .cug archive file.')
  let zip: ZipReader | undefined
  try {
    zip = await openArchive(path)
    const entries = new Map<string, { size: number; directory: boolean }>()
    let manifest: ArchiveManifest | undefined
    let count = 0
    for await (const entry of zip.eachEntry()) {
      if (++count > MAX_ARCHIVE_ENTRIES) throw new Error('Archive contains too many entries.')
      const valid = validateEntry(entry)
      if (entries.has(valid.path)) throw new Error('Archive contains duplicate paths.')
      entries.set(valid.path, { size: entry.uncompressedSize, directory: valid.directory })
      if (valid.path === MANIFEST_PATH && !valid.directory) {
        try { manifest = manifestInput(JSON.parse((await entryBuffer(zip, entry, MAX_MANIFEST_BYTES)).toString('utf8')) as unknown) }
        catch (error) { if (error instanceof SyntaxError) throw new Error('Archive manifest is not valid JSON.'); throw error }
      }
    }
    if (!manifest) throw new Error('Archive manifest is missing.')
    const expected = new Map(manifest.files.map(file => [file.path, file]))
    const expectedDirectories = new Set<string>()
    for (const path of expected.keys()) {
      const segments = path.split('/')
      for (let index = 1; index < segments.length; index++) expectedDirectories.add(segments.slice(0, index).join('/'))
    }
    for (const [entryPath, entry] of entries) {
      if (entryPath === MANIFEST_PATH) continue
      if (entry.directory) {
        if (!expectedDirectories.has(entryPath)) throw new Error('Archive contains an unexpected directory.')
      } else {
        const declared = expected.get(entryPath)
        if (!declared || declared.size !== entry.size) throw new Error('Archive contents do not match the manifest.')
      }
    }
    for (const file of manifest.files) if (!entries.get(file.path) || entries.get(file.path)!.directory) throw new Error(`Archive is missing required content: ${file.path}`)
    return { manifest, entries }
  } catch (error) {
    if (error instanceof Error && /Archive|archive|ZIP|zip/.test(error.message)) throw error
    throw new Error('The selected file is not a valid Cards Under Glass archive.')
  } finally { zip?.close() }
}

async function extractAndVerify(archive: string, staging: string, indexed: IndexedArchive, reporter?: ProgressReporter): Promise<void> {
  const expected = new Map(indexed.manifest.files.map(file => [file.path, file]))
  let zip: ZipReader | undefined
  let completed = 0
  try {
    zip = await openArchive(archive)
    for await (const entry of zip.eachEntry()) {
      const valid = validateEntry(entry)
      if (valid.directory || valid.path === MANIFEST_PATH) continue
      const declared = expected.get(valid.path)
      if (!declared) throw new Error('Archive contains undeclared content.')
      const target = ownedPath(staging, valid.path)
      mkdirSync(dirname(target), { recursive: true })
      const hash = createHash('sha256')
      let size = 0
      const meter = new Transform({ transform(chunk: Buffer, _encoding, callback) { size += chunk.length; hash.update(chunk); callback(null, chunk) } })
      const stream = await new Promise<Readable>((resolvePromise, reject) => zip!.openReadStream(entry, (error, opened) => error || !opened ? reject(error ?? new Error('Could not extract archive entry.')) : resolvePromise(opened)))
      await pipeline(stream, meter, createWriteStream(target, { flags: 'wx', mode: 0o600 }))
      if (size !== declared.size || hash.digest('hex') !== declared.sha256) throw new Error(`Archive checksum validation failed: ${valid.path}`)
      completed++
      report(reporter, 'restore', declared.role === 'database' ? 'database' : 'photos', completed, expected.size)
    }
  } finally { zip?.close() }
}

function verifyRestoredDatabase(staging: string, manifest: ArchiveManifest): void {
  const path = ownedPath(staging, DATABASE_ARCHIVE_PATH)
  let db: DatabaseSync | undefined
  try {
    db = new DatabaseSync(path, { readOnly: true })
    assertHealthyDatabase(db)
    const version = schemaVersion(db)
    if (version !== manifest.database.schemaVersion) throw new Error('Archive database version does not match its manifest.')
    const metadata = db.prepare('SELECT libraryId FROM library_metadata WHERE singleton=1').get()
    if (!metadata || String(metadata.libraryId) !== manifest.library.id) throw new Error('Archive library identity does not match its database.')
    const installation = db.prepare('SELECT id,name FROM installations WHERE id=?').get(manifest.originatingInstallation.id)
    if ((manifest.originatingInstallation.name === null) !== !installation || (installation && String(installation.name) !== manifest.originatingInstallation.name)) throw new Error('Archive installation identity does not match its database.')
    const databaseOriginals = new Set(db.prepare('SELECT originalRelativePath FROM photos').all().map(row => archivePath(String(row.originalRelativePath))))
    const archivedOriginals = new Set(manifest.files.filter(file => file.role === 'original-media').map(file => file.path))
    if (databaseOriginals.size !== archivedOriginals.size || [...databaseOriginals].some(path => !archivedOriginals.has(path))) throw new Error('Archive photo records do not match its original media.')
    for (const original of databaseOriginals) if (!existsSync(libraryOriginalPath(staging, original))) throw new Error(`Archive is missing required original media: ${original}`)
  } catch (error) {
    if (error instanceof Error && error.message.startsWith('Archive')) throw error
    throw new Error('The archive database could not be opened or is corrupt.')
  } finally { db?.close() }
}

export function assertEmptyRestoreDestination(destination: string): void {
  if (existsSync(destination)) {
    const stat = lstatSync(destination)
    if (!stat.isDirectory() || stat.isSymbolicLink() || readdirSync(destination).length) throw new Error('Choose a new or empty folder for the restored library.')
  } else if (!existsSync(dirname(destination)) || !statSync(dirname(destination)).isDirectory()) throw new Error('The restore destination parent folder does not exist.')
}

export async function restoreLibraryArchive(archive: string, destination: string, reporter?: ProgressReporter): Promise<ArchiveManifest> {
  report(reporter, 'restore', 'validating')
  const indexed = await inspectLibraryArchive(archive)
  assertEmptyRestoreDestination(destination)
  const parent = dirname(resolve(destination)), staging = mkdtempSync(join(parent, `.${basename(destination)}.cug-restore-`))
  let committed = false
  try {
    report(reporter, 'restore', 'extracting', 0, indexed.manifest.files.length)
    await extractAndVerify(archive, staging, indexed, reporter)
    verifyRestoredDatabase(staging, indexed.manifest)
    const archivedDatabase = ownedPath(staging, DATABASE_ARCHIVE_PATH)
    renameSync(archivedDatabase, join(staging, 'catalogue.sqlite'))
    rmSync(join(staging, 'database'), { recursive: true, force: true })
    mkdirSync(join(staging, 'media/originals'), { recursive: true })
    mkdirSync(join(staging, 'cache/thumbnails'), { recursive: true })
    assertEmptyRestoreDestination(destination)
    if (existsSync(destination)) rmSync(destination, { recursive: true })
    renameSync(staging, destination)
    committed = true
    report(reporter, 'restore', 'complete', indexed.manifest.files.length, indexed.manifest.files.length)
    return indexed.manifest
  } finally {
    if (!committed) {
      rmSync(staging, { recursive: true, force: true })
    }
  }
}
