// 2048 游戏 - 支持自定义大小和排行榜
class Game2048 {
    constructor() {
        this.gridSize = 4; // 默认4x4
        this.grid = [];
        this.score = 0;
        this.bestScore = parseInt(localStorage.getItem('2048BestScore_' + this.gridSize)) || 0;
        this.gameOver = false;
        this.isAnimating = false;
        
        // 排行榜管理
        this.leaderboardManager = new LeaderboardManager2048();
        
        this.init();
        this.setupEventListeners();
        this.setupSizeControl();
        this.setupLeaderboardUI();
    }
    
    // 初始化游戏
    init() {
        this.grid = [];
        for (let i = 0; i < this.gridSize; i++) {
            this.grid[i] = [];
            for (let j = 0; j < this.gridSize; j++) {
                this.grid[i][j] = 0;
            }
        }
        this.score = 0;
        this.gameOver = false;
        
        // 添加两个初始数字
        this.addRandomTile();
        this.addRandomTile();
        
        this.updateDisplay();
        this.renderGrid();
    }
    
    // 添加随机数字（90%概率是2，10%概率是4）
    addRandomTile() {
        const emptyCells = [];
        for (let i = 0; i < this.gridSize; i++) {
            for (let j = 0; j < this.gridSize; j++) {
                if (this.grid[i][j] === 0) {
                    emptyCells.push({ row: i, col: j });
                }
            }
        }
        
        if (emptyCells.length === 0) return false;
        
        const randomCell = emptyCells[Math.floor(Math.random() * emptyCells.length)];
        const value = Math.random() < 0.9 ? 2 : 4;
        this.grid[randomCell.row][randomCell.col] = value;
        
        return true;
    }
    
    // 渲染网格
    renderGrid() {
        const gridElement = document.getElementById('game-grid');
        if (!gridElement) return;
        
        // 清空网格
        gridElement.innerHTML = '';
        
        // 动态计算格子大小
        const cellSize = Math.min(80, 320 / this.gridSize);
        const gapSize = 8;
        gridElement.style.display = 'grid';
        gridElement.style.gridTemplateColumns = `repeat(${this.gridSize}, ${cellSize}px)`;
        gridElement.style.gap = `${gapSize}px`;
        gridElement.style.padding = `${gapSize}px`;
        
        for (let i = 0; i < this.gridSize; i++) {
            for (let j = 0; j < this.gridSize; j++) {
                const cell = document.createElement('div');
                cell.className = 'grid-cell';
                const value = this.grid[i][j];
                
                if (value !== 0) {
                    cell.textContent = value;
                    cell.classList.add(`tile-${value}`);
                    if (value > 2048) {
                        cell.classList.add('tile-super');
                    }
                }
                
                gridElement.appendChild(cell);
            }
        }
    }
    
    // 更新显示
    updateDisplay() {
        document.getElementById('score').textContent = this.score;
        document.getElementById('best-score').textContent = this.bestScore;
    }
    
    // 移动逻辑
    move(direction) {
        if (this.gameOver || this.isAnimating) return;
        
        let moved = false;
        let mergedScore = 0;
        
        // 根据方向处理
        if (direction === 'left') {
            for (let i = 0; i < this.gridSize; i++) {
                const result = this.slideRow(this.grid[i]);
                if (result.moved) moved = true;
                mergedScore += result.score;
                this.grid[i] = result.row;
            }
        } else if (direction === 'right') {
            for (let i = 0; i < this.gridSize; i++) {
                const reversed = [...this.grid[i]].reverse();
                const result = this.slideRow(reversed);
                if (result.moved) moved = true;
                mergedScore += result.score;
                this.grid[i] = result.row.reverse();
            }
        } else if (direction === 'up') {
            for (let j = 0; j < this.gridSize; j++) {
                const col = this.grid.map(row => row[j]);
                const result = this.slideRow(col);
                if (result.moved) moved = true;
                mergedScore += result.score;
                for (let i = 0; i < this.gridSize; i++) {
                    this.grid[i][j] = result.row[i];
                }
            }
        } else if (direction === 'down') {
            for (let j = 0; j < this.gridSize; j++) {
                const col = this.grid.map(row => row[j]).reverse();
                const result = this.slideRow(col);
                if (result.moved) moved = true;
                mergedScore += result.score;
                const newCol = result.row.reverse();
                for (let i = 0; i < this.gridSize; i++) {
                    this.grid[i][j] = newCol[i];
                }
            }
        }
        
        if (moved) {
            this.score += mergedScore;
            if (this.score > this.bestScore) {
                this.bestScore = this.score;
                localStorage.setItem('2048BestScore_' + this.gridSize, this.bestScore);
            }
            
            this.addRandomTile();
            this.updateDisplay();
            this.renderGrid();
            
            // 检查游戏是否结束
            if (!this.canMove()) {
                this.gameOver = true;
                this.showGameOver();
            }
        }
    }
    
    // 滑动一行/列
    slideRow(row) {
        // 移除空格
        let newRow = row.filter(val => val !== 0);
        let score = 0;
        let moved = false;
        
        // 合并相同数字
        for (let i = 0; i < newRow.length - 1; i++) {
            if (newRow[i] === newRow[i + 1]) {
                newRow[i] *= 2;
                score += newRow[i];
                newRow.splice(i + 1, 1);
            }
        }
        
        // 补齐空格
        while (newRow.length < this.gridSize) {
            newRow.push(0);
        }
        
        // 检查是否移动了
        for (let i = 0; i < row.length; i++) {
            if (row[i] !== newRow[i]) {
                moved = true;
                break;
            }
        }
        
        return { row: newRow, score, moved };
    }
    
    // 检查是否还能移动
    canMove() {
        // 检查是否有空格
        for (let i = 0; i < this.gridSize; i++) {
            for (let j = 0; j < this.gridSize; j++) {
                if (this.grid[i][j] === 0) return true;
            }
        }
        
        // 检查是否有相邻相同数字
        for (let i = 0; i < this.gridSize; i++) {
            for (let j = 0; j < this.gridSize; j++) {
                const current = this.grid[i][j];
                // 检查右边
                if (j < this.gridSize - 1 && current === this.grid[i][j + 1]) return true;
                // 检查下边
                if (i < this.gridSize - 1 && current === this.grid[i + 1][j]) return true;
            }
        }
        
        return false;
    }
    
    // 显示游戏结束
    showGameOver() {
        const overlay = document.getElementById('game-over-overlay');
        if (overlay) {
            overlay.style.display = 'flex';
            document.getElementById('final-score').textContent = this.score;
        }
        
        // 显示保存成绩选项
        if (this.score > 0) {
            this.showNameInput(this.score, this.gridSize);
        }
    }
    
    // 设置事件监听
    setupEventListeners() {
        // 键盘控制
        document.addEventListener('keydown', (e) => {
            switch(e.key) {
                case 'ArrowUp':
                    e.preventDefault();
                    this.move('up');
                    break;
                case 'ArrowDown':
                    e.preventDefault();
                    this.move('down');
                    break;
                case 'ArrowLeft':
                    e.preventDefault();
                    this.move('left');
                    break;
                case 'ArrowRight':
                    e.preventDefault();
                    this.move('right');
                    break;
            }
        });
        
        // 新游戏按钮
        document.getElementById('new-game-btn')?.addEventListener('click', () => {
            this.init();
        });
        
        // 重玩按钮
        document.getElementById('retry-btn')?.addEventListener('click', () => {
            document.getElementById('game-over-overlay').style.display = 'none';
            this.init();
        });
        
        // 触摸控制
        this.setupTouchControl();
    }
    
    // 触摸控制
    setupTouchControl() {
        const gameContainer = document.getElementById('game-container');
        if (!gameContainer) return;
        
        let startX, startY;
        const minSwipeDistance = 30;
        
        gameContainer.addEventListener('touchstart', (e) => {
            startX = e.touches[0].clientX;
            startY = e.touches[0].clientY;
        });
        
        gameContainer.addEventListener('touchend', (e) => {
            if (!startX || !startY) return;
            
            const endX = e.changedTouches[0].clientX;
            const endY = e.changedTouches[0].clientY;
            
            const dx = endX - startX;
            const dy = endY - startY;
            
            const absDx = Math.abs(dx);
            const absDy = Math.abs(dy);
            
            if (Math.max(absDx, absDy) > minSwipeDistance) {
                if (absDx > absDy) {
                    // 水平滑动
                    this.move(dx > 0 ? 'right' : 'left');
                } else {
                    // 垂直滑动
                    this.move(dy > 0 ? 'down' : 'up');
                }
            }
            
            startX = null;
            startY = null;
        });
    }
    
    // 设置大小控制
    setupSizeControl() {
        const sizeSelect = document.getElementById('grid-size');
        if (sizeSelect) {
            sizeSelect.value = this.gridSize;
            sizeSelect.addEventListener('change', (e) => {
                const newSize = parseInt(e.target.value);
                if (newSize >= 3 && newSize <= 6) {
                    this.gridSize = newSize;
                    this.bestScore = parseInt(localStorage.getItem('2048BestScore_' + this.gridSize)) || 0;
                    this.init();
                }
            });
        }
    }
    
    // 显示昵称输入框
    showNameInput(score, gridSize) {
        const overlay = document.createElement('div');
        overlay.className = 'name-input-overlay';
        overlay.id = 'name-input-overlay';
        
        overlay.innerHTML = `
            <div class="name-input-content">
                <h3>🏆 保存成绩</h3>
                <p>分数：<strong>${score}</strong> (${gridSize}x${gridSize})</p>
                <p style="font-size: 14px; color: #888;">输入昵称保存到排行榜（3-12字符）</p>
                <input type="text" id="player-name" placeholder="输入昵称" maxlength="12" autofocus>
                <div class="name-input-buttons">
                    <button class="name-submit-btn" id="submit-name">保存成绩</button>
                    <button class="name-skip-btn" id="skip-name">跳过</button>
                </div>
            </div>
        `;
        
        document.body.appendChild(overlay);
        
        const nameInput = overlay.querySelector('#player-name');
        const submitBtn = overlay.querySelector('#submit-name');
        const skipBtn = overlay.querySelector('#skip-name');
        
        // 预填上次昵称
        const lastName = localStorage.getItem('2048PlayerName');
        if (lastName) nameInput.value = lastName;
        
        nameInput.focus();
        
        submitBtn.addEventListener('click', async () => {
            const name = nameInput.value.trim();
            if (name.length >= 3 && name.length <= 12) {
                submitBtn.disabled = true;
                submitBtn.textContent = '保存中...';
                
                // 检查是否有Token
                if (!this.leaderboardManager.getGistToken()) {
                    overlay.remove();
                    this.showTokenInputForSave(name, score, gridSize);
                } else {
                    await this.saveScore(name, score, gridSize, overlay);
                }
            } else {
                nameInput.style.borderColor = '#ff0000';
                nameInput.placeholder = '昵称需要3-12字符';
            }
        });
        
        skipBtn.addEventListener('click', () => {
            overlay.remove();
        });
        
        nameInput.addEventListener('keydown', (e) => {
            if (e.key === 'Enter') submitBtn.click();
        });
    }
    
    // 显示Token输入框
    showTokenInputForSave(name, score, gridSize) {
        const overlay = document.createElement('div');
        overlay.className = 'name-input-overlay';
        
        overlay.innerHTML = `
            <div class="name-input-content">
                <h3>🔑 输入 GitHub Token</h3>
                <p style="font-size: 14px; color: #888;">保存成绩需要 GitHub Token</p>
                <input type="password" id="gist-token-input" placeholder="ghp_xxxxxx" maxlength="50" autofocus>
                <div class="name-input-buttons">
                    <button class="name-submit-btn" id="submit-token">确认保存</button>
                    <button class="name-skip-btn" id="skip-token">取消</button>
                </div>
                <a href="https://github.com/settings/tokens/new" target="_blank" style="color: #ffeb3b; font-size: 12px; margin-top: 10px; display: block;">创建 Token（需要 gist 权限）</a>
            </div>
        `;
        
        document.body.appendChild(overlay);
        
        const tokenInput = overlay.querySelector('#gist-token-input');
        const submitBtn = overlay.querySelector('#submit-token');
        const skipBtn = overlay.querySelector('#skip-token');
        
        tokenInput.focus();
        
        submitBtn.addEventListener('click', async () => {
            const token = tokenInput.value.trim();
            if (token.length > 0) {
                this.leaderboardManager.setToken(token);
                overlay.remove();
                // 创建新的overlay来显示保存进度
                const savingOverlay = document.createElement('div');
                savingOverlay.className = 'name-input-overlay';
                savingOverlay.innerHTML = `<div class="name-input-content"><p>保存中...</p></div>`;
                document.body.appendChild(savingOverlay);
                await this.saveScore(name, score, gridSize, savingOverlay);
            }
        });
        
        skipBtn.addEventListener('click', () => overlay.remove());
        
        tokenInput.addEventListener('keydown', (e) => {
            if (e.key === 'Enter') submitBtn.click();
        });
    }
    
    // 保存分数
    async saveScore(name, score, gridSize, overlay) {
        try {
            const success = await this.leaderboardManager.addEntry(name, score, gridSize);
            overlay.remove();
            
            if (success) {
                localStorage.setItem('2048PlayerName', name);
                this.showSuccessMessage(name, score, gridSize);
            } else {
                alert('保存失败，分数未超过现有记录');
            }
        } catch (e) {
            console.error('保存失败:', e);
            overlay.remove();
            alert('保存失败，请稍后重试');
        }
    }
    
    // 显示成功消息
    showSuccessMessage(name, score, gridSize) {
        const overlay = document.createElement('div');
        overlay.className = 'name-input-overlay';
        
        overlay.innerHTML = `
            <div class="name-input-content">
                <h3>✅ 保存成功</h3>
                <p><strong>${name}</strong> 的成绩 <strong>${score}</strong> (${gridSize}x${gridSize}) 已保存</p>
                <div class="name-input-buttons">
                    <button class="name-submit-btn" id="view-leaderboard-btn">查看排行榜</button>
                    <button class="name-skip-btn" id="close-success-btn">继续游戏</button>
                </div>
            </div>
        `;
        
        document.body.appendChild(overlay);
        
        overlay.querySelector('#view-leaderboard-btn').addEventListener('click', () => {
            overlay.remove();
            this.showLeaderboard();
        });
        
        overlay.querySelector('#close-success-btn').addEventListener('click', () => {
            overlay.remove();
        });
    }
    
    // 设置排行榜UI
    setupLeaderboardUI() {
        document.getElementById('leaderboard-btn')?.addEventListener('click', () => {
            this.showLeaderboard();
        });
        
        document.getElementById('close-leaderboard')?.addEventListener('click', () => {
            this.hideLeaderboard();
        });
        
        document.getElementById('leaderboard-overlay')?.addEventListener('click', (e) => {
            if (e.target.id === 'leaderboard-overlay') {
                this.hideLeaderboard();
            }
        });
        
        // 标签切换
        document.querySelectorAll('.tab-btn').forEach(btn => {
            btn.addEventListener('click', () => {
                document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
                btn.classList.add('active');
                this.updateLeaderboardTable(btn.dataset.tab, btn.dataset.size);
            });
        });
    }
    
    // 显示排行榜
    showLeaderboard() {
        const overlay = document.getElementById('leaderboard-overlay');
        if (overlay) {
            overlay.style.display = 'flex';
            // 默认显示总榜 4x4
            this.updateLeaderboardTable('all', '4');
        }
    }
    
    // 隐藏排行榜
    hideLeaderboard() {
        const overlay = document.getElementById('leaderboard-overlay');
        if (overlay) overlay.style.display = 'none';
    }
    
    // 更新排行榜表格
    async updateLeaderboardTable(type, size) {
        const tbody = document.getElementById('leaderboard-body');
        if (!tbody) return;
        
        tbody.innerHTML = `<tr><td colspan="5" class="loading-message">加载中...</td></tr>`;
        
        let data;
        try {
            data = await this.leaderboardManager.getLeaderboardBySize(type, parseInt(size));
        } catch (e) {
            tbody.innerHTML = `<tr><td colspan="5" class="empty-message">加载失败</td></tr>`;
            return;
        }
        
        if (data.length === 0) {
            tbody.innerHTML = `<tr><td colspan="5" class="empty-message">暂无记录</td></tr>`;
            return;
        }
        
        // 过滤并验证数据
        data = data.filter(entry => this.validateEntry(entry));
        
        tbody.innerHTML = '';
        data.forEach((entry, index) => {
            const rank = index + 1;
            
            const tr = document.createElement('tr');
            // 第一名放大150%
            if (rank === 1) {
                tr.style.fontSize = '1.5em';
                tr.style.fontWeight = 'bold';
            }
            
            const tdRank = document.createElement('td');
            tdRank.textContent = rank;
            tr.appendChild(tdRank);
            
            const tdName = document.createElement('td');
            tdName.textContent = entry.name;
            tr.appendChild(tdName);
            
            const tdScore = document.createElement('td');
            tdScore.textContent = entry.score;
            tr.appendChild(tdScore);
            
            const tdSize = document.createElement('td');
            tdSize.textContent = `${entry.gridSize}x${entry.gridSize}`;
            tr.appendChild(tdSize);
            
            const tdDate = document.createElement('td');
            tdDate.textContent = entry.date;
            tr.appendChild(tdDate);
            
            tbody.appendChild(tr);
        });
    }
    
    // 验证数据
    validateEntry(entry) {
        if (!entry.name || typeof entry.name !== 'string') return false;
        if (!/^[\w\u4e00-\u9fa5]{3,12}$/.test(entry.name)) return false;
        if (typeof entry.score !== 'number' || entry.score < 0) return false;
        if (typeof entry.gridSize !== 'number' || entry.gridSize < 3 || entry.gridSize > 6) return false;
        if (!entry.date || typeof entry.date !== 'string') return false;
        return true;
    }
}

// 排行榜管理类
class LeaderboardManager2048 {
    static HARDCODED_GIST_ID = 'b55ccf259dd909773628d75733646c45';
    
    constructor() {
        this.gistId = LeaderboardManager2048.HARDCODED_GIST_ID;
        this.gistToken = sessionStorage.getItem('2048GistToken') || '';
        this.gistFilename = 'leaderboard.json';
        this.maxEntries = 20;
    }
    
    setToken(token) {
        this.gistToken = token;
        sessionStorage.setItem('2048GistToken', token);
    }
    
    getGistToken() {
        return this.gistToken;
    }
    
    async getLeaderboard() {
        if (!this.gistId) return [];
        
        try {
            const apiUrl = `https://api.github.com/gists/${this.gistId}`;
            const response = await fetch(apiUrl);
            const gist = await response.json();
            
            if (gist.files && gist.files[this.gistFilename]) {
                return JSON.parse(gist.files[this.gistFilename].content);
            }
            return [];
        } catch (e) {
            console.error('获取排行榜失败:', e);
            return [];
        }
    }
    
    async getLeaderboardBySize(type, size) {
        const data = await this.getLeaderboard();
        
        // 按大小过滤
        let filtered = data.filter(entry => entry.gridSize === size);
        
        // 按类型过滤
        if (type === 'today') {
            const today = new Date().toLocaleDateString('zh-CN');
            filtered = filtered.filter(entry => entry.date === today);
        } else if (type === 'week') {
            const now = Date.now();
            const weekStart = now - 7 * 24 * 60 * 60 * 1000;
            filtered = filtered.filter(entry => entry.timestamp >= weekStart);
        }
        
        // 按分数排序
        filtered.sort((a, b) => b.score - a.score);
        
        return filtered.slice(0, this.maxEntries);
    }
    
    async saveLeaderboard(data) {
        if (!this.gistId || !this.gistToken) return false;
        
        try {
            const apiUrl = `https://api.github.com/gists/${this.gistId}`;
            const response = await fetch(apiUrl, {
                method: 'PATCH',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `token ${this.gistToken}`
                },
                body: JSON.stringify({
                    files: {
                        [this.gistFilename]: {
                            content: JSON.stringify(data, null, 2)
                        }
                    }
                })
            });
            
            return response.ok;
        } catch (e) {
            console.error('保存排行榜失败:', e);
            return false;
        }
    }
    
    async addEntry(name, score, gridSize) {
        if (!name || name.length < 3 || name.length > 12) return false;
        if (!this.gistId || !this.gistToken) return false;
        
        const leaderboard = await this.getLeaderboard();
        const timestamp = Date.now();
        const date = new Date().toLocaleDateString('zh-CN');
        
        // 检查相同昵称和大小
        const existingIndex = leaderboard.findIndex(
            entry => entry.name === name && entry.gridSize === gridSize
        );
        
        if (existingIndex !== -1) {
            if (score > leaderboard[existingIndex].score) {
                leaderboard[existingIndex] = { name, score, gridSize, date, timestamp };
            } else {
                return false;
            }
        } else {
            leaderboard.push({ name, score, gridSize, date, timestamp });
        }
        
        // 按大小和分数排序
        leaderboard.sort((a, b) => {
            if (a.gridSize !== b.gridSize) return b.gridSize - a.gridSize;
            return b.score - a.score;
        });
        
        // 保留每个大小的前20名
        const result = [];
        const sizeCounts = {};
        for (const entry of leaderboard) {
            const size = entry.gridSize;
            if (!sizeCounts[size]) sizeCounts[size] = 0;
            if (sizeCounts[size] < this.maxEntries) {
                result.push(entry);
                sizeCounts[size]++;
            }
        }
        
        return await this.saveLeaderboard(result);
    }
}

// 启动游戏
window.addEventListener('DOMContentLoaded', () => {
    new Game2048();
});