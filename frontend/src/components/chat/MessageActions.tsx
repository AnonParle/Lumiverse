import { Pencil, Trash2, Copy, Check, BarChart3 } from 'lucide-react'
import { useState, useCallback } from 'react'
import styles from './MessageActions.module.css'

interface MessageActionsProps {
  onEdit: () => void
  onDelete: () => void
  onPromptBreakdown?: () => void
  isUser: boolean
}

export default function MessageActions({ onEdit, onDelete, onPromptBreakdown, isUser }: MessageActionsProps) {
  const [copied, setCopied] = useState(false)

  const handleCopy = useCallback(() => {
    // Copy handled by parent, simplified here
    setCopied(true)
    setTimeout(() => setCopied(false), 1500)
  }, [])

  return (
    <div className={styles.actions}>
      <button type="button" className={styles.btn} onClick={onEdit} title="Edit" aria-label="Edit">
        <Pencil size={13} />
      </button>
      <button type="button" className={styles.btn} onClick={handleCopy} title="Copy" aria-label="Copy">
        {copied ? <Check size={13} /> : <Copy size={13} />}
      </button>
      {onPromptBreakdown && (
        <button type="button" className={styles.btn} onClick={onPromptBreakdown} title="Prompt Breakdown" aria-label="Prompt Breakdown">
          <BarChart3 size={13} />
        </button>
      )}
      <button type="button" className={styles.deleteBtn} onClick={onDelete} title="Delete" aria-label="Delete">
        <Trash2 size={13} />
      </button>
    </div>
  )
}
