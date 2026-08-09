<script setup lang="ts">
import { categories } from '~/data/site'
import { notifyMemeArchiveUpdated } from '~/utils/meme-archive-sync'
import type {
  AdminAuditLog,
  AdminJokeSubmission,
  AdminManagedUser,
  AdminSessionUser,
  MediaAsset,
  Meme,
  SubmissionStatus,
} from '#shared/types/meme'

useSeoMeta({
  title: '小龟内容管理',
  robots: 'noindex, nofollow',
})

type Panel = 'joke-review' | 'jokes' | 'tags' | 'sticker-review' | 'stickers' | 'bgm' | 'security'
type JokeEditor = {
  kind: 'submission' | 'published'
  id: string
  text: string
  category: string
  source: string
  tags: string
  featured: boolean
}
type SimilarJoke = Meme & { score: number, reasons: string[] }
type SimilarTagGroup = { inputTag: string, items: { name: string, count: number, score: number }[] }
type SubmissionSimilarityState = {
  loading: boolean
  loaded: boolean
  error: string
  matches: SimilarJoke[]
  tagMatches: SimilarTagGroup[]
}
type TagTreeNode = { id: string, name: string, parentId: string | null, count: number }

const panelLabels: Record<Panel, string> = {
  'joke-review': '烂梗审核',
  jokes: '烂梗管理',
  tags: '标签管理',
  'sticker-review': '表情包审核',
  stickers: '表情包管理',
  bgm: 'BGM 管理',
  security: '账号与安全',
}
const statusLabels: Record<SubmissionStatus, string> = {
  pending: '待审核',
  approved: '已通过',
  rejected: '已拒绝',
}

const api = useApi()
const config = useRuntimeConfig()
const apiBase = String(config.public.apiBase || '').replace(/\/$/, '')
const username = ref('owner')
const password = ref('')
const authenticated = ref(false)
const currentUser = ref<AdminSessionUser | null>(null)
const checkingSession = ref(true)
const loading = ref(false)
const processingId = ref('')
const activePanel = ref<Panel>('joke-review')
const status = ref<SubmissionStatus>('pending')
const jokeSubmissions = ref<AdminJokeSubmission[]>([])
const jokes = ref<Meme[]>([])
const mediaItems = ref<MediaAsset[]>([])
const adminUsers = ref<AdminManagedUser[]>([])
const auditLogs = ref<AdminAuditLog[]>([])
const tagSuggestions = ref<{ name: string, count: number }[]>([])
const tagNodes = ref<TagTreeNode[]>([])
const tagAdminQuery = ref('')
const jokeAdminQuery = ref('')
const showOnlySimilarTags = ref(false)
const submissionSimilarities = ref<Record<string, SubmissionSimilarityState>>({})
const draggedTag = ref('')
const tagDropTarget = ref('')
const expandedTagId = ref('')
const tagMerge = ref<{ sourceId: string, targetId: string, source: string, target: string, name: string, mode: 'choose' | 'merge' } | null>(null)
const mergingTags = ref(false)
const deletingTagId = ref('')
let tagAutoScrollVelocity = 0
let tagAutoScrollFrame: number | null = null
const showAllEditorTags = ref(false)
const showAllDraftTags = ref(false)
const showOnlyUntagged = ref(false)
const jokePage = ref(1)
const jokeEditor = ref<JokeEditor | null>(null)
const newEditorTag = ref('')
const newDraftTag = ref('')
const message = ref('')
const error = ref('')
const jokeDraft = ref({ text: '', category: categories[1]!, source: '', tags: '', featured: false })
const stickerUpload = ref({ title: '', description: '', file: null as File | null })
const bgmUpload = ref({ title: '', artist: '', description: '', file: null as File | null })
const newAdmin = ref({ username: '', password: '' })
const passwordChange = ref({ currentPassword: '', newPassword: '', confirmPassword: '' })
const visibleJokes = computed(() => {
  const query = jokeAdminQuery.value.trim().toLocaleLowerCase('zh-CN')
  const items = showOnlyUntagged.value ? jokes.value.filter((item) => !item.tags.length) : jokes.value
  return query
    ? items.filter((item) => [item.text, item.category, item.source ?? '', ...item.tags].join(' ').toLocaleLowerCase('zh-CN').includes(query))
    : items
})
const jokePageSize = 10
const jokeTotalPages = computed(() => Math.max(1, Math.ceil(visibleJokes.value.length / jokePageSize)))
const paginatedJokes = computed(() => visibleJokes.value.slice((jokePage.value - 1) * jokePageSize, jokePage.value * jokePageSize))
const visibleEditorTagSuggestions = computed(() => showAllEditorTags.value
  ? tagSuggestions.value
  : tagSuggestions.value.slice(0, 10))
const visibleDraftTagSuggestions = computed(() => showAllDraftTags.value
  ? tagSuggestions.value
  : tagSuggestions.value.slice(0, 10))
const editorSelectedTags = computed(() => jokeEditor.value ? splitTags(jokeEditor.value.tags) : [])
const draftSelectedTags = computed(() => splitTags(jokeDraft.value.tags))
const managedTags = computed(() => {
  const query = tagAdminQuery.value.trim().toLocaleLowerCase('zh-CN')
  const items = query
    ? tagSuggestions.value.filter((tag) => tag.name.toLocaleLowerCase('zh-CN').includes(query))
    : tagSuggestions.value
  return showOnlySimilarTags.value ? items.filter((tag) => similarTagNames(tag.name).length) : items
})
const similarCandidateTagCount = computed(() => tagSuggestions.value.filter((tag) => similarTagNames(tag.name).length).length)
const visibleRootTagNodes = computed(() => {
  const query = tagAdminQuery.value.trim().toLocaleLowerCase('zh-CN')
  const roots = tagNodes.value.filter((node) => !node.parentId)
  return roots.filter((root) => {
    const children = tagNodes.value.filter((node) => node.parentId === root.id)
    const matchesQuery = !query || root.name.toLocaleLowerCase('zh-CN').includes(query)
      || children.some((child) => child.name.toLocaleLowerCase('zh-CN').includes(query))
    const matchesSimilar = !showOnlySimilarTags.value || similarTagNames(root.name).length
      || children.some((child) => similarTagNames(child.name).length)
    return matchesQuery && matchesSimilar
  })
})

function toggleUntaggedFilter() {
  showOnlyUntagged.value = !showOnlyUntagged.value
  jokePage.value = 1
}

function goToJokePage(page: number) {
  jokePage.value = Math.min(jokeTotalPages.value, Math.max(1, page))
  void nextTick(() => document.querySelector('.admin-list-toolbar')?.scrollIntoView({ behavior: 'smooth', block: 'start' }))
}

function splitTags(value: string) {
  const result: string[] = []
  const seen = new Set<string>()
  for (const raw of value.split(/[，,]/)) {
    const cleaned = raw.trim().replace(/^#+\s*/, '').trim()
    const tag = cleaned === '唱' ? '唱歌' : cleaned
    const key = tag.toLocaleLowerCase('zh-CN')
    if (!tag || seen.has(key)) continue
    seen.add(key)
    result.push(tag)
    if (result.length >= 5) break
  }
  return result
}

function openJokeEditor(item: Meme | AdminJokeSubmission, kind: JokeEditor['kind']) {
  showAllEditorTags.value = false
  newEditorTag.value = ''
  jokeEditor.value = {
    kind,
    id: item.id,
    text: item.text,
    category: item.category,
    source: item.source ?? '',
    tags: item.tags.join(', '),
    featured: kind === 'published' && 'featured' in item ? item.featured === true : false,
  }
}

function toggleEditorTag(name: string) {
  if (!jokeEditor.value) return
  const tags = splitTags(jokeEditor.value.tags)
  const index = tags.findIndex((tag) => tag.toLocaleLowerCase('zh-CN') === name.toLocaleLowerCase('zh-CN'))
  if (index >= 0) tags.splice(index, 1)
  else if (tags.length < 5) tags.push(name)
  jokeEditor.value.tags = tags.join(', ')
}

function editorHasTag(name: string) {
  return jokeEditor.value
    ? splitTags(jokeEditor.value.tags).some((tag) => tag.toLocaleLowerCase('zh-CN') === name.toLocaleLowerCase('zh-CN'))
    : false
}

function toggleDraftTag(name: string) {
  const tags = splitTags(jokeDraft.value.tags)
  const index = tags.findIndex((tag) => tag.toLocaleLowerCase('zh-CN') === name.toLocaleLowerCase('zh-CN'))
  if (index >= 0) tags.splice(index, 1)
  else if (tags.length < 5) tags.push(name)
  jokeDraft.value.tags = tags.join(', ')
}

function draftHasTag(name: string) {
  return splitTags(jokeDraft.value.tags).some((tag) => tag.toLocaleLowerCase('zh-CN') === name.toLocaleLowerCase('zh-CN'))
}

function appendTags(current: string, additions: string) {
  return splitTags(`${current},${additions}`).join(', ')
}

function addDraftTag() {
  jokeDraft.value.tags = appendTags(jokeDraft.value.tags, newDraftTag.value)
  newDraftTag.value = ''
}

function addEditorTag() {
  if (!jokeEditor.value) return
  jokeEditor.value.tags = appendTags(jokeEditor.value.tags, newEditorTag.value)
  newEditorTag.value = ''
}

function startTagDrag(event: DragEvent, id: string) {
  draggedTag.value = id
  event.dataTransfer?.setData('text/plain', id)
  if (event.dataTransfer) event.dataTransfer.effectAllowed = 'move'
}

function runTagAutoScroll() {
  if (!tagAutoScrollVelocity) {
    tagAutoScrollFrame = null
    return
  }
  window.scrollBy(0, tagAutoScrollVelocity)
  tagAutoScrollFrame = window.requestAnimationFrame(runTagAutoScroll)
}

function updateTagAutoScroll(pointerY: number) {
  const edge = Math.min(150, window.innerHeight * 0.24)
  const acceleratedSpeed = (distance: number) => {
    const ratio = Math.max(0, distance / edge)
    return Math.min(56, Math.round(5 + Math.pow(ratio, 1.65) * 43))
  }
  if (pointerY < edge) tagAutoScrollVelocity = -acceleratedSpeed(edge - pointerY)
  else if (pointerY > window.innerHeight - edge) tagAutoScrollVelocity = acceleratedSpeed(pointerY - (window.innerHeight - edge))
  else tagAutoScrollVelocity = 0
  if (tagAutoScrollVelocity && tagAutoScrollFrame === null) tagAutoScrollFrame = window.requestAnimationFrame(runTagAutoScroll)
}

function finishTagDrag() {
  draggedTag.value = ''
  tagDropTarget.value = ''
  tagAutoScrollVelocity = 0
  if (tagAutoScrollFrame !== null) window.cancelAnimationFrame(tagAutoScrollFrame)
  tagAutoScrollFrame = null
}

function tagNode(id: string) {
  return tagNodes.value.find((node) => node.id === id)
}

function childTagNodes(parentId: string) {
  return tagNodes.value
    .filter((node) => node.parentId === parentId)
    .sort((left, right) => right.count - left.count || left.name.localeCompare(right.name, 'zh-CN'))
}

function openTagDropChoice(sourceId: string, targetId: string) {
  if (!sourceId || !targetId || sourceId === targetId) return
  const source = tagNode(sourceId)
  const target = tagNode(targetId)
  if (!source || !target) return
  tagMerge.value = {
    sourceId,
    targetId,
    source: source.name,
    target: target.name,
    name: target.count >= source.count ? target.name : source.name,
    mode: 'choose',
  }
  finishTagDrag()
}

async function moveTagToParent(tagId: string, parentId: string | null) {
  if (!tagId || tagId === parentId) return
  const source = tagNode(tagId)
  if (!source || source.parentId === parentId) {
    finishTagDrag()
    return
  }
  const previousParentId = source.parentId
  const scrollLeft = import.meta.client ? window.scrollX : 0
  const scrollTop = import.meta.client ? window.scrollY : 0
  clearFeedback()
  try {
    await api(`/api/admin/tags/${encodeURIComponent(tagId)}/move`, { method: 'POST', body: { parentId } })
    tagNodes.value = tagNodes.value.map((node) => node.id === tagId ? { ...node, parentId } : node)
    if (parentId) expandedTagId.value = parentId
    else if (previousParentId === expandedTagId.value && !tagNodes.value.some((node) => node.parentId === previousParentId)) {
      expandedTagId.value = ''
    }
    message.value = parentId ? '子标签关系已更新。' : '标签已移到顶层。'
    await nextTick()
    if (import.meta.client) window.scrollTo(scrollLeft, scrollTop)
  } catch (caught) {
    error.value = readError(caught)
  } finally {
    finishTagDrag()
  }
}

async function deleteManagedTag(item: TagTreeNode) {
  if (deletingTagId.value) return
  const childCount = childTagNodes(item.id).length
  const childNotice = childCount ? `\n它的 ${childCount} 个子标签会恢复为独立标签。` : ''
  if (!window.confirm(`确定删除标签 #${item.name} 吗？\n它会从所有相关烂梗和投稿中移除。${childNotice}`)) return
  const scrollLeft = window.scrollX
  const scrollTop = window.scrollY
  deletingTagId.value = item.id
  clearFeedback()
  try {
    const result = await api<{ updatedJokes: number, updatedSubmissions: number }>(`/api/admin/tags/${encodeURIComponent(item.id)}`, { method: 'DELETE' })
    tagNodes.value = tagNodes.value
      .filter((node) => node.id !== item.id)
      .map((node) => node.parentId === item.id ? { ...node, parentId: null } : node)
    tagSuggestions.value = tagSuggestions.value.filter((tag) => tag.name !== item.name)
    if (expandedTagId.value === item.id || (expandedTagId.value === item.parentId && !tagNodes.value.some((node) => node.parentId === item.parentId))) {
      expandedTagId.value = ''
    }
    notifyMemeArchiveUpdated()
    message.value = `已删除 #${item.name}，同步更新 ${result.updatedJokes} 条烂梗和 ${result.updatedSubmissions} 条投稿。`
    await nextTick()
    window.scrollTo(scrollLeft, scrollTop)
  } catch (caught) {
    error.value = readError(caught)
  } finally {
    deletingTagId.value = ''
  }
}

function dropTag(event: DragEvent, targetId: string) {
  const sourceId = draggedTag.value || event.dataTransfer?.getData('text/plain') || ''
  openTagDropChoice(sourceId, targetId)
}

function dropTagToRoot(event: DragEvent) {
  const sourceId = draggedTag.value || event.dataTransfer?.getData('text/plain') || ''
  finishTagDrag()
  void moveTagToParent(sourceId, null)
}

function handlePageTagDragOver(event: DragEvent) {
  if (draggedTag.value) updateTagAutoScroll(event.clientY)
  const source = tagNode(draggedTag.value)
  if (!source?.parentId || (event.target as Element | null)?.closest?.('[data-tag-drop-target]')) return
  event.preventDefault()
  if (event.dataTransfer) event.dataTransfer.dropEffect = 'move'
  tagDropTarget.value = 'root'
}

function handlePageTagDrop(event: DragEvent) {
  const source = tagNode(draggedTag.value)
  if (!source?.parentId || (event.target as Element | null)?.closest?.('[data-tag-drop-target]')) return
  event.preventDefault()
  dropTagToRoot(event)
}

function toggleTagChildren(id: string) {
  if (!childTagNodes(id).length) return
  expandedTagId.value = expandedTagId.value === id ? '' : id
}

function chooseTagMerge() {
  if (tagMerge.value) tagMerge.value.mode = 'merge'
}

function chooseTagParent() {
  if (!tagMerge.value) return
  const { sourceId, targetId } = tagMerge.value
  tagMerge.value = null
  void moveTagToParent(sourceId, targetId)
}

function tagUsageCount(name: string) {
  return tagSuggestions.value.find((tag) => tag.name === name)?.count ?? 0
}

function comparableTag(value: string) {
  return value.toLocaleLowerCase('zh-CN').replace(/[^\p{L}\p{N}]+/gu, '')
}

function tagNameSimilarity(leftValue: string, rightValue: string) {
  const left = comparableTag(leftValue)
  const right = comparableTag(rightValue)
  if (!left || !right) return 0
  if (left === right) return 1
  const leftCharacters = new Set([...left])
  const rightCharacters = new Set([...right])
  const intersection = [...leftCharacters].filter((character) => rightCharacters.has(character)).length
  const union = new Set([...leftCharacters, ...rightCharacters]).size
  const characterScore = union ? (intersection / union) * 0.72 : 0
  const containsScore = left.includes(right) || right.includes(left)
    ? (Math.min(left.length, right.length) / Math.max(left.length, right.length)) * 0.9 + 0.1
    : 0
  return Math.max(characterScore, containsScore)
}

function similarTagNames(name: string) {
  return tagSuggestions.value
    .filter((tag) => tag.name !== name)
    .map((tag) => ({ ...tag, score: tagNameSimilarity(name, tag.name) }))
    .filter((tag) => tag.score >= 0.23)
    .sort((left, right) => right.score - left.score || right.count - left.count)
    .slice(0, 3)
}

function similarityState(id: string) {
  return submissionSimilarities.value[id]
}

async function loadSubmissionSimilarity(item: AdminJokeSubmission) {
  const current = submissionSimilarities.value[item.id]
  if (current?.loading || current?.loaded) return
  submissionSimilarities.value[item.id] = {
    loading: true,
    loaded: false,
    error: '',
    matches: [],
    tagMatches: [],
  }
  try {
    const result = await api<{ matches: SimilarJoke[], tagMatches: SimilarTagGroup[] }>(`/api/admin/submissions/${encodeURIComponent(item.id)}/similar`)
    submissionSimilarities.value[item.id] = {
      loading: false,
      loaded: true,
      error: '',
      matches: result.matches,
      tagMatches: result.tagMatches,
    }
  } catch (caught) {
    submissionSimilarities.value[item.id] = {
      loading: false,
      loaded: true,
      error: readError(caught),
      matches: [],
      tagMatches: [],
    }
  }
}

async function mergeTags() {
  if (!tagMerge.value || mergingTags.value) return
  const targetTag = tagMerge.value.name.trim().replace(/^#+\s*/, '').trim()
  if (!targetTag) {
    error.value = '请填写合并后的标签名称'
    return
  }
  mergingTags.value = true
  clearFeedback()
  try {
    const result = await api<{ targetTag: string, updatedJokes: number, updatedSubmissions: number }>('/api/admin/tags/merge-nodes', {
      method: 'POST',
      body: {
        sourceId: tagMerge.value.sourceId,
        targetId: tagMerge.value.targetId,
        targetTag,
      },
    })
    tagMerge.value = null
    notifyMemeArchiveUpdated()
    message.value = `标签已合并为 #${result.targetTag}，更新了 ${result.updatedJokes} 条烂梗和 ${result.updatedSubmissions} 条投稿。`
    await loadCurrentPanel()
  } catch (caught) {
    error.value = readError(caught)
  } finally {
    mergingTags.value = false
  }
}

function readError(value: unknown) {
  const fetchError = value as { data?: { message?: string, statusMessage?: string }, message?: string, statusMessage?: string }
  return fetchError.data?.message ?? fetchError.data?.statusMessage ?? fetchError.message ?? fetchError.statusMessage ?? '操作失败，请稍后重试'
}

function formatDate(value: string) {
  return new Intl.DateTimeFormat('zh-CN', {
    dateStyle: 'medium',
    timeStyle: 'short',
  }).format(new Date(value))
}

function assetUrl(value: string) {
  return value.startsWith('/uploads/') && apiBase ? `${apiBase}${value}` : value
}

function formatSize(value: number) {
  return value >= 1024 * 1024
    ? `${(value / 1024 / 1024).toFixed(1)}MB`
    : `${Math.max(1, Math.round(value / 1024))}KB`
}

function roleLabel(role: AdminSessionUser['role']) {
  return role === 'owner' ? '站长' : '管理员'
}

const auditActionLabels: Record<string, string> = {
  create: '创建',
  update: '编辑',
  delete: '删除',
  approve: '通过',
  reject: '拒绝',
  enable: '启用账号',
  disable: '停用账号',
  reset_password: '重置密码',
  revoke_sessions: '强制退出',
  change_password: '修改密码',
  merge: '合并',
  move: '移动',
  cleanup: '清理',
}

const auditEntityLabels: Record<string, string> = {
  admin_user: '管理员',
  inside_joke: '烂梗',
  joke_submission: '烂梗投稿',
  sticker: '表情包',
  sticker_submission: '表情包投稿',
  bgm: 'BGM',
  tag: '标签',
}

function clearFeedback() {
  message.value = ''
  error.value = ''
}

async function loadCurrentPanel() {
  if (!authenticated.value) return
  loading.value = true
  error.value = ''
  try {
    if (activePanel.value === 'security') {
      if (currentUser.value?.role === 'owner') {
        const [usersResult, logsResult] = await Promise.all([
          api<{ items: AdminManagedUser[] }>('/api/admin/users'),
          api<{ items: AdminAuditLog[] }>('/api/admin/audit-logs'),
        ])
        adminUsers.value = usersResult.items
        auditLogs.value = logsResult.items
      }
    } else if (activePanel.value === 'joke-review') {
      const [result, tagsResult] = await Promise.all([
        api<{ items: AdminJokeSubmission[] }>('/api/admin/submissions', { query: { status: status.value } }),
        api<{ items: { name: string, count: number }[] }>('/api/tags', { query: { limit: 100 } }),
      ])
      jokeSubmissions.value = result.items
      tagSuggestions.value = tagsResult.items
      submissionSimilarities.value = {}
    } else if (activePanel.value === 'jokes') {
      const [result, tagsResult] = await Promise.all([
        api<{ items: Meme[] }>('/api/admin/jokes'),
        api<{ items: { name: string, count: number }[] }>('/api/tags', { query: { limit: 100 } }),
      ])
      jokes.value = result.items
      tagSuggestions.value = tagsResult.items
    } else if (activePanel.value === 'tags') {
      const cleanupResult = await api<{ deletedCount: number }>('/api/admin/tags/cleanup-unused', { method: 'POST' })
      const result = await api<{ items: TagTreeNode[] }>('/api/admin/tags/tree')
      tagNodes.value = result.items
      tagSuggestions.value = result.items.map(({ name, count }) => ({ name, count }))
      if (cleanupResult.deletedCount) message.value = `已自动清理 ${cleanupResult.deletedCount} 个没有任何引用的空标签。`
      if (expandedTagId.value && (
        !result.items.some((item) => item.id === expandedTagId.value && !item.parentId)
        || !result.items.some((item) => item.parentId === expandedTagId.value)
      )) {
        expandedTagId.value = ''
      }
    } else {
      const kind = activePanel.value === 'bgm' ? 'bgm' : 'sticker'
      const mediaStatus = activePanel.value === 'sticker-review' ? status.value : 'approved'
      const result = await api<{ items: MediaAsset[] }>('/api/admin/media', {
        query: { kind, status: mediaStatus },
      })
      mediaItems.value = result.items
    }
  } catch (caught) {
    const statusCode = (caught as { statusCode?: number }).statusCode
    if (statusCode === 401) authenticated.value = false
    error.value = readError(caught)
  } finally {
    loading.value = false
  }
}

async function login() {
  clearFeedback()
  if (!username.value.trim() || !password.value) {
    error.value = '请输入管理员账号和密码'
    return
  }
  try {
    const result = await api<{ authenticated: boolean, user: AdminSessionUser }>('/api/admin/login', {
      method: 'POST',
      body: { username: username.value, password: password.value },
    })
    password.value = ''
    authenticated.value = true
    currentUser.value = result.user
    await loadCurrentPanel()
  } catch (caught) {
    error.value = readError(caught)
  }
}

async function logout() {
  await api('/api/admin/logout', { method: 'POST' })
  authenticated.value = false
  currentUser.value = null
  jokeSubmissions.value = []
  jokes.value = []
  mediaItems.value = []
  clearFeedback()
}

async function changePassword() {
  clearFeedback()
  if (passwordChange.value.newPassword !== passwordChange.value.confirmPassword) {
    error.value = '两次输入的新密码不一致'
    return
  }
  try {
    await api('/api/admin/change-password', {
      method: 'POST',
      body: {
        currentPassword: passwordChange.value.currentPassword,
        newPassword: passwordChange.value.newPassword,
      },
    })
    passwordChange.value = { currentPassword: '', newPassword: '', confirmPassword: '' }
    message.value = '密码已修改，其他设备上的旧登录已经失效。'
    await loadCurrentPanel()
  } catch (caught) {
    error.value = readError(caught)
  }
}

async function createAdmin() {
  clearFeedback()
  try {
    await api('/api/admin/users', {
      method: 'POST',
      body: newAdmin.value,
    })
    newAdmin.value = { username: '', password: '' }
    message.value = '管理员账号已创建。'
    await loadCurrentPanel()
  } catch (caught) {
    error.value = readError(caught)
  }
}

async function toggleAdmin(item: AdminManagedUser) {
  clearFeedback()
  try {
    await api(`/api/admin/users/${encodeURIComponent(item.id)}`, {
      method: 'PATCH',
      body: { active: !item.active },
    })
    message.value = item.active ? '管理员已停用，旧登录已经撤销。' : '管理员已重新启用。'
    await loadCurrentPanel()
  } catch (caught) {
    error.value = readError(caught)
  }
}

async function resetAdminPassword(item: AdminManagedUser) {
  const nextPassword = window.prompt(`为 ${item.username} 设置新密码（至少 12 个字符）`)
  if (!nextPassword) return
  clearFeedback()
  try {
    await api(`/api/admin/users/${encodeURIComponent(item.id)}/reset-password`, {
      method: 'POST',
      body: { password: nextPassword },
    })
    message.value = `已重置 ${item.username} 的密码，旧登录已经撤销。`
    await loadCurrentPanel()
  } catch (caught) {
    error.value = readError(caught)
  }
}

async function revokeAdminSessions(item: AdminManagedUser) {
  if (!window.confirm(`确定让 ${item.username} 在所有设备上立即退出吗？`)) return
  clearFeedback()
  try {
    await api(`/api/admin/users/${encodeURIComponent(item.id)}/revoke-sessions`, { method: 'POST' })
    message.value = `${item.username} 的所有旧登录已经撤销。`
    await loadCurrentPanel()
  } catch (caught) {
    error.value = readError(caught)
  }
}

async function approveJoke(item: AdminJokeSubmission) {
  processingId.value = item.id
  clearFeedback()
  try {
    await api(`/api/admin/submissions/${encodeURIComponent(item.id)}/approve`, { method: 'POST' })
    notifyMemeArchiveUpdated()
    message.value = '已通过，这条烂梗现在会出现在首页。'
    await loadCurrentPanel()
  } catch (caught) {
    error.value = readError(caught)
  } finally {
    processingId.value = ''
  }
}

async function rejectJoke(item: AdminJokeSubmission) {
  const reason = window.prompt('拒绝原因（可以留空）')
  if (reason === null) return
  processingId.value = item.id
  clearFeedback()
  try {
    await api(`/api/admin/submissions/${encodeURIComponent(item.id)}/reject`, {
      method: 'POST',
      body: { reason },
    })
    message.value = '已拒绝该投稿。'
    await loadCurrentPanel()
  } catch (caught) {
    error.value = readError(caught)
  } finally {
    processingId.value = ''
  }
}

async function addJoke() {
  addDraftTag()
  clearFeedback()
  try {
    await api('/api/admin/jokes', {
      method: 'POST',
      body: {
        text: jokeDraft.value.text,
        category: jokeDraft.value.category,
        source: jokeDraft.value.source,
        tags: splitTags(jokeDraft.value.tags),
        featured: jokeDraft.value.featured,
      },
    })
    notifyMemeArchiveUpdated()
    jokeDraft.value = { text: '', category: categories[1]!, source: '', tags: '', featured: false }
    newDraftTag.value = ''
    message.value = '烂梗已直接加入公开列表。'
    await loadCurrentPanel()
  } catch (caught) {
    error.value = readError(caught)
  }
}

async function saveJokeEditor() {
  if (!jokeEditor.value) return
  addEditorTag()
  const editor = jokeEditor.value
  clearFeedback()
  try {
    const path = editor.kind === 'submission'
      ? `/api/admin/submissions/${encodeURIComponent(editor.id)}`
      : `/api/admin/jokes/${encodeURIComponent(editor.id)}`
    await api(path, {
      method: 'PATCH',
      body: {
        text: editor.text,
        category: editor.category,
        source: editor.source,
        tags: splitTags(editor.tags),
        ...(editor.kind === 'published' ? { featured: editor.featured } : {}),
      },
    })
    if (editor.kind === 'published') notifyMemeArchiveUpdated()
    jokeEditor.value = null
    message.value = editor.kind === 'submission' ? '待审投稿已更新，可以继续审核。' : '烂梗已更新。'
    await loadCurrentPanel()
  } catch (caught) {
    error.value = readError(caught)
  }
}

async function toggleFeatured(item: Meme) {
  clearFeedback()
  try {
    await api(`/api/admin/jokes/${encodeURIComponent(item.id)}`, {
      method: 'PATCH',
      body: { featured: !item.featured },
    })
    notifyMemeArchiveUpdated()
    await loadCurrentPanel()
  } catch (caught) {
    error.value = readError(caught)
  }
}

async function deleteJoke(item: Meme) {
  if (!window.confirm(`确定永久删除“${item.text}”吗？复制记录也会一起删除。`)) return
  clearFeedback()
  try {
    await api(`/api/admin/jokes/${encodeURIComponent(item.id)}`, { method: 'DELETE' })
    notifyMemeArchiveUpdated()
    message.value = '烂梗已删除。'
    await loadCurrentPanel()
  } catch (caught) {
    error.value = readError(caught)
  }
}

async function approveSticker(item: MediaAsset) {
  processingId.value = item.id
  clearFeedback()
  try {
    await api(`/api/admin/media/${encodeURIComponent(item.id)}/approve`, { method: 'POST' })
    message.value = '表情包已通过并公开。'
    await loadCurrentPanel()
  } catch (caught) {
    error.value = readError(caught)
  } finally {
    processingId.value = ''
  }
}

async function rejectSticker(item: MediaAsset) {
  const reason = window.prompt('拒绝原因（可以留空）')
  if (reason === null) return
  processingId.value = item.id
  clearFeedback()
  try {
    await api(`/api/admin/media/${encodeURIComponent(item.id)}/reject`, {
      method: 'POST',
      body: { reason },
    })
    message.value = '投稿已拒绝，上传文件已从服务器删除。'
    await loadCurrentPanel()
  } catch (caught) {
    error.value = readError(caught)
  } finally {
    processingId.value = ''
  }
}

function selectAdminFile(kind: 'sticker' | 'bgm', event: Event) {
  const file = (event.target as HTMLInputElement).files?.[0] ?? null
  if (kind === 'sticker') stickerUpload.value.file = file
  else bgmUpload.value.file = file
}

async function uploadSticker() {
  if (!stickerUpload.value.file) {
    error.value = '请选择图片文件'
    return
  }
  clearFeedback()
  try {
    const body = new FormData()
    body.append('title', stickerUpload.value.title)
    body.append('description', stickerUpload.value.description)
    body.append('file', stickerUpload.value.file)
    await api('/api/admin/stickers', { method: 'POST', body })
    stickerUpload.value = { title: '', description: '', file: null }
    message.value = '表情包已上传并公开。'
    await loadCurrentPanel()
  } catch (caught) {
    error.value = readError(caught)
  }
}

async function uploadBgm() {
  if (!bgmUpload.value.file) {
    error.value = '请选择音频文件'
    return
  }
  clearFeedback()
  try {
    const body = new FormData()
    body.append('title', bgmUpload.value.title)
    body.append('artist', bgmUpload.value.artist)
    body.append('description', bgmUpload.value.description)
    body.append('file', bgmUpload.value.file)
    await api('/api/admin/bgm', { method: 'POST', body })
    bgmUpload.value = { title: '', artist: '', description: '', file: null }
    message.value = 'BGM 已上传并加入播放列表。'
    await loadCurrentPanel()
  } catch (caught) {
    error.value = readError(caught)
  }
}

async function toggleMedia(item: MediaAsset) {
  const endpoint = item.kind === 'bgm' ? 'bgm' : 'stickers'
  clearFeedback()
  try {
    await api(`/api/admin/${endpoint}/${encodeURIComponent(item.id)}`, {
      method: 'PATCH',
      body: { active: !item.active },
    })
    message.value = item.active ? '已下架。' : '已重新上架。'
    await loadCurrentPanel()
  } catch (caught) {
    error.value = readError(caught)
  }
}

async function editMedia(item: MediaAsset) {
  const title = window.prompt('修改名称', item.title)
  if (title === null) return
  const description = window.prompt('修改简介', item.description ?? '')
  if (description === null) return
  const sortValue = window.prompt('排序值（越小越靠前）', String(item.sortOrder))
  if (sortValue === null) return
  const endpoint = item.kind === 'bgm' ? 'bgm' : 'stickers'
  clearFeedback()
  try {
    await api(`/api/admin/${endpoint}/${encodeURIComponent(item.id)}`, {
      method: 'PATCH',
      body: { title, description, sortOrder: Number(sortValue) || 0 },
    })
    message.value = '素材信息已更新。'
    await loadCurrentPanel()
  } catch (caught) {
    error.value = readError(caught)
  }
}

async function deleteMedia(item: MediaAsset) {
  if (!window.confirm(`确定永久删除“${item.title}”及其文件吗？此操作不能恢复。`)) return
  clearFeedback()
  try {
    await api(`/api/admin/media/${encodeURIComponent(item.id)}`, { method: 'DELETE' })
    message.value = '素材和文件已删除。'
    await loadCurrentPanel()
  } catch (caught) {
    error.value = readError(caught)
  }
}

watch([activePanel, status], () => {
  clearFeedback()
  if (activePanel.value === 'jokes') jokePage.value = 1
  void loadCurrentPanel()
})

watch(jokeTotalPages, (total) => {
  jokePage.value = Math.min(jokePage.value, total)
})

watch(jokeAdminQuery, () => {
  jokePage.value = 1
})

onMounted(async () => {
  window.addEventListener('dragover', handlePageTagDragOver, true)
  window.addEventListener('drop', handlePageTagDrop, true)
  try {
    const session = await api<{ authenticated: boolean, user?: AdminSessionUser }>('/api/admin/session')
    authenticated.value = session.authenticated
    currentUser.value = session.user ?? null
    if (authenticated.value) await loadCurrentPanel()
  } finally {
    checkingSession.value = false
  }
})

onBeforeUnmount(() => {
  finishTagDrag()
  window.removeEventListener('dragover', handlePageTagDragOver, true)
  window.removeEventListener('drop', handlePageTagDrop, true)
})
</script>

<template>
  <div class="admin-shell">
    <header class="admin-header">
      <NuxtLink class="brand" to="/">
        <span class="brand-mark">龟</span>
        <span>小龟内容管理</span>
      </NuxtLink>
      <div class="admin-header-actions">
        <span v-if="currentUser" class="admin-user-badge">{{ currentUser.username }} · {{ roleLabel(currentUser.role) }}</span>
        <NuxtLink class="ghost-button" to="/">返回首页</NuxtLink>
        <button v-if="authenticated" class="ghost-button" type="button" @click="logout">退出登录</button>
      </div>
    </header>

    <main class="admin-main">
      <section v-if="checkingSession" class="admin-state">正在确认管理员身份…</section>

      <section v-else-if="!authenticated" class="admin-login-card">
        <p class="eyebrow">管理员入口</p>
        <h1>小龟管理后台</h1>
        <p>使用自己的管理员账号登录。登录状态会保留 8 小时，请不要与其他人共用账号。</p>
        <form @submit.prevent="login">
          <label>
            管理员账号
            <input v-model="username" type="text" maxlength="40" autocomplete="username" autofocus>
          </label>
          <label>
            管理员密码
            <input v-model="password" type="password" autocomplete="current-password">
          </label>
          <button class="primary-button" type="submit">进入管理后台</button>
        </form>
        <p v-if="error" class="admin-alert error">{{ error }}</p>
      </section>

      <template v-else>
        <section class="admin-title-row">
          <div>
            <p class="eyebrow">内容管理</p>
            <h1>{{ panelLabels[activePanel] }}</h1>
            <p>审核粉丝投稿，也可以直接维护已经公开的内容。</p>
          </div>
        </section>

        <div class="admin-module-tabs" role="tablist" aria-label="内容模块">
          <button
            v-for="(label, value) in panelLabels"
            :key="value"
            type="button"
            :class="{ active: activePanel === value }"
            @click="activePanel = value"
          >{{ label }}</button>
        </div>

        <div v-if="activePanel === 'joke-review' || activePanel === 'sticker-review'" class="admin-tabs" role="tablist" aria-label="审核状态">
          <button
            v-for="(label, value) in statusLabels"
            :key="value"
            type="button"
            :class="{ active: status === value }"
            @click="status = value"
          >{{ label }}</button>
        </div>

        <p v-if="message" class="admin-alert success">{{ message }}</p>
        <p v-if="error" class="admin-alert error">{{ error }}</p>

        <section v-if="activePanel === 'jokes'" class="admin-create-card">
          <h2>直接添加烂梗</h2>
          <form @submit.prevent="addJoke">
            <label>梗内容<textarea v-model="jokeDraft.text" maxlength="240" rows="3" required /></label>
            <div class="form-row">
              <label>分类<select v-model="jokeDraft.category"><option v-for="item in categories.slice(1)" :key="item">{{ item }}</option></select></label>
              <label>出处<input v-model="jokeDraft.source" maxlength="60" /></label>
            </div>
            <fieldset class="admin-tag-fieldset">
              <legend>标签 <span>可多选，最多 5 个</span></legend>
              <div v-if="draftSelectedTags.length" class="admin-selected-tags">
                <button v-for="tag in draftSelectedTags" :key="tag" type="button" @click="toggleDraftTag(tag)">#{{ tag }} ×</button>
              </div>
              <p v-else class="admin-tag-empty">暂未选择标签</p>
              <div v-if="tagSuggestions.length" class="admin-tag-suggestions">
                <span>选择已有：</span>
                <button
                  v-for="tag in visibleDraftTagSuggestions"
                  :key="tag.name"
                  type="button"
                  :class="{ active: draftHasTag(tag.name) }"
                  @click="toggleDraftTag(tag.name)"
                >{{ tag.name }} · {{ tag.count }}</button>
                <button
                  v-if="tagSuggestions.length > 10"
                  type="button"
                  class="tag-expand-button"
                  @click="showAllDraftTags = !showAllDraftTags"
                >{{ showAllDraftTags ? '收起' : `全部 ${tagSuggestions.length}` }}</button>
              </div>
              <div class="admin-new-tag-row">
                <input v-model="newDraftTag" maxlength="80" placeholder="输入新标签" @keydown.enter.prevent="addDraftTag" />
                <button type="button" @click="addDraftTag">添加</button>
              </div>
              <small>输入后按回车或点击添加；重复标签会自动合并。</small>
            </fieldset>
            <label class="admin-checkbox"><input v-model="jokeDraft.featured" type="checkbox" /> 设为精选</label>
            <button class="primary-button" type="submit">添加并公开</button>
          </form>
        </section>

        <section v-if="activePanel === 'stickers'" class="admin-create-card">
          <h2>直接上传表情包</h2>
          <form @submit.prevent="uploadSticker">
            <label>名称<input v-model="stickerUpload.title" maxlength="80" required /></label>
            <label>简介<textarea v-model="stickerUpload.description" maxlength="240" rows="2" /></label>
            <label>图片<input type="file" accept="image/png,image/jpeg,image/gif,image/webp" required @change="selectAdminFile('sticker', $event)" /></label>
            <button class="primary-button" type="submit">上传并公开</button>
          </form>
        </section>

        <section v-if="activePanel === 'bgm'" class="admin-create-card">
          <h2>上传 BGM</h2>
          <form @submit.prevent="uploadBgm">
            <div class="form-row">
              <label>曲名<input v-model="bgmUpload.title" maxlength="80" required /></label>
              <label>作者<input v-model="bgmUpload.artist" maxlength="80" /></label>
            </div>
            <label>简介<textarea v-model="bgmUpload.description" maxlength="240" rows="2" /></label>
            <label>音频<input type="file" accept="audio/mpeg,audio/ogg,audio/wav,audio/mp4" required @change="selectAdminFile('bgm', $event)" /></label>
            <button class="primary-button" type="submit">上传并加入播放列表</button>
          </form>
        </section>

        <section v-if="loading" class="admin-state">正在读取内容…</section>

        <section v-else-if="activePanel === 'joke-review'">
          <div v-if="!jokeSubmissions.length" class="admin-state">当前没有{{ statusLabels[status] }}的烂梗投稿。</div>
          <div v-else class="admin-submission-list">
            <article
              v-for="item in jokeSubmissions"
              :key="item.id"
              class="admin-submission-card"
              @mouseenter="loadSubmissionSimilarity(item)"
              @focusin="loadSubmissionSimilarity(item)"
            >
              <div class="admin-submission-meta"><span class="category-tag">{{ item.category }}</span><time>{{ formatDate(item.createdAt) }}</time></div>
              <blockquote>{{ item.text }}</blockquote>
              <dl>
                <div><dt>出处</dt><dd>{{ item.source || '未填写' }}</dd></div>
                <div><dt>标签</dt><dd>{{ item.tags.length ? item.tags.join(' / ') : '无' }}</dd></div>
                <div v-if="item.rejectionReason"><dt>拒绝原因</dt><dd>{{ item.rejectionReason }}</dd></div>
              </dl>
              <section v-if="similarityState(item.id)" class="admin-similarity-panel">
                <p v-if="similarityState(item.id)?.loading" class="admin-similarity-loading">正在检查相似烂梗和标签…</p>
                <p v-else-if="similarityState(item.id)?.error" class="admin-similarity-error">查重失败：{{ similarityState(item.id)?.error }}</p>
                <template v-else>
                  <div v-if="similarityState(item.id)?.matches.length" class="admin-similarity-group">
                    <strong>疑似相似烂梗</strong>
                    <article v-for="match in similarityState(item.id)?.matches" :key="match.id">
                      <div><b>{{ Math.round(match.score * 100) }}%</b><span>{{ match.reasons.join(' · ') }}</span></div>
                      <p>{{ match.text }}</p>
                      <small>{{ match.tags.map(tag => `#${tag}`).join(' ') || '无标签' }}</small>
                    </article>
                  </div>
                  <div v-if="similarityState(item.id)?.tagMatches.length" class="admin-similarity-group admin-similar-tags">
                    <strong>已有或相似标签</strong>
                    <p v-for="group in similarityState(item.id)?.tagMatches" :key="group.inputTag">
                      <b>#{{ group.inputTag }}</b>
                      <span>→</span>
                      <span v-for="tag in group.items" :key="tag.name">#{{ tag.name }} {{ Math.round(tag.score * 100) }}%</span>
                    </p>
                  </div>
                  <p
                    v-if="!similarityState(item.id)?.matches.length && !similarityState(item.id)?.tagMatches.length"
                    class="admin-similarity-clear"
                  >未发现明显相似内容。</p>
                </template>
              </section>
              <div v-if="item.status === 'pending'" class="admin-review-actions">
                <button class="admin-reject-button" type="button" :disabled="processingId === item.id" @click="rejectJoke(item)">拒绝</button>
                <button class="ghost-button" type="button" :disabled="processingId === item.id" @click="openJokeEditor(item, 'submission')">编辑内容与标签</button>
                <button class="primary-button" type="button" :disabled="processingId === item.id" @click="approveJoke(item)">通过并公开</button>
              </div>
            </article>
          </div>
        </section>

        <section v-else-if="activePanel === 'jokes'">
          <div class="admin-list-toolbar">
            <span>共 {{ jokes.length }} 条，当前匹配 {{ visibleJokes.length }} 条，{{ jokes.filter(item => !item.tags.length).length }} 条暂无标签</span>
            <div class="admin-toolbar-actions">
              <input v-model="jokeAdminQuery" type="search" maxlength="60" placeholder="搜索梗内容、标签或出处" aria-label="搜索已有烂梗" />
              <label class="admin-filter-toggle" :class="{ active: showOnlyUntagged }">
                <input type="checkbox" :checked="showOnlyUntagged" @change="toggleUntaggedFilter" />
                <span class="admin-toggle-track" aria-hidden="true"><i /></span>
                <span class="admin-toggle-copy">
                  <strong>无标签</strong>
                  <small>{{ jokes.filter(item => !item.tags.length).length }} 条内容</small>
                </span>
              </label>
            </div>
          </div>
          <div v-if="!visibleJokes.length" class="admin-state">{{ showOnlyUntagged ? '所有公开烂梗都已经有标签。' : '还没有公开烂梗。' }}</div>
          <div v-else class="admin-submission-list">
            <article v-for="item in paginatedJokes" :key="item.id" class="admin-submission-card">
              <div class="admin-submission-meta"><span class="category-tag">{{ item.category }}</span><span>{{ item.copyCount || 0 }} 次复制</span></div>
              <blockquote>{{ item.text }}</blockquote>
              <p>{{ item.source || '出处待考' }} · {{ item.featured ? '精选' : '普通' }}</p>
              <div class="admin-tag-list" :class="{ empty: !item.tags.length }">
                <span v-if="!item.tags.length">暂无标签</span>
                <span v-for="tag in item.tags" v-else :key="tag">#{{ tag }}</span>
              </div>
              <div class="admin-review-actions">
                <button class="ghost-button" type="button" @click="toggleFeatured(item)">{{ item.featured ? '取消精选' : '设为精选' }}</button>
                <button class="ghost-button" type="button" @click="openJokeEditor(item, 'published')">编辑内容与标签</button>
                <button class="admin-reject-button" type="button" @click="deleteJoke(item)">删除</button>
              </div>
            </article>
          </div>
          <nav v-if="jokeTotalPages > 1" class="pagination" aria-label="后台烂梗分页">
            <button type="button" :disabled="jokePage === 1" @click="goToJokePage(jokePage - 1)">← 上一页</button>
            <span>第 <strong>{{ jokePage }}</strong> / {{ jokeTotalPages }} 页</span>
            <button type="button" :disabled="jokePage === jokeTotalPages" @click="goToJokePage(jokePage + 1)">下一页 →</button>
          </nav>
        </section>

        <section v-else-if="activePanel === 'tags'" class="admin-tag-manager">
          <div class="admin-list-toolbar">
            <span>共 {{ tagNodes.length }} 个标签，当前显示 {{ visibleRootTagNodes.length }} 组。拖到另一张卡片可选择合并或设为子标签；把子标签拖到父标签外的空白处可恢复独立。</span>
            <div class="admin-toolbar-actions">
              <input v-model="tagAdminQuery" type="search" maxlength="24" placeholder="搜索标签" aria-label="搜索后台标签" />
              <label class="admin-filter-toggle" :class="{ active: showOnlySimilarTags }">
                <input v-model="showOnlySimilarTags" type="checkbox" />
                <span class="admin-toggle-track" aria-hidden="true"><i /></span>
                <span class="admin-toggle-copy">
                  <strong>疑似重复</strong>
                  <small>{{ similarCandidateTagCount }} 个候选</small>
                </span>
              </label>
            </div>
          </div>
          <div v-if="!visibleRootTagNodes.length" class="admin-state">没有找到匹配标签。</div>
          <div
            v-else
            class="admin-tag-grid"
            :class="{ 'root-drop-active': Boolean(draggedTag && tagNode(draggedTag)?.parentId) }"
          >
            <div
              v-for="tag in visibleRootTagNodes"
              :key="tag.id"
              class="admin-tag-node"
              :class="{ expanded: expandedTagId === tag.id }"
            >
              <article
                class="admin-tag-card"
                data-tag-drop-target
                :class="{ dragging: draggedTag === tag.id, 'drop-target': tagDropTarget === tag.id && draggedTag !== tag.id }"
                draggable="true"
                @click="toggleTagChildren(tag.id)"
                @dragstart="startTagDrag($event, tag.id)"
                @dragend="finishTagDrag"
                @dragenter.prevent="tagDropTarget = tag.id"
                @dragover.prevent
                @drop.stop.prevent="dropTag($event, tag.id)"
              >
                <button
                  class="admin-tag-delete"
                  type="button"
                  draggable="false"
                  :disabled="deletingTagId === tag.id"
                  :aria-label="`删除标签 ${tag.name}`"
                  @mousedown.stop
                  @click.stop="deleteManagedTag(tag)"
                >{{ deletingTagId === tag.id ? '删除中' : '删除' }}</button>
                <strong><i v-if="childTagNodes(tag.id).length" class="admin-parent-star" aria-hidden="true">★</i>#{{ tag.name }}</strong>
                <span>{{ tag.count }} 条烂梗<template v-if="childTagNodes(tag.id).length"> · {{ childTagNodes(tag.id).length }} 个子标签</template></span>
                <small v-if="similarTagNames(tag.name).length" class="admin-tag-similar">相似 {{ similarTagNames(tag.name).map(item => `#${item.name}`).join(' · ') }}</small>
                <small v-else-if="childTagNodes(tag.id).length">点击{{ expandedTagId === tag.id ? '收起' : '展开' }}子标签</small>
                <small v-else>把另一个标签拖到这里进行整理</small>
              </article>
              <div v-if="expandedTagId === tag.id && childTagNodes(tag.id).length" class="admin-child-list" aria-label="子标签">
                <article
                  v-for="child in childTagNodes(tag.id)"
                  :key="child.id"
                  class="admin-child-tag"
                  data-tag-drop-target
                  :class="{ dragging: draggedTag === child.id, 'drop-target': tagDropTarget === child.id && draggedTag !== child.id }"
                  draggable="true"
                  @dragstart="startTagDrag($event, child.id)"
                  @dragend="finishTagDrag"
                  @dragenter.stop.prevent="tagDropTarget = child.id"
                  @dragover.stop.prevent
                  @drop.stop.prevent="dropTag($event, child.id)"
                >
                  <button
                    class="admin-tag-delete"
                    type="button"
                    draggable="false"
                    :disabled="deletingTagId === child.id"
                    :aria-label="`删除标签 ${child.name}`"
                    @mousedown.stop
                    @click.stop="deleteManagedTag(child)"
                  >{{ deletingTagId === child.id ? '删除中' : '删除' }}</button>
                  <strong>#{{ child.name }}</strong>
                  <span>{{ child.count }} 条</span>
                </article>
              </div>
            </div>
          </div>
        </section>

        <section v-else-if="activePanel === 'sticker-review'">
          <div v-if="!mediaItems.length" class="admin-state">当前没有{{ statusLabels[status] }}的表情包投稿。</div>
          <div v-else class="admin-media-grid">
            <article v-for="item in mediaItems" :key="item.id" class="admin-media-card">
              <img v-if="item.fileUrl" :src="assetUrl(item.fileUrl)" :alt="item.title" />
              <div><h3>{{ item.title }}</h3><p>{{ item.description || '无简介' }}</p><small>{{ item.submitterName || '匿名水友' }} · {{ formatSize(item.sizeBytes) }}</small></div>
              <p v-if="item.rejectionReason">拒绝原因：{{ item.rejectionReason }}</p>
              <div v-if="item.status === 'pending'" class="admin-review-actions">
                <button class="admin-reject-button" type="button" @click="rejectSticker(item)">拒绝</button>
                <button class="primary-button" type="button" @click="approveSticker(item)">通过并公开</button>
              </div>
            </article>
          </div>
        </section>

        <section v-else-if="activePanel === 'security'" class="admin-security-layout">
          <section class="admin-create-card">
            <h2>修改我的密码</h2>
            <p>修改后，其他设备上的旧登录会立即失效。</p>
            <form @submit.prevent="changePassword">
              <label>当前密码<input v-model="passwordChange.currentPassword" type="password" autocomplete="current-password" required /></label>
              <label>新密码<input v-model="passwordChange.newPassword" type="password" minlength="12" autocomplete="new-password" required /></label>
              <label>再次输入新密码<input v-model="passwordChange.confirmPassword" type="password" minlength="12" autocomplete="new-password" required /></label>
              <button class="primary-button" type="submit">修改密码</button>
            </form>
          </section>

          <template v-if="currentUser?.role === 'owner'">
            <section class="admin-create-card">
              <h2>创建管理员</h2>
              <p>每个人使用自己的账号，不要分享你的站长密码。</p>
              <form @submit.prevent="createAdmin">
                <label>账号<input v-model="newAdmin.username" pattern="[a-z0-9_-]{3,40}" maxlength="40" placeholder="例如 xiaogui_admin" required /></label>
                <label>初始密码<input v-model="newAdmin.password" type="password" minlength="12" autocomplete="new-password" required /></label>
                <button class="primary-button" type="submit">创建管理员</button>
              </form>
            </section>

            <section class="admin-account-section">
              <h2>管理员账号</h2>
              <div class="admin-account-list">
                <article v-for="item in adminUsers" :key="item.id" class="admin-account-card">
                  <div>
                    <strong>{{ item.username }}</strong>
                    <span>{{ roleLabel(item.role) }} · {{ item.active ? '使用中' : '已停用' }}</span>
                  </div>
                  <div v-if="item.role !== 'owner'" class="admin-review-actions">
                    <button class="ghost-button" type="button" @click="revokeAdminSessions(item)">强制退出</button>
                    <button class="ghost-button" type="button" @click="resetAdminPassword(item)">重置密码</button>
                    <button class="admin-reject-button" type="button" @click="toggleAdmin(item)">{{ item.active ? '停用并退出' : '重新启用' }}</button>
                  </div>
                  <small v-else>唯一站长账号</small>
                </article>
              </div>
            </section>

            <section class="admin-account-section">
              <h2>最近操作记录</h2>
              <div v-if="!auditLogs.length" class="admin-state">暂时还没有操作记录。</div>
              <div v-else class="admin-audit-list">
                <article v-for="item in auditLogs" :key="item.id">
                  <strong>{{ item.username }}</strong>
                  <span>{{ auditActionLabels[item.action] || item.action }}{{ auditEntityLabels[item.entityType] || item.entityType }}</span>
                  <time>{{ formatDate(item.createdAt) }}</time>
                </article>
              </div>
            </section>
          </template>
        </section>

        <section v-else>
          <div v-if="!mediaItems.length" class="admin-state">当前没有已上传内容。</div>
          <div v-else class="admin-media-grid">
            <article v-for="item in mediaItems" :key="item.id" class="admin-media-card">
              <img v-if="item.kind === 'sticker'" :src="assetUrl(item.fileUrl)" :alt="item.title" />
              <audio v-else :src="assetUrl(item.fileUrl)" controls preload="metadata" />
              <div>
                <h3>{{ item.title }}</h3>
                <p>{{ item.artist || item.description || '无简介' }}</p>
                <small>{{ item.active ? '已上架' : '已下架' }} · 排序 {{ item.sortOrder }} · {{ formatSize(item.sizeBytes) }}</small>
              </div>
              <div class="admin-review-actions">
                <button class="ghost-button" type="button" @click="toggleMedia(item)">{{ item.active ? '下架' : '上架' }}</button>
                <button class="ghost-button" type="button" @click="editMedia(item)">编辑</button>
                <button class="admin-reject-button" type="button" @click="deleteMedia(item)">永久删除</button>
              </div>
            </article>
          </div>
        </section>
      </template>

      <div v-if="jokeEditor" class="admin-editor-backdrop" @click.self="jokeEditor = null">
        <section class="admin-editor-dialog" role="dialog" aria-modal="true" aria-labelledby="joke-editor-title">
          <div class="admin-editor-title">
            <div>
              <p class="eyebrow">{{ jokeEditor.kind === 'submission' ? '投稿审核' : '烂梗管理' }}</p>
              <h2 id="joke-editor-title">编辑烂梗</h2>
            </div>
            <button type="button" aria-label="关闭编辑窗口" @click="jokeEditor = null">×</button>
          </div>
          <form @submit.prevent="saveJokeEditor">
            <fieldset class="admin-tag-fieldset">
              <legend>标签 <span>可多选，最多 5 个</span></legend>
              <div v-if="editorSelectedTags.length" class="admin-selected-tags">
                <button v-for="tag in editorSelectedTags" :key="tag" type="button" @click="toggleEditorTag(tag)">#{{ tag }} ×</button>
              </div>
              <p v-else class="admin-tag-empty">暂未选择标签</p>
              <div v-if="tagSuggestions.length" class="admin-tag-suggestions">
                <span>选择已有：</span>
                <button
                  v-for="tag in visibleEditorTagSuggestions"
                  :key="tag.name"
                  type="button"
                  :class="{ active: editorHasTag(tag.name) }"
                  @click="toggleEditorTag(tag.name)"
                >{{ tag.name }} · {{ tag.count }}</button>
                <button
                  v-if="tagSuggestions.length > 10"
                  type="button"
                  class="tag-expand-button"
                  @click="showAllEditorTags = !showAllEditorTags"
                >{{ showAllEditorTags ? '收起' : `全部 ${tagSuggestions.length}` }}</button>
              </div>
              <div class="admin-new-tag-row">
                <input v-model="newEditorTag" maxlength="80" placeholder="输入新标签" @keydown.enter.prevent="addEditorTag" />
                <button type="button" @click="addEditorTag">添加</button>
              </div>
              <small>输入后按回车或点击添加；重复标签会自动合并。</small>
            </fieldset>
            <label>梗内容<textarea v-model="jokeEditor.text" maxlength="240" rows="3" required /></label>
            <div class="form-row">
              <label>分类<select v-model="jokeEditor.category"><option v-for="item in categories.slice(1)" :key="item">{{ item }}</option></select></label>
              <label>出处<input v-model="jokeEditor.source" maxlength="60" /></label>
            </div>
            <label v-if="jokeEditor.kind === 'published'" class="admin-checkbox"><input v-model="jokeEditor.featured" type="checkbox" /> 设为精选</label>
            <div class="admin-editor-actions">
              <button class="ghost-button" type="button" @click="jokeEditor = null">取消</button>
              <button class="primary-button" type="submit">保存修改</button>
            </div>
          </form>
        </section>
      </div>

      <div v-if="tagMerge" class="admin-editor-backdrop" @click.self="tagMerge = null">
        <section class="admin-editor-dialog admin-tag-merge-dialog" role="dialog" aria-modal="true" aria-labelledby="tag-merge-title">
          <div class="admin-editor-title">
            <div>
              <p class="eyebrow">标签管理</p>
              <h2 id="tag-merge-title">{{ tagMerge.mode === 'choose' ? '选择整理方式' : '合并两个标签' }}</h2>
            </div>
            <button type="button" aria-label="关闭合并窗口" @click="tagMerge = null">×</button>
          </div>
          <div v-if="tagMerge.mode === 'choose'" class="admin-tag-choice">
            <div class="admin-tag-merge-preview">
              <span>#{{ tagMerge.source }} · {{ tagUsageCount(tagMerge.source) }} 条</span>
              <b>→</b>
              <span>#{{ tagMerge.target }} · {{ tagUsageCount(tagMerge.target) }} 条</span>
            </div>
            <p>你想怎样整理这两个标签？所有操作都会同步更新相关烂梗。</p>
            <div class="admin-tag-choice-actions">
              <button class="ghost-button" type="button" :disabled="Boolean(tagNode(tagMerge.targetId)?.parentId)" @click="chooseTagParent">设为子标签</button>
              <button class="primary-button" type="button" @click="chooseTagMerge">合并两个标签</button>
            </div>
            <small v-if="tagNode(tagMerge.targetId)?.parentId">目标本身是子标签，当前一层结构只能选择合并。</small>
          </div>
          <form v-else @submit.prevent="mergeTags">
            <div class="admin-tag-merge-preview">
              <span>#{{ tagMerge.source }} · {{ tagUsageCount(tagMerge.source) }} 条</span>
              <b>＋</b>
              <span>#{{ tagMerge.target }} · {{ tagUsageCount(tagMerge.target) }} 条</span>
            </div>
            <label>
              合并后的标签名称
              <input v-model="tagMerge.name" maxlength="24" placeholder="例如：小龟" autofocus required />
            </label>
            <p class="admin-merge-warning">确认后，所有相关烂梗和投稿都会改用新名称；同一条内容中的重复标签会自动去除。</p>
            <div class="admin-editor-actions">
              <button class="ghost-button" type="button" :disabled="mergingTags" @click="tagMerge = null">取消</button>
              <button class="primary-button" type="submit" :disabled="mergingTags">{{ mergingTags ? '正在合并…' : '确认合并' }}</button>
            </div>
          </form>
        </section>
      </div>
    </main>
  </div>
</template>
