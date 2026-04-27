/**
 * MapManager - 地图管理
 * 管理地图数据、渲染、碰撞检测
 */

class MapManager {
    constructor(game) {
        this.game = game;
        
        // 地图数据
        this.width = 50;
        this.height = 50;
        this.tileSize = 32;
        this.tiles = [];
        this.tileTypes = {};
        
        // 离屏渲染（性能优化）
        this.offscreenCanvas = null;
        this.offscreenCtx = null;
        this.prerendered = false;
    }
    
    // 加载地图数据
    loadMap(mapData) {
        if (!mapData) {
            // 使用默认地图
            this.loadDefaultMap();
            return;
        }
        
        this.width = mapData.width || 50;
        this.height = mapData.height || 50;
        this.tileSize = mapData.tileSize || 32;
        this.tiles = mapData.tiles || [];
        this.tileTypes = mapData.tileTypes || this.getDefaultTileTypes();
        
        // 如果没有tiles数据，生成默认地图
        if (this.tiles.length === 0) {
            this.generateDefaultTiles();
        }
        
        // 预渲染地图
        this.prerender();
    }
    
    // 默认地形类型
    getDefaultTileTypes() {
        return {
            "1": { name: "grass", walkable: true, color: "#7cba5f" },
            "2": { name: "flower", walkable: true, color: "#f5a5d8" },
            "3": { name: "water", walkable: false, color: "#5dade2" },
            "4": { name: "tree", walkable: false, color: "#2d5016" },
            "5": { name: "path", walkable: true, color: "#c9b896" },
            "6": { name: "house_floor", walkable: true, color: "#e8e0d0" }
        };
    }
    
    // 加载默认地图
    loadDefaultMap() {
        this.width = 50;
        this.height = 50;
        this.tileSize = 32;
        this.tileTypes = this.getDefaultTileTypes();
        this.generateDefaultTiles();
        this.prerender();
    }
    
    // 生成默认地形
    generateDefaultTiles() {
        this.tiles = [];
        
        for (let y = 0; y < this.height; y++) {
            const row = [];
            for (let x = 0; x < this.width; x++) {
                // 边界放树木
                if (x === 0 || x === this.width - 1 || y === 0 || y === this.height - 1) {
                    row.push(4); // 树木
                    continue;
                }
                
                // 生成草地为主的地形
                const rand = Math.random();
                
                if (rand < 0.85) {
                    row.push(1); // 草地
                } else if (rand < 0.92) {
                    row.push(2); // 花草
                } else if (rand < 0.97) {
                    row.push(5); // 小路
                } else {
                    row.push(4); // 随机树木
                }
            }
            this.tiles.push(row);
        }
        
        // 添加一些特色区域
        
        // 中央小广场
        const centerX = Math.floor(this.width / 2);
        const centerY = Math.floor(this.height / 2);
        for (let dy = -2; dy <= 2; dy++) {
            for (let dx = -2; dx <= 2; dx++) {
                if (dy === -2 || dy === 2 || dx === -2 || dx === 2) {
                    // 边界放花草
                    this.tiles[centerY + dy][centerX + dx] = 2;
                } else {
                    // 内部放小路
                    this.tiles[centerY + dy][centerX + dx] = 5;
                }
            }
        }
        
        // 左上角小池塘
        for (let dy = 3; dy < 8; dy++) {
            for (let dx = 3; dx < 8; dx++) {
                if (dy === 3 || dy === 7 || dx === 3 || dx === 7) {
                    // 边界保持草地
                    this.tiles[dy][dx] = 1;
                } else {
                    // 内部放水
                    this.tiles[dy][dx] = 3;
                }
            }
        }
    }
    
    // 预渲染地图到离屏Canvas
    prerender() {
        this.offscreenCanvas = document.createElement('canvas');
        this.offscreenCanvas.width = this.width * this.tileSize;
        this.offscreenCanvas.height = this.height * this.tileSize;
        this.offscreenCtx = this.offscreenCanvas.getContext('2d');
        
        // 绘制每个格子
        for (let y = 0; y < this.height; y++) {
            for (let x = 0; x < this.width; x++) {
                const tileId = this.tiles[y][x];
                const tileType = this.tileTypes[tileId.toString()];
                
                if (tileType) {
                    this.drawTile(this.offscreenCtx, x, y, tileType);
                }
            }
        }
        
        this.prerendered = true;
    }
    
    // 绘制单个地形格子
    drawTile(ctx, x, y, tileType) {
        const px = x * this.tileSize;
        const py = y * this.tileSize;
        
        ctx.fillStyle = tileType.color;
        ctx.fillRect(px, py, this.tileSize, this.tileSize);
        
        // 根据地形类型添加装饰
        switch (tileType.name) {
            case 'grass':
                // 草地：添加一些小草纹理
                ctx.fillStyle = '#5a9a3f';
                for (let i = 0; i < 3; i++) {
                    const gx = px + Math.random() * this.tileSize;
                    const gy = py + Math.random() * this.tileSize;
                    ctx.beginPath();
                    ctx.moveTo(gx, gy);
                    ctx.lineTo(gx - 2, gy - 5);
                    ctx.lineTo(gx + 2, gy - 5);
                    ctx.closePath();
                    ctx.fill();
                }
                break;
                
            case 'flower':
                // 花草：添加花朵
                ctx.fillStyle = '#fff';
                const flowerX = px + this.tileSize / 2;
                const flowerY = py + this.tileSize / 2;
                ctx.beginPath();
                ctx.arc(flowerX, flowerY, 4, 0, Math.PI * 2);
                ctx.fill();
                
                // 花蕊
                ctx.fillStyle = '#ffeb3b';
                ctx.beginPath();
                ctx.arc(flowerX, flowerY, 2, 0, Math.PI * 2);
                ctx.fill();
                break;
                
            case 'water':
                // 水：添加波纹效果
                ctx.fillStyle = '#3498db';
                ctx.fillRect(px + 2, py + 2, this.tileSize - 4, this.tileSize - 4);
                
                // 波纹
                ctx.strokeStyle = '#fff';
                ctx.lineWidth = 1;
                ctx.beginPath();
                ctx.moveTo(px + 5, py + this.tileSize / 2);
                ctx.bezierCurveTo(
                    px + this.tileSize / 3, py + this.tileSize / 2 - 3,
                    px + this.tileSize * 2 / 3, py + this.tileSize / 2 + 3,
                    px + this.tileSize - 5, py + this.tileSize / 2
                );
                ctx.stroke();
                break;
                
            case 'tree':
                // 树木：绘制树
                // 树干
                ctx.fillStyle = '#8B4513';
                ctx.fillRect(px + this.tileSize / 2 - 4, py + this.tileSize / 2, 8, this.tileSize / 2);
                
                // 树冠
                ctx.fillStyle = '#228B22';
                ctx.beginPath();
                ctx.arc(px + this.tileSize / 2, py + this.tileSize / 3, this.tileSize / 3, 0, Math.PI * 2);
                ctx.fill();
                break;
                
            case 'path':
                // 小路：添加碎石纹理
                ctx.fillStyle = '#a89876';
                for (let i = 0; i < 5; i++) {
                    const sx = px + Math.random() * this.tileSize;
                    const sy = py + Math.random() * this.tileSize;
                    ctx.beginPath();
                    ctx.arc(sx, sy, 2, 0, Math.PI * 2);
                    ctx.fill();
                }
                break;
                
            case 'house_floor':
                // 房屋地板：添加格子纹理
                ctx.strokeStyle = '#ccc';
                ctx.lineWidth = 1;
                ctx.beginPath();
                ctx.moveTo(px, py + this.tileSize / 2);
                ctx.lineTo(px + this.tileSize, py + this.tileSize / 2);
                ctx.moveTo(px + this.tileSize / 2, py);
                ctx.lineTo(px + this.tileSize / 2, py + this.tileSize);
                ctx.stroke();
                break;
        }
        
        // 格子边框（可选）
        ctx.strokeStyle = 'rgba(0, 0, 0, 0.1)';
        ctx.lineWidth = 1;
        ctx.strokeRect(px, py, this.tileSize, this.tileSize);
    }
    
    // 渲染地图（到主Canvas）
    render(ctx, camera) {
        if (!this.prerendered || !this.offscreenCanvas) {
            // 如果没有预渲染，直接绘制
            this.renderDirect(ctx, camera);
            return;
        }
        
        // 使用预渲染的离屏Canvas
        ctx.drawImage(
            this.offscreenCanvas,
            camera.x, camera.y,                    // 源起始位置
            ctx.canvas.width, ctx.canvas.height,  // 源尺寸
            0, 0,                                  // 目标起始位置
            ctx.canvas.width, ctx.canvas.height    // 目标尺寸
        );
    }
    
    // 直接渲染（备用）
    renderDirect(ctx, camera) {
        // 计算可见区域
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
                    
                    ctx.fillStyle = tileType.color;
                    ctx.fillRect(px, py, this.tileSize, this.tileSize);
                }
            }
        }
    }
    
    // 碰撞检测：检查位置是否可通行
    isWalkable(x, y) {
        // 计算所在格子
        const tileX = Math.floor(x / this.tileSize);
        const tileY = Math.floor(y / this.tileSize);
        
        // 边界检查
        if (tileX < 0 || tileX >= this.width || tileY < 0 || tileY >= this.height) {
            return false;
        }
        
        // 获取地形类型
        const tileId = this.tiles[tileY][tileX];
        const tileType = this.tileTypes[tileId.toString()];
        
        if (!tileType) {
            return false;
        }
        
        return tileType.walkable;
    }
    
    // 获取地形类型名称
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
    
    // 获取格子坐标
    getTileCoords(x, y) {
        return {
            x: Math.floor(x / this.tileSize),
            y: Math.floor(y / this.tileSize)
        };
    }
    
    // 获取世界坐标（格子中心）
    getWorldCoords(tileX, tileY) {
        return {
            x: tileX * this.tileSize + this.tileSize / 2,
            y: tileY * this.tileSize + this.tileSize / 2
        };
    }
    
    // 预留：房屋建造功能
    // 目前只提供接口，不实现具体功能
    
    // 检查是否可以建造房屋
    canBuildHouse(tileX, tileY) {
        // 检查是否在边界内
        if (tileX < 1 || tileX >= this.width - 1 || tileY < 1 || tileY >= this.height - 1) {
            return false;
        }
        
        // 检查是否是草地（只能在草地上建造）
        const tileId = this.tiles[tileY][tileX];
        return tileId === 1; // 草地
    }
    
    // 建造房屋（预留）
    buildHouse(tileX, tileY, width = 3, height = 3) {
        if (!this.canBuildHouse(tileX, tileY)) {
            return false;
        }
        
        // 检查区域是否足够大
        for (let dy = 0; dy < height; dy++) {
            for (let dx = 0; dx < width; dx++) {
                if (!this.canBuildHouse(tileX + dx, tileY + dy)) {
                    return false;
                }
            }
        }
        
        // 建造房屋地板
        for (let dy = 0; dy < height; dy++) {
            for (let dx = 0; dx < width; dx++) {
                this.tiles[tileY + dy][tileX + dx] = 6; // house_floor
            }
        }
        
        // 重新预渲染
        this.prerender();
        
        return true;
    }
    
    // 拆除房屋（预留）
    removeHouse(tileX, tileY, width = 3, height = 3) {
        // 恢复为草地
        for (let dy = 0; dy < height; dy++) {
            for (let dx = 0; dx < width; dx++) {
                if (tileY + dy < this.height && tileX + dx < this.width) {
                    this.tiles[tileY + dy][tileX + dx] = 1; // grass
                }
            }
        }
        
        // 重新预渲染
        this.prerender();
        
        return true;
    }
    
    // 获取地图数据（用于保存到Gist）
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