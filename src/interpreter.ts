import { Op, type Program } from './types';

export interface RuntimeOptions {
  tapeSize?: number;
  grow?: boolean;
  input?: Uint8Array | string;
  maxSteps?: number;
  onOutputByte?: (byte: number) => void;
  onOutputBurst?: (byte: number, count: number) => void;
}

export class Interpreter {
  private memory: Uint8Array;
  private ptr = 0;
  private ip = 0;
  private readonly input: Uint8Array;
  private inputIndex = 0;
  private readonly grow: boolean;
  private readonly maxSteps: number | undefined;
  private readonly onOutputByte: ((byte: number) => void) | undefined;
  private readonly onOutputBurst: ((byte: number, count: number) => void) | undefined;

  constructor(private readonly program: Program, opts: RuntimeOptions = {}) {
    const initial = Math.max(1, opts.tapeSize ?? 65536);
    this.memory = new Uint8Array(initial);
    this.grow = opts.grow !== undefined ? opts.grow : true;
    this.maxSteps = opts.maxSteps;
    this.onOutputByte = opts.onOutputByte;
    this.onOutputBurst = opts.onOutputBurst;

    if (typeof opts.input === 'string') {
      this.input = Buffer.from(opts.input, 'utf8');
    } else if (opts.input instanceof Uint8Array) {
      this.input = opts.input;
    } else {
      this.input = new Uint8Array(0);
    }
  }

  run(): Uint8Array {
    const op = this.program.op;
    const a = this.program.a;
    const b = this.program.b;
    const progLen = this.program.length;

    let mem = this.memory;
    let ptr = this.ptr;
    let ip = this.ip;

    const onOut = this.onOutputByte;
    const onBurst = this.onOutputBurst;
    const collected: number[] = [];
    const emit = (byte: number): void => {
      if (onOut) onOut(byte & 0xff);
      else collected.push(byte & 0xff);
    };

    let steps = 0;

    const ensureCapacity = (index: number): void => {
      if (index < mem.length) return;
      if (!this.grow) throw new Error(`Tape overflow at cell ${index}`);
      let newLen = mem.length;
      while (newLen <= index) newLen *= 2;
      const next = new Uint8Array(newLen);
      next.set(mem);
      mem = next;
      this.memory = mem;
    };

    const readByte = (): number => {
      if (this.inputIndex >= this.input.length) return 0;
      return this.input[this.inputIndex++]!;
    };

    while (ip < progLen) {
      if (this.maxSteps !== undefined) {
        if (steps >= this.maxSteps) throw new Error(`Step limit exceeded: ${this.maxSteps}`);
        steps += 1;
      }

      const code = op[ip] as Op;
      const arg = a[ip] | 0;

      switch (code) {
        case Op.Move: {
          const nxt = ptr + arg;
          if (nxt < 0) throw new Error('Pointer moved left of tape');
          ensureCapacity(nxt);
          ptr = nxt;
          ip += 1;
          break;
        }
        case Op.Add: {
          mem[ptr] = (mem[ptr]! + arg) & 0xff;
          ip += 1;
          break;
        }
        case Op.Clear: {
          mem[ptr] = 0;
          ip += 1;
          break;
        }
        case Op.MoveAdd: {
          const dest = ptr + arg;
          if (dest < 0) throw new Error('Pointer moved left of tape');
          ensureCapacity(dest);
          const v = mem[ptr];
          if (v !== 0) {
            const factor = b[ip] | 0;
            mem[dest] = (mem[dest]! + v * factor) & 0xff;
            mem[ptr] = 0;
          }
          ip += 1;
          break;
        }
        case Op.Out: {
          const count = arg >>> 0;
          const val = mem[ptr]!;
          if (onBurst && count > 8) {
            onBurst(val, count);
          } else {
            for (let k = 0; k < count; k++) emit(val);
          }
          ip += 1;
          break;
        }
        case Op.In: {
          const count = arg >>> 0;
          for (let k = 0; k < count; k++) mem[ptr] = readByte();
          ip += 1;
          break;
        }
        case Op.JmpF: {
          ip = mem[ptr] === 0 ? arg : ip + 1;
          break;
        }
        case Op.JmpB: {
          ip = mem[ptr] !== 0 ? arg : ip + 1;
          break;
        }
        default: {
          throw new Error(`Unknown opcode ${code} at ip=${ip}`);
        }
      }
    }

    this.ptr = ptr;
    this.ip = ip;
    this.memory = mem;
    return Uint8Array.from(collected);
  }
}