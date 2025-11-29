// interpreter/interpreter-worker.js
// =====================================
// Web Worker interface for the interpreter
// =====================================
// Receives messages from main thread:
//   { type: 'run', code, settings, customFunctions, limits }
// Sends messages back:
//   { type: 'output', chunk }
//   { type: 'canvas', command }
//   { type: 'done', result }
//   { type: 'error', error }
//   { type: 'clear' }
//   { type: 'usage', usage }
//
// This allows safe execution of user code in a sandboxed thread with resource limits.
//
// Author: [Your Name]
// License: MIT
// =====================================

// Use require for Node.js worker environment
const { tokenize } = require('./tokenizer.js');
const { parse } = require('./parser.js');
const { evalNode } = require('./evaluator.js');
const { getInitialState } = require('./utils.js');
const { interpret } = require('./interpreter.js');

let running = false;
let state = null;
let usageInterval = null;

function post(type, data) {
  self.postMessage({ type, ...data });
}

self.onmessage = async function (e) {
  const msg = e.data;
  if (!msg || !msg.type) return;

  if (msg.type === 'run') {
    if (running) {
      post('error', { error: 'Interpreter is already running.' });
      return;
    }
    running = true;
    
    // Set up usage reporting interval
    
    try {
      const callbacks = {
        onChunk: (chunk) => post('output', { chunk }),
        onConsoleClear: () => post('clear', {}),
        onCanvasUpdate: (command) => post('canvas', { command }),
        wait: async (ms) => {
          return new Promise(resolve => setTimeout(resolve, ms));
        },
        customFunctions: msg.customFunctions || {},
      };
      
      // Include resource limits in settings
      const defaultLimits = {
        maxCommands: Infinity,
        maxMemoryMB: 100,
        maxCpuTimeMs: 60000
      };
      
      const settings = {
        ...(msg.settings || {}),
        limits: {
          ...defaultLimits,
          ...(msg.limits || {})
        }
      };
      
      state = getInitialState(callbacks, settings);

      // Report usage every 500ms during execution
      usageInterval = setInterval(() => {
        if (state && state.resourceLimiter) {
          post('usage', { usage: state.resourceLimiter.getUsage() });
        }
      }, 500);

      const result = await interpret(msg.code, state);
      
      // If exit was called, always stop regardless of event handlers
      if (result === "exit" || state.shouldExit) {
        clearInterval(usageInterval);
        running = false;
        post('usage', { usage: state.resourceLimiter.getUsage() }); // Final usage report
        post('done', { result: 'exit' });
        return;
      }
      
      // Check if any event handlers were defined. If so, the script stays alive.
      const hasEventHandlers = Object.values(state.eventHandlers).some(handler => handler !== null);

      if (hasEventHandlers) {
        // The script is event-driven, so we keep the worker alive to listen for events.
        // The usage interval also continues to run.
      } else {
        // No event handlers, so the script is finished.
        clearInterval(usageInterval);
        running = false;
        post('usage', { usage: state.resourceLimiter.getUsage() }); // Final usage report
        post('done', { result });
      }
    } catch (error) {
      clearInterval(usageInterval);
      running = false;
      post('error', { error: (error && error.message) || String(error) });
    }
    return;
  }

  // Handle getUsage ping from server
  if (msg.type === 'getUsage') {
    if (state && state.resourceLimiter) {
      post('usage', { usage: state.resourceLimiter.getUsage() });
    }
    return;
  }

  // Handle event messages: { type: 'event', handler, event }
  if (msg.type === 'event') {
    if (!state || !state.eventHandlers) return;
    const handler = state.eventHandlers[msg.handler];
    if (typeof handler === 'function') {
      // Call the handler with the event object
      Promise.resolve(handler(msg.event)).catch((err) => {
        post('output', { chunk: '[Event handler error] ' + (err && err.message ? err.message : err) + '\n' });
      });
    }
    return;
  }
};
