import type { StateCreator } from 'zustand'
import type { PresetsSlice } from '@/types/store'
import { settingsApi } from '@/api/settings'

export const createPresetsSlice: StateCreator<PresetsSlice> = (set) => ({
  presets: {},
  activePresetId: null,
  activeLoomPresetId: null,
  loomRegistry: {},

  setPresets: (presets) => set({ presets }),
  setActivePreset: (id) => set({ activePresetId: id }),
  setActiveLoomPreset: (id) => {
    set({ activeLoomPresetId: id })
    settingsApi.put('activeLoomPresetId', id).catch(() => {})
  },
  setLoomRegistry: (registry) => set({ loomRegistry: registry }),
})
