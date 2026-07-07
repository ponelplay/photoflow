# PhotoFlow — Pla del projecte

> Gestor de fotografies inspirat en FastStone Image Viewer, amb una interfície
> minimalista i moderna (híbrid macOS / Windows 11, mode clar i fosc).
> Nom provisional: **PhotoFlow** (canviable).

## 1. Decisions de base

| Decisió | Elecció | Motiu |
|---|---|---|
| Stack | **Tauri 2 + Rust + web UI (React + TypeScript + Vite)** | Backend Rust molt ràpid per escanejar carpetes i generar miniatures; executable petit; llibertat total de disseny a la UI. |
| Estil visual | **Híbrid minimalista propi** | Net i modern sense imitar cap SO concret; mode clar/fosc des del dia 1. |
| Plataforma inicial | Windows 11 (Tauri permet Mac/Linux més endavant) | És on treballes; multiplataforma queda oberta. |
| Base de dades | SQLite (via `rusqlite`) | Catàleg de miniatures, valoracions, etiquetes i cache EXIF sense servidor. |

## 2. Abast

### MVP (v0.1 – v0.3)
1. **Navegador**: arbre de carpetes + graella de miniatures virtualitzada (milers de fotos sense laguejar).
2. **Visor**: pantalla completa, zoom (roda/gestos), pan, fletxes per navegar, presentació de diapositives bàsica.
3. **Miniatures**: generació en segon pla amb cache persistent a SQLite (com fa FastStone amb la seva DB).
4. **Operacions de fitxers**: copiar, moure, renomenar, eliminar (a paperera), selecció múltiple, drag & drop.
5. **EXIF**: panell lateral amb metadades (càmera, exposició, data, GPS).

### v1.0
6. Renomenat per lots amb patrons (`{data}_{contador}` etc.).
7. Edició bàsica no destructiva: retallar, girar, redimensionar, llum/color.
8. Conversió/redimensionat per lots.
9. Valoracions (estrelles) i etiquetes de color; filtres i cerca per metadades.
10. Comparació costat a costat (2–4 imatges), una de les joies de FastStone.

### Fora d'abast (de moment)
- Revelat RAW complet (sí lectura/preview de RAW via `rawloader` si és viable).
- Edició avançada per capes, núvol, compartició.

## 3. Arquitectura

```
photoflow/
├── src-tauri/               # Backend Rust
│   ├── src/
│   │   ├── main.rs
│   │   ├── commands/        # Comandes exposades a la UI (IPC)
│   │   │   ├── fs.rs        # llistar carpetes, copiar/moure/renomenar/eliminar
│   │   │   ├── thumbs.rs    # generació i servei de miniatures
│   │   │   ├── exif.rs      # lectura de metadades
│   │   │   └── catalog.rs   # valoracions, etiquetes, cerca (SQLite)
│   │   ├── thumbnailer.rs   # pool de workers, cua amb prioritat (visible primer)
│   │   └── db.rs
│   └── Cargo.toml           # image, kamadak-exif, rusqlite, rayon, notify
├── src/                     # Frontend React + TS
│   ├── components/
│   │   ├── FolderTree/
│   │   ├── ThumbnailGrid/   # virtualitzada (TanStack Virtual)
│   │   ├── Viewer/          # canvas amb zoom/pan
│   │   ├── InfoPanel/       # EXIF + histograma
│   │   └── Toolbar/
│   ├── styles/tokens.css    # variables de disseny (clar/fosc)
│   └── stores/              # Zustand: selecció, navegació, preferències
└── PLA.md
```

**Punts tècnics clau**
- **Miniatures**: Rust decodifica amb `image` + `rayon` en paral·lel, desa WebP ~256px a SQLite; la UI les demana per rang visible via protocol custom `thumb://` (evita base64 per IPC).
- **Graella virtualitzada**: només es renderitzen les files visibles; scroll fluid amb 50k+ fotos.
- **Visor**: precàrrega de la imatge següent/anterior; decodificació a mida de pantalla per a JPEG grans.
- **Watcher**: `notify` per refrescar la carpeta si canvien fitxers externament.
- **Operacions destructives**: sempre a paperera de reciclatge (`trash` crate), mai unlink directe.

## 4. Disseny visual (guia)

- **Layout**: 3 zones — sidebar (arbre + col·leccions), graella central, panell d'info plegable a la dreta. Barra d'eines superior fina i integrada a la barra de títol (titlebar overlay de Tauri).
- **Tokens**: cantonades 8–12px, ombres suaus, tipografia Inter/Segoe UI Variable, espaiat generós (escala de 4px).
- **Colors**: fons neutres (clar: #FAFAFA / fosc: #111214), un sol color d'accent (blau ~#3B82F6), superfícies amb lleuger blur en overlays.
- **Visor**: fons negre pur, controls flotants translúcids que s'amaguen sols (estil macOS Photos / W11 Photos).
- **Micro-interaccions**: hover suau a miniatures, transicions 150–200ms, checkmarks de selecció en cercle a la cantonada.

## 5. Fases i fites

| Fase | Contingut | Resultat verificable |
|---|---|---|
| 0 ✓ | Scaffold Tauri + React + tokens de disseny + finestra amb titlebar custom | Finestra buida amb look definitiu |
| 1 ✓ | Arbre de carpetes (unitats reals, càrrega mandrosa) + graella de miniatures reals (protocol `thumb://`, cache a disc, orientació EXIF) + selecció Ctrl/Shift + panell d'info amb EXIF real | Navegar el disc i veure fotos fluid |
| 1b ✓ | Virtualització de la graella (feta a mà, sense dependències: només es renderitzen les files visibles) | Carpetes de 10k+ fotos fluides |
| 7 ✓ | Extres post-v1.0: comparació costat a costat (zoom/pan sincronitzats, 2-4 fotos), detecció de duplicats (dHash perceptual + union-find), vista línia de temps per mesos, icona pròpia i instal·lador NSIS/MSI | v1.1 |
| 8 ✓ | Mode triatge dedicat (tecla T: valora/etiqueta/descarta amb auto-avanç, resum final amb enviament a paperera) + importació arrossegant des de l'Explorador (bytes per IPC binari, ja que el webview no exposa rutes) | v1.1 |
| 2 ✓ | Visor complet (zoom, pan, fletxes, controls que s'amaguen sols) | Doble clic → visor funcional |
| 3 ✓ | Operacions de fitxers (paperera, copiar/moure amb selector natiu, renomenar) + menú contextual + drag & drop a carpetes + tecles Supr/F2/Ctrl+A | Gestió real de fitxers |
| 4 ✓ | Panell EXIF + histograma (lluminositat + RGB, sobre la miniatura en cache) | Info completa per foto |
| 5 ✓ | Renomenat per lots (patrons {data}/{hora}/{contador}/{nom}, vista prèvia, renomenat en 2 fases) i conversió per lots (JPEG/PNG/WebP, redimensionat, progrés en temps real, originals intactes) | Substitueix FastStone pel dia a dia |
| 6 ✓ | Edició **no destructiva** (receptes: rotació, retall, llum/color; exporta còpia) + valoracions 1-5 i etiquetes de color (teclat i clic) + cerca instantània i filtres per estrelles/etiqueta | **v1.0** |

## 6. Millores respecte a FastStone

FastStone és la inspiració, no el límit. Punts on el superarem deliberadament:

| # | Mancança de FastStone | Millora a PhotoFlow | Fase |
|---|---|---|---|
| 1 | UI antiquada (Windows XP vibes), sense mode fosc | Disseny minimalista modern, clar/fosc | 0 ✓ |
| 2 | HiDPI deficient (borrós en pantalles 2K/4K) | Renderitzat nítid a qualsevol escala (webview modern) | 0 ✓ |
| 3 | Sense valoracions ni etiquetes | Estrelles + etiquetes de color, amb filtres | v1.0 |
| 4 | Cerca gairebé inexistent | Cerca instantània per nom, data, càmera, ISO… (índex SQLite) | v1.0 |
| 5 | Edició destructiva (sobreescriu l'original) | Edició **no destructiva**: l'original mai es toca, ajustos desats a part amb historial | v1.0 |
| 6 | Sense mode de triatge | **Mode triatge (culling)**: revisar ràpid amb teclat — 1-5 valora, tecles per moure a carpetes predefinides, X descarta | v1.0 |
| 7 | Sense detecció de duplicats | Cerca de fotos duplicades i quasi-idèntiques (hash perceptual) | post-1.0 |
| 8 | Navegació només per carpetes | Vista **línia de temps** per dates a més de l'arbre de carpetes | post-1.0 |
| 9 | Comparació 2-4 imatges (bona idea, execució regular) | Mantenir-la i millorar-la: zoom/pan sincronitzat fluid | v1.0 |

El mode triatge (#6) és probablement la millora amb més impacte al dia a dia:
FastStone obliga a anar foto per foto amb el ratolí; PhotoFlow permetrà buidar
una targeta de 500 fotos en minuts sense tocar el ratolí.

## 7. Riscos

- **Rendiment amb carpetes enormes** → mitigat amb virtualització + cua de miniatures amb prioritat.
- **Formats exòtics (HEIC, RAW)** → començar amb JPEG/PNG/WebP/GIF/BMP/TIFF; HEIC/RAW en fase posterior.
- **Corba de Rust** → les comandes són petites i aïllades; la complexitat viu al thumbnailer, que es fa un cop.
