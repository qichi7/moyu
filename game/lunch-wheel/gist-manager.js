/**
 * GistManager - GitHub Gist数据管理
 * 管理午餐选项和历史记录
 */

class GistManager {
    static HARDCODED_GIST_ID = '8db89a5ec373b9e93642971d839a8e49';
    
    constructor() {
        this.gistId = GistManager.HARDCODED_GIST_ID;
        this.filename = 'lunch-options.json';
        this.cache = null;
        this.cacheTime = 0;
        this.cacheExpire = 5000; // 5秒缓存
    }
    
    isConfigured() {
        return true; // 已硬编码，始终配置完成
    }

    // 清除缓存（用于刷新数据）
    clearCache() {
        this.cache = null;
        this.cacheTime = 0;
    }

    // 深拷贝，避免调用方 mutation 污染缓存
    _clone(data) {
        if (typeof structuredClone === 'function') return structuredClone(data);
        return JSON.parse(JSON.stringify(data));
    }
    
    // 读取数据
    async readData() {
        if (!this.isConfigured()) {
            console.warn('Gist ID 未配置');
            return { options: [], history: [] };
        }

        const now = Date.now();

        // 只有在缓存有效且未被清除时才使用缓存
        if (this.cache && this.cacheTime > 0 && (now - this.cacheTime) < this.cacheExpire) {
            console.log('使用缓存数据');
            return this._clone(this.cache);
        }
        
        console.log('从Gist读取最新数据...');
        
        try {
            const apiUrl = `https://api.github.com/gists/${this.gistId}`;
            const response = await fetch(apiUrl);
            
            if (!response.ok) {
                console.error('读取Gist失败:', response.status, response.statusText);
                // 如果有旧缓存，返回旧缓存；否则返回空对象（但不缓存）
                if (this.cache) {
                    console.log('网络失败，使用旧缓存数据');
                    return this.cache;
                }
                console.warn('无缓存数据可用，返回空对象（不缓存）');
                // 返回空对象但不缓存，避免缓存空数据
                return { options: [], history: [] };
            }
            
            const gist = await response.json();
            
            if (gist.files && gist.files[this.filename]) {
                const data = JSON.parse(gist.files[this.filename].content);
                // 验证数据格式
                if (!data.options || !Array.isArray(data.options)) {
                    console.warn('选项数据格式无效，重置为空数组');
                    data.options = [];
                }
                if (!data.history || !Array.isArray(data.history)) {
                    console.warn('历史数据格式无效，重置为空数组');
                    data.history = [];
                }
                console.log('成功读取数据:', data);
                // 只有成功读取到数据后才缓存（缓存内部副本，返回另一份给调用方）
                this.cache = data;
                this.cacheTime = now;
                return this._clone(data);
            }

            console.error('Gist文件不存在或格式错误');
            if (this.cache) {
                return this._clone(this.cache);
            }
            return { options: [], history: [] };
        } catch (e) {
            console.error('读取Gist异常:', e);
            if (this.cache) {
                return this._clone(this.cache);
            }
            return { options: [], history: [] };
        }
    }
    
    // 写入数据（需要Token）
    async writeData(data, token) {
        if (!this.isConfigured()) {
            console.error('Gist ID 未配置，无法写入');
            return false;
        }

        if (!token) {
            console.error('需要Token才能写入');
            return false;
        }

        // 验证数据格式
        if (!data || !Array.isArray(data.options) || !Array.isArray(data.history)) {
            console.error('数据格式无效，拒绝写入');
            return false;
        }
        
        try {
            const apiUrl = `https://api.github.com/gists/${this.gistId}`;
            const response = await fetch(apiUrl, {
                method: 'PATCH',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `token ${token}`
                },
                body: JSON.stringify({
                    files: {
                        [this.filename]: {
                            content: JSON.stringify(data, null, 2)
                        }
                    }
                })
            });
            
            if (!response.ok) {
                console.error('写入Gist失败:', response.status);
                const errorText = await response.text();
                console.error('错误详情:', errorText);
                return false;
            }
            
            // 写入成功后更新缓存（存内部副本，避免外部继续 mutation 影响缓存）
            this.cache = this._clone(data);
            this.cacheTime = Date.now();
            return true;
        } catch (e) {
            console.error('写入Gist异常:', e);
            return false;
        }
    }
    
    // 添加新选项；返回 { status: 'added' | 'duplicate' | 'failed' }
    async addOption(option, token) {
        const data = await this.readData();

        if (!data || !Array.isArray(data.options)) {
            console.error('数据无效，无法添加选项');
            return { status: 'failed' };
        }

        if (data.options.includes(option)) {
            return { status: 'duplicate' };
        }

        data.options.push(option);
        const ok = await this.writeData(data, token);
        if (ok) this.clearCache();
        return { status: ok ? 'added' : 'failed' };
    }

    // 删除选项
    async deleteOption(option, token) {
        const data = await this.readData();
        if (!data || !Array.isArray(data.options)) return false;
        data.options = data.options.filter(o => o !== option);
        const ok = await this.writeData(data, token);
        if (ok) this.clearCache();
        return ok;
    }
    
    // 记录历史（最近三次）
    async recordHistory(option, token) {
        // 先读取数据，确保有有效数据
        const data = await this.readData();
        
        // 验证数据有效性（空数组也算有效）
        if (!data || !Array.isArray(data.history)) {
            console.error('数据无效，无法记录历史');
            return false;
        }
        
        const now = new Date();
        const timeStr = now.toLocaleDateString('zh-CN') + ' ' + now.toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' });
        
        // 添加新记录
        data.history.unshift({
            name: option,
            time: timeStr
        });
        
        // 只保留最近三条
        if (data.history.length > 3) {
            data.history = data.history.slice(0, 3);
        }
        
        const success = await this.writeData(data, token);
        if (success) {
            // 清除缓存，确保下次读取最新数据
            this.clearCache();
        }
        return success;
    }
    
    // 获取可用选项（排除最近三次吃过的）
    async getAvailableOptions() {
        const data = await this.readData();

        const recentOptions = data.history.map(h => h.name);
        const available = data.options.filter(opt => !recentOptions.includes(opt));

        // 选项不足以承载完整历史时，降级返回全部选项，避免被永久锁死
        if (available.length === 0 && data.options.length > 0) {
            return data.options.slice();
        }

        return available;
    }
    
    // 获取历史记录
    async getHistory() {
        const data = await this.readData();
        return data.history || [];
    }
    
    // 获取所有选项
    async getAllOptions() {
        const data = await this.readData();
        return data.options || [];
    }
}