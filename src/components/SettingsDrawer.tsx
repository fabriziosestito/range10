import { Badge, Button, Drawer, DrawerBody, DrawerHeader, DrawerHeaderTitle, MessageBar, MessageBarBody, Radio, RadioGroup, Slider, Switch } from '@fluentui/react-components'
import { AddRegular, ArrowClockwiseRegular, DismissRegular, PauseRegular, PlayRegular, SubtractRegular } from '@fluentui/react-icons'

import { formatTeeDistance, type MetricKey } from '@/lib/format'

type AtmosphericData = {
  temp_f: number
  elevation_ft: number
  wind_mph: number
  wind_direction_deg: number
  wind_height_ft: number
  rel_humidity: number
  pressure_inhg: number
}

export type ThemePreference = 'system' | 'light' | 'dark'

type SettingsDrawerProps = {
  open: boolean
  onClose: () => void
  units: 'imperial' | 'metric'
  onUnitsChange: (units: 'imperial' | 'metric') => void
  theme: ThemePreference
  onThemeChange: (theme: ThemePreference) => void
  teeDistance: number
  teeDistanceMin: number
  teeDistanceMax: number
  onTeeDistanceStep: (direction: 1 | -1) => void
  voiceEnabled: boolean
  onVoiceEnabledChange: (enabled: boolean) => void
  metricLabels: Record<MetricKey, string>
  enabledMetrics: Record<MetricKey, boolean>
  onToggleMetric: (key: MetricKey) => void
  speechPreview: string
  previewSpeaking: boolean
  onTogglePreview: () => void
  canCopyLogs: boolean
  copyingLogs: boolean
  logCopyState: string
  onCopyLogs: () => void
  weatherMode: 'local' | 'custom'
  onWeatherModeChange: (mode: 'local' | 'custom') => void
  lastLocalAtmos: AtmosphericData | null
  effectiveAtmos: AtmosphericData
  weatherWarning: string
  onRefreshLocal: () => void
  customTempF: number
  onCustomTempFChange: (v: number) => void
  customWindMph: number
  onCustomWindMphChange: (v: number) => void
  customWindDir: number
  onCustomWindDirChange: (v: number) => void
  customHumidity: number
  onCustomHumidityChange: (v: number) => void
  customPressure: number
  onCustomPressureChange: (v: number) => void
}

export function SettingsDrawer(props: SettingsDrawerProps) {
  const {
    open, onClose, units, onUnitsChange, theme, onThemeChange,
    teeDistance, teeDistanceMin, teeDistanceMax, onTeeDistanceStep,
    voiceEnabled, onVoiceEnabledChange, metricLabels, enabledMetrics, onToggleMetric,
    speechPreview, previewSpeaking, onTogglePreview,
    canCopyLogs, copyingLogs, logCopyState, onCopyLogs,
    weatherMode, onWeatherModeChange, lastLocalAtmos, effectiveAtmos, weatherWarning, onRefreshLocal,
    customTempF, onCustomTempFChange, customWindMph, onCustomWindMphChange, customWindDir, onCustomWindDirChange,
    customHumidity, onCustomHumidityChange, customPressure, onCustomPressureChange,
  } = props
  const enabledCount = Object.values(enabledMetrics).filter(Boolean).length

  return (
    <Drawer type="overlay" modalType="non-modal" position="end" open={open} onOpenChange={(_, data) => { if (!data.open) onClose() }} style={{ width: 'min(26rem, 100vw)' }}>
      <DrawerHeader className="pt-[max(0.5rem,env(safe-area-inset-top))]">
        <DrawerHeaderTitle action={<Button appearance="subtle" aria-label="Close settings" icon={<DismissRegular />} onClick={onClose} />}>
          Settings
        </DrawerHeaderTitle>
      </DrawerHeader>
      <DrawerBody className="pb-[max(1rem,env(safe-area-inset-bottom))]">
        <section className="flex items-center justify-between gap-3 border-b border-[var(--colorNeutralStroke2)] py-3.5">
          <div>
            <p className="text-sm font-semibold">Units</p>
            <p className="mt-0.5 text-xs text-[var(--colorNeutralForeground3)]">How speeds are displayed and spoken.</p>
          </div>
          <RadioGroup layout="horizontal" value={units} onChange={(_, data) => onUnitsChange(data.value as 'imperial' | 'metric')} aria-label="Measurement units">
            <Radio value="imperial" label="US" />
            <Radio value="metric" label="Metric" />
          </RadioGroup>
        </section>

        <section className="flex items-center justify-between gap-3 border-b border-[var(--colorNeutralStroke2)] py-3.5">
          <p className="text-sm font-semibold">Theme</p>
          <RadioGroup layout="horizontal" value={theme} onChange={(_, data) => onThemeChange(data.value as ThemePreference)} aria-label="Theme">
            <Radio value="system" label="System" />
            <Radio value="light" label="Light" />
            <Radio value="dark" label="Dark" />
          </RadioGroup>
        </section>

        <section className="flex items-center justify-between gap-3 border-b border-[var(--colorNeutralStroke2)] py-3.5">
          <div>
            <p className="text-sm font-semibold">Tee distance</p>
            <p className="mt-0.5 text-xs text-[var(--colorNeutralForeground3)]">{units === 'imperial' ? 'Distance from the unit to the ball in yards.' : 'Distance from the unit to the ball in meters.'}</p>
          </div>
          <div className="flex items-center gap-1">
            <Button size="small" icon={<SubtractRegular />} onClick={() => onTeeDistanceStep(-1)} disabled={teeDistance <= teeDistanceMin} aria-label="Decrease tee distance" />
            <span className="w-14 text-center text-sm font-semibold tabular-nums">{formatTeeDistance(teeDistance, units)}</span>
            <Button size="small" icon={<AddRegular />} onClick={() => onTeeDistanceStep(1)} disabled={teeDistance >= teeDistanceMax} aria-label="Increase tee distance" />
          </div>
        </section>

        <section className="py-3.5">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-semibold">Weather</p>
              <p className="mt-0.5 text-xs text-[var(--colorNeutralForeground3)]">Local uses Open-Meteo via location; Custom tweaks local.</p>
            </div>
            <Button size="small" appearance="subtle" icon={<ArrowClockwiseRegular />} onClick={onRefreshLocal} aria-label="Refresh local weather" />
          </div>
          <RadioGroup layout="horizontal" value={weatherMode} onChange={(_, data) => onWeatherModeChange(data.value as 'local' | 'custom')} aria-label="Weather mode" className="mt-2">
            <Radio value="local" label="Local" />
            <Radio value="custom" label="Custom" />
          </RadioGroup>
          {weatherWarning && (
            <MessageBar intent="warning" className="mt-2">
              <MessageBarBody>{weatherWarning}</MessageBarBody>
            </MessageBar>
          )}
          <div className="mt-2 grid gap-2 text-xs">
            <div className="flex justify-between text-[var(--colorNeutralForeground3)]">
              <span>Elevation</span>
              <span className="tabular-nums">{effectiveAtmos.elevation_ft.toFixed(0)} ft · auto</span>
            </div>
            {lastLocalAtmos && weatherMode === 'local' && (
              <div className="flex justify-between text-[var(--colorNeutralForeground3)]">
                <span>Local</span>
                <span className="tabular-nums">{lastLocalAtmos.temp_f.toFixed(0)}°F · {lastLocalAtmos.wind_mph.toFixed(0)} mph · {lastLocalAtmos.rel_humidity.toFixed(0)}% · {lastLocalAtmos.pressure_inhg.toFixed(2)} inHg</span>
              </div>
            )}
          </div>
          {weatherMode === 'custom' && (
            <div className="mt-3 grid gap-4">
              <div className="w-full">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-medium">Temperature {(((customTempF - 32) * 5 / 9).toFixed(0))}°C / {customTempF.toFixed(0)}°F</span>
                </div>
                <Slider className="w-full" style={{ width: '100%' }} min={14} max={131} step={1} value={customTempF} onChange={(_, data) => onCustomTempFChange(data.value)} aria-label="Custom temperature" />
                <div className="flex justify-between text-[0.62rem] text-[var(--colorNeutralForeground3)]"><span>-10°C</span><span>55°C</span></div>
              </div>
              <div className="w-full">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-medium">Wind {customWindMph.toFixed(0)} mph</span>
                </div>
                <Slider className="w-full" style={{ width: '100%' }} min={0} max={50} step={1} value={customWindMph} onChange={(_, data) => onCustomWindMphChange(data.value)} aria-label="Custom wind speed" />
              </div>
              <div className="w-full">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-medium">Wind dir {customWindDir.toFixed(0)}°</span>
                </div>
                <Slider className="w-full" style={{ width: '100%' }} min={0} max={359} step={1} value={customWindDir} onChange={(_, data) => onCustomWindDirChange(data.value)} aria-label="Custom wind direction" />
              </div>
              <div className="w-full">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-medium">Humidity {customHumidity.toFixed(0)}%</span>
                </div>
                <Slider className="w-full" style={{ width: '100%' }} min={0} max={100} step={1} value={customHumidity} onChange={(_, data) => onCustomHumidityChange(data.value)} aria-label="Custom humidity" />
              </div>
              <div className="w-full">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-medium">Pressure {customPressure.toFixed(2)} inHg</span>
                </div>
                <Slider className="w-full" style={{ width: '100%' }} min={28} max={32} step={0.05} value={customPressure} onChange={(_, data) => onCustomPressureChange(data.value)} aria-label="Custom pressure" />
              </div>
            </div>
          )}
        </section>

        <section className="flex items-center justify-between gap-3 border-b border-[var(--colorNeutralStroke2)] py-3.5">
          <div>
            <p className="text-sm font-semibold">Voice output</p>
            <p className="mt-0.5 text-xs text-[var(--colorNeutralForeground3)]">Announce results after each swing.</p>
          </div>
          <Switch checked={voiceEnabled} onChange={(_, data) => onVoiceEnabledChange(data.checked)} aria-label="Voice output" />
        </section>

        <section className="py-3.5">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-semibold">Spoken metrics</p>
              <p className="mt-0.5 text-xs text-[var(--colorNeutralForeground3)]">Choose what is called out after a shot.</p>
            </div>
            <Badge appearance="tint">{enabledCount} on</Badge>
          </div>
          <div className="mt-2 grid grid-cols-1 gap-x-4">
            {(Object.keys(metricLabels) as MetricKey[]).map((key) => (
              <label key={key} className="flex min-w-0 cursor-pointer items-center justify-between gap-2 border-b border-[var(--colorNeutralStroke2)] py-1">
                <span className="truncate text-xs font-medium sm:text-sm">{metricLabels[key]}</span>
                <Switch checked={enabledMetrics[key]} onChange={() => onToggleMetric(key)} aria-label={`Speak ${metricLabels[key]}`} />
              </label>
            ))}
          </div>
          <div className="mt-3 flex items-center gap-3 rounded-lg border border-[var(--colorBrandStroke2)] bg-[var(--colorBrandBackground2)] p-3">
            <div className="min-w-0 flex-1">
              <p className="text-xs font-semibold">Voice preview</p>
              <p className="line-clamp-2 text-xs leading-relaxed text-[var(--colorNeutralForeground3)]">{speechPreview}</p>
            </div>
            <Button appearance={previewSpeaking ? 'secondary' : 'primary'} icon={previewSpeaking ? <PauseRegular /> : <PlayRegular />} onClick={onTogglePreview} aria-label={previewSpeaking ? 'Stop preview' : 'Play preview'} />
          </div>
        </section>

        <section className="py-3.5">
          <p className="text-sm font-semibold">Debug</p>
          <p className="mt-0.5 text-xs text-[var(--colorNeutralForeground3)]">Copy the recent session log when something goes wrong with the R10.</p>
          <div className="mt-3 flex items-center gap-3">
            <Button size="small" onClick={onCopyLogs} disabled={!canCopyLogs || copyingLogs}>
              {copyingLogs ? 'Copying...' : 'Copy session logs'}
            </Button>
            {logCopyState && <span className="text-xs text-[var(--colorNeutralForeground3)]">{logCopyState}</span>}
          </div>
        </section>
      </DrawerBody>
    </Drawer>
  )
}
