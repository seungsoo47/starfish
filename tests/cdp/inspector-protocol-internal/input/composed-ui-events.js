// https://w3c.github.io/uievents/#events-mouseevents
// https://w3c.github.io/pointerevents/#pointer-event-types
// Trusted mouse and pointer events are composed so they propagate across open
// shadow boundaries to the shadow host, whereas mouseenter/mouseleave have
// composed=false per UI Events.
(async function(/** @type {import('test_runner').TestRunner} */ testRunner) {
  const {dp} = await testRunner.startBlank(
      'Tests composed flag on trusted mouse and pointer events across shadow DOM');
  await dp.Runtime.enable();

  await dp.Runtime.evaluate({expression: `
    if (!document.body) {
      document.documentElement.appendChild(document.createElement('body'));
    }
    window.__log = [];
    const host = document.createElement('div');
    host.id = 'host';
    host.style.cssText =
        'position:absolute;left:10px;top:10px;width:80px;height:80px;';
    document.body.appendChild(host);
    const root = host.attachShadow({mode: 'open'});
    const inner = document.createElement('div');
    inner.id = 'inner';
    inner.style.cssText = 'width:80px;height:80px;';
    root.appendChild(inner);

    inner.addEventListener('mouseenter', (e) => {
      __log.push('inner mouseenter composed=' + e.composed);
    });
    host.addEventListener('mousedown', (e) => {
      __log.push('host mousedown target=' + e.target.id + ' composed=' + e.composed);
    });
    host.addEventListener('pointerdown', (e) => {
      __log.push('host pointerdown target=' + e.target.id + ' composed=' + e.composed);
    });
    0`});

  await dp.Input.dispatchMouseEvent({type: 'mouseMoved', x: 30, y: 30});
  await dp.Input.dispatchMouseEvent(
      {type: 'mousePressed', x: 30, y: 30, button: 'left', clickCount: 1});

  const {result} = await dp.Runtime.evaluate(
      {expression: 'JSON.stringify(window.__log)'});
  for (const line of JSON.parse(result.value)) {
    testRunner.log(line);
  }
  testRunner.completeTest();
});
