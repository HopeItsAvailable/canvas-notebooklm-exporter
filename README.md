# Canvas NotebookLM Exporter

One-click Chrome extension to export Canvas course materials (slides, transcripts) ready for Google NotebookLM.

## Features

- **In-memory zip extraction**: Extracts slide archives directly in browser memory without temporary zip files on disk.
- **VTT/SRT transcript cleaning**: Strips timestamps, cue numbers, and markup tags, coalescing captions into clean text paragraphs.
- **Module-prefixed downloads**: Organizes output files with standardized prefixes under `notebookLM/`.
- **Editable module prefix**: Auto-detects module titles from page breadcrumbs and headers with optional manual edits.
- **Universal Canvas support**: Operates across any Canvas LMS institution or custom domain.

## Installation

1. Clone this repository to your local machine:
   ```bash
   git clone https://github.com/example/canvas-notebooklm-exporter.git
   ```
2. Open Google Chrome and navigate to `chrome://extensions`.
3. Enable **Developer mode** using the toggle switch in the top right corner.
4. Click **Load unpacked**.
5. Select the repository root folder (`canvas-notebooklm-exporter`).

## Usage

1. Navigate to a Canvas course page containing lecture materials (e.g., Media Guide, Playlist, or Module item).
2. Click the **Canvas NotebookLM Exporter** icon in the Chrome toolbar.
3. Review the detected assets (slides, transcripts, documents).
4. Optionally edit the auto-detected module prefix.
5. Click **Export** to download cleaned, ready-to-use study files.

## Project Structure

```
canvas-notebooklm-exporter/
├── manifest.json         # Chrome Extension Manifest V3
├── popup.html            # Popup interface HTML
├── popup.js              # Popup event handling & UI state
├── background.js         # Service worker download coordinator
├── content-scanner.js    # Canvas page DOM scraper script
├── src/
│   ├── cleaner.js        # Subtitle parsing & text sanitization
│   ├── scanner.js        # Link normalization & asset discovery
│   └── pipeline.js       # In-memory pipeline & zip extraction
├── lib/
│   └── jszip.min.js      # Bundled JSZip library
└── test/                 # Test suite (Node.js test runner)
```

## License

MIT
