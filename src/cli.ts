#!/usr/bin/env node
import { styleText } from 'node:util';
import { Lexer, Parser, Interpreter } from './index';
import { readFileSync, statSync } from 'node:fs';

const MAX_SOURCE_SIZE = 10 * 1024 * 1024; // 10MB limit

function showHelp(): void {
  const helpText = `${styleText('bold', 'bf-ts')} - A minimal Brainfuck toolchain

${styleText('bold', 'USAGE')}
  bf-ts <file.bf>
  bf-ts - Read from stdin

${styleText('bold', 'EXAMPLES')}
  ${styleText('dim', '$')} bf-ts hello.bf - Execute a Brainfuck file
  ${styleText('dim', '$')} echo "++." | bf-ts - Execute from stdin

${styleText('bold', 'OPTIONS')}
  -h, --help - Show this help message
`;
  console.log(helpText);
}

function main(): void {
  const args = process.argv.slice(2);

  if (args.length === 0 || args.includes('-h') || args.includes('--help')) {
    showHelp();
    process.exit(0);
  }

  const sourceFile = args[0]!;

  try {
    let sourceCode: string;

    if (sourceFile === '-') {
      if (process.stdin.isTTY) {
        showHelp();
        process.exit(0);
      }
      sourceCode = readFileSync(0, 'utf8');
    } else {
      const stat = statSync(sourceFile);
      if (stat.size > MAX_SOURCE_SIZE) {
        throw new Error(`Source file exceeds ${MAX_SOURCE_SIZE} bytes`);
      }
      sourceCode = readFileSync(sourceFile, 'utf8');
    }

    const lexer = new Lexer(sourceCode);
    const parser = new Parser();
    const program = parser.parse(lexer);

    const interpreter = new Interpreter(program, {
      onOutputByte: (byte: number) => {
        process.stdout.write(Buffer.from([byte]));
      },
      onOutputBurst: (byte: number, count: number) => {
        process.stdout.write(Buffer.alloc(count, byte));
      },
    });

    interpreter.run();
  } catch (error) {
    let message: string;
    if (error instanceof Error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
        message = `File not found: ${sourceFile}`;
      } else {
        message = error.message;
      }
    } else {
      message = String(error);
    }

    console.error(styleText('red', 'Error:'), message);
    process.exit(1);
  }
}

if (require.main === module) {
  main();
}
