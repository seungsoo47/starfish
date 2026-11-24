// https://w3c.github.io/pointerevents/#pointer-capture: setPointerCapture()
// only moves the pending capture target override, so gotpointercapture fires
// from "process pending pointer capture" before the next pointer event, not
// inside the pointerdown handler. The capture also retargets moves outside
// the element's box, and pointerup releases the capture implicitly.
(async function(/** @type {import('test_runner').TestRunner} */ testRunner) {
  const {dp} = await testRunner.startBlank(
      'Tests pointer capture event order with setPointerCapture');
  await dp.Runtime.enable();

  await dp.Runtime.evaluate({expression: `
    if (!document.body) {
      document.documentElement.appendChild(document.createElement('body'));
    }
    window.__log = [];
    const el = document.createElement('div');
    el.id = 'target';
    el.style.cssText =
        'position:absolute;left:10px;top:10px;width:50px;height:50px;';
    document.body.appendChild(el);
    for (const type of ['pointerdown', 'pointermove', 'pointerup']) {
      el.addEventListener(type, (e) => {
        __log.push(type + ' target=' + (e.target.id || 'document')
                   + ' pointerType=' + e.pointerType);
      });
    }
    el.addEventListener('pointerdown', (e) => {
      el.setPointerCapture(e.pointerId);
      __log.push('hasPointerCapture in pointerdown = '
                 + el.hasPointerCapture(e.pointerId));
    });
    el.addEventListener('gotpointercapture', (e) => {
      __log.push('gotpointercapture bubbles=' + e.bubbles
                 + ' composed=' + e.composed
                 + ' cancelable=' + e.cancelable
                 + ' pointerType=' + e.pointerType);
    });
    el.addEventListener('lostpointercapture', (e) => {
      __log.push('lostpointercapture bubbles=' + e.bubbles
                 + ' composed=' + e.composed
                 + ' cancelable=' + e.cancelable
                 + ' pointerType=' + e.pointerType);
    });
    0`});

  await dp.Input.dispatchMouseEvent(
      {type: 'mousePressed', x: 20, y: 20, button: 'left', clickCount: 1});
  await dp.Input.dispatchMouseEvent({type: 'mouseMoved', x: 200, y: 200});
  await dp.Input.dispatchMouseEvent(
      {type: 'mouseReleased', x: 200, y: 200, button: 'left', clickCount: 1});

  const {result} = await dp.Runtime.evaluate(
      {expression: 'JSON.stringify(window.__log)'});
  for (const line of JSON.parse(result.value)) {
    testRunner.log(line);
  }
  testRunner.completeTest();
});
