import type { PrimaryPhotoSlot } from '../shared/contracts'

export interface PublicMarkerSource {
  sourceId: string
  side: 'front' | 'back'
  x: number
  y: number
  note: string | null
}

export interface PublicPhotoSource {
  sourceId: string
  slot: PrimaryPhotoSlot | null
  title: string | null
  originalFilename: string
  sourcePath: string
  markerSourceIds: string[]
  createdAt: string
}

export interface PublicInspectionSource {
  centeringGrade: number
  cornersGrade: number
  edgesGrade: number
  surfaceGrade: number
  estimatedGrade: number
  frontVerticalLeftTop: number | null
  frontVerticalLeftBottom: number | null
  frontVerticalRightTop: number | null
  frontVerticalRightBottom: number | null
  frontHorizontalUpperLeft: number | null
  frontHorizontalUpperRight: number | null
  frontHorizontalLowerLeft: number | null
  frontHorizontalLowerRight: number | null
  backVerticalLeftTop: number | null
  backVerticalLeftBottom: number | null
  backVerticalRightTop: number | null
  backVerticalRightBottom: number | null
  backHorizontalUpperLeft: number | null
  backHorizontalUpperRight: number | null
  backHorizontalLowerLeft: number | null
  backHorizontalLowerRight: number | null
  centeringNote: string | null
  cornersNote: string | null
  edgesNote: string | null
  surfaceNote: string | null
}

export interface PublicCardSource {
  serial: string
  game: string | null
  setName: string | null
  cardName: string | null
  cardNumber: string | null
  year: string | null
  language: string | null
  variant: string | null
  rarity: string | null
  manufacturer: string | null
  inspection: PublicInspectionSource
  markers: PublicMarkerSource[]
  photos: PublicPhotoSource[]
}

export interface LegacyPublicInspectionSource extends Omit<PublicInspectionSource, `${'front' | 'back'}${string}`> {
  verticalLeftTop: number
  verticalLeftBottom: number
  verticalRightTop: number
  verticalRightBottom: number
  horizontalUpperLeft: number
  horizontalUpperRight: number
  horizontalLowerLeft: number
  horizontalLowerRight: number
}
