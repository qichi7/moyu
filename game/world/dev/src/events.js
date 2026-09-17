"use strict";
// ============ 事件总线：逻辑层发事件，表现层订阅 ============
// 逻辑层不依赖音频/DOM（headless 测试可跑）；未注册监听时 emit 是 no-op

const _listeners = {};

function onEvent(name, fn) {
  (_listeners[name] = _listeners[name] || []).push(fn);
}

function emit(name, data) {
  const l = _listeners[name];
  if (l) for (const f of l) f(data);
}
