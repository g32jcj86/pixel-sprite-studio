export type CheckerModel = {
  colors: number[][];
  width: number;
  height: number;
  x: number;
  y: number;
  phase: number;
};
export function alphaSummary(data: Uint8ClampedArray) {
  let transparent = 0,
    partial = 0,
    opaque = 0;
  for (let i = 3; i < data.length; i += 4) {
    if (!data[i]) transparent++;
    else if (data[i] < 255) partial++;
    else opaque++;
  }
  return { transparent, partial, opaque, total: data.length / 4 };
}
export function pixelsToRgba(pixels: string[]) {
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
function colorDistance(data: Uint8ClampedArray, i: number, color: number[]) {
  return Math.max(
    ...color.map((value, j) => Math.abs(value - data[i * 4 + j])),
  );
}
function checkerIndex(model: CheckerModel, x: number, y: number) {
  return (
    (((Math.floor((x - model.x) / model.width) +
      Math.floor((y - model.y) / model.height) +
      model.phase) %
      2) +
      2) %
    2
  );
}
export function detectBakedChecker(
  data: Uint8ClampedArray,
  width: number,
  height: number,
): CheckerModel | null {
  let left = width,
    top = height,
    right = -1,
    bottom = -1;
  for (let i = 0; i < width * height; i++)
    if (data[i * 4 + 3]) {
      left = Math.min(left, i % width);
      right = Math.max(right, i % width);
      top = Math.min(top, Math.floor(i / width));
      bottom = Math.max(bottom, Math.floor(i / width));
    }
  if (right - left < 7 || bottom - top < 7) return null;
  const histogram = new Map<string, { color: number[]; count: number }>();
  const edges: number[] = [];
  for (let x = left; x <= right; x++)
    edges.push(top * width + x, bottom * width + x);
  for (let y = top + 1; y < bottom; y++)
    edges.push(y * width + left, y * width + right);
  edges.forEach((i) => {
    if (data[i * 4 + 3] < 245) return;
    const color = [data[i * 4], data[i * 4 + 1], data[i * 4 + 2]];
    if (Math.min(...color) < 170 || Math.max(...color) - Math.min(...color) > 9)
      return;
    const rounded = color.map((n) => Math.min(255, Math.round(n / 4) * 4)),
      key = rounded.join(",");
    const entry = histogram.get(key);
    if (entry) entry.count++;
    else histogram.set(key, { color: rounded, count: 1 });
  });
  const candidates = [...histogram.values()].sort((a, b) => b.count - a.count);
  if (candidates.length < 2) return null;
  const first = candidates[0],
    second = candidates.find(
      (candidate) =>
        Math.max(
          ...candidate.color.map((n, j) => Math.abs(n - first.color[j])),
        ) >= 10,
    );
  if (!second || second.count < edges.length * 0.08) return null;
  const colors = [first.color, second.color];
  const classify = (i: number) =>
    data[i * 4 + 3] >= 245
      ? colors.findIndex((color) => colorDistance(data, i, color) <= 6)
      : -1;
  function axis(length: number, pixelAt: (i: number) => number) {
    const runs: { start: number; length: number; color: number }[] = [];
    for (let i = 0; i < length; i++) {
      const color = classify(pixelAt(i)),
        start = i;
      while (i + 1 < length && classify(pixelAt(i + 1)) === color) i++;
      runs.push({ start, length: i - start + 1, color });
    }
    const regular = runs.slice(1, -1).filter((run) => run.color >= 0);
    if (
      regular.length < 3 ||
      runs
        .filter((run) => run.color >= 0)
        .reduce((n, run) => n + run.length, 0) <
        length * 0.7
    )
      return null;
    const lengths = regular.map((run) => run.length).sort((a, b) => a - b),
      size = lengths[Math.floor(lengths.length / 2)];
    if (
      size < 2 ||
      regular.filter((run) => Math.abs(run.length - size) <= 1).length <
        regular.length * 0.8
    )
      return null;
    const transition = runs.find(
      (run, i) =>
        i > 0 &&
        run.color >= 0 &&
        runs[i - 1].color >= 0 &&
        run.color !== runs[i - 1].color,
    );
    return transition ? { size, origin: transition.start } : null;
  }
  const horizontal = axis(right - left + 1, (x) => top * width + left + x),
    vertical = axis(bottom - top + 1, (y) => (top + y) * width + left);
  if (!horizontal || !vertical) return null;
  const model: CheckerModel = {
    colors,
    width: horizontal.size,
    height: vertical.size,
    x: left + horizontal.origin,
    y: top + vertical.origin,
    phase: 0,
  };
  let known = 0,
    fits = 0;
  edges.forEach((i) => {
    const actual = classify(i);
    if (actual < 0) return;
    known++;
    if (checkerIndex(model, i % width, Math.floor(i / width)) === actual)
      fits++;
  });
  if (known < edges.length * 0.75) return null;
  if (fits < known / 2) {
    model.phase = 1;
    fits = known - fits;
  }
  return fits >= known * 0.9 ? model : null;
}
export function removeBakedChecker(
  data: Uint8ClampedArray,
  width: number,
  height: number,
  model: CheckerModel,
) {
  const output = new Uint8ClampedArray(data),
    total = width * height;
  const classes = new Int8Array(total).fill(-1),
    protectedPixels = new Uint8Array(total),
    examined = new Uint8Array(total);
  for (let i = 0; i < total; i++)
    if (data[i * 4 + 3] >= 245)
      classes[i] = model.colors.findIndex(
        (color) => colorDistance(data, i, color) <= 6,
      );
  const neighbors = (i: number) => {
    const points: number[] = [],
      x = i % width,
      y = Math.floor(i / width);
    if (x) points.push(i - 1);
    if (x < width - 1) points.push(i + 1);
    if (y) points.push(i - width);
    if (y < height - 1) points.push(i + width);
    return points;
  };
  // 同色區塊若打破棋盤相位，保守視為角色顏色；黑色外框內的白色不會被挖空。
  for (let i = 0; i < total; i++) {
    if (examined[i] || classes[i] < 0) continue;
    const component = [i];
    examined[i] = 1;
    let hasArt = false;
    for (let j = 0; j < component.length; j++) {
      const pixel = component[j];
      if (
        classes[pixel] !==
        checkerIndex(model, pixel % width, Math.floor(pixel / width))
      )
        hasArt = true;
      neighbors(pixel).forEach((next) => {
        if (!examined[next] && classes[next] === classes[i]) {
          examined[next] = 1;
          component.push(next);
        }
      });
    }
    if (hasArt) component.forEach((pixel) => (protectedPixels[pixel] = 1));
  }
  const queue: number[] = [],
    visited = new Uint8Array(total);
  for (let x = 0; x < width; x++) queue.push(x, (height - 1) * width + x);
  for (let y = 1; y < height - 1; y++)
    queue.push(y * width, y * width + width - 1);
  let removed = 0;
  for (let j = 0; j < queue.length; j++) {
    const i = queue[j];
    if (visited[i]) continue;
    visited[i] = 1;
    if (
      data[i * 4 + 3] !== 0 &&
      (protectedPixels[i] ||
        classes[i] < 0 ||
        classes[i] !== checkerIndex(model, i % width, Math.floor(i / width)))
    )
      continue;
    if (output[i * 4 + 3]) {
      output[i * 4 + 3] = 0;
      removed++;
    }
    neighbors(i).forEach((next) => {
      if (!visited[next]) queue.push(next);
    });
  }
  return { data: output, removed };
}
export function removeExteriorColor(
  data: Uint8ClampedArray,
  width: number,
  height: number,
  color: number[],
) {
  const output = new Uint8ClampedArray(data),
    visited = new Uint8Array(width * height),
    queue: number[] = [];
  for (let x = 0; x < width; x++) queue.push(x, (height - 1) * width + x);
  for (let y = 1; y < height - 1; y++)
    queue.push(y * width, y * width + width - 1);
  let removed = 0;
  for (let j = 0; j < queue.length; j++) {
    const i = queue[j];
    if (visited[i]) continue;
    visited[i] = 1;
    if (
      data[i * 4 + 3] !== 0 &&
      (data[i * 4 + 3] < 245 || colorDistance(data, i, color) > 3)
    )
      continue;
    if (output[i * 4 + 3]) {
      output[i * 4 + 3] = 0;
      removed++;
    }
    const x = i % width,
      y = Math.floor(i / width);
    if (x) queue.push(i - 1);
    if (x < width - 1) queue.push(i + 1);
    if (y) queue.push(i - width);
    if (y < height - 1) queue.push(i + width);
  }
  return { data: output, removed };
}
