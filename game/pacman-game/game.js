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
        this.moveTimer = 0;
        this.gameSpeed = 5;
        this.moveInterval = 200;
        
        this.initializeMap();
        this.setupEventListeners();
        this.setupImageUpload();
        this.setupAudio();
        this.setupSpeedControl();
        this.render();
    }

    initializeMap() {
        this.map = [
            [1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1],
            [1, 0, 0, 0, 0, 0, 0, 0, 0, 1, 0, 0, 0, 0, 0, 0, 0, 0, 1],
            [1, 0, 1, 1, 0, 1, 1, 1, 0, 1, 0, 1, 1, 1, 0, 1, 1, 0, 1],
            [1, 0, 1, 1, 0, 1, 1, 1, 0, 1, 0, 1, 1, 1, 0, 1, 1, 0, 1],
            [1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 1],
            [1, 0, 1, 1, 0, 1, 0, 1, 1, 1, 1, 1, 0, 1, 0, 1, 1, 0, 1],
            [1, 0, 0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0, 0, 1],
            [1, 1, 1, 1, 0, 1, 1, 1, 0, 1, 0, 1, 1, 1, 0, 1, 1, 1, 1],
            [1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 1],
            [1, 0, 1, 1, 0, 1, 1, 1, 0, 1, 0, 1, 1, 1, 0, 1, 1, 0, 1],
            [1, 0, 0, 0, 0, 0, 0, 0, 0, 1, 0, 0, 0, 0, 0, 0, 0, 0, 1],
            [1, 0, 1, 1, 0, 1, 0, 1, 1, 1, 1, 1, 0, 1, 0, 1, 1, 0, 1],
            [1, 0, 1, 1, 0, 1, 0, 0, 0, 0, 0, 0, 0, 1, 0, 1, 1, 0, 1],
            [1, 0, 0, 0, 0, 0, 0, 1, 1, 1, 1, 1, 0, 0, 0, 0, 0, 0, 1],
            [1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1]
        ];
        
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
        const directions = ['up', 'down', 'left', 'right'];
        const randomDirection = directions[Math.floor(Math.random() * directions.length)];
        
        this.pacman = {
            x: pos.x,
            y: pos.y,
            displayX: pos.x,
            displayY: pos.y,
            targetX: pos.x,
            targetY: pos.y,
            direction: randomDirection,
            nextDirection: randomDirection,
            isMoving: false,
            moveProgress: 0
        };
        
        // 记录吃豆人位置为已占用
        this.occupiedPositions = [{ x: pos.x, y: pos.y }];
    }

    initializeGhostsRandom() {
        const ghostColors = ['#ff0000', '#00ffff', '#ffb8ff', '#ffb852', '#00ff00', '#ff00ff', '#ffffff', '#ffff00', '#0080ff', '#ff8000'];
        const directions = ['up', 'down', 'left', 'right'];
        
        this.ghosts = [];
        for (let i = 0; i < this.ghostCount; i++) {
            const pos = this.getRandomPosition(this.occupiedPositions);
            if (pos) {
                const randomDirection = directions[Math.floor(Math.random() * directions.length)];
                
                this.ghosts.push({
                    x: pos.x,
                    y: pos.y,
                    displayX: pos.x,
                    displayY: pos.y,
                    targetX: pos.x,
                    targetY: pos.y,
                    color: ghostColors[i % ghostColors.length],
                    direction: randomDirection,
                    isMoving: false,
                    moveProgress: 0
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
                this.updateMoveInterval();
            });
        }
        
        this.updateMoveInterval();
    }
    
    updateFileLabel(input, text) {
        const label = input.previousElementSibling;
        if (label && label.classList.contains('file-label')) {
            label.textContent = text;
            label.style.background = 'linear-gradient(135deg, #ffeb3b 0%, #ffc107 100%)';
            label.style.color = '#000';
        }
    }
    
    updateMoveInterval() {
        const speedIntervals = {
            1: 400,
            2: 350,
            3: 300,
            4: 250,
            5: 200,
            6: 180,
            7: 160,
            8: 140,
            9: 120,
            10: 100
        };
        this.moveInterval = speedIntervals[this.gameSpeed] || 200;
    }
    
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
        this.moveTimer = 0;
        requestAnimationFrame((ts) => this.gameLoop(ts));
    }

    restartGame() {
        this.gameRunning = false;
        this.gameOver = false;
        this.paused = false;
        this.score = 0;
        this.isInvincible = false;
        this.invincibleTimer = 0;
        this.updateScore();
        this.initializeMap();
        this.render();
    }

    togglePause() {
        this.paused = !this.paused;
        if (!this.paused) {
            this.lastTime = 0;
            this.moveTimer = 0;
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
        
        this.moveTimer += deltaTime;
        
        if (this.moveTimer >= this.moveInterval) {
            this.movePacman();
            this.moveGhosts();
            this.checkCollisions();
            this.moveTimer = 0;
        }
        
        this.updateDisplayPositions(deltaTime);
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
    
    updateDisplayPositions(deltaTime) {
        const moveSpeed = deltaTime / this.moveInterval;
        
        if (this.pacman.isMoving) {
            this.pacman.moveProgress += moveSpeed;
            if (this.pacman.moveProgress >= 1) {
                this.pacman.moveProgress = 0;
                this.pacman.isMoving = false;
                this.pacman.displayX = this.pacman.targetX;
                this.pacman.displayY = this.pacman.targetY;
            } else {
                this.pacman.displayX = this.pacman.x + (this.pacman.targetX - this.pacman.x) * this.pacman.moveProgress;
                this.pacman.displayY = this.pacman.y + (this.pacman.targetY - this.pacman.y) * this.pacman.moveProgress;
            }
        }
        
        this.ghosts.forEach(ghost => {
            if (ghost.isMoving) {
                ghost.moveProgress += moveSpeed;
                if (ghost.moveProgress >= 1) {
                    ghost.moveProgress = 0;
                    ghost.isMoving = false;
                    ghost.displayX = ghost.targetX;
                    ghost.displayY = ghost.targetY;
                } else {
                    ghost.displayX = ghost.x + (ghost.targetX - ghost.x) * ghost.moveProgress;
                    ghost.displayY = ghost.y + (ghost.targetY - ghost.y) * ghost.moveProgress;
                }
            }
        });
    }

    movePacman() {
        const { x, y } = this.pacman;
        let newX = x;
        let newY = y;
        
        const directions = {
            'up': { dx: 0, dy: -1 },
            'down': { dx: 0, dy: 1 },
            'left': { dx: -1, dy: 0 },
            'right': { dx: 1, dy: 0 }
        };
        
        const oppositeDirections = {
            'up': 'down',
            'down': 'up',
            'left': 'right',
            'right': 'left'
        };
        
        const leftTurns = {
            'up': 'left',
            'down': 'right',
            'left': 'down',
            'right': 'up'
        };
        
        const rightTurns = {
            'up': 'right',
            'down': 'left',
            'left': 'up',
            'right': 'down'
        };
        
        const nextDir = directions[this.pacman.nextDirection];
        const nextX = x + nextDir.dx;
        const nextY = y + nextDir.dy;
        
        if (this.isValidMove(nextX, nextY)) {
            if (this.pacman.nextDirection !== oppositeDirections[this.pacman.direction]) {
                this.pacman.direction = this.pacman.nextDirection;
                newX = nextX;
                newY = nextY;
            } else {
                const currentDirari = directions[this.pacman.direction];
                const currentNextX = x + currentDirari.dx;
                const currentNextY = y + currentDirari.dy;
                
                if (this.isValidMove(currentNextX, currentNextY)) {
                    newX = currentNextX;
                    newY = currentNextY;
                } else {
                    const leftTurn = leftTurns[this.pacman.direction];
                    const rightTurn = rightTurns[this.pacman.direction];
                    
                    const validTurns = [];
                    if (this.isValidMove(x + directions[leftTurn].dx, y + directions[leftTurn].dy)) {
                        validTurns.push(leftTurn);
                    }
                    if (this.isValidMove(x + directions[rightTurn].dx, y + directions[rightTurn].dy)) {
                        validTurns.push(rightTurn);
                    }
                    
                    if (validTurns.length > 0) {
                        const randomTurn = validTurns[Math.floor(Math.random() * validTurns.length)];
                        this.pacman.direction = randomTurn;
                        const turnDir = directions[randomTurn];
                        newX = x + turnDir.dx;
                        newY = y + turnDir.dy;
                    }
                }
            }
        } else {
            const currentDirari = directions[this.pacman.direction];
            const currentNextX = x + currentDirari.dx;
            const currentNextY = y + currentDirari.dy;
            
            if (this.isValidMove(currentNextX, currentNextY)) {
                newX = currentNextX;
                newY = currentNextY;
            } else {
                const leftTurn = leftTurns[this.pacman.direction];
                const rightTurn = rightTurns[this.pacman.direction];
                
                const validTurns = [];
                if (this.isValidMove(x + directions[leftTurn].dx, y + directions[leftTurn].dy)) {
                    validTurns.push(leftTurn);
                }
                if (this.isValidMove(x + directions[rightTurn].dx, y + directions[rightTurn].dy)) {
                    validTurns.push(rightTurn);
                }
                
                if (validTurns.length > 0) {
                    const randomTurn = validTurns[Math.floor(Math.random() * validTurns.length)];
                    this.pacman.direction = randomTurn;
                    const turnDirari = directions[randomTurn];
                    newX = x + turnDirari.dx;
                    newY = y + turnDirari.dy;
                }
            }
        }
        
        if (newX !== this.pacman.x || newY !== this.pacman.y) {
            this.pacman.x = newX;
            this.pacman.y = newY;
            this.pacman.targetX = newX;
            this.pacman.targetY = newY;
            this.pacman.isMoving = true;
            this.pacman.moveProgress = 0;
        }
    }

    moveGhosts() {
        this.ghosts.forEach(ghost => {
            const directions = ['up', 'down', 'left', 'right'];
            const validDirections = directions.filter(dir => {
                const { dx, dy } = this.getDirectionOffset(dir);
                const newX = ghost.x + dx;
                const newY = ghost.y + dy;
                return this.isValidMove(newX, newY);
            });
            
            if (validDirections.length > 0) {
                const randomIndex = Math.floor(Math.random() * validDirections.length);
                ghost.direction = validDirections[randomIndex];
                const { dx, dy } = this.getDirectionOffset(ghost.direction);
                const newX = ghost.x + dx;
                const newY = ghost.y + dy;
                ghost.x = newX;
                ghost.y = newY;
                ghost.targetX = newX;
                ghost.targetY = newY;
                ghost.isMoving = true;
                ghost.moveProgress = 0;
            }
        });
    }

    getDirectionOffset(direction) {
        const offsets = {
            'up': { dx: 0, dy: -1 },
            'down': { dx: 0, dy: 1 },
            'left': { dx: -1, dy: 0 },
            'right': { dx: 1, dy: 0 }
        };
        return offsets[direction];
    }

    isValidMove(x, y) {
        if (x < 0 || x >= this.cols || y < 0 || y >= this.rows) {
            return false;
        }
        return this.map[y][x] !== 1;
    }

    checkCollisions() {
        // 检查无敌果实碰撞
        const fruitIndex = this.powerFruits.findIndex(fruit => 
            !fruit.collected && fruit.x === this.pacman.x && fruit.y === this.pacman.y
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
            dot.x === this.pacman.x && dot.y === this.pacman.y
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
            const closeMouthTime = 50;
            
            this.pacmanMouthAnimation = setTimeout(() => {
                this.pacmanMouthOpen = true;
                this.pacmanMouthAnimation = null;
            }, closeMouthTime);
        }
        
        // 检查幽灵碰撞
        this.ghosts.forEach((ghost, index) => {
            if (ghost.x === this.pacman.x && ghost.y === this.pacman.y) {
                if (this.isInvincible) {
                    // 无敌状态：吃掉幽灵
                    this.score += 100;
                    this.updateScore();
                    this.playSound('eatghost');
                    // 重置幽灵位置
                    const ghostPositions = [
                        { x: 17, y: 1 },
                        { x: 1, y: 13 },
                        { x: 17, y: 13 },
                        { x: 9, y: 1 },
                        { x: 1, y: 7 },
                        { x: 17, y: 7 },
                        { x: 9, y: 13 },
                        { x: 5, y: 1 },
                        { x: 13, y: 1 },
                        { x: 9, y: 4 }
                    ];
                    if (ghostPositions[index]) {
                        ghost.x = ghostPositions[index].x;
                        ghost.y = ghostPositions[index].y;
                        ghost.displayX = ghost.x;
                        ghost.displayY = ghost.y;
                        ghost.targetX = ghost.x;
                        ghost.targetY = ghost.y;
                    }
                } else {
                    // 正常状态：游戏结束
                    this.loseGame();
                }
            }
        });
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
            // 在吃豆人周围绘制闪烁光环
            const x = this.pacman.displayX * this.cellSize + this.cellSize / 2;
            const y = this.pacman.displayY * this.cellSize + this.cellSize / 2;
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
        const x = this.pacman.displayX * this.cellSize;
        const y = this.pacman.displayY * this.cellSize;
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
            const x = ghost.displayX * this.cellSize;
            const y = ghost.displayY * this.cellSize;
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