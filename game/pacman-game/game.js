// 排行榜管理类（GitHub Gist）
class LeaderboardManager {
    // ========== 硬编码配置（请修改此处）==========
    // 在创建 Gist 后，将 URL 最后一段的哈希字符串填入此处
    // 例如：https://gist.github.com/qichi7/abc123def456 -> ID 是 abc123def456
    static HARDCODED_GIST_ID = '81ae842d7a71d3150bcf18f9578a47b1'; // 硬编码 Gist ID
    static CACHE_VERSION = 'v2'; // 缓存版本号，修改此值可强制清除旧缓存
    
    constructor() {
        this.maxEntries = 10;
        
        // GitHub Gist 配置 - 硬编码 ID，Token 用 sessionStorage（关闭浏览器即失效）
        this.gistId = LeaderboardManager.HARDCODED_GIST_ID;
        this.gistToken = sessionStorage.getItem('pacmanGistToken') || ''; // 改用 sessionStorage
        this.gistFilename = 'leaderboard.json';
        
        // 本地缓存（用于离线读取和备份）
        this.cacheKey = 'pacmanLeaderboardCache';
        this.cacheVersionKey = 'pacmanLeaderboardCacheVersion';
        
        // 检查缓存版本，版本不匹配时清除旧缓存
        this.checkAndClearOldCache();
    }
    
    // 检查并清除旧缓存
    checkAndClearOldCache() {
        const currentVersion = localStorage.getItem(this.cacheVersionKey);
        const oldGistId = localStorage.getItem('pacmanGistId');
        
        // 如果缓存版本不匹配，或有旧的 gistId 配置，清除所有缓存
        if (currentVersion !== LeaderboardManager.CACHE_VERSION || 
            (oldGistId && oldGistId !== this.gistId)) {
            console.log('清除旧缓存，版本:', currentVersion, '->', LeaderboardManager.CACHE_VERSION);
            localStorage.removeItem('pacmanGistId');
            localStorage.removeItem('pacmanGistToken'); // 清除旧的localStorage token
            sessionStorage.removeItem('pacmanGistToken'); // 清除sessionStorage token
            localStorage.removeItem(this.cacheKey);
            localStorage.setItem(this.cacheVersionKey, LeaderboardManager.CACHE_VERSION);
        }
    }
    
    // 设置 Token（用于保存成绩）- 使用 sessionStorage
    setToken(token) {
        this.gistToken = token;
        sessionStorage.setItem('pacmanGistToken', token); // 改用 sessionStorage
    }
    
    // 清除 Token（退出时调用）
    clearToken() {
        this.gistToken = '';
        sessionStorage.removeItem('pacmanGistToken');
    }
    
    // 获取硬编码的 Gist ID
    getGistId() {
        return this.gistId;
    }
    
    getGistToken() {
        return this.gistToken;
    }
    
    // 是否已配置 Gist（ID 硬编码后始终返回 true）
    isConfigured() {
        return this.gistId !== '';
    }
    
    // 获取本地缓存
    getCache() {
        try {
            const data = localStorage.getItem(this.cacheKey);
            return data ? JSON.parse(data) : [];
        } catch (e) {
            console.error('读取缓存失败:', e);
            return [];
        }
    }
    
    // 保存本地缓存
    saveCache(data) {
        try {
            localStorage.setItem(this.cacheKey, JSON.stringify(data));
        } catch (e) {
            console.error('保存缓存失败:', e);
        }
    }
    
    // GitHub Gist：获取排行榜
    async getLeaderboard() {
        if (!this.gistId) {
            console.error('Gist ID 未配置，返回缓存数据');
            return this.getCache();
        }
        
        try {
            const apiUrl = `https://api.github.com/gists/${this.gistId}`;
            const response = await fetch(apiUrl);
            const gist = await response.json();
            
            if (gist.files && gist.files[this.gistFilename]) {
                const content = gist.files[this.gistFilename].content;
                const data = JSON.parse(content);
                // 更新本地缓存
                this.saveCache(data);
                return data;
            }
            return [];
        } catch (e) {
            console.error('获取 Gist 排行榜失败:', e);
            // 网络失败时返回缓存
            return this.getCache();
        }
    }
    
    // GitHub Gist：保存排行榜
    async saveLeaderboard(data) {
        if (!this.gistId) {
            console.error('Gist ID 未配置');
            return false;
        }
        
        if (!this.gistToken) {
            console.error('需要 Gist Token 才能保存数据');
            // 保存到本地缓存
            this.saveCache(data);
            return false;
        }
        
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
                // 同时保存到本地缓存
                this.saveCache(data);
                return true;
            }
            return false;
        } catch (e) {
            console.error('保存 Gist 排行榜失败:', e);
            // 保存到本地缓存
            this.saveCache(data);
            return false;
        }
    }
    
    // 添加新记录
    async addEntry(name, score, isWin) {
        if (!name || name.length < 3 || name.length > 12) {
            return false;
        }
        
        if (!this.gistId || !this.gistToken) {
            console.error('Gist 未配置或缺少 Token');
            return false;
        }
        
        const leaderboard = await this.getLeaderboard();
        const timestamp = Date.now();
        const date = new Date().toLocaleDateString('zh-CN');
        
        // 检查相同昵称
        const existingIndex = leaderboard.findIndex(entry => entry.name === name);
        
        if (existingIndex !== -1) {
            if (score > leaderboard[existingIndex].score) {
                leaderboard[existingIndex] = { name, score, isWin, date, timestamp };
            } else {
                return false;
            }
        } else {
            leaderboard.push({ name, score, isWin, date, timestamp });
        }
        
        // 排序保留 Top 10
        leaderboard.sort((a, b) => b.score - a.score);
        const trimmed = leaderboard.slice(0, this.maxEntries);
        
        return await this.saveLeaderboard(trimmed);
    }
    
    // 获取今日榜
    async getTodayLeaderboard() {
        const today = new Date().toLocaleDateString('zh-CN');
        const data = await this.getLeaderboard();
        return data.filter(entry => entry.date === today);
    }
    
    // 获取本周榜
    async getWeekLeaderboard() {
        const now = Date.now();
        const weekStart = now - 7 * 24 * 60 * 60 * 1000;
        const data = await this.getLeaderboard();
        return data.filter(entry => entry.timestamp >= weekStart);
    }
    
    // 获取总榜
    async getAllLeaderboard() {
        return await this.getLeaderboard();
    }
    
    // 清空排行榜
    async clearLeaderboard() {
        localStorage.removeItem(this.cacheKey);
        
        if (this.gistId && this.gistToken) {
            await this.saveLeaderboard([]);
        }
    }
    
    // 获取排名奖牌
    getMedal(rank) {
        switch (rank) {
            case 1: return '🥇';
            case 2: return '🥈';
            case 3: return '🥉';
            default: return '';
        }
    }
}

class PacmanGame {
    constructor() {
        this.canvas = document.createElement('canvas');
        this.ctx = this.canvas.getContext('2d');
        this.cellSize = 30;
        this.score = 0;
        this.highScore = localStorage.getItem('pacmanHighScore') || 0;
        this.gameRunning = false;
        this.gameOver = false;
        this.paused = false;
        
        this.pacmanMouthOpen = true;
        this.pacmanMouthAnimation = 0;
        this.pacmanOpenImage = null;
        this.pacmanClosedImage = null;
        this.useCustomPacmanImages = false;
        
        this.ghostImages = [];
        this.useCustomGhostImages = false;
        
        this.dotImage = null;
        this.useCustomDotImage = false;
        
        this.powerFruitImage = null;
        this.useCustomPowerFruitImage = false;
        
        this.ghostCount = 3;
        
        this.winImage = null;
        this.useCustomWinImage = false;
        
        this.loseImage = null;
        this.useCustomLoseImage = false;
        
        // 无敌果实系统
        this.powerFruits = [];
        this.isInvincible = false;
        this.invincibleTimer = 0;
        this.invincibleDuration = 5000; // 5秒无敌时间
        
        // 手动获胜积分数
        this.winScoreThreshold = null; // null表示默认（吃完豆子获胜）
        
        this.soundEnabled = true;
        this.volume = 0.5;
        this.audioContext = null;
        
        this.fps = 60;
        this.lastTime = 0;
        this.gameSpeed = 5;
        // 移动速度：格/毫秒（speed=5时，每格200ms）
        this.moveSpeed = 0.005; // 每毫秒移动0.005格
        
        this.mapRows = 15;
        this.mapCols = 19;
        
        // 预生成的地图缓存
        this.nextMapCache = null;
        this.isGeneratingMap = false;
        
        // 排行榜管理器
        this.leaderboardManager = new LeaderboardManager();
        this.pendingLeaderboardEntry = null; // 待保存的排行榜记录
        
        this.initializeMap();
        this.setupEventListeners();
        this.setupImageUpload();
        this.setupAudio();
        this.setupSpeedControl();
        this.setupRefreshMapButton();
        this.setupLeaderboardUI();
        
        // 预生成下一个地图
        this.pregenerateNextMap();
        
        this.render();
    }
    
    updateMoveSpeed() {
        // 根据游戏速度计算移动速度（格/毫秒）
        const speedTable = {
            1: 0.0025,  // 400ms/格
            2: 0.00286, // 350ms/格
            3: 0.00333, // 300ms/格
            4: 0.004,   // 250ms/格
            5: 0.005,   // 200ms/格（默认）
            6: 0.00556, // 180ms/格
            7: 0.00625, // 160ms/格
            8: 0.00714, // 140ms/格
            9: 0.00833, // 120ms/格
            10: 0.01    // 100ms/格
        };
        this.moveSpeed = speedTable[this.gameSpeed] || 0.005;
        // 幽灵速度略慢
        this.ghostMoveSpeed = this.moveSpeed * 0.8;
    }

    initializeMap() {
        // 生成随机地图
        this.map = this.generateRandomMap();
        
        this.rows = this.map.length;
        this.cols = this.map[0].length;
        this.canvas.width = this.cols * this.cellSize;
        this.canvas.height = this.rows * this.cellSize;
        
        // 获取所有可用位置（非墙壁）
        this.availablePositions = this.getAvailablePositions();
        
        // 随机初始化吃豆人位置
        this.initializePacmanRandom();
        
        this.dots = [];
        this.collectDots();
        
        // 随机初始化幽灵位置
        this.initializeGhostsRandom();
        
        // 随机初始化无敌果实位置
        this.initializePowerFruitsRandom();
    }
    
    // 生成随机地图
    generateRandomMap() {
        const rows = this.mapRows;
        const cols = this.mapCols;
        
        // 初始化全为墙壁的地图
        let map = [];
        for (let y = 0; y < rows; y++) {
            map[y] = [];
            for (let x = 0; x < cols; x++) {
                map[y][x] = 1;
            }
        }
        
        // 使用改进的随机Prim算法生成迷宫
        // 1. 随机选择一个起始点
        const startX = Math.floor(Math.random() * (cols - 2)) + 1;
        const startY = Math.floor(Math.random() * (rows - 2)) + 1;
        map[startY][startX] = 0;
        
        // 墙壁列表
        let walls = [];
        this.addWalls(map, startX, startY, walls, rows, cols);
        
        // Prim算法生成迷宫
        while (walls.length > 0) {
            // 随机选择一堵墙
            const wallIndex = Math.floor(Math.random() * walls.length);
            const wall = walls[wallIndex];
            walls.splice(wallIndex, 1);
            
            const { x, y, nx, ny } = wall;
            
            // 如果新格子是墙壁，打通它
            if (map[ny][nx] === 1) {
                map[y][x] = 0;
                map[ny][nx] = 0;
                this.addWalls(map, nx, ny, walls, rows, cols);
            }
        }
        
        // 2. 增加通道密度，确保有足够的空间
        this.addExtraPassages(map, rows, cols);
        
        // 3. 循环消除死胡同和2x2正方形，直到两者都满足
        // 因为消除死胡同可能形成2x2正方形，消除2x2正方形可能形成死胡同
        const maxIterations = 20;  // 最大迭代次数，避免无限循环
        for (let i = 0; i < maxIterations; i++) {
            // 消除死胡同
            const hadDeadEnds = this.hasDeadEnds(map, rows, cols);
            if (hadDeadEnds) {
                this.removeDeadEnds(map, rows, cols);
            }
            
            // 消除2x2正方形
            const had2x2Squares = this.has2x2Squares(map, rows, cols);
            if (had2x2Squares) {
                this.remove2x2Squares(map, rows, cols);
            }
            
            // 如果两者都没有，跳出循环
            if (!hadDeadEnds && !had2x2Squares) {
                break;
            }
        }
        
        // 4. 确保地图连通性
        this.ensureConnectivity(map, rows, cols);
        
        // 5. 最终验证（最后一次消除可能产生的问题）
        this.removeDeadEnds(map, rows, cols);
        this.remove2x2Squares(map, rows, cols);
        
        return map;
    }
    
    // 添加墙壁到列表
    addWalls(map, x, y, walls, rows, cols) {
        const directions = [
            { dx: 0, dy: -1, wallY: y - 1, wallX: x, nextY: y - 2, nextX: x },
            { dx: 0, dy: 1, wallY: y + 1, wallX: x, nextY: y + 2, nextX: x },
            { dx: -1, dy: 0, wallY: y, wallX: x - 1, nextY: y, nextX: x - 2 },
            { dx: 1, dy: 0, wallY: y, wallX: x + 1, nextY: y, nextX: x + 2 }
        ];
        
        for (const dir of directions) {
            // 检查墙壁和新格子是否在边界内
            if (dir.wallX > 0 && dir.wallX < cols - 1 &&
                dir.wallY > 0 && dir.wallY < rows - 1 &&
                dir.nextX > 0 && dir.nextX < cols - 1 &&
                dir.nextY > 0 && dir.nextY < rows - 1) {
                
                // 如果新格子是墙壁，添加到列表
                if (map[dir.nextY][dir.nextX] === 1) {
                    walls.push({
                        x: dir.wallX,
                        y: dir.wallY,
                        nx: dir.nextX,
                        ny: dir.nextY
                    });
                }
            }
        }
    }
    
    // 增加额外通道（禁止2x2正方形）
    addExtraPassages(map, rows, cols) {
        // 随机打通一些墙壁，增加通道密度
        const extraPassages = Math.floor((rows * cols) * 0.15); // 15%的额外通道
        
        for (let i = 0; i < extraPassages; i++) {
            const x = Math.floor(Math.random() * (cols - 2)) + 1;
            const y = Math.floor(Math.random() * (rows - 2)) + 1;
            
            if (map[y][x] === 1) {
                // 检查周围是否有通道
                const neighbors = this.countNeighborPassages(map, x, y, rows, cols);
                // 检查打通后是否会形成2x2正方形
                if (neighbors >= 1 && neighbors <= 3 && 
                    !this.wouldCreate2x2Square(map, x, y, rows, cols)) {
                    map[y][x] = 0;
                }
            }
        }
    }
    
    // 计算周围的通道数量
    countNeighborPassages(map, x, y, rows, cols) {
        let count = 0;
        const directions = [
            { dx: 0, dy: -1 },
            { dx: 0, dy: 1 },
            { dx: -1, dy: 0 },
            { dx: 1, dy: 0 }
        ];
        
        for (const dir of directions) {
            const nx = x + dir.dx;
            const ny = y + dir.dy;
            if (nx >= 0 && nx < cols && ny >= 0 && ny < rows && map[ny][nx] === 0) {
                count++;
            }
        }
        
        return count;
    }
    
    // 检查是否有死胡同
    hasDeadEnds(map, rows, cols) {
        for (let y = 1; y < rows - 1; y++) {
            for (let x = 1; x < cols - 1; x++) {
                if (map[y][x] === 0) {
                    const passages = this.countNeighborPassages(map, x, y, rows, cols);
                    if (passages < 2) {
                        return true;  // 有死胡同
                    }
                }
            }
        }
        return false;  // 没有死胡同
    }
    
    // 检查是否有2x2正方形
    has2x2Squares(map, rows, cols) {
        for (let y = 1; y < rows - 2; y++) {
            for (let x = 1; x < cols - 2; x++) {
                if (map[y][x] === 0 && map[y][x+1] === 0 && 
                    map[y+1][x] === 0 && map[y+1][x+1] === 0) {
                    return true;  // 有2x2正方形
                }
            }
        }
        return false;  // 没有2x2正方形
    }
    
    // 检查打通某个格子后是否会形成2x2正方形
    wouldCreate2x2Square(map, x, y, rows, cols) {
        // 临时打通该格子
        const originalValue = map[y][x];
        map[y][x] = 0;
        
        // 检查以(x,y)为四个角的任意一个2x2区域
        // 需要检查4种情况：当前格子作为左上、右上、左下、右下角
        let has2x2 = false;
        
        // 检查当前格子作为左上角的2x2区域
        if (y + 1 < rows && x + 1 < cols) {
            if (map[y][x] === 0 && map[y][x+1] === 0 && 
                map[y+1][x] === 0 && map[y+1][x+1] === 0) {
                has2x2 = true;
            }
        }
        
        // 检查当前格子作为右上角的2x2区域
        if (!has2x2 && y + 1 < rows && x - 1 >= 0) {
            if (map[y][x-1] === 0 && map[y][x] === 0 && 
                map[y+1][x-1] === 0 && map[y+1][x] === 0) {
                has2x2 = true;
            }
        }
        
        // 检查当前格子作为左下角的2x2区域
        if (!has2x2 && y - 1 >= 0 && x + 1 < cols) {
            if (map[y-1][x] === 0 && map[y-1][x+1] === 0 && 
                map[y][x] === 0 && map[y][x+1] === 0) {
                has2x2 = true;
            }
        }
        
        // 检查当前格子作为右下角的2x2区域
        if (!has2x2 && y - 1 >= 0 && x - 1 >= 0) {
            if (map[y-1][x-1] === 0 && map[y-1][x] === 0 && 
                map[y][x-1] === 0 && map[y][x] === 0) {
                has2x2 = true;
            }
        }
        
        // 恢复原值
        map[y][x] = originalValue;
        
        return has2x2;
    }
    
    // 消除死胡同（优先不形成2x2，必要时强制打通）
    removeDeadEnds(map, rows, cols) {
        // 多次迭代消除死胡同
        let changed = true;
        while (changed) {
            changed = false;
            for (let y = 1; y < rows - 1; y++) {
                for (let x = 1; x < cols - 1; x++) {
                    if (map[y][x] === 0) {
                        const passages = this.countNeighborPassages(map, x, y, rows, cols);
                        if (passages < 2) {
                            // 这是一个死胡同，尝试打通一个墙壁
                            const directions = [
                                { dx: 0, dy: -1 },
                                { dx: 0, dy: 1 },
                                { dx: -1, dy: 0 },
                                { dx: 1, dy: 0 }
                            ];
                            
                            // 随机打乱方向顺序
                            directions.sort(() => Math.random() - 0.5);
                            
                            // 第一优先：不形成2x2正方形
                            for (const dir of directions) {
                                const nx = x + dir.dx;
                                const ny = y + dir.dy;
                                if (nx > 0 && nx < cols - 1 && ny > 0 && ny < rows - 1 && map[ny][nx] === 1) {
                                    if (!this.wouldCreate2x2Square(map, nx, ny, rows, cols)) {
                                        map[ny][nx] = 0;
                                        changed = true;
                                        break;
                                    }
                                }
                            }
                            
                            // 如果还是死胡同（所有墙壁都会形成2x2），强制打通一个
                            if (!changed && passages < 2) {
                                for (const dir of directions) {
                                    const nx = x + dir.dx;
                                    const ny = y + dir.dy;
                                    if (nx > 0 && nx < cols - 1 && ny > 0 && ny < rows - 1 && map[ny][nx] === 1) {
                                        // 强制打通，消除死胡同（2x2问题会在循环中处理）
                                        map[ny][nx] = 0;
                                        changed = true;
                                        break;
                                    }
                                }
                            }
                        }
                    }
                }
            }
        }
    }
    
    // 确保地图连通性
    ensureConnectivity(map, rows, cols) {
        // 使用BFS检查连通性
        const visited = [];
        for (let y = 0; y < rows; y++) {
            visited[y] = [];
            for (let x = 0; x < cols; x++) {
                visited[y][x] = false;
            }
        }
        
        // 找到第一个通道格子
        let startX = -1, startY = -1;
        for (let y = 1; y < rows - 1; y++) {
            for (let x = 1; x < cols - 1; x++) {
                if (map[y][x] === 0) {
                    startX = x;
                    startY = y;
                    break;
                }
            }
            if (startX !== -1) break;
        }
        
        if (startX === -1) {
            // 如果没有通道，创建一个中心通道
            const centerX = Math.floor(cols / 2);
            const centerY = Math.floor(rows / 2);
            map[centerY][centerX] = 0;
            return;
        }
        
        // BFS遍历所有可达格子
        const queue = [{ x: startX, y: startY }];
        visited[startY][startX] = true;
        
        while (queue.length > 0) {
            const current = queue.shift();
            const directions = [
                { dx: 0, dy: -1 },
                { dx: 0, dy: 1 },
                { dx: -1, dy: 0 },
                { dx: 1, dy: 0 }
            ];
            
            for (const dir of directions) {
                const nx = current.x + dir.dx;
                const ny = current.y + dir.dy;
                
                if (nx >= 0 && nx < cols && ny >= 0 && ny < rows &&
                    map[ny][nx] === 0 && !visited[ny][nx]) {
                    visited[ny][nx] = true;
                    queue.push({ x: nx, y: ny });
                }
            }
        }
        
        // 找出所有未连通的通道格子并打通连接
        for (let y = 1; y < rows - 1; y++) {
            for (let x = 1; x < cols - 1; x++) {
                if (map[y][x] === 0 && !visited[y][x]) {
                    // 这个格子未连通，尝试连接到已连通区域
                    const directions = [
                        { dx: 0, dy: -1 },
                        { dx: 0, dy: 1 },
                        { dx: -1, dy: 0 },
                        { dx: 1, dy: 0 }
                    ];
                    
                    for (const dir of directions) {
                        const nx = x + dir.dx;
                        const ny = y + dir.dy;
                        
                        if (nx >= 0 && nx < cols && ny >= 0 && ny < rows && visited[ny][nx]) {
                            // 找到已连通区域，打通连接
                            // 可能需要打通中间的墙壁
                            // 简化处理：直接标记为已访问
                            visited[y][x] = true;
                            break;
                        }
                    }
                    
                    // 如果还是未连通，打通通往最近已连通格子的路径
                    if (!visited[y][x]) {
                        this.connectToMainArea(map, x, y, visited, rows, cols);
                    }
                }
            }
        }
    }
    
    // 将未连通区域连接到主区域
    connectToMainArea(map, startX, startY, visited, rows, cols) {
        // BFS找到最近的已连通格子
        const localVisited = [];
        for (let y = 0; y < rows; y++) {
            localVisited[y] = [];
            for (let x = 0; x < cols; x++) {
                localVisited[y][x] = false;
            }
        }
        
        const queue = [{ x: startX, y: startY, path: [] }];
        localVisited[startY][startX] = true;
        
        while (queue.length > 0) {
            const current = queue.shift();
            
            if (visited[current.y][current.x]) {
                // 找到已连通区域，打通路径
                for (const point of current.path) {
                    map[point.y][point.x] = 0;
                    visited[point.y][point.x] = true;
                }
                return;
            }
            
            const directions = [
                { dx: 0, dy: -1 },
                { dx: 0, dy: 1 },
                { dx: -1, dy: 0 },
                { dx: 1, dy: 0 }
            ];
            
            for (const dir of directions) {
                const nx = current.x + dir.dx;
                const ny = current.y + dir.dy;
                
                if (nx >= 0 && nx < cols && ny >= 0 && ny < rows && !localVisited[ny][nx]) {
                    localVisited[ny][nx] = true;
                    const newPath = [...current.path, { x: nx, y: ny }];
                    queue.push({ x: nx, y: ny, path: newPath });
                }
            }
        }
    }
    
    // 消除2x2正方形（确保不造成死胡同）
    remove2x2Squares(map, rows, cols) {
        // 多次迭代，直到没有2x2正方形
        let has2x2 = true;
        let iterations = 0;
        const maxIterations = 100;  // 最大迭代次数
        
        while (has2x2 && iterations < maxIterations) {
            has2x2 = false;
            iterations++;
            
            for (let y = 1; y < rows - 2; y++) {
                for (let x = 1; x < cols - 2; x++) {
                    // 检查是否存在2x2正方形
                    if (map[y][x] === 0 && map[y][x+1] === 0 && 
                        map[y+1][x] === 0 && map[y+1][x+1] === 0) {
                        
                        // 找到2x2正方形，需要将其中一个格子变为墙壁
                        const candidates = [
                            { x: x, y: y },
                            { x: x+1, y: y },
                            { x: x, y: y+1 },
                            { x: x+1, y: y+1 }
                        ];
                        
                        // 随机打乱顺序
                        candidates.sort(() => Math.random() - 0.5);
                        
                        // 找一个合适的格子变成墙壁
                        for (const candidate of candidates) {
                            // 检查将这个格子变成墙壁后是否会造成死胡同
                            if (this.canConvertToWall(map, candidate.x, candidate.y, rows, cols)) {
                                map[candidate.y][candidate.x] = 1;
                                has2x2 = true;
                                break;
                            }
                        }
                        
                        // 如果找到2x2正方形但无法消除，跳过（等后续迭代处理）
                        if (has2x2) {
                            break;  // 找到一个就处理，然后重新扫描
                        }
                    }
                }
                if (has2x2) {
                    break;
                }
            }
        }
    }
    
    // 检查某个格子是否可以变成墙壁（不造成死胡同）
    canConvertToWall(map, x, y, rows, cols) {
        // 临时变成墙壁
        const originalValue = map[y][x];
        map[y][x] = 1;
        
        // 检查所有邻居（包括不在2x2内的邻居）
        const neighbors = [
            { dx: 0, dy: -1 },
            { dx: 0, dy: 1 },
            { dx: -1, dy: 0 },
            { dx: 1, dy: 0 }
        ];
        
        let allValid = true;
        for (const neighbor of neighbors) {
            const nx = x + neighbor.dx;
            const ny = y + neighbor.dy;
            
            // 检查邻居格子是否变成死胡同
            if (nx > 0 && nx < cols - 1 && ny > 0 && ny < rows - 1 && map[ny][nx] === 0) {
                const passages = this.countNeighborPassages(map, nx, ny, rows, cols);
                if (passages < 2) {
                    allValid = false;
                    break;
                }
            }
        }
        
        // 恢复原值
        map[y][x] = originalValue;
        
        return allValid;
    }
    
    // 设置刷新地图按钮
    setupRefreshMapButton() {
        const refreshMapBtn = document.getElementById('refresh-map-btn');
        if (refreshMapBtn) {
            refreshMapBtn.addEventListener('click', () => {
                this.refreshMap();
            });
        }
    }
    
    // 设置排行榜UI
    setupLeaderboardUI() {
        // 排行榜按钮
        const leaderboardBtn = document.getElementById('leaderboard-btn');
        if (leaderboardBtn) {
            leaderboardBtn.addEventListener('click', () => {
                this.showLeaderboard();
            });
        }
        
        // 关闭排行榜按钮
        const closeBtn = document.getElementById('close-leaderboard');
        if (closeBtn) {
            closeBtn.addEventListener('click', () => {
                this.hideLeaderboard();
            });
        }
        
        // 点击overlay关闭
        const overlay = document.getElementById('leaderboard-overlay');
        if (overlay) {
            overlay.addEventListener('click', (e) => {
                if (e.target === overlay) {
                    this.hideLeaderboard();
                }
            });
        }
        
        // 标签切换
        const tabBtns = document.querySelectorAll('.tab-btn');
        tabBtns.forEach(btn => {
            btn.addEventListener('click', () => {
                tabBtns.forEach(b => b.classList.remove('active'));
                btn.classList.add('active');
                this.updateLeaderboardTable(btn.dataset.tab);
            });
        });
        
        // 清空按钮（需要 Token）
        const clearBtn = document.getElementById('clear-leaderboard');
        if (clearBtn) {
            clearBtn.addEventListener('click', async () => {
                // 检查是否有 Token
                if (!this.leaderboardManager.getGistToken()) {
                    this.showTokenInputForAction('clear', () => {
                        if (confirm('确定要清空排行榜吗？此操作不可恢复！')) {
                            this.leaderboardManager.clearLeaderboard();
                            this.updateLeaderboardTable('all');
                        }
                    });
                } else {
                    if (confirm('确定要清空排行榜吗？此操作不可恢复！')) {
                        await this.leaderboardManager.clearLeaderboard();
                        this.updateLeaderboardTable('all');
                    }
                }
            });
        }
    }
    
    // 显示排行榜
    showLeaderboard() {
        const overlay = document.getElementById('leaderboard-overlay');
        if (overlay) {
            overlay.style.display = 'flex';
            // 默认显示总榜
            this.updateLeaderboardTable('all');
            // 设置总榜标签为active
            const tabBtns = document.querySelectorAll('.tab-btn');
            tabBtns.forEach(btn => {
                btn.classList.toggle('active', btn.dataset.tab === 'all');
            });
        }
    }
    
    // 隐藏排行榜
    hideLeaderboard() {
        const overlay = document.getElementById('leaderboard-overlay');
        if (overlay) {
            overlay.style.display = 'none';
        }
    }
    
    // 安全转义HTML函数
    escapeHtml(str) {
        if (typeof str !== 'string') return str;
        const escapeMap = {
            '&': '&amp;',
            '<': '&lt;',
            '>': '&gt;',
            '"': '&quot;',
            "'": '&#39;'
        };
        return str.replace(/[&<>"']/g, char => escapeMap[char]);
    }
    
    // 验证排行榜数据格式（防止恶意数据）
    validateLeaderboardEntry(entry) {
        // name: 3-12字符，只允许中文、字母、数字、下划线
        if (!entry.name || typeof entry.name !== 'string') return false;
        if (!/^[\w\u4e00-\u9fa5]{3,12}$/.test(entry.name)) return false;
        
        // score: 必须是正整数
        if (typeof entry.score !== 'number' || entry.score < 0 || !Number.isInteger(entry.score)) return false;
        
        // isWin: 必须是布尔值
        if (typeof entry.isWin !== 'boolean') return false;
        
        // date: 必须是日期格式
        if (!entry.date || typeof entry.date !== 'string') return false;
        if (!/^\d{4}\/\d{1,2}\/\d{1,2}$/.test(entry.date)) return false;
        
        // timestamp: 必须是数字
        if (typeof entry.timestamp !== 'number') return false;
        
        return true;
    }
    
    // 更新排行榜表格（异步）- 安全渲染版本
    async updateLeaderboardTable(type) {
        const tbody = document.getElementById('leaderboard-body');
        if (!tbody) return;
        
        // 显示加载提示
        tbody.innerHTML = `<tr><td colspan="5" class="loading-message">正在加载排行榜...</td></tr>`;
        
        let data;
        try {
            switch (type) {
                case 'today':
                    data = await this.leaderboardManager.getTodayLeaderboard();
                    break;
                case 'week':
                    data = await this.leaderboardManager.getWeekLeaderboard();
                    break;
                case 'all':
                    data = await this.leaderboardManager.getAllLeaderboard();
                    break;
                default:
                    data = await this.leaderboardManager.getAllLeaderboard();
            }
        } catch (e) {
            console.error('获取排行榜失败:', e);
            tbody.innerHTML = `<tr><td colspan="5" class="empty-message">加载失败，请检查 Gist 配置</td></tr>`;
            return;
        }
        
        // 过滤掉无效数据（防止恶意注入）
        data = data.filter(entry => this.validateLeaderboardEntry(entry));
        
        if (data.length === 0) {
            const message = this.leaderboardManager.isConfigured() ? 
                '暂无记录，快去玩游戏吧！' : 
                '请先配置 GitHub Gist ID';
            tbody.innerHTML = `<tr><td colspan="5" class="empty-message">${message}</td></tr>`;
            return;
        }
        
        // 使用 createElement 安全渲染（防止XSS）
        tbody.innerHTML = '';
        data.forEach((entry, index) => {
            const rank = index + 1;
            const medal = this.leaderboardManager.getMedal(rank);
            
            const tr = document.createElement('tr');
            
            // 使用 textContent 安全设置文本内容
            const tdRank = document.createElement('td');
            tdRank.textContent = rank;
            tr.appendChild(tdRank);
            
            const tdName = document.createElement('td');
            tdName.textContent = medal ? `${medal} ${entry.name}` : entry.name;
            tr.appendChild(tdName);
            
            const tdScore = document.createElement('td');
            tdScore.textContent = entry.score;
            tr.appendChild(tdScore);
            
            const tdStatus = document.createElement('td');
            tdStatus.textContent = entry.isWin ? '通关' : '失败';
            tdStatus.className = entry.isWin ? 'status-win' : 'status-lose';
            tr.appendChild(tdStatus);
            
            const tdDate = document.createElement('td');
            tdDate.textContent = entry.date;
            tr.appendChild(tdDate);
            
            tbody.appendChild(tr);
        });
    }
    
    // 显示昵称输入框
    showNameInput(score, isWin) {
        const overlay = document.createElement('div');
        overlay.className = 'name-input-overlay';
        overlay.id = 'name-input-overlay-current';
        
        overlay.innerHTML = `
            <div class="name-input-content">
                <h3>📝 上榜保存成绩</h3>
                <p>你的得分：<strong>${score}</strong></p>
                <p style="font-size: 14px; color: #888;">输入昵称保存到排行榜（3-12字符）</p>
                <input type="text" id="player-name" placeholder="输入昵称" maxlength="12" autofocus>
                <div class="name-input-buttons">
                    <button class="name-submit-btn" id="submit-name">保存成绩</button>
                    <button class="name-skip-btn" id="skip-name">取消</button>
                </div>
            </div>
        `;
        
        document.body.appendChild(overlay);
        
        const nameInput = overlay.querySelector('#player-name');
        const submitBtn = overlay.querySelector('#submit-name');
        const skipBtn = overlay.querySelector('#skip-name');
        
        // 自动聚焦输入框
        nameInput.focus();
        
        // 提交按钮 - 检查 Token
        submitBtn.addEventListener('click', async () => {
            const name = nameInput.value.trim();
            if (name.length >= 3 && name.length <= 12) {
                // 检查是否有 Token
                if (!this.leaderboardManager.getGistToken()) {
                    // 没有 Token，弹出 Token 输入框
                    overlay.remove();
                    this.showTokenInputForSave(name, score, isWin);
                } else {
                    // 有 Token，直接保存
                    submitBtn.disabled = true;
                    submitBtn.textContent = '保存中...';
                    
                    try {
                        const success = await this.leaderboardManager.addEntry(name, score, isWin);
                        overlay.remove();
                        if (success) {
                            this.showSuccessMessage(name, score, isWin);
                        } else {
                            alert('保存失败，分数未超过现有记录或API不可用');
                            this.showGameOver(isWin ? '恭喜你赢了！' : '游戏结束！', `最终得分: ${score}`, isWin);
                        }
                    } catch (e) {
                        console.error('保存失败:', e);
                        overlay.remove();
                        alert('保存失败，请稍后重试');
                        this.showGameOver(isWin ? '恭喜你赢了！' : '游戏结束！', `最终得分: ${score}`, isWin);
                    }
                }
            } else {
                nameInput.style.borderColor = '#ff0000';
                nameInput.placeholder = '昵称需要3-12字符';
                nameInput.value = '';
            }
        });
        
        // 取消按钮 - 重新显示游戏结束界面
        skipBtn.addEventListener('click', () => {
            overlay.remove();
            this.showGameOver(isWin ? '恭喜你赢了！' : '游戏结束！', `最终得分: ${score}`, isWin);
        });
        
        // Enter键提交
        nameInput.addEventListener('keydown', (e) => {
            if (e.key === 'Enter') {
                submitBtn.click();
            }
        });
        
        // ESC键取消
        overlay.addEventListener('keydown', (e) => {
            if (e.key === 'Escape') {
                skipBtn.click();
            }
        });
    }
    
    // 显示 Token 输入框（用于保存成绩）
    showTokenInputForSave(name, score, isWin) {
        const overlay = document.createElement('div');
        overlay.className = 'name-input-overlay';
        overlay.id = 'token-input-overlay';
        
        overlay.innerHTML = `
            <div class="name-input-content">
                <h3>🔑 输入 GitHub Token</h3>
                <p style="font-size: 14px; color: #888;">保存成绩需要 GitHub Personal Access Token</p>
                <p style="font-size: 12px; color: #666;">Token 需要 <strong>gist</strong> 权限</p>
                <input type="password" id="gist-token-input" placeholder="ghp_xxxxxx" maxlength="50" autofocus>
                <div class="name-input-buttons">
                    <button class="name-submit-btn" id="submit-token">确认保存</button>
                    <button class="name-skip-btn" id="skip-token">取消</button>
                </div>
                <a href="https://github.com/settings/tokens/new" target="_blank" style="color: #ffeb3b; font-size: 12px; margin-top: 10px; display: block;">没有 Token？点击创建</a>
            </div>
        `;
        
        document.body.appendChild(overlay);
        
        const tokenInput = overlay.querySelector('#gist-token-input');
        const submitBtn = overlay.querySelector('#submit-token');
        const skipBtn = overlay.querySelector('#skip-token');
        
        // 自动聚焦输入框
        tokenInput.focus();
        
        // 提交按钮
        submitBtn.addEventListener('click', async () => {
            const token = tokenInput.value.trim();
            if (token.length > 0) {
                submitBtn.disabled = true;
                submitBtn.textContent = '保存中...';
                
                // 设置 Token
                this.leaderboardManager.setToken(token);
                
                try {
                    const success = await this.leaderboardManager.addEntry(name, score, isWin);
                    overlay.remove();
                    if (success) {
                        this.showSuccessMessage(name, score, isWin);
                    } else {
                        alert('保存失败，分数未超过现有记录或Token无效');
                        this.showGameOver(isWin ? '恭喜你赢了！' : '游戏结束！', `最终得分: ${score}`, isWin);
                    }
                } catch (e) {
                    console.error('保存失败:', e);
                    overlay.remove();
                    alert('保存失败，请检查Token是否正确');
                    this.showGameOver(isWin ? '恭喜你赢了！' : '游戏结束！', `最终得分: ${score}`, isWin);
                }
            } else {
                tokenInput.style.borderColor = '#ff0000';
                tokenInput.placeholder = '请输入 Token';
            }
        });
        
        // 取消按钮
        skipBtn.addEventListener('click', () => {
            overlay.remove();
            this.showGameOver(isWin ? '恭喜你赢了！' : '游戏结束！', `最终得分: ${score}`, isWin);
        });
        
        // Enter键提交
        tokenInput.addEventListener('keydown', (e) => {
            if (e.key === 'Enter') {
                submitBtn.click();
            }
        });
        
        // ESC键取消
        overlay.addEventListener('keydown', (e) => {
            if (e.key === 'Escape') {
                skipBtn.click();
            }
        });
    }
    
    // 显示 Token 输入框（用于其他操作）
    showTokenInputForAction(actionName, callback) {
        const overlay = document.createElement('div');
        overlay.className = 'name-input-overlay';
        overlay.id = 'token-action-overlay';
        
        overlay.innerHTML = `
            <div class="name-input-content">
                <h3>🔑 输入 GitHub Token</h3>
                <p style="font-size: 14px; color: #888;">${actionName} 操作需要 GitHub Token</p>
                <input type="password" id="gist-token-action-input" placeholder="ghp_xxxxxx" maxlength="50" autofocus>
                <div class="name-input-buttons">
                    <button class="name-submit-btn" id="submit-action-token">确认</button>
                    <button class="name-skip-btn" id="skip-action-token">取消</button>
                </div>
            </div>
        `;
        
        document.body.appendChild(overlay);
        
        const tokenInput = overlay.querySelector('#gist-token-action-input');
        const submitBtn = overlay.querySelector('#submit-action-token');
        const skipBtn = overlay.querySelector('#skip-action-token');
        
        tokenInput.focus();
        
        submitBtn.addEventListener('click', async () => {
            const token = tokenInput.value.trim();
            if (token.length > 0) {
                this.leaderboardManager.setToken(token);
                overlay.remove();
                callback();
            } else {
                tokenInput.style.borderColor = '#ff0000';
                tokenInput.placeholder = '请输入 Token';
            }
        });
        
        skipBtn.addEventListener('click', () => {
            overlay.remove();
        });
        
        tokenInput.addEventListener('keydown', (e) => {
            if (e.key === 'Enter') {
                submitBtn.click();
            }
        });
        
        overlay.addEventListener('keydown', (e) => {
            if (e.key === 'Escape') {
                skipBtn.click();
            }
        });
    }
    
    // 显示保存成功提示
    showSuccessMessage(name, score, isWin) {
        const overlay = document.createElement('div');
        overlay.className = 'name-input-overlay';
        overlay.id = 'success-message-overlay';
        
        overlay.innerHTML = `
            <div class="name-input-content">
                <h3>✅ 保存成功</h3>
                <p><strong>${name}</strong> 的成绩 <strong>${score}</strong> 已保存到排行榜！</p>
                <div class="name-input-buttons">
                    <button class="name-submit-btn" id="view-leaderboard-btn">查看排行榜</button>
                    <button class="name-skip-btn" id="close-success-btn">继续游戏</button>
                </div>
            </div>
        `;
        
        document.body.appendChild(overlay);
        
        const viewLeaderboardBtn = overlay.querySelector('#view-leaderboard-btn');
        const closeSuccessBtn = overlay.querySelector('#close-success-btn');
        
        // 查看排行榜按钮
        viewLeaderboardBtn.addEventListener('click', () => {
            overlay.remove();
            document.getElementById('leaderboard-btn').click();
        });
        
        // 继续游戏按钮 - 重新显示游戏结束界面
        closeSuccessBtn.addEventListener('click', () => {
            overlay.remove();
            this.showGameOver(isWin ? '恭喜你赢了！' : '游戏结束！', `最终得分: ${score}`, isWin);
        });
        
        // ESC键关闭
        overlay.addEventListener('keydown', (e) => {
            if (e.key === 'Escape') {
                closeSuccessBtn.click();
            }
        });
    }
    
    // 预生成下一个地图（异步）
    pregenerateNextMap() {
        if (this.isGeneratingMap) return;
        
        this.isGeneratingMap = true;
        
        // 使用 setTimeout 异步生成，避免阻塞主线程
        setTimeout(() => {
            try {
                this.nextMapCache = this.generateRandomMap();
                console.log('下一个地图已预生成完成');
            } catch (e) {
                console.error('预生成地图失败:', e);
                this.nextMapCache = null;
            }
            this.isGeneratingMap = false;
        }, 100); // 延迟100ms开始生成
    }
    
    // 刷新地图（使用预生成的地图）
    refreshMap() {
        // 停止当前游戏
        this.gameRunning = false;
        this.gameOver = false;
        this.paused = false;
        this.score = 0;
        this.isInvincible = false;
        this.invincibleTimer = 0;
        this.lastTime = 0;
        
        // 更新分数显示
        this.updateScore();
        
        // 使用预生成的地图或等待生成完成
        if (this.nextMapCache) {
            // 直接使用预生成的地图
            this.map = this.nextMapCache;
            this.nextMapCache = null;
            console.log('使用预生成的地图');
        } else {
            // 如果预生成未完成，等待生成
            if (this.isGeneratingMap) {
                console.log('等待预生成地图完成...');
                // 等待生成完成后再使用
                const waitForMap = () => {
                    if (this.nextMapCache) {
                        this.map = this.nextMapCache;
                        this.nextMapCache = null;
                        this.applyNewMap();
                    } else if (this.isGeneratingMap) {
                        setTimeout(waitForMap, 50);
                    } else {
                        // 生成失败，重新生成
                        this.map = this.generateRandomMap();
                        this.applyNewMap();
                    }
                };
                waitForMap();
                return;
            } else {
                // 没有预生成，直接生成
                this.map = this.generateRandomMap();
                console.log('直接生成新地图');
            }
        }
        
        this.applyNewMap();
        
        // 立即预生成下一个地图
        this.pregenerateNextMap();
    }
    
    // 应用新地图
    applyNewMap() {
        this.rows = this.map.length;
        this.cols = this.map[0].length;
        this.canvas.width = this.cols * this.cellSize;
        this.canvas.height = this.rows * this.cellSize;
        
        // 获取所有可用位置（非墙壁）
        this.availablePositions = this.getAvailablePositions();
        
        // 随机初始化吃豆人位置
        this.initializePacmanRandom();
        
        this.dots = [];
        this.collectDots();
        
        // 随机初始化幽灵位置
        this.initializeGhostsRandom();
        
        // 随机初始化无敌果实位置
        this.initializePowerFruitsRandom();
        
        // 更新移动速度
        this.updateMoveSpeed();
        
        // 渲染新地图
        this.render();
    }
    
    getAvailablePositions() {
        const positions = [];
        for (let y = 0; y < this.rows; y++) {
            for (let x = 0; x < this.cols; x++) {
                if (this.map[y][x] === 0) {
                    positions.push({ x, y });
                }
            }
        }
        return positions;
    }
    
    getRandomPosition(excludePositions = []) {
        // 过滤出可用位置（排除已占用的位置）
        const available = this.availablePositions.filter(pos => {
            return !excludePositions.some(ex => ex.x === pos.x && ex.y === pos.y);
        });
        
        if (available.length === 0) return null;
        
        const randomIndex = Math.floor(Math.random() * available.length);
        return available[randomIndex];
    }
    
    initializePacmanRandom() {
        const pos = this.getRandomPosition();
        
        // 选择一个可行的初始方向
        const validDirs = this.getValidDirections(pos.x, pos.y);
        let initialDirection;
        
        if (validDirs.length > 0) {
            // 从可行方向中随机选择
            initialDirection = validDirs[Math.floor(Math.random() * validDirs.length)];
        } else {
            // 如果没有可行方向（极端情况），随机选择一个
            initialDirection = ['up', 'down', 'left', 'right'][Math.floor(Math.random() * 4)];
        }
        
        // 浮点位置系统
        this.pacman = {
            x: pos.x,           // 浮点数，实时位置
            y: pos.y,
            gridX: pos.x,       // 整数，当前格子
            gridY: pos.y,
            targetGridX: pos.x, // 整数，目标格子
            targetGridY: pos.y,
            nextGridX: pos.x,   // 整数，下一个目标格子
            nextGridY: pos.y,
            direction: initialDirection,
            nextDirection: initialDirection,
            lastDirection: initialDirection, // 上一个方向，用于禁止回头
            isMoving: false,
            speed: this.moveSpeed,
            isEaten: false
        };
        
        // 记录吃豆人位置为已占用
        this.occupiedPositions = [{ x: pos.x, y: pos.y }];
        
        this.updateMoveSpeed();
    }

    initializeGhostsRandom() {
        const ghostColors = ['#ff0000', '#00ffff', '#ffb8ff', '#ffb852', '#00ff00', '#ff00ff', '#ffffff', '#ffff00', '#0080ff', '#ff8000'];
        
        this.ghosts = [];
        for (let i = 0; i < this.ghostCount; i++) {
            const pos = this.getRandomPosition(this.occupiedPositions);
            if (pos) {
                // 选择可行的初始方向
                const validDirs = this.getValidDirections(pos.x, pos.y);
                let initialDirection;
                
                if (validDirs.length > 0) {
                    initialDirection = validDirs[Math.floor(Math.random() * validDirs.length)];
                } else {
                    initialDirection = ['up', 'down', 'left', 'right'][Math.floor(Math.random() * 4)];
                }
                
                // 浮点位置系统
                this.ghosts.push({
                    x: pos.x,           // 浮点数，实时位置
                    y: pos.y,
                    gridX: pos.x,       // 整数，当前格子
                    gridY: pos.y,
                    targetGridX: pos.x, // 整数，目标格子
                    targetGridY: pos.y,
                    color: ghostColors[i % ghostColors.length],
                    direction: initialDirection,
                    isMoving: false,
                    speed: this.ghostMoveSpeed,
                    isEaten: false
                });
                
                // 记录幽灵位置为已占用
                this.occupiedPositions.push({ x: pos.x, y: pos.y });
            }
        }
    }

    collectDots() {
        this.dots = [];
        for (let y = 0; y < this.rows; y++) {
            for (let x = 0; x < this.cols; x++) {
                if (this.map[y][x] === 0) {
                    this.dots.push({ x, y });
                }
            }
        }
    }
    
    initializePowerFruitsRandom() {
        this.powerFruits = [];
        this.isInvincible = false;
        this.invincibleTimer = 0;
        
        // 放置3个无敌果实，避开已占用的位置
        for (let i = 0; i < 3; i++) {
            const pos = this.getRandomPosition(this.occupiedPositions);
            if (pos) {
                // 移除该位置的豆子
                this.dots = this.dots.filter(d => !(d.x === pos.x && d.y === pos.y));
                this.powerFruits.push({ x: pos.x, y: pos.y, collected: false });
                
                // 记录果实位置为已占用
                this.occupiedPositions.push({ x: pos.x, y: pos.y });
            }
        }
    }

    setupEventListeners() {
        document.addEventListener('keydown', (e) => {
            switch(e.key) {
                case ' ':
                    e.preventDefault();
                    if (this.gameOver) {
                        this.restartGame();
                    } else if (this.gameRunning) {
                        this.togglePause();
                    } else {
                        this.startGame();
                    }
                    break;
                case 'ArrowUp':
                    e.preventDefault();
                    if (!this.gameRunning && !this.gameOver) {
                        this.startGame();
                    }
                    this.pacman.nextDirection = 'up';
                    break;
                case 'ArrowDown':
                    e.preventDefault();
                    if (!this.gameRunning && !this.gameOver) {
                        this.startGame();
                    }
                    this.pacman.nextDirection = 'down';
                    break;
                case 'ArrowLeft':
                    e.preventDefault();
                    if (!this.gameRunning && !this.gameOver) {
                        this.startGame();
                    }
                    this.pacman.nextDirection = 'left';
                    break;
                case 'ArrowRight':
                    e.preventDefault();
                    if (!this.gameRunning && !this.gameOver) {
                        this.startGame();
                    }
                    this.pacman.nextDirection = 'right';
                    break;
            }
        });

        document.getElementById('start-btn').addEventListener('click', () => this.startGame());
        document.getElementById('restart-btn').addEventListener('click', () => this.restartGame());
        
        // 移动端触屏控制按钮
        this.setupMobileControls();
    }
    
    setupMobileControls() {
        // 摇杆控制
        const joystickBase = document.getElementById('joystick-base');
        const joystickStick = document.getElementById('joystick-stick');
        const btnPause = document.getElementById('btn-pause');
        const mobileStart = document.getElementById('mobile-start');
        
        if (joystickBase && joystickStick) {
            let isDragging = false;
            
            // 动态获取尺寸（避免初始化时元素未渲染）
            const getSizes = () => {
                const baseRect = joystickBase.getBoundingClientRect();
                return {
                    baseRadius: baseRect.width / 2,
                    stickRadius: joystickStick.offsetWidth / 2,
                    maxDistance: baseRect.width / 2 - joystickStick.offsetWidth / 2 - 5
                };
            };
            
            const handleJoystickMove = (clientX, clientY) => {
                const sizes = getSizes();
                const rect = joystickBase.getBoundingClientRect();
                const centerX = rect.left + rect.width / 2;
                const centerY = rect.top + rect.height / 2;
                
                let dx = clientX - centerX;
                let dy = clientY - centerY;
                
                const distance = Math.sqrt(dx * dx + dy * dy);
                
                if (distance > sizes.maxDistance && sizes.maxDistance > 0) {
                    dx = dx / distance * sizes.maxDistance;
                    dy = dy / distance * sizes.maxDistance;
                }
                
                joystickStick.style.transform = `translate(calc(-50% + ${dx}px), calc(-50% + ${dy}px))`;
                
                // 根据摇杆方向设置吃豆人方向
                if (distance > 20) { // 死区阈值
                    if (!this.gameRunning && !this.gameOver) {
                        this.startGame();
                    }
                    
                    // 判断主要方向
                    if (Math.abs(dx) > Math.abs(dy)) {
                        this.pacman.nextDirection = dx > 0 ? 'right' : 'left';
                    } else {
                        this.pacman.nextDirection = dy > 0 ? 'down' : 'up';
                    }
                }
            };
            
            const resetJoystick = () => {
                joystickStick.style.transform = 'translate(-50%, -50%)';
            };
            
            // 触屏事件
            joystickBase.addEventListener('touchstart', (e) => {
                e.preventDefault();
                isDragging = true;
                const touch = e.touches[0];
                handleJoystickMove(touch.clientX, touch.clientY);
            });
            
            joystickBase.addEventListener('touchmove', (e) => {
                e.preventDefault();
                if (isDragging) {
                    const touch = e.touches[0];
                    handleJoystickMove(touch.clientX, touch.clientY);
                }
            });
            
            joystickBase.addEventListener('touchend', (e) => {
                e.preventDefault();
                isDragging = false;
                resetJoystick();
            });
            
            // 鼠标事件（用于桌面测试）
            joystickBase.addEventListener('mousedown', (e) => {
                isDragging = true;
                handleJoystickMove(e.clientX, e.clientY);
            });
            
            document.addEventListener('mousemove', (e) => {
                if (isDragging) {
                    handleJoystickMove(e.clientX, e.clientY);
                }
            });
            
            document.addEventListener('mouseup', () => {
                if (isDragging) {
                    isDragging = false;
                    resetJoystick();
                }
            });
        }

        // 画布滑动手势（移动端更自然的输入方式，保留摇杆作为备选）
        const swipeTarget = this.canvas;
        if (swipeTarget) {
            const SWIPE_THRESHOLD = 24;
            let swipeActive = false;
            let swipeX = 0;
            let swipeY = 0;

            const applySwipeDirection = (dx, dy) => {
                if (!this.gameRunning && !this.gameOver) {
                    this.startGame();
                }
                if (Math.abs(dx) > Math.abs(dy)) {
                    this.pacman.nextDirection = dx > 0 ? 'right' : 'left';
                } else {
                    this.pacman.nextDirection = dy > 0 ? 'down' : 'up';
                }
            };

            swipeTarget.addEventListener('touchstart', (e) => {
                if (!e.touches || e.touches.length === 0) return;
                swipeActive = true;
                swipeX = e.touches[0].clientX;
                swipeY = e.touches[0].clientY;
                e.preventDefault();
            }, { passive: false });

            swipeTarget.addEventListener('touchmove', (e) => {
                if (!swipeActive || !e.touches || e.touches.length === 0) return;
                const dx = e.touches[0].clientX - swipeX;
                const dy = e.touches[0].clientY - swipeY;
                if (Math.abs(dx) >= SWIPE_THRESHOLD || Math.abs(dy) >= SWIPE_THRESHOLD) {
                    applySwipeDirection(dx, dy);
                    swipeX = e.touches[0].clientX;
                    swipeY = e.touches[0].clientY;
                }
                e.preventDefault();
            }, { passive: false });

            swipeTarget.addEventListener('touchend', () => {
                swipeActive = false;
            });

            swipeTarget.addEventListener('touchcancel', () => {
                swipeActive = false;
            });
        }

        // 视口尺寸变化时重绘一次（canvas 走 CSS 缩放，无需改 backing buffer）
        const requestRedraw = () => {
            if (typeof this.render === 'function') {
                requestAnimationFrame(() => this.render());
            }
        };
        window.addEventListener('resize', requestRedraw);
        window.addEventListener('orientationchange', requestRedraw);

        // 暂停按钮
        if (btnPause) {
            btnPause.addEventListener('touchstart', (e) => {
                e.preventDefault();
                if (this.gameOver) {
                    this.restartGame();
                } else if (this.gameRunning) {
                    this.togglePause();
                } else {
                    this.startGame();
                }
            });
            btnPause.addEventListener('click', () => {
                if (this.gameOver) {
                    this.restartGame();
                } else if (this.gameRunning) {
                    this.togglePause();
                } else {
                    this.startGame();
                }
            });
        }
    }

    setupImageUpload() {
        const openInput = document.getElementById('pacman-open-upload');
        const closedInput = document.getElementById('pacman-closed-upload');
        const ghostInput = document.getElementById('ghost-upload');
        const dotInput = document.getElementById('dot-upload');
        const ghostCountInput = document.getElementById('ghost-count');
        
        if (openInput) {
            openInput.addEventListener('change', (e) => {
                const file = e.target.files[0];
                if (file) {
                    const reader = new FileReader();
                    reader.onload = (event) => {
                        const img = new Image();
                        img.onload = () => {
                            this.pacmanOpenImage = img;
                            this.useCustomPacmanImages = true;
                            this.render();
                            this.updateFileLabel(e.target, '✓ ' + file.name);
                        };
                        img.src = event.target.result;
                    };
                    reader.readAsDataURL(file);
                }
            });
        }
        
        if (closedInput) {
            closedInput.addEventListener('change', (e) => {
                const file = e.target.files[0];
                if (file) {
                    const reader = new FileReader();
                    reader.onload = (event) => {
                        const img = new Image();
                        img.onload = () => {
                            this.pacmanClosedImage = img;
                            this.useCustomPacmanImages = true;
                            this.render();
                            this.updateFileLabel(e.target, '✓ ' + file.name);
                        };
                        img.src = event.target.result;
                    };
                    reader.readAsDataURL(file);
                }
            });
        }
        
        if (ghostInput) {
            ghostInput.addEventListener('change', (e) => {
                const files = Array.from(e.target.files);
                if (files.length > 0) {
                    this.ghostImages = [];
                    let loadedCount = 0;
                    
                    files.forEach((file, index) => {
                        const reader = new FileReader();
                        reader.onload = (event) => {
                            const img = new Image();
                            img.onload = () => {
                                this.ghostImages[index] = img;
                                loadedCount++;
                                
                                if (loadedCount === files.length) {
                                    this.useCustomGhostImages = true;
                                    this.render();
                                    this.updateFileLabel(e.target, '✓ 已上传 ' + files.length + ' 张图片');
                                }
                            };
                            img.src = event.target.result;
                        };
                        reader.readAsDataURL(file);
                    });
                }
            });
        }
        
        if (dotInput) {
            dotInput.addEventListener('change', (e) => {
                const file = e.target.files[0];
                if (file) {
                    const reader = new FileReader();
                    reader.onload = (event) => {
                        const img = new Image();
                        img.onload = () => {
                            this.dotImage = img;
                            this.useCustomDotImage = true;
                            this.render();
                        };
                        img.src = event.target.result;
                    };
                    reader.readAsDataURL(file);
                }
            });
        }
        
        if (ghostCountInput) {
            ghostCountInput.addEventListener('change', (e) => {
                const count = parseInt(e.target.value);
                if (count >= 1 && count <= 10) {
                    this.ghostCount = count;
                    this.initializeMap();
                    this.render();
                }
            });
        }
        
        const winImageInput = document.getElementById('win-image-upload');
        if (winImageInput) {
            winImageInput.addEventListener('change', (e) => {
                const file = e.target.files[0];
                if (file) {
                    const reader = new FileReader();
                    reader.onload = (event) => {
                        const img = new Image();
                        img.onload = () => {
                            this.winImage = img;
                            this.useCustomWinImage = true;
                        };
                        img.src = event.target.result;
                    };
                    reader.readAsDataURL(file);
                }
            });
        }
        
        // 失败图片上传
        const loseImageInput = document.getElementById('lose-image-upload');
        if (loseImageInput) {
            loseImageInput.addEventListener('change', (e) => {
                const file = e.target.files[0];
                if (file) {
                    const reader = new FileReader();
                    reader.onload = (event) => {
                        const img = new Image();
                        img.onload = () => {
                            this.loseImage = img;
                            this.useCustomLoseImage = true;
                        };
                        img.src = event.target.result;
                    };
                    reader.readAsDataURL(file);
                }
            });
        }
        
        // 无敌果实图片上传
        const powerFruitInput = document.getElementById('power-fruit-upload');
        if (powerFruitInput) {
            powerFruitInput.addEventListener('change', (e) => {
                const file = e.target.files[0];
                if (file) {
                    const reader = new FileReader();
                    reader.onload = (event) => {
                        const img = new Image();
                        img.onload = () => {
                            this.powerFruitImage = img;
                            this.useCustomPowerFruitImage = true;
                            this.render();
                        };
                        img.src = event.target.result;
                    };
                    reader.readAsDataURL(file);
                }
            });
        }
        
        // 获胜积分数设置
        const winScoreInput = document.getElementById('win-score-threshold');
        if (winScoreInput) {
            winScoreInput.addEventListener('change', (e) => {
                const value = parseInt(e.target.value);
                if (value > 0) {
                    this.winScoreThreshold = value;
                } else {
                    this.winScoreThreshold = null;
                }
            });
        }
    }
    
    setupAudio() {
        const soundCheckbox = document.getElementById('enable-sound');
        const volumeSlider = document.getElementById('volume-control');
        
        if (soundCheckbox) {
            soundCheckbox.addEventListener('change', (e) => {
                this.soundEnabled = e.target.checked;
                if (this.soundEnabled && !this.audioContext) {
                    this.initAudioContext();
                }
            });
        }
        
        if (volumeSlider) {
            volumeSlider.addEventListener('input', (e) => {
                this.volume = e.target.value / 100;
                const volumeDisplay = e.target.nextElementSibling;
                if (volumeDisplay && volumeDisplay.classList.contains('value-display')) {
                    volumeDisplay.textContent = e.target.value + '%';
                }
            });
        }
        
        this.initAudioContext();
    }
    
    setupSpeedControl() {
        const speedSlider = document.getElementById('speed-control');
        const speedValue = document.getElementById('speed-value');
        
        if (speedSlider) {
            speedSlider.addEventListener('input', (e) => {
                this.gameSpeed = parseInt(e.target.value);
                if (speedValue) {
                    speedValue.textContent = this.gameSpeed;
                }
                this.updateMoveSpeed();
            });
        }
        
        this.updateMoveSpeed();
    }
    
    updateFileLabel(input, text) {
        const label = input.previousElementSibling;
        if (label && label.classList.contains('file-label')) {
            label.textContent = text;
            label.style.background = 'linear-gradient(135deg, #ffeb3b 0%, #ffc107 100%)';
            label.style.color = '#000';
        }
    }
    
    // 旧的updateMoveInterval已删除，由updateMoveSpeed替代
    
    initAudioContext() {
        try {
            this.audioContext = new (window.AudioContext || window.webkitAudioContext)();
        } catch (e) {
            console.log('Audio context not supported');
        }
    }
    
    playSound(type) {
        if (!this.soundEnabled || !this.audioContext) return;
        
        const oscillator = this.audioContext.createOscillator();
        const gainNode = this.audioContext.createGain();
        
        oscillator.connect(gainNode);
        gainNode.connect(this.audioContext.destination);
        
        gainNode.gain.value = this.volume * 0.3;
        
        switch(type) {
            case 'eat':
                oscillator.frequency.setValueAtTime(400, this.audioContext.currentTime);
                oscillator.frequency.exponentialRampToValueAtTime(800, this.audioContext.currentTime + 0.1);
                oscillator.type = 'sine';
                gainNode.gain.exponentialRampToValueAtTime(0.01, this.audioContext.currentTime + 0.1);
                oscillator.start();
                oscillator.stop(this.audioContext.currentTime + 0.1);
                break;
            case 'bounce':
                oscillator.frequency.setValueAtTime(200, this.audioContext.currentTime);
                oscillator.frequency.exponentialRampToValueAtTime(100, this.audioContext.currentTime + 0.15);
                oscillator.type = 'square';
                gainNode.gain.exponentialRampToValueAtTime(0.01, this.audioContext.currentTime + 0.15);
                oscillator.start();
                oscillator.stop(this.audioContext.currentTime + 0.15);
                break;
            case 'win':
                this.playWinMelody();
                return;
            case 'lose':
                oscillator.frequency.setValueAtTime(300, this.audioContext.currentTime);
                oscillator.frequency.exponentialRampToValueAtTime(50, this.audioContext.currentTime + 0.5);
                oscillator.type = 'sawtooth';
                gainNode.gain.exponentialRampToValueAtTime(0.01, this.audioContext.currentTime + 0.5);
                oscillator.start();
                oscillator.stop(this.audioContext.currentTime + 0.5);
                break;
            case 'powerup':
                // 无敌果实音效
                oscillator.frequency.setValueAtTime(600, this.audioContext.currentTime);
                oscillator.frequency.exponentialRampToValueAtTime(1200, this.audioContext.currentTime + 0.2);
                oscillator.type = 'sine';
                gainNode.gain.exponentialRampToValueAtTime(0.01, this.audioContext.currentTime + 0.3);
                oscillator.start();
                oscillator.stop(this.audioContext.currentTime + 0.3);
                break;
            case 'eatghost':
                // 吃幽灵音效
                oscillator.frequency.setValueAtTime(800, this.audioContext.currentTime);
                oscillator.frequency.exponentialRampToValueAtTime(1600, this.audioContext.currentTime + 0.15);
                oscillator.type = 'square';
                gainNode.gain.exponentialRampToValueAtTime(0.01, this.audioContext.currentTime + 0.15);
                oscillator.start();
                oscillator.stop(this.audioContext.currentTime + 0.15);
                break;
        }
    }
    
    playWinMelody() {
        if (!this.soundEnabled || !this.audioContext) return;
        
        const notes = [523.25, 659.25, 783.99, 1046.50, 783.99, 1046.50];
        const duration = 0.15;
        
        notes.forEach((freq, index) => {
            const oscillator = this.audioContext.createOscillator();
            const gainNode = this.audioContext.createGain();
            
            oscillator.connect(gainNode);
            gainNode.connect(this.audioContext.destination);
            
            oscillator.frequency.value = freq;
            oscillator.type = 'square';
            
            const startTime = this.audioContext.currentTime + index * duration;
            gainNode.gain.setValueAtTime(this.volume * 0.2, startTime);
            gainNode.gain.exponentialRampToValueAtTime(0.01, startTime + duration);
            
            oscillator.start(startTime);
            oscillator.stop(startTime + duration);
        });
    }

    startGame() {
        if (this.gameRunning) return;
        
        // 如果游戏已结束或分数不为0，需要重置游戏状态
        if (this.gameOver || this.score !== 0) {
            this.resetGameState();
        }
        
        this.gameRunning = true;
        this.paused = false;
        this.lastTime = 0;
        requestAnimationFrame((ts) => this.gameLoop(ts));
    }

    resetGameState() {
        this.gameRunning = false;
        this.gameOver = false;
        this.paused = false;
        this.score = 0;
        this.isInvincible = false;
        this.invincibleTimer = 0;
        this.lastTime = 0;
        this.updateScore();
        this.initializeMap();
        this.updateMoveSpeed();
        this.render();
    }

    restartGame() {
        this.resetGameState();
        // 重开后自动开始游戏
        this.gameRunning = true;
        this.paused = false;
        this.lastTime = 0;
        requestAnimationFrame((ts) => this.gameLoop(ts));
    }
    
    togglePause() {
        this.paused = !this.paused;
        if (!this.paused) {
            this.lastTime = 0;
            requestAnimationFrame((ts) => this.gameLoop(ts));
        } else {
            this.drawPauseScreen();
        }
    }

    drawPauseScreen() {
        this.ctx.fillStyle = 'rgba(0, 0, 0, 0.7)';
        this.ctx.fillRect(0, 0, this.canvas.width, this.canvas.height);
        
        this.ctx.fillStyle = '#ffeb3b';
        this.ctx.font = 'bold 30px Arial';
        this.ctx.textAlign = 'center';
        this.ctx.fillText('游戏暂停', this.canvas.width / 2, this.canvas.height / 2);
        
        this.ctx.fillStyle = '#fff';
        this.ctx.font = '16px Arial';
        this.ctx.fillText('按空格键继续', this.canvas.width / 2, this.canvas.height / 2 + 40);
    }

    gameLoop(timestamp) {
        if (!this.gameRunning || this.gameOver || this.paused) return;
        
        if (!this.lastTime) this.lastTime = timestamp;
        const deltaTime = timestamp - this.lastTime;
        this.lastTime = timestamp;
        
        // 处理无敌状态计时
        if (this.isInvincible) {
            this.invincibleTimer -= deltaTime;
            if (this.invincibleTimer <= 0) {
                this.isInvincible = false;
                this.invincibleTimer = 0;
            }
        }
        
        // 每帧更新移动（浮点位置）
        this.updateMovement(deltaTime);
        
        // 每帧检查碰撞
        this.checkCollisionsContinuous();
        
        this.render();
        
        // 检查获胜条件
        if (this.winScoreThreshold !== null && this.score >= this.winScoreThreshold) {
            this.winGame();
            return;
        }
        
        if (this.dots.length === 0) {
            this.winGame();
            return;
        }
        
        requestAnimationFrame((ts) => this.gameLoop(ts));
    }
    
    // 核心移动更新函数（浮点位置系统）
    updateMovement(deltaTime) {
        // 更新吃豆人移动
        this.updatePacmanMovement(deltaTime);
        
        // 更新幽灵移动
        this.updateGhostsMovement(deltaTime);
        
        // 检测碰撞
        this.checkCollisionDuringMovement();
    }
    
    // 吃豆人移动更新
    updatePacmanMovement(deltaTime) {
        // 如果有新方向，尝试转向
        if (this.pacman.nextDirection !== this.pacman.direction) {
            const nextDir = this.getDirectionOffset(this.pacman.nextDirection);
            const nextGridX = this.pacman.gridX + nextDir.dx;
            const nextGridY = this.pacman.gridY + nextDir.dy;
            
            // 只有在格子中心时才能转向
            const atGridCenter = Math.abs(this.pacman.x - this.pacman.gridX) < 0.1 &&
                                 Math.abs(this.pacman.y - this.pacman.gridY) < 0.1;
            
            if (atGridCenter && this.isValidMove(nextGridX, nextGridY)) {
                // 禁止回头（无论是否正在移动）
                if (this.isOppositeDirection(this.pacman.direction, this.pacman.nextDirection)) {
                    // 不允许回头，忽略这个方向输入
                } else {
                    // 允许转向
                    this.pacman.lastDirection = this.pacman.direction;
                    this.pacman.direction = this.pacman.nextDirection;
                    this.pacman.targetGridX = nextGridX;
                    this.pacman.targetGridY = nextGridY;
                    this.pacman.isMoving = true;
                }
            }
        }
        
        // 继续当前方向移动
        if (!this.pacman.isMoving && this.pacman.direction) {
            const dir = this.getDirectionOffset(this.pacman.direction);
            const nextGridX = this.pacman.gridX + dir.dx;
            const nextGridY = this.pacman.gridY + dir.dy;
            
            if (this.isValidMove(nextGridX, nextGridY)) {
                this.pacman.targetGridX = nextGridX;
                this.pacman.targetGridY = nextGridY;
                this.pacman.isMoving = true;
            } else {
                // 前方碰墙，尝试随机转向
                this.tryRandomTurn(this.pacman);
            }
        }
        
        // 更新位置
        if (this.pacman.isMoving) {
            const dir = this.getDirectionOffset(this.pacman.direction);
            this.pacman.x += dir.dx * this.pacman.speed * deltaTime;
            this.pacman.y += dir.dy * this.pacman.speed * deltaTime;
            
            // 检查是否到达目标格子
            if (this.hasReachedTarget(this.pacman)) {
                this.pacman.x = this.pacman.targetGridX;
                this.pacman.y = this.pacman.targetGridY;
                this.pacman.gridX = this.pacman.targetGridX;
                this.pacman.gridY = this.pacman.targetGridY;
                this.pacman.isMoving = false;
                
                // 检查下一个格子是否可通行
                const nextDir = this.getDirectionOffset(this.pacman.direction);
                const nextGridX = this.pacman.gridX + nextDir.dx;
                const nextGridY = this.pacman.gridY + nextDir.dy;
                
                if (!this.isValidMove(nextGridX, nextGridY)) {
                    // 尝试随机转向
                    this.tryRandomTurn(this.pacman);
                }
            }
        }
    }
    
    // 幽灵移动更新
    updateGhostsMovement(deltaTime) {
        this.ghosts.forEach(ghost => {
            // 如果幽灵不在移动，选择新方向
            if (!ghost.isMoving) {
                const validDirs = this.getValidDirections(ghost.gridX, ghost.gridY);
                if (validDirs.length > 0) {
                    const randomDir = validDirs[Math.floor(Math.random() * validDirs.length)];
                    ghost.direction = randomDir;
                    const dir = this.getDirectionOffset(randomDir);
                    ghost.targetGridX = ghost.gridX + dir.dx;
                    ghost.targetGridY = ghost.gridY + dir.dy;
                    ghost.isMoving = true;
                }
            }
            
            // 更新位置
            if (ghost.isMoving) {
                const dir = this.getDirectionOffset(ghost.direction);
                ghost.x += dir.dx * ghost.speed * deltaTime;
                ghost.y += dir.dy * ghost.speed * deltaTime;
                
                // 检查是否到达目标格子
                if (this.hasReachedTarget(ghost)) {
                    ghost.x = ghost.targetGridX;
                    ghost.y = ghost.targetGridY;
                    ghost.gridX = ghost.targetGridX;
                    ghost.gridY = ghost.targetGridY;
                    ghost.isMoving = false;
                }
            }
        });
    }
    
    // 检查是否到达目标格子
    hasReachedTarget(entity) {
        const dx = entity.targetGridX - entity.x;
        const dy = entity.targetGridY - entity.y;
        const dir = this.getDirectionOffset(entity.direction);
        
        // 根据方向检查是否已经越过或到达目标
        if (dir.dx > 0) return entity.x >= entity.targetGridX;
        if (dir.dx < 0) return entity.x <= entity.targetGridX;
        if (dir.dy > 0) return entity.y >= entity.targetGridY;
        if (dir.dy < 0) return entity.y <= entity.targetGridY;
        return true;
    }
    
    // 获取有效方向列表
    getValidDirections(gridX, gridY) {
        const directions = ['up', 'down', 'left', 'right'];
        return directions.filter(dir => {
            const offset = this.getDirectionOffset(dir);
            return this.isValidMove(gridX + offset.dx, gridY + offset.dy);
        });
    }
    
    // 尝试随机转向（吃豆人碰墙只能左拐或右拐，不能回头）
    tryRandomTurn(entity) {
        const leftTurns = { 'up': 'left', 'down': 'right', 'left': 'down', 'right': 'up' };
        const rightTurns = { 'up': 'right', 'down': 'left', 'left': 'up', 'right': 'down' };
        
        const validTurns = [];
        const currentDir = entity.direction;
        
        const leftDir = leftTurns[currentDir];
        const rightDir = rightTurns[currentDir];
        
        const leftOffset = this.getDirectionOffset(leftDir);
        const rightOffset = this.getDirectionOffset(rightDir);
        
        // 只检查左转和右转是否可行（左转和右转本身就不是回头方向）
        if (this.isValidMove(entity.gridX + leftOffset.dx, entity.gridY + leftOffset.dy)) {
            validTurns.push(leftDir);
        }
        
        if (this.isValidMove(entity.gridX + rightOffset.dx, entity.gridY + rightOffset.dy)) {
            validTurns.push(rightDir);
        }
        
        // 吃豆人不能回头，如果没有其他选择就停止不动
        // 幽灵可以回头（如果左右都不能走，尝试回头方向）
        if (validTurns.length === 0) {
            // 判断是否是吃豆人：吃豆人有 nextDirection 属性
            if (!entity.nextDirection) {
                // 幽灵可以回头
                const oppositeDir = this.getOppositeDirection(currentDir);
                const oppositeOffset = this.getDirectionOffset(oppositeDir);
                if (this.isValidMove(entity.gridX + oppositeOffset.dx, entity.gridY + oppositeOffset.dy)) {
                    validTurns.push(oppositeDir);
                }
            }
            // 吃豆人没有 validTurns，保持 isMoving = false，停止不动
        }
        
        if (validTurns.length > 0) {
            const newDir = validTurns[Math.floor(Math.random() * validTurns.length)];
            
            // 安全检查：对于吃豆人，确保新方向不是回头方向
            if (entity.nextDirection && this.isOppositeDirection(currentDir, newDir)) {
                // 吃豆人不能回头，保持停止
                return;
            }
            
            entity.direction = newDir;
            const dir = this.getDirectionOffset(entity.direction);
            entity.targetGridX = entity.gridX + dir.dx;
            entity.targetGridY = entity.gridY + dir.dy;
            entity.isMoving = true;
        }
    }
    
    // 获取相反方向
    getOppositeDirection(dir) {
        const opposites = { 'up': 'down', 'down': 'up', 'left': 'right', 'right': 'left' };
        return opposites[dir] || dir;
    }
    
    // 判断是否为相反方向
    isOppositeDirection(dir1, dir2) {
        const opposites = { 'up': 'down', 'down': 'up', 'left': 'right', 'right': 'left' };
        return opposites[dir1] === dir2;
    }
    
    // 移动过程中的碰撞检测
    checkCollisionDuringMovement() {
        this.ghosts.forEach((ghost, index) => {
            if (this.gameOver) return;
            
            // 使用浮点位置检测碰撞
            const dx = Math.abs(this.pacman.x - ghost.x);
            const dy = Math.abs(this.pacman.y - ghost.y);
            
            // 碰撞阈值：0.4格
            if (dx < 0.4 && dy < 0.4) {
                this.handleCollision(ghost, index);
            }
        });
    }
    
// 检测移动过程中的中间位置碰撞（轨迹交叉检测）
    // 旧的checkMidpointCollision和checkCollisionsImmediate已删除
    // 碰撞检测现在由checkCollisionDuringMovement和checkCollisionsContinuous处理
    
    // 删除旧的movePacman和moveGhosts函数，已被updateMovement替代
    
    getDirectionOffset(direction) {
        const offsets = {
            'up': { dx: 0, dy: -1 },
            'down': { dx: 0, dy: 1 },
            'left': { dx: -1, dy: 0 },
            'right': { dx: 1, dy: 0 }
        };
        return offsets[direction] || { dx: 0, dy: 0 };
    }
    
    isValidMove(x, y) {
        if (x < 0 || x >= this.cols || y < 0 || y >= this.rows) {
            return false;
        }
        return this.map[Math.round(y)][Math.round(x)] !== 1;
    }
    
    // 碰撞检测（使用浮点位置）
    checkCollisionsContinuous() {
        // 检查无敌果实碰撞（使用格子位置）
        const gridX = Math.round(this.pacman.x);
        const gridY = Math.round(this.pacman.y);
        
        const fruitIndex = this.powerFruits.findIndex(fruit => 
            !fruit.collected && fruit.x === gridX && fruit.y === gridY
        );
        
        if (fruitIndex !== -1) {
            this.powerFruits[fruitIndex].collected = true;
            this.isInvincible = true;
            this.invincibleTimer = this.invincibleDuration;
            this.score += 50;
            this.updateScore();
            this.playSound('powerup');
        }
        
        // 检查豆子碰撞
        const dotIndex = this.dots.findIndex(dot => 
            dot.x === gridX && dot.y === gridY
        );
        
        if (dotIndex !== -1) {
            this.dots.splice(dotIndex, 1);
            this.score += 10;
            this.updateScore();
            this.playSound('eat');
            
            if (this.pacmanMouthAnimation) {
                clearTimeout(this.pacmanMouthAnimation);
            }
            
            this.pacmanMouthOpen = false;
            this.pacmanMouthAnimation = setTimeout(() => {
                this.pacmanMouthOpen = true;
                this.pacmanMouthAnimation = null;
            }, 50);
        }
    }
    
    // 处理碰撞
    handleCollision(ghost, index) {
        if (this.gameOver) return;
        
        if (this.isInvincible) {
            if (!ghost.isEaten) {
                ghost.isEaten = true;
                this.score += 100;
                this.updateScore();
                this.playSound('eatghost');
                this.resetGhostPosition(ghost, index);
            }
        } else {
            this.loseGame();
        }
    }
    
    // 重置幽灵到随机位置
    resetGhostPosition(ghost, index) {
        const excludePositions = [
            { x: Math.round(this.pacman.x), y: Math.round(this.pacman.y) }
        ];
        const pos = this.getRandomPosition(excludePositions);
        if (pos) {
            ghost.x = pos.x;
            ghost.y = pos.y;
            ghost.gridX = pos.x;
            ghost.gridY = pos.y;
            ghost.targetGridX = pos.x;
            ghost.targetGridY = pos.y;
            ghost.isMoving = false;
            ghost.isEaten = false;
        }
    }

    updateScore() {
        document.getElementById('score').textContent = this.score;
        document.getElementById('high-score').textContent = this.highScore;
    }

    winGame() {
        this.gameRunning = false;
        this.playSound('win');
        if (this.score > this.highScore) {
            this.highScore = this.score;
            localStorage.setItem('pacmanHighScore', this.highScore);
            this.updateScore();
        }
        this.showGameOver('恭喜你赢了！', `最终得分: ${this.score}`, true);
    }

    loseGame() {
        this.gameOver = true;
        this.gameRunning = false;
        this.playSound('lose');
        if (this.score > this.highScore) {
            this.highScore = this.score;
            localStorage.setItem('pacmanHighScore', this.highScore);
            this.updateScore();
        }
        this.showGameOver('游戏结束！', `最终得分: ${this.score}`, false);
    }

    showGameOver(title, message, isWin) {
        const overlay = document.createElement('div');
        overlay.className = 'game-over-overlay';
        overlay.id = 'game-over-overlay-current';
        
        let imageHTML = '';
        let imageClass = '';
        
        if (isWin) {
            imageClass = 'win-image shake-animation';
            if (this.useCustomWinImage && this.winImage) {
                imageHTML = `<img src="${this.winImage.src}" class="${imageClass}" alt="胜利图片">`;
            }
        } else {
            imageClass = 'lose-image';
            if (this.useCustomLoseImage && this.loseImage) {
                imageHTML = `<img src="${this.loseImage.src}" class="${imageClass}" alt="失败图片">`;
            }
        }
        
        overlay.innerHTML = `
            <div class="game-over-content ${isWin ? 'win-content' : 'lose-content'}">
                ${imageHTML}
                <h2>${title}</h2>
                <p>${message}</p>
                <div class="game-over-buttons">
                    <button onclick="this.closest('.game-over-overlay').remove(); document.getElementById('restart-btn').click();">再玩一次</button>
                    <button onclick="document.getElementById('leaderboard-btn').click();" style="background: linear-gradient(135deg, #9c27b0 0%, #7b1fa2 100%); color: #fff; margin-left: 10px;">🏆 排行榜</button>
                    <button id="submit-to-leaderboard-btn" style="background: linear-gradient(135deg, #4caf50 0%, #45a049 100%); color: #fff; margin-left: 10px;">📝 上榜</button>
                </div>
                <p style="font-size: 14px; color: #888; margin-top: 10px;">按回车键重新开始</p>
            </div>
        `;
        document.body.appendChild(overlay);
        
        // 上榜按钮点击事件
        const submitBtn = overlay.querySelector('#submit-to-leaderboard-btn');
        if (submitBtn) {
            submitBtn.addEventListener('click', () => {
                overlay.remove();
                this.showNameInput(this.score, isWin);
            });
        }
        
        const handleKeyPress = (e) => {
            if (e.key === 'Enter') {
                overlay.remove();
                document.getElementById('restart-btn').click();
                document.removeEventListener('keydown', handleKeyPress);
            }
        };
        
        document.addEventListener('keydown', handleKeyPress);
    }

    render() {
        this.ctx.fillStyle = '#000';
        this.ctx.fillRect(0, 0, this.canvas.width, this.canvas.height);
        
        this.drawMap();
        this.drawDots();
        this.drawPowerFruits();
        this.drawPacman();
        this.drawGhosts();
        this.drawInvincibleIndicator();
    }

    drawMap() {
        for (let y = 0; y < this.rows; y++) {
            for (let x = 0; x < this.cols; x++) {
                if (this.map[y][x] === 1) {
                    this.ctx.fillStyle = '#212121';
                    this.ctx.fillRect(
                        x * this.cellSize,
                        y * this.cellSize,
                        this.cellSize,
                        this.cellSize
                    );
                }
            }
        }
    }

    drawDots() {
        if (this.useCustomDotImage && this.dotImage) {
            this.dots.forEach(dot => {
                const x = dot.x * this.cellSize;
                const y = dot.y * this.cellSize;
                this.ctx.drawImage(this.dotImage, x, y, this.cellSize, this.cellSize);
            });
        } else {
            this.ctx.fillStyle = '#ffeb3b';
            this.dots.forEach(dot => {
                const x = dot.x * this.cellSize + this.cellSize / 2;
                const y = dot.y * this.cellSize + this.cellSize / 2;
                const radius = 3;
                this.ctx.beginPath();
                this.ctx.arc(x, y, radius, 0, Math.PI * 2);
                this.ctx.fill();
            });
        }
    }
    
    drawPowerFruits() {
        this.powerFruits.forEach(fruit => {
            if (!fruit.collected) {
                const x = fruit.x * this.cellSize;
                const y = fruit.y * this.cellSize;
                const size = this.cellSize;
                
                if (this.useCustomPowerFruitImage && this.powerFruitImage) {
                    this.ctx.drawImage(this.powerFruitImage, x, y, size, size);
                } else {
                    // 默认无敌果实样式：闪烁的大豆子
                    const centerX = x + size / 2;
                    const centerY = y + size / 2;
                    const radius = size / 3;
                    
                    // 闪烁效果
                    const flash = Math.sin(Date.now() / 200) * 0.3 + 0.7;
                    
                    this.ctx.fillStyle = `rgba(0, 255, 255, ${flash})`;
                    this.ctx.beginPath();
                    this.ctx.arc(centerX, centerY, radius, 0, Math.PI * 2);
                    this.ctx.fill();
                    
                    // 外圈光环
                    this.ctx.strokeStyle = '#00ffff';
                    this.ctx.lineWidth = 2;
                    this.ctx.beginPath();
                    this.ctx.arc(centerX, centerY, radius + 3, 0, Math.PI * 2);
                    this.ctx.stroke();
                }
            }
        });
    }
    
    drawInvincibleIndicator() {
        if (this.isInvincible) {
            // 在吃豆人周围绘制闪烁光环（使用浮点位置）
            const x = this.pacman.x * this.cellSize + this.cellSize / 2;
            const y = this.pacman.y * this.cellSize + this.cellSize / 2;
            const radius = this.cellSize / 2 + 5;
            
            const flash = Math.sin(Date.now() / 100) * 0.5 + 0.5;
            
            this.ctx.strokeStyle = `rgba(255, 0, 255, ${flash})`;
            this.ctx.lineWidth = 3;
            this.ctx.beginPath();
            this.ctx.arc(x, y, radius, 0, Math.PI * 2);
            this.ctx.stroke();
            
            // 显示剩余时间
            const seconds = Math.ceil(this.invincibleTimer / 1000);
            this.ctx.fillStyle = '#ff00ff';
            this.ctx.font = '12px Arial';
            this.ctx.textAlign = 'center';
            this.ctx.fillText(`无敌: ${seconds}s`, this.canvas.width / 2, 15);
        }
    }

    drawPacman() {
        // 使用浮点位置渲染
        const x = this.pacman.x * this.cellSize;
        const y = this.pacman.y * this.cellSize;
        const size = this.cellSize;
        
        if (this.useCustomPacmanImages) {
            const image = this.pacmanMouthOpen ? this.pacmanOpenImage : this.pacmanClosedImage;
            if (image) {
                this.ctx.save();
                this.ctx.translate(x + size / 2, y + size / 2);
                
                switch(this.pacman.direction) {
                    case 'up':
                        this.ctx.rotate(-Math.PI / 2);
                        break;
                    case 'down':
                        this.ctx.rotate(Math.PI / 2);
                        break;
                    case 'left':
                        this.ctx.rotate(Math.PI);
                        break;
                    case 'right':
                        break;
                }
                
                this.ctx.drawImage(image, -size / 2, -size / 2, size, size);
                this.ctx.restore();
            }
        } else {
            const centerX = x + size / 2;
            const centerY = y + size / 2;
            const radius = size / 2 - 2;
            
            this.ctx.save();
            this.ctx.translate(centerX, centerY);
            
            let rotationAngle = 0;
            switch(this.pacman.direction) {
                case 'up':
                    rotationAngle = -Math.PI / 2;
                    break;
                case 'down':
                    rotationAngle = Math.PI / 2;
                    break;
                case 'left':
                    rotationAngle = Math.PI;
                    break;
                case 'right':
                    rotationAngle = 0;
                    break;
            }
            
            this.ctx.rotate(rotationAngle);
            
            this.ctx.strokeStyle = '#000';
            this.ctx.lineWidth = 2;
            
            if (this.pacmanMouthOpen) {
                this.ctx.fillStyle = '#000';
                this.ctx.beginPath();
                this.ctx.arc(0, 0, radius, -Math.PI / 4, Math.PI / 4, false);
                this.ctx.lineTo(0, 0);
                this.ctx.closePath();
                this.ctx.fill();
                
                this.ctx.fillStyle = '#ffeb3b';
                this.ctx.beginPath();
                this.ctx.arc(0, 0, radius, Math.PI / 4, -Math.PI / 4, false);
                this.ctx.lineTo(0, 0);
                this.ctx.closePath();
                this.ctx.fill();
                this.ctx.stroke();
            } else {
                this.ctx.fillStyle = '#ffeb3b';
                this.ctx.beginPath();
                this.ctx.arc(0, 0, radius, 0, Math.PI * 2);
                this.ctx.closePath();
                this.ctx.fill();
                this.ctx.stroke();
            }
            
            if (this.pacmanMouthOpen) {
                const eyeX = -radius / 2;
                const eyeY = -radius / 3;
                const eyeRadius = radius / 5;
                
                this.ctx.fillStyle = '#000';
                this.ctx.beginPath();
                this.ctx.arc(eyeX, eyeY, eyeRadius, 0, Math.PI * 2);
                this.ctx.fill();
            }
            
            this.ctx.restore();
        }
    }

    drawGhosts() {
        this.ghosts.forEach((ghost, index) => {
            // 使用浮点位置渲染
            const x = ghost.x * this.cellSize;
            const y = ghost.y * this.cellSize;
            const size = this.cellSize;
            
            if (this.useCustomGhostImages && this.ghostImages[index]) {
                this.ctx.drawImage(this.ghostImages[index], x, y, size, size);
            } else {
                const centerX = x + size / 2;
                const centerY = y + size / 2;
                const radius = size / 2 - 2;
                
                this.ctx.fillStyle = ghost.color;
                this.ctx.beginPath();
                this.ctx.arc(centerX, centerY - 2, radius, Math.PI, 0);
                this.ctx.lineTo(centerX + radius, centerY + radius - 2);
                
                for (let i = 0; i < 3; i++) {
                    const waveX = centerX + radius - (i + 1) * (radius * 2 / 3);
                    this.ctx.lineTo(waveX, centerY + radius - 2 + (i % 2 === 0 ? 4 : 0));
                }
                
                this.ctx.lineTo(centerX - radius, centerY + radius - 2);
                this.ctx.closePath();
                this.ctx.fill();
                
                this.ctx.fillStyle = '#fff';
                this.ctx.beginPath();
                this.ctx.arc(centerX - 4, centerY - 4, 3, 0, Math.PI * 2);
                this.ctx.arc(centerX + 4, centerY - 4, 3, 0, Math.PI * 2);
                this.ctx.fill();
                
                this.ctx.fillStyle = '#000';
                this.ctx.beginPath();
                this.ctx.arc(centerX - 4, centerY - 4, 1.5, 0, Math.PI * 2);
                this.ctx.arc(centerX + 4, centerY - 4, 1.5, 0, Math.PI * 2);
                this.ctx.fill();
            }
        });
    }
}

let game;
document.addEventListener('DOMContentLoaded', () => {
    const gameArea = document.getElementById('game-area');
    game = new PacmanGame();
    gameArea.appendChild(game.canvas);
});