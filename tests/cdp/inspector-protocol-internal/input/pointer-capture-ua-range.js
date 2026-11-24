// UA-internal capture used by <input type=range> drag must not leak
// gotpointercapture/lostpointercapture or hasPointerCapture() to script,
// and calling releasePointerCapture() from page script must not break the drag.
(async function(/** @type {import('test_runner').TestRunner} */ testRunner) {
  const {dp} = await testRunner.startBlank(
      'Tests UA-internal range drag capture isolation');
  await dp.Runtime.enable();

  await dp.Runtime.evaluate({expression: `
    if (!document.body) {
      document.documentElement.appendChild(document.createElement('body'));
    }
    document.body.style.margin = '0';
    window.__log = [];
    const r = document.createElement('input');
    r.type = 'range';
    r.min = 0;
    r.max = 100;
    r.value = 0;
    r.style.cssText = 'position:absolute;left:0;top:0;width:200px;height:20px;margin:0';
    document.body.appendChild(r);
    document.addEventListener('gotpointercapture', () => {
      __log.push('gotpointercapture leaked');
    });
    document.addEventListener('lostpointercapture', () => {
      __log.push('lostpointercapture leaked');
    });
    r.addEventListener('mousedown', () => {
      __log.push('mousedown hasCapture=' + r.hasPointerCapture(1));
      r.releasePointerCapture(1);
    });
    0`});

  await dp.Input.dispatchMouseEvent(
      {type: 'mousePressed', x: 5, y: 10, button: 'left', clickCount: 1});
  await dp.Input.dispatchMouseEvent({type: 'mouseMoved', x: 150, y: 10});
  await dp.Input.dispatchMouseEvent({type: 'mouseMoved', x: 195, y: 60});
  await dp.Input.dispatchMouseEvent(
      {type: 'mouseReleased', x: 195, y: 60, button: 'left', clickCount: 1});
  await dp.Runtime.evaluate({expression: `
    __log.push('final value > 50: ' + (Number(r.value) > 50));
    0`});

  const {result} = await dp.Runtime.evaluate(
      {expression: 'JSON.stringify(window.__log)'});
  for (const line of JSON.parse(result.value)) {
    testRunner.log(line);
  }
  testRunner.completeTest();
});
