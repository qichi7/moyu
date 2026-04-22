// 2048 游戏 - 支持自定义大小、撤销、动画和排行榜
class Game2048 {
    constructor() {
        this.gridSize = 4;
        this.grid = [];
        this.score = 0;
        this.bestScore = parseInt(localStorage.getItem('2048BestScore_' + this.gridSize)) || 0;
        this.gameOver = false;
        this.won = false;
        this.continuePlaying = false;
        this.isAnimating = false;
        this.history = []; // 撤销历史
        this.maxHistory = 10; // 最大撤销次数
        
        // 排行榜管理
        this.leaderboardManager = new LeaderboardManager2048();
        
        // 从本地存储恢复游戏状态
        this.restoreGameState();
        
        this.init();
        this.setupEventListeners();
        this.setupSizeControl();
        this.setupLeaderboardUI();
        this.setupUndoButton();
    }
    
    // 恢复游戏状态
    restoreGameState() {
        const savedState = localStorage.getItem('2048GameState_' + this.gridSize);
        if (savedState) {
            try {
                const state = JSON.parse(savedState);
                if (state.grid && state.grid.length === this.gridSize) {
                    this.grid = state.grid;
                    this.score = state.score || 0;
                    this.gameOver = state.gameOver || false;
                    this.won = state.won || false;
                    this.continuePlaying = state.continuePlaying || false;
                    this.history = state.history || [];
                    return; // 已恢复，不需要初始化
                }
            } catch (e) {
                console.error('恢复游戏状态失败:', e);
            }
        }
        // 没有保存的状态，需要初始化新游戏
        this.grid = null;
    }
    
    // 保存游戏状态
    saveGameState() {
        const state = {
            grid: this.grid,
            score: this.score,
            gameOver: this.gameOver,
            won: this.won,
            continuePlaying: this.continuePlaying,
            history: this.history.slice(-this.maxHistory)
        };
        localStorage.setItem('2048GameState_' + this.gridSize, JSON.stringify(state));
    }
    
    // 初始化游戏
    init() {
        // 如果已有恢复的游戏状态，直接渲染
        if (this.grid && this.grid.length === this.gridSize) {
            this.updateDisplay();
            this.renderGrid();
            if (this.gameOver) {
                this.showGameOver();
            } else if (this.won && !this.continuePlaying) {
                this.showWin();
            }
            return;
        }
        
        // 初始化新游戏
        this.grid = [];
        for (let i = 0; i < this.gridSize; i++) {
            this.grid[i] = [];
            for (let j = 0; j < this.gridSize; j++) {
                this.grid[i][j] = 0;
            }
        }
        this.score = 0;
        this.gameOver = false;
        this.won = false;
        this.continuePlaying = false;
        this.history = [];
        
        // 添加两个初始数字
        this.addRandomTile(true);
        this.addRandomTile(true);
        
        this.updateDisplay();
        this.renderGrid();
        this.saveGameState();
        this.updateUndoButton();
    }
    
    // 保存当前状态到历史（用于撤销）
    saveToHistory() {
        const state = {
            grid: this.grid.map(row => [...row]),
            score: this.score
        };
        this.history.push(state);
        if (this.history.length > this.maxHistory) {
            this.history.shift();
        }
        this.updateUndoButton();
    }
    
    // 撤销
    undo() {
        if (this.history.length === 0 || this.gameOver) return;
        
        const prevState = this.history.pop();
        this.grid = prevState.grid;
        this.score = prevState.score;
        this.updateDisplay();
        this.renderGrid();
        this.saveGameState();
        this.updateUndoButton();
    }
    
    // 更新撤销按钮状态
    updateUndoButton() {
        const undoBtn = document.getElementById('undo-btn');
        if (undoBtn) {
            undoBtn.disabled = this.history.length === 0 || this.gameOver;
        }
    }
    
    // 添加随机数字（90%概率是2，10%概率是4）
    addRandomTile(isNewGame = false) {
        const emptyCells = [];
        for (let i = 0; i < this.gridSize; i++) {
            for (let j = 0; j < this.gridSize; j++) {
                if (this.grid[i][j] === 0) {
                    emptyCells.push({ row: i, col: j });
                }
            }
        }
        
        if (emptyCells.length === 0) return null;
        
        const randomCell = emptyCells[Math.floor(Math.random() * emptyCells.length)];
        const value = Math.random() < 0.9 ? 2 : 4;
        this.grid[randomCell.row][randomCell.col] = value;
        
        return { row: randomCell.row, col: randomCell.col, value, isNewGame };
    }
    
    // 渲染网格
    renderGrid(newTileInfo = null, mergedPositions = []) {
        const gridElement = document.getElementById('game-grid');
        if (!gridElement) return;
        
        gridElement.innerHTML = '';
        
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
                    
                    // 新方块动画
                    if (newTileInfo && newTileInfo.row === i && newTileInfo.col === j) {
                        cell.classList.add('tile-new');
                    }
                    
                    // 合并动画
                    if (mergedPositions.some(pos => pos.row === i && pos.col === j)) {
                        cell.classList.add('tile-merged');
                    }
                }
                
                gridElement.appendChild(cell);
            }
        }
    }
    
    // 更新显示
    updateDisplay(scoreAdded = 0) {
        const scoreEl = document.getElementById('score');
        const bestScoreEl = document.getElementById('best-score');
        
        scoreEl.textContent = this.score;
        bestScoreEl.textContent = this.bestScore;
        
        // 分数增加动画
        if (scoreAdded > 0) {
            scoreEl.classList.add('score-pop');
            setTimeout(() => scoreEl.classList.remove('score-pop'), 300);
            
            // 显示分数增加提示
            this.showScorePopup(scoreAdded);
        }
    }
    
    // 显示分数增加提示
    showScorePopup(scoreAdded) {
        const scoreBox = document.querySelector('.score-box');
        if (!scoreBox) return;
        
        const popup = document.createElement('div');
        popup.className = 'score-add';
        popup.textContent = '+' + scoreAdded;
        popup.style.position = 'absolute';
        
        const rect = scoreBox.getBoundingClientRect();
        popup.style.left = rect.left + rect.width / 2 - 20 + 'px';
        popup.style.top = rect.top + 'px';
        
        document.body.appendChild(popup);
        setTimeout(() => popup.remove(), 800);
    }
    
    // 移动逻辑
    move(direction) {
        if (this.gameOver || this.isAnimating) return;
        
        // 保存当前状态到历史
        this.saveToHistory();
        
        let moved = false;
        let mergedScore = 0;
        let mergedPositions = [];
        let reached2048 = false;
        
        if (direction === 'left') {
            for (let i = 0; i < this.gridSize; i++) {
                const result = this.slideRow(this.grid[i], i);
                if (result.moved) moved = true;
                mergedScore += result.score;
                mergedPositions = mergedPositions.concat(result.mergedPositions);
                if (result.reached2048) reached2048 = true;
                this.grid[i] = result.row;
            }
        } else if (direction === 'right') {
            for (let i = 0; i < this.gridSize; i++) {
                const reversed = [...this.grid[i]].reverse();
                const result = this.slideRow(reversed, i);
                if (result.moved) moved = true;
                mergedScore += result.score;
                // 转换合并位置（因为反向）
                const transformedPositions = result.mergedPositions.map(pos => ({
                    row: pos.row,
                    col: this.gridSize - 1 - pos.col
                }));
                mergedPositions = mergedPositions.concat(transformedPositions);
                if (result.reached2048) reached2048 = true;
                this.grid[i] = result.row.reverse();
            }
        } else if (direction === 'up') {
            for (let j = 0; j < this.gridSize; j++) {
                const col = this.grid.map(row => row[j]);
                const result = this.slideRow(col, -1, j);
                if (result.moved) moved = true;
                mergedScore += result.score;
                // 转换合并位置
                const transformedPositions = result.mergedPositions.map(pos => ({
                    row: pos.row,
                    col: j
                }));
                mergedPositions = mergedPositions.concat(transformedPositions);
                if (result.reached2048) reached2048 = true;
                for (let i = 0; i < this.gridSize; i++) {
                    this.grid[i][j] = result.row[i];
                }
            }
        } else if (direction === 'down') {
            for (let j = 0; j < this.gridSize; j++) {
                const col = this.grid.map(row => row[j]).reverse();
                const result = this.slideRow(col, -1, j);
                if (result.moved) moved = true;
                mergedScore += result.score;
                const newCol = result.row.reverse();
                // 转换合并位置
                const transformedPositions = result.mergedPositions.map(pos => ({
                    row: this.gridSize - 1 - pos.row,
                    col: j
                }));
                mergedPositions = mergedPositions.concat(transformedPositions);
                if (result.reached2048) reached2048 = true;
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
            
            const newTile = this.addRandomTile();
            this.updateDisplay(mergedScore);
            
            // 设置动画状态
            this.isAnimating = true;
            this.renderGrid(newTile, mergedPositions);
            
            setTimeout(() => {
                this.isAnimating = false;
            }, 200);
            
            // 检查是否达成2048
            if (reached2048 && !this.won && !this.continuePlaying) {
                this.won = true;
                setTimeout(() => this.showWin(), 300);
            }
            
            // 检查游戏是否结束
            if (!this.canMove()) {
                this.gameOver = true;
                setTimeout(() => this.showGameOver(), 500);
            }
            
            this.saveGameState();
            this.updateUndoButton();
        } else {
            // 没有移动，移除刚保存的历史
            this.history.pop();
            this.updateUndoButton();
        }
    }
    
    // 滑动一行/列
    slideRow(row, rowIndex = -1, colIndex = -1) {
        let newRow = row.filter(val => val !== 0);
        let score = 0;
        let moved = false;
        let mergedPositions = [];
        let reached2048 = false;
        
        // 合并相同数字
        for (let i = 0; i < newRow.length - 1; i++) {
            if (newRow[i] === newRow[i + 1]) {
                newRow[i] *= 2;
                score += newRow[i];
                
                // 检查是否达成2048
                if (newRow[i] === 2048) reached2048 = true;
                
                newRow.splice(i + 1, 1);
                
                // 记录合并位置
                if (rowIndex >= 0) {
                    mergedPositions.push({ row: rowIndex, col: i });
                } else if (colIndex >= 0) {
                    mergedPositions.push({ row: i, col: colIndex });
                }
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
        
        return { row: newRow, score, moved, mergedPositions, reached2048 };
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
    
    // 显示游戏胜利
    showWin() {
        const overlay = document.getElementById('game-win-overlay');
        if (overlay) {
            overlay.style.display = 'flex';
            document.getElementById('win-score').textContent = this.score;
        }
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
            // 防止在输入框中触发
            if (e.target.tagName === 'INPUT') return;
            
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
                case 'z':
                    if (e.ctrlKey || e.metaKey) {
                        e.preventDefault();
                        this.undo();
                    }
                    break;
            }
        });
        
        // 新游戏按钮
        document.getElementById('new-game-btn')?.addEventListener('click', () => {
            this.grid = null; // 强制重新初始化
            this.init();
        });
        
        // 重玩按钮
        document.getElementById('retry-btn')?.addEventListener('click', () => {
            document.getElementById('game-over-overlay').style.display = 'none';
            this.grid = null;
            this.init();
        });
        
        // 继续挑战按钮
        document.getElementById('continue-btn')?.addEventListener('click', () => {
            document.getElementById('game-win-overlay').style.display = 'none';
            this.continuePlaying = true;
            this.saveGameState();
        });
        
        // 胜利后新游戏按钮
        document.getElementById('new-game-win-btn')?.addEventListener('click', () => {
            document.getElementById('game-win-overlay').style.display = 'none';
            this.grid = null;
            this.init();
        });
        
        // 触摸控制
        this.setupTouchControl();
    }
    
    // 设置撤销按钮
    setupUndoButton() {
        const undoBtn = document.getElementById('undo-btn');
        if (undoBtn) {
            undoBtn.addEventListener('click', () => {
                this.undo();
            });
        }
    }
    
    // 触摸控制
    setupTouchControl() {
        const gameContainer = document.getElementById('game-container');
        if (!gameContainer) return;
        
        let startX, startY;
        let startTime;
        const minSwipeDistance = 30;
        const maxSwipeTime = 500; // 最大滑动时间
        
        gameContainer.addEventListener('touchstart', (e) => {
            startX = e.touches[0].clientX;
            startY = e.touches[0].clientY;
            startTime = Date.now();
        }, { passive: true });
        
        gameContainer.addEventListener('touchend', (e) => {
            if (!startX || !startY || !startTime) return;
            
            const endTime = Date.now();
            if (endTime - startTime > maxSwipeTime) {
                startX = null;
                startY = null;
                return;
            }
            
            const endX = e.changedTouches[0].clientX;
            const endY = e.changedTouches[0].clientY;
            
            const dx = endX - startX;
            const dy = endY - startY;
            
            const absDx = Math.abs(dx);
            const absDy = Math.abs(dy);
            
            if (Math.max(absDx, absDy) > minSwipeDistance) {
                if (absDx > absDy) {
                    this.move(dx > 0 ? 'right' : 'left');
                } else {
                    this.move(dy > 0 ? 'down' : 'up');
                }
            }
            
            startX = null;
            startY = null;
            startTime = null;
        }, { passive: true });
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
                    this.grid = null; // 强制重新初始化
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
        
        document.getElementById('refresh-leaderboard')?.addEventListener('click', async () => {
            const btn = document.getElementById('refresh-leaderboard');
            btn.classList.add('spinning');
            this.leaderboardManager.cache = null;
            this.leaderboardManager.cacheTime = 0;
            const activeTab = document.querySelector('.tab-btn.active');
            const type = activeTab?.dataset.tab || 'all';
            const size = document.getElementById('leaderboard-size')?.value || String(this.gridSize);
            await this.updateLeaderboardTable(type, size);
            btn.classList.remove('spinning');
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
                const size = document.getElementById('leaderboard-size')?.value || '4';
                this.updateLeaderboardTable(btn.dataset.tab, size);
            });
        });
        
        // 网格大小筛选
        document.getElementById('leaderboard-size')?.addEventListener('change', (e) => {
            const activeTab = document.querySelector('.tab-btn.active');
            const type = activeTab?.dataset.tab || 'all';
            this.updateLeaderboardTable(type, e.target.value);
        });
    }
    
    // 显示排行榜
    showLeaderboard() {
        const overlay = document.getElementById('leaderboard-overlay');
        if (overlay) {
            overlay.style.display = 'flex';
            const sizeSelect = document.getElementById('leaderboard-size');
            if (sizeSelect) {
                sizeSelect.value = String(this.gridSize);
            }
            const size = sizeSelect?.value || String(this.gridSize);
            this.updateLeaderboardTable('all', size);
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
        
        data = data.filter(entry => this.validateEntry(entry));
        
        tbody.innerHTML = '';
        data.forEach((entry, index) => {
            const rank = index + 1;
            
            const tr = document.createElement('tr');
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
        this.cache = null;
        this.cacheTime = 0;
        this.cacheExpire = 30 * 1000;
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
        
        const now = Date.now();
        if (this.cache && (now - this.cacheTime) < this.cacheExpire) {
            return this.cache;
        }
        
        try {
            const apiUrl = `https://api.github.com/gists/${this.gistId}`;
            const response = await fetch(apiUrl);
            const gist = await response.json();
            
            if (gist.files && gist.files[this.gistFilename]) {
                const data = JSON.parse(gist.files[this.gistFilename].content);
                this.cache = data;
                this.cacheTime = now;
                return data;
            }
            return [];
        } catch (e) {
            console.error('获取排行榜失败:', e);
            return this.cache || [];
        }
    }
    
    async getLeaderboardBySize(type, size) {
        const data = await this.getLeaderboard();
        
        const sizeNum = parseInt(size);
        let filtered = data.filter(entry => entry.gridSize === sizeNum);
        
        if (type === 'today') {
            const today = new Date().toLocaleDateString('zh-CN');
            filtered = filtered.filter(entry => entry.date === today);
        } else if (type === 'week') {
            const now = Date.now();
            const weekStart = now - 7 * 24 * 60 * 60 * 1000;
            filtered = filtered.filter(entry => entry.timestamp >= weekStart);
        }
        
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
            
            if (response.ok) {
                this.cache = null;
                this.cacheTime = 0;
            }
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
        
        leaderboard.sort((a, b) => {
            if (a.gridSize !== b.gridSize) return b.gridSize - a.gridSize;
            return b.score - a.score;
        });
        
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