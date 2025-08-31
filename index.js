import express from 'express';
import { createServer } from 'node:http';
import { Server } from "socket.io";
import { Worker } from 'worker_threads';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';
import session from 'express-session';
import db from './database.js';
import bcrypt from 'bcrypt';
import crypto from 'crypto';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const app = express();
const server = createServer(app);
const io = new Server(server);
const port = process.env.PORT || 3000;
const saltRounds = 10;

const sessionSecret = process.env.SESSION_SECRET || crypto.randomBytes(64).toString('hex');
const sessionMiddleware = session({
    secret: sessionSecret,
    resave: false,
    saveUninitialized: false,
    cookie: { maxAge: 1000 * 60 * 60 * 24 }
});

app.use(express.static('public'));
app.use(express.json());
app.use(sessionMiddleware);
io.use((socket, next) => {
    sessionMiddleware(socket.request, {}, next);
});

// --- API Routes ---
app.post('/api/register', async (req, res) => {
    const { username, password } = req.body;
    if (!username || !password) {
        return res.status(400).json({ message: 'Username and password are required.' });
    }

    try {
        const hashedPassword = await bcrypt.hash(password, saltRounds);
        const stmt = db.prepare('INSERT INTO users (username, password) VALUES (?, ?)');
        const info = await stmt.run(username, hashedPassword);
        req.session.userId = info.lastInsertRowid;
        
        // Explicitly save the session before sending the response
        req.session.save((err) => {
            if (err) {
                console.error("Session save error:", err);
                return res.status(500).json({ message: 'An error occurred during registration.' });
            }
            res.status(201).json({ message: 'User registered successfully.', userId: info.lastInsertRowid });
        });

    } catch (error) {
        if (error.message.includes('UNIQUE constraint failed')) {
            return res.status(409).json({ message: 'Username already exists.' });
        }
        console.error("Registration error:", error);
        res.status(500).json({ message: 'An error occurred during registration.' });
    }
});

app.post('/api/login', async (req, res) => {
    const { username, password } = req.body;
    const stmt = db.prepare('SELECT * FROM users WHERE username = ?');
    const user = await stmt.get(username);

    if (user && bcrypt.compareSync(password, user.password)) {
        req.session.userId = user.id;

        // Explicitly save the session before sending the response
        req.session.save((err) => {
            if (err) {
                console.error("Session save error:", err);
                return res.status(500).json({ message: 'An error occurred during login.' });
            }
            res.json({ message: 'Logged in successfully.', userId: user.id });
        });
    } else {
        res.status(401).json({ message: 'Invalid username or password.' });
    }
});


app.post('/api/logout', (req, res) => {
    req.session.destroy((err) => {
        if (err) {
            return res.status(500).json({ message: 'Could not log out, please try again.' });
        }
        res.clearCookie('connect.sid');
        res.json({ message: 'Logged out successfully.' });
    });
});

app.get('/api/auth/status', (req, res) => {
    if (req.session && req.session.userId) {
        res.json({ loggedIn: true, userId: req.session.userId });
    } else {
        res.json({ loggedIn: false });
    }
});


// --- Interpreter Queue Logic ---
let isGuestRunnerActive = false;
const guestQueue = [];

function processGuestQueue() {
    if (isGuestRunnerActive || guestQueue.length === 0) {
        return;
    }
    isGuestRunnerActive = true;
    const { socket, code, settings } = guestQueue.shift();
    
    // Update remaining queue members
    guestQueue.forEach((item, index) => {
        item.socket.emit('queue_update', { position: index + 1 });
    });

    runInterpreter(socket, code, settings, false, () => {
        isGuestRunnerActive = false;
        processGuestQueue();
    });
}

// --- Main Socket Logic ---
io.on('connection', (socket) => {
    const userId = socket.request.session?.userId;
    console.log(`[${new Date().toISOString()}] User connected: ${socket.id}${userId ? ` (User ID: ${userId})` : ' (Guest)'}. Session: ${JSON.stringify(socket.request.session)}`);
    
    socket.on('interpret', ({ code, settings }) => {
        const isLoggedIn = !!socket.request.session?.userId;
        console.log(`[${new Date().toISOString()}] Interpret request from ${socket.id}. Session userId: ${socket.request.session?.userId}, isLoggedIn: ${isLoggedIn}`);

        if (isLoggedIn) {
            runInterpreter(socket, code, settings, isLoggedIn);
        } else {
            const queuePosition = guestQueue.length + 1;
            socket.emit('queue_update', { position: queuePosition });
            guestQueue.push({ socket, code, settings });
            processGuestQueue();
        }
    });
});

function runInterpreter(socket, code, settings, isLoggedIn, onCompleteCallback = () => {}) {
    const userId = socket.request.session?.userId;
    const timeoutDuration = isLoggedIn ? 60000 : 10000;

    console.log(`[${new Date().toISOString()}] Starting interpreter for ${socket.id}${userId ? ` (User ID: ${userId})` : ' (Guest)'}. Timeout: ${timeoutDuration / 1000}s. Logged in: ${isLoggedIn}`);
    
    let worker;
    let timeout;
    let eventHandlers = {};
    let isRunning = false;

    // Enhanced resource limits for different user types
    const limits = {
        maxCommands: Infinity, // No command limit
        maxMemoryMB: isLoggedIn ? 200 : 50,
        maxCpuTimeMs: isLoggedIn ? 60000 : 10000,
        ...(settings.limits || {})
    };

    const cleanup = () => {
        isRunning = false;
        if (timeout) clearTimeout(timeout);
        if (worker) {
            worker.terminate();
            worker = null;
        }
        if (Object.keys(eventHandlers).length > 0) {
            socket.off('keyDown', eventHandlers.onKeyDown);
            socket.off('keyUp', eventHandlers.onKeyUp);
            socket.off('mouseMove', eventHandlers.onMouseMove);
            socket.off('mouseDown', eventHandlers.onMouseDown);
            socket.off('mouseUp', eventHandlers.onMouseUp);
            socket.off('mouseClick', eventHandlers.onMouseClick);
            eventHandlers = {};
        }
        socket.off('stopExecution', onStopExecution);
        socket.off('disconnect', onDisconnect);
        onCompleteCallback();
    };

    const onStopExecution = () => {
        console.log(`[${new Date().toISOString()}] Terminated worker for ${socket.id} by client request.`);
        socket.emit('output', { chunk: '[Execution stopped by user]\n' });
        cleanup();
    };

    const onDisconnect = () => {
        console.log(`[${new Date().toISOString()}] User disconnected: ${socket.id}`);
        // Remove from queue if they disconnect
        const index = guestQueue.findIndex(item => item.socket.id === socket.id);
        if (index > -1) {
            guestQueue.splice(index, 1);
        }
        cleanup();
    };

    socket.on('stopExecution', onStopExecution);
    socket.on('disconnect', onDisconnect);

    // Create worker with proper module support
    worker = new Worker(resolve(__dirname, 'interpreter-worker.js'));
    isRunning = true;

    // Set up timeout
    timeout = setTimeout(() => {
        console.log(`[${new Date().toISOString()}] Execution timed out for ${socket.id}${userId ? ` (User ID: ${userId})` : ' (Guest)'}.`);
        socket.emit('error', { error: `Execution timed out after ${timeoutDuration / 1000} seconds.` });
        socket.emit('done', { result: 'timeout' });
        cleanup();
    }, timeoutDuration);

    // Set up usage monitoring for live updates
    // This is now handled by the worker itself. The server just forwards the messages.

    // Enhanced event handlers for full interactivity
    const createEventHandler = (eventName) => (data) => {
        if (worker && isRunning) {
            worker.postMessage({ type: 'event', handler: eventName, event: data });
        }
    };
    
    eventHandlers = {
        onKeyDown: createEventHandler('onKeyDown'),
        onKeyUp: createEventHandler('onKeyUp'),
        onMouseMove: createEventHandler('onMouseMove'),
        onMouseDown: createEventHandler('onMouseDown'),
        onMouseUp: createEventHandler('onMouseUp'),
        onMouseClick: createEventHandler('onMouseClick'),
    };
    
    // Register all event listeners
    socket.on('keyDown', eventHandlers.onKeyDown);
    socket.on('keyUp', eventHandlers.onKeyUp);
    socket.on('mouseMove', eventHandlers.onMouseMove);
    socket.on('mouseDown', eventHandlers.onMouseDown);
    socket.on('mouseUp', eventHandlers.onMouseUp);
    socket.on('mouseClick', eventHandlers.onMouseClick);

    // Enhanced worker message handling with streaming support
    worker.on('message', (msg) => {
        if (!msg || !msg.type) return;

        switch (msg.type) {
            case 'output':
                // Stream output chunks in real-time
                socket.emit('output', { chunk: asciiToHtml(sanitizeHTML(msg.chunk)) });
                break;
                
            case 'canvas':
                // Stream canvas updates for live graphics
                socket.emit('canvas', { command: msg.command });
                break;
                
            case 'clear':
                // Clear console output
                socket.emit('clear');
                break;
                
            case 'usage':
                // Stream resource usage for monitoring
                socket.emit('usage', { usage: msg.usage });
                break;
                
            case 'done':
                socket.emit('done', { result: msg.result || 'OK' });
                cleanup();
                break;
                
            case 'error':
                socket.emit('error', { error: msg.error });
                cleanup();
                break;
                
            default:
                console.warn(`Unknown message type from worker: ${msg.type}`);
        }
    });

    worker.on('error', (error) => {
        console.error(`[${new Date().toISOString()}] Worker error for ${socket.id}:`, error);
        socket.emit('error', { error: error.message });
        cleanup();
    });

    worker.on('exit', (code) => {
        if (code !== 0) {
            console.log(`[${new Date().toISOString()}] Worker for ${socket.id} exited with code ${code}`);
        }
        if (isRunning) {
            socket.emit('done', { result: 'exit' });
            cleanup();
        }
    });

    // Start execution with enhanced settings
    const enhancedSettings = {
        ...settings,
        enableFs: false,
        enableShell: false,
        limits,
    };

    worker.postMessage({ 
        type: 'run', 
        code, 
        settings: enhancedSettings,
        limits,
        customFunctions: {}
    });
}

function sanitizeHTML(text) {
    if (typeof text !== 'string') text = String(text);
    return text.replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/\n/g, '<br>');
}

function asciiToHtml(text) {
    if (typeof text !== 'string') text = String(text);
    return text
        .replace(/\x1b\[33m/g, '<span style="color: yellow;">')
        .replace(/\x1b\[31m/g, '<span style="color: red;">')
        .replace(/\x1b\[0m/g, '</span>');
}

server.listen(port, () => {
    console.log(`Server is running on port ${port}`);
});
runInterpreter