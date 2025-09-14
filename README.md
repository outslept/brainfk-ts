# Brainfuck (TypeScript): lexer → parser → interpreter

Minimal BF toolchain.

# Semantics

- Cells: 8-bit, wrap modulo 256.
- Input: missing byte = 0.
- Output: run() returns collected bytes only if no output callbacks handled them.
- Tape: cannot move left of cell 0; grows by doubling when grow=true.
- Errors: left-of-tape, tape overflow (with grow=false), step limit exceeded.

# TODO

- Clear loop apply only when increment is odd (or strictly ±1).
- Use TextEncoder when available; Buffer fallback for Node.
- Detect patterns like [->+>+<<].
- Detect [-]+++ → set constant.
- Optimize [>] / [<] into Scan/SeekZero.
- Small cleanups (e.g., Add; Clear → Clear), better Move coalescing.
- Hard cap for tape growth and basic test suite (loops, bursts, step limits).