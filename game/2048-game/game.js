// 2048 游戏 - 支持自定义大小、撤销、滑动动画和排行榜
class Game2048 {
    constructor() {
        this.gridSize = 4;
        this.grid = [];
        this.tileIdGrid = []; // 方块ID网格
        this.nextTileId = 1;
        this.prevGrid = null; // 上一步的网格（用于动画）
        this.score = 0;
        this.bestScore = parseInt(localStorage.getItem('2048BestScore_' + this.gridSize)) || 0;
        this.gameOver = false;
        this.won = false;
        this.continuePlaying = false;
        this.isAnimating = false;
        this.history = [];
        this.maxHistory = 10;
        this.animationDuration = 180; // 滑动动画时长（毫秒）
        
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
                    this.tileIdGrid = state.tileIdGrid || this.createEmptyIdGrid();
                    this.nextTileId = state.nextTileId || 1;
                    this.score = state.score || 0;
                    this.gameOver = state.gameOver || false;
                    this.won = state.won || false;
                    this.continuePlaying = state.continuePlaying || false;
                    this.history = state.history || [];
                    return;
                }
            } catch (e) {
                console.error('恢复游戏状态失败:', e);
            }
        }
        this.grid = null;
    }
    
    // 创建空的ID网格
    createEmptyIdGrid() {
        const idGrid = [];
        for (let i = 0; i < this.gridSize; i++) {
            idGrid[i] = [];
            for (let j = 0; j < this.gridSize; j++) {
                idGrid[i][j] = 0;
            }
        }
        return idGrid;
    }
    
    // 保存游戏状态
    saveGameState() {
        const state = {
            grid: this.grid,
            tileIdGrid: this.tileIdGrid,
            nextTileId: this.nextTileId,
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
        this.tileIdGrid = this.createEmptyIdGrid();
        this.nextTileId = 1;
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
        this.prevGrid = null;
        
        this.addRandomTile(true);
        this.addRandomTile(true);
        
        this.updateDisplay();
        this.renderGrid();
        this.saveGameState();
        this.updateUndoButton();
    }
    
    // 保存当前状态到历史
    saveToHistory() {
        const state = {
            grid: this.grid.map(row => [...row]),
            tileIdGrid: this.tileIdGrid.map(row => [...row]),
            nextTileId: this.nextTileId,
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
        this.prevGrid = this.grid.map(row => [...row]); // 保存当前用于动画
        this.grid = prevState.grid;
        this.tileIdGrid = prevState.tileIdGrid;
        this.nextTileId = prevState.nextTileId;
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
    
    // 添加随机数字
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
        const tileId = this.nextTileId++;
        
        this.grid[randomCell.row][randomCell.col] = value;
        this.tileIdGrid[randomCell.row][randomCell.col] = tileId;
        
        return { row: randomCell.row, col: randomCell.col, value, tileId, isNewGame };
    }
    
    // 渲染网格 - 使用绝对定位实现滑动动画
    renderGrid(newTileInfo = null, mergedPositions = [], slideAnimations = null) {
        const gridElement = document.getElementById('game-grid');
        if (!gridElement) return;
        
        gridElement.innerHTML = '';
        
        // 动态计算格子大小 - 根据屏幕宽度自适应
        const wrapperWidth = Math.min(window.innerWidth - 40, 500); // 最大500px，两边留20px
        const maxContainerWidth = wrapperWidth - 20; // game-container padding约15-30px
        const gapSize = Math.max(4, Math.min(8, Math.floor(maxContainerWidth / (this.gridSize * 15)))); // 间距也动态调整
        
        // 计算格子大小：容器宽度 - 所有间距 / 格子数量
        const cellSize = Math.floor((maxContainerWidth - gapSize * (this.gridSize + 1)) / this.gridSize);
        
        const containerSize = cellSize * this.gridSize + gapSize * (this.gridSize + 1);
        
        gridElement.style.width = containerSize + 'px';
        gridElement.style.height = containerSize + 'px';
        
        // 存储当前计算的大小，供其他地方使用
        this.currentCellSize = cellSize;
        this.currentGapSize = gapSize;
        
        // 动态计算字体大小（基于格子大小）
        let fontSize = Math.max(12, Math.min(24, cellSize * 0.3));
        if (cellSize < 50) fontSize = Math.max(10, cellSize * 0.25);
        if (cellSize < 40) fontSize = Math.max(8, cellSize * 0.2);
        
        // 先渲染背景格子
        for (let i = 0; i < this.gridSize; i++) {
            for (let j = 0; j < this.gridSize; j++) {
                const bgCell = document.createElement('div');
                bgCell.className = 'grid-bg-cell';
                bgCell.style.width = cellSize + 'px';
                bgCell.style.height = cellSize + 'px';
                bgCell.style.left = (gapSize + j * (cellSize + gapSize)) + 'px';
                bgCell.style.top = (gapSize + i * (cellSize + gapSize)) + 'px';
                bgCell.style.borderRadius = Math.max(4, Math.min(8, cellSize * 0.1)) + 'px';
                gridElement.appendChild(bgCell);
            }
        }
        
        // 渲染移动轨迹（在方块之前）
        if (slideAnimations) {
            Object.values(slideAnimations).forEach(anim => {
                // 计算轨迹路径
                const fromLeft = gapSize + anim.fromCol * (cellSize + gapSize);
                const fromTop = gapSize + anim.fromRow * (cellSize + gapSize);
                const toLeft = gapSize + anim.toCol * (cellSize + gapSize);
                const toTop = gapSize + anim.toRow * (cellSize + gapSize);
                
                // 创建轨迹元素
                const trail = document.createElement('div');
                trail.className = 'move-trail';
                
                // 计算轨迹大小和位置（覆盖移动路径）
                const minLeft = Math.min(fromLeft, toLeft);
                const minTop = Math.min(fromTop, toTop);
                const maxLeft = Math.max(fromLeft, toLeft);
                const maxTop = Math.max(fromTop, toTop);
                
                // 如果是直线移动（水平或垂直）
                if (anim.fromRow === anim.toRow || anim.fromCol === anim.toCol) {
                    trail.style.width = (maxLeft - minLeft + cellSize) + 'px';
                    trail.style.height = (maxTop - minTop + cellSize) + 'px';
                    trail.style.left = minLeft + 'px';
                    trail.style.top = minTop + 'px';
                } else {
                    // 拐弯移动（很少见，但需要处理）
                    trail.style.width = cellSize + 'px';
                    trail.style.height = cellSize + 'px';
                    trail.style.left = minLeft + 'px';
                    trail.style.top = minTop + 'px';
                }
                
                gridElement.appendChild(trail);
            });
        }
        
        // 收集所有方块信息
        const tiles = [];
        for (let i = 0; i < this.gridSize; i++) {
            for (let j = 0; j < this.gridSize; j++) {
                if (this.grid[i][j] !== 0) {
                    tiles.push({
                        id: this.tileIdGrid[i][j],
                        row: i,
                        col: j,
                        value: this.grid[i][j]
                    });
                }
            }
        }
        
        // 渲染方块（使用绝对定位）
        tiles.forEach(tile => {
            const tileElement = document.createElement('div');
            tileElement.className = 'tile';
            tileElement.classList.add(`tile-${tile.value}`);
            if (tile.value > 2048) {
                tileElement.classList.add('tile-super');
            }
            tileElement.textContent = tile.value;
            tileElement.dataset.id = tile.id;
            
            const targetLeft = gapSize + tile.col * (cellSize + gapSize);
            const targetTop = gapSize + tile.row * (cellSize + gapSize);
            
            tileElement.style.width = cellSize + 'px';
            tileElement.style.height = cellSize + 'px';
            tileElement.style.borderRadius = Math.max(4, Math.min(8, cellSize * 0.1)) + 'px';
            
            // 动态调整字体大小
            let tileFontSize = fontSize;
            if (tile.value >= 128 && tile.value < 1024) {
                tileFontSize = fontSize * 0.85;
            } else if (tile.value >= 1024 && tile.value <= 2048) {
                tileFontSize = fontSize * 0.7;
            } else if (tile.value > 2048) {
                tileFontSize = fontSize * 0.6;
            }
            tileElement.style.fontSize = tileFontSize + 'px';
            
            // 检查是否有滑动动画
            if (slideAnimations && slideAnimations[tile.id]) {
                const anim = slideAnimations[tile.id];
                const startLeft = gapSize + anim.fromCol * (cellSize + gapSize);
                const startTop = gapSize + anim.fromRow * (cellSize + gapSize);
                
                // 先设置起始位置（不添加sliding类）
                tileElement.style.left = startLeft + 'px';
                tileElement.style.top = startTop + 'px';
                
                // 使用setTimeout确保初始位置已渲染
                setTimeout(() => {
                    // 添加滑动动画类
                    tileElement.classList.add('sliding');
                    
                    // 设置目标位置
                    tileElement.style.left = targetLeft + 'px';
                    tileElement.style.top = targetTop + 'px';
                    
                    // 动画结束后恢复状态
                    setTimeout(() => {
                        tileElement.classList.remove('sliding');
                        tileElement.classList.add('sliding-done');
                        
                        // 短暂延迟后移除sliding-done
                        setTimeout(() => {
                            tileElement.classList.remove('sliding-done');
                        }, 100);
                    }, this.animationDuration);
                }, 5);
            } else {
                tileElement.style.left = targetLeft + 'px';
                tileElement.style.top = targetTop + 'px';
            }
            
            // 检查是否是新方块
            if (newTileInfo && newTileInfo.tileId === tile.id) {
                tileElement.classList.add('tile-new');
            }
            
            // 检查是否是合并方块
            if (mergedPositions.some(pos => pos.row === tile.row && pos.col === tile.col)) {
                tileElement.classList.add('tile-merged');
            }
            
            gridElement.appendChild(tileElement);
        });
    }
    
    // 更新显示
    updateDisplay(scoreAdded = 0) {
        const scoreEl = document.getElementById('score');
        const bestScoreEl = document.getElementById('best-score');
        
        scoreEl.textContent = this.score;
        bestScoreEl.textContent = this.bestScore;
        
        if (scoreAdded > 0) {
            scoreEl.classList.add('score-pop');
            setTimeout(() => scoreEl.classList.remove('score-pop'), 300);
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
    
    // 移动逻辑 - 增强版，追踪滑动动画
    move(direction) {
        if (this.gameOver || this.isAnimating) return;
        
        // 保存移动前的网格状态
        this.prevGrid = this.grid.map(row => [...row]);
        const prevIdGrid = this.tileIdGrid.map(row => [...row]);
        
        // 保存到历史
        this.saveToHistory();
        
        let moved = false;
        let mergedScore = 0;
        let mergedPositions = [];
        let reached2048 = false;
        
        // 收集滑动动画信息
        const slideAnimations = {};
        
        if (direction === 'left') {
            for (let i = 0; i < this.gridSize; i++) {
                const result = this.slideRowWithAnimation(
                    this.grid[i], prevIdGrid[i], i, 'left'
                );
                if (result.moved) moved = true;
                mergedScore += result.score;
                mergedPositions = mergedPositions.concat(result.mergedPositions);
                if (result.reached2048) reached2048 = true;
                
                // 收集动画
                Object.assign(slideAnimations, result.animations);
                
                this.grid[i] = result.row;
                this.tileIdGrid[i] = result.idRow;
            }
        } else if (direction === 'right') {
            for (let i = 0; i < this.gridSize; i++) {
                const reversed = [...this.grid[i]].reverse();
                const reversedIds = [...prevIdGrid[i]].reverse();
                const result = this.slideRowWithAnimation(reversed, reversedIds, i, 'right');
                if (result.moved) moved = true;
                mergedScore += result.score;
                
                // 转换位置
                const transformedPositions = result.mergedPositions.map(pos => ({
                    row: pos.row,
                    col: this.gridSize - 1 - pos.col
                }));
                mergedPositions = mergedPositions.concat(transformedPositions);
                if (result.reached2048) reached2048 = true;
                
                // 转换动画位置
                for (const id in result.animations) {
                    const anim = result.animations[id];
                    slideAnimations[id] = {
                        fromRow: anim.fromRow,
                        fromCol: this.gridSize - 1 - anim.fromCol,
                        toRow: anim.toRow,
                        toCol: this.gridSize - 1 - anim.toCol
                    };
                }
                
                this.grid[i] = result.row.reverse();
                this.tileIdGrid[i] = result.idRow.reverse();
            }
        } else if (direction === 'up') {
            for (let j = 0; j < this.gridSize; j++) {
                const col = this.grid.map(row => row[j]);
                const colIds = prevIdGrid.map(row => row[j]);
                const result = this.slideRowWithAnimation(col, colIds, j, 'up');
                if (result.moved) moved = true;
                mergedScore += result.score;
                
                const transformedPositions = result.mergedPositions.map(pos => ({
                    row: pos.row,
                    col: j
                }));
                mergedPositions = mergedPositions.concat(transformedPositions);
                if (result.reached2048) reached2048 = true;
                
                // 转换动画
                for (const id in result.animations) {
                    const anim = result.animations[id];
                    slideAnimations[id] = {
                        fromRow: anim.fromCol, // 注意：在up/down中，fromCol存储的是行索引
                        fromCol: j,
                        toRow: anim.toCol,
                        toCol: j
                    };
                }
                
                for (let i = 0; i < this.gridSize; i++) {
                    this.grid[i][j] = result.row[i];
                    this.tileIdGrid[i][j] = result.idRow[i];
                }
            }
        } else if (direction === 'down') {
            for (let j = 0; j < this.gridSize; j++) {
                const col = this.grid.map(row => row[j]).reverse();
                const colIds = prevIdGrid.map(row => row[j]).reverse();
                const result = this.slideRowWithAnimation(col, colIds, j, 'down');
                if (result.moved) moved = true;
                mergedScore += result.score;
                
                const transformedPositions = result.mergedPositions.map(pos => ({
                    row: this.gridSize - 1 - pos.row,
                    col: j
                }));
                mergedPositions = mergedPositions.concat(transformedPositions);
                if (result.reached2048) reached2048 = true;
                
                // 转换动画
                for (const id in result.animations) {
                    const anim = result.animations[id];
                    slideAnimations[id] = {
                        fromRow: this.gridSize - 1 - anim.fromCol,
                        fromCol: j,
                        toRow: this.gridSize - 1 - anim.toCol,
                        toCol: j
                    };
                }
                
                const newCol = result.row.reverse();
                const newColIds = result.idRow.reverse();
                for (let i = 0; i < this.gridSize; i++) {
                    this.grid[i][j] = newCol[i];
                    this.tileIdGrid[i][j] = newColIds[i];
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
            
            this.isAnimating = true;
            this.renderGrid(newTile, mergedPositions, slideAnimations);
            
            // 动画完成后清除状态（滑动动画 + 恢复动画）
            setTimeout(() => {
                this.isAnimating = false;
            }, this.animationDuration + 120);
            
            if (reached2048 && !this.won && !this.continuePlaying) {
                this.won = true;
                setTimeout(() => this.showWin(), this.animationDuration + 100);
            }
            
            if (!this.canMove()) {
                this.gameOver = true;
                setTimeout(() => this.showGameOver(), this.animationDuration + 300);
            }
            
            this.saveGameState();
            this.updateUndoButton();
        } else {
            this.history.pop();
            this.updateUndoButton();
        }
    }
    
    // 滑动一行/列 - 增强版，返回动画信息
    slideRowWithAnimation(row, idRow, index, direction) {
        // 提取非空元素及其位置
        const tiles = [];
        for (let i = 0; i < row.length; i++) {
            if (row[i] !== 0) {
                tiles.push({
                    value: row[i],
                    id: idRow[i],
                    originalPos: i
                });
            }
        }
        
        let newRow = [];
        let newIdRow = [];
        let score = 0;
        let moved = false;
        let mergedPositions = [];
        let reached2048 = false;
        const animations = {};
        
        // 合并相同数字
        let i = 0;
        while (i < tiles.length) {
            if (i + 1 < tiles.length && tiles[i].value === tiles[i + 1].value) {
                // 合并
                const mergedValue = tiles[i].value * 2;
                score += mergedValue;
                if (mergedValue === 2048) reached2048 = true;
                
                newRow.push(mergedValue);
                // 使用第一个方块的ID作为合并后的ID
                newIdRow.push(tiles[i].id);
                
                // 记录合并位置
                const mergePos = newRow.length - 1;
                if (direction === 'left' || direction === 'right') {
                    mergedPositions.push({ row: index, col: mergePos });
                } else {
                    mergedPositions.push({ row: mergePos, col: index });
                }
                
                // 记录第一个方块的动画（如果位置发生变化）
                const fromRow1 = direction === 'left' || direction === 'right' ? index : tiles[i].originalPos;
                const fromCol1 = direction === 'left' || direction === 'right' ? tiles[i].originalPos : index;
                const toRow1 = direction === 'left' || direction === 'right' ? index : mergePos;
                const toCol1 = direction === 'left' || direction === 'right' ? mergePos : index;
                
                // 只有当位置发生变化时才添加动画
                if (fromRow1 !== toRow1 || fromCol1 !== toCol1) {
                    animations[tiles[i].id] = {
                        fromRow: fromRow1,
                        fromCol: fromCol1,
                        toRow: toRow1,
                        toCol: toCol1
                    };
                }
                
                i += 2;
            } else {
                // 不合并，直接移动
                newRow.push(tiles[i].value);
                newIdRow.push(tiles[i].id);
                
                const newPos = newRow.length - 1;
                
                // 计算位置（如果位置发生变化才添加动画）
                const fromRow2 = direction === 'left' || direction === 'right' ? index : tiles[i].originalPos;
                const fromCol2 = direction === 'left' || direction === 'right' ? tiles[i].originalPos : index;
                const toRow2 = direction === 'left' || direction === 'right' ? index : newPos;
                const toCol2 = direction === 'left' || direction === 'right' ? newPos : index;
                
                // 只有当位置发生变化时才添加动画
                if (fromRow2 !== toRow2 || fromCol2 !== toCol2) {
                    animations[tiles[i].id] = {
                        fromRow: fromRow2,
                        fromCol: fromCol2,
                        toRow: toRow2,
                        toCol: toCol2
                    };
                }
                
                i++;
            }
        }
        
        // 补齐空格
        while (newRow.length < this.gridSize) {
            newRow.push(0);
            newIdRow.push(0);
        }
        
        // 检查是否移动了
        for (let i = 0; i < row.length; i++) {
            if (row[i] !== newRow[i]) {
                moved = true;
                break;
            }
        }
        
        return {
            row: newRow,
            idRow: newIdRow,
            score,
            moved,
            mergedPositions,
            reached2048,
            animations
        };
    }
    
    // 检查是否还能移动
    canMove() {
        for (let i = 0; i < this.gridSize; i++) {
            for (let j = 0; j < this.gridSize; j++) {
                if (this.grid[i][j] === 0) return true;
            }
        }
        
        for (let i = 0; i < this.gridSize; i++) {
            for (let j = 0; j < this.gridSize; j++) {
                const current = this.grid[i][j];
                if (j < this.gridSize - 1 && current === this.grid[i][j + 1]) return true;
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
        
        if (this.score > 0) {
            this.showNameInput(this.score, this.gridSize);
        }
    }
    
    // 设置事件监听
    setupEventListeners() {
        document.addEventListener('keydown', (e) => {
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
        
        document.getElementById('new-game-btn')?.addEventListener('click', () => {
            this.grid = null;
            this.tileIdGrid = null;
            this.init();
        });
        
        document.getElementById('retry-btn')?.addEventListener('click', () => {
            document.getElementById('game-over-overlay').style.display = 'none';
            this.grid = null;
            this.tileIdGrid = null;
            this.init();
        });
        
        document.getElementById('continue-btn')?.addEventListener('click', () => {
            document.getElementById('game-win-overlay').style.display = 'none';
            this.continuePlaying = true;
            this.saveGameState();
        });
        
        document.getElementById('new-game-win-btn')?.addEventListener('click', () => {
            document.getElementById('game-win-overlay').style.display = 'none';
            this.grid = null;
            this.tileIdGrid = null;
            this.init();
        });
        
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
    
    // 触摸控制 - 扩大到整个屏幕
    setupTouchControl() {
        let startX, startY;
        let startTime;
        let isSwiping = false;
        const minSwipeDistance = 30;
        const maxSwipeTime = 800; // 增加滑动时间限制
        
        // 监听整个文档的触摸事件
        document.addEventListener('touchstart', (e) => {
            // 排除输入框、按钮等元素
            if (e.target.tagName === 'INPUT' || 
                e.target.tagName === 'BUTTON' || 
                e.target.tagName === 'SELECT' ||
                e.target.closest('.name-input-overlay') ||
                e.target.closest('.leaderboard-overlay') ||
                e.target.closest('.game-over-content') ||
                e.target.closest('.game-win-content')) {
                return;
            }
            
            // 只处理单指触摸
            if (e.touches.length === 1) {
                startX = e.touches[0].clientX;
                startY = e.touches[0].clientY;
                startTime = Date.now();
                isSwiping = true;
            }
        }, { passive: true });
        
        document.addEventListener('touchmove', (e) => {
            // 可以在这里添加一些视觉效果，比如阻止页面滚动
            if (isSwiping && e.touches.length === 1) {
                // 可选：阻止页面滚动（但可能影响用户体验）
                // e.preventDefault();
            }
        }, { passive: true });
        
        document.addEventListener('touchend', (e) => {
            if (!isSwiping || !startX || !startY || !startTime) return;
            
            const endTime = Date.now();
            if (endTime - startTime > maxSwipeTime) {
                startX = null;
                startY = null;
                startTime = null;
                isSwiping = false;
                return;
            }
            
            const endX = e.changedTouches[0].clientX;
            const endY = e.changedTouches[0].clientY;
            
            const dx = endX - startX;
            const dy = endY - startY;
            
            const absDx = Math.abs(dx);
            const absDy = Math.abs(dy);
            
            // 提高最小滑动距离，避免误触发
            if (Math.max(absDx, absDy) > minSwipeDistance) {
                // 阻止其他事件（如点击）
                e.preventDefault();
                
                if (absDx > absDy) {
                    this.move(dx > 0 ? 'right' : 'left');
                } else {
                    this.move(dy > 0 ? 'down' : 'up');
                }
            }
            
            startX = null;
            startY = null;
            startTime = null;
            isSwiping = false;
        }, { passive: false }); // passive: false 以便能调用preventDefault
        
        // 添加窗口resize事件监听 - 使用防抖优化
        let resizeTimeout = null;
        window.addEventListener('resize', () => {
            // 清除之前的定时器
            if (resizeTimeout) {
                clearTimeout(resizeTimeout);
            }
            // 100ms后重新渲染
            resizeTimeout = setTimeout(() => {
                if (!this.gameOver && !this.isAnimating) {
                    this.renderGrid();
                }
                resizeTimeout = null;
            }, 100);
        });
        
        // 添加orientationchange事件监听（针对移动设备）
        window.addEventListener('orientationchange', () => {
            setTimeout(() => {
                if (!this.gameOver && !this.isAnimating) {
                    this.renderGrid();
                }
            }, 200); // 等待orientation change完成
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
                    this.grid = null;
                    this.tileIdGrid = null;
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
        
        document.querySelectorAll('.tab-btn').forEach(btn => {
            btn.addEventListener('click', () => {
                document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
                btn.classList.add('active');
                const size = document.getElementById('leaderboard-size')?.value || '4';
                this.updateLeaderboardTable(btn.dataset.tab, size);
            });
        });
        
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