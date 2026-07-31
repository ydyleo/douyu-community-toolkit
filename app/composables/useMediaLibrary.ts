import { bgmTracks as fallbackBgmTracks, emojiPacks as fallbackStickers } from '~/data/site'
import type { MediaAsset } from '#shared/types/meme'

function fallbackAsset(
  item: { title?: string, name?: string, description?: string, artist?: string, src?: string, image?: string },
  index: number,
  kind: 'sticker' | 'bgm',
): MediaAsset {
  return {
    id: `builtin-${kind}-${index}`,
    kind,
    title: item.title ?? item.name ?? `素材 ${index + 1}`,
    description: item.description,
    artist: item.artist,
    fileUrl: item.src ?? item.image ?? '',
    mimeType: kind === 'sticker' ? 'image/*' : 'audio/mpeg',
    sizeBytes: 0,
    status: 'approved',
    active: true,
    sortOrder: index,
    downloadCount: 0,
    createdAt: '',
  }
}

export function useMediaLibrary() {
  const api = useApi()
  const config = useRuntimeConfig()
  const apiBase = String(config.public.apiBase || '').replace(/\/$/, '')
  const stickers = ref<MediaAsset[]>(
    fallbackStickers.map((item, index) => fallbackAsset(item, index, 'sticker')),
  )
  const bgmTracks = ref<MediaAsset[]>(
    fallbackBgmTracks.map((item, index) => fallbackAsset(item, index, 'bgm')),
  )
  const mediaError = ref('')
  const stickerSubmitting = ref(false)

  function withResolvedUrl(item: MediaAsset) {
    const fileUrl = item.fileUrl.startsWith('/uploads/') && apiBase
      ? `${apiBase}${item.fileUrl}`
      : item.fileUrl
    return { ...item, fileUrl }
  }

  async function loadMedia() {
    mediaError.value = ''
    const [stickerResult, bgmResult] = await Promise.allSettled([
      api<{ items: MediaAsset[] }>('/api/media', { query: { kind: 'sticker' } }),
      api<{ items: MediaAsset[] }>('/api/media', { query: { kind: 'bgm' } }),
    ])
    if (stickerResult.status === 'fulfilled') {
      stickers.value = stickerResult.value.items.map(withResolvedUrl)
    }
    if (bgmResult.status === 'fulfilled') {
      bgmTracks.value = bgmResult.value.items.map(withResolvedUrl)
    }
    if (stickerResult.status === 'rejected' || bgmResult.status === 'rejected') {
      mediaError.value = '部分在线素材暂时不可用，正在显示内置内容。'
    }
  }

  async function submitSticker(input: {
    title: string
    description: string
    submitterName: string
    file: File
  }) {
    stickerSubmitting.value = true
    try {
      const body = new FormData()
      body.append('title', input.title.trim())
      body.append('description', input.description.trim())
      body.append('submitterName', input.submitterName.trim())
      body.append('file', input.file)
      return await api<{ id: string, status: 'pending' }>('/api/sticker-submissions', {
        method: 'POST',
        body,
      })
    } finally {
      stickerSubmitting.value = false
    }
  }

  async function recordStickerDownload(item: MediaAsset) {
    if (item.id.startsWith('builtin-')) return
    try {
      const result = await api<{ downloadCount: number }>(`/api/media/${encodeURIComponent(item.id)}/download`, {
        method: 'POST',
      })
      item.downloadCount = result.downloadCount
    } catch {
      // 下载本身仍然可用，计数失败不打断用户。
    }
  }

  onMounted(() => void loadMedia())

  return {
    bgmTracks,
    loadMedia,
    mediaError,
    recordStickerDownload,
    stickerSubmitting,
    stickers,
    submitSticker,
  }
}
