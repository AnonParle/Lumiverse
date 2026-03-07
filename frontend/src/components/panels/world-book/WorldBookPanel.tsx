import { useState, useEffect, useCallback, useRef } from 'react'
import { Plus, Trash2, BookOpen, Maximize2, ChevronDown, Upload } from 'lucide-react'
import { useStore } from '@/store'
import useIsMobile from '@/hooks/useIsMobile'
import { worldBooksApi } from '@/api/world-books'
import WorldBookEntryEditor from '@/components/shared/WorldBookEntryEditor'
import ConfirmationModal from '@/components/shared/ConfirmationModal'
import ImportWorldBookModal from '@/components/modals/ImportWorldBookModal'
import type { WorldBook, WorldBookEntry } from '@/types/api'
import styles from './WorldBookPanel.module.css'
import clsx from 'clsx'

export default function WorldBookPanel() {
  const openModal = useStore((s) => s.openModal)
  const isMobile = useIsMobile()

  // Book list state
  const [books, setBooks] = useState<WorldBook[]>([])
  const [selectedBookId, setSelectedBookId] = useState<string | null>(null)

  // Entry state
  const [entries, setEntries] = useState<WorldBookEntry[]>([])
  const [selectedEntryId, setSelectedEntryId] = useState<string | null>(null)
  const [entryTotal, setEntryTotal] = useState(0)
  const [entryOffset, setEntryOffset] = useState(0)
  const [loadingMore, setLoadingMore] = useState(false)

  // Book editing state
  const [bookFieldsOpen, setBookFieldsOpen] = useState(false)
  const [bookName, setBookName] = useState('')
  const [bookDescription, setBookDescription] = useState('')
  const [vectorStatus, setVectorStatus] = useState<string | null>(null)

  // Confirmation modals
  const [deleteBookConfirm, setDeleteBookConfirm] = useState<string | null>(null)
  const [deleteEntryConfirm, setDeleteEntryConfirm] = useState<string | null>(null)
  const [showImport, setShowImport] = useState(false)

  // Debounce refs
  const bookNameTimer = useRef<ReturnType<typeof setTimeout>>(undefined)
  const bookDescTimer = useRef<ReturnType<typeof setTimeout>>(undefined)
  const entryTimers = useRef<Record<string, ReturnType<typeof setTimeout>>>({})

  // Load books
  const loadBooks = useCallback(async () => {
    try {
      const res = await worldBooksApi.list({ limit: 200 })
      setBooks(res.data)
    } catch {}
  }, [])

  useEffect(() => {
    loadBooks()
  }, [loadBooks])

  const ENTRIES_PAGE_SIZE = 50

  // Load entries when book selected
  const loadEntries = useCallback(async (bookId: string) => {
    try {
      const res = await worldBooksApi.listEntries(bookId, { limit: ENTRIES_PAGE_SIZE, offset: 0 })
      setEntries(res.data)
      setEntryTotal(res.total)
      setEntryOffset(res.data.length)
    } catch {}
  }, [])

  const loadMoreEntries = useCallback(async () => {
    if (!selectedBookId || loadingMore) return
    setLoadingMore(true)
    try {
      const res = await worldBooksApi.listEntries(selectedBookId, { limit: ENTRIES_PAGE_SIZE, offset: entryOffset })
      setEntries((prev) => [...prev, ...res.data])
      setEntryTotal(res.total)
      setEntryOffset((prev) => prev + res.data.length)
    } catch {}
    setLoadingMore(false)
  }, [selectedBookId, entryOffset, loadingMore])

  useEffect(() => {
    if (selectedBookId) {
      loadEntries(selectedBookId)
      const book = books.find((b) => b.id === selectedBookId)
      if (book) {
        setBookName(book.name)
        setBookDescription(book.description)
      }
      setSelectedEntryId(null)
    } else {
      setEntries([])
      setEntryTotal(0)
      setEntryOffset(0)
      setSelectedEntryId(null)
    }
  }, [selectedBookId, books, loadEntries])

  // Book CRUD
  const handleCreateBook = useCallback(async () => {
    try {
      const book = await worldBooksApi.create({ name: 'New World Book' })
      setBooks((prev) => [book, ...prev])
      setSelectedBookId(book.id)
    } catch {}
  }, [])

  const handleDeleteBook = useCallback(
    async (id: string) => {
      try {
        await worldBooksApi.delete(id)
        setBooks((prev) => prev.filter((b) => b.id !== id))
        if (selectedBookId === id) {
          setSelectedBookId(null)
        }
      } catch {}
    },
    [selectedBookId]
  )

  const handleBookNameChange = useCallback(
    (value: string) => {
      setBookName(value)
      clearTimeout(bookNameTimer.current)
      bookNameTimer.current = setTimeout(() => {
        if (selectedBookId && value.trim()) {
          worldBooksApi.update(selectedBookId, { name: value.trim() })
          setBooks((prev) =>
            prev.map((b) => (b.id === selectedBookId ? { ...b, name: value.trim() } : b))
          )
        }
      }, 400)
    },
    [selectedBookId]
  )

  const handleBookDescChange = useCallback(
    (value: string) => {
      setBookDescription(value)
      clearTimeout(bookDescTimer.current)
      bookDescTimer.current = setTimeout(() => {
        if (selectedBookId) {
          worldBooksApi.update(selectedBookId, { description: value })
        }
      }, 400)
    },
    [selectedBookId]
  )

  // Entry CRUD
  const handleCreateEntry = useCallback(async () => {
    if (!selectedBookId) return
    try {
      const entry = await worldBooksApi.createEntry(selectedBookId, {
        comment: 'New Entry',
        key: [],
        content: '',
      })
      setEntries((prev) => [...prev, entry])
      setEntryTotal((prev) => prev + 1)
      setEntryOffset((prev) => prev + 1)
      setSelectedEntryId(entry.id)
    } catch {}
  }, [selectedBookId])

  const [reindexing, setReindexing] = useState(false)

  const handleReindexVectors = useCallback(async () => {
    if (!selectedBookId || reindexing) return
    try {
      setReindexing(true)
      setVectorStatus('Reindexing vectors...')
      const result = await worldBooksApi.reindexVectors(selectedBookId, {
        onProgress: (p) => {
          setVectorStatus(`Reindexing... ${p.current}/${p.total} (${p.indexed} indexed${p.failed ? `, ${p.failed} failed` : ''})`)
        },
      })
      setVectorStatus(`Done — ${result.indexed} indexed, ${result.removed} removed${result.failed ? `, ${result.failed} failed` : ''}`)
    } catch {
      setVectorStatus('Failed to reindex vectors')
    } finally {
      setReindexing(false)
    }
  }, [selectedBookId, reindexing])

  const handleDeleteEntry = useCallback(
    async (entryId: string) => {
      if (!selectedBookId) return
      try {
        await worldBooksApi.deleteEntry(selectedBookId, entryId)
        setEntries((prev) => prev.filter((e) => e.id !== entryId))
        setEntryTotal((prev) => Math.max(0, prev - 1))
        setEntryOffset((prev) => Math.max(0, prev - 1))
        if (selectedEntryId === entryId) setSelectedEntryId(null)
      } catch {}
    },
    [selectedBookId, selectedEntryId]
  )

  const updateEntry = useCallback(
    (entryId: string, updates: Record<string, any>) => {
      if (!selectedBookId) return
      setEntries((prev) => prev.map((e) => (e.id === entryId ? { ...e, ...updates } : e)))
      worldBooksApi.updateEntry(selectedBookId, entryId, updates)
    },
    [selectedBookId]
  )

  const debouncedUpdateEntry = useCallback(
    (entryId: string, updates: Record<string, any>) => {
      if (!selectedBookId) return
      setEntries((prev) => prev.map((e) => (e.id === entryId ? { ...e, ...updates } : e)))
      const key = `${entryId}-${Object.keys(updates).join(',')}`
      clearTimeout(entryTimers.current[key])
      entryTimers.current[key] = setTimeout(() => {
        worldBooksApi.updateEntry(selectedBookId, entryId, updates)
      }, 400)
    },
    [selectedBookId]
  )

  const selectedEntry = entries.find((e) => e.id === selectedEntryId) || null

  const handleImport = useCallback((book: WorldBook) => {
    setBooks((prev) => [book, ...prev])
    setSelectedBookId(book.id)
    setShowImport(false)
  }, [])

  const handlePopOut = useCallback(() => {
    openModal('worldBookEditor', { bookId: selectedBookId })
  }, [openModal, selectedBookId])

  return (
    <div className={styles.panel}>
      {/* Top bar: Book selector + actions */}
      <div className={styles.topBar}>
        <select
          className={styles.bookSelect}
          value={selectedBookId || ''}
          onChange={(e) => setSelectedBookId(e.target.value || null)}
        >
          <option value="">Select a book...</option>
          {books.map((book) => (
            <option key={book.id} value={book.id}>
              {book.name}
            </option>
          ))}
        </select>
        <button
          type="button"
          className={styles.iconBtn}
          onClick={handleCreateBook}
          title="New Book"
        >
          <Plus size={14} />
        </button>
        <button
          type="button"
          className={styles.iconBtn}
          onClick={() => setShowImport(true)}
          title="Import Book"
        >
          <Upload size={14} />
        </button>
        {!isMobile && (
          <button
            type="button"
            className={styles.iconBtn}
            onClick={handlePopOut}
            title="Pop out to modal"
          >
            <Maximize2 size={14} />
          </button>
        )}
      </div>

      {selectedBookId ? (
        <>
          {/* Book fields (collapsible) */}
          <button
            type="button"
            className={styles.bookFieldsToggle}
            onClick={() => setBookFieldsOpen((o) => !o)}
          >
            <BookOpen size={12} />
            <span className={styles.bookFieldsLabel}>{bookName || 'Book Details'}</span>
            <ChevronDown
              size={12}
              className={clsx(styles.chevron, bookFieldsOpen && styles.chevronOpen)}
            />
          </button>

          {bookFieldsOpen && (
            <div className={styles.bookFields}>
              <div className={styles.fieldGroup}>
                <label className={styles.fieldLabel}>Name</label>
                <input
                  type="text"
                  className={styles.fieldInput}
                  value={bookName}
                  onChange={(e) => handleBookNameChange(e.target.value)}
                />
              </div>
              <div className={styles.fieldGroup}>
                <label className={styles.fieldLabel}>Description</label>
                <input
                  type="text"
                  className={styles.fieldInput}
                  value={bookDescription}
                  onChange={(e) => handleBookDescChange(e.target.value)}
                  placeholder="Optional description..."
                />
              </div>
              <button
                type="button"
                className={styles.deleteBookBtn}
                onClick={() => setDeleteBookConfirm(selectedBookId)}
              >
                <Trash2 size={11} />
                Delete Book
              </button>
              <button
                type="button"
                className={styles.newEntryBtn}
                onClick={handleReindexVectors}
                disabled={reindexing}
              >
                {reindexing ? 'Reindexing...' : 'Reindex Vectors'}
              </button>
              {vectorStatus && <span className={styles.emptyState}>{vectorStatus}</span>}
            </div>
          )}

          {/* Entries header */}
          <div className={styles.entryListHeader}>
            <span className={styles.entryListTitle}>
              Entries ({entryTotal})
            </span>
            <button
              type="button"
              className={styles.newEntryBtn}
              onClick={handleCreateEntry}
            >
              <Plus size={12} />
              <span>New</span>
            </button>
          </div>

          {/* Entry list */}
          <div className={styles.entryList}>
            {entries.map((entry) => (
              <div key={entry.id}>
                <div
                  className={clsx(styles.entryRow, selectedEntryId === entry.id && styles.entryRowActive)}
                  onClick={() => setSelectedEntryId(entry.id === selectedEntryId ? null : entry.id)}
                >
                  <span className={styles.entryComment}>
                    {entry.comment || '(unnamed)'}
                  </span>
                  <span className={styles.entryKeys}>
                    {entry.key.length > 0 ? entry.key.join(', ') : '—'}
                  </span>
                  <input
                    type="checkbox"
                    className={styles.entryToggle}
                    checked={!entry.disabled}
                    title={entry.disabled ? 'Disabled' : 'Enabled'}
                    onClick={(e) => e.stopPropagation()}
                    onChange={() => updateEntry(entry.id, { disabled: !entry.disabled })}
                  />
                  <span
                    className={styles.entryDeleteBtn}
                    role="button"
                    tabIndex={0}
                    onClick={(e) => {
                      e.stopPropagation()
                      setDeleteEntryConfirm(entry.id)
                    }}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') {
                        e.stopPropagation()
                        setDeleteEntryConfirm(entry.id)
                      }
                    }}
                  >
                    <Trash2 size={11} />
                  </span>
                </div>
                {/* Inline editor on mobile */}
                {isMobile && selectedEntryId === entry.id && (
                  <WorldBookEntryEditor
                    entry={entry}
                    onUpdate={debouncedUpdateEntry}
                    onImmediateUpdate={updateEntry}
                  />
                )}
              </div>
            ))}
            {entries.length === 0 && (
              <div className={styles.emptyState}>No entries yet</div>
            )}
            {entries.length < entryTotal && (
              <button
                type="button"
                className={styles.newEntryBtn}
                onClick={loadMoreEntries}
                disabled={loadingMore}
                style={{ margin: '8px auto', display: 'block' }}
              >
                {loadingMore ? 'Loading...' : `Load More (${entries.length}/${entryTotal})`}
              </button>
            )}
          </div>

          {/* Entry editor (desktop only) */}
          {!isMobile && selectedEntry && (
            <WorldBookEntryEditor
              entry={selectedEntry}
              onUpdate={debouncedUpdateEntry}
              onImmediateUpdate={updateEntry}
            />
          )}
        </>
      ) : (
        <div className={styles.emptyState}>
          Select a book or create a new one
        </div>
      )}

      {/* Delete book confirmation */}
      {deleteBookConfirm && (
        <ConfirmationModal
          isOpen={true}
          title="Delete World Book"
          message="Delete this book and all its entries? This cannot be undone."
          variant="danger"
          confirmText="Delete"
          onConfirm={async () => {
            await handleDeleteBook(deleteBookConfirm)
            setDeleteBookConfirm(null)
          }}
          onCancel={() => setDeleteBookConfirm(null)}
        />
      )}

      {/* Delete entry confirmation */}
      {deleteEntryConfirm && (
        <ConfirmationModal
          isOpen={true}
          title="Delete Entry"
          message="Delete this entry? This cannot be undone."
          variant="danger"
          confirmText="Delete"
          onConfirm={async () => {
            await handleDeleteEntry(deleteEntryConfirm)
            setDeleteEntryConfirm(null)
          }}
          onCancel={() => setDeleteEntryConfirm(null)}
        />
      )}

      {/* Import modal */}
      {showImport && (
        <ImportWorldBookModal
          onImport={handleImport}
          onClose={() => setShowImport(false)}
        />
      )}
    </div>
  )
}
