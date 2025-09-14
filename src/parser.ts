import { Lexer } from './lexer';
import { Op, type Program, type Token } from './types';

type IRLoop =
  | { op: 'JmpF'; target: number }
  | { op: 'JmpB'; target: number };

type IRFlat =
  | { op: 'Move'; n: number }
  | { op: 'Add'; n: number }
  | { op: 'Out'; n: number }
  | { op: 'In'; n: number }
  | IRLoop;

type IROpt =
  | { op: 'Move'; n: number }
  | { op: 'Add'; n: number }
  | { op: 'Out'; n: number }
  | { op: 'In'; n: number }
  | { op: 'Clear' }
  | { op: 'MoveAdd'; offset: number; factor: number }
  | IRLoop;

export class Parser {
  private flat: IRFlat[] = [];
  private forwardStack: Array<{ index: number; loc: { line: number; column: number } }> = [];

  parse(lexer: Lexer): Program {
    this.flat = [];
    this.forwardStack = [];

    while (true) {
      const t = lexer.nextToken();
      if (!t) break;
      this.emitFromToken(lexer, t);
    }

    if (this.forwardStack.length) {
      const u = this.forwardStack[this.forwardStack.length - 1]!;
      throw new Error(`Unmatched '[' at ${u.loc.line}:${u.loc.column}`);
    }

    const optimized = this.optimize(this.flat);
    return this.assemble(optimized);
  }

  private emitFromToken(lexer: Lexer, token: Token): void {
    const countMore = (ch: Token['ch']): number => {
      let c = 0;
      while (true) {
        const p = lexer.peek();
        if (p && p.ch === ch) { lexer.nextToken(); c += 1; } else break;
      }
      return c;
    };

    switch (token.ch) {
      case '>': {
        const n = 1 + countMore('>');
        this.flat.push({ op: 'Move', n });
        break;
      }
      case '<': {
        const n = 1 + countMore('<');
        this.flat.push({ op: 'Move', n: -n });
        break;
      }
      case '+': {
        const n = 1 + countMore('+');
        if (n % 256 !== 0) this.flat.push({ op: 'Add', n });
        break;
      }
      case '-': {
        const n = 1 + countMore('-');
        if (n % 256 !== 0) this.flat.push({ op: 'Add', n: -n });
        break;
      }
      case '.': {
        const n = 1 + countMore('.');
        this.flat.push({ op: 'Out', n });
        break;
      }
      case ',': {
        const n = 1 + countMore(',');
        this.flat.push({ op: 'In', n });
        break;
      }
      case '[': {
        const idx = this.flat.length;
        this.forwardStack.push({ index: idx, loc: token.loc });
        this.flat.push({ op: 'JmpF', target: 0 });
        break;
      }
      case ']': {
        const top = this.forwardStack.pop();
        if (!top) throw new Error(`Unmatched ']' at ${token.loc.line}:${token.loc.column}`);
        this.flat[top.index] = { op: 'JmpF', target: this.flat.length };
        this.flat.push({ op: 'JmpB', target: top.index + 1 });
        break;
      }
    }
  }

  private optimize(input: IRFlat[]): IROpt[] {
    const out: IROpt[] = [];
    const loopStack: number[] = [];

    const pushMerged = (inst: IROpt): void => {
      const prev = out[out.length - 1];

      if (inst.op === 'Move' && prev && prev.op === 'Move') {
        const net = prev.n + inst.n;
        out.pop();
        if (net !== 0) out.push({ op: 'Move', n: net });
        return;
      }

      if (inst.op === 'Add' && prev && prev.op === 'Add') {
        out.pop();
        const net = prev.n + inst.n;
        const mod = ((net % 256) + 256) % 256;
        if (mod !== 0) out.push({ op: 'Add', n: mod <= 127 ? mod : mod - 256 });
        return;
      }

      if (inst.op === 'Out' && prev && prev.op === 'Out') { prev.n += inst.n; return; }
      if (inst.op === 'In'  && prev && prev.op === 'In')  { prev.n += inst.n;  return; }

      out.push(inst);
    };

    const tryClear = (i: number, j: number): boolean => {
      if (j - i - 1 !== 1) return false;
      const body = input[i + 1]!;
      if (body.op === 'Add') { pushMerged({ op: 'Clear' }); return true; }
      return false;
    };

    const tryMoveAdd = (i: number, j: number): boolean => {
      if (j - i - 1 !== 4) return false;
      const a = input[i + 1]!;
      const b = input[i + 2]!;
      const c = input[i + 3]!;
      const d = input[i + 4]!;
      if (!(a.op === 'Add' && a.n === -1)) return false;
      const isMove = (x: IRFlat): x is Extract<IRFlat, { op: 'Move' }> => x.op === 'Move';
      const isAdd = (x: IRFlat): x is Extract<IRFlat, { op: 'Add' }> => x.op === 'Add';
      if (isMove(b) && isAdd(c) && isMove(d) && b.n === -d.n) {
        out.push({ op: 'MoveAdd', offset: b.n, factor: c.n });
        return true;
      }
      return false;
    };

    for (let i = 0; i < input.length; i++) {
      const ins = input[i]!;
      if (ins.op === 'JmpF') {
        const j = ins.target;
        const closer = input[j];
        if (!closer || closer.op !== 'JmpB') throw new Error('Invalid jump structure');

        if (tryClear(i, j))   { i = j; continue; }
        if (tryMoveAdd(i, j)) { i = j; continue; }

        loopStack.push(out.length);
        out.push({ op: 'JmpF', target: 0 });
        continue;
      }

      if (ins.op === 'JmpB') {
        const start = loopStack.pop();
        if (start === undefined) throw new Error('Unbalanced loops during optimize');
        out[start] = { op: 'JmpF', target: out.length };
        out.push({ op: 'JmpB', target: start + 1 });
        continue;
      }

      pushMerged(ins as Extract<IROpt, { op: 'Move' | 'Add' | 'Out' | 'In' }>);
    }

    if (loopStack.length) throw new Error('Unbalanced loops after optimize');
    return out;
  }

  private assemble(insts: IROpt[]): Program {
    const n = insts.length;
    const op = new Int32Array(n);
    const a = new Int32Array(n);
    const b = new Int32Array(n);

    for (let i = 0; i < n; i++) {
      const ins = insts[i]!;
      switch (ins.op) {
        case 'Move':      op[i] = Op.Move;      a[i] = ins.n | 0; break;
        case 'Add':       op[i] = Op.Add;       a[i] = ins.n | 0; break;
        case 'Out':       op[i] = Op.Out;       a[i] = (ins.n | 0) >>> 0; break;
        case 'In':        op[i] = Op.In;        a[i] = (ins.n | 0) >>> 0; break;
        case 'JmpF':      op[i] = Op.JmpF;      a[i] = ins.target | 0; break;
        case 'JmpB':      op[i] = Op.JmpB;      a[i] = ins.target | 0; break;
        case 'Clear':     op[i] = Op.Clear;     break;
        case 'MoveAdd':   op[i] = Op.MoveAdd;   a[i] = ins.offset | 0; b[i] = ins.factor | 0; break;
      }
    }

    return { op, a, b, length: n };
  }
}