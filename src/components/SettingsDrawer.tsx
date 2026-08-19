import { Badge, Button, Drawer, DrawerBody, DrawerHeader, DrawerHeaderTitle, Radio, RadioGroup, Switch } from '@fluentui/react-components'
import { AddRegular, DismissRegular, PauseRegular, PlayRegular, SubtractRegular } from '@fluentui/react-icons'

import { formatTeeDistance, type MetricKey } from '@/lib/format'

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
}

export function SettingsDrawer(props: SettingsDrawerProps) {
  const {
    open, onClose, units, onUnitsChange, theme, onThemeChange,
    teeDistance, teeDistanceMin, teeDistanceMax, onTeeDistanceStep,
    voiceEnabled, onVoiceEnabledChange, metricLabels, enabledMetrics, onToggleMetric,
    speechPreview, previewSpeaking, onTogglePreview,
    canCopyLogs, copyingLogs, logCopyState, onCopyLogs,
  } = props
  const enabledCount = Object.values(enabledMetrics).filter(Boolean).length

  return (
    <Drawer type="overlay" position="end" open={open} onOpenChange={(_, data) => { if (!data.open) onClose() }} style={{ width: 'min(26rem, 100vw)' }}>
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
