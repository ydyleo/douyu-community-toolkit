export const MEME_ARCHIVE_UPDATED_EVENT = 'xiaogui:meme-archive-updated'
export const MEME_ARCHIVE_UPDATED_STORAGE_KEY = 'xiaogui:meme-archive-updated-at'

export function notifyMemeArchiveUpdated() {
  if (!import.meta.client) return
  const revision = `${Date.now()}-${Math.random().toString(36).slice(2)}`
  localStorage.setItem(MEME_ARCHIVE_UPDATED_STORAGE_KEY, revision)
  window.dispatchEvent(new Event(MEME_ARCHIVE_UPDATED_EVENT))
}
