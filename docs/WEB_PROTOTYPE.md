# E-Scan Web Prototype

## Implemented

- React + TypeScript + Vite web application shell.
- Local image import using a browser object URL.
- OpenCV.js runtime loading.
- Grayscale conversion, Gaussian blur, Canny edge detection and contour extraction.
- Heuristic four-corner candidate selection.
- Perspective correction and PNG export.
- Original and processed image previews.

## Run locally

Requires Node.js 20+ and npm:

```bash
npm install
npm run dev
```

The OpenCV.js runtime currently loads from the official OpenCV documentation CDN. An internet connection is required for image processing. A later hardening step should pin and host a tested build locally.

## Known limitations

This is an early proof of concept, not a production scanner. Automatic contour detection may fail or select the wrong quadrilateral on low-contrast images, complex backgrounds, shadows or documents with irregular edges. Manual corner adjustment, camera capture, enhancement profiles, multi-page documents, PDF, OCR and Android are not implemented yet.

Before release, add a curated test corpus, benchmark detection and geometric accuracy, pin the OpenCV.js build, add automated tests, and validate on target mobile browsers.
