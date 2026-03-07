import { useState, useCallback, useMemo } from 'react'
import { useStore } from '@/store'
import { messagesApi } from '@/api/chats'
import { charactersApi } from '@/api/characters'
import { personasApi } from '@/api/personas'
import type { Message } from '@/types/api'

/**
 * Strip thinking/reasoning tags from content and extract the thoughts.
 * Handles <think>, <thinking>, <reasoning> and their closing variants.
 * Returns the cleaned content and extracted reasoning text.
 */
function parseThinkingTags(content: string): { cleaned: string; thoughts: string } {
  // Match reasoning tags and consume surrounding whitespace so it doesn't
  // leak into the prompt or display as blank lines.
  const tagPattern = /\s*<(think|thinking|reasoning)>([\s\S]*?)<\/\1>\s*/gi
  let thoughts = ''
  const cleaned = content.replace(tagPattern, (_match, _tag, inner) => {
    thoughts += (thoughts ? '\n\n' : '') + inner.trim()
    return ''
  }).trim()
  return { cleaned, thoughts }
}

export function useMessageCard(message: Message, chatId: string) {
  const [isEditing, setIsEditing] = useState(false)
  const [editContent, setEditContent] = useState('')
  const updateMessage = useStore((s) => s.updateMessage)
  const removeMessage = useStore((s) => s.removeMessage)
  const activeCharacterId = useStore((s) => s.activeCharacterId)
  const characters = useStore((s) => s.characters)
  const isStreaming = useStore((s) => s.isStreaming)
  const messages = useStore((s) => s.messages)
  const activePersonaId = useStore((s) => s.activePersonaId)
  const personas = useStore((s) => s.personas)
  const autoParse = useStore((s) => s.reasoningSettings.autoParse)

  const streamingContent = useStore((s) => s.streamingContent)
  const streamingReasoning = useStore((s) => s.streamingReasoning)
  const regeneratingMessageId = useStore((s) => s.regeneratingMessageId)

  const isUser = message.is_user
  const isLastMessage = messages.length > 0 && messages[messages.length - 1].id === message.id
  const isRegenerating = isStreaming && regeneratingMessageId === message.id
  const isActivelyStreaming = isRegenerating || (isStreaming && isLastMessage && !isUser && !regeneratingMessageId)
  // When this message is being regenerated, show streaming content in-place
  // instead of the saved (blank) swipe content.
  // For non-regeneration streaming (normal generation), the streaming bubble
  // in MessageList handles display to avoid race conditions with MESSAGE_SENT.
  const rawContent = isRegenerating ? (streamingContent || message.content) : message.content

  // Auto-parse: strip thinking tags from assistant messages and extract as reasoning
  const { displayContent, parsedReasoning } = useMemo(() => {
    if (!autoParse || isUser) return { displayContent: rawContent, parsedReasoning: '' }
    const { cleaned, thoughts } = parseThinkingTags(rawContent)
    return { displayContent: cleaned || rawContent, parsedReasoning: thoughts }
  }, [rawContent, autoParse, isUser])

  // API-level reasoning takes priority; during regeneration use streaming reasoning;
  // fall back to parsed inline reasoning
  const apiReasoning = message.extra?.reasoning as string | undefined
  const reasoning = isRegenerating
    ? (streamingReasoning || parsedReasoning || undefined)
    : (apiReasoning || parsedReasoning || undefined)
  const reasoningDuration = message.extra?.reasoningDuration as number | undefined
  const tokenCount = message.extra?.tokenCount as number | undefined

  const isGroupChat = useStore((s) => s.isGroupChat)

  const userPersonaId = typeof message.extra?.persona_id === 'string' ? message.extra.persona_id : null
  const messagePersona = userPersonaId ? personas.find((p) => p.id === userPersonaId) : null
  const activeCharacter = activeCharacterId ? characters.find((c) => c.id === activeCharacterId) : null

  // In group chats, assistant messages carry character_id in message.extra
  const messageCharacterId = !isUser && isGroupChat
    ? (typeof message.extra?.character_id === 'string' ? message.extra.character_id : null)
    : null
  const effectiveCharacter = messageCharacterId
    ? characters.find((c) => c.id === messageCharacterId) ?? activeCharacter
    : activeCharacter

  const normalizedMessageName = (message.name || '').trim()
  const isGenericAssistantName = normalizedMessageName.length === 0 || /^assistant$/i.test(normalizedMessageName)
  const isGenericUserName = normalizedMessageName.length === 0 || /^user$/i.test(normalizedMessageName)

  const displayName = isUser
    ? (messagePersona?.name || (isGenericUserName ? (personas.find((p) => p.id === activePersonaId)?.name || 'User') : normalizedMessageName))
    : ((isGenericAssistantName ? effectiveCharacter?.name : normalizedMessageName) || effectiveCharacter?.name || 'Assistant')

  const effectiveCharId = messageCharacterId || activeCharacterId
  const avatarUrl = isUser
    ? (userPersonaId ? personasApi.avatarUrl(userPersonaId) : null)
    : (effectiveCharId ? charactersApi.avatarUrl(effectiveCharId) : null)

  const macroUserName = useMemo(() => {
    const fallback = personas.find((p) => p.id === activePersonaId)?.name ?? 'User'

    if (isUser) {
      return message.name || fallback
    }

    const idx = messages.findIndex((m) => m.id === message.id)
    const limit = idx >= 0 ? idx : messages.length
    for (let i = limit - 1; i >= 0; i--) {
      const m = messages[i]
      if (m.is_user && m.name?.trim()) return m.name
    }

    const firstUser = messages.find((m) => m.is_user && m.name?.trim())
    return firstUser?.name || fallback
  }, [messages, message.id, message.name, isUser, personas, activePersonaId])

  const handleEdit = useCallback(() => {
    setEditContent(message.content)
    setIsEditing(true)
  }, [message.content])

  const handleSaveEdit = useCallback(async () => {
    try {
      await messagesApi.update(chatId, message.id, { content: editContent })
      updateMessage(message.id, { content: editContent })
      setIsEditing(false)
    } catch (err) {
      console.error('[MessageCard] Failed to save edit:', err)
    }
  }, [chatId, message.id, editContent, updateMessage])

  const handleCancelEdit = useCallback(() => {
    setIsEditing(false)
    setEditContent('')
  }, [])

  const handleDelete = useCallback(async () => {
    try {
      await messagesApi.delete(chatId, message.id)
      removeMessage(message.id)
    } catch (err) {
      console.error('[MessageCard] Failed to delete:', err)
    }
  }, [chatId, message.id, removeMessage])

  return {
    isEditing,
    editContent,
    setEditContent,
    isUser,
    isLastMessage,
    isActivelyStreaming,
    displayContent,
    reasoning,
    reasoningDuration,
    tokenCount,
    avatarUrl,
    displayName,
    macroUserName,
    handleEdit,
    handleSaveEdit,
    handleCancelEdit,
    handleDelete,
  }
}
