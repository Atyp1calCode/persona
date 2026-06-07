import { useState } from 'react'
import Chat from './components/Chat'
import Lore from './components/Lore'
import History from './components/History'
import styles from './App.module.css'

type Tab = 'chat' | 'lore' | 'history'

const TABS: Tab[] = ['chat', 'lore', 'history']

export default function App() {
  const [tab, setTab] = useState<Tab>('chat')

  return (
    <div className={styles.app}>
      <header className={styles.header}>
        <span className={styles.logo}>Persona</span>
        {TABS.map((t) => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={`${styles.tab} ${tab === t ? styles.tabActive : ''}`}
          >
            {t.charAt(0).toUpperCase() + t.slice(1)}
          </button>
        ))}
      </header>
      <main className={styles.main}>
        <div className={tab === 'chat' ? styles.tabPane : styles.tabPaneHidden}>
          <Chat />
        </div>
        <div className={tab === 'lore' ? styles.tabPane : styles.tabPaneHidden}>
          <Lore />
        </div>
        <div className={tab === 'history' ? styles.tabPane : styles.tabPaneHidden}>
          <History />
        </div>
      </main>
    </div>
  )
}
