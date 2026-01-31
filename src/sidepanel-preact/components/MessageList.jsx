import { useRef, useEffect } from 'preact/hooks';
import { Message } from './Message';
import { StepsSection } from './StepsSection';

export function MessageList({ messages, pendingStep }) {
  const containerRef = useRef(null);
  const isAtBottomRef = useRef(true);

  // Track if user is at bottom
  const handleScroll = () => {
    if (!containerRef.current) return;
    const { scrollTop, scrollHeight, clientHeight } = containerRef.current;
    isAtBottomRef.current = scrollHeight - scrollTop - clientHeight < 50;
  };

  // Auto-scroll when new messages arrive (if at bottom)
  useEffect(() => {
    if (isAtBottomRef.current && containerRef.current) {
      containerRef.current.scrollTop = containerRef.current.scrollHeight;
    }
  }, [messages]);

  // Render messages with steps attached to each assistant message
  const renderContent = () => {
    const content = [];

    for (let i = 0; i < messages.length; i++) {
      const msg = messages[i];

      // For assistant messages with steps, show steps before the message text
      if (msg.type === 'assistant' && msg.steps && msg.steps.length > 0) {
        content.push(
          <StepsSection
            key={`steps-${msg.id}`}
            steps={msg.steps}
            pendingStep={null}
          />
        );
      }

      content.push(<Message key={msg.id} message={msg} />);
    }

    // Show pending step if there is one (for current in-progress task)
    if (pendingStep) {
      content.push(
        <StepsSection
          key="steps-pending"
          steps={[]}
          pendingStep={pendingStep}
        />
      );
    }

    return content;
  };

  return (
    <div
      class="messages"
      ref={containerRef}
      onScroll={handleScroll}
    >
      {renderContent()}
    </div>
  );
}
