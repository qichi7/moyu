/**
 * CharacterManager - 角色管理
 * 管理角色的创建、状态、绘制
 */

// ========== 状态默认值 ==========

const DEFAULT_STATUS = {
    gender: 'male',           // 性别：male/female
    height: 1.0,              // 身高比例：0.8-1.2
    hairStyle: 'short',       // 发型：short/long/curly/ponytail/bald/spiky
    hairColor: '#333333',     // 发色：十六进制颜色
    clothingStyle: 'casual',  // 衣服样式：casual/formal/sporty/hoodie/dress
    clothingColor: '#3498db', // 衣服颜色：十六进制颜色
    skinColor: '#f5d0c5',     // 肤色：十六进制颜色
    eyeColor: '#4a4a4a',      // 眼睛颜色
    accessories: [],          // 配饰：glasses/hat/watch/earring/necklace/backpack
    chatMessage: '',          // 聊天消息
    chatExpiry: 0,            // 聊天过期时间戳
    lastUpdate: Date.now()    // 最后更新时间
};

const DEFAULT_POSITION = {
    x: 100,
    y: 100,
    direction: 'down',        // 朝向：up/down/left/right
    lastUpdate: Date.now()
};

// ========== 获取带默认值的状态 ==========

function getStatusWithDefaults(status) {
    if (!status) return { ...DEFAULT_STATUS };
    
    return {
        gender: status.gender || DEFAULT_STATUS.gender,
        height: parseFloat(status.height) || DEFAULT_STATUS.height,
        hairStyle: status.hairStyle || DEFAULT_STATUS.hairStyle,
        hairColor: status.hairColor || DEFAULT_STATUS.hairColor,
        clothingStyle: status.clothingStyle || DEFAULT_STATUS.clothingStyle,
        clothingColor: status.clothingColor || DEFAULT_STATUS.clothingColor,
        skinColor: status.skinColor || DEFAULT_STATUS.skinColor,
        eyeColor: status.eyeColor || DEFAULT_STATUS.eyeColor,
        accessories: Array.isArray(status.accessories) ? status.accessories : DEFAULT_STATUS.accessories,
        chatMessage: status.chatMessage || DEFAULT_STATUS.chatMessage,
        chatExpiry: status.chatExpiry || DEFAULT_STATUS.chatExpiry,
        lastUpdate: status.lastUpdate || Date.now()
    };
}

function getPositionWithDefaults(position) {
    if (!position) return { ...DEFAULT_POSITION };
    
    return {
        x: parseFloat(position.x) || DEFAULT_POSITION.x,
        y: parseFloat(position.y) || DEFAULT_POSITION.y,
        direction: position.direction || DEFAULT_POSITION.direction,
        lastUpdate: position.lastUpdate || Date.now()
    };
}

// ========== Character类 ==========

class Character {
    constructor(name) {
        this.name = name;
        
        // 位置
        this.x = DEFAULT_POSITION.x;
        this.y = DEFAULT_POSITION.y;
        this.direction = DEFAULT_POSITION.direction;
        this.displayX = this.x;
        this.displayY = this.y;
        
        // 状态（使用默认值）
        this.gender = DEFAULT_STATUS.gender;
        this.height = DEFAULT_STATUS.height;
        this.hairStyle = DEFAULT_STATUS.hairStyle;
        this.hairColor = DEFAULT_STATUS.hairColor;
        this.clothingStyle = DEFAULT_STATUS.clothingStyle;
        this.clothingColor = DEFAULT_STATUS.clothingColor;
        this.skinColor = DEFAULT_STATUS.skinColor;
        this.eyeColor = DEFAULT_STATUS.eyeColor;
        this.accessories = DEFAULT_STATUS.accessories;
        
        // 聊天
        this.chatMessage = '';
        this.chatExpiry = 0;
        this.chatTimeout = null;
        
        // 其他
        this.hasMoved = false;
        this.lastUpdate = Date.now();
    }
    
    // 设置状态（带默认值）
    setStatus(status) {
        const fullStatus = getStatusWithDefaults(status);
        
        this.gender = fullStatus.gender;
        this.height = fullStatus.height;
        this.hairStyle = fullStatus.hairStyle;
        this.hairColor = fullStatus.hairColor;
        this.clothingStyle = fullStatus.clothingStyle;
        this.clothingColor = fullStatus.clothingColor;
        this.skinColor = fullStatus.skinColor;
        this.eyeColor = fullStatus.eyeColor;
        this.accessories = fullStatus.accessories;
        
        if (fullStatus.chatMessage && fullStatus.chatExpiry > Date.now()) {
            this.setChat(fullStatus.chatMessage, fullStatus.chatExpiry - Date.now());
        }
        
        this.lastUpdate = Date.now();
    }
    
    // 获取状态
    getStatus() {
        return {
            gender: this.gender,
            height: this.height,
            hairStyle: this.hairStyle,
            hairColor: this.hairColor,
            clothingStyle: this.clothingStyle,
            clothingColor: this.clothingColor,
            skinColor: this.skinColor,
            eyeColor: this.eyeColor,
            accessories: this.accessories,
            chatMessage: this.chatMessage,
            chatExpiry: this.chatExpiry,
            lastUpdate: this.lastUpdate
        };
    }
    
    // 设置位置
    setPosition(x, y, direction = null) {
        this.x = x;
        this.y = y;
        // 始终同步显示位置（修复：首次设置也要同步）
        this.displayX = x;
        this.displayY = y;
        if (direction) this.direction = direction;
        this.lastUpdate = Date.now();
    }
    
    // 初始化显示位置（确保调用）
    initDisplayPosition() {
        this.displayX = this.x;
        this.displayY = this.y;
    }
    
    // 获取位置
    getPosition() {
        return {
            x: this.x,
            y: this.y,
            direction: this.direction,
            lastUpdate: this.lastUpdate
        };
    }
    
    // 设置聊天
    setChat(message, duration = 10000) {
        this.chatMessage = message;
        this.chatExpiry = Date.now() + duration;
        
        // 清除之前的定时器
        if (this.chatTimeout) {
            clearTimeout(this.chatTimeout);
        }
        
        // 设置过期定时器
        this.chatTimeout = setTimeout(() => {
            this.clearChat();
        }, duration);
    }
    
    // 清除聊天
    clearChat() {
        this.chatMessage = '';
        this.chatExpiry = 0;
        
        if (this.chatTimeout) {
            clearTimeout(this.chatTimeout);
            this.chatTimeout = null;
        }
    }
    
    // 是否有聊天消息显示
    hasChat() {
        return this.chatMessage && this.chatExpiry > Date.now();
    }
}

// ========== CharacterManager类 ==========

class CharacterManager {
    constructor(game) {
        this.game = game;
        
        // 角色基础尺寸
        this.baseWidth = 32;
        this.baseHeight = 48;
    }
    
    // 创建角色
    createCharacter(name) {
        return new Character(name);
    }
    
    // 更新其他玩家
    updateOtherPlayers(players, deltaTime) {
        players.forEach(player => {
            // 平滑移动：使用displayX/displayY
            const smoothFactor = 0.2; // 平滑系数
            player.displayX += (player.x - player.displayX) * smoothFactor;
            player.displayY += (player.y - player.displayY) * smoothFactor;
        });
    }
    
    // 渲染角色
    renderCharacter(ctx, character, camera, isCurrentPlayer) {
        // 使用displayX/displayY实现平滑移动
        const renderX = character.displayX || character.x;
        const renderY = character.displayY || character.y;
        
        // 计算屏幕位置
        const screenX = renderX - camera.x;
        const screenY = renderY - camera.y;
        
        // 检查是否在视口内
        if (screenX < -50 || screenX > ctx.canvas.width + 50 ||
            screenY < -50 || screenY > ctx.canvas.height + 50) {
            return; // 超出视口，不渲染
        }
        
        // 应用身高比例
        const scale = character.height;
        const width = this.baseWidth * scale;
        const height = this.baseHeight * scale;
        
        // 绘制角色
        this.drawCharacterBody(ctx, screenX, screenY, width, height, character, isCurrentPlayer);
        
        // 绘制名字
        this.drawName(ctx, screenX, screenY + height / 2 + 10, character.name, isCurrentPlayer);
        
        // 绘制聊天气泡
        if (character.hasChat()) {
            this.drawChatBubble(ctx, screenX, screenY - height / 2 - 30, character.chatMessage);
        }
    }
    
    // 绘制角色身体
    drawCharacterBody(ctx, x, y, width, height, character, isCurrentPlayer) {
        ctx.save();
        ctx.translate(x, y);
        
        // 绘制顺序：头发 -> 脸 -> 身体 -> 衣服 -> 配饰
        
        // 1. 绘制头发
        this.drawHair(ctx, width, height, character);
        
        // 2. 绘制脸部
        this.drawFace(ctx, width, height, character);
        
        // 3. 绘制身体和衣服
        this.drawBody(ctx, width, height, character);
        
        // 4. 绘制配饰
        this.drawAccessories(ctx, width, height, character);
        
        // 5. 当前玩家高亮效果
        if (isCurrentPlayer) {
            ctx.strokeStyle = '#ffeb3b';
            ctx.lineWidth = 2;
            ctx.beginPath();
            ctx.arc(0, 0, width / 2 + 5, 0, Math.PI * 2);
            ctx.stroke();
        }
        
        ctx.restore();
    }
    
    // 绘制头发
    drawHair(ctx, width, height, character) {
        const hairColor = character.hairColor;
        ctx.fillStyle = hairColor;
        
        const headRadius = width * 0.4;
        const headY = -height * 0.2;
        
        switch (character.hairStyle) {
            case 'short':
                // 短发：顶部一小块
                ctx.beginPath();
                ctx.arc(0, headY - headRadius * 0.2, headRadius * 0.8, Math.PI, 0, false);
                ctx.fill();
                break;
                
            case 'long':
                // 长发：覆盖整个头部和部分身体
                ctx.beginPath();
                ctx.ellipse(0, headY, headRadius * 1.1, headRadius * 1.3, 0, 0, Math.PI * 2);
                ctx.fill();
                
                // 发尾
                ctx.fillRect(-headRadius * 0.8, headY + headRadius * 0.5, headRadius * 1.6, height * 0.3);
                break;
                
            case 'curly':
                // 卷发：多个小圆圈
                for (let i = -3; i <= 3; i++) {
                    ctx.beginPath();
                    ctx.arc(i * headRadius * 0.25, headY - headRadius * 0.3 + Math.abs(i) * 0.1, headRadius * 0.2, 0, Math.PI * 2);
                    ctx.fill();
                }
                break;
                
            case 'ponytail':
                // 马尾：顶部头发 + 后面马尾
                ctx.beginPath();
                ctx.arc(0, headY - headRadius * 0.2, headRadius * 0.8, Math.PI, 0, false);
                ctx.fill();
                
                // 马尾辫
                ctx.beginPath();
                ctx.moveTo(0, headY - headRadius * 0.5);
                ctx.quadraticCurveTo(headRadius * 0.5, headY + headRadius, 0, headY + height * 0.3);
                ctx.lineTo(-headRadius * 0.2, headY + height * 0.3);
                ctx.quadraticCurveTo(-headRadius * 0.3, headY + headRadius, 0, headY - headRadius * 0.5);
                ctx.fill();
                break;
                
            case 'bald':
                // 光头：不画头发
                break;
                
            case 'spiky':
                // 刺头：多个尖角
                for (let i = -2; i <= 2; i++) {
                    ctx.beginPath();
                    ctx.moveTo(i * headRadius * 0.3, headY);
                    ctx.lineTo(i * headRadius * 0.3 - headRadius * 0.15, headY - headRadius * 0.8);
                    ctx.lineTo(i * headRadius * 0.3 + headRadius * 0.15, headY - headRadius * 0.8);
                    ctx.closePath();
                    ctx.fill();
                }
                break;
        }
    }
    
    // 绘制脸部
    drawFace(ctx, width, height, character) {
        const skinColor = character.skinColor;
        const eyeColor = character.eyeColor;
        
        const headRadius = width * 0.4;
        const headY = -height * 0.2;
        
        // 脸部（椭圆）
        ctx.fillStyle = skinColor;
        ctx.beginPath();
        ctx.ellipse(0, headY, headRadius, headRadius * 1.1, 0, 0, Math.PI * 2);
        ctx.fill();
        ctx.strokeStyle = '#333';
        ctx.lineWidth = 1;
        ctx.stroke();
        
        // 眼睛
        const eyeY = headY - headRadius * 0.1;
        const eyeOffsetX = headRadius * 0.3;
        const eyeRadius = headRadius * 0.12;
        
        ctx.fillStyle = '#fff';
        ctx.beginPath();
        ctx.ellipse(-eyeOffsetX, eyeY, eyeRadius * 1.2, eyeRadius, 0, 0, Math.PI * 2);
        ctx.ellipse(eyeOffsetX, eyeY, eyeRadius * 1.2, eyeRadius, 0, 0, Math.PI * 2);
        ctx.fill();
        
        ctx.fillStyle = eyeColor;
        ctx.beginPath();
        ctx.arc(-eyeOffsetX, eyeY, eyeRadius * 0.6, 0, Math.PI * 2);
        ctx.arc(eyeOffsetX, eyeY, eyeRadius * 0.6, 0, Math.PI * 2);
        ctx.fill();
        
        // 嘴巴
        const mouthY = headY + headRadius * 0.3;
        ctx.strokeStyle = '#333';
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.moveTo(-headRadius * 0.2, mouthY);
        ctx.quadraticCurveTo(0, mouthY + headRadius * 0.1, headRadius * 0.2, mouthY);
        ctx.stroke();
    }
    
    // 绘制身体和衣服
    drawBody(ctx, width, height, character) {
        const clothingColor = character.clothingColor;
        ctx.fillStyle = clothingColor;
        
        const bodyWidth = width * 0.6;
        const bodyHeight = height * 0.4;
        const bodyY = height * 0.1;
        
        switch (character.clothingStyle) {
            case 'casual':
                // 休闲装：T恤
                ctx.fillRect(-bodyWidth / 2, bodyY, bodyWidth, bodyHeight);
                ctx.strokeStyle = '#333';
                ctx.strokeRect(-bodyWidth / 2, bodyY, bodyWidth, bodyHeight);
                
                // 裤子
                ctx.fillStyle = '#555';
                ctx.fillRect(-bodyWidth / 2, bodyY + bodyHeight, bodyWidth * 0.4, height * 0.3);
                ctx.fillRect(bodyWidth / 2 - bodyWidth * 0.4, bodyY + bodyHeight, bodyWidth * 0.4, height * 0.3);
                break;
                
            case 'formal':
                // 正装：西装
                ctx.fillRect(-bodyWidth / 2, bodyY, bodyWidth, bodyHeight);
                
                // 西装领子
                ctx.fillStyle = '#222';
                ctx.beginPath();
                ctx.moveTo(-bodyWidth / 2, bodyY);
                ctx.lineTo(-bodyWidth * 0.2, bodyY + bodyHeight * 0.2);
                ctx.lineTo(0, bodyY);
                ctx.lineTo(bodyWidth * 0.2, bodyY + bodyHeight * 0.2);
                ctx.lineTo(bodyWidth / 2, bodyY);
                ctx.closePath();
                ctx.fill();
                
                // 衬衫领子
                ctx.fillStyle = '#fff';
                ctx.beginPath();
                ctx.moveTo(-bodyWidth * 0.1, bodyY);
                ctx.lineTo(0, bodyY + bodyHeight * 0.15);
                ctx.lineTo(bodyWidth * 0.1, bodyY);
                ctx.closePath();
                ctx.fill();
                
                // 裤子
                ctx.fillStyle = '#222';
                ctx.fillRect(-bodyWidth / 2, bodyY + bodyHeight, bodyWidth * 0.4, height * 0.3);
                ctx.fillRect(bodyWidth / 2 - bodyWidth * 0.4, bodyY + bodyHeight, bodyWidth * 0.4, height * 0.3);
                break;
                
            case 'sporty':
                // 运动装：运动服
                ctx.fillRect(-bodyWidth / 2, bodyY, bodyWidth, bodyHeight);
                
                // 运动服条纹
                ctx.fillStyle = '#fff';
                ctx.fillRect(-bodyWidth * 0.1, bodyY, bodyWidth * 0.2, bodyHeight);
                
                // 运动裤
                ctx.fillStyle = clothingColor;
                ctx.fillRect(-bodyWidth / 2, bodyY + bodyHeight, bodyWidth, height * 0.3);
                ctx.fillStyle = '#fff';
                ctx.fillRect(-bodyWidth / 2, bodyY + bodyHeight, bodyWidth, height * 0.1);
                break;
                
            case 'hoodie':
                // 卫衣：连帽衫
                ctx.fillRect(-bodyWidth / 2, bodyY, bodyWidth, bodyHeight);
                
                // 帽子
                ctx.fillStyle = clothingColor;
                ctx.beginPath();
                ctx.arc(0, bodyY - height * 0.05, bodyWidth * 0.4, Math.PI, 0, false);
                ctx.fill();
                
                // 口袋
                ctx.fillStyle = '#333';
                ctx.beginPath();
                ctx.moveTo(-bodyWidth * 0.3, bodyY + bodyHeight * 0.5);
                ctx.quadraticCurveTo(0, bodyY + bodyHeight * 0.7, bodyWidth * 0.3, bodyY + bodyHeight * 0.5);
                ctx.quadraticCurveTo(0, bodyY + bodyHeight * 0.5, -bodyWidth * 0.3, bodyY + bodyHeight * 0.5);
                ctx.fill();
                
                // 裤子
                ctx.fillStyle = '#555';
                ctx.fillRect(-bodyWidth / 2, bodyY + bodyHeight, bodyWidth * 0.4, height * 0.3);
                ctx.fillRect(bodyWidth / 2 - bodyWidth * 0.4, bodyY + bodyHeight, bodyWidth * 0.4, height * 0.3);
                break;
                
            case 'dress':
                // 连衣裙（女性）
                ctx.beginPath();
                ctx.moveTo(-bodyWidth / 2, bodyY);
                ctx.lineTo(bodyWidth / 2, bodyY);
                ctx.lineTo(bodyWidth * 0.8, bodyY + height * 0.5);
                ctx.lineTo(-bodyWidth * 0.8, bodyY + height * 0.5);
                ctx.closePath();
                ctx.fill();
                
                // 裙子装饰线
                ctx.strokeStyle = '#333';
                ctx.lineWidth = 1;
                ctx.stroke();
                break;
        }
        
        // 根据性别调整身体宽度
        if (character.gender === 'female') {
            // 女性身体更窄
            ctx.save();
            ctx.scale(0.85, 1);
            // 重新绘制会覆盖之前的内容...
            ctx.restore();
        }
    }
    
    // 绘制配饰
    drawAccessories(ctx, width, height, character) {
        const accessories = character.accessories;
        
        const headRadius = width * 0.4;
        const headY = -height * 0.2;
        const bodyWidth = width * 0.6;
        const bodyY = height * 0.1;
        
        accessories.forEach(acc => {
            switch (acc) {
                case 'glasses':
                    // 眼镜
                    const eyeY = headY - headRadius * 0.1;
                    const eyeOffsetX = headRadius * 0.3;
                    
                    ctx.strokeStyle = '#333';
                    ctx.lineWidth = 2;
                    
                    // 左镜框
                    ctx.beginPath();
                    ctx.rect(-eyeOffsetX - headRadius * 0.2, eyeY - headRadius * 0.1, headRadius * 0.4, headRadius * 0.2);
                    ctx.stroke();
                    
                    // 右镜框
                    ctx.beginPath();
                    ctx.rect(eyeOffsetX - headRadius * 0.2, eyeY - headRadius * 0.1, headRadius * 0.4, headRadius * 0.2);
                    ctx.stroke();
                    
                    // 鼻梁
                    ctx.beginPath();
                    ctx.moveTo(-eyeOffsetX + headRadius * 0.2, eyeY);
                    ctx.lineTo(eyeOffsetX - headRadius * 0.2, eyeY);
                    ctx.stroke();
                    
                    // 镜腿
                    ctx.beginPath();
                    ctx.moveTo(-eyeOffsetX - headRadius * 0.2, eyeY);
                    ctx.lineTo(-headRadius, eyeY);
                    ctx.moveTo(eyeOffsetX + headRadius * 0.2, eyeY);
                    ctx.lineTo(headRadius, eyeY);
                    ctx.stroke();
                    break;
                    
                case 'hat':
                    // 帽子
                    ctx.fillStyle = '#333';
                    
                    // 帽顶
                    ctx.beginPath();
                    ctx.arc(0, headY - headRadius * 0.8, headRadius * 0.6, 0, Math.PI * 2);
                    ctx.fill();
                    
                    // 帽檐
                    ctx.beginPath();
                    ctx.ellipse(0, headY - headRadius * 0.5, headRadius * 1.2, headRadius * 0.2, 0, 0, Math.PI * 2);
                    ctx.fill();
                    break;
                    
                case 'watch':
                    // 手表（手腕位置）
                    const watchY = bodyY + height * 0.25;
                    
                    ctx.fillStyle = '#gold';
                    ctx.strokeStyle = '#333';
                    ctx.lineWidth = 1;
                    
                    // 表盘
                    ctx.beginPath();
                    ctx.arc(-bodyWidth * 0.5, watchY, width * 0.08, 0, Math.PI * 2);
                    ctx.fill();
                    ctx.stroke();
                    break;
                    
                case 'earring':
                    // 耳环
                    ctx.fillStyle = '#gold';
                    
                    // 左耳环
                    ctx.beginPath();
                    ctx.arc(-headRadius, headY, width * 0.03, 0, Math.PI * 2);
                    ctx.fill();
                    
                    // 右耳环
                    ctx.beginPath();
                    ctx.arc(headRadius, headY, width * 0.03, 0, Math.PI * 2);
                    ctx.fill();
                    break;
                    
                case 'necklace':
                    // 项链
                    ctx.strokeStyle = '#gold';
                    ctx.lineWidth = 2;
                    
                    ctx.beginPath();
                    ctx.moveTo(-bodyWidth * 0.3, bodyY);
                    ctx.quadraticCurveTo(0, bodyY + height * 0.1, bodyWidth * 0.3, bodyY);
                    ctx.stroke();
                    
                    // 吊坠
                    ctx.fillStyle = '#gold';
                    ctx.beginPath();
                    ctx.arc(0, bodyY + height * 0.1, width * 0.04, 0, Math.PI * 2);
                    ctx.fill();
                    break;
                    
                case 'backpack':
                    // 背包（在身体后面）
                    ctx.fillStyle = '#8B4513';
                    ctx.fillRect(-bodyWidth * 0.6, bodyY, bodyWidth * 0.15, bodyHeight * 0.8);
                    
                    // 背包带
                    ctx.strokeStyle = '#8B4513';
                    ctx.lineWidth = 3;
                    ctx.beginPath();
                    ctx.moveTo(-bodyWidth * 0.5, bodyY);
                    ctx.lineTo(-bodyWidth * 0.3, bodyY);
                    ctx.stroke();
                    break;
            }
        });
    }
    
    // 绘制名字标签
    drawName(ctx, x, y, name, isCurrentPlayer) {
        ctx.font = 'bold 14px Arial';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        
        // 文字宽度
        const textWidth = ctx.measureText(name).width;
        const padding = 6;
        
        // 背景
        ctx.fillStyle = isCurrentPlayer ? '#ffeb3b' : 'rgba(0, 0, 0, 0.6)';
        ctx.beginPath();
        ctx.roundRect(x - textWidth / 2 - padding, y - 10, textWidth + padding * 2, 20, 5);
        ctx.fill();
        
        // 文字
        ctx.fillStyle = isCurrentPlayer ? '#333' : '#fff';
        ctx.fillText(name, x, y);
    }
    
    // 绘制聊天气泡
    drawChatBubble(ctx, x, y, message) {
        ctx.font = '14px Arial';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        
        // 文字宽度
        const textWidth = ctx.measureText(message).width;
        const padding = 10;
        const bubbleWidth = Math.min(textWidth + padding * 2, 150);
        const bubbleHeight = 30;
        
        // 气泡背景
        ctx.fillStyle = 'rgba(255, 255, 255, 0.9)';
        ctx.strokeStyle = '#333';
        ctx.lineWidth = 2;
        
        ctx.beginPath();
        ctx.roundRect(x - bubbleWidth / 2, y - bubbleHeight / 2, bubbleWidth, bubbleHeight, 10);
        ctx.fill();
        ctx.stroke();
        
        // 气泡尾巴
        ctx.fillStyle = 'rgba(255, 255, 255, 0.9)';
        ctx.beginPath();
        ctx.moveTo(x - 10, y + bubbleHeight / 2);
        ctx.lineTo(x, y + bubbleHeight / 2 + 15);
        ctx.lineTo(x + 10, y + bubbleHeight / 2);
        ctx.closePath();
        ctx.fill();
        ctx.stroke();
        
        // 文字
        ctx.fillStyle = '#333';
        ctx.fillText(message, x, y);
    }
}

// 导出默认值函数供其他模块使用
window.getStatusWithDefaults = getStatusWithDefaults;
window.getPositionWithDefaults = getPositionWithDefaults;
window.DEFAULT_STATUS = DEFAULT_STATUS;
window.DEFAULT_POSITION = DEFAULT_POSITION;