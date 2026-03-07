import type { StateCreator } from 'zustand'
import type { ChatSlice } from '@/types/store'
import type { Message } from '@/types/api'

/**
 * Inline reasoning detection state machine.
 *
 * Phases:
 *   detecting  – buffering initial tokens to check if they match the reasoning prefix
 *   reasoning  – inside a think block, routing tokens to streamingReasoning
 *   content    – normal content (either prefix never matched, or suffix was found)
 */
type StreamPhase = 'detecting' | 'reasoning' | 'content'

export const createChatSlice: StateCreator<ChatSlice> = (set, get) => {
  // Closure-scoped streaming state (not in zustand — avoids re-renders)
  let streamPhase: StreamPhase = 'content'
  let streamBuffer = ''
  // Tracks the last generation that ended/stopped/errored, so that a late
  // `startStreaming()` call (e.g. from an HTTP response arriving after the WS
  // GENERATION_ENDED event in sidecar-council mode) doesn't restart a zombie
  // streaming state.
  let lastEndedGenerationId: string | null = null

  function resetStreamPhase() {
    streamPhase = 'detecting'
    streamBuffer = ''
  }

  function sortMessagesByPosition(messages: Message[]): Message[] {
    return [...messages].sort((a, b) => {
      if (a.index_in_chat !== b.index_in_chat) return a.index_in_chat - b.index_in_chat
      if (a.send_date !== b.send_date) return a.send_date - b.send_date
      if (a.created_at !== b.created_at) return a.created_at - b.created_at
      return a.id.localeCompare(b.id)
    })
  }

  return {
    activeChatId: null,
    activeCharacterId: null,
    messages: [],
    isStreaming: false,
    streamingContent: '',
    streamingReasoning: '',
    streamingError: null,
    activeGenerationId: null,
    regeneratingMessageId: null,
    totalChatLength: 0,

    setActiveChat: (chatId, characterId = null) => {
      resetStreamPhase()
      lastEndedGenerationId = null
      set({
        activeChatId: chatId,
        activeCharacterId: characterId,
        messages: [],
        isStreaming: false,
        streamingContent: '',
        streamingReasoning: '',
        streamingError: null,
        activeGenerationId: null,
        regeneratingMessageId: null,
      })
    },

    setMessages: (messages, total?) =>
      set({ messages: sortMessagesByPosition(messages), totalChatLength: total ?? messages.length }),

    prependMessages: (olderMessages) =>
      set((state) => {
        const existingIds = new Set(state.messages.map((m) => m.id))
        const unique = olderMessages.filter((m) => !existingIds.has(m.id))
        if (unique.length === 0) return state
        return { messages: sortMessagesByPosition([...unique, ...state.messages]) }
      }),

    addMessage: (message) =>
      set((state) => {
        const byId = state.messages.findIndex((m) => m.id === message.id)
        if (byId !== -1) {
          const messages = [...state.messages]
          messages[byId] = message
          return { messages: sortMessagesByPosition(messages) }
        }

        const messages = sortMessagesByPosition([...state.messages, message])
        return { messages, totalChatLength: messages.length }
      }),

    updateMessage: (id, updates) =>
      set((state) => {
        let idx = -1
        for (let i = state.messages.length - 1; i >= 0; i--) {
          if (state.messages[i].id === id) {
            idx = i
            break
          }
        }
        if (idx === -1) return { messages: state.messages }
        const messages = [...state.messages]
        messages[idx] = { ...messages[idx], ...updates }
        return { messages }
      }),

    removeMessage: (id) =>
      set((state) => {
        let idx = -1
        for (let i = state.messages.length - 1; i >= 0; i--) {
          if (state.messages[i].id === id) {
            idx = i
            break
          }
        }
        if (idx === -1) return { messages: state.messages }
        const messages = state.messages.filter((_m, i) => i !== idx)
        return { messages, totalChatLength: messages.length }
      }),

    startStreaming: (generationId, regeneratingMessageId) => {
      // Guard: don't restart a generation that already completed (race condition
      // in sidecar-council mode where GENERATION_ENDED arrives before the HTTP
      // response that triggers this call from InputArea).
      if (generationId === lastEndedGenerationId) return
      // Guard: don't reset content for a generation that's already streaming
      // (WS GENERATION_STARTED may arrive slightly before the HTTP response).
      if (generationId === get().activeGenerationId) return

      resetStreamPhase()
      set({
        isStreaming: true,
        streamingContent: '',
        streamingReasoning: '',
        streamingError: null,
        activeGenerationId: generationId,
        regeneratingMessageId: regeneratingMessageId ?? null,
      })
    },

    appendStreamToken: (token) => {
      // Read reasoning settings from the full store (all slices are merged at runtime)
      const fullStore = get() as any
      const settings = fullStore.reasoningSettings
      const autoParse = settings?.autoParse

      // If auto-parse is off, just append normally
      if (!autoParse) {
        set((state) => ({ streamingContent: state.streamingContent + token }))
        return
      }

      const rawPrefix = ((settings?.prefix as string) || '<think>\n').replace(/^\n+|\n+$/g, '')
      const rawSuffix = ((settings?.suffix as string) || '\n</think>').replace(/^\n+|\n+$/g, '')

      if (streamPhase === 'detecting') {
        streamBuffer += token
        const trimmed = streamBuffer.trimStart()

        if (trimmed.length >= rawPrefix.length && trimmed.startsWith(rawPrefix)) {
          // Full prefix matched — transition to reasoning
          streamPhase = 'reasoning'
          const afterPrefix = trimmed.slice(rawPrefix.length)
          streamBuffer = ''

          if (afterPrefix) {
            // Check if the suffix is already in the leftover
            const suffixIdx = afterPrefix.indexOf(rawSuffix)
            if (suffixIdx !== -1) {
              streamPhase = 'content'
              const reasoning = afterPrefix.slice(0, suffixIdx)
              const afterSuffix = afterPrefix.slice(suffixIdx + rawSuffix.length)
              set((state) => ({
                streamingReasoning: state.streamingReasoning + reasoning,
                streamingContent: state.streamingContent + afterSuffix,
              }))
            } else {
              set((state) => ({ streamingReasoning: state.streamingReasoning + afterPrefix }))
            }
          }
        } else if (rawPrefix.startsWith(trimmed)) {
          // Partial match — keep buffering
        } else {
          // No match — flush buffer to content
          streamPhase = 'content'
          const flushed = streamBuffer
          streamBuffer = ''
          set((state) => ({ streamingContent: state.streamingContent + flushed }))
        }
      } else if (streamPhase === 'reasoning') {
        set((state) => {
          const newReasoning = state.streamingReasoning + token
          const suffixIdx = newReasoning.indexOf(rawSuffix)
          if (suffixIdx !== -1) {
            // Suffix found — split and transition to content
            streamPhase = 'content'
            const reasoning = newReasoning.slice(0, suffixIdx)
            const afterSuffix = newReasoning.slice(suffixIdx + rawSuffix.length)
            return {
              streamingReasoning: reasoning,
              streamingContent: state.streamingContent + afterSuffix,
            }
          }
          return { streamingReasoning: newReasoning }
        })
      } else {
        // 'content' phase — normal append
        set((state) => ({ streamingContent: state.streamingContent + token }))
      }
    },

    appendStreamReasoning: (token) =>
      set((state) => ({ streamingReasoning: state.streamingReasoning + token })),

    endStreaming: () => {
      lastEndedGenerationId = get().activeGenerationId
      streamPhase = 'content'
      set({ isStreaming: false, streamingContent: '', streamingReasoning: '', streamingError: null, activeGenerationId: null, regeneratingMessageId: null })
    },

    stopStreaming: () => {
      lastEndedGenerationId = get().activeGenerationId
      streamPhase = 'content'
      set({ isStreaming: false, streamingContent: '', streamingReasoning: '', streamingError: null, activeGenerationId: null, regeneratingMessageId: null })
    },

    setStreamingError: (error) => {
      lastEndedGenerationId = get().activeGenerationId
      streamPhase = 'content'
      set({ streamingError: error, isStreaming: false, activeGenerationId: null, regeneratingMessageId: null })
    },
  }
}
