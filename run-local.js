const fs = require("fs");
const path = require("path");
const { interpret, getInitialState } = require("./interpreter");

async function main() {
  // Accept filename as a command-line argument, default to 'example.my_lang'
  const inputFile = process.argv[2] || "example.my_lang";
  const filePath = path.join(__dirname, inputFile);
  if (!fs.existsSync(filePath)) {
    console.error(`File not found: ${filePath}`);
    process.exit(1);
  }
  const code = fs.readFileSync(filePath, "utf8");

  // 1. Define custom native functions
  const customFunctions = {
    // This function modifies the persistent config in the interpreter's state.
    set_config_value: (state, key, value) => {
      if (typeof key !== "string") {
        throw new Error("Config key must be a string");
      }
      state.config[key] = value;
      return state.config;
    },

    // A simple function to demonstrate returning a value
    get_platform: () => {
      return process.platform;
    },
  };

  // 2. Fix logging and setup all callbacks
  const onChunk = (chunk) => {
    // Strip ANSI color codes for clean stdout, as the worker does for HTML
    const cleanChunk = chunk.replace(/\x1b\[[0-9;]*m/g, "");
    process.stdout.write(chunk);
  };
  const onCanvasUpdate = (command) => {
    console.log("[Canvas Command]", command);
  };
  const onConsoleClear = () => {
    console.clear();
  };
  const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

  const callbacks = {
    onChunk,
    onCanvasUpdate,
    onConsoleClear,
    wait,
    customFunctions, // Pass our native functions to the state initializer
  };

  // 3. Enable all features
  const settings = {
    enableFs: true,
    enableShell: true,
  };

  const state = getInitialState(callbacks, settings);

  console.log("--- Running Local Script ---");
  try {
    await interpret(code, state);
    console.log("\n--- Script Finished ---");
  } catch (error) {
    console.error("\n--- Interpreter Error ---");
    console.error(error);
    process.exit(1);
  }
}

main();
