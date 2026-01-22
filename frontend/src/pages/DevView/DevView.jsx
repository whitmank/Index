import { useState, useEffect } from 'react'
import './DevView.css'

const DATABASES = [
  { namespace: 'dev', database: 'test', label: 'dev/test (default)' },
  { namespace: 'user', database: '0', label: 'user/0' }
]

function DevView() {
  const [currentDb, setCurrentDb] = useState(null)
  const [switching, setSwitching] = useState(false)
  const [error, setError] = useState(null)

  useEffect(() => {
    fetchCurrentDatabase()
  }, [])

  async function fetchCurrentDatabase() {
    try {
      const response = await fetch('/api/database')
      const data = await response.json()
      setCurrentDb(data)
    } catch (err) {
      setError('Failed to fetch current database')
    }
  }

  async function handleDatabaseChange(e) {
    const selected = DATABASES.find(
      db => `${db.namespace}/${db.database}` === e.target.value
    )
    if (!selected) return

    setSwitching(true)
    setError(null)

    try {
      const response = await fetch('/api/database', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          namespace: selected.namespace,
          database: selected.database
        })
      })

      if (!response.ok) {
        throw new Error('Failed to switch database')
      }

      const data = await response.json()
      setCurrentDb(data)

      // Update window title
      if (window.electronAPI?.setWindowTitle) {
        await window.electronAPI.setWindowTitle(`Index — ${data.namespace}/${data.database}`)
      }

      // Reload the page to refresh all data
      window.location.reload()
    } catch (err) {
      setError(err.message)
      setSwitching(false)
    }
  }

  const currentValue = currentDb
    ? `${currentDb.namespace}/${currentDb.database}`
    : ''

  return (
    <div className="content-area">
      <div className="dev-container">
        <h2>Dev View</h2>

        <div className="dev-section">
          <h3>Database</h3>
          <div className="dev-control">
            <label htmlFor="db-select">Active Database:</label>
            <select
              id="db-select"
              value={currentValue}
              onChange={handleDatabaseChange}
              disabled={switching}
            >
              {DATABASES.map(db => (
                <option
                  key={`${db.namespace}/${db.database}`}
                  value={`${db.namespace}/${db.database}`}
                >
                  {db.label}
                </option>
              ))}
            </select>
            {switching && <span className="dev-status">Switching...</span>}
          </div>
          {error && <p className="dev-error">{error}</p>}
          {currentDb && (
            <p className="dev-info">
              Connected to: {currentDb.namespace}/{currentDb.database}
            </p>
          )}
        </div>
      </div>
    </div>
  )
}

export default DevView
