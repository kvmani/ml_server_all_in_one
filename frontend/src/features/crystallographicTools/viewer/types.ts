export type PlaneConfig = {
  id: string;
  h: number;
  k: number;
  l: number;
  i?: number;
  color: string;
  opacity: number;
  visible: boolean;
};

export type DirectionConfig = {
  id: string;
  u: number;
  v: number;
  w: number;
  color: string;
  visible: boolean;
};

export type ElementOverrides = Record<
  string,
  {
    color?: string;
    scale?: number;
  }
>;

export type ViewerSettings = {
  showAtoms: boolean;
  showCell: boolean;
  showSupercell: boolean;
  showPlanes: boolean;
  showDirections: boolean;
  showAxes: boolean;
  atomScale: number;
  minAtomRadius: number;
  colorMode: "element" | "single";
  customColor: string;
  elementOverrides?: ElementOverrides;
};
