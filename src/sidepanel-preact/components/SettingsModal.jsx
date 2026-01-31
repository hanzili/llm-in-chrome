import { useState } from 'preact/hooks';
import { PROVIDERS } from '../config/providers';

export function SettingsModal({ config, onClose }) {
  const [activeTab, setActiveTab] = useState('providers');
  const [selectedProvider, setSelectedProvider] = useState(null);
  const [localKeys, setLocalKeys] = useState({ ...config.providerKeys });
  const [newCustomModel, setNewCustomModel] = useState({ name: '', baseUrl: '', modelId: '', apiKey: '' });
  const [skillForm, setSkillForm] = useState({ domain: '', skill: '', isOpen: false, editIndex: -1 });

  const handleSave = async () => {
    // Update provider keys
    for (const [provider, key] of Object.entries(localKeys)) {
      if (key !== config.providerKeys[provider]) {
        config.setProviderKey(provider, key);
      }
    }
    await config.saveConfig();
    onClose();
  };

  const handleAddCustomModel = () => {
    if (!newCustomModel.name || !newCustomModel.baseUrl || !newCustomModel.modelId) {
      alert('Please fill in name, base URL, and model ID');
      return;
    }
    config.addCustomModel({ ...newCustomModel });
    setNewCustomModel({ name: '', baseUrl: '', modelId: '', apiKey: '' });
  };

  const handleAddSkill = () => {
    if (!skillForm.domain || !skillForm.skill) {
      alert('Please fill in both domain and tips/guidance');
      return;
    }
    config.addUserSkill({ domain: skillForm.domain.toLowerCase(), skill: skillForm.skill });
    setSkillForm({ domain: '', skill: '', isOpen: false, editIndex: -1 });
  };

  const handleEditSkill = (index) => {
    const skill = config.userSkills[index];
    setSkillForm({ domain: skill.domain, skill: skill.skill, isOpen: true, editIndex: index });
  };

  return (
    <div class="modal-overlay" onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div class="modal settings-modal">
        <div class="modal-header">
          <span>Settings</span>
          <button class="close-btn" onClick={onClose}>&times;</button>
        </div>

        <div class="tabs">
          <button
            class={`tab ${activeTab === 'providers' ? 'active' : ''}`}
            onClick={() => setActiveTab('providers')}
          >
            Providers
          </button>
          <button
            class={`tab ${activeTab === 'custom' ? 'active' : ''}`}
            onClick={() => setActiveTab('custom')}
          >
            Custom Models
          </button>
          <button
            class={`tab ${activeTab === 'skills' ? 'active' : ''}`}
            onClick={() => setActiveTab('skills')}
          >
            Domain Skills
          </button>
        </div>

        <div class="modal-body">
          {activeTab === 'providers' && (
            <ProvidersTab
              localKeys={localKeys}
              setLocalKeys={setLocalKeys}
              selectedProvider={selectedProvider}
              setSelectedProvider={setSelectedProvider}
              config={config}
            />
          )}

          {activeTab === 'custom' && (
            <CustomModelsTab
              customModels={config.customModels}
              newModel={newCustomModel}
              setNewModel={setNewCustomModel}
              onAdd={handleAddCustomModel}
              onRemove={config.removeCustomModel}
            />
          )}

          {activeTab === 'skills' && (
            <SkillsTab
              userSkills={config.userSkills}
              builtInSkills={config.builtInSkills}
              skillForm={skillForm}
              setSkillForm={setSkillForm}
              onAdd={handleAddSkill}
              onEdit={handleEditSkill}
              onRemove={config.removeUserSkill}
            />
          )}
        </div>

        <div class="modal-footer">
          <button class="btn btn-secondary" onClick={onClose}>Close</button>
          <button class="btn btn-primary" onClick={handleSave}>Save</button>
        </div>
      </div>
    </div>
  );
}

function ProvidersTab({ localKeys, setLocalKeys, selectedProvider, setSelectedProvider, config }) {
  return (
    <div class="tab-content">
      {/* Claude Code Plan */}
      <div class="provider-section">
        <h4>Claude Code Plan</h4>
        <p class="provider-desc">Use your Claude Pro/Max subscription. <a href="https://github.com/hanzili/llm-in-chrome#claude-code-plan-setup" target="_blank">Setup guide</a></p>
        {config.oauthStatus.isAuthenticated ? (
          <div class="connected-status">
            <span class="status-badge connected">Connected</span>
            <button class="btn btn-secondary btn-sm" onClick={config.logoutCLI}>Disconnect</button>
          </div>
        ) : (
          <button class="btn btn-primary" onClick={config.importCLI}>Connect</button>
        )}
      </div>

      {/* Codex Plan */}
      <div class="provider-section">
        <h4>Codex Plan</h4>
        <p class="provider-desc">Use your ChatGPT Pro/Plus subscription. <a href="https://github.com/hanzili/llm-in-chrome#codex-plan-setup" target="_blank">Setup guide</a></p>
        {config.codexStatus.isAuthenticated ? (
          <div class="connected-status">
            <span class="status-badge connected">Connected</span>
            <button class="btn btn-secondary btn-sm" onClick={config.logoutCodex}>Disconnect</button>
          </div>
        ) : (
          <button class="btn btn-primary" onClick={config.importCodex}>Connect</button>
        )}
      </div>

      <hr />

      {/* API Keys */}
      <h4>API Keys (Pay-per-use)</h4>
      <div class="provider-cards">
        {Object.entries(PROVIDERS).map(([id, provider]) => (
          <div
            key={id}
            class={`provider-card ${selectedProvider === id ? 'selected' : ''} ${localKeys[id] ? 'configured' : ''}`}
            onClick={() => setSelectedProvider(selectedProvider === id ? null : id)}
          >
            <div class="provider-name">{provider.name}</div>
            {localKeys[id] && <span class="check-badge">✓</span>}
          </div>
        ))}
      </div>

      {selectedProvider && (
        <div class="api-key-input">
          <label>{PROVIDERS[selectedProvider].name} API Key</label>
          <input
            type="password"
            value={localKeys[selectedProvider] || ''}
            onInput={(e) => setLocalKeys({ ...localKeys, [selectedProvider]: e.target.value })}
            placeholder="Enter API key..."
          />
        </div>
      )}
    </div>
  );
}

function CustomModelsTab({ customModels, newModel, setNewModel, onAdd, onRemove }) {
  return (
    <div class="tab-content">
      <p class="tab-desc">Add custom OpenAI-compatible endpoints</p>

      <div class="custom-model-form">
        <input
          type="text"
          placeholder="Display Name"
          value={newModel.name}
          onInput={(e) => setNewModel({ ...newModel, name: e.target.value })}
        />
        <input
          type="text"
          placeholder="Base URL (e.g., https://api.example.com/v1/chat/completions)"
          value={newModel.baseUrl}
          onInput={(e) => setNewModel({ ...newModel, baseUrl: e.target.value })}
        />
        <input
          type="text"
          placeholder="Model ID"
          value={newModel.modelId}
          onInput={(e) => setNewModel({ ...newModel, modelId: e.target.value })}
        />
        <input
          type="password"
          placeholder="API Key (optional)"
          value={newModel.apiKey}
          onInput={(e) => setNewModel({ ...newModel, apiKey: e.target.value })}
        />
        <button class="btn btn-primary" onClick={onAdd}>Add Model</button>
      </div>

      {customModels.length > 0 && (
        <div class="custom-models-list">
          <h4>Custom Models</h4>
          {customModels.map((model, i) => (
            <div key={i} class="custom-model-item">
              <div class="model-info">
                <span class="model-name">{model.name}</span>
                <span class="model-url">{model.baseUrl}</span>
              </div>
              <button class="btn btn-danger btn-sm" onClick={() => onRemove(i)}>Remove</button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function SkillsTab({ userSkills, builtInSkills, skillForm, setSkillForm, onAdd, onEdit, onRemove }) {
  return (
    <div class="tab-content">
      <p class="tab-desc">Add domain-specific tips to help the AI navigate websites</p>

      <button
        class="btn btn-secondary"
        onClick={() => setSkillForm({ ...skillForm, isOpen: true, editIndex: -1, domain: '', skill: '' })}
      >
        + Add Skill
      </button>

      {skillForm.isOpen && (
        <div class="skill-form">
          <input
            type="text"
            placeholder="Domain (e.g., github.com)"
            value={skillForm.domain}
            onInput={(e) => setSkillForm({ ...skillForm, domain: e.target.value })}
          />
          <textarea
            placeholder="Tips and guidance for this domain..."
            value={skillForm.skill}
            onInput={(e) => setSkillForm({ ...skillForm, skill: e.target.value })}
            rows={4}
          />
          <div class="skill-form-actions">
            <button class="btn btn-secondary" onClick={() => setSkillForm({ ...skillForm, isOpen: false })}>
              Cancel
            </button>
            <button class="btn btn-primary" onClick={onAdd}>
              {skillForm.editIndex >= 0 ? 'Update' : 'Add'}
            </button>
          </div>
        </div>
      )}

      <div class="skills-list">
        {userSkills.length > 0 && (
          <>
            <h4>Your Skills</h4>
            {userSkills.map((skill, i) => (
              <div key={i} class="skill-item">
                <div class="skill-domain">{skill.domain}</div>
                <div class="skill-preview">{skill.skill.substring(0, 100)}...</div>
                <div class="skill-actions">
                  <button class="btn btn-sm" onClick={() => onEdit(i)}>Edit</button>
                  <button class="btn btn-sm btn-danger" onClick={() => onRemove(i)}>Delete</button>
                </div>
              </div>
            ))}
          </>
        )}

        {builtInSkills.length > 0 && (
          <>
            <h4>Built-in Skills</h4>
            {builtInSkills.map((skill, i) => (
              <div key={i} class="skill-item builtin">
                <div class="skill-domain">{skill.domain}</div>
                <div class="skill-preview">{skill.skill.substring(0, 100)}...</div>
              </div>
            ))}
          </>
        )}
      </div>
    </div>
  );
}
