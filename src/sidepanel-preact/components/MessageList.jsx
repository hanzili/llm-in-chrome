import { useRef, useEffect } from 'preact/hooks';
import { Message } from './Message';
import { StepsSection } from './StepsSection';

export function MessageList({ messages, completedSteps, pendingStep }) {
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
  }, [messages, completedSteps]);

  // Group messages and inject steps section after last user message when there are steps
  const renderContent = () => {
    const content = [];
    let stepsInjected = false;

    for (let i = 0; i < messages.length; i++) {
      const msg = messages[i];
      content.push(<Message key={msg.id} message={msg} />);

      // Inject steps section after user message if we have completed steps and haven't injected yet
      if (
        !stepsInjected &&
        msg.type === 'user' &&
        completedSteps.length > 0
      ) {
        content.push(
          <StepsSection
            key={`steps-${msg.id}`}
            steps={completedSteps}
            pendingStep={pendingStep}
          />
        );
        stepsInjected = true;
      }
    }

    // If there's a pending step but no completed steps, show steps section after last user message
    if (!stepsInjected && pendingStep) {
      const lastUserIndex = [...messages].reverse().findIndex(m => m.type === 'user');
      if (lastUserIndex !== -1) {
        const insertIndex = messages.length - lastUserIndex;
        content.splice(insertIndex, 0,
          <StepsSection
            key="steps-pending"
            steps={completedSteps}
            pendingStep={pendingStep}
          />
        );
      }
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
