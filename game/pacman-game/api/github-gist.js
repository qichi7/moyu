// GitHub Gist Leaderboard API
// 
// 使用方法：
// 1. 创建一个 GitHub Gist：https://gist.github.com/
// 2. 文件名：leaderboard.json，内容：[]
// 3. 创建 Personal Access Token：https://github.com/settings/tokens
//    - 选择 "gist" 权限
// 4. 将 Gist ID 和 Token 配置到前端

class GitHubGistLeaderboard {
    constructor(gistId, token = null) {
        this.gistId = gistId;
        this.token = token;
        this.filename = 'leaderboard.json';
        this.apiUrl = `https://api.github.com/gists/${gistId}`;
    }
    
    // 获取排行榜
    async getLeaderboard() {
        try {
            const response = await fetch(this.apiUrl);
            const gist = await response.json();
            
            if (gist.files && gist.files[this.filename]) {
                const content = gist.files[this.filename].content;
                return JSON.parse(content);
            }
            return [];
        } catch (e) {
            console.error('获取排行榜失败:', e);
            return [];
        }
    }
    
    // 保存排行榜（需要 Token）
    async saveLeaderboard(data) {
        if (!this.token) {
            console.error('需要 GitHub Token 才能保存数据');
            return false;
        }
        
        try {
            const response = await fetch(this.apiUrl, {
                method: 'PATCH',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `token ${this.token}`
                },
                body: JSON.stringify({
                    files: {
                        [this.filename]: {
                            content: JSON.stringify(data, null, 2)
                        }
                    }
                })
            });
            
            return response.ok;
        } catch (e) {
            console.error('保存排行榜失败:', e);
            return false;
        }
    }
    
    // 添加记录
    async addEntry(name, score, isWin) {
        const leaderboard = await this.getLeaderboard();
        
        const timestamp = Date.now();
        const date = new Date().toLocaleDateString('zh-CN');
        
        // 检查相同昵称
        const existingIndex = leaderboard.findIndex(entry => entry.name === name);
        
        if (existingIndex !== -1) {
            if (score > leaderboard[existingIndex].score) {
                leaderboard[existingIndex] = { name, score, isWin, date, timestamp };
            } else {
                return false;
            }
        } else {
            leaderboard.push({ name, score, isWin, date, timestamp });
        }
        
        // 排序保留 Top 10
        leaderboard.sort((a, b) => b.score - a.score);
        const trimmed = leaderboard.slice(0, 10);
        
        return await this.saveLeaderboard(trimmed);
    }
    
    // 获取今日榜
    async getTodayLeaderboard() {
        const today = new Date().toLocaleDateString('zh-CN');
        const data = await this.getLeaderboard();
        return data.filter(entry => entry.date === today);
    }
    
    // 获取本周榜
    async getWeekLeaderboard() {
        const now = Date.now();
        const weekStart = now - 7 * 24 * 60 * 60 * 1000;
        const data = await this.getLeaderboard();
        return data.filter(entry => entry.timestamp >= weekStart);
    }
}

// 使用示例：
// const gistLeaderboard = new GitHubGistLeaderboard('your_gist_id', 'your_token');
// gistLeaderboard.addEntry('玩家名', 100, true);