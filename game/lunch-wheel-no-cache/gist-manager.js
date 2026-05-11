/**
 * GistManager - GitHub Gist数据管理（无缓存版本）
 * 使用时间戳 + no-store 禁止浏览器缓存，确保每次获取最新数据
 */

class GistManager {
    static STORAGE_KEY = 'lunch-wheel:gist-id';
    // 默认公共 Gist：未填写自定义 Gist ID 时用于读取共享菜单
    static PUBLIC_GIST_ID = '8db89a5ec373b9e93642971d839a8e49';
    static GIST_ID_PATTERN = /^[a-f0-9]{20,40}$/i;

    static getUserGistId() {
        return localStorage.getItem(GistManager.STORAGE_KEY) || '';
    }

    static setUserGistId(id) {
        if (!GistManager.GIST_ID_PATTERN.test(id)) return false;
        localStorage.setItem(GistManager.STORAGE_KEY, id);
        return true;
    }

    static clearUserGistId() {
        localStorage.removeItem(GistManager.STORAGE_KEY);
    }

    constructor() {
        this.filename = 'lunch-options.json';
        // 本地短时缓存（可选，仅用于性能优化，不影响浏览器缓存）
        this.cache = null;
        this.cacheTime = 0;
        this.cacheExpire = 5000; // 5秒内使用本地缓存
    }

    // 当前生效的 Gist ID：用户自定义优先，否则回落公共默认
    get gistId() {
        return GistManager.getUserGistId() || GistManager.PUBLIC_GIST_ID;
    }

    hasUserGistId() {
        return GistManager.GIST_ID_PATTERN.test(GistManager.getUserGistId());
    }

    isUsingPublic() {
        return !this.hasUserGistId();
    }

    // 清除本地缓存（用于强制刷新）
    clearCache() {
        this.cache = null;
        this.cacheTime = 0;
    }

    // 深拷贝，避免调用方 mutation 污染缓存
    _clone(data) {
        if (typeof structuredClone === 'function') return structuredClone(data);
        return JSON.parse(JSON.stringify(data));
    }

    /**
     * 获取最新数据（核心无缓存方法）
     * 使用时间戳 + no-store 禁止浏览器缓存
     */
    async readData() {
        const now = Date.now();

        // 短时本地缓存（仅用于性能优化）
        // 强制刷新（clearCache后cacheTime=0）会绕过此缓存
        if (this.cache && this.cacheTime > 0 && (now - this.cacheTime) < this.cacheExpire) {
            console.log('使用本地缓存（5秒内）');
            return this._clone(this.cache);
        }

        console.log('从Gist获取最新数据（绕过浏览器缓存）...');

        try {
            // 方法一：URL添加时间戳（最可靠）
            const apiUrl = `https://api.github.com/gists/${this.gistId}`;
            const urlWithNoCache = `${apiUrl}?_=${Date.now()}`;

            // 方法二：设置请求头禁止缓存（双保险）
            const response = await fetch(urlWithNoCache, {
                cache: 'no-store',
                headers: {
                    'Cache-Control': 'no-cache'
                }
            });

            if (!response.ok) {
                console.error('读取Gist失败:', response.status, response.statusText);
                // 如果有旧缓存，返回旧缓存；否则返回空对象（但不缓存）
                if (this.cache) {
                    console.log('网络失败，使用旧缓存数据');
                    return this._clone(this.cache);
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
                console.log('成功读取最新数据:', data);
                // 更新本地缓存（仅用于短时性能优化）
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

    /**
     * 带重试机制的读取（处理API同步延迟）
     */
    async readDataWithRetry(maxRetries = 3, delay = 1000) {
        for (let i = 0; i < maxRetries; i++) {
            // 强制清除本地缓存，确保每次都重新获取
            this.clearCache();
            const data = await this.readData();

            // 检查数据有效性
            if (data && data.options && Array.isArray(data.options)) {
                return data;
            }

            console.warn(`第${i + 1}次尝试失败，等待${delay}ms后重试...`);
            await new Promise(resolve => setTimeout(resolve, delay));
        }

        throw new Error('多次尝试后仍未能获取最新数据');
    }

    // 写入数据（需要 Token + 显式 Gist ID）
    async writeData(data, token, gistId) {
        if (!GistManager.GIST_ID_PATTERN.test(gistId)) {
            console.error('Gist ID 无效，拒绝写入');
            return false;
        }

        if (!token) {
            console.error('需要 Token 才能写入');
            return false;
        }

        // 验证数据格式
        if (!data || !Array.isArray(data.options) || !Array.isArray(data.history)) {
            console.error('数据格式无效，拒绝写入');
            return false;
        }

        try {
            const apiUrl = `https://api.github.com/gists/${gistId}`;
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

            console.log('写入成功，等待同步...');

            // 等待 Gist 同步（1-2秒）
            await new Promise(resolve => setTimeout(resolve, 1500));

            // 写入成功后清空本地缓存，确保下次读取最新数据
            this.clearCache();

            return true;
        } catch (e) {
            console.error('写入Gist异常:', e);
            return false;
        }
    }

    // 添加新选项；返回 { status: 'added' | 'duplicate' | 'failed' }
    async addOption(option, token, gistId) {
        // 强制清除缓存，确保读取最新数据
        this.clearCache();
        const data = await this.readData();

        if (!data || !Array.isArray(data.options)) {
            console.error('数据无效，无法添加选项');
            return { status: 'failed' };
        }

        if (data.options.includes(option)) {
            return { status: 'duplicate' };
        }

        data.options.push(option);
        const ok = await this.writeData(data, token, gistId);
        // writeData 内部已清除缓存
        return { status: ok ? 'added' : 'failed' };
    }

    // 删除选项
    async deleteOption(option, token, gistId) {
        this.clearCache();
        const data = await this.readData();
        if (!data || !Array.isArray(data.options)) return false;
        data.options = data.options.filter(o => o !== option);
        const ok = await this.writeData(data, token, gistId);
        return ok;
    }

    // 记录历史（最近三次）
    async recordHistory(option, token, gistId) {
        this.clearCache();
        const data = await this.readData();

        if (!data || !Array.isArray(data.history)) {
            console.error('数据无效，无法记录历史');
            return false;
        }

        const now = new Date();
        const timeStr = now.toLocaleDateString('zh-CN') + ' ' + now.toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' });

        data.history.unshift({
            name: option,
            time: timeStr
        });

        if (data.history.length > 3) {
            data.history = data.history.slice(0, 3);
        }

        const success = await this.writeData(data, token, gistId);
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