import { save, open } from '@tauri-apps/plugin-dialog'
import { writeTextFile, readFile, writeFile } from '@tauri-apps/plugin-fs'
import { zipSync, strToU8, unzipSync, strFromU8 } from 'fflate'

import type { Session } from './format'
import { sessionToCsv } from './csv'

function isMobile(): boolean {
  return /iPhone|iPad|iPod|Android/i.test(navigator.userAgent)
}

function sessionFilename(session: Session): string {
  return `${session.name.replace(/[^a-zA-Z0-9 _-]/g, '_')}.csv`
}

export async function exportSession(session: Session, units: 'imperial' | 'metric'): Promise<void> {
  const csv = sessionToCsv(session, units)
  const filename = sessionFilename(session)

  if (isMobile()) {
    await writeTextFile(filename, csv)
    return
  }

  const path = await save({
    defaultPath: filename,
    filters: [{ name: 'CSV', extensions: ['csv'] }],
  })
  if (path) await writeTextFile(path, csv)
}

export async function exportAllSessions(sessions: Session[], units: 'imperial' | 'metric'): Promise<void> {
  const files: Record<string, Uint8Array> = {}
  for (const session of sessions) {
    files[sessionFilename(session)] = strToU8(sessionToCsv(session, units))
  }
  const zipped = zipSync(files)
  const filename = 'range10-sessions.zip'

  if (isMobile()) {
    await writeFile(filename, zipped)
    return
  }

  const path = await save({
    defaultPath: filename,
    filters: [{ name: 'ZIP', extensions: ['zip'] }],
  })
  if (path) await writeFile(path, zipped)
}

function parseCsvToSession(csv: string, fallbackId: string, fallbackName: string): Session | null {
  const lines = csv.trim().split('\n')
  if (lines.length < 2) return null

  const shots = lines.slice(1).map((line) => {
    const cols = line.split(',')
    return {
      id: Number(cols[0]) || 0,
      club: cols[1] || 'Driver',
      airSwing: cols[2] === 'Air',
      clubSpeed: Number(cols[3]) || 0,
      path: Number(cols[4]) || 0,
      face: Number(cols[5]) || 0,
      attack: Number(cols[6]) || 0,
      tempo: Number(cols[7]) || 0,
      backswingTime: Number(cols[8]) || 0,
      downswingTime: Number(cols[9]) || 0,
      launch: Number(cols[10]) || 0,
      ballSpeed: Number(cols[11]) || 0,
      spin: Number(cols[12]) || 0,
      carry: Number(cols[13]) || 0,
      total: Number(cols[14]) || 0,
      launchDirection: Number(cols[15]) || 0,
      spinAxis: Number(cols[16]) || 0,
      backspin: Number(cols[17]) || 0,
      sidespin: Number(cols[18]) || 0,
      apex: Number(cols[19]) || 0,
      timeOfFlight: Number(cols[20]) || 0,
      offline: Number(cols[21]) || 0,
      carryOffline: Number(cols[22]) || 0,
      carryDeviationDeg: Number(cols[23]) || 0,
      totalDeviationDeg: Number(cols[24]) || 0,
    }
  })

  return {
    id: fallbackId,
    name: fallbackName,
    createdAt: Date.now(),
    closedAt: Date.now(),
    shots,
  }
}

export async function importSessions(): Promise<Session[]> {
  const selected = await open({
    multiple: false,
    filters: [{ name: 'ZIP', extensions: ['zip'] }],
  })
  if (!selected || typeof selected !== 'string') return []

  const data = await readFile(selected)
  const unzipped = unzipSync(new Uint8Array(data))
  const imported: Session[] = []

  for (const [filename, contents] of Object.entries(unzipped)) {
    const name = filename.replace(/\.csv$/i, '')
    const csv = strFromU8(contents)
    const session = parseCsvToSession(csv, crypto.randomUUID(), name)
    if (session && session.shots.length > 0) imported.push(session)
  }

  return imported
}
