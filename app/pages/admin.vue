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

type Panel = 'joke-review' | 'jokes' | 'sticker-review' | 'stickers' | 'bgm' | 'security'
type JokeEditor = {
  kind: 'submission' | 'published'
  id: string
  text: string
  category: string
  source: string
  tags: string
  featured: boolean
}

const panelLabels: Record<Panel, string> = {
  'joke-review': '烂梗审核',
  jokes: '烂梗管理',
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
const showAllEditorTags = ref(false)
const showOnlyUntagged = ref(false)
const jokePage = ref(1)
const jokeEditor = ref<JokeEditor | null>(null)
const message = ref('')
const error = ref('')
const jokeDraft = ref({ text: '', category: categories[1]!, source: '', tags: '', featured: false })
const stickerUpload = ref({ title: '', description: '', file: null as File | null })
const bgmUpload = ref({ title: '', artist: '', description: '', file: null as File | null })
const newAdmin = ref({ username: '', password: '' })
const passwordChange = ref({ currentPassword: '', newPassword: '', confirmPassword: '' })
const visibleJokes = computed(() => showOnlyUntagged.value
  ? jokes.value.filter((item) => !item.tags.length)
  : jokes.value)
const jokePageSize = 10
const jokeTotalPages = computed(() => Math.max(1, Math.ceil(visibleJokes.value.length / jokePageSize)))
const paginatedJokes = computed(() => visibleJokes.value.slice((jokePage.value - 1) * jokePageSize, jokePage.value * jokePageSize))
const visibleEditorTagSuggestions = computed(() => showAllEditorTags.value
  ? tagSuggestions.value
  : tagSuggestions.value.slice(0, 10))

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
}

const auditEntityLabels: Record<string, string> = {
  admin_user: '管理员',
  inside_joke: '烂梗',
  joke_submission: '烂梗投稿',
  sticker: '表情包',
  sticker_submission: '表情包投稿',
  bgm: 'BGM',
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
    } else if (activePanel.value === 'jokes') {
      const [result, tagsResult] = await Promise.all([
        api<{ items: Meme[] }>('/api/admin/jokes'),
        api<{ items: { name: string, count: number }[] }>('/api/tags', { query: { limit: 100 } }),
      ])
      jokes.value = result.items
      tagSuggestions.value = tagsResult.items
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
    message.value = '烂梗已直接加入公开列表。'
    await loadCurrentPanel()
  } catch (caught) {
    error.value = readError(caught)
  }
}

async function saveJokeEditor() {
  if (!jokeEditor.value) return
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

onMounted(async () => {
  try {
    const session = await api<{ authenticated: boolean, user?: AdminSessionUser }>('/api/admin/session')
    authenticated.value = session.authenticated
    currentUser.value = session.user ?? null
    if (authenticated.value) await loadCurrentPanel()
  } finally {
    checkingSession.value = false
  }
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
            <label>标签<input v-model="jokeDraft.tags" maxlength="80" placeholder="用逗号分隔" /></label>
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
            <article v-for="item in jokeSubmissions" :key="item.id" class="admin-submission-card">
              <div class="admin-submission-meta"><span class="category-tag">{{ item.category }}</span><time>{{ formatDate(item.createdAt) }}</time></div>
              <blockquote>{{ item.text }}</blockquote>
              <dl>
                <div><dt>出处</dt><dd>{{ item.source || '未填写' }}</dd></div>
                <div><dt>标签</dt><dd>{{ item.tags.length ? item.tags.join(' / ') : '无' }}</dd></div>
                <div v-if="item.rejectionReason"><dt>拒绝原因</dt><dd>{{ item.rejectionReason }}</dd></div>
              </dl>
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
            <span>共 {{ jokes.length }} 条，{{ jokes.filter(item => !item.tags.length).length }} 条暂无标签</span>
            <button class="ghost-button" type="button" :class="{ active: showOnlyUntagged }" @click="toggleUntaggedFilter">
              {{ showOnlyUntagged ? '显示全部' : '只看无标签' }}
            </button>
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
            <label>标签<input v-model="jokeEditor.tags" maxlength="120" placeholder="用逗号分隔，最多 5 个；不用输入 #" /></label>
            <div v-if="tagSuggestions.length" class="admin-tag-suggestions">
              <span>常用标签：</span>
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
    </main>
  </div>
</template>
