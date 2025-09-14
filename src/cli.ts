#!/usr/bin/env node

import * as fs from 'fs';
import { Lexer, Parser, Interpreter } from './index';

function main(): void {
  const args = process.argv.slice(2);
  
  if (args.length === 0 || args[0] === '--help' || args[0] === '-h') {
    console.log('Usage: node cli.js <file.bf>');
    process.exit(0);
  }

  const sourceFile = args[0]!;

  try {
    const sourceCode = fs.readFileSync(sourceFile, 'utf8');
    
    const lexer = new Lexer(sourceCode);
    const parser = new Parser();
    const program = parser.parse(lexer);
    
    const interpreter = new Interpreter(program, {
      onOutputByte: (byte: number) => {
        process.stdout.write(String.fromCharCode(byte));
      }
    });

    interpreter.run();
    
  } catch (error) {
    console.error(`Error: ${error}`);
    process.exit(1);
  }
}

if (require.main === module) {
  main();
}