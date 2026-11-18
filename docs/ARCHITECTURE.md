# E-Scan — Technical Architecture

## 1. Architecture principles

- Local-first: core scanning works without an account or network connection.
- Deterministic processing: use conventional computer-vision and image-processing algorithms; no AI model or AI API.
- Original preservation: never overwrite the source capture.
- Modular design: keep capture, processing, OCR, PDF, storage and monetization separate.
- Platform-aware UX: Android camera capabilities and browser camera capabilities are not identical.

## 2. Proposed application structure

### Android
- Flutter and Dart for the application UI and workflow.
- Camera integration through a maintained Flutter camera plugin, with native platform integration where required.
- OpenCV for document detection, geometric correction and image enhancement.
- A local database and app-private file storage for document metadata and files.
- PDF generation and conventional OCR through separately replaceable modules.

### Web
- React and TypeScript for a responsive browser application.
- OpenCV.js/WebAssembly for supported image-processing operations.
- Browser camera APIs where available, plus image/PDF import.
- IndexedDB and browser file APIs for local-first workflows, subject to browser storage limits.
- A PDF generation and rendering layer selected after a technical proof of concept.

### Shared logic
The product should share processing specifications, test images, filter definitions and quality tests across platforms. Do not assume that one compiled binary or one camera implementation will provide identical capabilities on Android and Web.

## 3. Image-processing pipeline

1. Import or capture the source image.
2. Preserve the original bytes and metadata where practical.
3. Assess image dimensions, blur, exposure and clipping.
4. Detect candidate document boundaries.
5. Rank candidate quadrilaterals using geometry, edge continuity and image evidence.
6. Let the user confirm or adjust the four corners.
7. Apply perspective transformation.
8. Apply the selected enhancement profile.
9. Preview the result beside the original.
10. Save a new processed page without replacing the original.
11. Assemble selected pages into a PDF or export images.

Every stage should be testable independently. Processing parameters must be conservative and adjustable.

## 4. OpenCV responsibilities

Candidate operations include:
- Color-space conversion
- Denoising and illumination estimation
- Edge detection
- Contour extraction
- Polygon approximation
- Quadrilateral validation
- Perspective transformation
- Morphological operations
- CLAHE and histogram-based contrast adjustment
- Adaptive thresholding
- Sharpening with safeguards against halos and noise

No single filter is suitable for every document. Preserve a color mode and original mode as safe alternatives to aggressive black-and-white conversion.

## 5. OCR

Initial candidate: Tesseract, evaluated separately for Android and Web deployment.

OCR is an optional text-extraction layer. It must not alter the scanned image. Benchmark English, French and Arabic independently, including Arabic right-to-left text and mixed-language pages. Select language packs and packaging strategy after measuring application size, speed and recognition quality.

## 6. Backend and synchronization

A backend is not required for local scanning. If accounts, subscriptions or synchronization are introduced, Supabase is a candidate for:
- Authentication
- PostgreSQL metadata
- Private object storage
- Row-level security
- Account and document lifecycle operations

Cloud synchronization must be opt-in. Use private buckets, strict authorization and secure transport. Do not store document files in public buckets.

## 7. Monetization boundaries

- Keep ad SDKs outside the capture and image-processing modules.
- Advertising modules must never receive document images, OCR text, file names or page contents.
- Premium entitlement checks must not block core free scanning.
- Validate purchases securely and follow each platform's current billing policies.
- Web advertising provider must explicitly support the deployed product format.

## 8. Suggested repository layout

```text
E-Scan/
├── apps/
│   ├── android/          # Flutter application
│   └── web/              # React + TypeScript application
├── packages/
│   ├── scan-core-spec/   # Shared processing contracts and fixtures
│   └── quality-tests/    # Cross-platform benchmark definitions
├── docs/
│   ├── PRODUCT_SPEC.md
│   ├── ARCHITECTURE.md
│   └── ROADMAP.md
├── test-assets/
│   └── README.md         # Dataset guidance; do not commit private documents
├── .gitignore
└── README.md
```

This is the intended structure, not an assertion that application code already exists.

## 9. Technical spikes before committing to implementation

1. Verify Flutter + OpenCV integration and supported Android ABIs.
2. Verify OpenCV.js/WebAssembly performance in target browsers.
3. Compare Android and Web perspective-correction output on identical fixtures.
4. Test Tesseract packaging, language data size and Arabic OCR quality.
5. Compare PDF libraries for image resolution, multipage support and file size.
6. Define a benchmark and baseline before optimizing filters.