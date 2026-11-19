import { useEffect, useRef, useState } from "react";

type Point = { x: number; y: number };
type OpenCV = any;

function orderCorners(points: Point[]): Point[] {
  const sums = points.map((p) => p.x + p.y);
  const diffs = points.map((p) => p.y - p.x);
  return [
    points[sums.indexOf(Math.min(...sums))],
    points[diffs.indexOf(Math.min(...diffs))],
    points[sums.indexOf(Math.max(...sums))],
    points[diffs.indexOf(Math.max(...diffs))]
  ];
}

/**
 * Try several deterministic edge strategies. Keep the largest plausible
 * convex quadrilateral; never alter the source pixels during detection.
 */
function detectDocumentCorners(cv: OpenCV, source: OpenCV): Point[] | null {
  let gray: OpenCV | undefined;
  let blurred: OpenCV | undefined;
  let kernel: OpenCV | undefined;
  let bestCorners: Point[] | null = null;
  let bestArea = 0;
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
      (output) => cv.adaptiveThreshold(
        blurred, output, 255, cv.ADAPTIVE_THRESH_GAUSSIAN_C,
        cv.THRESH_BINARY, 31, 10
      )
    ];

    for (const makeMask of strategies) {
      const mask = new cv.Mat();
      const closed = new cv.Mat();
      const contours = new cv.MatVector();
      const hierarchy = new cv.Mat();
      temporary.push(mask, closed, contours, hierarchy);

      makeMask(mask);
      if (mask.type() === cv.CV_8UC1) {
        cv.morphologyEx(mask, closed, cv.MORPH_CLOSE, kernel);
      } else {
        cv.morphologyEx(mask, closed, cv.MORPH_CLOSE, kernel);
      }
      cv.findContours(closed, contours, hierarchy, cv.RETR_LIST, cv.CHAIN_APPROX_SIMPLE);

      for (let i = 0; i < contours.size(); i += 1) {
        const contour = contours.get(i);
        const approx = new cv.Mat();
        try {
          const area = Math.abs(cv.contourArea(contour));
          const imageArea = source.cols * source.rows;
          if (area < imageArea * 0.06 || area > imageArea * 0.98) continue;

          const perimeter = cv.arcLength(contour, true);
          cv.approxPolyDP(contour, approx, 0.018 * perimeter, true);
          if (approx.rows !== 4 || !cv.isContourConvex(approx)) continue;

          const points = Array.from({ length: 4 }, (_, index) => ({
            x: approx.intAt(index, 0),
            y: approx.intAt(index, 1)
          }));
          const ordered = orderCorners(points);
          const unique = new Set(ordered.map((point) => `${point.x},${point.y}`));
          if (unique.size !== 4) continue;

          // Reject tiny or degenerate quadrilaterals.
          const top = Math.hypot(ordered[1].x - ordered[0].x, ordered[1].y - ordered[0].y);
          const bottom = Math.hypot(ordered[2].x - ordered[3].x, ordered[2].y - ordered[3].y);
          const left = Math.hypot(ordered[3].x - ordered[0].x, ordered[3].y - ordered[0].y);
          const right = Math.hypot(ordered[2].x - ordered[1].x, ordered[2].y - ordered[1].y);
          if (Math.min(top, bottom, left, right) < Math.min(source.cols, source.rows) * 0.12) continue;

          if (area > bestArea) {
            bestArea = area;
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
    temporary.forEach((mat) => { try { mat.delete(); } catch { /* already released */ } });
    [gray, blurred, kernel].forEach((mat) => { if (mat) { try { mat.delete(); } catch { /* already released */ } } });
  }
}

export default function App() {
  const imageRef = useRef<HTMLImageElement>(null);
  const outputRef = useRef<HTMLCanvasElement>(null);
  const feedbackRef = useRef<HTMLParagraphElement>(null);
  const [sourceUrl, setSourceUrl] = useState("");
  const [fileName, setFileName] = useState("");
  const [opencvReady, setOpencvReady] = useState(false);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("Importez une photo pour commencer.");
  const [hasResult, setHasResult] = useState(false);

  useEffect(() => {
    const check = () => { if (window.cv?.Mat) setOpencvReady(true); };
    window.addEventListener("opencv-ready", check);
    check();
    return () => window.removeEventListener("opencv-ready", check);
  }, []);

  useEffect(() => {
    return () => { if (sourceUrl) URL.revokeObjectURL(sourceUrl); };
  }, [sourceUrl]);

  function importImage(file?: File) {
    if (!file) return;
    if (!file.type.startsWith("image/")) {
      setMessage("Choisissez un fichier image pris en charge par le navigateur.");
      return;
    }
    const nextUrl = URL.createObjectURL(file);
    setSourceUrl(nextUrl);
    setFileName(file.name);
    setHasResult(false);
    setMessage("Image importée. Lancez la détection du document.");
  }

  function processDocument() {
    const cv = window.cv;
    const image = imageRef.current;
    const canvas = outputRef.current;
    if (!cv?.Mat || !image || !canvas || !image.complete || !image.naturalWidth) {
      setMessage("Le moteur de traitement ou l’image n’est pas encore prêt.");
      return;
    }

    setBusy(true);
    setHasResult(false);
    setMessage("Analyse multi-seuils des contours et correction de la perspective…");

    window.setTimeout(() => {
      let source: OpenCV | undefined;
      let transform: OpenCV | undefined;
      let warped: OpenCV | undefined;
      let sourcePoints: OpenCV | undefined;
      let destinationPoints: OpenCV | undefined;
      try {
        source = cv.imread(image);
        const corners = detectDocumentCorners(cv, source);
        if (!corners) {
          // Aucun quadrilatère fiable : image probablement déjà cadrée (capture d’écran,
          // scan plat…). On l’affiche telle quelle pour que le bouton ait toujours un effet visible.
          cv.imshow(canvas, source);
          setHasResult(true);
          setMessage("Aucun bord de document détecté : l’image semble déjà cadrée, elle est reprise telle quelle. Pour une correction de perspective, utilisez une photo du document posé sur un fond contrasté, avec les quatre bords visibles.");
          return;
        }

        const [topLeft, topRight, bottomRight, bottomLeft] = corners;
        const width = Math.max(
          Math.hypot(bottomRight.x - bottomLeft.x, bottomRight.y - bottomLeft.y),
          Math.hypot(topRight.x - topLeft.x, topRight.y - topLeft.y)
        );
        const height = Math.max(
          Math.hypot(topRight.x - bottomRight.x, topRight.y - bottomRight.y),
          Math.hypot(topLeft.x - bottomLeft.x, topLeft.y - bottomLeft.y)
        );
        if (!Number.isFinite(width) || !Number.isFinite(height) || width < 2 || height < 2) {
          setMessage("Le contour détecté est trop déformé pour être corrigé correctement.");
          return;
        }

        sourcePoints = cv.matFromArray(4, 1, cv.CV_32FC2, [
          topLeft.x, topLeft.y, topRight.x, topRight.y,
          bottomRight.x, bottomRight.y, bottomLeft.x, bottomLeft.y
        ]);
        destinationPoints = cv.matFromArray(4, 1, cv.CV_32FC2, [
          0, 0, width - 1, 0, width - 1, height - 1, 0, height - 1
        ]);
        transform = cv.getPerspectiveTransform(sourcePoints, destinationPoints);
        warped = new cv.Mat();
        cv.warpPerspective(
          source, warped, transform,
          new cv.Size(Math.round(width), Math.round(height)),
          cv.INTER_CUBIC, cv.BORDER_REPLICATE
        );
        cv.imshow(canvas, warped);
        setHasResult(true);
        setMessage("Perspective corrigée. Vérifiez les quatre bords et les petits caractères avant d’utiliser le document.");
      } catch (error) {
        console.error(error);
        setMessage("Une erreur est survenue pendant le traitement. Essayez une autre image.");
      } finally {
        [source, transform, warped, sourcePoints, destinationPoints].forEach((mat) => {
          if (mat) { try { mat.delete(); } catch { /* already released */ } }
        });
        setBusy(false);
        window.setTimeout(() => feedbackRef.current?.scrollIntoView({ behavior: "smooth", block: "center" }), 60);
      }
    }, 30);
  }

  function downloadResult() {
    const canvas = outputRef.current;
    if (!canvas || !hasResult) return;
    const link = document.createElement("a");
    link.download = `e-scan-${fileName.replace(/\.[^.]+$/, "") || "document"}.png`;
    link.href = canvas.toDataURL("image/png");
    link.click();
  }

  return (
    <main className="app-shell">
      <header className="topbar">
        <a className="brand" href="#"><span className="brand-mark">E</span><span>E-SCAN</span></a>
        <span className="top-note">Prototype de numérisation</span>
      </header>
      <section className="hero">
        <div className="eyebrow"><span className="pulse" /> TRAITEMENT LOCAL · SANS IA</div>
        <h1>Vos documents,<br /><em>en toute netteté.</em></h1>
        <p>Importez une photo. E-Scan analyse plusieurs méthodes de détection et corrige la perspective directement dans votre navigateur.</p>
        <div className="engine-status"><span className={opencvReady ? "status-dot ready" : "status-dot"} />{opencvReady ? "Moteur OpenCV prêt" : "Chargement du moteur de traitement…"}</div>
      </section>
      <section className="workspace">
        <div className="workspace-head">
          <div><span className="step">01</span><h2>Importer un document</h2></div>
          <span className="privacy"><span>⌑</span> Image traitée dans le navigateur</span>
        </div>
        <label className="upload-zone">
          <input type="file" accept="image/*" onChange={(event) => importImage(event.target.files?.[0])} />
          <span className="upload-icon">＋</span>
          <strong>{sourceUrl ? "Choisir une autre image" : "Sélectionner une image"}</strong>
          <span>JPG, PNG et formats image compatibles · depuis votre appareil</span>
        </label>
        {sourceUrl && <>
          <div className="file-line"><span className="file-symbol">▧</span><span>{fileName}</span><button onClick={() => { setSourceUrl(""); setFileName(""); setHasResult(false); setMessage("Importez une photo pour commencer."); }}>Retirer</button></div>
          <div className="compare-grid">
            <article className="preview-card">
              <div className="preview-heading"><span>ORIGINAL</span><small>Image source</small></div>
              <div className="image-stage"><img ref={imageRef} src={sourceUrl} alt="Document original importé" onLoad={() => setMessage("Image prête. Lancez la détection du document.")} /></div>
            </article>
            <article className="preview-card">
              <div className="preview-heading"><span>RÉSULTAT</span><small>{hasResult ? "Perspective corrigée" : "En attente du traitement"}</small></div>
              <div className="image-stage result-stage">
                <canvas ref={outputRef} className={hasResult ? "result-canvas" : "hidden-canvas"} aria-label="Document corrigé" />
                {!hasResult && <div className="empty-result"><span>✧</span><p>Votre document corrigé<br />apparaîtra ici</p></div>}
              </div>
            </article>
          </div>
          <p className="feedback" role="status" ref={feedbackRef}>{message}</p>
          <div className="actions">
            <button className="primary-button" onClick={processDocument} disabled={!opencvReady || busy}>{busy ? "Traitement…" : "⌁  Détecter et corriger"}</button>
            <button className="secondary-button" onClick={downloadResult} disabled={!hasResult}>Télécharger le résultat</button>
          </div>
        </>}
        {!sourceUrl && <p className="feedback" role="status">{message}</p>}
      </section>
      <footer><span>E-SCAN · EXCELLENT SCANNER</span><span>Le document original n’est jamais écrasé.</span></footer>
    </main>
  );
}
