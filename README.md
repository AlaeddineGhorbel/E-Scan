# E-Scan

**Excellent Scanner** — a document-scanning application for Android and Web.

E-Scan aims to make high-quality document scanning accessible to everyone. The project focuses on faithful image processing, reliable document detection, readable exports, privacy, and a simple user experience.

## Product decisions

- **Platforms:** Android and Web at launch.
- **Audience:** International; all document types.
- **Core principle:** Preserve the original image and never silently invent or alter document content.
- **Processing:** Classical image-processing algorithms only. No generative AI or AI API is part of the product scope.
- **Core technology direction:** OpenCV and deterministic image-processing algorithms.
- **OCR:** A conventional OCR engine such as Tesseract, subject to language and quality benchmarking.
- **Business model:** Free tier with moderate advertising plus an optional ad-free Premium tier.
- **Privacy:** Local-first processing. Cloud storage and synchronization are optional and require explicit user choice.

## Planned capabilities

- Camera capture and image import
- Automatic document boundary detection
- Manual corner adjustment and perspective correction
- Rotation, crop, color, grayscale, adaptive black-and-white and cleanup filters
- Multi-page documents and page reordering
- PDF and image export
- OCR and searchable text
- Document organization, sharing and optional synchronization
- Advertising and optional Premium subscription

## Quality principles

1. Keep the original capture unchanged.
2. Make every enhancement reversible.
3. Avoid aggressive sharpening or thresholding that damages small text, signatures, stamps or numbers.
4. Warn users when a capture is blurred, clipped, overexposed or otherwise unsuitable.
5. Measure quality against a repeatable test set before making comparisons with other scanner apps.

## Repository status

This repository currently contains the initial product and architecture documentation. Application implementation has not yet started.

See:
- [Product specification](docs/PRODUCT_SPEC.md)
- [Technical architecture](docs/ARCHITECTURE.md)
- [Development roadmap](docs/ROADMAP.md)

## Working language

Project documentation is written in English to support international collaboration.