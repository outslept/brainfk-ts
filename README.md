# bf-ts

A minimal Brainfuck toolchain written in TypeScript.

Includes a lexer, parser, interpreter, and CLI.

## Features

- Brainfuck lexer and parser
- Optimized instruction representation
- Common loop optimizations
- Dynamically growing tape
- Execution limits
- Byte-oriented I/O
- CLI support for files and stdin

## Usage

Run a file:

```bash
bf-ts hello.bf
```

Read source from stdin:

```bash
echo '++++++++[>++++++++<-]>+.' | bf-ts -
```

Show help:

```bash
bf-ts --help
```

## API

```ts
import { Lexer, Parser, Interpreter } from 'bf-ts';

const lexer = new Lexer('++++++++[>++++++++<-]>+.');
const parser = new Parser();
const program = parser.parse(lexer);

const interpreter = new Interpreter(program);
const output = interpreter.run();
```

Input and runtime limits can be configured:

```ts
const interpreter = new Interpreter(program, {
  input: 'hello',
  tapeSize: 65536,
  maxTapeSize: 1_000_000,
  maxSteps: 10_000_000,
});
```

## Brainfuck

Supported instructions:

```text
>  move right
<  move left
+  increment
-  decrement
.  output
,  input
[  loop start
]  loop end
```

All other characters are ignored.
