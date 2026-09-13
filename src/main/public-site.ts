import { createReadStream, existsSync, lstatSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, renameSync, rmSync, statSync, writeFileSync } from 'node:fs'
import { createHash } from 'node:crypto'
import { basename, dirname, isAbsolute, join, relative, resolve } from 'node:path'
import sharp from 'sharp'
import type { Library } from './library'
import type { PublicCardSource, PublicPhotoSource, PublicInspectionSource, LegacyPublicInspectionSource } from './public-model'
import { apparentSkew, faceMeasurements, centeringRatio, formatGrade, formatMeasurement } from '../shared/inspection'
import { gradeFields, measurementFields, measurementPositions, photoSlots, type PrimaryPhotoSlot, type PublicSiteGenerated, type SiteProgress } from '../shared/contracts'

export const SITE_FORMAT_VERSION = 2
export const SITE_OWNERSHIP_FILE = '.cards-under-glass-site.json'
export const REPORT_FORMAT_VERSION = 3
export const IMAGE_PIPELINE_VERSION = 1
export const PUBLIC_SNAPSHOT_FORMAT_VERSION = 2
const GENERATION_STATE_VERSION = 2
const OWNER_KEY_DOMAIN = 'cards-under-glass-public-owner:'
const GLOBAL_FILES = ['.nojekyll', 'assets/site.css', 'assets/site.js', 'data/reports.json', 'index.html'] as const
const primaryGroups: { title: string; className: string; slots: PrimaryPhotoSlot[] }[] = [
  { title: 'Corners', className: 'detail-photos', slots: ['corner_top_left', 'corner_top_right', 'corner_bottom_left', 'corner_bottom_right'] },
  { title: 'Edges', className: 'detail-photos', slots: ['edge_top', 'edge_right', 'edge_bottom', 'edge_left'] }
]

interface SitePhoto {
  assetKey: string
  slot: PrimaryPhotoSlot | null
  title: string | null
  originalFilename: string | null
  catalogue: string | null
  preview: string
  large: string
  label: string
  contentFingerprint: string
  markerNumbers: number[]
  imagePipelineVersion: number
}
interface SiteMarker {
  number: number
  side: 'front' | 'back'
  x: number
  y: number
  note: string | null
}
export interface PublicCardSnapshot {
  generator: 'Cards Under Glass'
  snapshotFormatVersion: 1 | 2
  publicSchemaVersion: 1 | 2
  ownerKey: string
  serial: string
  publicFingerprint: string
  reportFormatVersion: number
  imagePipelineVersion: number
  card: {
    game: string | null
    setName: string | null
    cardName: string | null
    cardNumber: string | null
    year: string | null
    language: string | null
    variant: string | null
    rarity: string | null
    manufacturer: string | null
    inspection: PublicInspectionSource | LegacyPublicInspectionSource
    markers: SiteMarker[]
    photos: SitePhoto[]
  }
}
type SnapshotCard = PublicCardSnapshot['card'] & { serial: string }
type SiteCard = Omit<SnapshotCard, 'inspection'> & { inspection: PublicInspectionSource; legacyCentering?: boolean }
interface OwnershipManifestV2 {
  generator: 'Cards Under Glass'
  formatVersion: 2
  applicationVersion: string
  ownedFiles: string[]
  generationStateVersion: 2
  reportFormatVersion: number
  imagePipelineVersion: number
}
interface LegacyReportPhotoManifest { assetKey: string; contentFingerprint: string; imagePipelineVersion: number; generatedFiles: string[] }
interface LegacyReportManifest {
  serial: string; publicFingerprint: string; reportFormatVersion: number; imagePipelineVersion: number
  generatedFiles: string[]; photos: LegacyReportPhotoManifest[]
}
interface LegacyOwnershipManifest {
  generator: 'Cards Under Glass'; formatVersion: 1; applicationVersion: string; ownedFiles: string[]
  generationStateVersion?: 1; reportFormatVersion?: number; imagePipelineVersion?: number; reports?: LegacyReportManifest[]
}
type PreviousOwnership = OwnershipManifestV2 | LegacyOwnershipManifest
interface PreparedLocalCard { snapshot: PublicCardSnapshot; sourcePaths: Map<string, string> }
type ProgressReporter = (progress: SiteProgress) => void
export interface PublicImageTargets { catalogue?: string; preview?: string; large?: string }
export type PublicImageWriter = (source: string, targets: PublicImageTargets) => Promise<void>
export type PublicSiteGenerationMode = 'update' | 'rebuild'
export interface PublicSiteGenerationOptions {
  mode?: PublicSiteGenerationMode
  reportFormatVersion?: number
  imagePipelineVersion?: number
}

const html = (value: string): string => value.replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;').replaceAll('"', '&quot;').replaceAll("'", '&#39;')
const attr = html
const grade = (value: number): string => formatGrade(value)
const measurement = (value: number): string => `${formatMeasurement(value)} mm`

function safeRelativePath(value: string): string {
  if (!value || value.length > 1024 || value.includes('\0') || value.includes('\\') || value.startsWith('/') || /^[A-Za-z]:/.test(value) || isAbsolute(value)) throw new Error('Generated-site ownership data contains an unsafe path.')
  const segments = value.split('/')
  if (segments.some(segment => !segment || segment === '.' || segment === '..')) throw new Error('Generated-site ownership data contains an unsafe path.')
  return value
}

function ownedPath(root: string, value: string): string {
  const safe = safeRelativePath(value), absoluteRoot = resolve(root), target = resolve(absoluteRoot, ...safe.split('/')), child = relative(absoluteRoot, target)
  if (!child || child.startsWith('..') || isAbsolute(child)) throw new Error('Generated-site path escapes its output folder.')
  return target
}

function assertNoSymlinkParents(root: string, value: string): void {
  let current = resolve(root)
  for (const segment of safeRelativePath(value).split('/').slice(0, -1)) {
    current = join(current, segment)
    if (existsSync(current) && lstatSync(current).isSymbolicLink()) throw new Error(`Generated-site path crosses a symbolic link: ${value}`)
  }
}

function write(root: string, path: string, value: string | Buffer): void {
  const destination = ownedPath(root, path)
  mkdirSync(dirname(destination), { recursive: true })
  writeFileSync(destination, value, { mode: 0o644 })
}

function allFiles(root: string, prefix = ''): string[] {
  const result: string[] = []
  for (const name of readdirSync(join(root, prefix))) {
    const next = prefix ? `${prefix}/${name}` : name, stat = lstatSync(join(root, next))
    if (stat.isSymbolicLink()) throw new Error('Generated staging contains an unexpected symbolic link.')
    if (stat.isDirectory()) result.push(...allFiles(root, next))
    else if (stat.isFile()) result.push(next)
  }
  return result
}

const isPositiveInteger = (value: unknown): value is number => typeof value === 'number' && Number.isSafeInteger(value) && value > 0
const isFingerprint = (value: unknown): value is string => typeof value === 'string' && /^[0-9a-f]{64}$/.test(value)
const isNullableText = (value: unknown): value is string | null => value === null || (typeof value === 'string' && value.length <= 20_000)
const isStoredNumber = (value: unknown): value is number => typeof value === 'number' && Number.isSafeInteger(value) && value >= 0
const isPlainObject = (value: unknown): value is Record<string, unknown> => Boolean(value) && typeof value === 'object' && !Array.isArray(value)
function hasExactKeys(value: Record<string, unknown>, keys: readonly string[]): boolean {
  const actual = Object.keys(value).sort(), expected = [...keys].sort()
  return actual.length === expected.length && actual.every((key, index) => key === expected[index])
}

function manifestFiles(value: unknown): string[] {
  if (!Array.isArray(value) || value.some(path => typeof path !== 'string')) throw new Error('The existing Cards Under Glass site ownership manifest is invalid.')
  const files = value.map(safeRelativePath)
  if (new Set(files).size !== files.length || files.includes(SITE_OWNERSHIP_FILE)) throw new Error('The existing Cards Under Glass site ownership manifest is invalid.')
  return files
}

function previousOwnership(output: string): PreviousOwnership | null {
  const path = join(output, SITE_OWNERSHIP_FILE)
  if (!existsSync(path)) return null
  if (!lstatSync(path).isFile() || lstatSync(path).isSymbolicLink()) throw new Error('The existing Cards Under Glass site ownership manifest is invalid.')
  let value: unknown
  try { value = JSON.parse(readFileSync(path, 'utf8')) as unknown } catch { throw new Error('The existing Cards Under Glass site ownership manifest is invalid.') }
  if (!isPlainObject(value)) throw new Error('The existing Cards Under Glass site ownership manifest is invalid.')
  const manifest = value as Partial<PreviousOwnership>
  if (manifest.generator !== 'Cards Under Glass' || (manifest.formatVersion !== 1 && manifest.formatVersion !== SITE_FORMAT_VERSION)) throw new Error('The existing Cards Under Glass site ownership manifest is unsupported or invalid.')
  const files = manifestFiles(manifest.ownedFiles)
  if (manifest.formatVersion === SITE_FORMAT_VERSION) {
    if (manifest.generationStateVersion !== GENERATION_STATE_VERSION || !isPositiveInteger(manifest.reportFormatVersion) || !isPositiveInteger(manifest.imagePipelineVersion) || files.some(file => !(GLOBAL_FILES as readonly string[]).includes(file))) throw new Error('The existing Cards Under Glass site ownership manifest is unsupported or invalid.')
    return {
      generator: 'Cards Under Glass', formatVersion: 2, applicationVersion: String(manifest.applicationVersion ?? ''), ownedFiles: files,
      generationStateVersion: 2, reportFormatVersion: manifest.reportFormatVersion, imagePipelineVersion: manifest.imagePipelineVersion
    }
  }
  const legacy = manifest as Partial<LegacyOwnershipManifest>
  if (legacy.reports === undefined && legacy.generationStateVersion === undefined) return { generator: 'Cards Under Glass', formatVersion: 1, applicationVersion: String(legacy.applicationVersion ?? ''), ownedFiles: files }
  if (legacy.generationStateVersion !== 1 || !isPositiveInteger(legacy.reportFormatVersion) || !isPositiveInteger(legacy.imagePipelineVersion) || !Array.isArray(legacy.reports)) throw new Error('The existing Cards Under Glass incremental site state is unsupported or invalid.')
  const reports = legacy.reports.map(report => {
    if (!report || typeof report !== 'object' || !/^\d{10}$/.test(report.serial) || !isFingerprint(report.publicFingerprint) || !isPositiveInteger(report.reportFormatVersion) || !isPositiveInteger(report.imagePipelineVersion) || !Array.isArray(report.photos)) throw new Error('The existing Cards Under Glass incremental site state is invalid.')
    const generatedFiles = manifestFiles(report.generatedFiles)
    const photos = report.photos.map(photo => {
      if (!photo || typeof photo !== 'object' || typeof photo.assetKey !== 'string' || !/^[a-z0-9-]+$/.test(photo.assetKey) || !isFingerprint(photo.contentFingerprint) || !isPositiveInteger(photo.imagePipelineVersion)) throw new Error('The existing Cards Under Glass incremental photo state is invalid.')
      return { assetKey: photo.assetKey, contentFingerprint: photo.contentFingerprint, imagePipelineVersion: photo.imagePipelineVersion, generatedFiles: manifestFiles(photo.generatedFiles) }
    })
    if (generatedFiles.some(path => !files.includes(path)) || photos.some(photo => photo.generatedFiles.some(path => !generatedFiles.includes(path)))) throw new Error('The existing Cards Under Glass incremental site state does not match its ownership list.')
    return { serial: report.serial, publicFingerprint: report.publicFingerprint, reportFormatVersion: report.reportFormatVersion, imagePipelineVersion: report.imagePipelineVersion, generatedFiles, photos }
  })
  if (new Set(reports.map(report => report.serial)).size !== reports.length) throw new Error('The existing Cards Under Glass incremental site state is invalid.')
  return { generator: 'Cards Under Glass', formatVersion: 1, applicationVersion: String(legacy.applicationVersion ?? ''), ownedFiles: files, generationStateVersion: 1, reportFormatVersion: legacy.reportFormatVersion, imagePipelineVersion: legacy.imagePipelineVersion, reports }
}

function pruneEmptyOwnedDirectories(output: string, paths: string[]): void {
  const directories = new Set<string>()
  for (const path of paths) {
    const segments = path.split('/')
    for (let index = 1; index < segments.length; index++) directories.add(segments.slice(0, index).join('/'))
  }
  for (const directory of [...directories].sort((a, b) => b.length - a.length)) {
    const target = ownedPath(output, directory)
    try { if (existsSync(target) && lstatSync(target).isDirectory() && readdirSync(target).length === 0) rmSync(target, { recursive: true }) } catch { /* Empty directory cleanup is cosmetic. */ }
  }
}

function commitGeneratedSite(staging: string, output: string, previousManagedFiles: Set<string>, hadManifest: boolean, preservedFiles: Set<string>, desiredFiles: string[]): void {
  if (!existsSync(output)) mkdirSync(output, { recursive: true })
  const outputStat = lstatSync(output)
  if (!outputStat.isDirectory() || outputStat.isSymbolicLink()) throw new Error('Choose a normal local folder for generated public-site files.')
  const staged = allFiles(staging)
  const planned = staged.filter(path => path !== SITE_OWNERSHIP_FILE)
  const desired = new Set(desiredFiles)
  if (desired.size !== desiredFiles.length || desiredFiles.some(path => safeRelativePath(path) !== path)) throw new Error('Generated-site planning produced invalid ownership data.')
  for (const path of preservedFiles) {
    if (!desired.has(path) || !previousManagedFiles.has(path)) throw new Error('Generated-site planning attempted to preserve an invalid file.')
    assertNoSymlinkParents(output, path)
    const existing = ownedPath(output, path)
    if (!existsSync(existing) || !lstatSync(existing).isFile() || lstatSync(existing).isSymbolicLink()) throw new Error(`A generated file selected for reuse is unavailable: ${path}`)
  }
  const expectedStaged = [...desired].filter(path => !preservedFiles.has(path)).sort()
  if (planned.length !== expectedStaged.length || [...planned].sort().some((path, index) => path !== expectedStaged[index])) throw new Error('Generated-site staging does not match its ownership plan.')
  for (const path of [...planned, SITE_OWNERSHIP_FILE]) {
    assertNoSymlinkParents(output, path)
    const destination = ownedPath(output, path)
    if (existsSync(destination) && path !== SITE_OWNERSHIP_FILE && !previousManagedFiles.has(path)) throw new Error(`The output folder already contains an unowned file that would conflict: ${path}`)
  }

  const rollback = mkdtempSync(join(dirname(resolve(output)), `.${basename(output)}.cug-site-rollback-`))
  const oldPaths = [...previousManagedFiles].filter(path => !preservedFiles.has(path)).concat(hadManifest ? [SITE_OWNERSHIP_FILE] : [])
  const movedOld: string[] = [], movedNew: string[] = []
  try {
    for (const path of oldPaths) {
      assertNoSymlinkParents(output, path)
      const source = ownedPath(output, path)
      if (!existsSync(source)) continue
      if (!lstatSync(source).isFile()) throw new Error(`A previously generated path is no longer a file: ${path}`)
      const target = ownedPath(rollback, path)
      mkdirSync(dirname(target), { recursive: true }); renameSync(source, target); movedOld.push(path)
    }
    for (const path of [...planned, SITE_OWNERSHIP_FILE]) {
      const source = ownedPath(staging, path), target = ownedPath(output, path)
      mkdirSync(dirname(target), { recursive: true }); renameSync(source, target); movedNew.push(path)
    }
    pruneEmptyOwnedDirectories(output, oldPaths)
  } catch (error) {
    for (const path of movedNew.reverse()) rmSync(ownedPath(output, path), { force: true })
    for (const path of movedOld.reverse()) {
      const source = ownedPath(rollback, path), target = ownedPath(output, path)
      mkdirSync(dirname(target), { recursive: true }); renameSync(source, target)
    }
    throw error
  } finally { rmSync(rollback, { recursive: true, force: true }) }
}

async function writePublicImages(source: string, targets: PublicImageTargets): Promise<void> {
  try {
    const image = sharp(source, { failOn: 'error', limitInputPixels: 200_000_000 }).rotate()
    if (targets.catalogue) await image.clone().resize({ width: 420, height: 420, fit: 'inside', withoutEnlargement: true }).webp({ quality: 78, effort: 5 }).toFile(targets.catalogue)
    if (targets.preview) await image.clone().resize({ width: 900, height: 900, fit: 'inside', withoutEnlargement: true }).webp({ quality: 82, effort: 5 }).toFile(targets.preview)
    if (targets.large) await image.clone().resize({ width: 2400, height: 2400, fit: 'inside', withoutEnlargement: true }).webp({ quality: 90, effort: 5 }).toFile(targets.large)
  } catch { throw new Error('A public-site photo derivative could not be generated from a library original.') }
}

async function fileFingerprint(path: string): Promise<string> {
  const hash = createHash('sha256')
  for await (const chunk of createReadStream(path)) hash.update(chunk as Buffer)
  return hash.digest('hex')
}

const valueFingerprint = (value: unknown): string => createHash('sha256').update(JSON.stringify(value)).digest('hex')

export function derivePublicOwnerKey(libraryUuid: string): string {
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(libraryUuid)) throw new Error('The library identity is invalid.')
  return createHash('sha256').update(`${OWNER_KEY_DOMAIN}${libraryUuid.toLowerCase()}`).digest('hex')
}

function fingerprintPayload(card: SnapshotCard): unknown {
  return {
    serial: card.serial,
    metadata: {
      game: card.game, setName: card.setName, cardName: card.cardName, cardNumber: card.cardNumber, year: card.year,
      language: card.language, variant: card.variant, rarity: card.rarity, manufacturer: card.manufacturer
    },
    inspection: card.inspection,
    markers: card.markers.map(marker => ({ number: marker.number, side: marker.side, x: marker.x, y: marker.y, note: marker.note })),
    photos: card.photos.map(photo => ({
      assetKey: photo.assetKey, slot: photo.slot, title: photo.title, originalFilename: photo.originalFilename, label: photo.label,
      catalogue: photo.catalogue, preview: photo.preview, large: photo.large, contentFingerprint: photo.contentFingerprint,
      markerNumbers: photo.markerNumbers
    }))
  }
}

function snapshotSiteCard(snapshot: PublicCardSnapshot): SiteCard {
  if (snapshot.snapshotFormatVersion === 2) return { serial: snapshot.serial, ...snapshot.card, inspection: snapshot.card.inspection as PublicInspectionSource }
  const legacy = snapshot.card.inspection as LegacyPublicInspectionSource
  const inspection = Object.fromEntries(Object.entries(legacy).filter(([key]) => !Object.hasOwn(measurementPositions, key))) as unknown as PublicInspectionSource
  for (const position of Object.keys(measurementPositions) as (keyof typeof measurementPositions)[]) {
    const suffix = position[0].toUpperCase() + position.slice(1)
    Object.assign(inspection, { [`front${suffix}`]: legacy[position], [`back${suffix}`]: null })
  }
  return { serial: snapshot.serial, ...snapshot.card, inspection, legacyCentering: true }
}
function snapshotCardValue(card: SnapshotCard): PublicCardSnapshot['card'] {
  return {
    game: card.game, setName: card.setName, cardName: card.cardName, cardNumber: card.cardNumber, year: card.year,
    language: card.language, variant: card.variant, rarity: card.rarity, manufacturer: card.manufacturer,
    inspection: card.inspection, markers: card.markers, photos: card.photos
  }
}

async function prepareSiteCard(card: PublicCardSource, ownerKey: string, reportFormatVersion: number, imagePipelineVersion: number): Promise<PreparedLocalCard> {
  const markerNumbers = new Map(card.markers.map((marker, index) => [marker.sourceId, index + 1]))
  const photos: SitePhoto[] = []
  const sourcePaths = new Map<string, string>()
  let evidenceIndex = 0
  for (const photo of card.photos) {
    if (!existsSync(photo.sourcePath) || !statSync(photo.sourcePath).isFile()) throw new Error(`The original photo required for public report #${card.serial} is missing.`)
    if (!photo.slot) evidenceIndex++
    const assetKey = photoAssetName(photo, evidenceIndex), base = `media/${card.serial}/${assetKey}`
    const catalogue = photo.slot === 'full_front' ? `${base}-catalogue.webp` : null
    const preview = `${base}-preview.webp`, large = `${base}-large.webp`
    const markerNumberList = photo.markerSourceIds.map(id => markerNumbers.get(id)).filter((value): value is number => value !== undefined)
    photos.push({
      assetKey, slot: photo.slot, title: photo.slot ? null : photo.title, originalFilename: photo.slot ? null : photo.originalFilename,
      catalogue, preview, large,
      label: photo.slot ? photoSlots[photo.slot] : photo.title || photo.originalFilename,
      contentFingerprint: await fileFingerprint(photo.sourcePath), markerNumbers: markerNumberList, imagePipelineVersion
    })
    sourcePaths.set(assetKey, photo.sourcePath)
  }
  const siteCard: SiteCard = {
    serial: card.serial, game: card.game, setName: card.setName, cardName: card.cardName, cardNumber: card.cardNumber,
    year: card.year, language: card.language, variant: card.variant, rarity: card.rarity, manufacturer: card.manufacturer,
    inspection: card.inspection,
    markers: card.markers.map((marker, index) => ({ number: index + 1, side: marker.side, x: marker.x, y: marker.y, note: marker.note })),
    photos
  }
  const publicFingerprint = valueFingerprint(fingerprintPayload(siteCard))
  return {
    sourcePaths,
    snapshot: {
      generator: 'Cards Under Glass', snapshotFormatVersion: 2, publicSchemaVersion: 2, ownerKey, serial: card.serial,
      publicFingerprint, reportFormatVersion, imagePipelineVersion, card: snapshotCardValue(siteCard)
    }
  }
}

export async function fingerprintPublicCard(card: PublicCardSource): Promise<string> {
  return (await prepareSiteCard(card, '0'.repeat(64), REPORT_FORMAT_VERSION, IMAGE_PIPELINE_VERSION)).snapshot.publicFingerprint
}

const metadataKeys = ['game', 'setName', 'cardName', 'cardNumber', 'year', 'language', 'variant', 'rarity', 'manufacturer'] as const
const inspectionNumberKeys = [...Object.keys(gradeFields), ...Object.keys(measurementFields)]
const legacyInspectionNumberKeys = [...Object.keys(gradeFields), ...Object.keys(measurementPositions)]
const inspectionNoteKeys = ['centeringNote', 'cornersNote', 'edgesNote', 'surfaceNote'] as const
const snapshotKeys = ['generator', 'snapshotFormatVersion', 'publicSchemaVersion', 'ownerKey', 'serial', 'publicFingerprint', 'reportFormatVersion', 'imagePipelineVersion', 'card'] as const
const cardSnapshotKeys = [...metadataKeys, 'inspection', 'markers', 'photos'] as const
const markerSnapshotKeys = ['number', 'side', 'x', 'y', 'note'] as const
const photoSnapshotKeys = ['assetKey', 'slot', 'title', 'originalFilename', 'catalogue', 'preview', 'large', 'label', 'contentFingerprint', 'markerNumbers', 'imagePipelineVersion'] as const

function snapshotPath(serial: string): string { return `data/cards/${serial}.json` }
function reportPath(serial: string): string { return `cards/${serial}/index.html` }
function photoFiles(photo: SitePhoto): string[] { return [photo.catalogue, photo.preview, photo.large].filter((path): path is string => path !== null) }
function snapshotFiles(snapshot: PublicCardSnapshot): string[] {
  return [snapshotPath(snapshot.serial), reportPath(snapshot.serial), ...snapshot.card.photos.flatMap(photoFiles)].sort()
}
function serializedSnapshot(snapshot: PublicCardSnapshot): string { return `${JSON.stringify(snapshot, null, 2)}\n` }

function parseSnapshot(value: unknown, expectedSerial: string): PublicCardSnapshot {
  if (!isPlainObject(value) || !hasExactKeys(value, snapshotKeys) || value.generator !== 'Cards Under Glass' || !((value.snapshotFormatVersion === 1 && value.publicSchemaVersion === 1) || (value.snapshotFormatVersion === PUBLIC_SNAPSHOT_FORMAT_VERSION && value.publicSchemaVersion === 2)) || !isFingerprint(value.ownerKey) || value.serial !== expectedSerial || !isFingerprint(value.publicFingerprint) || !isPositiveInteger(value.reportFormatVersion) || !isPositiveInteger(value.imagePipelineVersion) || !isPlainObject(value.card) || !hasExactKeys(value.card, cardSnapshotKeys)) throw new Error(`Published snapshot for report #${expectedSerial} is invalid or unsupported.`)
  const rawCard = value.card
  if (metadataKeys.some(key => !isNullableText(rawCard[key]))) throw new Error(`Published snapshot for report #${expectedSerial} contains invalid metadata.`)
  const numberKeys = value.snapshotFormatVersion === 1 ? legacyInspectionNumberKeys : inspectionNumberKeys
  const rawInspection = rawCard.inspection
  if (!isPlainObject(rawInspection) || !hasExactKeys(rawInspection, [...numberKeys, ...inspectionNoteKeys]) || numberKeys.some(key => !isStoredNumber(rawInspection[key]) || (Object.hasOwn(gradeFields, key) && Number(rawInspection[key]) > 100)) || inspectionNoteKeys.some(key => !isNullableText(rawInspection[key]))) throw new Error(`Published snapshot for report #${expectedSerial} contains invalid inspection data.`)
  if (!Array.isArray(rawCard.markers) || !Array.isArray(rawCard.photos)) throw new Error(`Published snapshot for report #${expectedSerial} contains invalid evidence data.`)
  const markers: SiteMarker[] = rawCard.markers.map((raw, index) => {
    if (!isPlainObject(raw) || !hasExactKeys(raw, markerSnapshotKeys) || raw.number !== index + 1 || (raw.side !== 'front' && raw.side !== 'back') || typeof raw.x !== 'number' || !Number.isFinite(raw.x) || raw.x < 0 || raw.x > 1 || typeof raw.y !== 'number' || !Number.isFinite(raw.y) || raw.y < 0 || raw.y > 1 || !isNullableText(raw.note)) throw new Error(`Published snapshot for report #${expectedSerial} contains an invalid defect marker.`)
    return { number: raw.number, side: raw.side, x: raw.x, y: raw.y, note: raw.note }
  })
  const slots = new Set<PrimaryPhotoSlot>(), assetKeys = new Set<string>()
  const photos: SitePhoto[] = rawCard.photos.map(raw => {
    if (!isPlainObject(raw) || !hasExactKeys(raw, photoSnapshotKeys) || typeof raw.assetKey !== 'string' || !/^[a-z0-9-]+$/.test(raw.assetKey) || assetKeys.has(raw.assetKey) || (raw.slot !== null && (typeof raw.slot !== 'string' || !Object.prototype.hasOwnProperty.call(photoSlots, raw.slot))) || !isNullableText(raw.title) || !isNullableText(raw.originalFilename) || typeof raw.label !== 'string' || !raw.label || raw.label.length > 20_000 || !isFingerprint(raw.contentFingerprint) || !Array.isArray(raw.markerNumbers) || raw.markerNumbers.some(number => !Number.isSafeInteger(number) || number < 1 || number > markers.length) || new Set(raw.markerNumbers).size !== raw.markerNumbers.length || !isPositiveInteger(raw.imagePipelineVersion)) throw new Error(`Published snapshot for report #${expectedSerial} contains invalid photo data.`)
    const slot = raw.slot as PrimaryPhotoSlot | null
    if (slot && slots.has(slot)) throw new Error(`Published snapshot for report #${expectedSerial} repeats a primary photo slot.`)
    if (slot) slots.add(slot)
    assetKeys.add(raw.assetKey)
    const base = `media/${expectedSerial}/${raw.assetKey}`
    const expectedCatalogue = slot === 'full_front' ? `${base}-catalogue.webp` : null
    const expectedPreview = `${base}-preview.webp`, expectedLarge = `${base}-large.webp`
    if (raw.catalogue !== expectedCatalogue || raw.preview !== expectedPreview || raw.large !== expectedLarge) throw new Error(`Published snapshot for report #${expectedSerial} contains unsafe photo paths.`)
    if (slot && (raw.title !== null || raw.originalFilename !== null || raw.label !== photoSlots[slot])) throw new Error(`Published snapshot for report #${expectedSerial} contains invalid primary photo identity.`)
    if (!slot && (!raw.originalFilename || raw.label !== (raw.title || raw.originalFilename))) throw new Error(`Published snapshot for report #${expectedSerial} contains invalid Additional Photo identity.`)
    return {
      assetKey: raw.assetKey, slot, title: raw.title, originalFilename: raw.originalFilename,
      catalogue: raw.catalogue as string | null, preview: raw.preview as string, large: raw.large as string,
      label: raw.label, contentFingerprint: raw.contentFingerprint, markerNumbers: raw.markerNumbers as number[], imagePipelineVersion: raw.imagePipelineVersion
    }
  })
  const inspection = Object.fromEntries([...numberKeys, ...inspectionNoteKeys].map(key => [key, rawInspection[key]])) as unknown as PublicCardSource['inspection']
  const card: SnapshotCard = {
    serial: expectedSerial,
    ...Object.fromEntries(metadataKeys.map(key => [key, rawCard[key]])) as Pick<SiteCard, typeof metadataKeys[number]>,
    inspection, markers, photos
  }
  if (value.publicFingerprint !== valueFingerprint(fingerprintPayload(card))) throw new Error(`Published snapshot for report #${expectedSerial} failed its content fingerprint check.`)
  return {
    generator: 'Cards Under Glass', snapshotFormatVersion: value.snapshotFormatVersion as 1 | 2, publicSchemaVersion: value.publicSchemaVersion as 1 | 2,
    ownerKey: value.ownerKey, serial: expectedSerial, publicFingerprint: value.publicFingerprint,
    reportFormatVersion: value.reportFormatVersion, imagePipelineVersion: value.imagePipelineVersion,
    card: snapshotCardValue(card)
  }
}

function readExistingSnapshots(output: string): Map<string, PublicCardSnapshot> {
  const snapshots = new Map<string, PublicCardSnapshot>(), folder = join(output, 'data', 'cards')
  if (!existsSync(folder)) return snapshots
  assertNoSymlinkParents(output, 'data/cards/placeholder')
  if (!lstatSync(folder).isDirectory() || lstatSync(folder).isSymbolicLink()) throw new Error('The published snapshot directory is invalid.')
  for (const name of readdirSync(folder)) {
    if (!/^\d{10}\.json$/.test(name)) continue
    const path = join(folder, name), serial = name.slice(0, 10)
    if (!lstatSync(path).isFile() || lstatSync(path).isSymbolicLink()) throw new Error(`Published snapshot for report #${serial} is invalid.`)
    let value: unknown
    try { value = JSON.parse(readFileSync(path, 'utf8')) as unknown } catch { throw new Error(`Published snapshot for report #${serial} is not valid JSON.`) }
    snapshots.set(serial, parseSnapshot(value, serial))
  }
  return snapshots
}

function page(title: string, prefix: string, body: string, bodyClass = ''): string {
  return `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta http-equiv="Content-Security-Policy" content="default-src 'self'; img-src 'self' data:; style-src 'self' 'unsafe-inline'; script-src 'self'; object-src 'none'; base-uri 'none'"><title>${html(title)}</title><link rel="stylesheet" href="${prefix}assets/site.css"></head>
<body class="${bodyClass}"><header class="site-header"><a class="wordmark" href="${prefix}index.html">Cards Under Glass</a><a class="reports-link" href="${prefix}index.html">Card Reports</a></header>${body}<footer><span>Cards Under Glass</span></footer><script src="${prefix}assets/site.js" defer></script></body></html>`
}

function metadataRows(card: SiteCard): string {
  const rows: [string, string | null][] = [
    ['Card Name', card.cardName], ['Game / Category', card.game], ['Set', card.setName], ['Card Number', card.cardNumber],
    ['Year', card.year], ['Language', card.language], ['Variant / Parallel', card.variant], ['Rarity', card.rarity], ['Manufacturer / Publisher', card.manufacturer]
  ]
  return rows.filter((row): row is [string, string] => Boolean(row[1])).map(([label, value]) => `<div><dt>${html(label)}</dt><dd>${html(value)}</dd></div>`).join('')
}

function photoAssetName(photo: PublicPhotoSource, evidenceIndex: number): string {
  return photo.slot ? photo.slot.replaceAll('_', '-') : `evidence-${String(evidenceIndex).padStart(2, '0')}`
}

function photoFigure(photo: SitePhoto, prefix: string, cardName: string, placeholderClass = ''): string {
  const alt = `${photo.label} photograph for ${cardName}`
  return `<figure class="photo ${placeholderClass}"><button class="photo-open" type="button" data-lightbox-src="${attr(prefix + photo.large)}" data-lightbox-label="${attr(photo.label)}"><img src="${attr(prefix + photo.preview)}" alt="${attr(alt)}" loading="lazy"><span>View larger</span></button><figcaption>${html(photo.label)}</figcaption></figure>`
}

function photoPlaceholder(label: string): string {
  return `<figure class="photo placeholder"><div aria-label="${attr(`${label}: No photo provided`)}"><span class="placeholder-mark">◇</span><strong>${html(label)}</strong><small>No photo provided</small></div><figcaption>${html(label)}</figcaption></figure>`
}

function photoGroups(card: SiteCard): string {
  const bySlot = new Map(card.photos.filter(photo => photo.slot).map(photo => [photo.slot!, photo]))
  const name = card.cardName || `Report #${card.serial}`
  return primaryGroups.map(group => `<section class="panel photo-section"><div class="section-heading"><h2>${group.title}</h2></div><div class="${group.className}">${group.slots.map(slot => {
    const photo = bySlot.get(slot)
    return photo ? photoFigure(photo, '../../', name) : photoPlaceholder(photoSlots[slot])
  }).join('')}</div></section>`).join('')
}

function defectMap(markers: SiteMarker[], side: 'front' | 'back'): string {
  const own = markers.filter(marker => marker.side === side)
  return `<div class="public-map-wrap"><span>${side.toUpperCase()}</span><div class="public-map" aria-label="${side} defect map">${own.map(marker => {
    return `<button type="button" class="defect-marker" style="left:${(marker.x * 100).toFixed(4)}%;top:${(marker.y * 100).toFixed(4)}%" data-defect="${marker.number}" aria-label="Select defect ${marker.number}, ${side}">${marker.number}</button>`
  }).join('')}</div></div>`
}

function defects(card: SiteCard): string {
  if (!card.markers.length) return `<section class="panel defects-panel"><div class="section-heading"><h2>Defect Map</h2><span>0 documented</span></div><div class="no-defects">No defects documented.</div></section>`
  const name = card.cardName || `Report #${card.serial}`
  const details = card.markers.map((marker, index) => {
    const linked = card.photos.filter(photo => photo.markerNumbers.includes(marker.number))
    return `<article class="defect-detail${index === 0 ? ' active' : ''}" data-defect-detail="${marker.number}"><div class="defect-heading"><span>${marker.number}</span><div><strong>Defect ${marker.number}</strong><small>${marker.side.toUpperCase()} · ${(marker.x * 100).toFixed(1)}%, ${(marker.y * 100).toFixed(1)}%</small></div></div>${marker.note ? `<p>${html(marker.note)}</p>` : ''}${linked.length ? `<div class="evidence"><h3>Linked evidence</h3><div>${linked.map(photo => photoFigure(photo, '../../', name, 'evidence-photo')).join('')}</div></div>` : ''}</article>`
  }).join('')
  return `<section class="panel defects-panel"><div class="section-heading"><h2>Defect Map</h2><span>${card.markers.length} documented</span></div><div class="defect-grid"><div class="maps">${defectMap(card.markers, 'front')}${defectMap(card.markers, 'back')}</div><div class="defect-details">${details}</div></div></section>`
}

function centering(card: SiteCard): string {
  const faces = (['front', 'back'] as const).map(face => {
    const title = face === 'front' ? 'Centering Front' : 'Centering Back'
    if (face === 'back' && card.legacyCentering) return `<div class="public-centering-face legacy-centering"><h2>${title}</h2><p>Back measurements were not recorded in this legacy report.</p></div>`
    const values = faceMeasurements(card.inspection, face)
    const skew = apparentSkew(values)
    const skewText = skew.state === 'none' ? 'No apparent skew' : skew.state === 'estimated' ? `~${skew.degrees!.toFixed(1)}° ${skew.direction}` : 'Unavailable'
    const ratios = [
      ['Vertical Left', 'Top / Bottom', centeringRatio(values.verticalLeftTop, values.verticalLeftBottom)],
      ['Vertical Right', 'Top / Bottom', centeringRatio(values.verticalRightTop, values.verticalRightBottom)],
      ['Horizontal Upper', 'Left / Right', centeringRatio(values.horizontalUpperLeft, values.horizontalUpperRight)],
      ['Horizontal Lower', 'Left / Right', centeringRatio(values.horizontalLowerLeft, values.horizontalLowerRight)]
    ]
    const raw = Object.entries(measurementPositions).map(([position, label]) => [label, values[position as keyof typeof values]] as const)
    return `<div class="public-centering-face"><div class="section-heading"><h2>${title}</h2><span>Measured in millimeters</span></div><div class="centering-content"><div><div class="ratios">${ratios.map(([label, direction, value]) => `<div><span>${label}<small>${direction}</small></span><strong>${value ?? 'Unavailable'}</strong></div>`).join('')}</div><div class="skew"><span>Apparent skew<small>Approximate estimate</small></span><strong>${skewText}</strong></div></div><div class="raw"><h3>Raw Measurements</h3>${raw.map(([label, value]) => `<div><span>${label}</span><strong>${value === null ? 'Unavailable' : measurement(value)}</strong></div>`).join('')}</div></div></div>`
  })
  return `<section class="panel centering-panel">${faces.join('')}</section>`
}

function gradingNotes(card: SiteCard): string {
  const notes: [string, string | null][] = [['Centering', card.inspection.centeringNote], ['Corners', card.inspection.cornersNote], ['Edges', card.inspection.edgesNote], ['Surface', card.inspection.surfaceNote]]
  const present = notes.filter((row): row is [string, string] => Boolean(row[1]))
  return present.length ? `<section class="panel notes-panel"><div class="section-heading"><h2>Grading Notes</h2></div>${present.map(([label, value]) => `<div><h3>${label}</h3><p>${html(value)}</p></div>`).join('')}</section>` : ''
}

function reportPage(card: SiteCard): string {
  const name = card.cardName || 'Unnamed Card', metadata = metadataRows(card)
  const fullPhotos = new Map(card.photos.filter(photo => photo.slot === 'full_front' || photo.slot === 'full_back').map(photo => [photo.slot!, photo]))
  const heroPhotos = (['full_front', 'full_back'] as PrimaryPhotoSlot[]).map(slot => {
    const photo = fullPhotos.get(slot)
    return photo ? photoFigure(photo, '../../', name) : photoPlaceholder(photoSlots[slot])
  }).join('')
  const subgrades: [string, number][] = [['Centering', card.inspection.centeringGrade], ['Corners', card.inspection.cornersGrade], ['Edges', card.inspection.edgesGrade], ['Surface', card.inspection.surfaceGrade]]
  const identity = [card.game, card.setName, card.cardNumber].filter(Boolean).map(value => `<span>${html(value!)}</span>`).join('')
  const body = `<main class="report"><div class="report-heading"><div><a href="../../index.html">Card Reports</a><span>/</span><span>${card.serial}</span><h1>Report #${card.serial}</h1><h2 class="card-title">${html(name)}</h2><div class="identity">${identity}</div></div></div>
  <div class="report-hero"><section class="panel full-card-panel"><div class="section-heading"><h2>Full Card</h2><span>Front and back</span></div><div class="hero-photos">${heroPhotos}</div></section><div class="grade-area"><section class="estimated"><span>Estimated Grade</span><strong>${grade(card.inspection.estimatedGrade)}</strong><small>Pre-grading assessment</small></section><div class="subgrades">${subgrades.map(([label, value]) => `<div><span>${label}</span><strong>${grade(value)}</strong></div>`).join('')}</div>${metadata ? `<section class="panel information"><div class="section-heading"><h2>Card Information</h2></div><dl>${metadata}</dl></section>` : ''}</div></div>
  ${centering(card)}<div class="photo-report-grid">${photoGroups(card)}</div>${defects(card)}${gradingNotes(card)}
  <dialog class="lightbox"><div class="lightbox-head"><strong></strong><button type="button" aria-label="Close photo viewer">×</button></div><div><img alt=""></div></dialog></main>`
  return page(`${name} — Report #${card.serial} — Cards Under Glass`, '../../', body, 'report-page')
}

function cataloguePage(cards: SiteCard[]): string {
  const entries = cards.map(card => {
    const front = card.photos.find(photo => photo.slot === 'full_front')
    const search = [card.serial, card.cardName, card.cardNumber, card.game, card.setName, card.variant].filter(Boolean).join(' ').toLowerCase()
    return `<article class="catalogue-card" data-serial="${card.serial}" data-search="${attr(search)}"><a href="cards/${card.serial}/index.html"><div class="catalogue-image">${front?.catalogue ? `<img src="${attr(front.catalogue)}" alt="Front photograph for ${attr(card.cardName || `Report ${card.serial}`)}" loading="lazy" decoding="async" width="420" height="420">` : '<div class="catalogue-placeholder"><span>◇</span><small>No front photo</small></div>'}</div><div class="catalogue-copy"><span class="report-number">Report #${card.serial}</span><h2>${html(card.cardName || 'Unnamed Card')}</h2>${card.game || card.setName ? `<p>${[card.game, card.setName].filter(Boolean).map(value => html(value!)).join(' · ')}</p>` : ''}<div><span>Estimated Grade</span><strong>${grade(card.inspection.estimatedGrade)}</strong></div></div></a></article>`
  }).join('')
  const body = `<main class="catalogue"><div class="catalogue-heading"><h1>Card Reports</h1></div><label class="search"><span>Search reports</span><input type="search" autocomplete="off" placeholder="Serial, card name, set…" aria-controls="report-list"><small class="result-count">${cards.length} ${cards.length === 1 ? 'report' : 'reports'}</small></label><section id="report-list" class="catalogue-grid" aria-live="polite">${entries}</section><p class="no-results" hidden>No matching reports.</p></main>`
  return page('Card Reports — Cards Under Glass', './', body, 'catalogue-page')
}

const siteScript = `(() => {
  const input = document.querySelector('.search input');
  if (input) {
    const cards = [...document.querySelectorAll('.catalogue-card')], count = document.querySelector('.result-count'), empty = document.querySelector('.no-results');
    const normalizeDigits = value => value.replace(/\\D/g, '').replace(/^0+/, '') || '0';
    const update = () => {
      const query = input.value.trim().toLowerCase(), digitsOnly = /^\\d+$/.test(query), queryDigits = digitsOnly ? normalizeDigits(query) : '';
      const ranked = cards.map((card, order) => {
        const serial = card.dataset.serial, searchable = card.dataset.search;
        let score = query ? (searchable.includes(query) ? 20 : -1) : 0;
        if (digitsOnly && normalizeDigits(serial) === queryDigits) score = 100;
        else if (query && serial.includes(query)) score = Math.max(score, 60);
        card.hidden = score < 0;
        return { card, score, order };
      }).sort((a, b) => b.score - a.score || a.order - b.order);
      const list = document.querySelector('#report-list'); ranked.forEach(item => list.append(item.card));
      const visible = ranked.filter(item => item.score >= 0).length;
      count.textContent = visible + (visible === 1 ? ' report' : ' reports'); empty.hidden = visible !== 0;
    };
    input.addEventListener('input', update);
  }
  const dialog = document.querySelector('.lightbox');
  if (dialog) {
    const image = dialog.querySelector('img'), label = dialog.querySelector('.lightbox-head strong');
    document.querySelectorAll('[data-lightbox-src]').forEach(button => button.addEventListener('click', () => {
      image.src = button.dataset.lightboxSrc; image.alt = button.dataset.lightboxLabel; label.textContent = button.dataset.lightboxLabel; dialog.showModal();
    }));
    dialog.querySelector('button').addEventListener('click', () => dialog.close());
    dialog.addEventListener('click', event => { if (event.target === dialog) dialog.close(); });
  }
  const markers = [...document.querySelectorAll('[data-defect]')];
  const selectDefect = number => {
    markers.forEach(marker => { const active = marker.dataset.defect === number; marker.classList.toggle('active', active); marker.setAttribute('aria-pressed', String(active)); });
    document.querySelectorAll('[data-defect-detail]').forEach(detail => detail.classList.toggle('active', detail.dataset.defectDetail === number));
  };
  markers.forEach(marker => marker.addEventListener('click', () => selectDefect(marker.dataset.defect)));
  if (markers.length) selectDefect(markers[0].dataset.defect);
})();
`

const siteCss = `:root{color-scheme:dark;--bg:#091016;--panel:#0d1720;--line:#263642;--muted:#91a0ac;--text:#e7edf1;--accent:#e7b663;--focus:#8ec5dd}*{box-sizing:border-box}html{background:var(--bg)}body{margin:0;background:var(--bg);color:var(--text);font-family:ui-serif,Georgia,Cambria,"Times New Roman",serif;line-height:1.45}.site-header{height:64px;border-bottom:1px solid var(--line);display:flex;align-items:center;gap:46px;padding:0 clamp(20px,4vw,58px);position:relative}.wordmark{font-size:25px;color:var(--text);text-decoration:none}.reports-link{color:#bbc6cd;text-decoration:none;font-size:14px}footer{margin:28px clamp(20px,4vw,58px) 0;padding:22px 0 34px;border-top:1px solid var(--line);color:#9aa7b0;font-size:13px}.catalogue,.report{width:min(1420px,calc(100% - 40px));margin:0 auto}.catalogue-heading{padding:54px 0 25px}.catalogue-heading>span,.report-number{font:600 11px ui-sans-serif,system-ui;letter-spacing:.16em;text-transform:uppercase;color:#8fa1ad}.catalogue h1,.report h1{font-weight:400;letter-spacing:-.025em}.catalogue h1{font-size:clamp(35px,6vw,62px);margin:7px 0}.search{display:grid;grid-template-columns:1fr auto;align-items:end;gap:8px 20px;border-bottom:1px solid var(--line);padding-bottom:24px;font-family:ui-sans-serif,system-ui}.search>span{grid-column:1/-1;font-size:12px;color:#aab6be}.search input{min-width:0;background:#0b141b;border:1px solid #30424e;border-radius:6px;color:var(--text);font:15px ui-sans-serif,system-ui;padding:14px 16px;outline:none}.search input:focus{border-color:var(--focus);box-shadow:0 0 0 3px #8ec5dd22}.search small{color:var(--muted)}.catalogue-grid{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:16px;padding:28px 0}.catalogue-card{border:1px solid var(--line);background:var(--panel);border-radius:7px;overflow:hidden}.catalogue-card a{display:block;color:inherit;text-decoration:none;height:100%}.catalogue-card a:focus-visible,.photo-open:focus-visible,.defect-marker:focus-visible,.lightbox button:focus-visible{outline:2px solid var(--focus);outline-offset:3px}.catalogue-image{height:240px;background:#071016;display:grid;place-items:center}.catalogue-image img{width:100%;height:100%;object-fit:contain}.catalogue-placeholder{display:grid;place-items:center;gap:10px;color:#778791}.catalogue-placeholder span{font-size:34px}.catalogue-copy{padding:17px}.catalogue-copy h2{font-size:20px;font-weight:400;margin:7px 0 2px}.catalogue-copy p{color:var(--muted);font-size:12px;margin:0}.catalogue-copy>div{display:flex;justify-content:space-between;align-items:end;margin-top:17px;padding-top:13px;border-top:1px solid var(--line);font-family:ui-sans-serif,system-ui}.catalogue-copy>div span{font-size:10px;color:var(--muted)}.catalogue-copy>div strong{font:500 24px ui-serif,Georgia;color:var(--accent)}.no-results{text-align:center;color:var(--muted);padding:50px}.report-heading{padding:25px 2px 18px;border-bottom:1px solid var(--line)}.report-heading>div>a,.report-heading>div>span{font:11px ui-sans-serif,system-ui;color:var(--muted);text-decoration:none;margin-right:9px}.report h1{font-size:clamp(30px,4vw,48px);margin:8px 0 0}.card-title{font-size:18px;margin:2px 0}.identity{display:flex;flex-wrap:wrap;gap:0;margin-top:5px;color:#b8c3cb}.identity span+span:before{content:"|";color:#50616e;margin:0 11px}.panel{border:1px solid var(--line);background:var(--panel);border-radius:6px}.report-hero{display:grid;grid-template-columns:minmax(360px,.85fr) minmax(520px,1.4fr);gap:12px;margin-top:14px}.full-card-panel{padding:14px}.hero-photos{display:grid;grid-template-columns:1fr 1fr;gap:12px}.grade-area{display:grid;grid-template-columns:1fr;gap:12px}.estimated{min-height:150px;border:1px solid #9b793c;background:#0d1720;border-radius:6px;display:grid;place-items:center;align-content:center}.estimated span,.estimated small{font:12px ui-sans-serif,system-ui;color:#c8d0d5}.estimated strong{font-size:72px;line-height:1;color:var(--accent);font-weight:400;margin:4px}.estimated small{font-size:9px;letter-spacing:.12em;text-transform:uppercase;color:#788a96}.subgrades{display:grid;grid-template-columns:repeat(4,1fr);gap:10px}.subgrades>div{border:1px solid var(--line);background:var(--panel);border-radius:6px;text-align:center;padding:16px 8px}.subgrades span{display:block;font:11px ui-sans-serif,system-ui;color:#b6c0c7}.subgrades strong{font-size:34px;font-weight:400}.information{padding:13px}.section-heading{display:flex;align-items:baseline;justify-content:space-between;border-bottom:1px solid var(--line);padding-bottom:8px;margin-bottom:9px}.section-heading h2{font-size:18px;font-weight:400;margin:0}.section-heading span{font:10px ui-sans-serif,system-ui;color:var(--muted)}.information dl{margin:0}.information dl div{display:grid;grid-template-columns:180px 1fr;border-bottom:1px solid #1d2b35;padding:4px}.information dl div:last-child{border:0}.information dt,.information dd{margin:0;font-size:12px}.information dt{color:var(--muted)}.centering-panel,.defects-panel,.notes-panel,.photo-section{padding:14px;margin-top:12px}.centering-content{display:grid;grid-template-columns:1.3fr .7fr;gap:20px}.ratios>div,.raw>div,.skew{display:flex;justify-content:space-between;gap:20px;padding:6px;border-bottom:1px solid #1e2b34}.ratios span,.raw span,.skew span{color:#aab6be}.ratios small,.skew small{display:block;font:9px ui-sans-serif,system-ui;color:#667985}.ratios strong,.raw strong,.skew strong{font-weight:400}.skew{border-top:1px solid #50616d;border-bottom:0;margin-top:8px;padding-top:12px}.raw{border-left:1px solid var(--line);padding-left:20px}.raw h3{font-size:13px;font-weight:400;margin:2px 6px 7px}.raw>div{font-size:11px}.defect-grid{display:grid;grid-template-columns:minmax(300px,.8fr) 1.4fr;gap:24px}.maps{display:flex;justify-content:center;gap:18px}.public-map-wrap>span{display:block;text-align:center;font:10px ui-sans-serif,system-ui;color:var(--muted);margin-bottom:7px}.public-map{position:relative;width:145px;aspect-ratio:2.5/3.5;border:1px solid #6b7a84;border-radius:9px;background:#111d25;box-shadow:inset 0 0 0 7px #0a1218,inset 0 0 0 8px #354653}.public-map:after{content:"";position:absolute;inset:25px 17px;border:1px solid #334652;border-radius:5px}.defect-marker{position:absolute;z-index:1;transform:translate(-50%,-50%);width:28px;height:28px;padding:0;border:2px solid #0b1217;border-radius:50%;background:#b84945;color:white;font:700 11px ui-sans-serif,system-ui}.defect-marker.active{box-shadow:0 0 0 3px #efc26c;background:#d45b51}.defect-detail{padding:10px;border:1px solid transparent;border-radius:6px}.defect-detail+.defect-detail{margin-top:6px}.defect-detail.active{border-color:#8b6c3d;background:#101b22}.defect-heading{display:flex;align-items:center;gap:10px}.defect-heading>span{width:30px;height:30px;border-radius:50%;display:grid;place-items:center;background:#b84945;font:700 11px ui-sans-serif,system-ui}.defect-heading strong,.defect-heading small{display:block}.defect-heading small{font:9px ui-sans-serif,system-ui;color:var(--muted)}.defect-detail>p{white-space:pre-wrap;color:#d3dae0}.evidence{margin-top:16px;border-top:1px solid var(--line);padding-top:10px}.evidence h3{font-size:13px;font-weight:400}.evidence>div{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:10px}.no-defects{color:var(--muted);padding:30px;text-align:center}.photo-report-grid{display:grid;grid-template-columns:1fr 1fr;gap:12px}.photo-section:first-child{grid-column:1/-1}.full-photos,.detail-photos{display:grid;gap:10px}.full-photos{grid-template-columns:1fr 1fr}.detail-photos{grid-template-columns:1fr 1fr}.photo{margin:0;min-width:0}.photo-open{position:relative;width:100%;height:260px;padding:0;border:1px solid #334550;border-radius:6px;background:#071016;overflow:hidden;color:var(--text)}.detail-photos .photo-open{height:180px}.photo-open img{width:100%;height:100%;object-fit:contain}.photo-open>span{position:absolute;right:7px;bottom:7px;background:#071016df;border:1px solid #40535f;border-radius:12px;padding:4px 8px;font:9px ui-sans-serif,system-ui}.photo figcaption{font-size:12px;color:#bdc7cd;padding:5px 2px}.placeholder>div{height:260px;border:1px dashed #3c4e59;border-radius:6px;display:grid;place-items:center;align-content:center;gap:5px;color:#73848e;background:#0a131a}.detail-photos .placeholder>div{height:180px}.placeholder strong{font-weight:400;color:#98a7b0}.placeholder small{font:9px ui-sans-serif,system-ui}.placeholder-mark{font-size:24px}.evidence-photo .photo-open{height:145px}.notes-panel>div:not(.section-heading){display:grid;grid-template-columns:130px 1fr;gap:20px;padding:10px 4px;border-bottom:1px solid #1e2b34}.notes-panel>div:last-child{border:0}.notes-panel h3,.notes-panel p{margin:0}.notes-panel h3{font-size:14px;font-weight:400}.notes-panel p{white-space:pre-wrap;color:#d3dae0}.lightbox{width:min(1200px,calc(100% - 32px));height:min(90vh,940px);padding:0;border:1px solid #425560;border-radius:8px;background:#081016;color:var(--text)}.lightbox::backdrop{background:#020609e8}.lightbox-head{height:54px;display:flex;justify-content:space-between;align-items:center;padding:0 16px;border-bottom:1px solid var(--line)}.lightbox-head button{font-size:23px;background:transparent;border:0;color:white}.lightbox>div:last-child{height:calc(100% - 54px);display:grid;place-items:center;padding:16px;overflow:auto}.lightbox img{max-width:100%;max-height:100%;object-fit:contain}@media(max-width:1050px){.catalogue-grid{grid-template-columns:repeat(3,1fr)}.report-hero{grid-template-columns:1fr}.hero-photos{min-height:420px}.photo-report-grid{grid-template-columns:1fr}.photo-section:first-child{grid-column:auto}}@media(max-width:760px){.site-header{height:56px;padding:0 18px}.wordmark{font-size:20px}.catalogue,.report{width:min(100% - 24px,1420px)}.catalogue-grid{grid-template-columns:1fr 1fr}.catalogue-image{height:190px}.search{grid-template-columns:1fr}.subgrades{grid-template-columns:1fr 1fr}.centering-content,.defect-grid{grid-template-columns:1fr}.raw{border-left:0;border-top:1px solid var(--line);padding:12px 0 0}.maps{gap:10px}.public-map{width:min(39vw,145px)}.hero-photos,.full-photos{grid-template-columns:1fr}.hero-photos{min-height:0}.photo-open,.placeholder>div{height:300px}.evidence>div{grid-template-columns:1fr 1fr}}@media(max-width:480px){.catalogue-grid{grid-template-columns:1fr}.site-header{justify-content:space-between;gap:10px}.catalogue-heading{padding-top:35px}.report-heading{padding-top:18px}.estimated strong{font-size:62px}.subgrades strong{font-size:28px}.information dl div{grid-template-columns:1fr}.information dd{margin-top:2px}.maps{align-items:center;flex-direction:column}.detail-photos,.evidence>div{grid-template-columns:1fr}.notes-panel>div:not(.section-heading){grid-template-columns:1fr;gap:5px}}@media(prefers-reduced-motion:reduce){*{scroll-behavior:auto!important}}
`

const catalogueCssPolish = `.catalogue-grid{grid-template-columns:repeat(auto-fill,minmax(min(250px,100%),1fr));gap:18px}.catalogue-image{position:relative;width:100%;height:auto;aspect-ratio:4/3;overflow:hidden}.catalogue-image img,.catalogue-placeholder{position:absolute;inset:0;width:100%;height:100%}.card-title{font-size:clamp(25px,2.35vw,34px);font-weight:500;line-height:1.15;letter-spacing:-.015em;margin:5px 0 4px;color:var(--text)}`

interface PlannedImage {
  sourcePath: string
  targets: PublicImageTargets
}

interface PlannedReport {
  snapshot: PublicCardSnapshot
  writeReport: boolean
  writeSnapshot: boolean
  images: PlannedImage[]
}

function sameFiles(first: string[], second: string[]): boolean {
  return first.length === second.length && first.every((path, index) => path === second[index])
}

function reusableFile(output: string, path: string, previousManaged: Set<string>): boolean {
  if (!previousManaged.has(path)) return false
  assertNoSymlinkParents(output, path)
  const target = ownedPath(output, path)
  return existsSync(target) && lstatSync(target).isFile() && !lstatSync(target).isSymbolicLink()
}

function pathSerial(path: string): string | null {
  return /^(?:cards|media)\/(\d{10})(?:\/|$)/.exec(path)?.[1] ?? null
}

function legacyReports(previous: PreviousOwnership | null): Map<string, LegacyReportManifest> {
  return new Map(previous?.formatVersion === 1 && previous.reports ? previous.reports.map(report => [report.serial, report]) : [])
}

function previousManagedFiles(output: string, previous: PreviousOwnership | null, snapshots: Map<string, PublicCardSnapshot>, library: Library): { files: Set<string>; warnings: string[] } {
  const files = new Set<string>(), warnings: string[] = []
  for (const snapshot of snapshots.values()) for (const path of snapshotFiles(snapshot)) files.add(path)
  if (previous?.formatVersion === 2) for (const path of previous.ownedFiles) files.add(path)
  else if (previous?.formatVersion === 1) {
    const unattributed = new Set<string>()
    for (const path of previous.ownedFiles) {
      const serial = pathSerial(path)
      if (!serial || library.hasReservedSerial(serial)) files.add(path)
      else unattributed.add(serial)
    }
    if (unattributed.size) warnings.push(`${unattributed.size} older ${unattributed.size === 1 ? 'report was' : 'reports were'} preserved because publication ownership could not be attributed safely.`)
  } else if (snapshots.size) {
    for (const path of GLOBAL_FILES) if (existsSync(ownedPath(output, path))) files.add(path)
  }
  return { files, warnings }
}

export async function generatePublicSite(
  library: Library,
  output: string,
  applicationVersion: string,
  reporter?: ProgressReporter,
  imageWriter: PublicImageWriter = writePublicImages,
  options: PublicSiteGenerationOptions = {}
): Promise<PublicSiteGenerated> {
  const destination = resolve(output)
  if (!existsSync(destination) || !lstatSync(destination).isDirectory() || lstatSync(destination).isSymbolicLink()) throw new Error('Choose an existing local folder for the generated public site.')
  const mode = options.mode ?? 'update'
  const reportFormatVersion = options.reportFormatVersion ?? REPORT_FORMAT_VERSION
  const imagePipelineVersion = options.imagePipelineVersion ?? IMAGE_PIPELINE_VERSION
  if ((mode !== 'update' && mode !== 'rebuild') || !isPositiveInteger(reportFormatVersion) || !isPositiveInteger(imagePipelineVersion)) throw new Error('Invalid public-site generation options.')
  const previous = previousOwnership(destination)
  const existingSnapshots = readExistingSnapshots(destination)
  const ownerKey = derivePublicOwnerKey(library.info().libraryId)
  const previousState = previousManagedFiles(destination, previous, existingSnapshots, library)
  const previousManaged = previousState.files
  const previousReports = legacyReports(previous)
  const staging = mkdtempSync(join(dirname(destination), `.${basename(destination)}.cug-site-build-`))
  try {
    reporter?.({ stage: 'preparing', mode })
    const migratingLegacy = previous?.formatVersion === 1
    const sources = mode === 'update' || migratingLegacy ? library.publicSiteCards() : []
    for (const source of sources) {
      const published = existingSnapshots.get(source.serial)
      if (published && published.ownerKey !== ownerKey) throw new Error(`Report #${source.serial} is already published by another Cards Under Glass library. Check serial allocation ranges before publishing. The existing report was not changed.`)
    }
    const prepared: PreparedLocalCard[] = []
    for (const [index, source] of sources.entries()) {
      reporter?.({ stage: 'checking', mode, completed: index, total: sources.length })
      prepared.push(await prepareSiteCard(source, ownerKey, reportFormatVersion, imagePipelineVersion))
    }
    reporter?.({ stage: 'checking', mode, completed: sources.length, total: sources.length })

    const preservedFiles = new Set<string>()
    const plans: PlannedReport[] = []
    const summary = { newReports: 0, updatedReports: 0, removedReports: 0, unchangedReports: 0, rebuiltReports: 0 }
    const preparedBySerial = new Map(prepared.map(item => [item.snapshot.serial, item]))
    const finalSnapshots = new Map<string, PublicCardSnapshot>()
    if (mode === 'rebuild' && !migratingLegacy) for (const snapshot of existingSnapshots.values()) finalSnapshots.set(snapshot.serial, snapshot)
    else for (const snapshot of existingSnapshots.values()) if (snapshot.ownerKey !== ownerKey) finalSnapshots.set(snapshot.serial, snapshot)
    if (mode === 'update') summary.removedReports += [...existingSnapshots.values()].filter(snapshot => snapshot.ownerKey === ownerKey && !preparedBySerial.has(snapshot.serial)).length
    if (migratingLegacy) {
      const eligible = new Set(prepared.map(item => item.snapshot.serial))
      summary.removedReports += [...previousReports.keys()].filter(serial => library.hasReservedSerial(serial) && !eligible.has(serial)).length
    }

    for (const item of prepared) finalSnapshots.set(item.snapshot.serial, item.snapshot)

    for (const snapshot of [...finalSnapshots.values()].sort((a, b) => b.serial.localeCompare(a.serial))) {
      const local = preparedBySerial.get(snapshot.serial)
      const oldSnapshot = existingSnapshots.get(snapshot.serial)
      const oldReport = oldSnapshot ?? previousReports.get(snapshot.serial)
      let nextSnapshot = snapshot
      const reportFile = reportPath(snapshot.serial)
      const reportCurrent = mode === 'update' && oldReport?.publicFingerprint === snapshot.publicFingerprint && oldReport.reportFormatVersion === reportFormatVersion && reusableFile(destination, reportFile, previousManaged)
      const writeReport = mode === 'rebuild' || !reportCurrent
      if (!local && writeReport && snapshot.reportFormatVersion !== reportFormatVersion) nextSnapshot = { ...snapshot, reportFormatVersion }
      const images: PlannedImage[] = []
      for (const photo of nextSnapshot.card.photos) {
        const expected = photoFiles(photo).sort()
        if (!local) {
          for (const path of expected) {
            if (!reusableFile(destination, path, previousManaged)) throw new Error(`Published report #${snapshot.serial} is missing image data that this library cannot recreate.`)
            preservedFiles.add(path)
          }
          continue
        }
        const oldPhoto = oldSnapshot?.card.photos.find(candidate => candidate.assetKey === photo.assetKey) ?? (oldReport && 'photos' in oldReport ? oldReport.photos.find(candidate => candidate.assetKey === photo.assetKey) : undefined)
        const oldFiles = oldPhoto ? ('generatedFiles' in oldPhoto ? [...oldPhoto.generatedFiles].sort() : photoFiles(oldPhoto).sort()) : []
        const photoCurrent = mode === 'update' && oldPhoto?.contentFingerprint === photo.contentFingerprint && oldPhoto.imagePipelineVersion === imagePipelineVersion && sameFiles(oldFiles, expected)
        const needed = expected.filter(path => !photoCurrent || !reusableFile(destination, path, previousManaged))
        for (const path of expected) if (!needed.includes(path)) preservedFiles.add(path)
        if (needed.length && (mode === 'update' || migratingLegacy)) {
          const targets: PublicImageTargets = {}
          if (photo.catalogue && needed.includes(photo.catalogue)) targets.catalogue = ownedPath(staging, photo.catalogue)
          if (needed.includes(photo.preview)) targets.preview = ownedPath(staging, photo.preview)
          if (needed.includes(photo.large)) targets.large = ownedPath(staging, photo.large)
          for (const target of Object.values(targets)) if (target) mkdirSync(dirname(target), { recursive: true })
          const sourcePath = local.sourcePaths.get(photo.assetKey)
          if (!sourcePath) throw new Error(`The original photo required for public report #${snapshot.serial} is unavailable.`)
          images.push({ sourcePath, targets })
        } else if (needed.length) {
          throw new Error(`Published report #${snapshot.serial} is missing image data required for a presentation rebuild.`)
        }
      }

      const publicSnapshotFile = snapshotPath(snapshot.serial)
      const snapshotCurrent = oldSnapshot !== undefined && serializedSnapshot(oldSnapshot) === serializedSnapshot(nextSnapshot) && reusableFile(destination, publicSnapshotFile, previousManaged)
      if (snapshotCurrent) preservedFiles.add(publicSnapshotFile)
      if (reportCurrent) preservedFiles.add(reportFile)
      const fullyCurrent = reportCurrent && images.length === 0 && snapshotCurrent
      if (mode === 'rebuild') summary.rebuiltReports++
      else if (fullyCurrent) summary.unchangedReports++
      else if (!oldReport && !previousManaged.has(reportFile)) summary.newReports++
      else summary.updatedReports++
      plans.push({
        snapshot: nextSnapshot,
        writeReport,
        writeSnapshot: !snapshotCurrent,
        images
      })
    }

    const imageJobs = plans.flatMap(plan => plan.images)
    for (const [index, job] of imageJobs.entries()) {
      reporter?.({ stage: 'photos', mode, completed: index, total: imageJobs.length })
      await imageWriter(job.sourcePath, job.targets)
    }
    reporter?.({ stage: 'photos', mode, completed: imageJobs.length, total: imageJobs.length })

    const reportPlans = plans.filter(plan => plan.writeReport)
    for (const [index, plan] of reportPlans.entries()) {
      reporter?.({ stage: 'generating', mode, completed: index, total: reportPlans.length })
      write(staging, reportPath(plan.snapshot.serial), reportPage(snapshotSiteCard(plan.snapshot)))
    }
    reporter?.({ stage: 'generating', mode, completed: reportPlans.length, total: reportPlans.length })
    for (const plan of plans) if (plan.writeSnapshot) write(staging, snapshotPath(plan.snapshot.serial), serializedSnapshot(plan.snapshot))

    const cards = plans.map(plan => snapshotSiteCard(plan.snapshot)).sort((a, b) => b.serial.localeCompare(a.serial))
    reporter?.({ stage: 'search', mode })
    write(staging, 'assets/site.css', `${siteCss}\n.photo-section:first-child{grid-column:auto}\n${catalogueCssPolish}\n.public-centering-face+.public-centering-face{margin-top:20px;padding-top:16px;border-top:1px solid var(--line)}.legacy-centering h2{font-size:18px;font-weight:400}.legacy-centering p{color:var(--muted);font-size:12px}\n`)
    write(staging, 'assets/site.js', siteScript)
    write(staging, 'index.html', cataloguePage(cards))
    write(staging, 'data/reports.json', `${JSON.stringify(cards.map(card => ({
      serial: card.serial, cardName: card.cardName, cardNumber: card.cardNumber, game: card.game, set: card.setName,
      variant: card.variant, estimatedGrade: grade(card.inspection.estimatedGrade), url: `cards/${card.serial}/index.html`,
      frontThumbnail: card.photos.find(photo => photo.slot === 'full_front')?.catalogue ?? null
    })), null, 2)}\n`)
    write(staging, '.nojekyll', '')
    reporter?.({ stage: 'writing', mode })
    const globalFiles = [...GLOBAL_FILES]
    const desiredFiles = [...globalFiles, ...plans.flatMap(plan => snapshotFiles(plan.snapshot))].sort()
    const ownership: OwnershipManifestV2 = {
      generator: 'Cards Under Glass', formatVersion: 2, applicationVersion, ownedFiles: globalFiles,
      generationStateVersion: 2, reportFormatVersion, imagePipelineVersion
    }
    write(staging, SITE_OWNERSHIP_FILE, `${JSON.stringify(ownership, null, 2)}\n`)
    commitGeneratedSite(staging, destination, previousManaged, previous !== null, preservedFiles, desiredFiles)
    reporter?.({ stage: 'complete', mode, completed: cards.length, total: cards.length, summary })
    return { outputFolder: destination, reportCount: cards.length, mode, warnings: previousState.warnings, ...summary }
  } finally { rmSync(staging, { recursive: true, force: true }) }
}
