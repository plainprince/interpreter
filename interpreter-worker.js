const { Worker, isMainThread, parentPort, workerData } = require('worker_threads');
const { interpret, getInitialState } = require('./interpreter');

if (!isMainThread) {
    // Worker thread code
    const { options } = workerData;
    let state = null;
    let isExecuting = false;
    let executionTimeout = null;
    let cpuUsageInterval = null;
    let startTime = null;
    let maxExecutionTime = 60000; // 60 seconds default
    let cpuLimitExceeded = false;

    // CPU usage monitoring
    function monitorCPUUsage() {
        const hrTime = process.hrtime();
        const currentTime = hrTime[0] * 1000 + hrTime[1] / 1000000;
        
        if (startTime) {
            const elapsed = currentTime - startTime;
            const cpuUsage = process.cpuUsage();
            const totalCpu = (cpuUsage.user + cpuUsage.system) / 1000; // Convert to ms
            const cpuPercent = (totalCpu / elapsed) * 100;
            
            // Limit CPU usage to prevent abuse
            if (cpuPercent > 80 && elapsed > 5000) { // 80% CPU for more than 5 seconds
                cpuLimitExceeded = true;
                parentPort.postMessage({
                    type: 'error',
                    payload: 'CPU usage limit exceeded. Execution terminated.'
                });
                cleanup();
            }
        }
    }

    function cleanup() {
        isExecuting = false;
        if (executionTimeout) {
            clearTimeout(executionTimeout);
            executionTimeout = null;
        }
        if (cpuUsageInterval) {
            clearInterval(cpuUsageInterval);
            cpuUsageInterval = null;
        }
        startTime = null;
        cpuLimitExceeded = false;
    }

    // Create callbacks for the interpreter
    const callbacks = {
        onChunk: (chunk) => {
            if (isExecuting && !cpuLimitExceeded) {
                parentPort.postMessage({ type: 'chunk', payload: chunk });
            }
        },
        onCanvasUpdate: (command) => {
            if (isExecuting && !cpuLimitExceeded) {
                parentPort.postMessage({ type: 'canvasUpdate', payload: command });
            }
        },
        onConsoleClear: () => {
            if (isExecuting && !cpuLimitExceeded) {
                parentPort.postMessage({ type: 'console_clear' });
            }
        },
        wait: async (ms) => {
            if (!isExecuting || cpuLimitExceeded) return;
            
            // Limit wait time to prevent infinite delays
            const limitedMs = Math.min(ms, 10000); // Max 10 seconds
            return new Promise(resolve => {
                setTimeout(() => {
                    if (isExecuting) resolve();
                }, limitedMs);
            });
        },
        customFunctions: options.customFunctions || {}
    };

    // Handle messages from main thread
    parentPort.on('message', async (message) => {
        const { type, code, settings, name, payload } = message;

        switch (type) {
            case 'init':
                try {
                    isExecuting = true;
                    startTime = Date.now();
                    
                    // Set execution timeout
                    executionTimeout = setTimeout(() => {
                        if (isExecuting) {
                            parentPort.postMessage({
                                type: 'error',
                                payload: 'Execution timeout reached'
                            });
                            cleanup();
                        }
                    }, maxExecutionTime);

                    // Start CPU monitoring
                    cpuUsageInterval = setInterval(monitorCPUUsage, 1000);

                    // Create initial state with security restrictions
                    const secureSettings = {
                        enableFs: options.enableFs || false,
                        enableShell: options.enableShell || false,
                        ...settings
                    };

                    state = getInitialState(callbacks, secureSettings);

                    // Execute the code
                    await interpret(code, state);

                    if (isExecuting) {
                        parentPort.postMessage({ type: 'result' });
                    }
                } catch (error) {
                    if (isExecuting) {
                        parentPort.postMessage({
                            type: 'error',
                            payload: error.message || 'An error occurred during execution'
                        });
                    }
                } finally {
                    cleanup();
                }
                break;

            case 'event':
                // Handle events like keyboard input
                if (state && state.eventHandlers && state.eventHandlers[name]) {
                    try {
                        await state.eventHandlers[name](payload);
                    } catch (error) {
                        // Ignore event handler errors to prevent crashes
                        console.warn('Event handler error:', error.message);
                    }
                } else if (state && state.variables) {
                    // Check for global event handler functions
                    const handlerName = name;
                    if (state.variables[handlerName] && typeof state.variables[handlerName] === 'function') {
                        try {
                            await state.variables[handlerName](payload);
                        } catch (error) {
                            console.warn('Global event handler error:', error.message);
                        }
                    }
                }
                break;

            case 'stop':
                cleanup();
                break;
        }
    });

    // Handle worker termination
    process.on('SIGTERM', cleanup);
    process.on('SIGINT', cleanup);

} else {
    // Main thread code - export the worker creation function
    module.exports = {
        createInterpreterWorker: (options = {}) => {
            return new Worker(__filename, {
                workerData: { options }
            });
        }
    };
}
