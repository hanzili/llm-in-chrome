import { useState } from 'preact/hooks';
import { getToolIcon, getActionDescription, formatStepResult, escapeHtml } from '../utils/format';

export function StepsSection({ steps, pendingStep }) {
  const [isExpanded, setIsExpanded] = useState(false);

  const totalSteps = steps.length + (pendingStep ? 1 : 0);

  if (totalSteps === 0) return null;

  return (
    <div class="steps-section">
      <div
        class={`steps-toggle ${isExpanded ? 'expanded' : ''}`}
        onClick={() => setIsExpanded(!isExpanded)}
      >
        <div class="toggle-icon">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <polyline points="9 11 12 14 22 4" />
            <path d="M21 12v7a2 2 0 01-2 2H5a2 2 0 01-2-2V5a2 2 0 012-2h11" />
          </svg>
        </div>
        <span class="toggle-text">
          {steps.length} step{steps.length !== 1 ? 's' : ''} completed
          {pendingStep && ' (1 in progress)'}
        </span>
        <svg class="chevron" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <path d="M6 9l6 6 6-6" />
        </svg>
      </div>

      <div class={`steps-list ${isExpanded ? 'visible' : ''}`}>
        {steps.map((step, index) => (
          <StepItem key={index} step={step} status="completed" />
        ))}
        {pendingStep && (
          <StepItem step={pendingStep} status="pending" />
        )}
      </div>
    </div>
  );
}

function StepItem({ step, status }) {
  const description = getActionDescription(step.tool, step.input);
  const resultText = status === 'completed' ? formatStepResult(step.result) : null;

  return (
    <div class={`step-item ${status}`}>
      <div class={`step-icon ${status === 'completed' ? 'success' : 'pending'}`}>
        {status === 'pending' ? (
          <svg class="spinner" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <circle cx="12" cy="12" r="10" />
          </svg>
        ) : (
          <span dangerouslySetInnerHTML={{ __html: getToolIcon(step.tool) }} />
        )}
      </div>
      <div class="step-content">
        <div class="step-label">{escapeHtml(description)}</div>
        {resultText && (
          <div class="step-result">{escapeHtml(resultText)}</div>
        )}
      </div>
      <div class="step-status">
        {status === 'completed' ? '✓' : '...'}
      </div>
    </div>
  );
}
