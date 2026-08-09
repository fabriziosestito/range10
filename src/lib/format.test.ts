import { describe, expect, it } from 'vitest'
import { calculateTempo, connectionTitle, displayDeviceName, errorMessage, formatDistance, formatMetric, formatTeeDistance, formatTempo, yardsToMeters, type Shot } from './format'

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