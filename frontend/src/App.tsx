/**
 * App Root Component
 *
 * Main application entry point
 * Configures routing and initializes data loading
 */

import { useEffect } from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { Layout } from './components/Layout';
import { ObjectsView, TagsView, CollectionsView, SettingsView } from './pages';
import { useObjectsData } from './hooks/useObjectsData';
import { useTagsData } from './hooks/useTagsData';
import { useCollectionsData } from './hooks/useCollectionsData';
import { useLinksData } from './hooks/useLinksData';
import { useLoadingState } from './hooks/useLoadingState';

/**
 * AppContent Component
 *
 * Inner component that uses hooks (must be inside provider)
 */
function AppContent() {
  // Initialize data on app mount
  // These hooks fetch from API and populate the Zustand store
  useObjectsData();
  useTagsData();
  useCollectionsData();
  useLinksData();

  const { loading, error } = useLoadingState();

  // Show loading indicator while initial data loads
  if (loading && error === null) {
    return (
      <div className="h-screen flex items-center justify-center bg-gray-50">
        <div className="text-center">
          <div className="w-12 h-12 border-4 border-gray-300 border-t-blue-600 rounded-full animate-spin mx-auto mb-4" />
          <p className="text-gray-600">Initializing application...</p>
        </div>
      </div>
    );
  }

  return (
    <Routes>
      {/* Layout wrapper with Outlet for page content */}
      <Route element={<Layout />}>
        {/* Objects view (default) */}
        <Route path="/" element={<ObjectsView />} />
        <Route path="/objects" element={<ObjectsView />} />

        {/* Tags view */}
        <Route path="/tags" element={<TagsView />} />

        {/* Collections view */}
        <Route path="/collections" element={<CollectionsView />} />

        {/* Settings view */}
        <Route path="/settings" element={<SettingsView />} />

        {/* Catch all - redirect to objects */}
        <Route path="*" element={<Navigate to="/objects" replace />} />
      </Route>
    </Routes>
  );
}

/**
 * App Root
 *
 * Sets up React Router and provides context to child components
 */
export function App() {
  return (
    <BrowserRouter>
      <AppContent />
    </BrowserRouter>
  );
}
