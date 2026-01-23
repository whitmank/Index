/**
 * SettingsView Page
 *
 * Application settings and preferences
 */

export function SettingsView() {
  return (
    <div className="flex flex-col h-full overflow-hidden bg-white">
      {/* Header */}
      <div className="px-6 py-4 border-b bg-gray-50">
        <h1 className="text-2xl font-bold text-gray-900 mb-2">Settings</h1>
        <p className="text-sm text-gray-600">Configure application preferences</p>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-auto p-6">
        <div className="max-w-2xl space-y-8">
          {/* General Section */}
          <div>
            <h2 className="text-lg font-semibold mb-4">General</h2>
            <div className="space-y-4">
              <div className="flex items-center justify-between p-4 bg-gray-50 rounded">
                <div>
                  <h3 className="font-medium">Application Version</h3>
                  <p className="text-sm text-gray-600">Index v0.3</p>
                </div>
                <span className="text-gray-500">Read-only</span>
              </div>

              <div className="flex items-center justify-between p-4 bg-gray-50 rounded">
                <div>
                  <h3 className="font-medium">Database Path</h3>
                  <p className="text-xs text-gray-600 font-mono">~/.index/data</p>
                </div>
                <span className="text-gray-500">Read-only</span>
              </div>
            </div>
          </div>

          {/* UI Preferences Section */}
          <div>
            <h2 className="text-lg font-semibold mb-4">UI Preferences</h2>
            <div className="space-y-4">
              <div className="flex items-center justify-between p-4 bg-gray-50 rounded">
                <div>
                  <h3 className="font-medium">Dark Mode</h3>
                  <p className="text-sm text-gray-600">Coming soon</p>
                </div>
                <input type="checkbox" disabled className="cursor-not-allowed" />
              </div>

              <div className="flex items-center justify-between p-4 bg-gray-50 rounded">
                <div>
                  <h3 className="font-medium">Compact View</h3>
                  <p className="text-sm text-gray-600">Reduce spacing and padding</p>
                </div>
                <input type="checkbox" disabled className="cursor-not-allowed" />
              </div>

              <div className="flex items-center justify-between p-4 bg-gray-50 rounded">
                <div>
                  <h3 className="font-medium">Show Metadata</h3>
                  <p className="text-sm text-gray-600">Display file metadata in list view</p>
                </div>
                <input type="checkbox" disabled className="cursor-not-allowed" />
              </div>
            </div>
          </div>

          {/* Data Management Section */}
          <div>
            <h2 className="text-lg font-semibold mb-4">Data Management</h2>
            <div className="space-y-4">
              <button className="w-full p-4 bg-blue-50 text-blue-700 rounded hover:bg-blue-100 border border-blue-200 text-left">
                <h3 className="font-medium">Export Data</h3>
                <p className="text-sm text-blue-600">Export all objects and metadata to JSON</p>
              </button>

              <button className="w-full p-4 bg-blue-50 text-blue-700 rounded hover:bg-blue-100 border border-blue-200 text-left">
                <h3 className="font-medium">Import Data</h3>
                <p className="text-sm text-blue-600">Import objects from JSON file</p>
              </button>

              <button
                disabled
                className="w-full p-4 bg-red-50 text-red-700 rounded hover:bg-red-100 border border-red-200 text-left disabled:opacity-50 disabled:cursor-not-allowed"
              >
                <h3 className="font-medium">Clear Cache</h3>
                <p className="text-sm text-red-600">Remove cached files</p>
              </button>
            </div>
          </div>

          {/* Keyboard Shortcuts Section */}
          <div>
            <h2 className="text-lg font-semibold mb-4">Keyboard Shortcuts</h2>
            <div className="space-y-2 bg-gray-50 p-4 rounded text-sm">
              <div className="flex justify-between">
                <span>Toggle sidebar</span>
                <kbd className="px-2 py-1 bg-white border rounded text-xs">Cmd+B</kbd>
              </div>
              <div className="flex justify-between border-t pt-2">
                <span>Toggle detail panel</span>
                <kbd className="px-2 py-1 bg-white border rounded text-xs">Cmd+D</kbd>
              </div>
              <div className="flex justify-between border-t pt-2">
                <span>Focus search</span>
                <kbd className="px-2 py-1 bg-white border rounded text-xs">Cmd+K</kbd>
              </div>
              <div className="flex justify-between border-t pt-2">
                <span>Go to Objects</span>
                <kbd className="px-2 py-1 bg-white border rounded text-xs">Cmd+1</kbd>
              </div>
              <div className="flex justify-between border-t pt-2">
                <span>Go to Tags</span>
                <kbd className="px-2 py-1 bg-white border rounded text-xs">Cmd+2</kbd>
              </div>
              <div className="flex justify-between border-t pt-2">
                <span>Go to Collections</span>
                <kbd className="px-2 py-1 bg-white border rounded text-xs">Cmd+3</kbd>
              </div>
              <div className="flex justify-between border-t pt-2">
                <span>Go to Settings</span>
                <kbd className="px-2 py-1 bg-white border rounded text-xs">Cmd+,</kbd>
              </div>
            </div>
          </div>

          {/* About Section */}
          <div className="border-t pt-8">
            <h2 className="text-lg font-semibold mb-4">About</h2>
            <div className="space-y-2 text-sm text-gray-600">
              <p>
                <strong>Index</strong> is a personal information indexing and retrieval system.
              </p>
              <p>
                Built with TypeScript, React, Zustand, and Electron.
              </p>
              <p className="pt-2">
                <a href="#" className="text-blue-600 hover:underline">
                  View License
                </a>
              </p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
