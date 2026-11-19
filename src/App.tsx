import { useEffect, useRef, useState } from "react";
import type { PointerEvent as ReactPointerEvent } from "react";
import { findCorners } from "./detect";
import type { Point } from "./detect";

type OpenCV = any;

const MAX_SIDE = 4096;

/** Lit l’image à sa résolution réelle (cv.imread(img) utiliserait la taille affichée à l’écran). */
function readFullResolution(cv: OpenCV, image: HTMLImageElement): OpenCV {
  const ratio = Math.min(1, MAX_SIDE / Math.max(image.naturalWidth, image.naturalHeight));
  const canvas = document.createElement("canvas");
  canvas.width = Math.max(1, Math.round(image.naturalWidth * ratio));
  canvas.height = Math.max(1, Math.round(image.naturalHeight * ratio));
  const context = canvas.getContext("2d");
  if (!context) throw new Error("Canvas 2D indisponible");
  context.drawImage(image, 0, 0, canvas.width, canvas.height);
  return cv.imread(canvas);
}

/** Redresse le quadrilatère `corners` (coordonnées en pixels de `source`) vers `canvas`. */
function warpToCanvas(cv: OpenCV, source: OpenCV, corners: Point[], canvas: HTMLCanvasElement): boolean {
  const [topLeft, topRight, bottomRight, bottomLeft] = corners;
  const width = Math.max(
    Math.hypot(bottomRight.x - bottomLeft.x, bottomRight.y - bottomLeft.y),
    Math.hypot(topRight.x - topLeft.x, topRight.y - topLeft.y)
  );
  const height = Math.max(
    Math.hypot(topRight.x - bottomRight.x, topRight.y - bottomRight.y),
    Math.hypot(topLeft.x - bottomLeft.x, topLeft.y - bottomLeft.y)
  );
  if (!Number.isFinite(width) || !Number.isFinite(height) || width < 8 || height < 8) return false;

  let sourcePoints: OpenCV | undefined;
  let destinationPoints: OpenCV | undefined;
  let transform: OpenCV | undefined;
  let warped: OpenCV | undefined;
  try {
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
    return true;
  } finally {
    [sourcePoints, destinationPoints, transform, warped].forEach((mat) => {
      if (mat) { try { mat.delete(); } catch { /* déjà libéré */ } }
    });
  }
}

export default function App() {
  const imageRef = useRef<HTMLImageElement>(null);
  const outputRef = useRef<HTMLCanvasElement>(null);
  const feedbackRef = useRef<HTMLParagraphElement>(null);
  const overlayRef = useRef<SVGSVGElement>(null);
  const dragRef = useRef<number | null>(null);
  const [sourceUrl, setSourceUrl] = useState("");
  const [fileName, setFileName] = useState("");
  const [natural, setNatural] = useState({ width: 0, height: 0 });
  // Coins du document, en fractions (0 à 1) de la largeur et de la hauteur de l’image.
  const [corners, setCorners] = useState<Point[] | null>(null);
  const [opencvReady, setOpencvReady] = useState(false);
  const [opencvError, setOpencvError] = useState(false);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("Importez une photo pour commencer.");
  const [hasResult, setHasResult] = useState(false);

  useEffect(() => {
    let attempts = 0;
    const check = () => {
      // OpenCV.js peut terminer son initialisation après le chargement du
      // script : on vérifie le vrai moteur, pas seulement l'événement réseau.
      if (window.cv?.Mat) {
        setOpencvReady(true);
        setOpencvError(false);
        window.clearInterval(timer);
        return;
      }
      attempts += 1;
      if (attempts >= 200) {
        window.clearInterval(timer);
        setOpencvError(true);
      }
    };
    const onLoadError = () => {
      setOpencvError(true);
      window.clearInterval(timer);
    };
    window.addEventListener("opencv-load-error", onLoadError);
    window.addEventListener("opencv-ready", check);
    const timer = window.setInterval(check, 150);
    check();
    return () => {
      window.clearInterval(timer);
      window.removeEventListener("opencv-ready", check);
      window.removeEventListener("opencv-load-error", onLoadError);
    };
  }, []);

  useEffect(() => {
    return () => { if (sourceUrl) URL.revokeObjectURL(sourceUrl); };
  }, [sourceUrl]);

  function resetImage() {
    setSourceUrl("");
    setFileName("");
    setCorners(null);
    setHasResult(false);
    setMessage("Importez une photo pour commencer.");
  }

  function importImage(file?: File) {
    if (!file) return;
    if (!file.type.startsWith("image/")) {
      setMessage("Choisissez un fichier image pris en charge par le navigateur.");
      return;
    }
    setSourceUrl(URL.createObjectURL(file));
    setFileName(file.name);
    setCorners(null);
    setHasResult(false);
    setMessage("Image importée. Lancez la détection du document.");
  }

  function announce(text: string) {
    setMessage(text);
    window.setTimeout(() => feedbackRef.current?.scrollIntoView({ behavior: "smooth", block: "center" }), 60);
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
    setMessage(corners ? "Redressement avec vos coins…" : "Recherche des bords du document…");

    window.setTimeout(() => {
      let source: OpenCV | undefined;
      try {
        source = readFullResolution(cv, image);
        let fractions = corners;
        let notice = "";
        let autoWarp = true;

        if (!fractions) {
          const found = findCorners(cv, source);
          fractions = found.corners.map((point) => ({ x: point.x / source.cols, y: point.y / source.rows }));
          setCorners(fractions);
          if (found.method === "default") {
            autoWarp = false;
            notice = "Les bords n’ont pas pu être détectés automatiquement. Placez les 4 points verts sur les coins du document (sur l’image Original), puis appuyez sur « Appliquer les coins ».";
          } else {
            notice = "Bords détectés. Vérifiez les 4 points verts sur l’image Original ; déplacez-les si besoin puis appuyez sur « Appliquer les coins ».";
          }
        } else {
          notice = "Perspective corrigée avec vos coins. Téléchargez le résultat ou ajustez encore les points.";
        }

        if (!autoWarp) {
          setHasResult(false);
          announce(notice);
          return;
        }

        const pixels = fractions.map((fraction) => ({ x: fraction.x * source.cols, y: fraction.y * source.rows }));
        if (!warpToCanvas(cv, source, pixels, canvas)) {
          setHasResult(false);
          announce("Les coins sont trop rapprochés ou trop déformés. Écartez-les autour du document puis réessayez.");
          return;
        }
        setHasResult(true);
        announce(notice);
      } catch (error) {
        console.error(error);
        announce("Une erreur est survenue pendant le traitement. Essayez une autre image.");
      } finally {
        if (source) { try { source.delete(); } catch { /* déjà libéré */ } }
        setBusy(false);
      }
    }, 30);
  }

  function downloadResult() {
    const canvas = outputRef.current;
    if (!canvas || !hasResult) return;
    canvas.toBlob((blob) => {
      if (!blob) { setMessage("Impossible de générer le fichier. Essayez une image plus petite."); return; }
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.download = `e-scan-${fileName.replace(/\.[^.]+$/, "") || "document"}.png`;
      link.href = url;
      link.click();
      window.setTimeout(() => URL.revokeObjectURL(url), 4000);
    }, "image/png");
  }

  function startDrag(index: number, event: ReactPointerEvent<SVGCircleElement>) {
    event.preventDefault();
    event.currentTarget.setPointerCapture(event.pointerId);
    dragRef.current = index;
  }

  function moveDrag(event: ReactPointerEvent<SVGSVGElement>) {
    const index = dragRef.current;
    const svg = overlayRef.current;
    if (index === null || !svg || !natural.width) return;
    const matrix = svg.getScreenCTM();
    if (!matrix) return;
    const point = svg.createSVGPoint();
    point.x = event.clientX;
    point.y = event.clientY;
    const local = point.matrixTransform(matrix.inverse());
    const x = Math.min(1, Math.max(0, local.x / natural.width));
    const y = Math.min(1, Math.max(0, local.y / natural.height));
    setCorners((current) => current && current.map((corner, i) => (i === index ? { x, y } : corner)));
    setMessage("Coins modifiés. Appuyez sur « Appliquer les coins » pour redresser.");
  }

  function endDrag() {
    dragRef.current = null;
  }

  const handleRadius = Math.min(natural.width, natural.height) * 0.04;
  const polygon = corners && natural.width
    ? corners.map((corner) => `${corner.x * natural.width},${corner.y * natural.height}`).join(" ")
    : "";

  return (
    <main className="app-shell">
      <header className="topbar">
        <a className="brand" href="#"><span className="brand-mark">E</span><span>E-SCAN</span></a>
        <span className="top-note">Prototype de numérisation</span>
      </header>
      <section className="hero">
        <div className="eyebrow"><span className="pulse" /> TRAITEMENT LOCAL · SANS IA</div>
        <h1>Vos documents,<br /><em>en toute netteté.</em></h1>
        <p>Importez une photo. E-Scan cherche les bords du document, vous laisse ajuster les 4 coins, puis corrige la perspective directement dans votre navigateur.</p>
        <div className="engine-status"><span className={opencvReady ? "status-dot ready" : "status-dot"} />{opencvReady ? "Moteur OpenCV prêt" : opencvError ? "Moteur indisponible — rechargez la page" : "Chargement du moteur de traitement…"}</div>
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
          <div className="file-line"><span className="file-symbol">▧</span><span>{fileName}</span><button onClick={resetImage}>Retirer</button></div>
          <div className="compare-grid">
            <article className="preview-card">
              <div className="preview-heading"><span>ORIGINAL</span><small>{corners ? "Déplacez les points verts" : "Image source"}</small></div>
              <div className="image-stage">
                <div style={{ position: "relative", width: "100%", height: "100%" }}>
                  <img
                    ref={imageRef}
                    src={sourceUrl}
                    alt="Document original importé"
                    style={{ position: "absolute", inset: 0, width: "100%", height: "100%", objectFit: "contain" }}
                    onLoad={(event) => {
                      setNatural({ width: event.currentTarget.naturalWidth, height: event.currentTarget.naturalHeight });
                      setMessage("Image prête. Lancez la détection du document.");
                    }}
                  />
                  {corners && natural.width > 0 && (
                    <svg
                      ref={overlayRef}
                      viewBox={`0 0 ${natural.width} ${natural.height}`}
                      style={{ position: "absolute", inset: 0, width: "100%", height: "100%", touchAction: "none" }}
                      onPointerMove={moveDrag}
                      onPointerUp={endDrag}
                      onPointerCancel={endDrag}
                    >
                      <polygon points={polygon} fill="#b9f36b22" stroke="#b9f36b" strokeWidth={2} vectorEffect="non-scaling-stroke" />
                      {corners.map((corner, index) => (
                        <g key={index}>
                          <circle cx={corner.x * natural.width} cy={corner.y * natural.height} r={handleRadius * 1.8} fill="transparent" style={{ cursor: "grab" }} onPointerDown={(event) => startDrag(index, event)} />
                          <circle cx={corner.x * natural.width} cy={corner.y * natural.height} r={handleRadius} fill="#b9f36b" stroke="#142116" strokeWidth={2} vectorEffect="non-scaling-stroke" pointerEvents="none" />
                        </g>
                      ))}
                    </svg>
                  )}
                </div>
              </div>
            </article>
            <article className="preview-card">
              <div className="preview-heading"><span>RÉSULTAT</span><small>{hasResult ? "Perspective corrigée" : "En attente du traitement"}</small></div>
              <div className="image-stage result-stage">
                <canvas ref={outputRef} className={hasResult ? "result-canvas" : "hidden-canvas"} aria-label="Document corrigé" />
                {!hasResult && <div className="empty-result"><span>✧</span><p>Votre document corrigé<br />apparaîtra ici</p></div>}
              </div>
            </article>
          </div>
          <p className="feedback" role="status" ref={feedbackRef}>{opencvError && !opencvReady ? "Le moteur de numérisation n’a pas pu se charger. Vérifiez la connexion puis rechargez la page." : message}</p>
          <div className="actions">
            <button className="primary-button" onClick={processDocument} disabled={!opencvReady || busy}>{busy ? "Traitement…" : corners ? "✓  Appliquer les coins" : "⌁  Détecter et corriger"}</button>
            {corners && <button className="secondary-button" onClick={() => { setCorners(null); setHasResult(false); setMessage("Coins réinitialisés. Relancez la détection."); }} disabled={busy}>Redétecter</button>}
            <button className="secondary-button" onClick={downloadResult} disabled={!hasResult}>Télécharger le résultat</button>
          </div>
        </>}
        {!sourceUrl && <p className="feedback" role="status">{message}</p>}
      </section>
      <footer><span>E-SCAN · EXCELLENT SCANNER</span><span>Le document original n’est jamais écrasé.</span></footer>
    </main>
  );
}
