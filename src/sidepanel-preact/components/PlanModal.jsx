export function PlanModal({ plan, onApprove, onCancel }) {
  return (
    <div class="modal-overlay">
      <div class="modal">
        <div class="modal-header">Review Plan</div>
        <div class="modal-body">
          <div class="plan-section">
            <h4>Domains to visit:</h4>
            <ul class="plan-domains">
              {(plan.domains || []).map((domain, i) => (
                <li key={i}>{domain}</li>
              ))}
            </ul>
          </div>

          <div class="plan-section">
            <h4>Approach:</h4>
            <ul class="plan-steps">
              {(Array.isArray(plan.approach) ? plan.approach : [plan.approach]).map((step, i) => (
                <li key={i}>{step}</li>
              ))}
            </ul>
          </div>
        </div>
        <div class="modal-footer">
          <button class="btn btn-secondary" onClick={onCancel}>
            Cancel
          </button>
          <button class="btn btn-primary" onClick={onApprove}>
            Approve & Continue
          </button>
        </div>
      </div>
    </div>
  );
}
