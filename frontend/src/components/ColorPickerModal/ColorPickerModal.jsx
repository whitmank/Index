import { useState, useRef, useEffect } from 'react'
import './ColorPickerModal.css'

function ColorPickerModal({ isOpen, onClose, currentColor, onColorSelect, title = 'Choose Color' }) {
  const [selectedColor, setSelectedColor] = useState(currentColor || '#4D9FFF')
  const colorInputRef = useRef(null)

  useEffect(() => {
    if (isOpen && colorInputRef.current) {
      // Small delay to ensure the modal is rendered
      setTimeout(() => {
        colorInputRef.current?.click()
      }, 100)
    }
  }, [isOpen])

  const handleColorChange = (e) => {
    setSelectedColor(e.target.value)
  }

  const handleSave = () => {
    onColorSelect(selectedColor)
    onClose()
  }

  if (!isOpen) return null

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="color-picker-modal-content" onClick={(e) => e.stopPropagation()}>
        <div className="color-picker-modal-header">
          <h3>{title}</h3>
          <button className="modal-close" onClick={onClose}>×</button>
        </div>

        <div className="color-picker-modal-body">
          <div className="color-preview-container">
            <div
              className="color-preview"
              style={{ backgroundColor: selectedColor }}
            />
            <div className="color-info">
              <span className="color-hex">{selectedColor.toUpperCase()}</span>
            </div>
          </div>

          <button
            className="color-picker-trigger"
            onClick={() => colorInputRef.current?.click()}
          >
            🎨 Choose Color
          </button>

          <input
            ref={colorInputRef}
            type="color"
            value={selectedColor}
            onChange={handleColorChange}
            className="color-input-hidden"
          />
        </div>

        <div className="color-picker-modal-actions">
          <button className="btn btn-secondary" onClick={onClose}>
            Cancel
          </button>
          <button className="btn btn-primary" onClick={handleSave}>
            Save
          </button>
        </div>
      </div>
    </div>
  )
}

export default ColorPickerModal
