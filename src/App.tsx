import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { invoke } from '@tauri-apps/api/core'
import { listen } from '@tauri-apps/api/event'
import { LazyStore } from '@tauri-apps/plugin-store'
import { checkPermissions, connect as connectBle, disconnect as disconnectBle, startScan, stopScan, type BleDevice } from '@mnlphlp/plugin-blec'
import { isSpeaking, speak, stop } from 'tauri-plugin-tts-api'
import {
  Activity,
  ArrowRight,
  Bluetooth,
  BluetoothConnected,
  Box,
  CircleAlert,
  Gauge,
  List,
  LoaderCircle,
  Minus,
  Pause,
  Play,
  Plus,
  Radio,
  Settings,
  SlidersHorizontal,
  Volume2,
} from 'lucide-react'

import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Separator } from '@/components/ui/separator'
import { Switch } from '@/components/ui/switch'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group'
import {
  calculateTempo,
  connectionTitle,
  displayDeviceName,
  errorMessage,
  formatDistance,
  formatMetric,
  formatTeeDistance,
  formatTempo,
  type ConnectionPhase,
  type MetricKey,
  type R10Shot,
  type R10ShotMetrics,
  type Shot,
} from '@/lib/format'

type Tab = 'stats' | 'log' | 'view' | 'settings'

const tabs: { id: Tab; label: string; icon: typeof Activity }[] = [
  { id: 'stats', label: 'Stats', icon: Gauge },
  { id: 'log', label: 'Log', icon: List },
  { id: 'view', label: 'View', icon: Box },
  { id: 'settings', label: 'Settings', icon: Settings },
]

type SavedPreferences = {
  preferredR10Address?: string
  enabledMetrics?: Record<MetricKey, boolean>
  voiceEnabled?: boolean
  units?: 'imperial' | 'metric'
  teeDistance?: number
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

const STALL_TIMEOUT_MS = 30000

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
  const [teeDistance, setTeeDistance] = useState(TEE_DISTANCE_DEFAULT)
  const [shot, setShot] = useState<Shot>(initialShot)
  const [history, setHistory] = useState<Shot[]>([])
  const [enabledMetrics, setEnabledMetrics] = useState<Record<MetricKey, boolean>>(defaultEnabledMetrics)
  const [activeTab, setActiveTab] = useState<Tab>('stats')
  const [previewSpeaking, setPreviewSpeaking] = useState(false)
  const [copyingLogs, setCopyingLogs] = useState(false)
  const [logCopyState, setLogCopyState] = useState('')
  const attemptRef = useRef(0)
  const scanTimerRef = useRef<number | null>(null)
  const readyTimerRef = useRef<number | null>(null)
  const handshakeTimerRef = useRef<number | null>(null)
  const connectLockRef = useRef(false)
  const metricsByShotRef = useRef(new Map<number, Pick<R10ShotMetrics, 'carry_yards' | 'total_yards'>>())
  const lastHeartbeatRef = useRef(0)
  const selectedAddressRef = useRef('')
  const reconnectAttemptsRef = useRef(0)
  const reconnectingRef = useRef(false)

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
        if (typeof saved.teeDistance === 'number') setTeeDistance(saved.teeDistance)
      } finally {
        if (active) setSettingsLoaded(true)
      }
    })()
    return () => { active = false }
  }, [])

  useEffect(() => {
    if (!settingsLoaded || !isTauriRuntime()) return
    void settingsStore.set('preferences', { preferredR10Address, enabledMetrics, voiceEnabled, units, teeDistance })
    void invoke('set_voice_config', { config: { voiceEnabled, metrics: enabledMetrics, units } }).catch(() => undefined)
    void invoke('set_tee_distance', { yards: teeDistance }).catch(() => undefined)
  }, [enabledMetrics, preferredR10Address, settingsLoaded, teeDistance, units, voiceEnabled])

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
      const nextShot: Shot = {
        id: payload.shot_id,
        clubSpeed: (payload.club?.club_head_speed ?? 0) * 2.23694,
        path: payload.club?.path_angle ?? 0,
        face: payload.club?.face_angle ?? 0,
        attack: payload.club?.attack_angle ?? 0,
        tempo: calculateTempo(payload.swing),
        launch: payload.ball?.launch_angle ?? 0,
        ballSpeed: (payload.ball?.ball_speed ?? 0) * 2.23694,
        spin: payload.ball?.total_spin ?? 0,
        carry: metrics?.carry_yards ?? 0,
        total: metrics?.total_yards ?? 0,
      }
      setShot(nextShot)
      setHistory((current) => [nextShot, ...current])
    }).then((unlisten) => {
      if (active) dispose = unlisten
      else unlisten()
    }).catch(() => undefined)
    void listen<R10ShotMetrics>('r10://shot-metrics', ({ payload }) => {
      metricsByShotRef.current.set(payload.shot_id, { carry_yards: payload.carry_yards, total_yards: payload.total_yards })
    }).then((unlisten) => {
      if (active) dispose = unlisten
      else unlisten()
    }).catch(() => undefined)
    void listen<unknown>('r10://heartbeat', () => {
      lastHeartbeatRef.current = Date.now()
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
        setConnected(true)
        setConnectionStatus('R10 connected, waiting for your swing.')
        setConnectionError('')
        setConnectionPhase('ready')
        lastHeartbeatRef.current = Date.now()
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
      reconnectLoop(selectedAddressRef.current)
    }).then((unlisten) => {
      if (active) disposeSessionEnd = unlisten
      else unlisten()
    }).catch(() => undefined)
    return () => {
      active = false
      disposeStage?.()
      disposeError?.()
      disposeDeviceError?.()
      disposeSessionEnd?.()
    }
  }, [reconnectLoop])

  useEffect(() => () => {
    clearScanTimer()
    clearReadyTimer()
    clearHandshakeTimer()
  }, [])

  useEffect(() => {
    // While the app is suspended (screen lock, background) timers freeze but
    // the wall clock keeps running: without this grace reset the stall
    // watchdog would kill a healthy session right after resume.
    const onVisible = () => {
      if (!document.hidden && lastHeartbeatRef.current !== 0) {
        lastHeartbeatRef.current = Date.now()
      }
    }
    document.addEventListener('visibilitychange', onVisible)
    return () => document.removeEventListener('visibilitychange', onVisible)
  }, [])

  useEffect(() => {
    if (!connected || connectionPhase !== 'ready') return
    const id = window.setInterval(() => {
      if (document.hidden) return
      if (lastHeartbeatRef.current !== 0 && Date.now() - lastHeartbeatRef.current > STALL_TIMEOUT_MS) {
        lastHeartbeatRef.current = 0
        ++attemptRef.current
        clearReadyTimer()
        clearHandshakeTimer()
        setConnected(false)
        setConnectionError('The R10 session stalled. Retry the connection to keep hitting.')
        setConnectionPhase('error')
        setConnectionOpen(true)
        void disconnectBle().catch(() => undefined)
        void invoke('stop_r10').catch(() => undefined)
      }
    }, 5000)
    return () => window.clearInterval(id)
  }, [connected, connectionPhase])

  const speedUnit = units === 'imperial' ? 'mph' : 'km/h'
  const convertSpeed = (value: number) => units === 'imperial' ? value : value * 1.60934
  const enabledCount = Object.values(enabledMetrics).filter(Boolean).length
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

  return (
    <Tabs value={activeTab} onValueChange={(value) => setActiveTab(value as Tab)} className="h-dvh overflow-hidden bg-[radial-gradient(circle_at_85%_-10%,rgba(73,89,64,0.28),transparent_34rem)]">
      <div className="mx-auto grid h-full w-full max-w-[1480px] grid-rows-[auto_minmax(0,1fr)_auto]">
        <header className="flex items-center justify-between border-b border-border/80 px-4 pb-3 pt-[max(0.75rem,env(safe-area-inset-top))] sm:px-7">
          <Brand />
          <Button size="sm" variant={connected ? 'outline' : 'secondary'} onClick={() => { if (connected) void disconnectFromR10(); else void scanForR10() }} disabled={connectionOpen || cleaningUp || connectionBusy}>
            {connectionBusy ? <LoaderCircle className="animate-spin" /> : connected ? <BluetoothConnected /> : <Bluetooth />}
            {connected ? 'Disconnect' : connectionBusy ? 'Connecting' : 'Connect R10'}
          </Button>
        </header>

        <main className="min-h-0 overflow-hidden p-4 sm:p-6 lg:p-8">
          <div className="mx-auto h-full max-w-6xl">
            <TabsContent value="stats" className="h-full">
              <Card className="sage-shadow relative flex h-full overflow-hidden border-primary/20 bg-[linear-gradient(145deg,var(--card),color-mix(in_srgb,var(--accent)_24%,var(--card)))]">
                <div className="pointer-events-none absolute -right-20 -top-28 size-80 rounded-full border border-primary/10 bg-primary/5" />
                <CardHeader className="relative flex-row items-center justify-between pb-1 sm:p-7">
                  <div><p className="font-mono text-[0.65rem] uppercase tracking-[0.16em] text-primary">Latest shot</p><CardDescription className="mt-1">{hasShot ? 'Club head speed' : 'Waiting for your first shot'}</CardDescription></div>
                  <Badge variant="outline" className="border-primary/30 font-mono text-primary">{hasShot ? `#${shot.id}` : '--'}</Badge>
                </CardHeader>
                <CardContent className="relative flex min-h-0 flex-1 flex-col justify-center pb-5 sm:px-7 sm:pb-7">
                  <div className="flex items-end gap-3"><strong className="font-serif text-[clamp(4.25rem,18vw,9rem)] font-normal leading-[0.75] tracking-[-0.08em]">{hasShot ? convertSpeed(shot.clubSpeed).toFixed(1) : '--'}</strong><span className="mb-1 font-mono text-sm uppercase text-primary">{speedUnit}</span></div>
                  <Separator className="my-5 sm:my-8" />
                  <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 sm:gap-3 lg:grid-cols-6">
                    <Metric label="Path" value={hasShot ? `${shot.path.toFixed(1)}°` : '--'} tone="bg-chart-2" />
                    <Metric label="Face" value={hasShot ? `${shot.face.toFixed(1)}°` : '--'} tone="bg-chart-3" />
                    <Metric label="Attack" value={hasShot ? `${shot.attack.toFixed(1)}°` : '--'} tone="bg-chart-4" />
                    <Metric label="Tempo" value={hasShot && shot.tempo ? formatTempo(shot.tempo) : '--'} tone="bg-chart-5" />
                    <Metric label="Carry" value={hasShot ? formatDistance(shot.carry, units) : '--'} tone="bg-primary" />
                    <Metric label="Total" value={hasShot ? formatDistance(shot.total, units) : '--'} tone="bg-chart-1" />
                  </div>
                </CardContent>
              </Card>
            </TabsContent>

            <TabsContent value="log" className="h-full">
              <Card className="flex h-full min-h-0 flex-col overflow-hidden">
                <CardHeader className="shrink-0 flex-row items-center justify-between py-4 sm:px-6"><div><CardTitle className="text-lg">Shot log</CardTitle><CardDescription className="mt-1">{history.length ? `${history.length} shots this session` : 'This session is empty'}</CardDescription></div><Badge variant="secondary">{history.length}</Badge></CardHeader>
                <Separator />
                <CardContent className="min-h-0 flex-1 overflow-auto p-0">
                  {history.length ? (
                    <Table><TableHeader className="sticky top-0 z-10 bg-card"><TableRow><TableHead className="pl-6">Shot</TableHead><TableHead>Club speed</TableHead><TableHead>Path</TableHead><TableHead>Tempo</TableHead><TableHead>Carry</TableHead></TableRow></TableHeader><TableBody>
                      {history.map((item) => <TableRow key={item.id} data-state={item.id === shot.id ? 'selected' : undefined}><TableCell className="pl-6 font-medium text-foreground">#{item.id}</TableCell><TableCell>{convertSpeed(item.clubSpeed).toFixed(1)} {speedUnit}</TableCell><TableCell className={item.path < 0 ? 'text-chart-3' : 'text-primary'}>{item.path > 0 ? '+' : ''}{item.path.toFixed(1)}°</TableCell><TableCell>{item.tempo ? formatTempo(item.tempo) : '—'}</TableCell><TableCell>{formatDistance(item.carry, units)}</TableCell></TableRow>)}
                    </TableBody></Table>
                  ) : <EmptyState icon={List} title="No shots yet" description="Shots recorded by your R10 will be listed here." compact />}
                </CardContent>
              </Card>
            </TabsContent>

            <TabsContent value="view" className="h-full">
              <EmptyState icon={Box} title="Shot view is coming soon" description="Trajectory, carry, and total distance will be visualized here from real R10 data." badge="In development" />
            </TabsContent>

            <TabsContent value="settings" className="h-full">
              <Card className="flex h-full min-h-0 flex-col overflow-hidden">
                <CardHeader className="shrink-0 flex-row items-center justify-between py-4 sm:px-6"><div><CardTitle className="flex items-center gap-2 text-base"><SlidersHorizontal className="size-4 text-primary" />Settings</CardTitle><CardDescription className="mt-1">Units, tee distance, voice output, and spoken metrics.</CardDescription></div><Badge variant="secondary">{enabledCount} on</Badge></CardHeader>
                <Separator />
                <CardContent className="min-h-0 flex-1 overflow-y-auto p-0">
                  <section className="flex items-center justify-between gap-3 border-b border-border px-4 py-4 sm:px-6">
                    <div>
                      <p className="text-sm font-semibold">Units</p>
                      <p className="mt-0.5 text-xs text-muted-foreground">How speeds are displayed and spoken.</p>
                    </div>
                    <ToggleGroup type="single" value={units} onValueChange={(value) => { if (value) setUnits(value as 'imperial' | 'metric') }} aria-label="Measurement units"><ToggleGroupItem value="imperial">US</ToggleGroupItem><ToggleGroupItem value="metric">Metric</ToggleGroupItem></ToggleGroup>
                  </section>

                  <section className="flex items-center justify-between gap-3 border-b border-border px-4 py-4 sm:px-6">
                    <div>
                      <p className="text-sm font-semibold">Tee distance</p>
                      <p className="mt-0.5 text-xs text-muted-foreground">{units === 'imperial' ? 'Distance from the unit to the ball in yards.' : 'Distance from the unit to the ball in meters.'}</p>
                    </div>
                    <div className="flex items-center gap-2">
                      <Button size="icon" variant="outline" onClick={() => setTeeDistance((current) => Math.max(TEE_DISTANCE_MIN, Math.round((current - TEE_DISTANCE_STEP) * 10) / 10))} disabled={teeDistance <= TEE_DISTANCE_MIN} aria-label="Decrease tee distance"><Minus className="size-4" /></Button>
                      <span className="w-14 text-center text-sm font-semibold tabular-nums">{formatTeeDistance(teeDistance, units)}</span>
                      <Button size="icon" variant="outline" onClick={() => setTeeDistance((current) => Math.min(TEE_DISTANCE_MAX, Math.round((current + TEE_DISTANCE_STEP) * 10) / 10))} disabled={teeDistance >= TEE_DISTANCE_MAX} aria-label="Increase tee distance"><Plus className="size-4" /></Button>
                    </div>
                  </section>

                  <section className="flex items-center justify-between gap-3 border-b border-border px-4 py-4 sm:px-6">
                    <div>
                      <p className="text-sm font-semibold">Voice output</p>
                      <p className="mt-0.5 text-xs text-muted-foreground">Announce results after each swing.</p>
                    </div>
                    <Switch checked={voiceEnabled} onCheckedChange={setVoiceEnabled} aria-label="Voice output" />
                  </section>

                  <section className="px-4 py-4 sm:px-6">
                    <p className="text-sm font-semibold">Spoken metrics</p>
                    <p className="mt-0.5 text-xs text-muted-foreground">Choose what is called out after a shot.</p>
                    <div className="mt-3 grid grid-cols-2 gap-x-4 border-t border-border">
                      {(Object.keys(metricLabels) as MetricKey[]).map((key) => <label key={key} className="flex min-w-0 cursor-pointer items-center justify-between gap-2 border-b border-border py-2.5"><span className="truncate text-xs font-medium sm:text-sm">{metricLabels[key]}</span><Switch checked={enabledMetrics[key]} onCheckedChange={() => toggleMetric(key)} aria-label={`Speak ${metricLabels[key]}`} /></label>)}
                    </div>
                    <div className="mt-3 flex items-center gap-3 rounded-xl border border-primary/20 bg-accent/15 p-3">
                      <div className="flex size-9 shrink-0 items-center justify-center rounded-full bg-primary text-primary-foreground"><Volume2 className="size-4" /></div>
                      <div className="min-w-0 flex-1">
                        <p className="text-xs font-semibold">Voice preview</p>
                        <p className="line-clamp-2 text-xs leading-relaxed text-muted-foreground">{speechPreview}</p>
                      </div>
                      <Button size="icon" variant={previewSpeaking ? 'secondary' : 'default'} onClick={togglePreview} aria-label={previewSpeaking ? 'Stop preview' : 'Play preview'}>{previewSpeaking ? <Pause /> : <Play />}</Button>
                    </div>
                  </section>

                  <section className="px-4 py-4 sm:px-6">
                    <p className="text-sm font-semibold">Debug</p>
                    <p className="mt-0.5 text-xs text-muted-foreground">Copy the recent session log when something goes wrong with the R10.</p>
                    <div className="mt-3 flex items-center gap-3">
                      <Button variant="outline" size="sm" onClick={() => void copySessionLogs()} disabled={!isTauriRuntime() || copyingLogs}>
                        {copyingLogs ? 'Copying...' : 'Copy session logs'}
                      </Button>
                      {logCopyState && <span className="text-xs text-muted-foreground">{logCopyState}</span>}
                    </div>
                  </section>
                </CardContent>
              </Card>
            </TabsContent>
          </div>
        </main>

        <nav className="border-t border-border bg-background/95 px-3 pb-[max(0.65rem,env(safe-area-inset-bottom))] pt-2 backdrop-blur" aria-label="Primary navigation">
          <TabsList className="mx-auto grid h-auto w-full max-w-xl grid-cols-4 bg-transparent p-0">{tabs.map(({ id, label, icon: Icon }) => <TabsTrigger key={id} value={id} className="flex-col gap-1 rounded-xl py-1.5 text-[0.65rem] data-[state=active]:bg-accent data-[state=active]:text-accent-foreground sm:flex-row sm:py-2 sm:text-xs"><Icon />{label}</TabsTrigger>)}</TabsList>
        </nav>
      </div>

      <Dialog open={connectionOpen} onOpenChange={(open) => { if (!open) void cancelConnection(); else setConnectionOpen(true) }}>
        <DialogContent showCloseButton={!connectionBusy} onEscapeKeyDown={(event) => { if (connectionBusy) event.preventDefault() }} onPointerDownOutside={(event) => { if (connectionBusy) event.preventDefault() }}>
          <DialogHeader>
            <p className="font-mono text-[0.65rem] uppercase tracking-[0.16em] text-primary">Garmin Approach R10</p>
            <DialogTitle>{connectionTitle(connectionPhase)}</DialogTitle>
            <DialogDescription role="status" aria-live="polite">{connectionStatus}</DialogDescription>
          </DialogHeader>

          {(connectionPhase === 'scanning' || connectionPhase === 'selecting') && (
            <div className="min-h-0 space-y-3 overflow-y-auto">
              <div className="flex items-start gap-3 rounded-xl bg-muted/60 p-3 text-xs leading-relaxed text-muted-foreground">
                <Radio className="mt-0.5 size-4 shrink-0 text-primary" />
                <span>Close Garmin Golf, power on the R10, and wait for its status light to turn blue.</span>
              </div>
              {r10Devices.length ? (
                <div className="grid gap-2">
                  {r10Devices.map((device) => (
                    <button key={device.address} type="button" className="flex w-full items-center justify-between rounded-xl border border-border bg-background/50 p-4 text-left outline-none transition-colors hover:border-primary/50 hover:bg-accent/20 focus-visible:ring-2 focus-visible:ring-ring" onClick={() => void connectToDevice(device)}>
                      <span><strong className="block text-sm">{displayDeviceName(device)}</strong><small className="mt-1 block font-mono text-[0.65rem] text-muted-foreground">{device.address === preferredR10Address ? 'Previously connected' : 'Nearby device'}</small></span>
                      <span className="flex items-center gap-2 font-mono text-xs text-muted-foreground">{device.rssi ?? '—'} dBm <ArrowRight className="size-4 text-primary" /></span>
                    </button>
                  ))}
                </div>
              ) : (
                <div className="flex min-h-32 flex-col items-center justify-center gap-3 rounded-xl border border-dashed border-border text-center">
                  <LoaderCircle className="size-5 animate-spin text-primary" />
                  <p className="text-sm text-muted-foreground">Scanning nearby Bluetooth devices...</p>
                </div>
              )}
            </div>
          )}

          {connectionPhase === 'error' && !selectedDevice && (
            <Alert variant="destructive"><CircleAlert /><AlertTitle>Could not find an R10</AlertTitle><AlertDescription>{connectionError}</AlertDescription></Alert>
          )}

          {!['idle', 'scanning', 'selecting'].includes(connectionPhase) && (connectionPhase !== 'error' || selectedDevice) && (
            <div className="min-h-0 space-y-4 overflow-y-auto">
              {selectedDevice && <div className="flex items-center justify-between rounded-xl border border-primary/20 bg-primary/5 px-4 py-3"><span><strong className="block text-sm">{displayDeviceName(selectedDevice)}</strong><small className="font-mono text-[0.65rem] text-muted-foreground">Selected launch monitor</small></span><Bluetooth className="size-5 text-primary" /></div>}
              {connectionPhase !== 'error' && <div className="flex min-h-24 items-center gap-3 rounded-xl border border-border bg-background/50 px-4"><LoaderCircle className="size-5 animate-spin text-primary" /><p className="text-sm text-muted-foreground">Connecting to your R10...</p></div>}
              {connectionPhase === 'error' && <Alert variant="destructive"><CircleAlert /><AlertTitle>Connection stopped</AlertTitle><AlertDescription>{connectionError}</AlertDescription></Alert>}
            </div>
          )}

          <DialogFooter>
            {connectionPhase === 'error' ? (
              <><Button variant="ghost" onClick={() => void cancelConnection()} disabled={cleaningUp}>Cancel</Button><Button variant="outline" onClick={() => void chooseAnotherDevice()}>Choose another</Button>{selectedDevice && <Button onClick={() => void connectToDevice(selectedDevice)}>Retry connection</Button>}</>
            ) : (
              <Button variant="ghost" onClick={() => void cancelConnection()} disabled={cleaningUp}>{cleaningUp ? 'Cancelling...' : connectionBusy ? 'Cancel connection' : 'Close'}</Button>
            )}
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Tabs>
  )
}

export default App

function isTauriRuntime() {
  return Boolean((window as Window & { __TAURI_INTERNALS__?: unknown }).__TAURI_INTERNALS__)
}

function Brand() {
  return (
    <div className="flex items-center gap-3">
      <div className="flex size-10 items-center justify-center rounded-2xl bg-primary font-mono text-sm font-semibold text-primary-foreground">10</div>
      <div>
        <p className="text-base font-bold tracking-tight">range10</p>
        <p className="font-mono text-[0.58rem] uppercase tracking-[0.16em] text-muted-foreground">Range companion</p>
      </div>
    </div>
  )
}

function EmptyState({ icon: Icon, title, description, badge, compact = false }: { icon: typeof Activity; title: string; description: string; badge?: string; compact?: boolean }) {
  return (
    <div className={`flex h-full min-h-0 flex-col items-center justify-center rounded-[var(--radius)] border border-dashed border-border bg-card/50 px-6 text-center ${compact ? 'rounded-none border-0' : ''}`}>
      <div className="mb-4 flex size-14 items-center justify-center rounded-full bg-muted text-primary"><Icon className="size-6" /></div>
      {badge && <Badge variant="outline" className="mb-3 border-primary/30 text-primary">{badge}</Badge>}
      <h2 className="font-serif text-2xl sm:text-3xl">{title}</h2>
      <p className="mt-2 max-w-sm text-sm leading-relaxed text-muted-foreground">{description}</p>
    </div>
  )
}

function Metric({ label, value, tone }: { label: string; value: string; tone: string }) {
  return (
    <div className="rounded-2xl border border-border/70 bg-background/25 p-3 sm:p-4">
      <div className="flex items-center gap-2 font-mono text-[0.62rem] uppercase tracking-[0.12em] text-muted-foreground"><span className={`size-1.5 rounded-full ${tone}`} />{label}</div>
      <strong className="mt-3 block text-lg font-semibold tracking-tight">{value}</strong>
    </div>
  )
}
