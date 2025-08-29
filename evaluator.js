/**
 * evaluator.js
 *
 * Evaluates an AST node in the given environment.
 * Supports variables, functions, classes, control flow, drawing, etc.
 */

/**
 * Evaluates an AST node in the given environment.
 * @param {Object} node - AST node to evaluate
 * @param {Array} env - Environment stack (array of scope objects)
 * @param {Object} state - Runtime state
 * @param {Array} callStack - Current call stack for debugging
 * @returns {Promise<any>} - The evaluation result
 */
async function evalNode(node, env, state, callStack = []) {
  // Helper for variable lookup (with scope chain)
  function getVar(name) {
    for (let i = env.length - 1; i >= 0; i--) {
      if (name in env[i]) return env[i][name];
    }
    return undefined;
  }
  
  function setVar(name, value) {
    for (let i = env.length - 1; i >= 0; i--) {
      if (name in env[i]) {
        env[i][name] = value;
        return;
      }
    }
    env[env.length - 1][name] = value;
  }

  // Helper for string interpolation
  async function interpolate(str) {
    // Lazy load tokenizer and parser to avoid circular dependencies
    const { tokenize } = require('./tokenizer.js');
    const { parse } = require('./parser.js');
    
    // Handle async replacement with Promise.all
    const matches = [...str.matchAll(/\$\{([^}]+)\}/g)];
    if (matches.length === 0) return str;
    
    const results = await Promise.all(matches.map(async match => {
      try {
        const expr = match[1];
        const fakeNode = parse(tokenize(expr))[0];
        const result = await evalNode(fakeNode.expr ?? fakeNode, env, state, callStack);
        return { match: match[0], result: String(result) };
      } catch {
        return { match: match[0], result: match[0] };
      }
    }));
    
    let result = str;
    for (const { match, result: replacement } of results) {
      result = result.replace(match, replacement);
    }
    return result;
  }

  // Statement types
  switch (node.type) {
    case "Assignment": {
      const rightVal = await evalNode(node.expr, env, state, callStack);
      const leftNode = node.id;
      
      // Calculate final value for shorthand ops
      let finalValue = rightVal;
      if (node.op !== "=") {
        let leftVal;
        if (leftNode.type === "Variable") {
          leftVal = getVar(leftNode.name);
        } else if (leftNode.type === "Get") {
          const obj = await evalNode(leftNode.object, env, state, callStack);
          leftVal = obj[leftNode.property];
        } else if (leftNode.type === "Index") {
          const obj = await evalNode(leftNode.object, env, state, callStack);
          const index = await evalNode(leftNode.index, env, state, callStack);
          leftVal = obj[index];
        }

        if (node.op === "+=") finalValue = leftVal + rightVal;
        else if (node.op === "-=") finalValue = leftVal - rightVal;
        else if (node.op === "*=") finalValue = leftVal * rightVal;
        else if (node.op === "/=") finalValue = leftVal / rightVal;
        else throw new Error(`Unknown assignment operator: ${node.op}`);
      }

      // Perform the assignment
      if (leftNode.type === "Variable") {
        setVar(leftNode.name, finalValue);
      } else if (leftNode.type === "Get") {
        const obj = await evalNode(leftNode.object, env, state, callStack);
        obj[leftNode.property] = finalValue;
      } else if (leftNode.type === "Index") {
        const obj = await evalNode(leftNode.object, env, state, callStack);
        const index = await evalNode(leftNode.index, env, state, callStack);
        obj[index] = finalValue;
      } else {
        throw new Error("Invalid left-hand side in assignment");
      }
      return finalValue;
    }
    case "ExprStmt": {
      return await evalNode(node.expr, env, state, callStack);
    }
    case "Return": {
      const value = await evalNode(node.expr, env, state, callStack);
      throw { type: "Return", value };
    }
    case "Break":
      throw { type: "Break" };
    case "Continue":
      throw { type: "Continue" };
    case "Function": {
      // Named or anonymous
      const func = async (...args) => {
        const localEnv = [{}];
        for (let j = 0; j < node.params.length; j++) {
          localEnv[0][node.params[j]] = args[j];
        }
        try {
          for (const stmt of node.body) {
            await evalNode(
              stmt,
              [...env, ...localEnv],
              state,
              callStack.concat([node.name || "<anon>"]),
            );
          }
        } catch (e) {
          if (e.type === "Return") return e.value;
          throw e;
        }
      };
      if (node.name) {
        setVar(node.name, func);
        // Register as event handler if matches known event handler names
        const handlerNames = [
          "onKeyDown",
          "onKeyUp",
          "onMouseMove",
          "onMouseDown",
          "onMouseUp",
          "onMouseClick",
        ];
        if (handlerNames.includes(node.name) && state.eventHandlers) {
          state.eventHandlers[node.name] = func;
        }
      }
      return func;
    }
    case "Class": {
      // Build class object
      const classObj = {
        name: node.name,
        fields: {},
        methods: {},
      };
      for (const member of node.body) {
        if (member.type === "Field") {
          classObj.fields[member.id] = member.expr;
        } else if (member.type === "Function") {
          // Method: first param is 'this'
          const method = async function (...args) {
            const localEnv = [{ this: this }];
            for (let j = 0; j < member.params.length; j++) {
              localEnv[0][member.params[j]] = args[j];
            }
            try {
              for (const stmt of member.body) {
                await evalNode(
                  stmt,
                  [...env, ...localEnv],
                  state,
                  callStack.concat([member.name || "<anon>"]),
                );
              }
            } catch (e) {
              if (e.type === "Return") return e.value;
              throw e;
            }
          };
          classObj.methods[member.name] = method;
        }
      }
      state.classes[node.name] = classObj;
      setVar(node.name, classObj);
      return classObj;
    }
    case "If": {
      if (await evalNode(node.cond, env, state, callStack)) {
        for (const stmt of node.thenBranch)
          await evalNode(stmt, env, state, callStack);
        return;
      }
      for (const elseif of node.elseIfs) {
        if (await evalNode(elseif.cond, env, state, callStack)) {
          for (const stmt of elseif.body)
            await evalNode(stmt, env, state, callStack);
          return;
        }
      }
      if (node.elseBranch) {
        for (const stmt of node.elseBranch)
          await evalNode(stmt, env, state, callStack);
      }
      return;
    }
    case "While": {
      while (await evalNode(node.cond, env, state, callStack)) {
        try {
          for (const stmt of node.body)
            await evalNode(stmt, env, state, callStack);
        } catch (e) {
          if (e.type === "Break") break;
          if (e.type === "Continue") continue;
          throw e;
        }
      }
      return;
    }
    case "For": {
      const iterable = await evalNode(node.iterable, env, state, callStack);
      if (Array.isArray(iterable)) {
        for (const val of iterable) {
          const localEnv = [{ [node.id]: val }];
          try {
            for (const stmt of node.body)
              await evalNode(stmt, [...env, ...localEnv], state, callStack);
          } catch (e) {
            if (e.type === "Break") break;
            if (e.type === "Continue") continue;
            throw e;
          }
        }
      }
      return;
    }
    case "ForRange": {
      const count = await evalNode(node.count, env, state, callStack);
      for (let idx = 0; idx < count; idx++) {
        const localEnv = [{ [node.id]: idx }];
        try {
          for (const stmt of node.body)
            await evalNode(stmt, [...env, ...localEnv], state, callStack);
        } catch (e) {
          if (e.type === "Break") break;
          if (e.type === "Continue") continue;
          throw e;
        }
      }
      return;
    }
    // Expressions
    case "Literal":
      // Apply string interpolation to string literals
      if (typeof node.value === "string") {
        return await interpolate(node.value);
      }
      return node.value;
    case "Array": {
      const elements = [];
      for (const elNode of node.elements) {
        elements.push(await evalNode(elNode, env, state, callStack));
      }
      return elements;
    }
    case "Object": {
        const obj = {};
        for(const prop of node.properties) {
            obj[prop.key] = await evalNode(prop.value, env, state, callStack);
        }
        return obj;
    }
    case "Index": {
      const obj = await evalNode(node.object, env, state, callStack);
      const index = await evalNode(node.index, env, state, callStack);
      return obj[index];
    }
    case "Variable":
      return getVar(node.name);
    case "This": {
      for (let j = env.length - 1; j >= 0; j--) {
        if ("this" in env[j]) return env[j]["this"];
      }
      throw new Error("'this' used outside of class method");
    }
    case "New": {
      const classObj = getVar(node.className) || state.classes[node.className];
      if (!classObj) throw new Error(`Class '${node.className}' not found`);
      // Instantiate: copy fields, bind methods
      const instance = {};
      for (const key in classObj.fields) {
        instance[key] = await evalNode(
          classObj.fields[key],
          env,
          state,
          callStack,
        );
      }
      for (const key in classObj.methods) {
        instance[key] = classObj.methods[key].bind(instance);
      }
      
      // Call constructor if it exists
      if (classObj.methods.constructor) {
        const args = [];
        for (const arg of node.args || []) {
          args.push(await evalNode(arg, env, state, callStack));
        }
        await classObj.methods.constructor.call(instance, ...args);
      }
      
      return instance;
    }
    case "Get": {
      const obj = await evalNode(node.object, env, state, callStack);
      if (!obj) throw new Error("Cannot access property of null/undefined");
      const prop = obj[node.property];
      if (typeof prop === 'function') {
        return prop.bind(obj);
      }
      return prop;
    }
    case "Call": {
      const callee = await evalNode(node.callee, env, state, callStack);
      const args = [];
      for (const arg of node.args) {
        args.push(await evalNode(arg, env, state, callStack));
      }
      if (typeof callee !== "function")
        throw new Error("Attempt to call non-function");
      return await callee(...args);
    }
    case "Unary": {
      const v = await evalNode(node.expr, env, state, callStack);
      switch (node.op) {
        case "-":
          return -v;
        case "+":
          return +v;
        case "!":
          return !v;
        case "not":
          return !v;
        default:
          throw new Error("Unknown unary operator: " + node.op);
      }
    }
    case "Binary": {
      const l = await evalNode(node.left, env, state, callStack);
      const r = await evalNode(node.right, env, state, callStack);
      switch (node.op) {
        case "+":
          return l + r;
        case "-":
          return l - r;
        case "*":
          return l * r;
        case "/":
          return l / r;
        case "%":
          return l % r;
        case "==":
          return l === r;
        case "!=":
          return l !== r;
        case "<":
          return l < r;
        case ">":
          return l > r;
        case "<=":
          return l <= r;
        case ">=":
          return l >= r;
        case "and":
          return l && r;
        case "or":
          return l || r;
        default:
          throw new Error("Unknown binary operator: " + node.op);
      }
    }
    default:
      throw new Error("Unknown AST node type: " + node.type);
  }
}

module.exports = { evalNode };
