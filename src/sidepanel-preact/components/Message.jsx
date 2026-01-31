import { formatMarkdown } from '../utils/format';

export function Message({ message }) {
  const { type, text, images } = message;

  if (type === 'thinking') {
    return (
      <div class="message thinking">
        <div class="thinking-indicator">
          <div class="sparkle-container">
            <svg class="sparkle" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <circle cx="12" cy="12" r="10" />
              <path d="M12 6v6l4 2" />
            </svg>
          </div>
          <span>Thinking...</span>
        </div>
      </div>
    );
  }

  if (type === 'streaming') {
    return (
      <div class="message assistant streaming">
        <div class="bullet" />
        <div
          class="content"
          dangerouslySetInnerHTML={{ __html: formatMarkdown(text) }}
        />
      </div>
    );
  }

  if (type === 'user') {
    return (
      <div class="message user">
        {images && images.length > 0 && (
          <div class="message-images">
            {images.map((img, i) => (
              <img key={i} src={img} alt={`Attached ${i + 1}`} />
            ))}
          </div>
        )}
        {text && <span>{text}</span>}
      </div>
    );
  }

  if (type === 'assistant') {
    return (
      <div class="message assistant">
        <div class="bullet" />
        <div
          class="content"
          dangerouslySetInnerHTML={{ __html: formatMarkdown(text) }}
        />
      </div>
    );
  }

  if (type === 'error') {
    return (
      <div class="message error">
        {text}
      </div>
    );
  }

  if (type === 'system') {
    return (
      <div class="message system">
        {text}
      </div>
    );
  }

  return null;
}
