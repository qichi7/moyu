/**
 * GistManager - GitHub Gist数据管理
 * 管理午餐选项和历史记录
 */

class GistManager {
    static GIST_ID = '8db89a5ec373b9e93642971d839a8e49';
    
    constructor() {
        this.filename = 'lunch-options.json';
        this.cache = null;
        this.cacheTime = 0;
        this.cacheExpire = 5000; // 5秒缓存
    }
    
    // 清除缓存（用于刷新数据）
    clearCache() {
        this.cache = null;
        this.cacheTime = 0;
    }
    
    // 读取数据
    async readData() {
        const now = Date.now();
        if (this.cache && (now - this.cacheTime) < this.cacheExpire) {
            return this.cache;
        }
        
        try {
            const apiUrl = `https://api.github.com/gists/${GistManager.GIST_ID}`;
            const response = await fetch(apiUrl);
            
            if (!response.ok) {
                console.error('读取Gist失败:', response.status);
                // 修复：返回缓存数据而不是空对象，避免数据丢失
                return this.cache || { options: [], history: [] };
            }
            
            const gist = await response.json();
            
            if (gist.files && gist.files[this.filename]) {
                const data = JSON.parse(gist.files[this.filename].content);
                // 验证数据格式
                if (!data.options || !Array.isArray(data.options)) {
                    data.options = [];
                }
                if (!data.history || !Array.isArray(data.history)) {
                    data.history = [];
                }
                this.cache = data;
                this.cacheTime = now;
                return data;
            }
            
            // 修复：返回缓存数据而不是空对象
            return this.cache || { options: [], history: [] };
        } catch (e) {
            console.error('读取Gist异常:', e);
            return this.cache || { options: [], history: [] };
        }
    }
    
    // 写入数据（需要Token）
    async writeData(data, token) {
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
            const apiUrl = `https://api.github.com/gists/${GistManager.GIST_ID}`;
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
            
            // 写入成功后更新缓存
            this.cache = data;
            this.cacheTime = Date.now();
            return true;
        } catch (e) {
            console.error('写入Gist异常:', e);
            return false;
        }
    }
    
    // 添加新选项
    async addOption(option, token) {
        // 清除缓存，确保读取最新数据
        this.clearCache();
        const data = await this.readData();
        
        // 验证数据有效性
        if (!data || !data.options) {
            console.error('数据无效，无法添加选项');
            return false;
        }
        
        if (!data.options.includes(option)) {
            data.options.push(option);
            const success = await this.writeData(data, token);
            if (success) {
                // 更新缓存
                this.cache = data;
                this.cacheTime = Date.now();
            }
            return success;
        }
        
        return true; // 已存在，无需添加
    }
    
    // 记录历史（最近三次）
    async recordHistory(option, token) {
        // 清除缓存，确保读取最新数据
        this.clearCache();
        const data = await this.readData();
        
        // 验证数据有效性
        if (!data || !data.history) {
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
            // 更新缓存
            this.cache = data;
            this.cacheTime = Date.now();
        }
        return success;
    }
    
    // 获取可用选项（排除最近三次吃过的）
    async getAvailableOptions() {
        const data = await this.readData();
        
        // 获取最近三次吃过的选项名称
        const recentOptions = data.history.map(h => h.name);
        
        // 过滤掉最近吃过的
        const available = data.options.filter(opt => !recentOptions.includes(opt));
        
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