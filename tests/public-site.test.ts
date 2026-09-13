import { createHash } from 'node:crypto'
import { DatabaseSync } from 'node:sqlite'
import { createServer } from 'node:http'
import { test, type TestContext } from 'node:test'
import assert from 'node:assert/strict'
import { cpSync, existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, statSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { extname, join, normalize } from 'node:path'
import sharp from 'sharp'
import { Library, type ThumbnailWriter } from '../src/main/library'
import { createLibraryArchive, restoreLibraryArchive } from '../src/main/archive'
import {
  derivePublicOwnerKey, fingerprintPublicCard, generatePublicSite, IMAGE_PIPELINE_VERSION, PUBLIC_SNAPSHOT_FORMAT_VERSION,
  REPORT_FORMAT_VERSION, SITE_FORMAT_VERSION, SITE_OWNERSHIP_FILE, type PublicCardSnapshot, type PublicImageTargets, type PublicImageWriter
} from '../src/main/public-site'
import type { PublicCardSource } from '../src/main/public-model'
import { fields, gradeFields, measurementFields, measurementPositions, type Inspection, type Metadata, type PrimaryPhotoSlot } from '../src/shared/contracts'

const blankMetadata = (): Metadata => Object.fromEntries(Object.keys(fields).map(key => [key, null])) as Metadata

function complete(inspection: Inspection): Inspection {
  const result = { ...inspection }
  for (const key of Object.keys(gradeFields) as (keyof typeof gradeFields)[]) result[key] = 95
  for (const key of Object.keys(measurementFields) as (keyof typeof measurementFields)[]) result[key] = 200
  result.frontVerticalLeftBottom = 300
  result.centeringNote = 'Centered <carefully> & checked'
  result.surfaceNote = 'Print line near the lower edge'
  return result
}

function fixture(t: TestContext): { root: string; libraryFolder: string; output: string; lib: Library; image(name: string, content?: string): string } {
  const root = mkdtempSync(join(tmpdir(), 'cug-public-site-'))
  const libraryFolder = join(root, 'library'), output = join(root, 'site')
  mkdirSync(libraryFolder); mkdirSync(output)
  const thumbnail: ThumbnailWriter = async (source, destination) => writeFileSync(destination, Buffer.concat([Buffer.from('thumbnail:'), readFileSync(source)]))
  const lib = new Library(libraryFolder, 'installation-a', true, thumbnail)
  lib.configure({ name: 'Public test desk', start: 1, end: 50000, next: 1 })
  t.after(() => { try { lib.close() } catch { /* already closed */ } rmSync(root, { recursive: true, force: true }) })
  return {
    root, libraryFolder, output, lib,
    image(name, content = name) { const path = join(root, name); writeFileSync(path, content); return path }
  }
}

function saveAndFinalize(lib: Library, metadata: Metadata, inspectionTransform: (value: Inspection) => Inspection = complete): ReturnType<Library['get']> {
  const created = lib.create()
  const card = lib.save(created.card.id, created.card.revision, metadata)
  const inspected = lib.saveInspection(card.id, card.revision, inspectionTransform(created.inspection))
  return lib.finalize(card.id, inspected.card.revision)
}

const fakeImages: PublicImageWriter = async (source, targets) => {
  const bytes = readFileSync(source)
  if (targets.catalogue) writeFileSync(targets.catalogue, Buffer.concat([Buffer.from('public-catalogue:'), bytes]))
  if (targets.preview) writeFileSync(targets.preview, Buffer.concat([Buffer.from('public-preview:'), bytes]))
  if (targets.large) writeFileSync(targets.large, Buffer.concat([Buffer.from('public-large:'), bytes]))
}

function publicText(root: string, relative = ''): string {
  let result = ''
  for (const name of readdirSync(join(root, relative))) {
    const child = relative ? `${relative}/${name}` : name, path = join(root, child)
    if (statSync(path).isDirectory()) result += publicText(root, child)
    else if (['.html', '.json', '.js', '.css', ''].includes(extname(path))) result += `\n${readFileSync(path, 'utf8')}`
  }
  return result
}

function assertReportSectionOrder(report: string): void {
  const headings = ['Centering Front', 'Centering Back', 'Corners', 'Edges', 'Defect Map'].map(label => `<h2>${label}</h2>`)
  for (const heading of headings) assert.equal(report.split(heading).length - 1, 1, `${heading} appears exactly once`)
  for (let index = 1; index < headings.length; index++) assert.ok(report.indexOf(headings[index]) > report.indexOf(headings[index - 1]), `${headings[index]} follows ${headings[index - 1]}`)
}

test('report format 3 reorders the defect section without changing snapshots or processing images', async t => {
  const { lib, output, image } = fixture(t)
  const card = saveAndFinalize(lib, { ...blankMetadata(), cardName: 'Report version upgrade' })
  const marker = lib.addMarker(card.card.id, 'front', 0.25, 0.75)
  lib.saveMarker(marker.id, 'Evidence note')
  let detail = await lib.importPhotos(card.card.id, 'corner_top_left', [image('corner.jpg')])
  detail = await lib.importPhotos(card.card.id, 'edge_top', [image('edge.jpg')])
  lib.setPhotoMarkers(detail.photos.find(photo => photo.slot === 'edge_top')!.id, [marker.id])
  await generatePublicSite(lib, output, 'test', undefined, fakeImages, { reportFormatVersion: 2 })
  const snapshotPath = join(output, 'data/cards', card.card.serial + '.json')
  const before = JSON.parse(readFileSync(snapshotPath, 'utf8')) as PublicCardSnapshot
  const media = before.card.photos.flatMap(photo => [photo.preview, photo.large])
  const mediaTimes = media.map(file => statSync(join(output, file), { bigint: true }).mtimeNs)
  writeFileSync(join(output, 'cards', card.card.serial, 'index.html'), 'previous report presentation')
  let imageWrites = 0
  const result = await generatePublicSite(lib, output, 'test', undefined, async (...args) => { imageWrites++; await fakeImages(...args) })
  assert.equal(result.updatedReports, 1); assert.equal(imageWrites, 0)
  const after = JSON.parse(readFileSync(snapshotPath, 'utf8')) as PublicCardSnapshot
  assert.equal(after.reportFormatVersion, 3); assert.equal(after.imagePipelineVersion, before.imagePipelineVersion)
  assert.equal(after.snapshotFormatVersion, before.snapshotFormatVersion); assert.equal(after.publicSchemaVersion, before.publicSchemaVersion)
  assert.equal(after.publicFingerprint, before.publicFingerprint); assert.deepEqual(after.card, before.card)
  assert.deepEqual(media.map(file => statSync(join(output, file), { bigint: true }).mtimeNs), mediaTimes)
  const report = readFileSync(join(output, 'cards', card.card.serial, 'index.html'), 'utf8')
  assertReportSectionOrder(report); assert.match(report, /Evidence note/); assert.match(report, /Linked evidence/)
  assert.equal(report.match(/class="defect-marker"/g)?.length, 1)
  assert.equal(report.match(/data-defect-detail="1"/g)?.length, 1)
})

test('public fingerprints cover public report data and photo content but exclude private metadata', async t => {
  const { lib, image } = fixture(t)
  const metadata = { ...blankMetadata(), cardName: 'Fingerprint card', game: 'Pokémon', submittedBy: 'Private owner A', notes: 'Private note A' }
  const saved = saveAndFinalize(lib, metadata)
  const marker = lib.addMarker(saved.card.id, 'front', 0.25, 0.75)
  lib.saveMarker(marker.id, 'Small line')
  let detail = await lib.importPhotos(saved.card.id, 'full_front', [image('fingerprint-front.png', 'front-one')])
  detail = await lib.importPhotos(saved.card.id, null, [image('fingerprint-evidence.png', 'evidence-one')])
  const evidence = detail.photos.find(photo => photo.slot === null)!
  lib.savePhotoTitle(evidence.id, 'Raking light')
  lib.setPhotoMarkers(evidence.id, [marker.id])
  const source = lib.publicSiteCards()[0]
  const baseline = await fingerprintPublicCard(source)
  assert.equal(await fingerprintPublicCard(source), baseline)

  const changed = async (value: PublicCardSource): Promise<void> => assert.notEqual(await fingerprintPublicCard(value), baseline)
  await changed({ ...source, cardName: 'Changed public name' })
  await changed({ ...source, inspection: { ...source.inspection, surfaceGrade: 90 } })
  await changed({ ...source, inspection: { ...source.inspection, frontVerticalLeftTop: 225 } })
  await changed({ ...source, inspection: { ...source.inspection, backVerticalLeftTop: 225 } })
  await changed({ ...source, markers: source.markers.map((value, index) => index ? value : { ...value, x: 0.5, note: 'Changed marker' }) })
  await changed({ ...source, photos: source.photos.map(photo => photo.slot === null ? { ...photo, title: 'New evidence title' } : photo) })
  await changed({ ...source, photos: source.photos.map(photo => photo.slot === null ? { ...photo, markerSourceIds: [] } : photo) })
  const replacement = image('fingerprint-replacement.png', 'different-photo-content')
  await changed({ ...source, photos: source.photos.map(photo => photo.slot === 'full_front' ? { ...photo, sourcePath: replacement } : photo) })

  const current = lib.get(saved.card.id)
  lib.save(saved.card.id, current.card.revision, { ...metadata, submittedBy: 'Private owner B', notes: 'Private note B' })
  assert.equal(await fingerprintPublicCard(lib.publicSiteCards()[0]), baseline)
})

test('incremental updates reuse unchanged reports and images while tracking eligibility changes', async t => {
  const { lib, output, image } = fixture(t)
  const metadataA = { ...blankMetadata(), cardName: 'Incremental A', submittedBy: 'PRIVATE_INCREMENTAL_A', notes: 'PRIVATE_INCREMENTAL_NOTE_A' }
  const metadataB = { ...blankMetadata(), cardName: 'Incremental B' }
  const first = saveAndFinalize(lib, metadataA), second = saveAndFinalize(lib, metadataB)
  await lib.importPhotos(first.card.id, 'full_front', [image('incremental-front.png', 'front-v1')])
  await lib.importPhotos(second.card.id, 'corner_top_left', [image('incremental-corner.png', 'corner-v1')])
  const calls: { source: string; targets: PublicImageTargets }[] = []
  const writer: PublicImageWriter = async (source, targets) => { calls.push({ source, targets: { ...targets } }); await fakeImages(source, targets) }

  const initial = await generatePublicSite(lib, output, '1.0.0', undefined, writer)
  assert.deepEqual(initial, {
    outputFolder: output, reportCount: 2, mode: 'update', newReports: 2, updatedReports: 0,
    removedReports: 0, unchangedReports: 0, rebuiltReports: 0, warnings: []
  })
  assert.equal(calls.length, 2)
  const firstReport = join(output, 'cards', first.card.serial, 'index.html')
  const secondReport = join(output, 'cards', second.card.serial, 'index.html')
  const firstMtime = statSync(firstReport, { bigint: true }).mtimeNs
  const secondMtime = statSync(secondReport, { bigint: true }).mtimeNs

  const unchanged = await generatePublicSite(lib, output, '1.0.1', undefined, writer)
  assert.equal(unchanged.unchangedReports, 2)
  assert.equal(unchanged.updatedReports, 0)
  assert.equal(calls.length, 2)
  assert.equal(statSync(firstReport, { bigint: true }).mtimeNs, firstMtime)
  assert.equal(statSync(secondReport, { bigint: true }).mtimeNs, secondMtime)

  const currentA = lib.get(first.card.id)
  lib.save(first.card.id, currentA.card.revision, { ...metadataA, cardName: 'Incremental A changed' })
  const metadataUpdate = await generatePublicSite(lib, output, '1.0.1', undefined, writer)
  assert.equal(metadataUpdate.updatedReports, 1); assert.equal(metadataUpdate.unchangedReports, 1)
  assert.equal(calls.length, 2)
  assert.equal(statSync(secondReport, { bigint: true }).mtimeNs, secondMtime)
  assert.match(readFileSync(firstReport, 'utf8'), /Incremental A changed/)

  await lib.importPhotos(first.card.id, 'full_front', [image('incremental-front-replacement.png', 'front-v2')])
  const photoUpdate = await generatePublicSite(lib, output, '1.0.1', undefined, writer)
  assert.equal(photoUpdate.updatedReports, 1); assert.equal(photoUpdate.unchangedReports, 1)
  assert.equal(calls.length, 3)
  assert.deepEqual(Object.keys(calls.at(-1)!.targets).sort(), ['catalogue', 'large', 'preview'])

  await lib.importPhotos(second.card.id, 'corner_top_left', [image('incremental-corner-replacement.png', 'corner-v2')])
  const cornerUpdate = await generatePublicSite(lib, output, '1.0.1', undefined, writer)
  assert.equal(cornerUpdate.updatedReports, 1); assert.equal(cornerUpdate.unchangedReports, 1)
  assert.equal(calls.length, 4)
  assert.deepEqual(Object.keys(calls.at(-1)!.targets).sort(), ['large', 'preview'])

  const missingPreview = join(output, 'media', second.card.serial, 'corner-top-left-preview.webp')
  rmSync(missingPreview)
  const repaired = await generatePublicSite(lib, output, '1.0.1', undefined, writer)
  assert.equal(repaired.updatedReports, 1); assert.equal(repaired.unchangedReports, 1)
  assert.equal(calls.length, 5)
  assert.deepEqual(Object.keys(calls.at(-1)!.targets), ['preview'])
  assert.equal(existsSync(missingPreview), true)

  const third = saveAndFinalize(lib, { ...blankMetadata(), cardName: 'Incremental C' })
  const added = await generatePublicSite(lib, output, '1.0.1', undefined, writer)
  assert.equal(added.newReports, 1); assert.equal(added.unchangedReports, 2)
  assert.equal(existsSync(join(output, 'cards', third.card.serial, 'index.html')), true)

  const latestB = lib.get(second.card.id)
  lib.setIncludePublic(second.card.id, latestB.card.revision, false)
  const removed = await generatePublicSite(lib, output, '1.0.1', undefined, writer)
  assert.equal(removed.removedReports, 1)
  assert.equal(existsSync(join(output, 'cards', second.card.serial)), false)
  assert.equal(existsSync(join(output, 'media', second.card.serial)), false)
  assert.doesNotMatch(readFileSync(join(output, 'data/reports.json'), 'utf8'), new RegExp(second.card.serial))

  const latestA = lib.get(first.card.id)
  const pending = lib.saveInspection(first.card.id, latestA.card.revision, { ...latestA.inspection, surfaceGrade: 88 })
  const pendingRemoval = await generatePublicSite(lib, output, '1.0.1', undefined, writer)
  assert.equal(pendingRemoval.removedReports, 1)
  assert.equal(existsSync(firstReport), false)
  lib.finalize(first.card.id, pending.card.revision)
  const returned = await generatePublicSite(lib, output, '1.0.1', undefined, writer)
  assert.equal(returned.newReports, 1)
  assert.equal(calls.length, 6)

  const beforePrivateEdit = statSync(firstReport, { bigint: true }).mtimeNs
  const latestPrivate = lib.get(first.card.id)
  lib.save(first.card.id, latestPrivate.card.revision, { ...metadataA, cardName: 'Incremental A changed', submittedBy: 'PRIVATE_INCREMENTAL_B', notes: 'PRIVATE_INCREMENTAL_NOTE_B' })
  const privateOnly = await generatePublicSite(lib, output, '1.0.1', undefined, writer)
  assert.equal(privateOnly.unchangedReports, 2)
  assert.equal(privateOnly.updatedReports, 0)
  assert.equal(calls.length, 6)
  assert.equal(statSync(firstReport, { bigint: true }).mtimeNs, beforePrivateEdit)
  const manifest = readFileSync(join(output, SITE_OWNERSHIP_FILE), 'utf8')
  assert.doesNotMatch(manifest, /PRIVATE_INCREMENTAL_[AB]|PRIVATE_INCREMENTAL_NOTE_[AB]/)
})

test('incremental manifest upgrades safely, versions invalidate the right work, and rebuild bypasses reuse', async t => {
  const { lib, output, image } = fixture(t)
  mkdirSync(join(output, '.git')); writeFileSync(join(output, '.git/config'), 'user git data')
  writeFileSync(join(output, 'CNAME'), 'cards.example.test')
  const card = saveAndFinalize(lib, { ...blankMetadata(), cardName: 'Versioned report' })
  await lib.importPhotos(card.card.id, 'full_front', [image('versioned-front.png', 'versioned-photo')])
  let calls = 0
  const writer: PublicImageWriter = async (source, targets) => { calls++; await fakeImages(source, targets) }
  await generatePublicSite(lib, output, '1.0.0', undefined, writer)
  assert.equal(calls, 1)

  const snapshot = JSON.parse(readFileSync(join(output, 'data/cards', `${card.card.serial}.json`), 'utf8')) as PublicCardSnapshot
  const photo = snapshot.card.photos[0]
  const generatedFiles = [`cards/${card.card.serial}/index.html`, ...[photo.catalogue, photo.preview, photo.large].filter((path): path is string => Boolean(path))].sort()
  const oldManifest = {
    generator: 'Cards Under Glass', formatVersion: 1, applicationVersion: '1.0.0',
    ownedFiles: ['.nojekyll', 'assets/site.css', 'assets/site.js', 'data/reports.json', 'index.html', ...generatedFiles].sort(),
    generationStateVersion: 1, reportFormatVersion: REPORT_FORMAT_VERSION, imagePipelineVersion: IMAGE_PIPELINE_VERSION,
    reports: [{
      serial: card.card.serial, publicFingerprint: snapshot.publicFingerprint, reportFormatVersion: REPORT_FORMAT_VERSION,
      imagePipelineVersion: IMAGE_PIPELINE_VERSION, generatedFiles,
      photos: [{ assetKey: photo.assetKey, contentFingerprint: photo.contentFingerprint, imagePipelineVersion: IMAGE_PIPELINE_VERSION, generatedFiles: generatedFiles.filter(path => path.startsWith('media/')) }]
    }, {
      serial: '9999999999', publicFingerprint: 'a'.repeat(64), reportFormatVersion: REPORT_FORMAT_VERSION,
      imagePipelineVersion: IMAGE_PIPELINE_VERSION, generatedFiles: ['cards/9999999999/index.html'], photos: []
    }]
  }
  oldManifest.ownedFiles.push('cards/9999999999/index.html')
  mkdirSync(join(output, 'cards/9999999999'), { recursive: true }); writeFileSync(join(output, 'cards/9999999999/index.html'), 'unattributed legacy report')
  rmSync(join(output, 'data/cards'), { recursive: true, force: true })
  writeFileSync(join(output, SITE_OWNERSHIP_FILE), `${JSON.stringify(oldManifest, null, 2)}\n`)
  const upgraded = await generatePublicSite(lib, output, '1.0.1', undefined, writer)
  assert.equal(upgraded.updatedReports, 1)
  assert.equal(upgraded.warnings.length, 1)
  assert.equal(calls, 1)
  const upgradedManifest = JSON.parse(readFileSync(join(output, SITE_OWNERSHIP_FILE), 'utf8')) as Record<string, unknown>
  assert.equal(upgradedManifest.formatVersion, SITE_FORMAT_VERSION)
  assert.equal(upgradedManifest.generationStateVersion, 2)
  assert.equal(upgradedManifest.reportFormatVersion, REPORT_FORMAT_VERSION)
  assert.equal(upgradedManifest.imagePipelineVersion, IMAGE_PIPELINE_VERSION)
  assert.equal(existsSync(join(output, 'data/cards', `${card.card.serial}.json`)), true)
  assert.equal(readFileSync(join(output, 'cards/9999999999/index.html'), 'utf8'), 'unattributed legacy report')
  assert.equal(existsSync(join(output, 'data/cards/9999999999.json')), false)

  const report = join(output, 'cards', card.card.serial, 'index.html')
  writeFileSync(report, `${readFileSync(report, 'utf8')}<!-- report sentinel -->`)
  const reportBump = await generatePublicSite(lib, output, '1.0.2', undefined, writer, { reportFormatVersion: REPORT_FORMAT_VERSION + 1 })
  assert.equal(reportBump.updatedReports, 1)
  assert.equal(calls, 1)
  assert.doesNotMatch(readFileSync(report, 'utf8'), /report sentinel/)

  const reportMtime = statSync(report, { bigint: true }).mtimeNs
  const imageBump = await generatePublicSite(lib, output, '1.0.3', undefined, writer, {
    reportFormatVersion: REPORT_FORMAT_VERSION + 1,
    imagePipelineVersion: IMAGE_PIPELINE_VERSION + 1
  })
  assert.equal(imageBump.updatedReports, 1)
  assert.equal(calls, 2)
  assert.equal(statSync(report, { bigint: true }).mtimeNs, reportMtime)

  const stale = saveAndFinalize(lib, { ...blankMetadata(), cardName: 'Removed before rebuild' })
  await generatePublicSite(lib, output, '1.0.3', undefined, writer, {
    reportFormatVersion: REPORT_FORMAT_VERSION + 1,
    imagePipelineVersion: IMAGE_PIPELINE_VERSION + 1
  })
  lib.setIncludePublic(stale.card.id, lib.get(stale.card.id).card.revision, false)
  const removed = await generatePublicSite(lib, output, '1.0.3', undefined, writer, {
    reportFormatVersion: REPORT_FORMAT_VERSION + 1, imagePipelineVersion: IMAGE_PIPELINE_VERSION + 1
  })
  assert.equal(removed.removedReports, 1)
  writeFileSync(report, `${readFileSync(report, 'utf8')}<!-- rebuild sentinel -->`)
  const large = join(output, 'media', card.card.serial, 'full-front-large.webp')
  writeFileSync(large, 'stale generated image')
  const rebuilt = await generatePublicSite(lib, output, '1.0.4', undefined, writer, {
    mode: 'rebuild', reportFormatVersion: REPORT_FORMAT_VERSION + 1, imagePipelineVersion: IMAGE_PIPELINE_VERSION + 1
  })
  assert.equal(rebuilt.rebuiltReports, 1)
  assert.equal(rebuilt.removedReports, 0)
  assert.equal(calls, 2)
  assert.doesNotMatch(readFileSync(report, 'utf8'), /rebuild sentinel/)
  assert.equal(readFileSync(large, 'utf8'), 'stale generated image')
  assert.equal(existsSync(join(output, 'cards', stale.card.serial)), false)
  assert.equal(readFileSync(join(output, '.git/config'), 'utf8'), 'user git data')
  assert.equal(readFileSync(join(output, 'CNAME'), 'utf8'), 'cards.example.test')
})

test('generation enforces eligibility, privacy, stable URLs and report content', async t => {
  const { lib, output, image } = fixture(t)
  const privateSubmitter = 'PRIVATE_SUBMITTER_7bb9'
  const privateNotes = 'PRIVATE_GENERAL_NOTES_71ae'
  const first = saveAndFinalize(lib, {
    ...blankMetadata(), cardName: '<script>PUBLIC_ATTACK()</script>', game: 'Pokémon', setName: 'Base & Beyond',
    cardNumber: '014/120', year: '2026', language: 'English', variant: 'Holo', rarity: 'Rare',
    manufacturer: 'Example Maker', submittedBy: privateSubmitter, notes: privateNotes
  })
  const marker = lib.addMarker(first.card.id, 'front', 0.25, 0.75)
  lib.saveMarker(marker.id, 'Tiny <mark> & line')
  const primarySources: [PrimaryPhotoSlot, string][] = [
    ['full_front', image('front.png')], ['full_back', image('back.png')],
    ['corner_top_left', image('corner-top-left.jpg')], ['corner_top_right', image('corner-top-right.jpg')],
    ['corner_bottom_left', image('corner-bottom-left.jpg')], ['corner_bottom_right', image('corner-bottom-right.jpg')],
    ['edge_top', image('edge-top.png')], ['edge_right', image('edge-right.png')],
    ['edge_bottom', image('edge-bottom.png')], ['edge_left', image('edge-left.png')]
  ]
  const photoSources = [...primarySources.map(([, path]) => path), image('linked.webp'), image('private-extra.png'), image('partial-edge.png')]
  await Promise.all(photoSources.map((path, index) => sharp({ create: { width: 720 + index * 20, height: 980, channels: 3, background: { r: 45 + index * 17, g: 80, b: 105 } } }).toFile(path)))
  let detail = lib.get(first.card.id)
  for (const [slot, source] of primarySources) detail = await lib.importPhotos(first.card.id, slot, [source])
  detail = await lib.importPhotos(first.card.id, null, [photoSources[10], photoSources[11]])
  const linked = detail.photos.find(photo => photo.originalFilename === 'linked.webp')!
  const unlinked = detail.photos.find(photo => photo.originalFilename === 'private-extra.png')!
  const front = detail.photos.find(photo => photo.slot === 'full_front')!
  lib.savePhotoTitle(linked.id, 'Raking light evidence')
  lib.setPhotoMarkers(linked.id, [marker.id])
  lib.setPhotoMarkers(front.id, [marker.id])

  const noPhotos = saveAndFinalize(lib, { ...blankMetadata(), cardName: 'No photos' })
  const partial = saveAndFinalize(lib, { ...blankMetadata(), cardName: 'Partial photos', setName: 'Public set' })
  await lib.importPhotos(partial.card.id, 'edge_bottom', [photoSources[12]])
  const inProgress = lib.create()
  lib.save(inProgress.card.id, inProgress.card.revision, { ...blankMetadata(), cardName: 'IN_PROGRESS_PRIVATE' })
  const disabled = saveAndFinalize(lib, { ...blankMetadata(), cardName: 'PUBLIC_DISABLED_PRIVATE' })
  lib.setIncludePublic(disabled.card.id, disabled.card.revision, false)
  const pending = saveAndFinalize(lib, { ...blankMetadata(), cardName: 'PENDING_PRIVATE' })
  lib.saveInspection(pending.card.id, pending.card.revision, { ...pending.inspection, surfaceGrade: 90 })

  const progress: string[] = []
  const result = await generatePublicSite(lib, output, '9.8.7-test', value => progress.push(value.stage))
  assert.equal(result.reportCount, 3)
  assert.deepEqual(lib.publicSiteCards().map(card => card.serial), [partial.card.serial, noPhotos.card.serial, first.card.serial])
  assert.ok(progress.includes('preparing')); assert.ok(progress.includes('photos')); assert.ok(progress.includes('search')); assert.ok(progress.includes('writing')); assert.ok(progress.includes('complete'))

  for (const card of [first, noPhotos, partial]) assert.equal(existsSync(join(output, 'cards', card.card.serial, 'index.html')), true)
  for (const card of [inProgress, disabled, pending]) assert.equal(existsSync(join(output, 'cards', card.card.serial, 'index.html')), false)
  const report = readFileSync(join(output, 'cards', first.card.serial, 'index.html'), 'utf8')
  assertReportSectionOrder(report)
  assert.match(report, new RegExp(`Report #${first.card.serial}`))
  assert.match(report, /Estimated Grade[\s\S]*9\.5/)
  for (const label of ['Centering', 'Corners', 'Edges', 'Surface']) assert.match(report, new RegExp(label))
  assert.match(report, /40\.0 \/ 60\.0/)
  assert.match(report, /2\.00 mm/)
  assert.match(report, /Apparent skew/)
  assert.match(report, /Tiny &lt;mark&gt; &amp; line/)
  assert.match(report, /Centered &lt;carefully&gt; &amp; checked/)
  assert.match(report, /Raking light evidence/)
  assert.match(report, /\.\.\/\.\.\/assets\/site\.css/)
  assert.doesNotMatch(report, /(?:href|src)="\//)
  assert.match(report, /&lt;script&gt;PUBLIC_ATTACK\(\)&lt;\/script&gt;/)
  assert.doesNotMatch(report, /<script>PUBLIC_ATTACK/)
  assert.equal(report.match(/<h2>Full Card<\/h2>/g)?.length, 1)

  const noPhotoReport = readFileSync(join(output, 'cards', noPhotos.card.serial, 'index.html'), 'utf8')
  assertReportSectionOrder(noPhotoReport)
  assert.equal(noPhotoReport.split('No defects documented.').length - 1, 1)
  assert.equal((noPhotoReport.match(/<figure class="photo placeholder">/g) ?? []).length, 10)
  const search = JSON.parse(readFileSync(join(output, 'data/reports.json'), 'utf8')) as { serial: string; cardName: string }[]
  assert.deepEqual(search.map(card => card.serial), [partial.card.serial, noPhotos.card.serial, first.card.serial])
  assert.equal(search.at(-1)?.cardName, '<script>PUBLIC_ATTACK()</script>')
  const catalogue = readFileSync(join(output, 'index.html'), 'utf8')
  assert.match(catalogue, /<h1>Card Reports<\/h1>/)
  assert.match(catalogue, />3 reports<\/small>/)
  assert.ok(catalogue.indexOf(partial.card.serial) < catalogue.indexOf(noPhotos.card.serial))
  assert.ok(catalogue.indexOf(noPhotos.card.serial) < catalogue.indexOf(first.card.serial))
  const populatedMedia = catalogue.match(new RegExp(`<article class="catalogue-card"[^>]*data-serial="${first.card.serial}"[\\s\\S]*?<div class="catalogue-image">([\\s\\S]*?)</div><div class="catalogue-copy">`))?.[1]
  const emptyMedia = catalogue.match(new RegExp(`<article class="catalogue-card"[^>]*data-serial="${noPhotos.card.serial}"[\\s\\S]*?<div class="catalogue-image">([\\s\\S]*?)</div><div class="catalogue-copy">`))?.[1]
  assert.match(populatedMedia ?? '', /-catalogue\.webp/)
  assert.match(populatedMedia ?? '', /loading="lazy"/)
  assert.match(populatedMedia ?? '', /decoding="async"/)
  assert.doesNotMatch(populatedMedia ?? '', /-preview\.webp|-large\.webp/)
  assert.match(emptyMedia ?? '', /catalogue-placeholder/)
  assert.match(readFileSync(join(output, 'assets/site.js'), 'utf8'), /normalizeDigits/)
  assert.match(readFileSync(join(output, 'assets/site.js'), 'utf8'), /score = 100/)
  assert.match(readFileSync(join(output, 'assets/site.css'), 'utf8'), /repeat\(auto-fill,minmax\(min\(250px,100%\),1fr\)\)/)
  assert.match(readFileSync(join(output, 'assets/site.css'), 'utf8'), /aspect-ratio:4\/3/)
  assert.match(report, /<h1>Report #0000000001<\/h1><h2 class="card-title">/)
  assert.equal(existsSync(join(output, '.nojekyll')), true)

  const allText = publicText(output)
  assert.doesNotMatch(allText, new RegExp(privateSubmitter))
  assert.doesNotMatch(allText, new RegExp(privateNotes))
  assert.doesNotMatch(allText, /IN_PROGRESS_PRIVATE|PUBLIC_DISABLED_PRIVATE|PENDING_PRIVATE/)
  assert.doesNotMatch(allText, new RegExp(first.card.id))
  assert.doesNotMatch(allText, new RegExp(marker.id))
  assert.doesNotMatch(allText, new RegExp(unlinked.id))
  assert.doesNotMatch(allText, /private-extra\.png|UNLINKED_PRIVATE_BYTES/)
  assert.equal(existsSync(join(output, 'media', first.card.serial, 'evidence-01-preview.webp')), true)
  assert.equal(readdirSync(join(output, 'media', first.card.serial)).some(name => name.includes('evidence-02')), false)
  assert.equal(readdirSync(join(output, 'media', first.card.serial)).length, 23)
  assert.equal(existsSync(join(output, 'media', noPhotos.card.serial)), false)
  const ownership = JSON.parse(readFileSync(join(output, SITE_OWNERSHIP_FILE), 'utf8')) as { formatVersion: number; ownedFiles: string[] }
  assert.equal(ownership.formatVersion, SITE_FORMAT_VERSION)
  assert.deepEqual(ownership.ownedFiles.sort(), ['.nojekyll', 'assets/site.css', 'assets/site.js', 'data/reports.json', 'index.html'])
  const snapshot = JSON.parse(readFileSync(join(output, 'data/cards', `${first.card.serial}.json`), 'utf8')) as PublicCardSnapshot
  assert.equal(snapshot.snapshotFormatVersion, PUBLIC_SNAPSHOT_FORMAT_VERSION)
  assert.equal(snapshot.serial, first.card.serial)
})

test('regeneration preserves user files, removes stale reports, and keeps the last working site on failure', async t => {
  const { lib, output, image, root } = fixture(t)
  mkdirSync(join(output, '.git')); writeFileSync(join(output, '.git/config'), 'user git data')
  writeFileSync(join(output, 'CNAME'), 'cards.example.test')
  writeFileSync(join(output, 'README.md'), 'user readme')
  const card = saveAndFinalize(lib, { ...blankMetadata(), cardName: 'Temporary public card' })
  await lib.importPhotos(card.card.id, 'full_front', [image('front.png')])
  const deleted = saveAndFinalize(lib, { ...blankMetadata(), cardName: 'Deleted public card' })
  await generatePublicSite(lib, output, '1.0.0', undefined, fakeImages)
  assert.equal(existsSync(join(output, 'cards', card.card.serial, 'index.html')), true)
  assert.equal(existsSync(join(output, 'media', card.card.serial, 'full-front-catalogue.webp')), true)
  assert.equal(existsSync(join(output, 'cards', deleted.card.serial, 'index.html')), true)
  lib.setIncludePublic(card.card.id, card.card.revision, false)
  lib.delete(deleted.card.id)
  await generatePublicSite(lib, output, '1.0.0', undefined, fakeImages)
  assert.equal(existsSync(join(output, 'cards', card.card.serial)), false)
  assert.equal(existsSync(join(output, 'media', card.card.serial)), false)
  assert.equal(existsSync(join(output, 'cards', deleted.card.serial)), false)
  assert.match(readFileSync(join(output, 'index.html'), 'utf8'), />0 reports<\/small>/)
  assert.equal(readFileSync(join(output, '.git/config'), 'utf8'), 'user git data')
  assert.equal(readFileSync(join(output, 'CNAME'), 'utf8'), 'cards.example.test')
  assert.equal(readFileSync(join(output, 'README.md'), 'utf8'), 'user readme')

  const currentIndex = readFileSync(join(output, 'index.html'), 'utf8')
  const currentManifest = readFileSync(join(output, SITE_OWNERSHIP_FILE), 'utf8')
  const reenabled = lib.setIncludePublic(card.card.id, lib.get(card.card.id).card.revision, true)
  assert.equal(reenabled.includePublic, true)
  await assert.rejects(() => generatePublicSite(lib, output, '1.0.1', undefined, async () => { throw new Error('simulated derivative failure') }), /simulated derivative failure/)
  assert.equal(readFileSync(join(output, 'index.html'), 'utf8'), currentIndex)
  assert.equal(readFileSync(join(output, SITE_OWNERSHIP_FILE), 'utf8'), currentManifest)

  const conflicting = join(root, 'conflicting-output'); mkdirSync(conflicting); writeFileSync(join(conflicting, 'index.html'), 'user page')
  await assert.rejects(() => generatePublicSite(lib, conflicting, '1.0.0', undefined, fakeImages), /unowned file.*index\.html/)
  assert.equal(readFileSync(join(conflicting, 'index.html'), 'utf8'), 'user page')
  assert.equal(existsSync(join(conflicting, SITE_OWNERSHIP_FILE)), false)
})

test('real public derivatives are WebP and relative pages work at root and a subdirectory', async t => {
  const { lib, output, root } = fixture(t)
  const card = saveAndFinalize(lib, { ...blankMetadata(), cardName: 'Portable report' })
  const source = join(root, 'real.png')
  await sharp({ create: { width: 1200, height: 800, channels: 3, background: '#9a5038' } }).png().toFile(source)
  const imported = await lib.importPhotos(card.card.id, 'full_front', [source])
  const storedOriginal = await lib.photoFile(imported.photos[0].id, 'original')
  const originalBefore = readFileSync(storedOriginal)
  await generatePublicSite(lib, output, '1.0.0')
  const catalogue = join(output, 'media', card.card.serial, 'full-front-catalogue.webp')
  const preview = join(output, 'media', card.card.serial, 'full-front-preview.webp')
  const large = join(output, 'media', card.card.serial, 'full-front-large.webp')
  assert.equal((await sharp(catalogue).metadata()).format, 'webp')
  assert.equal((await sharp(catalogue).metadata()).width, 420)
  assert.equal((await sharp(preview).metadata()).format, 'webp')
  assert.equal((await sharp(preview).metadata()).width, 900)
  assert.equal((await sharp(large).metadata()).width, 1200)
  assert.deepEqual(readFileSync(storedOriginal), originalBefore)
  const oneCardCatalogue = readFileSync(join(output, 'index.html'), 'utf8')
  assert.match(oneCardCatalogue, />1 report<\/small>/)
  assert.match(oneCardCatalogue, /full-front-catalogue\.webp/)
  assert.doesNotMatch(oneCardCatalogue, /full-front-preview\.webp|full-front-large\.webp/)

  const smallCard = saveAndFinalize(lib, { ...blankMetadata(), cardName: 'Small original' })
  const smallSource = join(root, 'small.png')
  await sharp({ create: { width: 180, height: 120, channels: 3, background: '#385f83' } }).png().toFile(smallSource)
  await lib.importPhotos(smallCard.card.id, 'full_front', [smallSource])
  await generatePublicSite(lib, output, '1.0.0')
  const smallCatalogue = join(output, 'media', smallCard.card.serial, 'full-front-catalogue.webp')
  assert.equal((await sharp(smallCatalogue).metadata()).width, 180)
  assert.equal((await sharp(smallCatalogue).metadata()).height, 120)
  assert.match(readFileSync(join(output, 'index.html'), 'utf8'), />2 reports<\/small>/)
  lib.setIncludePublic(smallCard.card.id, lib.get(smallCard.card.id).card.revision, false)
  const incrementalRemoval = await generatePublicSite(lib, output, '1.0.0')
  assert.equal(incrementalRemoval.removedReports, 1)
  assert.equal(existsSync(join(output, 'cards', smallCard.card.serial)), false)
  assert.equal(existsSync(join(output, 'media', smallCard.card.serial)), false)
  assert.match(readFileSync(join(output, 'index.html'), 'utf8'), />1 report<\/small>/)

  const server = createServer((request, response) => {
    const url = new URL(request.url ?? '/', 'http://localhost')
    let pathname = decodeURIComponent(url.pathname)
    if (pathname.startsWith('/project/')) pathname = pathname.slice('/project'.length)
    const relative = normalize(pathname).replace(/^[/\\]+/, '')
    let target = join(output, relative)
    if (pathname.endsWith('/')) target = join(target, 'index.html')
    if (!existsSync(target) || !statSync(target).isFile()) { response.writeHead(404); response.end(); return }
    response.writeHead(200); response.end(readFileSync(target))
  })
  try { await new Promise<void>((resolve, reject) => { server.once('error', reject); server.listen(0, '127.0.0.1', resolve) }) }
  catch (error) {
    if (error instanceof Error && 'code' in error && error.code === 'EPERM') return
    throw error
  }
  t.after(() => server.close())
  const address = server.address()
  assert.ok(address && typeof address === 'object')
  const origin = `http://127.0.0.1:${address.port}`
  for (const base of ['', '/project']) {
    const home = await fetch(`${origin}${base}/`); assert.equal(home.status, 200)
    const report = await fetch(`${origin}${base}/cards/${card.card.serial}/`); assert.equal(report.status, 200)
    const removedReport = await fetch(`${origin}${base}/cards/${smallCard.card.serial}/`); assert.equal(removedReport.status, 404)
    const css = await fetch(`${origin}${base}/assets/site.css`); assert.equal(css.status, 200)
    const photo = await fetch(`${origin}${base}/media/${card.card.serial}/full-front-preview.webp`); assert.equal(photo.status, 200)
  }
})

test('invalid ownership paths and symlinked generated paths are rejected safely', async t => {
  const { lib, output, root } = fixture(t)
  saveAndFinalize(lib, { ...blankMetadata(), cardName: 'Safe output' })
  writeFileSync(join(output, SITE_OWNERSHIP_FILE), JSON.stringify({ generator: 'Cards Under Glass', formatVersion: 1, applicationVersion: 'x', ownedFiles: ['../escape'] }))
  await assert.rejects(() => generatePublicSite(lib, output, '1.0.0', undefined, fakeImages), /unsafe path/)
  rmSync(join(output, SITE_OWNERSHIP_FILE))
  const outside = join(root, 'outside'); mkdirSync(outside)
  try {
    const { symlinkSync } = await import('node:fs')
    symlinkSync(outside, join(output, 'cards'))
    await assert.rejects(() => generatePublicSite(lib, output, '1.0.0', undefined, fakeImages), /symbolic link/)
    assert.deepEqual(readdirSync(outside), [])
  } catch (error) {
    if (!(error instanceof Error) || !/operation not permitted|not supported/i.test(error.message)) throw error
  }
})

test('opaque publication owners are deterministic and public snapshots expose only reconstructable public data', async t => {
  const { lib, output, image, root } = fixture(t)
  const libraryId = lib.info().libraryId
  const owner = derivePublicOwnerKey(libraryId)
  assert.equal(derivePublicOwnerKey(libraryId), owner)
  assert.notEqual(derivePublicOwnerKey('00000000-0000-4000-8000-000000000001'), owner)
  assert.match(owner, /^[0-9a-f]{64}$/)
  const privateSubmitter = 'SNAPSHOT_PRIVATE_SUBMITTER', privateNotes = 'SNAPSHOT_PRIVATE_GENERAL_NOTES'
  const detail = saveAndFinalize(lib, { ...blankMetadata(), cardName: 'Snapshot report', submittedBy: privateSubmitter, notes: privateNotes })
  const marker = lib.addMarker(detail.card.id, 'back', 0.42, 0.61)
  lib.saveMarker(marker.id, 'Public marker note')
  const imported = await lib.importPhotos(detail.card.id, null, [image('private-source-name.png', 'snapshot evidence')])
  const evidence = imported.photos.find(photo => photo.slot === null)!
  lib.savePhotoTitle(evidence.id, 'Public evidence title')
  lib.setPhotoMarkers(evidence.id, [marker.id])
  await generatePublicSite(lib, output, '1.0.0', undefined, fakeImages)

  const path = join(output, 'data/cards', `${detail.card.serial}.json`)
  const text = readFileSync(path, 'utf8')
  const snapshot = JSON.parse(text) as PublicCardSnapshot
  assert.equal(snapshot.ownerKey, owner)
  assert.equal(snapshot.serial, detail.card.serial)
  assert.equal(snapshot.snapshotFormatVersion, PUBLIC_SNAPSHOT_FORMAT_VERSION)
  assert.equal(snapshot.card.markers[0].number, 1)
  assert.deepEqual(snapshot.card.photos[0].markerNumbers, [1])
  assert.equal(snapshot.card.photos[0].label, 'Public evidence title')
  assert.match(readFileSync(join(output, 'cards', detail.card.serial, 'index.html'), 'utf8'), /Public marker note[\s\S]*Public evidence title/)
  for (const privateValue of [privateSubmitter, privateNotes, libraryId, lib.installationId, detail.card.id, marker.id, evidence.id, root]) assert.doesNotMatch(publicText(output), new RegExp(privateValue.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')))
  assert.doesNotMatch(text, /sourcePath|sourceId|markerSourceIds|submittedBy|General Notes/)
  const priorIndex = readFileSync(join(output, 'index.html'))
  const malformed = JSON.parse(text) as PublicCardSnapshot & { card: PublicCardSnapshot['card'] & { submittedBy?: string } }
  malformed.card.submittedBy = 'SHOULD_NEVER_BE_ACCEPTED'
  writeFileSync(path, JSON.stringify(malformed))
  await assert.rejects(() => generatePublicSite(lib, output, '1.0.1', undefined, fakeImages), /snapshot.*invalid|invalid.*snapshot/i)
  assert.deepEqual(readFileSync(join(output, 'index.html')), priorIndex)
})

test('two independent libraries publish into one site while preserving foreign reports, media, and incremental state', async t => {
  const root = mkdtempSync(join(tmpdir(), 'cug-public-multi-')), output = join(root, 'site')
  const folderA = join(root, 'library-a'), folderB = join(root, 'library-b'), folderCollision = join(root, 'library-c')
  mkdirSync(output); mkdirSync(folderA); mkdirSync(folderB); mkdirSync(folderCollision)
  const thumbnail: ThumbnailWriter = async (source, destination) => writeFileSync(destination, readFileSync(source))
  const libraryA = new Library(folderA, 'installation-a', true, thumbnail), libraryB = new Library(folderB, 'installation-b', true, thumbnail), collisionLibrary = new Library(folderCollision, 'installation-c', true, thumbnail)
  libraryA.configure({ name: 'A', start: 1, end: 50000, next: 1 })
  libraryB.configure({ name: 'B', start: 50001, end: 100000, next: 50001 })
  collisionLibrary.configure({ name: 'Collision', start: 1, end: 50000, next: 1 })
  t.after(() => { for (const library of [libraryA, libraryB, collisionLibrary]) try { library.close() } catch { /* already closed */ }; rmSync(root, { recursive: true, force: true }) })
  const sourceA = join(root, 'a.png'), sourceB = join(root, 'b.png')
  writeFileSync(sourceA, 'photo-a'); writeFileSync(sourceB, 'photo-b')
  const a1 = saveAndFinalize(libraryA, { ...blankMetadata(), cardName: 'Library A first' })
  const a2 = saveAndFinalize(libraryA, { ...blankMetadata(), cardName: 'Library A second' })
  await libraryA.importPhotos(a1.card.id, 'full_front', [sourceA])
  const b1 = saveAndFinalize(libraryB, { ...blankMetadata(), cardName: 'Library B first' })
  const b2 = saveAndFinalize(libraryB, { ...blankMetadata(), cardName: 'Library B second' })
  await libraryB.importPhotos(b1.card.id, 'corner_top_left', [sourceB])
  const imageCalls: string[] = []
  const writer: PublicImageWriter = async (source, targets) => { imageCalls.push(source); await fakeImages(source, targets) }

  const first = await generatePublicSite(libraryA, output, '1.0.0', undefined, writer)
  assert.equal(first.newReports, 2)
  const aSnapshot = join(output, 'data/cards', `${a1.card.serial}.json`), aReport = join(output, 'cards', a1.card.serial, 'index.html'), aMedia = join(output, 'media', a1.card.serial, 'full-front-preview.webp')
  const publishedAOwner = (JSON.parse(readFileSync(aSnapshot, 'utf8')) as PublicCardSnapshot).ownerKey
  const aSnapshotMtime = statSync(aSnapshot, { bigint: true }).mtimeNs, aReportMtime = statSync(aReport, { bigint: true }).mtimeNs, aMediaMtime = statSync(aMedia, { bigint: true }).mtimeNs

  const second = await generatePublicSite(libraryB, output, '1.0.0', undefined, writer)
  assert.equal(second.reportCount, 4)
  assert.equal(existsSync(aSnapshot), true); assert.equal(existsSync(aReport), true); assert.equal(existsSync(aMedia), true)
  assert.equal(statSync(aSnapshot, { bigint: true }).mtimeNs, aSnapshotMtime)
  assert.equal(statSync(aReport, { bigint: true }).mtimeNs, aReportMtime)
  assert.equal(statSync(aMedia, { bigint: true }).mtimeNs, aMediaMtime)
  assert.deepEqual((JSON.parse(readFileSync(join(output, 'data/reports.json'), 'utf8')) as { serial: string }[]).map(card => card.serial), [b2.card.serial, b1.card.serial, a2.card.serial, a1.card.serial])

  const callsBeforeImageVersion = imageCalls.length
  await generatePublicSite(libraryB, output, '1.0.0', undefined, writer, { imagePipelineVersion: IMAGE_PIPELINE_VERSION + 1 })
  assert.equal(imageCalls.length, callsBeforeImageVersion + 1)
  assert.match(imageCalls.at(-1)!, new RegExp(`^${folderB.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}`))
  assert.equal(statSync(aMedia, { bigint: true }).mtimeNs, aMediaMtime)

  const unchanged = await generatePublicSite(libraryB, output, '1.0.1', undefined, writer, { imagePipelineVersion: IMAGE_PIPELINE_VERSION + 1 })
  assert.equal(unchanged.unchangedReports, 4)
  assert.equal(statSync(aReport, { bigint: true }).mtimeNs, aReportMtime)
  const changedB = libraryB.get(b1.card.id)
  libraryB.save(b1.card.id, changedB.card.revision, { ...blankMetadata(), cardName: 'Library B first changed' })
  const changed = await generatePublicSite(libraryB, output, '1.0.1', undefined, writer, { imagePipelineVersion: IMAGE_PIPELINE_VERSION + 1 })
  assert.equal(changed.updatedReports, 1); assert.equal(changed.unchangedReports, 3)
  assert.equal(statSync(aReport, { bigint: true }).mtimeNs, aReportMtime)

  libraryB.setIncludePublic(b1.card.id, libraryB.get(b1.card.id).card.revision, false)
  const removed = await generatePublicSite(libraryB, output, '1.0.1', undefined, writer, { imagePipelineVersion: IMAGE_PIPELINE_VERSION + 1 })
  assert.equal(removed.removedReports, 1)
  assert.equal(existsSync(join(output, 'cards', b1.card.serial)), false)
  assert.equal(existsSync(aReport), true)
  const changedA = libraryA.get(a2.card.id)
  libraryA.save(a2.card.id, changedA.card.revision, { ...blankMetadata(), cardName: 'Library A second changed' })
  await generatePublicSite(libraryA, output, '1.0.2', undefined, writer)
  assert.equal(existsSync(join(output, 'cards', b2.card.serial, 'index.html')), true)
  libraryA.setIncludePublic(a2.card.id, libraryA.get(a2.card.id).card.revision, false)
  const removedA = await generatePublicSite(libraryA, output, '1.0.2', undefined, writer)
  assert.equal(removedA.removedReports, 1)
  assert.equal(existsSync(join(output, 'cards', a2.card.serial)), false)
  assert.equal(existsSync(join(output, 'cards', b2.card.serial, 'index.html')), true)

  const collision = saveAndFinalize(collisionLibrary, { ...blankMetadata(), cardName: 'Conflicting serial' })
  assert.equal(collision.card.serial, a1.card.serial)
  const beforeCollisionManifest = readFileSync(join(output, SITE_OWNERSHIP_FILE))
  const beforeCollisionIndex = readFileSync(join(output, 'index.html'))
  await assert.rejects(() => generatePublicSite(collisionLibrary, output, '1.0.2', undefined, writer), /already published by another.*allocation ranges/i)
  assert.deepEqual(readFileSync(join(output, SITE_OWNERSHIP_FILE)), beforeCollisionManifest)
  assert.deepEqual(readFileSync(join(output, 'index.html')), beforeCollisionIndex)

  const beforeRebuildImage = readFileSync(aMedia), beforeRebuildImageMtime = statSync(aMedia, { bigint: true }).mtimeNs
  libraryA.close()
  const rebuilt = await generatePublicSite(libraryB, output, '1.0.3', undefined, writer, { mode: 'rebuild', reportFormatVersion: REPORT_FORMAT_VERSION + 1 })
  assert.equal(rebuilt.rebuiltReports, 2)
  assert.deepEqual(readFileSync(aMedia), beforeRebuildImage)
  assert.equal(statSync(aMedia, { bigint: true }).mtimeNs, beforeRebuildImageMtime)
  assert.match(readFileSync(aReport, 'utf8'), /Library A first/)
  assertReportSectionOrder(readFileSync(aReport, 'utf8'))
  const rebuiltA = JSON.parse(readFileSync(aSnapshot, 'utf8')) as PublicCardSnapshot
  assert.equal(rebuiltA.reportFormatVersion, REPORT_FORMAT_VERSION + 1)
  assert.equal(rebuiltA.ownerKey, publishedAOwner)

  const server = createServer((request, response) => {
    let pathname = decodeURIComponent(new URL(request.url ?? '/', 'http://localhost').pathname)
    if (pathname.startsWith('/project/')) pathname = pathname.slice('/project'.length)
    let target = join(output, normalize(pathname).replace(/^[/\\]+/, ''))
    if (pathname.endsWith('/')) target = join(target, 'index.html')
    if (!existsSync(target) || !statSync(target).isFile()) { response.writeHead(404); response.end(); return }
    response.writeHead(200); response.end(readFileSync(target))
  })
  try { await new Promise<void>((resolve, reject) => { server.once('error', reject); server.listen(0, '127.0.0.1', resolve) }) }
  catch (error) {
    if (error instanceof Error && 'code' in error && error.code === 'EPERM') return
    throw error
  }
  t.after(() => server.close())
  const address = server.address(); assert.ok(address && typeof address === 'object')
  for (const base of ['', '/project']) {
    const catalogueResponse: Response = await fetch(`http://127.0.0.1:${address.port}${base}/`)
    assert.equal(catalogueResponse.status, 200); assert.match(await catalogueResponse.text(), new RegExp(`${a1.card.serial}[\\s\\S]*${b2.card.serial}|${b2.card.serial}[\\s\\S]*${a1.card.serial}`))
    assert.equal((await fetch(`http://127.0.0.1:${address.port}${base}/cards/${a1.card.serial}/`)).status, 200)
    assert.equal((await fetch(`http://127.0.0.1:${address.port}${base}/cards/${b2.card.serial}/`)).status, 200)
    assert.equal((await fetch(`http://127.0.0.1:${address.port}${base}/media/${a1.card.serial}/full-front-preview.webp`)).status, 200)
  }
})

test('externally merged per-card snapshots repair stale aggregate files without touching foreign card files', async t => {
  const root = mkdtempSync(join(tmpdir(), 'cug-public-merge-')), outputA = join(root, 'site-a'), outputB = join(root, 'site-b')
  const folderA = join(root, 'library-a'), folderB = join(root, 'library-b')
  for (const folder of [outputA, outputB, folderA, folderB]) mkdirSync(folder)
  const thumbnail: ThumbnailWriter = async (source, destination) => writeFileSync(destination, readFileSync(source))
  const libraryA = new Library(folderA, 'installation-a', true, thumbnail), libraryB = new Library(folderB, 'installation-b', true, thumbnail)
  libraryA.configure({ name: 'A', start: 1, end: 50000, next: 1 }); libraryB.configure({ name: 'B', start: 50001, end: 100000, next: 50001 })
  t.after(() => { libraryA.close(); libraryB.close(); rmSync(root, { recursive: true, force: true }) })
  const a = saveAndFinalize(libraryA, { ...blankMetadata(), cardName: 'Merged A' }), b = saveAndFinalize(libraryB, { ...blankMetadata(), cardName: 'Merged B' })
  const bPhoto = join(root, 'merged-b.png'); writeFileSync(bPhoto, 'merged-b-photo')
  await libraryB.importPhotos(b.card.id, 'full_front', [bPhoto])
  await generatePublicSite(libraryA, outputA, '1.0.0', undefined, fakeImages)
  await generatePublicSite(libraryB, outputB, '1.0.0', undefined, fakeImages)
  cpSync(join(outputB, 'data/cards', `${b.card.serial}.json`), join(outputA, 'data/cards', `${b.card.serial}.json`))
  cpSync(join(outputB, 'cards', b.card.serial), join(outputA, 'cards', b.card.serial), { recursive: true })
  cpSync(join(outputB, 'media', b.card.serial), join(outputA, 'media', b.card.serial), { recursive: true })
  writeFileSync(join(outputA, 'index.html'), 'stale aggregate')
  writeFileSync(join(outputA, 'data/reports.json'), '[]\n')
  const foreignReport = join(outputA, 'cards', b.card.serial, 'index.html'), foreignMtime = statSync(foreignReport, { bigint: true }).mtimeNs
  const foreignMedia = join(outputA, 'media', b.card.serial, 'full-front-large.webp'), foreignMediaMtime = statSync(foreignMedia, { bigint: true }).mtimeNs
  const repaired = await generatePublicSite(libraryA, outputA, '1.0.1', undefined, fakeImages)
  assert.equal(repaired.reportCount, 2)
  assert.equal(statSync(foreignReport, { bigint: true }).mtimeNs, foreignMtime)
  assert.equal(statSync(foreignMedia, { bigint: true }).mtimeNs, foreignMediaMtime)
  assert.match(readFileSync(join(outputA, 'index.html'), 'utf8'), new RegExp(a.card.serial))
  assert.match(readFileSync(join(outputA, 'index.html'), 'utf8'), new RegExp(b.card.serial))
  assert.deepEqual((JSON.parse(readFileSync(join(outputA, 'data/reports.json'), 'utf8')) as { serial: string }[]).map(card => card.serial), [b.card.serial, a.card.serial])
})

test('archive restore preserves publication ownership without preserving the workstation installation identity', async t => {
  const root = mkdtempSync(join(tmpdir(), 'cug-public-restore-')), sourceFolder = join(root, 'source'), restoredFolder = join(root, 'restored'), output = join(root, 'site'), archive = join(root, 'library.cug')
  mkdirSync(sourceFolder); mkdirSync(output)
  const thumbnail: ThumbnailWriter = async (source, destination) => writeFileSync(destination, readFileSync(source))
  const source = new Library(sourceFolder, 'origin-installation', true, thumbnail)
  source.configure({ name: 'Origin', start: 1, end: 50000, next: 1 })
  const card = saveAndFinalize(source, { ...blankMetadata(), cardName: 'Restored publisher' })
  const libraryId = source.info().libraryId, ownerKey = derivePublicOwnerKey(libraryId)
  await generatePublicSite(source, output, '1.0.0', undefined, fakeImages)
  await createLibraryArchive(source, archive, '1.0.0')
  source.close()
  await restoreLibraryArchive(archive, restoredFolder)
  const restored = new Library(restoredFolder, 'replacement-installation', false, thumbnail)
  t.after(() => { restored.close(); rmSync(root, { recursive: true, force: true }) })
  assert.equal(restored.info().libraryId, libraryId)
  assert.equal(derivePublicOwnerKey(restored.info().libraryId), ownerKey)
  const current = restored.get(card.card.id)
  restored.save(card.card.id, current.card.revision, { ...blankMetadata(), cardName: 'Updated after restore' })
  const updated = await generatePublicSite(restored, output, '1.0.1', undefined, fakeImages)
  assert.equal(updated.updatedReports, 1)
  assert.match(readFileSync(join(output, 'cards', card.card.serial, 'index.html'), 'utf8'), /Updated after restore/)
  restored.setIncludePublic(card.card.id, restored.get(card.card.id).card.revision, false)
  const removed = await generatePublicSite(restored, output, '1.0.1', undefined, fakeImages)
  assert.equal(removed.removedReports, 1)
  assert.equal(existsSync(join(output, 'data/cards', `${card.card.serial}.json`)), false)
})

function legacySnapshotFile(output: string, serial: string): void {
  const path = join(output, 'data/cards', serial + '.json')
  const snapshot = JSON.parse(readFileSync(path, 'utf8'))
  const current = snapshot.card.inspection
  const inspection: Record<string, unknown> = {}
  for (const key of Object.keys(gradeFields)) inspection[key] = current[key]
  for (const position of Object.keys(measurementPositions)) inspection[position] = current['front' + position[0].toUpperCase() + position.slice(1)]
  for (const key of ['centeringNote', 'cornersNote', 'edgesNote', 'surfaceNote']) inspection[key] = current[key]
  snapshot.card.inspection = inspection
  snapshot.snapshotFormatVersion = 1; snapshot.publicSchemaVersion = 1; snapshot.reportFormatVersion = 1
  const card = snapshot.card
  const payload = {
    serial, metadata: Object.fromEntries(['game', 'setName', 'cardName', 'cardNumber', 'year', 'language', 'variant', 'rarity', 'manufacturer'].map(key => [key, card[key]])),
    inspection, markers: card.markers,
    photos: card.photos.map((photo: Record<string, unknown>) => ({ assetKey: photo.assetKey, slot: photo.slot, title: photo.title, originalFilename: photo.originalFilename, label: photo.label, catalogue: photo.catalogue, preview: photo.preview, large: photo.large, contentFingerprint: photo.contentFingerprint, markerNumbers: photo.markerNumbers }))
  }
  snapshot.publicFingerprint = createHash('sha256').update(JSON.stringify(payload)).digest('hex')
  writeFileSync(path, JSON.stringify(snapshot, null, 2) + '\n')
}

test('schema-2 reports publish both faces while legacy foreign/orphaned snapshots remain rebuildable', async t => {
  const { lib, output, root, image } = fixture(t)
  const a = saveAndFinalize(lib, { ...blankMetadata(), cardName: 'Front and Back', submittedBy: 'FACE_PRIVATE_SUBMITTER', notes: 'FACE_PRIVATE_GENERAL_NOTES' }, value => ({
    ...complete(value), frontVerticalLeftBottom: 138, frontVerticalRightBottom: 262,
    frontHorizontalUpperRight: 244, frontHorizontalLowerLeft: 244,
    backVerticalLeftBottom: 262, backVerticalRightBottom: 138,
    backHorizontalUpperRight: 156, backHorizontalLowerLeft: 156
  }))
  await lib.importPhotos(a.card.id, 'full_front', [image('face-front.png')])
  await generatePublicSite(lib, output, 'test', undefined, fakeImages)
  const report = readFileSync(join(output, 'cards', a.card.serial, 'index.html'), 'utf8')
  assert.match(report, /Centering Front/); assert.match(report, /Centering Back/)
  assert.match(report, /~0.4° CW/); assert.match(report, /~0.4° CCW/)
  assert.equal((report.match(/<span>Centering<\/span>/g) ?? []).length, 1)
  const snapshot = JSON.parse(readFileSync(join(output, 'data/cards', a.card.serial + '.json'), 'utf8')) as PublicCardSnapshot
  assert.equal(snapshot.snapshotFormatVersion, 2); assert.equal(snapshot.publicSchemaVersion, 2)
  assert.equal('backVerticalLeftTop' in snapshot.card.inspection, true)
  assert.doesNotMatch(JSON.stringify(snapshot), /FACE_PRIVATE/)
  const snapshotPath = join(output, 'data/cards', a.card.serial + '.json')
  const originalSnapshot = readFileSync(snapshotPath)
  const incompleteSnapshot = JSON.parse(originalSnapshot.toString())
  delete incompleteSnapshot.card.inspection.backVerticalLeftTop
  writeFileSync(snapshotPath, JSON.stringify(incompleteSnapshot))
  await assert.rejects(() => generatePublicSite(lib, output, 'test', undefined, fakeImages), /invalid inspection/)
  assert.equal(readFileSync(join(output, 'cards', a.card.serial, 'index.html'), 'utf8'), report)
  writeFileSync(snapshotPath, originalSnapshot)
  const bFolder = join(root, 'foreign-library')
  mkdirSync(bFolder)
  const foreign = new Library(bFolder, 'foreign-installation', true, async (source, destination) => writeFileSync(destination, readFileSync(source)))
  foreign.configure({ name: 'Foreign', start: 50001, end: 100000, next: 50001 })
  const b = saveAndFinalize(foreign, { ...blankMetadata(), cardName: 'Legacy orphan' })
  await foreign.importPhotos(b.card.id, 'full_front', [image('foreign-front.png')])
  await generatePublicSite(foreign, output, 'test', undefined, fakeImages)
  foreign.close()
  legacySnapshotFile(output, a.card.serial); legacySnapshotFile(output, b.card.serial)
  const oldForeign = JSON.parse(readFileSync(join(output, 'data/cards', b.card.serial + '.json'), 'utf8'))
  const foreignImage = join(output, 'media', b.card.serial, 'full-front-preview.webp')
  const foreignBytes = readFileSync(foreignImage), foreignTime = statSync(foreignImage, { bigint: true }).mtimeNs
  lib.close()
  const db = new DatabaseSync(join(lib.folder, 'catalogue.sqlite'))
  for (const position of Object.keys(measurementPositions)) {
    const suffix = position[0].toUpperCase() + position.slice(1)
    db.exec(`ALTER TABLE inspections DROP COLUMN back${suffix}; ALTER TABLE inspections RENAME COLUMN front${suffix} TO ${position};`)
  }
  db.exec('DELETE FROM schema_migrations WHERE version=6'); db.close()
  const migrated = new Library(lib.folder, lib.installationId)
  try {
    assert.equal(migrated.get(a.card.id).card.finalizationState, 'changes_pending')
    const result = await generatePublicSite(migrated, output, 'test', undefined, fakeImages)
    assert.equal(result.removedReports, 1)
    assert.equal(existsSync(join(output, 'cards', a.card.serial, 'index.html')), false)
    assert.equal(existsSync(join(output, 'data/cards', a.card.serial + '.json')), false)
    const orphan = JSON.parse(readFileSync(join(output, 'data/cards', b.card.serial + '.json'), 'utf8'))
    assert.equal(orphan.ownerKey, oldForeign.ownerKey)
    assert.equal(orphan.snapshotFormatVersion, 1)
    assert.deepEqual(orphan.card, oldForeign.card)
    await generatePublicSite(migrated, output, 'test', undefined, fakeImages, { mode: 'rebuild' })
    const orphanHtml = readFileSync(join(output, 'cards', b.card.serial, 'index.html'), 'utf8')
    assertReportSectionOrder(orphanHtml)
    assert.match(orphanHtml, /Centering Front/); assert.match(orphanHtml, /Back measurements were not recorded in this legacy report/)
    assert.deepEqual(readFileSync(foreignImage), foreignBytes)
    assert.equal(statSync(foreignImage, { bigint: true }).mtimeNs, foreignTime)
    const current = migrated.get(a.card.id)
    const saved = migrated.saveInspection(a.card.id, current.card.revision, complete(current.inspection))
    migrated.finalize(a.card.id, saved.card.revision)
    const restored = await generatePublicSite(migrated, output, 'test', undefined, fakeImages)
    assert.equal(restored.newReports, 1)
    assert.equal(JSON.parse(readFileSync(join(output, 'data/cards', a.card.serial + '.json'), 'utf8')).snapshotFormatVersion, 2)
  } finally { migrated.close() }
})
