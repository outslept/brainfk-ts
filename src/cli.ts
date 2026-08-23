import * as fs from 'fs';
import { Lexer, Parser, Interpreter } from './index';

const MAX_SOURCE_SIZE = 10 * 1024 * 1024; // 10MB limit

function main(): void {
  const args = process.argv.slice(2);

  if (args.length === 0 || args[0] === '--help' || args[0] === '-h') {
    console.log('Usage: node cli.js <file.bf>');
    process.exit(0);
  }

  const sourceFile = args[0]!;

  try {
    const stat = fs.statSync(sourceFile);
    if (stat.size > MAX_SOURCE_SIZE) {
      console.error(`Error: Source file exceeds ${MAX_SOURCE_SIZE} bytes`);
      process.exit(1);
    }

    const sourceCode = fs.readFileSync(sourceFile, 'utf8');
    const lexer = new Lexer(sourceCode);
    const parser = new Parser();
    const program = parser.parse(lexer);

    const interpreter = new Interpreter(program, {
      onOutputByte: (byte: number) => {
        process.stdout.write(Buffer.from([byte]));
      },
      onOutputBurst: (byte: number, count: number) => {
        process.stdout.write(Buffer.alloc(count, byte));
      }
    });

    interpreter.run();
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error(`Error: ${message}`);
    process.exit(1);
  }
}

if (require.main === module) {
  main();
}
