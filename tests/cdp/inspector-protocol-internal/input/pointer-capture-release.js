// https://w3c.github.io/pointerevents/#pointer-capture: releasePointerCapture()
// only clears the pending capture target override, so lostpointercapture
// fires from "process pending pointer capture" before the next pointer event
// — the pointermove that follows goes to the hit-test target again.
(async function(/** @type {import('test_runner').TestRunner} */ testRunner) {
  const {dp} = await testRunner.startBlank(
      'Tests pointer capture release with releasePointerCapture');
  await dp.Runtime.enable();

  await dp.Runtime.evaluate({expression: `
    window.__log = [];
    const el = document.createElement('div');
    el.id = 'target';
    el.style.cssText =
        'position:absolute;left:10px;top:10px;width:50px;height:50px;';
    document.body.appendChild(el);
    let released = false;
    el.addEventListener('pointerdown', (e) => {
      el.setPointerCapture(e.pointerId);
      __log.push('pointerdown target=' + e.target.id);
    });
    el.addEventListener('gotpointercapture', (e) => {
      __log.push('gotpointercapture bubbles=' + e.bubbles
                 + ' composed=' + e.composed
                 + ' cancelable=' + e.cancelable
                 + ' pointerType=' + e.pointerType);
    });
    el.addEventListener('pointermove', (e) => {
      __log.push('pointermove target=' + (e.target.id || 'document'));
      if (!released) {
        released = true;
        el.releasePointerCapture(e.pointerId);
        __log.push('hasPointerCapture after release = '
                   + el.hasPointerCapture(e.pointerId));
      }
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
  await dp.Input.dispatchMouseEvent({type: 'mouseMoved', x: 30, y: 30});
  await dp.Input.dispatchMouseEvent({type: 'mouseMoved', x: 200, y: 200});

  const {result} = await dp.Runtime.evaluate(
      {expression: 'JSON.stringify(window.__log)'});
  for (const line of JSON.parse(result.value)) {
    testRunner.log(line);
  }
  testRunner.completeTest();
});