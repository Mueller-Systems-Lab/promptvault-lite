# PromptVault Lite — Website

## Überblick

Statische Produkt-Website für PromptVault Lite. Kein Framework, kein Build-Schritt, kein Tracking, keine externen Skripte, Schriften oder Analysen. Alle Pfade sind relativ, damit die Seite unter GitHub Pages im Unterpfad `/promptvault-lite/` funktioniert.

## Dateien / Struktur

```text
website/
├── index.html          # Startseite (deutsch, semantisches HTML5)
├── styles.css          # Design-System (dunkel, System-Fonts, responsive)
├── site.js             # Minimales Vanilla-JS (Jahr, prefers-reduced-motion)
├── 404.html            # Fehlerseite (noindex)
├── README.md           # Diese Datei
└── assets/
    ├── favicon.svg                     # SVG-Icon (dunkel, „PV“)
    ├── promptvault-demo.mp4            # Demo-Video (H.264, 1280×720, 30 fps)
    ├── demo-poster.webp                # Video-Poster
    ├── screenshot-authoring.webp       # Screenshot: Prompt-Authoring
    ├── screenshot-missing-info.webp    # Screenshot: fehlende Informationen
    └── screenshot-direction.webp       # Screenshot: Richtung / Varianten
```

## Lokale Vorschau

```powershell
# im website/-Ordner:
python -m http.server 8000
# oder
npx serve .
```

Danach `http://localhost:8000/` im Browser öffnen.

## GitHub-Pages-Deployment

- Workflow: `.github/workflows/pages.yml`
- Source: **GitHub Actions** (Upload des `website/`-Ordners, Deployment über das Pages-Umgebungs-Environment)
- Auslöser: Push auf `master` mit Änderungen unter `website/**` oder am Workflow selbst; zusätzlich `workflow_dispatch`
- URL: <https://xxammaxx.github.io/promptvault-lite/>

Voraussetzung in den Repository-Einstellungen: *Settings → Pages → Source: GitHub Actions*.

## Demo-Video-Workflow

Das Demo-Video ist eine saubere 57s-Aufnahme (1280×720, 30 fps, H.264, yuv420p, ~0,97 MB) des echten Linux-Release-Binaries (`target/release/promptvault-lite` v1.11.1, Debug:False), gesteuert über WebDriverIO + tauri-driver + WebKitWebDriver auf einem isolierten Xvfb-Display.

- Nur synthetische Daten (Beispiel: Hamburg-Städtetrip).
- Datenschutz-geprüft: keine Pfade, Benutzernamen oder Secrets im Bild.
- Produktgenauigkeit-geprüft (realer Release-Build).

## Synthetischer Demo-Datensatz

Der im Video gezeigte Datensatz ist synthetisch (Beispiel: Hamburg-Städtetrip) und enthält **keine echten personenbezogenen Daten**.

## Video-Encoding

- Auflösung: 1280×720
- Framerate: 30 fps
- Codec: H.264, Pixel-Format yuv420p
- Zielgröße: unter 15 MB (aktuell ca. 0,97 MB)

## Privacy-Checkliste

Vor jeder Veröffentlichung des Demo-Videos wird eine OCR-Prüfung aller Frames durchgeführt:

- keine Benutzernamen, Passwörter oder Tokens im Bild
- keine echten Pfade, Dateinamen oder Systemdetails (z. B. `C:\Users\...`)
- keine personenbezogenen Daten (Demo-Daten sind synthetisch)
- keine externen URLs außerhalb des Demo-Kontexts

## Demo später ersetzen

1. Neue Frames aus den E2E-Specs gegen den PUBLIC-Binary aufnehmen (WebDriver-Screenshot je Schritt).
2. OCR-Prüfung aller Frames (siehe Privacy-Checkliste).
3. Frames mit ffmpeg encoden (1280×720, 30 fps, H.264, yuv420p).
4. Teilstücke mit `ffmpeg -f concat` zusammenfügen.
5. `assets/promptvault-demo.mp4` ersetzen, Poster `assets/demo-poster.webp` aktualisieren.
6. Größenlimit (< 15 MB) und lokale Vorschau prüfen.
