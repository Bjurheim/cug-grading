import { gradeFields, measurementFields, measurementPositions, measurementKey, type CenteringFace, type Inspection, type MeasurementField, type MeasurementPosition } from './contracts'

export type ParsedFixed = { valid: true; value: number | null } | { valid: false }

export function parseFixedInput(input: string, decimals: number, maximum?: number): ParsedFixed {
  if (input === '') return { valid: true, value: null }
  const expression = decimals === 1 ? /^\d+(?:\.\d)?$/ : /^\d+(?:\.\d{1,2})?$/
  if (!expression.test(input)) return { valid: false }
  const numeric = Number(input)
  if (!Number.isFinite(numeric) || numeric < 0 || (maximum !== undefined && numeric > maximum)) return { valid: false }
  return { valid: true, value: Math.round(numeric * 10 ** decimals) }
}

export const formatGrade = (value: number | null): string => value === null ? '' : (value / 10).toFixed(1)
export const formatMeasurement = (value: number | null): string => value === null ? '' : (value / 100).toFixed(2)

export function centeringRatio(first: number | null, second: number | null): string | null {
  if (first === null || second === null || first < 0 || second < 0 || first + second === 0) return null
  const firstPercent = first / (first + second) * 100
  return `${firstPercent.toFixed(1)} / ${(100 - firstPercent).toFixed(1)}`
}

export interface SkewResult { state: 'unavailable' | 'none' | 'estimated'; degrees?: number; direction?: 'CW' | 'CCW' }

export type FaceMeasurements = Record<MeasurementPosition, number | null>
export function faceMeasurements(inspection: Pick<Inspection, MeasurementField>, face: CenteringFace): FaceMeasurements {
  return Object.fromEntries(Object.keys(measurementPositions).map(position => [position, inspection[measurementKey(face, position as MeasurementPosition)]])) as FaceMeasurements
}

export function apparentSkew(inspection: FaceMeasurements): SkewResult {
  const values = Object.keys(measurementPositions).map(key => inspection[key as MeasurementPosition])
  if (values.some(value => value === null || value < 0)) return { state: 'unavailable' }
  const vlt = inspection.verticalLeftTop! / 100, vlb = inspection.verticalLeftBottom! / 100
  const vrt = inspection.verticalRightTop! / 100, vrb = inspection.verticalRightBottom! / 100
  const hul = inspection.horizontalUpperLeft! / 100, hur = inspection.horizontalUpperRight! / 100
  const hll = inspection.horizontalLowerLeft! / 100, hlr = inspection.horizontalLowerRight! / 100
  const radians = [
    Math.atan(-(vlb - vlt) / 88.9), Math.atan((vrb - vrt) / 88.9),
    Math.atan((hur - hul) / 63.5), Math.atan(-(hlr - hll) / 63.5)
  ]
  const degrees = radians.map(value => value * 180 / Math.PI)
  if (Math.max(...degrees) - Math.min(...degrees) > 1) return { state: 'unavailable' }
  const average = degrees.reduce((sum, value) => sum + value, 0) / degrees.length
  if (Math.abs(average) < 0.05) return { state: 'none' }
  return { state: 'estimated', degrees: Math.abs(average), direction: average > 0 ? 'CW' : 'CCW' }
}

export function missingFinalizationFields(inspection: Inspection): string[] {
  const missing: string[] = []
  for (const [key, label] of Object.entries(measurementFields)) if (!Number.isSafeInteger(inspection[key as MeasurementField]) || inspection[key as MeasurementField]! < 0) missing.push(label)
  for (const [key, label] of Object.entries(gradeFields)) if (!Number.isSafeInteger(inspection[key as keyof typeof gradeFields]) || inspection[key as keyof typeof gradeFields]! < 0 || inspection[key as keyof typeof gradeFields]! > 100) missing.push(label)
  return missing
}
