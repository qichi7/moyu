"use strict";
// ============ 事件总线：逻辑层 emit，表现层订阅；headless 下无订阅者即空转 ============
const _evListeners = {};

function onEvent(name, fn) {
  if (!_evListeners[name]) _evListeners[name] = [];
  _evListeners[name].push(fn);
}

function emit(name, data) {
  const l = _evListeners[name];
  if (!l) return;
  for (const fn of l.slice()) fn(data);
}
