import { useState, useCallback } from 'react'
import { usePersonaBrowser } from '@/hooks/usePersonaBrowser'
import PersonaToolbar from './persona-browser/PersonaToolbar'
import PersonaCardGrid from './persona-browser/PersonaCardGrid'
import PersonaCardList from './persona-browser/PersonaCardList'
import PersonaEditor from './persona-browser/PersonaEditor'
import CreatePersonaForm from './persona-browser/CreatePersonaForm'
import Pagination from '@/components/shared/Pagination'
import styles from './PersonaManager.module.css'

export default function PersonaManager() {
  const browser = usePersonaBrowser()
  const [creating, setCreating] = useState(false)

  const handleCreate = useCallback(
    async (name: string, avatarFile?: File) => {
      const persona = await browser.createPersona({ name })
      if (avatarFile) {
        await browser.uploadAvatar(persona.id, avatarFile)
      }
      setCreating(false)
      browser.setSelectedPersonaId(persona.id)
    },
    [browser]
  )

  const handleDoubleClick = useCallback(
    (id: string) => {
      browser.switchToPersona(id)
    },
    [browser]
  )

  const selectedPersona = browser.allPersonas.find((p) => p.id === browser.selectedPersonaId) || null

  if (browser.loading && browser.allPersonas.length === 0) {
    return <div className={styles.loading}>Loading personas...</div>
  }

  return (
    <div className={styles.manager}>
      <PersonaToolbar
        searchQuery={browser.searchQuery}
        onSearchChange={browser.setSearchQuery}
        filterType={browser.filterType}
        onFilterTypeChange={browser.setFilterType}
        sortField={browser.sortField}
        onSortFieldChange={browser.setSortField}
        sortDirection={browser.sortDirection}
        onToggleSortDirection={browser.toggleSortDirection}
        viewMode={browser.viewMode}
        onViewModeChange={browser.setViewMode}
        onCreateClick={() => setCreating(true)}
        onRefresh={browser.refresh}
        filteredCount={browser.totalFiltered}
        totalCount={browser.allPersonas.length}
      />

      {creating && (
        <CreatePersonaForm
          onCreate={handleCreate}
          onCancel={() => setCreating(false)}
        />
      )}

      {browser.viewMode === 'grid' ? (
        <PersonaCardGrid
          personas={browser.personas}
          selectedId={browser.selectedPersonaId}
          activeId={browser.activePersonaId}
          onSelect={browser.setSelectedPersonaId}
          onDoubleClick={handleDoubleClick}
        />
      ) : (
        <PersonaCardList
          personas={browser.personas}
          selectedId={browser.selectedPersonaId}
          activeId={browser.activePersonaId}
          onSelect={browser.setSelectedPersonaId}
          onDoubleClick={handleDoubleClick}
        />
      )}

      <Pagination
        currentPage={browser.currentPage}
        totalPages={browser.totalPages}
        onPageChange={browser.setCurrentPage}
        perPage={browser.personasPerPage}
        perPageOptions={[12, 24, 50, 100]}
        onPerPageChange={browser.setPersonasPerPage}
        totalItems={browser.totalFiltered}
      />

      {selectedPersona && (
        <PersonaEditor
          persona={selectedPersona}
          isActive={browser.activePersonaId === selectedPersona.id}
          onUpdate={browser.updatePersona}
          onDelete={async (id) => {
            await browser.deletePersona(id)
          }}
          onDuplicate={browser.duplicatePersona}
          onUploadAvatar={browser.uploadAvatar}
          onToggleDefault={browser.toggleDefault}
          onSetLorebook={browser.setLorebook}
          onSwitchTo={browser.switchToPersona}
        />
      )}
    </div>
  )
}
