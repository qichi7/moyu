const DEFAULT_STATUS = {
    gender: 'male',
    height: 1.0,
    hairStyle: 'short',
    hairColor: '#333333',
    clothingStyle: 'casual',
    clothingColor: '#3498db',
    skinColor: '#f5d0c5',
    eyeColor: '#4a4a4a',
    accessories: [],
    chatMessage: '',
    chatExpiry: 0,
    lastUpdate: Date.now()
};

const DEFAULT_POSITION = {
    x: 100,
    y: 100,
    direction: 'down',
    lastUpdate: Date.now()
};

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

class Character {
    constructor(name) {
        this.name = name;
        
        this.x = DEFAULT_POSITION.x;
        this.y = DEFAULT_POSITION.y;
        this.direction = DEFAULT_POSITION.direction;
        this.displayX = this.x;
        this.displayY = this.y;
        
        this.gender = DEFAULT_STATUS.gender;
        this.height = DEFAULT_STATUS.height;
        this.hairStyle = DEFAULT_STATUS.hairStyle;
        this.hairColor = DEFAULT_STATUS.hairColor;
        this.clothingStyle = DEFAULT_STATUS.clothingStyle;
        this.clothingColor = DEFAULT_STATUS.clothingColor;
        this.skinColor = DEFAULT_STATUS.skinColor;
        this.eyeColor = DEFAULT_STATUS.eyeColor;
        this.accessories = DEFAULT_STATUS.accessories;
        
        this.chatMessage = '';
        this.chatExpiry = 0;
        this.chatTimeout = null;
        
        this.hasMoved = false;
        this.lastUpdate = Date.now();
        
        this.blinkTimer = 0;
        this.isBlinking = false;
        this.blinkTimeout = null;
        this.breathePhase = 0;
    }
    
    destroy() {
        if (this.chatTimeout) {
            clearTimeout(this.chatTimeout);
            this.chatTimeout = null;
        }
        if (this.blinkTimeout) {
            clearTimeout(this.blinkTimeout);
            this.blinkTimeout = null;
        }
    }
    
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
    
    setPosition(x, y, direction = null) {
        this.x = x;
        this.y = y;
        // 不重置displayX/displayY，保持平滑移动效果
        if (direction) this.direction = direction;
        this.lastUpdate = Date.now();
    }
    
    // 强制同步显示位置（用于初始化或特殊场景）
    syncDisplayPosition() {
        this.displayX = this.x;
        this.displayY = this.y;
    }
    
    initDisplayPosition() {
        this.syncDisplayPosition();
    }
    
    getPosition() {
        return {
            x: this.x,
            y: this.y,
            direction: this.direction,
            lastUpdate: this.lastUpdate
        };
    }
    
    setChat(message, duration = 10000) {
        this.chatMessage = message;
        this.chatExpiry = Date.now() + duration;
        
        if (this.chatTimeout) {
            clearTimeout(this.chatTimeout);
        }
        
        this.chatTimeout = setTimeout(() => {
            this.clearChat();
        }, duration);
    }
    
    clearChat() {
        this.chatMessage = '';
        this.chatExpiry = 0;
        
        if (this.chatTimeout) {
            clearTimeout(this.chatTimeout);
            this.chatTimeout = null;
        }
    }
    
    hasChat() {
        return this.chatMessage && this.chatExpiry > Date.now();
    }
    
    updateAnimations(deltaTime) {
        this.blinkTimer += deltaTime;
        if (this.blinkTimer > 3000) {
            this.blinkTimer = 0;
            this.isBlinking = true;
            if (this.blinkTimeout) clearTimeout(this.blinkTimeout);
            this.blinkTimeout = setTimeout(() => {
                this.isBlinking = false;
            }, 150);
        }
        
        this.breathePhase += deltaTime * 0.003;
    }
}

class CharacterManager {
    constructor(game) {
        this.game = game;
        
        this.baseWidth = 48;
        this.baseHeight = 64;
        
        this.gradientCache = new Map();
    }
    
    getGradient(ctx, type, colors, params) {
        const key = `${type}-${colors.join('-')}-${params.join('-')}`;
        if (!this.gradientCache.has(key)) {
            let gradient;
            if (type === 'linear') {
                gradient = ctx.createLinearGradient(...params);
            } else if (type === 'radial') {
                gradient = ctx.createRadialGradient(...params);
            }
            colors.forEach((color, i) => {
                gradient.addColorStop(i / (colors.length - 1), color);
            });
            this.gradientCache.set(key, gradient);
        }
        return this.gradientCache.get(key);
    }
    
    clearGradientCache() {
        this.gradientCache.clear();
    }
    
    createCharacter(name) {
        return new Character(name);
    }
    
    updateOtherPlayers(players, deltaTime) {
        players.forEach(player => {
            const smoothFactor = 0.2;
            player.displayX += (player.x - player.displayX) * smoothFactor;
            player.displayY += (player.y - player.displayY) * smoothFactor;
            
            if (player.updateAnimations) {
                player.updateAnimations(deltaTime);
            }
        });
    }
    
    renderCharacter(ctx, character, camera, isCurrentPlayer, time = 0) {
        const renderX = character.displayX || character.x;
        const renderY = character.displayY || character.y;
        
        const screenX = renderX - camera.x;
        const screenY = renderY - camera.y;
        
        if (screenX < -80 || screenX > ctx.canvas.width + 80 ||
            screenY < -80 || screenY > ctx.canvas.height + 80) {
            return;
        }
        
        const scale = character.height;
        const width = this.baseWidth * scale;
        const height = this.baseHeight * scale;
        
        const breatheOffset = Math.sin(character.breathePhase || 0) * 1.5;
        
        this.drawCharacterBody(ctx, screenX, screenY + breatheOffset, width, height, character, isCurrentPlayer, time);
        
        this.drawName(ctx, screenX, screenY + height / 2 + 15 + breatheOffset, character.name, isCurrentPlayer);
        
        if (character.hasChat()) {
            this.drawChatBubble(ctx, screenX, screenY - height / 2 - 40 + breatheOffset, character.chatMessage);
        }
    }
    
    drawCharacterBody(ctx, x, y, width, height, character, isCurrentPlayer, time) {
        ctx.save();
        ctx.translate(x, y);
        
        this.drawShadow(ctx, width, height);
        
        const breatheScale = 1 + Math.sin(character.breathePhase || 0) * 0.02;
        ctx.scale(breatheScale, breatheScale);
        
        this.drawBody(ctx, width, height, character);
        
        this.drawHead(ctx, width, height, character, time);
        
        this.drawAccessories(ctx, width, height, character);
        
        if (isCurrentPlayer) {
            this.drawHighlight(ctx, width, height, time);
        }
        
        ctx.restore();
    }
    
    drawShadow(ctx, width, height) {
        ctx.fillStyle = 'rgba(0,0,0,0.15)';
        ctx.beginPath();
        ctx.ellipse(0, height * 0.55, width * 0.35, height * 0.08, 0, 0, Math.PI * 2);
        ctx.fill();
    }
    
    drawHead(ctx, width, height, character, time) {
        const headRadius = width * 0.45;
        const headY = -height * 0.25;
        
        ctx.save();
        
        const skinGradient = ctx.createRadialGradient(
            -headRadius * 0.3, headY - headRadius * 0.3, 0,
            0, headY, headRadius
        );
        skinGradient.addColorStop(0, this.lightenColor(character.skinColor, 20));
        skinGradient.addColorStop(0.7, character.skinColor);
        skinGradient.addColorStop(1, this.darkenColor(character.skinColor, 10));
        
        ctx.fillStyle = skinGradient;
        ctx.beginPath();
        ctx.ellipse(0, headY, headRadius, headRadius * 1.15, 0, 0, Math.PI * 2);
        ctx.fill();
        
        ctx.strokeStyle = this.darkenColor(character.skinColor, 30);
        ctx.lineWidth = 1.5;
        ctx.stroke();
        
        this.drawHair(ctx, width, height, character, headRadius, headY);
        
        this.drawFace(ctx, width, height, character, headRadius, headY, time);
        
        ctx.fillStyle = 'rgba(255,180,180,0.4)';
        ctx.beginPath();
        ctx.ellipse(-headRadius * 0.6, headY + headRadius * 0.3, headRadius * 0.22, headRadius * 0.12, 0, 0, Math.PI * 2);
        ctx.ellipse(headRadius * 0.6, headY + headRadius * 0.3, headRadius * 0.22, headRadius * 0.12, 0, 0, Math.PI * 2);
        ctx.fill();
        
        ctx.restore();
    }
    
    drawFace(ctx, width, height, character, headRadius, headY, time) {
        const eyeY = headY - headRadius * 0.05;
        const eyeOffsetX = headRadius * 0.35;
        const eyeWidth = headRadius * 0.28;
        const eyeHeight = headRadius * 0.35;
        
        const isBlinking = character.isBlinking || false;
        
        ctx.fillStyle = '#ffffff';
        ctx.beginPath();
        ctx.ellipse(-eyeOffsetX, eyeY, eyeWidth, eyeHeight, 0, 0, Math.PI * 2);
        ctx.fill();
        ctx.beginPath();
        ctx.ellipse(eyeOffsetX, eyeY, eyeWidth, eyeHeight, 0, 0, Math.PI * 2);
        ctx.fill();
        
        ctx.strokeStyle = 'rgba(0,0,0,0.1)';
        ctx.lineWidth = 1;
        ctx.stroke();
        
        if (isBlinking) {
            ctx.strokeStyle = '#333';
            ctx.lineWidth = 2.5;
            ctx.beginPath();
            ctx.moveTo(-eyeOffsetX - eyeWidth * 0.8, eyeY);
            ctx.quadraticCurveTo(-eyeOffsetX, eyeY + 2, -eyeOffsetX + eyeWidth * 0.8, eyeY);
            ctx.stroke();
            ctx.beginPath();
            ctx.moveTo(eyeOffsetX - eyeWidth * 0.8, eyeY);
            ctx.quadraticCurveTo(eyeOffsetX, eyeY + 2, eyeOffsetX + eyeWidth * 0.8, eyeY);
            ctx.stroke();
        } else {
            const pupilY = eyeY + eyeHeight * 0.15;
            const pupilRadius = eyeWidth * 0.45;
            
            ctx.fillStyle = character.eyeColor;
            ctx.beginPath();
            ctx.arc(-eyeOffsetX, pupilY, pupilRadius, 0, Math.PI * 2);
            ctx.arc(eyeOffsetX, pupilY, pupilRadius, 0, Math.PI * 2);
            ctx.fill();
            
            ctx.fillStyle = '#000000';
            ctx.beginPath();
            ctx.arc(-eyeOffsetX, pupilY + 1, pupilRadius * 0.55, 0, Math.PI * 2);
            ctx.arc(eyeOffsetX, pupilY + 1, pupilRadius * 0.55, 0, Math.PI * 2);
            ctx.fill();
            
            ctx.fillStyle = '#ffffff';
            ctx.beginPath();
            ctx.arc(-eyeOffsetX - pupilRadius * 0.35, pupilY - pupilRadius * 0.25, pupilRadius * 0.25, 0, Math.PI * 2);
            ctx.arc(eyeOffsetX - pupilRadius * 0.35, pupilY - pupilRadius * 0.25, pupilRadius * 0.25, 0, Math.PI * 2);
            ctx.fill();
            
            ctx.beginPath();
            ctx.arc(-eyeOffsetX + pupilRadius * 0.3, pupilY + pupilRadius * 0.35, pupilRadius * 0.12, 0, Math.PI * 2);
            ctx.arc(eyeOffsetX + pupilRadius * 0.3, pupilY + pupilRadius * 0.35, pupilRadius * 0.12, 0, Math.PI * 2);
            ctx.fill();
        }
        
        const mouthY = headY + headRadius * 0.45;
        const mouthWidth = headRadius * 0.35;
        
        ctx.fillStyle = '#FF8C32';
        ctx.beginPath();
        ctx.moveTo(-mouthWidth / 2, mouthY);
        ctx.quadraticCurveTo(0, mouthY + mouthWidth * 0.4, mouthWidth / 2, mouthY);
        ctx.quadraticCurveTo(0, mouthY + mouthWidth * 0.15, -mouthWidth / 2, mouthY);
        ctx.fill();
        
        ctx.strokeStyle = '#c55a5a';
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.moveTo(-mouthWidth / 2 + 1, mouthY + 1);
        ctx.quadraticCurveTo(0, mouthY + mouthWidth * 0.4 + 1, mouthWidth / 2 - 1, mouthY + 1);
        ctx.stroke();
        
        ctx.fillStyle = 'rgba(255,255,255,0.4)';
        ctx.beginPath();
        ctx.moveTo(-mouthWidth * 0.3, mouthY + 2);
        ctx.quadraticCurveTo(0, mouthY + mouthWidth * 0.25, mouthWidth * 0.3, mouthY + 2);
        ctx.closePath();
        ctx.fill();
    }
    
    drawHair(ctx, width, height, character, headRadius, headY) {
        ctx.save();
        
        const hairGradient = ctx.createLinearGradient(
            0, headY - headRadius * 1.2,
            0, headY + headRadius * 0.3
        );
        hairGradient.addColorStop(0, this.lightenColor(character.hairColor, 30));
        hairGradient.addColorStop(0.5, character.hairColor);
        hairGradient.addColorStop(1, this.darkenColor(character.hairColor, 20));
        
        ctx.fillStyle = hairGradient;
        
        switch (character.hairStyle) {
            case 'short':
                this.drawShortHair(ctx, headRadius, headY);
                break;
            case 'long':
                this.drawLongHair(ctx, headRadius, headY, height);
                break;
            case 'curly':
                this.drawCurlyHair(ctx, headRadius, headY, character.hairColor);
                break;
            case 'ponytail':
                this.drawPonytailHair(ctx, headRadius, headY, height, character.hairColor);
                break;
            case 'bald':
                break;
            case 'spiky':
                this.drawSpikyHair(ctx, headRadius, headY);
                break;
        }
        
        ctx.fillStyle = 'rgba(255,255,255,0.25)';
        ctx.beginPath();
        ctx.ellipse(-headRadius * 0.25, headY - headRadius * 0.6, headRadius * 0.18, headRadius * 0.12, -0.3, 0, Math.PI * 2);
        ctx.fill();
        
        ctx.restore();
    }
    
    drawShortHair(ctx, headRadius, headY) {
        ctx.beginPath();
        ctx.moveTo(-headRadius * 0.9, headY - headRadius * 0.1);
        ctx.quadraticCurveTo(-headRadius, headY - headRadius * 0.7, -headRadius * 0.5, headY - headRadius * 1.1);
        ctx.quadraticCurveTo(0, headY - headRadius * 1.25, headRadius * 0.5, headY - headRadius * 1.1);
        ctx.quadraticCurveTo(headRadius, headY - headRadius * 0.7, headRadius * 0.9, headY - headRadius * 0.1);
        ctx.quadraticCurveTo(headRadius * 0.85, headY - headRadius * 0.3, headRadius * 0.5, headY - headRadius * 0.4);
        ctx.quadraticCurveTo(0, headY - headRadius * 0.5, -headRadius * 0.5, headY - headRadius * 0.4);
        ctx.quadraticCurveTo(-headRadius * 0.85, headY - headRadius * 0.3, -headRadius * 0.9, headY - headRadius * 0.1);
        ctx.fill();
        
        ctx.strokeStyle = this.darkenColor(ctx.fillStyle, 30);
        ctx.lineWidth = 1;
        ctx.stroke();
    }
    
    drawLongHair(ctx, headRadius, headY, height) {
        ctx.beginPath();
        ctx.moveTo(-headRadius * 1.1, headY + headRadius * 0.8);
        ctx.quadraticCurveTo(-headRadius * 1.2, headY - headRadius * 0.5, -headRadius * 0.5, headY - headRadius * 1.1);
        ctx.quadraticCurveTo(0, headY - headRadius * 1.3, headRadius * 0.5, headY - headRadius * 1.1);
        ctx.quadraticCurveTo(headRadius * 1.2, headY - headRadius * 0.5, headRadius * 1.1, headY + headRadius * 0.8);
        ctx.quadraticCurveTo(headRadius * 0.9, headY + headRadius * 1.2, headRadius * 0.7, headY + height * 0.35);
        ctx.lineTo(headRadius * 0.4, headY + height * 0.35);
        ctx.quadraticCurveTo(headRadius * 0.3, headY + headRadius * 1.5, 0, headY + height * 0.4);
        ctx.lineTo(-headRadius * 0.4, headY + height * 0.35);
        ctx.quadraticCurveTo(-headRadius * 0.3, headY + headRadius * 1.5, -headRadius * 0.7, headY + height * 0.35);
        ctx.quadraticCurveTo(-headRadius * 0.9, headY + headRadius * 1.2, -headRadius * 1.1, headY + headRadius * 0.8);
        ctx.fill();
        
        ctx.strokeStyle = this.darkenColor(ctx.fillStyle, 25);
        ctx.lineWidth = 1.5;
        ctx.stroke();
        
        ctx.fillStyle = 'rgba(255,255,255,0.2)';
        ctx.beginPath();
        ctx.moveTo(-headRadius * 0.3, headY + headRadius * 0.5);
        ctx.quadraticCurveTo(-headRadius * 0.35, headY + height * 0.2, -headRadius * 0.25, headY + height * 0.35);
        ctx.lineTo(-headRadius * 0.15, headY + height * 0.35);
        ctx.quadraticCurveTo(-headRadius * 0.2, headY + height * 0.15, -headRadius * 0.15, headY + headRadius * 0.5);
        ctx.fill();
    }
    
    drawCurlyHair(ctx, headRadius, headY, hairColor) {
        const curls = [
            { x: -headRadius * 0.7, y: headY - headRadius * 0.6, r: headRadius * 0.25 },
            { x: -headRadius * 0.35, y: headY - headRadius * 0.9, r: headRadius * 0.28 },
            { x: 0, y: headY - headRadius * 1.0, r: headRadius * 0.26 },
            { x: headRadius * 0.35, y: headY - headRadius * 0.9, r: headRadius * 0.28 },
            { x: headRadius * 0.7, y: headY - headRadius * 0.6, r: headRadius * 0.25 },
            { x: -headRadius * 0.85, y: headY - headRadius * 0.2, r: headRadius * 0.22 },
            { x: headRadius * 0.85, y: headY - headRadius * 0.2, r: headRadius * 0.22 },
            { x: -headRadius * 0.5, y: headY - headRadius * 0.35, r: headRadius * 0.18 },
            { x: headRadius * 0.5, y: headY - headRadius * 0.35, r: headRadius * 0.18 }
        ];
        
        curls.forEach(curl => {
            const curlGradient = ctx.createRadialGradient(
                curl.x - curl.r * 0.3, curl.y - curl.r * 0.3, 0,
                curl.x, curl.y, curl.r
            );
            curlGradient.addColorStop(0, this.lightenColor(hairColor, 35));
            curlGradient.addColorStop(0.6, hairColor);
            curlGradient.addColorStop(1, this.darkenColor(hairColor, 15));
            
            ctx.fillStyle = curlGradient;
            ctx.beginPath();
            ctx.arc(curl.x, curl.y, curl.r, 0, Math.PI * 2);
            ctx.fill();
            
            ctx.strokeStyle = this.darkenColor(hairColor, 20);
            ctx.lineWidth = 0.8;
            ctx.stroke();
        });
    }
    
    drawPonytailHair(ctx, headRadius, headY, height, hairColor) {
        ctx.beginPath();
        ctx.moveTo(-headRadius * 0.9, headY - headRadius * 0.1);
        ctx.quadraticCurveTo(-headRadius, headY - headRadius * 0.7, -headRadius * 0.5, headY - headRadius * 1.1);
        ctx.quadraticCurveTo(0, headY - headRadius * 1.25, headRadius * 0.5, headY - headRadius * 1.1);
        ctx.quadraticCurveTo(headRadius, headY - headRadius * 0.7, headRadius * 0.9, headY - headRadius * 0.1);
        ctx.quadraticCurveTo(headRadius * 0.7, headY - headRadius * 0.3, headRadius * 0.3, headY - headRadius * 0.35);
        ctx.quadraticCurveTo(0, headY - headRadius * 0.4, -headRadius * 0.3, headY - headRadius * 0.35);
        ctx.quadraticCurveTo(-headRadius * 0.7, headY - headRadius * 0.3, -headRadius * 0.9, headY - headRadius * 0.1);
        ctx.fill();
        
        const ponytailGradient = ctx.createLinearGradient(
            0, headY - headRadius,
            0, headY + height * 0.4
        );
        ponytailGradient.addColorStop(0, hairColor);
        ponytailGradient.addColorStop(0.5, this.lightenColor(hairColor, 15));
        ponytailGradient.addColorStop(1, this.darkenColor(hairColor, 10));
        
        ctx.fillStyle = ponytailGradient;
        ctx.beginPath();
        ctx.moveTo(-headRadius * 0.15, headY - headRadius * 0.5);
        ctx.quadraticCurveTo(-headRadius * 0.2, headY + headRadius * 0.3, -headRadius * 0.35, headY + height * 0.3);
        ctx.quadraticCurveTo(0, headY + height * 0.35, headRadius * 0.35, headY + height * 0.3);
        ctx.quadraticCurveTo(headRadius * 0.2, headY + headRadius * 0.3, headRadius * 0.15, headY - headRadius * 0.5);
        ctx.quadraticCurveTo(0, headY - headRadius * 0.55, -headRadius * 0.15, headY - headRadius * 0.5);
        ctx.fill();
        
        ctx.strokeStyle = this.darkenColor(hairColor, 20);
        ctx.lineWidth = 1.5;
        ctx.stroke();
        
        ctx.fillStyle = '#FFD93D';
        ctx.beginPath();
        ctx.arc(0, headY - headRadius * 0.45, headRadius * 0.12, 0, Math.PI * 2);
        ctx.fill();
        ctx.strokeStyle = '#FF8C32';
        ctx.lineWidth = 1;
        ctx.stroke();
    }
    
    drawSpikyHair(ctx, headRadius, headY) {
        const spikes = [
            { x: -headRadius * 0.6, angle: -0.6, height: headRadius * 0.55 },
            { x: -headRadius * 0.3, angle: -0.3, height: headRadius * 0.65 },
            { x: 0, angle: 0, height: headRadius * 0.7 },
            { x: headRadius * 0.3, angle: 0.3, height: headRadius * 0.65 },
            { x: headRadius * 0.6, angle: 0.6, height: headRadius * 0.55 },
            { x: -headRadius * 0.8, angle: -0.8, height: headRadius * 0.4 },
            { x: headRadius * 0.8, angle: 0.8, height: headRadius * 0.4 }
        ];
        
        spikes.forEach(spike => {
            ctx.beginPath();
            const baseY = headY - headRadius * 0.3;
            const tipX = spike.x + Math.sin(spike.angle) * spike.height * 0.3;
            const tipY = baseY - spike.height;
            const width = headRadius * 0.18;
            
            ctx.moveTo(spike.x - width, baseY);
            ctx.quadraticCurveTo(spike.x - width * 0.5, tipY + spike.height * 0.3, tipX, tipY);
            ctx.quadraticCurveTo(spike.x + width * 0.5, tipY + spike.height * 0.3, spike.x + width, baseY);
            ctx.fill();
            
            ctx.fillStyle = 'rgba(255,255,255,0.3)';
            ctx.beginPath();
            ctx.moveTo(spike.x - width * 0.3, baseY);
            ctx.quadraticCurveTo(spike.x - width * 0.15, tipY + spike.height * 0.4, spike.x, tipY + spike.height * 0.2);
            ctx.lineTo(spike.x - width * 0.1, baseY);
            ctx.fill();
        });
    }
    
    drawBody(ctx, width, height, character) {
        const bodyWidth = width * 0.45;
        const bodyHeight = height * 0.35;
        const bodyY = height * 0.05;
        
        ctx.save();
        
        const clothingGradient = ctx.createLinearGradient(
            -bodyWidth, bodyY,
            bodyWidth, bodyY + bodyHeight
        );
        clothingGradient.addColorStop(0, this.lightenColor(character.clothingColor, 25));
        clothingGradient.addColorStop(0.5, character.clothingColor);
        clothingGradient.addColorStop(1, this.darkenColor(character.clothingColor, 15));
        
        ctx.fillStyle = clothingGradient;
        
        switch (character.clothingStyle) {
            case 'casual':
                this.drawCasualClothing(ctx, bodyWidth, bodyHeight, bodyY, height, character.clothingColor);
                break;
            case 'formal':
                this.drawFormalClothing(ctx, bodyWidth, bodyHeight, bodyY, height, character.clothingColor);
                break;
            case 'sporty':
                this.drawSportyClothing(ctx, bodyWidth, bodyHeight, bodyY, height, character.clothingColor);
                break;
            case 'hoodie':
                this.drawHoodieClothing(ctx, width, bodyWidth, bodyHeight, bodyY, height, character.clothingColor);
                break;
            case 'dress':
                this.drawDressClothing(ctx, width, bodyWidth, bodyHeight, bodyY, height, character.clothingColor);
                break;
        }
        
        ctx.restore();
    }
    
    drawCasualClothing(ctx, bodyWidth, bodyHeight, bodyY, height, clothingColor) {
        ctx.beginPath();
        ctx.moveTo(-bodyWidth * 0.8, bodyY);
        ctx.quadraticCurveTo(-bodyWidth, bodyY + bodyHeight * 0.3, -bodyWidth * 0.85, bodyY + bodyHeight);
        ctx.lineTo(-bodyWidth * 0.5, bodyY + bodyHeight);
        ctx.lineTo(-bodyWidth * 0.5, bodyY + height * 0.35);
        ctx.lineTo(bodyWidth * 0.5, bodyY + height * 0.35);
        ctx.lineTo(bodyWidth * 0.5, bodyY + bodyHeight);
        ctx.lineTo(bodyWidth * 0.85, bodyY + bodyHeight);
        ctx.quadraticCurveTo(bodyWidth, bodyY + bodyHeight * 0.3, bodyWidth * 0.8, bodyY);
        ctx.quadraticCurveTo(bodyWidth * 0.4, bodyY - bodyHeight * 0.1, 0, bodyY - bodyHeight * 0.15);
        ctx.quadraticCurveTo(-bodyWidth * 0.4, bodyY - bodyHeight * 0.1, -bodyWidth * 0.8, bodyY);
        ctx.fill();
        
        ctx.strokeStyle = this.darkenColor(clothingColor, 30);
        ctx.lineWidth = 1.5;
        ctx.stroke();
        
        ctx.strokeStyle = this.darkenColor(clothingColor, 15);
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.moveTo(0, bodyY);
        ctx.lineTo(0, bodyY + bodyHeight * 0.7);
        ctx.stroke();
        
        ctx.fillStyle = 'rgba(255,255,255,0.2)';
        ctx.beginPath();
        ctx.moveTo(-bodyWidth * 0.3, bodyY);
        ctx.lineTo(-bodyWidth * 0.25, bodyY + bodyHeight * 0.5);
        ctx.lineTo(-bodyWidth * 0.15, bodyY + bodyHeight * 0.5);
        ctx.lineTo(-bodyWidth * 0.1, bodyY);
        ctx.fill();
    }
    
    drawFormalClothing(ctx, bodyWidth, bodyHeight, bodyY, height, clothingColor) {
        ctx.beginPath();
        ctx.moveTo(-bodyWidth, bodyY);
        ctx.quadraticCurveTo(-bodyWidth * 1.1, bodyY + bodyHeight * 0.5, -bodyWidth, bodyY + bodyHeight);
        ctx.lineTo(-bodyWidth * 0.5, bodyY + bodyHeight);
        ctx.lineTo(-bodyWidth * 0.5, bodyY + height * 0.35);
        ctx.lineTo(bodyWidth * 0.5, bodyY + height * 0.35);
        ctx.lineTo(bodyWidth * 0.5, bodyY + bodyHeight);
        ctx.lineTo(bodyWidth, bodyY + bodyHeight);
        ctx.quadraticCurveTo(bodyWidth * 1.1, bodyY + bodyHeight * 0.5, bodyWidth, bodyY);
        ctx.lineTo(0, bodyY);
        ctx.closePath();
        ctx.fill();
        
        ctx.fillStyle = '#2d2d2d';
        ctx.beginPath();
        ctx.moveTo(-bodyWidth, bodyY);
        ctx.lineTo(-bodyWidth * 0.3, bodyY + bodyHeight * 0.2);
        ctx.lineTo(0, bodyY);
        ctx.lineTo(bodyWidth * 0.3, bodyY + bodyHeight * 0.2);
        ctx.lineTo(bodyWidth, bodyY);
        ctx.closePath();
        ctx.fill();
        
        ctx.fillStyle = '#ffffff';
        ctx.beginPath();
        ctx.moveTo(-bodyWidth * 0.1, bodyY);
        ctx.lineTo(0, bodyY + bodyHeight * 0.12);
        ctx.lineTo(bodyWidth * 0.1, bodyY);
        ctx.closePath();
        ctx.fill();
        
        ctx.fillStyle = this.darkenColor(clothingColor, 40);
        ctx.fillRect(-bodyWidth * 0.45, bodyY + bodyHeight, bodyWidth * 0.35, height * 0.25);
        ctx.fillRect(bodyWidth * 0.1, bodyY + bodyHeight, bodyWidth * 0.35, height * 0.25);
        
        ctx.strokeStyle = '#1a1a1a';
        ctx.lineWidth = 1;
        ctx.strokeRect(-bodyWidth * 0.45, bodyY + bodyHeight, bodyWidth * 0.35, height * 0.25);
        ctx.strokeRect(bodyWidth * 0.1, bodyY + bodyHeight, bodyWidth * 0.35, height * 0.25);
    }
    
    drawSportyClothing(ctx, bodyWidth, bodyHeight, bodyY, height, clothingColor) {
        ctx.beginPath();
        ctx.moveTo(-bodyWidth * 0.9, bodyY);
        ctx.quadraticCurveTo(-bodyWidth * 1.05, bodyY + bodyHeight * 0.4, -bodyWidth * 0.9, bodyY + bodyHeight);
        ctx.lineTo(-bodyWidth * 0.5, bodyY + bodyHeight);
        ctx.lineTo(-bodyWidth * 0.5, bodyY + height * 0.35);
        ctx.lineTo(bodyWidth * 0.5, bodyY + height * 0.35);
        ctx.lineTo(bodyWidth * 0.5, bodyY + bodyHeight);
        ctx.lineTo(bodyWidth * 0.9, bodyY + bodyHeight);
        ctx.quadraticCurveTo(bodyWidth * 1.05, bodyY + bodyHeight * 0.4, bodyWidth * 0.9, bodyY);
        ctx.quadraticCurveTo(bodyWidth * 0.4, bodyY - bodyHeight * 0.08, 0, bodyY - bodyHeight * 0.12);
        ctx.quadraticCurveTo(-bodyWidth * 0.4, bodyY - bodyHeight * 0.08, -bodyWidth * 0.9, bodyY);
        ctx.fill();
        
        ctx.fillStyle = '#ffffff';
        ctx.fillRect(-bodyWidth * 0.08, bodyY + 5, bodyWidth * 0.16, bodyHeight - 10);
        
        ctx.strokeStyle = this.darkenColor(clothingColor, 25);
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.moveTo(-bodyWidth * 0.9, bodyY);
        ctx.lineTo(bodyWidth * 0.9, bodyY);
        ctx.stroke();
        
        ctx.fillStyle = this.darkenColor(clothingColor, 15);
        ctx.fillRect(-bodyWidth * 0.45, bodyY + bodyHeight, bodyWidth * 0.9, height * 0.25);
        
        ctx.fillStyle = '#ffffff';
        ctx.fillRect(-bodyWidth * 0.45, bodyY + bodyHeight, bodyWidth * 0.9, height * 0.06);
    }
    
    drawHoodieClothing(ctx, width, bodyWidth, bodyHeight, bodyY, height, clothingColor) {
        ctx.beginPath();
        ctx.moveTo(-bodyWidth * 0.95, bodyY);
        ctx.quadraticCurveTo(-bodyWidth * 1.1, bodyY + bodyHeight * 0.3, -bodyWidth * 0.95, bodyY + bodyHeight);
        ctx.lineTo(-bodyWidth * 0.5, bodyY + bodyHeight);
        ctx.lineTo(-bodyWidth * 0.5, bodyY + height * 0.35);
        ctx.lineTo(bodyWidth * 0.5, bodyY + height * 0.35);
        ctx.lineTo(bodyWidth * 0.5, bodyY + bodyHeight);
        ctx.lineTo(bodyWidth * 0.95, bodyY + bodyHeight);
        ctx.quadraticCurveTo(bodyWidth * 1.1, bodyY + bodyHeight * 0.3, bodyWidth * 0.95, bodyY);
        ctx.quadraticCurveTo(bodyWidth * 0.4, bodyY - bodyHeight * 0.1, 0, bodyY - bodyHeight * 0.15);
        ctx.quadraticCurveTo(-bodyWidth * 0.4, bodyY - bodyHeight * 0.1, -bodyWidth * 0.95, bodyY);
        ctx.fill();
        
        const hoodGradient = ctx.createLinearGradient(
            0, bodyY - height * 0.1,
            0, bodyY + bodyHeight * 0.1
        );
        hoodGradient.addColorStop(0, this.lightenColor(clothingColor, 20));
        hoodGradient.addColorStop(0.5, clothingColor);
        hoodGradient.addColorStop(1, this.darkenColor(clothingColor, 10));
        
        ctx.fillStyle = hoodGradient;
        ctx.beginPath();
        ctx.moveTo(-width * 0.2, bodyY);
        ctx.quadraticCurveTo(-width * 0.25, bodyY - height * 0.15, 0, bodyY - height * 0.18);
        ctx.quadraticCurveTo(width * 0.25, bodyY - height * 0.15, width * 0.2, bodyY);
        ctx.quadraticCurveTo(width * 0.15, bodyY - height * 0.05, 0, bodyY - height * 0.08);
        ctx.quadraticCurveTo(-width * 0.15, bodyY - height * 0.05, -width * 0.2, bodyY);
        ctx.fill();
        
        ctx.strokeStyle = this.darkenColor(clothingColor, 20);
        ctx.lineWidth = 1.5;
        ctx.stroke();
        
        ctx.fillStyle = this.darkenColor(clothingColor, 35);
        ctx.beginPath();
        ctx.moveTo(-bodyWidth * 0.35, bodyY + bodyHeight * 0.45);
        ctx.quadraticCurveTo(0, bodyY + bodyHeight * 0.65, bodyWidth * 0.35, bodyY + bodyHeight * 0.45);
        ctx.quadraticCurveTo(0, bodyY + bodyHeight * 0.55, -bodyWidth * 0.35, bodyY + bodyHeight * 0.45);
        ctx.fill();
        
        ctx.fillStyle = '#5D5D5D';
        ctx.fillRect(-bodyWidth * 0.45, bodyY + bodyHeight, bodyWidth * 0.35, height * 0.25);
        ctx.fillRect(bodyWidth * 0.1, bodyY + bodyHeight, bodyWidth * 0.35, height * 0.25);
    }
    
    drawDressClothing(ctx, width, bodyWidth, bodyHeight, bodyY, height, clothingColor) {
        ctx.beginPath();
        ctx.moveTo(-bodyWidth * 0.7, bodyY);
        ctx.quadraticCurveTo(-bodyWidth * 0.8, bodyY + bodyHeight * 0.3, -bodyWidth * 0.7, bodyY + bodyHeight);
        ctx.quadraticCurveTo(-width * 0.4, bodyY + height * 0.4, -width * 0.35, bodyY + height * 0.45);
        ctx.lineTo(width * 0.35, bodyY + height * 0.45);
        ctx.quadraticCurveTo(width * 0.4, bodyY + height * 0.4, bodyWidth * 0.7, bodyY + bodyHeight);
        ctx.quadraticCurveTo(bodyWidth * 0.8, bodyY + bodyHeight * 0.3, bodyWidth * 0.7, bodyY);
        ctx.quadraticCurveTo(bodyWidth * 0.35, bodyY - bodyHeight * 0.1, 0, bodyY - bodyHeight * 0.15);
        ctx.quadraticCurveTo(-bodyWidth * 0.35, bodyY - bodyHeight * 0.1, -bodyWidth * 0.7, bodyY);
        ctx.fill();
        
        ctx.strokeStyle = this.darkenColor(clothingColor, 30);
        ctx.lineWidth = 1.5;
        ctx.stroke();
        
        ctx.fillStyle = 'rgba(255,255,255,0.15)';
        ctx.beginPath();
        ctx.moveTo(-width * 0.3, bodyY + height * 0.35);
        ctx.quadraticCurveTo(0, bodyY + height * 0.38, width * 0.3, bodyY + height * 0.35);
        ctx.quadraticCurveTo(0, bodyY + height * 0.4, -width * 0.3, bodyY + height * 0.35);
        ctx.fill();
        
        ctx.strokeStyle = this.darkenColor(clothingColor, 20);
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.moveTo(0, bodyY + bodyHeight * 0.2);
        ctx.lineTo(0, bodyY + height * 0.35);
        ctx.stroke();
    }
    
    drawAccessories(ctx, width, height, character) {
        const headRadius = width * 0.45;
        const headY = -height * 0.25;
        const bodyWidth = width * 0.45;
        const bodyY = height * 0.05;
        const bodyHeight = height * 0.35;
        
        character.accessories.forEach(acc => {
            switch (acc) {
                case 'glasses':
                    this.drawGlasses(ctx, headRadius, headY);
                    break;
                case 'hat':
                    this.drawHat(ctx, headRadius, headY);
                    break;
                case 'watch':
                    this.drawWatch(ctx, bodyWidth, bodyY, bodyHeight);
                    break;
                case 'earring':
                    this.drawEarrings(ctx, headRadius, headY);
                    break;
                case 'necklace':
                    this.drawNecklace(ctx, bodyWidth, bodyY);
                    break;
                case 'backpack':
                    this.drawBackpack(ctx, bodyWidth, bodyY, bodyHeight, height);
                    break;
            }
        });
    }
    
    drawGlasses(ctx, headRadius, headY) {
        const eyeY = headY - headRadius * 0.05;
        const eyeOffsetX = headRadius * 0.35;
        
        const frameGradient = ctx.createLinearGradient(
            -eyeOffsetX - headRadius * 0.4, eyeY - headRadius * 0.3,
            eyeOffsetX + headRadius * 0.4, eyeY + headRadius * 0.3
        );
        frameGradient.addColorStop(0, '#8B4513');
        frameGradient.addColorStop(0.3, '#A0522D');
        frameGradient.addColorStop(0.5, '#D2691E');
        frameGradient.addColorStop(0.7, '#A0522D');
        frameGradient.addColorStop(1, '#8B4513');
        
        ctx.strokeStyle = frameGradient;
        ctx.lineWidth = 4;
        
        ctx.fillStyle = 'rgba(135,206,250,0.35)';
        ctx.beginPath();
        ctx.ellipse(-eyeOffsetX, eyeY, headRadius * 0.38, headRadius * 0.32, 0, 0, Math.PI * 2);
        ctx.fill();
        ctx.stroke();
        
        ctx.beginPath();
        ctx.ellipse(eyeOffsetX, eyeY, headRadius * 0.38, headRadius * 0.32, 0, 0, Math.PI * 2);
        ctx.fill();
        ctx.stroke();
        
        ctx.fillStyle = 'rgba(255,255,255,0.6)';
        ctx.beginPath();
        ctx.moveTo(-eyeOffsetX - headRadius * 0.25, eyeY - headRadius * 0.15);
        ctx.quadraticCurveTo(-eyeOffsetX, eyeY - headRadius * 0.2, -eyeOffsetX + headRadius * 0.1, eyeY - headRadius * 0.08);
        ctx.lineTo(-eyeOffsetX - headRadius * 0.15, eyeY - headRadius * 0.05);
        ctx.quadraticCurveTo(-eyeOffsetX - headRadius * 0.2, eyeY - headRadius * 0.12, -eyeOffsetX - headRadius * 0.25, eyeY - headRadius * 0.15);
        ctx.fill();
        
        ctx.beginPath();
        ctx.moveTo(eyeOffsetX - headRadius * 0.25, eyeY - headRadius * 0.15);
        ctx.quadraticCurveTo(eyeOffsetX, eyeY - headRadius * 0.2, eyeOffsetX + headRadius * 0.1, eyeY - headRadius * 0.08);
        ctx.lineTo(eyeOffsetX - headRadius * 0.15, eyeY - headRadius * 0.05);
        ctx.quadraticCurveTo(eyeOffsetX - headRadius * 0.2, eyeY - headRadius * 0.12, eyeOffsetX - headRadius * 0.25, eyeY - headRadius * 0.15);
        ctx.fill();
        
        ctx.fillStyle = 'rgba(255,255,255,0.25)';
        ctx.beginPath();
        ctx.ellipse(-eyeOffsetX, eyeY + headRadius * 0.05, headRadius * 0.35, headRadius * 0.2, 0, 0, Math.PI * 2);
        ctx.ellipse(eyeOffsetX, eyeY + headRadius * 0.05, headRadius * 0.35, headRadius * 0.2, 0, 0, Math.PI * 2);
        ctx.fill();
        
        ctx.strokeStyle = '#5D4037';
        ctx.lineWidth = 2.5;
        ctx.beginPath();
        ctx.moveTo(-eyeOffsetX + headRadius * 0.38, eyeY);
        ctx.quadraticCurveTo(0, eyeY - headRadius * 0.05, eyeOffsetX - headRadius * 0.38, eyeY);
        ctx.stroke();
        
        ctx.beginPath();
        ctx.moveTo(-eyeOffsetX - headRadius * 0.38, eyeY);
        ctx.lineTo(-headRadius * 0.92, eyeY - headRadius * 0.12);
        ctx.moveTo(eyeOffsetX + headRadius * 0.38, eyeY);
        ctx.lineTo(headRadius * 0.92, eyeY - headRadius * 0.12);
        ctx.stroke();
        
        ctx.fillStyle = '#FFD93D';
        ctx.font = 'bold 8px Arial';
        ctx.fillText('✦', -eyeOffsetX - headRadius * 0.3, eyeY - headRadius * 0.22);
        ctx.fillText('✦', eyeOffsetX - headRadius * 0.3, eyeY - headRadius * 0.22);
    }
    
    drawHat(ctx, headRadius, headY) {
        const hatGradient = ctx.createLinearGradient(
            0, headY - headRadius * 1.5,
            0, headY - headRadius * 0.5
        );
        hatGradient.addColorStop(0, '#FFD93D');
        hatGradient.addColorStop(0.2, '#FF8C32');
        hatGradient.addColorStop(0.5, '#FF6B6B');
        hatGradient.addColorStop(0.8, '#FF6B9D');
        hatGradient.addColorStop(1, '#FF6B6B');
        
        ctx.fillStyle = hatGradient;
        
        ctx.beginPath();
        ctx.moveTo(-headRadius * 1.15, headY - headRadius * 0.42);
        ctx.quadraticCurveTo(-headRadius * 0.85, headY - headRadius * 1.05, 0, headY - headRadius * 1.2);
        ctx.quadraticCurveTo(headRadius * 0.85, headY - headRadius * 1.05, headRadius * 1.15, headY - headRadius * 0.42);
        ctx.quadraticCurveTo(headRadius * 0.65, headY - headRadius * 0.48, 0, headY - headRadius * 0.55);
        ctx.quadraticCurveTo(-headRadius * 0.65, headY - headRadius * 0.48, -headRadius * 1.15, headY - headRadius * 0.42);
        ctx.fill();
        
        ctx.strokeStyle = '#FF8C32';
        ctx.lineWidth = 2;
        ctx.stroke();
        
        ctx.fillStyle = '#FFD93D';
        ctx.beginPath();
        ctx.ellipse(0, headY - headRadius * 0.42, headRadius * 1.35, headRadius * 0.2, 0, 0, Math.PI * 2);
        ctx.fill();
        
        ctx.strokeStyle = '#FF8C32';
        ctx.lineWidth = 2;
        ctx.stroke();
        
        ctx.fillStyle = 'rgba(255,255,255,0.35)';
        ctx.beginPath();
        ctx.moveTo(-headRadius * 0.25, headY - headRadius * 0.55);
        ctx.quadraticCurveTo(-headRadius * 0.4, headY - headRadius * 0.85, -headRadius * 0.3, headY - headRadius * 1.0);
        ctx.quadraticCurveTo(-headRadius * 0.2, headY - headRadius * 0.85, -headRadius * 0.1, headY - headRadius * 0.55);
        ctx.fill();
        
        ctx.fillStyle = '#FF6B9D';
        ctx.beginPath();
        ctx.arc(-headRadius * 0.5, headY - headRadius * 0.65, headRadius * 0.12, 0, Math.PI * 2);
        ctx.fill();
        
        ctx.fillStyle = 'rgba(255,255,255,0.5)';
        ctx.beginPath();
        ctx.arc(-headRadius * 0.55, headY - headRadius * 0.7, headRadius * 0.04, 0, Math.PI * 2);
        ctx.fill();
        
        ctx.strokeStyle = '#6BCB77';
        ctx.lineWidth = 3;
        ctx.beginPath();
        ctx.arc(0, headY - headRadius * 1.0, headRadius * 0.25, Math.PI * 0.8, Math.PI * 0.2, true);
        ctx.stroke();
        
        ctx.fillStyle = '#6BCB77';
        ctx.beginPath();
        ctx.arc(headRadius * 0.2, headY - headRadius * 1.15, headRadius * 0.08, 0, Math.PI * 2);
        ctx.fill();
        
        ctx.fillStyle = '#FFD93D';
        ctx.font = 'bold 10px Arial';
        ctx.fillText('★', -headRadius * 0.45, headY - headRadius * 0.75);
    }
    
    drawWatch(ctx, bodyWidth, bodyY, bodyHeight) {
        const watchY = bodyY + bodyHeight * 0.6;
        const watchX = -bodyWidth * 0.65;
        const watchRadius = bodyWidth * 0.12;
        
        const watchGradient = ctx.createRadialGradient(
            watchX, watchY, 0,
            watchX, watchY, watchRadius
        );
        watchGradient.addColorStop(0, '#FFD93D');
        watchGradient.addColorStop(0.6, '#FF8C32');
        watchGradient.addColorStop(1, '#FF6B6B');
        
        ctx.fillStyle = watchGradient;
        ctx.beginPath();
        ctx.arc(watchX, watchY, watchRadius, 0, Math.PI * 2);
        ctx.fill();
        
        ctx.strokeStyle = '#5D4037';
        ctx.lineWidth = 2;
        ctx.stroke();
        
        ctx.fillStyle = '#ffffff';
        ctx.beginPath();
        ctx.arc(watchX, watchY, watchRadius * 0.6, 0, Math.PI * 2);
        ctx.fill();
        
        ctx.strokeStyle = '#333';
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.moveTo(watchX, watchY);
        ctx.lineTo(watchX, watchY - watchRadius * 0.4);
        ctx.moveTo(watchX, watchY);
        ctx.lineTo(watchX + watchRadius * 0.3, watchY);
        ctx.stroke();
        
        ctx.fillStyle = 'rgba(255,255,255,0.5)';
        ctx.beginPath();
        ctx.arc(watchX - watchRadius * 0.2, watchY - watchRadius * 0.2, watchRadius * 0.15, 0, Math.PI * 2);
        ctx.fill();
    }
    
    drawEarrings(ctx, headRadius, headY) {
        const earGradient = ctx.createRadialGradient(0, 0, 0, 0, 0, headRadius * 0.08);
        earGradient.addColorStop(0, '#FFD93D');
        earGradient.addColorStop(0.5, '#FF8C32');
        earGradient.addColorStop(1, '#FF6B6B');
        
        ctx.fillStyle = earGradient;
        
        ctx.beginPath();
        ctx.arc(-headRadius, headY + headRadius * 0.2, headRadius * 0.06, 0, Math.PI * 2);
        ctx.fill();
        
        ctx.beginPath();
        ctx.arc(headRadius, headY + headRadius * 0.2, headRadius * 0.06, 0, Math.PI * 2);
        ctx.fill();
        
        ctx.fillStyle = 'rgba(255,255,255,0.6)';
        ctx.beginPath();
        ctx.arc(-headRadius - headRadius * 0.02, headY + headRadius * 0.18, headRadius * 0.02, 0, Math.PI * 2);
        ctx.arc(headRadius - headRadius * 0.02, headY + headRadius * 0.18, headRadius * 0.02, 0, Math.PI * 2);
        ctx.fill();
    }
    
    drawNecklace(ctx, bodyWidth, bodyY) {
        ctx.strokeStyle = '#FFD93D';
        ctx.lineWidth = 2;
        
        ctx.beginPath();
        ctx.moveTo(-bodyWidth * 0.35, bodyY - 3);
        ctx.quadraticCurveTo(0, bodyY + bodyWidth * 0.25, bodyWidth * 0.35, bodyY - 3);
        ctx.stroke();
        
        const pendantGradient = ctx.createRadialGradient(
            0, bodyY + bodyWidth * 0.25, 0,
            0, bodyY + bodyWidth * 0.25, bodyWidth * 0.08
        );
        pendantGradient.addColorStop(0, '#FFD93D');
        pendantGradient.addColorStop(0.5, '#FF8C32');
        pendantGradient.addColorStop(1, '#FF6B6B');
        
        ctx.fillStyle = pendantGradient;
        ctx.beginPath();
        ctx.arc(0, bodyY + bodyWidth * 0.25, bodyWidth * 0.08, 0, Math.PI * 2);
        ctx.fill();
        
        ctx.fillStyle = 'rgba(255,255,255,0.5)';
        ctx.beginPath();
        ctx.arc(-bodyWidth * 0.03, bodyY + bodyWidth * 0.23, bodyWidth * 0.03, 0, Math.PI * 2);
        ctx.fill();
    }
    
    drawBackpack(ctx, bodyWidth, bodyY, bodyHeight, height) {
        const packGradient = ctx.createLinearGradient(
            -bodyWidth * 0.85, bodyY,
            -bodyWidth * 0.45, bodyY + bodyHeight * 0.8
        );
        packGradient.addColorStop(0, '#6BCB77');
        packGradient.addColorStop(0.25, '#4D96FF');
        packGradient.addColorStop(0.5, '#FFD93D');
        packGradient.addColorStop(0.75, '#FF6B6B');
        packGradient.addColorStop(1, '#FF6B9D');
        
        ctx.fillStyle = packGradient;
        
        ctx.beginPath();
        ctx.moveTo(-bodyWidth * 0.85, bodyY + 8);
        ctx.quadraticCurveTo(-bodyWidth * 0.9, bodyY + bodyHeight * 0.45, -bodyWidth * 0.85, bodyY + bodyHeight * 0.82);
        ctx.lineTo(-bodyWidth * 0.45, bodyY + bodyHeight * 0.82);
        ctx.quadraticCurveTo(-bodyWidth * 0.4, bodyY + bodyHeight * 0.45, -bodyWidth * 0.45, bodyY + 8);
        ctx.closePath();
        ctx.fill();
        
        ctx.strokeStyle = '#5D4037';
        ctx.lineWidth = 3;
        ctx.stroke();
        
        ctx.fillStyle = 'rgba(255,255,255,0.25)';
        ctx.beginPath();
        ctx.moveTo(-bodyWidth * 0.8, bodyY + 12);
        ctx.quadraticCurveTo(-bodyWidth * 0.82, bodyY + bodyHeight * 0.35, -bodyWidth * 0.78, bodyY + bodyHeight * 0.4);
        ctx.lineTo(-bodyWidth * 0.68, bodyY + bodyHeight * 0.4);
        ctx.quadraticCurveTo(-bodyWidth * 0.65, bodyY + bodyHeight * 0.35, -bodyWidth * 0.7, bodyY + 12);
        ctx.fill();
        
        ctx.fillStyle = '#FFD93D';
        ctx.beginPath();
        ctx.roundRect(-bodyWidth * 0.75, bodyY + bodyHeight * 0.35, bodyWidth * 0.25, bodyHeight * 0.12, 5);
        ctx.fill();
        ctx.strokeStyle = '#FF8C32';
        ctx.lineWidth = 1.5;
        ctx.stroke();
        
        ctx.fillStyle = '#ffffff';
        ctx.font = 'bold 8px Arial';
        ctx.fillText('★', -bodyWidth * 0.68, bodyY + bodyHeight * 0.42);
        
        ctx.strokeStyle = this.darkenColor('#6BCB77', 30);
        ctx.lineWidth = 3;
        ctx.beginPath();
        ctx.moveTo(-bodyWidth * 0.65, bodyY + 8);
        ctx.lineTo(-bodyWidth * 0.3, bodyY + 8);
        ctx.stroke();
        
        ctx.fillStyle = '#FF6B6B';
        ctx.beginPath();
        ctx.arc(-bodyWidth * 0.65, bodyY + bodyHeight * 0.22, bodyWidth * 0.08, 0, Math.PI * 2);
        ctx.fill();
        
        ctx.fillStyle = '#FFD93D';
        ctx.beginPath();
        ctx.arc(-bodyWidth * 0.65, bodyY + bodyHeight * 0.22, bodyWidth * 0.05, 0, Math.PI * 2);
        ctx.fill();
        
        ctx.strokeStyle = '#FF8C32';
        ctx.lineWidth = 2;
        ctx.stroke();
        
        ctx.fillStyle = 'rgba(255,255,255,0.6)';
        ctx.beginPath();
        ctx.arc(-bodyWidth * 0.68, bodyY + bodyHeight * 0.19, bodyWidth * 0.02, 0, Math.PI * 2);
        ctx.fill();
        
        ctx.fillStyle = '#6BCB77';
        ctx.beginPath();
        ctx.moveTo(-bodyWidth * 0.6, bodyY + bodyHeight * 0.55);
        ctx.lineTo(-bodyWidth * 0.55, bodyY + bodyHeight * 0.62);
        ctx.lineTo(-bodyWidth * 0.5, bodyY + bodyHeight * 0.55);
        ctx.lineTo(-bodyWidth * 0.55, bodyY + bodyHeight * 0.48);
        ctx.closePath();
        ctx.fill();
        
        ctx.fillStyle = '#FFD93D';
        ctx.beginPath();
        ctx.arc(-bodyWidth * 0.55, bodyY + bodyHeight * 0.55, bodyWidth * 0.03, 0, Math.PI * 2);
        ctx.fill();
        
        ctx.fillStyle = '#FF6B9D';
        ctx.beginPath();
        ctx.arc(-bodyWidth * 0.55, bodyY + bodyHeight * 0.7, bodyWidth * 0.06, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = 'rgba(255,255,255,0.5)';
        ctx.beginPath();
        ctx.arc(-bodyWidth * 0.58, bodyY + bodyHeight * 0.68, bodyWidth * 0.02, 0, Math.PI * 2);
        ctx.fill();
    }
    
    drawHighlight(ctx, width, height, time) {
        const glowPhase = (time * 0.001) % (Math.PI * 2);
        const glowRadius = width * 0.6 + Math.sin(glowPhase) * 5;
        
        ctx.strokeStyle = `rgba(255,217,61,${0.6 + Math.sin(glowPhase) * 0.2})`;
        ctx.lineWidth = 3;
        ctx.beginPath();
        ctx.arc(0, -height * 0.1, glowRadius, 0, Math.PI * 2);
        ctx.stroke();
        
        ctx.strokeStyle = 'rgba(255,140,50,0.3)';
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.arc(0, -height * 0.1, glowRadius + 5, 0, Math.PI * 2);
        ctx.stroke();
    }
    
    drawName(ctx, x, y, name, isCurrentPlayer) {
        ctx.font = 'bold 16px "Comic Sans MS", cursive';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        
        const textWidth = ctx.measureText(name).width;
        const padding = 10;
        const bgWidth = textWidth + padding * 2;
        const bgHeight = 26;
        
        if (isCurrentPlayer) {
            const bgGradient = ctx.createLinearGradient(
                x - bgWidth / 2, y - bgHeight / 2,
                x + bgWidth / 2, y + bgHeight / 2
            );
            bgGradient.addColorStop(0, '#FFD93D');
            bgGradient.addColorStop(0.5, '#FF8C32');
            bgGradient.addColorStop(1, '#FF6B6B');
            
            ctx.fillStyle = bgGradient;
            ctx.beginPath();
            ctx.roundRect(x - bgWidth / 2, y - bgHeight / 2, bgWidth, bgHeight, 13);
            ctx.fill();
            
            ctx.strokeStyle = '#FF6B6B';
            ctx.lineWidth = 2;
            ctx.stroke();
            
            ctx.fillStyle = '#5D4037';
            ctx.fillText(name, x, y);
        } else {
            ctx.fillStyle = 'rgba(77,150,255,0.85)';
            ctx.beginPath();
            ctx.roundRect(x - bgWidth / 2, y - bgHeight / 2, bgWidth, bgHeight, 13);
            ctx.fill();
            
            ctx.strokeStyle = '#6BCB77';
            ctx.lineWidth = 2;
            ctx.stroke();
            
            ctx.fillStyle = '#FFFACD';
            ctx.fillText(name, x, y);
        }
    }
    
    drawChatBubble(ctx, x, y, message) {
        ctx.font = 'bold 15px "Comic Sans MS", cursive';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        
        const textWidth = ctx.measureText(message).width;
        const padding = 15;
        const bubbleWidth = Math.min(textWidth + padding * 2, 180);
        const bubbleHeight = 40;
        
        const time = Date.now();
        const bounceOffset = Math.sin(time * 0.008) * 3;
        const bubbleY = y + bounceOffset;
        
        const cloudGradient = ctx.createRadialGradient(
            x, bubbleY - 5, 0,
            x, bubbleY, bubbleWidth / 2
        );
        cloudGradient.addColorStop(0, '#ffffff');
        cloudGradient.addColorStop(0.4, '#FFFACD');
        cloudGradient.addColorStop(0.7, '#FFE5B4');
        cloudGradient.addColorStop(1, '#FFDAB9');
        
        ctx.fillStyle = cloudGradient;
        
        ctx.beginPath();
        ctx.moveTo(x - bubbleWidth / 2 + 12, bubbleY - bubbleHeight / 2 + 8);
        ctx.quadraticCurveTo(x - bubbleWidth / 2 + 5, bubbleY - bubbleHeight / 2, x - bubbleWidth / 2 + 20, bubbleY - bubbleHeight / 2 + 5);
        ctx.quadraticCurveTo(x, bubbleY - bubbleHeight / 2 - 5, x + bubbleWidth / 2 - 20, bubbleY - bubbleHeight / 2 + 5);
        ctx.quadraticCurveTo(x + bubbleWidth / 2 - 5, bubbleY - bubbleHeight / 2, x + bubbleWidth / 2 - 12, bubbleY - bubbleHeight / 2 + 8);
        ctx.quadraticCurveTo(x + bubbleWidth / 2, bubbleY - 5, x + bubbleWidth / 2 - 12, bubbleY + bubbleHeight / 2 - 8);
        ctx.quadraticCurveTo(x + bubbleWidth / 2 - 5, bubbleY + bubbleHeight / 2, x + bubbleWidth / 2 - 25, bubbleY + bubbleHeight / 2 - 3);
        ctx.quadraticCurveTo(x + 15, bubbleY + bubbleHeight / 2 + 8, x + 8, bubbleY + bubbleHeight / 2 + 18);
        ctx.quadraticCurveTo(x, bubbleY + bubbleHeight / 2 + 22, x - 8, bubbleY + bubbleHeight / 2 + 18);
        ctx.quadraticCurveTo(x - 15, bubbleY + bubbleHeight / 2 + 8, x - bubbleWidth / 2 + 25, bubbleY + bubbleHeight / 2 - 3);
        ctx.quadraticCurveTo(x - bubbleWidth / 2 + 5, bubbleY + bubbleHeight / 2, x - bubbleWidth / 2 + 12, bubbleY + bubbleHeight / 2 - 8);
        ctx.quadraticCurveTo(x - bubbleWidth / 2, bubbleY - 5, x - bubbleWidth / 2 + 12, bubbleY - bubbleHeight / 2 + 8);
        ctx.fill();
        
        ctx.strokeStyle = '#FFD93D';
        ctx.lineWidth = 4;
        ctx.stroke();
        
        ctx.strokeStyle = 'rgba(255,140,50,0.5)';
        ctx.lineWidth = 2;
        ctx.stroke();
        
        ctx.fillStyle = 'rgba(255,255,255,0.35)';
        ctx.beginPath();
        ctx.ellipse(x - bubbleWidth * 0.2, bubbleY - bubbleHeight * 0.25, bubbleWidth * 0.15, bubbleHeight * 0.15, 0, 0, Math.PI * 2);
        ctx.fill();
        ctx.beginPath();
        ctx.ellipse(x + bubbleWidth * 0.15, bubbleY - bubbleHeight * 0.3, bubbleWidth * 0.1, bubbleHeight * 0.12, 0, 0, Math.PI * 2);
        ctx.fill();
        
        ctx.fillStyle = '#FFD93D';
        ctx.font = '10px Arial';
        const sparkleCount = 3;
        for (let i = 0; i < sparkleCount; i++) {
            const sx = x - bubbleWidth * 0.35 + (i * bubbleWidth * 0.25);
            const sy = bubbleY - bubbleHeight / 2 - 8 + Math.sin(time * 0.01 + i) * 2;
            ctx.fillText('✦', sx, sy);
        }
        
        ctx.fillStyle = '#5D4037';
        ctx.font = 'bold 15px "Comic Sans MS", cursive';
        ctx.fillText(message, x, bubbleY);
        
        ctx.fillStyle = 'rgba(255,255,255,0.3)';
        ctx.fillText(message, x + 1, bubbleY + 1);
    }
    
    lightenColor(color, percent) {
        const num = parseInt(color.replace('#', ''), 16);
        const amt = Math.round(2.55 * percent);
        const R = Math.min(255, (num >> 16) + amt);
        const G = Math.min(255, ((num >> 8) & 0x00FF) + amt);
        const B = Math.min(255, (num & 0x0000FF) + amt);
        return '#' + (0x1000000 + R * 0x10000 + G * 0x100 + B).toString(16).slice(1);
    }
    
    darkenColor(color, percent) {
        const num = parseInt(color.replace('#', ''), 16);
        const amt = Math.round(2.55 * percent);
        const R = Math.max(0, (num >> 16) - amt);
        const G = Math.max(0, ((num >> 8) & 0x00FF) - amt);
        const B = Math.max(0, (num & 0x0000FF) - amt);
        return '#' + (0x1000000 + R * 0x10000 + G * 0x100 + B).toString(16).slice(1);
    }
}

window.getStatusWithDefaults = getStatusWithDefaults;
window.getPositionWithDefaults = getPositionWithDefaults;
window.DEFAULT_STATUS = DEFAULT_STATUS;
window.DEFAULT_POSITION = DEFAULT_POSITION;