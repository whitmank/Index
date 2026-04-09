// Author: Claude Sonnet 4.6
// ImportModal — shown when the user triggers "Add to Index" from Finder.
// Presents the folder tree with per-folder tag assignments, individual file selection,
// already-indexed detection, and optional space creation.

import { useEffect, useRef, useState, useCallback } from 'react';
import { useIndexStore } from '../store/index';
import './ImportModal.css';

// ── Utilities ─────────────────────────────────────────────────────────────────

function slugify(name) {
  return name.toLowerCase().replace(/\s+/g, '-').replace(/[^a-z0-9-]/g, '');
}

function pathToUri(filePath) {
  // encodeURI leaves / intact; handles spaces and special chars
  return 'file://' + encodeURI(filePath);
}

/** Collect all file-type nodes from a tree into a flat array. */
function collectFiles(node) {
  if (node.type === 'file') return [node];
  return (node.children || []).flatMap(collectFiles);
}

/** Walk the tree and collect all folder paths (including root). */
function collectFolderPaths(node, acc = []) {
  if (node.type === 'dir') {
    acc.push(node.path);
    (node.children || []).forEach(c => collectFolderPaths(c, acc));
  }
  return acc;
}

/**
 * Returns the list of tag strings that should be applied to a file at `filePath`,
 * given the tagsByPath map and the root node.
 */
function resolveTagsForFile(filePath, tagsByPath, rootNode) {
  const tags = new Set();
  // Root folder tags apply to everything
  (tagsByPath[rootNode.path] || []).forEach(t => tags.add(t));
  // Walk the tree to find ancestors
  function walkAncestors(node) {
    if (node.type === 'file') return node.path === filePath;
    for (const child of (node.children || [])) {
      if (walkAncestors(child)) {
        // This folder is an ancestor of the file; add its tags
        (tagsByPath[node.path] || []).forEach(t => tags.add(t));
        return true;
      }
    }
    return false;
  }
  // Only walk subfolders (root tags already added above)
  for (const child of (rootNode.children || [])) {
    walkAncestors(child);
  }
  return [...tags];
}

// ── Tag chip row ───────────────────────────────────────────────────────────────

function TagRow({ tags, onAdd, onRemove, placeholder }) {
  const [inputVal, setInputVal] = useState('');
  const inputRef = useRef(null);

  function commit() {
    const val = inputVal.trim();
    if (val && !tags.includes(val)) onAdd(val);
    setInputVal('');
  }

  return (
    <div className="import-tag-row">
      {tags.map(tag => (
        <span key={tag} className="import-tag-chip">
          {tag}
          <button className="import-tag-chip-remove" onClick={() => onRemove(tag)} tabIndex={-1}>×</button>
        </span>
      ))}
      <input
        ref={inputRef}
        className="import-tag-input"
        value={inputVal}
        placeholder={placeholder || '+ tag'}
        onChange={e => setInputVal(e.target.value)}
        onKeyDown={e => {
          if (e.key === 'Enter' || e.key === ',') { e.preventDefault(); commit(); }
          if (e.key === 'Backspace' && !inputVal && tags.length) {
            onRemove(tags[tags.length - 1]);
          }
        }}
        onBlur={commit}
      />
    </div>
  );
}

// ── Recursive folder group ─────────────────────────────────────────────────────

function FolderGroup({ node, depth, tagsByPath, setTagsByPath, selectedPaths, toggleFile, existingByUri, isRoot }) {
  const [collapsed, setCollapsed] = useState(false);

  const folderTags = tagsByPath[node.path] || [];
  const files = (node.children || []).filter(c => c.type === 'file');
  const subdirs = (node.children || []).filter(c => c.type === 'dir');

  function addTag(val) {
    setTagsByPath(prev => ({
      ...prev,
      [node.path]: [...(prev[node.path] || []), slugify(val)],
    }));
  }

  function removeTag(val) {
    setTagsByPath(prev => ({
      ...prev,
      [node.path]: (prev[node.path] || []).filter(t => t !== val),
    }));
  }

  return (
    <div className={`import-folder-group ${isRoot ? 'import-folder-group--root' : ''}`} style={{ '--depth': depth }}>
      <div className="import-folder-header">
        <button
          className="import-folder-collapse"
          onClick={() => setCollapsed(v => !v)}
          aria-label={collapsed ? 'Expand' : 'Collapse'}
        >
          {collapsed ? '▶' : '▾'}
        </button>
        <span className="import-folder-name">{node.name}</span>
        <TagRow
          tags={folderTags}
          onAdd={addTag}
          onRemove={removeTag}
          placeholder={isRoot ? '+ tag all' : '+ tag'}
        />
      </div>

      {!collapsed && (
        <div className="import-folder-children">
          {subdirs.map(sub => (
            <FolderGroup
              key={sub.path}
              node={sub}
              depth={depth + 1}
              tagsByPath={tagsByPath}
              setTagsByPath={setTagsByPath}
              selectedPaths={selectedPaths}
              toggleFile={toggleFile}
              existingByUri={existingByUri}
              isRoot={false}
            />
          ))}
          {files.map(file => {
            const uri = pathToUri(file.path);
            const existingId = existingByUri[uri.toLowerCase()];
            const checked = selectedPaths.has(file.path);
            return (
              <label key={file.path} className="import-file-row">
                <input
                  type="checkbox"
                  checked={checked}
                  onChange={() => toggleFile(file.path)}
                />
                <span className="import-file-name">{file.name}</span>
                {existingId
                  ? <span className="import-file-badge import-file-badge--existing">already indexed</span>
                  : <span className="import-file-badge import-file-badge--new">new</span>
                }
              </label>
            );
          })}
        </div>
      )}
    </div>
  );
}

// ── Main modal ─────────────────────────────────────────────────────────────────

export default function ImportModal({ isOpen, onClose, initialTree }) {
  const objects       = useIndexStore(s => s.objects);
  const tags          = useIndexStore(s => s.tags);
  const createSpace   = useIndexStore(s => s.createSpace);
  const enterSpace    = useIndexStore(s => s.enterSpace);

  const [tree, setTree]                 = useState(null);
  const [tagsByPath, setTagsByPath]     = useState({});
  const [selectedPaths, setSelectedPaths] = useState(new Set());
  const [existingByUri, setExistingByUri] = useState({});
  const [doCreateSpace, setDoCreateSpace] = useState(false);
  const [spaceMembership, setSpaceMembership] = useState('contains');
  const [importing, setImporting]       = useState(false);
  const [progress, setProgress]         = useState({ current: 0, total: 0 });
  const [error, setError]               = useState(null);

  // Reset and initialize whenever a new tree arrives
  useEffect(() => {
    if (!isOpen || !initialTree) return;
    setTree(initialTree);
    setError(null);
    setImporting(false);
    setProgress({ current: 0, total: 0 });
    setDoCreateSpace(false);
    setSpaceMembership('contains');

    // Pre-populate tags from folder names
    const initTags = {};
    collectFolderPaths(initialTree).forEach(folderPath => {
      const name = folderPath.split('/').pop();
      const tag = slugify(name);
      if (tag) initTags[folderPath] = [tag];
    });
    setTagsByPath(initTags);

    // Select all files by default
    const allFiles = collectFiles(initialTree);
    setSelectedPaths(new Set(allFiles.map(f => f.path)));

    // Build existing-object map from store
    const byUri = {};
    objects.forEach(obj => {
      (obj.sources || []).forEach(src => {
        const raw = (src.uri || '').toLowerCase();
        if (raw.startsWith('file://')) byUri[raw] = obj.id;
      });
    });
    setExistingByUri(byUri);
  }, [isOpen, initialTree]);

  useEffect(() => {
    if (!isOpen) return;
    const handler = e => { if (e.key === 'Escape' && !importing) onClose(); };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [isOpen, importing, onClose]);

  const toggleFile = useCallback((filePath) => {
    setSelectedPaths(prev => {
      const next = new Set(prev);
      if (next.has(filePath)) next.delete(filePath);
      else next.add(filePath);
      return next;
    });
  }, []);

  if (!isOpen || !tree) return null;

  const allFiles = collectFiles(tree);
  const selectedFiles = allFiles.filter(f => selectedPaths.has(f.path));
  const newCount = selectedFiles.filter(f => !existingByUri[pathToUri(f.path).toLowerCase()]).length;
  const updateCount = selectedFiles.length - newCount;

  async function handleConfirm() {
    if (selectedFiles.length === 0) return;
    setImporting(true);
    setProgress({ current: 0, total: selectedFiles.length });
    setError(null);

    const importedIds = [];
    let rootTagId = null;

    try {
      // ── Helper: find or create a tag by name, returns tagId ──
      async function resolveTagId(tagName) {
        if (!tagName) return null;
        const existing = tags.find(t => t.name?.toLowerCase() === tagName.toLowerCase());
        if (existing) return existing.id;
        const result = await window.electronAPI.db.createTag({ name: tagName });
        // createTag deduplicates — if it already exists, data holds the existing record
        if (!result.success) throw new Error(result.error);
        return result.data?.id ?? null;
      }

      // ── Import each selected file ──
      for (let i = 0; i < selectedFiles.length; i++) {
        const file = selectedFiles[i];
        setProgress({ current: i + 1, total: selectedFiles.length });

        const uri = pathToUri(file.path);
        const existingId = existingByUri[uri.toLowerCase()];
        const appliedTags = resolveTagsForFile(file.path, tagsByPath, tree);

        let objectId;

        if (existingId) {
          // Object already indexed — only add tags
          objectId = existingId;
        } else {
          // Create new object
          const result = await window.electronAPI.db.createObject({
            name: file.name.replace(/\.[^.]+$/, ''), // strip extension for display name
            sources: [{ uri }],
          });
          if (!result.success) throw new Error(result.error);
          objectId = result.data.id;
        }

        importedIds.push(objectId);

        // Assign tags
        for (const tagName of appliedTags) {
          const tagId = await resolveTagId(tagName);
          if (!tagId) continue;
          // Capture root folder tag ID for the space rule option
          if (tagName === (tagsByPath[tree.path] || [])[0] && !rootTagId) {
            rootTagId = tagId;
          }
          // Check if already assigned (avoid error on duplicate RELATE)
          const existing = await window.electronAPI.db.getTagsForObject(objectId);
          const alreadyHas = (existing.data || []).some(t => t.id === tagId);
          if (!alreadyHas) {
            await window.electronAPI.db.assignTag(objectId, tagId);
          }
        }
      }

      // ── Create space if requested ──
      if (doCreateSpace && importedIds.length > 0) {
        const spaceResult = await createSpace({ name: tree.name, query: {} });
        const spaceId = spaceResult?.data?.id;
        if (spaceId) {
          if (spaceMembership === 'contains') {
            for (const objId of importedIds) {
              await window.electronAPI.db.addContains(spaceId, objId);
            }
          } else if (spaceMembership === 'rule' && rootTagId) {
            await window.electronAPI.db.updateSpace(spaceId, {
              query: { all: [rootTagId], any: [], none: [] },
            });
          }
          enterSpace(spaceId);
        }
      }

      onClose();
    } catch (err) {
      console.error('[ImportModal] Import failed:', err);
      setError(err.message);
      setImporting(false);
    }
  }

  const rootFolderTag = (tagsByPath[tree.path] || [])[0] || slugify(tree.name);

  return (
    <div className="import-modal-backdrop" onMouseDown={e => { if (e.target === e.currentTarget && !importing) onClose(); }}>
      <div className="import-modal" role="dialog" aria-modal="true" aria-label={`Import from ${tree.name}`}>

        <div className="import-modal-header">
          <span className="import-modal-title">Import from <strong>{tree.name}</strong></span>
          <button className="import-modal-close" onClick={onClose} disabled={importing} aria-label="Close">×</button>
        </div>

        <div className="import-modal-body">
          {/* Tree */}
          <div className="import-tree">
            <FolderGroup
              node={tree}
              depth={0}
              tagsByPath={tagsByPath}
              setTagsByPath={setTagsByPath}
              selectedPaths={selectedPaths}
              toggleFile={toggleFile}
              existingByUri={existingByUri}
              isRoot={true}
            />
          </div>

          {/* Space creation */}
          <div className="import-space-section">
            <label className="import-space-toggle">
              <input
                type="checkbox"
                checked={doCreateSpace}
                onChange={e => setDoCreateSpace(e.target.checked)}
                disabled={importing}
              />
              <span>Create space <strong>{tree.name}</strong></span>
            </label>

            {doCreateSpace && (
              <div className="import-space-options">
                <label className="import-space-option">
                  <input
                    type="radio"
                    name="spaceMembership"
                    value="contains"
                    checked={spaceMembership === 'contains'}
                    onChange={() => setSpaceMembership('contains')}
                    disabled={importing}
                  />
                  <span>Contains — manually add all imported objects</span>
                </label>
                <label className="import-space-option">
                  <input
                    type="radio"
                    name="spaceMembership"
                    value="rule"
                    checked={spaceMembership === 'rule'}
                    onChange={() => setSpaceMembership('rule')}
                    disabled={importing}
                  />
                  <span>Rule — match tag <em>{rootFolderTag}</em></span>
                </label>
              </div>
            )}
          </div>

          {error && <div className="import-error">{error}</div>}
        </div>

        <div className="import-modal-footer">
          <button className="import-btn import-btn--cancel" onClick={onClose} disabled={importing}>
            Cancel
          </button>
          <div className="import-footer-right">
            {importing && (
              <span className="import-progress">
                {progress.current} / {progress.total}
              </span>
            )}
            <button
              className="import-btn import-btn--confirm"
              onClick={handleConfirm}
              disabled={importing || selectedFiles.length === 0}
            >
              {importing
                ? 'Importing…'
                : `Import ${newCount > 0 ? newCount + ' new' : ''}${newCount > 0 && updateCount > 0 ? ', ' : ''}${updateCount > 0 ? updateCount + ' updated' : ''}`
              }
            </button>
          </div>
        </div>

      </div>
    </div>
  );
}
