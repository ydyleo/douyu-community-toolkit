import { categories } from '~/data/site'
import { localMemeRepository } from '~/repositories/meme-repository'
import {
  MEME_ARCHIVE_UPDATED_EVENT,
  MEME_ARCHIVE_UPDATED_STORAGE_KEY,
} from '~/utils/meme-archive-sync'
import type { Meme, MemeSubmissionReceipt } from '#shared/types/meme'

export type SortMode = 'newest' | 'popular'

function normalizeMemeText(text: string) {
  return text.normalize('NFKC').trim().replace(/\s+/g, ' ').toLocaleLowerCase('zh-CN')
}

function dedupeMemes(memes: Meme[]) {
  const seen = new Set<string>()
  return memes.filter((meme) => {
    const key = normalizeMemeText(meme.text)
    if (seen.has(key)) return false
    seen.add(key)
    return true
  })
}

function getResponseStatus(error: unknown) {
  if (!error || typeof error !== 'object') return undefined
  const candidate = error as {
    status?: number
    statusCode?: number
    response?: { status?: number }
    data?: { statusCode?: number }
  }
  return candidate.status ?? candidate.statusCode ?? candidate.response?.status ?? candidate.data?.statusCode
}

export function useMemeArchive() {
  const api = useApi()
  const selectedCategory = ref('全部')
  const query = ref('')
  const sortMode = ref<SortMode>('newest')
  const randomMeme = ref<Meme | null>(null)
  const copyCounts = ref<Record<string, number>>({})
  const likedIds = ref<string[]>([])
  const localMemes = ref<Meme[]>([])
  const remoteMemes = ref<Meme[]>([])
  const toast = ref('')
  const showSubmit = ref(false)
  const hydrated = ref(false)
  const draft = ref({ text: '', category: categories[1]!, source: '', tags: '' })
  let refreshPromise: Promise<void> | null = null

  // 正式数据放在前面：同一条梗既有本地暂存又已经公开时，只展示正式版本。
  const allMemes = computed(() => dedupeMemes([...remoteMemes.value, ...localMemes.value]))
  const filteredMemes = computed(() => {
    const needle = query.value.trim().toLowerCase()
    const result = allMemes.value.filter((meme) => {
      const inCategory = selectedCategory.value === '全部' || meme.category === selectedCategory.value
      const haystack = [meme.text, meme.category, meme.source, ...meme.tags].join(' ').toLowerCase()
      return inCategory && (!needle || haystack.includes(needle))
    })

    return sortMode.value === 'popular'
      ? [...result].sort((a, b) => (copyCounts.value[b.id] ?? 0) - (copyCounts.value[a.id] ?? 0))
      : result
  })
  const totalCopies = computed(() => Object.values(copyCounts.value).reduce((sum, value) => sum + value, 0))

  function flash(message: string) {
    toast.value = message
    window.setTimeout(() => {
      if (toast.value === message) toast.value = ''
    }, 1800)
  }

  async function copyMeme(meme: Meme) {
    try {
      await navigator.clipboard.writeText(meme.text)
      copyCounts.value = { ...copyCounts.value, [meme.id]: (copyCounts.value[meme.id] ?? 0) + 1 }
      flash('已复制到剪贴板')
      if (!meme.id.startsWith('local-')) {
        try {
          const result = await api<{ copyCount: number }>(`/api/memes/${encodeURIComponent(meme.id)}/copy`, { method: 'POST' })
          copyCounts.value = { ...copyCounts.value, [meme.id]: result.copyCount }
        } catch {
          // 本地计数仍然有效；正式后端上线后由数据库保证持久化。
        }
      }
    } catch {
      flash('复制失败，请手动选择文字')
    }
  }

  function toggleLike(id: string) {
    likedIds.value = likedIds.value.includes(id)
      ? likedIds.value.filter((item) => item !== id)
      : [...likedIds.value, id]
  }

  function pickRandom() {
    const pool = filteredMemes.value.length ? filteredMemes.value : allMemes.value
    const candidates = pool.filter((meme) => meme.id !== randomMeme.value?.id)
    randomMeme.value = candidates[Math.floor(Math.random() * candidates.length)] ?? pool[0] ?? null
  }

  function refreshRemoteMemes() {
    if (refreshPromise) return refreshPromise
    refreshPromise = (async () => {
      const result = await api<{ items: Meme[] }>('/api/memes', { query: { pageSize: 100 } })
      remoteMemes.value = dedupeMemes(result.items)
      const remoteTexts = new Set(remoteMemes.value.map((meme) => normalizeMemeText(meme.text)))
      localMemes.value = localMemes.value.filter((meme) => !remoteTexts.has(normalizeMemeText(meme.text)))
      if (!randomMeme.value || !allMemes.value.some((meme) => meme.id === randomMeme.value?.id)) {
        randomMeme.value = remoteMemes.value.find((meme) => meme.featured) ?? allMemes.value[0] ?? null
      }
      const serverCounts = Object.fromEntries(result.items.map((meme) => [meme.id, meme.copyCount ?? 0]))
      copyCounts.value = Object.fromEntries(
        Object.keys({ ...copyCounts.value, ...serverCounts }).map((id) => [id, Math.max(copyCounts.value[id] ?? 0, serverCounts[id] ?? 0)]),
      )
    })().finally(() => {
      refreshPromise = null
    })
    return refreshPromise
  }

  async function submitMeme() {
    const text = draft.value.text.trim()
    if (!text) {
      flash('先写下这条梗')
      return
    }
    const normalizedText = normalizeMemeText(text)
    if (allMemes.value.some((meme) => normalizeMemeText(meme.text) === normalizedText)) {
      flash('这条烂梗已经收录了')
      return
    }

    const submission = {
      text,
      category: draft.value.category,
      source: draft.value.source.trim() || undefined,
      tags: draft.value.tags.split(/[，,]/).map((tag) => tag.trim()).filter(Boolean).slice(0, 5),
    }

    try {
      await api<MemeSubmissionReceipt>('/api/submissions', { method: 'POST', body: submission })
      draft.value = { text: '', category: categories[1]!, source: '', tags: '' }
      showSubmit.value = false
      flash('投稿成功，审核通过后会公开')
    } catch (error) {
      if (getResponseStatus(error) === 409) {
        flash('这条烂梗已收录或正在审核')
        return
      }
      const meme: Meme = {
        id: `local-${Date.now()}`,
        ...submission,
        source: submission.source || '本地暂存',
        year: new Date().getFullYear(),
      }
      localMemes.value = [meme, ...localMemes.value]
      draft.value = { text: '', category: categories[1]!, source: '', tags: '' }
      showSubmit.value = false
      selectedCategory.value = '全部'
      flash('服务暂不可用，已暂存在本机')
    }
  }

  watch([localMemes, copyCounts, likedIds], () => {
    if (!hydrated.value) return
    localMemeRepository.saveLocalState({
      submissions: localMemes.value,
      copyCounts: copyCounts.value,
      likedIds: likedIds.value,
    })
  }, { deep: true })

  function refreshWhenVisible() {
    if (document.visibilityState === 'visible') void refreshRemoteMemes()
  }

  function refreshFromStorage(event: StorageEvent) {
    if (event.key === MEME_ARCHIVE_UPDATED_STORAGE_KEY) void refreshRemoteMemes()
  }

  function refreshFromAdmin() {
    void refreshRemoteMemes()
  }

  onMounted(async () => {
    const state = localMemeRepository.loadLocalState()
    localMemes.value = dedupeMemes(state.submissions)
    randomMeme.value = localMemes.value[0] ?? null
    copyCounts.value = state.copyCounts
    likedIds.value = state.likedIds
    hydrated.value = true
    window.addEventListener('focus', refreshWhenVisible)
    window.addEventListener('storage', refreshFromStorage)
    window.addEventListener(MEME_ARCHIVE_UPDATED_EVENT, refreshFromAdmin)
    document.addEventListener('visibilitychange', refreshWhenVisible)
    try {
      await refreshRemoteMemes()
    } catch {
      // 离线时继续使用浏览器本地数据。
    }
  })

  onBeforeUnmount(() => {
    window.removeEventListener('focus', refreshWhenVisible)
    window.removeEventListener('storage', refreshFromStorage)
    window.removeEventListener(MEME_ARCHIVE_UPDATED_EVENT, refreshFromAdmin)
    document.removeEventListener('visibilitychange', refreshWhenVisible)
  })

  return {
    allMemes,
    copyCounts,
    draft,
    filteredMemes,
    likedIds,
    pickRandom,
    query,
    randomMeme,
    selectedCategory,
    showSubmit,
    sortMode,
    submitMeme,
    toast,
    toggleLike,
    totalCopies,
    copyMeme,
  }
}
