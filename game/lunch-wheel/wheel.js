/**
 * 轮盘抽奖逻辑
 */

class LunchWheel {
    constructor() {
        this.canvas = document.getElementById('wheel-canvas');
        this.ctx = this.canvas.getContext('2d');
        this.gistManager = new GistManager();

        this.options = [];
        this.availableOptions = [];
        this.colors = [];
        this.isSpinning = false;
        this.currentRotation = 0;
        this.lastSelectedOption = null;
        this.cssSize = 400;

        this.setupCanvas();
        window.addEventListener('resize', () => {
            this.setupCanvas();
            this.drawWheel();
        });

        this.init();
    }

    setupCanvas() {
        const dpr = window.devicePixelRatio || 1;
        // 优先用 CSS 实际宽度（响应式 + 移动端缩放后）
        const cssSize = this.canvas.clientWidth || 400;
        this.canvas.width = cssSize * dpr;
        this.canvas.height = cssSize * dpr;
        this.canvas.style.width = cssSize + 'px';
        this.canvas.style.height = cssSize + 'px';
        // setTransform 使后续绘制全部以 CSS 像素为单位
        this.ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
        this.cssSize = cssSize;
    }
    
    async init() {
        // 绑定事件（先于异步加载）
        this.bindEvents();

        // 默认即可读取（公共 Gist 兜底），不再因"未配置"而阻塞
        this.gistManager.clearCache();
        await this.loadOptions();
        this.drawWheel();
        await this.updateHistoryDisplay();
    }
    
    async loadOptions() {
        const allOptions = await this.gistManager.getAllOptions();
        const emptyEl = document.getElementById('empty-message');

        // 完全没有选项 → 显示空状态引导
        if (allOptions.length === 0) {
            emptyEl.style.display = 'flex';
            this.availableOptions = [];
            this.options = [];
            this.generateColors();
            return;
        }

        emptyEl.style.display = 'none';

        // 获取可用选项（排除最近三次；getAvailableOptions 内部已做选项不足降级）
        this.availableOptions = await this.gistManager.getAvailableOptions();
        this.options = this.availableOptions.length > 0
            ? this.availableOptions
            : ['你没饭吃了']; // 兜底：理论上 getAvailableOptions 已降级，不会到这

        this.generateColors();
    }
    
    async updateHistoryDisplay() {
        const history = await this.gistManager.getHistory();
        const historyList = document.getElementById('history-list');
        historyList.replaceChildren();

        if (history.length === 0) {
            const empty = document.createElement('div');
            empty.className = 'no-history';
            empty.textContent = '暂无记录';
            historyList.appendChild(empty);
            return;
        }

        for (const item of history) {
            const wrap = document.createElement('div');
            wrap.className = 'history-item';
            const name = document.createElement('span');
            name.className = 'history-name';
            // textContent 而非 innerHTML：Gist 数据不可信，防 XSS
            name.textContent = item.name;
            const time = document.createElement('span');
            time.className = 'history-time';
            time.textContent = item.time;
            wrap.append(name, time);
            historyList.appendChild(wrap);
        }
    }
    
    generateColors() {
        // HSL 等距色环，避免大量选项时相邻同色
        this.colors = [];
        const N = this.options.length;
        if (N === 0) return;
        for (let i = 0; i < N; i++) {
            const hue = (i * 360 / N).toFixed(1);
            this.colors.push(`hsl(${hue}, 65%, 60%)`);
        }
    }
    
    // 自适应字号：在 [MIN, MAX] 范围内取最大的、所有 items 都能完整装下的字号
    // 由于 maxWidth 本身依赖 fontSize（halfTan/innerLimit），按 1px 步长向下扫描评估
    _fitFontSize(items, sliceAngle, textRadius, MAX = 18, MIN = 8) {
        const halfTan = Math.tan(sliceAngle / 2);
        for (let f = MAX; f >= MIN; f--) {
            const safeInner = halfTan > 0 ? (f / 2) / halfTan + 4 : 60;
            const innerLimit = Math.max(55, safeInner);
            const maxWidth = Math.max(20, textRadius - innerLimit);
            this.ctx.font = `bold ${f}px Microsoft YaHei, sans-serif`;
            const allFit = items.every(t => this.ctx.measureText(t).width <= maxWidth);
            if (allFit) return f;
        }
        return MIN;
    }

    drawWheel() {
        const centerX = this.cssSize / 2;
        const centerY = this.cssSize / 2;
        const radius = Math.min(centerX, centerY) - 10;

        // 清除画布（按 CSS 像素清，不会受 DPR 影响）
        this.ctx.clearRect(0, 0, this.cssSize, this.cssSize);
        
        // 绘制外圈阴影
        this.ctx.save();
        this.ctx.shadowColor = 'rgba(0, 0, 0, 0.3)';
        this.ctx.shadowBlur = 20;
        this.ctx.beginPath();
        this.ctx.arc(centerX, centerY, radius, 0, Math.PI * 2);
        this.ctx.fillStyle = '#fff';
        this.ctx.fill();
        this.ctx.restore();
        
        if (this.options.length === 0) {
            return;
        }
        
        // 绘制扇形
        const sliceAngle = (Math.PI * 2) / this.options.length;
        const textRadius = radius - 15;

        // 自适应字号：在 [minFontSize, maxFontSize] 内取最大的、能让所有选项完整装下的字号
        // 注意 maxWidth 与 fontSize 耦合（字号越大→所需 innerLimit 越大→可用宽度越小），
        // 必须按字号迭代评估，不能简单按最长字符串单次计算。
        const fontSize = this._fitFontSize(this.options, sliceAngle, textRadius);
        const halfTan = Math.tan(sliceAngle / 2);
        const safeInner = halfTan > 0 ? (fontSize / 2) / halfTan + 4 : 60;
        const innerLimit = Math.max(55, safeInner);
        const maxWidth = Math.max(20, textRadius - innerLimit);

        this.ctx.save();
        this.ctx.translate(centerX, centerY);
        this.ctx.rotate(this.currentRotation);

        for (let i = 0; i < this.options.length; i++) {
            const startAngle = i * sliceAngle;
            const endAngle = startAngle + sliceAngle;

            // 绘制扇形
            this.ctx.beginPath();
            this.ctx.moveTo(0, 0);
            this.ctx.arc(0, 0, radius - 5, startAngle, endAngle);
            this.ctx.closePath();

            this.ctx.fillStyle = this.colors[i];
            this.ctx.fill();

            // 绘制边框
            this.ctx.strokeStyle = '#fff';
            this.ctx.lineWidth = 2;
            this.ctx.stroke();

            // 绘制文字
            this.ctx.save();
            this.ctx.rotate(startAngle + sliceAngle / 2);
            this.ctx.textAlign = 'right';
            this.ctx.textBaseline = 'middle';
            this.ctx.fillStyle = '#fff';
            this.ctx.font = `bold ${fontSize}px Microsoft YaHei, sans-serif`;

            // 自适应字号已尽量让所有选项装下；极端兜底：若仍超宽（字号已到下限）则截断 + …
            const original = this.options[i];
            let text = original;
            if (this.ctx.measureText(text).width > maxWidth) {
                while (text.length > 1 && this.ctx.measureText(text + '…').width > maxWidth) {
                    text = text.slice(0, -1);
                }
                text = text + '…';
            }

            this.ctx.shadowColor = 'rgba(0, 0, 0, 0.5)';
            this.ctx.shadowBlur = 3;
            this.ctx.fillText(text, textRadius, 0);

            this.ctx.restore();
        }

        this.ctx.restore();
        
        // 绘制中心圆
        this.ctx.beginPath();
        this.ctx.arc(centerX, centerY, 50, 0, Math.PI * 2);
        this.ctx.fillStyle = '#fff';
        this.ctx.fill();
    }
    
    bindEvents() {
        // 开始抽奖
        document.getElementById('spin-btn').addEventListener('click', () => {
            this.spin();
        });
        
        // 添加选项
        document.getElementById('add-option-btn').addEventListener('click', () => {
            this.showAddOverlay();
        });
        
        document.getElementById('add-first-option').addEventListener('click', () => {
            this.showAddOverlay();
        });
        
        // 提交新选项
        document.getElementById('submit-option').addEventListener('click', () => {
            this.submitNewOption();
        });
        
        // 取消添加
        document.getElementById('cancel-add').addEventListener('click', () => {
            this.hideAddOverlay();
        });
        
        // 上次吃了啥（记录历史）
        document.getElementById('record-eating-btn').addEventListener('click', () => {
            this.showRecordOverlay();
        });
        
        // 提交记录
        document.getElementById('submit-record').addEventListener('click', () => {
            this.submitRecord();
        });
        
        // 取消记录
        document.getElementById('cancel-record').addEventListener('click', () => {
            this.hideRecordOverlay();
        });
        
        // 清空记录
        document.getElementById('clear-history-btn').addEventListener('click', () => {
            this.showClearConfirm();
        });
        
        // 关闭结果（不记录）
        document.getElementById('close-result').addEventListener('click', () => {
            this.hideResult();
        });
        
        // 记录这次选择
        document.getElementById('record-result').addEventListener('click', () => {
            this.hideResult();
            this.showRecordWithSelected();
        });

        // 设置入口
        document.getElementById('settings-btn').addEventListener('click', () => {
            this.showConfigOverlay();
        });

        // 管理选项
        document.getElementById('manage-options-btn').addEventListener('click', () => {
            this.showManageOverlay();
        });

        document.getElementById('close-manage').addEventListener('click', () => {
            this.hideManageOverlay();
        });

        // 全局键盘：Esc 关闭顶部弹窗 / Enter 在 input 中提交对应表单
        const overlayMap = [
            { id: 'config-overlay', submit: 'submit-gist-id', cancel: 'cancel-gist-id' },
            { id: 'add-overlay', submit: 'submit-option', cancel: 'cancel-add' },
            { id: 'record-overlay', submit: 'submit-record', cancel: 'cancel-record' },
            { id: 'manage-overlay', submit: null, cancel: 'close-manage' },
            { id: 'result-overlay', submit: null, cancel: 'close-result' },
        ];

        document.addEventListener('keydown', (e) => {
            const visible = overlayMap.find(m => {
                const el = document.getElementById(m.id);
                return el && el.style.display === 'flex';
            });
            if (!visible) return;

            if (e.key === 'Escape' && visible.cancel) {
                e.preventDefault();
                document.getElementById(visible.cancel).click();
            } else if (e.key === 'Enter' && visible.submit && document.activeElement?.tagName === 'INPUT') {
                e.preventDefault();
                document.getElementById(visible.submit).click();
            }
        });

        document.getElementById('submit-gist-id').addEventListener('click', () => {
            this.submitGistId();
        });

        document.getElementById('reset-gist-id').addEventListener('click', () => {
            this.resetGistId();
        });

        document.getElementById('cancel-gist-id').addEventListener('click', () => {
            // 默认 PUBLIC fallback 总是可用，关闭弹窗无任何阻塞
            this.hideConfigOverlay();
        });
    }

    showConfigOverlay() {
        const input = document.getElementById('gist-id-input');
        const userId = GistManager.getUserGistId();
        input.value = userId || '';
        const label = document.getElementById('current-gist-label');
        if (label) {
            label.textContent = this.gistManager.isUsingPublic()
                ? `公共默认 (${GistManager.PUBLIC_GIST_ID.slice(0, 8)}…)`
                : `自定义 (${userId.slice(0, 8)}…)`;
        }
        document.getElementById('config-overlay').style.display = 'flex';
        input.focus();
    }

    hideConfigOverlay() {
        document.getElementById('config-overlay').style.display = 'none';
    }

    async submitGistId() {
        const id = document.getElementById('gist-id-input').value.trim();
        if (!id) {
            // 留空 = 恢复默认（与 reset 等价）
            this.resetGistId();
            return;
        }
        if (!GistManager.GIST_ID_PATTERN.test(id)) {
            this.showToast('Gist ID 格式无效（应为 20-40 位的十六进制字符）', 'warn');
            return;
        }
        const ok = GistManager.setUserGistId(id);
        if (!ok) {
            this.showToast('保存失败', 'error');
            return;
        }
        this.gistManager.clearCache();
        this.hideConfigOverlay();
        this.showToast('Gist ID 已保存', 'success');
        await this.refreshAll();
    }

    async resetGistId() {
        GistManager.clearUserGistId();
        this.gistManager.clearCache();
        this.hideConfigOverlay();
        this.showToast('已恢复为公共默认 Gist', 'success');
        await this.refreshAll();
    }

    // 写表单的 Gist ID 输入字段缓存机制（与 fillCachedToken 类似，但用 localStorage）
    fillCachedGistId(inputId) {
        const cached = GistManager.getUserGistId();
        if (cached) {
            document.getElementById(inputId).value = cached;
        }
    }

    // 提交写操作前从表单读取 Gist ID 并校验
    readGistIdFromForm(inputId, rememberCheckboxId) {
        const id = document.getElementById(inputId).value.trim();
        if (!GistManager.GIST_ID_PATTERN.test(id)) {
            this.showToast('请填写合法的 Gist ID（20-40 位十六进制）', 'warn');
            return null;
        }
        return {
            id,
            remember: document.getElementById(rememberCheckboxId)?.checked || false,
        };
    }

    persistGistIdIfRemembered(id, remember) {
        if (remember) {
            GistManager.setUserGistId(id);
        }
    }

    async spin() {
        if (this.isSpinning) return;

        if (this.availableOptions.length === 0) {
            // 没有选项，直接显示结果
            this.showResult('你没饭吃了');
            return;
        }

        this.isSpinning = true;
        document.getElementById('spin-btn').disabled = true;

        const TWO_PI = Math.PI * 2;
        const N = this.options.length;
        const sliceAngle = TWO_PI / N;

        // 不预先选定 index，只生成一个随机最终偏移：5-9 整圈 + 任意单圈内偏移
        const extraTurns = 5 + Math.floor(Math.random() * 5);
        const targetOffset = Math.random() * TWO_PI;
        const totalRotation = TWO_PI * extraTurns + targetOffset;

        // 动画参数
        const duration = 5000; // 5秒
        const startTime = Date.now();
        const startRotation = this.currentRotation;

        // 缓动函数（缓入缓出）
        const easeOutCubic = (t) => 1 - Math.pow(1 - t, 3);

        const animate = () => {
            const elapsed = Date.now() - startTime;
            const progress = Math.min(elapsed / duration, 1);
            const easedProgress = easeOutCubic(progress);

            this.currentRotation = startRotation + totalRotation * easedProgress;
            this.drawWheel();

            if (progress < 1) {
                requestAnimationFrame(animate);
            } else {
                // 归一化到 [0, 2π)
                const finalRotation = ((startRotation + totalRotation) % TWO_PI + TWO_PI) % TWO_PI;
                this.currentRotation = finalRotation;
                this.drawWheel();

                // 反推：指针指向 0°（canvas 右侧），扇形 i 的全局起始角 = i*sliceAngle + currentRotation
                // 找 i 使 0° 落在 [i*sliceAngle + currentRotation, (i+1)*sliceAngle + currentRotation) (mod 2π)
                // 等价于 (-currentRotation mod 2π) 落在 [i*sliceAngle, (i+1)*sliceAngle)
                const pointerLocal = ((TWO_PI - finalRotation) % TWO_PI + TWO_PI) % TWO_PI;
                const finalIndex = Math.floor(pointerLocal / sliceAngle) % N;
                const finalOption = this.options[finalIndex];

                this.isSpinning = false;
                document.getElementById('spin-btn').disabled = false;
                this.showResult(finalOption);
            }
        };

        animate();
    }
    
    showResult(option) {
        this.lastSelectedOption = option; // 保存选择结果
        document.getElementById('result-food').textContent = option;
        document.getElementById('result-overlay').style.display = 'flex';
    }
    
    hideResult() {
        document.getElementById('result-overlay').style.display = 'none';
    }
    
    // 显示记录界面并自动选择最后抽到的选项
    async showRecordWithSelected() {
        // 先显示记录界面
        await this.showRecordOverlay();
        
        // 如果有最后选择的选项，自动选中
        if (this.lastSelectedOption && this.lastSelectedOption !== '你没饭吃了') {
            const select = document.getElementById('record-option');
            // 查找并选中对应的选项
            for (let i = 0; i < select.options.length; i++) {
                if (select.options[i].value === this.lastSelectedOption) {
                    select.selectedIndex = i;
                    break;
                }
            }
        }
    }
    
    // 顶部 toast，3 秒自动消失
    showToast(msg, type = 'info') {
        const stack = document.getElementById('toast-stack');
        if (!stack) {
            // 兜底：DOM 还未就绪
            console.log(`[toast/${type}] ${msg}`);
            return;
        }
        const toast = document.createElement('div');
        toast.className = `toast ${type}`;
        toast.textContent = msg;
        stack.appendChild(toast);
        setTimeout(() => {
            toast.classList.add('fade-out');
            setTimeout(() => toast.remove(), 300);
        }, 2700);
    }

    // Token 会话缓存（仅 sessionStorage，关闭标签页即清除）
    static TOKEN_KEY = 'lunch-wheel:token';

    rememberToken(token, checked) {
        if (checked) {
            sessionStorage.setItem(LunchWheel.TOKEN_KEY, token);
        } else {
            sessionStorage.removeItem(LunchWheel.TOKEN_KEY);
        }
    }

    fillCachedToken(inputId, checkboxId) {
        const cached = sessionStorage.getItem(LunchWheel.TOKEN_KEY);
        if (!cached) return;
        document.getElementById(inputId).value = cached;
        const cb = document.getElementById(checkboxId);
        if (cb) cb.checked = true;
    }

    showAddOverlay() {
        // 先隐藏empty-message弹窗（避免两个弹窗同时显示）
        document.getElementById('empty-message').style.display = 'none';
        
        // 然后显示add-overlay弹窗
        document.getElementById('add-overlay').style.display = 'flex';
        document.getElementById('new-option').focus();
        this.fillCachedToken('gist-token', 'remember-token-add');
        this.fillCachedGistId('gist-id-add');
    }

    hideAddOverlay() {
        document.getElementById('add-overlay').style.display = 'none';
        document.getElementById('new-option').value = '';
        document.getElementById('gist-token').value = '';
        document.getElementById('gist-id-add').value = '';
    }

    async submitNewOption() {
        const option = document.getElementById('new-option').value.trim();
        const token = document.getElementById('gist-token').value.trim();

        if (!option) {
            this.showToast('请输入选项名称', 'warn');
            return;
        }

        // 拒绝可能产生意外渲染的字符（防御性，配合 textContent）
        if (/[<>&"']/.test(option)) {
            this.showToast('选项名包含非法字符（<, >, &, ", \')', 'warn');
            return;
        }

        if (option.length > 20) {
            this.showToast('选项名不能超过 20 个字符', 'warn');
            return;
        }

        const gist = this.readGistIdFromForm('gist-id-add', 'remember-gist-id-add');
        if (!gist) return;

        if (!token) {
            this.showToast('请输入 GitHub Token', 'warn');
            return;
        }

        const remember = document.getElementById('remember-token-add').checked;

        try {
            const result = await this.gistManager.addOption(option, token, gist.id);

            if (result.status === 'added') {
                this.rememberToken(token, remember);
                this.persistGistIdIfRemembered(gist.id, gist.remember);
                this.showToast(`"${option}" 已添加`, 'success');
                this.hideAddOverlay();
                await this.refreshAll();
                document.getElementById('empty-message').style.display = 'none';
            } else if (result.status === 'duplicate') {
                this.showToast('已存在该选项，无需重复添加', 'warn');
            } else {
                this.showToast('添加失败，请检查 Token 权限或 Gist ID', 'error');
            }
        } catch (e) {
            this.showToast('添加失败：' + e.message, 'error');
        }
    }
    
    // 刷新轮盘和历史记录
    async refreshAll() {
        // 显示加载状态
        const historyList = document.getElementById('history-list');
        historyList.innerHTML = '<div class="loading">加载中...</div>';
        
        // 立即清除所有缓存，确保从gist重新读取最新数据
        this.gistManager.clearCache();
        
        // 等待数据读取完成
        await this.loadOptions();
        this.drawWheel();
        await this.updateHistoryDisplay();
    }
    
    async showRecordOverlay() {
        // 清除缓存，确保获取最新数据
        this.gistManager.clearCache();

        const allOptions = await this.gistManager.getAllOptions();

        const select = document.getElementById('record-option');
        select.replaceChildren();
        const placeholder = document.createElement('option');
        placeholder.value = '';
        placeholder.textContent = '-- 请选择 --';
        select.appendChild(placeholder);

        allOptions.forEach(option => {
            const opt = document.createElement('option');
            opt.value = option;
            opt.textContent = option;
            select.appendChild(opt);
        });

        document.getElementById('record-overlay').style.display = 'flex';
        this.fillCachedToken('record-token', 'remember-token-record');
        this.fillCachedGistId('gist-id-record');
    }

    hideRecordOverlay() {
        document.getElementById('record-overlay').style.display = 'none';
        document.getElementById('record-token').value = '';
        document.getElementById('gist-id-record').value = '';
        document.getElementById('record-option').selectedIndex = 0;
    }

    async submitRecord() {
        const select = document.getElementById('record-option');
        const option = select.value;
        const token = document.getElementById('record-token').value.trim();

        if (!option) {
            this.showToast('请选择吃了什么', 'warn');
            return;
        }

        const gist = this.readGistIdFromForm('gist-id-record', 'remember-gist-id-record');
        if (!gist) return;

        if (!token) {
            this.showToast('请输入 GitHub Token', 'warn');
            return;
        }

        const remember = document.getElementById('remember-token-record').checked;

        try {
            const success = await this.gistManager.recordHistory(option, token, gist.id);

            if (success) {
                this.rememberToken(token, remember);
                this.persistGistIdIfRemembered(gist.id, gist.remember);
                this.showToast(`已记录：${option}`, 'success');
                this.hideRecordOverlay();
                await this.refreshAll();
            } else {
                this.showToast('记录失败，请检查 Token 权限或 Gist ID', 'error');
            }
        } catch (e) {
            this.showToast('记录失败：' + e.message, 'error');
        }
    }
    
    showClearConfirm() {
        const confirmed = confirm('确定要清空所有历史记录吗？\n清空后所有选项都会重新加入轮盘。');
        if (confirmed) {
            this.showClearOverlay();
        }
    }
    
    showClearOverlay() {
        const overlay = document.createElement('div');
        overlay.className = 'record-overlay';
        overlay.id = 'clear-token-overlay';
        overlay.style.display = 'flex';

        const content = document.createElement('div');
        content.className = 'record-content';

        const h2 = document.createElement('h2');
        h2.textContent = '🗑️ 清空记录';

        const hintRow = document.createElement('p');
        hintRow.className = 'overlay-hint';
        hintRow.textContent = '💡 写操作需要 Gist ID 与 GitHub Token';

        // Gist ID 字段
        const gistGroup = document.createElement('div');
        gistGroup.className = 'form-group';
        const gistLabel = document.createElement('label');
        gistLabel.htmlFor = 'clear-gist-id';
        gistLabel.textContent = 'Gist ID：';
        const gistInput = document.createElement('input');
        gistInput.type = 'text';
        gistInput.id = 'clear-gist-id';
        gistInput.placeholder = '20-40 位十六进制';
        const cachedGistId = GistManager.getUserGistId();
        if (cachedGistId) gistInput.value = cachedGistId;
        const rememberGistLabel = document.createElement('label');
        rememberGistLabel.className = 'remember-token';
        const rememberGistCb = document.createElement('input');
        rememberGistCb.type = 'checkbox';
        rememberGistCb.id = 'remember-gist-id-clear';
        rememberGistLabel.append(rememberGistCb, document.createTextNode(' 在本浏览器记住（同时切换为读取该 Gist）'));
        gistGroup.append(gistLabel, gistInput, rememberGistLabel);

        // Token 字段
        const tokenGroup = document.createElement('div');
        tokenGroup.className = 'form-group';
        const tokenLabel = document.createElement('label');
        tokenLabel.htmlFor = 'clear-token';
        tokenLabel.textContent = 'GitHub Token：';
        const tokenInput = document.createElement('input');
        tokenInput.type = 'password';
        tokenInput.id = 'clear-token';
        tokenInput.placeholder = 'ghp_xxxxxx（需要 gist 权限）';
        const hint = document.createElement('small');
        hint.textContent = '需要 Token 才能清空记录';
        tokenGroup.append(tokenLabel, tokenInput, hint);

        const buttons = document.createElement('div');
        buttons.className = 'form-buttons';
        const confirmBtn = document.createElement('button');
        confirmBtn.id = 'confirm-clear';
        confirmBtn.className = 'submit-btn danger-btn';
        confirmBtn.textContent = '确认清空';
        const cancelBtn = document.createElement('button');
        cancelBtn.id = 'cancel-clear';
        cancelBtn.className = 'cancel-btn';
        cancelBtn.textContent = '取消';
        buttons.append(confirmBtn, cancelBtn);

        content.append(h2, hintRow, gistGroup, tokenGroup, buttons);
        overlay.appendChild(content);
        document.body.appendChild(overlay);

        confirmBtn.addEventListener('click', async () => {
            const gistId = gistInput.value.trim();
            if (!GistManager.GIST_ID_PATTERN.test(gistId)) {
                this.showToast('请填写合法的 Gist ID（20-40 位十六进制）', 'warn');
                return;
            }
            const token = tokenInput.value.trim();
            if (!token) {
                this.showToast('请输入 GitHub Token', 'warn');
                return;
            }
            await this.clearHistory(token, gistId);
            this.persistGistIdIfRemembered(gistId, rememberGistCb.checked);
            overlay.remove();
            document.removeEventListener('keydown', onKey);
        });

        cancelBtn.addEventListener('click', () => {
            overlay.remove();
            document.removeEventListener('keydown', onKey);
        });

        // Esc 关闭 / Enter 提交
        const onKey = (e) => {
            if (e.key === 'Escape') {
                overlay.remove();
                document.removeEventListener('keydown', onKey);
            } else if (e.key === 'Enter' && (document.activeElement === tokenInput || document.activeElement === gistInput)) {
                confirmBtn.click();
            }
        };
        document.addEventListener('keydown', onKey);
    }

    async clearHistory(token, gistId) {
        try {
            const data = await this.gistManager.readData();
            data.history = [];

            const success = await this.gistManager.writeData(data, token, gistId);

            if (success) {
                this.gistManager.clearCache();
                this.showToast('历史记录已清空', 'success');
                await this.refreshAll();
            } else {
                this.showToast('清空失败，请检查 Token 权限或 Gist ID', 'error');
            }
        } catch (e) {
            this.showToast('清空失败：' + e.message, 'error');
        }
    }

    // 管理选项弹窗：列出所有选项 + 删除
    async showManageOverlay() {
        await this.renderManageList();
        document.getElementById('manage-overlay').style.display = 'flex';
        this.fillCachedToken('manage-token', 'remember-token-manage');
        this.fillCachedGistId('gist-id-manage');
    }

    hideManageOverlay() {
        document.getElementById('manage-overlay').style.display = 'none';
        document.getElementById('manage-token').value = '';
        document.getElementById('gist-id-manage').value = '';
    }

    async renderManageList() {
        const list = document.getElementById('manage-list');
        list.replaceChildren();
        const allOptions = await this.gistManager.getAllOptions();

        if (allOptions.length === 0) {
            const empty = document.createElement('div');
            empty.className = 'manage-empty';
            empty.textContent = '暂无选项';
            list.appendChild(empty);
            return;
        }

        allOptions.forEach(name => {
            const item = document.createElement('div');
            item.className = 'manage-item';
            const nameEl = document.createElement('span');
            nameEl.className = 'manage-item-name';
            nameEl.textContent = name; // textContent 防 XSS
            const del = document.createElement('button');
            del.className = 'manage-item-delete';
            del.textContent = '删除';
            del.addEventListener('click', () => this.deleteOption(name));
            item.append(nameEl, del);
            list.appendChild(item);
        });
    }

    async deleteOption(name) {
        const gist = this.readGistIdFromForm('gist-id-manage', 'remember-gist-id-manage');
        if (!gist) return;

        const token = document.getElementById('manage-token').value.trim();
        if (!token) {
            this.showToast('请先填写 Token 再删除', 'warn');
            return;
        }
        if (!confirm(`确定删除选项 "${name}" 吗？`)) return;

        const remember = document.getElementById('remember-token-manage').checked;

        try {
            const ok = await this.gistManager.deleteOption(name, token, gist.id);
            if (ok) {
                this.rememberToken(token, remember);
                this.persistGistIdIfRemembered(gist.id, gist.remember);
                this.showToast(`已删除 "${name}"`, 'success');
                await this.renderManageList();
                await this.refreshAll();
            } else {
                this.showToast('删除失败，请检查 Token 权限或 Gist ID', 'error');
            }
        } catch (e) {
            this.showToast('删除失败：' + e.message, 'error');
        }
    }
}

// 启动
window.addEventListener('DOMContentLoaded', () => {
    new LunchWheel();
});