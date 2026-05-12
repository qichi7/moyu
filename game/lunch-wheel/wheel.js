/**
 * 轮盘抽奖逻辑 - 支持点赞和多菜单
 */

class LunchWheel {
    constructor() {
        this.canvas = document.getElementById('wheel-canvas');
        this.ctx = this.canvas.getContext('2d');
        this.gistManager = new GistManager();

        this.options = []; // 格式: [{name, likes, score}]
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
        const cssSize = this.canvas.clientWidth || 400;
        this.canvas.width = cssSize * dpr;
        this.canvas.height = cssSize * dpr;
        this.canvas.style.width = cssSize + 'px';
        this.canvas.style.height = cssSize + 'px';
        this.ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
        this.cssSize = cssSize;
    }
    
    async init() {
        this.bindEvents();
        this.gistManager.clearCache();
        await this.loadOptions();
        this.drawWheel();
        await this.updateHistoryDisplay();
        await this.updateMenuDisplay();
    }
    
    async loadOptions() {
        const allOptions = await this.gistManager.getAllOptions();
        const emptyEl = document.getElementById('empty-message');

        if (allOptions.length === 0) {
            emptyEl.style.display = 'flex';
            this.availableOptions = [];
            this.options = [];
            this.generateColors();
            return;
        }

        emptyEl.style.display = 'none';

        this.availableOptions = await this.gistManager.getAvailableOptions();
        this.options = this.availableOptions.length > 0
            ? this.availableOptions
            : [];

        if (this.options.length === 0) {
            emptyEl.style.display = 'flex';
        }

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
            name.textContent = item.name;
            const time = document.createElement('span');
            time.className = 'history-time';
            time.textContent = item.time;
            wrap.append(name, time);
            historyList.appendChild(wrap);
        }
    }
    
    async updateMenuDisplay() {
        const menuNameEl = document.getElementById('current-menu-name');
        if (menuNameEl) {
            const menu = await this.gistManager.getCurrentMenu();
            menuNameEl.textContent = menu.name || '默认菜单';
        }
    }
    
    // 根据分数比例生成颜色
    generateColors() {
        this.colors = [];
        const N = this.options.length;
        if (N === 0) return;
        
        // 计算总分
        const totalScore = this.options.reduce((sum, opt) => sum + (opt.score || 100), 0);
        
        // 根据分数占比分配颜色色相范围
        // 分数高的选项使用暖色调（红、橙、黄），分数低的使用冷色调（蓝、绿）
        let hueOffset = 0;
        for (let i = 0; i < N; i++) {
            const score = this.options[i].score || 100;
            const proportion = score / totalScore;
            // 分数越高，色相越偏暖色调（0-60度：红橙黄）
            // 分数越低，色相越偏冷色调（180-240度：蓝绿）
            const hue = score > totalScore / N 
                ? (30 + hueOffset) % 60  // 暖色调
                : (180 + hueOffset) % 240; // 冷色调
            
            hueOffset += proportion * 360;
            this.colors.push(`hsl(${hue}, 65%, 60%)`);
        }
    }
    
    // 自适应字号
    _fitFontSize(items, sliceAngle, textRadius, MAX = 18, MIN = 8) {
        const halfTan = Math.tan(sliceAngle / 2);
        for (let f = MAX; f >= MIN; f--) {
            const safeInner = halfTan > 0 ? (f / 2) / halfTan + 4 : 60;
            const innerLimit = Math.max(55, safeInner);
            const maxWidth = Math.max(20, textRadius - innerLimit);
            this.ctx.font = `bold ${f}px Microsoft YaHei, sans-serif`;
            const allFit = items.every(t => this.ctx.measureText(t.name || t).width <= maxWidth);
            if (allFit) return f;
        }
        return MIN;
    }

    // 绘制轮盘 - 按分数比例显示扇形面积
    drawWheel() {
        const centerX = this.cssSize / 2;
        const centerY = this.cssSize / 2;
        const radius = Math.min(centerX, centerY) - 10;

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
        
        // 计算总分和每个选项的角度占比
        const totalScore = this.options.reduce((sum, opt) => sum + (opt.score || 100), 0);
        const TWO_PI = Math.PI * 2;
        
        // 绘制扇形（按分数比例）
        let currentAngle = 0;
        const textRadius = radius - 15;

        this.ctx.save();
        this.ctx.translate(centerX, centerY);
        this.ctx.rotate(this.currentRotation);

        for (let i = 0; i < this.options.length; i++) {
            const option = this.options[i];
            const score = option.score || 100;
            const proportion = score / totalScore;
            const sliceAngle = TWO_PI * proportion;
            
            const startAngle = currentAngle;
            const endAngle = currentAngle + sliceAngle;

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

            // 绘制文字（在扇形中央）
            if (sliceAngle > 0.1) { // 角度足够大才显示文字
                this.ctx.save();
                this.ctx.rotate(startAngle + sliceAngle / 2);
                this.ctx.textAlign = 'right';
                this.ctx.textBaseline = 'middle';
                this.ctx.fillStyle = '#fff';
                
                // 自适应字号
                const fontSize = this._fitFontSize([option], sliceAngle, textRadius);
                this.ctx.font = `bold ${fontSize}px Microsoft YaHei, sans-serif`;

                const halfTan = Math.tan(sliceAngle / 2);
                const safeInner = halfTan > 0 ? (fontSize / 2) / halfTan + 4 : 60;
                const innerLimit = Math.max(55, safeInner);
                const maxWidth = Math.max(20, textRadius - innerLimit);

                // 显示选项名称 + 点赞数
                let displayText = option.name;
                if (option.likes > 0) {
                    displayText += ` (${option.likes}赞)`;
                }
                
                if (this.ctx.measureText(displayText).width > maxWidth) {
                    // 截断处理
                    while (displayText.length > 1 && this.ctx.measureText(displayText + '…').width > maxWidth) {
                        displayText = displayText.slice(0, -1);
                    }
                    displayText = displayText + '…';
                }

                this.ctx.shadowColor = 'rgba(0, 0, 0, 0.5)';
                this.ctx.shadowBlur = 3;
                this.ctx.fillText(displayText, textRadius, 0);

                this.ctx.restore();
            }

            currentAngle = endAngle;
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

        // 菜单管理
        document.getElementById('menu-manage-btn')?.addEventListener('click', () => {
            this.showMenuManageOverlay();
        });

        // 全局键盘：Esc 关闭顶部弹窗
        const overlayMap = [
            { id: 'config-overlay', submit: 'submit-gist-id', cancel: 'cancel-gist-id' },
            { id: 'add-overlay', submit: 'submit-option', cancel: 'cancel-add' },
            { id: 'record-overlay', submit: 'submit-record', cancel: 'cancel-record' },
            { id: 'manage-overlay', submit: null, cancel: 'close-manage' },
            { id: 'result-overlay', submit: null, cancel: 'close-result' },
            { id: 'menu-manage-overlay', submit: null, cancel: 'close-menu-manage' },
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

    fillCachedGistId(inputId) {
        const cached = GistManager.getUserGistId();
        if (cached) {
            document.getElementById(inputId).value = cached;
        }
    }

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
            this.showResult('你没饭吃了');
            return;
        }

        this.isSpinning = true;
        document.getElementById('spin-btn').disabled = true;

        const TWO_PI = Math.PI * 2;
        const totalScore = this.options.reduce((sum, opt) => sum + (opt.score || 100), 0);
        
        // 按分数权重随机选择（分数越高，中奖概率越高）
        let randomValue = Math.random() * totalScore;
        let selectedIndex = 0;
        let accumulatedScore = 0;
        
        for (let i = 0; i < this.options.length; i++) {
            accumulatedScore += this.options[i].score || 100;
            if (randomValue <= accumulatedScore) {
                selectedIndex = i;
                break;
            }
        }

        // 计算目标角度
        let targetAngleStart = 0;
        for (let i = 0; i < selectedIndex; i++) {
            const proportion = (this.options[i].score || 100) / totalScore;
            targetAngleStart += TWO_PI * proportion;
        }
        
        const proportion = (this.options[selectedIndex].score || 100) / totalScore;
        const sliceAngle = TWO_PI * proportion;
        const targetAngleMid = targetAngleStart + sliceAngle / 2;

        // 旋转动画：5-9整圈 + 目标角度
        const extraTurns = 5 + Math.floor(Math.random() * 5);
        const totalRotation = TWO_PI * extraTurns + (TWO_PI - targetAngleMid);

        const duration = 5000;
        const startTime = Date.now();
        const startRotation = this.currentRotation;

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
                this.currentRotation = ((startRotation + totalRotation) % TWO_PI + TWO_PI) % TWO_PI;
                this.drawWheel();

                this.isSpinning = false;
                document.getElementById('spin-btn').disabled = false;
                this.showResult(this.options[selectedIndex].name);
            }
        };

        animate();
    }
    
    showResult(option) {
        this.lastSelectedOption = option;
        document.getElementById('result-food').textContent = option;
        document.getElementById('result-overlay').style.display = 'flex';
    }
    
    hideResult() {
        document.getElementById('result-overlay').style.display = 'none';
    }
    
    async showRecordWithSelected() {
        await this.showRecordOverlay();
        
        if (this.lastSelectedOption && this.lastSelectedOption !== '你没饭吃了') {
            const select = document.getElementById('record-option');
            for (let i = 0; i < select.options.length; i++) {
                if (select.options[i].value === this.lastSelectedOption) {
                    select.selectedIndex = i;
                    break;
                }
            }
        }
    }
    
    showToast(msg, type = 'info') {
        const stack = document.getElementById('toast-stack');
        if (!stack) {
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
        document.getElementById('empty-message').style.display = 'none';
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

        if (/[<>&"']/.test(option)) {
            this.showToast('选项名包含非法字符（<, >, &, ", \'）', 'warn');
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
    
    async refreshAll() {
        const historyList = document.getElementById('history-list');
        historyList.innerHTML = '<div class="loading">加载中...</div>';
        
        this.gistManager.clearCache();
        
        await this.loadOptions();
        this.drawWheel();
        await this.updateHistoryDisplay();
        await this.updateMenuDisplay();
    }
    
    async showRecordOverlay() {
        this.gistManager.clearCache();

        const allOptions = await this.gistManager.getAllOptions();

        const select = document.getElementById('record-option');
        select.replaceChildren();
        const placeholder = document.createElement('option');
        placeholder.value = '';
        placeholder.textContent = '-- 请选择 --';
        select.appendChild(placeholder);

        allOptions.forEach(opt => {
            const optEl = document.createElement('option');
            optEl.value = opt.name;
            optEl.textContent = opt.name;
            select.appendChild(optEl);
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
        const confirmed = confirm('确定要清空当前菜单的所有历史记录吗？\n清空后所有选项都会重新加入轮盘。');
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
        gistGroup.append(gistLabel, gistInput);

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
                this.showToast('请填写合法的 Gist ID', 'warn');
                return;
            }
            const token = tokenInput.value.trim();
            if (!token) {
                this.showToast('请输入 GitHub Token', 'warn');
                return;
            }
            await this.clearHistory(token, gistId);
            overlay.remove();
            document.removeEventListener('keydown', onKey);
        });

        cancelBtn.addEventListener('click', () => {
            overlay.remove();
            document.removeEventListener('keydown', onKey);
        });

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
            this.gistManager.clearCache();
            
            const data = await this.gistManager.readData();
            const menuId = this.gistManager.getCurrentMenuId();
            
            // 清空当前菜单的历史
            if (data.menus[menuId]) {
                data.menus[menuId].history = [];
            }
            
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

        allOptions.forEach(opt => {
            const item = document.createElement('div');
            item.className = 'manage-item';
            
            const nameEl = document.createElement('span');
            nameEl.className = 'manage-item-name';
            nameEl.textContent = `${opt.name} (${opt.likes}赞, 分数${opt.score})`;
            
            // 点赞按钮
            const likeBtn = document.createElement('button');
            likeBtn.className = 'manage-item-like';
            likeBtn.textContent = '👍';
            likeBtn.addEventListener('click', () => this.likeOptionHandler(opt.name));
            
            // 删除按钮
            const del = document.createElement('button');
            del.className = 'manage-item-delete';
            del.textContent = '删除';
            del.addEventListener('click', () => this.deleteOption(opt.name));
            
            item.append(nameEl, likeBtn, del);
            list.appendChild(item);
        });
    }

    async likeOptionHandler(name) {
        const gist = this.readGistIdFromForm('gist-id-manage', 'remember-gist-id-manage');
        if (!gist) return;

        const token = document.getElementById('manage-token').value.trim();
        if (!token) {
            this.showToast('请先填写 Token 再点赞', 'warn');
            return;
        }

        try {
            const ok = await this.gistManager.likeOption(name, token, gist.id);
            if (ok) {
                this.showToast(`已为 "${name}" 点赞 (+5分)`, 'success');
                await this.renderManageList();
                await this.refreshAll();
            } else {
                this.showToast('点赞失败，请检查 Token 权限或 Gist ID', 'error');
            }
        } catch (e) {
            this.showToast('点赞失败：' + e.message, 'error');
        }
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

        try {
            const ok = await this.gistManager.deleteOption(name, token, gist.id);
            if (ok) {
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

    // 菜单管理相关方法
    async showMenuManageOverlay() {
        await this.renderMenuList();
        this.fillCachedToken('menu-token', null);
        this.fillCachedGistId('menu-gist-id');
        document.getElementById('menu-manage-overlay').style.display = 'flex';
        
        // 添加创建菜单按钮事件
        document.getElementById('create-menu-btn')?.addEventListener('click', () => {
            this.createMenuHandler();
        });
        
        document.getElementById('close-menu-manage')?.addEventListener('click', () => {
            this.hideMenuManageOverlay();
        });
    }

    hideMenuManageOverlay() {
        document.getElementById('menu-manage-overlay').style.display = 'none';
    }

    async createMenuHandler() {
        const name = document.getElementById('new-menu-name').value.trim();
        const gistId = document.getElementById('menu-gist-id').value.trim();
        const token = document.getElementById('menu-token').value.trim();
        
        if (!name) {
            this.showToast('请输入菜单名称', 'warn');
            return;
        }
        
        if (!GistManager.GIST_ID_PATTERN.test(gistId)) {
            this.showToast('请填写合法的 Gist ID', 'warn');
            return;
        }
        
        if (!token) {
            this.showToast('请输入 GitHub Token', 'warn');
            return;
        }
        
        const menuId = await this.gistManager.createMenu(name, token, gistId);
        if (menuId) {
            this.showToast(`菜单 "${name}" 已创建`, 'success');
            document.getElementById('new-menu-name').value = '';
            await this.renderMenuList();
            await this.refreshAll();
        } else {
            this.showToast('创建失败，请检查 Token 权限或 Gist ID', 'error');
        }
    }

    async renderMenuList() {
        const list = document.getElementById('menu-list');
        if (!list) return;
        
        list.replaceChildren();
        const allMenus = await this.gistManager.getAllMenus();
        const currentMenuId = this.gistManager.getCurrentMenuId();

        if (allMenus.length === 0) {
            const empty = document.createElement('div');
            empty.className = 'manage-empty';
            empty.textContent = '暂无菜单';
            list.appendChild(empty);
            return;
        }

        allMenus.forEach(menu => {
            const item = document.createElement('div');
            item.className = 'menu-item';
            if (menu.id === currentMenuId) {
                item.classList.add('active');
            }
            
            const nameEl = document.createElement('span');
            nameEl.className = 'menu-item-name';
            nameEl.textContent = `${menu.name} (${menu.optionCount}个选项)`;
            
            const switchBtn = document.createElement('button');
            switchBtn.className = 'menu-item-switch';
            switchBtn.textContent = menu.id === currentMenuId ? '当前' : '切换';
            if (menu.id !== currentMenuId) {
                switchBtn.addEventListener('click', () => this.switchMenu(menu.id));
            }
            
            // 不能删除默认菜单
            if (menu.id !== GistManager.DEFAULT_MENU_ID) {
                const delBtn = document.createElement('button');
                delBtn.className = 'menu-item-delete';
                delBtn.textContent = '删除';
                delBtn.addEventListener('click', () => this.deleteMenu(menu.id));
                item.append(nameEl, switchBtn, delBtn);
            } else {
                item.append(nameEl, switchBtn);
            }
            
            list.appendChild(item);
        });
    }

    async switchMenu(menuId) {
        this.gistManager.setCurrentMenuId(menuId);
        this.showToast('已切换菜单', 'success');
        await this.refreshAll();
        await this.renderMenuList();
    }

    async deleteMenu(menuId) {
        if (!confirm('确定删除此菜单吗？')) return;
        
        // 需要输入Token和Gist ID
        this.showDeleteMenuOverlay(menuId);
    }

    showDeleteMenuOverlay(menuId) {
        const overlay = document.createElement('div');
        overlay.className = 'record-overlay';
        overlay.id = 'delete-menu-overlay';
        overlay.style.display = 'flex';

        const content = document.createElement('div');
        content.className = 'record-content';

        const h2 = document.createElement('h2');
        h2.textContent = '🗑️ 删除菜单';

        const hintRow = document.createElement('p');
        hintRow.className = 'overlay-hint';
        hintRow.textContent = '💡 删除菜单需要 Gist ID 与 GitHub Token';

        const gistGroup = document.createElement('div');
        gistGroup.className = 'form-group';
        const gistLabel = document.createElement('label');
        gistLabel.textContent = 'Gist ID：';
        const gistInput = document.createElement('input');
        gistInput.type = 'text';
        gistInput.placeholder = '20-40 位十六进制';
        const cachedGistId = GistManager.getUserGistId();
        if (cachedGistId) gistInput.value = cachedGistId;
        gistGroup.append(gistLabel, gistInput);

        const tokenGroup = document.createElement('div');
        tokenGroup.className = 'form-group';
        const tokenLabel = document.createElement('label');
        tokenLabel.textContent = 'GitHub Token：';
        const tokenInput = document.createElement('input');
        tokenInput.type = 'password';
        tokenInput.placeholder = 'ghp_xxxxxx';
        tokenGroup.append(tokenLabel, tokenInput);

        const buttons = document.createElement('div');
        buttons.className = 'form-buttons';
        const confirmBtn = document.createElement('button');
        confirmBtn.className = 'submit-btn danger-btn';
        confirmBtn.textContent = '确认删除';
        const cancelBtn = document.createElement('button');
        cancelBtn.className = 'cancel-btn';
        cancelBtn.textContent = '取消';
        buttons.append(confirmBtn, cancelBtn);

        content.append(h2, hintRow, gistGroup, tokenGroup, buttons);
        overlay.appendChild(content);
        document.body.appendChild(overlay);

        confirmBtn.addEventListener('click', async () => {
            const gistId = gistInput.value.trim();
            if (!GistManager.GIST_ID_PATTERN.test(gistId)) {
                this.showToast('请填写合法的 Gist ID', 'warn');
                return;
            }
            const token = tokenInput.value.trim();
            if (!token) {
                this.showToast('请输入 GitHub Token', 'warn');
                return;
            }

            const ok = await this.gistManager.deleteMenu(menuId, token, gistId);
            if (ok) {
                this.showToast('菜单已删除', 'success');
                overlay.remove();
                await this.refreshAll();
                await this.renderMenuList();
            } else {
                this.showToast('删除失败', 'error');
            }
        });

        cancelBtn.addEventListener('click', () => {
            overlay.remove();
        });
    }
}

// 启动
window.addEventListener('DOMContentLoaded', () => {
    new LunchWheel();
});