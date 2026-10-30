// Automated checks for Silent Shadow. Run: node silent-shadow/test.js
const { chromium } = require('playwright');
const path = require('path');

(async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 960, height: 540 } });
  const errors = [];
  page.on('pageerror', e => errors.push(e.message));
  page.on('console', m => m.type() === 'error' && errors.push(m.text()));
  await page.goto('file://' + path.resolve(__dirname, 'index.html'));

  const results = await page.evaluate(() => {
    const S = __ss, out = [];
    const K0 = { left: false, right: false, jump: false, act: false };
    const P = () => S.player;
    const run = (k, n, cond) => { const kk = Object.assign({}, K0, k); S.setKeys(kk); S.sim(n, kk, cond); };
    const tp = (x, y) => { P().x = x; P().y = y; P().vx = P().vy = 0; };
    const check = (name, ok) => out.push([name, !!ok]);
    const G12 = 12 * 40 - 44, G14 = 14 * 40 - 44;

    // 1. Jump over the pit in level 1
    S.start(0); run({}, 30);
    let jumped = false;
    run({ right: true }, 600, () => {
      if (!jumped && P().x > 440) { S.setKeys({ right: true, jump: true }); jumped = true; }
      if (jumped && P().x > 480) S.setKeys({ right: true, jump: false });
      return P().x > 640;
    });
    check('L1: player crosses the pit alive', P().x > 640 && S.phase === 'playing');

    // 2. Push a box to the wall and climb it
    run({}, 20);
    run({ right: true }, 900, () => S.boxes[0].x >= 879);
    check('L1: box can be pushed to the wall', S.boxes[0].x >= 879);
    run({ right: true, jump: true }, 1); run({ right: true, jump: true }, 22); run({ right: true }, 25);
    run({ right: true, jump: true }, 25); run({ right: true }, 25);
    check('L1: player reaches the high platform with the box', P().y === 316);

    // 3. High wall is unreachable without the box
    S.start(0); S.sim(5, K0); tp(22 * 40 - 30, G12); S.sim(5, K0);
    run({ right: true, jump: true }, 30); run({ right: true }, 30);
    check('L1: wall is NOT climbable without the box', P().y === G12);

    // 4. Box on plate opens the door
    S.start(0); S.sim(30, K0); tp(33 * 40, G12); S.sim(20, K0);
    run({ right: true }, 700, () => S.boxes[1].x >= 38 * 40 - 1); run({}, 60);
    check('L1: box on plate opens the door', S.doors[0].open > 0.99);

    // 5. Spikes kill and respawn at the checkpoint
    S.start(0); S.sim(10, K0); tp(27 * 40 + 8, 8 * 40 - 44);
    S.sim(20, K0, () => S.phase === 'dying');
    check('L1: spikes kill the player', S.phase === 'dying');
    S.sim(200, K0, () => S.phase === 'playing');
    check('L1: player respawns', S.phase === 'playing' && S.save.deaths >= 1);

    // 6. Pull a box onto the plate (level 2)
    S.start(1); S.sim(30, K0);
    run({ left: true }, 10); run({ left: true, act: true }, 5);
    check('L2: box can be grabbed', !!P().grab);
    run({ right: true, act: true }, 600, () => S.boxes[0].x >= 279);
    run({}, 80);
    check('L2: pulling the box onto the plate opens the door', S.doors.find(d => d.id === 'a').open > 0.99);

    // 7. Two boxes / two plates (level 3), in the intended order
    S.start(2); S.sim(30, K0);
    tp(300, G14); run({}, 10);
    run({ right: true }, 900, () => S.boxes[1].x >= 799);
    tp(170, G14); run({}, 10);
    run({ right: true }, 900, () => S.boxes[0].x >= 679); run({}, 90);
    check('L3: both boxes on plates opens the door', S.doors[0].open > 0.99);

    // 8. Level 3 tower needs the box
    S.start(2); S.sim(30, K0); S.boxes[2].x = 10 * 40; tp(52.2 * 40, G14); S.sim(5, K0);
    run({ right: true, jump: true }, 40); run({ right: true }, 30);
    check('L3: platform A is NOT reachable without the box', P().y === G14);
    S.start(2); S.sim(30, K0); S.boxes[2].x = 53 * 40; S.sim(30, K0); tp(52 * 40 - 40, G14); S.sim(5, K0);
    run({ right: true, jump: true }, 20); run({ right: true }, 25);
    run({ right: true, jump: true }, 25); run({ right: true }, 25);
    check('L3: platform A is reachable with the box', P().y === 11 * 40 - 44);

    // 9. Exit finishes the level
    S.start(0); S.sim(5, K0); tp(57 * 40, G12); S.sim(5, K0);
    check('L1: reaching the exit finishes the level', S.phase === 'finishing');

    return out;
  });

  // Touch control check on a mobile viewport
  const ctx = await browser.newContext({ viewport: { width: 844, height: 390 }, hasTouch: true, isMobile: true });
  const mp = await ctx.newPage();
  mp.on('pageerror', e => errors.push(e.message));
  await mp.goto('file://' + path.resolve(__dirname, 'index.html'));
  await mp.tap('#mContinue');
  await mp.waitForTimeout(500);
  const x0 = await mp.evaluate(() => __ss.player.x);
  const box = await mp.locator('#tRight').boundingBox();
  const cdp = await ctx.newCDPSession(mp);
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: box.x + 20, y: box.y + 20, id: 1 }] });
  await mp.waitForTimeout(700);
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
  const x1 = await mp.evaluate(() => __ss.player.x);
  results.push(['Touch: right button moves the player', x1 > x0 + 50]);
  results.push(['No JavaScript errors', errors.length === 0]);

  let failed = 0;
  for (const [name, ok] of results) { console.log((ok ? 'PASS  ' : 'FAIL  ') + name); if (!ok) failed++; }
  if (errors.length) console.log(errors);
  console.log(`\n${results.length - failed}/${results.length} passed`);
  await browser.close();
  process.exit(failed ? 1 : 0);
})();
