import { useEffect, useMemo, useState } from 'react'
import { invoke } from '@tauri-apps/api/core'
import { listen } from '@tauri-apps/api/event'
import { LazyStore } from '@tauri-apps/plugin-store'
import { checkPermissions, connect as connectBle, startScan, stopScan, type BleDevice } from '@mnlphlp/plugin-blec'
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
  Pause,
  Play,
  Radio,
  Settings,
  SlidersHorizontal,
  Volume2,
} from 'lucide-react'

import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Separator } from '@/components/ui/separator'
import { Switch } from '@/components/ui/switch'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group'

type MetricKey = 'clubSpeed' | 'path' | 'face' | 'attack' | 'tempo' | 'launch' | 'ballSpeed' | 'spin'

type Tab = 'stats' | 'log' | 'view' | 'settings'

const tabs: { id: Tab; label: string; icon: typeof Activity }[] = [
  { id: 'stats', label: 'Stats', icon: Gauge },
  { id: 'log', label: 'Log', icon: List },
  { id: 'view', label: 'View', icon: Box },
  { id: 'settings', label: 'Settings', icon: Settings },
]

type Shot = {
  id: number
  clubSpeed: number
  path: number
  face: number
  attack: number
  tempo: number
  launch: number
  ballSpeed: number
  spin: number
}

type R10Shot = {
  shot_id: number
  ball?: { ball_speed: number; launch_angle: number; total_spin: number } | null
  club?: { club_head_speed: number; path_angle: number; face_angle: number; attack_angle: number } | null
  swing?: { backswing_start: number; downswing_start: number; impact: number } | null
}

type SavedPreferences = {
  preferredR10Address?: string
  enabledMetrics?: Record<MetricKey, boolean>
  voiceEnabled?: boolean
  units?: 'imperial' | 'metric'
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
}

function App() {
  const [connected, setConnected] = useState(false)
  const [scanning, setScanning] = useState(false)
  const [connectionError, setConnectionError] = useState('')
  const [connectionStatus, setConnectionStatus] = useState('Close Garmin Golf, wait for blue, then connect')
  const [r10Devices, setR10Devices] = useState<BleDevice[]>([])
  const [preferredR10Address, setPreferredR10Address] = useState('')
  const [settingsLoaded, setSettingsLoaded] = useState(false)
  const [voiceEnabled, setVoiceEnabled] = useState(true)
  const [units, setUnits] = useState<'imperial' | 'metric'>('imperial')
  const [shot, setShot] = useState<Shot>(initialShot)
  const [history, setHistory] = useState<Shot[]>([])
  const [enabledMetrics, setEnabledMetrics] = useState<Record<MetricKey, boolean>>(defaultEnabledMetrics)
  const [activeTab, setActiveTab] = useState<Tab>('stats')
  const [previewSpeaking, setPreviewSpeaking] = useState(false)

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
      } finally {
        if (active) setSettingsLoaded(true)
      }
    })()
    return () => { active = false }
  }, [])

  useEffect(() => {
    if (!settingsLoaded || !isTauriRuntime()) return
    void settingsStore.set('preferences', { preferredR10Address, enabledMetrics, voiceEnabled, units })
    void invoke('set_voice_config', { config: { voiceEnabled, metrics: enabledMetrics, units } }).catch(() => undefined)
  }, [enabledMetrics, preferredR10Address, settingsLoaded, units, voiceEnabled])

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
    let dispose: (() => void) | undefined
    void listen<R10Shot>('r10://shot', ({ payload }) => {
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
      }
      setShot(nextShot)
      setHistory((current) => [nextShot, ...current])
    }).then((unlisten) => { dispose = unlisten })
    return () => dispose?.()
  }, [])

  useEffect(() => {
    if (!(window as Window & { __TAURI_INTERNALS__?: unknown }).__TAURI_INTERNALS__) return
    let disposeError: (() => void) | undefined
    let disposeDeviceError: (() => void) | undefined
    let disposeStage: (() => void) | undefined
    void listen<string>('r10://stage', ({ payload }) => {
      const messages: Record<string, string> = {
        registered: 'BLE connected, registering Garmin R10...',
        'handshake-complete': 'Garmin handshake complete, subscribing to shots...',
        subscribed: 'Subscription ready, waking Garmin R10...',
        waking: 'R10 connected, waiting for your swing',
      }
      setConnectionStatus(messages[payload] || payload)
      if (payload === 'waking') setConnected(true)
    }).then((unlisten) => { disposeStage = unlisten })
    void listen<string>('r10://error', ({ payload }) => {
      setConnected(false)
      setScanning(false)
      setConnectionError(payload)
    }).then((unlisten) => { disposeError = unlisten })
    void listen<unknown>('r10://device-error', ({ payload }) => {
      setConnectionError(`Garmin R10 reported an error: ${JSON.stringify(payload)}`)
    }).then((unlisten) => { disposeDeviceError = unlisten })
    return () => {
      disposeError?.()
      disposeDeviceError?.()
      disposeStage?.()
    }
  }, [])

  const speedUnit = units === 'imperial' ? 'mph' : 'km/h'
  const convertSpeed = (value: number) => units === 'imperial' ? value : value * 1.60934
  const enabledCount = Object.values(enabledMetrics).filter(Boolean).length

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
    const hasGarminManufacturer = Object.keys(device.manufacturerData || {}).some((id) => Number(id) === 135)
    const hasR10Service = (device.services || []).some((service) => service.toLowerCase().includes('6a4e2800'))
    return name.includes('approach') || name.includes('garmin') || name.includes('r10') || hasGarminManufacturer || hasR10Service
  }

  const scanForR10 = async () => {
    if (scanning) return
    const isTauri = isTauriRuntime()
    if (!isTauri) {
      setScanning(true)
      setTimeout(() => { setScanning(false); setConnected(true) }, 900)
      return
    }
    setScanning(true)
    setConnectionError('')
    setConnectionStatus('Scanning for Garmin R10...')
    setR10Devices([])
    try {
      if (!await checkPermissions()) throw new Error('Bluetooth permission is required')
      let foundR10 = false
      await startScan((devices) => {
        const matches = devices.filter(isR10Device).sort((left, right) => {
          if (left.address === preferredR10Address) return -1
          if (right.address === preferredR10Address) return 1
          return right.rssi - left.rssi
        })
        setR10Devices(matches)
        if (matches.length > 0) {
          foundR10 = true
          setConnectionStatus('Approach R10 found. Select it to connect.')
        }
      }, 10000)
      // blec starts its scan task asynchronously; keep it alive for its full window.
      window.setTimeout(() => {
        void stopScan().finally(() => {
          setScanning(false)
          if (!foundR10) setConnectionError('No Garmin R10 found')
        })
      }, 10500)
    } catch (error) {
      console.error(error)
      setConnectionError(error instanceof Error ? error.message : 'Unable to scan for the Garmin R10')
      setConnected(false)
      setScanning(false)
    }
  }

  const connectToAddress = async (address: string) => {
    setScanning(true)
    setConnectionError('')
    setConnectionStatus('BLE connected, starting Garmin R10 handshake...')
    try {
      await stopScan()
      await connectBle(address, () => setConnected(false))
      await invoke('start_r10', { address })
      setPreferredR10Address(address)
      setConnectionError('')
    } catch (error) {
      setConnected(false)
      setConnectionError(error instanceof Error ? error.message : 'Unable to connect to this BLE device')
    } finally {
      setScanning(false)
    }
  }

  return (
    <Tabs value={activeTab} onValueChange={(value) => setActiveTab(value as Tab)} className="h-dvh overflow-hidden bg-[radial-gradient(circle_at_85%_-10%,rgba(73,89,64,0.28),transparent_34rem)]">
      <div className="mx-auto grid h-full w-full max-w-[1480px] grid-rows-[auto_minmax(0,1fr)_auto]">
        <header className="flex items-center justify-between border-b border-border/80 px-4 pb-3 pt-[max(0.75rem,env(safe-area-inset-top))] sm:px-7">
          <Brand />
          <Button size="sm" variant={connected ? 'secondary' : 'outline'} onClick={() => { if (!connected) void scanForR10() }} disabled={scanning || connected}>
            {scanning ? <LoaderCircle className="animate-spin" /> : connected ? <BluetoothConnected /> : <Bluetooth />}
            {connected ? 'Connected' : scanning ? 'Searching' : 'Connect'}
          </Button>
        </header>

        <main className="min-h-0 overflow-hidden p-4 sm:p-6 lg:p-8">
          <div className="mx-auto h-full max-w-6xl">
            {(connectionError || scanning) && (
              <Alert variant={connectionError ? 'destructive' : 'default'} className="mb-3 py-2.5">
                {connectionError ? <CircleAlert /> : <LoaderCircle className="animate-spin" />}
                <AlertTitle>{connectionError ? 'Connection issue' : 'Looking for your R10'}</AlertTitle>
                <AlertDescription>{connectionError || connectionStatus}</AlertDescription>
              </Alert>
            )}

            {r10Devices.length > 0 && !connected && (
              <Card className="absolute left-1/2 top-20 z-20 w-[calc(100%-2rem)] max-w-md -translate-x-1/2 border-primary/30 shadow-2xl">
                <CardHeader className="pb-3"><CardTitle className="flex items-center gap-2 text-base"><Radio className="size-4 text-primary" />Select your R10</CardTitle></CardHeader>
                <CardContent className="grid gap-2">
                  {r10Devices.map((device) => <Button key={device.address} variant="outline" className="justify-between" onClick={() => void connectToAddress(device.address)}><span>{displayDeviceName(device)}</span><span className="flex items-center gap-2 font-mono text-xs text-muted-foreground">{device.rssi} dBm <ArrowRight /></span></Button>)}
                </CardContent>
              </Card>
            )}

            <TabsContent value="stats" className="h-full">
              {shot.id ? (
                <Card className="sage-shadow relative flex h-full overflow-hidden border-primary/20 bg-[linear-gradient(145deg,var(--card),color-mix(in_srgb,var(--accent)_24%,var(--card)))]">
                  <div className="pointer-events-none absolute -right-20 -top-28 size-80 rounded-full border border-primary/10 bg-primary/5" />
                  <CardHeader className="relative flex-row items-center justify-between pb-1 sm:p-7">
                    <div><p className="font-mono text-[0.65rem] uppercase tracking-[0.16em] text-primary">Latest shot</p><CardDescription className="mt-1">Club head speed</CardDescription></div>
                    <Badge variant="outline" className="border-primary/30 font-mono text-primary">#{shot.id}</Badge>
                  </CardHeader>
                  <CardContent className="relative flex min-h-0 flex-1 flex-col justify-center pb-5 sm:px-7 sm:pb-7">
                    <div className="flex items-end gap-3"><strong className="font-serif text-[clamp(4.25rem,18vw,9rem)] font-normal leading-[0.75] tracking-[-0.08em]">{convertSpeed(shot.clubSpeed).toFixed(1)}</strong><span className="mb-1 font-mono text-sm uppercase text-primary">{speedUnit}</span></div>
                    <Separator className="my-5 sm:my-8" />
                    <div className="grid grid-cols-2 gap-2 sm:grid-cols-4 sm:gap-3">
                      <Metric label="Path" value={`${shot.path.toFixed(1)}°`} tone="bg-chart-2" />
                      <Metric label="Face" value={`${shot.face.toFixed(1)}°`} tone="bg-chart-3" />
                      <Metric label="Attack" value={`${shot.attack.toFixed(1)}°`} tone="bg-chart-4" />
                      <Metric label="Tempo" value={shot.tempo ? formatTempo(shot.tempo) : '—'} tone="bg-chart-5" />
                    </div>
                  </CardContent>
                </Card>
              ) : <EmptyState icon={Activity} title="Waiting for your first shot" description={connected ? 'Your live stats will appear here after your next swing.' : 'Connect your Approach R10, then take a shot.'} />}
            </TabsContent>

            <TabsContent value="log" className="h-full">
              <Card className="flex h-full min-h-0 flex-col overflow-hidden">
                <CardHeader className="shrink-0 flex-row items-center justify-between py-4 sm:px-6"><div><CardTitle className="text-lg">Shot log</CardTitle><CardDescription className="mt-1">{history.length ? `${history.length} shots this session` : 'This session is empty'}</CardDescription></div><Badge variant="secondary">{history.length}</Badge></CardHeader>
                <Separator />
                <CardContent className="min-h-0 flex-1 overflow-auto p-0">
                  {history.length ? (
                    <Table><TableHeader className="sticky top-0 z-10 bg-card"><TableRow><TableHead className="pl-6">Shot</TableHead><TableHead>Club speed</TableHead><TableHead>Path</TableHead><TableHead>Tempo</TableHead></TableRow></TableHeader><TableBody>
                      {history.map((item) => <TableRow key={item.id} data-state={item.id === shot.id ? 'selected' : undefined}><TableCell className="pl-6 font-medium text-foreground">#{item.id}</TableCell><TableCell>{convertSpeed(item.clubSpeed).toFixed(1)} {speedUnit}</TableCell><TableCell className={item.path < 0 ? 'text-chart-3' : 'text-primary'}>{item.path > 0 ? '+' : ''}{item.path.toFixed(1)}°</TableCell><TableCell>{item.tempo ? formatTempo(item.tempo) : '—'}</TableCell></TableRow>)}
                    </TableBody></Table>
                  ) : <EmptyState icon={List} title="No shots yet" description="Shots recorded by your R10 will be listed here." compact />}
                </CardContent>
              </Card>
            </TabsContent>

            <TabsContent value="view" className="h-full">
              <EmptyState icon={Box} title="Shot view is coming soon" description="Trajectory, carry, and total distance will be visualized here from real R10 data." badge="In development" />
            </TabsContent>

            <TabsContent value="settings" className="h-full">
              <div className="grid h-full min-h-0 gap-3 lg:grid-cols-[1.35fr_0.65fr] lg:gap-5">
                <Card className="min-h-0 overflow-hidden">
                  <CardHeader className="flex-row items-center justify-between py-4"><div><CardTitle className="flex items-center gap-2 text-base"><SlidersHorizontal className="size-4 text-primary" />Spoken metrics</CardTitle><CardDescription className="mt-1">Choose what is called out.</CardDescription></div><Badge variant="secondary">{enabledCount} on</Badge></CardHeader>
                  <CardContent className="grid grid-cols-2 gap-x-4 px-4 pb-4 sm:px-6">
                    {(Object.keys(metricLabels) as MetricKey[]).map((key) => <label key={key} className="flex min-w-0 cursor-pointer items-center justify-between gap-2 border-t border-border py-2.5"><span className="truncate text-xs font-medium sm:text-sm">{metricLabels[key]}</span><Switch checked={enabledMetrics[key]} onCheckedChange={() => toggleMetric(key)} aria-label={`Speak ${metricLabels[key]}`} /></label>)}
                  </CardContent>
                </Card>

                <div className="grid min-h-0 grid-rows-[auto_1fr] gap-3 lg:gap-5">
                  <Card><CardContent className="space-y-3 p-4"><div className="flex items-center justify-between gap-3"><span className="text-sm font-semibold">Units</span><ToggleGroup type="single" value={units} onValueChange={(value) => { if (value) setUnits(value as 'imperial' | 'metric') }} aria-label="Measurement units"><ToggleGroupItem value="imperial">US</ToggleGroupItem><ToggleGroupItem value="metric">Metric</ToggleGroupItem></ToggleGroup></div><Separator /><label className="flex cursor-pointer items-center justify-between gap-3"><span className="text-sm font-semibold">Voice output</span><Switch checked={voiceEnabled} onCheckedChange={setVoiceEnabled} aria-label="Voice output" /></label></CardContent></Card>
                  <Card className="min-h-0 border-primary/20 bg-accent/15"><CardContent className="flex h-full items-center gap-3 p-4"><div className="flex size-9 shrink-0 items-center justify-center rounded-full bg-primary text-primary-foreground"><Volume2 className="size-4" /></div><p className="line-clamp-3 min-w-0 flex-1 text-xs leading-relaxed text-muted-foreground">{speechPreview}</p><Button size="icon" variant={previewSpeaking ? 'secondary' : 'default'} onClick={togglePreview} aria-label={previewSpeaking ? 'Stop preview' : 'Play preview'}>{previewSpeaking ? <Pause /> : <Play />}</Button></CardContent></Card>
                </div>
              </div>
            </TabsContent>
          </div>
        </main>

        <nav className="border-t border-border bg-background/95 px-3 pb-[max(0.65rem,env(safe-area-inset-bottom))] pt-2 backdrop-blur" aria-label="Primary navigation">
          <TabsList className="mx-auto grid h-auto w-full max-w-xl grid-cols-4 bg-transparent p-0">{tabs.map(({ id, label, icon: Icon }) => <TabsTrigger key={id} value={id} className="flex-col gap-1 rounded-xl py-1.5 text-[0.65rem] data-[state=active]:bg-accent data-[state=active]:text-accent-foreground sm:flex-row sm:py-2 sm:text-xs"><Icon />{label}</TabsTrigger>)}</TabsList>
        </nav>
      </div>
    </Tabs>
  )
}

function formatMetric(key: MetricKey, shot: Shot, units: 'imperial' | 'metric') {
  if (key === 'tempo') return shot.tempo ? formatTempo(shot.tempo) : 'unavailable'
  if (key === 'clubSpeed' || key === 'ballSpeed') return `${(units === 'imperial' ? shot[key] : shot[key] * 1.60934).toFixed(1)} ${units === 'imperial' ? 'miles per hour' : 'kilometers per hour'}`
  if (key === 'spin') return `${shot.spin} RPM`
  return `${shot[key].toFixed(1)} degrees`
}

function calculateTempo(swing: R10Shot['swing']) {
  if (!swing) return 0
  const backswing = swing.downswing_start - swing.backswing_start
  const downswing = swing.impact - swing.downswing_start
  return backswing > 0 && downswing > 0 ? backswing / downswing : 0
}

function isTauriRuntime() {
  return Boolean((window as Window & { __TAURI_INTERNALS__?: unknown }).__TAURI_INTERNALS__)
}

function displayDeviceName(device: BleDevice) {
  const name = device.name || ''
  return name.toLowerCase().includes('approach') ? 'Approach R10' : name || 'Approach R10'
}

function formatTempo(ratio: number) {
  const rounded = Math.round(ratio * 10) / 10
  return `${Number.isInteger(rounded) ? rounded.toFixed(0) : rounded.toFixed(1)}:1`
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

export default App
