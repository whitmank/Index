import './FilePreview.css'
import { getPreviewType } from '../../../utils/fileTypeDetector'
import ImagePreview from './ImagePreview'
import PDFPreview from './PDFPreview'
import VideoPreview from './VideoPreview'
import AudioPreview from './AudioPreview'
import CodePreview from './CodePreview'

/**
 * Main file preview component that routes to the appropriate preview type
 * @param {Object} node - File node object
 */
function FilePreview({ node }) {
  if (!node) return null

  const previewType = getPreviewType(node)

  switch (previewType) {
    case 'image':
      return <ImagePreview node={node} />
    case 'pdf':
      return <PDFPreview node={node} />
    case 'video':
      return <VideoPreview node={node} />
    case 'audio':
      return <AudioPreview node={node} />
    case 'code':
      return <CodePreview node={node} />
    default:
      return (
        <div className="no-preview">
          <p>No preview available for this file type</p>
          <p className="preview-hint">{node.type}</p>
        </div>
      )
  }
}

export default FilePreview
