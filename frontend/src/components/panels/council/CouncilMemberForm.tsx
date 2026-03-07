import { useState, useMemo, useEffect } from 'react'
import { Plus, X } from 'lucide-react'
import type { CouncilMember, CouncilToolDefinition } from 'lumiverse-spindle-types'
import type { PackWithItems } from '@/types/api'
import { useStore } from '@/store'
import { packsApi } from '@/api/packs'
import { FormField, TextInput, Select } from '@/components/shared/FormComponents'
import NumberStepper from '@/components/shared/NumberStepper'
import styles from '../CouncilManager.module.css'

interface CouncilMemberFormProps {
  availableTools: CouncilToolDefinition[]
  onSave: (member: CouncilMember) => void
  onCancel: () => void
}

export default function CouncilMemberForm({ availableTools, onSave, onCancel }: CouncilMemberFormProps) {
  const packs = useStore((s) => s.packs)
  const packsWithItems = useStore((s) => s.packsWithItems)
  const setPackWithItems = useStore((s) => s.setPackWithItems)

  const [packId, setPackId] = useState('')
  const [itemId, setItemId] = useState('')
  const [role, setRole] = useState('')
  const [chance, setChance] = useState(100)
  const [loadingItems, setLoadingItems] = useState(false)

  const packOptions = useMemo(
    () => packs.map((p) => ({ value: p.id, label: p.name })),
    [packs]
  )

  // Fetch pack items when a pack is selected and not yet loaded
  useEffect(() => {
    if (!packId || packsWithItems[packId]) return

    setLoadingItems(true)
    packsApi.get(packId).then((data) => {
      setPackWithItems(packId, data)
    }).catch(() => {}).finally(() => {
      setLoadingItems(false)
    })
  }, [packId, packsWithItems, setPackWithItems])

  const selectedPack = packsWithItems[packId] as PackWithItems | undefined
  const lumiaItems = selectedPack?.lumia_items || []
  const itemOptions = useMemo(
    () => lumiaItems.map((item) => ({ value: item.id, label: item.name })),
    [lumiaItems]
  )

  const selectedItem = lumiaItems.find((i) => i.id === itemId)

  const handleSave = () => {
    if (!packId || !itemId || !selectedItem) return
    const selectedPackData = packs.find((p) => p.id === packId)
    onSave({
      id: crypto.randomUUID(),
      packId,
      packName: selectedPackData?.name || '',
      itemId,
      itemName: selectedItem.name,
      tools: [],
      role,
      chance,
    })
  }

  return (
    <div className={styles.memberForm}>
      <FormField label="Pack">
        <Select
          value={packId}
          onChange={(val) => {
            setPackId(val)
            setItemId('')
          }}
          options={[{ value: '', label: 'Select a pack...' }, ...packOptions]}
        />
      </FormField>

      {packId && (
        <FormField label="Lumia Item">
          {loadingItems ? (
            <div className={styles.loadingItems}>Loading items...</div>
          ) : (
            <Select
              value={itemId}
              onChange={setItemId}
              options={[{ value: '', label: 'Select a Lumia...' }, ...itemOptions]}
            />
          )}
        </FormField>
      )}

      <FormField label="Role" hint="Freeform description of this member's purpose">
        <TextInput value={role} onChange={setRole} placeholder="e.g. Plot Enforcer" />
      </FormField>

      <FormField label="Chance (%)" hint="Probability this member participates each generation">
        <NumberStepper value={chance} onChange={setChance} min={0} max={100} step={5} />
      </FormField>

      <div className={styles.formActions}>
        <button type="button" className={styles.btnPrimary} onClick={handleSave} disabled={!packId || !itemId}>
          <Plus size={14} /> Add Member
        </button>
        <button type="button" className={styles.btnSecondary} onClick={onCancel}>
          <X size={14} /> Cancel
        </button>
      </div>
    </div>
  )
}
