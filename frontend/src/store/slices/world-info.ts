import type { StateCreator } from 'zustand'
import type { WorldInfoSlice } from '@/types/store'

export const createWorldInfoSlice: StateCreator<WorldInfoSlice> = (set) => ({
  activatedWorldInfo: [],
  setActivatedWorldInfo: (entries) => set({ activatedWorldInfo: entries }),
  clearActivatedWorldInfo: () => set({ activatedWorldInfo: [] }),
})
