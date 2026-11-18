import { useEffect, useRef, useState } from "react";

type Point = { x: number; y: number };

function orderCorners(points: Point[]): Point[] {
  const sum = points.map((p) => p.x + p.y);
  const diff = points.map((p) => p.y - p.x);
  return [
    points[sum.indexOf(Math.min(...sum))],
    points[diff.indexOf(Math.min(...diff))],
    points[sum.indexOf(Math.max(...sum))],
    points[diff.indexOf(Math.max(...diff))]
  ];
}

export default function App() {
  const imageRef = useRef<HTMLImageElement>(null);
  const outputRef = useRef<HTMLCanvasElement>(null);
  const [sourceUrl, setSourceUrl] = useState("");
  const [fileName, setFileName] = useState("");
  const [opencvReady, setOpencvReady] = useState(false);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("Importez une photo pour commencer.");
  const [hasResult, setHasResult] = useState(false);

  useEffect(() => {
    const check = () => {
      if (window.cv?.Mat) setOpencvReady(true);
    };
    window.addEventListener("opencv-ready", check);
    check();
    return () => window.removeEventListener("opencv-ready", check);
  }, []);

  useEffect(() => {
    return () => {
      if (sourceUrl) URL.revokeObjectURL(sourceUrl);
    };
  }, [sourceUrl]);

  function importImage(file?: File) {
    if (!file) return;
    if (!file.type.startsWith("image/")) {
      setMessage("Choisissez un fichier image (JPG, PNG ou autre format pris en charge par le navigateur).");
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
    if (!cv?.Mat || !image || !canvas || !image.complete) {
      setMessage("Le moteur de traitement ou l’image n’est pas encore prêt.");
      return;
    }

    setBusy(true);
    setMessage("Analyse des contours et correction de la perspective…");

    // Laisser le navigateur afficher l'état de traitement avant le calcul.
    window.setTimeout(() => {
      let src: any, gray: any, blurred: any, edges: any, contours: any, hierarchy: any;
      let kernel: any, best: any, transform: any, warped: any, srcPoints: any, dstPoints: any;
      try {
        src = cv.imread(image);
        gray = new cv.Mat();
        blurred = new cv.Mat();
        edges = new cv.Mat();
        contours = new cv.MatVector();
        hierarchy = new cv.Mat();
        kernel = cv.Mat.ones(5, 5, cv.CV_8U);

        cv.cvtColor(src, gray, cv.COLOR_RGBA2GRAY);
        cv.GaussianBlur(gray, blurred, new cv.Size(5, 5), 0);
        cv.Canny(blurred, edges, 60, 180);
        cv.dilate(edges, edges, kernel);
        cv.findContours(edges, contours, hierarchy, cv.RETR_LIST, cv.CHAIN_APPROX_SIMPLE);

        const candidates = Array.from({ length: contours.size() }, (_, i) => i)
          .sort((a, b) => cv.contourArea(contours.get(b)) - cv.contourArea(contours.get(a)));

        let corners: Point[] | null = null;
        for (const index of candidates.slice(0, 20)) {
          const contour = contours.get(index);
          const perimeter = cv.arcLength(contour, true);
          const approx = new cv.Mat();
          cv.approxPolyDP(contour, approx, 0.02 * perimeter, true);
          if (approx.rows === 4 && cv.isContourConvex(approx) && cv.contourArea(approx) > src.cols * src.rows * 0.08) {
            corners = Array.from({ length: 4 }, (_, i) => ({
              x: approx.intAt(i, 0),
              y: approx.intAt(i, 1)
            }));
            approx.delete();
            contour.delete();
            break;
          }
          approx.delete();
          contour.delete();
        }

        if (!corners) {
          setMessage("Aucun contour de document suffisamment net n’a été détecté. Essayez une photo plus lumineuse, puis nous ajouterons le réglage manuel des coins.");
          setBusy(false);
          return;
        }

        const [tl, tr, br, bl] = orderCorners(corners);
        const width = Math.max(
          Math.hypot(br.x - bl.x, br.y - bl.y),
          Math.hypot(tr.x - tl.x, tr.y - tl.y)
        );
        const height = Math.max(
          Math.hypot(tr.x - br.x, tr.y - br.y),
          Math.hypot(tl.x - bl.x, tl.y - bl.y)
        );

        srcPoints = cv.matFromArray(4, 1, cv.CV_32FC2, [
          tl.x, tl.y, tr.x, tr.y, br.x, br.y, bl.x, bl.y
        ]);
        dstPoints = cv.matFromArray(4, 1, cv.CV_32FC2, [
          0, 0, width - 1, 0, width - 1, height - 1, 0, height - 1
        ]);
        transform = cv.getPerspectiveTransform(srcPoints, dstPoints);
        warped = new cv.Mat();
        cv.warpPerspective(src, warped, transform, new cv.Size(Math.round(width), Math.round(height)), cv.INTER_CUBIC, cv.BORDER_REPLICATE);
        cv.imshow(canvas, warped);
        setHasResult(true);
        setMessage("Correction terminée. Comparez le résultat à l’original : le fichier source reste intact.");
      } catch (error) {
        console.error(error);
        setMessage("Une erreur est survenue pendant le traitement. Essayez une autre image.");
      } finally {
        [src, gray, blurred, edges, contours, hierarchy, kernel, best, transform, warped, srcPoints, dstPoints]
          .forEach((mat) => { if (mat && !mat.isDeleted()) mat.delete(); });
        setBusy(false);
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
        <p>Importez une photo. E-Scan détecte le document et corrige sa perspective directement dans votre navigateur.</p>
        <div className="engine-status">
          <span className={opencvReady ? "status-dot ready" : "status-dot"} />
          {opencvReady ? "Moteur OpenCV prêt" : "Chargement du moteur de traitement…"}
        </div>
      </section>

      <section className="workspace">
        <div className="workspace-head">
          <div><span className="step">01</span><h2>Importer un document</h2></div>
          <span className="privacy"><span>⌑</span> Image traitée dans le navigateur</span>
        </div>

        <label className="upload-zone">
          <input type="file" accept="image/*" onChange={(e) => importImage(e.target.files?.[0])} />
          <span className="upload-icon">＋</span>
          <strong>{sourceUrl ? "Choisir une autre image" : "Sélectionner une image"}</strong>
          <span>JPG, PNG et formats image compatibles · depuis votre appareil</span>
        </label>

        {sourceUrl && (
          <>
            <div className="file-line"><span className="file-symbol">▧</span><span>{fileName}</span><button onClick={() => { setSourceUrl(""); setFileName(""); setHasResult(false); setMessage("Importez une photo pour commencer."); }}>Retirer</button></div>
            <div className="compare-grid">
              <article className="preview-card">
                <div className="preview-heading"><span>ORIGINAL</span><small>Image source</small></div>
                <div className="image-stage"><img ref={imageRef} src={sourceUrl} alt="Document original importé" onLoad={() => setMessage("Image prête. Lancez la détection du document.")} /></div>
              </article>
              <article className="preview-card">
                <div className="preview-heading"><span>RÉSULTAT</span><small>{hasResult ? "Perspective corrigée" : "En attente du traitement"}</small></div>
                <div className="image-stage result-stage">
                  {hasResult ? <canvas ref={outputRef} aria-label="Document corrigé" /> : <div className="empty-result"><span>✧</span><p>Votre document corrigé<br />apparaîtra ici</p></div>}
                  {!hasResult && <canvas className="hidden-canvas" ref={outputRef} />}
                </div>
              </article>
            </div>
            <div className="actions">
              <button className="primary-button" onClick={processDocument} disabled={!opencvReady || busy}>
                {busy ? "Traitement…" : "⌁  Détecter et corriger"}
              </button>
              <button className="secondary-button" onClick={downloadResult} disabled={!hasResult}>Télécharger le résultat</button>
            </div>
          </>
        )}
        <p className="feedback" role="status">{message}</p>
      </section>

      <footer><span>E-SCAN · EXCELLENT SCANNER</span><span>Le document original n’est jamais écrasé.</span></footer>
    </main>
  );
}