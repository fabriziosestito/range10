import { Badge, Button, Drawer, DrawerBody, DrawerHeader, DrawerHeaderTitle, MessageBar, MessageBarBody, Radio, RadioGroup, Slider, Switch } from '@fluentui/react-components'
import { AddRegular, ArrowClockwiseRegular, CompassNorthwestRegular, DismissRegular, DropRegular, GaugeRegular, LocationRegular, MountainTrailRegular, PauseRegular, PlayRegular, SubtractRegular, TemperatureRegular, WeatherSquallsRegular } from '@fluentui/react-icons'

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
  lastLocalPlace: string
  lastLocalAt: number
  weatherWarning: string
  onRefreshLocal: () => void
  customTempF: number
  onCustomTempFChange: (v: number) => void
  customElevationFt: number
  onCustomElevationFtChange: (v: number) => void
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
    weatherMode, onWeatherModeChange, lastLocalAtmos, lastLocalPlace, lastLocalAt, weatherWarning, onRefreshLocal,
    customTempF, onCustomTempFChange, customElevationFt, onCustomElevationFtChange, customWindMph, onCustomWindMphChange, customWindDir, onCustomWindDirChange,
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
          {weatherMode === 'local' && lastLocalAtmos && (
            <div className="mt-2 rounded-lg border border-[var(--colorNeutralStroke2)] bg-[var(--colorNeutralBackground2)] p-3">
              <div className="flex items-center gap-2 text-xs font-semibold">
                <LocationRegular className="text-[var(--colorBrandForeground1)]" />
                <span>Your location</span>
                <span className="ml-auto font-normal tabular-nums text-[var(--colorNeutralForeground3)]">
                  {lastLocalPlace}{lastLocalAt ? ` · ${new Date(lastLocalAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}` : ''}
                </span>
              </div>
              <div className="mt-1.5 flex flex-wrap gap-x-4 gap-y-1 text-xs tabular-nums text-[var(--colorNeutralForeground3)]">
                <span>{lastLocalAtmos.temp_f.toFixed(0)}°F</span>
                <span>{lastLocalAtmos.wind_mph.toFixed(0)} mph @ {lastLocalAtmos.wind_direction_deg.toFixed(0)}°</span>
                <span>{lastLocalAtmos.rel_humidity.toFixed(0)}%</span>
                <span>{lastLocalAtmos.elevation_ft.toFixed(0)} ft</span>
                <span>{lastLocalAtmos.pressure_inhg.toFixed(2)} inHg</span>
              </div>
            </div>
          )}
          {weatherMode === 'custom' && (
            <div className="mt-3 grid gap-1">
              <WeatherSliderRow
                icon={<MountainTrailRegular />}
                label="Altitude"
                valueText={`${customElevationFt.toFixed(0)} ft`}
                min={0}
                max={5000}
                step={50}
                value={customElevationFt}
                onChange={onCustomElevationFtChange}
              />
              <WeatherSliderRow
                icon={<DropRegular />}
                label="Relative Humidity"
                valueText={`${customHumidity.toFixed(0)} %`}
                min={0}
                max={100}
                step={1}
                value={customHumidity}
                onChange={onCustomHumidityChange}
              />
              <WeatherSliderRow
                icon={<TemperatureRegular />}
                label="Temperature"
                valueText={`${customTempF.toFixed(0)}°F / ${(((customTempF - 32) * 5) / 9).toFixed(0)}°C`}
                min={14}
                max={131}
                step={1}
                value={customTempF}
                onChange={onCustomTempFChange}
              />
              <WeatherSliderRow
                icon={<WeatherSquallsRegular />}
                label="Wind"
                valueText={`${customWindMph.toFixed(0)} mph`}
                min={0}
                max={50}
                step={1}
                value={customWindMph}
                onChange={onCustomWindMphChange}
              />
              <WeatherSliderRow
                icon={<CompassNorthwestRegular />}
                label="Wind Direction"
                valueText={`${customWindDir.toFixed(0)}°`}
                min={0}
                max={359}
                step={1}
                value={customWindDir}
                onChange={onCustomWindDirChange}
              />
              <WeatherSliderRow
                icon={<GaugeRegular />}
                label="Pressure"
                valueText={`${customPressure.toFixed(2)} inHg`}
                min={28}
                max={32}
                step={0.05}
                value={customPressure}
                onChange={onCustomPressureChange}
              />
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

function WeatherSliderRow({ icon, label, valueText, min, max, step, value, onChange }: {
  icon: React.ReactNode
  label: string
  valueText: string
  min: number
  max: number
  step: number
  value: number
  onChange: (value: number) => void
}) {
  return (
    <div className="w-full border-b border-[var(--colorNeutralStroke2)] py-2 last:border-b-0">
      <div className="flex items-center gap-2">
        <span className="flex items-center text-base text-[var(--colorNeutralForeground3)]">{icon}</span>
        <span className="text-sm">{label}</span>
        <span className="ml-auto text-sm font-semibold tabular-nums">{valueText}</span>
      </div>
      <Slider
        className="!w-full"
        style={{ width: '100%' }}
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(_, data) => onChange(data.value)}
        aria-label={label}
      />
    </div>
  )
}
