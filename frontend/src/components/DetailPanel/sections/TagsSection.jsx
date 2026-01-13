import { useState } from 'react'
import './TagsSection.css'
import SearchInput from '../../ui/SearchInput'
import useTagFilter from '../../../hooks/useTagFilter'

/**
 * Tags section with search/filter functionality
 * @param {Array} tags - Array of tag objects
 * @param {string} tagInput - Current tag input value
 * @param {Function} setTagInput - Setter for tag input
 * @param {Function} onAddTag - Callback to add a tag
 * @param {Function} onDeleteTag - Callback to delete a tag
 */
function TagsSection({ tags, tagInput, setTagInput, onAddTag, onDeleteTag }) {
  const [searchQuery, setSearchQuery] = useState('')
  const filteredTags = useTagFilter(tags, searchQuery)

  return (
    <div className="tags-section-content">
      {/* Search Input */}
      {tags && tags.length > 0 && (
        <>
          <SearchInput
            value={searchQuery}
            onChange={setSearchQuery}
            placeholder="Filter tags..."
          />
          {searchQuery && (
            <div className="tags-count">
              Showing {filteredTags.length} of {tags.length} tags
            </div>
          )}
        </>
      )}

      {/* Tags List */}
      <div className="tags-list">
        {filteredTags.length === 0 && searchQuery ? (
          <p className="no-results">No tags match "{searchQuery}"</p>
        ) : filteredTags.length === 0 ? (
          <p className="no-tags">No tags yet</p>
        ) : (
          filteredTags.map(tag => (
            <div
              key={tag.id}
              className={`tag-chip ${searchQuery ? 'highlighted' : ''}`}
            >
              {tag.tag_name}
              <button
                onClick={() => onDeleteTag(tag.id)}
                className="tag-delete"
                title="Remove tag"
              >
                ×
              </button>
            </div>
          ))
        )}
      </div>

      {/* Add Tag Form */}
      <form onSubmit={onAddTag} className="tag-form">
        <input
          type="text"
          value={tagInput}
          onChange={(e) => setTagInput(e.target.value)}
          placeholder="Add tag..."
          className="tag-input"
        />
        <button type="submit" className="btn-add-tag">Add</button>
      </form>
    </div>
  )
}

export default TagsSection
