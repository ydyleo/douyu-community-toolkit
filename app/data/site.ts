export { categories, memes } from '#shared/data/memes'

// 后续主要修改这个文件：主播信息、分类和梗都集中在这里。
export const site = {
  streamerName: '溺水小龟',
  archiveName: '小龟烂梗补给站',
  roomUrl: 'https://www.douyu.com/9765366',
  roomId: '9765366',
  heroImage: '/images/nishuixiaogui-comic-hero.png',
  mascotImage: '/images/nishuixiaogui-mascot-v1.png',
  intro: '常用烂梗一键复制，表情包随手带走。',
  notices: [
    '水友可以投稿烂梗和表情包，审核通过后公开；点击“复制”就能直接带走。',
    '感谢 WinMiao、主任、树树、薯队、萝莉王、泰哥对本网站的技术支持与帮助。',
    '也欢迎水友们持续提出建议，一起把小龟烂梗补给站做得更好。',
    '点击任意烂梗卡片的“复制”按钮，就能把梗直接带走。',
  ],
}

export const emojiPacks = [
  {
    name: '那咋了？',
    description: '半眯眼一脸无所谓的小龟头像，也是本站鼠标光标。',
    image: '/images/nishuixiaogui-nazhale-head-v2.png',
    format: 'PNG · 透明底',
  },
  {
    name: '我就叉！',
    description: '经典暴躁小龟，适合回击离谱发言。',
    image: '/images/nishuixiaogui-sticker.jpg',
    format: 'JPG',
  },
  {
    name: '那咋了？',
    description: '一脸无所谓的直播椅小龟，透明背景。',
    image: '/images/nishuixiaogui-mascot-v1.png',
    format: 'PNG · 透明底',
  },
  {
    name: '直播间四格',
    description: '“那咋了 / 我就操”的完整四格场景。',
    image: '/images/nishuixiaogui-comic-hero.png',
    format: 'PNG',
  },
] as const

// API 暂时不可用时使用的离线兜底曲目；正式曲目在管理后台维护。
export const bgmTracks = [
  {
    title: '今天开始自己上撤硕（龟版）',
    artist: '小龟直播间 BGM',
    src: '/audio/今天开始自己上撤硕-龟版.mp3',
  },
] as const
