// CDP Input.dispatchMouseEvent "buttons" bitmask propagation:
// (1) mouseMoved during a drag reports buttons=1 even without "button",
// (2) explicit buttons: 0 is honored without falling back to "button",
// (3) mouseReleased preserves remaining pressed buttons, and bits beyond
// MouseButtonsValue (bits 0..2) are masked off.
(async function(/** @type {import('test_runner').TestRunner} */ testRunner) {
  const {dp} = await testRunner.startBlank(
      'Tests CDP Input.dispatchMouseEvent buttons bitmask handling');
  await dp.Runtime.enable();

  await dp.Runtime.evaluate({expression: `
    if (!document.body) {
      document.documentElement.appendChild(document.createElement('body'));
    }
    window.__log = [];
    const el = document.createElement('div');
    el.style.cssText =
        'position:absolute;left:10px;top:10px;width:100px;height:100px;';
    document.body.appendChild(el);
    for (const type of ['mousedown', 'mousemove', 'mouseup']) {
      el.addEventListener(type, (e) => {
        __log.push(type + ' button=' + e.button + ' buttons=' + e.buttons);
      });
    }
    0`});

  // 1. Drag move with buttons=1 and no "button"
  await dp.Input.dispatchMouseEvent(
      {type: 'mouseMoved', x: 30, y: 30, buttons: 1});
  // 2. Explicit buttons=0 with button='left' must stay 0
  await dp.Input.dispatchMouseEvent(
      {type: 'mousePressed', x: 30, y: 30, button: 'left', buttons: 0, clickCount: 1});
  // 3. Two buttons pressed (left+right=3), then releasing left leaves right (2)
  await dp.Input.dispatchMouseEvent(
      {type: 'mousePressed', x: 30, y: 30, button: 'right', buttons: 3, clickCount: 1});
  await dp.Input.dispatchMouseEvent(
      {type: 'mouseReleased', x: 30, y: 30, button: 'left', buttons: 2, clickCount: 1});
  // 4. Out-of-range bits (back=8, forward=16) masked off: 1 | 8 | 16 -> 1
  await dp.Input.dispatchMouseEvent(
      {type: 'mouseMoved', x: 40, y: 40, buttons: 25});

  const {result} = await dp.Runtime.evaluate(
      {expression: 'JSON.stringify(window.__log)'});
  for (const line of JSON.parse(result.value)) {
    testRunner.log(line);
  }
  testRunner.completeTest();
});
