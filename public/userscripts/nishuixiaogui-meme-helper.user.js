// ==UserScript==
// @name         溺水小龟烂梗助手
// @namespace    https://www.douyu.com/9765366
// @version      0.9.0
// @description  在斗鱼直播间搜索、投稿、复制、填入和一键发送小龟烂梗
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
// @grant        GM_info
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
    cooldownMs: 3000,
  };
  const RELEASE_URL = /^http:\/\/(?:127\.0\.0\.1|localhost):4000$/.test(CONFIG.apiBase)
    ? CONFIG.apiBase.replace(/:4000$/, ':3000') + '/userscripts/release.json'
    : 'https://9765366.cn/userscripts/release.json';
  const RELEASE_CHECK_INTERVAL = 6 * 60 * 60 * 1000;
  const SUBMISSION_DRAFT_KEY = 'xiaoguiSubmissionDraft';
  const SUBMISSION_CATEGORIES = ['经典语录', '直播事故', '观众二创', '年度名场面'];
  const POSITION_KEYS = {
    launcher: 'xiaoguiLauncherPosition',
    panel: 'xiaoguiPanelPosition',
  };

  function requestUrl(method, url, body) {
    return new Promise(function (resolve, reject) {
      const options = {
        method: method,
        url: url,
        timeout: 8000,
        onload: function (response) {
          if (response.status < 200 || response.status >= 300) {
            let message = 'HTTP ' + response.status;
            try {
              const payload = JSON.parse(response.responseText);
              if (payload && payload.message) message = payload.message;
            } catch (_) {}
            const error = new Error(message);
            error.status = response.status;
            reject(error);
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
      };
      if (body !== undefined) {
        options.headers = { 'Content-Type': 'application/json' };
        options.data = JSON.stringify(body);
      }
      GM_xmlhttpRequest(options);
    });
  }

  function request(method, path, body) {
    return requestUrl(method, CONFIG.apiBase + path, body);
  }

  function compareVersions(left, right) {
    const leftParts = String(left).split('.').map(Number);
    const rightParts = String(right).split('.').map(Number);
    const length = Math.max(leftParts.length, rightParts.length);
    for (let index = 0; index < length; index += 1) {
      const difference = (leftParts[index] || 0) - (rightParts[index] || 0);
      if (difference) return difference;
    }
    return 0;
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
  const updateBadge = make('span', 'xg-launcher-badge', 'NEW');
  updateBadge.hidden = true;
  launcher.append(updateBadge);
  const panel = make('section', 'xg-panel');
  panel.setAttribute('aria-label', '溺水小龟烂梗助手');

  const header = make('header', 'xg-header');
  const titleWrap = make('div');
  const installedVersion = GM_info && GM_info.script ? GM_info.script.version : '';
  titleWrap.append(make('strong', '', '小龟烂梗助手'), make('small', '', 'v' + installedVersion + ' · 当前房间 ' + CONFIG.roomId + ' · 按住标题可拖动'));
  const headerActions = make('div', 'xg-header-actions');
  const submitToggleButton = make('button', 'xg-submit-toggle', '＋ 投稿');
  submitToggleButton.type = 'button';
  const closeButton = make('button', 'xg-close', '×');
  closeButton.type = 'button';
  closeButton.setAttribute('aria-label', '收起');
  headerActions.append(submitToggleButton, closeButton);
  header.append(titleWrap, headerActions);

  const updateNotice = make('div', 'xg-update-notice');
  updateNotice.hidden = true;

  const searchRow = make('div', 'xg-search');
  const searchInputWrap = make('div', 'xg-search-input-wrap');
  const searchInput = make('input');
  searchInput.type = 'search';
  searchInput.placeholder = '搜一句烂梗……';
  searchInput.maxLength = 60;
  const clearSearchButton = make('button', 'xg-input-clear');
  clearSearchButton.type = 'button';
  clearSearchButton.hidden = true;
  clearSearchButton.setAttribute('aria-label', '清空烂梗搜索');
  const searchButton = make('button', 'xg-search-button', '搜索');
  searchButton.type = 'button';
  searchInputWrap.append(searchInput, clearSearchButton);
  searchRow.append(searchInputWrap, searchButton);

  const quickTags = make('div', 'xg-quick-tags');
  const quickTagChildren = make('div', 'xg-quick-tag-children');
  quickTagChildren.hidden = true;

  const tagSearch = make('div', 'xg-tag-search');
  const tagSearchInputWrap = make('div', 'xg-tag-search-input-wrap');
  const tagSearchInput = make('input');
  tagSearchInput.type = 'search';
  tagSearchInput.placeholder = '搜索标签，例如：龟';
  tagSearchInput.maxLength = 24;
  tagSearchInput.setAttribute('aria-label', '搜索标签');
  const clearTagSearchButton = make('button', 'xg-input-clear');
  clearTagSearchButton.type = 'button';
  clearTagSearchButton.hidden = true;
  clearTagSearchButton.setAttribute('aria-label', '清空标签搜索');
  const tagSearchOptions = make('div', 'xg-tag-search-options');
  tagSearchOptions.hidden = true;
  tagSearchInputWrap.append(tagSearchInput, clearTagSearchButton);
  tagSearch.append(tagSearchInputWrap, tagSearchOptions);

  const status = make('p', 'xg-status', '输入关键词，从小龟烂梗库搜索。');
  const results = make('div', 'xg-results');
  const browseView = make('div', 'xg-browse-view');
  browseView.append(searchRow, quickTags, quickTagChildren, tagSearch, status, results);

  const submissionView = make('div', 'xg-submission-view');
  submissionView.hidden = true;
  const submissionHeading = make('div', 'xg-submission-heading');
  const submissionBackButton = make('button', 'xg-submission-back', '← 返回烂梗库');
  submissionBackButton.type = 'button';
  const submissionHeadingCopy = make('div');
  submissionHeadingCopy.append(
    make('strong', '', '投递一条烂梗'),
    make('small', '', '提交后进入后台审核，通过后才会公开。'),
  );
  submissionHeading.append(submissionBackButton, submissionHeadingCopy);

  const submissionForm = make('form', 'xg-submission-form');
  const submissionTextLabel = make('label', '', '梗内容');
  const submissionText = make('textarea');
  submissionText.maxLength = 240;
  submissionText.rows = 4;
  submissionText.placeholder = '原话是什么？';
  submissionText.required = true;
  submissionTextLabel.append(submissionText);

  const submissionRow = make('div', 'xg-submission-row');
  const submissionCategoryLabel = make('label', '', '分类');
  const submissionCategory = make('select');
  SUBMISSION_CATEGORIES.forEach(function (category) {
    const option = make('option', '', category);
    option.value = category;
    submissionCategory.append(option);
  });
  submissionCategoryLabel.append(submissionCategory);
  const submissionSourceLabel = make('label', '', '出处（选填）');
  const submissionSource = make('input');
  submissionSource.type = 'text';
  submissionSource.maxLength = 60;
  submissionSource.placeholder = '日期 / 切片 / 场次';
  submissionSourceLabel.append(submissionSource);
  submissionRow.append(submissionCategoryLabel, submissionSourceLabel);

  const submissionTagField = make('fieldset', 'xg-submission-tag-field');
  const submissionTagLegend = make('legend', '', '选择标签 · 最多 5 个');
  const submissionTags = make('div', 'xg-submission-tags');
  submissionTags.append(make('p', 'xg-submission-tag-empty', '打开投稿页后加载标签……'));
  submissionTagField.append(submissionTagLegend, submissionTags);

  const submissionSuggestedLabel = make('label', '', '建议新标签（选填）');
  const submissionSuggestedTag = make('input');
  submissionSuggestedTag.type = 'text';
  submissionSuggestedTag.maxLength = 24;
  submissionSuggestedTag.placeholder = '找不到合适标签时填写，不用输入 #';
  submissionSuggestedLabel.append(submissionSuggestedTag);

  const submissionStatus = make('p', 'xg-submission-status', '草稿会自动保存在油猴本地。');
  const submissionSubmitButton = make('button', 'xg-submission-submit', '提交审核');
  submissionSubmitButton.type = 'submit';
  submissionForm.append(
    submissionTextLabel,
    submissionRow,
    submissionTagField,
    submissionSuggestedLabel,
    submissionStatus,
    submissionSubmitButton,
  );
  submissionView.append(submissionHeading, submissionForm);

  panel.append(header, updateNotice, browseView, submissionView);
  document.body.append(launcher, panel);

  let cooldownUntil = 0;
  let cooldownTimer = 0;
  let pageHidden = false;
  let suppressLauncherClick = false;
  let activeTag = '';
  let quickTagItems = [];
  let expandedQuickTagId = '';
  let tagSearchTimer = 0;
  let submissionTagGroups = [];
  let selectedSubmissionTags = [];
  let expandedSubmissionTagId = '';
  let submissionTagsLoaded = false;
  let submissionSending = false;

  const previousRunVersion = String(GM_getValue('lastRunVersion', ''));
  const hadPreviousInstall = Boolean(previousRunVersion || GM_getValue('releaseCheckedAt', 0));
  GM_setValue('lastRunVersion', installedVersion);

  function setUpdateBadge(visible) {
    updateBadge.hidden = !visible;
    launcher.classList.toggle('has-update', visible);
  }

  function showUpdateNotice(release) {
    updateNotice.replaceChildren();
    const copy = make('div');
    copy.append(
      make('strong', '', '发现新版本 v' + release.version),
      make('small', '', release.title || '小龟助手有新版本可用'),
    );
    const link = make('a', '', '立即更新 ↗');
    link.href = release.downloadUrl || 'https://9765366.cn/userscripts/nishuixiaogui-meme-helper.user.js';
    link.target = '_blank';
    link.rel = 'noopener noreferrer';
    updateNotice.append(copy, link);
    updateNotice.hidden = false;
    setUpdateBadge(true);
  }

  function showInstalledReleaseNotice(release) {
    if (!installedVersion || release.version !== installedVersion || GM_getValue('acknowledgedVersion', '') === installedVersion) return false;
    updateNotice.replaceChildren();
    const copy = make('div');
    copy.append(
      make('strong', '', hadPreviousInstall ? '已更新到 v' + installedVersion : '欢迎使用 v' + installedVersion),
      make('small', '', [release.title].concat(release.notes || []).filter(Boolean).join(' · ')),
    );
    const dismiss = make('button', 'xg-update-dismiss', '知道了');
    dismiss.type = 'button';
    dismiss.addEventListener('click', function () {
      GM_setValue('acknowledgedVersion', installedVersion);
      updateNotice.hidden = true;
      setUpdateBadge(false);
    });
    updateNotice.append(copy, dismiss);
    updateNotice.hidden = false;
    setUpdateBadge(true);
    return true;
  }

  async function checkForUpdate(force) {
    const lastCheckedAt = Number(GM_getValue('releaseCheckedAt', 0));
    if (!force && Date.now() - lastCheckedAt < RELEASE_CHECK_INTERVAL) return 'skipped';
    try {
      const release = await requestUrl('GET', RELEASE_URL + '?t=' + Date.now());
      GM_setValue('releaseCheckedAt', Date.now());
      if (installedVersion && compareVersions(release.version, installedVersion) > 0) {
        showUpdateNotice(release);
        return 'update';
      }
      if (!showInstalledReleaseNotice(release)) {
        updateNotice.hidden = true;
        setUpdateBadge(false);
      }
      return 'current';
    } catch (error) {
      console.warn('[小龟烂梗助手] 版本检查失败', error);
      return 'error';
    }
  }

  function defaultLauncherPosition() {
    return {
      x: window.innerWidth - launcher.offsetWidth - 18,
      y: window.innerHeight - launcher.offsetHeight - 158,
    };
  }

  function localDateKey() {
    const now = new Date();
    const year = now.getFullYear();
    const month = String(now.getMonth() + 1).padStart(2, '0');
    const day = String(now.getDate()).padStart(2, '0');
    return year + '-' + month + '-' + day;
  }

  function anonymousInstallId() {
    const saved = String(GM_getValue('anonymousInstallId', ''));
    if (/^[A-Za-z0-9_-]{16,128}$/.test(saved)) return saved;
    const generated = typeof crypto.randomUUID === 'function'
      ? crypto.randomUUID()
      : Array.from(crypto.getRandomValues(new Uint32Array(4)), function (value) { return value.toString(36); }).join('-');
    GM_setValue('anonymousInstallId', generated);
    return generated;
  }

  async function reportEngagement() {
    const today = localDateKey();
    if (GM_getValue('engagementReportedDate', '') === today) return;
    try {
      await request('POST', '/api/analytics/userscript-activity', {
        installId: anonymousInstallId(),
        version: installedVersion || 'unknown',
      });
      GM_setValue('engagementReportedDate', today);
    } catch (error) {
      console.warn('[小龟烂梗助手] 活跃统计失败', error);
    }
  }

  function showSubmissionStatus(message, isError) {
    submissionStatus.textContent = message;
    submissionStatus.classList.toggle('is-error', Boolean(isError));
    submissionStatus.classList.toggle('is-success', !isError && message.indexOf('成功') >= 0);
  }

  function normalizedTagName(value) {
    return String(value || '').trim().replace(/^#+\s*/, '').trim().slice(0, 24);
  }

  function submissionHasTag(name) {
    const key = name.toLocaleLowerCase('zh-CN');
    return selectedSubmissionTags.some(function (tag) { return tag.toLocaleLowerCase('zh-CN') === key; });
  }

  function saveSubmissionDraft() {
    GM_setValue(SUBMISSION_DRAFT_KEY, {
      text: submissionText.value,
      category: submissionCategory.value,
      source: submissionSource.value,
      tags: selectedSubmissionTags,
      suggestedTag: submissionSuggestedTag.value,
    });
  }

  function restoreSubmissionDraft() {
    const draft = GM_getValue(SUBMISSION_DRAFT_KEY, null);
    if (!draft || typeof draft !== 'object') return;
    submissionText.value = String(draft.text || '').slice(0, 240);
    submissionCategory.value = SUBMISSION_CATEGORIES.includes(draft.category) ? draft.category : SUBMISSION_CATEGORIES[0];
    submissionSource.value = String(draft.source || '').slice(0, 60);
    submissionSuggestedTag.value = normalizedTagName(draft.suggestedTag);
    selectedSubmissionTags = Array.isArray(draft.tags)
      ? draft.tags.map(normalizedTagName).filter(Boolean).slice(0, 5)
      : [];
  }

  function toggleSubmissionTag(name) {
    const existingIndex = selectedSubmissionTags.findIndex(function (tag) {
      return tag.toLocaleLowerCase('zh-CN') === name.toLocaleLowerCase('zh-CN');
    });
    if (existingIndex >= 0) selectedSubmissionTags.splice(existingIndex, 1);
    else if (selectedSubmissionTags.length >= 5) {
      showSubmissionStatus('最多选择 5 个标签。', true);
      return;
    } else selectedSubmissionTags.push(name);
    showSubmissionStatus('已选择 ' + selectedSubmissionTags.length + ' / 5 个标签。');
    saveSubmissionDraft();
    renderSubmissionTags();
  }

  function submissionTagButton(item, isParent) {
    const label = (isParent ? '★ ' : '') + '#' + item.name + ' · ' + item.count;
    const button = make('button', submissionHasTag(item.name) ? 'is-selected' : '', label);
    button.type = 'button';
    button.addEventListener('click', function () { toggleSubmissionTag(item.name); });
    return button;
  }

  function renderSubmissionTags() {
    submissionTags.replaceChildren();
    if (!submissionTagGroups.length) {
      submissionTags.append(make('p', 'xg-submission-tag-empty', '暂时没有可选标签，可以在下面建议新标签。'));
      return;
    }
    submissionTagGroups.forEach(function (group) {
      const tagGroup = make('div', 'xg-submission-tag-group');
      const parentRow = make('div', 'xg-submission-tag-row');
      parentRow.append(submissionTagButton(group, group.isParent));
      if (group.isParent && (group.children || []).length) {
        const expandButton = make('button', 'xg-submission-tag-expand', expandedSubmissionTagId === group.id ? '收起 −' : '子标签 ＋');
        expandButton.type = 'button';
        expandButton.addEventListener('click', function () {
          expandedSubmissionTagId = expandedSubmissionTagId === group.id ? '' : group.id;
          renderSubmissionTags();
        });
        parentRow.append(expandButton);
      }
      tagGroup.append(parentRow);
      if (expandedSubmissionTagId === group.id) {
        const children = make('div', 'xg-submission-tag-children');
        (group.children || []).forEach(function (child) { children.append(submissionTagButton(child, false)); });
        tagGroup.append(children);
      }
      submissionTags.append(tagGroup);
    });
  }

  async function loadSubmissionTags() {
    if (submissionTagsLoaded) {
      renderSubmissionTags();
      return;
    }
    submissionTags.replaceChildren(make('p', 'xg-submission-tag-empty', '正在加载标签……'));
    try {
      const data = await request('GET', '/api/tags?limit=100');
      submissionTagGroups = data.items || [];
      submissionTagsLoaded = true;
      renderSubmissionTags();
    } catch (error) {
      console.error('[小龟烂梗助手] 投稿标签加载失败', error);
      submissionTags.replaceChildren(make('p', 'xg-submission-tag-empty', '标签加载失败，仍可不选标签直接投稿。'));
    }
  }

  function setSubmissionView(active) {
    browseView.hidden = active;
    submissionView.hidden = !active;
    submitToggleButton.classList.toggle('is-active', active);
    submitToggleButton.textContent = active ? '投稿中' : '＋ 投稿';
    if (active) {
      showSubmissionStatus(selectedSubmissionTags.length
        ? '草稿已保留，已选择 ' + selectedSubmissionTags.length + ' / 5 个标签。'
        : '草稿会自动保存在油猴本地。');
      void loadSubmissionTags();
      window.setTimeout(function () { submissionText.focus(); }, 0);
    }
  }

  function clearSubmissionDraft() {
    submissionText.value = '';
    submissionCategory.value = SUBMISSION_CATEGORIES[0];
    submissionSource.value = '';
    submissionSuggestedTag.value = '';
    selectedSubmissionTags = [];
    expandedSubmissionTagId = '';
    GM_setValue(SUBMISSION_DRAFT_KEY, {});
    renderSubmissionTags();
  }

  async function submitJokeDraft() {
    if (submissionSending) return;
    const text = submissionText.value.trim();
    if (!text) {
      showSubmissionStatus('先写下这条烂梗。', true);
      submissionText.focus();
      return;
    }
    const suggestedTag = normalizedTagName(submissionSuggestedTag.value);
    const tags = selectedSubmissionTags.slice();
    if (suggestedTag && !tags.some(function (tag) { return tag.toLocaleLowerCase('zh-CN') === suggestedTag.toLocaleLowerCase('zh-CN'); })) {
      if (tags.length >= 5) {
        showSubmissionStatus('已有 5 个标签，请取消一个后再添加建议标签。', true);
        return;
      }
      tags.push(suggestedTag);
    }
    submissionSending = true;
    submissionSubmitButton.disabled = true;
    submissionSubmitButton.textContent = '提交中……';
    showSubmissionStatus('正在提交到审核区……');
    try {
      await request('POST', '/api/submissions', {
        text: text,
        category: submissionCategory.value,
        source: submissionSource.value.trim() || undefined,
        tags: tags,
      });
      clearSubmissionDraft();
      showSubmissionStatus('投稿成功，审核通过后会公开。');
      window.setTimeout(function () {
        setSubmissionView(false);
        showStatus('投稿成功，已经进入待审核区。');
      }, 900);
    } catch (error) {
      if (error.status === 409) showSubmissionStatus('这条烂梗已收录或正在审核。', true);
      else if (error.status === 429) showSubmissionStatus('投稿太快了，请稍后再试。', true);
      else if (error.status === 400) showSubmissionStatus(error.message || '请检查投稿内容。', true);
      else showSubmissionStatus('投稿失败，草稿已保留，请稍后重试。', true);
    } finally {
      submissionSending = false;
      submissionSubmitButton.disabled = false;
      submissionSubmitButton.textContent = '提交审核';
    }
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
    status.title = message;
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

  async function addCopyCount(item, countElement) {
    try {
      const result = await request('POST', '/api/memes/' + encodeURIComponent(item.id) + '/copy');
      item.copyCount = result.copyCount;
      if (countElement) countElement.textContent = '复制 ' + result.copyCount;
    } catch (error) {
      console.warn('[小龟烂梗助手] 复制计数失败', error);
    }
  }

  async function copyText(item, countElement) {
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
    void addCopyCount(item, countElement);
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

  function sendText(item, button, countElement) {
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
      void addCopyCount(item, countElement);
      showStatus('已发送，3 秒后可以再次一键发送。');
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
      const meta = make('div', 'xg-meta');
      const tagText = (item.tags || []).slice(0, 3).map(function (tag) { return '#' + tag; }).join(' ');
      const countElement = make('span', '', '复制 ' + (item.copyCount || 0));
      copyButton.addEventListener('click', function () { void copyText(item, countElement); });
      meta.append(make('span', '', '#' + item.category + (tagText ? ' · ' + tagText : '')), countElement);
      const actions = make('div', 'xg-actions');
      const fillButton = make('button', 'xg-fill', '填入');
      const sendButton = make('button', 'xg-send', '发送');
      fillButton.type = 'button';
      sendButton.type = 'button';
      fillButton.addEventListener('click', function () { fillText(item); });
      sendButton.addEventListener('click', function () { sendText(item, sendButton, countElement); });
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
      const data = await request('GET', '/api/memes?sort=popular&pageSize=50&query=' + encodeURIComponent(query) + '&tag=' + encodeURIComponent(activeTag));
      render(data.items || []);
      showStatus('找到 ' + (data.total || 0) + ' 条' + (activeTag ? ' #' + activeTag : '') + '，点文字复制，也可以填入或发送。');
    } catch (error) {
      console.error('[小龟烂梗助手] 搜索失败', error);
      showStatus('暂时连接不到烂梗库，请稍后再试，或在油猴菜单中检查服务地址。', true);
    } finally {
      searchButton.disabled = false;
    }
  }

  function renderQuickTags(items) {
    quickTagItems = items;
    quickTags.innerHTML = '';
    quickTagChildren.replaceChildren();
    quickTagChildren.hidden = true;
    const allButton = make('button', activeTag ? '' : 'is-active', '全部烂梗');
    allButton.type = 'button';
    allButton.addEventListener('click', function () {
      activeTag = '';
      renderQuickTags(quickTagItems);
      void search();
    });
    quickTags.append(allButton);
    items.forEach(function (item) {
      const groupActive = activeTag === item.name || (item.children || []).some(function (child) { return child.name === activeTag; });
      const button = make('button', groupActive ? 'is-active' : '', (item.isParent ? '★ ' : '') + '#' + item.name + (item.isParent ? '⌄' : ''));
      button.type = 'button';
      button.title = item.count + ' 条烂梗';
      button.addEventListener('click', function () {
        if (item.isParent) {
          expandedQuickTagId = expandedQuickTagId === item.id ? '' : item.id;
          renderQuickTags(quickTagItems);
          return;
        }
        activeTag = activeTag === item.name ? '' : item.name;
        expandedQuickTagId = '';
        renderQuickTags(quickTagItems);
        void search();
      });
      quickTags.append(button);
    });
    const expandedGroup = items.find(function (item) { return item.id === expandedQuickTagId; });
    if (expandedGroup) {
      const parentButton = make('button', activeTag === expandedGroup.name ? 'is-active' : '', '★ #' + expandedGroup.name + '（父标签）');
      parentButton.type = 'button';
      parentButton.addEventListener('click', function () {
        activeTag = expandedGroup.name;
        expandedQuickTagId = '';
        renderQuickTags(quickTagItems);
        void search();
      });
      quickTagChildren.append(parentButton);
      (expandedGroup.children || []).forEach(function (child) {
        const childButton = make('button', activeTag === child.name ? 'is-active' : '', '#' + child.name + ' · ' + child.count);
        childButton.type = 'button';
        childButton.addEventListener('click', function () {
          activeTag = child.name;
          expandedQuickTagId = '';
          renderQuickTags(quickTagItems);
          void search();
        });
        quickTagChildren.append(childButton);
      });
      quickTagChildren.hidden = false;
    }
    if (activeTag && !items.some(function (item) {
      return item.name === activeTag || (item.children || []).some(function (child) { return child.name === activeTag; });
    })) {
      const selectedButton = make('button', 'is-active', '#' + activeTag);
      selectedButton.type = 'button';
      selectedButton.title = '当前搜索标签，点击取消';
      selectedButton.addEventListener('click', function () {
        activeTag = '';
        renderQuickTags(quickTagItems);
        void search();
      });
      quickTags.append(selectedButton);
    }
  }

  function hideTagSearchOptions() {
    tagSearchOptions.hidden = true;
    tagSearchOptions.replaceChildren();
  }

  function renderTagSearchOptions(items, query) {
    tagSearchOptions.replaceChildren();
    const normalizedQuery = query.toLocaleLowerCase('zh-CN');
    const options = items.reduce(function (result, item) {
      if (item.name.toLocaleLowerCase('zh-CN').includes(normalizedQuery)) {
        result.push({ name: item.name, count: item.count, isParent: item.isParent });
      }
      (item.children || []).forEach(function (child) { result.push({ name: child.name, count: child.count, isParent: false }); });
      return result;
    }, []);
    if (!options.length) {
      tagSearchOptions.append(make('p', 'xg-tag-search-empty', '没有匹配标签'));
    } else {
      options.forEach(function (item) {
        const button = make('button', '', (item.isParent ? '★ ' : '') + '#' + item.name);
        button.type = 'button';
        button.append(make('small', '', item.count + ' 条'));
        button.addEventListener('click', function () {
          activeTag = item.name;
          tagSearchInput.value = '';
          clearTagSearchButton.hidden = true;
          hideTagSearchOptions();
          renderQuickTags(quickTagItems);
          void search();
        });
        tagSearchOptions.append(button);
      });
    }
    tagSearchOptions.hidden = false;
  }

  async function searchTags() {
    const query = tagSearchInput.value.trim();
    if (!query) {
      hideTagSearchOptions();
      return;
    }
    try {
      const data = await request('GET', '/api/tags?limit=20&query=' + encodeURIComponent(query));
      if (tagSearchInput.value.trim() === query) renderTagSearchOptions(data.items || [], query);
    } catch (error) {
      console.error('[小龟烂梗助手] 标签搜索失败', error);
      if (tagSearchInput.value.trim() === query) renderTagSearchOptions([], query);
    }
  }

  async function loadQuickTags() {
    try {
      const data = await request('GET', '/api/tags?limit=10');
      renderQuickTags(data.items || []);
    } catch (error) {
      console.error('[小龟烂梗助手] 标签加载失败', error);
      renderQuickTags([]);
    }
  }

  launcher.addEventListener('click', function () {
    if (suppressLauncherClick || pageHidden) return;
    panel.classList.toggle('is-open');
    if (panel.classList.contains('is-open')) {
      void reportEngagement();
      window.requestAnimationFrame(function () {
        applyPanelPosition();
        void checkForUpdate(true);
        void loadQuickTags();
        void search();
      });
    }
  });
  submitToggleButton.addEventListener('click', function () { setSubmissionView(submissionView.hidden); });
  submissionBackButton.addEventListener('click', function () { setSubmissionView(false); });
  submissionForm.addEventListener('submit', function (event) {
    event.preventDefault();
    void submitJokeDraft();
  });
  [submissionText, submissionCategory, submissionSource, submissionSuggestedTag].forEach(function (field) {
    field.addEventListener(field === submissionCategory ? 'change' : 'input', saveSubmissionDraft);
  });
  closeButton.addEventListener('click', function () {
    setSubmissionView(false);
    panel.classList.remove('is-open');
  });
  searchButton.addEventListener('click', function () { void search(); });
  searchInput.addEventListener('input', function () {
    clearSearchButton.hidden = !searchInput.value;
  });
  searchInput.addEventListener('keydown', function (event) {
    if (event.key === 'Enter') {
      event.preventDefault();
      void search();
    }
  });
  clearSearchButton.addEventListener('click', function () {
    searchInput.value = '';
    clearSearchButton.hidden = true;
    searchInput.focus();
    void search();
  });
  tagSearchInput.addEventListener('input', function () {
    clearTagSearchButton.hidden = !tagSearchInput.value;
    window.clearTimeout(tagSearchTimer);
    tagSearchTimer = window.setTimeout(function () { void searchTags(); }, 180);
  });
  tagSearchInput.addEventListener('keydown', function (event) {
    if (event.key === 'Escape') hideTagSearchOptions();
  });
  clearTagSearchButton.addEventListener('click', function () {
    window.clearTimeout(tagSearchTimer);
    tagSearchInput.value = '';
    clearTagSearchButton.hidden = true;
    hideTagSearchOptions();
    tagSearchInput.focus();
  });
  document.addEventListener('pointerdown', function (event) {
    if (!tagSearch.contains(event.target)) hideTagSearchOptions();
    if (panel.classList.contains('is-open') && !panel.contains(event.target) && !launcher.contains(event.target)) {
      setSubmissionView(false);
      panel.classList.remove('is-open');
    }
  });

  restoreSubmissionDraft();

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
  GM_registerMenuCommand('检查助手更新', function () {
    GM_setValue('releaseCheckedAt', 0);
    void checkForUpdate(true).then(function (result) {
      if (result === 'current') window.alert('当前已是最新版本 v' + installedVersion + '。');
      else if (result === 'error') window.alert('暂时无法检查更新，请稍后再试。');
      else if (result === 'update' && !panel.classList.contains('is-open')) panel.classList.add('is-open');
    });
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
    '.xg-launcher-badge{position:absolute;top:-8px;right:-8px;border:1px solid #171410;border-radius:999px;padding:3px 5px;background:#ff315f;color:white;box-shadow:2px 2px 0 #171410;font:900 8px/1 system-ui;letter-spacing:.04em}.xg-launcher-badge[hidden]{display:none}',
    '.xg-panel{display:none;position:fixed;z-index:2147483647;width:min(390px,calc(100vw - 28px));max-height:min(620px,72vh);overflow:hidden;background:#fffaf0;color:#171410;border:1px solid #171410;box-shadow:10px 10px 0 #ff5c35;font:14px/1.5 system-ui}',
    '.xg-panel.is-open{display:flex;flex-direction:column}.xg-panel.is-dragging{box-shadow:5px 5px 0 #ff5c35}',
    '.xg-header,.xg-search,.xg-quick-tags,.xg-tag-search,.xg-status{flex:0 0 auto}',
    '.xg-header{display:flex;align-items:center;justify-content:space-between;gap:10px;padding:12px 12px 12px 16px;background:#f3ce49;border-bottom:1px solid #171410;touch-action:none;user-select:none;cursor:grab}',
    '.xg-panel.is-dragging .xg-header{cursor:grabbing}.xg-header strong,.xg-header small{display:block}.xg-header small{margin-top:2px;font-size:10px;opacity:.65}',
    '.xg-header-actions{display:flex;align-items:center;gap:4px}.xg-submit-toggle{border:1px solid #171410;border-radius:999px;padding:5px 8px;background:rgba(255,255,255,.45);font-size:10px;white-space:nowrap;cursor:pointer}.xg-submit-toggle.is-active{background:#171410;color:white}',
    '.xg-close{border:0;background:transparent;font-size:26px;line-height:1;cursor:pointer}',
    '.xg-update-notice{display:flex;flex:0 0 auto;align-items:center;justify-content:space-between;gap:10px;padding:9px 12px;border-bottom:1px solid #171410;background:#fff3bf}',
    '.xg-update-notice[hidden]{display:none}.xg-update-notice strong,.xg-update-notice small{display:block}.xg-update-notice strong{font-size:11px}.xg-update-notice small{margin-top:2px;color:#746c61;font-size:9px}',
    '.xg-update-notice a,.xg-update-dismiss{flex:0 0 auto;border:1px solid #171410;padding:5px 8px;background:#ff5c35;color:white;text-decoration:none;font-size:10px;font-weight:800;cursor:pointer}',
    '.xg-browse-view{display:flex;min-height:0;flex:1 1 auto;flex-direction:column}.xg-browse-view[hidden]{display:none}',
    '.xg-search{display:flex;gap:8px;padding:12px;border-bottom:1px solid rgba(23,20,16,.18)}',
    '.xg-search-input-wrap,.xg-tag-search-input-wrap{position:relative;min-width:0}',
    '.xg-search-input-wrap{flex:1}.xg-search-input-wrap input{box-sizing:border-box;width:100%;border:1px solid #171410;padding:9px 29px 9px 10px;background:white;color:#171410}',
    '.xg-search-button{border:1px solid #171410;padding:8px 13px;background:#171410;color:white;cursor:pointer}',
    '.xg-input-clear{width:18px;height:18px;padding:0;position:absolute;top:50%;right:6px;transform:translateY(-50%);border:0;border-radius:50%;background:rgba(23,20,16,.1);color:#171410;cursor:pointer}',
    '.xg-input-clear::before,.xg-input-clear::after{content:"";width:8px;height:1.5px;position:absolute;top:50%;left:50%;border-radius:2px;background:currentColor;transform:translate(-50%,-50%) rotate(45deg)}',
    '.xg-input-clear::after{transform:translate(-50%,-50%) rotate(-45deg)}.xg-input-clear[hidden]{display:none}.xg-input-clear:hover{background:#171410;color:white}.xg-input-clear:focus-visible{outline:2px solid #3667e9;outline-offset:1px}.xg-search input::-webkit-search-cancel-button,.xg-tag-search input::-webkit-search-cancel-button{display:none}',
    '.xg-quick-tags{display:flex;gap:6px;padding:8px 12px;overflow-x:auto;border-bottom:1px solid rgba(23,20,16,.14);background:#fff}',
    '.xg-quick-tags button{flex:0 0 auto;border:1px solid rgba(23,20,16,.28);border-radius:999px;padding:5px 9px;background:#fffaf0;color:#171410;font-size:10px;cursor:pointer}',
    '.xg-quick-tags button.is-active{border-color:#171410;background:#171410;color:white}',
    '.xg-quick-tag-children{display:flex;flex:0 0 auto;flex-wrap:wrap;gap:6px;padding:8px 12px;border-bottom:1px solid rgba(23,20,16,.14);background:#fff8dc}',
    '.xg-quick-tag-children[hidden]{display:none}.xg-quick-tag-children button{border:1px solid rgba(23,20,16,.28);border-radius:999px;padding:5px 9px;background:white;color:#171410;font-size:10px;cursor:pointer}',
    '.xg-quick-tag-children button.is-active{border-color:#171410;background:#171410;color:white}',
    '.xg-tag-search{position:relative;padding:7px 12px;border-bottom:1px solid rgba(23,20,16,.14);background:#fff}',
    '.xg-tag-search-input-wrap input{box-sizing:border-box;width:100%;border:1px solid rgba(23,20,16,.35);border-radius:6px;padding:7px 29px 7px 9px;background:#fffaf0;color:#171410;font-size:11px}',
    '.xg-tag-search-options{position:absolute;z-index:4;top:calc(100% - 4px);left:12px;right:12px;max-height:170px;overflow:auto;border:1px solid #171410;background:white;box-shadow:4px 4px 0 #f3ce49}',
    '.xg-tag-search-options[hidden]{display:none}.xg-tag-search-options button{display:flex;width:100%;align-items:center;justify-content:space-between;gap:10px;border:0;border-bottom:1px solid rgba(23,20,16,.12);padding:8px 10px;background:white;color:#171410;text-align:left;cursor:pointer}',
    '.xg-tag-search-options button:hover{background:#fff3bf}.xg-tag-search-options small{color:#746c61}.xg-tag-search-empty{margin:0;padding:10px;color:#746c61;font-size:11px}',
    '.xg-status{margin:0;padding:9px 13px;overflow:hidden;color:#625b52;background:#f4efe5;font-size:11px;white-space:nowrap;text-overflow:ellipsis}.xg-status.is-error{color:#b3261e}',
    '.xg-results{min-height:0;flex:1 1 auto;overflow:auto;padding:10px;display:grid;gap:9px}',
    '.xg-card{padding:11px;border:1px solid rgba(23,20,16,.25);background:white}',
    '.xg-meme-text{width:100%;padding:0;border:0;background:transparent;color:#171410;text-align:left;font-size:15px;font-weight:700;line-height:1.55;cursor:pointer}',
    '.xg-meta{display:flex;justify-content:space-between;gap:10px;margin-top:8px;color:#746c61;font-size:10px}.xg-meta span:first-child{min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}',
    '.xg-actions{display:flex;gap:7px;margin-top:10px}.xg-actions button{flex:1;border:1px solid #171410;padding:7px;cursor:pointer}',
    '.xg-fill{background:#fffaf0;color:#171410}.xg-send{background:#3667e9;color:white}.xg-send:disabled{opacity:.55}',
    '.xg-empty{padding:40px 15px;text-align:center;color:#746c61}',
    '.xg-submission-view{min-height:0;flex:1 1 auto;overflow:auto;background:#fffaf0}.xg-submission-view[hidden]{display:none}',
    '.xg-submission-heading{position:sticky;z-index:2;top:0;display:flex;align-items:center;gap:12px;padding:12px;border-bottom:1px solid #171410;background:#fff3bf}.xg-submission-heading strong,.xg-submission-heading small{display:block}.xg-submission-heading strong{font-size:13px}.xg-submission-heading small{margin-top:2px;color:#746c61;font-size:9px}',
    '.xg-submission-back{flex:0 0 auto;border:1px solid #171410;padding:6px 8px;background:white;color:#171410;font-size:10px;cursor:pointer}',
    '.xg-submission-form{display:grid;gap:12px;padding:13px}.xg-submission-form label{display:grid;gap:5px;color:#4f4941;font-size:10px;font-weight:800}.xg-submission-form input,.xg-submission-form textarea,.xg-submission-form select{box-sizing:border-box;width:100%;border:1px solid #171410;border-radius:0;padding:8px 9px;background:white;color:#171410;font:12px/1.45 system-ui}.xg-submission-form textarea{min-height:82px;resize:vertical}',
    '.xg-submission-row{display:grid;grid-template-columns:minmax(0,.8fr) minmax(0,1.2fr);gap:9px}',
    '.xg-submission-tag-field{min-width:0;margin:0;padding:10px;border:1px solid rgba(23,20,16,.3);background:white}.xg-submission-tag-field legend{padding:0 5px;color:#4f4941;font-size:10px;font-weight:800}',
    '.xg-submission-tags{display:grid;gap:7px;max-height:190px;overflow:auto}.xg-submission-tag-group{display:grid;gap:6px}.xg-submission-tag-row{display:flex;gap:5px}.xg-submission-tag-row>button:first-child{min-width:0;flex:1;text-align:left}.xg-submission-tag-row button,.xg-submission-tag-children button{border:1px solid rgba(23,20,16,.3);padding:6px 7px;background:#fffaf0;color:#171410;font-size:9px;cursor:pointer}.xg-submission-tag-row button.is-selected,.xg-submission-tag-children button.is-selected{border-color:#171410;background:#171410;color:white}.xg-submission-tag-expand{flex:0 0 auto}.xg-submission-tag-children{display:flex;flex-wrap:wrap;gap:5px;padding:7px;background:#fff8dc}',
    '.xg-submission-tag-empty{margin:0;padding:10px;color:#746c61;text-align:center;font-size:10px}.xg-submission-status{margin:0;padding:8px 9px;background:#f4efe5;color:#625b52;font-size:10px}.xg-submission-status.is-error{background:#ffe8e2;color:#a42b20}.xg-submission-status.is-success{background:#eef8dc;color:#4d701f}',
    '.xg-submission-submit{border:1px solid #171410;padding:9px;background:#3667e9;color:white;font-weight:800;cursor:pointer}.xg-submission-submit:disabled{cursor:wait;opacity:.6}',
  ].join(''));

  makeDraggable(launcher, launcher, POSITION_KEYS.launcher, false);
  makeDraggable(header, panel, POSITION_KEYS.panel, true);
  applyLauncherPosition();
  void checkForUpdate(false);
  window.addEventListener('resize', function () {
    const launcherPosition = applyLauncherPosition();
    GM_setValue(POSITION_KEYS.launcher, launcherPosition);
    if (panel.classList.contains('is-open')) {
      const panelPosition = applyPanelPosition();
      GM_setValue(POSITION_KEYS.panel, panelPosition);
    }
  });
})();
