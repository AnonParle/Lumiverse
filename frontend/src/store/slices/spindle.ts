import type { StateCreator } from 'zustand'
import type { SpindleSlice } from '@/types/store'
import { spindleApi } from '@/api/spindle'
import { loadFrontendExtension, unloadFrontendExtension } from '@/lib/spindle/loader'

export const createSpindleSlice: StateCreator<SpindleSlice> = (set) => ({
  extensions: [],

  loadExtensions: async () => {
    try {
      const extensions = await spindleApi.list()
      set({ extensions })

      await Promise.all(
        extensions.map(async (ext) => {
          if (ext.enabled && ext.has_frontend) {
            const manifest = await spindleApi.getManifest(ext.id)
            await loadFrontendExtension(ext.id, manifest)
          } else {
            await unloadFrontendExtension(ext.id)
          }
        })
      )
    } catch (err) {
      console.error('[Spindle] Failed to load extensions:', err)
    }
  },

  installExtension: async (githubUrl: string) => {
    const ext = await spindleApi.install(githubUrl)
    set((state) => ({ extensions: [ext, ...state.extensions] }))
  },

  updateExtension: async (id: string) => {
    const updated = await spindleApi.update(id)
    set((state) => ({
      extensions: state.extensions.map((e) => (e.id === id ? updated : e)),
    }))
  },

  removeExtension: async (id: string) => {
    await spindleApi.remove(id)
    await unloadFrontendExtension(id)
    set((state) => ({
      extensions: state.extensions.filter((e) => e.id !== id),
    }))
  },

  enableExtension: async (id: string) => {
    await spindleApi.enable(id)

    const manifest = await spindleApi.getManifest(id)
    await loadFrontendExtension(id, manifest)
    set((state) => ({
      extensions: state.extensions.map((e) =>
        e.id === id ? { ...e, enabled: true, status: 'running' as const } : e
      ),
    }))
  },

  disableExtension: async (id: string) => {
    await spindleApi.disable(id)
    await unloadFrontendExtension(id)
    set((state) => ({
      extensions: state.extensions.map((e) =>
        e.id === id ? { ...e, enabled: false, status: 'stopped' as const } : e
      ),
    }))
  },

  restartExtension: async (id: string) => {
    await unloadFrontendExtension(id)
    await spindleApi.restart(id)
    const manifest = await spindleApi.getManifest(id)
    await loadFrontendExtension(id, manifest)
  },

  grantPermission: async (id: string, permission: string) => {
    const result = await spindleApi.setPermissions(id, { grant: [permission] })
    set((state) => ({
      extensions: state.extensions.map((e) =>
        e.id === id ? { ...e, granted_permissions: result.granted as any } : e
      ),
    }))
  },

  revokePermission: async (id: string, permission: string) => {
    const result = await spindleApi.setPermissions(id, { revoke: [permission] })
    set((state) => ({
      extensions: state.extensions.map((e) =>
        e.id === id ? { ...e, granted_permissions: result.granted as any } : e
      ),
    }))
  },
})
