import { Lexer } from './lexer';
import { Op, type Program, type Token } from './types';

type IRLoop = { op: 'JmpF'; target: number } | { op: 'JmpB'; target: number };

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
  | { op: 'Set'; n: number }
  | { op: 'MulAdd'; offset: number; factor: number }
  | { op: 'ScanR' }
  | { op: 'ScanL' }
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
        if (p && p.ch === ch) {
          lexer.nextToken();
          c += 1;
        } else break;
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

    for (let i = 0; i < input.length; i++) {
      const ins = input[i]!;

      if (ins.op === 'JmpF') {
        const j = ins.target;
        const closer = input[j];
        if (!closer || closer.op !== 'JmpB') throw new Error('Invalid jump structure');

        if (this.tryScan(input, out, i, j)) {
          i = j;
          continue;
        }
        if (this.tryMulLoop(input, out, i, j)) {
          i = j;
          continue;
        }

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

      this.pushMerged(out, ins as Extract<IROpt, { op: 'Move' | 'Add' | 'Out' | 'In' }>);
    }

    if (loopStack.length) throw new Error('Unbalanced loops after optimize');
    return out;
  }

  private pushMerged(out: IROpt[], inst: IROpt): void {
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

    if (inst.op === 'Out' && prev && prev.op === 'Out') {
      prev.n += inst.n;
      return;
    }
    if (inst.op === 'In' && prev && prev.op === 'In') {
      prev.n += inst.n;
      return;
    }

    if (inst.op === 'Clear' && prev && prev.op === 'Add') {
      out.pop();
      out.push({ op: 'Clear' });
      return;
    }

    if (inst.op === 'Add' && prev && prev.op === 'Clear') {
      out.pop();
      out.push({ op: 'Set', n: inst.n });
      return;
    }

    if (inst.op === 'Add' && prev && prev.op === 'Set') {
      const net = prev.n + inst.n;
      const mod = ((net % 256) + 256) % 256;
      prev.n = mod <= 127 ? mod : mod - 256;
      return;
    }

    out.push(inst);
  }

  private tryScan(input: IRFlat[], out: IROpt[], i: number, j: number): boolean {
    if (j - i - 1 !== 1) return false;
    const body = input[i + 1]!;
    if (body.op !== 'Move') return false;

    if (body.n === 1) {
      out.push({ op: 'ScanR' });
      return true;
    }
    if (body.n === -1) {
      out.push({ op: 'ScanL' });
      return true;
    }
    return false;
  }

  private tryMulLoop(input: IRFlat[], out: IROpt[], i: number, j: number): boolean {
    if (j - i - 1 < 1) return false;

    const a = input[i + 1]!;

    if (a.op !== 'Add' || Math.abs(a.n) !== 1) return false;

    let ptr = 0;
    const factors = new Map<number, number>();

    for (let k = i + 2; k < j; k++) {
      const ins = input[k]!;
      if (ins.op === 'Move') {
        ptr += ins.n;
      } else if (ins.op === 'Add') {
        if (ptr === 0) return false;
        factors.set(ptr, (factors.get(ptr) ?? 0) + ins.n);
      } else {
        return false;
      }
    }

    if (ptr !== 0) return false;

    for (const [offset, factor] of factors) {
      out.push({ op: 'MulAdd', offset, factor });
    }
    out.push({ op: 'Clear' });
    return true;
  }

  private assemble(insts: IROpt[]): Program {
    const n = insts.length;
    const op = new Int32Array(n);
    const a = new Int32Array(n);
    const b = new Int32Array(n);

    for (let i = 0; i < n; i++) {
      const ins = insts[i]!;
      switch (ins.op) {
        case 'Move':
          op[i] = Op.Move;
          a[i] = ins.n | 0;
          break;
        case 'Add':
          op[i] = Op.Add;
          a[i] = ins.n | 0;
          break;
        case 'Out':
          op[i] = Op.Out;
          a[i] = (ins.n | 0) >>> 0;
          break;
        case 'In':
          op[i] = Op.In;
          a[i] = (ins.n | 0) >>> 0;
          break;
        case 'JmpF':
          op[i] = Op.JmpF;
          a[i] = ins.target | 0;
          break;
        case 'JmpB':
          op[i] = Op.JmpB;
          a[i] = ins.target | 0;
          break;
        case 'Clear':
          op[i] = Op.Clear;
          break;
        case 'Set':
          op[i] = Op.Set;
          a[i] = ins.n | 0;
          break;
        case 'MulAdd':
          op[i] = Op.MulAdd;
          a[i] = ins.offset | 0;
          b[i] = ins.factor | 0;
          break;
        case 'ScanR':
          op[i] = Op.ScanR;
          break;
        case 'ScanL':
          op[i] = Op.ScanL;
          break;
      }
    }

    return { op, a, b, length: n };
  }
}
