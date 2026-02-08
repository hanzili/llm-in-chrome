/**
 * Agent Test Suite
 *
 * Tests each agent individually with good logging.
 * Run with: npx tsx test/test-agents.ts
 *
 * Logs are saved to: test/logs/test-run-{timestamp}.log
 */

import * as fs from 'fs';
import * as path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// ============================================
// LOGGER
// ============================================

const LOG_DIR = path.join(__dirname, 'logs');
const LOG_FILE = path.join(LOG_DIR, `test-run-${new Date().toISOString().replace(/[:.]/g, '-')}.log`);

// Ensure log directory exists
if (!fs.existsSync(LOG_DIR)) {
  fs.mkdirSync(LOG_DIR, { recursive: true });
}

function log(level: 'INFO' | 'PASS' | 'FAIL' | 'WARN' | 'DEBUG', message: string, data?: any) {
  const timestamp = new Date().toISOString();
  const emoji = { INFO: '📋', PASS: '✅', FAIL: '❌', WARN: '⚠️', DEBUG: '🔍' }[level];

  const logLine = `[${timestamp}] ${emoji} ${level}: ${message}`;
  const dataLine = data ? `\n    Data: ${JSON.stringify(data, null, 2).split('\n').join('\n    ')}` : '';

  // Console output (colored)
  const colors = { INFO: '\x1b[36m', PASS: '\x1b[32m', FAIL: '\x1b[31m', WARN: '\x1b[33m', DEBUG: '\x1b[90m' };
  console.log(`${colors[level]}${logLine}\x1b[0m${dataLine}`);

  // File output
  fs.appendFileSync(LOG_FILE, logLine + dataLine + '\n');
}

function logSection(title: string) {
  const line = '═'.repeat(60);
  const msg = `\n${line}\n${title}\n${line}`;
  console.log(`\x1b[1m${msg}\x1b[0m`);
  fs.appendFileSync(LOG_FILE, msg + '\n');
}

// ============================================
// TEST: LLM Client
// ============================================

async function testLLMClient(): Promise<boolean> {
  logSection('TEST: LLM Client');

  try {
    // We need to import dynamically after setting up the mock
    const { initializeLLMClient, askLLM, isLLMAvailable } = await import('../src/llm/client.js');

    log('INFO', 'Checking if LLM client is available before init...');
    log('DEBUG', `isLLMAvailable() = ${isLLMAvailable()}`);

    // For this test, we'll create a mock native host callback
    // In real use, this would be connected to the actual native host
    let sentMessage: any = null;

    const mockSendToNative = async (message: any) => {
      sentMessage = message;
      log('DEBUG', 'Mock native host received message', message);

      // Simulate a response after a short delay
      // In real tests, this would come from the actual extension
      return Promise.resolve();
    };

    log('INFO', 'Initializing LLM client with mock native host...');
    initializeLLMClient(mockSendToNative);

    log('INFO', 'Checking if LLM client is available after init...');
    const available = isLLMAvailable();
    log('DEBUG', `isLLMAvailable() = ${available}`);

    if (!available) {
      log('FAIL', 'LLM client not available after initialization');
      return false;
    }

    log('INFO', 'Sending test LLM request (will timeout since no real extension)...');

    // This will timeout since we don't have a real extension responding
    // But it tests that the message is correctly formatted and sent
    try {
      const promise = askLLM({
        prompt: 'Test prompt: What is 2+2?',
        systemPrompt: 'You are a helpful math assistant.',
        maxTokens: 100,
        modelTier: 'fast',
      }, 2000); // 2 second timeout for test

      // Check that the message was sent correctly
      await new Promise(resolve => setTimeout(resolve, 100));

      if (!sentMessage) {
        log('FAIL', 'No message was sent to native host');
        return false;
      }

      log('INFO', 'Verifying message format...');

      const checks = [
        { name: 'type', expected: 'llm_request', actual: sentMessage.type },
        { name: 'has requestId', expected: true, actual: !!sentMessage.requestId },
        { name: 'prompt', expected: 'Test prompt: What is 2+2?', actual: sentMessage.prompt },
        { name: 'modelTier', expected: 'fast', actual: sentMessage.modelTier },
      ];

      let allPassed = true;
      for (const check of checks) {
        if (check.actual === check.expected) {
          log('PASS', `${check.name}: ${check.actual}`);
        } else {
          log('FAIL', `${check.name}: expected ${check.expected}, got ${check.actual}`);
          allPassed = false;
        }
      }

      // Let the promise timeout (expected)
      try {
        await promise;
      } catch (e: any) {
        if (e.message.includes('timed out')) {
          log('INFO', 'Request timed out as expected (no real extension)');
        } else {
          throw e;
        }
      }

      return allPassed;

    } catch (error: any) {
      log('FAIL', 'Unexpected error', { error: error.message });
      return false;
    }

  } catch (error: any) {
    log('FAIL', 'Test failed with exception', { error: error.message, stack: error.stack });
    return false;
  }
}

// ============================================
// TEST: Planning Agent (offline - structure only)
// ============================================

async function testPlanningAgentStructure(): Promise<boolean> {
  logSection('TEST: Planning Agent (Structure)');

  try {
    const { gatherContext } = await import('../src/agents/planning.js');

    log('INFO', 'Testing gatherContext with sample task...');

    // Test with a task that has explicit URL (no LLM needed for domain detection)
    const result = await gatherContext({
      task: 'Book a flight on https://united.com from SFO to LAX on March 15',
      context: 'name: John Doe\nemail: john@example.com',
    });

    log('DEBUG', 'Planning result', result);

    const checks = [
      { name: 'domain detected', expected: true, actual: !!result.domain },
      { name: 'domain value', expected: 'united.com', actual: result.domain },
      { name: 'has collectedInfo', expected: true, actual: Object.keys(result.collectedInfo).length > 0 },
      { name: 'readyToExecute defined', expected: true, actual: typeof result.readyToExecute === 'boolean' },
    ];

    let allPassed = true;
    for (const check of checks) {
      if (check.actual === check.expected) {
        log('PASS', `${check.name}: ${check.actual}`);
      } else {
        log('FAIL', `${check.name}: expected ${check.expected}, got ${check.actual}`);
        allPassed = false;
      }
    }

    log('INFO', 'Collected info:', result.collectedInfo);

    return allPassed;

  } catch (error: any) {
    log('FAIL', 'Test failed with exception', { error: error.message, stack: error.stack });
    return false;
  }
}

// ============================================
// TEST: Explorer Agent (offline - structure only)
// ============================================

async function testExplorerAgentStructure(): Promise<boolean> {
  logSection('TEST: Explorer Agent (Structure)');

  try {
    const { explorerAgent } = await import('../src/agents/explorer.js');

    log('INFO', 'Testing needsExploration...');

    // Test for a domain that definitely has no knowledge
    const needsExploration = await explorerAgent.needsExploration('test-domain-that-does-not-exist.com');
    log('DEBUG', `needsExploration for unknown domain: ${needsExploration}`);

    if (needsExploration !== true) {
      log('FAIL', 'Should need exploration for unknown domain');
      return false;
    }
    log('PASS', 'Correctly identifies unknown domain needs exploration');

    log('INFO', 'Testing createExplorationTask...');

    const task = explorerAgent.createExplorationTask(
      'example.com',
      'https://example.com',
      'book a flight'
    );

    log('DEBUG', 'Exploration task', {
      domain: task.domain,
      url: task.url,
      promptLength: task.explorationPrompt.length,
      promptPreview: task.explorationPrompt.substring(0, 200) + '...',
    });

    const checks = [
      { name: 'domain', expected: 'example.com', actual: task.domain },
      { name: 'url', expected: 'https://example.com', actual: task.url },
      { name: 'has exploration prompt', expected: true, actual: task.explorationPrompt.length > 100 },
      { name: 'prompt mentions task hint', expected: true, actual: task.explorationPrompt.includes('book a flight') },
    ];

    let allPassed = true;
    for (const check of checks) {
      if (check.actual === check.expected) {
        log('PASS', `${check.name}: ${check.actual}`);
      } else {
        log('FAIL', `${check.name}: expected ${check.expected}, got ${check.actual}`);
        allPassed = false;
      }
    }

    return allPassed;

  } catch (error: any) {
    log('FAIL', 'Test failed with exception', { error: error.message, stack: error.stack });
    return false;
  }
}

// ============================================
// TEST: Orchestrator Routing Logic
// ============================================

async function testOrchestratorRouting(): Promise<boolean> {
  logSection('TEST: Orchestrator Routing Logic');

  try {
    const { createOrchestrator } = await import('../src/orchestrator/index.js');

    log('INFO', 'Creating orchestrator instance...');
    const orchestrator = createOrchestrator();

    // Track what the browser execute callback receives
    let browserExecuteCalls: any[] = [];

    orchestrator.setBrowserExecuteCallback(async (sessionId, task, url, context, siteKnowledge) => {
      browserExecuteCalls.push({ sessionId, task, url, context, siteKnowledge });
      log('DEBUG', 'Browser execute called', { sessionId, task: task.substring(0, 50) + '...', url });
    });

    log('INFO', 'Starting task to test routing...');

    const result = await orchestrator.startTask({
      task: 'Search for "test query" on https://google.com',
      url: 'https://google.com',
    });

    log('DEBUG', 'Start task result', result);

    const checks = [
      { name: 'has sessionId', expected: true, actual: !!result.sessionId },
      { name: 'has status', expected: true, actual: !!result.status },
      { name: 'domain detected', expected: 'google.com', actual: result.domain },
    ];

    let allPassed = true;
    for (const check of checks) {
      if (check.actual === check.expected) {
        log('PASS', `${check.name}: ${check.actual}`);
      } else {
        log('FAIL', `${check.name}: expected ${check.expected}, got ${check.actual}`);
        allPassed = false;
      }
    }

    // Check if browser was called (depends on whether exploration was needed)
    if (browserExecuteCalls.length > 0) {
      log('INFO', 'Browser execute was called', { calls: browserExecuteCalls.length });

      if (result.exploring) {
        log('PASS', 'Correctly routed to exploration (no site knowledge)');
      } else {
        log('PASS', 'Correctly routed to execution');
      }
    } else if (result.status === 'NEEDS_INFO') {
      log('PASS', 'Correctly identified missing info needed');
      log('INFO', 'Questions:', result.questions);
    }

    // Cleanup
    orchestrator.shutdown();

    return allPassed;

  } catch (error: any) {
    log('FAIL', 'Test failed with exception', { error: error.message, stack: error.stack });
    return false;
  }
}

// ============================================
// MAIN
// ============================================

async function runAllTests() {
  console.log('\n');
  logSection('🧪 AGENT TEST SUITE');
  log('INFO', `Log file: ${LOG_FILE}`);

  const results: { name: string; passed: boolean }[] = [];

  // Run tests
  results.push({ name: 'LLM Client', passed: await testLLMClient() });
  results.push({ name: 'Planning Agent (Structure)', passed: await testPlanningAgentStructure() });
  results.push({ name: 'Explorer Agent (Structure)', passed: await testExplorerAgentStructure() });
  results.push({ name: 'Orchestrator Routing', passed: await testOrchestratorRouting() });

  // Summary
  logSection('📊 TEST SUMMARY');

  const passed = results.filter(r => r.passed).length;
  const total = results.length;

  for (const result of results) {
    log(result.passed ? 'PASS' : 'FAIL', result.name);
  }

  console.log('\n');
  if (passed === total) {
    log('PASS', `All ${total} tests passed!`);
  } else {
    log('FAIL', `${passed}/${total} tests passed`);
  }

  log('INFO', `Full logs saved to: ${LOG_FILE}`);

  process.exit(passed === total ? 0 : 1);
}

runAllTests().catch(err => {
  log('FAIL', 'Test runner crashed', { error: err.message, stack: err.stack });
  process.exit(1);
});
