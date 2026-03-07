import { useState, useCallback, useLayoutEffect, useMemo, useRef, useEffect } from 'react'
import { messagesApi } from '@/api/chats'
import { useStore } from '@/store'
import type { Message } from '@/types/api'

const CHUNK_SIZE = 50
const MAX_DOM_MESSAGES = 500
const SERVER_PAGE_SIZE = 100

export function useChunkedMessages(messages: Message[], chatId?: string | null) {
  const [displayCount, setDisplayCount] = useState(CHUNK_SIZE)
  const [loadingOlder, setLoadingOlder] = useState(false)
  const loadingRef = useRef(false)
  const prevLengthRef = useRef(0)
  const prevChatIdRef = useRef(chatId)

  const totalChatLength = useStore((s) => s.totalChatLength)
  const prependMessages = useStore((s) => s.prependMessages)

  useLayoutEffect(() => {
    if (chatId !== prevChatIdRef.current) {
      prevChatIdRef.current = chatId
      setDisplayCount(CHUNK_SIZE)
      prevLengthRef.current = messages.length
    }
  }, [chatId, messages.length])

  useEffect(() => {
    const currentLength = messages.length
    if (currentLength < prevLengthRef.current - 10) {
      setDisplayCount(CHUNK_SIZE)
    }
    prevLengthRef.current = currentLength
  }, [messages.length])

  const visibleMessages = useMemo(() => {
    const start = Math.max(0, messages.length - displayCount)
    return messages.slice(start).filter((m) => !m.extra?._loom_inject)
  }, [messages, displayCount])

  // There are more messages to show: either in-memory or on the server
  const hasMore = useMemo(
    () => messages.length > displayCount || messages.length < totalChatLength,
    [messages.length, displayCount, totalChatLength]
  )

  const loadMore = useCallback(() => {
    if (loadingRef.current) return
    loadingRef.current = true

    // If we have more in-memory messages to reveal, just expand the display window
    if (messages.length > displayCount) {
      setDisplayCount((prev) => Math.min(prev + CHUNK_SIZE, MAX_DOM_MESSAGES))
      setTimeout(() => { loadingRef.current = false }, 100)
      return
    }

    // Otherwise fetch older messages from the server
    if (!chatId || messages.length >= totalChatLength) {
      loadingRef.current = false
      return
    }

    // Calculate the offset for the next batch of older messages
    const oldestLoaded = messages.length > 0 ? messages[0].index_in_chat : 0
    const offset = Math.max(0, oldestLoaded - SERVER_PAGE_SIZE)
    const limit = oldestLoaded - offset

    if (limit <= 0) {
      loadingRef.current = false
      return
    }

    setLoadingOlder(true)
    messagesApi
      .list(chatId, { limit, offset })
      .then((result) => {
        prependMessages(result.data)
        // Expand display count to show the newly loaded messages
        setDisplayCount((prev) => Math.min(prev + result.data.length, MAX_DOM_MESSAGES))
      })
      .catch((err) => {
        console.error('[useChunkedMessages] Failed to load older messages:', err)
      })
      .finally(() => {
        setLoadingOlder(false)
        setTimeout(() => { loadingRef.current = false }, 100)
      })
  }, [chatId, messages, displayCount, totalChatLength, prependMessages])

  const resetToBottom = useCallback(() => {
    setDisplayCount(CHUNK_SIZE)
  }, [])

  return {
    visibleMessages,
    hasMore,
    loadMore,
    loadingOlder,
    resetToBottom,
    totalCount: totalChatLength,
    displayCount: Math.min(displayCount, messages.length),
  }
}
