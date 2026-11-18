# E-Scan — Development Roadmap

This roadmap is milestone-based. Dates and estimates will be set after the technical spikes.

## Milestone 0 — Repository and product foundation
- [x] Create public repository.
- [x] Record product decisions and initial architecture.
- [ ] Confirm license and contribution policy.
- [ ] Create issue labels and milestone plan.
- [ ] Add CI checks.

## Milestone 1 — Technical proof of concept
- [ ] Flutter Android camera capture.
- [ ] React Web image import and camera permission flow.
- [ ] OpenCV perspective correction on Android.
- [ ] OpenCV.js perspective correction on Web.
- [ ] Compare outputs on shared test fixtures.
- [ ] Confirm PDF generation options.

## Milestone 2 — First scanning workflow
- [ ] Capture/import page.
- [ ] Automatic boundary detection.
- [ ] Manual corner adjustment.
- [ ] Perspective correction.
- [ ] Original and processed preview.
- [ ] Save page locally.

## Milestone 3 — Document and PDF workflow
- [ ] Multi-page documents.
- [ ] Page reorder, rotate, replace and delete.
- [ ] PDF and image export.
- [ ] Merge and split PDF.
- [ ] Share and download.

## Milestone 4 — Quality and OCR
- [ ] Color, grayscale and adaptive black-and-white profiles.
- [ ] Shadow and illumination correction.
- [ ] Noise reduction and restrained sharpening.
- [ ] Blur and glare warnings.
- [ ] Tesseract proof of concept.
- [ ] English, French and Arabic benchmark.

## Milestone 5 — Accounts and optional cloud
- [ ] Decide whether cloud sync is needed for first release.
- [ ] Authentication, if enabled.
- [ ] Private storage and access policies.
- [ ] Explicit sync controls.
- [ ] Account/data deletion workflow.

## Milestone 6 — Commercial release
- [ ] Free/Premium feature matrix finalized.
- [ ] Android billing integration.
- [ ] Compatible Web advertising provider selected.
- [ ] Consent and privacy flows.
- [ ] Store listing, screenshots and support pages.
- [ ] Production testing and release.

## Release gates

A milestone is complete only when:
- Acceptance criteria are documented.
- Automated tests pass where applicable.
- Manual tests cover supported devices/browsers.
- No known data-loss issue remains.
- User-facing limitations are documented.