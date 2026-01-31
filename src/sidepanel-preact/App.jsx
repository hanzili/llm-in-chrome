import { useState } from 'preact/hooks';
import { useConfig } from './hooks/useConfig';
import { useChat } from './hooks/useChat';
import { Header } from './components/Header';
import { MessageList } from './components/MessageList';
import { InputArea } from './components/InputArea';
import { SettingsModal } from './components/SettingsModal';
import { PlanModal } from './components/PlanModal';
import { EmptyState } from './components/EmptyState';

export function App() {
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [suggestedText, setSuggestedText] = useState('');
  const config = useConfig();
  const chat = useChat();

  if (config.isLoading) {
    return (
      <div class="loading-container">
        <div class="loading-spinner" />
      </div>
    );
  }

  const hasMessages = chat.messages.length > 0;

  return (
    <div class="app">
      <Header
        currentModel={config.currentModel}
        availableModels={config.availableModels}
        currentModelIndex={config.currentModelIndex}
        onModelSelect={config.selectModel}
        onNewChat={chat.clearChat}
        onOpenSettings={() => setIsSettingsOpen(true)}
      />

      <div class="messages-container">
        {!hasMessages ? (
          <EmptyState onSelectExample={setSuggestedText} />
        ) : (
          <MessageList
            messages={chat.messages}
            pendingStep={chat.pendingStep}
          />
        )}
      </div>

      <InputArea
        isRunning={chat.isRunning}
        attachedImages={chat.attachedImages}
        onSend={chat.sendMessage}
        onStop={chat.stopTask}
        onAddImage={chat.addImage}
        onRemoveImage={chat.removeImage}
        hasModels={config.availableModels.length > 0}
        suggestedText={suggestedText}
        onClearSuggestion={() => setSuggestedText('')}
      />

      {isSettingsOpen && (
        <SettingsModal
          config={config}
          onClose={() => setIsSettingsOpen(false)}
        />
      )}

      {chat.pendingPlan && (
        <PlanModal
          plan={chat.pendingPlan}
          onApprove={chat.approvePlan}
          onCancel={chat.cancelPlan}
        />
      )}
    </div>
  );
}
