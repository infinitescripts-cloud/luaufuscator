// WitchSec — IR opcode definitions
// Stack-based VM. Each instruction is: opcode byte + operands.
// Operands are big-endian, size defined per opcode.

(function () {
  'use strict';

  // Format: [name, [operandTypes], stackEffect, description]
  // operandTypes: 'i8' 'i16' 'i32' 'u16' 'u32' 'f64' 'const'
  // stackEffect: positive = net pushes

  const OPCODES = [
    // ---- stack manipulation ----
    ['NOP',            [],                            0,  'no operation'],
    ['PUSH_NIL',       [],                            1,  'push nil'],
    ['PUSH_TRUE',      [],                            1,  'push true'],
    ['PUSH_FALSE',     [],                            1,  'push false'],
    ['PUSH_INT',       ['i32'],                       1,  'push signed int32 constant'],
    ['PUSH_NUM',       ['f64'],                       1,  'push f64 constant'],
    ['PUSH_STR',       ['u16'],                       1,  'push string const by index'],
    ['POP',            [],                           -1,  'pop and discard'],
    ['DUP',            [],                            1,  'duplicate top'],
    ['SWAP',           [],                            0,  'swap top two'],

    // ---- locals / upvalues ----
    ['GETLOCAL',       ['u8'],                        1,  'push local[i]'],
    ['SETLOCAL',       ['u8'],                       -1,  'pop into local[i]'],
    ['GETUPVAL',       ['u8'],                        1,  'push upval[i]'],
    ['SETUPVAL',       ['u8'],                       -1,  'pop into upval[i]'],

    // ---- tables ----
    ['NEWTABLE',       [],                            1,  'push new table'],
    ['GETTABLE',       [],                           -1,  'pop key, table; push table[key]'],
    ['SETTABLE',       [],                           -3,  'pop val, key, table; table[key]=val'],

    // ---- arithmetic (pop 2, push 1) ----
    ['ADD',            [],                           -1,  'a + b'],
    ['SUB',            [],                           -1,  'a - b'],
    ['MUL',            [],                           -1,  'a * b'],
    ['DIV',            [],                           -1,  'a / b'],
    ['IDIV',           [],                           -1,  'a // b'],
    ['MOD',            [],                           -1,  'a % b'],
    ['POW',            [],                           -1,  'a ^ b'],
    ['BAND',           [],                           -1,  'a & b'],
    ['BOR',            [],                           -1,  'a | b'],
    ['BXOR',           [],                           -1,  'a ~ b'],
    ['SHL',            [],                           -1,  'a << b'],
    ['SHR',            [],                           -1,  'a >> b'],

    // ---- unary (pop 1, push 1) ----
    ['UNM',            [],                            0,  'unary minus'],
    ['NOT',            [],                            0,  'logical not'],
    ['LEN',            [],                            0,  'length #a'],
    ['BNOT',           [],                            0,  'bitwise not ~a'],

    // ---- comparison (pop 2, push bool) ----
    ['EQ',             [],                           -1,  'a == b'],
    ['NE',             [],                           -1,  'a ~= b'],
    ['LT',             [],                           -1,  'a < b'],
    ['LE',             [],                           -1,  'a <= b'],
    ['GT',             [],                           -1,  'a > b'],
    ['GE',             [],                           -1,  'a >= b'],

    // ---- concat ----
    ['CONCAT',         [],                           -1,  'a .. b'],

    // ---- control flow ----
    ['JUMP',           ['i32'],                       0,  'pc += offset'],
    ['JUMP_IF_FALSE',  ['i32'],                      -1,  'pop; if falsy, pc += offset'],
    ['JUMP_IF_TRUE',   ['i32'],                      -1,  'pop; if truthy, pc += offset'],
    ['AND',            ['i32'],                       0,  'if top falsy, jump; else pop'],
    ['OR',             ['i32'],                       0,  'if top truthy, jump; else pop'],

    // ---- calls ----
    ['CALL',           ['u8'],                      null, 'pop nargs+1; call fn; push nrets'],
    ['RETURN',         ['u8'],                       0,  'pop nvals; return'],
    ['VARARG',         [],                          null, 'push vararg values'],

    // ---- closures ----
    ['CLOSURE',        ['u16', 'u8'],               null, 'push closure; upval[i] from stack[i]'],
    ['CLOSE',          [],                            0,  'close upvalues at current scope'],

    // ---- iteration ----
    ['FORPREP',        ['i32'],                       0,  'init numeric for; jump if done'],
    ['FORLOOP',        ['i32'],                      -1,  'increment loop; jump if continuing'],
    ['TFORCALL',       ['u8', 'i32'],               null, 'generic for: call iterator'],
    ['TFORLOOP',       ['i32'],                       0,  'test iterator result; jump if continuing'],
  ];

  // Build lookup tables
  const byName = {};
  const byIndex = {};
  for (let i = 0; i < OPCODES.length; i++) {
    const [name, args, effect, desc] = OPCODES[i];
    byName[name] = i;
    byIndex[i] = { name, args, effect, desc };
  }

  // Operand byte sizes
  const OPERAND_SIZE = {
    i8: 1, u8: 1,
    i16: 2, u16: 2,
    i32: 4, u32: 4,
    f64: 8,
    const: 2,  // const table index, u16
  };

  function operandSize(type) {
    return OPERAND_SIZE[type];
  }

  function instructionSize(opcodeIdx) {
    const info = byIndex[opcodeIdx];
    if (!info) throw new Error('unknown opcode ' + opcodeIdx);
    let size = 1;  // opcode byte
    for (const t of info.args) size += operandSize(t);
    return size;
  }

  // Semantic tag for each opcode — used by serializer to shuffle dispatch
  // and by VM template to generate the right handler.
  const OP_TAGS = {
    NOP: 'nop',
    PUSH_NIL: 'const', PUSH_TRUE: 'const', PUSH_FALSE: 'const',
    PUSH_INT: 'const', PUSH_NUM: 'const', PUSH_STR: 'const',
    POP: 'stack', DUP: 'stack', SWAP: 'stack',
    GETLOCAL: 'local', SETLOCAL: 'local',
    GETUPVAL: 'upval', SETUPVAL: 'upval',
    NEWTABLE: 'table', GETTABLE: 'table', SETTABLE: 'table',
    ADD: 'arith', SUB: 'arith', MUL: 'arith', DIV: 'arith',
    IDIV: 'arith', MOD: 'arith', POW: 'arith',
    BAND: 'arith', BOR: 'arith', BXOR: 'arith', SHL: 'arith', SHR: 'arith',
    UNM: 'unary', NOT: 'unary', LEN: 'unary', BNOT: 'unary',
    EQ: 'cmp', NE: 'cmp', LT: 'cmp', LE: 'cmp', GT: 'cmp', GE: 'cmp',
    CONCAT: 'concat',
    JUMP: 'ctrl', JUMP_IF_FALSE: 'ctrl', JUMP_IF_TRUE: 'ctrl',
    AND: 'ctrl', OR: 'ctrl',
    CALL: 'call', RETURN: 'call', VARARG: 'call',
    CLOSURE: 'closure', CLOSE: 'closure',
    FORPREP: 'iter', FORLOOP: 'iter', TFORCALL: 'iter', TFORLOOP: 'iter',
  };

  window.WitchSecIR = {
    OPCODES,
    OP_TAGS,
    byName,
    byIndex,
    OPERAND_SIZE,
    operandSize,
    instructionSize,
    count: OPCODES.length,
  };
})();