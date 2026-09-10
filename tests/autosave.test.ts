import { test } from 'node:test'
import assert from 'node:assert/strict'
import { Autosave, CardAutosave } from '../src/renderer/autosave'
import { fields, gradeFields, measurementFields, noteFields, type Card, type CardDetail } from '../src/shared/contracts'
const card = { ...Object.fromEntries(Object.keys(fields).map(k => [k, null])), id: 'id', serial: '0000000001', revision: 0 } as Card
test('flush drains typing during an in-flight save, in revision order', async () => {
  const writes: string[] = []
  let release!: () => void
  const gate = new Promise<void>(resolve => { release = resolve })
  const editor = new Autosave(card, async (_id, revision, metadata) => {
    writes.push(metadata.cardName!); if (writes.length === 1) await gate
    assert.equal(revision, writes.length - 1)
    return { ...card, ...metadata, revision: revision + 1 }
  }, () => {})
  editor.edit('cardName', 'First')
  const first = editor.flush()
  editor.edit('cardName', 'Second')
  const second = editor.flush()
  release()
  assert.equal(await first, true); assert.equal(await second, true)
  assert.deepEqual(writes, ['First', 'Second']); assert.equal(editor.card.cardName, 'Second')
})
test('failed autosave retains edits and supports retry', async () => {
  let fail = true
  const editor = new Autosave(card, async (_id, revision, metadata) => {
    if (fail) throw new Error('disk full')
    return { ...card, ...metadata, revision: revision + 1 }
  }, () => {})
  editor.edit('notes', 'Keep this')
  assert.equal(await editor.flush(), false); assert.equal(editor.card.notes, 'Keep this')
  fail = false; assert.equal(await editor.flush(), true)
})

test('card autosave serializes metadata and inspection through one card revision', async () => {
  let release!: () => void
  const gate = new Promise<void>(resolve => { release = resolve })
  const inspection = {
    ...Object.fromEntries([...Object.keys(gradeFields), ...Object.keys(measurementFields)].map(key => [key, null])),
    ...Object.fromEntries(Object.keys(noteFields).map(key => [key, null])),
    cardId: 'id', assessmentRevision: 0
  }
  const detail = { card: { ...card, revision: 0 }, inspection, markers: [] } as unknown as CardDetail
  const calls: string[] = []
  const editor = new CardAutosave(detail, {
    metadata: async (_id, revision, metadata) => {
      assert.equal(revision, 0); calls.push(`metadata:${metadata.cardName}`); await gate
      return { ...detail.card, ...metadata, revision: 1 }
    },
    inspection: async (_id, revision, next) => {
      assert.equal(revision, 1); calls.push(`inspection:${next.cornersGrade}`)
      return { card: { ...detail.card, revision: 2 }, inspection: { ...next, assessmentRevision: 1 } }
    },
    marker: async () => { throw new Error('unexpected marker save') },
    photo: async () => { throw new Error('unexpected photo save') }
  }, () => {}, () => {})
  editor.editMetadata('cardName', 'Pikachu')
  const flushing = editor.flush()
  editor.editInspection('cornersGrade', 95)
  release()
  assert.equal(await flushing, true)
  assert.deepEqual(calls, ['metadata:Pikachu', 'inspection:95'])
  assert.equal(editor.detail.card.revision, 2)
  assert.equal(editor.detail.inspection.cornersGrade, 95)
})

test('metadata typed during an in-flight inspection save is retained and saved next', async () => {
  let release!: () => void
  const gate = new Promise<void>(resolve => { release = resolve })
  const inspection = {
    ...Object.fromEntries([...Object.keys(gradeFields), ...Object.keys(measurementFields)].map(key => [key, null])),
    ...Object.fromEntries(Object.keys(noteFields).map(key => [key, null])),
    cardId: 'id', assessmentRevision: 0
  }
  const detail = { card: { ...card, revision: 0 }, inspection, markers: [] } as unknown as CardDetail
  const calls: string[] = []
  const editor = new CardAutosave(detail, {
    metadata: async (_id, revision, metadata) => {
      assert.equal(revision, 1); calls.push(`metadata:${metadata.cardName}`)
      return { ...detail.card, ...metadata, revision: 2 }
    },
    inspection: async (_id, revision, next) => {
      assert.equal(revision, 0); calls.push(`inspection:${next.cornersGrade}`); await gate
      return { card: { ...detail.card, revision: 1 }, inspection: { ...next, assessmentRevision: 1 } }
    },
    marker: async () => { throw new Error('unexpected marker save') },
    photo: async () => { throw new Error('unexpected photo save') }
  }, () => {}, () => {})
  editor.editInspection('cornersGrade', 95)
  const flushing = editor.flush()
  editor.editMetadata('cardName', 'Pikachu')
  release()
  assert.equal(await flushing, true)
  assert.deepEqual(calls, ['inspection:95', 'metadata:Pikachu'])
  assert.equal(editor.detail.card.cardName, 'Pikachu')
  assert.equal(editor.detail.card.revision, 2)
})

test('additional photo title autosave drains edits made during an in-flight save', async () => {
  let release!: () => void
  const gate = new Promise<void>(resolve => { release = resolve })
  const inspection = {
    ...Object.fromEntries([...Object.keys(gradeFields), ...Object.keys(measurementFields)].map(key => [key, null])),
    ...Object.fromEntries(Object.keys(noteFields).map(key => [key, null])),
    cardId: 'id', assessmentRevision: 0
  }
  const photo = { id: 'photo', cardId: 'id', slot: null, title: null, locked: false, originalFilename: 'detail.png', mimeType: 'image/png', markerIds: [], createdAt: 'now', updatedAt: 'now' }
  const detail = { card: { ...card, revision: 0 }, inspection, markers: [], photos: [photo] } as unknown as CardDetail
  const writes: Array<string | null> = []
  const editor = new CardAutosave(detail, {
    metadata: async () => { throw new Error('unexpected metadata save') },
    inspection: async () => { throw new Error('unexpected inspection save') },
    marker: async () => { throw new Error('unexpected marker save') },
    photo: async (_id, title) => {
      writes.push(title)
      if (writes.length === 1) await gate
      return { ...photo, title, updatedAt: `write-${writes.length}` }
    }
  }, () => {}, () => {})
  editor.editPhotoTitle(photo.id, 'First title')
  const flushing = editor.flush()
  editor.editPhotoTitle(photo.id, 'Final title')
  release()
  assert.equal(await flushing, true)
  assert.deepEqual(writes, ['First title', 'Final title'])
  assert.equal(editor.detail.photos[0].title, 'Final title')
})
