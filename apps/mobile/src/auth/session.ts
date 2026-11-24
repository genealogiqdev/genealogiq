import { create } from 'zustand'
import { SYSTEMS, type SystemId } from '@/config'
import { plainStorage, secureStorage } from '@/lib/storage'
import { isLiveSession, toStoredSession, type SessionUser, type StoredSession } from './session-shape'

export type { SessionUser, StoredSession } from './session-shape'

interface SessionState {
  /** False until the stored sessions have been read at start-up. */
  ready: boolean
  /** One independent session per system; they never share a token. */
  sessions: Partial<Record<SystemId, StoredSession>>
  /** The system the user is currently working in. */
  active: SystemId | null
  /** The system chosen on the sign-in screen. */
  selected: SystemId
  hydrate: () => Promise<void>
  select: (system: SystemId) => void
  signIn: (system: SystemId, session: StoredSession) => Promise<void>
  signOut: (system: SystemId) => Promise<void>
  switchTo: (system: SystemId) => Promise<void>
  updateUser: (system: SystemId, patch: Partial<SessionUser>) => Promise<void>
}

const sessionKey = (system: SystemId) => `gq.session.${system}`
const ACTIVE_KEY = 'gq.activeSystem'

const isLive = (session: StoredSession | null | undefined): session is StoredSession => isLiveSession(session)

export const useSession = create<SessionState>((set, get) => ({
  ready: false,
  sessions: {},
  active: null,
  selected: 'app',

  async hydrate() {
    const sessions: Partial<Record<SystemId, StoredSession>> = {}
    for (const system of SYSTEMS) {
      const raw = await secureStorage.get(sessionKey(system))
      if (!raw) continue
      try {
        const parsed = toStoredSession(JSON.parse(raw))
        if (isLive(parsed)) sessions[system] = parsed
        else await secureStorage.remove(sessionKey(system))
      } catch {
        await secureStorage.remove(sessionKey(system))
      }
    }
    const storedActive = await plainStorage.get<SystemId>(ACTIVE_KEY)
    const active = storedActive && sessions[storedActive] ? storedActive : (SYSTEMS.find((s) => sessions[s]) ?? null)
    // The sign-in screen always opens on Genealogiq; a link may preselect another system.
    set({ sessions, active, selected: active ?? 'app', ready: true })
  },

  select(system) {
    set({ selected: system })
  },

  async signIn(system, candidate) {
    // Never mark a system signed in without a usable token: a server that does
    // not run the mobile API can answer with something that is not a session.
    const session = toStoredSession(candidate)
    if (!isLive(session)) throw new Error('invalid session')
    await secureStorage.set(sessionKey(system), JSON.stringify(session))
    await plainStorage.set(ACTIVE_KEY, system)
    set((state) => ({ sessions: { ...state.sessions, [system]: session }, active: system, selected: system }))
  },

  async signOut(system) {
    await secureStorage.remove(sessionKey(system))
    const sessions = { ...get().sessions }
    delete sessions[system]
    const active = get().active === system ? null : get().active
    if (active) await plainStorage.set(ACTIVE_KEY, active)
    else await plainStorage.remove(ACTIVE_KEY)
    set({ sessions, active, selected: system })
  },

  async switchTo(system) {
    if (!get().sessions[system]) {
      get().select(system)
      set({ active: null })
      await plainStorage.remove(ACTIVE_KEY)
      return
    }
    await plainStorage.set(ACTIVE_KEY, system)
    set({ active: system, selected: system })
  },

  async updateUser(system, patch) {
    const current = get().sessions[system]
    if (!current) return
    const next = { ...current, user: { ...current.user, ...patch } }
    await secureStorage.set(sessionKey(system), JSON.stringify(next))
    set((state) => ({ sessions: { ...state.sessions, [system]: next } }))
  },
}))

export function tokenFor(system: SystemId): string | null {
  const session = useSession.getState().sessions[system]
  return isLive(session) ? session.token : null
}

/** The signed-in user of one system (null when signed out). */
export function useSessionUser(system: SystemId): SessionUser | null {
  return useSession((state) => state.sessions[system]?.user ?? null)
}
