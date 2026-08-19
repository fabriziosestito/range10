import { Button, Dialog, DialogActions, DialogBody, DialogContent, DialogSurface, DialogTitle, MessageBar, MessageBarBody, MessageBarTitle, Spinner } from '@fluentui/react-components'
import { ArrowRightRegular, BluetoothRegular } from '@fluentui/react-icons'
import type { BleDevice } from '@mnlphlp/plugin-blec'

import { connectionTitle, displayDeviceName, type ConnectionPhase } from '@/lib/format'

type ConnectDialogProps = {
  open: boolean
  phase: ConnectionPhase
  status: string
  error: string
  devices: BleDevice[]
  selectedDevice: BleDevice | null
  preferredAddress: string
  busy: boolean
  cleaningUp: boolean
  onCancel: () => void
  onChooseAnother: () => void
  onConnectDevice: (device: BleDevice) => void
}

export function ConnectDialog(props: ConnectDialogProps) {
  const { open, phase, status, error, devices, selectedDevice, preferredAddress, busy, cleaningUp, onCancel, onChooseAnother, onConnectDevice } = props

  return (
    <Dialog open={open} modalType="alert" onOpenChange={(_, data) => { if (!data.open && !busy) onCancel() }}>
      <DialogSurface className="max-w-md">
        <DialogBody>
          <DialogTitle>
            <span className="block text-[0.62rem] uppercase tracking-[0.16em] text-[var(--colorBrandForeground1)]">Garmin Approach R10</span>
            {connectionTitle(phase)}
          </DialogTitle>
          <DialogContent>
            <p role="status" aria-live="polite" className="text-sm text-[var(--colorNeutralForeground3)]">{status}</p>

            {(phase === 'scanning' || phase === 'selecting') && (
              <div className="mt-3 min-h-0 space-y-3 overflow-y-auto">
                <div className="flex items-start gap-3 rounded-lg bg-[var(--colorNeutralBackground3)] p-3 text-xs leading-relaxed text-[var(--colorNeutralForeground3)]">
                  <BluetoothRegular className="mt-0.5 size-4 shrink-0 text-[var(--colorBrandForeground1)]" />
                  <span>Close Garmin Golf, power on the R10, and wait for its status light to turn blue.</span>
                </div>
                {devices.length ? (
                  <div className="grid gap-2">
                    {devices.map((device) => (
                      <button
                        key={device.address}
                        type="button"
                        className="flex w-full items-center justify-between rounded-lg border border-[var(--colorNeutralStroke2)] bg-[var(--colorNeutralBackground2)] p-3 text-left outline-none transition-colors hover:border-[var(--colorBrandStroke1)] focus-visible:ring-2 focus-visible:ring-[var(--colorBrandStroke1)]"
                        onClick={() => onConnectDevice(device)}
                      >
                        <span>
                          <strong className="block text-sm">{displayDeviceName(device)}</strong>
                          <small className="mt-1 block text-[0.62rem] text-[var(--colorNeutralForeground3)]">
                            {device.address === preferredAddress ? 'Previously connected' : 'Nearby device'}
                          </small>
                        </span>
                        <span className="flex items-center gap-2 text-xs tabular-nums text-[var(--colorNeutralForeground3)]">
                          {device.rssi ?? '—'} dBm <ArrowRightRegular className="size-4 text-[var(--colorBrandForeground1)]" />
                        </span>
                      </button>
                    ))}
                  </div>
                ) : (
                  <div className="flex min-h-28 flex-col items-center justify-center gap-3 rounded-lg border border-dashed border-[var(--colorNeutralStroke2)] text-center">
                    <Spinner size="small" label="Scanning nearby Bluetooth devices..." labelPosition="below" />
                  </div>
                )}
              </div>
            )}

            {phase === 'error' && !selectedDevice && (
              <MessageBar intent="error" className="mt-3">
                <MessageBarBody>
                  <MessageBarTitle>Could not find an R10</MessageBarTitle>
                  {error}
                </MessageBarBody>
              </MessageBar>
            )}

            {!['idle', 'scanning', 'selecting'].includes(phase) && (phase !== 'error' || selectedDevice) && (
              <div className="mt-3 min-h-0 space-y-3 overflow-y-auto">
                {selectedDevice && (
                  <div className="flex items-center justify-between rounded-lg border border-[var(--colorBrandStroke2)] bg-[var(--colorBrandBackground2)] px-4 py-3">
                    <span>
                      <strong className="block text-sm">{displayDeviceName(selectedDevice)}</strong>
                      <small className="text-[0.62rem] text-[var(--colorNeutralForeground3)]">Selected launch monitor</small>
                    </span>
                    <BluetoothRegular className="size-5 text-[var(--colorBrandForeground1)]" />
                  </div>
                )}
                {phase !== 'error' && (
                  <div className="flex min-h-20 items-center justify-center rounded-lg border border-[var(--colorNeutralStroke2)] bg-[var(--colorNeutralBackground2)] px-4">
                    <Spinner size="small" label="Connecting to your R10..." />
                  </div>
                )}
                {phase === 'error' && (
                  <MessageBar intent="error">
                    <MessageBarBody>
                      <MessageBarTitle>Connection stopped</MessageBarTitle>
                      {error}
                    </MessageBarBody>
                  </MessageBar>
                )}
              </div>
            )}
          </DialogContent>
          <DialogActions>
            {phase === 'error' ? (
              <>
                <Button appearance="subtle" onClick={onCancel} disabled={cleaningUp}>Cancel</Button>
                <Button appearance="secondary" onClick={onChooseAnother}>Choose another</Button>
                {selectedDevice && <Button appearance="primary" onClick={() => onConnectDevice(selectedDevice)}>Retry connection</Button>}
              </>
            ) : (
              <Button appearance="subtle" onClick={onCancel} disabled={cleaningUp}>
                {cleaningUp ? 'Cancelling...' : busy ? 'Cancel connection' : 'Close'}
              </Button>
            )}
          </DialogActions>
        </DialogBody>
      </DialogSurface>
    </Dialog>
  )
}
