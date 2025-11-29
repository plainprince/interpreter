/**
 * utils.js
 *
 * Utility functions and helpers for the interpreter.
 * Contains resource limitation utilities and other shared functionality.
 */

const fs = require("fs");
const { execSync } = require("child_process");

/**
 * Resource limitation utilities
 */
class ResourceLimiter {
  constructor(limits = {}) {
    this.limits = {
      maxCommands: limits.maxCommands || 100,
      maxMemoryMB: limits.maxMemoryMB || 50,
      maxCpuTimeMs: limits.maxCpuTimeMs || 5000,
      ...limits
    };
    this.commandCount = 0;
    this.startTime = Date.now();
    // Note: This measures the heap of the entire worker process.
    // The initial value may seem high (e.g., 0.7MB) as it includes the Node.js runtime
    // and loaded interpreter modules. The limiter correctly measures the *delta* from this baseline.
    this.startMemory = process.memoryUsage().heapUsed;
  }

  checkLimits() {
    const currentTime = Date.now();
    const currentMemory = process.memoryUsage().heapUsed;
    const cpuTime = currentTime - this.startTime;
    const memoryUsageMB = (currentMemory - this.startMemory) / (1024 * 1024);

    if (this.commandCount >= this.limits.maxCommands) {
      throw new Error(`Command limit exceeded: ${this.limits.maxCommands} commands`);
    }

    if (cpuTime >= this.limits.maxCpuTimeMs) {
      throw new Error(`CPU time limit exceeded: ${this.limits.maxCpuTimeMs}ms`);
    }

    if (memoryUsageMB >= this.limits.maxMemoryMB) {
      throw new Error(`Memory limit exceeded: ${this.limits.maxMemoryMB}MB`);
    }
  }

  incrementCommand() {
    this.commandCount++;
    this.checkLimits();
  }

  reset() {
    this.commandCount = 0;
    this.startTime = Date.now();
    this.startMemory = process.memoryUsage().heapUsed;
  }

  getUsage() {
    const currentTime = Date.now();
    const currentMemory = process.memoryUsage().heapUsed;
    const cpuTime = currentTime - this.startTime;
    const memoryUsageMB = (currentMemory - this.startMemory) / (1024 * 1024);
    const totalMemoryMB = currentMemory / (1024 * 1024);

    return {
      commands: this.commandCount,
      cpuTimeMs: cpuTime,
      memoryMB: Math.max(0, memoryUsageMB), // Only show positive delta (script-specific usage)
      totalMemoryMB: totalMemoryMB, // Total memory including runtime
      limits: this.limits
    };
  }
}

/**
 * Safe JSON.stringify that handles circular references and other edge cases
 */
function safeStringify(obj, maxDepth = 10) {
  const seen = new WeakSet();
  
  function stringify(obj, depth = 0) {
    if (depth > maxDepth) return '[Max Depth Reached]';
    
    if (obj === null) return 'null';
    if (obj === undefined) return 'undefined';
    if (typeof obj === 'string') return obj;
    if (typeof obj === 'number' || typeof obj === 'boolean') return String(obj);
    if (typeof obj === 'function') return '[Function]';
    if (typeof obj === 'symbol') return '[Symbol]';
    
    if (typeof obj === 'object') {
      if (seen.has(obj)) return '[Circular Reference]';
      seen.add(obj);
      
      try {
        if (Array.isArray(obj)) {
          const items = obj.slice(0, 100).map(item => stringify(item, depth + 1)); // Limit array size for display
          const result = '[' + items.join(', ') + (obj.length > 100 ? ', ...' : '') + ']';
          seen.delete(obj);
          return result;
        } else {
          const keys = Object.keys(obj).slice(0, 50); // Limit object keys for display
          const items = keys.map(key => {
            try {
              return `${key}: ${stringify(obj[key], depth + 1)}`;
            } catch (e) {
              return `${key}: [Error: ${e.message}]`;
            }
          });
          const result = '{' + items.join(', ') + (Object.keys(obj).length > 50 ? ', ...' : '') + '}';
          seen.delete(obj);
          return result;
        }
      } catch (e) {
        seen.delete(obj);
        return `[Error: ${e.message}]`;
      }
    }
    
    return String(obj);
  }
  
  return stringify(obj);
}

/**
 * Creates the initial runtime state with resource limits.
 *
 * @param {object} callbacks - { onChunk, onConsoleClear, onCanvasUpdate, wait, customFunctions }
 * @param {object} settings - { enableFs, enableShell, limits }
 */
function getInitialState(callbacks, settings = {}) {
  const resourceLimiter = new ResourceLimiter(settings.limits);

  // Timing and performance tracking
  let programStartTime = Date.now();
  let lastFrameTime = programStartTime;
  let frameCount = 0;
  let fps = 60;

  const variables = {
    console: {
      log: (...args) => {
        resourceLimiter.incrementCommand();
        const message = args
          .map((arg) => (typeof arg === "string" ? arg : safeStringify(arg)))
          .join(" ");
        callbacks.onChunk && callbacks.onChunk(message + "\n");
      },
      warn: (...args) => {
        resourceLimiter.incrementCommand();
        const message = args
          .map((arg) => (typeof arg === "string" ? arg : safeStringify(arg)))
          .join(" ");
        callbacks.onChunk &&
          callbacks.onChunk("\x1b[33m" + message + "\x1b[0m\n");
      },
      error: (...args) => {
        resourceLimiter.incrementCommand();
        const message = args
          .map((arg) => (typeof arg === "string" ? arg : safeStringify(arg)))
          .join(" ");
        callbacks.onChunk &&
          callbacks.onChunk("\x1b[31m" + message + "\x1b[0m\n");
      },
      clear: () => {
        resourceLimiter.incrementCommand();
        callbacks.onConsoleClear && callbacks.onConsoleClear();
      },
    },
    math: {
      random: () => {
        resourceLimiter.incrementCommand();
        return Math.random();
      },
      round: (n) => {
        resourceLimiter.incrementCommand();
        return Math.round(n);
      },
      floor: (n) => {
        resourceLimiter.incrementCommand();
        return Math.floor(n);
      },
      ceil: (n) => {
        resourceLimiter.incrementCommand();
        return Math.ceil(n);
      },
      abs: (n) => {
        resourceLimiter.incrementCommand();
        return Math.abs(n);
      },
      sqrt: (n) => {
        resourceLimiter.incrementCommand();
        return Math.sqrt(n);
      },
      min: (...args) => {
        resourceLimiter.incrementCommand();
        return Math.min(...args);
      },
      max: (...args) => {
        resourceLimiter.incrementCommand();
        return Math.max(...args);
      },
      cos: (n) => {
        resourceLimiter.incrementCommand();
        return Math.cos(n);
      },
      sin: (n) => {
        resourceLimiter.incrementCommand();
        return Math.sin(n);
      },
      pi: Math.PI,
    },
    // Enhanced timing functions for games and animations
    wait: async (ms) => {
      resourceLimiter.incrementCommand();
      if (typeof ms !== 'number' || ms < 0) {
        throw new Error('wait() requires a positive number of milliseconds');
      }
      if (callbacks.wait) {
        return await callbacks.wait(ms);
      }
      return new Promise(resolve => setTimeout(resolve, ms));
    },
    time: () => {
      resourceLimiter.incrementCommand();
      return Date.now() - programStartTime;
    },
    deltaTime: () => {
      resourceLimiter.incrementCommand();
      const currentTime = Date.now();
      const delta = currentTime - lastFrameTime;
      lastFrameTime = currentTime;
      frameCount++;
      
      // Update FPS calculation every 60 frames
      if (frameCount % 60 === 0) {
        fps = 1000 / delta;
      }
      
      return delta;
    },
    fps: () => {
      resourceLimiter.incrementCommand();
      return Math.round(fps * 100) / 100;
    },
    uptime: () => {
      resourceLimiter.incrementCommand();
      return Date.now() - programStartTime;
    },
    resetTimer: () => {
      resourceLimiter.incrementCommand();
      programStartTime = Date.now();
      lastFrameTime = programStartTime;
      frameCount = 0;
      fps = 60;
    },
    exit: () => {
      state.shouldExit = true;
      throw new Error("exit");
    },
    pixel: (x, y, r, g, b) => {
      resourceLimiter.incrementCommand();
      callbacks.onCanvasUpdate &&
        callbacks.onCanvasUpdate({ type: "pixel", x, y, r, g, b });
    },
    rect: (x, y, width, height, r, g, b, options = {}) => {
      resourceLimiter.incrementCommand();
      callbacks.onCanvasUpdate &&
        callbacks.onCanvasUpdate({
          type: "rect",
          x,
          y,
          width,
          height,
          r,
          g,
          b,
          rotation: options.rotation || 0,
        });
    },
    circle: (x, y, radius, r, g, b, scale_x = 1, scale_y = 1) => {
      resourceLimiter.incrementCommand();
      callbacks.onCanvasUpdate &&
        callbacks.onCanvasUpdate({ type: "circle", x, y, radius, r, g, b, scale_x, scale_y });
    },
    sprite: (x, y, spriteName, options = {}) => {
      resourceLimiter.incrementCommand();
      callbacks.onCanvasUpdate &&
        callbacks.onCanvasUpdate({
          type: "sprite",
          x,
          y,
          spriteName,
          rotation: options.rotation || 0,
          scale: options.scale || 1,
        });
    },
    line: (x1, y1, x2, y2, options = {}) => {
        resourceLimiter.incrementCommand();
        callbacks.onCanvasUpdate &&
            callbacks.onCanvasUpdate({
                type: "line",
                x1, y1, x2, y2,
                r: options.r || 255,
                g: options.g || 255,
                b: options.b || 255,
                thickness: options.thickness || 1,
                dashed: options.dashed || false,
            });
    },
    clear: (r, g, b) => {
      resourceLimiter.incrementCommand();
      callbacks.onCanvasUpdate && callbacks.onCanvasUpdate({
        type: 'clear',
        r: r !== undefined ? r : (settings.bgR || 0),
        g: g !== undefined ? g : (settings.bgG || 0),
        b: b !== undefined ? b : (settings.bgB || 0)
      });
    },
    config: {
      editor: "DefaultEditor",
      autosave: false,
    },
  };

  const state = {
    variables,
    functions: {},
    classes: {},
    config: variables.config,
    returnValue: undefined,
    eventHandlers: {
      onKeyDown: null,
      onKeyUp: null,
      onMouseMove: null,
      onMouseDown: null,
      onMouseUp: null,
      onMouseClick: null,
    },
    customFunctionNames: [],
    resourceLimiter, // Add the resource limiter to state
    shouldExit: false,
  };

  state.resourceLimiter.reset(); // Reset timers and counters for new run
  
  // Add custom functions if provided
  if (callbacks.customFunctions) {
    Object.assign(variables, callbacks.customFunctions);
    state.customFunctionNames = Object.keys(callbacks.customFunctions);
  }

  // Add filesystem and shell if enabled (with resource limits)
  if (settings.enableFs) {
    variables.fs = {
      readFileSync: (path) => {
        resourceLimiter.incrementCommand();
        return fs.readFileSync(path, "utf8");
      },
      writeFileSync: (path, data) => {
        resourceLimiter.incrementCommand();
        return fs.writeFileSync(path, data);
      },
      readdirSync: (path) => {
        resourceLimiter.incrementCommand();
        return fs.readdirSync(path);
      },
      existsSync: (path) => {
        resourceLimiter.incrementCommand();
        return fs.existsSync(path);
      },
    };
  }
  
  if (settings.enableShell) {
    variables.shell = {
      execSync: (command) => {
        resourceLimiter.incrementCommand();
        return execSync(command, { encoding: "utf8" }).trim();
      },
    };
  }

  return state;
}

/**
 * String interpolation helper
 * @param {string} str - String with ${expr} patterns to interpolate
 * @param {Function} evalExpr - Function to evaluate expressions
 * @returns {string} - Interpolated string
 */
function interpolateString(str, evalExpr) {
  return str.replace(/\$\{([^}]+)\}/g, (_, expr) => {
    try {
      return evalExpr(expr);
    } catch {
      return "${" + expr + "}";
    }
  });
}

module.exports = {
  ResourceLimiter,
  getInitialState,
  interpolateString,
};
