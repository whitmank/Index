import { useOutletContext } from 'react-router-dom'
import FileListTable from '../../components/FileListTable/FileListTable'

function FilesView() {
  const {
    filteredAndSortedNodes,
    selectedNodeIds,
    sortField,
    sortDirection,
    handleRowClick,
    handleSort,
    getFileIconColor
  } = useOutletContext()

  return (
    <FileListTable
      nodes={filteredAndSortedNodes}
      selectedNodeIds={selectedNodeIds}
      sortField={sortField}
      sortDirection={sortDirection}
      handleRowClick={handleRowClick}
      handleSort={handleSort}
      getFileIconColor={getFileIconColor}
    />
  )
}

export default FilesView
