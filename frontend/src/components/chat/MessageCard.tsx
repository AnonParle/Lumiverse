import { memo } from 'react'
import { useStore } from '@/store'
import BubbleMessage from './BubbleMessage'
import MinimalMessage from './MinimalMessage'
import type { Message } from '@/types/api'

interface MessageCardProps {
  message: Message
  chatId: string
}

const MessageCard = memo(function MessageCard({ message, chatId }: MessageCardProps) {
  const displayMode = useStore((s) => s.chatSheldDisplayMode)

  if (displayMode === 'bubble') {
    return <BubbleMessage message={message} chatId={chatId} />
  }

  return <MinimalMessage message={message} chatId={chatId} />
})

export default MessageCard
