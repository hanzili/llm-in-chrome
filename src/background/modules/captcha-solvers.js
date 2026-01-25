/**
 * CAPTCHA Solvers - Site-specific CAPTCHA solving logic
 *
 * Each solver is keyed by domain and challenge type.
 * Solvers return { success: true, indices: [...] } or { success: false, error: '...' }
 */

const SOLVERS = {
  'deckathon-concordia.com': {
    'pretty_faces': bruteForceSolver,
    'select_songs': bruteForceSolver, // Same approach works
  }
};

/**
 * Brute force solver for deckathon CAPTCHAs
 * Tries combinations until one succeeds
 * Returns indices AND the successful response (which may contain a token)
 */
async function bruteForceSolver(imageUrls, encryptedAnswer, purpose) {
  const BASE_URL = 'https://hackathon-backend-326152168.us-east4.run.app';
  const DELAY_MS = 100;

  function* combinations(arr, size) {
    if (size === 1) {
      for (const item of arr) yield [item];
      return;
    }
    for (let i = 0; i <= arr.length - size; i++) {
      for (const combo of combinations(arr.slice(i + 1), size - 1)) {
        yield [arr[i], ...combo];
      }
    }
  }

  const sleep = ms => new Promise(r => setTimeout(r, ms));

  // Try different combination sizes (most common first)
  for (const size of [2, 1, 3, 4, 5]) {
    for (const combo of combinations(imageUrls, size)) {
      await sleep(DELAY_MS);
      try {
        const resp = await fetch(BASE_URL + '/captcha/submit', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            selected_urls: combo,
            encrypted_answer: encryptedAnswer,
            purpose: purpose || 'dropout'
          }),
        });
        if (resp.ok) {
          const indices = combo.map(url => imageUrls.indexOf(url)).sort((a, b) => a - b);
          // Get the response body - it may contain a token we need
          let responseData = null;
          try {
            responseData = await resp.json();
          } catch (e) {}
          return { success: true, indices, responseData, solvedUrls: combo };
        }
      } catch (e) {
        // Continue trying
      }
    }
  }

  return { success: false, error: 'Could not solve after trying all combinations' };
}

/**
 * Main entry point - finds and runs the appropriate solver
 * @param {string} domain - The domain (e.g., 'deckathon-concordia.com')
 * @param {string} challengeType - The CAPTCHA type (e.g., 'pretty_faces')
 * @param {string[]} imageUrls - Array of image URLs from the challenge
 * @param {string} encryptedAnswer - The encrypted answer token
 * @param {string} purpose - Optional purpose field for submission
 * @returns {Promise<{success: boolean, indices?: number[], error?: string}>}
 */
export async function solveCaptcha(domain, challengeType, imageUrls, encryptedAnswer, purpose) {
  const domainSolvers = SOLVERS[domain];
  if (!domainSolvers) {
    return { success: false, error: `No CAPTCHA solver for domain: ${domain}` };
  }

  const solver = domainSolvers[challengeType];
  if (!solver) {
    return { success: false, error: `No solver for CAPTCHA type: ${challengeType} on ${domain}` };
  }

  return solver(imageUrls, encryptedAnswer, purpose);
}

/**
 * Check if we have a solver for a given domain/type
 */
export function hasSolver(domain, challengeType) {
  return !!(SOLVERS[domain]?.[challengeType]);
}
