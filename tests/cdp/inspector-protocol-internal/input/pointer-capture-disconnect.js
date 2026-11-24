// https://w3c.github.io/pointerevents/#implicit-release-after-node-removal:
// removing the capture target clears the pending capture target override, and
// the next "process pending pointer capture" fires lostpointercapture at the
// document — hasPointerCapture() reports false immediately after the removal.
(async function(/** @type {import('test_runner').TestRunner} */ testRunner) {
  const {dp} = await testRunner.startBlank(
      'Tests implicit pointer capture release after node removal');
  await dp.Runtime.enable();

  await dp.Runtime.evaluate({expression: `
    window.__log = [];
    const el = document.createElement('div');
    el.id = 'target';
    el.style.cssText =
        'position:absolute;left:10px;top:10px;width:50px;height:50px;';
    document.body.appendChild(el);
    el.addEventListener('pointerdown', (e) => el.setPointerCapture(e.pointerId));
    document.addEventListener('lostpointercapture', (e) => {
      __log.push('lostpointercapture at '
                 + (e.target === document ? 'document' : e.target.nodeName));
    });
    document.addEventListener('pointermove', (e) => {
      __log.push('pointermove at ' + e.target.nodeName + ' hasCapture='
                 + el.hasPointerCapture(e.pointerId));
    });
    document.addEventListener('pointerup', (e) => __log.push('pointerup'));
    0`});

  await dp.Input.dispatchMouseEvent(
      {type: 'mousePressed', x: 20, y: 20, button: 'left', clickCount: 1});
  await dp.Input.dispatchMouseEvent({type: 'mouseMoved', x: 25, y: 25});
  await dp.Runtime.evaluate({expression: `
    el.remove();
    __log.push('-- removed, hasCapture=' + el.hasPointerCapture(1));
    0`});
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
