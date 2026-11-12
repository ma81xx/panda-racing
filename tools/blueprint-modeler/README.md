# Blueprint Modeler

Pipeline riutilizzabile per trasformare le misure di un blueprint ortografico in un modello GLB a basso poligonale, pronto per `src/vehicle.js`.

Il modello generato è **stilizzato ma proporzionato**: usa le misure reali del blueprint, non è una replica fotorealistica. Non include boolean/CAD, quindi passaruota e dettagli sono volumi applicati alla carrozzeria.

## Comandi

```bash
npm run models:lancer      # rigenera public/models/mitsubishi-lancer-evo9.glb
npm run models:validate    # controlla ruote, bbox e materiali del GLB
npm run dev                # poi apri:
# http://localhost:5173/tools/blueprint-modeler/viewer.html?angle=iso&auto=0
```

Viste del viewer: `iso`, `side`, `front`, `rear`, `top`, `high`, `low`. Parametri: `?model=/models/file.glb&angle=side&auto=0`.

## Flusso per un nuovo blueprint

1. Metti l'immagine in `reference/` e individua le viste ortografiche (fronte, lato, alto, retro).
2. Copia `specs/lancer-evo9.json` in un nuovo file, es. `specs/nuova-auto.json`.
3. Imposta `units` (`mm` o `m`) e le misure reali in `dimensions`.
4. Compila `body.stations` dal paraurti anteriore al posteriore.
5. Compila `body.windows`, `wheels`, `materials` e `details.parts`.
6. Genera e valida:

```bash
node tools/blueprint-modeler/build.mjs tools/blueprint-modeler/specs/nuova-auto.json public/models/nuova-auto.glb
node tools/blueprint-modeler/lib/validate.js public/models/nuova-auto.glb
```

7. Apri il viewer e correggi lo spec finché la silhouette è soddisfacente.
8. Aggiungi il GLB in `public/models/` e una voce in `src/models.js` con la configurazione del veicolo.

## Sistema di coordinate

- Unità dello spec: millimetri (`units: "mm"`) o metri (`units: "m"`).
- Modello finale: metri, **+Y alto**, **+Z avanti**, **+X destra**.
- `d` nelle stazioni è la distanza dal paraurti anteriore (0 → lunghezza totale).
- La conversione usata dal generatore è `z = length / 2 - d`.
- La stazione `d = 0` e `d = length` devono esistere: chiudono il muso e la coda.
- Le stazioni devono essere ordinate per `d`. Inserisci stazioni ai confini di `body.windows` per evitare bordi vetro ambigui.

## Campi principali dello spec

| Campo | Significato |
|-------|-------------|
| `dimensions.length/width/height` | ingombri reali (la larghezza è quella della carrozzeria, senza specchietti) |
| `dimensions.wheelbase/track` | passo e carreggiata |
| `wheels.frontAxle/rearAxle` | distanza degli assi dal paraurti anteriore |
| `wheels.radius/width/rimRadius` | ruota, pneumatico e cerchio |
| `body.stations[].halfWidth` | semilarghezza massima della sezione (spalla) |
| `body.stations[].topHalfWidth` | semilarghezza al tetto/parte alta |
| `body.stations[].bottomY/shoulderY/topY` | fondo, linea di cintura e tetto della sezione |
| `body.windows.windshield/rear` | intervalli `[da, a]` in `d` per parabrezza e lunotto |
| `body.windows.sides` | coppie `[da, a]` per i finestrini laterali |
| `body.windows.pillars` | intervalli `[da, a]` colorati come montanti neri |
| `body.stationStep` | passo di ricampionamento delle stazioni (default 50 mm) |
| `body.wheelArches` | `radius`, `lift`, `segments` per ritagliare i passaruota nella silhouette |

## Materiali

I nomi sono significativi per `vehicle.js`:

- `Carpaint`: vernice.
- `Window`: vetri (trasparente).
- `Tyre`, `Metal`, `Plastic`, `Interior`, `Brake`, `Caliper`.
- `BrakeLight` / `ReverseLight`: luci posteriori (configurate in `src/models.js`).
- `Headlight`, `Indicator`.

I colori sono stringhe esadecimali. `opacity < 1` attiva la trasparenza; `side: "double"` imposta `DoubleSide`.

## Dettagli

`details.parts` è una lista di volumi semplici, tutti in unità dello spec:

```json
{ "type": "box", "name": "Grille", "material": "Plastic",
  "pos": [0, 520, 2250], "size": [820, 120, 20] }
```

- `box`: `size: [x, y, z]`.
- `cylinder`: `radius`, `length`, `axis` (`x`/`y`/`z`), `segments`.
- `halfCylinder`: come `cylinder`, ma aperto a mezza circonferenza (usato per i passaruota interni).
- `torus`: `radius`, `tube`, `arc` in gradi, `radialSegments`, `tubularSegments`.
- `quad`: `points: [[x, y, z] × 4]`, utile per fari/calandre trapezoidali; la normale viene orientata automaticamente verso l'esterno.
- `arch`: `x`, `baseY`, `lift`, `radius`, `z`, `tube`, `segments`, per il labbro del passaruota.
- `polyline`: `points: [[x, y, z], …]`, `tube`, `segments`, per linee di giunzione (cofano, portiere, ecc.).

`pos` è il centro del volume e `rot` è in gradi (`[x, y, z]`). I dettagli sulle facce piatte (fari, griglia) vanno posizionati **fuori** dalla superficie della carrozzeria (es. `z = length/2 + 5 mm`), altrimenti restano nascosti dentro il volume chiuso. Per i pannelli orizzontali (cofano) usa `quad`/`polyline` con la quota `y` presa dal profilo delle stazioni, altrimenti possono affondare nella carrozzeria.

## Ruote e integrazione

Ogni ruota è un nodo `Wheel_FL/FR/RL/RR` centrato nel mozzo con `userData.vehicleWheel`, `radius`, `axle` e `side`. `src/vehicle.js` usa questi metadati e mantiene il fallback ai nodi legacy `Circle_7` / `Circle.001_9` per la Panda.

Configurazione del veicolo in `src/models.js`:

- `targetWidth`: `null` mantiene la scala reale; un numero normalizza la larghezza (usato dalla Panda, 2.2 m).
- `collider`: `halfExtents`, `offset`, `density`.
- `brakeLightMaterial` / `reverseLightMaterial`: nomi dei materiali.
- `tuning`: override di sospensioni, motore, freni, `gearRatios`, `reverseRatio`, `frontDrive`/`rearDrive` (Panda FWD 100/0, Lancer AWD 50/50), ecc.

## Limiti

- Nessuna estrazione automatica delle silhouette: le stazioni si ricavano a mano dal blueprint.
- Nessun taglio boolean per i passaruota: le ruote sono volumi separati sotto la carrozzeria.
- Nessuna texture o decal: il colore viene dai materiali PBR.
- Il viewer non fa parte del build di produzione; serve solo per il controllo visivo.
