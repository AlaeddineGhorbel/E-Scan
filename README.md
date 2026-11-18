# E-Scan

**Excellent Scanner** — a document-scanning application for Android and Web.

## Product decisions

- **Platforms:** Android and Web.
- **Audience:** International; all document types.
- **Core principle:** Preserve the original image and never silently invent or alter document content.
- **Processing:** Classical image-processing algorithms only. No generative AI or AI API.
- **Core technology direction:** OpenCV and deterministic image-processing algorithms.
- **OCR:** A conventional OCR engine such as Tesseract, subject to language and quality benchmarking.
- **Business model:** Free tier with moderate advertising plus optional Premium.
- **Privacy direction:** Local-first processing. Any future cloud storage or synchronization must be explicitly optional.

## Current implementation

The first Web proof of concept is now in the repository:
- Import a local image.
- Detect a likely four-corner document contour with OpenCV.js.
- Correct perspective.
- Compare the source and result.
- Download the processed image as PNG.

See [Web prototype instructions](docs/WEB_PROTOTYPE.md).

## Run the Web prototype

Requires Node.js 20+ and npm.

```bash
npm install
npm run dev
```

The current OpenCV.js runtime is loaded from the official OpenCV documentation CDN, so an internet connection is needed for image processing.

## Quality principles

1. Keep the original capture unchanged.
2. Make every enhancement reversible.
3. Avoid aggressive processing that damages small text, signatures, stamps or numbers.
4. Warn users when a capture is blurred, clipped, overexposed or otherwise unsuitable.
5. Measure quality against repeatable test images before making comparisons with other scanner apps.

## Project documentation

- [Product specification](docs/PRODUCT_SPEC.md)
- [Technical architecture](docs/ARCHITECTURE.md)
- [Development roadmap](docs/ROADMAP.md)
- [Web prototype](docs/WEB_PROTOTYPE.md)

The Web implementation is an early technical proof of concept, not a production-ready scanner. Android, manual corner adjustment, multi-page documents, PDF export and OCR remain future milestones.
