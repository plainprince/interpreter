/**
 * parser.js
 *
 * Parses tokens into an AST.
 * The AST is a list of statements (each is an object with type and fields).
 * Now supports both semicolons and newlines as statement separators.
 */

/**
 * Parses tokens into an AST.
 * @param {Array} tokens - Array of token objects from tokenizer
 * @returns {Array} AST - Array of statement nodes
 */
function parse(tokens) {
  let i = 0;
  
  function peek(offset = 0) {
    return tokens[i + offset];
  }
  
  function next() {
    return tokens[i++];
  }
  
  function expect(type, value = null) {
    const t = peek();
    if (!t || t.type !== type || (value !== null && t.value !== value)) {
      const currentToken = t ? `${t.type} '${t.value}'` : "EOF";
      const expected = `${type} ${value ?? ""}`.trim();
      throw new SyntaxError(
        `Expected ${expected}, but found ${currentToken} (line ${
          t ? t.line + 1 : "unknown"
        })`,
      );
    }
    return next();
  }
  
  // Skip newlines and semicolons (statement separators)
  function skipSeparators() {
    while (i < tokens.length && 
           (tokens[i].type === "NEWLINE" || tokens[i].type === "SEMICOLON")) {
      i++;
    }
  }

  function parseProgram(stopKeywords = ["end"]) {
    const stmts = [];
    skipSeparators(); // Skip leading separators
    
    while (i < tokens.length) {
      if (peek() && peek().type === "KEYWORD" && stopKeywords.includes(peek().value)) break;
      
      const stmt = parseStatement();
      if (stmt) {
        stmts.push(stmt);
      }
      
      skipSeparators(); // Skip trailing separators
    }
    return stmts;
  }

  function parseStatement() {
    skipSeparators(); // Skip any leading separators
    
    const t = peek();
    if (!t) return null;
    
    // Check for assignment - try parsing the left side and see if there's an assignment operator
    function isAssignment() {
      if (!t) return false;
      if (!(t.type === "IDENTIFIER" || (t.type === "KEYWORD" && t.value === "this"))) return false;
      
      // Simple case: identifier = value
      if (peek(1)?.type === "OPERATOR" && ["=", "+=", "-=", "*=", "/="].includes(peek(1)?.value)) {
        return true;
      }
      
      // Complex case: property access or array indexing followed by assignment
      let lookahead = 1;
      while (lookahead < tokens.length) {
        const nextToken = peek(lookahead);
        if (!nextToken) break;
        
        if (nextToken.type === "OPERATOR" && nextToken.value === ".") {
          lookahead++; // skip the dot
          if (peek(lookahead)?.type === "IDENTIFIER") {
            lookahead++; // skip the identifier
            continue;
          } else {
            break;
          }
        } else if (nextToken.type === "OPERATOR" && nextToken.value === "[") {
          // Skip everything until the closing bracket
          let bracketCount = 1;
          lookahead++;
          while (lookahead < tokens.length && bracketCount > 0) {
            const token = peek(lookahead);
            if (token.type === "OPERATOR" && token.value === "[") bracketCount++;
            if (token.type === "OPERATOR" && token.value === "]") bracketCount--;
            lookahead++;
          }
          continue;
        } else if (nextToken.type === "OPERATOR" && ["=", "+=", "-=", "*=", "/="].includes(nextToken.value)) {
          return true;
        } else {
          break;
        }
      }
      return false;
    }
    
    // Assignment
    if (isAssignment()) {
      const left = parseCall();
      if (!["Variable", "Get", "Index"].includes(left.type)) {
        throw new SyntaxError(
          `Invalid left-hand side in assignment at line ${peek().line + 1}`,
        );
      }
      const op = next().value; // '=', '+=', etc.
      const expr = parseExpression();
      return { type: "Assignment", op, id: left, expr };
    }
    
    // Function definition
    if (t.type === "KEYWORD" && t.value === "function") {
      return parseFunction();
    }
    
    // Class definition
    if (t.type === "KEYWORD" && t.value === "class") {
      return parseClass();
    }
    
    // If statement
    if (t.type === "KEYWORD" && t.value === "if") {
      return parseIf();
    }
    
    // While loop
    if (t.type === "KEYWORD" && t.value === "while") {
      return parseWhile();
    }
    
    // For loop
    if (t.type === "KEYWORD" && t.value === "for") {
      return parseFor();
    }
    
    // Return
    if (t.type === "KEYWORD" && t.value === "return") {
      next();
      const expr = parseExpression();
      return { type: "Return", expr };
    }
    
    // Break/Continue
    if (
      t.type === "KEYWORD" &&
      (t.value === "break" || t.value === "continue")
    ) {
      next();
      return { type: t.value.charAt(0).toUpperCase() + t.value.slice(1) };
    }
    
    // Expression statement (function call, etc)
    return { type: "ExprStmt", expr: parseExpression() };
  }

  function parseFunction() {
    expect("KEYWORD", "function");
    let name = null;
    if (peek().type === "IDENTIFIER") name = next().value;
    expect("OPERATOR", "(");
    const params = [];
    while (peek().type !== "OPERATOR" || peek().value !== ")") {
      if (peek().type === "IDENTIFIER") params.push(next().value);
      if (peek().type === "OPERATOR" && peek().value === ",") next();
    }
    expect("OPERATOR", ")");
    const body = parseProgram();
    expect("KEYWORD", "end");
    return { type: "Function", name, params, body };
  }

  function parseClass() {
    expect("KEYWORD", "class");
    const name = expect("IDENTIFIER").value;
    const body = [];
    skipSeparators();
    
    while (peek().type !== "KEYWORD" || peek().value !== "end") {
      if (peek().type === "KEYWORD" && peek().value === "function") {
        body.push(parseFunction());
      } else if (
        peek().type === "IDENTIFIER" &&
        peek(1) &&
        peek(1).value === "="
      ) {
        // Field initializer
        const id = next().value;
        next(); // '='
        const expr = parseExpression();
        body.push({ type: "Field", id, expr });
      } else {
        throw new SyntaxError(
          `Unexpected token: ${peek().type} '${peek().value}' in class body (line ${
            peek().line + 1
          })`,
        );
      }
      skipSeparators();
    }
    expect("KEYWORD", "end");
    return { type: "Class", name, body };
  }

  function parseIf() {
    expect("KEYWORD", "if");
    const cond = parseExpression();
    const thenBranch = parseProgram(["elseif", "else", "end"]);
    let elseIfs = [];
    let elseBranch = null;
    
    while (peek().type === "KEYWORD" && peek().value === "elseif") {
      next();
      const elseifCond = parseExpression();
      const elseifBody = parseProgram(["elseif", "else", "end"]);
      elseIfs.push({ cond: elseifCond, body: elseifBody });
    }
    
    if (peek().type === "KEYWORD" && peek().value === "else") {
      next();
      elseBranch = parseProgram(["end"]);
    }
    
    expect("KEYWORD", "end");
    return { type: "If", cond, thenBranch, elseIfs, elseBranch };
  }

  function parseWhile() {
    expect("KEYWORD", "while");
    const cond = parseExpression();
    const body = parseProgram();
    expect("KEYWORD", "end");
    return { type: "While", cond, body };
  }

  function parseFor() {
    expect("KEYWORD", "for");
    expect("OPERATOR", "(");
    const id = expect("IDENTIFIER").value;
    // Support: for i, N   or   for i in expr
    if (peek() && peek().type === "OPERATOR" && peek().value === ",") {
      next(); // skip ','
      const countExpr = parseExpression();
      expect("OPERATOR", ")");
      const body = parseProgram();
      expect("KEYWORD", "end");
      return { type: "ForRange", id, count: countExpr, body };
    } else if (peek() && peek().type === "KEYWORD" && peek().value === "in") {
      next(); // skip 'in'
      const iterable = parseExpression();
      expect("OPERATOR", ")");
      const body = parseProgram();
      expect("KEYWORD", "end");
      return { type: "For", id, iterable, body };
    } else {
      throw new SyntaxError(
        `Expected ',' or 'in' after for variable (line ${peek()?.line + 1})`,
      );
    }
  }

  // Expression parsing (recursive descent, precedence climbing)
  function parseExpression() {
    return parseOr();
  }
  
  function parseOr() {
    let left = parseAnd();
    while (peek() && peek().type === "KEYWORD" && peek().value === "or") {
      next();
      left = { type: "Binary", op: "or", left, right: parseAnd() };
    }
    return left;
  }
  
  function parseAnd() {
    let left = parseEquality();
    while (peek() && peek().type === "KEYWORD" && peek().value === "and") {
      next();
      left = { type: "Binary", op: "and", left, right: parseEquality() };
    }
    return left;
  }
  
  function parseEquality() {
    let left = parseComparison();
    while (
      peek() &&
      peek().type === "OPERATOR" &&
      ["==", "!="].includes(peek().value)
    ) {
      const op = next().value;
      left = { type: "Binary", op, left, right: parseComparison() };
    }
    return left;
  }
  
  function parseComparison() {
    let left = parseTerm();
    while (
      peek() &&
      peek().type === "OPERATOR" &&
      ["<", ">", "<=", ">="].includes(peek().value)
    ) {
      const op = next().value;
      left = { type: "Binary", op, left, right: parseTerm() };
    }
    return left;
  }
  
  function parseTerm() {
    let left = parseFactor();
    while (
      peek() &&
      peek().type === "OPERATOR" &&
      ["+", "-"].includes(peek().value)
    ) {
      const op = next().value;
      left = { type: "Binary", op, left, right: parseFactor() };
    }
    return left;
  }
  
  function parseFactor() {
    let left = parseUnary();
    while (
      peek() &&
      peek().type === "OPERATOR" &&
      ["*", "/", "%"].includes(peek().value)
    ) {
      const op = next().value;
      left = { type: "Binary", op, left, right: parseUnary() };
    }
    return left;
  }
  
  function parseUnary() {
    if (
      peek() &&
      peek().type === "OPERATOR" &&
      ["-", "+", "!"].includes(peek().value)
    ) {
      const op = next().value;
      return { type: "Unary", op, expr: parseUnary() };
    }
    if (peek() && peek().type === "KEYWORD" && peek().value === "not") {
      next();
      return { type: "Unary", op: "not", expr: parseUnary() };
    }
    return parseCall();
  }
  
  function parseCall() {
    let expr = parsePrimary();
    while (
      peek() &&
      peek().type === "OPERATOR" &&
      (peek().value === "(" || peek().value === "." || peek().value === "[")
    ) {
      if (peek().value === "(") {
        // Function/method call
        next();
        const args = [];
        if (peek().type !== "OPERATOR" || peek().value !== ")") {
          while (true) {
            args.push(parseExpression());
            if (peek().type === "OPERATOR" && peek().value === ",") {
              next();
            } else {
              break;
            }
          }
        }
        expect("OPERATOR", ")");
        expr = { type: "Call", callee: expr, args };
      } else if (peek().value === ".") {
        // Property access
        next();
        const prop = expect("IDENTIFIER").value;
        expr = { type: "Get", object: expr, property: prop };
      } else if (peek().value === "[") {
        // Index access
        next();
        const index = parseExpression();
        expect("OPERATOR", "]");
        expr = { type: "Index", object: expr, index };
      }
    }
    return expr;
  }
  
  function parsePrimary() {
    const t = peek();
    if (!t) throw new SyntaxError("Unexpected end of input");

    if (t.type === "NUMBER") return { type: "Literal", value: next().value };
    if (t.type === "STRING") return { type: "Literal", value: next().value };

    if (t.type === "KEYWORD") {
      const keyword = next().value;
      if (keyword === "true") return { type: "Literal", value: true };
      if (keyword === "false") return { type: "Literal", value: false };
      if (keyword === "null") return { type: "Literal", value: null };
      if (keyword === "undefined")
        return { type: "Literal", value: undefined };
      if (keyword === "this") return { type: "This" };
      if (keyword === "new") {
        const classToken = next();
        if (classToken.type !== "IDENTIFIER") {
          throw new SyntaxError(`Expected class name after 'new' (line ${classToken.line + 1})`);
        }
        const className = classToken.value;
        const args = [];
        
        // Check for constructor arguments
        if (peek().type === "OPERATOR" && peek().value === "(") {
          next(); // consume '('
          while (peek().type !== "OPERATOR" || peek().value !== ")") {
            args.push(parseExpression());
            if (peek().type === "OPERATOR" && peek().value === ",") {
              next(); // consume ','
            }
          }
          expect("OPERATOR", ")");
        }
        
        return { type: "New", className, args };
      }
    }

    if (t.type === "IDENTIFIER") return { type: "Variable", name: next().value };

    if (t.type === "OPERATOR" && t.value === "(") {
      next(); // consume '('
      const expr = parseExpression();
      expect("OPERATOR", ")");
      return expr;
    }

    if (t.type === "OPERATOR" && t.value === "[") {
      return parseArray();
    }
    
    if (t.type === "OPERATOR" && t.value === "{") {
        return parseObject();
    }

    throw new SyntaxError(
      `Unexpected token: ${t.type} '${t.value}' (line ${t.line + 1})`,
    );
  }

  function parseArray() {
    expect("OPERATOR", "[");
    const elements = [];
    skipSeparators(); // Allow newlines after [
    
    if (peek().type === "OPERATOR" && peek().value === "]") {
      next(); // empty array
      return { type: "Array", elements };
    }
    
    while (true) {
      elements.push(parseExpression());
      skipSeparators();
      
      if (peek().type === "OPERATOR" && peek().value === ",") {
        next();
        skipSeparators(); // Allow newlines after comma
      } else {
        break;
      }
    }
    
    expect("OPERATOR", "]");
    return { type: "Array", elements };
  }
  
  function parseObject() {
      expect("OPERATOR", "{");
      const properties = [];
      skipSeparators(); // Allow newlines after {
      
      if(peek().type === "OPERATOR" && peek().value === "}") {
          next();
          return { type: "Object", properties };
      }
      
      while(true) {
          if (peek().type !== 'IDENTIFIER') break;
          const key = expect("IDENTIFIER").value;
          expect("OPERATOR", ":");
          const value = parseExpression();
          properties.push({ key, value });
          skipSeparators();
          
          if (peek().type === "OPERATOR" && peek().value === ",") {
              next();
              skipSeparators(); // Allow newlines after comma
          } else {
              break;
          }
      }
      
      expect("OPERATOR", "}");
      return { type: "Object", properties };
  }

  return parseProgram();
}

module.exports = { parse };
