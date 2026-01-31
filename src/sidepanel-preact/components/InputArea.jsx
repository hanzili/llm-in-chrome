import { useState, useRef, useEffect } from 'preact/hooks';

export function InputArea({
  isRunning,
  attachedImages,
  onSend,
  onStop,
  onAddImage,
  onRemoveImage,
  hasModels,
  suggestedText,
  onClearSuggestion,
}) {
  const [text, setText] = useState('');

  // When suggestedText changes, populate the textarea
  useEffect(() => {
    if (suggestedText) {
      setText(suggestedText);
      onClearSuggestion();
    }
  }, [suggestedText, onClearSuggestion]);
  const [isDragging, setIsDragging] = useState(false);
  const inputRef = useRef(null);

  const handleSubmit = () => {
    if (!text.trim() || isRunning) return;
    if (!hasModels) {
      alert('Please configure a model in Settings first');
      return;
    }
    onSend(text);
    setText('');
    if (inputRef.current) {
      inputRef.current.style.height = 'auto';
    }
  };

  const handleKeyDown = (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSubmit();
    }
  };

  const handleInput = (e) => {
    setText(e.target.value);
    // Auto-resize
    e.target.style.height = 'auto';
    e.target.style.height = Math.min(e.target.scrollHeight, 150) + 'px';
  };

  const handleDragOver = (e) => {
    e.preventDefault();
    setIsDragging(true);
  };

  const handleDragLeave = (e) => {
    e.preventDefault();
    setIsDragging(false);
  };

  const handleDrop = (e) => {
    e.preventDefault();
    setIsDragging(false);
    const files = e.dataTransfer.files;
    for (const file of files) {
      if (file.type.startsWith('image/')) {
        readImageFile(file);
      }
    }
  };

  const handlePaste = (e) => {
    const items = e.clipboardData?.items;
    if (items) {
      for (const item of items) {
        if (item.type.startsWith('image/')) {
          e.preventDefault();
          const file = item.getAsFile();
          if (file) readImageFile(file);
          break;
        }
      }
    }
  };

  const readImageFile = (file) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      onAddImage(e.target.result);
    };
    reader.readAsDataURL(file);
  };

  return (
    <div
      class={`input-container ${isDragging ? 'drag-over' : ''}`}
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
    >
      {attachedImages.length > 0 && (
        <div class="image-preview">
          {attachedImages.map((img, i) => (
            <div key={i} class="image-preview-item">
              <img src={img} alt={`Preview ${i + 1}`} />
              <button
                class="remove-image-btn"
                onClick={() => onRemoveImage(i)}
              >
                &times;
              </button>
            </div>
          ))}
        </div>
      )}

      <div class="input-row">
        <textarea
          ref={inputRef}
          class="input"
          placeholder="What would you like me to do?"
          value={text}
          onInput={handleInput}
          onKeyDown={handleKeyDown}
          onPaste={handlePaste}
          rows={1}
        />

        {isRunning ? (
          <button class="btn stop-btn" onClick={onStop}>
            <svg viewBox="0 0 24 24" fill="currentColor">
              <rect x="6" y="6" width="12" height="12" rx="2" />
            </svg>
            Stop
          </button>
        ) : (
          <button
            class="btn send-btn"
            onClick={handleSubmit}
            disabled={!text.trim()}
          >
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <path d="M22 2L11 13M22 2l-7 20-4-9-9-4 20-7z" />
            </svg>
            Send
          </button>
        )}
      </div>
    </div>
  );
}
