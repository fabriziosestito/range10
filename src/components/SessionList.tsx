import { useState } from 'react'
import { Badge, Button, Input, Table, TableBody, TableCell, TableHeader, TableHeaderCell, TableRow, Tooltip } from '@fluentui/react-components'
import { ArrowDownloadRegular, DeleteRegular, DocumentArrowDownRegular, FolderOpenRegular, PenRegular } from '@fluentui/react-icons'

import type { Session } from '@/lib/format'

type SessionListProps = {
  sessions: Session[]
  activeSessionId: string | null
  units: 'imperial' | 'metric'
  onResume: (id: string) => void
  onRename: (id: string, name: string) => void
  onDelete: (id: string) => void
  onExport: (session: Session) => void
  onExportAll: () => void
  onImport: () => void
}

export function SessionList({
  sessions,
  activeSessionId,
  onResume,
  onRename,
  onDelete,
  onExport,
  onExportAll,
  onImport,
}: SessionListProps) {
  const [editingId, setEditingId] = useState<string | null>(null)
  const [editName, setEditName] = useState('')

  const startRename = (session: Session) => {
    setEditingId(session.id)
    setEditName(session.name)
  }

  const commitRename = () => {
    if (editingId && editName.trim()) {
      onRename(editingId, editName.trim())
    }
    setEditingId(null)
    setEditName('')
  }

  const sorted = [...sessions].sort((a, b) => b.createdAt - a.createdAt)

  return (
    <div className="flex h-full min-h-0 flex-col gap-2">
      <div className="flex items-center justify-between gap-2">
        <p className="text-sm font-semibold tracking-tight">Sessions</p>
        <div className="flex items-center gap-1">
          <Button size="small" appearance="subtle" icon={<FolderOpenRegular />} onClick={onImport} aria-label="Import sessions">
            Import
          </Button>
          <Button size="small" appearance="subtle" icon={<DocumentArrowDownRegular />} onClick={onExportAll} disabled={sessions.length === 0} aria-label="Export all sessions">
            Export all
          </Button>
        </div>
      </div>

      {sorted.length === 0 ? (
        <div className="flex flex-1 items-center justify-center rounded-md border border-[var(--colorNeutralStroke2)] p-6 text-center text-sm text-[var(--colorNeutralForeground3)]">
          No sessions yet. Take a shot to start one.
        </div>
      ) : (
        <div className="min-h-0 flex-1 overflow-auto rounded-md border border-[var(--colorNeutralStroke2)]">
          <Table size="small" aria-label="Session list">
            <TableHeader className="sticky top-0 z-10 bg-[var(--colorNeutralBackground1)]">
              <TableRow>
                <TableHeaderCell className="pl-3">Name</TableHeaderCell>
                <TableHeaderCell>Shots</TableHeaderCell>
                <TableHeaderCell>Status</TableHeaderCell>
                <TableHeaderCell />
              </TableRow>
            </TableHeader>
            <TableBody>
              {sorted.map((session) => {
                const isActive = session.id === activeSessionId
                return (
                  <TableRow key={session.id} appearance={isActive ? 'brand' : 'none'}>
                    <TableCell className="pl-3">
                      {editingId === session.id ? (
                        <Input
                          size="small"
                          value={editName}
                          onChange={(_, data) => setEditName(data.value)}
                          onBlur={commitRename}
                          onKeyDown={(e) => { if (e.key === 'Enter') commitRename(); if (e.key === 'Escape') setEditingId(null) }}
                          autoFocus
                          className="max-w-[12rem]"
                        />
                      ) : (
                        <span className="text-sm font-medium">{session.name}</span>
                      )}
                    </TableCell>
                    <TableCell>
                      <span className="tabular-nums text-xs">{session.shots.length}</span>
                    </TableCell>
                    <TableCell>
                      <Badge appearance="tint" color={isActive ? 'brand' : 'informative'} size="small">
                        {isActive ? 'Active' : 'Closed'}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      <div className="flex items-center gap-0.5">
                        {isActive && (
                          <Tooltip content="Resume" relationship="label">
                            <Button size="small" appearance="subtle" onClick={() => onResume(session.id)} aria-label="Resume session">
                              Resume
                            </Button>
                          </Tooltip>
                        )}
                        <Tooltip content="Rename" relationship="label">
                          <Button size="small" appearance="subtle" icon={<PenRegular />} onClick={() => startRename(session)} aria-label="Rename session" />
                        </Tooltip>
                        <Tooltip content="Export CSV" relationship="label">
                          <Button size="small" appearance="subtle" icon={<ArrowDownloadRegular />} onClick={() => onExport(session)} aria-label="Export session" />
                        </Tooltip>
                        {!isActive && (
                          <Tooltip content="Delete" relationship="label">
                            <Button size="small" appearance="subtle" icon={<DeleteRegular />} onClick={() => onDelete(session.id)} aria-label="Delete session" />
                          </Tooltip>
                        )}
                      </div>
                    </TableCell>
                  </TableRow>
                )
              })}
            </TableBody>
          </Table>
        </div>
      )}
    </div>
  )
}
