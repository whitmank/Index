import { useState, useEffect } from 'react';
import { useObjectsStore } from './store/objects';
import { useKeyboardShortcuts } from './hooks/useKeyboardShortcuts';
import './App.css';

/**
 * Clean URI by removing extraneous quotation marks
 * Handles single quotes, double quotes, and backticks
 */
function cleanSourceURI(source) {
  if (!source || typeof source !== 'string') {
    return source;
  }

  let cleaned = source.trim();

  // Remove matching quotes from start and end
  if ((cleaned.startsWith('"') && cleaned.endsWith('"')) ||
      (cleaned.startsWith("'") && cleaned.endsWith("'")) ||
      (cleaned.startsWith('`') && cleaned.endsWith('`'))) {
    cleaned = cleaned.slice(1, -1);
  }

  return cleaned;
}

export default function App() {
  const [showForm, setShowForm] = useState(false);
  const [name, setName] = useState('');
  const [source, setSource] = useState('');
  const [notes, setNotes] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [editingId, setEditingId] = useState(null);
  const [editName, setEditName] = useState('');
  const [editSource, setEditSource] = useState('');
  const [editNotes, setEditNotes] = useState('');
  const [isDragging, setIsDragging] = useState(false);

  const objects = useObjectsStore((state) => state.objects);
  const loading = useObjectsStore((state) => state.loading);
  const error = useObjectsStore((state) => state.error);
  const loadObjects = useObjectsStore((state) => state.loadObjects);
  const addObject = useObjectsStore((state) => state.addObject);
  const updateObject = useObjectsStore((state) => state.updateObject);
  const deleteObject = useObjectsStore((state) => state.deleteObject);
  const deleteAll = useObjectsStore((state) => state.deleteAll);

  // Load objects on mount and setup file watcher
  useEffect(() => {
    loadObjects();
    // Listen for file system changes
    window.electronAPI?.onObjectsChanged(() => {
      console.log('File change detected, reloading objects...');
      loadObjects();
    });
  }, [loadObjects]);

  // Setup keyboard shortcuts
  useKeyboardShortcuts(
    {
      onEscape: () => {
        if (editingId) {
          cancelEditing();
        } else if (showForm) {
          setShowForm(false);
          setName('');
          setSource('');
          setNotes('');
        }
      },
      onNewObject: () => {
        setShowForm(true);
      },
    },
    { editingId, showForm }
  );

  async function handleCreateObject(e) {
    e.preventDefault();
    if (!name.trim()) return;

    setSubmitting(true);
    try {
      // Clean source URI (remove quotes)
      const cleanedSource = source ? cleanSourceURI(source) : null;

      await addObject({
        name,
        source: cleanedSource,
        user_metadata: { notes: notes || null },
      });
      setName('');
      setSource('');
      setNotes('');
      setShowForm(false);
    } catch (err) {
      // Error already in store
    } finally {
      setSubmitting(false);
    }
  }

  async function handleEditObject(e) {
    e.preventDefault();
    if (!editName.trim() || !editingId) return;

    setSubmitting(true);
    try {
      // Clean source URI (remove quotes)
      const cleanedSource = editSource ? cleanSourceURI(editSource) : null;

      await updateObject(editingId, {
        name: editName,
        source: cleanedSource,
        user_metadata: { notes: editNotes || null }
      });
      setEditingId(null);
      setEditName('');
      setEditSource('');
      setEditNotes('');
    } catch (err) {
      // Error already in store
    } finally {
      setSubmitting(false);
    }
  }

  function startEditing(obj) {
    setEditingId(obj.id.id);
    setEditName(obj.name);
    setEditSource(obj.source || '');
    setEditNotes(obj.user_metadata?.notes || '');
  }

  function cancelEditing() {
    setEditingId(null);
    setEditName('');
    setEditSource('');
    setEditNotes('');
  }

  function handleDragEnter(e) {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(true);
  }

  function handleDragLeave(e) {
    e.preventDefault();
    e.stopPropagation();
    // Only hide when leaving the container itself
    if (e.target === e.currentTarget) {
      setIsDragging(false);
    }
  }

  function handleDrop(e) {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(false);

    // Get the first dropped file
    const files = e.dataTransfer.files;
    if (files.length === 0) return;

    const file = files[0];

    // Use Electron's webUtils to get the file path
    const filePath = window.electronAPI.fs.getPathForFile(file);
    if (filePath) {
      const cleanedPath = cleanSourceURI(filePath);
      setSource(cleanedPath);
      if (!showForm) {
        setShowForm(true);
      }
    }
  }

  function handlePaste(e) {
    const files = e.clipboardData?.files;

    // Check if there are files in the clipboard
    if (files && files.length > 0) {
      const file = files[0];

      // Use Electron's webUtils to get the file path
      const filePath = window.electronAPI.fs.getPathForFile(file);
      if (filePath) {
        const cleanedPath = cleanSourceURI(filePath);
        setSource(cleanedPath);
        if (!showForm) {
          setShowForm(true);
        }
      }
    } else {
      // If no files, check for text (URL or file path)
      const text = e.clipboardData?.getData('text');
      if (text && text.trim()) {
        const cleanedPath = cleanSourceURI(text);
        setSource(cleanedPath);
        if (!showForm) {
          setShowForm(true);
        }
      }
    }
  }

  return (
    <div
      className="container"
      onDragEnter={handleDragEnter}
      onDragOver={(e) => {
        e.preventDefault();
        e.stopPropagation();
      }}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
      onPaste={handlePaste}
      tabIndex={0}
    >
      {isDragging && (
        <div className="drop-indicator">
          <div className="drop-indicator-text">Drop file to create object</div>
        </div>
      )}

      <h1>Index</h1>

      {error && <div className="error">{error}</div>}

      {!showForm ? (
        <button onClick={() => setShowForm(true)} className="primary-btn">
          Add Object
        </button>
      ) : (
        <form onSubmit={handleCreateObject} className="form">
          <input
            type="text"
            placeholder="Object name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            autoFocus
            disabled={submitting}
          />
          <div className="source-input-group">
            <input
              type="text"
              placeholder="Source (file path or URL)"
              value={source}
              onChange={(e) => setSource(e.target.value)}
              onBlur={() => setSource(cleanSourceURI(source))}
              disabled={submitting}
            />
            <button
              type="button"
              onClick={async () => {
                try {
                  const result = await window.electronAPI.fs.pickFile();
                  if (result.success && result.filePath) {
                    setSource(result.filePath);
                  }
                } catch (err) {
                  console.error('File picker error:', err);
                }
              }}
              disabled={submitting}
              className="browse-btn"
              title="Browse for file"
            >
              Browse
            </button>
          </div>
          <textarea
            placeholder="Notes (optional)"
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            disabled={submitting}
            rows="3"
          />
          <div className="button-group">
            <button type="submit" disabled={submitting} className="primary-btn">
              {submitting ? 'Creating...' : 'Create'}
            </button>
            <button
              type="button"
              onClick={() => {
                setShowForm(false);
                setName('');
                setSource('');
                setNotes('');
              }}
              disabled={submitting}
              className="secondary-btn"
            >
              Cancel
            </button>
          </div>
        </form>
      )}

      <div className="objects-list">
        <div className="list-header">
          <h2>Objects ({objects.length})</h2>
          {objects.length > 0 && (
            <button
              onClick={async () => {
                if (window.confirm('Delete all objects?')) {
                  try {
                    await deleteAll();
                  } catch (err) {
                    // Error in store
                  }
                }
              }}
              className="delete-all-btn"
            >
              Delete All
            </button>
          )}
        </div>
        {loading && <p>Loading...</p>}
        {objects.length === 0 && !loading && <p>No objects yet</p>}
        {objects.length > 0 && (
          <ul>
            {objects.map((obj, idx) => (
              <li key={obj.id?.id || idx} className="object-item">
                {editingId === obj.id.id ? (
                  <form onSubmit={handleEditObject} className="object-edit-form-container">
                    <div className="object-edit-form">
                      <input
                        type="text"
                        placeholder="Name"
                        value={editName}
                        onChange={(e) => setEditName(e.target.value)}
                        disabled={submitting}
                        autoFocus
                      />
                      <div className="source-input-group">
                        <input
                          type="text"
                          placeholder="Source"
                          value={editSource}
                          onChange={(e) => setEditSource(e.target.value)}
                          onBlur={() => setEditSource(cleanSourceURI(editSource))}
                          disabled={submitting}
                        />
                        <button
                          type="button"
                          onClick={async () => {
                            try {
                              const result = await window.electronAPI.fs.pickFile();
                              if (result.success && result.filePath) {
                                setEditSource(result.filePath);
                              }
                            } catch (err) {
                              console.error('File picker error:', err);
                            }
                          }}
                          disabled={submitting}
                          className="browse-btn-small"
                          title="Browse for file"
                        >
                          Browse
                        </button>
                      </div>
                      <textarea
                        placeholder="Notes (optional)"
                        value={editNotes}
                        onChange={(e) => setEditNotes(e.target.value)}
                        disabled={submitting}
                        rows="2"
                      />
                    </div>
                    <div className="object-edit-buttons">
                      <button type="submit" disabled={submitting} className="save-btn">
                        ✓
                      </button>
                      <button
                        type="button"
                        onClick={cancelEditing}
                        disabled={submitting}
                        className="cancel-btn"
                      >
                        ✕
                      </button>
                    </div>
                  </form>
                ) : (
                  <>
                    <div className="object-details">
                      <button
                        className={`object-name ${obj.source_metadata?.exists === false ? 'missing' : ''}`}
                        onClick={() => obj.source_metadata?.exists !== false && obj.source && window.electronAPI.openSource(obj.source)}
                        disabled={obj.source_metadata?.exists === false || !obj.source}
                        title={obj.source || 'No source'}
                      >
                        {obj.name}
                      </button>
                    </div>
                    <div className="object-actions">
                      <button
                        onClick={() => startEditing(obj)}
                        className="edit-btn"
                        title="Edit"
                      >
                        ✎
                      </button>
                      <button
                        onClick={async () => {
                          try {
                            await deleteObject(obj.id.id);
                          } catch (err) {
                            // Error in store
                          }
                        }}
                        className="delete-btn"
                        title="Delete"
                      >
                        ×
                      </button>
                    </div>
                  </>
                )}
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
