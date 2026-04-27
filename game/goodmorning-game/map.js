class MapManager {
    constructor(game) {
        this.game = game;
        
        this.width = 50;
        this.height = 50;
        this.tileSize = 32;
        this.tiles = [];
        this.tileTypes = {};
        
        this.offscreenCanvas = null;
        this.offscreenCtx = null;
        this.prerendered = false;
        
        this.decorations = [];
        this.clouds = [];
        this.animationTime = 0;
        
        this.texturesLoaded = false;
        
        this.lastRenderTime = 0;
        this.renderInterval = 16;
    }
    
    loadMap(mapData) {
        if (!mapData) {
            this.loadDefaultMap();
            return;
        }
        
        this.width = mapData.width || 50;
        this.height = mapData.height || 50;
        this.tileSize = mapData.tileSize || 32;
        this.tiles = mapData.tiles || [];
        this.tileTypes = mapData.tileTypes || this.getDefaultTileTypes();
        
        if (this.tiles.length === 0) {
            this.generateDefaultTiles();
        }
        
        this.generateDecorations();
        this.prerender();
    }
    
    getDefaultTileTypes() {
        return {
            "1": { name: "grass", walkable: true, color: "#7cba5f" },
            "2": { name: "flower", walkable: true, color: "#f5a5d8" },
            "3": { name: "water", walkable: false, color: "#5dade2" },
            "4": { name: "tree", walkable: false, color: "#2d5016" },
            "5": { name: "path", walkable: true, color: "#c9b896" },
            "6": { name: "house_floor", walkable: true, color: "#e8e0d0" },
            "7": { name: "rock", walkable: false, color: "#808080" },
            "8": { name: "mushroom", walkable: true, color: "#ff6b6b" },
            "9": { name: "fence", walkable: false, color: "#8B4513" }
        };
    }
    
    loadDefaultMap() {
        this.width = 50;
        this.height = 50;
        this.tileSize = 32;
        this.tileTypes = this.getDefaultTileTypes();
        this.generateDefaultTiles();
        this.generateDecorations();
        this.prerender();
    }
    
    generateDefaultTiles() {
        this.tiles = [];
        
        for (let y = 0; y < this.height; y++) {
            const row = [];
            for (let x = 0; x < this.width; x++) {
                if (x === 0 || x === this.width - 1 || y === 0 || y === this.height - 1) {
                    row.push(4);
                    continue;
                }
                
                const rand = Math.random();
                
                if (rand < 0.82) {
                    row.push(1);
                } else if (rand < 0.88) {
                    row.push(2);
                } else if (rand < 0.92) {
                    row.push(5);
                } else if (rand < 0.94) {
                    row.push(7);
                } else if (rand < 0.96) {
                    row.push(8);
                } else {
                    row.push(4);
                }
            }
            this.tiles.push(row);
        }
        
        const centerX = Math.floor(this.width / 2);
        const centerY = Math.floor(this.height / 2);
        
        for (let dy = -3; dy <= 3; dy++) {
            for (let dx = -3; dx <= 3; dx++) {
                if (dy === -3 || dy === 3 || dx === -3 || dx === 3) {
                    if (Math.abs(dx) <= 2 && Math.abs(dy) <= 2) {
                        this.tiles[centerY + dy][centerX + dx] = 2;
                    }
                } else {
                    this.tiles[centerY + dy][centerX + dx] = 5;
                }
            }
        }
        
        this.tiles[centerY - 4][centerX] = 4;
        this.tiles[centerY - 4][centerX - 1] = 4;
        this.tiles[centerY - 4][centerX + 1] = 4;
        
        for (let dy = 4; dy < 9; dy++) {
            for (let dx = 4; dx < 9; dx++) {
                if (dy === 4 || dy === 8 || dx === 4 || dx === 8) {
                    this.tiles[dy][dx] = 1;
                } else {
                    this.tiles[dy][dx] = 3;
                }
            }
        }
        
        for (let i = 0; i < 8; i++) {
            const fx = 2 + Math.floor(Math.random() * (this.width - 4));
            const fy = 2 + Math.floor(Math.random() * (this.height - 4));
            if (this.tiles[fy][fx] === 1) {
                this.tiles[fy][fx] = 9;
            }
        }
        
        for (let i = 0; i < 15; i++) {
            const mx = 2 + Math.floor(Math.random() * (this.width - 4));
            const my = 2 + Math.floor(Math.random() * (this.height - 4));
            if (this.tiles[my][mx] === 1) {
                this.tiles[my][mx] = 8;
            }
        }
    }
    
    generateDecorations() {
        this.decorations = [];
        
        for (let y = 0; y < this.height; y++) {
            for (let x = 0; x < this.width; x++) {
                const tileId = this.tiles[y][x];
                if (tileId === 1) {
                    if (Math.random() < 0.12) {
                        this.decorations.push({
                            type: 'small_flower',
                            x: x * this.tileSize + this.tileSize / 2 + (Math.random() - 0.5) * 12,
                            y: y * this.tileSize + this.tileSize / 2 + (Math.random() - 0.5) * 12,
                            color: Math.random() > 0.5 ? '#FF6B9D' : '#FFD93D'
                        });
                    }
                    if (Math.random() < 0.08) {
                        this.decorations.push({
                            type: 'clover',
                            x: x * this.tileSize + Math.random() * this.tileSize,
                            y: y * this.tileSize + Math.random() * this.tileSize
                        });
                    }
                }
            }
        }
        
        this.clouds = [];
        for (let i = 0; i < 6; i++) {
            this.clouds.push({
                x: Math.random() * this.width * this.tileSize,
                y: Math.random() * 250 + 40,
                width: 70 + Math.random() * 50,
                speed: 0.25 + Math.random() * 0.25,
                opacity: 0.5 + Math.random() * 0.3
            });
        }
        
        this.butterflies = [];
        for (let i = 0; i < 6; i++) {
            this.butterflies.push({
                x: Math.random() * this.width * this.tileSize,
                y: Math.random() * this.height * this.tileSize * 0.6 + 120,
                wingPhase: Math.random() * Math.PI * 2,
                moveAngle: Math.random() * Math.PI * 2,
                speed: 0.4 + Math.random() * 0.4,
                color: ['#FF6B9D', '#FFD93D', '#6BCB77', '#4D96FF'][Math.floor(Math.random() * 4)],
                size: 7 + Math.random() * 3
            });
        }
        
        this.birds = [];
        for (let i = 0; i < 4; i++) {
            this.birds.push({
                x: Math.random() * this.width * this.tileSize,
                y: 60 + Math.random() * 120,
                wingPhase: Math.random() * Math.PI * 2,
                speed: 0.8 + Math.random() * 1.2,
                size: 9 + Math.random() * 4
            });
        }
        
        this.sparkles = [];
        for (let i = 0; i < 12; i++) {
            this.sparkles.push({
                x: Math.random() * this.width * this.tileSize,
                y: Math.random() * this.height * this.tileSize,
                phase: Math.random() * Math.PI * 2,
                size: 2 + Math.random() * 2
            });
        }
        
        this.rainbowParticles = [];
        const centerX = this.width * this.tileSize / 2;
        const centerY = this.height * this.tileSize / 2;
        for (let i = 0; i < 8; i++) {
            this.rainbowParticles.push({
                x: centerX + (Math.random() - 0.5) * 400,
                y: centerY + (Math.random() - 0.5) * 400,
                phase: Math.random() * Math.PI * 2,
                color: ['#FF6B6B', '#FFD93D', '#6BCB77', '#4D96FF', '#FF6B9D'][Math.floor(Math.random() * 5)],
                size: 2.5 + Math.random() * 1.5
            });
        }
    }
    
    prerender() {
        this.offscreenCanvas = document.createElement('canvas');
        this.offscreenCanvas.width = this.width * this.tileSize;
        this.offscreenCanvas.height = this.height * this.tileSize;
        this.offscreenCtx = this.offscreenCanvas.getContext('2d');
        
        this.drawSkyBackground(this.offscreenCtx);
        
        for (let y = 0; y < this.height; y++) {
            for (let x = 0; x < this.width; x++) {
                const tileId = this.tiles[y][x];
                const tileType = this.tileTypes[tileId.toString()];
                
                if (tileType) {
                    this.drawTile(this.offscreenCtx, x, y, tileType);
                }
            }
        }
        
        this.drawGroundShadows(this.offscreenCtx);
        
        this.prerendered = true;
    }
    
    drawSkyBackground(ctx) {
        const skyGradient = ctx.createLinearGradient(0, 0, 0, this.height * this.tileSize);
        skyGradient.addColorStop(0, '#87CEEB');
        skyGradient.addColorStop(0.15, '#B0E0E6');
        skyGradient.addColorStop(0.3, '#98FB98');
        skyGradient.addColorStop(0.5, '#90EE90');
        skyGradient.addColorStop(1, '#7cba5f');
        
        ctx.fillStyle = skyGradient;
        ctx.fillRect(0, 0, this.width * this.tileSize, this.height * this.tileSize);
        
        ctx.fillStyle = 'rgba(255,255,255,0.3)';
        ctx.beginPath();
        ctx.arc(150, 80, 30, 0, Math.PI * 2);
        ctx.arc(180, 60, 20, 0, Math.PI * 2);
        ctx.arc(210, 75, 25, 0, Math.PI * 2);
        ctx.fill();
        
        ctx.fillStyle = 'rgba(255,255,255,0.2)';
        ctx.beginPath();
        ctx.arc(this.width * this.tileSize - 200, 100, 35, 0, Math.PI * 2);
        ctx.arc(this.width * this.tileSize - 170, 85, 22, 0, Math.PI * 2);
        ctx.fill();
    }
    
    drawGroundShadows(ctx) {
        for (let y = 0; y < this.height; y++) {
            for (let x = 0; x < this.width; x++) {
                const tileId = this.tiles[y][x];
                
                if (tileId === 4 || tileId === 7) {
                    ctx.fillStyle = 'rgba(0,0,0,0.1)';
                    ctx.beginPath();
                    ctx.ellipse(
                        x * this.tileSize + this.tileSize / 2 + 5,
                        y * this.tileSize + this.tileSize + 3,
                        this.tileSize * 0.4,
                        this.tileSize * 0.1,
                        0, 0, Math.PI * 2
                    );
                    ctx.fill();
                }
            }
        }
    }
    
    drawTile(ctx, x, y, tileType) {
        const px = x * this.tileSize;
        const py = y * this.tileSize;
        
        switch (tileType.name) {
            case 'grass':
                if (window.GrassTexture) {
                    GrassTexture.createLushGrass(ctx, px, py, this.tileSize);
                } else {
                    this.drawFallbackGrass(ctx, px, py);
                }
                break;
                
            case 'flower':
                if (window.FlowerTexture) {
                    const flowerType = Math.random();
                    if (flowerType < 0.5) {
                        FlowerTexture.createDaisy(ctx, px, py, this.tileSize);
                    } else if (flowerType < 0.8) {
                        FlowerTexture.createTulip(ctx, px, py, this.tileSize);
                    } else {
                        FlowerTexture.createButtercup(ctx, px, py, this.tileSize);
                    }
                } else {
                    this.drawFallbackFlower(ctx, px, py);
                }
                break;
                
            case 'water':
                if (window.WaterTexture) {
                    WaterTexture.createSparkle(ctx, px, py, this.tileSize, this.animationTime);
                } else {
                    this.drawFallbackWater(ctx, px, py);
                }
                break;
                
            case 'tree':
                if (window.TreeTexture) {
                    const treeType = Math.random();
                    if (treeType < 0.6) {
                        TreeTexture.createOakTree(ctx, px, py, this.tileSize);
                    } else if (treeType < 0.85) {
                        TreeTexture.createPineTree(ctx, px, py, this.tileSize);
                    } else {
                        TreeTexture.createCherryTree(ctx, px, py, this.tileSize);
                    }
                } else {
                    this.drawFallbackTree(ctx, px, py);
                }
                break;
                
            case 'path':
                this.drawCutePath(ctx, px, py);
                break;
                
            case 'rock':
                this.drawCuteRock(ctx, px, py);
                break;
                
            case 'mushroom':
                this.drawCuteMushroom(ctx, px, py);
                break;
                
            case 'fence':
                this.drawCuteFence(ctx, px, py);
                break;
                
            case 'house_floor':
                this.drawHouseFloor(ctx, px, py);
                break;
                
            default:
                ctx.fillStyle = tileType.color;
                ctx.fillRect(px, py, this.tileSize, this.tileSize);
        }
    }
    
    drawFallbackGrass(ctx, px, py) {
        const gradient = ctx.createLinearGradient(px, py, px, py + this.tileSize);
        gradient.addColorStop(0, '#8ed46a');
        gradient.addColorStop(1, '#7cba5f');
        
        ctx.fillStyle = gradient;
        ctx.fillRect(px, py, this.tileSize, this.tileSize);
        
        ctx.fillStyle = '#5a9a3f';
        for (let i = 0; i < 5; i++) {
            const gx = px + Math.random() * this.tileSize;
            const gy = py + Math.random() * this.tileSize;
            ctx.beginPath();
            ctx.moveTo(gx, gy);
            ctx.lineTo(gx - 2, gy - 5);
            ctx.lineTo(gx + 2, gy - 5);
            ctx.closePath();
            ctx.fill();
        }
    }
    
    drawFallbackFlower(ctx, px, py) {
        this.drawFallbackGrass(ctx, px, py);
        
        const centerX = px + this.tileSize / 2;
        const centerY = py + this.tileSize / 2;
        
        ctx.fillStyle = '#FF6B9D';
        for (let i = 0; i < 5; i++) {
            const angle = (i / 5) * Math.PI * 2;
            ctx.beginPath();
            ctx.ellipse(
                centerX + Math.cos(angle) * 5,
                centerY + Math.sin(angle) * 5,
                4, 3, angle, 0, Math.PI * 2
            );
            ctx.fill();
        }
        
        ctx.fillStyle = '#FFD93D';
        ctx.beginPath();
        ctx.arc(centerX, centerY, 3, 0, Math.PI * 2);
        ctx.fill();
    }
    
    drawFallbackWater(ctx, px, py) {
        const waterGradient = ctx.createRadialGradient(
            px + this.tileSize / 2, py + this.tileSize / 2, 0,
            px + this.tileSize / 2, py + this.tileSize / 2, this.tileSize / 2
        );
        waterGradient.addColorStop(0, '#5dade2');
        waterGradient.addColorStop(1, '#3498db');
        
        ctx.fillStyle = waterGradient;
        ctx.fillRect(px, py, this.tileSize, this.tileSize);
        
        ctx.strokeStyle = 'rgba(255,255,255,0.4)';
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.moveTo(px + 5, py + this.tileSize / 2);
        ctx.bezierCurveTo(
            px + this.tileSize / 3, py + this.tileSize / 2 - 3,
            px + this.tileSize * 2 / 3, py + this.tileSize / 2 + 3,
            px + this.tileSize - 5, py + this.tileSize / 2
        );
        ctx.stroke();
    }
    
    drawFallbackTree(ctx, px, py) {
        this.drawFallbackGrass(ctx, px, py);
        
        ctx.fillStyle = '#8B4513';
        ctx.fillRect(px + this.tileSize / 2 - 4, py + this.tileSize / 2, 8, this.tileSize / 2);
        
        ctx.fillStyle = '#228B22';
        ctx.beginPath();
        ctx.arc(px + this.tileSize / 2, py + this.tileSize / 3, this.tileSize / 3, 0, Math.PI * 2);
        ctx.fill();
    }
    
    drawCutePath(ctx, px, py) {
        const pathGradient = ctx.createLinearGradient(px, py, px + this.tileSize, py + this.tileSize);
        pathGradient.addColorStop(0, '#FFE5B4');
        pathGradient.addColorStop(0.5, '#FFDAB9');
        pathGradient.addColorStop(1, '#D2B48C');
        
        ctx.fillStyle = pathGradient;
        ctx.beginPath();
        ctx.roundRect(px + 2, py + 2, this.tileSize - 4, this.tileSize - 4, 5);
        ctx.fill();
        
        ctx.fillStyle = '#C9B896';
        for (let i = 0; i < 8; i++) {
            const sx = px + 4 + Math.random() * (this.tileSize - 8);
            const sy = py + 4 + Math.random() * (this.tileSize - 8);
            ctx.beginPath();
            ctx.arc(sx, sy, 1 + Math.random() * 2, 0, Math.PI * 2);
            ctx.fill();
        }
        
        ctx.fillStyle = 'rgba(255,255,255,0.3)';
        ctx.beginPath();
        ctx.arc(px + 6, py + 6, 2, 0, Math.PI * 2);
        ctx.fill();
    }
    
    drawCuteRock(ctx, px, py) {
        this.drawFallbackGrass(ctx, px, py);
        
        const rockGradient = ctx.createRadialGradient(
            px + this.tileSize * 0.4, py + this.tileSize * 0.35, 0,
            px + this.tileSize * 0.5, py + this.tileSize * 0.5, this.tileSize * 0.4
        );
        rockGradient.addColorStop(0, '#B8B8B8');
        rockGradient.addColorStop(0.5, '#808080');
        rockGradient.addColorStop(1, '#606060');
        
        ctx.fillStyle = rockGradient;
        ctx.beginPath();
        ctx.moveTo(px + this.tileSize * 0.2, py + this.tileSize * 0.7);
        ctx.quadraticCurveTo(px + this.tileSize * 0.1, py + this.tileSize * 0.4, px + this.tileSize * 0.35, py + this.tileSize * 0.2);
        ctx.quadraticCurveTo(px + this.tileSize * 0.5, py + this.tileSize * 0.15, px + this.tileSize * 0.65, py + this.tileSize * 0.25);
        ctx.quadraticCurveTo(px + this.tileSize * 0.85, py + this.tileSize * 0.4, px + this.tileSize * 0.75, py + this.tileSize * 0.7);
        ctx.quadraticCurveTo(px + this.tileSize * 0.5, py + this.tileSize * 0.85, px + this.tileSize * 0.2, py + this.tileSize * 0.7);
        ctx.fill();
        
        ctx.fillStyle = 'rgba(255,255,255,0.4)';
        ctx.beginPath();
        ctx.ellipse(px + this.tileSize * 0.35, py + this.tileSize * 0.3, this.tileSize * 0.12, this.tileSize * 0.06, -0.3, 0, Math.PI * 2);
        ctx.fill();
        
        ctx.fillStyle = 'rgba(0,0,0,0.2)';
        ctx.beginPath();
        ctx.ellipse(px + this.tileSize * 0.5, py + this.tileSize * 0.75, this.tileSize * 0.3, this.tileSize * 0.08, 0, 0, Math.PI * 2);
        ctx.fill();
    }
    
    drawCuteMushroom(ctx, px, py) {
        if (window.GrassTexture) {
            GrassTexture.createGrassPatch(ctx, px, py, this.tileSize);
        } else {
            this.drawFallbackGrass(ctx, px, py);
        }
        
        const centerX = px + this.tileSize / 2;
        
        ctx.fillStyle = '#F5F5F5';
        ctx.fillRect(centerX - 3, py + this.tileSize * 0.5, 6, this.tileSize * 0.35);
        
        const capGradient = ctx.createRadialGradient(
            centerX - 3, py + this.tileSize * 0.35, 0,
            centerX, py + this.tileSize * 0.35, this.tileSize * 0.25
        );
        capGradient.addColorStop(0, '#FF8C32');
        capGradient.addColorStop(0.6, '#FF6B6B');
        capGradient.addColorStop(1, '#FF6B9D');
        
        ctx.fillStyle = capGradient;
        ctx.beginPath();
        ctx.moveTo(px + this.tileSize * 0.15, py + this.tileSize * 0.5);
        ctx.quadraticCurveTo(px + this.tileSize * 0.1, py + this.tileSize * 0.25, centerX, py + this.tileSize * 0.2);
        ctx.quadraticCurveTo(px + this.tileSize * 0.9, py + this.tileSize * 0.25, px + this.tileSize * 0.85, py + this.tileSize * 0.5);
        ctx.quadraticCurveTo(centerX, py + this.tileSize * 0.55, px + this.tileSize * 0.15, py + this.tileSize * 0.5);
        ctx.fill();
        
        ctx.fillStyle = '#ffffff';
        ctx.beginPath();
        ctx.arc(px + this.tileSize * 0.25, py + this.tileSize * 0.35, 2, 0, Math.PI * 2);
        ctx.arc(px + this.tileSize * 0.4, py + this.tileSize * 0.28, 2.5, 0, Math.PI * 2);
        ctx.arc(centerX + 5, py + this.tileSize * 0.32, 2, 0, Math.PI * 2);
        ctx.fill();
        
        ctx.fillStyle = 'rgba(255,255,255,0.3)';
        ctx.beginPath();
        ctx.arc(centerX - 4, py + this.tileSize * 0.25, 3, 0, Math.PI * 2);
        ctx.fill();
    }
    
    drawCuteFence(ctx, px, py) {
        if (window.GrassTexture) {
            GrassTexture.createGrassPatch(ctx, px, py, this.tileSize);
        } else {
            this.drawFallbackGrass(ctx, px, py);
        }
        
        ctx.fillStyle = '#8B4513';
        
        ctx.fillRect(px + 4, py + this.tileSize * 0.3, 4, this.tileSize * 0.6);
        ctx.fillRect(px + this.tileSize - 8, py + this.tileSize * 0.3, 4, this.tileSize * 0.6);
        
        ctx.fillRect(px + this.tileSize * 0.25, py + this.tileSize * 0.25, 3, this.tileSize * 0.65);
        ctx.fillRect(px + this.tileSize * 0.6, py + this.tileSize * 0.25, 3, this.tileSize * 0.65);
        
        const plankGradient = ctx.createLinearGradient(px, py, px, py + this.tileSize);
        plankGradient.addColorStop(0, '#A0522D');
        plankGradient.addColorStop(0.5, '#8B4513');
        plankGradient.addColorStop(1, '#5D4037');
        
        ctx.fillStyle = plankGradient;
        
        ctx.beginPath();
        ctx.roundRect(px + 2, py + this.tileSize * 0.35, this.tileSize - 4, 6, 3);
        ctx.fill();
        
        ctx.beginPath();
        ctx.roundRect(px + 2, py + this.tileSize * 0.55, this.tileSize - 4, 6, 3);
        ctx.fill();
        
        ctx.fillStyle = 'rgba(255,255,255,0.2)';
        ctx.fillRect(px + 5, py + this.tileSize * 0.36, this.tileSize * 0.25, 3);
        ctx.fillRect(px + 5, py + this.tileSize * 0.56, this.tileSize * 0.25, 3);
    }
    
    drawHouseFloor(ctx, px, py) {
        const floorGradient = ctx.createLinearGradient(px, py, px + this.tileSize, py + this.tileSize);
        floorGradient.addColorStop(0, '#FFF8DC');
        floorGradient.addColorStop(0.5, '#FFE5B4');
        floorGradient.addColorStop(1, '#FFDAB9');
        
        ctx.fillStyle = floorGradient;
        ctx.fillRect(px, py, this.tileSize, this.tileSize);
        
        ctx.strokeStyle = '#D2B48C';
        ctx.lineWidth = 1;
        
        ctx.beginPath();
        ctx.moveTo(px, py + this.tileSize / 2);
        ctx.lineTo(px + this.tileSize, py + this.tileSize / 2);
        ctx.stroke();
        
        ctx.beginPath();
        ctx.moveTo(px + this.tileSize / 2, py);
        ctx.lineTo(px + this.tileSize / 2, py + this.tileSize);
        ctx.stroke();
        
        ctx.fillStyle = 'rgba(255,255,255,0.3)';
        ctx.fillRect(px + 2, py + 2, this.tileSize / 2 - 4, this.tileSize / 2 - 4);
    }
    
    render(ctx, camera) {
        if (!this.tiles || this.tiles.length === 0) {
            this.loadDefaultMap();
        }
        
        const currentTime = Date.now();
        if (currentTime - this.lastRenderTime < this.renderInterval) {
            if (!this.prerendered || !this.offscreenCanvas) {
                this.renderDirect(ctx, camera);
                return;
            }
            
            ctx.drawImage(
                this.offscreenCanvas,
                camera.x, camera.y,
                ctx.canvas.width, ctx.canvas.height,
                0, 0,
                ctx.canvas.width, ctx.canvas.height
            );
            
            this.drawAnimatedWater(ctx, camera);
            return;
        }
        this.lastRenderTime = currentTime;
        
        this.animationTime += this.renderInterval;
        
        this.drawAnimatedClouds(ctx, camera);
        
        this.drawAnimatedBirds(ctx, camera);
        
        if (!this.prerendered || !this.offscreenCanvas) {
            this.renderDirect(ctx, camera);
            return;
        }
        
        ctx.drawImage(
            this.offscreenCanvas,
            camera.x, camera.y,
            ctx.canvas.width, ctx.canvas.height,
            0, 0,
            ctx.canvas.width, ctx.canvas.height
        );
        
        this.drawAnimatedWater(ctx, camera);
        
        this.drawAnimatedButterflies(ctx, camera);
        
        this.drawSparkles(ctx, camera);
        
        this.drawRainbowParticles(ctx, camera);
    }
    
    drawAnimatedClouds(ctx, camera) {
        ctx.save();
        
        this.clouds.forEach(cloud => {
            cloud.x += cloud.speed;
            if (cloud.x > this.width * this.tileSize) {
                cloud.x = -cloud.width;
            }
            
            const screenX = cloud.x - camera.x * 0.3;
            const screenY = cloud.y;
            
            ctx.fillStyle = 'rgba(255,255,255,0.6)';
            ctx.beginPath();
            ctx.arc(screenX, screenY, cloud.width * 0.3, 0, Math.PI * 2);
            ctx.arc(screenX + cloud.width * 0.25, screenY - 5, cloud.width * 0.25, 0, Math.PI * 2);
            ctx.arc(screenX + cloud.width * 0.5, screenY, cloud.width * 0.28, 0, Math.PI * 2);
            ctx.fill();
        });
        
        ctx.restore();
    }
    
    drawAnimatedWater(ctx, camera) {
        const startX = Math.floor(camera.x / this.tileSize);
        const startY = Math.floor(camera.y / this.tileSize);
        const endX = Math.min(startX + Math.ceil(ctx.canvas.width / this.tileSize) + 1, this.width);
        const endY = Math.min(startY + Math.ceil(ctx.canvas.height / this.tileSize) + 1, this.height);
        
        for (let y = Math.max(0, startY); y < endY; y++) {
            for (let x = Math.max(0, startX); x < endX; x++) {
                const tileId = this.tiles[y][x];
                if (tileId === 3) {
                    const px = x * this.tileSize - camera.x;
                    const py = y * this.tileSize - camera.y;
                    
                    ctx.strokeStyle = 'rgba(255,255,255,0.5)';
                    ctx.lineWidth = 1;
                    
                    const waveOffset = (this.animationTime * 0.002) % (Math.PI * 2);
                    
                    for (let w = 0; w < 2; w++) {
                        const waveY = py + this.tileSize * (0.3 + w * 0.4);
                        ctx.beginPath();
                        ctx.moveTo(px, waveY);
                        for (let wx = 0; wx <= this.tileSize; wx += 4) {
                            const wy = waveY + Math.sin((wx / this.tileSize) * Math.PI * 2 + waveOffset + w) * 2;
                            ctx.lineTo(px + wx, wy);
                        }
                        ctx.stroke();
                    }
                    
                    ctx.fillStyle = 'rgba(255,255,255,0.6)';
                    const sparkleCount = 3;
                    for (let i = 0; i < sparkleCount; i++) {
                        const sx = px + this.tileSize * 0.2 + (i * this.tileSize * 0.25);
                        const sy = py + this.tileSize * 0.3 + Math.sin(this.animationTime * 0.003 + i) * this.tileSize * 0.15;
                        const sparkleSize = 1.5 + Math.abs(Math.sin(this.animationTime * 0.005 + i)) * 1.5;
                        
                        ctx.beginPath();
                        ctx.moveTo(sx, sy - sparkleSize);
                        ctx.lineTo(sx + sparkleSize * 0.3, sy);
                        ctx.lineTo(sx, sy + sparkleSize);
                        ctx.lineTo(sx - sparkleSize * 0.3, sy);
                        ctx.closePath();
                        ctx.fill();
                    }
                }
            }
        }
    }
    
    renderDirect(ctx, camera) {
        if (!this.tiles || this.tiles.length === 0) {
            this.loadDefaultMap();
        }
        
        this.drawSkyBackgroundDirect(ctx, camera);
        
        const startX = Math.floor(camera.x / this.tileSize);
        const startY = Math.floor(camera.y / this.tileSize);
        const endX = Math.min(startX + Math.ceil(ctx.canvas.width / this.tileSize) + 1, this.width);
        const endY = Math.min(startY + Math.ceil(ctx.canvas.height / this.tileSize) + 1, this.height);
        
        for (let y = Math.max(0, startY); y < endY; y++) {
            for (let x = Math.max(0, startX); x < endX; x++) {
                const tileId = this.tiles[y][x];
                const tileType = this.tileTypes[tileId.toString()];
                
                if (tileType) {
                    const px = x * this.tileSize - camera.x;
                    const py = y * this.tileSize - camera.y;
                    
                    this.drawTile(ctx, x, y, tileType);
                }
            }
        }
    }
    
    drawSkyBackgroundDirect(ctx, camera) {
        const skyGradient = ctx.createLinearGradient(0, 0, 0, ctx.canvas.height);
        skyGradient.addColorStop(0, '#87CEEB');
        skyGradient.addColorStop(0.3, '#B0E0E6');
        skyGradient.addColorStop(0.6, '#98FB98');
        skyGradient.addColorStop(1, '#90EE90');
        
        ctx.fillStyle = skyGradient;
        ctx.fillRect(0, 0, ctx.canvas.width, ctx.canvas.height);
    }
    
    drawAnimatedButterflies(ctx, camera) {
        if (!this.butterflies) return;
        
        ctx.save();
        
        this.butterflies.forEach(butterfly => {
            butterfly.wingPhase += 0.15;
            butterfly.x += Math.cos(butterfly.moveAngle) * butterfly.speed;
            butterfly.y += Math.sin(butterfly.moveAngle) * butterfly.speed;
            
            butterfly.moveAngle += (Math.random() - 0.5) * 0.1;
            
            if (butterfly.x < -50) butterfly.x = this.width * this.tileSize + 50;
            if (butterfly.x > this.width * this.tileSize + 50) butterfly.x = -50;
            if (butterfly.y < -50) butterfly.y = this.height * this.tileSize + 50;
            if (butterfly.y > this.height * this.tileSize + 50) butterfly.y = -50;
            
            const screenX = butterfly.x - camera.x;
            const screenY = butterfly.y - camera.y;
            
            if (screenX < -20 || screenX > ctx.canvas.width + 20 ||
                screenY < -20 || screenY > ctx.canvas.height + 20) {
                return;
            }
            
            const wingScale = Math.abs(Math.sin(butterfly.wingPhase)) * 0.7 + 0.3;
            
            ctx.fillStyle = butterfly.color;
            
            ctx.save();
            ctx.translate(screenX, screenY);
            
            ctx.beginPath();
            ctx.scale(wingScale, 1);
            ctx.ellipse(-butterfly.size * 0.6, 0, butterfly.size * 0.7, butterfly.size * 0.5, -0.2, 0, Math.PI * 2);
            ctx.fill();
            
            ctx.beginPath();
            ctx.scale(1 / wingScale, 1);
            ctx.scale(wingScale, 1);
            ctx.ellipse(butterfly.size * 0.6, 0, butterfly.size * 0.7, butterfly.size * 0.5, 0.2, 0, Math.PI * 2);
            ctx.fill();
            
            ctx.scale(1 / wingScale, 1);
            
            ctx.fillStyle = 'rgba(0,0,0,0.5)';
            ctx.beginPath();
            ctx.ellipse(0, 0, butterfly.size * 0.15, butterfly.size * 0.4, 0, 0, Math.PI * 2);
            ctx.fill();
            
            ctx.fillStyle = 'rgba(255,255,255,0.4)';
            ctx.beginPath();
            ctx.ellipse(-butterfly.size * 0.5 * wingScale, -butterfly.size * 0.15, butterfly.size * 0.2, butterfly.size * 0.1, 0, 0, Math.PI * 2);
            ctx.fill();
            
            ctx.restore();
        });
        
        ctx.restore();
    }
    
    drawAnimatedBirds(ctx, camera) {
        if (!this.birds) return;
        
        ctx.save();
        
        this.birds.forEach(bird => {
            bird.wingPhase += 0.2;
            bird.x += bird.speed;
            
            if (bird.x > this.width * this.tileSize + 100) {
                bird.x = -100;
                bird.y = 50 + Math.random() * 150;
            }
            
            const screenX = bird.x - camera.x * 0.5;
            const screenY = bird.y;
            
            if (screenX < -30 || screenX > ctx.canvas.width + 30) {
                return;
            }
            
            const wingY = Math.sin(bird.wingPhase) * 4;
            
            ctx.fillStyle = '#5D4037';
            
            ctx.beginPath();
            ctx.moveTo(screenX - bird.size, screenY + wingY);
            ctx.quadraticCurveTo(screenX - bird.size * 0.5, screenY - bird.size * 0.3, screenX, screenY);
            ctx.quadraticCurveTo(screenX + bird.size * 0.5, screenY - bird.size * 0.3, screenX + bird.size, screenY + wingY);
            ctx.quadraticCurveTo(screenX + bird.size * 0.7, screenY + wingY + 2, screenX + bird.size, screenY + wingY);
            ctx.fill();
            
            ctx.fillStyle = '#333333';
            ctx.beginPath();
            ctx.arc(screenX + bird.size * 1.1, screenY - 1, 2, 0, Math.PI * 2);
            ctx.fill();
            
            ctx.fillStyle = 'rgba(255,255,255,0.3)';
            ctx.beginPath();
            ctx.arc(screenX - bird.size * 0.5, screenY - wingY * 0.5 - 2, 2, 0, Math.PI * 2);
            ctx.fill();
        });
        
        ctx.restore();
    }
    
    drawSparkles(ctx, camera) {
        if (!this.sparkles) return;
        
        ctx.save();
        
        this.sparkles.forEach(sparkle => {
            sparkle.phase += 0.05;
            
            const screenX = sparkle.x - camera.x;
            const screenY = sparkle.y - camera.y;
            
            if (screenX < -10 || screenX > ctx.canvas.width + 10 ||
                screenY < -10 || screenY > ctx.canvas.height + 10) {
                return;
            }
            
            const opacity = 0.3 + Math.abs(Math.sin(sparkle.phase)) * 0.5;
            const scale = 0.8 + Math.abs(Math.sin(sparkle.phase)) * 0.4;
            
            ctx.fillStyle = `rgba(255,217,61,${opacity})`;
            ctx.font = `${sparkle.size * scale}px Arial`;
            ctx.fillText('✦', screenX, screenY);
            
            if (Math.sin(sparkle.phase) > 0.8) {
                ctx.fillStyle = `rgba(255,255,255,${opacity * 0.5})`;
                ctx.font = `${sparkle.size * scale * 0.5}px Arial`;
                ctx.fillText('✦', screenX + 2, screenY - 2);
            }
        });
        
        ctx.restore();
    }
    
    drawRainbowParticles(ctx, camera) {
        if (!this.rainbowParticles) return;
        
        ctx.save();
        
        this.rainbowParticles.forEach(particle => {
            particle.phase += 0.03;
            
            const screenX = particle.x - camera.x + Math.sin(particle.phase) * 20;
            const screenY = particle.y - camera.y + Math.cos(particle.phase) * 15;
            
            if (screenX < -10 || screenX > ctx.canvas.width + 10 ||
                screenY < -10 || screenY > ctx.canvas.height + 10) {
                return;
            }
            
            const opacity = 0.4 + Math.abs(Math.sin(particle.phase)) * 0.4;
            
            ctx.fillStyle = particle.color;
            ctx.globalAlpha = opacity;
            
            ctx.beginPath();
            ctx.arc(screenX, screenY, particle.size, 0, Math.PI * 2);
            ctx.fill();
            
            ctx.fillStyle = 'rgba(255,255,255,0.5)';
            ctx.beginPath();
            ctx.arc(screenX - particle.size * 0.3, screenY - particle.size * 0.3, particle.size * 0.3, 0, Math.PI * 2);
            ctx.fill();
            
            ctx.globalAlpha = 1;
        });
        
        ctx.restore();
    }
    
    isWalkable(x, y) {
        const tileX = Math.floor(x / this.tileSize);
        const tileY = Math.floor(y / this.tileSize);
        
        if (tileX < 0 || tileX >= this.width || tileY < 0 || tileY >= this.height) {
            return false;
        }
        
        const tileId = this.tiles[tileY][tileX];
        const tileType = this.tileTypes[tileId.toString()];
        
        if (!tileType) {
            return false;
        }
        
        return tileType.walkable;
    }
    
    getTileName(x, y) {
        const tileX = Math.floor(x / this.tileSize);
        const tileY = Math.floor(y / this.tileSize);
        
        if (tileX < 0 || tileX >= this.width || tileY < 0 || tileY >= this.height) {
            return 'unknown';
        }
        
        const tileId = this.tiles[tileY][tileX];
        const tileType = this.tileTypes[tileId.toString()];
        
        return tileType?.name || 'unknown';
    }
    
    getTileCoords(x, y) {
        return {
            x: Math.floor(x / this.tileSize),
            y: Math.floor(y / this.tileSize)
        };
    }
    
    getWorldCoords(tileX, tileY) {
        return {
            x: tileX * this.tileSize + this.tileSize / 2,
            y: tileY * this.tileSize + this.tileSize / 2
        };
    }
    
    canBuildHouse(tileX, tileY) {
        if (tileX < 1 || tileX >= this.width - 1 || tileY < 1 || tileY >= this.height - 1) {
            return false;
        }
        
        const tileId = this.tiles[tileY][tileX];
        return tileId === 1;
    }
    
    buildHouse(tileX, tileY, width = 3, height = 3) {
        if (!this.canBuildHouse(tileX, tileY)) {
            return false;
        }
        
        for (let dy = 0; dy < height; dy++) {
            for (let dx = 0; dx < width; dx++) {
                if (!this.canBuildHouse(tileX + dx, tileY + dy)) {
                    return false;
                }
            }
        }
        
        for (let dy = 0; dy < height; dy++) {
            for (let dx = 0; dx < width; dx++) {
                this.tiles[tileY + dy][tileX + dx] = 6;
            }
        }
        
        this.prerender();
        
        return true;
    }
    
    removeHouse(tileX, tileY, width = 3, height = 3) {
        for (let dy = 0; dy < height; dy++) {
            for (let dx = 0; dx < width; dx++) {
                if (tileY + dy < this.height && tileX + dx < this.width) {
                    this.tiles[tileY + dy][tileX + dx] = 1;
                }
            }
        }
        
        this.prerender();
        
        return true;
    }
    
    getMapData() {
        return {
            width: this.width,
            height: this.height,
            tileSize: this.tileSize,
            tiles: this.tiles,
            tileTypes: this.tileTypes
        };
    }
}