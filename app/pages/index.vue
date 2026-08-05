<script setup lang="ts">
import { categories, site } from '~/data/site'
import type { MediaAsset } from '#shared/types/meme'

useSeoMeta({
  title: site.streamerName,
  description: site.intro,
  ogTitle: site.archiveName,
  ogDescription: site.intro,
})

const {
  allMemes,
  copyCounts,
  copyMeme,
  currentPage,
  draft,
  filteredMemes,
  goToPage,
  likedIds,
  pageStart,
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
  totalPages,
} = useMemeArchive()

const {
  bgmTracks,
  mediaError,
  recordStickerDownload,
  stickerSubmitting,
  stickers,
  submitSticker,
} = useMediaLibrary()
const audioPlayer = ref<HTMLAudioElement | null>(null)
const selectedTrackIndex = ref(0)
const musicPanelOpen = ref(true)
const musicEnabled = ref(true)
const isMusicPlaying = ref(false)
const autoplayBlocked = ref(false)
const currentTrack = computed(() => bgmTracks.value[selectedTrackIndex.value] ?? bgmTracks.value[0])
const showStickerSubmit = ref(false)
const stickerDraft = ref({ title: '', description: '', submitterName: '', file: null as File | null })

let unlockMusic: (() => void) | null = null

function clearMusicUnlock() {
  if (!unlockMusic) return
  window.removeEventListener('pointerdown', unlockMusic)
  unlockMusic = null
}

function waitForFirstInteraction() {
  if (unlockMusic) return
  unlockMusic = () => {
    if (musicEnabled.value && !isMusicPlaying.value) void playMusic()
    clearMusicUnlock()
  }
  window.addEventListener('pointerdown', unlockMusic, { once: true })
}

async function playMusic() {
  musicEnabled.value = true
  await nextTick()
  if (!audioPlayer.value) return
  try {
    await audioPlayer.value.play()
    autoplayBlocked.value = false
    localStorage.setItem('xiaogui-bgm', 'on')
    clearMusicUnlock()
  } catch {
    autoplayBlocked.value = true
    waitForFirstInteraction()
  }
}

function pauseMusic() {
  musicEnabled.value = false
  audioPlayer.value?.pause()
  autoplayBlocked.value = false
  localStorage.setItem('xiaogui-bgm', 'off')
  clearMusicUnlock()
}

function toggleMusic() {
  if (isMusicPlaying.value) pauseMusic()
  else void playMusic()
}

function closeMusicPanel() {
  pauseMusic()
  musicPanelOpen.value = false
}

function reopenMusicPanel() {
  musicPanelOpen.value = true
  void playMusic()
}

async function changeTrack() {
  await nextTick()
  audioPlayer.value?.load()
  if (musicEnabled.value) void playMusic()
}

function playNextTrack() {
  if (!bgmTracks.value.length) return
  selectedTrackIndex.value = (selectedTrackIndex.value + 1) % bgmTracks.value.length
  void changeTrack()
}

function selectStickerFile(event: Event) {
  stickerDraft.value.file = (event.target as HTMLInputElement).files?.[0] ?? null
}

function fileLabel(item: MediaAsset) {
  const type = item.mimeType.split('/')[1]?.toUpperCase().replace('JPEG', 'JPG') || '图片'
  return item.sizeBytes ? `${type} · ${(item.sizeBytes / 1024 / 1024).toFixed(1)}MB` : type
}

function readRequestError(value: unknown) {
  const error = value as { data?: { message?: string }, message?: string }
  return error.data?.message ?? error.message ?? '提交失败，请稍后重试'
}

function mediaToast(message: string) {
  toast.value = message
  window.setTimeout(() => {
    if (toast.value === message) toast.value = ''
  }, 2200)
}

async function submitStickerDraft() {
  if (!stickerDraft.value.title.trim() || !stickerDraft.value.file) {
    mediaToast('请填写名称并选择图片')
    return
  }
  try {
    await submitSticker({
      title: stickerDraft.value.title,
      description: stickerDraft.value.description,
      submitterName: stickerDraft.value.submitterName,
      file: stickerDraft.value.file,
    })
    stickerDraft.value = { title: '', description: '', submitterName: '', file: null }
    showStickerSubmit.value = false
    mediaToast('表情包投稿成功，审核通过后会公开')
  } catch (error) {
    mediaToast(readRequestError(error))
  }
}

onMounted(() => {
  musicEnabled.value = localStorage.getItem('xiaogui-bgm') !== 'off'
  if (musicEnabled.value) void playMusic()
})

onBeforeUnmount(clearMusicUnlock)
</script>

<template>
  <div class="site-shell">
    <header class="topbar">
      <a class="brand" href="#top" aria-label="返回顶部">
        <span class="brand-mark">梗</span>
        <span>{{ site.archiveName }}</span>
      </a>
      <nav>
        <a href="#archive">烂梗库</a>
        <a href="#emojis">表情包</a>
        <a href="#helper">小龟助手</a>
        <a href="#about">关于</a>
        <a :href="site.roomUrl" target="_blank" rel="noreferrer">直播间</a>
        <button class="nav-submit" @click="showSubmit = true">投一条</button>
      </nav>
    </header>

    <main id="top">
      <section class="hero">
        <div class="hero-copy">
          <p class="eyebrow">斗鱼 {{ site.roomId }} · 水友共建</p>
          <h1><span>{{ site.streamerName }}</span><br />烂梗补给站</h1>
          <p class="hero-catchphrase">知道了。</p>
          <p class="hero-intro">{{ site.intro }}</p>
          <p class="hero-promise">溺水小龟，定不负你！</p>
          <div class="hero-actions">
            <a class="primary-button" href="#archive">去复制烂梗 <span>↓</span></a>
            <button class="ghost-button" @click="pickRandom">随机来一条</button>
            <a class="room-link" :href="site.roomUrl" target="_blank" rel="noreferrer">斗鱼 {{ site.roomId }} ↗</a>
          </div>
        </div>
        <div class="hero-side">
          <figure class="character-frame">
            <img
              class="character-sheet"
              :src="site.heroImage"
              alt="溺水小龟直播间那咋了我就操四格漫画"
            />
            <img
              class="floating-mascot"
              :src="site.mascotImage"
              alt="坐在直播椅上摊手的溺水小龟"
            />
            <figcaption>小龟直播间 · 四格名场面</figcaption>
          </figure>
          <aside class="random-card" aria-live="polite">
            <div class="tape">随机一梗</div>
            <div class="quote-mark">“</div>
            <p>{{ randomMeme?.text || '正在捞取最新烂梗……' }}</p>
            <div class="random-meta">
              <span>{{ randomMeme ? `# ${randomMeme.category}` : '等待补给' }}</span>
              <button :disabled="!allMemes.length" @click="pickRandom" aria-label="换一条">↻</button>
            </div>
          </aside>
        </div>
      </section>

      <section class="ticker" aria-label="站点公告">
        <span>公告</span>
        <p>{{ site.notice }}</p>
        <p>点击任意卡片的复制按钮，就能把梗带走。</p>
      </section>

      <section id="archive" class="archive-section">
        <div class="section-heading">
          <div>
            <p class="eyebrow">烂梗随取随用</p>
            <h2>小龟烂梗库</h2>
          </div>
          <div class="stats" aria-label="烂梗库统计">
            <div><strong>{{ allMemes.length }}</strong><span>条烂梗</span></div>
            <div><strong>{{ totalCopies }}</strong><span>次复制</span></div>
            <div><strong>{{ likedIds.length }}</strong><span>枚红心</span></div>
          </div>
        </div>

        <div class="toolbar">
          <label class="search-box">
            <span>⌕</span>
            <input v-model="query" type="search" placeholder="搜索一句话、标签或出处…" />
          </label>
          <select v-model="sortMode" aria-label="排序方式">
            <option value="newest">默认排序</option>
            <option value="popular">复制最多</option>
          </select>
        </div>

        <div class="category-row" aria-label="梗分类">
          <button
            v-for="category in categories"
            :key="category"
            :class="{ active: selectedCategory === category }"
            @click="selectedCategory = category"
          >
            {{ category }}
          </button>
        </div>

        <div v-if="filteredMemes.length" class="meme-grid">
          <article v-for="(meme, index) in filteredMemes" :key="meme.id" class="meme-card">
            <div class="card-number">{{ String(pageStart + index + 1).padStart(2, '0') }}</div>
            <div class="card-body">
              <div class="tag-row">
                <span class="category-tag">{{ meme.category }}</span>
                <span v-for="tag in meme.tags" :key="tag">#{{ tag }}</span>
              </div>
              <p class="meme-text">{{ meme.text }}</p>
              <div class="card-footer">
                <span>{{ meme.source || '出处待考' }}<template v-if="meme.year"> · {{ meme.year }}</template></span>
                <div class="card-actions">
                  <button
                    class="like-button"
                    :class="{ liked: likedIds.includes(meme.id) }"
                    :aria-label="likedIds.includes(meme.id) ? '取消喜欢' : '喜欢'"
                    @click="toggleLike(meme.id)"
                  >♥</button>
                  <button class="copy-button" @click="copyMeme(meme)">
                    复制 <span v-if="copyCounts[meme.id]">{{ copyCounts[meme.id] }}</span>
                  </button>
                </div>
              </div>
            </div>
          </article>
        </div>
        <nav v-if="totalPages > 1" class="pagination" aria-label="烂梗库分页">
          <button type="button" :disabled="currentPage === 1" @click="goToPage(currentPage - 1)">← 上一页</button>
          <span aria-live="polite">第 <strong>{{ currentPage }}</strong> / {{ totalPages }} 页
          </span>
          <button type="button" :disabled="currentPage === totalPages" @click="goToPage(currentPage + 1)">下一页 →</button>
        </nav>
        <div v-if="!filteredMemes.length" class="empty-state">
          <strong>这段记忆暂时空白</strong>
          <p>换个关键词，或者投递第一条相关烂梗。</p>
        </div>
      </section>

      <section id="emojis" class="emoji-section">
        <div class="emoji-heading">
          <div>
            <p class="eyebrow">下载 · 投稿 · 收藏</p>
            <h2>小龟表情包</h2>
          </div>
          <div>
            <p>下载会保存到浏览器设置的默认目录。也可以投稿自己的小龟表情包，审核通过后公开。</p>
            <button class="ghost-button" type="button" @click="showStickerSubmit = true">投稿表情包</button>
          </div>
        </div>
        <p v-if="mediaError" class="media-notice">{{ mediaError }}</p>
        <div class="emoji-grid">
          <article v-for="emoji in stickers" :key="emoji.id" class="emoji-card">
            <div class="emoji-preview">
              <img :src="emoji.fileUrl" :alt="emoji.title" loading="lazy" />
            </div>
            <div class="emoji-info">
              <div>
                <span>{{ fileLabel(emoji) }}</span>
                <h3>{{ emoji.title }}</h3>
                <p>{{ emoji.description }}</p>
                <small v-if="emoji.downloadCount">{{ emoji.downloadCount }} 次下载</small>
              </div>
              <a
                :href="emoji.fileUrl"
                :download="emoji.fileUrl.split('/').pop()"
                @click="recordStickerDownload(emoji)"
              >下载原图 ↓</a>
            </div>
          </article>
        </div>
      </section>

      <section id="helper" class="helper-section">
        <div class="helper-intro">
          <p class="eyebrow">直播间烂梗助手</p>
          <h2>把烂梗库<br />搬进直播间。</h2>
          <p>打开任意斗鱼直播间都能使用。搜索烂梗后可以复制、填入弹幕框，或带 3 秒冷却地一键发送。</p>
          <a class="primary-button" href="/userscripts/nishuixiaogui-meme-helper.user.js" target="_blank">安装小龟烂梗助手 <span>↗</span></a>
          <small>安装后打开任意斗鱼直播间，就会出现可自由拖动的“小龟烂梗”按钮。</small>
        </div>
        <div class="helper-steps">
          <article><span>01</span><div><h3>安装 Tampermonkey</h3><p>在 Chrome、Edge 或 Firefox 中安装油猴扩展。</p></div></article>
          <article><span>02</span><div><h3>安装小龟助手</h3><p>点击左侧安装按钮，在油猴确认页面选择安装。</p></div></article>
          <article><span>03</span><div><h3>打开斗鱼直播间</h3><p>页面中会出现“🐢 小龟烂梗”，打开即可搜索、复制、填入或发送。</p></div></article>
        </div>
      </section>

      <section id="about" class="about-section">
        <p class="eyebrow">关于这个小站</p>
        <div>
          <h2>梗会过期，<br />记忆不会。</h2>
          <p>这是一个非官方、非商业的水友共建小站。保留上下文、注明出处，也尊重主播与其他观众。不要收录隐私信息、恶意造谣或引战内容。</p>
        </div>
      </section>
    </main>

    <footer>
      <span>溺水小龟 · 斗鱼 9765366 · Nuxt 4</span>
      <span>水友共建 · 快乐补给</span>
    </footer>

    <audio
      v-if="currentTrack"
      ref="audioPlayer"
      :src="currentTrack.fileUrl"
      preload="metadata"
      @play="isMusicPlaying = true"
      @pause="isMusicPlaying = false"
      @ended="playNextTrack"
    />

    <aside v-if="musicPanelOpen && currentTrack" class="music-player" aria-label="背景音乐播放器">
      <button class="music-disc" :class="{ playing: isMusicPlaying }" type="button" :aria-label="isMusicPlaying ? '暂停背景音乐' : '播放背景音乐'" @click="toggleMusic">
        <span>龟</span>
      </button>
      <div class="music-copy">
        <span>{{ autoplayBlocked ? '点击页面后播放' : isMusicPlaying ? '正在播放' : '已暂停' }}</span>
        <select v-model.number="selectedTrackIndex" aria-label="选择背景音乐" @change="changeTrack">
          <option v-for="(track, index) in bgmTracks" :key="track.id" :value="index">{{ track.title }}</option>
        </select>
        <small>{{ currentTrack?.artist }}</small>
      </div>
      <button class="music-toggle" type="button" @click="toggleMusic">{{ isMusicPlaying ? 'Ⅱ' : '▶' }}</button>
      <button class="music-close" type="button" aria-label="关闭背景音乐" @click="closeMusicPanel">×</button>
    </aside>
    <button v-else-if="currentTrack" class="music-reopen" type="button" aria-label="打开背景音乐" @click="reopenMusicPanel">♫</button>

    <div v-if="showSubmit" class="modal-backdrop" @click.self="showSubmit = false">
      <form class="submit-panel" @submit.prevent="submitMeme">
        <button class="close-button" type="button" aria-label="关闭" @click="showSubmit = false">×</button>
        <p class="eyebrow">水友投稿</p>
        <h2>投递一条烂梗</h2>
        <p class="form-hint">投稿会进入待审核区，审核通过后才会公开。</p>
        <label>
          梗内容
          <textarea v-model="draft.text" maxlength="240" rows="4" placeholder="原话是什么？" autofocus />
        </label>
        <div class="form-row">
          <label>
            分类
            <select v-model="draft.category">
              <option v-for="category in categories.slice(1)" :key="category">{{ category }}</option>
            </select>
          </label>
          <label>
            出处
            <input v-model="draft.source" maxlength="60" placeholder="日期 / 切片 / 场次" />
          </label>
        </div>
        <label>
          标签
          <input v-model="draft.tags" maxlength="80" placeholder="口头禅, 名场面（最多 5 个）" />
        </label>
        <button class="primary-button submit-button" type="submit">提交审核</button>
      </form>
    </div>

    <div v-if="showStickerSubmit" class="modal-backdrop" @click.self="showStickerSubmit = false">
      <form class="submit-panel" @submit.prevent="submitStickerDraft">
        <button class="close-button" type="button" aria-label="关闭" @click="showStickerSubmit = false">×</button>
        <p class="eyebrow">表情包投稿</p>
        <h2>投稿小龟表情包</h2>
        <p class="form-hint">支持 PNG、JPG、GIF、WebP，最大 8MB；审核通过后才会公开。</p>
        <label>
          表情包名称
          <input v-model="stickerDraft.title" maxlength="80" placeholder="例如：那咋了？" required />
        </label>
        <label>
          简介
          <textarea v-model="stickerDraft.description" maxlength="240" rows="3" placeholder="适合什么场景使用？" />
        </label>
        <label>
          投稿人昵称（选填）
          <input v-model="stickerDraft.submitterName" maxlength="40" placeholder="水友昵称" />
        </label>
        <label>
          图片文件
          <input type="file" accept="image/png,image/jpeg,image/gif,image/webp" required @change="selectStickerFile" />
        </label>
        <button class="primary-button submit-button" type="submit" :disabled="stickerSubmitting">
          {{ stickerSubmitting ? '上传中…' : '提交审核' }}
        </button>
      </form>
    </div>

    <Transition name="toast">
      <div v-if="toast" class="toast">{{ toast }}</div>
    </Transition>
  </div>
</template>
