// ==UserScript==
// @name         溺水小龟烂梗助手
// @namespace    https://www.douyu.com/9765366
// @version      0.4.0
// @description  在斗鱼直播间搜索、复制、填入和一键发送小龟烂梗
// @author       小龟烂梗补给站
// @match        https://www.douyu.com/*
// @homepageURL  https://9765366.cn/
// @downloadURL  https://9765366.cn/userscripts/nishuixiaogui-meme-helper.user.js
// @updateURL    https://9765366.cn/userscripts/nishuixiaogui-meme-helper.user.js
// @grant        GM_xmlhttpRequest
// @grant        GM_addStyle
// @grant        GM_getValue
// @grant        GM_setValue
// @grant        GM_registerMenuCommand
// @connect      127.0.0.1
// @connect      localhost
// @connect      9765366.cn
// @run-at       document-idle
// @license      MIT
// ==/UserScript==

(function () {
  'use strict';

  const roomMatch = location.pathname.match(/^\/(?:room\/)?(\d+)(?:\/|$)/);
  if (!roomMatch) return;

  const CONFIG = {
    roomId: roomMatch[1],
    apiBase: GM_getValue('apiBase', 'http://127.0.0.1:4000').replace(/\/$/, ''),
    cooldownMs: 10000,
  };
  const POSITION_KEYS = {
    launcher: 'xiaoguiLauncherPosition',
    panel: 'xiaoguiPanelPosition',
  };

  function request(method, path) {
    return new Promise(function (resolve, reject) {
      GM_xmlhttpRequest({
        method: method,
        url: CONFIG.apiBase + path,
        headers: { 'Content-Type': 'application/json' },
        timeout: 8000,
        onload: function (response) {
          if (response.status < 200 || response.status >= 300) {
            reject(new Error('HTTP ' + response.status));
            return;
          }
          try {
            resolve(JSON.parse(response.responseText));
          } catch (error) {
            reject(error);
          }
        },
        onerror: reject,
        ontimeout: function () { reject(new Error('请求超时')); },
      });
    });
  }

  function queryDeep(selector, root) {
    const scope = root || document;
    const direct = scope.querySelector && scope.querySelector(selector);
    if (direct) return direct;
    const elements = scope.querySelectorAll ? scope.querySelectorAll('*') : [];
    for (const element of elements) {
      if (element.shadowRoot) {
        const found = queryDeep(selector, element.shadowRoot);
        if (found) return found;
      }
    }
    return null;
  }

  function make(tag, className, text) {
    const element = document.createElement(tag);
    if (className) element.className = className;
    if (text !== undefined) element.textContent = text;
    return element;
  }

  function clampPosition(element, position) {
    const rect = element.getBoundingClientRect();
    const width = rect.width || element.offsetWidth || 1;
    const height = rect.height || element.offsetHeight || 1;
    return {
      x: Math.max(8, Math.min(window.innerWidth - width - 8, Number(position.x) || 8)),
      y: Math.max(8, Math.min(window.innerHeight - height - 8, Number(position.y) || 8)),
    };
  }

  function setPosition(element, position) {
    const next = clampPosition(element, position);
    element.style.left = next.x + 'px';
    element.style.top = next.y + 'px';
    element.style.right = 'auto';
    element.style.bottom = 'auto';
    return next;
  }

  function savedPosition(key) {
    const value = GM_getValue(key, null);
    return value && Number.isFinite(Number(value.x)) && Number.isFinite(Number(value.y)) ? value : null;
  }

  const launcher = make('button', 'xg-launcher', '🐢 小龟烂梗');
  launcher.type = 'button';
  launcher.title = '点击打开，按住可拖动';
  const panel = make('section', 'xg-panel');
  panel.setAttribute('aria-label', '溺水小龟烂梗助手');

  const header = make('header', 'xg-header');
  const titleWrap = make('div');
  titleWrap.append(make('strong', '', '小龟烂梗助手'), make('small', '', '当前房间 ' + CONFIG.roomId + ' · 按住标题可拖动'));
  const headerActions = make('div', 'xg-header-actions');
  const hideButton = make('button', 'xg-hide', '本页隐藏');
  hideButton.type = 'button';
  const closeButton = make('button', 'xg-close', '×');
  closeButton.type = 'button';
  closeButton.setAttribute('aria-label', '收起');
  headerActions.append(hideButton, closeButton);
  header.append(titleWrap, headerActions);

  const searchRow = make('div', 'xg-search');
  const searchInput = make('input');
  searchInput.type = 'search';
  searchInput.placeholder = '搜一句烂梗……';
  searchInput.maxLength = 60;
  const searchButton = make('button', 'xg-search-button', '搜索');
  searchButton.type = 'button';
  searchRow.append(searchInput, searchButton);

  const status = make('p', 'xg-status', '输入关键词，从小龟烂梗库搜索。');
  const results = make('div', 'xg-results');
  panel.append(header, searchRow, status, results);
  document.body.append(launcher, panel);

  let cooldownUntil = 0;
  let cooldownTimer = 0;
  let pageHidden = false;
  let suppressLauncherClick = false;

  function defaultLauncherPosition() {
    return {
      x: window.innerWidth - launcher.offsetWidth - 18,
      y: window.innerHeight - launcher.offsetHeight - 158,
    };
  }

  function defaultPanelPosition() {
    return {
      x: window.innerWidth - panel.offsetWidth - 18,
      y: Math.max(14, window.innerHeight - panel.offsetHeight - 210),
    };
  }

  function applyLauncherPosition() {
    return setPosition(launcher, savedPosition(POSITION_KEYS.launcher) || defaultLauncherPosition());
  }

  function applyPanelPosition() {
    return setPosition(panel, savedPosition(POSITION_KEYS.panel) || defaultPanelPosition());
  }

  function setPageHidden(hidden) {
    pageHidden = hidden;
    panel.classList.remove('is-open');
    launcher.classList.toggle('is-hidden', hidden);
    if (!hidden) applyLauncherPosition();
  }

  function makeDraggable(handle, element, storageKey, ignoreControls) {
    let dragState = null;

    handle.addEventListener('pointerdown', function (event) {
      if (event.button !== 0 || (ignoreControls && event.target.closest('button, input, select, textarea, a'))) return;
      const rect = element.getBoundingClientRect();
      dragState = {
        pointerId: event.pointerId,
        startX: event.clientX,
        startY: event.clientY,
        elementX: rect.left,
        elementY: rect.top,
        moved: false,
      };
      handle.setPointerCapture(event.pointerId);
      element.classList.add('is-dragging');
    });

    handle.addEventListener('pointermove', function (event) {
      if (!dragState || dragState.pointerId !== event.pointerId) return;
      const dx = event.clientX - dragState.startX;
      const dy = event.clientY - dragState.startY;
      if (!dragState.moved && Math.hypot(dx, dy) < 5) return;
      dragState.moved = true;
      event.preventDefault();
      setPosition(element, { x: dragState.elementX + dx, y: dragState.elementY + dy });
    });

    function finishDrag(event) {
      if (!dragState || dragState.pointerId !== event.pointerId) return;
      const moved = dragState.moved;
      dragState = null;
      element.classList.remove('is-dragging');
      if (handle.hasPointerCapture(event.pointerId)) handle.releasePointerCapture(event.pointerId);
      if (moved) {
        const rect = element.getBoundingClientRect();
        GM_setValue(storageKey, { x: Math.round(rect.left), y: Math.round(rect.top) });
        if (element === launcher) {
          suppressLauncherClick = true;
          window.setTimeout(function () { suppressLauncherClick = false; }, 80);
        }
      }
    }

    handle.addEventListener('pointerup', finishDrag);
    handle.addEventListener('pointercancel', finishDrag);
  }

  function showStatus(message, isError) {
    status.textContent = message;
    status.classList.toggle('is-error', Boolean(isError));
  }

  function setChatText(text) {
    const chatInput = queryDeep('.ChatSend-txt');
    if (!chatInput) {
      showStatus('没有找到斗鱼弹幕输入框，请刷新直播间后重试。', true);
      return false;
    }
    chatInput.focus();
    if ('value' in chatInput) chatInput.value = text;
    else chatInput.textContent = text;
    chatInput.dispatchEvent(new InputEvent('input', { bubbles: true, inputType: 'insertText', data: text }));
    chatInput.dispatchEvent(new Event('change', { bubbles: true }));
    return true;
  }

  async function addCopyCount(id) {
    try {
      await request('POST', '/api/memes/' + encodeURIComponent(id) + '/copy');
    } catch (error) {
      console.warn('[小龟烂梗助手] 复制计数失败', error);
    }
  }

  async function copyText(item) {
    try {
      await navigator.clipboard.writeText(item.text);
    } catch (_) {
      const textarea = make('textarea');
      textarea.value = item.text;
      textarea.style.position = 'fixed';
      textarea.style.opacity = '0';
      document.body.appendChild(textarea);
      textarea.select();
      document.execCommand('copy');
      textarea.remove();
    }
    void addCopyCount(item.id);
    showStatus('已复制：' + item.text);
  }

  function fillText(item) {
    if (setChatText(item.text)) showStatus('已填入弹幕框，确认无误后再发送。');
  }

  function updateCooldown(button) {
    window.clearInterval(cooldownTimer);
    function tick() {
      const remain = Math.max(0, cooldownUntil - Date.now());
      if (!remain) {
        button.disabled = false;
        button.textContent = '发送';
        window.clearInterval(cooldownTimer);
        return;
      }
      button.disabled = true;
      button.textContent = Math.ceil(remain / 1000) + 's';
    }
    tick();
    cooldownTimer = window.setInterval(tick, 250);
  }

  function sendText(item, button) {
    if (Date.now() < cooldownUntil) {
      updateCooldown(button);
      showStatus('发送冷却中，请稍等。', true);
      return;
    }
    if (!setChatText(item.text)) return;
    const sendButton = queryDeep('.ChatSend-button');
    if (!sendButton) {
      showStatus('已填入，但没有找到发送按钮，请手动发送。', true);
      return;
    }
    window.setTimeout(function () {
      sendButton.click();
      cooldownUntil = Date.now() + CONFIG.cooldownMs;
      updateCooldown(button);
      void addCopyCount(item.id);
      showStatus('已发送，10 秒后可以再次一键发送。');
    }, 80);
  }

  function render(items) {
    results.replaceChildren();
    if (!items.length) {
      results.append(make('div', 'xg-empty', '没搜到，换个关键词试试。'));
      return;
    }
    items.forEach(function (item) {
      const card = make('article', 'xg-card');
      const copyButton = make('button', 'xg-meme-text', item.text);
      copyButton.type = 'button';
      copyButton.title = '点击复制';
      copyButton.addEventListener('click', function () { void copyText(item); });
      const meta = make('div', 'xg-meta');
      meta.append(make('span', '', '#' + item.category), make('span', '', '复制 ' + (item.copyCount || 0)));
      const actions = make('div', 'xg-actions');
      const fillButton = make('button', 'xg-fill', '填入');
      const sendButton = make('button', 'xg-send', '发送');
      fillButton.type = 'button';
      sendButton.type = 'button';
      fillButton.addEventListener('click', function () { fillText(item); });
      sendButton.addEventListener('click', function () { sendText(item, sendButton); });
      actions.append(fillButton, sendButton);
      card.append(copyButton, meta, actions);
      results.append(card);
    });
  }

  async function search() {
    const query = searchInput.value.trim();
    searchButton.disabled = true;
    showStatus(query ? '正在搜索“' + query + '”……' : '正在加载热门烂梗……');
    try {
      const data = await request('GET', '/api/memes?sort=popular&pageSize=50&query=' + encodeURIComponent(query));
      render(data.items || []);
      showStatus('找到 ' + (data.total || 0) + ' 条，点文字复制，也可以填入或发送。');
    } catch (error) {
      console.error('[小龟烂梗助手] 搜索失败', error);
      showStatus('暂时连接不到烂梗库，请稍后再试，或在油猴菜单中检查服务地址。', true);
    } finally {
      searchButton.disabled = false;
    }
  }

  launcher.addEventListener('click', function () {
    if (suppressLauncherClick || pageHidden) return;
    panel.classList.toggle('is-open');
    if (panel.classList.contains('is-open')) {
      window.requestAnimationFrame(function () {
        applyPanelPosition();
        if (!results.children.length) void search();
      });
    }
  });
  closeButton.addEventListener('click', function () { panel.classList.remove('is-open'); });
  hideButton.addEventListener('click', function () { setPageHidden(true); });
  searchButton.addEventListener('click', function () { void search(); });
  searchInput.addEventListener('keydown', function (event) {
    if (event.key === 'Enter') {
      event.preventDefault();
      void search();
    }
  });

  GM_registerMenuCommand('隐藏 / 恢复小龟助手', function () {
    setPageHidden(!pageHidden);
  });
  GM_registerMenuCommand('重置助手位置', function () {
    GM_setValue(POSITION_KEYS.launcher, null);
    GM_setValue(POSITION_KEYS.panel, null);
    applyLauncherPosition();
    if (panel.classList.contains('is-open')) applyPanelPosition();
    window.alert('小龟助手已回到默认位置。');
  });
  GM_registerMenuCommand('设置小龟助手服务地址', function () {
    const next = window.prompt('请输入小龟助手服务地址；本地调试默认为 http://127.0.0.1:4000', CONFIG.apiBase);
    if (!next) return;
    GM_setValue('apiBase', next.trim().replace(/\/$/, ''));
    window.alert('服务地址已保存，刷新斗鱼直播间后生效。');
  });

  GM_addStyle([
    '.xg-launcher{position:fixed;z-index:2147483646;touch-action:none;user-select:none;border:1px solid #171410;border-radius:999px;padding:10px 15px;background:#f3ce49;color:#171410;box-shadow:4px 4px 0 #171410;font:800 13px/1.2 system-ui;cursor:grab}',
    '.xg-launcher.is-hidden{display:none}.xg-launcher.is-dragging{cursor:grabbing;box-shadow:2px 2px 0 #171410}',
    '.xg-panel{display:none;position:fixed;z-index:2147483647;width:min(390px,calc(100vw - 28px));max-height:min(620px,72vh);overflow:hidden;background:#fffaf0;color:#171410;border:1px solid #171410;box-shadow:10px 10px 0 #ff5c35;font:14px/1.5 system-ui}',
    '.xg-panel.is-open{display:flex;flex-direction:column}.xg-panel.is-dragging{box-shadow:5px 5px 0 #ff5c35}',
    '.xg-header{display:flex;align-items:center;justify-content:space-between;gap:10px;padding:12px 12px 12px 16px;background:#f3ce49;border-bottom:1px solid #171410;touch-action:none;user-select:none;cursor:grab}',
    '.xg-panel.is-dragging .xg-header{cursor:grabbing}.xg-header strong,.xg-header small{display:block}.xg-header small{margin-top:2px;font-size:10px;opacity:.65}',
    '.xg-header-actions{display:flex;align-items:center;gap:4px}.xg-hide{border:1px solid #171410;border-radius:999px;padding:5px 8px;background:rgba(255,255,255,.45);font-size:10px;cursor:pointer}',
    '.xg-close{border:0;background:transparent;font-size:26px;line-height:1;cursor:pointer}',
    '.xg-search{display:flex;gap:8px;padding:12px;border-bottom:1px solid rgba(23,20,16,.18)}',
    '.xg-search input{min-width:0;flex:1;border:1px solid #171410;padding:9px 10px;background:white;color:#171410}',
    '.xg-search button{border:1px solid #171410;padding:8px 13px;background:#171410;color:white;cursor:pointer}',
    '.xg-status{margin:0;padding:9px 13px;color:#625b52;background:#f4efe5;font-size:11px}.xg-status.is-error{color:#b3261e}',
    '.xg-results{overflow:auto;padding:10px;display:grid;gap:9px}',
    '.xg-card{padding:11px;border:1px solid rgba(23,20,16,.25);background:white}',
    '.xg-meme-text{width:100%;padding:0;border:0;background:transparent;color:#171410;text-align:left;font-size:15px;font-weight:700;line-height:1.55;cursor:pointer}',
    '.xg-meta{display:flex;justify-content:space-between;margin-top:8px;color:#746c61;font-size:10px}',
    '.xg-actions{display:flex;gap:7px;margin-top:10px}.xg-actions button{flex:1;border:1px solid #171410;padding:7px;cursor:pointer}',
    '.xg-fill{background:#fffaf0;color:#171410}.xg-send{background:#3667e9;color:white}.xg-send:disabled{opacity:.55}',
    '.xg-empty{padding:40px 15px;text-align:center;color:#746c61}',
  ].join(''));

  makeDraggable(launcher, launcher, POSITION_KEYS.launcher, false);
  makeDraggable(header, panel, POSITION_KEYS.panel, true);
  applyLauncherPosition();
  window.addEventListener('resize', function () {
    const launcherPosition = applyLauncherPosition();
    GM_setValue(POSITION_KEYS.launcher, launcherPosition);
    if (panel.classList.contains('is-open')) {
      const panelPosition = applyPanelPosition();
      GM_setValue(POSITION_KEYS.panel, panelPosition);
    }
  });
})();
