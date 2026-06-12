import { describe, expect, it } from 'vitest';
import { parseTablePaste } from './table-paste';

describe('parseTablePaste', () => {
  it('parses an Excel (TSV) paste with a header row', () => {
    const parsed = parseTablePaste('RPM\tTorque\n0\t1.2\n1000\t1.1\n2000\t0.9');
    expect(parsed).toEqual({
      columnNames: ['RPM', 'Torque'],
      rows: [
        [0, 1.2],
        [1000, 1.1],
        [2000, 0.9],
      ],
      headerDetected: true,
    });
  });

  it('parses a headerless numeric paste and names the columns', () => {
    const parsed = parseTablePaste('0\t1.2\r\n1000\t1.1');
    expect(parsed).toEqual({
      columnNames: ['Column 1', 'Column 2'],
      rows: [
        [0, 1.2],
        [1000, 1.1],
      ],
      headerDetected: false,
    });
  });

  it('falls back to CSV when there are no tabs', () => {
    const parsed = parseTablePaste('Speed,Flow,Pressure\n10,4.5,2\n20,4.1,');
    expect(parsed?.columnNames).toEqual(['Speed', 'Flow', 'Pressure']);
    expect(parsed?.rows).toEqual([
      [10, 4.5, 2],
      [20, 4.1, null],
    ]);
  });

  it('pads ragged rows and nulls non-numeric data cells', () => {
    const parsed = parseTablePaste('A\tB\tC\n1\tx\n2\t3\t4');
    expect(parsed?.rows).toEqual([
      [1, null, null],
      [2, 3, 4],
    ]);
  });

  it('returns null for empty, single-column, or all-null pastes', () => {
    expect(parseTablePaste('')).toBeNull();
    expect(parseTablePaste('justtext')).toBeNull();
    expect(parseTablePaste('42\n43')).toBeNull(); // one column < schema minimum
    expect(parseTablePaste('a\tb\nx\ty')).toBeNull(); // header + no numeric data
  });
});
