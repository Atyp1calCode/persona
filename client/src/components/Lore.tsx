import { useEffect, useState } from 'react'
import { API_LORE } from '../constants'
import styles from './Lore.module.css'

interface LoreItem {
  id: string
  name: string
  text: string
}

export default function Lore() {
  const [items, setItems] = useState<LoreItem[]>([])
  const [name, setName] = useState('')
  const [content, setContent] = useState('')
  const [saving, setSaving] = useState(false)

  async function load() {
    const res = await fetch(API_LORE)
    setItems(await res.json())
  }

  useEffect(() => {
    load()
  }, [])

  async function add() {
    if (!name.trim() || !content.trim() || saving) return
    setSaving(true)
    await fetch(API_LORE, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: name.trim(), content: content.trim() }),
    })
    setName('')
    setContent('')
    setSaving(false)
    load()
  }

  async function remove(id: string) {
    await fetch(`${API_LORE}/${id}`, { method: 'DELETE' })
    setItems((prev) => prev.filter((i) => i.id !== id))
  }

  return (
    <div className={styles.container}>
      <h2 className={styles.title}>Knowledge Base</h2>

      <div className={styles.form}>
        <input
          className={styles.input}
          placeholder="Name (e.g. World setting, Character bio)"
          value={name}
          onChange={(e) => setName(e.target.value)}
        />
        <textarea
          className={styles.textarea}
          placeholder="Content"
          value={content}
          onChange={(e) => setContent(e.target.value)}
          rows={5}
        />
        <button
          className={styles.addBtn}
          onClick={add}
          disabled={saving || !name.trim() || !content.trim()}
        >
          {saving ? 'Saving…' : 'Add'}
        </button>
      </div>

      <div className={styles.list}>
        {items.length === 0 && (
          <p className={styles.empty}>No lore entries yet. Add some knowledge above.</p>
        )}
        {items.map((item) => (
          <div key={item.id} className={styles.card}>
            <div className={styles.cardHeader}>
              <strong className={styles.cardName}>{item.name}</strong>
              <button className={styles.deleteBtn} onClick={() => remove(item.id)}>
                Delete
              </button>
            </div>
            <p className={styles.cardText}>{item.text}</p>
          </div>
        ))}
      </div>
    </div>
  )
}
