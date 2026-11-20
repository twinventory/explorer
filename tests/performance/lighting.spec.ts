import { expect, test } from '@playwright/test';

for (const csg of [false, true]) {
  test(`sealed ${csg ? 'CSG' : 'panel'} enclosure has dim ambient visibility and brightens with an interior light`, async ({ page }) => {
    let ambientBrightness = 0;
    for (const lit of [false, true]) {
      await page.goto(`/tests/fixtures/lighting.html?${csg ? 'csg&' : ''}${lit ? 'lit' : ''}`);
      await page.waitForFunction(() => Boolean((window as any).qa));
      const result = await page.evaluate(() => (window as any).qa);
      expect(result.lights.sort()).toEqual(lit ? ['AmbientLight', 'PointLight'] : ['AmbientLight']);
      expect(result.errors).toEqual([]);
      expect(result.csgCount).toBe(csg ? 1 : 0);
      if (lit) expect(result.pixel[0]).toBeGreaterThan(ambientBrightness + 50);
      else {
        ambientBrightness = result.pixel[0];
        expect(ambientBrightness).toBeGreaterThan(20);
        expect(result.maxRGB).toBeLessThan(120);
        // Ambient fill preserves a neutral color inside the shell.
        expect(result.pixel[1]).toBe(ambientBrightness);
        expect(result.pixel[2]).toBe(ambientBrightness);
      }
    }
  });
}

for (const csg of [false, true]) {
  test(`external point light cannot leak through a 1 cm ${csg ? 'CSG' : 'panel'} enclosure`, async ({ page }) => {
    let ambientBrightness = 0;
    for (const external of [false, true]) {
      await page.goto(`/tests/fixtures/lighting.html?thin&${csg ? 'csg&' : ''}${external ? 'external' : ''}`);
      await page.waitForFunction(() => Boolean((window as any).qa));
      const result = await page.evaluate(() => (window as any).qa);
      expect(result.errors).toEqual([]);
      expect(result.csgCount).toBe(csg ? 1 : 0);
      expect(result.lights.sort()).toEqual(external ? ['AmbientLight', 'PointLight'] : ['AmbientLight']);
      if (external) {
        expect(result.pixel[0]).toBeLessThanOrEqual(ambientBrightness + 2);
        expect(result.maxRGB).toBeLessThanOrEqual(ambientBrightness + 2);
      } else ambientBrightness = result.pixel[0];
    }
    // Prove this receiving wall is illuminated if the external source's shadows are removed.
    await page.goto(`/tests/fixtures/lighting.html?thin&external&unshadowed&${csg ? 'csg' : ''}`);
    await page.waitForFunction(() => Boolean((window as any).qa));
    const unshadowed = await page.evaluate(() => (window as any).qa);
    expect(unshadowed.pixel[0]).toBeGreaterThan(ambientBrightness + 20);
  });
}

test('point-light shadows do not produce acne on a smooth receiving surface', async ({ page }) => {
  let correctedRoughness = 0;
  for (const zero of [false, true]) {
    await page.goto(`/tests/fixtures/lighting.html?smooth&lit&${zero ? 'zero' : ''}`);
    await page.waitForFunction(() => Boolean((window as any).qa));
    const result = await page.evaluate(() => (window as any).qa);
    expect(result.errors).toEqual([]);
    if (!zero) {
      correctedRoughness = result.roughness;
      expect(result.pixel[0]).toBeGreaterThan(100);
      expect(correctedRoughness).toBeLessThan(0.01);
    } else expect(result.roughness).toBeGreaterThan(correctedRoughness + 0.05);
  }
});

for (const lit of [false, true]) {
  test(`original lighting is an opt-in visibility override ${lit ? 'with' : 'without'} document lights`, async ({ page }) => {
    await page.goto(`/tests/fixtures/lighting.html?${lit ? 'lit' : ''}`);
    await page.waitForFunction(() => Boolean((window as any).qa));
    const before = await page.evaluate(() => (window as any).qa);
    const toggle = page.locator('.visibility-lighting-toggle');
    await expect(toggle).toHaveAttribute('aria-pressed', 'false');
    await toggle.focus();
    await page.keyboard.press('Space');
    await expect(toggle).toHaveAttribute('aria-pressed', 'true');
    await page.waitForFunction(() => (window as any).qa?.visibilityLighting === true);
    const enabled = await page.evaluate(() => (window as any).qa);
    expect(enabled.lights.sort()).toEqual(lit
      ? ['AmbientLight', 'DirectionalLight', 'HemisphereLight', 'PointLight']
      : ['AmbientLight', 'DirectionalLight', 'HemisphereLight']);
    expect(enabled.lightSettings.filter((light: any) => light.type !== 'PointLight')).toEqual([
      { type: 'AmbientLight', intensity: 0.45, castShadow: false },
      { type: 'HemisphereLight', intensity: 0.85, castShadow: false },
      { type: 'DirectionalLight', intensity: 2.1, castShadow: false },
    ]);
    expect(enabled.lightSettings.filter((light: any) => light.type === 'PointLight')).toEqual(
      before.lightSettings.filter((light: any) => light.type === 'PointLight'));
    if (!lit) expect(enabled.pixel[0]).toBeGreaterThan(before.pixel[0] + 30);
    await toggle.click();
    await page.waitForFunction(() => (window as any).qa?.visibilityLighting === false);
    const disabled = await page.evaluate(() => (window as any).qa);
    expect(disabled.lights.sort()).toEqual(before.lights.sort());
    expect(disabled.pixel).toEqual(before.pixel);
  });
}
