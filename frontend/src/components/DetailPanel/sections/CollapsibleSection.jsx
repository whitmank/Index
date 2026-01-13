import './CollapsibleSection.css'
import useCollapsible from '../../../hooks/useCollapsible'

function CollapsibleSection({ id, title, icon, defaultOpen = true, children }) {
  const { isOpen, toggle } = useCollapsible(id, defaultOpen)

  const handleKeyDown = (e) => {
    // Allow Enter or Space to toggle
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault()
      toggle()
    }
  }

  return (
    <div className="collapsible-section">
      <div
        className="collapsible-header"
        onClick={toggle}
        onKeyDown={handleKeyDown}
        role="button"
        tabIndex={0}
        aria-expanded={isOpen}
        aria-controls={`section-content-${id}`}
      >
        <div className="collapsible-title">
          {icon && <span className="section-icon">{icon}</span>}
          {title}
        </div>
        <span className={`collapsible-icon ${isOpen ? 'open' : ''}`}>▶</span>
      </div>
      {isOpen && (
        <div
          className="collapsible-content"
          id={`section-content-${id}`}
          role="region"
        >
          {children}
        </div>
      )}
    </div>
  )
}

export default CollapsibleSection
