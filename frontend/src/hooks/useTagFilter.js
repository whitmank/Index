import { useMemo } from 'react'

/**
 * Custom hook to filter tags based on a search query
 * @param {Array} tags - Array of tag objects with tag_name property
 * @param {string} query - Search query string
 * @returns {Array} - Filtered tags array
 */
function useTagFilter(tags, query) {
  return useMemo(() => {
    if (!tags || tags.length === 0) return []
    if (!query || !query.trim()) return tags

    const q = query.toLowerCase().trim()
    return tags.filter(tag =>
      tag.tag_name.toLowerCase().includes(q)
    )
  }, [tags, query])
}

export default useTagFilter
