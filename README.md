# Language Interpreter

Welcome to our custom language interpreter! This project provides a complete, in-browser playground for writing and running a simple, beginner-friendly scripting language. It's built with Node.js, Express, and Socket.IO, and features a full lexer, parser, and AST-walking interpreter written in JavaScript.

## Features

*   **Simple Syntax**: The language is designed to be easy to learn, with a clean, Lua-like syntax where blocks are delimited by keywords like `end`.
*   **Live Playground**: Write and run code directly in your browser with an integrated editor that provides syntax highlighting and autocompletion.
*   **Canvas Graphics**: Create simple games and animations with built-in functions for drawing pixels and rectangles on a configurable canvas.
*   **Interactive Scripts**: Handle keyboard events to create interactive experiences.
*   **Flexible Game Loops**: Use `while(true)` combined with `wait(ms)` for full control over your game loop's timing.
*   **Rich Feature Set**: Includes global variables, modern control flow (`if/elseif/else`, `while`, `for`), functions, `break`, `continue`, arrays, and objects.
*   **Full Operator Support**: Standard arithmetic, comparison, logical (`and`, `or`, `not`), and update (`+=`, `++`, etc.) operators are available.
*   **String Interpolation**: Easily embed variables and expressions in strings with `${...}`.
*   **Safe Execution**: Code is run in a sandboxed Node.js worker thread to prevent the main server from crashing.

## Getting Started

To run the project locally, you'll need to have [Bun](https://bun.sh/) installed.

1.  **Clone the repository:**
    ```bash
    git clone <repository_url>
    cd <repository_directory>
    ```
2.  **Install dependencies:**
    ```bash
    bun install
    ```
3.  **Start the server:**
    ```bash
    bun start
    ```
4.  Open your browser and navigate to `http://localhost:3000` to see the welcome page. Click "Go to Playground" to start coding!

## File Structure

*   `index.js`: The main entry point. Sets up the Express server, Socket.IO, and manages interpreter worker threads.
*   `interpreter.js`: The core of the language. Contains the `Lexer`, `Parser`, AST `Node` classes, and the `Interpreter`.
*   `interpreter-worker.js`: The script that runs the interpreter in a separate thread, allowing for safe, non-blocking code execution.
*   `public/`: Directory for all front-end files.
    *   `index.html`: The main landing page.
    *   `playground.html`: The interactive coding playground UI.
    *   `styles.css`: Stylesheet for the application.
*   `run-local.js`: A script for running language code directly in your terminal, with file system and shell access enabled (for testing purposes).
*   `example.my_lang`: An example script for use with `run-local.js`.

---

## Language Documentation

### Core Concepts

This is a simple, scripting language designed for creative coding, small games, and educational purposes. It uses a straightforward syntax, dynamic typing, and provides built-in functions for graphics and interaction.

### Comments
Comments start with `#` and extend to the end of the line. They are ignored by the interpreter.
```mylang
# This is a comment. It is not executed.
x = 10; # You can also put comments at the end of a line.
```

### Variables and Data Types
Variables are dynamically typed, meaning you don't need to declare their type. You declare a variable simply by assigning a value to it. All variables are global.

*   **Number:** `123`, `-45.6`
*   **String:** `"Hello"`, `'World'`
*   **Boolean:** `true`, `false`
*   **null:** Represents the intentional absence of any object value.
*   **Array:** An ordered list of values. `[1, "two", true]`
*   **Object:** A collection of key-value pairs. `{ name: "John", age: 30 }`

#### String Operations
Strings can be joined using the `+` operator. You can also embed expressions directly inside strings using `${...}` syntax.
```mylang
name = "Alice";
greeting = "Hello, " + name + "!"; # "Hello, Alice!"

# String Interpolation
score = 100;
message = "Your score is: ${score} points."; # "Your score is: 100 points."
```

### Operators

#### Arithmetic
`+` (addition), `-` (subtraction), `*` (multiplication), `/` (division), `%` (modulo).

#### Comparison
`==` (equal), `!=` (not equal), `<` (less than), `>` (greater than), `<=` (less than or equal), `>=` (greater than or equal).

#### Logical
`and`, `or`, `not`.
```mylang
if (is_ready and has_permission); # ...
if (is_ready or has_permission); # ...
if (not has_permission); # ...
```

#### Update (Shorthand Assignment)
`+=`, `-=`, `*=`, `/=`, `++` (increment), `--` (decrement).
```mylang
x = 10;
x += 5; # x is now 15
y = 5;
y++; # y is now 6
```

### Control Flow
All block statements (`if`, `while`, `for`, `function`) are terminated with `end;`.

#### `if/elseif/else`
Execute code based on conditions. Parentheses `()` around the condition are required.
```mylang
if (x > 5);
    # ...
elseif (x == 5);
    # ...
else;
    # ...
end;
```

#### `while` Loops
Loops as long as a condition is true. Parentheses `()` are required. For games, you must include a `wait(ms)` call to prevent the program from freezing.
```mylang
# Game Loop Example
while (true); # Loop forever
    # update game state...
    # draw graphics...
    wait(16); # Crucial! Pauses for ~16ms for ~60 FPS
end;
```

#### `for` Loops
A simple loop that iterates a fixed number of times.
```mylang
# Prints 0, 1, 2, 3, 4
for (i, 5);
    console.log("i =", i);
end;
```

#### `break` and `continue`
`break;` immediately exits the current loop. `continue;` skips to the next iteration.

### Functions

#### User-defined Functions
Define reusable blocks of code with `function`.
```mylang
function greet(name);
    console.log("Hello,", name);
end;
greet("Alice");
```

#### `return`
Use `return` to send a value back from a function.
```mylang
function add(a, b);
    return a + b;
end;
result = add(5, 3); # result is now 8
```

### Data Structures

#### Arrays
Ordered lists of values, indexed from 0. Access native methods like `.push()` and properties like `.length`.
```mylang
items = ["apple", "banana"];
console.log(items[0]); # "apple"
items.push("cherry");
console.log(items.length); # 3
```

#### Objects
Unordered collections of key-value pairs. Access properties using dot notation (`.`).
```mylang
player = { x: 10, y: 20 };
console.log(player.x); # 10
player.score = 0;
```

### Built-in Globals & Functions

#### `console`
*   `console.log(...)`: Prints standard output.
*   `console.warn(...)`: Prints a warning message.
*   `console.error(...)`: Prints an error message.
*   `console.clear()`: Clears the console.

#### `math`
*   `math.random()`, `math.round(n)`, `math.floor(n)`, `math.ceil(n)`, `math.abs(n)`, `math.sqrt(n)`, `math.min(...)`, `math.max(...)`, `math.pi`.

#### Graphics Functions
*   `pixel(x, y, r, g, b)`: Draws a pixel.
*   `rect(x, y, width, height, r, g, b)`: Draws a filled rectangle.
*   `clear()`: Clears the canvas to the background color from Settings.

#### Timing and Control
*   `wait(milliseconds)`: **Essential for game loops.** Pauses execution.
*   `time()`: Returns milliseconds since program start.
*   `exit()`: Immediately stops the program.

### Event Handling
Define these functions to respond to user input.
*   `onKeyDown(event)`: Called when a key is pressed. `event.key` holds the key value.
*   `onKeyUp(event)`: Called when a key is released.

```mylang
function onKeyDown(event);
    if (event.key == " ");
        # Player jumps
    end;
end;
```
