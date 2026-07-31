import type { Meme } from '../types/meme'

export const categories = ['全部', '经典语录', '直播事故', '观众二创', '年度名场面']

export const memes: Meme[] = [
  {
    id: 'demo-001',
    text: '示例梗：这里换成主播最广为人知的经典语录。',
    category: '经典语录',
    tags: ['入坑必读', '口头禅'],
    source: '某次直播',
    year: 2026,
    featured: true,
  },
  {
    id: 'demo-002',
    text: '示例梗：当事人沉默了，弹幕却整齐地刷了起来。',
    category: '直播事故',
    tags: ['名场面', '节目效果'],
    source: '直播切片 00:42',
    year: 2026,
  },
  {
    id: 'demo-003',
    text: '示例梗：水友在原句上又加了一层，最终无人记得原版。',
    category: '观众二创',
    tags: ['弹幕', '二创'],
    source: '评论区考古',
    year: 2025,
  },
  {
    id: 'demo-004',
    text: '示例梗：年度最佳回旋镖，建议配合前后两段录像食用。',
    category: '年度名场面',
    tags: ['回旋镖', '年度精选'],
    source: '年终回顾',
    year: 2025,
    featured: true,
  },
]
