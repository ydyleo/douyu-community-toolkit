import type { Meme } from '#shared/types/meme'

export type LocalArchiveState = {
  submissions: Meme[]
  copyCounts: Record<string, number>
  likedIds: string[]
}

export interface MemeRepository {
  loadLocalState(): LocalArchiveState
  saveLocalState(state: LocalArchiveState): void
}

const keys = {
  submissions: 'meme-archive:submissions',
  copyCounts: 'meme-archive:copies',
  likedIds: 'meme-archive:likes',
} as const

function readJson<T>(key: string, fallback: T): T {
  try {
    const value = localStorage.getItem(key)
    return value ? (JSON.parse(value) as T) : fallback
  } catch {
    return fallback
  }
}

export const localMemeRepository: MemeRepository = {
  loadLocalState() {
    return {
      submissions: readJson(keys.submissions, []),
      copyCounts: readJson(keys.copyCounts, {}),
      likedIds: readJson(keys.likedIds, []),
    }
  },
  saveLocalState(state) {
    localStorage.setItem(keys.submissions, JSON.stringify(state.submissions))
    localStorage.setItem(keys.copyCounts, JSON.stringify(state.copyCounts))
    localStorage.setItem(keys.likedIds, JSON.stringify(state.likedIds))
  },
}
