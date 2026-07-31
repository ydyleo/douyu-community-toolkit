export function useApi() {
  const config = useRuntimeConfig()
  const baseURL = String(config.public.apiBase || '').replace(/\/$/, '') || undefined

  return $fetch.create({
    baseURL,
    credentials: 'include',
  })
}

export function useApiAssetUrl(path: string) {
  if (!path.startsWith('/uploads/')) return path
  const config = useRuntimeConfig()
  const baseURL = String(config.public.apiBase || '').replace(/\/$/, '')
  return baseURL ? `${baseURL}${path}` : path
}
