// playground.js
// Interactive Playground for the Custom Language Interpreter
// ---------------------------------------------------------
// Handles: code editor, canvas drawing, output, running code, loading examples, streaming support
// Features: CodeMirror 6 editor, proper authentication, centered modals
// ---------------------------------------------------------

// CodeMirror 5 setup - much simpler and more compatible
let CodeMirrorReady = false;

// Check if CodeMirror is available
function checkCodeMirror() {
  CodeMirrorReady = typeof CodeMirror !== 'undefined';
  if (CodeMirrorReady) {
    console.log("CodeMirror 5 loaded successfully");
  } else {
    console.warn("CodeMirror not available, falling back to textarea");
  }
  return CodeMirrorReady;
}

// ========== CONFIGURATION ==========
const EXAMPLES = [
  {
    name: "Snake",
    file: "examples/snake.my_lang",
    description: "Classic snake game.",
  },
  {
    name: "Flappy Bird",
    file: "examples/flappy_bird.my_lang",
    description: "Flappy Bird clone.",
  },
  {
    name: "Artillery",
    file: "examples/artillery.my_lang",
    description: "Artillery game.",
  },
  {
    name: "3D Projection",
    file: "examples/projection.my_lang",
    description: "A rotating 3D cube.",
  },
  {
    name: "Raytracer",
    file: "examples/raytracer.my_lang",
    description: "Interactive path tracer with progressive rendering.",
  },
];

// ========== DOM HELPERS ==========
function $(sel) {
  return document.querySelector(sel);
}
function $all(sel) {
  return Array.from(document.querySelectorAll(sel));
}

// ========== CANVAS DRAWING ==========
class CanvasManager {
  constructor(canvasId = "#modal-canvas") {
    this.canvas = $(canvasId);
    if (!this.canvas) {
      console.error("Canvas element not found:", canvasId);
      return;
    }
    this.ctx = this.canvas.getContext("2d");

    // Disable image smoothing for a crisp, pixelated look
    this.ctx.imageSmoothingEnabled = false;

    this.width = this.canvas.width;
    this.height = this.canvas.height;
    this.clear();
    this.setupCanvasEvents();
  }

  createCanvas() {
    const canvas = document.createElement("canvas");
    canvas.id = "canvas";
    canvas.width = 256;
    canvas.height = 256;
    canvas.style.border = "1px solid #ccc";
    canvas.style.backgroundColor = "#000";
    return canvas;
  }

  clear(r = 0, g = 0, b = 0) {
    if (this.ctx) {
      this.ctx.fillStyle = `rgb(${r},${g},${b})`;
      this.ctx.fillRect(0, 0, this.width, this.height);
    }
  }

  pixel(x, y, r, g, b) {
    if (this.ctx) {
      this.ctx.fillStyle = `rgb(${r},${g},${b})`;
      this.ctx.fillRect(x, y, 1, 1);
    }
  }

  rect(x, y, w, h, r, g, b, rotation = 0) {
    if (this.ctx) {
      this.ctx.save();
      this.ctx.fillStyle = `rgb(${r},${g},${b})`;
      this.ctx.translate(x + w / 2, y + h / 2);
      this.ctx.rotate(rotation * Math.PI / 180);
      this.ctx.fillRect(-w / 2, -h / 2, w, h);
      this.ctx.restore();
    }
  }

  circle(x, y, radius, r, g, b, scale_x = 1, scale_y = 1) {
    if (this.ctx) {
      this.ctx.save();
      this.ctx.fillStyle = `rgb(${r},${g},${b})`;
      this.ctx.beginPath();
      this.ctx.translate(x, y);
      this.ctx.scale(scale_x, scale_y);
      this.ctx.arc(0, 0, radius, 0, 2 * Math.PI);
      this.ctx.fill();
      this.ctx.restore();
    }
  }

  // Sprite: not implemented, placeholder
  sprite(x, y, spriteName, rotation = 0, scale = 1) {
    if (this.ctx) {
      const img = window.playgroundApp.spriteManager.getSprite(spriteName);
      if (img) {
        this.ctx.save();
        this.ctx.translate(x + (img.width * scale) / 2, y + (img.height * scale) / 2);
        this.ctx.rotate(rotation * Math.PI / 180);
        this.ctx.scale(scale, scale);
        this.ctx.drawImage(img, -img.width / 2, -img.height / 2);
        this.ctx.restore();
      } else {
        // Fallback drawing if sprite not found
        this.ctx.fillStyle = "#ff00ff"; // Bright pink for missing texture
        this.ctx.fillRect(x, y, 16, 16);
      }
    }
  }

  line(x1, y1, x2, y2, r, g, b, thickness, dashed) {
      if (this.ctx) {
          this.ctx.beginPath();
          this.ctx.strokeStyle = `rgb(${r},${g},${b})`;
          this.ctx.lineWidth = thickness;
          if (dashed) {
              this.ctx.setLineDash([5, 5]);
          } else {
              this.ctx.setLineDash([]);
          }
          this.ctx.moveTo(x1, y1);
          this.ctx.lineTo(x2, y2);
          this.ctx.stroke();
      }
  }

  setupCanvasEvents() {
    if (!this.canvas) return;
    
    // Keyboard events (canvas must be focused)
    this.canvas.setAttribute("tabindex", "0");
    this.canvas.style.outline = "none";
    
    this.canvas.addEventListener("keydown", (e) => {
      e.preventDefault();
      if (window.playgroundApp && window.playgroundApp.running) {
        window.playgroundApp.sendEvent("keyDown", { key: e.key, code: e.code });
      }
    });
    
    this.canvas.addEventListener("keyup", (e) => {
      e.preventDefault();
      if (window.playgroundApp && window.playgroundApp.running) {
        window.playgroundApp.sendEvent("keyUp", { key: e.key, code: e.code });
      }
    });

    // Mouse events
    this.canvas.addEventListener("mousemove", (e) => {
      if (window.playgroundApp && window.playgroundApp.running) {
        window.playgroundApp.sendEvent("mouseMove", this._getMouseEvent(e));
      }
    });
    
    this.canvas.addEventListener("mousedown", (e) => {
      if (window.playgroundApp && window.playgroundApp.running) {
        window.playgroundApp.sendEvent("mouseDown", this._getMouseEvent(e));
      }
    });
    
    this.canvas.addEventListener("mouseup", (e) => {
      if (window.playgroundApp && window.playgroundApp.running) {
        window.playgroundApp.sendEvent("mouseUp", this._getMouseEvent(e));
      }
    });
    
    this.canvas.addEventListener("click", (e) => {
      // Focus canvas for keyboard events
      this.canvas.focus();
      if (window.playgroundApp && window.playgroundApp.running) {
        window.playgroundApp.sendEvent("mouseClick", this._getMouseEvent(e));
      }
    });
  }

  _getMouseEvent(e) {
    if (!this.canvas) return { x: 0, y: 0, button: 0 };
    
    const rect = this.canvas.getBoundingClientRect();
    return {
      x: Math.floor((e.clientX - rect.left) * (this.canvas.width / rect.width)),
      y: Math.floor((e.clientY - rect.top) * (this.canvas.height / rect.height)),
      button: e.button,
      buttons: e.buttons,
      ctrl: e.ctrlKey,
      shift: e.shiftKey,
      alt: e.altKey,
      meta: e.metaKey,
    };
  }
}

// ========== OUTPUT HANDLING ==========
class OutputManager {
  constructor(outputEl) {
    this.outputEl = outputEl || this.createOutput();
  }

  createOutput() {
    const output = document.createElement("div");
    output.id = "output";
    output.style.backgroundColor = "#1e1e1e";
    output.style.color = "#fff";
    output.style.fontFamily = "monospace";
    output.style.padding = "10px";
    output.style.height = "200px";
    output.style.overflowY = "auto";
    output.style.whiteSpace = "pre-wrap";
    output.style.border = "1px solid #ccc";
    return output;
  }

  append(text) {
    this.outputEl.innerHTML += text;
    this.outputEl.scrollTop = this.outputEl.scrollHeight;
  }

  clear() {
    this.outputEl.innerHTML = "";
  }
}

// ========== EXAMPLES LOADING ==========
async function fetchExample(file) {
  try {
    const res = await fetch(file);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return await res.text();
  } catch (e) {
    throw new Error("Failed to fetch example: " + file);
  }
}

// ========== SOCKET COMMUNICATION ==========
class SocketManager {
  constructor() {
    this.socket = null;
    this.connected = false;
    this.callbacks = {};
  }

  connect() {
    if (typeof io === 'undefined') {
      console.error('Socket.IO not available. Make sure the server is running.');
      return false;
    }

    try {
      this.socket = io();
      
      this.socket.on('connect', () => {
        this.connected = true;
        console.log('Connected to server');
      });

      this.socket.on('disconnect', () => {
        this.connected = false;
        console.log('Disconnected from server');
      });

    // Set up message handlers
    this.socket.on('output', (data) => {
      if (this.callbacks.onOutput) this.callbacks.onOutput(data.chunk);
    });

    this.socket.on('canvas', (data) => {
      if (this.callbacks.onCanvas) this.callbacks.onCanvas(data.command);
    });

    this.socket.on('clear', () => {
      if (this.callbacks.onClear) this.callbacks.onClear();
    });

    this.socket.on('usage', (data) => {
      if (this.callbacks.onUsage) this.callbacks.onUsage(data.usage);
    });

    this.socket.on('done', (data) => {
      if (this.callbacks.onDone) this.callbacks.onDone(data.result);
    });

      this.socket.on('error', (data) => {
        if (this.callbacks.onError) this.callbacks.onError(data.error);
      });

      return true;
    } catch (error) {
      console.error('Failed to connect to server:', error);
      return false;
    }
  }

  on(event, callback) {
    this.callbacks[event] = callback;
  }

  emit(event, data) {
    if (this.socket && this.connected) {
      this.socket.emit(event, data);
    }
  }

  disconnect() {
    if (this.socket) {
      this.socket.disconnect();
      this.socket = null;
    }
    this.connected = false;
  }
}

// ========== SPRITE MANAGEMENT ==========
class SpriteManager {
  constructor() {
    this.sprites = {};
    this.spriteMap = {
      'bean': { url: '/textures/bean.png' },
    };
    this.loadAllSprites();
  }

  loadAllSprites() {
    for (const name in this.spriteMap) {
      const img = new Image();
      img.src = this.spriteMap[name].url;
      img.onload = () => {
        console.log(`Sprite '${name}' loaded.`);
        this.sprites[name] = img;
      };
      img.onerror = () => {
        console.error(`Failed to load sprite: ${name}`);
      };
    }
  }

  getSprite(name) {
    return this.sprites[name] || null;
  }
}


// ========== MAIN APP ==========
class PlaygroundApp {
  constructor() {
    this.setupDOM();
    this.setupSocket();
    this.setupButtons();
    this.setupExamples();
    this.setupAuth();
    this.loadSettings();
    
    this.running = false;
    this.worker = null;
    this.canvasManager = null;
    this.outputManager = null;
    this.spriteManager = new SpriteManager();
  }

  async init() {
    await this.setupEditor();
  }

  setupDOM() {
    // Get existing DOM elements
    this.editor = $("#editor");
    // Ensure we get the modal's output and usage elements
    this.outputEl = $("#output-modal #output");
    this.usageEl = $("#output-modal #usage");
    
    // Setup modals
    this.setupModals();
  }

  createEditor() {
    const editor = document.createElement("textarea");
    editor.id = "editor";
    editor.style.width = "100%";
    editor.style.height = "300px";
    editor.style.fontFamily = "monospace";
    editor.style.fontSize = "14px";
    editor.style.backgroundColor = "#1e1e1e";
    editor.style.color = "#fff";
    editor.style.border = "1px solid #ccc";
    editor.style.padding = "10px";
    return editor;
  }

  createOutput() {
    const output = document.createElement("div");
    output.id = "output";
    output.style.backgroundColor = "#1e1e1e";
    output.style.color = "#fff";
    output.style.fontFamily = "monospace";
    output.style.padding = "10px";
    output.style.height = "200px";
    output.style.overflowY = "auto";
    output.style.whiteSpace = "pre-wrap";
    output.style.border = "1px solid #ccc";
    return output;
  }

  createUsageDisplay() {
    const usage = document.createElement("div");
    usage.id = "usage";
    usage.style.fontFamily = "monospace";
    usage.style.fontSize = "12px";
    usage.style.color = "#666";
    usage.style.padding = "5px";
    usage.innerHTML = "CPU: 0ms | RAM: 0MB | Commands: 0";
    return usage;
  }

  createButton(text, onclick) {
    const btn = document.createElement("button");
    btn.textContent = text;
    btn.onclick = onclick;
    btn.style.margin = "5px";
    btn.style.padding = "8px 16px";
    return btn;
  }

  setupSocket() {
    this.socketManager = new SocketManager();
    
    if (this.socketManager.connect()) {
      this.socketManager.on('onOutput', (chunk) => {
        if (this.outputManager) this.outputManager.append(chunk);
      });
      this.socketManager.on('onCanvas', (command) => this.handleCanvasCommand(command));
      this.socketManager.on('onClear', () => {
        if (this.outputManager) this.outputManager.clear();
      });
      this.socketManager.on('onUsage', (usage) => this.updateUsage(usage));
      this.socketManager.on('onDone', (result) => this.onExecutionComplete(result));
      this.socketManager.on('onError', (error) => this.onExecutionError(error));
    }
  }

  async setupEditor() {
    if (CodeMirrorReady) {
      await this.setupCodeMirror5();
    } else {
      // Fallback to textarea
      const textarea = $('#editor textarea');
      if (textarea) {
        const defaultCode = await this.getDefaultCode();
        textarea.value = defaultCode;
      }
    }
  }

  async setupCodeMirror5() {
    const editorElement = $("#editor");
    if (!editorElement) return;

    const textarea = editorElement.querySelector('textarea');
    if (!textarea) {
      console.error("Could not find textarea inside #editor element.");
      return;
    }

    // Define custom keywords for our language
    const customKeywords = [
      "console", "log", "warn", "error", "clear",
      "wait", "deltaTime", "fps", "uptime", "resetTimer", "time",
      "pixel", "rect", "circle", "sprite", "clear",
      "math", "random", "floor", "ceil", "round", "abs", "sqrt", "pi",
      "function", "end", "if", "else", "elseif", "while", "for", 
      "return", "break", "continue", "true", "false", "null", 
      "and", "or", "not", "class", "new", "this",
      "onKeyDown", "onKeyUp", "onMouseClick", "onMouseMove", 
      "onMouseDown", "onMouseUp"
    ];

    // Custom hint function for our language
    const customHints = (cm, option) => {
      const cursor = cm.getCursor();
      const line = cm.getLine(cursor.line);
      let start = cursor.ch;
      let end = cursor.ch;
      
      // Find the word being typed
      while (end < line.length && /\w/.test(line.charAt(end))) ++end;
      while (start && /\w/.test(line.charAt(start - 1))) --start;
      
      const word = line.slice(start, end).toLowerCase();
      const suggestions = customKeywords.filter(kw => 
        kw.toLowerCase().startsWith(word)
      ).map(kw => ({
        text: kw,
        displayText: kw,
        className: "CodeMirror-hint-custom"
      }));

      return {
        list: suggestions,
        from: CodeMirror.Pos(cursor.line, start),
        to: CodeMirror.Pos(cursor.line, end)
      };
    };

    // Register the custom hint function
    CodeMirror.registerHelper("hint", "custom", customHints);

    // This is the correct way to instantiate CodeMirror 5
    // It replaces the textarea with the editor
    this.editorView = CodeMirror.fromTextArea(textarea, {
      mode: "javascript", // Close enough for syntax highlighting
      theme: "dracula",
      lineNumbers: true,
      autoCloseBrackets: true,
      matchBrackets: true,
      indentUnit: 2,
      tabSize: 2,
      lineWrapping: true,
      extraKeys: {
        "Ctrl-Space": "autocomplete",
        "Tab": "indentMore",
        "Shift-Tab": "indentLess"
      },
      hintOptions: {
        hint: customHints,
        completeSingle: false
      }
    });

    // Auto-trigger hints as user types
    this.editorView.on("inputRead", (cm, change) => {
      if (!cm.state.completionActive && 
          change.text[0] && 
          /\w/.test(change.text[0])) {
        cm.showHint({hint: customHints, completeSingle: false});
      }
    });

    // Save code to localStorage on change
    this.editorView.on("change", () => {
        localStorage.setItem("interpreter_code", this.editorView.getValue());
    });

    // Load code from localStorage or default
    const savedCode = localStorage.getItem("interpreter_code");
    if (savedCode) {
        this.editorView.setValue(savedCode);
    } else {
        const defaultCode = await this.getDefaultCode();
        this.editorView.setValue(defaultCode);
    }

    // Create getter/setter for compatibility
    Object.defineProperty(this, 'editorValue', {
      get: () => this.editorView ? this.editorView.getValue() : (this.editor ? this.editor.value : ''),
      set: (value) => {
        if (this.editorView) {
          this.editorView.setValue(value);
        } else if (this.editor) {
          this.editor.value = value;
        }
      }
    });

    // The original textarea is now hidden by CodeMirror
  }

  setupCanvas() {
    // Initialize canvas manager only when modal is shown
    if (!this.canvasManager) {
      const canvas = $("#modal-canvas");
      if (canvas) {
        this.canvasManager = new CanvasManager("#modal-canvas");
      } else {
        console.error("Modal canvas not found");
        return;
      }
    }
    if (!this.outputManager) {
      this.outputManager = new OutputManager(this.outputEl);
    }
  }

  setupButtons() {
    // Main run button opens the output modal and starts execution
    const mainRunBtn = $("#run");
    if (mainRunBtn) {
      mainRunBtn.addEventListener("click", () => this.runCode());
    }
  }

  showOutputModal() {
    const modal = $("#output-modal");
    if (modal) {
      modal.style.display = "block";
      modal.classList.add("show");
      
      // Setup canvas after modal is rendered
      // No longer needed here, will be called by startExecution
    }
  }

  hideOutputModal() {
    const modal = $("#output-modal");
    if (modal) {
      modal.classList.remove("show");
      modal.style.display = "none";
      
      // Stop execution when modal is closed
      this.stopExecution();
    }
  }

  setupExamples() {
    const examplesContainer = $("#examples-container");
    if (examplesContainer) {
      EXAMPLES.forEach((ex) => {
        const btn = document.createElement("button");
        btn.className = "example-btn";
        btn.textContent = ex.name;
        btn.title = ex.description;
        btn.addEventListener("click", async () => {
          try {
            const code = await fetchExample(ex.file);
            this.editorValue = code;
            const modal = $("#docs-modal");
            if (modal) {
                modal.classList.remove("show");
                modal.style.display = "none";
            }
          } catch (e) {
            this.outputManager.append(`[Error loading example: ${e.message}]\n`);
          }
        });
        examplesContainer.appendChild(btn);
      });
    }
  }

  setupAuth() {
    this.isLoggedIn = false;
    this.userId = null;
    
    // Check initial auth status
    this.checkAuthStatus();
    
    // Handle auth button
    const authBtn = $("#auth-btn");
    if (authBtn) {
      authBtn.addEventListener("click", () => {
        if (this.isLoggedIn) {
          this.logout();
        } else {
          this.showAuthModal();
        }
      });
    }

    // Handle login form
    const loginForm = $("#login-form");
    if (loginForm) {
      loginForm.addEventListener("submit", (e) => {
        e.preventDefault();
        this.handleLogin();
      });
    }

    // Handle register form  
    const registerForm = $("#register-form");
    if (registerForm) {
      registerForm.addEventListener("submit", (e) => {
        e.preventDefault();
        this.handleRegister();
      });
    }

    // Handle view switching
    const showRegister = $("#show-register");
    const showLogin = $("#show-login");
    if (showRegister) {
      showRegister.addEventListener("click", (e) => {
        e.preventDefault();
        this.showRegisterView();
      });
    }
    if (showLogin) {
      showLogin.addEventListener("click", (e) => {
        e.preventDefault();
        this.showLoginView();
      });
    }
  }

  async checkAuthStatus() {
    try {
      const response = await fetch('/api/auth/status');
      const data = await response.json();
      
      this.isLoggedIn = data.loggedIn;
      this.userId = data.userId;
      this.updateAuthButton();
    } catch (error) {
      console.error('Failed to check auth status:', error);
    }
  }

  updateAuthButton() {
    const authBtn = $("#auth-btn");
    if (authBtn) {
      authBtn.textContent = this.isLoggedIn ? "Logout" : "Login";
      authBtn.title = this.isLoggedIn ? `Logged in as User ${this.userId}` : "Login or Register";
    }
  }

  showAuthModal() {
    const modal = $("#auth-modal");
    if (modal) {
      modal.style.display = "block";
      modal.classList.add("show");
      this.showLoginView();
    }
  }

  showLoginView() {
    const loginView = $("#login-view");
    const registerView = $("#register-view");
    if (loginView && registerView) {
      loginView.style.display = "block";
      registerView.style.display = "none";
    }
    this.clearAuthError();
  }

  showRegisterView() {
    const loginView = $("#login-view");
    const registerView = $("#register-view");
    if (loginView && registerView) {
      loginView.style.display = "none";
      registerView.style.display = "block";
    }
    this.clearAuthError();
  }

  async handleLogin() {
    const username = $("#login-username")?.value;
    const password = $("#login-password")?.value;

    if (!username || !password) {
      this.showAuthError("Please fill in all fields");
      return;
    }

    try {
      const response = await fetch('/api/login', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ username, password }),
      });

      const data = await response.json();

      if (response.ok) {
        this.isLoggedIn = true;
        this.userId = data.userId;
        this.updateAuthButton();
        this.closeAuthModal();
        this.showAuthSuccess("Login successful!");
      } else {
        this.showAuthError(data.message || "Login failed");
      }
    } catch (error) {
      this.showAuthError("Network error occurred");
      console.error('Login error:', error);
    }
  }

  async handleRegister() {
    const username = $("#register-username")?.value;
    const password = $("#register-password")?.value;

    if (!username || !password) {
      this.showAuthError("Please fill in all fields");
      return;
    }

    if (username.length < 3) {
      this.showAuthError("Username must be at least 3 characters");
      return;
    }

    if (password.length < 6) {
      this.showAuthError("Password must be at least 6 characters");
      return;
    }

    try {
      const response = await fetch('/api/register', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ username, password }),
      });

      const data = await response.json();

      if (response.ok) {
        this.isLoggedIn = true;
        this.userId = data.userId;
        this.updateAuthButton();
        this.closeAuthModal();
        this.showAuthSuccess("Registration successful!");
      } else {
        this.showAuthError(data.message || "Registration failed");
      }
    } catch (error) {
      this.showAuthError("Network error occurred");
      console.error('Registration error:', error);
    }
  }

  async logout() {
    try {
      const response = await fetch('/api/logout', { method: 'POST' });
      
      if (response.ok) {
        this.isLoggedIn = false;
        this.userId = null;
        this.updateAuthButton();
        this.showAuthSuccess("Logged out successfully!");
      }
    } catch (error) {
      console.error('Logout error:', error);
    }
  }

  closeAuthModal() {
    const modal = $("#auth-modal");
    if (modal) {
      modal.classList.remove("show");
      modal.style.display = "none";
    }
    this.clearAuthForms();
  }

  clearAuthForms() {
    const forms = ["#login-form", "#register-form"];
    forms.forEach(formId => {
      const form = $(formId);
      if (form) form.reset();
    });
    this.clearAuthError();
  }

  showAuthError(message) {
    const errorEl = $("#auth-error");
    if (errorEl) {
      errorEl.textContent = message;
      errorEl.style.display = "block";
    }
  }

  clearAuthError() {
    const errorEl = $("#auth-error");
    if (errorEl) {
      errorEl.textContent = "";
      errorEl.style.display = "none";
    }
  }

  showAuthSuccess(message) {
    // Show temporary success message
    if (this.outputManager) {
      this.outputManager.append(`[Auth] ${message}\n`);
    } else {
      console.log(message);
    }
  }

  setupModals() {
    // Handle modal close buttons
    $all(".close-button").forEach(btn => {
      btn.addEventListener("click", (e) => {
        const modal = e.target.closest(".modal");
        if (modal) {
          if (modal.id === "output-modal") {
            this.hideOutputModal();
          } else {
            modal.classList.remove("show");
            modal.style.display = "none";
          }
        }
      });
    });

    // Close modal when clicking outside
    $all(".modal").forEach(modal => {
      modal.addEventListener("click", (e) => {
        if (e.target === modal) {
          if (modal.id === "output-modal") {
            this.hideOutputModal();
          } else {
            modal.classList.remove("show");
            modal.style.display = "none";
          }
        }
      });
    });

    // Handle docs button
    const docsBtn = $("#docs");
    if (docsBtn) {
      docsBtn.addEventListener("click", () => {
        const modal = $("#docs-modal");
        if (modal) {
          modal.style.display = "block";
          modal.classList.add("show");
        }
      });
    }

    // Handle settings button
    const settingsBtn = $("#settings");
    if (settingsBtn) {
      settingsBtn.addEventListener("click", () => {
        const modal = $("#settings-modal");
        if (modal) {
          // Refresh settings values when modal is opened
          this.loadSettingsValues();
          modal.style.display = "block";
          modal.classList.add("show");
        }
      });
    }

    // Handle reset button
    const resetBtn = $("#reset-btn");
    if (resetBtn) {
        resetBtn.addEventListener("click", () => {
            if (confirm("Are you sure you want to reset? Your current code and settings will be lost.")) {
                this.resetToDefault();
            }
        });
    }

    // Sync color picker with RGB inputs
    this.setupColorSync();

    // Handle auth button
    const authBtn = $("#auth-btn");
    if (authBtn) {
      authBtn.addEventListener("click", () => {
        const modal = $("#auth-modal");
        if (modal) {
          modal.style.display = "block";
          modal.classList.add("show");
        }
      });
    }
  }

  setupColorSync() {
    const rInput = $("#bg-r");
    const gInput = $("#bg-g");
    const bInput = $("#bg-b");
    const colorPicker = $("#bg-color-picker");

    if (!rInput || !gInput || !bInput || !colorPicker) return;

    const rgbToHex = (r, g, b) => '#' + [r, g, b].map(x => {
      const hex = x.toString(16);
      return hex.length === 1 ? '0' + hex : hex;
    }).join('');

    const hexToRgb = (hex) => {
      const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
      return result ? {
        r: parseInt(result[1], 16),
        g: parseInt(result[2], 16),
        b: parseInt(result[3], 16)
      } : null;
    };

    const updatePickerFromRgb = () => {
      const r = parseInt(rInput.value) || 0;
      const g = parseInt(gInput.value) || 0;
      const b = parseInt(bInput.value) || 0;
      colorPicker.value = rgbToHex(r, g, b);
    };

    const updateRgbFromPicker = () => {
      const rgb = hexToRgb(colorPicker.value);
      if (rgb) {
        rInput.value = rgb.r;
        gInput.value = rgb.g;
        bInput.value = rgb.b;
      }
    };

    rInput.addEventListener('input', updatePickerFromRgb);
    gInput.addEventListener('input', updatePickerFromRgb);
    bInput.addEventListener('input', updatePickerFromRgb);
    colorPicker.addEventListener('input', () => {
        updateRgbFromPicker();
        this.saveSettings();
    });
  }

  async getDefaultCode() {
    try {
        const code = await fetchExample("examples/default.my_lang");
        return code;
    } catch (e) {
        console.error("Could not load default code:", e);
        return "# Could not load default code.";
    }
  }

  runCode() {
    if (this.running) return;
    
    // Show output modal first
    this.showOutputModal();
    
    this.running = true;
    
    // Wait for modal to render, then set up canvas and run code
    setTimeout(() => {
      this.startExecution();
    }, 200);
  }

  startExecution() {
    // Setup canvas now that we know modal is visible
    this.setupCanvas();

    // Clear output and canvas
    if (this.outputManager) this.outputManager.clear();
    const settings = this.getSettings();
    if (this.canvasManager) this.canvasManager.clear(settings.bgR, settings.bgG, settings.bgB);

    if (this.canvasManager && this.canvasManager.canvas) {
      // Update canvas dimensions based on settings
      this.canvasManager.canvas.width = settings.canvasWidth;
      this.canvasManager.canvas.height = settings.canvasHeight;
      this.canvasManager.width = settings.canvasWidth;
      this.canvasManager.height = settings.canvasHeight;
      // Re-apply crisp pixel scaling settings after resize
      this.canvasManager.ctx.imageSmoothingEnabled = false;

      this.canvasManager.canvas.focus();
    }

    if (this.socketManager && this.socketManager.connected) {
      // Use socket.io for server execution
      this.socketManager.emit('interpret', {
        code: this.editorValue,
        settings: this.getSettings()
      });
    } else {
      // Socket not connected - show error
      if (this.outputManager) {
        this.outputManager.append("[Error] Not connected to server. Please refresh the page.\n");
      }
      this.running = false;
    }
  }

  runWithWorker() {
    if (this.worker) this.worker.terminate();
    
    this.worker = new Worker("interpreter-worker.js");
    
    this.worker.onmessage = (e) => {
      const msg = e.data;
      switch (msg.type) {
        case 'output':
          this.outputManager.append(msg.chunk);
          break;
        case 'canvas':
          this.handleCanvasCommand(msg.command);
          break;
        case 'clear':
          this.outputManager.clear();
          break;
        case 'usage':
          this.updateUsage(msg.usage);
          break;
        case 'done':
          this.onExecutionComplete(msg.result);
          break;
        case 'error':
          this.onExecutionError(msg.error);
          break;
      }
    };

    this.worker.onerror = (e) => {
      this.outputManager.append(`[Worker error] ${e.message}\n`);
      this.onExecutionComplete('error');
    };

    this.worker.postMessage({
      type: 'run',
      code: this.editorValue,
      settings: this.getSettings(),
      limits: {
        maxCommands: Infinity, // No command limit for web UI
        maxMemoryMB: 50,
        maxCpuTimeMs: 10000
      }
    });
  }

  stopExecution() {
    if (this.worker) {
      this.worker.terminate();
      this.worker = null;
    }
    
    if (this.socketManager && this.socketManager.connected) {
      this.socketManager.emit('stopExecution');
    }
    
    this.running = false;
    if (this.outputManager) {
      this.outputManager.append("[Execution stopped]\n");
    }
  }

  clearOutput() {
    if (this.outputManager) this.outputManager.clear();
    if (this.canvasManager) this.canvasManager.clear();
  }

  handleCanvasCommand(cmd) {
    if (!cmd || !cmd.type) return;
    
    switch (cmd.type) {
      case "pixel":
        this.canvasManager.pixel(cmd.x, cmd.y, cmd.r, cmd.g, cmd.b);
        break;
      case "rect":
        this.canvasManager.rect(cmd.x, cmd.y, cmd.width || cmd.w, cmd.height || cmd.h, cmd.r, cmd.g, cmd.b, cmd.rotation);
        break;
      case "circle":
        this.canvasManager.circle(cmd.x, cmd.y, cmd.radius, cmd.r, cmd.g, cmd.b, cmd.scale_x, cmd.scale_y);
        break;
      case "sprite":
        this.canvasManager.sprite(cmd.x, cmd.y, cmd.spriteName, cmd.rotation, cmd.scale);
        break;
      case "line":
        this.canvasManager.line(cmd.x1, cmd.y1, cmd.x2, cmd.y2, cmd.r, cmd.g, cmd.b, cmd.thickness, cmd.dashed);
        break;
      case "clear":
        this.canvasManager.clear(cmd.r, cmd.g, cmd.b);
        break;
    }
  }

  updateUsage(usage) {
    if (this.usageEl) {
      // Show script-specific memory usage, with total memory in parentheses
      const memoryDisplay = usage.memoryMB > 0 
        ? `${usage.memoryMB.toFixed(1)}MB (${usage.totalMemoryMB.toFixed(1)}MB total)`
        : `${usage.totalMemoryMB.toFixed(1)}MB`;
      this.usageEl.innerHTML = `CPU: ${usage.cpuTimeMs}ms | RAM: ${memoryDisplay} | Commands: ${usage.commands}`;
    }
  }

  onExecutionComplete(result) {
    this.running = false;
    if (this.outputManager) {
      this.outputManager.append(`[Execution completed: ${result}]\n`);
    }
  }

  onExecutionError(error) {
    this.running = false;
    if (this.outputManager) {
        const cleanError = String(error).replace(/\x1b\[[0-9;]*m/g, "");
      const formattedError = `<span style="color: #ff5555;">${cleanError}</span>\n[Execution completed: error]\n`;
      this.outputManager.append(formattedError);
    }
  }

  sendEvent(eventType, eventData) {
    if (this.worker) {
      this.worker.postMessage({
        type: 'event',
        handler: eventType,
        event: eventData
      });
    }
    
    if (this.socketManager && this.socketManager.connected) {
      this.socketManager.emit(eventType, eventData);
    }
  }

  getSettings() {
    return {
      canvasWidth: parseInt($("#canvas-width")?.value || "128"),
      canvasHeight: parseInt($("#canvas-height")?.value || "64"),
      bgR: parseInt($("#bg-r")?.value || "0"),
      bgG: parseInt($("#bg-g")?.value || "0"),
      bgB: parseInt($("#bg-b")?.value || "0"),
    };
  }
  
  saveSettings() {
    const settings = this.getSettings();
    localStorage.setItem("interpreter_settings", JSON.stringify(settings));
  }
  
  loadSettings() {
      this.loadSettingsValues();
      this.setupSettingsEventListeners();
  }
  
  loadSettingsValues() {
      const savedSettings = localStorage.getItem("interpreter_settings");
      if (savedSettings) {
          const settings = JSON.parse(savedSettings);
          const canvasWidth = $("#canvas-width");
          const canvasHeight = $("#canvas-height");
          const bgR = $("#bg-r");
          const bgG = $("#bg-g");
          const bgB = $("#bg-b");
          const colorPicker = $("#bg-color-picker");
          
          if (canvasWidth) canvasWidth.value = settings.canvasWidth || 128;
          if (canvasHeight) canvasHeight.value = settings.canvasHeight || 64;
          if (bgR) bgR.value = settings.bgR || 0;
          if (bgG) bgG.value = settings.bgG || 0;
          if (bgB) bgB.value = settings.bgB || 0;
          
          // Update color picker to match RGB values
          if (colorPicker && bgR && bgG && bgB) {
              const r = parseInt(bgR.value) || 0;
              const g = parseInt(bgG.value) || 0;
              const b = parseInt(bgB.value) || 0;
              const rgbToHex = (r, g, b) => '#' + [r, g, b].map(x => {
                  const hex = x.toString(16);
                  return hex.length === 1 ? '0' + hex : hex;
              }).join('');
              colorPicker.value = rgbToHex(r, g, b);
          }
      }
  }
  
  setupSettingsEventListeners() {
      // Add event listeners to save on change
      const settingIds = ["#canvas-width", "#canvas-height", "#bg-r", "#bg-g", "#bg-b"];
      settingIds.forEach(id => {
          const el = $(id);
          if (el && !el.hasAttribute('data-listener-added')) {
              el.addEventListener("input", () => this.saveSettings());
              el.setAttribute('data-listener-added', 'true');
          }
      });
  }
  
  async resetToDefault() {
      // Clear localStorage
      localStorage.removeItem("interpreter_code");
      localStorage.removeItem("interpreter_settings");
      
      // Load default code
      const defaultCode = await this.getDefaultCode();
      this.editorValue = defaultCode;
      
      // Reset settings inputs to their default values and save
      $("#canvas-width").value = 128;
      $("#canvas-height").value = 64;
      $("#bg-r").value = 0;
      $("#bg-g").value = 0;
      $("#bg-b").value = 0;
      this.saveSettings();
      
      // Close the modal
      const modal = $("#settings-modal");
      if (modal) {
          modal.classList.remove("show");
          modal.style.display = "none";
      }
      
      alert("Playground has been reset to default.");
  }
}

// ========== INIT ==========
window.addEventListener("DOMContentLoaded", async () => {
  console.log("Loading playground...");
  
  // Check if CodeMirror is available
  checkCodeMirror();
  
  window.playgroundApp = new PlaygroundApp();
  await window.playgroundApp.init();
  
  console.log("Playground loaded successfully!");
});
