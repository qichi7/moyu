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
        
        this.initializeMap();
        this.setupEventListeners();
        this.setupImageUpload();
        this.setupAudio();
        this.setupSpeedControl();
        this.setupRefreshMapButton();
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
        
        // 3. 消除死胡同：确保每个点至少有两个方向可以移动
        this.removeDeadEnds(map, rows, cols);
        
        // 4. 确保地图连通性
        this.ensureConnectivity(map, rows, cols);
        
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
    
    // 增加额外通道
    addExtraPassages(map, rows, cols) {
        // 随机打通一些墙壁，增加通道密度
        const extraPassages = Math.floor((rows * cols) * 0.15); // 15%的额外通道
        
        for (let i = 0; i < extraPassages; i++) {
            const x = Math.floor(Math.random() * (cols - 2)) + 1;
            const y = Math.floor(Math.random() * (rows - 2)) + 1;
            
            if (map[y][x] === 1) {
                // 检查周围是否有通道
                const neighbors = this.countNeighborPassages(map, x, y, rows, cols);
                if (neighbors >= 1 && neighbors <= 3) {
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
    
    // 消除死胡同
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
                            
                            for (const dir of directions) {
                                const nx = x + dir.dx;
                                const ny = y + dir.dy;
                                if (nx > 0 && nx < cols - 1 && ny > 0 && ny < rows - 1 && map[ny][nx] === 1) {
                                    // 检查打通后是否能连通更多通道
                                    const newPassages = this.countNeighborPassages(map, nx, ny, rows, cols);
                                    if (newPassages >= 0) {
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
    
    // 设置刷新地图按钮
    setupRefreshMapButton() {
        const refreshMapBtn = document.getElementById('refresh-map-btn');
        if (refreshMapBtn) {
            refreshMapBtn.addEventListener('click', () => {
                this.refreshMap();
            });
        }
    }
    
    // 刷新地图
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
        
        // 重新生成随机地图
        this.initializeMap();
        
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
        this.gameRunning = true;
        this.paused = false;
        this.lastTime = 0;
        requestAnimationFrame((ts) => this.gameLoop(ts));
    }

    restartGame() {
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
    
    // 尝试随机转向（吃豆人不能回头）
    tryRandomTurn(entity) {
        const leftTurns = { 'up': 'left', 'down': 'right', 'left': 'down', 'right': 'up' };
        const rightTurns = { 'up': 'right', 'down': 'left', 'left': 'up', 'right': 'down' };
        
        const validTurns = [];
        const leftDir = leftTurns[entity.direction];
        const rightDir = rightTurns[entity.direction];
        
        // 记录当前方向，防止回头
        entity.lastDirection = entity.direction;
        
        const leftOffset = this.getDirectionOffset(leftDir);
        const rightOffset = this.getDirectionOffset(rightDir);
        
        // 检查左转是否可行且不是回头
        if (this.isValidMove(entity.gridX + leftOffset.dx, entity.gridY + leftOffset.dy)) {
            if (!this.isOppositeDirection(leftDir, entity.lastDirection)) {
                validTurns.push(leftDir);
            }
        }
        
        // 检查右转是否可行且不是回头
        if (this.isValidMove(entity.gridX + rightOffset.dx, entity.gridY + rightOffset.dy)) {
            if (!this.isOppositeDirection(rightDir, entity.lastDirection)) {
                validTurns.push(rightDir);
            }
        }
        
        // 吃豆人不能回头，如果没有其他选择就停止不动
        // 幽灵可以回头（如果左右都不能走，尝试回头方向）
        if (validTurns.length === 0) {
            const oppositeDir = this.getOppositeDirection(entity.direction);
            const oppositeOffset = this.getDirectionOffset(oppositeDir);
            if (this.isValidMove(entity.gridX + oppositeOffset.dx, entity.gridY + oppositeOffset.dy)) {
                // 只有幽灵可以回头，吃豆人不行
                // 判断是否是吃豆人：吃豆人有 nextDirection 属性
                if (!entity.nextDirection) {
                    validTurns.push(oppositeDir);
                }
            }
        }
        
        if (validTurns.length > 0) {
            entity.direction = validTurns[Math.floor(Math.random() * validTurns.length)];
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
                <button onclick="this.closest('.game-over-overlay').remove(); document.getElementById('restart-btn').click();">再玩一次</button>
                <p style="font-size: 14px; color: #888; margin-top: 10px;">按回车键重新开始</p>
            </div>
        `;
        document.body.appendChild(overlay);
        
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