import { test, type TestContext } from 'node:test'
import assert from 'node:assert/strict'
import { mkdtempSync, rmSync, readFileSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { DatabaseSync } from 'node:sqlite'
import { Library } from '../src/main/library'
import { migrations } from '../src/main/migrations'
import { fields, gradeFields, measurementFields, measurementPositions, noteFields, type Inspection, type Metadata } from '../src/shared/contracts'
import { apparentSkew, faceMeasurements, centeringRatio, formatGrade, formatMeasurement, missingFinalizationFields, parseFixedInput } from '../src/shared/inspection'

function fixture(t: TestContext): { folder: string; lib: Library } {
  const folder = mkdtempSync(join(tmpdir(), 'cug-inspection-'))
  const lib = new Library(folder, 'installation-a', true, async (source, destination) => writeFileSync(destination, readFileSync(source)))
  t.after(() => { try { lib.close() } catch { /* already closed */ } rmSync(folder, { recursive: true, force: true }) })
  lib.configure({ name: 'Inspection desk', start: 1, end: 50000, next: 1 })
  return { folder, lib }
}

function complete(inspection: Inspection): Inspection {
  const next = { ...inspection }
  for (const key of Object.keys(gradeFields) as (keyof typeof gradeFields)[]) next[key] = 95
  for (const key of Object.keys(measurementFields) as (keyof typeof measurementFields)[]) next[key] = 200
  return next
}

const blankMetadata = (): Metadata => Object.fromEntries(Object.keys(fields).map(key => [key, null])) as Metadata

test('grade and measurement parsing enforces precision, range and fixed display', () => {
  assert.equal(gradeFields.centeringGrade, 'Centering')
  assert.equal(Object.hasOwn(gradeFields, 'defectsGrade'), false)
  assert.deepEqual(parseFixedInput('9', 1, 10), { valid: true, value: 90 })
  assert.deepEqual(parseFixedInput('9.5', 1, 10), { valid: true, value: 95 })
  assert.deepEqual(parseFixedInput('10.0', 1, 10), { valid: true, value: 100 })
  assert.deepEqual(parseFixedInput('', 1, 10), { valid: true, value: null })
  for (const value of ['9.55', '10.1', '-1', '1e1', '.', 'NaN']) assert.deepEqual(parseFixedInput(value, 1, 10), { valid: false })
  assert.deepEqual(parseFixedInput('2', 2), { valid: true, value: 200 })
  assert.deepEqual(parseFixedInput('2.50', 2), { valid: true, value: 250 })
  for (const value of ['2.501', '-0.1', 'Infinity']) assert.deepEqual(parseFixedInput(value, 2), { valid: false })
  assert.equal(formatGrade(100), '10.0'); assert.equal(formatGrade(80), '8.0')
  assert.equal(formatMeasurement(250), '2.50'); assert.equal(formatMeasurement(200), '2.00')
})

test('centering ratios preserve direction and handle empty or zero pairs', () => {
  assert.equal(centeringRatio(200, 300), '40.0 / 60.0')
  assert.equal(centeringRatio(300, 200), '60.0 / 40.0')
  assert.equal(centeringRatio(null, 200), null)
  assert.equal(centeringRatio(0, 0), null)
})

test('apparent skew estimates CW/CCW, neutral and contradictory measurements', () => {
  const base = Object.fromEntries(Object.keys(measurementPositions).map(key => [key, 200])) as Parameters<typeof apparentSkew>[0]
  assert.deepEqual(apparentSkew(base), { state: 'none' })
  const clockwise = { ...base, verticalLeftBottom: 138, verticalRightBottom: 262, horizontalUpperRight: 244, horizontalLowerLeft: 244 }
  const cw = apparentSkew(clockwise)
  assert.equal(cw.state, 'estimated'); assert.equal(cw.direction, 'CW'); assert.ok(Math.abs(cw.degrees! - 0.4) < 0.05)
  const counter = { ...base, verticalLeftBottom: 262, verticalRightBottom: 138, horizontalUpperRight: 156, horizontalLowerLeft: 156 }
  assert.equal(apparentSkew(counter).direction, 'CCW')
  assert.equal(apparentSkew({ ...base, verticalLeftTop: null }).state, 'unavailable')
  assert.equal(apparentSkew({ ...base, verticalLeftBottom: 0, verticalRightBottom: 400 }).state, 'unavailable')
})

test('finalization validates required data and tracks only required assessment changes', t => {
  const { lib } = fixture(t)
  let detail = lib.create()
  assert.equal(detail.card.includePublic, true)
  assert.deepEqual(missingFinalizationFields(detail.inspection).length, 21)
  assert.throws(() => lib.finalize(detail.card.id, detail.card.revision), /Complete these required/)
  const withoutCenteringGrade = { ...complete(detail.inspection), centeringGrade: null }
  let saved = lib.saveInspection(detail.card.id, detail.card.revision, withoutCenteringGrade)
  assert.throws(() => lib.finalize(detail.card.id, saved.card.revision), /Centering/)
  saved = lib.saveInspection(detail.card.id, saved.card.revision, { ...withoutCenteringGrade, centeringGrade: 95 })
  detail = lib.finalize(detail.card.id, saved.card.revision)
  assert.equal(detail.card.finalizationState, 'finalized'); assert.ok(detail.card.finalizedAt)
  const finalizedAt = detail.card.finalizedAt

  const marker = lib.addMarker(detail.card.id, 'front', 0.25, 0.75)
  lib.saveMarker(marker.id, 'Supporting evidence')
  assert.equal(lib.get(detail.card.id).card.finalizationState, 'finalized')
  lib.removeMarker(marker.id)
  assert.equal(lib.get(detail.card.id).card.finalizationState, 'finalized')

  const withNote = { ...detail.inspection, cornersNote: 'Tiny touch' }
  saved = lib.saveInspection(detail.card.id, detail.card.revision, withNote)
  assert.equal(saved.card.finalizationState, 'finalized')
  assert.equal(saved.inspection.assessmentRevision, detail.inspection.assessmentRevision)
  const metadata = lib.save(detail.card.id, saved.card.revision, { ...blankMetadata(), cardName: 'Metadata does not invalidate' })
  assert.equal(metadata.finalizationState, 'finalized')
  const excluded = lib.setIncludePublic(detail.card.id, metadata.revision, false)
  assert.equal(excluded.includePublic, false); assert.equal(excluded.finalizationState, 'finalized')

  saved = lib.saveInspection(detail.card.id, excluded.revision, { ...withNote, centeringGrade: 90 })
  assert.equal(saved.card.status, 'finalized'); assert.equal(saved.card.finalizationState, 'changes_pending')
  detail = lib.finalize(detail.card.id, saved.card.revision)
  assert.equal(detail.card.finalizationState, 'finalized')
  assert.ok(detail.card.finalizedAt! >= finalizedAt!)
})

test('inspection notes and normalized defect markers persist across reopen', t => {
  const { folder, lib } = fixture(t)
  let detail = lib.create()
  const inspection = complete(detail.inspection)
  for (const key of Object.keys(noteFields) as (keyof typeof noteFields)[]) inspection[key] = `Saved ${key}`
  const saved = lib.saveInspection(detail.card.id, detail.card.revision, inspection)
  lib.setIncludePublic(detail.card.id, saved.card.revision, false)
  const front = lib.addMarker(detail.card.id, 'front', 0.125, 0.875)
  lib.saveMarker(front.id, 'Surface scratch')
  lib.addMarker(detail.card.id, 'back', 1, 0)
  lib.close()
  const reopened = new Library(folder, 'installation-a')
  try {
    detail = reopened.get(saved.card.id)
    assert.equal(detail.card.includePublic, false)
    assert.equal(detail.inspection.centeringNote, 'Saved centeringNote')
    assert.equal(detail.inspection.centeringGrade, 95)
    assert.equal(detail.inspection.cornersGrade, 95)
    assert.equal(detail.markers.length, 2)
    assert.deepEqual(detail.markers.map(marker => [marker.side, marker.x, marker.y, marker.note]), [['front', 0.125, 0.875, 'Surface scratch'], ['back', 1, 0, null]])
    reopened.removeMarker(detail.markers[1].id)
    assert.equal(reopened.get(saved.card.id).markers.length, 1)
  } finally { reopened.close() }
})

test('deleting cascades owned inspection data and permanently tombstones its serial', t => {
  const { folder, lib } = fixture(t)
  const detail = lib.create()
  lib.saveInspection(detail.card.id, detail.card.revision, complete(detail.inspection))
  lib.addMarker(detail.card.id, 'front', 0.5, 0.5)
  lib.delete(detail.card.id)
  assert.equal(lib.list(0).total, 0)
  assert.throws(() => lib.configure({ name: 'Inspection desk', start: 1, end: 50000, next: 1 }), /permanently reserved/)
  assert.equal(lib.create().card.serial, '0000000002')
  const db = new DatabaseSync(join(folder, 'catalogue.sqlite'))
  try {
    assert.equal(db.prepare('SELECT count(*) AS total FROM inspections WHERE cardId=?').get(detail.card.id)!.total, 0)
    assert.equal(db.prepare('SELECT count(*) AS total FROM defect_markers WHERE cardId=?').get(detail.card.id)!.total, 0)
    const reservation = db.prepare('SELECT deletedAt FROM serial_reservations WHERE serial=?').get('0000000001')
    assert.ok(reservation?.deletedAt)
    assert.throws(() => db.prepare('DELETE FROM serial_reservations WHERE serial=?').run('0000000001'), /permanent/)
    assert.throws(() => db.prepare('INSERT INTO serial_reservations(serial,allocationId,originalCardId,assignedAt) SELECT ?,allocationId,?,assignedAt FROM serial_reservations WHERE serial=?').run('0000000001', 'manual-reuse', '0000000001'), /UNIQUE/)
  } finally { db.close() }
})

test('migration upgrades a milestone-1 database and reserves its existing serial', t => {
  const folder = mkdtempSync(join(tmpdir(), 'cug-migration-'))
  t.after(() => rmSync(folder, { recursive: true, force: true }))
  const db = new DatabaseSync(join(folder, 'catalogue.sqlite'))
  db.exec('PRAGMA foreign_keys=ON; CREATE TABLE schema_migrations (version INTEGER PRIMARY KEY, appliedAt TEXT NOT NULL)')
  db.exec(migrations[0])
  db.prepare('INSERT INTO schema_migrations VALUES (1,?)').run(new Date().toISOString())
  db.prepare('INSERT INTO installations VALUES (?,?)').run('installation-a', 'Old desk')
  db.prepare('INSERT INTO allocations VALUES (?,?,?,?,?,NULL)').run('allocation-a', 'installation-a', 1, 50000, 2)
  db.prepare('INSERT INTO cards(id,serial,allocationId,createdAt,updatedAt) VALUES (?,?,?,?,?)').run('old-card', '0000000001', 'allocation-a', new Date().toISOString(), new Date().toISOString())
  db.close()
  const lib = new Library(folder, 'installation-a')
  try {
    const detail = lib.get('old-card')
    assert.equal(detail.inspection.cornersGrade, null)
    assert.equal(detail.card.finalizationState, 'in_progress')
    assert.equal(lib.create().card.serial, '0000000002')
    const migrated = new DatabaseSync(join(folder, 'catalogue.sqlite'))
    try { assert.equal(migrated.prepare('SELECT count(*) AS total FROM schema_migrations').get()!.total, 6); assert.equal(migrated.prepare('SELECT count(*) AS total FROM serial_reservations').get()!.total, 2) } finally { migrated.close() }
  } finally { lib.close() }
})

test('migration replaces the milestone-2 Defects grade without repurposing data or losing markers', t => {
  const folder = mkdtempSync(join(tmpdir(), 'cug-grade-correction-'))
  t.after(() => rmSync(folder, { recursive: true, force: true }))
  const databasePath = join(folder, 'catalogue.sqlite')
  const db = new DatabaseSync(databasePath)
  const now = new Date().toISOString()
  db.exec('PRAGMA foreign_keys=ON; CREATE TABLE schema_migrations (version INTEGER PRIMARY KEY, appliedAt TEXT NOT NULL)')
  db.exec(migrations[0])
  db.prepare('INSERT INTO schema_migrations VALUES (1,?)').run(now)
  db.prepare('INSERT INTO installations VALUES (?,?)').run('installation-a', 'Milestone 2 desk')
  db.prepare('INSERT INTO allocations VALUES (?,?,?,?,?,NULL)').run('allocation-a', 'installation-a', 1, 50000, 2)
  db.prepare('INSERT INTO cards(id,serial,allocationId,status,createdAt,updatedAt) VALUES (?,?,?,?,?,?)').run('old-card', '0000000001', 'allocation-a', 'finalized', now, now)
  db.exec(migrations[1])
  db.prepare('INSERT INTO schema_migrations VALUES (2,?)').run(now)
  db.prepare(`UPDATE inspections SET
    cornersGrade=95,edgesGrade=95,surfaceGrade=90,defectsGrade=85,estimatedGrade=90,
    verticalLeftTop=200,verticalLeftBottom=200,verticalRightTop=200,verticalRightBottom=200,
    horizontalUpperLeft=200,horizontalUpperRight=200,horizontalLowerLeft=200,horizontalLowerRight=200,
    centeringNote='Original centering judgment',defectsNote='Do not turn this into centering',assessmentRevision=7
    WHERE cardId='old-card'`).run()
  db.prepare('UPDATE cards SET finalizedAssessmentRevision=7,finalizedAt=? WHERE id=?').run(now, 'old-card')
  db.prepare('INSERT INTO defect_markers(id,cardId,side,x,y,note,createdAt,updatedAt) VALUES (?,?,?,?,?,?,?,?)').run('old-marker', 'old-card', 'back', 0.2, 0.8, 'Preserve me', now, now)
  db.close()

  const lib = new Library(folder, 'installation-a')
  try {
    const detail = lib.get('old-card')
    assert.equal(detail.inspection.centeringGrade, null)
    assert.equal(detail.inspection.centeringNote, 'Original centering judgment')
    assert.equal(Object.hasOwn(detail.inspection, 'defectsGrade'), false)
    assert.equal(Object.hasOwn(detail.inspection, 'defectsNote'), false)
    assert.equal(detail.inspection.assessmentRevision, 9)
    assert.equal(detail.card.finalizationState, 'changes_pending')
    assert.deepEqual(detail.markers.map(marker => [marker.id, marker.side, marker.x, marker.y, marker.note]), [['old-marker', 'back', 0.2, 0.8, 'Preserve me']])
    const columns = new DatabaseSync(databasePath)
    try {
      const names = columns.prepare('PRAGMA table_info(inspections)').all().map(row => row.name)
      assert.ok(names.includes('centeringGrade'))
      assert.equal(names.includes('defectsGrade'), false)
      assert.equal(names.includes('defectsNote'), false)
    } finally { columns.close() }
  } finally { lib.close() }
})

test('front and back measurements are independent and every required numeric value is validated', t => {
  const { lib } = fixture(t)
  let detail = lib.create()
  assert.equal(Object.keys(measurementFields).length, 16)
  assert.equal(Object.keys(gradeFields).length, 5)
  const inspection = complete(detail.inspection)
  inspection.frontVerticalLeftTop = 200; inspection.frontVerticalLeftBottom = 300
  inspection.backVerticalLeftTop = 300; inspection.backVerticalLeftBottom = 200
  let saved = lib.saveInspection(detail.card.id, detail.card.revision, inspection)
  assert.equal(centeringRatio(saved.inspection.frontVerticalLeftTop, saved.inspection.frontVerticalLeftBottom), '40.0 / 60.0')
  assert.equal(centeringRatio(saved.inspection.backVerticalLeftTop, saved.inspection.backVerticalLeftBottom), '60.0 / 40.0')
  const frontBefore = faceMeasurements(saved.inspection, 'front')
  saved = lib.saveInspection(detail.card.id, saved.card.revision, { ...saved.inspection, backVerticalLeftTop: 250 })
  assert.deepEqual(faceMeasurements(saved.inspection, 'front'), frontBefore)
  assert.equal(formatMeasurement(saved.inspection.backVerticalLeftTop), '2.50')
  const backBefore = faceMeasurements(saved.inspection, 'back')
  saved = lib.saveInspection(detail.card.id, saved.card.revision, { ...saved.inspection, frontVerticalLeftTop: null })
  assert.deepEqual(faceMeasurements(saved.inspection, 'back'), backBefore)
  assert.equal(formatMeasurement(saved.inspection.frontVerticalLeftTop), '')
  assert.throws(() => lib.finalize(detail.card.id, saved.card.revision), /Front — Top Left/)

  for (const key of [...Object.keys(measurementFields), ...Object.keys(gradeFields)] as (keyof typeof measurementFields | keyof typeof gradeFields)[]) {
    const incomplete = { ...complete(saved.inspection), [key]: null }
    saved = lib.saveInspection(detail.card.id, saved.card.revision, incomplete)
    assert.throws(() => lib.finalize(detail.card.id, saved.card.revision), /Complete these required/)
  }
  const oldCompletion = complete(saved.inspection)
  for (const key of Object.keys(measurementFields).filter(key => key.startsWith('back')) as (keyof typeof measurementFields)[]) oldCompletion[key] = null
  saved = lib.saveInspection(detail.card.id, saved.card.revision, oldCompletion)
  assert.equal(missingFinalizationFields(saved.inspection).length, 8)
  assert.throws(() => lib.finalize(detail.card.id, saved.card.revision), /Back/)
  saved = lib.saveInspection(detail.card.id, saved.card.revision, complete(saved.inspection))
  detail = lib.finalize(detail.card.id, saved.card.revision)
  for (const key of ['frontVerticalLeftTop', 'backVerticalLeftTop'] as const) {
    saved = lib.saveInspection(detail.card.id, detail.card.revision, { ...detail.inspection, [key]: 235 })
    assert.equal(saved.card.finalizationState, 'changes_pending')
    detail = lib.finalize(detail.card.id, saved.card.revision)
    assert.equal(detail.card.finalizationState, 'finalized')
  }
  const front = faceMeasurements(detail.inspection, 'front'), back = faceMeasurements(detail.inspection, 'back')
  assert.deepEqual(apparentSkew(front), apparentSkew(back))
  const cw = { ...back, verticalLeftTop: 200, verticalRightTop: 200, verticalLeftBottom: 138, verticalRightBottom: 262, horizontalUpperRight: 244, horizontalLowerLeft: 244 }
  assert.equal(apparentSkew(cw).direction, 'CW')
  assert.equal(apparentSkew({ ...cw, verticalLeftBottom: 1000 }).state, 'unavailable')
  assert.deepEqual(apparentSkew(Object.fromEntries(Object.keys(measurementPositions).map(key => [key, 200])) as typeof back), { state: 'none' })
})

test('migration 6 preserves old Front values and finalized history, leaves Back blank, and preserves photo evidence', async t => {
  const { folder, lib } = fixture(t)
  let detail = lib.create()
  const inspection = complete(detail.inspection)
  for (const [index, position] of Object.keys(measurementPositions).entries()) inspection[('front' + position[0].toUpperCase() + position.slice(1)) as keyof typeof measurementFields] = 200 + index
  let saved = lib.saveInspection(detail.card.id, detail.card.revision, inspection)
  detail = lib.finalize(detail.card.id, saved.card.revision)
  const libraryId = lib.info().libraryId
  const marker = lib.addMarker(detail.card.id, 'back', .25, .75)
  lib.saveMarker(marker.id, 'Retain evidence')
  const source = join(folder, 'source.png'); writeFileSync(source, 'source')
  const imported = await lib.importPhotos(detail.card.id, 'full_back', [source])
  lib.setPhotoMarkers(imported.photos[0].id, [marker.id])
  const previous = lib.get(detail.card.id)
  lib.close()
  const db = new DatabaseSync(join(folder, 'catalogue.sqlite'))
  for (const position of Object.keys(measurementPositions)) {
    const suffix = position[0].toUpperCase() + position.slice(1)
    db.exec(`ALTER TABLE inspections DROP COLUMN back${suffix}; ALTER TABLE inspections RENAME COLUMN front${suffix} TO ${position};`)
  }
  db.exec('DELETE FROM schema_migrations WHERE version=6')
  db.close()
  const reopened = new Library(folder, 'installation-a')
  try {
    detail = reopened.get(previous.card.id)
    assert.equal(reopened.info().libraryId, libraryId)
    assert.equal(detail.card.serial, previous.card.serial)
    assert.equal(detail.card.id, previous.card.id)
    assert.equal(detail.card.finalizedAt, previous.card.finalizedAt)
    assert.equal(detail.card.finalizedAssessmentRevision, previous.card.finalizedAssessmentRevision)
    assert.equal(detail.inspection.assessmentRevision, previous.inspection.assessmentRevision + 1)
    assert.equal(detail.card.status, 'finalized')
    assert.equal(detail.card.finalizationState, 'changes_pending')
    assert.deepEqual(faceMeasurements(detail.inspection, 'front'), faceMeasurements(previous.inspection, 'front'))
    assert.ok(Object.values(faceMeasurements(detail.inspection, 'back')).every(value => value === null))
    assert.deepEqual(detail.markers, previous.markers)
    assert.deepEqual(detail.photos, previous.photos)
    for (const key of Object.keys(gradeFields) as (keyof typeof gradeFields)[]) assert.equal(detail.inspection[key], previous.inspection[key])
    assert.equal(reopened.publicSiteCards().length, 0)
    assert.throws(() => reopened.finalize(detail.card.id, detail.card.revision), /Back/)
    saved = reopened.saveInspection(detail.card.id, detail.card.revision, { ...detail.inspection, ...Object.fromEntries(Object.keys(measurementFields).filter(key => key.startsWith('back')).map(key => [key, 250])) })
    detail = reopened.finalize(detail.card.id, saved.card.revision)
    assert.equal(detail.card.finalizationState, 'finalized')
  } finally { reopened.close() }
  const again = new Library(folder, 'installation-a')
  try { assert.equal(again.get(detail.card.id).inspection.assessmentRevision, detail.inspection.assessmentRevision) } finally { again.close() }
})

test('all four directional ratios and skew are derived independently for each face', () => {
  const inspection = { ...Object.fromEntries(Object.keys(measurementFields).map(key => [key, 200])),
    frontVerticalLeftTop: 200, frontVerticalLeftBottom: 300, frontVerticalRightTop: 100, frontVerticalRightBottom: 400,
    frontHorizontalUpperLeft: 300, frontHorizontalUpperRight: 200, frontHorizontalLowerLeft: 400, frontHorizontalLowerRight: 100,
    backVerticalLeftTop: 300, backVerticalLeftBottom: 200, backVerticalRightTop: 400, backVerticalRightBottom: 100,
    backHorizontalUpperLeft: 200, backHorizontalUpperRight: 300, backHorizontalLowerLeft: 100, backHorizontalLowerRight: 400
  } as Inspection
  const ratios = (face: 'front' | 'back') => {
    const v = faceMeasurements(inspection, face)
    return [
      centeringRatio(v.verticalLeftTop, v.verticalLeftBottom), centeringRatio(v.verticalRightTop, v.verticalRightBottom),
      centeringRatio(v.horizontalUpperLeft, v.horizontalUpperRight), centeringRatio(v.horizontalLowerLeft, v.horizontalLowerRight)
    ]
  }
  assert.deepEqual(ratios('front'), ['40.0 / 60.0', '20.0 / 80.0', '60.0 / 40.0', '80.0 / 20.0'])
  assert.deepEqual(ratios('back'), ['60.0 / 40.0', '80.0 / 20.0', '40.0 / 60.0', '20.0 / 80.0'])
  const originalFront = ratios('front'), frontSkew = apparentSkew(faceMeasurements(inspection, 'front'))
  inspection.backHorizontalUpperRight = 1000
  assert.deepEqual(ratios('front'), originalFront)
  assert.deepEqual(apparentSkew(faceMeasurements(inspection, 'front')), frontSkew)
  assert.equal(apparentSkew(faceMeasurements(inspection, 'back')).state, 'unavailable')
})
