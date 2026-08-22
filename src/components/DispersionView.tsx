import { Radio, RadioGroup } from '@fluentui/react-components'

import { formatDistance, type Shot } from '@/lib/format'

/* eslint-disable react-refresh/only-export-components -- buckets/helpers co-located with DispersionView */

type DispersionMode = 'carry' | 'total'

type DispersionViewProps = {
  history: Shot[]
  units: 'imperial' | 'metric'
  mode: DispersionMode
  onModeChange: (mode: DispersionMode) => void
}

type Bucket = { label: string; color: string; max: number }

const buckets: Bucket[] = [
  { label: '60 yds', color: '#FFFFFF', max: 65 },
  { label: '70 yds', color: '#FFF100', max: 75 },
  { label: '80 yds', color: '#00B7C3', max: 85 },
  { label: '90 yds', color: '#00B294', max: 95 },
  { label: '100 yds', color: '#FF8C00', max: 110 },
  { label: '120 yds', color: '#7FBA00', max: 130 },
  { label: '140 yds', color: '#E3008C', max: 150 },
  { label: '160 yds', color: '#E81123', max: 170 },
  { label: '180 yds', color: '#5C2D91', max: 190 },
  { label: 'Drive', color: '#FFB900', max: Infinity },
]

export function bucketFor(carryYards: number): Bucket {
  return buckets.find((b) => carryYards < b.max) ?? buckets[buckets.length - 1]
}

// Yardage lines to draw (match bucket mids)
const yardageLines = [60, 70, 80, 90, 100, 120, 140, 160, 180]

export function DispersionView({ history, units, mode, onModeChange }: DispersionViewProps) {
  if (history.length === 0) return null

  const distances = history.map((s) => (mode === 'carry' ? s.carry : s.total))
  const laterals = history.map((s) => (mode === 'carry' ? s.carryOffline : s.offline))
  const maxDistance = Math.max(60, ...distances)
  const maxY = Math.ceil((maxDistance * 1.1) / 10) * 10
  const maxLateralRaw = Math.max(5, ...laterals.map((v) => Math.abs(v)))
  const maxLateral = Math.ceil(maxLateralRaw * 1.2 / 5) * 5
  // Ensure at least 10 yd lateral for visibility when all shots are straight
  const lateralExtent = Math.max(10, maxLateral)

  // SVG layout
  const width = 400
  const height = 560
  const padTop = 20
  const padBottom = 30
  const padSide = 30
  const plotWidth = width - padSide * 2
  const plotHeight = height - padTop - padBottom
  const centerX = width / 2
  const bottomY = height - padBottom

  const project = (lateralYd: number, distanceYd: number) => {
    const x = centerX + (lateralYd / lateralExtent) * (plotWidth / 2)
    const y = bottomY - (distanceYd / maxY) * plotHeight
    return { x, y }
  }

  return (
    <div className="flex h-full min-h-0 flex-col gap-2">
      <div className="flex items-center justify-between gap-2">
        <p className="text-xs font-semibold tabular-nums text-[var(--colorNeutralForeground3)]">
          {history.length} shots · {mode === 'carry' ? 'Carry' : 'Total'} yds
        </p>
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

      <div className="flex min-h-0 flex-1 gap-2">
        {/* Legend */}
        <div className="hidden w-[88px] shrink-0 flex-col gap-1 border-r border-[var(--colorNeutralStroke2)] pr-2 sm:flex">
          {buckets.map((b) => (
            <div key={b.label} className="flex items-center gap-2">
              <span className="size-3 shrink-0 rounded-sm border border-white/20" style={{ background: b.color }} />
              <span className="truncate text-[0.68rem] tabular-nums text-[var(--colorNeutralForeground3)]">
                {b.label === 'Drive' ? 'Drive' : formatDistance(parseInt(b.label), units)}
              </span>
            </div>
          ))}
          <div className="mt-2 text-[0.62rem] leading-none text-[var(--colorNeutralForeground3)]">Carry yds</div>
        </div>

        <div className="min-w-0 flex-1 overflow-hidden rounded-lg border border-[var(--colorNeutralStroke2)] bg-[#2a4d2a]">
          <svg viewBox={`0 0 ${width} ${height}`} className="h-full w-full" role="img" aria-label="Dispersion map">
            <defs>
              <pattern id="fairway-stripes" width="20" height="20" patternUnits="userSpaceOnUse" patternTransform="rotate(90)">
                <rect width="20" height="20" fill="#2f5e2f" />
                <rect width="10" height="20" fill="#365e2f" />
              </pattern>
            </defs>
            <rect width={width} height={height} fill="url(#fairway-stripes)" />
            {/* Target line */}
            <line x1={centerX} y1={bottomY} x2={centerX} y2={padTop} stroke="white" strokeWidth={1.2} strokeOpacity={0.9} />
            {/* Yardage lines */}
            {yardageLines.map((yd) => {
              if (yd > maxY) return null
              const { y } = project(0, yd)
              return (
                <g key={yd}>
                  <line x1={padSide} y1={y} x2={width - padSide} y2={y} stroke="white" strokeWidth={0.7} strokeOpacity={0.55} />
                  {/* Slight arc as in image: use path with gentle curve */}
                  <path
                    d={`M ${padSide} ${y} Q ${centerX} ${y - 6} ${width - padSide} ${y}`}
                    fill="none"
                    stroke="white"
                    strokeWidth={1}
                    strokeOpacity={0.9}
                  />
                  <text x={width - padSide + 4} y={y + 3} fontSize={9} fill="white" opacity={0.9} textAnchor="start" fontFamily="var(--font-sans)">
                    {formatDistance(yd, units)}
                  </text>
                </g>
              )
            })}
            {/* Center tick at origin */}
            <circle cx={centerX} cy={bottomY} r={2} fill="white" opacity={0.9} />
            {/* Shots */}
            {history.map((shot) => {
              const distance = mode === 'carry' ? shot.carry : shot.total
              const lateral = mode === 'carry' ? shot.carryOffline : shot.offline
              if (!distance) return null
              const { x, y } = project(lateral, distance)
              const bucket = bucketFor(distance)
              return (
                <g key={shot.id}>
                  <circle cx={x} cy={y} r={5.5} fill={bucket.color} stroke="white" strokeWidth={0.8} opacity={0.95} />
                  <circle cx={x} cy={y} r={1.4} fill="black" opacity={0.85} />
                </g>
              )
            })}
          </svg>
        </div>
      </div>

      {/* Mobile legend */}
      <div className="flex flex-wrap gap-2 sm:hidden">
        {buckets.map((b) => (
          <span key={b.label} className="inline-flex items-center gap-1 rounded-full border border-[var(--colorNeutralStroke2)] px-2 py-0.5 text-[0.62rem] tabular-nums">
            <span className="size-2 rounded-full" style={{ background: b.color }} />
            {b.label === 'Drive' ? 'Drive' : formatDistance(parseInt(b.label), units)}
          </span>
        ))}
      </div>
    </div>
  )
}
