# E-Scan Web Prototype

## Implemented

- React + TypeScript + Vite application shell.
- Local image import using a browser object URL.
- OpenCV.js runtime loading.
- Multi-strategy document boundary search: two Canny threshold pairs and adaptive Gaussian thresholding.
- Morphological closing to connect small gaps in detected edges.
- Convex four-corner candidate filtering and perspective correction.
- Original/result preview and PNG export.

## Run locally

Requires Node.js 20+ and npm:

```bash
npm install
npm run dev
```

The OpenCV.js runtime currently loads from the official OpenCV documentation CDN. An internet connection is required for image processing. Before release, pin and host a tested OpenCV.js build locally.

## Current detection strategy

E-Scan analyzes the image in grayscale, applies a small Gaussian blur, then tries multiple deterministic threshold strategies. It approximates contours as polygons, rejects implausibly small, huge, degenerate or non-convex candidates, and selects the largest remaining quadrilateral. The selected corners are used for a perspective transform.

This is a heuristic first pass, not a guarantee that the selected quadrilateral is the document. It may still fail on cluttered backgrounds, page borders, shadows, low contrast, cropped edges or documents with irregular outlines.

## Manual validation checklist

Test at least these cases on desktop and Android mobile browsers:
1. Flat A4 page on a contrasting background.
2. Page photographed at a strong angle.
3. Low contrast page on a light table.
4. Uneven lighting and cast shadow.
5. Curled page or book page.
6. Multiple sheets visible in one photo.
7. Document touching or cropped by the image edge.
8. Text-heavy page with small print, stamps and signatures.

For each case, record whether the correct page was found, whether all four edges were preserved, whether text was geometrically distorted, and whether the output is sharper or worse than the original. Keep the original image as the reference.

## Not implemented yet

Manual corner adjustment, camera capture, enhancement profiles, multi-page documents, PDF export, OCR, persistence and Android are future milestones. No real-device quality benchmark has been completed yet.
