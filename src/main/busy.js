// How busy each part of a picture is: a grid of digits, 0 (flat: an empty margin, a blank page) to 9 (dense text, a
// busy picture). Jarvis stands where the least would be hidden. The picture itself is never kept.
/** pixels: 4 bytes a pixel (any channel order with alpha last), top row first. Returns cols × rows digits, row by row. */
function busyness(pixels, w, h, cols, rows) {
  const STEP = 2;
  if (!(cols > 0 && rows > 0) || w < cols * STEP * 2 || h < rows * STEP * 2 || pixels.length < w * h * 4) return '0'.repeat(Math.max(0, cols * rows));
  const lum = (x, y) => { const i = (y * w + x) * 4; return (pixels[i] * 3 + pixels[i + 1] * 6 + pixels[i + 2]) / 10; };
  let out = '';
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      const x0 = Math.floor((c * w) / cols), x1 = Math.floor(((c + 1) * w) / cols), y0 = Math.floor((r * h) / rows), y1 = Math.floor(((r + 1) * h) / rows);
      let sum = 0, n = 0;
      for (let y = y0; y + STEP < y1; y += STEP) for (let x = x0; x + STEP < x1; x += STEP) {
        const a = lum(x, y);
        sum += Math.min(80, Math.abs(a - lum(x + STEP, y)) + Math.abs(a - lum(x, y + STEP))); n++;
      }
      const mean = n ? sum / n : 0;
      out += String(Math.max(0, Math.min(9, Math.round(Math.sqrt(mean / 2.2) * 3))));
    }
  }
  return out;
}
module.exports = { busyness };
