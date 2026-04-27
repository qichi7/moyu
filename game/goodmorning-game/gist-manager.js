/**
 * GistManager - GitHub Gist数据管理
 * 管理三个Gist：状态、位置、地图
 */

class GistManager {
    constructor(game) {
        this.game = game;
        
        // 硬编码的Gist ID
        this.statusGistId = GoodMorningGame.STATUS_GIST_ID;
        this.positionGistId = GoodMorningGame.POSITION_GIST_ID;
        this.mapGistId = GoodMorningGame.MAP_GIST_ID;
        
        // Token存储
        this.token = sessionStorage.getItem('goodMorningToken') || '';
        
        // 文件名
        this.statusFilename = 'status-gist.json';
        this.positionFilename = 'position-gist.json';
        this.mapFilename = 'map-gist.json';
        
        // 缓存
        this.statusCache = null;
        this.positionCache = null;
        this.mapCache = null;
        this.cacheTime = 0;
        this.cacheExpire = 100; // 100ms缓存过期（高频刷新场景）
        
        // 请求节流
        this.lastRequestTime = 0;
        this.minRequestInterval = 50; // 最小请求间隔50ms
        
        // 请求队列（防止并发请求冲突）
        this.pendingRequests = new Map();
    }
    
    // ========== Token管理 ==========
    
    setToken(token) {
        this.token = token;
        sessionStorage.setItem('goodMorningToken', token);
    }
    
    getToken() {
        return this.token;
    }
    
    clearToken() {
        this.token = '';
        sessionStorage.removeItem('goodMorningToken');
    }
    
    // ========== 请求节流 ==========
    
    async throttle() {
        const now = Date.now();
        const elapsed = now - this.lastRequestTime;
        if (elapsed < this.minRequestInterval) {
            await new Promise(r => setTimeout(r, this.minRequestInterval - elapsed));
        }
        this.lastRequestTime = Date.now();
    }
    
    // 检查是否有相同请求正在进行
    async checkPendingRequest(key) {
        if (this.pendingRequests.has(key)) {
            return await this.pendingRequests.get(key);
        }
        return null;
    }
    
    // ========== 状态Gist操作 ==========
    
    async readStatus() {
        const key = 'readStatus';
        const pending = await this.checkPendingRequest(key);
        if (pending) return pending;
        
        // 检查缓存
        const now = Date.now();
        if (this.statusCache && (now - this.cacheTime) < this.cacheExpire) {
            return this.statusCache;
        }
        
        const request = this._doReadStatus();
        this.pendingRequests.set(key, request);
        
        try {
            const result = await request;
            this.statusCache = result;
            this.cacheTime = now;
            return result;
        } finally {
            this.pendingRequests.delete(key);
        }
    }
    
    async _doReadStatus() {
        if (!this.statusGistId) {
            console.error('状态Gist ID未配置');
            return { players: {} };
        }
        
        await this.throttle();
        
        try {
            const apiUrl = `https://api.github.com/gists/${this.statusGistId}`;
            const response = await fetch(apiUrl);
            
            if (!response.ok) {
                console.error('读取状态Gist失败:', response.status);
                return this.statusCache || { players: {} };
            }
            
            const gist = await response.json();
            
            if (gist.files && gist.files[this.statusFilename]) {
                const content = gist.files[this.statusFilename].content;
                return JSON.parse(content);
            }
            
            return { players: {} };
        } catch (e) {
            console.error('读取状态Gist异常:', e);
            return this.statusCache || { players: {} };
        }
    }
    
    async writeStatus(name, status) {
        const key = `writeStatus_${name}`;
        const pending = await this.checkPendingRequest(key);
        if (pending) return pending;
        
        const request = this._doWriteStatus(name, status);
        this.pendingRequests.set(key, request);
        
        try {
            const result = await request;
            // 写入后清除缓存
            this.statusCache = null;
            return result;
        } finally {
            this.pendingRequests.delete(key);
        }
    }
    
    async _doWriteStatus(name, status) {
        if (!this.statusGistId) {
            console.error('状态Gist ID未配置');
            return false;
        }
        
        if (!this.token) {
            console.error('需要Token才能写入数据');
            return false;
        }
        
        await this.throttle();
        
        try {
            // 先读取当前数据
            const currentData = await this.readStatus();
            
            // 更新指定玩家的状态
            currentData.players[name] = {
                ...status,
                lastUpdate: Date.now()
            };
            
            const apiUrl = `https://api.github.com/gists/${this.statusGistId}`;
            const response = await fetch(apiUrl, {
                method: 'PATCH',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `token ${this.token}`
                },
                body: JSON.stringify({
                    files: {
                        [this.statusFilename]: {
                            content: JSON.stringify(currentData, null, 2)
                        }
                    }
                })
            });
            
            if (!response.ok) {
                console.error('写入状态Gist失败:', response.status);
                return false;
            }
            
            return true;
        } catch (e) {
            console.error('写入状态Gist异常:', e);
            return false;
        }
    }
    
    // ========== 位置Gist操作 ==========
    
    async readPosition() {
        const key = 'readPosition';
        const pending = await this.checkPendingRequest(key);
        if (pending) return pending;
        
        // 检查缓存
        const now = Date.now();
        if (this.positionCache && (now - this.cacheTime) < this.cacheExpire) {
            return this.positionCache;
        }
        
        const request = this._doReadPosition();
        this.pendingRequests.set(key, request);
        
        try {
            const result = await request;
            this.positionCache = result;
            this.cacheTime = now;
            return result;
        } finally {
            this.pendingRequests.delete(key);
        }
    }
    
    async _doReadPosition() {
        if (!this.positionGistId) {
            console.error('位置Gist ID未配置');
            return { positions: {} };
        }
        
        await this.throttle();
        
        try {
            const apiUrl = `https://api.github.com/gists/${this.positionGistId}`;
            const response = await fetch(apiUrl);
            
            if (!response.ok) {
                console.error('读取位置Gist失败:', response.status);
                return this.positionCache || { positions: {} };
            }
            
            const gist = await response.json();
            
            if (gist.files && gist.files[this.positionFilename]) {
                const content = gist.files[this.positionFilename].content;
                return JSON.parse(content);
            }
            
            return { positions: {} };
        } catch (e) {
            console.error('读取位置Gist异常:', e);
            return this.positionCache || { positions: {} };
        }
    }
    
    async writePosition(name, position) {
        const key = `writePosition_${name}`;
        const pending = await this.checkPendingRequest(key);
        if (pending) return pending;
        
        const request = this._doWritePosition(name, position);
        this.pendingRequests.set(key, request);
        
        try {
            const result = await request;
            // 写入后清除缓存
            this.positionCache = null;
            return result;
        } finally {
            this.pendingRequests.delete(key);
        }
    }
    
    async _doWritePosition(name, position) {
        if (!this.positionGistId) {
            console.error('位置Gist ID未配置');
            return false;
        }
        
        if (!this.token) {
            console.error('需要Token才能写入数据');
            return false;
        }
        
        await this.throttle();
        
        try {
            // 先读取当前数据
            const currentData = await this.readPosition();
            
            // 更新指定玩家的位置
            currentData.positions[name] = {
                ...position,
                lastUpdate: Date.now()
            };
            
            const apiUrl = `https://api.github.com/gists/${this.positionGistId}`;
            const response = await fetch(apiUrl, {
                method: 'PATCH',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `token ${this.token}`
                },
                body: JSON.stringify({
                    files: {
                        [this.positionFilename]: {
                            content: JSON.stringify(currentData, null, 2)
                        }
                    }
                })
            });
            
            if (!response.ok) {
                console.error('写入位置Gist失败:', response.status);
                return false;
            }
            
            return true;
        } catch (e) {
            console.error('写入位置Gist异常:', e);
            return false;
        }
    }
    
    // ========== 地图Gist操作 ==========
    
    async readMap() {
        const key = 'readMap';
        const pending = await this.checkPendingRequest(key);
        if (pending) return pending;
        
        // 检查缓存
        const now = Date.now();
        if (this.mapCache && (now - this.cacheTime) < 5000) { // 地图缓存5秒
            return this.mapCache;
        }
        
        const request = this._doReadMap();
        this.pendingRequests.set(key, request);
        
        try {
            const result = await request;
            this.mapCache = result;
            this.cacheTime = now;
            return result;
        } finally {
            this.pendingRequests.delete(key);
        }
    }
    
    async _doReadMap() {
        if (!this.mapGistId) {
            console.error('地图Gist ID未配置');
            return this.getDefaultMap();
        }
        
        await this.throttle();
        
        try {
            const apiUrl = `https://api.github.com/gists/${this.mapGistId}`;
            const response = await fetch(apiUrl);
            
            if (!response.ok) {
                console.error('读取地图Gist失败:', response.status);
                return this.mapCache || this.getDefaultMap();
            }
            
            const gist = await response.json();
            
            if (gist.files && gist.files[this.mapFilename]) {
                const content = gist.files[this.mapFilename].content;
                return JSON.parse(content);
            }
            
            return this.getDefaultMap();
        } catch (e) {
            console.error('读取地图Gist异常:', e);
            return this.mapCache || this.getDefaultMap();
        }
    }
    
    // 默认地图（备用）
    getDefaultMap() {
        const width = 50;
        const height = 50;
        const tiles = [];
        
        // 生成简单的草地和花草地图
        for (let y = 0; y < height; y++) {
            const row = [];
            for (let x = 0; x < width; x++) {
                // 90%草地，10%花草
                if (Math.random() < 0.9) {
                    row.push(1); // 草地
                } else {
                    row.push(2); // 花草
                }
            }
            tiles.push(row);
        }
        
        return {
            width,
            height,
            tileSize: 32,
            tiles,
            tileTypes: {
                "1": { name: "grass", walkable: true, color: "#7cba5f" },
                "2": { name: "flower", walkable: true, color: "#f5a5d8" }
            }
        };
    }
    
    // ========== 名称修改（同步两个Gist） ==========
    
    async changeName(oldName, newName) {
        if (!oldName || !newName || oldName === newName) {
            return false;
        }
        
        if (newName.length < 3 || newName.length > 12) {
            return false;
        }
        
        this.game.showLoadingOverlay('修改名称...');
        
        try {
            // 读取两个Gist的当前数据
            const statusData = await this.readStatus();
            const positionData = await this.readPosition();
            
            // 检查新名称是否已存在
            if (statusData.players[newName] || positionData.positions[newName]) {
                this.game.showToast('该名称已被使用', 'warning');
                return false;
            }
            
            // 更新状态Gist中的名称
            if (statusData.players[oldName]) {
                statusData.players[newName] = statusData.players[oldName];
                delete statusData.players[oldName];
            }
            
            // 更新位置Gist中的名称
            if (positionData.positions[oldName]) {
                positionData.positions[newName] = positionData.positions[oldName];
                delete positionData.positions[oldName];
            }
            
            // 写入状态Gist
            const statusApiUrl = `https://api.github.com/gists/${this.statusGistId}`;
            const statusResponse = await fetch(statusApiUrl, {
                method: 'PATCH',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `token ${this.token}`
                },
                body: JSON.stringify({
                    files: {
                        [this.statusFilename]: {
                            content: JSON.stringify(statusData, null, 2)
                        }
                    }
                })
            });
            
            if (!statusResponse.ok) {
                console.error('修改状态Gist名称失败');
                return false;
            }
            
            // 写入位置Gist
            const positionApiUrl = `https://api.github.com/gists/${this.positionGistId}`;
            const positionResponse = await fetch(positionApiUrl, {
                method: 'PATCH',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `token ${this.token}`
                },
                body: JSON.stringify({
                    files: {
                        [this.positionFilename]: {
                            content: JSON.stringify(positionData, null, 2)
                        }
                    }
                })
            });
            
            if (!positionResponse.ok) {
                console.error('修改位置Gist名称失败');
                return false;
            }
            
            // 清除缓存
            this.statusCache = null;
            this.positionCache = null;
            
            return true;
        } catch (e) {
            console.error('修改名称异常:', e);
            return false;
        }
    }
    
    // ========== 清理过期数据 ==========
    
    async cleanupExpiredData() {
        const now = Date.now();
        const expireTime = 60000; // 1分钟过期
        
        try {
            // 清理状态数据
            const statusData = await this.readStatus();
            const expiredStatusPlayers = [];
            
            Object.keys(statusData.players).forEach(name => {
                if (now - statusData.players[name].lastUpdate > expireTime) {
                    expiredStatusPlayers.push(name);
                }
            });
            
            if (expiredStatusPlayers.length > 0) {
                expiredStatusPlayers.forEach(name => {
                    delete statusData.players[name];
                });
                await this._doWriteStatusFull(statusData);
            }
            
            // 清理位置数据
            const positionData = await this.readPosition();
            const expiredPositionPlayers = [];
            
            Object.keys(positionData.positions).forEach(name => {
                if (now - positionData.positions[name].lastUpdate > expireTime) {
                    expiredPositionPlayers.push(name);
                }
            });
            
            if (expiredPositionPlayers.length > 0) {
                expiredPositionPlayers.forEach(name => {
                    delete positionData.positions[name];
                });
                await this._doWritePositionFull(positionData);
            }
            
        } catch (e) {
            console.error('清理过期数据异常:', e);
        }
    }
    
    // 直接写入完整数据（用于清理）
    async _doWriteStatusFull(data) {
        if (!this.statusGistId || !this.token) return false;
        
        const apiUrl = `https://api.github.com/gists/${this.statusGistId}`;
        const response = await fetch(apiUrl, {
            method: 'PATCH',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `token ${this.token}`
            },
            body: JSON.stringify({
                files: {
                    [this.statusFilename]: {
                        content: JSON.stringify(data, null, 2)
                    }
                }
            })
        });
        
        return response.ok;
    }
    
    async _doWritePositionFull(data) {
        if (!this.positionGistId || !this.token) return false;
        
        const apiUrl = `https://api.github.com/gists/${this.positionGistId}`;
        const response = await fetch(apiUrl, {
            method: 'PATCH',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `token ${this.token}`
            },
            body: JSON.stringify({
                files: {
                    [this.positionFilename]: {
                        content: JSON.stringify(data, null, 2)
                    }
                }
            })
        });
        
        return response.ok;
    }
}