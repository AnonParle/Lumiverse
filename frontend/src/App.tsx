import { useEffect } from 'react'
import { Outlet } from 'react-router'
import { useWebSocket } from '@/ws/useWebSocket'
import { useStore } from '@/store'
import { useThemeApplicator } from '@/hooks/useThemeApplicator'
import { useCharacterTheme } from '@/hooks/useCharacterTheme'
import { useAppInit } from '@/hooks/useAppInit'
import ErrorBoundary from '@/components/shared/ErrorBoundary'
import AuthGuard from '@/components/auth/AuthGuard'
import ViewportDrawer from '@/components/panels/ViewportDrawer'
import ModalContainer from '@/components/modals/ModalContainer'
import SpindleUIManager from '@/components/spindle/SpindleUIManager'
import styles from './App.module.css'

export default function App() {
  useWebSocket()
  useThemeApplicator()
  useCharacterTheme()
  useAppInit()

  const loadSettings = useStore((s) => s.loadSettings)
  const isAuthenticated = useStore((s) => s.isAuthenticated)
  useEffect(() => {
    if (isAuthenticated) {
      loadSettings()
    }
  }, [isAuthenticated, loadSettings])

  return (
    <AuthGuard>
      <div className={styles.app}>
        <ErrorBoundary label="App">
          <main className={styles.main}>
            <Outlet />
          </main>
          <ViewportDrawer />
          <ModalContainer />
          <SpindleUIManager />
        </ErrorBoundary>
      </div>
    </AuthGuard>
  )
}
