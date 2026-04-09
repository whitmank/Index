// Author: Claude Sonnet 4.6
// ObjectSourceView — dispatches to the appropriate viewer for an object's primary source.
// PDF → PdfViewer (canvas-based, no keyboard capture)
// URL / other → webview (Electron native, handles all web content)

import PdfViewer from './PdfViewer';
import './ObjectSourceView.css';

export default function ObjectSourceView({ object }) {
  const source = object?.sources?.[0];

  if (!source?.uri) {
    return <div className="source-view-empty">No source</div>;
  }

  const { uri, fileType } = source;

  if (fileType === 'pdf') {
    return <PdfViewer uri={uri} />;
  }

  return (
    <div className="source-view-container">
      <webview src={uri} className="source-view-webview" />
    </div>
  );
}
