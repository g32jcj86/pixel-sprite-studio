export type RegistrationPoint = { x: number; y: number };
export type RegistrationMatch = {
  dx: number;
  dy: number;
  found: RegistrationPoint;
  score: number;
  margin: number;
  coverage: number;
  reliable: boolean;
  reason: string;
};
export type RegistrationOptions = {
  point?: RegistrationPoint;
  radius?: number;
  search?: number;
  selected?: number[];
  referenceIndex?: number;
};
export type RegistrationResult = {
  point: RegistrationPoint;
  radius: number;
  matches: RegistrationMatch[];
  automatic: boolean;
  reason: string;
};
type Sample = {
  x: number;
  y: number;
  r: number;
  g: number;
  b: number;
  a: number;
  weight: number;
};
type Patch = {
  point: RegistrationPoint;
  samples: Sample[];
  cheap: Sample[];
  texture: number;
};

function rgba(pixels: string[]) {
  const data = new Uint8ClampedArray(pixels.length * 4);
  pixels.forEach((color, i) => {
    if (!color) return;
    data[i * 4] = parseInt(color.slice(1, 3), 16);
    data[i * 4 + 1] = parseInt(color.slice(3, 5), 16);
    data[i * 4 + 2] = parseInt(color.slice(5, 7), 16);
    data[i * 4 + 3] =
      color.length === 9 ? parseInt(color.slice(7, 9), 16) : 255;
  });
  return data;
}
function makePatch(
  data: Uint8ClampedArray,
  width: number,
  height: number,
  point: RegistrationPoint,
  radius: number,
): Patch {
  const samples: Sample[] = [];
  for (
    let y = Math.max(0, point.y - radius);
    y <= Math.min(height - 1, point.y + radius);
    y++
  )
    for (
      let x = Math.max(0, point.x - radius);
      x <= Math.min(width - 1, point.x + radius);
      x++
    ) {
      const i = (y * width + x) * 4,
        a = data[i + 3];
      if (!a) continue;
      samples.push({
        x: x - point.x,
        y: y - point.y,
        r: data[i],
        g: data[i + 1],
        b: data[i + 2],
        a,
        weight: 0.25 + (0.75 * a) / 255,
      });
    }
  const total = samples.reduce((n, sample) => n + sample.weight, 0);
  const means = ["r", "g", "b"].map(
    (channel) =>
      samples.reduce(
        (n, sample) => n + sample[channel as "r" | "g" | "b"] * sample.weight,
        0,
      ) / (total || 1),
  );
  const salience = (sample: Sample) =>
    ((sample.r - means[0]) ** 2 +
      (sample.g - means[1]) ** 2 +
      (sample.b - means[2]) ** 2) /
    (3 * 255 ** 2);
  const texture =
    samples.reduce((n, sample) => n + salience(sample) * sample.weight, 0) /
    (total || 1);
  const important = [...samples]
    .sort((a, b) => salience(b) - salience(a))
    .slice(0, 6);
  const cheap = [
    ...new Set([
      ...important,
      ...Array.from(
        { length: Math.min(8, samples.length) },
        (_, i) =>
          samples[
            Math.floor((i * samples.length) / Math.min(8, samples.length))
          ],
      ),
    ]),
  ];
  return { point, samples, cheap, texture };
}
function errorAt(
  samples: Sample[],
  data: Uint8ClampedArray,
  width: number,
  height: number,
  x: number,
  y: number,
) {
  let error = 0,
    weight = 0,
    covered = 0;
  for (const sample of samples) {
    const px = x + sample.x,
      py = y + sample.y;
    weight += sample.weight;
    if (px < 0 || py < 0 || px >= width || py >= height) {
      error += sample.weight;
      continue;
    }
    const i = (py * width + px) * 4,
      alpha = data[i + 3];
    if (!alpha) {
      error += sample.weight;
      continue;
    }
    covered += (sample.weight * Math.min(alpha, sample.a)) / sample.a;
    const color =
      (Math.abs(sample.r - data[i]) +
        Math.abs(sample.g - data[i + 1]) +
        Math.abs(sample.b - data[i + 2])) /
      (3 * 255);
    error +=
      sample.weight * (color * 0.8 + (Math.abs(sample.a - alpha) / 255) * 0.2);
  }
  return { score: error / (weight || 1), coverage: covered / (weight || 1) };
}
function findMatch(
  patch: Patch,
  data: Uint8ClampedArray,
  width: number,
  height: number,
  range: number,
  radius: number,
): RegistrationMatch {
  const step = Math.max(1, Math.ceil(range / 8)),
    shifts: number[] = [];
  for (let i = -range; i <= range; i += step) shifts.push(i);
  if (!shifts.includes(range)) shifts.push(range);
  if (!shifts.includes(0)) shifts.push(0);
  const coarse: { x: number; y: number; score: number }[] = [];
  for (const y of shifts)
    for (const x of shifts) {
      const px = patch.point.x + x,
        py = patch.point.y + y;
      if (px < 0 || py < 0 || px >= width || py >= height) continue;
      coarse.push({
        x,
        y,
        score: errorAt(patch.cheap, data, width, height, px, py).score,
      });
    }
  coarse.sort((a, b) => a.score - b.score);
  const visited = new Set<number>(),
    fine: { x: number; y: number; score: number; coverage: number }[] = [];
  for (const seed of coarse.slice(0, 12))
    for (
      let y = Math.max(-range, seed.y - step);
      y <= Math.min(range, seed.y + step);
      y++
    )
      for (
        let x = Math.max(-range, seed.x - step);
        x <= Math.min(range, seed.x + step);
        x++
      ) {
        const key = (y + range) * (range * 2 + 1) + x + range;
        if (visited.has(key)) continue;
        visited.add(key);
        const px = patch.point.x + x,
          py = patch.point.y + y;
        if (px < 0 || py < 0 || px >= width || py >= height) continue;
        fine.push({
          x,
          y,
          ...errorAt(patch.samples, data, width, height, px, py),
        });
      }
  fine.sort(
    (a, b) =>
      a.score - b.score ||
      Math.abs(a.x) + Math.abs(a.y) - Math.abs(b.x) - Math.abs(b.y) ||
      a.y - b.y ||
      a.x - b.x,
  );
  const best = fine[0] || { x: 0, y: 0, score: 1, coverage: 0 };
  const second = fine.find(
    (candidate) =>
      Math.max(
        Math.abs(candidate.x - best.x),
        Math.abs(candidate.y - best.y),
      ) >= radius,
  );
  const margin = second ? second.score - best.score : 1;
  const reliable =
    patch.samples.length >= 8 &&
    patch.texture >= 0.001 &&
    best.coverage >= 0.88 &&
    best.score <= 0.1 &&
    margin >= Math.max(0.025, best.score * 0.35);
  return {
    dx: -best.x,
    dy: -best.y,
    found: { x: patch.point.x + best.x, y: patch.point.y + best.y },
    score: best.score,
    margin,
    coverage: best.coverage,
    reliable,
    reason:
      patch.samples.length < 8 || patch.texture < 0.001
        ? "特徵缺少紋理或有效像素"
        : best.coverage < 0.88 || best.score > 0.1
          ? "找不到足夠相似的特徵"
          : margin < Math.max(0.025, best.score * 0.35)
            ? "有重複圖樣，候選位置不明確"
            : "可靠的局部特徵相符",
  };
}
export function registerFrames(
  frames: string[][],
  width: number,
  height: number,
  options: RegistrationOptions = {},
): RegistrationResult {
  const radius = Math.max(2, Math.min(4, Math.round(options.radius || 3))),
    range = Math.max(1, Math.min(32, Math.round(options.search || 12)));
  const selected = options.selected || frames.map((_, i) => i),
    referenceIndex = options.referenceIndex ?? selected[0] ?? 0;
  const data = frames.map(rgba),
    reference = data[referenceIndex];
  const empty = (
    point: RegistrationPoint,
    reason: string,
  ): RegistrationMatch => ({
    dx: 0,
    dy: 0,
    found: { ...point },
    score: 1,
    margin: 0,
    coverage: 0,
    reliable: false,
    reason,
  });
  if (!reference)
    return {
      point: { x: 0, y: 0 },
      radius,
      matches: frames.map(() => empty({ x: 0, y: 0 }, "沒有參考影格")),
      automatic: false,
      reason: "沒有參考影格",
    };
  let candidates: Patch[] = [];
  if (options.point)
    candidates = [
      makePatch(
        reference,
        width,
        height,
        { x: Math.round(options.point.x), y: Math.round(options.point.y) },
        radius,
      ),
    ];
  else {
    const foreground: number[] = [];
    for (let i = 0; i < width * height; i++)
      if (reference[i * 4 + 3]) foreground.push(i);
    const stride = Math.max(1, Math.ceil(foreground.length / 1800));
    for (let i = 0; i < foreground.length; i += stride) {
      const index = foreground[i],
        patch = makePatch(
          reference,
          width,
          height,
          { x: index % width, y: Math.floor(index / width) },
          radius,
        );
      if (patch.samples.length >= 8 && patch.texture >= 0.001)
        candidates.push(patch);
    }
    candidates.sort(
      (a, b) =>
        b.texture * Math.sqrt(b.samples.length) -
          a.texture * Math.sqrt(a.samples.length) ||
        a.point.y - b.point.y ||
        a.point.x - b.point.x,
    );
    const spread: Patch[] = [];
    for (const candidate of candidates) {
      if (
        spread.every(
          (other) =>
            Math.max(
              Math.abs(other.point.x - candidate.point.x),
              Math.abs(other.point.y - candidate.point.y),
            ) >= radius,
        )
      )
        spread.push(candidate);
      if (spread.length === 64) break;
    }
    candidates = spread;
  }
  if (!candidates.length)
    return {
      point: options.point || {
        x: Math.floor(width / 2),
        y: Math.floor(height / 2),
      },
      radius,
      matches: frames.map(() =>
        empty(options.point || { x: 0, y: 0 }, "沒有足夠有辨識度的前景紋理"),
      ),
      automatic: false,
      reason: "請在第一格選取有細節的特徵，或逐格手動指定相符點",
    };
  let chosen = candidates[0],
    bestMatches: RegistrationMatch[] = [],
    bestQuality = -Infinity;
  for (const patch of candidates) {
    const matches = frames.map((_, i) =>
      !selected.includes(i)
        ? { ...empty(patch.point, "保留原位置"), reliable: true }
        : i === referenceIndex
          ? {
              dx: 0,
              dy: 0,
              found: { ...patch.point },
              score: 0,
              margin: 1,
              coverage: 1,
              reliable: patch.samples.length >= 8 && patch.texture >= 0.001,
              reason: "第一格參考位置",
            }
          : findMatch(patch, data[i], width, height, range, radius),
    );
    const compared = selected
      .filter((i) => i !== referenceIndex)
      .map((i) => matches[i]);
    const quality =
      compared.reduce(
        (n, match) =>
          n +
          (match.reliable ? 10 : 0) +
          match.coverage -
          match.score * 3 +
          Math.min(0.3, match.margin),
        0,
      ) +
      patch.texture * 0.01;
    if (quality > bestQuality) {
      bestQuality = quality;
      chosen = patch;
      bestMatches = matches;
    }
  }
  const reliableCount = selected.filter((i) => bestMatches[i]?.reliable).length;
  return {
    point: { ...chosen.point },
    radius,
    matches: bestMatches,
    automatic: reliableCount === selected.length,
    reason:
      reliableCount === selected.length
        ? "已找到跨影格穩定的局部特徵"
        : "部分影格需手動確認，尚不會自動套用",
  };
}
