/**
 * interpreter/interpreter.js
 *
 * A robust interpreter for a custom educational language.
 *
 * Features:
 * - Variables, arithmetic, booleans, strings (with interpolation)
 * - Functions (with arguments, return)
 * - Classes (with methods, fields, instantiation, 'this')
 * - Control flow: if, else, elseif, while, for, break, continue
 * - Drawing primitives: pixel, rect, circle, sprite, clear
 * - Console: log, warn, error, clear
 * - Math utilities
 * - Extensible with custom functions/callbacks
 * - Resource limitations (commands, RAM, CPU time)
 * - Support for both semicolons and newlines as statement separators
 *
 * Designed for use in both Node.js and browser (via worker).
 *
 * Author: [Your Name]
 * License: MIT
 */

const { tokenize } = require('./tokenizer.js');
const { parse } = require('./parser.js');
const { evalNode } = require('./evaluator.js');
const { getInitialState } = require('./utils.js');

/**
 * Interprets code in the custom language.
 *
 * @param {string} code - Source code
 * @param {object} state - Runtime state (from getInitialState)
 * @returns {Promise<string>} - "OK" if successful
 */
async function interpret(code, state) {
  try {
    const tokens = tokenize(code);
    const ast = parse(tokens);
    const env = [state.variables];
    
    for (const stmt of ast) {
      // Check resource limits before each statement
      if (state.resourceLimiter) {
        state.resourceLimiter.checkLimits();
      }
      await evalNode(stmt, env, state, []);
    }
    
    return "OK";
  } catch (error) {
    if (error && error.message === "exit") return "exit";
    throw error;
  }
}

// Export individual modules for direct use if needed
module.exports = {
  tokenize,
  parse,
  evalNode,
  getInitialState,
  interpret,
};