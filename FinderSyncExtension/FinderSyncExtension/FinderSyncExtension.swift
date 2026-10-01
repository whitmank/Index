// Author: Claude Sonnet 4.6
// Finder Sync Extension — adds "Add to Index" to the top-level Finder context menu.
// On click, encodes the selected path and opens the index:// URL scheme, which the
// Electron app handles to show the import modal.

import Cocoa
import FinderSync

class FinderSyncExtension: FIFinderSync {

    override init() {
        super.init()
        // Monitor the entire home directory so the menu item appears everywhere.
        // Monitor the entire filesystem so "Add to Index" appears everywhere.
        FIFinderSyncController.default().directoryURLs = [
            URL(fileURLWithPath: "/")
        ]
    }

    override func menu(for menuKind: FIMenuKind) -> NSMenu? {
        // Show only on right-click of items or container background.
        guard menuKind == .contextualMenuForItems ||
              menuKind == .contextualMenuForContainer else {
            return nil
        }
        let menu = NSMenu(title: "")
        let item = menu.addItem(
            withTitle: "Add to Index",
            action: #selector(addToIndex(_:)),
            keyEquivalent: ""
        )
        item.image = NSImage(systemSymbolName: "circle.grid.2x2.fill",
                             accessibilityDescription: "Index")
        return menu
    }

    @IBAction func addToIndex(_ sender: AnyObject?) {
        let controller = FIFinderSyncController.default()

        // Prefer explicitly selected items; fall back to the target directory.
        let targetURL: URL?
        if let items = controller.selectedItemURLs(), let first = items.first {
            targetURL = first
        } else {
            targetURL = controller.targetedURL()
        }

        guard let url = targetURL else { return }

        let rawPath = url.path
        guard let encoded = rawPath.addingPercentEncoding(withAllowedCharacters: .urlQueryAllowed),
              let schemeURL = URL(string: "index://import?path=\(encoded)") else {
            return
        }

        NSWorkspace.shared.open(schemeURL)
    }
}
