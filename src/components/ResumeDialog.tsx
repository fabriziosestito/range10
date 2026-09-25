import { Button, Dialog, DialogActions, DialogBody, DialogContent, DialogSurface, DialogTitle } from '@fluentui/react-components'

import type { Session } from '@/lib/format'

type ResumeDialogProps = {
  session: Session | null
  onResume: () => void
  onClose: () => void
}

export function ResumeDialog({ session, onResume, onClose }: ResumeDialogProps) {
  if (!session) return null

  const shotCount = session.shots.length
  const timeSince = session.createdAt
    ? formatRelativeTime(session.createdAt)
    : ''

  return (
    <Dialog open={!!session} modalType="alert">
      <DialogSurface>
        <DialogBody>
          <DialogTitle>Resume session?</DialogTitle>
          <DialogContent>
            <p className="text-sm text-[var(--colorNeutralForeground2)]">
              &ldquo;{session.name}&rdquo;
            </p>
            <p className="mt-1 text-xs text-[var(--colorNeutralForeground3)]">
              {shotCount} {shotCount === 1 ? 'shot' : 'shots'} · Started {timeSince}
            </p>
          </DialogContent>
          <DialogActions>
            <Button appearance="secondary" onClick={onClose}>
              Close session
            </Button>
            <Button appearance="primary" onClick={onResume}>
              Resume
            </Button>
          </DialogActions>
        </DialogBody>
      </DialogSurface>
    </Dialog>
  )
}

function formatRelativeTime(timestamp: number): string {
  const seconds = Math.floor((Date.now() - timestamp) / 1000)
  if (seconds < 60) return 'just now'
  const minutes = Math.floor(seconds / 60)
  if (minutes < 60) return `${minutes}m ago`
  const hours = Math.floor(minutes / 60)
  if (hours < 24) return `${hours}h ago`
  const days = Math.floor(hours / 24)
  return `${days}d ago`
}
