import { useState, useCallback } from 'react'

/**
 * Custom hook to manage collapsible section state with localStorage persistence
 * @param {string} sectionId - Unique identifier for the section
 * @param {boolean} defaultOpen - Default open/closed state (default: true)
 * @returns {Object} - { isOpen, toggle, setIsOpen }
 */
function useCollapsible(sectionId, defaultOpen = true) {
  // Initialize state from localStorage or use default
  const [isOpen, setIsOpen] = useState(() => {
    try {
      const stored = localStorage.getItem(`section-${sectionId}`)
      return stored !== null ? JSON.parse(stored) : defaultOpen
    } catch (error) {
      console.error('Error reading from localStorage:', error)
      return defaultOpen
    }
  })

  // Toggle function that also persists to localStorage
  const toggle = useCallback(() => {
    setIsOpen(prev => {
      const nextValue = !prev
      try {
        localStorage.setItem(`section-${sectionId}`, JSON.stringify(nextValue))
      } catch (error) {
        console.error('Error writing to localStorage:', error)
      }
      return nextValue
    })
  }, [sectionId])

  return { isOpen, toggle, setIsOpen }
}

export default useCollapsible
