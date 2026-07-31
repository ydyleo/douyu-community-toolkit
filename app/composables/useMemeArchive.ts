import { categories, memes as seedMemes } from '~/data/site'
import { localMemeRepository } from '~/repositories/meme-repository'
import type { Meme, MemeSubmissionReceipt } from '#shared/types/meme'

export type SortMode = 'newest' | 'popular'

export function useMemeArchive() {
  const api = useApi()
  const selectedCategory = ref('全部')
  const query = ref('')
  const sortMode = ref<SortMode>('newest')
  const randomMeme = ref<Meme>(seedMemes.find((meme) => meme.featured) ?? seedMemes[0]!)
  const copyCounts = ref<Record<string, number>>({})
  const likedIds = ref<string[]>([])
  const localMemes = ref<Meme[]>([])
  const remoteMemes = ref<Meme[]>(seedMemes)
  const toast = ref('')
  const showSubmit = ref(false)
  const hydrated = ref(false)
  const draft = ref({ text: '', category: categories[1]!, source: '', tags: '' })

  const allMemes = computed(() => [...localMemes.value, ...remoteMemes.value])
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
    randomMeme.value = candidates[Math.floor(Math.random() * candidates.length)] ?? pool[0] ?? randomMeme.value
  }

  async function submitMeme() {
    const text = draft.value.text.trim()
    if (!text) {
      flash('先写下这条梗')
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
    } catch {
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

  onMounted(async () => {
    const state = localMemeRepository.loadLocalState()
    localMemes.value = state.submissions
    copyCounts.value = state.copyCounts
    likedIds.value = state.likedIds
    hydrated.value = true
    try {
      const result = await api<{ items: Meme[] }>('/api/memes', { query: { pageSize: 100 } })
      remoteMemes.value = result.items
      const serverCounts = Object.fromEntries(result.items.map((meme) => [meme.id, meme.copyCount ?? 0]))
      copyCounts.value = Object.fromEntries(
        Object.keys({ ...copyCounts.value, ...serverCounts }).map((id) => [id, Math.max(copyCounts.value[id] ?? 0, serverCounts[id] ?? 0)]),
      )
    } catch {
      // 离线时继续使用浏览器本地数据。
    }
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
