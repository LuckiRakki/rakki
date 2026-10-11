# More app icons

Rakki has the neko in 17 colours, but iOS can only switch an app to icons that are **built into
it**, and every one makes the app bigger. So the app carries **Classic, Lavender and Midnight**
(each in Liquid Glass, Depth and Flat) plus **Neko player** and **Lyric lines**; pick those in
**Settings → Customize → App icon**.

The other colours are below as full-size images. iOS won't let an app use a downloaded picture
as its real icon, but a **Home Screen shortcut** can have any picture, and it opens Rakki.

## Use one as your icon

1. Tap an icon below to open it full size, then press and hold it and choose **Save to Photos**
   (or **Download** it to Files).
2. Open the **Shortcuts** app, tap **+**, then **Add Action**, and choose **Open App**. Tap
   *App* and pick **Rakki**.
3. Tap the shortcut's name at the top, then **Add to Home Screen**.
4. Tap the small icon next to the name, choose **Choose Photo** (or **Choose File**) and pick the
   image you saved. Name it **Rakki** and tap **Add**.
5. To keep just the new one, press and hold the original Rakki icon and choose **Remove App →
   Remove from Home Screen** (it stays in the App Library).

Good to know: opening Rakki from a shortcut shows a short Shortcuts banner at the top, and the
shortcut's icon doesn't change with Dark or Tinted mode like a real app icon does. Widgets,
notifications and everything else in Rakki work as usual.

## Colours

| Colour | Depth | Flat |
|---|---|---|
| Sage | <a href="../assets/icons/app/SageDepth.png"><img src="../assets/icons/app/SageDepth.png" width="96" alt="Sage, Depth"></a> | <a href="../assets/icons/app/SageFlat.png"><img src="../assets/icons/app/SageFlat.png" width="96" alt="Sage, Flat"></a> |
| Sky | <a href="../assets/icons/app/SkyDepth.png"><img src="../assets/icons/app/SkyDepth.png" width="96" alt="Sky, Depth"></a> | <a href="../assets/icons/app/SkyFlat.png"><img src="../assets/icons/app/SkyFlat.png" width="96" alt="Sky, Flat"></a> |
| Lemon | <a href="../assets/icons/app/LemonDepth.png"><img src="../assets/icons/app/LemonDepth.png" width="96" alt="Lemon, Depth"></a> | <a href="../assets/icons/app/LemonFlat.png"><img src="../assets/icons/app/LemonFlat.png" width="96" alt="Lemon, Flat"></a> |
| Sand | <a href="../assets/icons/app/SandDepth.png"><img src="../assets/icons/app/SandDepth.png" width="96" alt="Sand, Depth"></a> | <a href="../assets/icons/app/SandFlat.png"><img src="../assets/icons/app/SandFlat.png" width="96" alt="Sand, Flat"></a> |
| Coral | <a href="../assets/icons/app/CoralDepth.png"><img src="../assets/icons/app/CoralDepth.png" width="96" alt="Coral, Depth"></a> | <a href="../assets/icons/app/CoralFlat.png"><img src="../assets/icons/app/CoralFlat.png" width="96" alt="Coral, Flat"></a> |
| Mint | <a href="../assets/icons/app/MintDepth.png"><img src="../assets/icons/app/MintDepth.png" width="96" alt="Mint, Depth"></a> | <a href="../assets/icons/app/MintFlat.png"><img src="../assets/icons/app/MintFlat.png" width="96" alt="Mint, Flat"></a> |
| Blush | <a href="../assets/icons/app/BlushDepth.png"><img src="../assets/icons/app/BlushDepth.png" width="96" alt="Blush, Depth"></a> | <a href="../assets/icons/app/BlushFlat.png"><img src="../assets/icons/app/BlushFlat.png" width="96" alt="Blush, Flat"></a> |
| Aqua | <a href="../assets/icons/app/AquaDepth.png"><img src="../assets/icons/app/AquaDepth.png" width="96" alt="Aqua, Depth"></a> | <a href="../assets/icons/app/AquaFlat.png"><img src="../assets/icons/app/AquaFlat.png" width="96" alt="Aqua, Flat"></a> |
| Peach | <a href="../assets/icons/app/PeachDepth.png"><img src="../assets/icons/app/PeachDepth.png" width="96" alt="Peach, Depth"></a> | <a href="../assets/icons/app/PeachFlat.png"><img src="../assets/icons/app/PeachFlat.png" width="96" alt="Peach, Flat"></a> |
| Periwinkle | <a href="../assets/icons/app/PeriwinkleDepth.png"><img src="../assets/icons/app/PeriwinkleDepth.png" width="96" alt="Periwinkle, Depth"></a> | <a href="../assets/icons/app/PeriwinkleFlat.png"><img src="../assets/icons/app/PeriwinkleFlat.png" width="96" alt="Periwinkle, Flat"></a> |
| Mocha | <a href="../assets/icons/app/MochaDepth.png"><img src="../assets/icons/app/MochaDepth.png" width="96" alt="Mocha, Depth"></a> | <a href="../assets/icons/app/MochaFlat.png"><img src="../assets/icons/app/MochaFlat.png" width="96" alt="Mocha, Flat"></a> |
| Cyan | <a href="../assets/icons/app/CyanDepth.png"><img src="../assets/icons/app/CyanDepth.png" width="96" alt="Cyan, Depth"></a> | <a href="../assets/icons/app/CyanFlat.png"><img src="../assets/icons/app/CyanFlat.png" width="96" alt="Cyan, Flat"></a> |
| Lime | <a href="../assets/icons/app/LimeDepth.png"><img src="../assets/icons/app/LimeDepth.png" width="96" alt="Lime, Depth"></a> | <a href="../assets/icons/app/LimeFlat.png"><img src="../assets/icons/app/LimeFlat.png" width="96" alt="Lime, Flat"></a> |
| Pink | <a href="../assets/icons/app/PinkDepth.png"><img src="../assets/icons/app/PinkDepth.png" width="96" alt="Pink, Depth"></a> | <a href="../assets/icons/app/PinkFlat.png"><img src="../assets/icons/app/PinkFlat.png" width="96" alt="Pink, Flat"></a> |

Liquid Glass versions aren't here: Liquid Glass is a live iOS material (it reacts to the
wallpaper and has its own Dark, Clear and Tinted looks), so it only works as a built-in icon.

Building Rakki yourself? Add any of them back to the build in `app.json` (the
`withGlassAlternateIcons` and `expo-alternate-app-icons` plugin lists) and to `PALETTES` in
`src/lib/appIcon.ts` (with a preview image in `assets/icons/previews/`).
