import { Radio, RadioGroup } from '@fluentui/react-components'

import { formatMapDistance, yardsToMeters, type Shot } from '@/lib/format'

/* eslint-disable react-refresh/only-export-components -- palette/helpers co-located with DispersionView */

type DispersionMode = 'carry' | 'total'

type DispersionViewProps = {
  history: Shot[]
  units: 'imperial' | 'metric'
  mode: DispersionMode
  distanceScale: number | null
  onModeChange: (mode: DispersionMode) => void
}

const clubPalette: Record<string, string> = {
  driver: '#f6bd4f',
  '3 wood': '#60c5d8',
  '5 wood': '#54a9d8',
  hybrid: '#9acb67',
  '3 iron': '#b9a7f4',
  '4 iron': '#a58be6',
  '5 iron': '#d586c4',
  '6 iron': '#eb7596',
  '7 iron': '#f07d62',
  '8 iron': '#f28f55',
  '9 iron': '#f3a34f',
  'pitching wedge': '#f177a8',
  wedge: '#f177a8',
  'sand wedge': '#ee8b56',
  'lob wedge': '#d77ae4',
  putter: '#c8d2d8',
}

const fallbackPalette = ['#f6bd4f', '#60c5d8', '#9acb67', '#b9a7f4', '#eb7596', '#f07d62', '#d77ae4']

function normalizedClub(club: string) {
  return club.trim().toLowerCase() || 'driver'
}

export function clubColorFor(club: string) {
  const normalized = normalizedClub(club)
  const knownColor = clubPalette[normalized]
  if (knownColor) return knownColor

  let hash = 0
  for (const character of normalized) hash = (hash * 31 + character.charCodeAt(0)) | 0
  return fallbackPalette[Math.abs(hash) % fallbackPalette.length]
}

function clubLabel(club: string | undefined) {
  return club?.trim() || 'Driver'
}

function distanceLines(maxDistance: number) {
  const lines = [50, 60, 70, 80, 90, 100]
  for (let distance = 120; distance <= maxDistance; distance += 20) lines.push(distance)
  return lines.filter((distance) => distance <= maxDistance)
}

export function DispersionView({ history, units, mode, distanceScale, onModeChange }: DispersionViewProps) {
  if (history.length === 0) return null

  const distances = history
    .map((shot) => mode === 'carry' ? shot.carry : shot.total)
    .map((distance) => units === 'metric' ? yardsToMeters(distance) : distance)
    .filter((distance) => Number.isFinite(distance) && distance > 0)
  const laterals = history
    .map((shot) => mode === 'carry' ? shot.carryOffline : shot.offline)
    .map((lateral) => units === 'metric' ? yardsToMeters(lateral) : lateral)
    .filter(Number.isFinite)
  const minimumDistanceScale = units === 'metric' ? 100 : 100
  const distanceStep = units === 'metric' ? 50 : 10
  const maxDistance = Math.max(units === 'metric' ? 50 : 60, ...distances)
  const fittedDistanceScale = Math.max(minimumDistanceScale, Math.ceil((maxDistance * 1.1) / distanceStep) * distanceStep)
  const maxLateralRaw = Math.max(5, ...laterals.map((value) => Math.abs(value)))
  const fittedLateralScale = Math.max(20, Math.ceil((maxLateralRaw * 1.2) / 5) * 5)
  const maxY = distanceScale ?? fittedDistanceScale
  const lateralExtent = fittedLateralScale
  const lines = distanceLines(maxY)
  const clubs = Array.from(new Set(history.map((shot) => clubLabel(shot.club))))
  const clubCounts = new Map(clubs.map((club) => [club, history.filter((shot) => clubLabel(shot.club) === club).length]))
  const shotsOutsideView = history.filter((shot) => {
    const rawDistance = mode === 'carry' ? shot.carry : shot.total
    const distance = units === 'metric' ? yardsToMeters(rawDistance) : rawDistance
    return distance > maxY
  }).length

  // Plot coordinates use the active display unit; R10 values remain yards in state.
  const width = 720
  const height = 640
  const padTop = 28
  const padBottom = 56
  const padSide = 54
  const plotWidth = width - padSide * 2
  const plotHeight = height - padTop - padBottom
  const centerX = width / 2
  const bottomY = height - padBottom

  const project = (lateral: number, distance: number) => ({
    x: centerX + (lateral / lateralExtent) * (plotWidth / 2),
    y: bottomY - (distance / maxY) * plotHeight,
  })

  return (
    <div className="flex h-full min-h-0 flex-col gap-2.5">
      <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1">
        <div>
          <p className="text-sm font-semibold tracking-tight">Shot dispersion</p>
          <p className="text-xs tabular-nums text-[var(--colorNeutralForeground3)]">
            {history.length} {history.length === 1 ? 'shot' : 'shots'} · {mode === 'carry' ? 'Carry' : 'Total'} · {units === 'imperial' ? 'yd' : 'm'} scale
          </p>
        </div>
        <RadioGroup
          layout="horizontal"
          value={mode}
          onChange={(_, data) => onModeChange(data.value as DispersionMode)}
          aria-label="Dispersion mode"
        >
          <Radio value="carry" label="Carry" />
          <Radio value="total" label="Total" />
        </RadioGroup>
      </div>

      {shotsOutsideView > 0 && (
        <p className="text-xs text-[var(--colorNeutralForeground3)]">
          {shotsOutsideView} {shotsOutsideView === 1 ? 'shot is' : 'shots are'} outside the selected distance range. Choose Auto to show everything.
        </p>
      )}

      <div className="flex flex-wrap items-center gap-x-3 gap-y-1 rounded-lg border border-[var(--colorNeutralStroke2)] bg-[var(--colorNeutralBackground2)] px-3 py-2">
        <span className="text-[0.68rem] font-semibold uppercase tracking-[0.12em] text-[var(--colorNeutralForeground3)]">Color by club</span>
        {clubs.map((club) => (
          <span key={club} className="inline-flex items-center gap-1.5 text-xs font-medium">
            <span className="size-2.5 rounded-full ring-1 ring-black/20" style={{ background: clubColorFor(club) }} />
            {club}
            <span className="tabular-nums text-[var(--colorNeutralForeground3)]">{clubCounts.get(club)}</span>
          </span>
        ))}
      </div>

      <div className="min-h-0 flex-1 overflow-hidden rounded-xl border border-[#39634b] bg-[#173526] shadow-inner">
        <svg viewBox={`0 0 ${width} ${height}`} className="h-full w-full" role="img" aria-label="Dispersion map">
          <defs>
            <linearGradient id="dispersion-background" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0" stopColor="#214a36" />
              <stop offset="1" stopColor="#102c20" />
            </linearGradient>
            <linearGradient id="dispersion-fairway" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0" stopColor="#2b6043" />
              <stop offset="1" stopColor="#3d7750" />
            </linearGradient>
            <pattern id="dispersion-mow-lines" width="24" height="24" patternUnits="userSpaceOnUse">
              <rect width="24" height="24" fill="transparent" />
              <path d="M 0 0 H 24" stroke="#ffffff" strokeOpacity="0.035" strokeWidth="12" />
            </pattern>
          </defs>

          <rect width={width} height={height} fill="url(#dispersion-background)" />
          <path
            d={`M ${centerX - plotWidth * 0.22} ${bottomY} L ${centerX - plotWidth * 0.13} ${padTop} L ${centerX + plotWidth * 0.13} ${padTop} L ${centerX + plotWidth * 0.22} ${bottomY} Z`}
            fill="url(#dispersion-fairway)"
            opacity="0.92"
          />
          <path
            d={`M ${centerX - plotWidth * 0.22} ${bottomY} L ${centerX - plotWidth * 0.13} ${padTop} L ${centerX + plotWidth * 0.13} ${padTop} L ${centerX + plotWidth * 0.22} ${bottomY} Z`}
            fill="url(#dispersion-mow-lines)"
          />

          {lines.map((distance) => {
            const { y } = project(0, distance)
            return (
              <g key={distance}>
                <line x1={padSide} y1={y} x2={width - padSide} y2={y} stroke="#d9f4df" strokeOpacity="0.28" strokeWidth="1" />
                <text x={padSide - 10} y={y + 4} fontSize="12" fill="#eefbf0" opacity="0.9" textAnchor="end" fontFamily="var(--font-sans)">
                  {formatMapDistance(distance, units)}
                </text>
              </g>
            )
          })}

          <line x1={centerX} y1={padTop} x2={centerX} y2={bottomY} stroke="#f4fff5" strokeOpacity="0.7" strokeWidth="1.5" strokeDasharray="5 7" />
          <path d={`M ${centerX - 16} ${padTop + 18} Q ${centerX} ${padTop + 5} ${centerX + 16} ${padTop + 18}`} fill="none" stroke="#f4fff5" strokeOpacity="0.8" strokeWidth="1.5" />

          <line x1={padSide} y1={bottomY} x2={width - padSide} y2={bottomY} stroke="#f4fff5" strokeOpacity="0.5" strokeWidth="1" />
          {[-lateralExtent, 0, lateralExtent].map((lateral) => {
            const x = project(lateral, 0).x
            const label = lateral === 0 ? '0' : `${Math.abs(lateral).toFixed(0)} ${lateral < 0 ? 'L' : 'R'}`
            return (
              <g key={lateral}>
                <line x1={x} y1={bottomY} x2={x} y2={bottomY + 6} stroke="#f4fff5" strokeOpacity="0.7" />
                <text x={x} y={bottomY + 24} fontSize="11" fill="#eefbf0" opacity="0.85" textAnchor="middle" fontFamily="var(--font-sans)">
                  {lateral === 0 ? label : `${label} ${units === 'imperial' ? 'yd' : 'm'}`}
                </text>
              </g>
            )
          })}
          <text x={centerX} y={height - 10} fontSize="11" fill="#eefbf0" opacity="0.75" textAnchor="middle" fontFamily="var(--font-sans)">
            left / right of target line
          </text>

          {history.map((shot, index) => {
            const rawDistance = mode === 'carry' ? shot.carry : shot.total
            const rawLateral = mode === 'carry' ? shot.carryOffline : shot.offline
            const distance = units === 'metric' ? yardsToMeters(rawDistance) : rawDistance
            const lateral = units === 'metric' ? yardsToMeters(rawLateral) : rawLateral
            if (!Number.isFinite(distance) || distance <= 0) return null
            const { x, y } = project(lateral, distance)
            const club = clubLabel(shot.club)
            const color = clubColorFor(club)
            const isLatest = index === 0
            return (
              <g key={shot.id}>
                <title>{`Shot ${shot.id}, ${club}, ${formatMapDistance(distance, units)}, ${formatMapDistance(Math.abs(lateral), units)} ${lateral < 0 ? 'left' : 'right'}`}</title>
                {isLatest && <circle cx={x} cy={y} r={10} fill="none" stroke={color} strokeOpacity="0.4" strokeWidth="2" />}
                <circle cx={x} cy={y} r={isLatest ? 7 : 6} fill={color} stroke="#102c20" strokeWidth="2" />
                <circle cx={x} cy={y} r="1.8" fill="#102c20" />
              </g>
            )
          })}
          <circle cx={centerX} cy={bottomY} r="4" fill="#f4fff5" stroke="#173526" strokeWidth="2" />
        </svg>
      </div>
    </div>
  )
}
