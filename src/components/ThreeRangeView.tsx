import { Select } from '@fluentui/react-components'
import { useEffect, useRef, useState } from 'react'
import * as THREE from 'three'
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js'
import { CourseLight, FuseRenderer, MeshLoader, YardageLinesMaterial } from '@opengolfsim/fuse'

import { clubColorFor } from '@/components/DispersionView'
import { highlightParts, statMetrics, yardsToMeters, type Shot, type StatMetricKey } from '@/lib/format'
import { trajectoryForShot, type ShotTrajectory, type TrajectoryPoint } from '@/lib/trajectory'

const overlayMetrics: StatMetricKey[] = ['carry', 'total', 'offline', 'totalDeviationDeg', 'carryOffline', 'carryDeviationDeg']

const mountainModelUrl = '/fuse-range/models/rangeMtns.glb'
const bagstandModelUrl = '/fuse-range/models/bagstand.glb'
const fairwayTextureUrl = '/fuse-range/textures/gen_fairway_tex.png'
const fairwayMapUrl = '/fuse-range/textures/gen_fairway_map.png'

type TracerMode = 'off' | 'selected' | 'all'

type ThreeRangeViewProps = {
  history: Shot[]
  units: 'imperial' | 'metric'
  distanceScale: number | null
}

type ShotObjects = {
  shot: Shot
  trajectory: ShotTrajectory
  line: THREE.Group
  endpoint: THREE.Mesh
}

function pointVector(point: TrajectoryPoint) {
  return new THREE.Vector3(point.x, point.y, point.z)
}

function createTracer(points: THREE.Vector3[], color: string, opacity: number) {
  const curve = new THREE.CatmullRomCurve3(points, false, 'centripetal', 0.2)
  const group = new THREE.Group()
  const glow = new THREE.Mesh(
    new THREE.TubeGeometry(curve, Math.max(24, points.length * 2), 0.22, 8, false),
    new THREE.MeshBasicMaterial({ color, transparent: true, opacity: opacity * 0.22, depthWrite: false }),
  )
  const core = new THREE.Mesh(
    new THREE.TubeGeometry(curve, Math.max(24, points.length * 2), 0.08, 6, false),
    new THREE.MeshBasicMaterial({ color, transparent: true, opacity, depthWrite: false }),
  )
  group.add(glow, core)
  group.userData.tracerMaterials = [glow.material, core.material]
  return group
}

export function ThreeRangeView({ history, units, distanceScale }: ThreeRangeViewProps) {
  const containerRef = useRef<HTMLDivElement>(null)
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const [tracerMode, setTracerMode] = useState<TracerMode>('selected')
  const [selectedShotId, setSelectedShotId] = useState(history[0]?.id ?? 0)
  const [error, setError] = useState('')

  const selectedShot = history.find((shot) => shot.id === selectedShotId) ?? null

  useEffect(() => {
    if (!history.some((shot) => shot.id === selectedShotId)) setSelectedShotId(history[0]?.id ?? 0)
  }, [history, selectedShotId])

  useEffect(() => {
    setError('')
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

      const trajectories = history.filter((shot) => !shot.airSwing).map((shot) => ({ shot, trajectory: trajectoryForShot(shot) }))
      const scene = new THREE.Scene()
      const skyColor = new THREE.Color('#abd0db')
      const fogColor = new THREE.Color('#9bb0b7')
      scene.background = skyColor
      const fog = new THREE.Fog(fogColor, 160, 1000)
      scene.fog = fog
      const camera = new THREE.PerspectiveCamera(32, 1, 0.1, 3000)
      camera.position.set(0, 8, -28)
      camera.lookAt(0, 2, 200)

      renderer = new FuseRenderer({ canvas, container, renderMode: 'webgl', adaptive: true, antialias: true })
      const lightGroup = new CourseLight({
        color: new THREE.Color('#fcfae9'),
        ambient: { enabled: true, intensity: 1.3 },
        directional: { enabled: true, intensity: 1.3 },
      })
      scene.add(lightGroup)
      sceneObjects.push(lightGroup)

      // Keep the example's five-meter texture tiles, but push the ground well
      // beyond the fog and camera limits so the range has no visible edge.
      const rangeWidth = 5000
      const rangeHeight = 6000
      const grassScale = rangeWidth / 5
      const textureLoader = new THREE.TextureLoader()
      const grassTexture = textureLoader.load(fairwayTextureUrl)
      grassTexture.wrapS = THREE.RepeatWrapping
      grassTexture.wrapT = THREE.RepeatWrapping
      grassTexture.repeat.set(grassScale, rangeHeight / 5)
      grassTexture.colorSpace = THREE.SRGBColorSpace
      grassTexture.anisotropy = renderer.getMaxAnisotropy()
      const grassNormalMap = textureLoader.load(fairwayMapUrl)
      grassNormalMap.wrapS = THREE.RepeatWrapping
      grassNormalMap.wrapT = THREE.RepeatWrapping
      grassNormalMap.repeat.set(grassScale, rangeHeight / 5)
      grassNormalMap.colorSpace = THREE.SRGBColorSpace
      grassNormalMap.anisotropy = renderer.getMaxAnisotropy()

      const ground = new THREE.Mesh(
        new THREE.PlaneGeometry(rangeWidth, rangeHeight, 100, 120),
        new THREE.MeshStandardMaterial({
          name: 'floor',
          map: grassTexture,
          normalMap: grassNormalMap,
          color: new THREE.Color('#fce3ff'),
          roughness: 1,
          metalness: 0,
        }),
      )
      ground.rotation.x = -Math.PI / 2
      ground.position.z = 2800
      ground.receiveShadow = true
      ground.userData.surface = 'fairway'
      scene.add(ground)
      sceneObjects.push(ground)

      const groundLines = ground.clone()
      // Keep the transparent overlay clear of the source plane to avoid
      // depth fighting when the camera moves.
      groundLines.position.y = 0.05
      scene.add(groundLines)
      sceneObjects.push(groundLines)

      const distances = [50, 100, 150, 200, 250, 300].map((value) => units === 'imperial' ? yardsToMeters(value) : value)
      const yardageLines = new YardageLinesMaterial(
        groundLines,
        new THREE.Vector3(0, 0, 0),
        new THREE.Vector3(0, 0, 200),
        distances,
        {
          lineWidth: 0.8,
          lineLength: 70,
          maxTextureSize: renderer.getMaxTextureSize(),
          labels: [50, 100, 150, 200, 250, 300],
          lineColor: [1, 1, 1, 0.9],
          feather: 0.12,
          labelSize: [8, 4],
          labelGap: 0.8,
          texelsPerMeter: 50,
        },
      )

      const endpointGeometry = new THREE.SphereGeometry(0.42, 12, 8)
      for (const { shot, trajectory } of trajectories) {
        const points = trajectory.points.map(pointVector)
        const color = clubColorFor(shot.club || 'Driver')
        const isSelected = shot.id === selectedShotId
        const line = createTracer(points, color, tracerMode === 'all' || (tracerMode === 'selected' && isSelected) ? (isSelected ? 0.95 : 0.35) : 0)
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
      selectedBall.visible = tracerMode !== 'off' && trajectories.length > 0
      scene.add(selectedBall)
      sceneObjects.push(selectedBall)

      controls = new OrbitControls(camera, canvas)
      controls.enableDamping = true
      const maxDepth = distanceScale === null
        ? Math.max(120, Math.ceil(Math.max(...trajectories.map(({ trajectory }) => trajectory.totalDistance), 100) * 1.15 / 25) * 25)
        : units === 'imperial' ? yardsToMeters(distanceScale) : distanceScale
      controls.target.set(0, 1.5, Math.min(maxDepth * 0.42, 280))
      controls.minDistance = 7
      controls.maxDistance = Math.max(160, maxDepth * 1.25)
      controls.maxPolarAngle = Math.PI / 2.04
      controls.update()

      const meshLoader = new MeshLoader(renderer)
      void meshLoader.load(mountainModelUrl, true).then((mountain) => {
        if (!active || !mountain) return
        mountain.material = new THREE.MeshStandardMaterial({
          map: grassTexture,
          normalMap: grassNormalMap,
          roughness: 1,
          color: new THREE.Color('#687e80'),
          displacementScale: 0.5,
          normalScale: new THREE.Vector2(0, 0.5),
          metalness: 0,
        })
        mountain.position.set(0, -12, 900)
        mountain.scale.set(20, 20, 20)
        scene.add(mountain)
        sceneObjects.push(mountain)
      }).catch(() => {
        // The range remains usable if the optional horizon mesh cannot load.
      })
      void meshLoader.load(bagstandModelUrl).then((bagstand) => {
        if (!active || !bagstand) return
        bagstand.rotation.y = THREE.MathUtils.degToRad(180)
        bagstand.position.set(-2, 0.1, 0)
        scene.add(bagstand)
        sceneObjects.push(bagstand)
      }).catch(() => {
        // The range remains usable if the optional tee furniture cannot load.
      })

      const raycaster = new THREE.Raycaster()
      const pointer = new THREE.Vector2()
      const selectShot = (event: PointerEvent) => {
        if (!canvas || tracerMode === 'off') return
        const bounds = canvas.getBoundingClientRect()
        pointer.x = ((event.clientX - bounds.left) / bounds.width) * 2 - 1
        pointer.y = -((event.clientY - bounds.top) / bounds.height) * 2 + 1
        raycaster.setFromCamera(pointer, camera)
        const hit = raycaster.intersectObjects(shotObjects.map(({ endpoint }) => endpoint))[0]
        if (hit?.object.userData.shotId !== undefined) setSelectedShotId(hit.object.userData.shotId as number)
      }
      canvas.addEventListener('pointerup', selectShot)

      const update = (now: number) => {
        if (!active || !renderer || !controls) return
        controls.update()
        const selected = shotObjects.find(({ shot }) => shot.id === selectedShotId)
        for (const object of shotObjects) {
          const isSelected = object.shot.id === selectedShotId
          object.line.visible = tracerMode === 'all' || (tracerMode === 'selected' && isSelected)
          const tracerMaterials = object.line.userData.tracerMaterials as THREE.MeshBasicMaterial[]
          const opacity = tracerMode === 'all' ? (isSelected ? 0.95 : 0.35) : 0.95
          tracerMaterials[0].opacity = opacity * 0.22
          tracerMaterials[1].opacity = opacity
          object.endpoint.visible = tracerMode !== 'off'
        }
        if (selectedBall && selected && tracerMode !== 'off') {
          const points = selected.trajectory.points
          const progress = ((now % 2400) / 2400) * (points.length - 1)
          const lower = Math.floor(progress)
          const upper = Math.min(points.length - 1, lower + 1)
          selectedBall.position.lerpVectors(pointVector(points[lower]), pointVector(points[upper]), progress - lower)
        }
        if (selectedBall) selectedBall.visible = tracerMode !== 'off' && trajectories.length > 0
        renderer.render(scene, camera, fog)
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
        yardageLines.dispose()
        for (const object of sceneObjects) {
          object.traverse((child) => {
            if ('geometry' in child && child.geometry) (child.geometry as THREE.BufferGeometry).dispose()
            if ('material' in child) {
              const material = child.material as THREE.Material | THREE.Material[]
              if (Array.isArray(material)) material.forEach((item) => item.dispose())
              else {
                const materialWithMap = material as THREE.Material & { map?: THREE.Texture | null }
                materialWithMap.map?.dispose()
                material.dispose()
              }
            }
          })
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
        {selectedShot && (
          <div className="pointer-events-none absolute bottom-3 left-3 rounded-lg bg-black/50 px-3 py-2 backdrop-blur-sm">
            <div className="mb-1.5 flex items-center gap-2">
              <span className="size-2 rounded-full" style={{ background: clubColorFor(selectedShot.club || 'Driver') }} />
              <span className="text-[0.7rem] font-semibold text-white/90">{selectedShot.club || 'Driver'}</span>
              <span className="text-[0.6rem] text-white/50">#{selectedShot.id}</span>
              {selectedShot.airSwing && (
                <span className="rounded bg-amber-500/30 px-1 py-0.5 text-[0.55rem] font-semibold text-amber-300">Air</span>
              )}
            </div>
            {selectedShot.airSwing ? (
              <p className="text-[0.6rem] text-white/50">No ball data — club metrics only</p>
            ) : (
              <div className="grid grid-cols-2 gap-x-4 gap-y-0.5">
                {overlayMetrics.map((key) => {
                  const metric = statMetrics.find((m) => m.key === key)
                  if (!metric) return null
                  const parts = highlightParts(metric, selectedShot, units)
                  return (
                    <div key={key} className="flex items-baseline justify-between gap-2">
                      <span className="text-[0.55rem] font-medium uppercase tracking-wider text-white/50">{metric.label}</span>
                      <span className="text-[0.7rem] font-semibold tabular-nums text-white/90">
                        {parts.value}{parts.unit ? ` ${parts.unit}` : ''}
                      </span>
                    </div>
                  )
                })}
              </div>
            )}
          </div>
        )}
      </div>
      <p className="text-xs tabular-nums text-[var(--colorNeutralForeground3)]">
        {history.length} shots · {tracerMode === 'off' ? 'tracers hidden' : tracerMode === 'all' ? 'all tracers' : 'selected tracer'} · {units === 'imperial' ? 'yd' : 'm'}
      </p>
    </div>
  )
}
