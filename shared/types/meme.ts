export type Meme = {
  id: string
  text: string
  category: string
  tags: string[]
  source?: string
  year?: number
  featured?: boolean
  copyCount?: number
}

export type MemeSubmission = Pick<Meme, 'text' | 'category' | 'tags' | 'source'>

export type MemeSubmissionReceipt = {
  id: string
  status: 'pending'
}

export type SubmissionStatus = 'pending' | 'approved' | 'rejected'
export type MediaKind = 'sticker' | 'bgm'

export type AdminJokeSubmission = MemeSubmission & {
  id: string
  status: SubmissionStatus
  rejectionReason?: string
  createdAt: string
  reviewedAt?: string
}

export type MemeListQuery = {
  query?: string
  category?: string
  tag?: string
  sort?: 'newest' | 'popular'
  page?: number
  pageSize?: number
}

export type PaginatedMemes = {
  items: Meme[]
  total: number
  page: number
  pageSize: number
}

export type MediaAsset = {
  id: string
  kind: MediaKind
  title: string
  description?: string
  artist?: string
  submitterName?: string
  fileUrl: string
  mimeType: string
  sizeBytes: number
  status: SubmissionStatus
  rejectionReason?: string
  active: boolean
  sortOrder: number
  downloadCount: number
  createdAt: string
  reviewedAt?: string
}

export type AdminRole = 'owner' | 'admin'

export type AdminSessionUser = {
  id: string
  username: string
  role: AdminRole
  active: boolean
  sessionVersion: number
}

export type AdminManagedUser = {
  id: string
  username: string
  role: AdminRole
  active: boolean
  createdAt: string
  updatedAt: string
}

export type AdminAuditLog = {
  id: string
  username: string
  action: string
  entityType: string
  entityId?: string
  details: Record<string, unknown>
  createdAt: string
}

export type TrafficAnalytics = {
  range: 7 | 30 | 90
  summary: {
    todayVisits: number
    todayVisitors: number
    totalVisits: number
    peakDailyVisits: number
    todayUserscriptInstalls: number
    totalUserscriptInstalls: number
  }
  points: Array<{
    date: string
    visits: number
    visitors: number
    userscriptInstalls: number
  }>
}
