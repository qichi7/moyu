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
                return { options: [], history: [] };
            }
            
            const gist = await response.json();
            
            if (gist.files && gist.files[this.filename]) {
                const data = JSON.parse(gist.files[this.filename].content);
                this.cache = data;
                this.cacheTime = now;
                return data;
            }
            
            return { options: [], history: [] };
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
                return false;
            }
            
            // 清除缓存
            this.cache = null;
            return true;
        } catch (e) {
            console.error('写入Gist异常:', e);
            return false;
        }
    }
    
    // 添加新选项
    async addOption(option, token) {
        const data = await this.readData();
        
        if (!data.options.includes(option)) {
            data.options.push(option);
            return await this.writeData(data, token);
        }
        
        return true; // 已存在，无需添加
    }
    
    // 记录历史（最近三次）
    async recordHistory(option, token) {
        const data = await this.readData();
        
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
        
        return await this.writeData(data, token);
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