export const fields = {
  game: 'Game / Category', setName: 'Set', cardName: 'Card Name', cardNumber: 'Card Number',
  year: 'Year', language: 'Language', variant: 'Variant / Parallel', rarity: 'Rarity',
  manufacturer: 'Manufacturer / Publisher', submittedBy: 'Submitted by', notes: 'General Notes'
} as const
export type Field = keyof typeof fields
export type Metadata = Record<Field, string | null>
export interface Card extends Metadata {
  id: string; serial: string; status: 'in_progress' | 'finalized'; includePublic: boolean
  createdAt: string; updatedAt: string; revision: number
}
export interface Allocation { id: string; start: number; end: number; next: number; retiredAt: string | null }
export interface LibraryInfo {
  folder: string; installationName: string; allocation: Allocation | null; history: Allocation[]
}
export interface Setup { name: string; start: number; end: number; next: number }
export interface Page { cards: Card[]; total: number }
export type Result<T> = { ok: true; value: T } | { ok: false; error: string }
export interface Api {
  info(): Promise<Result<LibraryInfo | null>>
  chooseLibrary(create: boolean): Promise<Result<LibraryInfo | null>>
  configure(setup: Setup): Promise<Result<LibraryInfo>>
  list(offset: number): Promise<Result<Page>>
  create(): Promise<Result<Card>>
  save(id: string, revision: number, metadata: Metadata): Promise<Result<Card>>
  onFlush(callback: () => Promise<boolean>): () => void
}
export const serialText = (n: number): string => n.toString().padStart(10, '0')
export const PAGE_SIZE = 100
