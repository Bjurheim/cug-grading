import { backup, DatabaseSync } from 'node:sqlite'
import { randomUUID } from 'node:crypto'
import { constants, copyFileSync, existsSync, mkdirSync, readdirSync, renameSync, rmSync, statSync } from 'node:fs'
import { basename, extname, isAbsolute, join, relative, resolve } from 'node:path'
import { migrate } from './migrations'
import {
  fields, gradeFields, measurementFields, noteFields, PAGE_SIZE, serialText,
  type Allocation, type Card, type CardDetail, type DefectMarker, type GradeField,
  photoSlots, type Inspection, type InspectionSave, type LibraryInfo, type MeasurementField,
  type Metadata, type NoteField, type Page, type Photo, type PrimaryPhotoSlot, type Setup
} from '../shared/contracts'
import { missingFinalizationFields } from '../shared/inspection'
import type { PublicCardSource, PublicInspectionSource, PublicMarkerSource, PublicPhotoSource } from './public-model'
export const MAX_SERIAL = 9_999_999_999
export function validateSetup(value: unknown): asserts value is Setup {
  if (!value || typeof value !== 'object') throw new Error('Invalid allocation settings.')
  const s = value as Setup
  if (typeof s.name !== 'string' || !s.name.trim() || s.name.length > 200) throw new Error('Enter a workstation name (up to 200 characters).')
  if (![s.start, s.end, s.next].every(n => Number.isSafeInteger(n) && n >= 1 && n <= MAX_SERIAL)) throw new Error('Serial values must be whole numbers from 1 to 9999999999.')
  if (s.start > s.end || s.next < s.start || s.next > s.end) throw new Error('Next serial must be inside the allocation range.')
}
function metadataInput(value: unknown): Metadata {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('Invalid metadata.')
  const input = value as Record<string, unknown>
  if (Object.keys(input).some(k => !Object.hasOwn(fields, k))) throw new Error('Unsupported metadata field.')
  const result = {} as Metadata
  for (const key of Object.keys(fields) as (keyof Metadata)[]) {
    const v = input[key]
    if (v !== null && (typeof v !== 'string' || v.length > 20000)) throw new Error('Metadata must be text of at most 20,000 characters per field.')
    result[key] = typeof v === 'string' && v.trim() !== '' ? v : null
  }
  return result
}
const inspectionKeys = [...Object.keys(gradeFields), ...Object.keys(measurementFields), ...Object.keys(noteFields)] as (GradeField | MeasurementField | NoteField)[]
const assessmentKeys = [...Object.keys(gradeFields), ...Object.keys(measurementFields)] as (GradeField | MeasurementField)[]
const supportedPhotoExtensions = new Map([
  ['.jpg', { extension: 'jpg', mimeType: 'image/jpeg' }],
  ['.jpeg', { extension: 'jpg', mimeType: 'image/jpeg' }],
  ['.png', { extension: 'png', mimeType: 'image/png' }],
  ['.webp', { extension: 'webp', mimeType: 'image/webp' }]
])
const MAX_PHOTO_BYTES = 250 * 1024 * 1024
export type ThumbnailWriter = (sourcePath: string, destinationPath: string) => Promise<void>
interface PhotoRow {
  id: string; cardId: string; slot: PrimaryPhotoSlot | null; title: string | null; locked: number
  originalRelativePath: string; thumbnailRelativePath: string; originalFilename: string; mimeType: string
  createdAt: string; updatedAt: string
}

export function validatePhotoSlot(value: unknown): asserts value is PrimaryPhotoSlot | null {
  if (value !== null && (typeof value !== 'string' || !Object.hasOwn(photoSlots, value))) throw new Error('Invalid primary photo slot.')
}

function inspectionInput(value: unknown): Omit<Inspection, 'cardId' | 'assessmentRevision'> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('Invalid inspection data.')
  const input = value as Record<string, unknown>
  const allowed = new Set([...inspectionKeys, 'cardId', 'assessmentRevision'])
  if (Object.keys(input).some(key => !allowed.has(key))) throw new Error('Unsupported inspection field.')
  const result = {} as Omit<Inspection, 'cardId' | 'assessmentRevision'>
  for (const key of Object.keys(gradeFields) as GradeField[]) {
    const field = input[key]
    if (field !== null && (!Number.isSafeInteger(field) || Number(field) < 0 || Number(field) > 100)) throw new Error(`${gradeFields[key]} must be from 0.0 to 10.0 with at most one decimal place.`)
    result[key] = field as number | null
  }
  for (const key of Object.keys(measurementFields) as MeasurementField[]) {
    const field = input[key]
    if (field !== null && (!Number.isSafeInteger(field) || Number(field) < 0)) throw new Error(`${measurementFields[key]} must be non-negative with at most two decimal places.`)
    result[key] = field as number | null
  }
  for (const key of Object.keys(noteFields) as NoteField[]) {
    const field = input[key]
    if (field !== null && (typeof field !== 'string' || field.length > 20000)) throw new Error('Inspection notes must be text of at most 20,000 characters.')
    result[key] = typeof field === 'string' && field.trim() ? field : null
  }
  return result
}

function validateId(value: unknown, label = 'Card'): asserts value is string {
  if (typeof value !== 'string' || value.length < 1 || value.length > 100) throw new Error(`Invalid ${label.toLowerCase()}.`)
}
export class Library {
  private db: DatabaseSync
  constructor(readonly folder: string, readonly installationId: string, create = false, private readonly writeThumbnail?: ThumbnailWriter) {
    if (create) {
      mkdirSync(folder, { recursive: true })
      if (readdirSync(folder).length) throw new Error('Choose an empty folder for a new library.')
    } else if (!existsSync(join(folder, 'catalogue.sqlite'))) throw new Error('No Cards Under Glass library found in this folder.')
    this.db = new DatabaseSync(join(folder, 'catalogue.sqlite'))
    try {
      this.db.exec('PRAGMA foreign_keys=ON; PRAGMA busy_timeout=5000;')
      // Refuse unrelated SQLite databases before writing application tables.
      if (!create && !this.db.prepare("SELECT name FROM sqlite_master WHERE name='schema_migrations'").get()) throw new Error('This is not a Cards Under Glass catalogue.')
      migrate(this.db)
      this.db.exec('PRAGMA journal_mode=WAL; PRAGMA synchronous=FULL;')
      for (const dir of ['media/originals', 'cache/thumbnails']) mkdirSync(join(folder, dir), { recursive: true })
    } catch (e) { this.db.close(); throw e }
  }
  private transaction<T>(fn: () => T): T {
    this.db.exec('BEGIN IMMEDIATE')
    try { const result = fn(); this.db.exec('COMMIT'); return result }
    catch (e) { this.db.exec('ROLLBACK'); throw e }
  }
  private ownedPath(relativePath: string): string {
    const root = resolve(this.folder), target = resolve(root, relativePath), child = relative(root, target)
    if (!child || child.startsWith('..') || isAbsolute(child)) throw new Error('Invalid library media path.')
    return target
  }
  private mediaSegment(value: string): string {
    if (!/^[A-Za-z0-9_-]{1,100}$/.test(value)) throw new Error('Invalid media identifier.')
    return value
  }
  private photo(row: PhotoRow): Photo {
    const markerIds = this.db.prepare('SELECT markerId FROM photo_defect_markers WHERE photoId=? ORDER BY markerId').all(row.id).map(link => String(link.markerId))
    return { ...row, locked: row.locked === 1, markerIds }
  }
  private photos(cardId: string): Photo[] {
    const rows = this.db.prepare('SELECT * FROM photos WHERE cardId=? ORDER BY createdAt,id').all(cardId) as unknown as PhotoRow[]
    return rows.map(row => this.photo(row))
  }
  private marker(id: string): DefectMarker {
    const marker = this.db.prepare(`SELECT defect_markers.*,
      (SELECT count(*) FROM photo_defect_markers WHERE markerId=defect_markers.id) AS linkedPhotoCount
      FROM defect_markers WHERE id=?`).get(id)
    if (!marker) throw new Error('Defect marker not found.')
    return marker as unknown as DefectMarker
  }
  info(): LibraryInfo {
    const metadata = this.db.prepare('SELECT libraryId FROM library_metadata WHERE singleton=1').get()
    if (!metadata) throw new Error('Library identity is missing.')
    const installation = this.db.prepare('SELECT name FROM installations WHERE id=?').get(this.installationId)
    const history = this.db.prepare('SELECT id,start,end,next,retiredAt FROM allocations WHERE installationId=? ORDER BY rowid DESC').all(this.installationId) as unknown as Allocation[]
    return { folder: this.folder, libraryId: String(metadata.libraryId), installationName: installation?.name as string ?? '', allocation: history.find(a => !a.retiredAt) ?? null, history }
  }
  configure(value: unknown): LibraryInfo {
    validateSetup(value)
    return this.transaction(() => {
      const current = this.info().allocation
      if (this.db.prepare('SELECT serial FROM serial_reservations WHERE serial=?').get(serialText(value.next))) throw new Error('That next serial was already assigned and is permanently reserved. Choose an unused serial.')
      if (this.db.prepare(`SELECT id FROM allocations WHERE installationId<>? AND start<=? AND end>=?`).get(this.installationId, value.end, value.start)) throw new Error('This range overlaps another installation’s allocation in this library.')
      this.db.prepare('INSERT INTO installations VALUES (?,?) ON CONFLICT(id) DO UPDATE SET name=excluded.name').run(this.installationId, value.name.trim())
      if (current && current.start === value.start && current.end === value.end) {
        this.db.prepare('UPDATE allocations SET next=? WHERE id=?').run(value.next, current.id)
      } else {
        if (current) this.db.prepare('UPDATE allocations SET retiredAt=? WHERE id=?').run(new Date().toISOString(), current.id)
        this.db.prepare('INSERT INTO allocations VALUES (?,?,?,?,?,NULL)').run(randomUUID(), this.installationId, value.start, value.end, value.next)
      }
      return this.info()
    })
  }
  create(): CardDetail {
    return this.transaction(() => {
      const allocation = this.info().allocation
      if (!allocation) throw new Error('Configure this workstation’s serial allocation first.')
      // Walk only the occupied contiguous run, not the whole numeric range.
      let next = allocation.next
      const occupied = this.db.prepare('SELECT serial FROM serial_reservations WHERE serial>=? AND serial<=? ORDER BY serial').iterate(serialText(next), serialText(allocation.end))
      for (const row of occupied) { if (Number(row.serial) !== next) break; next++ }
      if (next > allocation.end) throw new Error('This serial allocation is exhausted. Configure a new range in settings.')
      const id = randomUUID(), now = new Date().toISOString()
      this.db.prepare('INSERT INTO serial_reservations(serial,allocationId,originalCardId,assignedAt) VALUES (?,?,?,?)').run(serialText(next), allocation.id, id, now)
      this.db.prepare('INSERT INTO cards(id,serial,allocationId,createdAt,updatedAt) VALUES (?,?,?,?,?)').run(id, serialText(next), allocation.id, now, now)
      this.db.prepare('INSERT INTO inspections(cardId) VALUES (?)').run(id)
      this.db.prepare('UPDATE allocations SET next=? WHERE id=?').run(next + 1, allocation.id)
      return this.get(id)
    })
  }
  private card(id: string): Card {
    const row = this.db.prepare('SELECT cards.*,inspections.assessmentRevision,inspections.estimatedGrade FROM cards JOIN inspections ON inspections.cardId=cards.id WHERE cards.id=?').get(id)
    if (!row) throw new Error('Card not found.')
    const finalizationState = row.status !== 'finalized' ? 'in_progress' : row.finalizedAssessmentRevision === row.assessmentRevision ? 'finalized' : 'changes_pending'
    return { ...row, includePublic: row.includePublic === 1, finalizationState } as unknown as Card
  }
  get(id: unknown): CardDetail {
    validateId(id)
    const inspection = this.db.prepare('SELECT * FROM inspections WHERE cardId=?').get(id)
    if (!inspection) throw new Error('Card not found.')
    const markers = this.db.prepare(`SELECT defect_markers.*,
      (SELECT count(*) FROM photo_defect_markers WHERE markerId=defect_markers.id) AS linkedPhotoCount
      FROM defect_markers WHERE cardId=? ORDER BY createdAt,defect_markers.rowid`).all(id) as unknown as DefectMarker[]
    return { card: this.card(id), inspection: inspection as unknown as Inspection, markers, photos: this.photos(id) }
  }
  list(offset: unknown): Page {
    if (typeof offset !== 'number' || !Number.isSafeInteger(offset) || offset < 0) throw new Error('Invalid page.')
    const rows = this.db.prepare('SELECT cards.*,inspections.assessmentRevision,inspections.estimatedGrade FROM cards JOIN inspections ON inspections.cardId=cards.id ORDER BY cards.serial DESC LIMIT ? OFFSET ?').all(PAGE_SIZE, offset)
    const cards = rows.map(row => ({
      ...row,
      includePublic: row.includePublic === 1,
      finalizationState: row.status !== 'finalized' ? 'in_progress' : row.finalizedAssessmentRevision === row.assessmentRevision ? 'finalized' : 'changes_pending'
    })) as unknown as Card[]
    return { cards, total: Number(this.db.prepare('SELECT count(*) AS total FROM cards').get()!.total) }
  }
  publicSiteCards(): PublicCardSource[] {
    const rows = this.db.prepare(`SELECT
      cards.id, cards.serial, cards.game, cards.setName, cards.cardName, cards.cardNumber,
      cards.year, cards.language, cards.variant, cards.rarity, cards.manufacturer,
      inspections.centeringGrade, inspections.cornersGrade, inspections.edgesGrade,
      inspections.surfaceGrade, inspections.estimatedGrade,
      inspections.verticalLeftTop, inspections.verticalLeftBottom,
      inspections.verticalRightTop, inspections.verticalRightBottom,
      inspections.horizontalUpperLeft, inspections.horizontalUpperRight,
      inspections.horizontalLowerLeft, inspections.horizontalLowerRight,
      inspections.centeringNote, inspections.cornersNote, inspections.edgesNote, inspections.surfaceNote
      FROM cards JOIN inspections ON inspections.cardId=cards.id
      WHERE cards.status='finalized' AND cards.includePublic=1
        AND cards.finalizedAssessmentRevision=inspections.assessmentRevision
      ORDER BY cards.serial DESC`).all() as Record<string, unknown>[]
    return rows.map(row => {
      const cardId = String(row.id)
      const markers = this.db.prepare('SELECT id,side,x,y,note FROM defect_markers WHERE cardId=? ORDER BY createdAt,rowid').all(cardId).map(marker => ({
        sourceId: String(marker.id), side: marker.side as 'front' | 'back', x: Number(marker.x), y: Number(marker.y), note: marker.note === null ? null : String(marker.note)
      })) satisfies PublicMarkerSource[]
      const photoRows = this.db.prepare(`SELECT photos.* FROM photos WHERE photos.cardId=? AND (
        photos.slot IS NOT NULL OR EXISTS (SELECT 1 FROM photo_defect_markers WHERE photoId=photos.id)
      ) ORDER BY photos.createdAt,photos.id`).all(cardId) as unknown as PhotoRow[]
      const photos = photoRows.map(photo => ({
        sourceId: photo.id, slot: photo.slot, title: photo.title, originalFilename: photo.originalFilename,
        sourcePath: this.ownedPath(photo.originalRelativePath), createdAt: photo.createdAt,
        markerSourceIds: this.db.prepare('SELECT markerId FROM photo_defect_markers WHERE photoId=? ORDER BY markerId').all(photo.id).map(link => String(link.markerId))
      })) satisfies PublicPhotoSource[]
      const inspection = {
        centeringGrade: Number(row.centeringGrade), cornersGrade: Number(row.cornersGrade), edgesGrade: Number(row.edgesGrade),
        surfaceGrade: Number(row.surfaceGrade), estimatedGrade: Number(row.estimatedGrade),
        verticalLeftTop: Number(row.verticalLeftTop), verticalLeftBottom: Number(row.verticalLeftBottom),
        verticalRightTop: Number(row.verticalRightTop), verticalRightBottom: Number(row.verticalRightBottom),
        horizontalUpperLeft: Number(row.horizontalUpperLeft), horizontalUpperRight: Number(row.horizontalUpperRight),
        horizontalLowerLeft: Number(row.horizontalLowerLeft), horizontalLowerRight: Number(row.horizontalLowerRight),
        centeringNote: row.centeringNote === null ? null : String(row.centeringNote),
        cornersNote: row.cornersNote === null ? null : String(row.cornersNote),
        edgesNote: row.edgesNote === null ? null : String(row.edgesNote),
        surfaceNote: row.surfaceNote === null ? null : String(row.surfaceNote)
      } satisfies PublicInspectionSource
      return {
        serial: String(row.serial), game: row.game === null ? null : String(row.game), setName: row.setName === null ? null : String(row.setName),
        cardName: row.cardName === null ? null : String(row.cardName), cardNumber: row.cardNumber === null ? null : String(row.cardNumber),
        year: row.year === null ? null : String(row.year), language: row.language === null ? null : String(row.language),
        variant: row.variant === null ? null : String(row.variant), rarity: row.rarity === null ? null : String(row.rarity),
        manufacturer: row.manufacturer === null ? null : String(row.manufacturer), inspection, markers, photos
      }
    })
  }
  save(id: unknown, revision: unknown, value: unknown): Card {
    validateId(id)
    if (!Number.isSafeInteger(revision)) throw new Error('Invalid card update.')
    const metadata = metadataInput(value)
    const keys = Object.keys(fields) as (keyof Metadata)[]
    const result = this.db.prepare(`UPDATE cards SET ${keys.map(k => `${k}=?`).join(',')}, updatedAt=?,revision=revision+1 WHERE id=? AND revision=?`).run(...keys.map(k => metadata[k]), new Date().toISOString(), id, revision as number)
    if (result.changes !== 1) throw new Error('This card changed elsewhere or is missing. Your edits are still here; reopen the library before editing further.')
    return this.card(id)
  }
  saveInspection(id: unknown, revision: unknown, value: unknown): InspectionSave {
    validateId(id)
    if (!Number.isSafeInteger(revision)) throw new Error('Invalid inspection update.')
    const next = inspectionInput(value)
    return this.transaction(() => {
      const current = this.db.prepare('SELECT * FROM inspections WHERE cardId=?').get(id) as unknown as Inspection | undefined
      if (!current) throw new Error('Card not found.')
      const requiredChanged = assessmentKeys.some(key => current[key] !== next[key])
      const values = inspectionKeys.map(key => next[key])
      const updated = this.db.prepare(`UPDATE inspections SET ${inspectionKeys.map(key => `${key}=?`).join(',')},assessmentRevision=assessmentRevision+? WHERE cardId=?`).run(...values, requiredChanged ? 1 : 0, id)
      if (updated.changes !== 1) throw new Error('Card not found.')
      const cardUpdated = this.db.prepare('UPDATE cards SET updatedAt=?,revision=revision+1 WHERE id=? AND revision=?').run(new Date().toISOString(), id, revision as number)
      if (cardUpdated.changes !== 1) throw new Error('This card changed elsewhere or is missing. Your edits are still here; reopen the library before editing further.')
      return { card: this.card(id), inspection: this.db.prepare('SELECT * FROM inspections WHERE cardId=?').get(id) as unknown as Inspection }
    })
  }
  setIncludePublic(id: unknown, revision: unknown, include: unknown): Card {
    validateId(id)
    if (!Number.isSafeInteger(revision) || typeof include !== 'boolean') throw new Error('Invalid public-site setting.')
    const result = this.db.prepare('UPDATE cards SET includePublic=?,updatedAt=?,revision=revision+1 WHERE id=? AND revision=?').run(include ? 1 : 0, new Date().toISOString(), id, revision as number)
    if (result.changes !== 1) throw new Error('This card changed elsewhere or is missing. Reopen the card and try again.')
    return this.card(id)
  }
  addMarker(cardId: unknown, side: unknown, x: unknown, y: unknown): DefectMarker {
    validateId(cardId)
    if ((side !== 'front' && side !== 'back') || typeof x !== 'number' || typeof y !== 'number' || !Number.isFinite(x) || !Number.isFinite(y) || x < 0 || x > 1 || y < 0 || y > 1) throw new Error('Invalid defect marker.')
    const id = randomUUID(), now = new Date().toISOString()
    this.transaction(() => {
      this.db.prepare('INSERT INTO defect_markers(id,cardId,side,x,y,createdAt,updatedAt) VALUES (?,?,?,?,?,?,?)').run(id, cardId, side, x, y, now, now)
      this.db.prepare('UPDATE cards SET updatedAt=? WHERE id=?').run(now, cardId)
    })
    return this.marker(id)
  }
  saveMarker(id: unknown, note: unknown): DefectMarker {
    validateId(id, 'Marker')
    if (note !== null && (typeof note !== 'string' || note.length > 20000)) throw new Error('Marker notes must be text of at most 20,000 characters.')
    const normalized = typeof note === 'string' && note.trim() ? note : null
    const now = new Date().toISOString()
    const result = this.transaction(() => {
      const marker = this.db.prepare('SELECT cardId FROM defect_markers WHERE id=?').get(id)
      if (!marker) throw new Error('Defect marker not found.')
      const update = this.db.prepare('UPDATE defect_markers SET note=?,updatedAt=? WHERE id=?').run(normalized, now, id)
      this.db.prepare('UPDATE cards SET updatedAt=? WHERE id=?').run(now, marker.cardId)
      return update
    })
    if (result.changes !== 1) throw new Error('Defect marker not found.')
    return this.marker(id)
  }
  removeMarker(id: unknown): null {
    validateId(id, 'Marker')
    return this.transaction(() => {
      const marker = this.db.prepare('SELECT cardId FROM defect_markers WHERE id=?').get(id)
      if (!marker) throw new Error('Defect marker not found.')
      this.db.prepare('DELETE FROM defect_markers WHERE id=?').run(id)
      this.db.prepare('UPDATE cards SET updatedAt=? WHERE id=?').run(new Date().toISOString(), marker.cardId)
      return null
    })
  }
  private async preparePhoto(cardId: string, slot: PrimaryPhotoSlot | null, sourcePath: string): Promise<PhotoRow> {
    if (!this.writeThumbnail) throw new Error('Photo processing is unavailable in this application build.')
    const source = resolve(sourcePath)
    const sourceInfo = statSync(source)
    if (!sourceInfo.isFile() || sourceInfo.size < 1 || sourceInfo.size > MAX_PHOTO_BYTES) throw new Error('Choose an image file smaller than 250 MB.')
    const format = supportedPhotoExtensions.get(extname(source).toLowerCase())
    if (!format) throw new Error('Supported photo formats are JPEG, PNG, and WebP.')
    const safeCardId = this.mediaSegment(cardId), id = randomUUID(), temporaryId = randomUUID()
    const originalRelativePath = `media/originals/${safeCardId}/${id}.${format.extension}`
    const thumbnailRelativePath = `cache/thumbnails/${safeCardId}/${id}.jpg`
    const original = this.ownedPath(originalRelativePath), thumbnail = this.ownedPath(thumbnailRelativePath)
    const temporaryOriginal = join(resolve(original, '..'), `.${id}.${temporaryId}.${format.extension}`)
    const temporaryThumbnail = join(resolve(thumbnail, '..'), `.${id}.${temporaryId}.jpg`)
    mkdirSync(resolve(original, '..'), { recursive: true }); mkdirSync(resolve(thumbnail, '..'), { recursive: true })
    try {
      copyFileSync(source, temporaryOriginal, constants.COPYFILE_EXCL)
      await this.writeThumbnail(temporaryOriginal, temporaryThumbnail)
      if (!statSync(temporaryThumbnail).isFile() || statSync(temporaryThumbnail).size < 1) throw new Error('Thumbnail generation produced no image.')
      renameSync(temporaryOriginal, original)
      renameSync(temporaryThumbnail, thumbnail)
    } catch (error) {
      rmSync(temporaryOriginal, { force: true }); rmSync(temporaryThumbnail, { force: true })
      rmSync(original, { force: true }); rmSync(thumbnail, { force: true })
      throw error
    }
    const now = new Date().toISOString()
    return { id, cardId, slot, title: null, locked: 0, originalRelativePath, thumbnailRelativePath, originalFilename: basename(source), mimeType: format.mimeType, createdAt: now, updatedAt: now }
  }
  private cleanupPhotoFiles(row: Pick<PhotoRow, 'originalRelativePath' | 'thumbnailRelativePath'>): void {
    for (const relativePath of [row.originalRelativePath, row.thumbnailRelativePath]) {
      try { rmSync(this.ownedPath(relativePath), { force: true }) } catch { /* An isolated orphan is safer than undoing committed catalogue state. */ }
    }
  }
  async importPhotos(cardId: unknown, slot: unknown, sourcePaths: unknown): Promise<CardDetail> {
    validateId(cardId); validatePhotoSlot(slot)
    if (!Array.isArray(sourcePaths) || sourcePaths.length < 1 || sourcePaths.length > 100 || sourcePaths.some(path => typeof path !== 'string' || !path)) throw new Error('Choose between one and 100 image files.')
    if (slot !== null && sourcePaths.length !== 1) throw new Error('A primary slot accepts one photo.')
    this.card(cardId)
    const previous = slot === null ? undefined : this.db.prepare('SELECT * FROM photos WHERE cardId=? AND slot=?').get(cardId, slot) as unknown as PhotoRow | undefined
    if (previous?.locked === 1) throw new Error('Unlock this photo before replacing it.')
    const prepared: PhotoRow[] = []
    try {
      for (const path of sourcePaths) prepared.push(await this.preparePhoto(cardId, slot, path as string))
    } catch (error) {
      for (const row of prepared) this.cleanupPhotoFiles(row)
      throw error
    }
    let replaced: PhotoRow | undefined
    try {
      this.transaction(() => {
        if (slot !== null) {
          const current = this.db.prepare('SELECT * FROM photos WHERE cardId=? AND slot=?').get(cardId, slot) as unknown as PhotoRow | undefined
          if (current?.locked === 1) throw new Error('Unlock this photo before replacing it.')
          if (current) {
            this.db.prepare('DELETE FROM photos WHERE cardId=? AND slot=?').run(cardId, slot)
            replaced = current
          }
        }
        const insert = this.db.prepare(`INSERT INTO photos(
          id,cardId,slot,title,locked,originalRelativePath,thumbnailRelativePath,originalFilename,mimeType,createdAt,updatedAt
        ) VALUES (?,?,?,?,?,?,?,?,?,?,?)`)
        for (const row of prepared) insert.run(row.id, row.cardId, row.slot, row.title, row.locked, row.originalRelativePath, row.thumbnailRelativePath, row.originalFilename, row.mimeType, row.createdAt, row.updatedAt)
        this.db.prepare('UPDATE cards SET updatedAt=? WHERE id=?').run(new Date().toISOString(), cardId)
      })
    } catch (error) {
      for (const row of prepared) this.cleanupPhotoFiles(row)
      throw error
    }
    if (replaced) this.cleanupPhotoFiles(replaced)
    return this.get(cardId)
  }
  savePhotoTitle(id: unknown, title: unknown): Photo {
    validateId(id, 'Photo')
    if (title !== null && (typeof title !== 'string' || title.length > 20000)) throw new Error('Photo titles must be text of at most 20,000 characters.')
    const normalized = typeof title === 'string' && title.trim() ? title : null
    const now = new Date().toISOString()
    this.transaction(() => {
      const row = this.db.prepare('SELECT cardId,slot FROM photos WHERE id=?').get(id)
      if (!row) throw new Error('Photo not found.')
      if (row.slot !== null) throw new Error('Primary photos use their slot label instead of a title.')
      this.db.prepare('UPDATE photos SET title=?,updatedAt=? WHERE id=?').run(normalized, now, id)
      this.db.prepare('UPDATE cards SET updatedAt=? WHERE id=?').run(now, row.cardId)
    })
    return this.photo(this.db.prepare('SELECT * FROM photos WHERE id=?').get(id) as unknown as PhotoRow)
  }
  setPhotoLocked(id: unknown, locked: unknown): CardDetail {
    validateId(id, 'Photo')
    if (typeof locked !== 'boolean') throw new Error('Invalid photo lock setting.')
    const cardId = this.transaction(() => {
      const row = this.db.prepare('SELECT cardId FROM photos WHERE id=?').get(id)
      if (!row) throw new Error('Photo not found.')
      const now = new Date().toISOString()
      this.db.prepare('UPDATE photos SET locked=?,updatedAt=? WHERE id=?').run(locked ? 1 : 0, now, id)
      this.db.prepare('UPDATE cards SET updatedAt=? WHERE id=?').run(now, row.cardId)
      return String(row.cardId)
    })
    return this.get(cardId)
  }
  setPhotoMarkers(id: unknown, markerIds: unknown): CardDetail {
    validateId(id, 'Photo')
    if (!Array.isArray(markerIds) || markerIds.length > 1000 || markerIds.some(markerId => typeof markerId !== 'string' || markerId.length < 1 || markerId.length > 100) || new Set(markerIds).size !== markerIds.length) throw new Error('Invalid defect-marker links.')
    const cardId = this.transaction(() => {
      const photo = this.db.prepare('SELECT cardId FROM photos WHERE id=?').get(id)
      if (!photo) throw new Error('Photo not found.')
      if (markerIds.length) {
        const placeholders = markerIds.map(() => '?').join(',')
        const matches = Number(this.db.prepare(`SELECT count(*) AS total FROM defect_markers WHERE cardId=? AND id IN (${placeholders})`).get(photo.cardId, ...markerIds)!.total)
        if (matches !== markerIds.length) throw new Error('Photos can only link to defect markers from the same card.')
      }
      this.db.prepare('DELETE FROM photo_defect_markers WHERE photoId=?').run(id)
      const insert = this.db.prepare('INSERT INTO photo_defect_markers(photoId,markerId,cardId) VALUES (?,?,?)')
      for (const markerId of markerIds) insert.run(id, markerId, photo.cardId)
      this.db.prepare('UPDATE cards SET updatedAt=? WHERE id=?').run(new Date().toISOString(), photo.cardId)
      return String(photo.cardId)
    })
    return this.get(cardId)
  }
  removePhoto(id: unknown): CardDetail {
    validateId(id, 'Photo')
    const row = this.db.prepare('SELECT * FROM photos WHERE id=?').get(id) as unknown as PhotoRow | undefined
    if (!row) throw new Error('Photo not found.')
    if (row.locked === 1) throw new Error('Unlock this photo before removing it.')
    this.transaction(() => {
      const result = this.db.prepare('DELETE FROM photos WHERE id=? AND locked=0').run(id)
      if (result.changes !== 1) throw new Error('Unlock this photo before removing it.')
      this.db.prepare('UPDATE cards SET updatedAt=? WHERE id=?').run(new Date().toISOString(), row.cardId)
    })
    this.cleanupPhotoFiles(row)
    return this.get(row.cardId)
  }
  async photoFile(id: unknown, variant: unknown): Promise<string> {
    validateId(id, 'Photo')
    if (variant !== 'thumbnail' && variant !== 'original') throw new Error('Invalid photo variant.')
    const row = this.db.prepare('SELECT * FROM photos WHERE id=?').get(id) as unknown as PhotoRow | undefined
    if (!row) throw new Error('Photo not found.')
    const original = this.ownedPath(row.originalRelativePath)
    if (!existsSync(original)) throw new Error('The original photo is missing from this library.')
    if (variant === 'original') return original
    const thumbnail = this.ownedPath(row.thumbnailRelativePath)
    if (!existsSync(thumbnail)) {
      if (!this.writeThumbnail) throw new Error('Thumbnail processing is unavailable.')
      mkdirSync(resolve(thumbnail, '..'), { recursive: true })
      const temporary = join(resolve(thumbnail, '..'), `.${row.id}.${randomUUID()}.jpg`)
      try { await this.writeThumbnail(original, temporary); renameSync(temporary, thumbnail) }
      catch (error) { rmSync(temporary, { force: true }); throw error }
    }
    return thumbnail
  }
  finalize(id: unknown, revision: unknown): CardDetail {
    validateId(id)
    if (!Number.isSafeInteger(revision)) throw new Error('Invalid finalization request.')
    return this.transaction(() => {
      const detail = this.get(id)
      const missing = missingFinalizationFields(detail.inspection)
      if (missing.length) throw new Error(`Complete these required inspection fields: ${missing.join(', ')}.`)
      const now = new Date().toISOString()
      const result = this.db.prepare("UPDATE cards SET status='finalized',finalizedAt=?,finalizedAssessmentRevision=?,updatedAt=?,revision=revision+1 WHERE id=? AND revision=?").run(now, detail.inspection.assessmentRevision, now, id, revision as number)
      if (result.changes !== 1) throw new Error('This card changed elsewhere. Reopen it before finalizing.')
      return this.get(id)
    })
  }
  delete(id: unknown): null {
    validateId(id)
    const photoRows = this.db.prepare('SELECT originalRelativePath,thumbnailRelativePath FROM photos WHERE cardId=?').all(id) as unknown as PhotoRow[]
    const result = this.transaction(() => {
      const result = this.db.prepare('DELETE FROM cards WHERE id=?').run(id)
      if (result.changes !== 1) throw new Error('Card not found.')
      return null
    })
    for (const row of photoRows) this.cleanupPhotoFiles(row)
    for (const folder of [`media/originals/${this.mediaSegment(id)}`, `cache/thumbnails/${this.mediaSegment(id)}`]) {
      try { rmSync(this.ownedPath(folder), { recursive: true, force: true }) } catch { /* Database ownership has already been removed safely. */ }
    }
    return result
  }
  async snapshot(destination: string): Promise<void> {
    if (existsSync(destination)) rmSync(destination, { force: true })
    await backup(this.db, destination)
  }
  close(): void { this.db.close() }
}
