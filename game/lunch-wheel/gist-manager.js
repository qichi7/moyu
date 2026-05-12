/**
 * GistManager - GitHub Gist数据管理
 * 管理午餐选项、历史记录、点赞和多菜单
 */

class GistManager {
    static STORAGE_KEY = 'lunch-wheel:gist-id';
    static MENU_KEY = 'lunch-wheel:current-menu';
    // 默认公共 Gist：未填写自定义 Gist ID 时用于读取共享菜单
    static PUBLIC_GIST_ID = '8db89a5ec373b9e93642971d839a8e49';
    static GIST_ID_PATTERN = /^[a-f0-9]{20,40}$/i;
    static DEFAULT_MENU_ID = 'default';

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
        this.cache = null;
        this.cacheTime = 0;
        this.cacheExpire = 5000; // 5秒缓存
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

    // 获取当前菜单ID
    getCurrentMenuId() {
        return localStorage.getItem(GistManager.MENU_KEY) || GistManager.DEFAULT_MENU_ID;
    }

    // 设置当前菜单ID
    setCurrentMenuId(menuId) {
        if (!menuId) menuId = GistManager.DEFAULT_MENU_ID;
        localStorage.setItem(GistManager.MENU_KEY, menuId);
        this.clearCache();
    }

    // 读取数据
    async readData() {
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
                // 返回默认数据结构
                return this._getDefaultData();
            }
            
            const gist = await response.json();
            
            if (gist.files && gist.files[this.filename]) {
                const data = JSON.parse(gist.files[this.filename].content);
                
                // 验证并迁移数据格式（兼容旧格式）
                const migratedData = this._migrateData(data);
                
                console.log('成功读取数据:', migratedData);
                // 只有成功读取到数据后才缓存
                this.cache = migratedData;
                this.cacheTime = now;
                return this._clone(migratedData);
            }

            console.error('Gist文件不存在或格式错误');
            if (this.cache) {
                return this._clone(this.cache);
            }
            return this._getDefaultData();
        } catch (e) {
            console.error('读取Gist异常:', e);
            if (this.cache) {
                return this._clone(this.cache);
            }
            return this._getDefaultData();
        }
    }

    // 获取默认数据结构
    _getDefaultData() {
        return {
            menus: {
                [GistManager.DEFAULT_MENU_ID]: {
                    name: '默认菜单',
                    options: [],
                    history: []
                }
            },
            currentMenu: GistManager.DEFAULT_MENU_ID
        };
    }

    // 迁移数据格式（兼容旧格式）
    _migrateData(data) {
        // 如果是旧格式（直接有options和history），迁移到新格式
        if (data.options && Array.isArray(data.options) && !data.menus) {
            console.log('检测到旧数据格式，进行迁移...');
            const migratedOptions = data.options.map(opt => {
                // 如果是字符串，转换为对象格式
                if (typeof opt === 'string') {
                    return { name: opt, likes: 0, score: 100 };
                }
                // 如果已经是对象格式，保留
                return opt;
            });
            
            return {
                menus: {
                    [GistManager.DEFAULT_MENU_ID]: {
                        name: '默认菜单',
                        options: migratedOptions,
                        history: data.history || []
                    }
                },
                currentMenu: GistManager.DEFAULT_MENU_ID
            };
        }
        
        // 已经是新格式，验证结构
        if (!data.menus) {
            data.menus = {};
        }
        if (!data.menus[GistManager.DEFAULT_MENU_ID]) {
            data.menus[GistManager.DEFAULT_MENU_ID] = {
                name: '默认菜单',
                options: [],
                history: []
            };
        }
        
        // 确保每个菜单的options格式正确
        for (const menuId in data.menus) {
            const menu = data.menus[menuId];
            if (!menu.options || !Array.isArray(menu.options)) {
                menu.options = [];
            }
            // 确保options中的每个项都有正确的格式
            menu.options = menu.options.map(opt => {
                if (typeof opt === 'string') {
                    return { name: opt, likes: 0, score: 100 };
                }
                return {
                    name: opt.name || opt,
                    likes: opt.likes || 0,
                    score: opt.score || 100 + (opt.likes || 0) * 5
                };
            });
            if (!menu.history || !Array.isArray(menu.history)) {
                menu.history = [];
            }
        }
        
        if (!data.currentMenu) {
            data.currentMenu = GistManager.DEFAULT_MENU_ID;
        }
        
        return data;
    }
    
    // 写入数据（需要 Token + 显式 Gist ID — 写操作不走默认 PUBLIC，避免误写）
    async writeData(data, token, gistId) {
        if (!GistManager.GIST_ID_PATTERN.test(gistId)) {
            console.error('Gist ID 无效，拒绝写入');
            return false;
        }

        if (!token) {
            console.error('需要 Token 才能写入');
            return false;
        }

        // 验证数据格式（新格式）
        if (!data || !data.menus || typeof data.menus !== 'object') {
            console.error('数据格式无效，拒绝写入');
            return false;
        }

        // 确保每个菜单有正确的结构
        for (const menuId in data.menus) {
            const menu = data.menus[menuId];
            if (!menu.options || !Array.isArray(menu.options) || !menu.history || !Array.isArray(menu.history)) {
                console.error('菜单数据格式无效，拒绝写入');
                return false;
            }
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

            // 写入成功后更新缓存
            if (gistId === this.gistId) {
                this.cache = this._clone(data);
                this.cacheTime = Date.now();
            } else {
                this.clearCache();
            }
            return true;
        } catch (e) {
            console.error('写入Gist异常:', e);
            return false;
        }
    }

    // 获取当前菜单数据
    async getCurrentMenu() {
        const data = await this.readData();
        const menuId = this.getCurrentMenuId();
        return data.menus[menuId] || data.menus[GistManager.DEFAULT_MENU_ID];
    }

    // 获取所有菜单列表
    async getAllMenus() {
        const data = await this.readData();
        const menus = [];
        for (const menuId in data.menus) {
            menus.push({
                id: menuId,
                name: data.menus[menuId].name,
                optionCount: data.menus[menuId].options.length
            });
        }
        return menus;
    }

    // 创建新菜单
    async createMenu(name, token, gistId) {
        const data = await this.readData();
        
        // 生成唯一ID
        const menuId = `menu_${Date.now()}`;
        
        data.menus[menuId] = {
            name: name,
            options: [],
            history: []
        };
        
        const ok = await this.writeData(data, token, gistId);
        if (ok) this.clearCache();
        return ok ? menuId : null;
    }

    // 删除菜单（不能删除默认菜单）
    async deleteMenu(menuId, token, gistId) {
        if (menuId === GistManager.DEFAULT_MENU_ID) {
            console.error('不能删除默认菜单');
            return false;
        }
        
        const data = await this.readData();
        
        if (!data.menus[menuId]) {
            console.error('菜单不存在');
            return false;
        }
        
        delete data.menus[menuId];
        
        // 如果删除的是当前菜单，切换到默认菜单
        if (data.currentMenu === menuId) {
            data.currentMenu = GistManager.DEFAULT_MENU_ID;
            this.setCurrentMenuId(GistManager.DEFAULT_MENU_ID);
        }
        
        const ok = await this.writeData(data, token, gistId);
        if (ok) this.clearCache();
        return ok;
    }

    // 重命名菜单
    async renameMenu(menuId, newName, token, gistId) {
        const data = await this.readData();
        
        if (!data.menus[menuId]) {
            console.error('菜单不存在');
            return false;
        }
        
        data.menus[menuId].name = newName;
        
        const ok = await this.writeData(data, token, gistId);
        if (ok) this.clearCache();
        return ok;
    }

    // 点赞选项（每个选项基础分100，每次点赞+5分）
    async likeOption(optionName, token, gistId, menuId = null) {
        const data = await this.readData();
        const targetMenuId = menuId || this.getCurrentMenuId();
        
        if (!data.menus[targetMenuId]) {
            console.error('菜单不存在');
            return false;
        }
        
        const menu = data.menus[targetMenuId];
        const option = menu.options.find(opt => opt.name === optionName);
        
        if (!option) {
            console.error('选项不存在');
            return false;
        }
        
        // 增加点赞次数和分数
        option.likes = (option.likes || 0) + 1;
        option.score = 100 + option.likes * 5; // 基础分100 + 每次点赞5分
        
        const ok = await this.writeData(data, token, gistId);
        if (ok) this.clearCache();
        return ok;
    }

    // 添加新选项；返回 { status: 'added' | 'duplicate' | 'failed' }
    async addOption(option, token, gistId, menuId = null) {
        const data = await this.readData();
        const targetMenuId = menuId || this.getCurrentMenuId();

        if (!data.menus[targetMenuId]) {
            console.error('菜单不存在');
            return { status: 'failed' };
        }

        const menu = data.menus[targetMenuId];

        if (menu.options.find(opt => opt.name === option)) {
            return { status: 'duplicate' };
        }

        // 新选项：基础分100，点赞0
        menu.options.push({
            name: option,
            likes: 0,
            score: 100
        });

        const ok = await this.writeData(data, token, gistId);
        if (ok) this.clearCache();
        return { status: ok ? 'added' : 'failed' };
    }

    // 删除选项
    async deleteOption(option, token, gistId, menuId = null) {
        const data = await this.readData();
        const targetMenuId = menuId || this.getCurrentMenuId();
        
        if (!data.menus[targetMenuId]) return false;
        
        data.menus[targetMenuId].options = data.menus[targetMenuId].options.filter(opt => opt.name !== option);
        const ok = await this.writeData(data, token, gistId);
        if (ok) this.clearCache();
        return ok;
    }

    // 记录历史（最近三次）
    async recordHistory(option, token, gistId, menuId = null) {
        const data = await this.readData();
        const targetMenuId = menuId || this.getCurrentMenuId();

        if (!data.menus[targetMenuId]) {
            console.error('菜单不存在');
            return false;
        }

        const menu = data.menus[targetMenuId];
        const now = new Date();
        const timeStr = now.toLocaleDateString('zh-CN') + ' ' + now.toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' });

        menu.history.unshift({
            name: option,
            time: timeStr
        });

        if (menu.history.length > 3) {
            menu.history = menu.history.slice(0, 3);
        }

        const success = await this.writeData(data, token, gistId);
        if (success) this.clearCache();
        return success;
    }
    
    // 获取可用选项（排除最近三次吃过的）
    async getAvailableOptions(menuId = null) {
        const menu = await this.getCurrentMenu();
        const targetMenuId = menuId || this.getCurrentMenuId();
        
        const data = await this.readData();
        const targetMenu = data.menus[targetMenuId] || menu;

        const recentOptions = targetMenu.history.map(h => h.name);
        const available = targetMenu.options.filter(opt => !recentOptions.includes(opt.name));

        // 选项不足以承载完整历史时，降级返回全部选项
        if (available.length === 0 && targetMenu.options.length > 0) {
            return targetMenu.options.slice();
        }

        return available;
    }
    
    // 获取历史记录
    async getHistory(menuId = null) {
        const menu = await this.getCurrentMenu();
        const targetMenuId = menuId || this.getCurrentMenuId();
        
        const data = await this.readData();
        const targetMenu = data.menus[targetMenuId] || menu;
        return targetMenu.history || [];
    }
    
    // 获取所有选项
    async getAllOptions(menuId = null) {
        const menu = await this.getCurrentMenu();
        const targetMenuId = menuId || this.getCurrentMenuId();
        
        const data = await this.readData();
        const targetMenu = data.menus[targetMenuId] || menu;
        return targetMenu.options || [];
    }
}