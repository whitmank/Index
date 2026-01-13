import { Routes, Route, Navigate } from 'react-router-dom'
import Layout from './components/Layout/Layout'
import FilesView from './pages/FilesView/FilesView'
import TagsView from './pages/TagsView/TagsView'
import CollectionsView from './pages/CollectionsView/CollectionsView'
import CollectionDetailView from './pages/CollectionDetailView/CollectionDetailView'
import DevView from './pages/DevView/DevView'

function App() {
  return (
    <Routes>
      <Route path="/" element={<Layout />}>
        <Route index element={<Navigate to="/directory" replace />} />
        <Route path="directory" element={<FilesView />} />
        <Route path="tags" element={<TagsView />} />
        <Route path="collections" element={<CollectionsView />} />
        <Route path="collections/:collectionId" element={<CollectionDetailView />} />
        <Route path="dev" element={<DevView />} />
      </Route>
    </Routes>
  )
}

export default App
