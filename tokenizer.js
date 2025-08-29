/**
 * tokenizer.js
 *
 * Tokenizes the source code into a flat array of tokens.
 * Handles comments, strings (with escapes), numbers, identifiers, keywords, operators, punctuation.
 * Now supports both semicolons and newlines as statement separators.
 */

/**
 * Tokenizes the source code into a flat array of tokens.
 * @param {string} code - The source code to tokenize
 * @returns {Array} Array of token objects
 */
function tokenize(code) {
  const tokens = [];
  const lines = code.split("\n");
  const keywords = new Set([
    "if",
    "else",
    "elseif",
    "end",
    "while",
    "for",
    "function",
    "return",
    "break",
    "continue",
    "true",
    "false",
    "null",
    "undefined",
    "and",
    "or",
    "not",
    "class",
    "new",
    "this",
    "in",
  ]);
  
  let lineNum = 0;
  for (const line of lines) {
    // Skip empty lines or lines with only whitespace
    if (!line.trim()) {
      lineNum++;
      // Add newline token for non-empty lines that could serve as statement separators
      if (lineNum > 0 && tokens.length > 0) {
        tokens.push({ type: "NEWLINE", value: "\n", line: lineNum - 1 });
      }
      continue;
    }
    
    let i = 0;
    let hasTokensOnLine = false;
    
    while (i < line.length) {
      // Whitespace
      if (/\s/.test(line[i])) {
        i++;
        continue;
      }
      
      // Comment
      if (line[i] === "#") break;
      
      // String literal - handles both single and double quotes
      if (line[i] === '"' || line[i] === "'") {
        const quote = line[i];
        let str = "";
        i++;
        while (i < line.length && line[i] !== quote) {
          if (line[i] === "\\" && i + 1 < line.length) {
            i++;
            const esc = line[i];
            if (esc === "n") str += "\n";
            else if (esc === "t") str += "\t";
            else str += esc;
          } else {
            str += line[i];
          }
          i++;
        }
        if (i < line.length) i++; // skip closing quote
        tokens.push({ type: "STRING", value: str, line: lineNum });
        hasTokensOnLine = true;
        continue;
      }
      
      // Number
      if (/\d/.test(line[i])) {
        let num = "";
        while (i < line.length && /[\d.]/.test(line[i])) {
          num += line[i++];
        }
        tokens.push({ type: "NUMBER", value: parseFloat(num), line: lineNum });
        hasTokensOnLine = true;
        continue;
      }
      
      // Identifier/Keyword
      if (/[a-zA-Z_]/.test(line[i])) {
        let id = "";
        while (i < line.length && /\w/.test(line[i])) {
          id += line[i++];
        }
        tokens.push({
          type: keywords.has(id) ? "KEYWORD" : "IDENTIFIER",
          value: id,
          line: lineNum,
        });
        hasTokensOnLine = true;
        continue;
      }
      
      // Operators and punctuation
      const twoCharOps = [
        "==",
        "!=",
        "<=",
        ">=",
        "+=",
        "-=",
        "*=",
        "/=",
        "&&",
        "||",
        "::",
      ];
      let op = line[i];
      if (i + 1 < line.length && twoCharOps.includes(line[i] + line[i + 1])) {
        op = line[i] + line[i + 1];
        i += 2;
      } else {
        i++;
      }
      
      // Special handling for semicolon - treat as statement separator
      if (op === ";") {
        tokens.push({ type: "SEMICOLON", value: op, line: lineNum });
      } else {
        tokens.push({ type: "OPERATOR", value: op, line: lineNum });
      }
      hasTokensOnLine = true;
    }
    
    // Add newline token at end of line if there were tokens on this line
    if (hasTokensOnLine) {
      tokens.push({ type: "NEWLINE", value: "\n", line: lineNum });
    }
    
    lineNum++;
  }
  
  return tokens;
}

module.exports = { tokenize };
