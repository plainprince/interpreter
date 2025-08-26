// Simple interpreter for the custom language

function tokenize(code) {
    const tokens = [];
    const lines = code.split('\n');
    
    for (let lineNum = 0; lineNum < lines.length; lineNum++) {
        let line = lines[lineNum];
        let i = 0;
        
        while (i < line.length) {
            // Skip whitespace
            if (/\s/.test(line[i])) {
                i++;
                continue;
            }
            
            // Skip comments
            if (line[i] === '#') {
                break;
            }
            
            // String literals
            if (line[i] === '"' || line[i] === "'") {
                const quote = line[i];
                let str = '';
                i++; // Skip opening quote
                while (i < line.length && line[i] !== quote) {
                    if (line[i] === '\\' && i + 1 < line.length) {
                        i++; // Skip escape char
                        const escaped = line[i];
                        if (escaped === 'n') str += '\n';
                        else if (escaped === 't') str += '\t';
                        else str += escaped;
                    } else {
                        str += line[i];
                    }
                    i++;
                }
                if (i < line.length) i++; // Skip closing quote
                tokens.push({ type: 'STRING', value: str, line: lineNum });
                continue;
            }
            
            // Numbers
            if (/\d/.test(line[i])) {
                let num = '';
                while (i < line.length && /[\d.]/.test(line[i])) {
                    num += line[i];
                    i++;
                }
                tokens.push({ type: 'NUMBER', value: parseFloat(num), line: lineNum });
                continue;
            }
            
            // Identifiers and keywords
            if (/[a-zA-Z_]/.test(line[i])) {
                let id = '';
                while (i < line.length && /\w/.test(line[i])) {
                    id += line[i];
                    i++;
                }
                const keywords = ['if', 'else', 'elseif', 'end', 'while', 'for', 'function', 'return', 'break', 'continue', 'true', 'false', 'null', 'undefined', 'and', 'or', 'not'];
                const type = keywords.includes(id) ? 'KEYWORD' : 'IDENTIFIER';
                tokens.push({ type, value: id, line: lineNum });
                continue;
            }
            
            // Operators and punctuation
            if ('=!<>+-*/%()[]{},.;:'.includes(line[i])) {
                let op = line[i];
                i++;
                // Handle compound operators
                if (i < line.length && '=!<>+-*/%'.includes(op) && line[i] === '=') {
                    op += line[i];
                    i++;
                }
                tokens.push({ type: 'OPERATOR', value: op, line: lineNum });
                continue;
            }
            
            // Skip unknown characters
            i++;
        }
    }
    
    return tokens;
}

function evaluateExpression(tokens, start, state, variables) {
    // Very simple expression evaluator
    if (start >= tokens.length) return { value: undefined, nextIndex: start };
    
    const token = tokens[start];
    
    if (token.type === 'STRING') {
        // Handle string interpolation
        let value = token.value.replace(/\$\{([^}]+)\}/g, (match, varName) => {
            return variables[varName.trim()] || match;
        });
        return { value, nextIndex: start + 1 };
    }
    
    if (token.type === 'NUMBER') {
        return { value: token.value, nextIndex: start + 1 };
    }
    
    if (token.type === 'KEYWORD') {
        if (token.value === 'true') return { value: true, nextIndex: start + 1 };
        if (token.value === 'false') return { value: false, nextIndex: start + 1 };
        if (token.value === 'null') return { value: null, nextIndex: start + 1 };
        if (token.value === 'undefined') return { value: undefined, nextIndex: start + 1 };
    }
    
    if (token.type === 'IDENTIFIER') {
        // Check if it's a function call
        if (start + 1 < tokens.length && tokens[start + 1].value === '(') {
            const funcName = token.value;
            let args = [];
            let i = start + 2; // Skip function name and '('
            
            // Parse arguments
            while (i < tokens.length && tokens[i].value !== ')') {
                if (tokens[i].value === ',') {
                    i++;
                    continue;
                }
                const argResult = evaluateExpression(tokens, i, state, variables);
                args.push(argResult.value);
                i = argResult.nextIndex;
            }
            
            if (i < tokens.length) i++; // Skip ')'
            
            // Call the function
            if (variables[funcName] && typeof variables[funcName] === 'function') {
                // Check if this is a custom function that expects state as first parameter
                if (state.customFunctionNames && state.customFunctionNames.includes(funcName)) {
                    const result = variables[funcName](state, ...args);
                    return { value: result, nextIndex: i };
                } else {
                    const result = variables[funcName](...args);
                    return { value: result, nextIndex: i };
                }
            }
            
            return { value: undefined, nextIndex: i };
        }
        
        // Variable access
        return { value: variables[token.value], nextIndex: start + 1 };
    }
    
    return { value: undefined, nextIndex: start + 1 };
}

function executeStatement(tokens, start, state, variables) {
    if (start >= tokens.length) return start;
    
    const token = tokens[start];
    
    // Assignment
    if (token.type === 'IDENTIFIER' && start + 1 < tokens.length && tokens[start + 1].value === '=') {
        const varName = token.value;
        const exprResult = evaluateExpression(tokens, start + 2, state, variables);
        variables[varName] = exprResult.value;
        return exprResult.nextIndex;
    }
    
    // Function call statement
    if (token.type === 'IDENTIFIER' && start + 1 < tokens.length && tokens[start + 1].value === '(') {
        const result = evaluateExpression(tokens, start, state, variables);
        return result.nextIndex;
    }
    
    return start + 1;
}

function getInitialState(callbacks, settings = {}) {
    const variables = {
        console: {
            log: (...args) => {
                const message = args.map(arg => typeof arg === 'string' ? arg : JSON.stringify(arg)).join(' ');
                callbacks.onChunk(message + '\n');
            },
            warn: (...args) => {
                const message = args.map(arg => typeof arg === 'string' ? arg : JSON.stringify(arg)).join(' ');
                callbacks.onChunk('\x1b[33m' + message + '\x1b[0m\n');
            },
            error: (...args) => {
                const message = args.map(arg => typeof arg === 'string' ? arg : JSON.stringify(arg)).join(' ');
                callbacks.onChunk('\x1b[31m' + message + '\x1b[0m\n');
            },
            clear: () => {
                callbacks.onConsoleClear && callbacks.onConsoleClear();
            }
        },
        math: {
            random: () => Math.random(),
            round: (n) => Math.round(n),
            floor: (n) => Math.floor(n),
            ceil: (n) => Math.ceil(n),
            abs: (n) => Math.abs(n),
            sqrt: (n) => Math.sqrt(n),
            min: (...args) => Math.min(...args),
            max: (...args) => Math.max(...args),
            cos: (n) => Math.cos(n),
            sin: (n) => Math.sin(n),
            pi: Math.PI
        },
        wait: callbacks.wait || (() => {}),
        time: () => Date.now(),
        exit: () => { throw new Error('exit'); },
        pixel: (x, y, r, g, b) => {
            callbacks.onCanvasUpdate && callbacks.onCanvasUpdate({ type: 'pixel', x, y, r, g, b });
        },
        rect: (x, y, width, height, r, g, b) => {
            callbacks.onCanvasUpdate && callbacks.onCanvasUpdate({ type: 'rect', x, y, width, height, r, g, b });
        },
        circle: (x, y, radius, r, g, b) => {
            callbacks.onCanvasUpdate && callbacks.onCanvasUpdate({ type: 'circle', x, y, radius, r, g, b });
        },
        sprite: (x, y, spriteName) => {
            callbacks.onCanvasUpdate && callbacks.onCanvasUpdate({ type: 'sprite', x, y, spriteName });
        },
        clear: () => {
            callbacks.onCanvasUpdate && callbacks.onCanvasUpdate({ type: 'clear' });
        },
        config: {
            editor: "DefaultEditor",
            autosave: false
        }
    };

    const state = {
        variables,
        functions: {},
        classes: {},
        config: variables.config,
        returnValue: undefined,
        eventHandlers: {},
        customFunctionNames: []
    };
    
    // Add custom functions if provided
    if (callbacks.customFunctions) {
        Object.assign(variables, callbacks.customFunctions);
        state.customFunctionNames = Object.keys(callbacks.customFunctions);
    }
    
    // Add filesystem and shell if enabled
    if (settings.enableFs) {
        const fs = require('fs');
        variables.fs = {
            readFileSync: (path) => fs.readFileSync(path, 'utf8'),
            writeFileSync: (path, data) => fs.writeFileSync(path, data),
            readdirSync: (path) => fs.readdirSync(path),
            existsSync: (path) => fs.existsSync(path)
        };
    }

    if (settings.enableShell) {
        const { execSync } = require('child_process');
        variables.shell = {
            execSync: (command) => execSync(command, { encoding: 'utf8' }).trim()
        };
    }

    return state;
}

async function interpret(code, state) {
    try {
        const tokens = tokenize(code);
        let i = 0;
        
        while (i < tokens.length) {
            i = executeStatement(tokens, i, state, state.variables);
        }
        
        return "OK";
    } catch (error) {
        if (error.message === 'exit') {
            return;
        }
        throw error;
    }
}

module.exports = {
    interpret,
    getInitialState
};
