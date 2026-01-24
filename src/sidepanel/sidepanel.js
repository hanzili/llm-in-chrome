/**
 * Side Panel - Chat interface for Browser Agent
 */

// Provider configurations
const PROVIDERS = {
  anthropic: {
    name: 'Anthropic',
    baseUrl: 'https://api.anthropic.com/v1/messages',
    models: [
      { id: 'claude-opus-4-5-20251101', name: 'Opus 4.5' },
      { id: 'claude-opus-4-20250514', name: 'Opus 4' },
      { id: 'claude-sonnet-4-20250514', name: 'Sonnet 4' },
      { id: 'claude-haiku-4-5-20251001', name: 'Haiku 4.5' },
    ],
  },
  openai: {
    name: 'OpenAI',
    baseUrl: 'https://api.openai.com/v1/chat/completions',
    models: [
      { id: 'gpt-4o', name: 'GPT-4o' },
      { id: 'gpt-4o-mini', name: 'GPT-4o Mini' },
      { id: 'gpt-4-turbo', name: 'GPT-4 Turbo' },
      { id: 'o1', name: 'o1' },
      { id: 'o3-mini', name: 'o3-mini' },
    ],
  },
  google: {
    name: 'Google',
    baseUrl: 'https://generativelanguage.googleapis.com/v1beta/models',
    models: [
      { id: 'gemini-2.0-flash', name: 'Gemini 2.0 Flash' },
      { id: 'gemini-1.5-pro', name: 'Gemini 1.5 Pro' },
    ],
  },
  openrouter: {
    name: 'OpenRouter',
    baseUrl: 'https://openrouter.ai/api/v1/chat/completions',
    models: [
      { id: 'anthropic/claude-3.5-sonnet', name: 'Claude 3.5 Sonnet' },
      { id: 'anthropic/claude-3-opus', name: 'Claude 3 Opus' },
      { id: 'openai/gpt-4o', name: 'GPT-4o' },
      { id: 'google/gemini-2.0-flash-001', name: 'Gemini 2.0 Flash' },
      { id: 'deepseek/deepseek-r1', name: 'DeepSeek R1' },
    ],
  },
};

// Elements
const messagesEl = document.getElementById('messages');
const emptyStateEl = document.getElementById('empty-state');
const inputEl = document.getElementById('input');
const sendBtn = document.getElementById('send-btn');
const modelSelector = document.getElementById('model-selector');
const modelSelectorBtn = document.getElementById('model-selector-btn');
const modelDropdown = document.getElementById('model-dropdown');
const modelList = document.getElementById('model-list');
const currentModelNameEl = document.getElementById('current-model-name');
const newChatBtn = document.getElementById('new-chat-btn');
const settingsBtn = document.getElementById('settings-btn');
const settingsModal = document.getElementById('settings-modal');
const settingsSave = document.getElementById('settings-save');
const settingsClose = document.getElementById('settings-close');
const planModal = document.getElementById('plan-modal');
const planDomains = document.getElementById('plan-domains');
const planSteps = document.getElementById('plan-steps');
const planApprove = document.getElementById('plan-approve');
const planCancel = document.getElementById('plan-cancel');
const askToggle = document.getElementById('ask-toggle');
const stopBtn = document.getElementById('stop-btn');
const inputContainer = document.getElementById('input-container');
const imagePreview = document.getElementById('image-preview');
const previewImg = document.getElementById('preview-img');
const removeImageBtn = document.getElementById('remove-image-btn');

// State
let isRunning = false;
let askBeforeActing = true;
let currentToolIndicator = null;
let currentStreamingMessage = null;
let completedSteps = []; // Array of { tool, input, result, description }
let pendingStep = null; // Current executing step
let stepsSection = null;
let attachedImage = null; // Base64 data URL of attached image

// Config state
let providerKeys = {}; // { anthropic: 'sk-...', openai: 'sk-...', ... }
let customModels = []; // [{ name, baseUrl, modelId, apiKey }, ...]
let availableModels = []; // Combined list of { name, provider, modelId, baseUrl, apiKey }
let currentModelIndex = 0;
let selectedProvider = null;

// Initialize
document.addEventListener('DOMContentLoaded', async () => {
  // Load saved config
  await loadConfig();

  // Auto-resize textarea
  inputEl.addEventListener('input', () => {
    inputEl.style.height = 'auto';
    inputEl.style.height = Math.min(inputEl.scrollHeight, 150) + 'px';
  });

  // Handle Enter to send
  inputEl.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      sendMessage();
    }
  });

  // Send button
  sendBtn.addEventListener('click', sendMessage);

  // Model selector
  modelSelectorBtn.addEventListener('click', toggleModelDropdown);
  document.addEventListener('click', (e) => {
    if (!modelSelector.contains(e.target)) {
      closeModelDropdown();
    }
  });

  // New chat
  newChatBtn.addEventListener('click', clearChat);

  // Settings
  settingsBtn.addEventListener('click', openSettings);
  settingsClose.addEventListener('click', closeSettings);
  settingsSave.addEventListener('click', saveSettings);

  // Settings tabs
  document.querySelectorAll('.tab').forEach(tab => {
    tab.addEventListener('click', () => {
      document.querySelectorAll('.tab').forEach(t => t.classList.remove('active'));
      document.querySelectorAll('.tab-content').forEach(c => c.classList.remove('active'));
      tab.classList.add('active');
      document.getElementById(`tab-${tab.dataset.tab}`).classList.add('active');
    });
  });

  // Provider cards
  document.querySelectorAll('.provider-card').forEach(card => {
    card.addEventListener('click', () => selectProvider(card.dataset.provider));
  });

  // Add custom model
  document.getElementById('add-custom-btn').addEventListener('click', addCustomModel);

  // Ask before acting toggle
  askToggle.addEventListener('click', () => {
    askBeforeActing = !askBeforeActing;
    askToggle.classList.toggle('active', askBeforeActing);
  });

  // Plan approval
  planApprove.addEventListener('click', () => {
    chrome.runtime.sendMessage({ type: 'PLAN_APPROVAL_RESPONSE', payload: { approved: true } });
    planModal.classList.add('hidden');
  });
  planCancel.addEventListener('click', () => {
    chrome.runtime.sendMessage({ type: 'PLAN_APPROVAL_RESPONSE', payload: { approved: false } });
    planModal.classList.add('hidden');
  });

  // Stop button
  stopBtn.addEventListener('click', stopTask);

  // Image drag & drop
  inputContainer.addEventListener('dragover', (e) => {
    e.preventDefault();
    inputContainer.classList.add('drag-over');
  });

  inputContainer.addEventListener('dragleave', (e) => {
    e.preventDefault();
    inputContainer.classList.remove('drag-over');
  });

  inputContainer.addEventListener('drop', (e) => {
    e.preventDefault();
    inputContainer.classList.remove('drag-over');
    handleImageDrop(e.dataTransfer);
  });

  // Paste image
  inputEl.addEventListener('paste', (e) => {
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
  });

  // Remove image
  removeImageBtn.addEventListener('click', removeAttachedImage);
});

// Listen for messages from service worker
chrome.runtime.onMessage.addListener((message) => {
  switch (message.type) {
    case 'TASK_UPDATE': handleTaskUpdate(message.update); break;
    case 'TASK_COMPLETE': handleTaskComplete(message.result); break;
    case 'TASK_ERROR': handleTaskError(message.error); break;
    case 'PLAN_APPROVAL_REQUIRED': showPlanApproval(message.plan); break;
  }
});

// ============================================
// CONFIG
// ============================================

async function loadConfig() {
  const config = await chrome.runtime.sendMessage({ type: 'GET_CONFIG' });
  providerKeys = config.providerKeys || {};
  customModels = config.customModels || [];
  currentModelIndex = config.currentModelIndex || 0;

  buildAvailableModels();
  updateModelDisplay();
  renderModelList();
  updateProviderStatuses();
  renderCustomModelsList();
}

function buildAvailableModels() {
  availableModels = [];

  // Add models from configured providers
  for (const [providerId, provider] of Object.entries(PROVIDERS)) {
    if (providerKeys[providerId]) {
      for (const model of provider.models) {
        availableModels.push({
          name: model.name,
          provider: providerId,
          modelId: model.id,
          baseUrl: provider.baseUrl,
          apiKey: providerKeys[providerId],
        });
      }
    }
  }

  // Add custom models
  for (const custom of customModels) {
    availableModels.push({
      name: custom.name,
      provider: 'custom',
      modelId: custom.modelId,
      baseUrl: custom.baseUrl,
      apiKey: custom.apiKey,
    });
  }

  // Ensure index is valid
  if (currentModelIndex >= availableModels.length) {
    currentModelIndex = 0;
  }
}

async function saveConfig() {
  await chrome.runtime.sendMessage({
    type: 'SAVE_CONFIG',
    payload: {
      providerKeys,
      customModels,
      currentModelIndex,
      // Also set the active model config for the service worker
      ...(availableModels[currentModelIndex] ? {
        model: availableModels[currentModelIndex].modelId,
        apiBaseUrl: availableModels[currentModelIndex].baseUrl,
        apiKey: availableModels[currentModelIndex].apiKey,
      } : {}),
    },
  });
}

// ============================================
// MODEL SELECTOR
// ============================================

function toggleModelDropdown() {
  if (modelDropdown.classList.contains('hidden')) {
    modelDropdown.classList.remove('hidden');
    modelSelector.classList.add('open');
  } else {
    closeModelDropdown();
  }
}

function closeModelDropdown() {
  modelDropdown.classList.add('hidden');
  modelSelector.classList.remove('open');
}

function updateModelDisplay() {
  if (availableModels.length === 0) {
    currentModelNameEl.textContent = 'No models';
    return;
  }
  currentModelNameEl.textContent = availableModels[currentModelIndex]?.name || 'Select model';
}

function renderModelList() {
  if (availableModels.length === 0) {
    modelList.innerHTML = `
      <div style="padding: 12px 14px; color: var(--text-muted); font-size: 13px;">
        No models configured.<br>Open Settings to add.
      </div>
    `;
    return;
  }

  modelList.innerHTML = availableModels.map((model, i) => `
    <div class="model-item ${i === currentModelIndex ? 'active' : ''}" data-index="${i}">
      <svg class="check" viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2">
        <polyline points="20 6 9 17 4 12"/>
      </svg>
      <span>${model.name}</span>
    </div>
  `).join('');

  modelList.querySelectorAll('.model-item').forEach(item => {
    item.addEventListener('click', () => {
      currentModelIndex = parseInt(item.dataset.index);
      updateModelDisplay();
      renderModelList();
      closeModelDropdown();
      saveConfig();
    });
  });
}

// ============================================
// SETTINGS
// ============================================

function openSettings() {
  settingsModal.classList.remove('hidden');
  selectedProvider = null;
  document.getElementById('provider-config').style.display = 'none';
  document.querySelectorAll('.provider-card').forEach(c => c.classList.remove('active'));
  renderCustomModelsList();
}

function closeSettings() {
  settingsModal.classList.add('hidden');
}

function selectProvider(providerId) {
  selectedProvider = providerId;
  document.querySelectorAll('.provider-card').forEach(c => {
    c.classList.toggle('active', c.dataset.provider === providerId);
  });

  const configEl = document.getElementById('provider-config');
  const apiKeyInput = document.getElementById('provider-api-key');
  apiKeyInput.value = providerKeys[providerId] || '';
  configEl.style.display = 'block';
  apiKeyInput.focus();
}

function updateProviderStatuses() {
  for (const providerId of Object.keys(PROVIDERS)) {
    const statusEl = document.getElementById(`${providerId}-status`);
    if (providerKeys[providerId]) {
      statusEl.textContent = 'Configured';
      statusEl.classList.add('configured');
    } else {
      statusEl.textContent = 'Not configured';
      statusEl.classList.remove('configured');
    }
  }
}

async function saveSettings() {
  // Save provider key if one is selected
  if (selectedProvider) {
    const apiKey = document.getElementById('provider-api-key').value.trim();
    if (apiKey) {
      providerKeys[selectedProvider] = apiKey;
    } else {
      delete providerKeys[selectedProvider];
    }
  }

  buildAvailableModels();
  updateModelDisplay();
  renderModelList();
  updateProviderStatuses();
  await saveConfig();
  closeSettings();
}

async function addCustomModel() {
  const name = document.getElementById('custom-display-name').value.trim();
  const baseUrl = document.getElementById('custom-base-url').value.trim();
  const modelId = document.getElementById('custom-model-id').value.trim();
  const apiKey = document.getElementById('custom-api-key').value.trim();

  if (!name || !baseUrl || !modelId) {
    alert('Please fill in Display Name, Base URL, and Model ID');
    return;
  }

  customModels.push({ name, baseUrl, modelId, apiKey });

  // Clear form
  document.getElementById('custom-display-name').value = '';
  document.getElementById('custom-base-url').value = '';
  document.getElementById('custom-model-id').value = '';
  document.getElementById('custom-api-key').value = '';

  buildAvailableModels();
  updateModelDisplay();
  renderModelList();
  renderCustomModelsList();
  await saveConfig();

  // Switch to the new model
  currentModelIndex = availableModels.length - 1;
  updateModelDisplay();
  renderModelList();
  await saveConfig();
}

function renderCustomModelsList() {
  const listEl = document.getElementById('custom-models-list');
  if (!listEl) return;

  if (customModels.length === 0) {
    listEl.innerHTML = '<div style="color: var(--text-muted); font-size: 13px; margin-bottom: 12px;">No custom models added yet.</div>';
    return;
  }

  listEl.innerHTML = customModels.map((model, i) => `
    <div class="custom-model-item" data-index="${i}">
      <div class="model-info">
        <div class="model-name">${model.name}</div>
        <div class="model-url">${model.baseUrl}</div>
      </div>
      <button class="delete-btn" data-index="${i}" title="Delete">
        <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2">
          <path d="M3 6h18M19 6v14a2 2 0 01-2 2H7a2 2 0 01-2-2V6m3 0V4a2 2 0 012-2h4a2 2 0 012 2v2"/>
        </svg>
      </button>
    </div>
  `).join('');

  // Attach delete handlers
  listEl.querySelectorAll('.delete-btn').forEach(btn => {
    btn.addEventListener('click', async (e) => {
      e.stopPropagation();
      const index = parseInt(btn.dataset.index);
      const modelName = customModels[index].name;
      if (confirm(`Delete "${modelName}"?`)) {
        customModels.splice(index, 1);
        buildAvailableModels();
        updateModelDisplay();
        renderModelList();
        renderCustomModelsList();
        await saveConfig();
      }
    });
  });
}

// ============================================
// MESSAGES
// ============================================

async function sendMessage() {
  const text = inputEl.value.trim();
  if (!text || isRunning) return;

  if (availableModels.length === 0) {
    alert('Please configure a model in Settings first');
    return;
  }

  // Hide empty state (get fresh reference in case it was recreated)
  const emptyState = document.getElementById('empty-state');
  if (emptyState) emptyState.style.display = 'none';
  completedSteps = [];
  stepsSection = null;

  // Capture image before clearing
  const imageToSend = attachedImage;

  addUserMessage(text, imageToSend);
  inputEl.value = '';
  inputEl.style.height = 'auto';
  removeAttachedImage();

  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (!tab) {
    addErrorMessage('No active tab found');
    return;
  }

  isRunning = true;
  sendBtn.classList.add('hidden');
  stopBtn.classList.remove('hidden');

  try {
    await chrome.runtime.sendMessage({
      type: 'START_TASK',
      payload: { tabId: tab.id, task: text, askBeforeActing, image: imageToSend },
    });
  } catch (error) {
    addErrorMessage(`Error: ${error.message}`);
    resetRunningState();
  }
}

function stopTask() {
  chrome.runtime.sendMessage({ type: 'STOP_TASK' }).catch(() => {});
  // Message will be shown by handleTaskComplete when service worker responds
  resetRunningState();
}

function resetRunningState() {
  isRunning = false;
  sendBtn.classList.remove('hidden');
  stopBtn.classList.add('hidden');
}

// ============================================
// IMAGE HANDLING
// ============================================

function handleImageDrop(dataTransfer) {
  const files = dataTransfer.files;
  for (const file of files) {
    if (file.type.startsWith('image/')) {
      readImageFile(file);
      break;
    }
  }
}

function readImageFile(file) {
  const reader = new FileReader();
  reader.onload = (e) => {
    attachedImage = e.target.result;
    previewImg.src = attachedImage;
    imagePreview.classList.remove('hidden');
  };
  reader.readAsDataURL(file);
}

function removeAttachedImage() {
  attachedImage = null;
  previewImg.src = '';
  imagePreview.classList.add('hidden');
}

function addUserMessage(text, image = null) {
  const el = document.createElement('div');
  el.className = 'message user';

  if (image) {
    const img = document.createElement('img');
    img.src = image;
    img.style.maxWidth = '200px';
    img.style.maxHeight = '150px';
    img.style.borderRadius = '8px';
    img.style.marginBottom = '8px';
    img.style.display = 'block';
    el.appendChild(img);
  }

  if (text) {
    const textEl = document.createElement('span');
    textEl.textContent = text;
    el.appendChild(textEl);
  }

  messagesEl.appendChild(el);
  scrollToBottom();
}

function addAssistantMessage(text) {
  const el = document.createElement('div');
  el.className = 'message assistant';
  el.innerHTML = `<div class="bullet"></div><div class="content">${formatMarkdown(text)}</div>`;
  messagesEl.appendChild(el);
  scrollToBottom();
  return el;
}

function addErrorMessage(text) {
  const el = document.createElement('div');
  el.className = 'message error';
  el.textContent = text;
  messagesEl.appendChild(el);
  scrollToBottom();
}

function addSystemMessage(text) {
  const el = document.createElement('div');
  el.className = 'message system';
  el.textContent = text;
  messagesEl.appendChild(el);
  scrollToBottom();
}

function formatMarkdown(text) {
  const lines = text.split('\n');
  let result = [];
  let inList = false;
  let listType = null;

  for (const line of lines) {
    const ulMatch = line.match(/^[-*]\s+(.+)$/);
    const olMatch = line.match(/^(\d+)\.\s+(.+)$/);

    if (ulMatch) {
      if (!inList || listType !== 'ul') {
        if (inList) result.push(listType === 'ol' ? '</ol>' : '</ul>');
        result.push('<ul>');
        inList = true;
        listType = 'ul';
      }
      result.push(`<li>${formatInline(ulMatch[1])}</li>`);
    } else if (olMatch) {
      if (!inList || listType !== 'ol') {
        if (inList) result.push(listType === 'ol' ? '</ol>' : '</ul>');
        result.push('<ol>');
        inList = true;
        listType = 'ol';
      }
      result.push(`<li>${formatInline(olMatch[2])}</li>`);
    } else {
      if (inList) {
        result.push(listType === 'ol' ? '</ol>' : '</ul>');
        inList = false;
        listType = null;
      }
      if (line.trim() === '') {
        result.push('<br>');
      } else {
        result.push(`<p>${formatInline(line)}</p>`);
      }
    }
  }
  if (inList) result.push(listType === 'ol' ? '</ol>' : '</ul>');
  return result.join('');
}

function formatInline(text) {
  return text
    .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
    .replace(/\*(.+?)\*/g, '<em>$1</em>')
    .replace(/`(.+?)`/g, '<code>$1</code>');
}

// ============================================
// TASK UPDATES
// ============================================

function handleTaskUpdate(update) {
  if (update.status === 'thinking') {
    showThinkingIndicator();
    if (currentStreamingMessage) {
      currentStreamingMessage.classList.remove('streaming');
      currentStreamingMessage = null;
    }
  } else if (update.status === 'streaming' && update.text) {
    hideToolIndicator();
    if (!currentStreamingMessage) {
      currentStreamingMessage = addAssistantMessage(update.text);
      currentStreamingMessage.classList.add('streaming');
    } else {
      currentStreamingMessage.querySelector('.content').innerHTML = formatMarkdown(update.text);
    }
    scrollToBottom();
  } else if (update.status === 'executing') {
    if (currentStreamingMessage) {
      currentStreamingMessage.classList.remove('streaming');
      currentStreamingMessage = null;
    }
    // Store pending step with input for rich display
    pendingStep = { tool: update.tool, input: update.input };
    const actionDesc = getActionDescription(update.tool, update.input);
    showToolIndicator(actionDesc, update.tool);
  } else if (update.status === 'executed') {
    hideToolIndicator();
    // Complete the step with result (use update.input as fallback if pendingStep is null)
    addCompletedStep(update.tool, pendingStep?.input || update.input, update.result);
    pendingStep = null;
  } else if (update.status === 'message' && update.text) {
    hideToolIndicator();
    if (currentStreamingMessage) {
      currentStreamingMessage.querySelector('.content').innerHTML = formatMarkdown(update.text);
      currentStreamingMessage.classList.remove('streaming');
      currentStreamingMessage = null;
    } else {
      addAssistantMessage(update.text);
    }
  }
}

function handleTaskComplete(result) {
  hideToolIndicator();
  if (currentStreamingMessage) {
    currentStreamingMessage.classList.remove('streaming');
    currentStreamingMessage = null;
  }
  resetRunningState();
  if (result.message && !result.success) {
    addSystemMessage(result.message);
  }
}

function handleTaskError(error) {
  hideToolIndicator();
  if (currentStreamingMessage) {
    currentStreamingMessage.classList.remove('streaming');
    currentStreamingMessage = null;
  }
  resetRunningState();
  addErrorMessage(`Error: ${error}`);
}

function showToolIndicator(label, toolName = null) {
  hideToolIndicator();
  const el = document.createElement('div');
  el.className = 'tool-indicator';

  // Use tool-specific icon or generic spinner
  const icon = toolName ? getToolIcon(toolName) :
    '<svg class="sparkle" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><path d="M12 6v6l4 2"/></svg>';

  el.innerHTML = `
    <div class="indicator-icon">${icon}</div>
    <span>${label}</span>
  `;
  messagesEl.appendChild(el);
  currentToolIndicator = el;
  scrollToBottom();
}

function hideToolIndicator() {
  if (currentToolIndicator) {
    currentToolIndicator.remove();
    currentToolIndicator = null;
  }
}

function showThinkingIndicator() {
  hideToolIndicator();
  const el = document.createElement('div');
  el.className = 'tool-indicator';
  el.innerHTML = `
    <div class="indicator-icon">
      <svg class="sparkle" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
        <circle cx="12" cy="12" r="10"/>
        <path d="M12 6v6l4 2"/>
      </svg>
    </div>
    <span>Thinking<span class="thinking-dots"><span></span><span></span><span></span></span></span>
  `;
  messagesEl.appendChild(el);
  currentToolIndicator = el;
  scrollToBottom();
}

// Tool metadata: labels and icons
const TOOL_META = {
  read_page: {
    label: 'Reading page',
    icon: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg>'
  },
  find: {
    label: 'Finding elements',
    icon: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="11" cy="11" r="8"/><path d="M21 21l-4.35-4.35"/></svg>'
  },
  form_input: {
    label: 'Filling form',
    icon: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M11 4H4a2 2 0 00-2 2v14a2 2 0 002 2h14a2 2 0 002-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 013 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>'
  },
  computer: {
    label: 'Interacting',
    icon: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 19l9 2-9-18-9 18 9-2zm0 0v-8"/></svg>'
  },
  navigate: {
    label: 'Navigating',
    icon: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><path d="M2 12h20M12 2a15.3 15.3 0 014 10 15.3 15.3 0 01-4 10 15.3 15.3 0 01-4-10 15.3 15.3 0 014-10z"/></svg>'
  },
  get_page_text: {
    label: 'Extracting text',
    icon: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z"/><path d="M14 2v6h6M16 13H8M16 17H8M10 9H8"/></svg>'
  },
  update_plan: {
    label: 'Planning',
    icon: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M9 11l3 3L22 4"/><path d="M21 12v7a2 2 0 01-2 2H5a2 2 0 01-2-2V5a2 2 0 012-2h11"/></svg>'
  },
  tabs_create: {
    label: 'Creating tab',
    icon: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="3" width="18" height="18" rx="2" ry="2"/><line x1="12" y1="8" x2="12" y2="16"/><line x1="8" y1="12" x2="16" y2="12"/></svg>'
  },
  tabs_context: {
    label: 'Getting tabs',
    icon: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="2" y="3" width="20" height="14" rx="2" ry="2"/><line x1="8" y1="21" x2="16" y2="21"/><line x1="12" y1="17" x2="12" y2="21"/></svg>'
  },
  javascript_tool: {
    label: 'Running script',
    icon: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="16 18 22 12 16 6"/><polyline points="8 6 2 12 8 18"/></svg>'
  },
  upload_image: {
    label: 'Uploading image',
    icon: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="3" width="18" height="18" rx="2" ry="2"/><circle cx="8.5" cy="8.5" r="1.5"/><polyline points="21 15 16 10 5 21"/></svg>'
  },
};

function getToolLabel(toolName) {
  return TOOL_META[toolName]?.label || toolName.replace(/_/g, ' ');
}

function getToolIcon(toolName) {
  return TOOL_META[toolName]?.icon || '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><path d="M12 16v-4M12 8h.01"/></svg>';
}

/**
 * Generate human-readable action description from tool input
 */
function getActionDescription(toolName, input) {
  if (!input) return getToolLabel(toolName);

  switch (toolName) {
    case 'computer': {
      const action = input.action;
      if (action === 'click' || action === 'left_click') {
        if (input.ref) return `Clicking element ref_${input.ref}`;
        if (input.coordinate) return `Clicking at (${input.coordinate[0]}, ${input.coordinate[1]})`;
        return 'Clicking';
      }
      if (action === 'type') {
        const text = input.text?.substring(0, 30) || '';
        return `Typing "${text}${input.text?.length > 30 ? '...' : ''}"`;
      }
      if (action === 'key') return `Pressing ${input.key}`;
      if (action === 'scroll') return `Scrolling ${input.direction || 'down'}`;
      if (action === 'screenshot') return 'Taking screenshot';
      if (action === 'drag') return 'Dragging element';
      return `${action || 'Interacting'}`;
    }
    case 'form_input': {
      const value = input.value?.substring(0, 25) || '';
      if (input.ref) return `Filling ref_${input.ref} with "${value}${input.value?.length > 25 ? '...' : ''}"`;
      return `Filling form field`;
    }
    case 'navigate': {
      try {
        const url = new URL(input.url);
        return `Navigating to ${url.hostname}`;
      } catch {
        return `Navigating to ${input.url?.substring(0, 30) || 'URL'}`;
      }
    }
    case 'find': {
      const query = input.query?.substring(0, 30) || '';
      return `Finding "${query}${input.query?.length > 30 ? '...' : ''}"`;
    }
    case 'read_page':
      return input.filter === 'interactive' ? 'Reading interactive elements' : 'Reading full page';
    case 'get_page_text':
      return 'Extracting page text';
    case 'tabs_create':
      return `Opening new tab`;
    case 'tabs_context':
      return 'Getting tab info';
    case 'javascript_tool':
      return 'Running JavaScript';
    case 'update_plan':
      return 'Updating plan';
    default:
      return getToolLabel(toolName);
  }
}

/**
 * Format step result for display
 */
function formatStepResult(result) {
  if (!result || result === 'done') return null;
  if (typeof result !== 'string') return null;
  // Truncate long results
  if (result.length > 100) return result.substring(0, 100) + '...';
  return result;
}

function addCompletedStep(toolName, input = null, result = null) {
  const description = getActionDescription(toolName, input);
  completedSteps.push({ tool: toolName, input, result, description });
  updateStepsSection();
}

function updateStepsSection() {
  if (completedSteps.length === 0) return;

  if (!stepsSection) {
    stepsSection = document.createElement('div');
    stepsSection.className = 'steps-section';
    stepsSection.innerHTML = `
      <div class="steps-toggle">
        <div class="toggle-icon">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="9 11 12 14 22 4"/><path d="M21 12v7a2 2 0 01-2 2H5a2 2 0 01-2-2V5a2 2 0 012-2h11"/></svg>
        </div>
        <span class="toggle-text">${completedSteps.length} step${completedSteps.length !== 1 ? 's' : ''} completed</span>
        <svg class="chevron" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M6 9l6 6 6-6"/></svg>
      </div>
      <div class="steps-list"></div>
    `;
    const toggle = stepsSection.querySelector('.steps-toggle');
    const list = stepsSection.querySelector('.steps-list');
    toggle.addEventListener('click', () => {
      toggle.classList.toggle('expanded');
      list.classList.toggle('visible');
    });
    messagesEl.appendChild(stepsSection);
  }

  const stepCount = completedSteps.length;
  stepsSection.querySelector('.toggle-text').textContent = `${stepCount} step${stepCount !== 1 ? 's' : ''} completed`;
  stepsSection.querySelector('.steps-list').innerHTML = completedSteps.map(step => {
    const resultText = formatStepResult(step.result);
    return `
      <div class="step-item">
        <div class="step-icon success">${getToolIcon(step.tool)}</div>
        <div class="step-content">
          <div class="step-label">${escapeHtml(step.description)}</div>
          ${resultText ? `<div class="step-result">${escapeHtml(resultText)}</div>` : ''}
        </div>
        <div class="step-status">✓</div>
      </div>
    `;
  }).join('');
  scrollToBottom();
}

function escapeHtml(text) {
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
}

function showPlanApproval(plan) {
  planDomains.innerHTML = plan.domains.map(d => `<span style="padding:4px 10px;background:var(--bg-tertiary);border-radius:12px;font-size:12px;">${d}</span>`).join('');
  planSteps.innerHTML = plan.approach.map(s => `<li style="margin:6px 0;">${s}</li>`).join('');
  planModal.classList.remove('hidden');
}

function scrollToBottom() {
  messagesEl.scrollTop = messagesEl.scrollHeight;
}

function clearChat() {
  messagesEl.innerHTML = '';
  const emptyState = document.createElement('div');
  emptyState.className = 'empty-state';
  emptyState.id = 'empty-state';
  emptyState.innerHTML = `<h2>What can I help with?</h2><p>I can browse the web, fill forms, click buttons, and automate tasks in your browser.</p>`;
  messagesEl.appendChild(emptyState);
  completedSteps = [];
  pendingStep = null;
  stepsSection = null;
  currentStreamingMessage = null;
  currentToolIndicator = null;
  isRunning = false;
  sendBtn.disabled = false;
  chrome.runtime.sendMessage({ type: 'CLEAR_CONVERSATION' }).catch(() => {});
}
