import type { StateCreator } from 'zustand'
import type { UISlice } from '@/types/store'

export const createUISlice: StateCreator<UISlice> = (set) => ({
  activeModal: null,
  modalProps: {},
  isLoading: false,
  error: null,
  drawerOpen: false,
  drawerTab: null,
  settingsModalOpen: false,
  settingsActiveView: 'general',
  portraitPanelOpen: false,

  openModal: (name, props = {}) => set({ activeModal: name, modalProps: props }),
  closeModal: () => set({ activeModal: null, modalProps: {} }),
  setLoading: (loading) => set({ isLoading: loading }),
  setError: (error) => set({ error }),

  openDrawer: (tab) =>
    set((state) => ({
      drawerOpen: true,
      drawerTab: tab ?? state.drawerTab,
    })),
  closeDrawer: () => set({ drawerOpen: false }),
  setDrawerTab: (tab) => set({ drawerTab: tab }),

  openSettings: (view = 'general') =>
    set({ settingsModalOpen: true, settingsActiveView: view }),
  closeSettings: () => set({ settingsModalOpen: false }),

  togglePortraitPanel: () =>
    set((state) => ({ portraitPanelOpen: !state.portraitPanelOpen })),
})
