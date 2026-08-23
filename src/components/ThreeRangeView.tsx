import { Select } from '@fluentui/react-components'
import { useEffect, useRef, useState } from 'react'
import * as THREE from 'three'
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js'
import { FuseRenderer } from '@opengolfsim/fuse'

import { clubColorFor } from '@/components/DispersionView'
import { yardsToMeters, type Shot } from '@/lib/format'
import { trajectoryForShot, type ShotTrajectory, type TrajectoryPoint } from '@/lib/trajectory'

type TracerMode = 'off' | 'selected' | 'all'

type ThreeRangeViewProps = {
  history: Shot[]
  units: 'imperial' | 'metric'
  distanceScale: number | null
}

type ShotObjects = {
  shot: Shot
  trajectory: ShotTrajectory
  line: THREE.Line
  endpoint: THREE.Mesh
}

const sceneWidth = 90

function pointVector(point: TrajectoryPoint) {
  return new THREE.Vector3(point.x, point.y, point.z)
}

function createRangeLine(points: THREE.Vector3[], color: string, opacity: number, width = 1) {
  const geometry = new THREE.BufferGeometry().setFromPoints(points)
  const material = new THREE.LineBasicMaterial({ color, transparent: true, opacity, linewidth: width })
  return new THREE.Line(geometry, material)
}

function addDistanceMarks(scene: THREE.Scene, maxDepth: number) {
  const marks: THREE.Line[] = []
  for (let distance = 50; distance <= maxDepth; distance += 50) {
    const line = createRangeLine([
      new THREE.Vector3(-sceneWidth / 2, 0.025, distance),
      new THREE.Vector3(sceneWidth / 2, 0.025, distance),
    ], '#d7f2d9', 0.18)
    scene.add(line)
    marks.push(line)
  }
  return marks
}

function addRangeSurface(scene: THREE.Scene, maxDepth: number) {
  const ground = new THREE.Mesh(
    new THREE.PlaneGeometry(sceneWidth, maxDepth + 40).rotateX(-Math.PI / 2),
    new THREE.MeshStandardMaterial({ color: '#183b29', roughness: 1 }),
  )
  ground.position.z = (maxDepth + 40) / 2
  ground.receiveShadow = true
  scene.add(ground)

  const fairway = new THREE.Mesh(
    new THREE.PlaneGeometry(40, maxDepth + 40).rotateX(-Math.PI / 2),
    new THREE.MeshStandardMaterial({ color: '#356b43', roughness: 1 }),
  )
  fairway.position.y = 0.01
  fairway.position.z = (maxDepth + 40) / 2
  fairway.receiveShadow = true
  scene.add(fairway)

  const targetLine = createRangeLine([
    new THREE.Vector3(0, 0.03, 0),
    new THREE.Vector3(0, 0.03, maxDepth),
  ], '#effff0', 0.45)
  scene.add(targetLine)

  return [ground, fairway, targetLine]
}

export function ThreeRangeView({ history, units, distanceScale }: ThreeRangeViewProps) {
  const containerRef = useRef<HTMLDivElement>(null)
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const [tracerMode, setTracerMode] = useState<TracerMode>('selected')
  const [selectedShotId, setSelectedShotId] = useState(history[0]?.id ?? 0)
  const [error, setError] = useState('')

  useEffect(() => {
    if (!history.some((shot) => shot.id === selectedShotId)) setSelectedShotId(history[0]?.id ?? 0)
  }, [history, selectedShotId])

  useEffect(() => {
    const container = containerRef.current
    const canvas = canvasRef.current
    if (!container || !canvas) return

    let renderer: FuseRenderer | undefined
    let animationFrame = 0
    let active = true
    let controls: OrbitControls | undefined
    const shotObjects: ShotObjects[] = []
    let selectedBall: THREE.Mesh | undefined
    const sceneObjects: THREE.Object3D[] = []

    try {
      const webgl = canvas.getContext('webgl2') || canvas.getContext('webgl')
      if (!webgl) throw new Error('WebGL is not available')

      const trajectories = history.map((shot) => ({ shot, trajectory: trajectoryForShot(shot) }))
      const autoDepth = Math.max(120, Math.ceil(Math.max(...trajectories.map(({ trajectory }) => trajectory.totalDistance), 100) * 1.15 / 25) * 25)
      const maxDepth = distanceScale === null
        ? autoDepth
        : units === 'imperial' ? yardsToMeters(distanceScale) : distanceScale
      const scene = new THREE.Scene()
      scene.background = new THREE.Color('#91b7bf')
      scene.fog = new THREE.Fog('#91b7bf', maxDepth * 0.55, maxDepth * 1.8)
      const camera = new THREE.PerspectiveCamera(42, 1, 0.1, Math.max(1000, maxDepth * 2))
      camera.position.set(18, 11, -22)
      camera.lookAt(0, 2, maxDepth * 0.45)

      renderer = new FuseRenderer({ canvas, container, renderMode: 'webgl', adaptive: true, antialias: true })
      renderer.renderer.setClearColor('#91b7bf')

      const ambient = new THREE.HemisphereLight('#e8fbff', '#173423', 1.8)
      const sun = new THREE.DirectionalLight('#fff4d6', 2.2)
      sun.position.set(-40, 80, -30)
      sun.castShadow = true
      scene.add(ambient, sun)
      sceneObjects.push(ambient, sun)
      sceneObjects.push(...addRangeSurface(scene, maxDepth))
      sceneObjects.push(...addDistanceMarks(scene, maxDepth))

      const endpointGeometry = new THREE.SphereGeometry(0.42, 12, 8)
      for (const { shot, trajectory } of trajectories) {
        const points = trajectory.points.map(pointVector)
        const color = clubColorFor(shot.club || 'Driver')
        const isSelected = shot.id === selectedShotId
        const line = createRangeLine(points, color, tracerMode === 'all' || (tracerMode === 'selected' && isSelected) ? (isSelected ? 0.95 : 0.35) : 0)
        const endpoint = new THREE.Mesh(endpointGeometry, new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.95 }))
        endpoint.position.copy(points[points.length - 1])
        endpoint.userData.shotId = shot.id
        endpoint.visible = tracerMode !== 'off'
        scene.add(line, endpoint)
        sceneObjects.push(line, endpoint)
        shotObjects.push({ shot, trajectory, line, endpoint })
      }

      selectedBall = new THREE.Mesh(
        new THREE.SphereGeometry(0.28, 12, 8),
        new THREE.MeshBasicMaterial({ color: '#ffffff' }),
      )
      selectedBall.visible = tracerMode !== 'off'
      scene.add(selectedBall)
      sceneObjects.push(selectedBall)

      controls = new OrbitControls(camera, canvas)
      controls.enableDamping = true
      controls.target.set(0, 1.5, maxDepth * 0.42)
      controls.minDistance = 7
      controls.maxDistance = Math.max(160, maxDepth * 1.25)
      controls.maxPolarAngle = Math.PI / 2.04
      controls.update()

      const raycaster = new THREE.Raycaster()
      const pointer = new THREE.Vector2()
      const selectShot = (event: PointerEvent) => {
        if (!canvas || tracerMode === 'off') return
        const bounds = canvas.getBoundingClientRect()
        pointer.x = ((event.clientX - bounds.left) / bounds.width) * 2 - 1
        pointer.y = -((event.clientY - bounds.top) / bounds.height) * 2 + 1
        raycaster.setFromCamera(pointer, camera)
        const hit = raycaster.intersectObjects(shotObjects.map(({ endpoint }) => endpoint))[0]
        if (hit?.object.userData.shotId) setSelectedShotId(hit.object.userData.shotId as number)
      }
      canvas.addEventListener('pointerup', selectShot)

      const update = (now: number) => {
        if (!active || !renderer || !controls) return
        controls.update()
        const selected = shotObjects.find(({ shot }) => shot.id === selectedShotId)
        for (const object of shotObjects) {
          const isSelected = object.shot.id === selectedShotId
          object.line.visible = tracerMode === 'all' || (tracerMode === 'selected' && isSelected)
          const lineMaterial = object.line.material as THREE.LineBasicMaterial
          lineMaterial.opacity = tracerMode === 'all' ? (isSelected ? 0.95 : 0.35) : 0.95
          object.endpoint.visible = tracerMode !== 'off'
        }
        if (selectedBall && selected && tracerMode !== 'off') {
          const points = selected.trajectory.points
          const progress = ((now % 2400) / 2400) * (points.length - 1)
          const lower = Math.floor(progress)
          const upper = Math.min(points.length - 1, lower + 1)
          selectedBall.position.lerpVectors(pointVector(points[lower]), pointVector(points[upper]), progress - lower)
        }
        if (selectedBall) selectedBall.visible = tracerMode !== 'off'
        renderer.render(scene, camera)
        animationFrame = requestAnimationFrame(update)
      }

      const resize = () => {
        const { width, height } = container.getBoundingClientRect()
        camera.aspect = width / Math.max(height, 1)
        camera.updateProjectionMatrix()
        renderer?._handleResize()
      }
      const resizeObserver = new ResizeObserver(resize)
      resizeObserver.observe(container)
      resize()
      animationFrame = requestAnimationFrame(update)

      return () => {
        active = false
        cancelAnimationFrame(animationFrame)
        resizeObserver.disconnect()
        canvas.removeEventListener('pointerup', selectShot)
        controls?.dispose()
        for (const object of sceneObjects) {
          if ('geometry' in object && object.geometry) (object as THREE.Mesh | THREE.Line).geometry.dispose()
          if ('material' in object) {
            const material = (object as THREE.Mesh | THREE.Line).material
            if (Array.isArray(material)) material.forEach((item) => item.dispose())
            else material.dispose()
          }
        }
        renderer?.renderer.dispose()
      }
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Unable to initialize the 3D range')
    }
  }, [distanceScale, history, selectedShotId, tracerMode, units])

  return (
    <div className="flex h-full min-h-0 flex-col gap-2">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <p className="text-sm font-semibold tracking-tight">3D range</p>
          <p className="text-xs text-[var(--colorNeutralForeground3)]">Select a landing marker to follow its tracer.</p>
        </div>
        <Select
          size="small"
          aria-label="Tracer mode"
          value={tracerMode}
          onChange={(_, data) => setTracerMode(data.value as TracerMode)}
        >
          <option value="off">Tracers off</option>
          <option value="selected">Selected tracer</option>
          <option value="all">All tracers</option>
        </Select>
      </div>
      <div ref={containerRef} className="relative min-h-0 flex-1 overflow-hidden rounded-xl border border-[#39634b] bg-[#173526] shadow-inner">
        <canvas ref={canvasRef} className="block size-full touch-none" aria-label="3D shot range" />
        {error && (
          <div className="absolute inset-0 flex items-center justify-center bg-[#173526]/95 p-6 text-center text-sm text-white">
            3D view is unavailable on this device. Switch back to Map view.
          </div>
        )}
        <div className="pointer-events-none absolute bottom-2 left-2 rounded bg-black/30 px-2 py-1 text-[0.65rem] text-white/80">
          Distances in {units === 'imperial' ? 'yards' : 'meters'} · FUSE WebGL
        </div>
      </div>
      <p className="text-xs tabular-nums text-[var(--colorNeutralForeground3)]">
        {history.length} shots · {tracerMode === 'off' ? 'tracers hidden' : tracerMode === 'all' ? 'all tracers' : 'selected tracer'} · {units === 'imperial' ? 'yd' : 'm'}
      </p>
    </div>
  )
}
