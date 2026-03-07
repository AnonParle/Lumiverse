import styles from './MessageEditArea.module.css'

interface MessageEditAreaProps {
  editContent: string
  onChangeContent: (value: string) => void
  onSave: () => void
  onCancel: () => void
}

export default function MessageEditArea({ editContent, onChangeContent, onSave, onCancel }: MessageEditAreaProps) {
  return (
    <div className={styles.editArea}>
      <textarea
        className={styles.editTextarea}
        value={editContent}
        onChange={(e) => onChangeContent(e.target.value)}
        autoFocus
      />
      <div className={styles.editActions}>
        <button type="button" onClick={onCancel} className={styles.editCancelBtn}>
          Cancel
        </button>
        <button type="button" onClick={onSave} className={styles.editSaveBtn}>
          Save
        </button>
      </div>
    </div>
  )
}
