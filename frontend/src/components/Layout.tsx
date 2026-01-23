/**
 * Layout Component
 *
 * Main application layout shell
 * Simplified from v0.2 (state now in Zustand, not here)
 */

import { Outlet } from 'react-router-dom';
import { useUIState } from '../hooks/useUIState';
import { Sidebar } from './Sidebar';
import { DetailPanel } from './DetailPanel';

export function Layout() {
  const { sidebarCollapsed, detailPanelOpen } = useUIState();

  return (
    <div className="h-screen flex bg-gray-50">
      {/* Sidebar */}
      {!sidebarCollapsed && <Sidebar />}

      {/* Main Content */}
      <main className="flex-1 flex flex-col overflow-hidden">
        <Outlet />
      </main>

      {/* Detail Panel */}
      {detailPanelOpen && (
        <div className="w-96 h-full overflow-hidden">
          <DetailPanel />
        </div>
      )}
    </div>
  );
}
