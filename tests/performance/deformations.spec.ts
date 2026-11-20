import { test, expect } from '@playwright/test';
test('renders the deformation comparison with the production parser and meshes', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.setViewportSize({ width: 1440, height: 1330 });
  await page.goto('/tests/fixtures/deformations.html');
  await page.waitForFunction(() => (window as any).deformationQA?.rendered >= 12);
  expect(await page.evaluate(() => (window as any).deformationQA.diagnostics)).toEqual([]);
  expect(errors).toEqual([]);
  // Every panel has actual nonwhite pixels, not just a successfully mounted canvas.
  const visible = await page.locator('canvas').evaluateAll(canvases => canvases.map(canvas => {
    const gl = canvas.getContext('webgl2')!;
    const pixels = new Uint8Array(canvas.width * canvas.height * 4);
    gl.readPixels(0,0,canvas.width,canvas.height,gl.RGBA,gl.UNSIGNED_BYTE,pixels);
    let colored = 0;
    for (let i=0;i<pixels.length;i+=4) if (pixels[i+3] > 0 && pixels[i+1] > pixels[i]+20) colored++;
    return colored;
  }));
  expect(visible).toHaveLength(12);
  visible.forEach(count => expect(count).toBeGreaterThan(100));
  await page.screenshot({ path: 'test-results/deformations.png', fullPage: true });
});
