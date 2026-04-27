/**
 * GoodMorning - 多人社交游戏
 * 主游戏逻辑
 */

class GoodMorningGame {
    // ========== 硬编码的Gist ID ==========
    // GoodMorning游戏专用Gist（已创建）
    static STATUS_GIST_ID = '6ff40e66e1372b4cc8670d3ab699c5b0';
    static POSITION_GIST_ID = 'ef004040c5ead2f629d725a0127158f2';
    static MAP_GIST_ID = '3870a2f55dc9c3454049f149a9fb499d';
    
    constructor() {
        // Canvas相关
        this.canvas = document.getElementById('game-canvas');
        this.ctx = this.canvas.getContext('2d');
        
        // 游戏状态
        this.isRunning = false;
        this.lastTime = 0;
        
        // 配置
        this.refreshInterval = 200; // 默认刷新间隔200ms
        this.cellSize = 32;         // 地图格子大小
        
        // 管理器
        this.gistManager = null;
        this.characterManager = null;
        this.mapManager = null;
        
        // 当前玩家
        this.currentPlayer = null;
        this.playerName = '';
        
        // 其他玩家
        this.otherPlayers = new Map();
        
        // 相机/视角
        this.camera = { x: 0, y: 0 };
        
        // 控制状态
        this.joystick = { active: false, dx: 0, dy: 0 };
        this.keys = { up: false, down: false, left: false, right: false };
        
        // 定时器ID
        this.positionWriteTimer = null;
        this.positionReadTimer = null;
        this.statusReadTimer = null;
        
        // 初始化
        this.init();
    }
    
    init() {
        // 设置Canvas大小
        this.resizeCanvas();
        window.addEventListener('resize', () => this.resizeCanvas());
        
        // 初始化管理器
        this.gistManager = new GistManager(this);
        this.characterManager = new CharacterManager(this);
        this.mapManager = new MapManager(this);
        
        // 预加载默认地图（确保地图能显示）
        this.mapManager.loadDefaultMap();
        
        // 设置事件监听
        this.setupEventListeners();
        this.setupChatEnterKey();
        this.setupDebugMode();
        
        // 显示登录界面
        this.showLoginOverlay();
    }
    
    resizeCanvas() {
        this.canvas.width = window.innerWidth;
        this.canvas.height = window.innerHeight;
        
        if (this.isRunning) {
            this.render();
        }
    }
    
    setupEventListeners() {
        // 登录界面按钮
        document.getElementById('create-character-btn')?.addEventListener('click', () => {
            this.handleCreateCharacter();
        });
        
        document.getElementById('select-character-btn')?.addEventListener('click', () => {
            this.handleSelectCharacter();
        });
        
        // 角色选择界面
        document.getElementById('back-to-login-btn')?.addEventListener('click', () => {
            this.showLoginOverlay();
        });
        
        // 游戏控制按钮
        document.getElementById('settings-btn')?.addEventListener('click', () => {
            this.showSettingsOverlay();
        });
        
        document.getElementById('chat-btn')?.addEventListener('click', () => {
            this.showChatOverlay();
        });
        
        document.getElementById('refresh-btn')?.addEventListener('click', () => {
            this.forceRefresh();
        });
        
        // 设置界面
        document.getElementById('close-settings-btn')?.addEventListener('click', () => {
            this.hideSettingsOverlay();
        });
        
        document.getElementById('save-settings-btn')?.addEventListener('click', () => {
            this.saveSettings();
        });
        
        document.getElementById('cancel-settings-btn')?.addEventListener('click', () => {
            this.hideSettingsOverlay();
        });
        
        // 设置界面身高滑块
        document.getElementById('setting-height')?.addEventListener('input', (e) => {
            document.getElementById('height-value').textContent = e.target.value;
        });
        
        // 聊天界面
        document.getElementById('close-chat-btn')?.addEventListener('click', () => {
            this.hideChatOverlay();
        });
        
        document.getElementById('send-chat-btn')?.addEventListener('click', () => {
            this.sendChat();
        });
        
        document.getElementById('cancel-chat-btn')?.addEventListener('click', () => {
            this.cancelChat();
        });
        
        // 轮盘控制器
        this.setupJoystick();
        
        // 键盘控制
        this.setupKeyboard();
    }
    
    setupJoystick() {
        const base = document.getElementById('joystick-base');
        const stick = document.getElementById('joystick-stick');
        
        if (!base || !stick) return;
        
        let isDragging = false;
        const maxDistance = 40;
        
        const handleStart = (e) => {
            isDragging = true;
            this.joystick.active = true;
            base.classList.add('dragging');
            stick.style.animation = 'none';
            e.preventDefault();
        };
        
        const handleMove = (e) => {
            if (!isDragging) return;
            
            const rect = base.getBoundingClientRect();
            const centerX = rect.left + rect.width / 2;
            const centerY = rect.top + rect.height / 2;
            
            let clientX, clientY;
            if (e.touches) {
                clientX = e.touches[0].clientX;
                clientY = e.touches[0].clientY;
            } else {
                clientX = e.clientX;
                clientY = e.clientY;
            }
            
            let dx = clientX - centerX;
            let dy = clientY - centerY;
            
            const distance = Math.sqrt(dx * dx + dy * dy);
            if (distance > maxDistance) {
                dx = dx / distance * maxDistance;
                dy = dy / distance * maxDistance;
            }
            
            const angle = Math.atan2(dy, dx);
            const intensity = Math.min(distance / maxDistance, 1);
            
            stick.style.transform = `translate(calc(-50% + ${dx}px), calc(-50% + ${dy}px)) scale(${1 + intensity * 0.15})`;
            
            const hueShift = intensity * 30;
            stick.style.filter = `hue-rotate(${hueShift}deg) brightness(${1 + intensity * 0.1})`;
            
            if (Math.abs(dx) > 5 || Math.abs(dy) > 5) {
                stick.classList.add('active');
                const mouth = stick.querySelector('.stick-mouth');
                if (mouth) {
                    mouth.style.width = `${10 + intensity * 8}px`;
                    mouth.style.height = `${5 + intensity * 3}px`;
                }
            }
            
            this.joystick.dx = dx / maxDistance;
            this.joystick.dy = dy / maxDistance;
            
            e.preventDefault();
        };
        
        const handleEnd = () => {
            isDragging = false;
            this.joystick.active = false;
            this.joystick.dx = 0;
            this.joystick.dy = 0;
            base.classList.remove('dragging');
            stick.classList.remove('active');
            stick.style.transform = 'translate(-50%, -50%)';
            stick.style.filter = '';
            stick.style.animation = 'stick-bounce 2s ease-in-out infinite';
            
            const mouth = stick.querySelector('.stick-mouth');
            if (mouth) {
                mouth.style.width = '10px';
                mouth.style.height = '5px';
            }
        };
        
        base.addEventListener('mousedown', handleStart);
        base.addEventListener('touchstart', handleStart, { passive: false });
        
        document.addEventListener('mousemove', handleMove);
        document.addEventListener('touchmove', handleMove, { passive: false });
        
        document.addEventListener('mouseup', handleEnd);
        document.addEventListener('touchend', handleEnd);
    }
    
    setupKeyboard() {
        document.addEventListener('keydown', (e) => {
            switch(e.key) {
                case 'ArrowUp':
                case 'w':
                case 'W':
                    this.keys.up = true;
                    e.preventDefault();
                    break;
                case 'ArrowDown':
                case 's':
                case 'S':
                    this.keys.down = true;
                    e.preventDefault();
                    break;
                case 'ArrowLeft':
                case 'a':
                case 'A':
                    this.keys.left = true;
                    e.preventDefault();
                    break;
                case 'ArrowRight':
                case 'd':
                case 'D':
                    this.keys.right = true;
                    e.preventDefault();
                    break;
            }
        });
        
        document.addEventListener('keyup', (e) => {
            switch(e.key) {
                case 'ArrowUp':
                case 'w':
                case 'W':
                    this.keys.up = false;
                    break;
                case 'ArrowDown':
                case 's':
                case 'S':
                    this.keys.down = false;
                    break;
                case 'ArrowLeft':
                case 'a':
                case 'A':
                    this.keys.left = false;
                    break;
                case 'ArrowRight':
                case 'd':
                case 'D':
                    this.keys.right = false;
                    break;
            }
        });
    }
    
    // ========== 界面控制 ==========
    
    // Toast通知系统
    showToast(message, type = 'info', duration = 3000) {
        const container = document.getElementById('toast-container');
        const toast = document.createElement('div');
        toast.className = `toast toast-${type}`;
        toast.textContent = message;
        
        container.appendChild(toast);
        
        // 自动移除
        setTimeout(() => {
            toast.style.animation = 'toastFadeOut 0.3s ease';
            setTimeout(() => {
                toast.remove();
            }, 300);
        }, duration);
    }
    
    showLoginOverlay() {
        document.getElementById('login-overlay').style.display = 'flex';
        document.getElementById('character-select-overlay').style.display = 'none';
        document.getElementById('game-container').style.display = 'none';
    }
    
    showCharacterSelectOverlay(characters) {
        document.getElementById('login-overlay').style.display = 'none';
        document.getElementById('character-select-overlay').style.display = 'flex';
        
        const list = document.getElementById('character-list');
        list.innerHTML = '';
        
        characters.forEach(name => {
            const item = document.createElement('div');
            item.className = 'character-item';
            item.innerHTML = `<span class="character-item-name">${name}</span>`;
            item.addEventListener('click', () => {
                this.selectCharacter(name);
            });
            list.appendChild(item);
        });
    }
    
    showGameContainer() {
        document.getElementById('login-overlay').style.display = 'none';
        document.getElementById('character-select-overlay').style.display = 'none';
        document.getElementById('game-container').style.display = 'block';
        
        // 更新玩家信息显示
        document.getElementById('current-player-name').textContent = this.playerName;
    }
    
    showSettingsOverlay() {
        document.getElementById('settings-overlay').style.display = 'flex';
        
        // 加载当前设置
        if (this.currentPlayer) {
            document.getElementById('setting-name').value = this.playerName;
            document.getElementById('refresh-interval').value = this.refreshInterval;
            document.getElementById('setting-gender').value = this.currentPlayer.gender;
            document.getElementById('setting-height').value = this.currentPlayer.height;
            document.getElementById('height-value').textContent = this.currentPlayer.height;
            document.getElementById('setting-hair-style').value = this.currentPlayer.hairStyle;
            document.getElementById('setting-hair-color').value = this.currentPlayer.hairColor;
            document.getElementById('setting-clothing-style').value = this.currentPlayer.clothingStyle;
            document.getElementById('setting-clothing-color').value = this.currentPlayer.clothingColor;
            document.getElementById('setting-skin-color').value = this.currentPlayer.skinColor;
            document.getElementById('setting-eye-color').value = this.currentPlayer.eyeColor;
            
            // 配饰复选框
            const checkboxes = document.querySelectorAll('.checkbox-group input[type="checkbox"]');
            checkboxes.forEach(cb => {
                cb.checked = this.currentPlayer.accessories.includes(cb.value);
            });
        }
    }
    
    hideSettingsOverlay() {
        document.getElementById('settings-overlay').style.display = 'none';
    }
    
    showChatOverlay() {
        document.getElementById('chat-overlay').style.display = 'flex';
        document.getElementById('chat-input').focus();
    }
    
    setupChatEnterKey() {
        // 只在初始化时设置一次Enter键监听
        document.getElementById('chat-input')?.addEventListener('keydown', (e) => {
            if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                this.sendChat();
            }
        });
    }
    
    hideChatOverlay() {
        document.getElementById('chat-overlay').style.display = 'none';
    }
    
    showLoadingOverlay(text = '加载中...') {
        document.getElementById('loading-overlay').style.display = 'flex';
        document.getElementById('loading-text').textContent = text;
    }
    
    hideLoadingOverlay() {
        document.getElementById('loading-overlay').style.display = 'none';
    }
    
    // ========== 登录流程 ==========
    
    async handleCreateCharacter() {
        const token = document.getElementById('gist-token').value.trim();
        const name = document.getElementById('player-name').value.trim();
        
        if (!token) {
            this.showToast('请输入GitHub Token', 'warning');
            return;
        }
        
        if (!name || name.length < 3 || name.length > 12) {
            this.showToast('角色名称需要3-12个字符', 'warning');
            return;
        }
        
        this.showLoadingOverlay('创建角色...');
        
        // 设置Token
        this.gistManager.setToken(token);
        
        // 创建角色
        this.playerName = name;
        this.currentPlayer = this.characterManager.createCharacter(name);
        
        // 设置初始位置在地图中央
        const centerX = (this.mapManager.width * this.cellSize) / 2 || 800;
        const centerY = (this.mapManager.height * this.cellSize) / 2 || 800;
        this.currentPlayer.setPosition(centerX, centerY);
        this.currentPlayer.initDisplayPosition();
        
        // 写入初始状态和位置
        await this.gistManager.writeStatus(this.playerName, this.currentPlayer.getStatus());
        await this.gistManager.writePosition(this.playerName, this.currentPlayer.getPosition());
        
        this.hideLoadingOverlay();
        this.showGameContainer();
        this.startGame();
    }
    
    async handleSelectCharacter() {
        const token = document.getElementById('gist-token').value.trim();
        
        if (!token) {
            this.showToast('请输入GitHub Token', 'warning');
            return;
        }
        
        this.showLoadingOverlay('获取角色列表...');
        
        this.gistManager.setToken(token);
        
        // 获取所有角色
        const statusData = await this.gistManager.readStatus();
        const characters = Object.keys(statusData.players || {});
        
        this.hideLoadingOverlay();
        
        if (characters.length === 0) {
            this.showToast('没有找到已存在的角色，请创建新角色', 'info');
            return;
        }
        
        this.showCharacterSelectOverlay(characters);
    }
    
    async selectCharacter(name) {
        this.showLoadingOverlay('加载角色...');
        
        this.playerName = name;
        
        // 获取角色状态和位置
        const statusData = await this.gistManager.readStatus();
        const positionData = await this.gistManager.readPosition();
        
        const status = statusData.players?.[name] || {};
        const position = positionData.positions?.[name] || { x: 100, y: 100, direction: 'down' };
        
        // 创建角色并设置状态
        this.currentPlayer = this.characterManager.createCharacter(name);
        this.currentPlayer.setStatus(status);
        this.currentPlayer.setPosition(position.x, position.y, position.direction);
        this.currentPlayer.initDisplayPosition();
        
        this.hideLoadingOverlay();
        this.showGameContainer();
        this.startGame();
    }
    
    // ========== 设置保存 ==========
    
    async saveSettings() {
        const newName = document.getElementById('setting-name').value.trim();
        const oldName = this.playerName;
        
        // 检查名称是否修改
        if (newName !== oldName) {
            if (!newName || newName.length < 3 || newName.length > 12) {
                this.showToast('角色名称需要3-12个字符', 'warning');
                return;
            }
            
            this.showLoadingOverlay('修改名称...');
            
            // 同步修改两个gist中的名字
            const success = await this.gistManager.changeName(oldName, newName);
            
            if (success) {
                this.playerName = newName;
                document.getElementById('current-player-name').textContent = newName;
            } else {
                this.showToast('修改名称失败', 'error');
                this.hideLoadingOverlay();
                return;
            }
        }
        
        // 更新刷新间隔
        this.refreshInterval = parseInt(document.getElementById('refresh-interval').value) || 200;
        
        // 更新角色状态
        const newStatus = {
            gender: document.getElementById('setting-gender').value,
            height: parseFloat(document.getElementById('setting-height').value),
            hairStyle: document.getElementById('setting-hair-style').value,
            hairColor: document.getElementById('setting-hair-color').value,
            clothingStyle: document.getElementById('setting-clothing-style').value,
            clothingColor: document.getElementById('setting-clothing-color').value,
            skinColor: document.getElementById('setting-skin-color').value,
            eyeColor: document.getElementById('setting-eye-color').value,
            accessories: []
        };
        
        // 获取选中的配饰
        const checkboxes = document.querySelectorAll('.checkbox-group input[type="checkbox"]:checked');
        checkboxes.forEach(cb => {
            newStatus.accessories.push(cb.value);
        });
        
        this.currentPlayer.setStatus(newStatus);
        
        // 写入状态gist
        await this.gistManager.writeStatus(this.playerName, this.currentPlayer.getStatus());
        
        // 重新设置定时器
        this.setupTimers();
        
        this.hideLoadingOverlay();
        this.hideSettingsOverlay();
        
        this.showToast('设置已保存', 'success');
    }
    
    // ========== 聊天功能 ==========
    
    async sendChat() {
        const message = document.getElementById('chat-input').value.trim();
        
        if (!message) {
            this.showToast('请输入消息内容', 'warning');
            return;
        }
        
        // 设置聊天消息
        this.currentPlayer.setChat(message, 10000); // 10秒
        
        // 写入状态gist
        await this.gistManager.writeStatus(this.playerName, this.currentPlayer.getStatus());
        
        this.hideChatOverlay();
        document.getElementById('chat-input').value = '';
    }
    
    async cancelChat() {
        // 清除聊天消息
        this.currentPlayer.clearChat();
        
        // 写入状态gist
        await this.gistManager.writeStatus(this.playerName, this.currentPlayer.getStatus());
        
        this.hideChatOverlay();
    }
    
    // ========== 游戏循环 ==========
    
    startGame() {
        this.isRunning = true;
        this.lastTime = 0;
        
        // 预渲染默认地图（确保地图能显示）
        this.mapManager.loadDefaultMap();
        
        // 尝试加载在线地图（如果已配置）
        this.loadMap();
        
        // 设置定时器
        this.setupTimers();
        
        // 开始游戏循环
        requestAnimationFrame((ts) => this.gameLoop(ts));
    }
    
    setupTimers() {
        // 清除旧的定时器
        if (this.positionWriteTimer) clearInterval(this.positionWriteTimer);
        if (this.positionReadTimer) clearInterval(this.positionReadTimer);
        if (this.statusReadTimer) clearInterval(this.statusReadTimer);
        
        // 位置写入定时器
        this.positionWriteTimer = setInterval(() => {
            if (this.currentPlayer && this.currentPlayer.hasMoved) {
                this.gistManager.writePosition(this.playerName, this.currentPlayer.getPosition());
                this.currentPlayer.hasMoved = false;
            }
        }, this.refreshInterval);
        
        // 位置读取定时器
        this.positionReadTimer = setInterval(() => {
            this.syncOtherPlayersPosition();
        }, this.refreshInterval);
        
        // 状态读取定时器
        this.statusReadTimer = setInterval(() => {
            this.syncOtherPlayersStatus();
        }, this.refreshInterval);
    }
    
    async loadMap() {
        const mapData = await this.gistManager.readMap();
        this.mapManager.loadMap(mapData);
    }
    
    gameLoop(timestamp) {
        if (!this.isRunning) return;
        
        if (!this.lastTime) this.lastTime = timestamp;
        const deltaTime = timestamp - this.lastTime;
        this.lastTime = timestamp;
        
        this.update(deltaTime);
        this.render();
        
        requestAnimationFrame((ts) => this.gameLoop(ts));
    }
    
    update(deltaTime) {
        // 更新当前玩家位置
        this.updateCurrentPlayerPosition(deltaTime);
        
        // 更新相机位置（跟随当前玩家）
        this.updateCamera();
        
        // 更新其他玩家状态
        this.characterManager.updateOtherPlayers(this.otherPlayers, deltaTime);
    }
    
    updateCurrentPlayerPosition(deltaTime) {
        if (!this.currentPlayer) return;
        
        const speed = 150; // 移动速度：150像素/秒
        let dx = 0, dy = 0;
        
        // 轮盘控制（优先）
        if (this.joystick.active && (Math.abs(this.joystick.dx) > 0.1 || Math.abs(this.joystick.dy) > 0.1)) {
            dx = this.joystick.dx * speed * deltaTime / 1000;
            dy = this.joystick.dy * speed * deltaTime / 1000;
        }
        
        // 键盘控制（轮盘未激活时）
        if (!this.joystick.active || (Math.abs(this.joystick.dx) < 0.1 && Math.abs(this.joystick.dy) < 0.1)) {
            if (this.keys.up) dy -= speed * deltaTime / 1000;
            if (this.keys.down) dy += speed * deltaTime / 1000;
            if (this.keys.left) dx -= speed * deltaTime / 1000;
            if (this.keys.right) dx += speed * deltaTime / 1000;
        }
        
        // 更新位置
        if (dx !== 0 || dy !== 0) {
            const newX = this.currentPlayer.x + dx;
            const newY = this.currentPlayer.y + dy;
            
            // 碰撞检测（检查四个角点）
            const radius = 10; // 角色半径
            const canMove = 
                this.mapManager.isWalkable(newX - radius, newY - radius) &&
                this.mapManager.isWalkable(newX + radius, newY - radius) &&
                this.mapManager.isWalkable(newX - radius, newY + radius) &&
                this.mapManager.isWalkable(newX + radius, newY + radius);
            
            if (canMove) {
                // 更新逻辑位置
                this.currentPlayer.setPosition(newX, newY);
                this.currentPlayer.hasMoved = true;
                
                // 更新朝向（根据移动方向）
                if (Math.abs(dx) > Math.abs(dy)) {
                    this.currentPlayer.direction = dx > 0 ? 'right' : 'left';
                } else if (Math.abs(dy) > Math.abs(dx)) {
                    this.currentPlayer.direction = dy > 0 ? 'down' : 'up';
                }
            } else {
                // 碰撞时尝试滑动（沿墙滑动）
                if (this.mapManager.isWalkable(newX, this.currentPlayer.y)) {
                    this.currentPlayer.setPosition(newX, this.currentPlayer.y);
                    this.currentPlayer.hasMoved = true;
                    this.currentPlayer.direction = dx > 0 ? 'right' : 'left';
                } else if (this.mapManager.isWalkable(this.currentPlayer.x, newY)) {
                    this.currentPlayer.setPosition(this.currentPlayer.x, newY);
                    this.currentPlayer.hasMoved = true;
                    this.currentPlayer.direction = dy > 0 ? 'down' : 'up';
                }
            }
        }
        
        // 平滑更新显示位置
        const smoothFactor = 0.3; // 平滑系数
        this.currentPlayer.displayX += (this.currentPlayer.x - this.currentPlayer.displayX) * smoothFactor;
        this.currentPlayer.displayY += (this.currentPlayer.y - this.currentPlayer.displayY) * smoothFactor;
    }
    
    updateCamera() {
        if (!this.currentPlayer) return;
        
        // 使用显示位置实现平滑相机跟随
        const renderX = this.currentPlayer.displayX || this.currentPlayer.x;
        const renderY = this.currentPlayer.displayY || this.currentPlayer.y;
        
        // 以当前玩家为中心
        this.camera.x = renderX - this.canvas.width / 2;
        this.camera.y = renderY - this.canvas.height / 2;
        
        // 限制相机边界
        const mapWidth = this.mapManager.width * this.cellSize;
        const mapHeight = this.mapManager.height * this.cellSize;
        
        this.camera.x = Math.max(0, Math.min(this.camera.x, mapWidth - this.canvas.width));
        this.camera.y = Math.max(0, Math.min(this.camera.y, mapHeight - this.canvas.height));
    }
    
render() {
        const time = this.lastTime || Date.now();
        
        this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
        
        this.mapManager.render(this.ctx, this.camera);
        
        this.otherPlayers.forEach(player => {
            this.characterManager.renderCharacter(this.ctx, player, this.camera, false, time);
        });
        
        if (this.currentPlayer) {
            this.characterManager.renderCharacter(this.ctx, this.currentPlayer, this.camera, true, time);
        }
        
        if (this.showDebug) {
            this.renderDebugInfo();
        }
    }
        
        // 调试信息（按F3显示）
        if (this.showDebug) {
            this.renderDebugInfo();
        }
    }
    
    // 调试信息渲染
    renderDebugInfo() {
        this.ctx.fillStyle = 'rgba(0,0,0,0.7)';
        this.ctx.fillRect(10, 10, 200, 100);
        this.ctx.fillStyle = '#fff';
        this.ctx.font = '12px Arial';
        this.ctx.fillText(`玩家: ${this.playerName}`, 20, 30);
        this.ctx.fillText(`位置: (${Math.round(this.currentPlayer?.x || 0)}, ${Math.round(this.currentPlayer?.y || 0)})`, 20, 50);
        this.ctx.fillText(`相机: (${Math.round(this.camera.x)}, ${Math.round(this.camera.y)})`, 20, 70);
        this.ctx.fillText(`地图预渲染: ${this.mapManager.prerendered}`, 20, 90);
    }
    
    // F3键切换调试信息
    setupDebugMode() {
        this.showDebug = false;
        document.addEventListener('keydown', (e) => {
            if (e.key === 'F3') {
                e.preventDefault();
                this.showDebug = !this.showDebug;
            }
        });
    }
    
    // ========== 数据同步 ==========
    
    async syncOtherPlayersPosition() {
        const positionData = await this.gistManager.readPosition();
        
        if (!positionData.positions) return;
        
        Object.keys(positionData.positions).forEach(name => {
            if (name === this.playerName) return; // 跳过自己
            
            const pos = positionData.positions[name];
            const now = Date.now();
            
            // 检查是否过期（10秒未更新）
            if (now - pos.lastUpdate > 10000) {
                this.otherPlayers.delete(name);
                return;
            }
            
            // 更新或创建其他玩家
            if (!this.otherPlayers.has(name)) {
                this.otherPlayers.set(name, this.characterManager.createCharacter(name));
            }
            
            const player = this.otherPlayers.get(name);
            player.setPosition(pos.x, pos.y, pos.direction);
        });
        
        // 更新在线人数
        document.getElementById('player-count').textContent = `在线: ${this.otherPlayers.size + 1}`;
    }
    
    async syncOtherPlayersStatus() {
        const statusData = await this.gistManager.readStatus();
        
        if (!statusData.players) return;
        
        Object.keys(statusData.players).forEach(name => {
            if (name === this.playerName) return; // 跳过自己
            
            const status = statusData.players[name];
            
            if (this.otherPlayers.has(name)) {
                const player = this.otherPlayers.get(name);
                player.setStatus(status);
                
                // 处理聊天消息
                if (status.chatMessage && status.chatExpiry > Date.now()) {
                    player.setChat(status.chatMessage, status.chatExpiry - Date.now());
                } else {
                    player.clearChat();
                }
            }
        });
    }
    
    forceRefresh() {
        // 强制刷新所有数据
        this.syncOtherPlayersPosition();
        this.syncOtherPlayersStatus();
        this.loadMap();
    }
}

// 启动游戏
window.addEventListener('DOMContentLoaded', () => {
    window.game = new GoodMorningGame();
});