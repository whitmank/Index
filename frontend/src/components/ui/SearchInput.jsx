import './SearchInput.css'

/**
 * Reusable search input component with icon
 * @param {string} value - Current search value
 * @param {Function} onChange - Callback when value changes
 * @param {string} placeholder - Placeholder text (default: "Search...")
 * @param {string} className - Additional CSS class
 */
function SearchInput({ value, onChange, placeholder = "Search...", className = "" }) {
  return (
    <div className={`search-input-wrapper ${className}`}>
      <span className="search-icon">🔍</span>
      <input
        type="text"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className="search-input"
      />
      {value && (
        <button
          onClick={() => onChange('')}
          className="search-clear"
          title="Clear search"
          type="button"
        >
          ×
        </button>
      )}
    </div>
  )
}

export default SearchInput
