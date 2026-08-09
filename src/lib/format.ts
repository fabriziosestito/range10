import type { BleDevice } from '@mnlphlp/plugin-blec'

export type MetricKey = 'clubSpeed' | 'path' | 'face' | 'attack' | 'tempo' | 'launch' | 'ballSpeed' | 'spin'

export type Shot = {
  id: number
  clubSpeed: number
  path: number
  face: number
  attack: number
  tempo: number
  launch: number
  ballSpeed: number
  spin: number
  carry: number
  total: number
}

export type R10Shot = {
  shot_id: number
  ball?: { ball_speed: number; launch_angle: number; total_spin: number; launch_direction: number; backspin: number; sidespin: number } | null
  club?: { club_head_speed: number; path_angle: number; face_angle: number; attack_angle: number } | null
  swing?: { backswing_start: number; downswing_start: number; impact: number } | null
}

export type R10ShotMetrics = {
  shot_id: number
  carry_yards: number
  total_yards: number
  apex_yards: number
  offline_yards: number
  time_of_flight: number
}

export type ConnectionPhase = 'idle' | 'scanning' | 'selecting' | 'connecting' | 'ready' | 'error'

export function formatMetric(key: MetricKey, shot: Shot, units: 'imperial' | 'metric') {
  if (key === 'tempo') return shot.tempo ? formatTempo(shot.tempo) : 'unavailable'
  if (key === 'clubSpeed' || key === 'ballSpeed') return `${(units === 'imperial' ? shot[key] : shot[key] * 1.60934).toFixed(1)} ${units === 'imperial' ? 'miles per hour' : 'kilometers per hour'}`
  if (key === 'spin') return `${shot.spin} RPM`
  return `${shot[key].toFixed(1)} degrees`
}

export function formatTempo(ratio: number) {
  const rounded = Math.round(ratio * 10) / 10
  return `${Number.isInteger(rounded) ? rounded.toFixed(0) : rounded.toFixed(1)}:1`
}

export const YARDS_TO_METERS = 0.9144

export function yardsToMeters(yards: number) {
  return yards * YARDS_TO_METERS
}

export function formatDistance(yards: number, units: 'imperial' | 'metric') {
  if (!yards) return '—'
  const value = units === 'imperial' ? yards : yardsToMeters(yards)
  const unit = units === 'imperial' ? 'yd' : 'm'
  return `${value.toFixed(1)} ${unit}`
}

export function formatTeeDistance(yards: number, units: 'imperial' | 'metric') {
  return formatDistance(yards, units)
}

export function calculateTempo(swing: R10Shot['swing']) {
  if (!swing) return 0
  const backswing = swing.downswing_start - swing.backswing_start
  const downswing = swing.impact - swing.downswing_start
  return backswing > 0 && downswing > 0 ? backswing / downswing : 0
}

export function errorMessage(error: unknown, fallback: string) {
  if (error instanceof Error) return error.message
  if (typeof error === 'string') return error
  return fallback
}

export function connectionTitle(phase: ConnectionPhase) {
  if (phase === 'scanning') return 'Finding your R10'
  if (phase === 'selecting') return 'Choose your R10'
  if (phase === 'ready') return 'R10 is ready'
  if (phase === 'error') return 'Connection needs attention'
  if (phase === 'idle') return 'Connect your R10'
  if (phase === 'connecting') return 'Connecting to your R10'
  return 'Connect your R10'
}

export function displayDeviceName(device: Pick<BleDevice, 'name'>) {
  const name = device.name || ''
  return name.toLowerCase().includes('approach') ? 'Approach R10' : name || 'Approach R10'
}