import { describe, expect, it } from 'vitest'
import { calculateTempo, connectionTitle, displayDeviceName, errorMessage, faceToPathOf, formatDistance, formatMetric, formatTeeDistance, formatTempo, smashFactorOf, statMetrics, withMetrics, yardsToMeters, type Shot } from './format'

const shot: Shot = {
  id: 1,
  clubSpeed: 98.4,
  path: 1.2,
  face: 0.4,
  attack: -3.1,
  tempo: 3,
  launch: 16.5,
  ballSpeed: 144.8,
  spin: 2420,
  carry: 168.5,
  total: 174.2,
  launchDirection: 0.8,
  spinAxis: 2.1,
  backspin: 2410,
  sidespin: 90,
  apex: 24.5,
  timeOfFlight: 5.9,
  offline: 3.2,
  carryOffline: 2.5,
  carryDeviationDeg: 0.9,
  totalDeviationDeg: 1.1,
}

describe('formatMetric', () => {
  it('keeps imperial speeds and labels them in miles per hour', () => {
    expect(formatMetric('clubSpeed', shot, 'imperial')).toBe('98.4 miles per hour')
  })

  it('converts speeds to kilometers per hour in metric', () => {
    expect(formatMetric('clubSpeed', shot, 'metric')).toBe('158.4 kilometers per hour')
  })

  it('formats degrees for angles', () => {
    expect(formatMetric('path', shot, 'imperial')).toBe('1.2 degrees')
    expect(formatMetric('attack', shot, 'imperial')).toBe('-3.1 degrees')
  })

  it('formats spin as RPM', () => {
    expect(formatMetric('spin', shot, 'imperial')).toBe('2420 RPM')
  })

  it('formats tempo as a ratio', () => {
    expect(formatMetric('tempo', shot, 'imperial')).toBe('3:1')
  })

  it('reports tempo as unavailable when there is no tempo', () => {
    expect(formatMetric('tempo', { ...shot, tempo: 0 }, 'imperial')).toBe('unavailable')
  })
})

describe('formatTempo', () => {
  it('formats integer ratios without decimals', () => {
    expect(formatTempo(3)).toBe('3:1')
    expect(formatTempo(3.5)).toBe('3.5:1')
  })
})

describe('calculateTempo', () => {
  it('computes backswing over downswing', () => {
    expect(calculateTempo({ backswing_start: 100, downswing_start: 800, impact: 1100 })).toBe(700 / 300)
  })

  it('returns zero when there is no swing', () => {
    expect(calculateTempo(null)).toBe(0)
  })

  it('returns zero for invalid timestamps', () => {
    expect(calculateTempo({ backswing_start: 100, downswing_start: 900, impact: 500 })).toBe(0)
  })
})

describe('errorMessage', () => {
  it('extracts messages from errors', () => {
    expect(errorMessage(new Error('boom'), 'fallback')).toBe('boom')
  })

  it('passes strings through', () => {
    expect(errorMessage('boom', 'fallback')).toBe('boom')
  })

  it('falls back for anything else', () => {
    expect(errorMessage(null, 'fallback')).toBe('fallback')
  })
})

describe('connectionTitle', () => {
  it('maps every phase to a title', () => {
    expect(connectionTitle('idle')).toBe('Connect your R10')
    expect(connectionTitle('scanning')).toBe('Finding your R10')
    expect(connectionTitle('selecting')).toBe('Choose your R10')
    expect(connectionTitle('connecting')).toBe('Connecting to your R10')
    expect(connectionTitle('ready')).toBe('R10 is ready')
    expect(connectionTitle('error')).toBe('Connection needs attention')
  })
})

describe('displayDeviceName', () => {
  it('normalizes Approach names', () => {
    expect(displayDeviceName({ name: 'Approach R10' })).toBe('Approach R10')
    expect(displayDeviceName({ name: 'approach_r10_1234' })).toBe('Approach R10')
  })

  it('falls back for other names', () => {
    expect(displayDeviceName({ name: 'R10' })).toBe('R10')
    expect(displayDeviceName({ name: '' })).toBe('Approach R10')
  })
})

describe('yardsToMeters', () => {
  it('converts the default tee distance to Garmin meters', () => {
    expect(yardsToMeters(2.3)).toBeCloseTo(2.1, 1)
  })

  it('maps the range endpoints to 1.8–2.4 m', () => {
    expect(yardsToMeters(2.0)).toBeCloseTo(1.8, 1)
    expect(yardsToMeters(2.6)).toBeCloseTo(2.4, 1)
  })
})

describe('formatDistance', () => {
  it('labels imperial values in yards', () => {
    expect(formatDistance(168.5, 'imperial')).toBe('168.5 yd')
  })

  it('converts and labels metric values in meters', () => {
    expect(formatDistance(168.5, 'metric')).toBe('154.1 m')
  })

  it('shows an em dash when the distance is unavailable', () => {
    expect(formatDistance(0, 'imperial')).toBe('—')
    expect(formatDistance(0, 'metric')).toBe('—')
  })
})

describe('formatTeeDistance', () => {
  it('labels imperial values in yards', () => {
    expect(formatTeeDistance(2.3, 'imperial')).toBe('2.3 yd')
  })

  it('converts and labels metric values in meters', () => {
    expect(formatTeeDistance(2.3, 'metric')).toBe('2.1 m')
  })
})

describe('derived metrics', () => {
  it('computes smash factor from ball and club speed', () => {
    expect(smashFactorOf(shot)).toBeCloseTo(144.8 / 98.4, 4)
  })

  it('returns zero smash factor without club speed', () => {
    expect(smashFactorOf({ ...shot, clubSpeed: 0 })).toBe(0)
  })

  it('computes face to path as face minus path', () => {
    expect(faceToPathOf(shot)).toBeCloseTo(-0.8, 4)
  })
})

describe('statMetrics registry', () => {
  it('exposes every pinnable metric key uniquely', () => {
    const keys = statMetrics.map((metric) => metric.key)
    expect(new Set(keys).size).toBe(keys.length)
    expect(keys.length).toBe(22)
  })

  it('formats carry as a distance in both units', () => {
    const carry = statMetrics.find((metric) => metric.key === 'carry')!
    expect(carry.label).toBe('Carry Distance')
    expect(carry.format(168.5, 'imperial')).toBe('168.5 yd')
    expect(carry.format(168.5, 'metric')).toBe('154.1 m')
  })

  it('formats signed angle metrics with explicit sign', () => {
    const deviation = statMetrics.find((metric) => metric.key === 'carryDeviationDeg')!
    expect(deviation.format(0.9, 'imperial')).toBe('+0.9°')
    expect(deviation.format(-1.2, 'imperial')).toBe('-1.2°')
  })

  it('formats spin metrics as whole RPM', () => {
    const backspin = statMetrics.find((metric) => metric.key === 'backspin')!
    expect(backspin.format(2410, 'imperial')).toBe('2410 RPM')
  })

  it('formats tempo and marks missing tempo as an em dash', () => {
    const tempo = statMetrics.find((metric) => metric.key === 'tempo')!
    expect(tempo.format(3, 'imperial')).toBe('3:1')
    expect(tempo.format(0, 'imperial')).toBe('—')
  })

  it('reads derived values from the shot', () => {
    const smash = statMetrics.find((metric) => metric.key === 'smashFactor')!
    const faceToPath = statMetrics.find((metric) => metric.key === 'faceToPath')!
    expect(smash.value(shot)).toBeCloseTo(144.8 / 98.4, 4)
    expect(faceToPath.value(shot)).toBeCloseTo(-0.8, 4)
  })
})

describe('withMetrics', () => {
  it('merges metric values into a shot', () => {
    const result = withMetrics(shot, {
      carry_yards: 170,
      total_yards: 176,
      apex_yards: 26,
      offline_yards: 4,
      time_of_flight: 6.1,
      carry_offline_yards: 3,
      carry_deviation_deg: 1.1,
      total_deviation_deg: 1.3,
    })
    expect(result.carry).toBe(170)
    expect(result.apex).toBe(26)
    expect(result.offline).toBe(4)
    expect(result.totalDeviationDeg).toBe(1.3)
  })

  it('leaves the shot untouched when metrics are missing', () => {
    expect(withMetrics(shot, undefined)).toBe(shot)
  })
})