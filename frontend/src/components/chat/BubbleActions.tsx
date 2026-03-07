import { useState, useCallback } from 'react'
import { Copy, Check, Pencil, Trash2 } from 'lucide-react'
import styles from './BubbleActions.module.css'

interface BubbleActionsProps {
  onEdit: () => void
  onDelete: () => void
  className?: string
}

export default function BubbleActions({ onEdit, onDelete, className }: BubbleActionsProps) {
  const [copied, setCopied] = useState(false)

  const handleCopy = useCallback(() => {
    setCopied(true)
    setTimeout(() => setCopied(false), 1500)
  }, [])

  return (
    <div className={className ? `${styles.pill} ${className}` : styles.pill}>
      <button type="button" onClick={handleCopy} title="Copy" aria-label="Copy">
        {copied ? <Check size={13} /> : <Copy size={13} />}
      </button>
      <button type="button" onClick={onEdit} title="Edit" aria-label="Edit">
        <Pencil size={13} />
      </button>
      <button type="button" onClick={onDelete} title="Delete" aria-label="Delete">
        <Trash2 size={13} />
      </button>
    </div>
  )
}
