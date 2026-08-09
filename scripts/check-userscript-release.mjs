import { readFile } from 'node:fs/promises'

const root = new URL('../', import.meta.url)
const script = await readFile(new URL('public/userscripts/nishuixiaogui-meme-helper.user.js', root), 'utf8')
const release = JSON.parse(await readFile(new URL('public/userscripts/release.json', root), 'utf8'))
const scriptVersion = script.match(/^\/\/ @version\s+(.+)$/m)?.[1]?.trim()

if (!scriptVersion || scriptVersion !== release.version) {
  throw new Error(`油猴脚本版本 ${scriptVersion || '缺失'} 与发布清单版本 ${release.version || '缺失'} 不一致`)
}
if (!release.releasedAt || Number.isNaN(Date.parse(release.releasedAt))) {
  throw new Error('发布清单缺少有效的 releasedAt')
}
if (!release.downloadUrl || !Array.isArray(release.notes)) {
  throw new Error('发布清单缺少 downloadUrl 或 notes')
}
if (!Array.isArray(release.history) || release.history[0]?.version !== release.version) {
  throw new Error('发布清单 history 必须存在，且首项必须是当前版本')
}
const versions = new Set()
for (const entry of release.history) {
  if (!entry.version || versions.has(entry.version) || !entry.title || !Array.isArray(entry.notes) || Number.isNaN(Date.parse(entry.releasedAt))) {
    throw new Error(`发布清单包含无效或重复的历史版本：${entry.version || '缺失'}`)
  }
  versions.add(entry.version)
}

console.log(`油猴发布清单校验通过：v${release.version}`)
