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
  launchDirection: number
  spinAxis: number
  backspin: number
  sidespin: number
  apex: number
  timeOfFlight: number
  offline: number
  carryOffline: number
  carryDeviationDeg: number
  totalDeviationDeg: number
}

export type R10Shot = {
  shot_id: number
  ball?: { ball_speed: number; launch_angle: number; total_spin: number; launch_direction: number; backspin: number; sidespin: number; spin_axis: number } | null
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
  carry_offline_yards: number
  carry_deviation_deg: number
  total_deviation_deg: number
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

export function withMetrics(shot: Shot, metrics?: Partial<R10ShotMetrics> | null): Shot {
  if (!metrics) return shot
  return {
    ...shot,
    ...(metrics.carry_yards != null && { carry: metrics.carry_yards }),
    ...(metrics.total_yards != null && { total: metrics.total_yards }),
    ...(metrics.apex_yards != null && { apex: metrics.apex_yards }),
    ...(metrics.offline_yards != null && { offline: metrics.offline_yards }),
    ...(metrics.time_of_flight != null && { timeOfFlight: metrics.time_of_flight }),
    ...(metrics.carry_offline_yards != null && { carryOffline: metrics.carry_offline_yards }),
    ...(metrics.carry_deviation_deg != null && { carryDeviationDeg: metrics.carry_deviation_deg }),
    ...(metrics.total_deviation_deg != null && { totalDeviationDeg: metrics.total_deviation_deg }),
  }
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

export type StatMetricKey =
  | 'carry'
  | 'total'
  | 'offline'
  | 'totalDeviationDeg'
  | 'carryOffline'
  | 'carryDeviationDeg'
  | 'clubSpeed'
  | 'ballSpeed'
  | 'smashFactor'
  | 'launch'
  | 'launchDirection'
  | 'path'
  | 'face'
  | 'faceToPath'
  | 'attack'
  | 'spin'
  | 'backspin'
  | 'sidespin'
  | 'spinAxis'
  | 'apex'
  | 'tempo'
  | 'timeOfFlight'

export type StatMetric = {
  key: StatMetricKey
  label: string
  value: (shot: Shot) => number
  format: (value: number, units: 'imperial' | 'metric') => string
}

export const smashFactorOf = (shot: Shot) => (shot.clubSpeed > 0 ? shot.ballSpeed / shot.clubSpeed : 0)
export const faceToPathOf = (shot: Shot) => shot.face - shot.path

function formatSpeed(mph: number, units: 'imperial' | 'metric') {
  const value = units === 'imperial' ? mph : mph * 1.60934
  const unit = units === 'imperial' ? 'mph' : 'km/h'
  return `${value.toFixed(1)} ${unit}`
}

function formatPlainDegrees(value: number) {
  return `${value.toFixed(1)}°`
}

function formatSignedDegrees(value: number) {
  return `${value > 0 ? '+' : ''}${value.toFixed(1)}°`
}

function formatRounds(value: number) {
  return `${value.toFixed(0)} RPM`
}

function formatSeconds(value: number) {
  return `${value.toFixed(1)} s`
}

function formatSmash(value: number) {
  return value.toFixed(2)
}

const distance = (key: keyof Shot): StatMetric['value'] => (shot) => shot[key]
const degrees = (key: keyof Shot): StatMetric['value'] => (shot) => shot[key]
const speed = (key: keyof Shot): StatMetric['value'] => (shot) => shot[key]

export const statMetrics: StatMetric[] = [
  { key: 'carry', label: 'Carry Distance', value: distance('carry'), format: (v, u) => formatDistance(v, u) },
  { key: 'total', label: 'Total Distance', value: distance('total'), format: (v, u) => formatDistance(v, u) },
  { key: 'offline', label: 'Total Deviation', value: distance('offline'), format: (v, u) => formatDistance(v, u) },
  { key: 'totalDeviationDeg', label: 'Total Deviation Angle', value: degrees('totalDeviationDeg'), format: (v) => formatSignedDegrees(v) },
  { key: 'carryOffline', label: 'Carry Deviation', value: distance('carryOffline'), format: (v, u) => formatDistance(v, u) },
  { key: 'carryDeviationDeg', label: 'Carry Deviation Angle', value: degrees('carryDeviationDeg'), format: (v) => formatSignedDegrees(v) },
  { key: 'clubSpeed', label: 'Club Speed', value: speed('clubSpeed'), format: (v, u) => formatSpeed(v, u) },
  { key: 'ballSpeed', label: 'Ball Speed', value: speed('ballSpeed'), format: (v, u) => formatSpeed(v, u) },
  { key: 'smashFactor', label: 'Smash Factor', value: smashFactorOf, format: (v) => formatSmash(v) },
  { key: 'launch', label: 'Launch Angle', value: degrees('launch'), format: (v) => formatPlainDegrees(v) },
  { key: 'launchDirection', label: 'Launch Direction', value: degrees('launchDirection'), format: (v) => formatSignedDegrees(v) },
  { key: 'path', label: 'Club Path', value: degrees('path'), format: (v) => formatSignedDegrees(v) },
  { key: 'face', label: 'Club Face', value: degrees('face'), format: (v) => formatSignedDegrees(v) },
  { key: 'faceToPath', label: 'Face to Path', value: faceToPathOf, format: (v) => formatSignedDegrees(v) },
  { key: 'attack', label: 'Attack Angle', value: degrees('attack'), format: (v) => formatSignedDegrees(v) },
  { key: 'spin', label: 'Spin Rate', value: speed('spin'), format: (v) => formatRounds(v) },
  { key: 'backspin', label: 'Backspin', value: speed('backspin'), format: (v) => formatRounds(v) },
  { key: 'sidespin', label: 'Sidespin', value: speed('sidespin'), format: (v) => formatRounds(v) },
  { key: 'spinAxis', label: 'Spin Axis', value: degrees('spinAxis'), format: (v) => formatSignedDegrees(v) },
  { key: 'apex', label: 'Apex Height', value: distance('apex'), format: (v, u) => formatDistance(v, u) },
  { key: 'tempo', label: 'Tempo', value: speed('tempo'), format: (v) => (v > 0 ? formatTempo(v) : '—') },
  { key: 'timeOfFlight', label: 'Time of Flight', value: speed('timeOfFlight'), format: (v) => formatSeconds(v) },
]

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