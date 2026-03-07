import { useState } from 'react'
import { BookOpen, Search, ChevronDown, ChevronRight } from 'lucide-react'
import { useStore } from '@/store'
import type { ActivatedWorldInfoEntry } from '@/types/api'
import styles from './WorldInfoFeedback.module.css'

export default function WorldInfoFeedback() {
  const activatedWorldInfo = useStore((s) => s.activatedWorldInfo)
  const hasEntries = activatedWorldInfo.length > 0

  const keywordEntries = activatedWorldInfo.filter((e) => e.source === 'keyword')
  const vectorEntries = activatedWorldInfo.filter((e) => e.source === 'vector')

  return (
    <div className={styles.container}>
      <div className={styles.statusBar}>
        {hasEntries ? (
          <div className={styles.statusComplete}>
            <BookOpen size={14} />
            <span>{activatedWorldInfo.length} entries activated</span>
            <span className={styles.entryCount}>
              {keywordEntries.length} keyword, {vectorEntries.length} vector
            </span>
          </div>
        ) : (
          <div className={styles.statusIdle}>No activated world info entries</div>
        )}
      </div>

      {keywordEntries.length > 0 && (
        <div className={styles.sourceGroup}>
          <div className={styles.sourceHeader}>
            <span className={styles.sourceName}>Keyword Matches</span>
            <span className={styles.sourceCount}>{keywordEntries.length}</span>
          </div>
          {keywordEntries.map((entry) => (
            <EntryCard key={entry.id} entry={entry} />
          ))}
        </div>
      )}

      {vectorEntries.length > 0 && (
        <div className={styles.sourceGroup}>
          <div className={styles.sourceHeader}>
            <span className={styles.sourceName}>Vector Matches</span>
            <span className={styles.sourceCount}>{vectorEntries.length}</span>
          </div>
          {vectorEntries.map((entry) => (
            <EntryCard key={entry.id} entry={entry} />
          ))}
        </div>
      )}

      {!hasEntries && (
        <div className={styles.emptyState}>
          Activated world info entries will appear here during generation when world books are attached.
        </div>
      )}
    </div>
  )
}

function EntryCard({ entry }: { entry: ActivatedWorldInfoEntry }) {
  const [expanded, setExpanded] = useState(false)

  return (
    <div className={styles.entryCard}>
      <button type="button" className={styles.entryHeader} onClick={() => setExpanded(!expanded)}>
        <span className={styles.entryIcon}>
          {entry.source === 'keyword' ? (
            <BookOpen size={12} className={styles.keywordIcon} />
          ) : (
            <Search size={12} className={styles.vectorIcon} />
          )}
        </span>
        <span className={styles.entryComment}>{entry.comment || '(unnamed)'}</span>
        {entry.source === 'vector' && entry.score != null && (
          <span className={styles.entryScore}>dist: {entry.score.toFixed(3)}</span>
        )}
        {expanded ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
      </button>
      {expanded && (
        <div className={styles.entryContent}>
          {entry.keys.length > 0 && (
            <p className={styles.entryKeys}>
              <strong>Keys:</strong> {entry.keys.join(', ')}
            </p>
          )}
        </div>
      )}
    </div>
  )
}
