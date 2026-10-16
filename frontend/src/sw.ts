import { clientsClaim } from 'workbox-core'
import { cleanupOutdatedCaches, createHandlerBoundToURL, precacheAndRoute } from 'workbox-precaching'
import { NavigationRoute, registerRoute } from 'workbox-routing'

declare const self: ServiceWorkerGlobalScope & {
  __WB_MANIFEST: Array<string | { url: string; revision: string | null }>
}

type PushPayload = {
  title?: string
  body?: string
  data?: { questionId?: string; url?: string }
  actions?: Array<{ action: string; title: string }>
}

const shareDatabaseName = 'cartao-shared-text'
const shareStoreName = 'incoming'
const pushActionStoreName = 'push-actions'

self.skipWaiting()
clientsClaim()
cleanupOutdatedCaches()
const precacheManifest = self.__WB_MANIFEST
precacheAndRoute(precacheManifest)

// Em desenvolvimento, o manifesto é vazio; a rota offline só existe após o build.
if (precacheManifest.some((entry) => /(^|\/)index\.html$/.test(typeof entry === 'string' ? entry : entry.url))) {
  registerRoute(
    new NavigationRoute(createHandlerBoundToURL('/index.html'), {
      denylist: [/^\/v1\//],
    }),
  )
}

function openShareDatabase(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(shareDatabaseName, 2)

    request.onupgradeneeded = () => {
      if (!request.result.objectStoreNames.contains(shareStoreName)) {
        request.result.createObjectStore(shareStoreName, { keyPath: 'id', autoIncrement: true })
      }
      if (!request.result.objectStoreNames.contains(pushActionStoreName)) {
        request.result.createObjectStore(pushActionStoreName, { keyPath: 'id', autoIncrement: true })
      }
    }
    request.onsuccess = () => resolve(request.result)
    request.onerror = () => reject(request.error)
  })
}

async function saveSharedText(text: string): Promise<void> {
  const database = await openShareDatabase()

  try {
    await new Promise<void>((resolve, reject) => {
      const transaction = database.transaction(shareStoreName, 'readwrite')
      transaction.objectStore(shareStoreName).add({ text })
      transaction.oncomplete = () => resolve()
      transaction.onerror = () => reject(transaction.error)
      transaction.onabort = () => reject(transaction.error)
    })
  } finally {
    database.close()
  }
}

async function takeSharedText(): Promise<string | null> {
  const database = await openShareDatabase()

  try {
    return await new Promise<string | null>((resolve, reject) => {
      let text: string | null = null
      const transaction = database.transaction(shareStoreName, 'readwrite')
      const request = transaction.objectStore(shareStoreName).openCursor()

      request.onsuccess = () => {
        const cursor = request.result
        if (cursor) {
          const value = cursor.value as { text?: unknown }
          text = typeof value.text === 'string' ? value.text : null
          cursor.delete()
        }
      }
      transaction.oncomplete = () => resolve(text)
      transaction.onerror = () => reject(transaction.error)
      transaction.onabort = () => reject(transaction.error)
    })
  } finally {
    database.close()
  }
}

type PendingPushAction = { questionId: string; categoryId: string }

async function savePushAction(action: PendingPushAction): Promise<void> {
  const database = await openShareDatabase()
  try {
    await new Promise<void>((resolve, reject) => {
      const transaction = database.transaction(pushActionStoreName, 'readwrite')
      transaction.objectStore(pushActionStoreName).add(action)
      transaction.oncomplete = () => resolve()
      transaction.onerror = () => reject(transaction.error)
      transaction.onabort = () => reject(transaction.error)
    })
  } finally {
    database.close()
  }
}

async function takePushAction(): Promise<PendingPushAction | null> {
  const database = await openShareDatabase()
  try {
    return await new Promise<PendingPushAction | null>((resolve, reject) => {
      let action: PendingPushAction | null = null
      const transaction = database.transaction(pushActionStoreName, 'readwrite')
      const request = transaction.objectStore(pushActionStoreName).openCursor()
      request.onsuccess = () => {
        const cursor = request.result
        if (!cursor) return
        const value = cursor.value as Partial<PendingPushAction>
        if (typeof value.questionId === 'string' && typeof value.categoryId === 'string') {
          action = { questionId: value.questionId, categoryId: value.categoryId }
        }
        cursor.delete()
      }
      transaction.oncomplete = () => resolve(action)
      transaction.onerror = () => reject(transaction.error)
      transaction.onabort = () => reject(transaction.error)
    })
  } finally {
    database.close()
  }
}

async function receiveShare(request: Request): Promise<Response> {
  try {
    const form = await request.formData()
    const text = [form.get('title'), form.get('text'), form.get('url')]
      .filter((value): value is string => typeof value === 'string' && value.trim().length > 0)
      .join('\n')
      .slice(0, 8000)

    if (text) {
      await saveSharedText(text)
    }

    return Response.redirect(new URL('/share', self.location.origin), 303)
  } catch {
    return new Response('Não foi possível receber o conteúdo compartilhado. Tente novamente.', {
      status: 503,
      headers: { 'Content-Type': 'text/plain; charset=utf-8' },
    })
  }
}

self.addEventListener('fetch', (event) => {
  const url = new URL(event.request.url)
  if (
    event.request.method === 'POST' &&
    url.origin === self.location.origin &&
    url.pathname === '/share'
  ) {
    event.respondWith(receiveShare(event.request))
  }
})

self.addEventListener('message', (event) => {
  const port = event.ports[0]
  if (!port) return
  if (event.data?.type === 'TAKE_SHARED_TEXT') {
    event.waitUntil(
      takeSharedText()
        .then((text) => port.postMessage({ type: 'SHARED_TEXT', text }))
        .catch(() => port.postMessage({ type: 'SHARED_TEXT', text: null })),
    )
  } else if (event.data?.type === 'TAKE_PUSH_ACTION') {
    event.waitUntil(
      takePushAction()
        .then((action) => port.postMessage({ type: 'PUSH_ACTION', ...(action || {}) }))
        .catch(() => port.postMessage({ type: 'PUSH_ACTION' })),
    )
  }
})

self.addEventListener('push', (event) => {
  let payload: PushPayload = {}

  try {
    payload = (event.data?.json() ?? {}) as PushPayload
  } catch {
    payload = {}
  }

  const title = typeof payload.title === 'string' ? payload.title : 'Cartão'
  const body = typeof payload.body === 'string' ? payload.body : undefined
  const data = payload.data ?? {}
  const actions = Array.isArray(payload.actions)
    ? payload.actions
        .filter((item) => typeof item.action === 'string' && typeof item.title === 'string')
        .slice(0, 2)
    : []

  const notificationOptions = {
    body,
    icon: '/icon-192.png',
    badge: '/icon-192.png',
    data,
    actions,
  }
  event.waitUntil(self.registration.showNotification(title, notificationOptions))
})

async function openOrFocus(url: URL): Promise<void> {
  const windows = await self.clients.matchAll({ type: 'window', includeUncontrolled: true })
  const existing = windows.find((client) => new URL(client.url).origin === self.location.origin)

  if (existing) {
    try {
      const navigated = await existing.navigate(url.href)
      await (navigated ?? existing).focus()
      return
    } catch {
      // Alguns navegadores não permitem navegar a janela existente.
    }
  }

  await self.clients.openWindow(url.href)
}

self.addEventListener('notificationclick', (event) => {
  event.notification.close()

  const data = event.notification.data as PushPayload['data'] | undefined
  let target: URL

  try {
    target = new URL(data?.url ?? '/', self.location.origin)
    if (target.origin !== self.location.origin) target = new URL('/', self.location.origin)
  } catch {
    target = new URL('/', self.location.origin)
  }

  const category = /^cat:([a-z0-9_]+)$/.exec(event.action)?.[1]
  if (category && typeof data?.questionId === 'string') {
    target = new URL(`/questions/${encodeURIComponent(data.questionId)}`, self.location.origin)
    event.waitUntil(
      savePushAction({ questionId: data.questionId, categoryId: category })
        .then(() => openOrFocus(target)),
    )
    return
  }

  event.waitUntil(openOrFocus(target))
})
