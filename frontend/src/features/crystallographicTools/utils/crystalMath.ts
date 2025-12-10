export function fractionalToCartesian(frac: number[], latticeMatrix?: number[][]): [number, number, number] {
  const matrix = latticeMatrix ?? [
    [1, 0, 0],
    [0, 1, 0],
    [0, 0, 1],
  ];
  return [
    frac[0] * matrix[0][0] + frac[1] * matrix[1][0] + frac[2] * matrix[2][0],
    frac[0] * matrix[0][1] + frac[1] * matrix[1][1] + frac[2] * matrix[2][1],
    frac[0] * matrix[0][2] + frac[1] * matrix[1][2] + frac[2] * matrix[2][2],
  ];
}

export function atomCountForSupercell(baseAtoms: number, supercell: number[]): number {
  return baseAtoms * supercell.reduce((product, value) => product * value, 1);
}

export function clampSupercell(supercell: number[], maxSupercell?: number[]): [number, number, number] {
  const cap = maxSupercell ?? [4, 4, 4];
  const next = supercell.slice(0, 3).map((value, idx) => {
    const safe = Number.isFinite(value) ? value : 1;
    return Math.min(Math.max(Math.round(safe), 1), cap[idx] ?? 4);
  }) as [number, number, number];
  return next;
}
