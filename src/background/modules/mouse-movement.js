/**
 * Human-like mouse movement simulation.
 *
 * Generates realistic mouse movement paths to avoid bot detection.
 * Sites often track mouse_movement_count and mouse_total_distance
 * to detect automation.
 */

// Track last known mouse position (per tab)
const lastMousePosition = new Map();

/**
 * Get last mouse position for a tab, or generate a random starting position
 */
export function getLastPosition(tabId, viewportWidth = 1920, viewportHeight = 1080) {
  if (lastMousePosition.has(tabId)) {
    return lastMousePosition.get(tabId);
  }
  // Start from a random position in the viewport
  return {
    x: Math.random() * viewportWidth * 0.8 + viewportWidth * 0.1,
    y: Math.random() * viewportHeight * 0.8 + viewportHeight * 0.1,
  };
}

/**
 * Update last mouse position for a tab
 */
export function setLastPosition(tabId, x, y) {
  lastMousePosition.set(tabId, { x, y });
}

/**
 * Clear mouse position tracking for a tab (call when tab closes)
 */
export function clearPosition(tabId) {
  lastMousePosition.delete(tabId);
}

/**
 * Generate a human-like mouse movement path from start to end.
 *
 * Uses ease-out quadratic curve with small random jitter.
 * Based on the Camoufox/PyAutoGUI approach.
 *
 * @param {number} startX - Starting X coordinate
 * @param {number} startY - Starting Y coordinate
 * @param {number} endX - Target X coordinate
 * @param {number} endY - Target Y coordinate
 * @param {object} options - Configuration options
 * @returns {Array<{x: number, y: number, delay: number}>} Array of points with delays
 */
export function generateMousePath(startX, startY, endX, endY, options = {}) {
  const {
    minSteps = 10,
    stepsPerPixel = 50, // One step per N pixels of distance
    totalDuration = null, // Total duration in ms, or null to calculate
    jitterAmount = 1, // Max jitter in pixels
  } = options;

  // Calculate distance
  const distance = Math.sqrt(
    Math.pow(endX - startX, 2) + Math.pow(endY - startY, 2)
  );

  // Calculate number of steps (more steps for longer distances)
  const steps = Math.max(minSteps, Math.floor(distance / stepsPerPixel));

  // Calculate duration (200-600ms based on distance, or use provided)
  const duration = totalDuration ?? Math.min(600, Math.max(200, distance * 0.5));
  const delayPerStep = duration / steps;

  const path = [];

  for (let i = 0; i <= steps; i++) {
    // Ease-out quadratic: starts fast, slows down at end (more natural)
    const t = 1 - Math.pow(1 - i / steps, 2);

    // Add jitter except on the final step
    const jx = i < steps ? (Math.random() * 2 - 1) * jitterAmount : 0;
    const jy = i < steps ? (Math.random() * 2 - 1) * jitterAmount : 0;

    const x = startX + (endX - startX) * t + jx;
    const y = startY + (endY - startY) * t + jy;

    path.push({
      x: Math.round(x),
      y: Math.round(y),
      delay: delayPerStep,
    });
  }

  return path;
}

/**
 * Simulate mouse movement to a target position using Chrome debugger.
 *
 * @param {number} tabId - Tab ID to send events to
 * @param {number} targetX - Target X coordinate
 * @param {number} targetY - Target Y coordinate
 * @param {function} sendDebuggerCommand - Function to send debugger commands
 * @param {object} options - Options for path generation
 */
export async function simulateMouseMovement(
  tabId,
  targetX,
  targetY,
  sendDebuggerCommand,
  options = {}
) {
  const { viewportWidth = 1920, viewportHeight = 1080 } = options;

  // Get starting position
  const start = getLastPosition(tabId, viewportWidth, viewportHeight);

  // Generate path
  const path = generateMousePath(start.x, start.y, targetX, targetY, options);

  // Send mouse move events along the path
  for (const point of path) {
    await sendDebuggerCommand(tabId, 'Input.dispatchMouseEvent', {
      type: 'mouseMoved',
      x: point.x,
      y: point.y,
      button: 'none',
      buttons: 0,
    });

    if (point.delay > 0) {
      await new Promise(r => setTimeout(r, point.delay));
    }
  }

  // Update last position
  setLastPosition(tabId, targetX, targetY);
}

/**
 * Generate some idle mouse movements (small movements near current position).
 * Call this periodically to simulate natural mouse activity.
 *
 * @param {number} tabId - Tab ID
 * @param {function} sendDebuggerCommand - Function to send debugger commands
 * @param {object} options - Options
 */
export async function simulateIdleMovement(
  tabId,
  sendDebuggerCommand,
  options = {}
) {
  const { viewportWidth = 1920, viewportHeight = 1080 } = options;

  const current = getLastPosition(tabId, viewportWidth, viewportHeight);

  // Small random movement (10-50 pixels in random direction)
  const distance = 10 + Math.random() * 40;
  const angle = Math.random() * Math.PI * 2;
  const targetX = Math.max(0, Math.min(viewportWidth, current.x + Math.cos(angle) * distance));
  const targetY = Math.max(0, Math.min(viewportHeight, current.y + Math.sin(angle) * distance));

  await simulateMouseMovement(tabId, targetX, targetY, sendDebuggerCommand, {
    ...options,
    totalDuration: 100 + Math.random() * 200, // Quick small movement
  });
}
