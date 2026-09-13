export const fields = {
  game: 'Game / Category', setName: 'Set', cardName: 'Card Name', cardNumber: 'Card Number',
  year: 'Year', language: 'Language', variant: 'Variant / Parallel', rarity: 'Rarity',
  manufacturer: 'Manufacturer / Publisher', submittedBy: 'Submitted by', notes: 'General Notes'
} as const
export const gradeFields = {
  centeringGrade: 'Centering', cornersGrade: 'Corners', edgesGrade: 'Edges',
  surfaceGrade: 'Surface', estimatedGrade: 'Estimated Grade'
} as const
export const measurementPositions = {
  verticalLeftTop: 'Top Left', verticalLeftBottom: 'Bottom Left',
  verticalRightTop: 'Top Right', verticalRightBottom: 'Bottom Right',
  horizontalUpperLeft: 'Upper Left', horizontalUpperRight: 'Upper Right',
  horizontalLowerLeft: 'Lower Left', horizontalLowerRight: 'Lower Right'
} as const
export type MeasurementPosition = keyof typeof measurementPositions
export type CenteringFace = 'front' | 'back'
export function measurementKey(face: CenteringFace, position: MeasurementPosition): MeasurementField {
  return `${face}${position[0].toUpperCase()}${position.slice(1)}` as MeasurementField
}
export const measurementFields = {
  frontVerticalLeftTop: 'Front — Top Left', frontVerticalLeftBottom: 'Front — Bottom Left',
  frontVerticalRightTop: 'Front — Top Right', frontVerticalRightBottom: 'Front — Bottom Right',
  frontHorizontalUpperLeft: 'Front — Upper Left', frontHorizontalUpperRight: 'Front — Upper Right',
  frontHorizontalLowerLeft: 'Front — Lower Left', frontHorizontalLowerRight: 'Front — Lower Right',
  backVerticalLeftTop: 'Back — Top Left', backVerticalLeftBottom: 'Back — Bottom Left',
  backVerticalRightTop: 'Back — Top Right', backVerticalRightBottom: 'Back — Bottom Right',
  backHorizontalUpperLeft: 'Back — Upper Left', backHorizontalUpperRight: 'Back — Upper Right',
  backHorizontalLowerLeft: 'Back — Lower Left', backHorizontalLowerRight: 'Back — Lower Right'
} as const
export const noteFields = {
  centeringNote: 'Centering note', cornersNote: 'Corners note', edgesNote: 'Edges note',
  surfaceNote: 'Surface note', estimatedNote: 'Estimated Grade note'
} as const
export const photoSlots = {
  full_front: 'Front', full_back: 'Back',
  corner_top_left: 'Top Left', corner_top_right: 'Top Right',
  corner_bottom_left: 'Bottom Left', corner_bottom_right: 'Bottom Right',
  edge_top: 'Top', edge_right: 'Right', edge_bottom: 'Bottom', edge_left: 'Left'
} as const
export type Field = keyof typeof fields
export type GradeField = keyof typeof gradeFields
export type MeasurementField = keyof typeof measurementFields
export type NoteField = keyof typeof noteFields
export type PrimaryPhotoSlot = keyof typeof photoSlots
export type Metadata = Record<Field, string | null>
export type FinalizationState = 'in_progress' | 'finalized' | 'changes_pending'
export interface Card extends Metadata {
  id: string; serial: string; status: 'in_progress' | 'finalized'; includePublic: boolean
  finalizationState: FinalizationState; finalizedAt: string | null; finalizedAssessmentRevision: number | null
  estimatedGrade: number | null
  createdAt: string; updatedAt: string; revision: number
}
export interface Inspection extends Record<GradeField | MeasurementField, number | null>, Record<NoteField, string | null> {
  cardId: string; assessmentRevision: number
}
export interface DefectMarker {
  id: string; cardId: string; side: 'front' | 'back'; x: number; y: number
  note: string | null; linkedPhotoCount: number; createdAt: string; updatedAt: string
}
export interface Photo {
  id: string; cardId: string; slot: PrimaryPhotoSlot | null; title: string | null
  locked: boolean; originalFilename: string; mimeType: string; markerIds: string[]
  createdAt: string; updatedAt: string
}
export interface CardDetail { card: Card; inspection: Inspection; markers: DefectMarker[]; photos: Photo[] }
export interface InspectionSave { card: Card; inspection: Inspection }
export interface Allocation { id: string; start: number; end: number; next: number; retiredAt: string | null }
export interface LibraryInfo {
  folder: string; libraryId: string; installationName: string; allocation: Allocation | null; history: Allocation[]
}
export interface Setup { name: string; start: number; end: number; next: number }
export interface Page { cards: Card[]; total: number }
export interface ArchiveProgress {
  operation: 'create' | 'restore'
  stage: 'preparing' | 'validating' | 'database' | 'photos' | 'extracting' | 'finalizing' | 'complete'
  completed?: number
  total?: number
}
export interface ArchiveCreated { filename: string }
export interface ArchiveRestored { filename: string; info: LibraryInfo }
export interface SiteProgress {
  stage: 'preparing' | 'checking' | 'photos' | 'generating' | 'search' | 'writing' | 'complete'
  mode: PublicSiteGenerationMode
  completed?: number
  total?: number
  summary?: PublicSiteGenerationSummary
}
export type PublicSiteGenerationMode = 'update' | 'rebuild'
export interface PublicSiteGenerationSummary {
  newReports: number
  updatedReports: number
  removedReports: number
  unchangedReports: number
  rebuiltReports: number
}
export interface PublicSiteSettings { outputFolder: string | null }
export interface PublicSiteGenerated extends PublicSiteGenerationSummary { outputFolder: string; reportCount: number; mode: PublicSiteGenerationMode; warnings: string[] }
export type Result<T> = { ok: true; value: T } | { ok: false; error: string }
export interface Api {
  info(): Promise<Result<LibraryInfo | null>>
  chooseLibrary(create: boolean): Promise<Result<LibraryInfo | null>>
  configure(setup: Setup): Promise<Result<LibraryInfo>>
  list(offset: number): Promise<Result<Page>>
  get(id: string): Promise<Result<CardDetail>>
  create(): Promise<Result<CardDetail>>
  save(id: string, revision: number, metadata: Metadata): Promise<Result<Card>>
  saveInspection(id: string, revision: number, inspection: Inspection): Promise<Result<InspectionSave>>
  setIncludePublic(id: string, revision: number, include: boolean): Promise<Result<Card>>
  addMarker(cardId: string, side: DefectMarker['side'], x: number, y: number): Promise<Result<DefectMarker>>
  saveMarker(id: string, note: string | null): Promise<Result<DefectMarker>>
  removeMarker(id: string): Promise<Result<null>>
  choosePhotos(cardId: string, slot: PrimaryPhotoSlot | null): Promise<Result<CardDetail | null>>
  importDroppedPhotos(cardId: string, slot: PrimaryPhotoSlot | null, files: File[]): Promise<Result<CardDetail>>
  savePhotoTitle(id: string, title: string | null): Promise<Result<Photo>>
  setPhotoLocked(id: string, locked: boolean): Promise<Result<CardDetail>>
  setPhotoMarkers(id: string, markerIds: string[]): Promise<Result<CardDetail>>
  removePhoto(id: string): Promise<Result<CardDetail>>
  finalize(id: string, revision: number): Promise<Result<CardDetail>>
  delete(id: string): Promise<Result<null>>
  createArchive(): Promise<Result<ArchiveCreated | null>>
  restoreArchive(): Promise<Result<ArchiveRestored | null>>
  onArchiveProgress(callback: (progress: ArchiveProgress) => void): () => void
  publicSiteSettings(): Promise<Result<PublicSiteSettings>>
  choosePublicSiteFolder(): Promise<Result<PublicSiteSettings | null>>
  generatePublicSite(mode: PublicSiteGenerationMode): Promise<Result<PublicSiteGenerated | null>>
  onSiteProgress(callback: (progress: SiteProgress) => void): () => void
  onFlush(callback: () => Promise<boolean>): () => void
}
export const photoMediaUrl = (id: string, variant: 'thumbnail' | 'original'): string => `cug-media://${variant}/${encodeURIComponent(id)}`
export const serialText = (n: number): string => n.toString().padStart(10, '0')
export const PAGE_SIZE = 100
