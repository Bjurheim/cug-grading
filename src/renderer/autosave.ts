import {
  fields, gradeFields, measurementFields, noteFields,
  type Card, type CardDetail, type DefectMarker, type GradeField, type Photo,
  type InspectionSave, type MeasurementField, type Metadata, type NoteField
} from '../shared/contracts'
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

type InspectionKey = GradeField | MeasurementField | NoteField
interface CardSaves {
  metadata(id: string, revision: number, metadata: Metadata): Promise<Card>
  inspection(id: string, revision: number, inspection: CardDetail['inspection']): Promise<InspectionSave>
  marker(id: string, note: string | null): Promise<DefectMarker>
  photo(id: string, title: string | null): Promise<Photo>
}

export class CardAutosave {
  private metadataVersion = 0
  private savedMetadataVersion = 0
  private inspectionVersion = 0
  private savedInspectionVersion = 0
  private markerVersions = new Map<string, number>()
  private savedMarkerVersions = new Map<string, number>()
  private photoVersions = new Map<string, number>()
  private savedPhotoVersions = new Map<string, number>()
  private timer?: ReturnType<typeof setTimeout>
  private running?: Promise<boolean>

  constructor(
    public detail: CardDetail,
    private saves: CardSaves,
    private notify: (state: SaveState, error?: string) => void,
    private changed: (detail: CardDetail) => void
  ) {}

  editMetadata(key: keyof Metadata, value: string): void {
    this.detail = { ...this.detail, card: { ...this.detail.card, [key]: value } }
    this.metadataVersion++
    this.schedule()
  }

  editInspection(key: InspectionKey, value: number | string | null): void {
    this.detail = { ...this.detail, inspection: { ...this.detail.inspection, [key]: value } }
    this.inspectionVersion++
    this.schedule()
  }

  editMarkerNote(id: string, note: string): void {
    this.detail = { ...this.detail, markers: this.detail.markers.map(marker => marker.id === id ? { ...marker, note } : marker) }
    this.markerVersions.set(id, (this.markerVersions.get(id) ?? 0) + 1)
    this.schedule()
  }

  editPhotoTitle(id: string, title: string): void {
    this.detail = { ...this.detail, photos: this.detail.photos.map(photo => photo.id === id ? { ...photo, title } : photo) }
    this.photoVersions.set(id, (this.photoVersions.get(id) ?? 0) + 1)
    this.schedule()
  }

  replace(detail: CardDetail): void {
    this.detail = detail
    this.changed(detail)
  }

  async flush(): Promise<boolean> {
    clearTimeout(this.timer)
    if (this.running) { const ok = await this.running; return ok ? this.flush() : false }
    this.running = this.drain()
    try { return await this.running } finally { this.running = undefined }
  }

  private schedule(): void {
    this.changed(this.detail)
    this.notify('unsaved')
    clearTimeout(this.timer)
    this.timer = setTimeout(() => { void this.flush() }, 300)
  }

  private async drain(): Promise<boolean> {
    try {
      while (this.savedMetadataVersion < this.metadataVersion || this.savedInspectionVersion < this.inspectionVersion || this.hasDirtyMarker() || this.hasDirtyPhoto()) {
        this.notify('saving')
        if (this.savedMetadataVersion < this.metadataVersion) await this.saveMetadata()
        if (this.savedInspectionVersion < this.inspectionVersion) await this.saveInspection()
        const markerId = this.dirtyMarker()
        if (markerId) await this.saveMarker(markerId)
        const photoId = this.dirtyPhoto()
        if (photoId) await this.savePhoto(photoId)
      }
      this.notify('saved')
      return true
    } catch (error) {
      this.notify('error', error instanceof Error ? error.message : 'Save failed.')
      return false
    }
  }

  private async saveMetadata(): Promise<void> {
    const version = this.metadataVersion
    const metadata = Object.fromEntries(Object.keys(fields).map(key => [key, this.detail.card[key as keyof Metadata]])) as Metadata
    const saved = await this.saves.metadata(this.detail.card.id, this.detail.card.revision, metadata)
    const current = this.detail.card
    this.detail = { ...this.detail, card: { ...saved, ...Object.fromEntries(Object.keys(fields).map(key => [key, current[key as keyof Metadata]])) } }
    this.savedMetadataVersion = version
    this.changed(this.detail)
  }

  private async saveInspection(): Promise<void> {
    const version = this.inspectionVersion
    const current = this.detail.inspection
    const saved = await this.saves.inspection(this.detail.card.id, this.detail.card.revision, current)
    const currentCard = this.detail.card
    const inspection = version === this.inspectionVersion ? saved.inspection : {
      ...saved.inspection,
      ...Object.fromEntries([...Object.keys(gradeFields), ...Object.keys(measurementFields), ...Object.keys(noteFields)].map(key => [key, this.detail.inspection[key as InspectionKey]]))
    }
    // Metadata may have changed while the inspection request was in flight. Keep
    // that newer draft while accepting the server's revision and workflow state.
    const pendingMetadata = Object.fromEntries(Object.keys(fields).map(key => [key, currentCard[key as keyof Metadata]]))
    this.detail = { ...this.detail, card: { ...saved.card, ...pendingMetadata }, inspection }
    this.savedInspectionVersion = version
    this.changed(this.detail)
  }

  private async saveMarker(id: string): Promise<void> {
    const version = this.markerVersions.get(id) ?? 0
    const marker = this.detail.markers.find(item => item.id === id)
    if (!marker) { this.savedMarkerVersions.set(id, version); return }
    const saved = await this.saves.marker(id, marker.note)
    this.savedMarkerVersions.set(id, version)
    if (version === (this.markerVersions.get(id) ?? 0)) {
      this.detail = { ...this.detail, markers: this.detail.markers.map(item => item.id === id ? saved : item) }
      this.changed(this.detail)
    }
  }

  private hasDirtyMarker(): boolean { return this.dirtyMarker() !== undefined }
  private dirtyMarker(): string | undefined {
    return [...this.markerVersions].find(([id, version]) => (this.savedMarkerVersions.get(id) ?? 0) < version)?.[0]
  }
  private async savePhoto(id: string): Promise<void> {
    const version = this.photoVersions.get(id) ?? 0
    const photo = this.detail.photos.find(item => item.id === id)
    if (!photo) { this.savedPhotoVersions.set(id, version); return }
    const saved = await this.saves.photo(id, photo.title)
    this.savedPhotoVersions.set(id, version)
    const current = this.detail.photos.find(item => item.id === id)
    if (current) {
      const merged = version === (this.photoVersions.get(id) ?? 0) ? saved : { ...saved, title: current.title }
      this.detail = { ...this.detail, photos: this.detail.photos.map(item => item.id === id ? merged : item) }
      this.changed(this.detail)
    }
  }
  private hasDirtyPhoto(): boolean { return this.dirtyPhoto() !== undefined }
  private dirtyPhoto(): string | undefined {
    return [...this.photoVersions].find(([id, version]) => (this.savedPhotoVersions.get(id) ?? 0) < version)?.[0]
  }
}
