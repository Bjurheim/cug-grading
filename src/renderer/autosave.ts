import { fields, type Card, type Metadata } from '../shared/contracts'
export type SaveState = 'saved' | 'saving' | 'unsaved' | 'error'
// A single writer per editor. New typing never gets overwritten by an older response.
export class Autosave {
  private version = 0
  private savedVersion = 0
  private timer?: ReturnType<typeof setTimeout>
  private running?: Promise<boolean>
  constructor(public card: Card, private save: (id: string, revision: number, metadata: Metadata) => Promise<Card>, private notify: (state: SaveState, error?: string) => void) {}
  edit(key: keyof Metadata, value: string): void {
    this.card = { ...this.card, [key]: value }
    this.version++
    this.notify('unsaved')
    clearTimeout(this.timer)
    this.timer = setTimeout(() => { void this.flush() }, 300)
  }
  async flush(): Promise<boolean> {
    clearTimeout(this.timer)
    if (this.running) { const ok = await this.running; return ok ? this.flush() : false }
    this.running = this.drain()
    try { return await this.running } finally { this.running = undefined }
  }
  private async drain(): Promise<boolean> {
    while (this.savedVersion < this.version) {
      const version = this.version
      const metadata = Object.fromEntries(Object.keys(fields).map(k => [k, this.card[k as keyof Metadata]])) as Metadata
      this.notify('saving')
      try {
        const saved = await this.save(this.card.id, this.card.revision, metadata)
        this.card = { ...this.card, revision: saved.revision, updatedAt: saved.updatedAt }
        this.savedVersion = version
      } catch (e) { this.notify('error', e instanceof Error ? e.message : 'Save failed.'); return false }
    }
    this.notify('saved')
    return true
  }
}
