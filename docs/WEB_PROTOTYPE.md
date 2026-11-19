# E-Scan Web Prototype

## Implemented

- React + TypeScript + Vite application shell.
- Local image import using a browser object URL; the original file is not overwritten.
- OpenCV.js runtime loading.
- Multi-strategy boundary search using two Canny threshold pairs, adaptive Gaussian thresholding and a Lab color-distance mask.
- Candidate geometry checks and perspective correction.
- Manual adjustment of the four detected corners.
- Conservative large-scale luminance normalization and mild sharpening.
- Original/result preview and PNG export.

## Run locally

Requires Node.js 20+ and npm:

```bash
npm install
npm run dev
```

The OpenCV.js runtime currently loads from the official OpenCV documentation CDN. An internet connection is required for image processing. Before release, pin and host a tested OpenCV.js build locally.

## Detection strategy and limitations

E-Scan analyzes a reduced copy of the image. It searches for quadrilaterals using edge contours and a separate background-color segmentation strategy. Background segmentation now evaluates each connected contour independently instead of joining unrelated objects into one convex hull; this reduces the risk of joining a page to a cast shadow, another object or the table edge.

Candidates are filtered using area, side lengths, convexity, corner angles and opposite-side balance. These are deterministic computer-vision heuristics, not a trained model. A table with a color close to the paper, a shadow touching the page edge, clutter, curled pages, low contrast or a cropped document can still cause an incorrect result. Always inspect the four handles and adjust them when necessary. A detected quadrilateral is not yet a measured confidence guarantee.

## Image enhancement

After perspective correction, E-Scan estimates broad illumination variations from the Lab luminance channel and applies a bounded local gain. The gain is deliberately limited to reduce clipping and avoid amplifying very dark areas. A mild unsharp mask is then applied.

This is a conservative first correction, not a guarantee that every cast shadow will disappear. Strong or sharply bounded shadows may remain. Inspect small text, colored stamps, signatures and fine lines; do not discard the original image. Avoid treating a visually brighter page as proof that no information was lost.

## Manual validation checklist

Real-photo validation is still required. Test at least:
1. Flat A4 page on a contrasting background.
2. Page photographed at a strong angle.
3. Low-contrast page on a light table.
4. A cast shadow touching one or more page edges.
5. Uneven lighting across the page.
6. Curled page or book page.
7. Multiple sheets visible in one photo.
8. Document touching or cropped by the image edge.
9. Text-heavy page with small print, stamps and signatures.

For each case, compare the result with the original: correct page boundary, all four edges preserved, no text/signature loss, no excessive color shift, and no sharpening halos. Record false detections as failures rather than silently accepting them.

## Not implemented yet

Camera capture, enhancement profiles, multi-page documents, PDF export, OCR, persistence and the native Android application remain future milestones. No representative real-device quality benchmark has been completed yet.
