import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { invoke } from '@tauri-apps/api/core'
import { listen } from '@tauri-apps/api/event'
import { LazyStore } from '@tauri-apps/plugin-store'
import { checkPermissions, connect as connectBle, disconnect as disconnectBle, startScan, stopScan, type BleDevice } from '@mnlphlp/plugin-blec'
import { isSpeaking, speak, stop } from 'tauri-plugin-tts-api'
import { Badge, Button, FluentProvider, Spinner, Tab, TabList, Table, TableBody, TableCell, TableHeader, TableHeaderCell, TableRow, ToggleButton, Tooltip } from '@fluentui/react-components'
import {
  ArrowMaximizeRegular,
  ArrowMinimizeRegular,
  BluetoothRegular,
  BoxRegular,
  DataUsageRegular,
  EditRegular,
  FlashRegular,
  ListRegular,
  SettingsRegular,
} from '@fluentui/react-icons'

import { ConnectDialog } from '@/components/ConnectDialog'
import { MetricGrid } from '@/components/MetricGrid'
import { SettingsDrawer, type ThemePreference } from '@/components/SettingsDrawer'
import { darkTheme, lightTheme, themeColors } from '@/theme'
import { cn } from '@/lib/utils'
import {
  calculateTempo,
  errorMessage,
  formatDistance,
  formatMetric,
  formatTempo,
  statMetrics,
  withMetrics,
  type ConnectionPhase,
  type MetricKey,
  type R10Shot,
  type R10ShotMetrics,
  type Shot,
  type StatMetricKey,
} from '@/lib/format'

const pages = [
  { id: 'data', label: 'Data' },
  { id: 'session', label: 'Session' },
  { id: 'view', label: 'View' },
] as const

type SavedPreferences = {
  preferredR10Address?: string
  enabledMetrics?: Record<MetricKey, boolean>
  voiceEnabled?: boolean
  units?: 'imperial' | 'metric'
  teeDistance?: number
  theme?: ThemePreference
  pinnedMetrics?: StatMetricKey[]
  metricOrder?: StatMetricKey[]
  hiddenMetrics?: StatMetricKey[]
}

const metricLabels: Record<MetricKey, string> = {
  clubSpeed: 'Club speed',
  path: 'Club path',
  face: 'Face angle',
  attack: 'Attack angle',
  tempo: 'Tempo',
  launch: 'Launch angle',
  ballSpeed: 'Ball speed',
  spin: 'Total spin',
}

const defaultEnabledMetrics: Record<MetricKey, boolean> = {
  clubSpeed: true,
  path: true,
  face: false,
  attack: true,
  tempo: true,
  launch: false,
  ballSpeed: false,
  spin: false,
}

const settingsStore = new LazyStore('settings.json')

const TEE_DISTANCE_DEFAULT = 2.3

const RECONNECT_DELAY_MS = 2000
const RECONNECT_ATTEMPTS = 2
const BLE_CONNECT_TIMEOUT_MS = 6000
const HANDSHAKE_TIMEOUT_MS = 10000
const TEE_DISTANCE_MIN = 2.0
const TEE_DISTANCE_MAX = 2.6
const TEE_DISTANCE_STEP = 0.1

const initialShot: Shot = {
  id: 0,
  clubSpeed: 0,
  path: 0,
  face: 0,
  attack: 0,
  tempo: 0,
  launch: 0,
  ballSpeed: 0,
  spin: 0,
  carry: 0,
  total: 0,
  launchDirection: 0,
  spinAxis: 0,
  backspin: 0,
  sidespin: 0,
  apex: 0,
  timeOfFlight: 0,
  offline: 0,
  carryOffline: 0,
  carryDeviationDeg: 0,
  totalDeviationDeg: 0,
}

const previewShot: Shot = {
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

const defaultMetricOrder: StatMetricKey[] = statMetrics.map((metric) => metric.key)

function normalizeMetricOrder(saved: StatMetricKey[] | undefined, pinned?: StatMetricKey[]): StatMetricKey[] {
  const valid = (saved?.length ? saved : pinned ?? []).filter((key) => defaultMetricOrder.includes(key))
  return [...valid, ...defaultMetricOrder.filter((key) => !valid.includes(key))]
}

const showDevTools = import.meta.env.DEV || import.meta.env.VITE_DEV_TOOLS === '1'

function jittered(base: number, range: number) {
  return base + (Math.random() - 0.5) * 2 * range
}

function mockShot(id: number): Shot {
  return {
    id,
    clubSpeed: jittered(previewShot.clubSpeed, 3),
    path: jittered(previewShot.path, 1.5),
    face: jittered(previewShot.face, 1.5),
    attack: jittered(previewShot.attack, 1.5),
    tempo: 3,
    launch: jittered(previewShot.launch, 3),
    ballSpeed: jittered(previewShot.ballSpeed, 6),
    spin: jittered(previewShot.spin, 400),
    carry: jittered(previewShot.carry, 10),
    total: jittered(previewShot.total, 10),
    launchDirection: jittered(previewShot.launchDirection, 1),
    spinAxis: jittered(previewShot.spinAxis, 2),
    backspin: jittered(previewShot.backspin, 300),
    sidespin: jittered(previewShot.sidespin, 60),
    apex: jittered(previewShot.apex, 4),
    timeOfFlight: jittered(previewShot.timeOfFlight, 0.4),
    offline: jittered(previewShot.offline, 2),
    carryOffline: jittered(previewShot.carryOffline, 1.5),
    carryDeviationDeg: jittered(previewShot.carryDeviationDeg, 0.6),
    totalDeviationDeg: jittered(previewShot.totalDeviationDeg, 0.8),
  }
}

function App() {
  const [connected, setConnected] = useState(false)
  const [connectionOpen, setConnectionOpen] = useState(false)
  const [connectionPhase, setConnectionPhase] = useState<ConnectionPhase>('idle')
  const [connectionError, setConnectionError] = useState('')
  const [connectionStatus, setConnectionStatus] = useState('Close Garmin Golf and wait for the R10 light to turn blue.')
  const [r10Devices, setR10Devices] = useState<BleDevice[]>([])
  const [selectedDevice, setSelectedDevice] = useState<BleDevice | null>(null)
  const [cleaningUp, setCleaningUp] = useState(false)
  const [preferredR10Address, setPreferredR10Address] = useState('')
  const [settingsLoaded, setSettingsLoaded] = useState(false)
  const [voiceEnabled, setVoiceEnabled] = useState(true)
  const [units, setUnits] = useState<'imperial' | 'metric'>('imperial')
  const [theme, setTheme] = useState<ThemePreference>('system')
  const [isDark, setIsDark] = useState(false)
  const [metricOrder, setMetricOrder] = useState<StatMetricKey[]>(defaultMetricOrder)
  const [hiddenMetrics, setHiddenMetrics] = useState<StatMetricKey[]>([])
  const [editMode, setEditMode] = useState(false)
  const [settingsOpen, setSettingsOpen] = useState(false)
  const [pageIndex, setPageIndex] = useState(0)
  const [statsExpanded, setStatsExpanded] = useState(false)
  const [teeDistance, setTeeDistance] = useState(TEE_DISTANCE_DEFAULT)
  const [shot, setShot] = useState<Shot>(initialShot)
  const [history, setHistory] = useState<Shot[]>([])
  const [enabledMetrics, setEnabledMetrics] = useState<Record<MetricKey, boolean>>(defaultEnabledMetrics)
  const [previewSpeaking, setPreviewSpeaking] = useState(false)
  const [copyingLogs, setCopyingLogs] = useState(false)
  const [logCopyState, setLogCopyState] = useState('')
  const attemptRef = useRef(0)
  const scanTimerRef = useRef<number | null>(null)
  const readyTimerRef = useRef<number | null>(null)
  const handshakeTimerRef = useRef<number | null>(null)
  const connectLockRef = useRef(false)
  const metricsByShotRef = useRef(new Map<number, R10ShotMetrics>())
  const selectedAddressRef = useRef('')
  const reconnectAttemptsRef = useRef(0)
  const reconnectingRef = useRef(false)
  const pendingReconnectRef = useRef(false)

  const connectionBusy = cleaningUp || ['scanning', 'connecting'].includes(connectionPhase)

  const clearScanTimer = () => {
    if (scanTimerRef.current !== null) {
      window.clearTimeout(scanTimerRef.current)
      scanTimerRef.current = null
    }
  }

  const clearReadyTimer = () => {
    if (readyTimerRef.current !== null) {
      window.clearTimeout(readyTimerRef.current)
      readyTimerRef.current = null
    }
  }

  const clearHandshakeTimer = () => {
    if (handshakeTimerRef.current !== null) {
      window.clearTimeout(handshakeTimerRef.current)
      handshakeTimerRef.current = null
    }
  }

  const connectAndStart = useCallback(async (address: string, attemptId: number) => {
    if (isTauriRuntime()) {
      await invoke('stop_r10').catch(() => undefined)
      await disconnectBle().catch(() => undefined)
    }
    const bleConnect = connectBle(address, () => {
      if (attemptRef.current !== attemptId) return
      reconnectingRef.current = false
      setConnected(false)
      setConnectionError('Bluetooth connection lost')
      setConnectionPhase('error')
      setConnectionOpen(true)
    })
    const timeoutError = new Error('Bluetooth connect timed out')
    let timeoutId: number | null = null
    const bleTimeout = new Promise<never>((_, reject) => {
      timeoutId = window.setTimeout(() => reject(timeoutError), BLE_CONNECT_TIMEOUT_MS)
    })
    try {
      await Promise.race([bleConnect, bleTimeout])
    } catch (error) {
      void bleConnect.then(() => undefined, () => undefined)
      if (attemptRef.current !== attemptId) return
      if (error !== timeoutError) throw error
      clearHandshakeTimer()
      connectLockRef.current = false
      void disconnectBle().catch(() => undefined)
      void invoke('stop_r10').catch(() => undefined)
      throw error
    } finally {
      if (timeoutId !== null) window.clearTimeout(timeoutId)
    }
    if (attemptRef.current !== attemptId) return
    handshakeTimerRef.current = window.setTimeout(() => {
      if (attemptRef.current !== attemptId) return
      connectLockRef.current = false
      reconnectingRef.current = false
      setConnectionError('The R10 did not respond to the connection request. Turn it off and on, then retry.')
      setConnectionPhase('error')
      setConnectionOpen(true)
      void disconnectBle().catch(() => undefined)
      void invoke('stop_r10').catch(() => undefined)
    }, HANDSHAKE_TIMEOUT_MS)
    await invoke('start_r10', { address })
  }, [])

  const reconnectLoop = useCallback((address: string) => {
    reconnectAttemptsRef.current += 1
    if (reconnectAttemptsRef.current > RECONNECT_ATTEMPTS) {
      reconnectAttemptsRef.current = 0
      reconnectingRef.current = false
      connectLockRef.current = false
      setConnected(false)
      setConnectionError('Could not reconnect to the R10. Retry manually to keep hitting.')
      setConnectionPhase('error')
      setConnectionOpen(true)
      return
    }
    reconnectingRef.current = true
    setConnected(false)
    setConnectionPhase('connecting')
    const attemptId = ++attemptRef.current
    window.setTimeout(() => {
      if (attemptRef.current !== attemptId) return
      connectLockRef.current = true
      void connectAndStart(address, attemptId).catch(() => {
        if (attemptRef.current !== attemptId) return
        reconnectLoop(address)
      })
    }, RECONNECT_DELAY_MS)
  }, [connectAndStart])

  useEffect(() => {
    if (!isTauriRuntime()) {
      setSettingsLoaded(true)
      return
    }
    let active = true
    void (async () => {
      try {
        const saved = await settingsStore.get<SavedPreferences>('preferences')
        if (!active || !saved) return
        if (saved.preferredR10Address) setPreferredR10Address(saved.preferredR10Address)
        if (saved.enabledMetrics) setEnabledMetrics({ ...defaultEnabledMetrics, ...saved.enabledMetrics })
        if (typeof saved.voiceEnabled === 'boolean') setVoiceEnabled(saved.voiceEnabled)
        if (saved.units) setUnits(saved.units)
        if (saved.theme) setTheme(saved.theme)
        if (saved.metricOrder?.length || saved.pinnedMetrics?.length) setMetricOrder(normalizeMetricOrder(saved.metricOrder, saved.pinnedMetrics))
        if (saved.hiddenMetrics) setHiddenMetrics(saved.hiddenMetrics.filter((key) => defaultMetricOrder.includes(key)))
        if (typeof saved.teeDistance === 'number') setTeeDistance(saved.teeDistance)
      } finally {
        if (active) setSettingsLoaded(true)
      }
    })()
    return () => { active = false }
  }, [])

  useEffect(() => {
    if (!settingsLoaded || !isTauriRuntime()) return
    void settingsStore.set('preferences', { preferredR10Address, enabledMetrics, voiceEnabled, units, teeDistance, theme, metricOrder, hiddenMetrics })
    void invoke('set_voice_config', { config: { voiceEnabled, metrics: enabledMetrics, units } }).catch(() => undefined)
    void invoke('set_tee_distance', { yards: teeDistance }).catch(() => undefined)
  }, [enabledMetrics, hiddenMetrics, metricOrder, preferredR10Address, settingsLoaded, teeDistance, theme, units, voiceEnabled])

  useEffect(() => {
    const media = window.matchMedia?.('(prefers-color-scheme: dark)') ?? {
      matches: false,
      addEventListener: () => {},
      removeEventListener: () => {},
    }
    const applyTheme = () => {
      const dark = theme === 'dark' || (theme === 'system' && media.matches)
      setIsDark(dark)
      document.documentElement.classList.toggle('dark', dark)
      document.querySelector('meta[name="theme-color"]')?.setAttribute('content', dark ? themeColors.darkBackground : themeColors.lightBackground)
    }
    applyTheme()
    media.addEventListener('change', applyTheme)
    return () => media.removeEventListener('change', applyTheme)
  }, [theme])

  useEffect(() => {
    const onShot = (event: Event) => {
      const nextShot = (event as CustomEvent<Shot>).detail
      setShot(nextShot)
      setHistory((current) => [nextShot, ...current])
    }
    window.addEventListener('range:shot', onShot)
    return () => window.removeEventListener('range:shot', onShot)
  }, [])

  useEffect(() => {
    if (!(window as Window & { __TAURI_INTERNALS__?: unknown }).__TAURI_INTERNALS__) return
    let active = true
    let dispose: (() => void) | undefined
    void listen<R10Shot>('r10://shot', ({ payload }) => {
      const metrics = metricsByShotRef.current.get(payload.shot_id)
      metricsByShotRef.current.delete(payload.shot_id)
      const nextShot: Shot = withMetrics({
        ...initialShot,
        id: payload.shot_id,
        clubSpeed: (payload.club?.club_head_speed ?? 0) * 2.23694,
        path: payload.club?.path_angle ?? 0,
        face: payload.club?.face_angle ?? 0,
        attack: payload.club?.attack_angle ?? 0,
        tempo: calculateTempo(payload.swing),
        launch: payload.ball?.launch_angle ?? 0,
        ballSpeed: (payload.ball?.ball_speed ?? 0) * 2.23694,
        spin: payload.ball?.total_spin ?? 0,
        launchDirection: payload.ball?.launch_direction ?? 0,
        spinAxis: payload.ball?.spin_axis ?? 0,
        backspin: payload.ball?.backspin ?? 0,
        sidespin: payload.ball?.sidespin ?? 0,
      }, metrics)
      setShot(nextShot)
      setHistory((current) => [nextShot, ...current])
    }).then((unlisten) => {
      if (active) dispose = unlisten
      else unlisten()
    }).catch(() => undefined)
    void listen<R10ShotMetrics>('r10://shot-metrics', ({ payload }) => {
      metricsByShotRef.current.set(payload.shot_id, payload)
      setHistory((current) => current.map((item) =>
        item.id === payload.shot_id && item.carry === 0
          ? withMetrics(item, payload)
          : item,
      ))
      setShot((current) =>
        current.id === payload.shot_id && current.carry === 0
          ? withMetrics(current, payload)
          : current,
      )
    }).then((unlisten) => {
      if (active) dispose = unlisten
      else unlisten()
    }).catch(() => undefined)
    return () => {
      active = false
      dispose?.()
    }
  }, [])

  useEffect(() => {
    if (!(window as Window & { __TAURI_INTERNALS__?: unknown }).__TAURI_INTERNALS__) return
    let active = true
    let disposeStage: (() => void) | undefined
    let disposeError: (() => void) | undefined
    let disposeDeviceError: (() => void) | undefined
    let disposeSessionEnd: (() => void) | undefined
    void listen<string>('r10://stage', ({ payload }) => {
      if (payload === 'waking') {
        clearHandshakeTimer()
        connectLockRef.current = false
        reconnectAttemptsRef.current = 0
        reconnectingRef.current = false
        pendingReconnectRef.current = false
        setConnected(true)
        setConnectionStatus('R10 connected, waiting for your swing.')
        setConnectionError('')
        setConnectionPhase('ready')
        clearReadyTimer()
        readyTimerRef.current = window.setTimeout(() => {
          setConnectionOpen(false)
        }, 900)
      } else {
        setConnectionStatus('Connecting to your R10...')
        setConnectionPhase('connecting')
      }
    }).then((unlisten) => {
      if (active) disposeStage = unlisten
      else unlisten()
    }).catch(() => undefined)
    void listen<string>('r10://error', ({ payload }) => {
      clearHandshakeTimer()
      clearReadyTimer()
      connectLockRef.current = false
      setConnected(false)
      if (reconnectingRef.current) return
      setConnectionStatus(payload)
      setConnectionError(payload)
      setConnectionPhase('error')
      setConnectionOpen(true)
    }).then((unlisten) => {
      if (active) disposeError = unlisten
      else unlisten()
    }).catch(() => undefined)
    void listen<unknown>('r10://device-error', ({ payload }) => {
      setConnectionError(`Garmin R10 reported an error: ${JSON.stringify(payload)}`)
    }).then((unlisten) => {
      if (active) disposeDeviceError = unlisten
      else unlisten()
    }).catch(() => undefined)
    void listen<string>('r10://session-end', () => {
      if (!selectedAddressRef.current || reconnectingRef.current) return
      if (document.hidden) {
        // The webview is frozen while the app is suspended: defer the
        // reconnect until the app is visible instead of burning attempts.
        pendingReconnectRef.current = true
        return
      }
      reconnectLoop(selectedAddressRef.current)
    }).then((unlisten) => {
      if (active) disposeSessionEnd = unlisten
      else unlisten()
    }).catch(() => undefined)
    const onVisibleReconnect = () => {
      if (document.hidden || !pendingReconnectRef.current) return
      pendingReconnectRef.current = false
      if (selectedAddressRef.current && !reconnectingRef.current) {
        reconnectLoop(selectedAddressRef.current)
      }
    }
    document.addEventListener('visibilitychange', onVisibleReconnect)
    return () => {
      active = false
      disposeStage?.()
      disposeError?.()
      disposeDeviceError?.()
      disposeSessionEnd?.()
      document.removeEventListener('visibilitychange', onVisibleReconnect)
    }
  }, [reconnectLoop])

  useEffect(() => () => {
    clearScanTimer()
    clearReadyTimer()
    clearHandshakeTimer()
  }, [])

  const speedUnit = units === 'imperial' ? 'mph' : 'km/h'
  const convertSpeed = (value: number) => units === 'imperial' ? value : value * 1.60934
  const hasShot = shot.id > 0

  const speechPreview = useMemo(() => {
    const values = Object.entries(enabledMetrics)
      .filter(([, enabled]) => enabled)
      .map(([key]) => `${metricLabels[key as MetricKey]} ${formatMetric(key as MetricKey, previewShot, units)}`)
    return values.length ? values.join('. ') : 'No metrics selected'
  }, [enabledMetrics, units])

  const toggleMetric = (key: MetricKey) => {
    setEnabledMetrics((current) => ({ ...current, [key]: !current[key] }))
  }

  const togglePreview = () => {
    if (previewSpeaking) {
      setPreviewSpeaking(false)
      void stop().catch(() => undefined)
    } else {
      setPreviewSpeaking(true)
      void speak({ text: speechPreview, language: 'en-US', voiceId: null, rate: 1, pitch: 1, volume: 1, queueMode: 'flush' })
        .catch(() => setPreviewSpeaking(false))
    }
  }

  const copySessionLogs = async () => {
    if (!isTauriRuntime() || copyingLogs) return
    setCopyingLogs(true)
    setLogCopyState('')
    try {
      const logs = await invoke<string>('read_app_log')
      await navigator.clipboard.writeText(logs)
      setLogCopyState('Copied. Paste it when reporting a stall.')
    } catch {
      setLogCopyState('Could not read the session log.')
    } finally {
      setCopyingLogs(false)
    }
  }

  useEffect(() => {
    if (!previewSpeaking) return
    const handle = window.setInterval(() => {
      void isSpeaking().then((speaking) => {
        if (!speaking) setPreviewSpeaking(false)
      }).catch(() => undefined)
    }, 400)
    return () => window.clearInterval(handle)
  }, [previewSpeaking])

  const isR10Device = (device: BleDevice) => {
    const name = (device.name || '').toLowerCase()
    const hasR10Service = (device.services || []).some((service) => service.toLowerCase().includes('6a4e2800'))
    return name.includes('approach') || name.includes('r10') || hasR10Service
  }

  const scanForR10 = async () => {
    if (connectionBusy) return
    const attemptId = ++attemptRef.current
    clearScanTimer()
    clearReadyTimer()
    connectLockRef.current = false
    setConnectionOpen(true)
    setConnectionPhase('scanning')
    setSelectedDevice(null)
    setR10Devices([])
    setConnectionError('')
    setConnectionStatus('Scanning for nearby Approach R10 devices...')
    const isTauri = isTauriRuntime()
    if (!isTauri) {
      window.setTimeout(() => {
        if (attemptRef.current !== attemptId) return
        setConnectionPhase('error')
        setConnectionError('Bluetooth discovery is available only in the range10 app.')
      }, 700)
      return
    }
    try {
      if (!await checkPermissions()) throw new Error('Bluetooth permission is required')
      if (attemptRef.current !== attemptId) return
      await startScan((devices) => {
        if (attemptRef.current !== attemptId) return
        const matches = devices.filter(isR10Device).sort((left, right) => {
          if (left.address === preferredR10Address) return -1
          if (right.address === preferredR10Address) return 1
          return (right.rssi ?? -1000) - (left.rssi ?? -1000)
        })
        setR10Devices(matches)
        if (matches.length > 0) {
          setConnectionPhase('selecting')
          setConnectionStatus('Select your Approach R10 to begin negotiation.')
        }
      }, 10000)
      scanTimerRef.current = window.setTimeout(() => {
        if (attemptRef.current !== attemptId) return
        void stopScan().catch(() => undefined)
        setConnectionPhase((current) => {
          if (current === 'scanning') {
            setConnectionError('No Approach R10 found. Make sure it is on, blue, and not connected to Garmin Golf.')
            return 'error'
          }
          return current
        })
      }, 10500)
    } catch (error) {
      if (attemptRef.current !== attemptId) return
      setConnectionError(errorMessage(error, 'Unable to scan for the Garmin R10'))
      setConnectionPhase('error')
    }
  }

  const connectToDevice = async (device: BleDevice) => {
    if (connectLockRef.current || connectionBusy || !['selecting', 'error'].includes(connectionPhase)) return
    connectLockRef.current = true
    clearScanTimer()
    clearReadyTimer()
    const attemptId = ++attemptRef.current
    setSelectedDevice(device)
    selectedAddressRef.current = device.address
    setConnectionPhase('connecting')
    setConnectionError('')
    setConnectionStatus('Connecting to Approach R10 over Bluetooth...')
    try {
      await stopScan().catch(() => undefined)
      if (attemptRef.current !== attemptId) return
      await connectAndStart(device.address, attemptId)
      if (attemptRef.current === attemptId) setPreferredR10Address(device.address)
    } catch (error) {
      if (attemptRef.current !== attemptId) return
      ++attemptRef.current
      connectLockRef.current = false
      clearHandshakeTimer()
      void disconnectBle().catch(() => undefined)
      void invoke('stop_r10').catch(() => undefined)
      setConnected(false)
      setConnectionError(errorMessage(error, 'Unable to connect to this BLE device'))
      setConnectionPhase('error')
    }
  }

  const cancelConnection = async () => {
    if (cleaningUp) return
    if (connected && connectionPhase === 'ready') {
      clearReadyTimer()
      setConnectionOpen(false)
      return
    }
    setCleaningUp(true)
    ++attemptRef.current
    connectLockRef.current = false
    clearScanTimer()
    clearReadyTimer()
    clearHandshakeTimer()
    setConnectionStatus('Cancelling the current connection attempt...')
    await stopScan().catch(() => undefined)
    void disconnectBle().catch(() => undefined)
    if (isTauriRuntime()) await invoke('stop_r10').catch(() => undefined)
    setConnectionOpen(false)
    setConnectionPhase(connected ? 'ready' : 'idle')
    setCleaningUp(false)
  }

  const disconnectFromR10 = async () => {
    if (cleaningUp) return
    setCleaningUp(true)
    ++attemptRef.current
    reconnectAttemptsRef.current = 0
    reconnectingRef.current = false
    pendingReconnectRef.current = false
    selectedAddressRef.current = ''
    clearScanTimer()
    clearReadyTimer()
    clearHandshakeTimer()
    setConnectionStatus('Disconnecting from your R10...')
    await stopScan().catch(() => undefined)
    void disconnectBle().catch(() => undefined)
    if (isTauriRuntime()) await invoke('stop_r10').catch(() => undefined)
    setConnected(false)
    setConnectionError('')
    setSelectedDevice(null)
    setConnectionPhase('idle')
    setConnectionOpen(false)
    setCleaningUp(false)
  }

  const chooseAnotherDevice = async () => {
    if (cleaningUp) return
    setCleaningUp(true)
    ++attemptRef.current
    connectLockRef.current = false
    clearScanTimer()
    clearReadyTimer()
    clearHandshakeTimer()
    void disconnectBle().catch(() => undefined)
    if (isTauriRuntime()) await invoke('stop_r10').catch(() => undefined)
    setSelectedDevice(null)
    setConnectionError('')
    setConnectionPhase('idle')
    setCleaningUp(false)
    await scanForR10()
  }

  const [simulating, setSimulating] = useState(false)
  const touchStartXRef = useRef<number | null>(null)

  const toggleHiddenMetric = (key: StatMetricKey) =>
    setHiddenMetrics((current) => (current.includes(key) ? current.filter((item) => item !== key) : [...current, key]))

  const changePage = (delta: number) => {
    setEditMode(false)
    setPageIndex((current) => Math.min(pages.length - 1, Math.max(0, current + delta)))
  }

  const onTouchStart = (event: React.TouchEvent) => {
    touchStartXRef.current = editMode ? null : event.touches[0]?.clientX ?? null
  }

  const onTouchEnd = (event: React.TouchEvent) => {
    const startX = touchStartXRef.current
    touchStartXRef.current = null
    if (startX === null || editMode) return
    const delta = (event.changedTouches[0]?.clientX ?? startX) - startX
    if (Math.abs(delta) > 64) changePage(delta < 0 ? 1 : -1)
  }

  const simulateShot = async () => {
    if (simulating) return
    setSimulating(true)
    try {
      if ((window as Window & { __TAURI_INTERNALS__?: unknown }).__TAURI_INTERNALS__) {
        await invoke('simulate_shot')
      } else {
        const nextId = history[0]?.id ?? previewShot.id
        window.dispatchEvent(new CustomEvent('range:shot', { detail: mockShot(nextId + 1) }))
      }
    } finally {
      setSimulating(false)
    }
  }

  const page = pages[pageIndex]

  return (
    <FluentProvider theme={isDark ? darkTheme : lightTheme} className="h-dvh overflow-hidden bg-[var(--colorNeutralBackground1)] text-[var(--colorNeutralForeground1)]">
      <div className={cn('mx-auto grid h-full w-full max-w-[1480px]', statsExpanded ? 'grid-rows-[minmax(0,1fr)]' : 'grid-rows-[auto_minmax(0,1fr)_auto]')}>
        <header className={cn('flex items-center justify-between gap-2 border-b border-[var(--colorNeutralStroke2)] px-2 pb-1.5 pt-[max(0.4rem,env(safe-area-inset-top))]', statsExpanded && 'hidden')}>
          <div className="flex min-w-0 items-center gap-2">
            <div className="flex size-7 shrink-0 items-center justify-center rounded-md bg-[var(--colorBrandBackground)] text-xs font-semibold text-[var(--colorNeutralForegroundOnBrand)]">10</div>
            <p className="truncate text-sm font-bold tracking-tight">range10</p>
          </div>
          <div className="flex items-center gap-1">
            {showDevTools && (
              <Tooltip content="Simulate R10 shot" relationship="label">
                <Button size="small" appearance="subtle" icon={simulating ? <Spinner size="extra-tiny" /> : <FlashRegular />} onClick={() => void simulateShot()} disabled={simulating} aria-label="Simulate R10 shot" />
              </Tooltip>
            )}
            <Button
              size="small"
              appearance={connected ? 'secondary' : 'primary'}
              icon={connectionBusy ? <Spinner size="extra-tiny" /> : <BluetoothRegular />}
              onClick={() => { if (connected) void disconnectFromR10(); else void scanForR10() }}
              disabled={connectionOpen || cleaningUp || connectionBusy}
            >
              {connected ? 'Connected' : connectionBusy ? 'Connecting' : 'Connect'}
            </Button>
            <Button size="small" appearance="subtle" icon={<SettingsRegular />} onClick={() => setSettingsOpen(true)} aria-label="Open settings" />
          </div>
        </header>

        <main className={cn('min-h-0 overflow-hidden', statsExpanded ? 'p-1' : 'p-1.5')} onTouchStart={onTouchStart} onTouchEnd={onTouchEnd}>
          {page.id === 'data' && (
            <div className="relative h-full min-h-0 overflow-y-auto">
              <MetricGrid
                order={metricOrder}
                hidden={hiddenMetrics}
                editMode={editMode}
                shot={shot}
                hasShot={hasShot}
                units={units}
                onReorder={setMetricOrder}
                onToggleHidden={toggleHiddenMetric}
              />
              {statsExpanded && (
                <Button
                  className="!absolute right-1 top-1 z-20"
                  size="small"
                  appearance="secondary"
                  icon={<ArrowMinimizeRegular />}
                  onClick={() => setStatsExpanded(false)}
                  aria-label="Minimize stats"
                />
              )}
            </div>
          )}

          {page.id === 'session' && (
            <div className="h-full min-h-0 overflow-auto rounded-md border border-[var(--colorNeutralStroke2)]">
              {history.length ? (
                <Table size="small" aria-label="Shot log">
                  <TableHeader className="sticky top-0 z-10 bg-[var(--colorNeutralBackground1)]">
                    <TableRow>
                      <TableHeaderCell className="pl-3">Shot</TableHeaderCell>
                      <TableHeaderCell>Club speed</TableHeaderCell>
                      <TableHeaderCell>Path</TableHeaderCell>
                      <TableHeaderCell>Tempo</TableHeaderCell>
                      <TableHeaderCell>Carry</TableHeaderCell>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {history.map((item) => (
                      <TableRow key={item.id} appearance={item.id === shot.id ? 'brand' : 'none'}>
                        <TableCell className="pl-3 font-medium">#{item.id}</TableCell>
                        <TableCell>{convertSpeed(item.clubSpeed).toFixed(1)} {speedUnit}</TableCell>
                        <TableCell>{item.path > 0 ? '+' : ''}{item.path.toFixed(1)}°</TableCell>
                        <TableCell>{item.tempo ? formatTempo(item.tempo) : '—'}</TableCell>
                        <TableCell>{formatDistance(item.carry, units)}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              ) : (
                <EmptyState icon={<DataUsageRegular />} title="No shots yet" description="Shots recorded by your R10 will be listed here." />
              )}
            </div>
          )}

          {page.id === 'view' && (
            <EmptyState icon={<BoxRegular />} title="Shot view is coming soon" description="Trajectory, carry, and total distance will be visualized here from real R10 data." badge="In development" />
          )}
        </main>

        <footer className={cn('flex items-center justify-between gap-1 border-t border-[var(--colorNeutralStroke2)] px-2 pb-[max(0.4rem,env(safe-area-inset-bottom))] pt-1', statsExpanded && 'hidden')} aria-label="Page navigation">
          <TabList
            size="small"
            selectedValue={page.id}
            onTabSelect={(_, data) => {
              setEditMode(false)
              setPageIndex(pages.findIndex(({ id }) => id === data.value))
            }}
          >
            <Tab value="data" icon={<DataUsageRegular />}>Data</Tab>
            <Tab value="session" icon={<ListRegular />}>Session</Tab>
            <Tab value="view" icon={<BoxRegular />}>View</Tab>
          </TabList>
          <div className="flex items-center gap-1">
            {page.id === 'data' && (
              <>
                <ToggleButton size="small" appearance="subtle" checked={editMode} icon={<EditRegular />} onClick={() => setEditMode((value) => !value)} aria-label="Edit metric layout" />
                <Button size="small" appearance="subtle" icon={<ArrowMaximizeRegular />} onClick={() => setStatsExpanded(true)} aria-label="Expand stats" />
              </>
            )}
          </div>
        </footer>
      </div>

      <SettingsDrawer
        open={settingsOpen}
        onClose={() => setSettingsOpen(false)}
        units={units}
        onUnitsChange={setUnits}
        theme={theme}
        onThemeChange={setTheme}
        teeDistance={teeDistance}
        teeDistanceMin={TEE_DISTANCE_MIN}
        teeDistanceMax={TEE_DISTANCE_MAX}
        onTeeDistanceStep={(direction) => setTeeDistance((current) => Math.min(TEE_DISTANCE_MAX, Math.max(TEE_DISTANCE_MIN, Math.round((current + direction * TEE_DISTANCE_STEP) * 10) / 10)))}
        voiceEnabled={voiceEnabled}
        onVoiceEnabledChange={setVoiceEnabled}
        metricLabels={metricLabels}
        enabledMetrics={enabledMetrics}
        onToggleMetric={toggleMetric}
        speechPreview={speechPreview}
        previewSpeaking={previewSpeaking}
        onTogglePreview={togglePreview}
        canCopyLogs={isTauriRuntime()}
        copyingLogs={copyingLogs}
        logCopyState={logCopyState}
        onCopyLogs={() => void copySessionLogs()}
      />

      <ConnectDialog
        open={connectionOpen}
        phase={connectionPhase}
        status={connectionStatus}
        error={connectionError}
        devices={r10Devices}
        selectedDevice={selectedDevice}
        preferredAddress={preferredR10Address}
        busy={connectionBusy}
        cleaningUp={cleaningUp}
        onCancel={() => void cancelConnection()}
        onChooseAnother={() => void chooseAnotherDevice()}
        onConnectDevice={(device) => void connectToDevice(device)}
      />
    </FluentProvider>
  )
}

export default App

function isTauriRuntime() {
  return Boolean((window as Window & { __TAURI_INTERNALS__?: unknown }).__TAURI_INTERNALS__)
}

function EmptyState({ icon, title, description, badge }: { icon: React.ReactNode; title: string; description: string; badge?: string }) {
  return (
    <div className="flex h-full min-h-0 flex-col items-center justify-center rounded-md border border-dashed border-[var(--colorNeutralStroke2)] px-6 text-center">
      <div className="mb-4 flex size-12 items-center justify-center rounded-full bg-[var(--colorNeutralBackground3)] text-2xl text-[var(--colorBrandForeground1)]">{icon}</div>
      {badge && <Badge appearance="outline" color="brand" className="mb-3">{badge}</Badge>}
      <h2 className="text-xl font-semibold sm:text-2xl">{title}</h2>
      <p className="mt-2 max-w-sm text-sm leading-relaxed text-[var(--colorNeutralForeground3)]">{description}</p>
    </div>
  )
}
