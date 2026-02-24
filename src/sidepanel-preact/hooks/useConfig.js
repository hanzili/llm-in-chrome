import { useState, useEffect, useCallback } from 'preact/hooks';
import { PROVIDERS, CODEX_MODELS } from '../config/providers';

export function useConfig() {
  const [providerKeys, setProviderKeys] = useState({});
  const [customModels, setCustomModels] = useState([]);
  const [currentModelIndex, setCurrentModelIndex] = useState(0);
  const [userSkills, setUserSkills] = useState([]);
  const [builtInSkills, setBuiltInSkills] = useState([]);
  const [availableModels, setAvailableModels] = useState([]);
  const [oauthStatus, setOauthStatus] = useState({ isOAuthEnabled: false, isAuthenticated: false });
  const [codexStatus, setCodexStatus] = useState({ isAuthenticated: false });
  const [isLoading, setIsLoading] = useState(true);

  // Load config on mount
  useEffect(() => {
    loadConfig();
  }, []);

  const loadConfig = useCallback(async () => {
    try {
      const config = await chrome.runtime.sendMessage({ type: 'GET_CONFIG' });
      setProviderKeys(config.providerKeys || {});
      setCustomModels(config.customModels || []);
      setCurrentModelIndex(config.currentModelIndex || 0);
      setUserSkills(config.userSkills || []);
      setBuiltInSkills(config.builtInSkills || []);

      // Get OAuth statuses
      const oauth = await chrome.runtime.sendMessage({ type: 'GET_OAUTH_STATUS' });
      setOauthStatus(oauth || { isOAuthEnabled: false, isAuthenticated: false });

      const codex = await chrome.runtime.sendMessage({ type: 'GET_CODEX_STATUS' });
      setCodexStatus(codex || { isAuthenticated: false });

      // Build available models
      await buildAvailableModels(
        config.providerKeys || {},
        config.customModels || [],
        oauth,
        codex
      );

      setIsLoading(false);
    } catch (error) {
      console.error('Failed to load config:', error);
      setIsLoading(false);
    }
  }, []);

  const buildAvailableModels = useCallback(async (keys, custom, oauth, codex) => {
    const models = [];
    const hasOAuth = oauth?.isOAuthEnabled && oauth?.isAuthenticated;
    const hasCodexOAuth = codex?.isAuthenticated;

    // Add Codex Plan models if connected
    if (hasCodexOAuth) {
      for (const model of CODEX_MODELS) {
        models.push({
          name: `${model.name} (Codex Plan)`,
          provider: 'codex',
          modelId: model.id,
          baseUrl: 'https://chatgpt.com/backend-api/codex/responses',
          apiKey: null,
          authMethod: 'codex_oauth',
        });
      }
    }

    // Add provider models
    for (const [providerId, provider] of Object.entries(PROVIDERS)) {
      const hasApiKey = keys[providerId];

      if (providerId === 'anthropic') {
        // Add OAuth models (Claude Code Plan)
        if (hasOAuth) {
          for (const model of provider.models) {
            models.push({
              name: `${model.name} (Claude Code)`,
              provider: providerId,
              modelId: model.id,
              baseUrl: provider.baseUrl,
              apiKey: null,
              authMethod: 'oauth',
            });
          }
        }
        // Add API key models
        if (hasApiKey) {
          for (const model of provider.models) {
            models.push({
              name: `${model.name} (API)`,
              provider: providerId,
              modelId: model.id,
              baseUrl: provider.baseUrl,
              apiKey: hasApiKey,
              authMethod: 'api_key',
            });
          }
        }
      } else if (hasApiKey) {
        for (const model of provider.models) {
          models.push({
            name: `${model.name} (API)`,
            provider: providerId,
            modelId: model.id,
            baseUrl: provider.baseUrl,
            apiKey: hasApiKey,
            authMethod: 'api_key',
          });
        }
      }
    }

    // Add custom models
    for (const customModel of custom) {
      models.push({
        name: customModel.name,
        provider: 'custom',
        modelId: customModel.modelId,
        baseUrl: customModel.baseUrl,
        apiKey: customModel.apiKey,
        authMethod: 'api_key',
      });
    }

    setAvailableModels(models);
  }, []);

  const saveConfig = useCallback(async () => {
    await chrome.runtime.sendMessage({
      type: 'SAVE_CONFIG',
      payload: {
        providerKeys,
        customModels,
        currentModelIndex,
        userSkills,
      },
    });
  }, [providerKeys, customModels, currentModelIndex, userSkills]);

  const selectModel = useCallback(async (index) => {
    setCurrentModelIndex(index);
    const model = availableModels[index];
    if (model) {
      // Clear conversation history when switching models to prevent identity confusion
      await chrome.runtime.sendMessage({ type: 'CLEAR_CHAT' }).catch(() => {});
      await chrome.runtime.sendMessage({
        type: 'SAVE_CONFIG',
        payload: {
          currentModelIndex: index,
          model: model.modelId,
          apiBaseUrl: model.baseUrl,
          apiKey: model.apiKey,
          authMethod: model.authMethod,
        },
      });
    }
  }, [availableModels]);

  const setProviderKey = useCallback((provider, key) => {
    setProviderKeys(prev => ({ ...prev, [provider]: key }));
  }, []);

  const addCustomModel = useCallback((model) => {
    setCustomModels(prev => [...prev, model]);
  }, []);

  const removeCustomModel = useCallback((index) => {
    setCustomModels(prev => prev.filter((_, i) => i !== index));
  }, []);

  const addUserSkill = useCallback((skill) => {
    setUserSkills(prev => {
      const existingIndex = prev.findIndex(s => s.domain === skill.domain);
      if (existingIndex >= 0) {
        const updated = [...prev];
        updated[existingIndex] = skill;
        return updated;
      }
      return [...prev, skill];
    });
  }, []);

  const removeUserSkill = useCallback((index) => {
    setUserSkills(prev => prev.filter((_, i) => i !== index));
  }, []);

  const importCLI = useCallback(async () => {
    const result = await chrome.runtime.sendMessage({ type: 'IMPORT_CLI_CREDENTIALS' });
    if (result.success) {
      await loadConfig();
    }
    return result;
  }, [loadConfig]);

  const logoutCLI = useCallback(async () => {
    await chrome.runtime.sendMessage({ type: 'OAUTH_LOGOUT' });
    await loadConfig();
  }, [loadConfig]);

  const importCodex = useCallback(async () => {
    const result = await chrome.runtime.sendMessage({ type: 'IMPORT_CODEX_CREDENTIALS' });
    if (result.success) {
      await loadConfig();
    }
    return result;
  }, [loadConfig]);

  const logoutCodex = useCallback(async () => {
    await chrome.runtime.sendMessage({ type: 'CODEX_LOGOUT' });
    await loadConfig();
  }, [loadConfig]);

  const currentModel = availableModels[currentModelIndex] || null;

  return {
    // State
    providerKeys,
    customModels,
    currentModelIndex,
    userSkills,
    builtInSkills,
    availableModels,
    currentModel,
    oauthStatus,
    codexStatus,
    isLoading,

    // Actions
    loadConfig,
    saveConfig,
    selectModel,
    setProviderKey,
    addCustomModel,
    removeCustomModel,
    addUserSkill,
    removeUserSkill,
    importCLI,
    logoutCLI,
    importCodex,
    logoutCodex,
  };
}
