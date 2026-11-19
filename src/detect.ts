export type Point = { x: number; y: number };
export type OpenCV = any;
export type Method = "edges" | "background" | "review" | "default";

export function orderCorners(points: Point[]): Point[] {
  // Tri angulaire autour du centre : évite les doublons fréquents de la
  // méthode min/max (x+y, y-x) sur les documents fortement inclinés.
  const center = points.reduce(
    (sum, point) => ({ x: sum.x + point.x / 4, y: sum.y + point.y / 4 }),
    { x: 0, y: 0 }
  );
  const ordered = [...points].sort(
    (a, b) => Math.atan2(a.y - center.y, a.x - center.x) -
              Math.atan2(b.y - center.y, b.x - center.x)
  );
  const start = ordered.reduce(
    (best, point, index) =>
      point.x + point.y < ordered[best].x + ordered[best].y ? index : best,
    0
  );
  return [...ordered.slice(start), ...ordered.slice(0, start)];
}

function plausibleQuad(points: Point[], width: number, height: number): boolean {
  const sides = points.map((point, index) => {
    const next = points[(index + 1) % 4];
    return Math.hypot(next.x - point.x, next.y - point.y);
  });
  if (Math.min(...sides) < Math.min(width, height) * 0.10) return false;

  // Écarte les quadrilatères dégénérés (fragments, reflets et objets fins).
  for (let i = 0; i < 4; i += 1) {
    const previous = points[(i + 3) % 4];
    const current = points[i];
    const next = points[(i + 1) % 4];
    const ax = previous.x - current.x;
    const ay = previous.y - current.y;
    const bx = next.x - current.x;
    const by = next.y - current.y;
    const cosine = (ax * bx + ay * by) /
      (Math.hypot(ax, ay) * Math.hypot(bx, by));
    const angle = Math.acos(Math.max(-1, Math.min(1, cosine))) * 180 / Math.PI;
    if (!Number.isFinite(angle) || angle < 18 || angle > 162) return false;
  }
  const areaRatio = quadArea(points) / (width * height);
  return areaRatio >= 0.06 && areaRatio <= 0.985;
}

function quadArea(q: Point[]): number {
  let sum = 0;
  for (let i = 0; i < 4; i += 1) {
    const a = q[i];
    const b = q[(i + 1) % 4];
    sum += a.x * b.y - b.x * a.y;
  }
  return Math.abs(sum) / 2;
}

function odd(value: number): number {
  const rounded = Math.max(3, Math.round(value));
  return rounded % 2 === 0 ? rounded + 1 : rounded;
}

/**
 * Stratégie 1 : bords nets (Canny / seuil adaptatif) — précise quand le papier
 * contraste bien avec son support.
 */
function detectByEdges(cv: OpenCV, source: OpenCV): Point[] | null {
  let gray: OpenCV | undefined;
  let blurred: OpenCV | undefined;
  let kernel: OpenCV | undefined;
  let bestCorners: Point[] | null = null;
  let bestScore = 0;
  const temporary: OpenCV[] = [];

  try {
    gray = new cv.Mat();
    blurred = new cv.Mat();
    kernel = cv.Mat.ones(3, 3, cv.CV_8U);
    cv.cvtColor(source, gray, cv.COLOR_RGBA2GRAY);
    cv.GaussianBlur(gray, blurred, new cv.Size(5, 5), 0);

    const strategies: Array<(output: OpenCV) => void> = [
      (output) => cv.Canny(blurred, output, 40, 120),
      (output) => cv.Canny(blurred, output, 70, 180),
      (output) => {
        // OpenCV exige un bloc impair supérieur à 1 et inférieur aux dimensions.
        const limit = Math.max(3, Math.min(31, Math.min(source.cols, source.rows) - (Math.min(source.cols, source.rows) % 2 === 0 ? 1 : 0)));
        const blockSize = Math.max(3, limit % 2 === 0 ? limit - 1 : limit);
        cv.adaptiveThreshold(
          blurred, output, 255, cv.ADAPTIVE_THRESH_GAUSSIAN_C,
          cv.THRESH_BINARY, blockSize, 10
        );
      }
    ];

    for (const makeMask of strategies) {
      const mask = new cv.Mat();
      const closed = new cv.Mat();
      const contours = new cv.MatVector();
      const hierarchy = new cv.Mat();
      temporary.push(mask, closed, contours, hierarchy);

      makeMask(mask);
      cv.morphologyEx(mask, closed, cv.MORPH_CLOSE, kernel);
      cv.findContours(closed, contours, hierarchy, cv.RETR_LIST, cv.CHAIN_APPROX_SIMPLE);

      for (let i = 0; i < contours.size(); i += 1) {
        const contour = contours.get(i);
        const approx = new cv.Mat();
        try {
          const area = Math.abs(cv.contourArea(contour));
          const imageArea = source.cols * source.rows;
          if (area < imageArea * 0.07 || area > imageArea * 0.90) continue;

          const perimeter = cv.arcLength(contour, true);
          cv.approxPolyDP(contour, approx, 0.018 * perimeter, true);
          if (approx.rows !== 4 || !cv.isContourConvex(approx)) continue;

          const points = Array.from({ length: 4 }, (_, index) => ({
            x: approx.intAt(index, 0),
            y: approx.intAt(index, 1)
          }));
          const ordered = orderCorners(points);
          const unique = new Set(ordered.map((point) => `${point.x},${point.y}`));
          if (unique.size !== 4 || !plausibleQuad(ordered, source.cols, source.rows)) continue;

          // Favorise une grande feuille bien formée sans laisser un contour
          // presque plein écran gagner automatiquement.
          const fill = quadArea(ordered) / imageArea;
          const xs = ordered.map((point) => point.x);
          const ys = ordered.map((point) => point.y);
          const margin = Math.min(...xs, ...ys, source.cols - 1 - Math.max(...xs), source.rows - 1 - Math.max(...ys));
          // Une page qui touche les quatre bords est probablement le cadre photo,
          // pas un document détecté avec certitude.
          if (margin < Math.min(source.cols, source.rows) * 0.008) continue;
          const top = Math.hypot(ordered[1].x - ordered[0].x, ordered[1].y - ordered[0].y);
          const right = Math.hypot(ordered[2].x - ordered[1].x, ordered[2].y - ordered[1].y);
          const bottom = Math.hypot(ordered[3].x - ordered[2].x, ordered[3].y - ordered[2].y);
          const left = Math.hypot(ordered[0].x - ordered[3].x, ordered[0].y - ordered[3].y);
          const ratio = Math.max((top + bottom) / 2, (left + right) / 2) /
                        Math.max(1, Math.min((top + bottom) / 2, (left + right) / 2));
          if (ratio > 3.2) continue;
          const balance = Math.min(top, bottom) / Math.max(top, bottom) *
                          Math.min(left, right) / Math.max(left, right);
          const sizeScore = Math.min(fill, 0.78);
          const score = sizeScore * (0.65 + 0.35 * balance) * Math.min(1, margin / (Math.min(source.cols, source.rows) * 0.06));
          if (score > bestScore) {
            bestScore = score;
            bestCorners = ordered;
          }
        } finally {
          approx.delete();
          contour.delete();
        }
      }
    }
    return bestCorners;
  } finally {
    temporary.forEach((mat) => { try { mat.delete(); } catch { /* déjà libéré */ } });
    [gray, blurred, kernel].forEach((mat) => { if (mat) { try { mat.delete(); } catch { /* déjà libéré */ } } });
  }
}

/**
 * Stratégie 2 : le fond est supposé visible sur le pourtour de la photo.
 * On mesure l'écart de couleur de chaque pixel avec la couleur médiane de la
 * bordure, puis on retient l'enveloppe du papier. Fonctionne même quand le
 * contraste de luminosité est faible (papier clair sur table grise).
 */
function detectByBackground(cv: OpenCV, source: OpenCV): Point[] | null {
  const owned: OpenCV[] = [];
  const keep = <T,>(mat: T): T => { owned.push(mat); return mat; };
  try {
    const rgb = keep(new cv.Mat());
    const blur = keep(new cv.Mat());
    const lab = keep(new cv.Mat());
    cv.cvtColor(source, rgb, cv.COLOR_RGBA2RGB);
    cv.GaussianBlur(rgb, blur, new cv.Size(5, 5), 0);
    cv.cvtColor(blur, lab, cv.COLOR_RGB2Lab);

    const w = lab.cols;
    const h = lab.rows;
    const data = lab.data as Uint8Array;
    const strip = Math.max(3, Math.round(0.02 * Math.min(w, h)));
    const samples: number[][] = [[], [], []];
    const take = (x: number, y: number) => {
      const index = (y * w + x) * 3;
      samples[0].push(data[index]);
      samples[1].push(data[index + 1]);
      samples[2].push(data[index + 2]);
    };
    for (let y = 0; y < h; y += 1) {
      const edgeRow = y < strip || y >= h - strip;
      for (let x = 0; x < w; x += 1) {
        if (edgeRow || x < strip || x >= w - strip) take(x, y);
      }
    }
    const background = samples.map((values) => {
      const sorted = Uint8Array.from(values).sort();
      return sorted[Math.floor(sorted.length / 2)];
    });

    const distance = keep(new cv.Mat(h, w, cv.CV_8UC1));
    const out = distance.data as Uint8Array;
    for (let i = 0, p = 0; i < w * h; i += 1, p += 3) {
      const dl = (data[p] - background[0]) * 0.7;
      const da = data[p + 1] - background[1];
      const db = (data[p + 2] - background[2]) * 1.22;
      out[i] = Math.min(255, Math.sqrt(dl * dl + da * da + db * db) * 4);
    }

    const mask = keep(new cv.Mat());
    cv.threshold(distance, mask, 0, 255, cv.THRESH_BINARY + cv.THRESH_OTSU);
    const small = Math.min(w, h);
    const closeKernel = keep(cv.getStructuringElement(cv.MORPH_RECT, new cv.Size(odd(0.045 * small), odd(0.045 * small))));
    const openKernel = keep(cv.getStructuringElement(cv.MORPH_RECT, new cv.Size(odd(0.018 * small), odd(0.018 * small))));
    const cleaned = keep(new cv.Mat());
    cv.morphologyEx(mask, cleaned, cv.MORPH_CLOSE, closeKernel);
    cv.morphologyEx(cleaned, cleaned, cv.MORPH_OPEN, openKernel);

    const contours = keep(new cv.MatVector());
    const hierarchy = keep(new cv.Mat());
    cv.findContours(cleaned, contours, hierarchy, cv.RETR_EXTERNAL, cv.CHAIN_APPROX_SIMPLE);

    // Important : ne plus réunir tous les objets détectés dans une seule
    // enveloppe convexe. Cette ancienne opération pouvait relier la feuille
    // à une ombre, un autre objet ou au bord de la table.
    let best: Point[] | null = null;
    let bestScore = 0;
    for (let i = 0; i < contours.size(); i += 1) {
      const contour = contours.get(i);
      const hull = new cv.Mat();
      try {
        const contourArea = Math.abs(cv.contourArea(contour));
        if (contourArea < 0.035 * w * h || contourArea > 0.985 * w * h) continue;
        cv.convexHull(contour, hull, false, true);
        const perimeter = cv.arcLength(hull, true);
        let candidate: Point[] | null = null;
        for (let eps = 0.008; eps <= 0.075 && !candidate; eps += 0.004) {
          const approx = new cv.Mat();
          try {
            cv.approxPolyDP(hull, approx, eps * perimeter, true);
            if (approx.rows === 4 && cv.isContourConvex(approx)) {
              candidate = Array.from({ length: 4 }, (_, index) => ({
                x: approx.intAt(index, 0),
                y: approx.intAt(index, 1)
              }));
            }
          } finally {
            approx.delete();
          }
        }
        if (!candidate) {
          const rect = cv.minAreaRect(hull);
          candidate = (cv.RotatedRect.points(rect) as Point[]).map((point) => ({ x: point.x, y: point.y }));
        }

        const ordered = orderCorners(candidate);
        if (!plausibleQuad(ordered, w, h)) continue;
        const fraction = quadArea(ordered) / (w * h);
        if (fraction < 0.08 || fraction > 0.94) continue;
        const sideLengths = ordered.map((point, index) => {
          const next = ordered[(index + 1) % 4];
          return Math.hypot(next.x - point.x, next.y - point.y);
        });
        const oppositeBalance =
          Math.min(sideLengths[0], sideLengths[2]) / Math.max(sideLengths[0], sideLengths[2]) *
          Math.min(sideLengths[1], sideLengths[3]) / Math.max(sideLengths[1], sideLengths[3]);
        const xs = ordered.map((point) => point.x);
        const ys = ordered.map((point) => point.y);
        const margin = Math.min(...xs, ...ys, w - 1 - Math.max(...xs), h - 1 - Math.max(...ys));
        const framePenalty = margin < 0.006 * Math.min(w, h) ? 0.45 : 1;
        const score = Math.sqrt(fraction) * (0.55 + 0.45 * oppositeBalance) * framePenalty;
        if (score > bestScore) {
          bestScore = score;
          best = ordered;
        }
      } finally {
        hull.delete();
        contour.delete();
      }
    }
    return best;
  } finally {
    owned.forEach((mat) => { try { mat.delete(); } catch { /* déjà libéré */ } });
  }
}

/** Cadre par défaut : l'image presque entière, que l'utilisateur ajustera. */
function defaultCorners(width: number, height: number): Point[] {
  const mx = width * 0.06;
  const my = height * 0.06;
  return [
    { x: mx, y: my },
    { x: width - mx, y: my },
    { x: width - mx, y: height - my },
    { x: mx, y: height - my }
  ];
}

/**
 * Cherche les quatre coins du document. `source` est une image RGBA ; la
 * recherche se fait sur une copie réduite (1000 px) puis les coins sont
 * ramenés à la résolution de `source`.
 */
export function findCorners(cv: OpenCV, source: OpenCV): { corners: Point[]; method: Method } {
  const scale = Math.min(1, 1000 / Math.max(source.cols, source.rows));
  let small: OpenCV = source;
  let owned = false;
  if (scale < 1) {
    small = new cv.Mat();
    owned = true;
    cv.resize(
      source, small,
      new cv.Size(Math.round(source.cols * scale), Math.round(source.rows * scale)),
      0, 0, cv.INTER_AREA
    );
  }
  try {
    const back = (points: Point[]) => points.map((p) => ({ x: p.x / scale, y: p.y / scale }));
    const edges = detectByEdges(cv, small);
    const background = detectByBackground(cv, small);
    // Compare candidates instead of giving unconditional priority to the first
    // detector. The background detector is accepted only after geometry checks.
    if (edges && background) {
      const edgeArea = quadArea(edges) / (small.cols * small.rows);
      const bgArea = quadArea(background) / (small.cols * small.rows);
      const edgeNearFrame = edges.some((p) => p.x < small.cols * 0.008 || p.y < small.rows * 0.008 ||
        p.x > small.cols * 0.992 || p.y > small.rows * 0.992);
      const preferBackground =
        (edgeNearFrame && bgArea > 0.08 && bgArea < 0.88) ||
        (bgArea > edgeArea * 1.18 && bgArea < 0.88);
      const selected = preferBackground ? background : edges;

      // Deux détecteurs qui désignent des quadrilatères très différents sont
      // un signal de faible confiance : on conserve le meilleur candidat comme
      // point de départ, mais on interdit le redressement automatique.
      const diagonal = Math.hypot(small.cols, small.rows);
      const disagreement = Math.sqrt(
        selected.reduce((sum, point, index) => {
          const other = (preferBackground ? edges : background)[index];
          return sum + Math.pow(point.x - other.x, 2) + Math.pow(point.y - other.y, 2);
        }, 0) / 4
      ) / diagonal;
      if (disagreement > 0.075) {
        return { corners: back(selected), method: "review" };
      }
      return { corners: back(selected), method: preferBackground ? "background" : "edges" };
    }
    if (edges) return { corners: back(edges), method: "edges" };
    if (background) return { corners: back(background), method: "background" };
    return { corners: defaultCorners(source.cols, source.rows), method: "default" };
  } finally {
    if (owned) small.delete();
  }
}
