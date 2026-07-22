export type Rgb = [number, number, number];

export type DitherColor = "green" | "blue" | "purple" | "pink" | "orange" | "red" | "grey";

export type Seed = { fill: Rgb; line: Rgb; star: Rgb };

// Each seed: the area-fill hue, the bright series line, and the star sparkle.
export const PALETTE_LIGHT: Record<DitherColor, Seed> = {
  green: { fill: [22, 163, 74], line: [16, 122, 55], star: [74, 222, 128] },
  blue: { fill: [37, 99, 235], line: [28, 78, 196], star: [147, 197, 253] },
  purple: {
    fill: [124, 58, 237],
    line: [100, 45, 200],
    star: [196, 165, 250],
  },
  pink: { fill: [219, 39, 119], line: [185, 30, 100], star: [249, 168, 212] },
  orange: {
    fill: [234, 88, 12],
    line: [196, 72, 8],
    star: [253, 186, 140],
  },
  red: { fill: [220, 38, 38], line: [185, 30, 30], star: [252, 165, 165] },
  // No-data: a muted grey so empty metrics read as "nothing here".
  grey: { fill: [110, 110, 110], line: [90, 90, 90], star: [170, 170, 170] },
};

export const PALETTE_DARK: Record<DitherColor, Seed> = {
  green: { fill: [74, 222, 128], line: [34, 197, 94], star: [187, 247, 208] },
  blue: { fill: [96, 165, 250], line: [59, 130, 246], star: [191, 219, 254] },
  purple: {
    fill: [167, 139, 250],
    line: [139, 92, 246],
    star: [221, 214, 254],
  },
  pink: { fill: [244, 114, 182], line: [236, 72, 153], star: [251, 207, 232] },
  orange: {
    fill: [251, 146, 60],
    line: [249, 115, 22],
    star: [254, 215, 170],
  },
  red: { fill: [248, 113, 113], line: [239, 68, 68], star: [254, 202, 202] },
  grey: { fill: [150, 150, 150], line: [120, 120, 120], star: [200, 200, 200] },
};

// Light is the identity palette; dark swaps in brighter fills at read time.
export const PALETTE = PALETTE_LIGHT;

export const rgb = ([r, g, b]: Rgb, k = 1, a = 1) =>
  `rgba(${Math.round(r * k)},${Math.round(g * k)},${Math.round(b * k)},${a})`;

export const seedOfColor = (color: DitherColor): Seed =>
  (isDarkTheme() ? PALETTE_DARK : PALETTE_LIGHT)[color];

export const isDitherColor = (value: unknown): value is DitherColor =>
  typeof value === "string" && value in PALETTE;

function isDarkTheme() {
  return (
    typeof document !== "undefined" && document.documentElement.classList.contains("dark")
  );
}
