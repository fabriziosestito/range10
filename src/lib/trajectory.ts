import { yardsToMeters, type Shot } from './format'

export type TrajectoryPoint = {
  x: number
  y: number
  z: number
}

export type ShotTrajectory = {
  points: TrajectoryPoint[]
  carryIndex: number
  carryDistance: number
  totalDistance: number
}

function positiveMeters(yards: number) {
  return yardsToMeters(Math.max(0, yards))
}

/**
 * Builds a display trajectory from measured R10 endpoints. FUSE uses meters,
 * so conversion happens here while the Shot model remains in source yards.
 */
export function trajectoryForShot(shot: Shot, flightSamples = 40, rollSamples = 12): ShotTrajectory {
  const carryDistance = positiveMeters(shot.carry)
  const totalDistance = Math.max(carryDistance, positiveMeters(shot.total))
  const carryLateral = yardsToMeters(shot.carryOffline)
  const totalLateral = yardsToMeters(shot.offline)
  const apex = positiveMeters(shot.apex)
  const points: TrajectoryPoint[] = []

  for (let index = 0; index <= flightSamples; index++) {
    const progress = index / flightSamples
    points.push({
      x: carryLateral * progress,
      y: 4 * apex * progress * (1 - progress),
      z: carryDistance * progress,
    })
  }

  const carryIndex = points.length - 1
  const rollDistance = totalDistance - carryDistance
  for (let index = 1; index <= rollSamples; index++) {
    const progress = index / rollSamples
    points.push({
      x: carryLateral + (totalLateral - carryLateral) * progress,
      y: 0,
      z: carryDistance + rollDistance * progress,
    })
  }

  return { points, carryIndex, carryDistance, totalDistance }
}
