import { DatabaseSync } from 'node:sqlite'
import { randomUUID } from 'node:crypto'
import { existsSync, mkdirSync, readdirSync } from 'node:fs'
import { join } from 'node:path'
import { migrate } from './migrations'
import { fields, PAGE_SIZE, serialText, type Allocation, type Card, type LibraryInfo, type Metadata, type Page, type Setup } from '../shared/contracts'
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
export class Library {
  private db: DatabaseSync
  constructor(readonly folder: string, readonly installationId: string, create = false) {
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
  info(): LibraryInfo {
    const installation = this.db.prepare('SELECT name FROM installations WHERE id=?').get(this.installationId)
    const history = this.db.prepare('SELECT id,start,end,next,retiredAt FROM allocations WHERE installationId=? ORDER BY rowid DESC').all(this.installationId) as unknown as Allocation[]
    return { folder: this.folder, installationName: installation?.name as string ?? '', allocation: history.find(a => !a.retiredAt) ?? null, history }
  }
  configure(value: unknown): LibraryInfo {
    validateSetup(value)
    return this.transaction(() => {
      const current = this.info().allocation
      if (this.db.prepare('SELECT id FROM cards WHERE serial=?').get(serialText(value.next))) throw new Error('That next serial already belongs to a card. Choose an unused serial.')
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
  create(): Card {
    return this.transaction(() => {
      const allocation = this.info().allocation
      if (!allocation) throw new Error('Configure this workstation’s serial allocation first.')
      // Walk only the occupied contiguous run, not the whole numeric range.
      let next = allocation.next
      const occupied = this.db.prepare('SELECT serial FROM cards WHERE serial>=? AND serial<=? ORDER BY serial').iterate(serialText(next), serialText(allocation.end))
      for (const row of occupied) { if (Number(row.serial) !== next) break; next++ }
      if (next > allocation.end) throw new Error('This serial allocation is exhausted. Configure a new range in settings.')
      const id = randomUUID(), now = new Date().toISOString()
      this.db.prepare('INSERT INTO cards(id,serial,allocationId,createdAt,updatedAt) VALUES (?,?,?,?,?)').run(id, serialText(next), allocation.id, now, now)
      this.db.prepare('UPDATE allocations SET next=? WHERE id=?').run(next + 1, allocation.id)
      return this.get(id)
    })
  }
  private get(id: string): Card {
    const row = this.db.prepare('SELECT * FROM cards WHERE id=?').get(id)
    if (!row) throw new Error('Card not found.')
    return { ...row, includePublic: row.includePublic === 1 } as unknown as Card
  }
  list(offset: unknown): Page {
    if (typeof offset !== 'number' || !Number.isSafeInteger(offset) || offset < 0) throw new Error('Invalid page.')
    const cards = this.db.prepare('SELECT * FROM cards ORDER BY updatedAt DESC,id DESC LIMIT ? OFFSET ?').all(PAGE_SIZE, offset).map(row => ({ ...row, includePublic: row.includePublic === 1 })) as unknown as Card[]
    return { cards, total: Number(this.db.prepare('SELECT count(*) AS total FROM cards').get()!.total) }
  }
  save(id: unknown, revision: unknown, value: unknown): Card {
    if (typeof id !== 'string' || id.length > 100 || !Number.isSafeInteger(revision)) throw new Error('Invalid card update.')
    const metadata = metadataInput(value)
    const keys = Object.keys(fields) as (keyof Metadata)[]
    const result = this.db.prepare(`UPDATE cards SET ${keys.map(k => `${k}=?`).join(',')}, updatedAt=?,revision=revision+1 WHERE id=? AND revision=?`).run(...keys.map(k => metadata[k]), new Date().toISOString(), id, revision as number)
    if (result.changes !== 1) throw new Error('This card changed elsewhere or is missing. Your edits are still here; reopen the library before editing further.')
    return this.get(id)
  }
  close(): void { this.db.close() }
}
