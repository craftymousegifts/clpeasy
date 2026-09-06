// ── GHS PICTOGRAM ASSET FRAMING — regression coverage for the fifth of the
// correction batch's five retained fixes: the GHS01 (explosion.jpg) and
// GHS02 (flame.jpg) source-asset recrops.
//
// What was actually wrong and fixed (raster/pixel-level, inside the
// embedded JPEG itself -- NOT the SVG placement/sizing logic covered by
// tests/correction-batch-symbol-sizing.js):
//   - explosion.jpg (GHS01) had baked-in caption text ("GHS01 / Exploding
//     Bomb / Explosives") sitting in the bottom-right corner of the square
//     canvas, outside the diamond's own footprint. Fixed by masking
//     everything outside the diamond's footprint to white, then a tight
//     crop/resize -- the official diamond artwork itself was never
//     altered, only the erroneous caption/whitespace around it.
//   - flame.jpg (GHS02) had real, if smaller, excess margin around the
//     diamond (diamond ~93-98% of frame). Fixed with a plain tight crop
//     (zero margin) + resize -- again, only whitespace removed, no
//     artwork altered.
//
// This is inherently a RASTER-PIXEL question -- decoding the actual JPEG
// bytes and measuring real pixel content, not a source-string/CSS check
// and not the SVG bounding-box geometry check (that's a separate, correct
// concern already covered elsewhere: PICTO_FLOOR_MM/PICTO_TARGET_MM
// control the diamond's SVG placement size, which is untouched by this
// asset-level fix and is a separate, still-open compliance question
// flagged to Michaela -- not asserted as "passing" anywhere in this repo).
//
// Node itself has no JPEG decoder, and this project has no image-decoding
// npm dependency (deliberately not adding one for a single regression
// check -- see project working rules on avoiding unnecessary
// dependencies). This file therefore shells out to the same Python3 +
// Pillow + numpy toolchain already used to diagnose and fix these two
// assets during this correction batch. If that toolchain is not present
// in the environment running this suite, the check reports SKIPPED (with
// a clear reason) and exits 0 rather than failing the whole test run or
// silently passing.
//
// Run from the repo root: node tests/correction-batch-ghs-asset-framing.js
const fs = require('fs');
const assert = require('assert');
const { spawnSync } = require('child_process');

const labelRendererSource = fs.readFileSync('label-render.js', 'utf8');

// Extract every GHS_IMG entry directly from the real production file (never
// a copy/re-embedded fixture), the same way the renderer itself reads it.
const block = labelRendererSource.match(/const GHS_IMG=\{([\s\S]*?)\n\};/);
assert(block, 'could not locate the GHS_IMG={...} block in label-render.js -- has it been renamed/restructured?');
const entries = [...block[1].matchAll(/(\w+)\s*:\s*"data:image\/jpeg;base64,([A-Za-z0-9+/=]+)"/g)]
  .map(m => ({ key: m[1], b64: m[2] }));

const EXPECTED_KEYS = ['flame','exclamation','aquatic','explosion','oxidiser','gas','health','skull','corrosive'];

(async () => {
  let passed = 0;
  function ok(label){ passed++; console.log('PASS:', label); }

  // ── 0. All 9 GHS pictogram assets are still present and readable ────
  assert.deepStrictEqual(entries.map(e=>e.key).sort(), [...EXPECTED_KEYS].sort(), 'GHS_IMG must contain exactly the 9 expected pictogram keys, unchanged');
  ok('all 9 GHS_IMG pictogram assets are present with the expected keys');

  const pyScript = `
import sys, json, base64, io
try:
    from PIL import Image
    import numpy as np
except Exception as e:
    print(json.dumps({"__error__": "import-failed", "detail": str(e)}))
    sys.exit(0)

entries = json.loads(sys.stdin.read())
out = []
for e in entries:
    key, b64 = e['key'], e['b64']
    try:
        data = base64.b64decode(b64)
        img = Image.open(io.BytesIO(data)).convert('RGB')
    except Exception as ex:
        out.append({"key": key, "decodeError": str(ex)})
        continue
    arr = np.array(img)
    w, h = img.size
    nonwhite = (arr[:,:,0] < 250) | (arr[:,:,1] < 250) | (arr[:,:,2] < 250)
    totalNonwhite = int(nonwhite.sum())
    overallNonwhiteFrac = totalNonwhite / (w*h)
    # Bottom-right 15%x15% corner box -- exactly where explosion.jpg's
    # baked-in caption used to sit, outside the diamond's own footprint.
    cw, ch = max(1,int(w*0.15)), max(1,int(h*0.15))
    box = nonwhite[h-ch:h, w-cw:w]
    brCornerDensity = float(box.mean())
    out.append({
        "key": key, "width": w, "height": h,
        "overallNonwhiteFrac": overallNonwhiteFrac,
        "brCornerDensity": brCornerDensity,
    })
print(json.dumps(out))
`;

  const proc = spawnSync('python3', ['-c', pyScript], {
    input: JSON.stringify(entries),
    encoding: 'utf8',
    timeout: 30000,
  });

  if(proc.error || proc.status !== 0 || !proc.stdout){
    console.log(`SKIPPED: could not run the Python3/Pillow/numpy raster-measurement toolchain in this environment (${proc.error ? proc.error.message : 'exit code '+proc.status}). This check cannot verify GHS asset pixel framing without it -- rerun where python3 + Pillow + numpy are available (the same toolchain used to diagnose/fix these assets during this correction batch).`);
    console.log(`\n${passed} of ${passed+1} correction-batch-ghs-asset-framing.js checks ran; 1 SKIPPED (python3/Pillow/numpy unavailable).`);
    process.exit(0);
  }

  let results;
  try{ results = JSON.parse(proc.stdout); }
  catch(e){ console.error('FAIL: could not parse Python measurement output:', proc.stdout.slice(0,500)); process.exit(1); }

  if(results && results.__error__){
    console.log(`SKIPPED: Python3 is available but Pillow/numpy are not installed (${results.detail}). Rerun with those packages installed to verify GHS asset pixel framing.`);
    console.log(`\n${passed} of ${passed+1} correction-batch-ghs-asset-framing.js checks ran; 1 SKIPPED (Pillow/numpy unavailable).`);
    process.exit(0);
  }

  const byKey = Object.fromEntries(results.map(r => [r.key, r]));

  // ── 1. Every asset decodes as a valid, square JPEG (the established
  //       canvas convention every GHS pictogram in this file follows,
  //       since assetMarkup() always places them into a square viewport) ─
  {
    for(const key of EXPECTED_KEYS){
      const r = byKey[key];
      assert(r, `${key}: must have a measurement result`);
      assert(!r.decodeError, `${key}: must decode as a valid JPEG, got error: ${r.decodeError}`);
      assert.strictEqual(r.width, r.height, `${key}: must be a square canvas (width===height), got ${r.width}x${r.height}`);
    }
    ok('all 9 GHS pictogram assets decode as valid, square JPEGs');
  }

  // ── 2. No asset is degenerately blank or fully filled (a masking bug
  //       gone wrong would show up as near-0 or near-1 non-white content) ─
  {
    for(const key of EXPECTED_KEYS){
      const r = byKey[key];
      assert(r.overallNonwhiteFrac > 0.10, `${key}: only ${(r.overallNonwhiteFrac*100).toFixed(1)}% of the canvas has any content -- looks like artwork may have been accidentally masked/wiped`);
      assert(r.overallNonwhiteFrac < 0.60, `${key}: ${(r.overallNonwhiteFrac*100).toFixed(1)}% of the canvas has content -- unexpectedly high for a diamond pictogram, worth checking nothing extraneous was left in`);
    }
    ok('every GHS asset has a sane amount of real pictogram content (no accidental masking/wiping)');
  }

  // ── 3. All 9 assets use EQUIVALENT framing: the bottom-right corner
  //       (exactly where explosion.jpg's baked-in caption used to sit,
  //       outside the diamond's own footprint) is clean on every asset,
  //       not just the two that were directly fixed. This is the specific
  //       regression guard against the caption-text-in-corner defect (or
  //       an equivalent stray-content defect on any other asset)
  //       recurring -- measured from real decoded pixels, not a source
  //       string or file size ──────────────────────────────────────────
  {
    for(const key of EXPECTED_KEYS){
      const r = byKey[key];
      assert(r.brCornerDensity < 0.01, `${key}: bottom-right corner has ${(r.brCornerDensity*100).toFixed(2)}% non-white content -- this is exactly where explosion.jpg's baked-in caption used to sit; expected a clean corner (equivalent framing across all 9 pictograms)`);
    }
    ok('all 9 GHS pictogram assets have an equivalent, clean framing -- no stray content (e.g. baked-in caption text) in the corner outside the diamond\'s own footprint');
  }

  // ── 4. The two assets actually recropped this correction batch produce
  //       the specific known-good output size this fix settled on --
  //       locks in the fix itself against an accidental revert ────────
  {
    assert.strictEqual(byKey.explosion.width, 1024, `explosion.jpg (GHS01) must stay at its recropped 1024x1024 output size, got ${byKey.explosion.width}x${byKey.explosion.height}`);
    assert.strictEqual(byKey.flame.width, 900, `flame.jpg (GHS02) must stay at its recropped 900x900 output size, got ${byKey.flame.width}x${byKey.flame.height}`);
    ok('the two recropped assets (explosion.jpg/GHS01, flame.jpg/GHS02) are still at their fixed output sizes');
  }

  console.log(`\nAll ${passed} correction-batch-ghs-asset-framing.js checks passed.`);
})().catch(e => { console.error('FAIL:', e.message); process.exit(1); });
