import type { Session, Shot } from './format'
import { yardsToMeters } from './format'

const CSV_HEADERS = [
  'Shot',
  'Club',
  'Type',
  'ClubSpeed',
  'Path',
  'Face',
  'Attack',
  'Tempo',
  'BackswingTime',
  'DownswingTime',
  'Launch',
  'BallSpeed',
  'Spin',
  'Carry',
  'Total',
  'LaunchDirection',
  'SpinAxis',
  'Backspin',
  'Sidespin',
  'Apex',
  'TimeOfFlight',
  'Offline',
  'CarryOffline',
  'CarryDeviationDeg',
  'TotalDeviationDeg',
]

function escapeCsv(value: string): string {
  if (value.includes(',') || value.includes('"') || value.includes('\n')) {
    return `"${value.replace(/"/g, '""')}"`
  }
  return value
}

function shotToRow(index: number, shot: Shot, units: 'imperial' | 'metric'): string {
  const d = (v: number) => (units === 'metric' ? yardsToMeters(v) : v)
  const s = (v: number) => (units === 'metric' ? v * 1.60934 : v)
  return [
    index + 1,
    escapeCsv(shot.club),
    shot.airSwing ? 'Air' : 'Ball',
    s(shot.clubSpeed).toFixed(1),
    shot.path.toFixed(1),
    shot.face.toFixed(1),
    shot.attack.toFixed(1),
    shot.tempo ? shot.tempo.toFixed(1) : '',
    shot.backswingTime.toFixed(2),
    shot.downswingTime.toFixed(2),
    shot.launch.toFixed(1),
    s(shot.ballSpeed).toFixed(1),
    shot.spin.toFixed(0),
    d(shot.carry).toFixed(1),
    d(shot.total).toFixed(1),
    shot.launchDirection.toFixed(1),
    shot.spinAxis.toFixed(1),
    shot.backspin.toFixed(0),
    shot.sidespin.toFixed(0),
    d(shot.apex).toFixed(1),
    shot.timeOfFlight.toFixed(1),
    d(shot.offline).toFixed(1),
    d(shot.carryOffline).toFixed(1),
    shot.carryDeviationDeg.toFixed(1),
    shot.totalDeviationDeg.toFixed(1),
  ].join(',')
}

export function sessionToCsv(session: Session, units: 'imperial' | 'metric'): string {
  const rows = [CSV_HEADERS.join(',')]
  session.shots.forEach((shot, i) => rows.push(shotToRow(i, shot, units)))
  return rows.join('\n')
}
