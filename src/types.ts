export type BFChar = '<' | '>' | '+' | '-' | '.' | ',' | '[' | ']';

export interface Location {
  line: number;
  column: number;
  index: number;
}

export interface Token {
  ch: BFChar;
  loc: Location;
}

export enum Op {
  Move = 0,
  Add = 1,
  Out = 2,
  In = 3,
  JmpF = 4,
  JmpB = 5,
  Clear = 6,
  MoveAdd = 7,
}

export interface Program {
  op: Int32Array;
  a: Int32Array;
  b: Int32Array;
  length: number;
}