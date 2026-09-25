import { LazyStore } from '@tauri-apps/plugin-store'

import type { Session } from './format'

const store = new LazyStore('sessions.json')

export async function loadSessions(): Promise<Session[]> {
  return (await store.get<Session[]>('sessions')) ?? []
}

export async function saveSessions(sessions: Session[]): Promise<void> {
  await store.set('sessions', sessions)
}

export async function loadActiveSessionId(): Promise<string | null> {
  return (await store.get<string | null>('activeSessionId')) ?? null
}

export async function saveActiveSessionId(id: string | null): Promise<void> {
  await store.set('activeSessionId', id)
}
