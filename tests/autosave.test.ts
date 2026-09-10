import { test } from 'node:test'
import assert from 'node:assert/strict'
import { Autosave } from '../src/renderer/autosave'
import { fields, type Card } from '../src/shared/contracts'
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
