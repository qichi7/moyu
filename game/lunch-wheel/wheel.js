/**
 * 轮盘抽奖逻辑
 */

class LunchWheel {
    constructor() {
        this.canvas = document.getElementById('wheel-canvas');
        this.ctx = this.canvas.getContext('2d');
        this.gistManager = new GistManager();
        
        this.options = [];
        this.availableOptions = [];
        this.colors = [];
        this.isSpinning = false;
        this.currentRotation = 0;
        this.lastSelectedOption = null; // 保存最后选择的选项
        
        this.init();
    }
    
    async init() {
        // 清除缓存，确保每次打开/刷新都从gist重新读取
        this.gistManager.clearCache();
        
        // 加载选项
        await this.loadOptions();
        
        // 绘制轮盘
        this.drawWheel();
        
        // 加载并显示历史记录
        await this.updateHistoryDisplay();
        
        // 绑定事件
        this.bindEvents();
    }
    
    async loadOptions() {
        // 获取可用选项（排除最近三次）
        this.availableOptions = await this.gistManager.getAvailableOptions();
        
        if (this.availableOptions.length === 0) {
            this.options = ['你没饭吃了'];
        } else {
            this.options = this.availableOptions;
        }
        
        // 生成颜色
        this.generateColors();
    }
    
    async updateHistoryDisplay() {
        const history = await this.gistManager.getHistory();
        const historyList = document.getElementById('history-list');
        
        if (history.length === 0) {
            historyList.innerHTML = '<div class="no-history">暂无记录</div>';
        } else {
            historyList.innerHTML = history.map(item => `
                <div class="history-item">
                    <span class="history-name">${item.name}</span>
                    <span class="history-time">${item.time}</span>
                </div>
            `).join('');
        }
    }
    
    generateColors() {
        const baseColors = [
            '#FF6B6B', '#4ECDC4', '#45B7D1', '#96CEB4', 
            '#FFEAA7', '#DDA0DD', '#98D8C8', '#F7DC6F',
            '#BB8FCE', '#85C1E9', '#F8B500', '#00CED1'
        ];
        
        this.colors = [];
        for (let i = 0; i < this.options.length; i++) {
            this.colors.push(baseColors[i % baseColors.length]);
        }
    }
    
    drawWheel() {
        const centerX = this.canvas.width / 2;
        const centerY = this.canvas.height / 2;
        const radius = Math.min(centerX, centerY) - 10;
        
        // 清除画布
        this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
        
        // 绘制外圈阴影
        this.ctx.save();
        this.ctx.shadowColor = 'rgba(0, 0, 0, 0.3)';
        this.ctx.shadowBlur = 20;
        this.ctx.beginPath();
        this.ctx.arc(centerX, centerY, radius, 0, Math.PI * 2);
        this.ctx.fillStyle = '#fff';
        this.ctx.fill();
        this.ctx.restore();
        
        if (this.options.length === 0) {
            return;
        }
        
        // 绘制扇形
        const sliceAngle = (Math.PI * 2) / this.options.length;
        
        this.ctx.save();
        this.ctx.translate(centerX, centerY);
        this.ctx.rotate(this.currentRotation);
        
        for (let i = 0; i < this.options.length; i++) {
            const startAngle = i * sliceAngle;
            const endAngle = startAngle + sliceAngle;
            
            // 绘制扇形
            this.ctx.beginPath();
            this.ctx.moveTo(0, 0);
            this.ctx.arc(0, 0, radius - 5, startAngle, endAngle);
            this.ctx.closePath();
            
            this.ctx.fillStyle = this.colors[i];
            this.ctx.fill();
            
            // 绘制边框
            this.ctx.strokeStyle = '#fff';
            this.ctx.lineWidth = 2;
            this.ctx.stroke();
            
            // 绘制文字
            this.ctx.save();
            this.ctx.rotate(startAngle + sliceAngle / 2);
            this.ctx.textAlign = 'right';
            this.ctx.textBaseline = 'middle';
            this.ctx.fillStyle = '#fff';
            this.ctx.font = 'bold 16px Microsoft YaHei, sans-serif';
            
            const text = this.options[i];
            const textRadius = radius - 40;
            
            // 文字阴影
            this.ctx.shadowColor = 'rgba(0, 0, 0, 0.5)';
            this.ctx.shadowBlur = 3;
            this.ctx.fillText(text, textRadius, 0);
            
            this.ctx.restore();
        }
        
        this.ctx.restore();
        
        // 绘制中心圆
        this.ctx.beginPath();
        this.ctx.arc(centerX, centerY, 50, 0, Math.PI * 2);
        this.ctx.fillStyle = '#fff';
        this.ctx.fill();
    }
    
    bindEvents() {
        // 开始抽奖
        document.getElementById('spin-btn').addEventListener('click', () => {
            this.spin();
        });
        
        // 添加选项
        document.getElementById('add-option-btn').addEventListener('click', () => {
            this.showAddOverlay();
        });
        
        document.getElementById('add-first-option').addEventListener('click', () => {
            this.showAddOverlay();
        });
        
        // 提交新选项
        document.getElementById('submit-option').addEventListener('click', () => {
            this.submitNewOption();
        });
        
        // 取消添加
        document.getElementById('cancel-add').addEventListener('click', () => {
            this.hideAddOverlay();
        });
        
        // 上次吃了啥（记录历史）
        document.getElementById('record-eating-btn').addEventListener('click', () => {
            this.showRecordOverlay();
        });
        
        // 提交记录
        document.getElementById('submit-record').addEventListener('click', () => {
            this.submitRecord();
        });
        
        // 取消记录
        document.getElementById('cancel-record').addEventListener('click', () => {
            this.hideRecordOverlay();
        });
        
        // 清空记录
        document.getElementById('clear-history-btn').addEventListener('click', () => {
            this.showClearConfirm();
        });
        
        // 关闭结果（不记录）
        document.getElementById('close-result').addEventListener('click', () => {
            this.hideResult();
        });
        
        // 记录这次选择
        document.getElementById('record-result').addEventListener('click', () => {
            this.hideResult();
            this.showRecordWithSelected();
        });
    }
    
    async spin() {
        if (this.isSpinning) return;
        
        if (this.availableOptions.length === 0) {
            // 没有选项，直接显示结果
            this.showResult('你没饭吃了');
            return;
        }
        
        this.isSpinning = true;
        document.getElementById('spin-btn').disabled = true;
        
        // 随机选择结果
        const selectedIndex = Math.floor(Math.random() * this.availableOptions.length);
        const selectedOption = this.availableOptions[selectedIndex];
        
        // 计算旋转角度
        const sliceAngle = (Math.PI * 2) / this.options.length;
        // 指针指向右侧（0度），计算目标扇形中点的角度
        const targetAngle = selectedIndex * sliceAngle + sliceAngle / 2;
        // 需要把当前 rotation 修正到 -targetAngle，使该扇形中点指向右侧
        const TWO_PI = Math.PI * 2;
        const normalizedStart = ((this.currentRotation % TWO_PI) + TWO_PI) % TWO_PI;
        const baseRotation = ((-targetAngle - normalizedStart) % TWO_PI + TWO_PI) % TWO_PI;
        // 必须是 2π 的整数倍额外圈数，否则最终角度会偏离选中扇形
        const extraRotation = TWO_PI * (5 + Math.floor(Math.random() * 5));
        const totalRotation = baseRotation + extraRotation;
        
        // 动画参数
        const duration = 5000; // 5秒
        const startTime = Date.now();
        const startRotation = this.currentRotation;
        
        // 缓动函数（缓入缓出）
        const easeOutCubic = (t) => 1 - Math.pow(1 - t, 3);
        
        const animate = () => {
            const elapsed = Date.now() - startTime;
            const progress = Math.min(elapsed / duration, 1);
            const easedProgress = easeOutCubic(progress);
            
            this.currentRotation = startRotation + totalRotation * easedProgress;
            this.drawWheel();
            
            if (progress < 1) {
                requestAnimationFrame(animate);
            } else {
                const TWO_PI = Math.PI * 2;
                this.currentRotation = ((startRotation + totalRotation) % TWO_PI + TWO_PI) % TWO_PI;
                this.drawWheel();
                this.isSpinning = false;
                document.getElementById('spin-btn').disabled = false;
                this.showResult(selectedOption);
            }
        };
        
        animate();
    }
    
    showResult(option) {
        this.lastSelectedOption = option; // 保存选择结果
        document.getElementById('result-food').textContent = option;
        document.getElementById('result-overlay').style.display = 'flex';
    }
    
    hideResult() {
        document.getElementById('result-overlay').style.display = 'none';
    }
    
    // 显示记录界面并自动选择最后抽到的选项
    async showRecordWithSelected() {
        // 先显示记录界面
        await this.showRecordOverlay();
        
        // 如果有最后选择的选项，自动选中
        if (this.lastSelectedOption && this.lastSelectedOption !== '你没饭吃了') {
            const select = document.getElementById('record-option');
            // 查找并选中对应的选项
            for (let i = 0; i < select.options.length; i++) {
                if (select.options[i].value === this.lastSelectedOption) {
                    select.selectedIndex = i;
                    break;
                }
            }
        }
    }
    
    showAddOverlay() {
        document.getElementById('add-overlay').style.display = 'flex';
        document.getElementById('new-option').focus();
    }
    
    hideAddOverlay() {
        document.getElementById('add-overlay').style.display = 'none';
        document.getElementById('new-option').value = '';
    }
    
    async submitNewOption() {
        const option = document.getElementById('new-option').value.trim();
        const token = document.getElementById('gist-token').value.trim();
        
        if (!option) {
            alert('请输入选项名称');
            return;
        }
        
        if (!token) {
            alert('请输入GitHub Token');
            return;
        }
        
        try {
            const success = await this.gistManager.addOption(option, token);
            
            if (success) {
                alert(`"${option}" 已添加成功！`);
                this.hideAddOverlay();
                // 刷新轮盘和历史记录
                await this.refreshAll();
                
                // 隐藏空状态提示
                document.getElementById('empty-message').style.display = 'none';
            } else {
                alert('添加失败，请检查Token权限');
            }
        } catch (e) {
            alert('添加失败：' + e.message);
        }
    }
    
    // 刷新轮盘和历史记录
    async refreshAll() {
        // 显示加载状态
        const historyList = document.getElementById('history-list');
        historyList.innerHTML = '<div class="loading">加载中...</div>';
        
        // 立即清除所有缓存，确保从gist重新读取最新数据
        this.gistManager.clearCache();
        
        // 等待数据读取完成
        await this.loadOptions();
        this.drawWheel();
        await this.updateHistoryDisplay();
    }
    
    async showRecordOverlay() {
        // 清除缓存，确保获取最新数据
        this.gistManager.clearCache();
        
        // 获取所有选项（包括被排除的）
        const allOptions = await this.gistManager.getAllOptions();
        
        const select = document.getElementById('record-option');
        select.innerHTML = '<option value="">-- 请选择 --</option>';
        
        allOptions.forEach(option => {
            const opt = document.createElement('option');
            opt.value = option;
            opt.textContent = option;
            select.appendChild(opt);
        });
        
        document.getElementById('record-overlay').style.display = 'flex';
    }
    
    hideRecordOverlay() {
        document.getElementById('record-overlay').style.display = 'none';
        document.getElementById('record-token').value = '';
    }
    
    async submitRecord() {
        const select = document.getElementById('record-option');
        const option = select.value;
        const token = document.getElementById('record-token').value.trim();
        
        if (!option) {
            alert('请选择吃了什么');
            return;
        }
        
        if (!token) {
            alert('请输入GitHub Token');
            return;
        }
        
        try {
            const success = await this.gistManager.recordHistory(option, token);
            
            if (success) {
                alert(`已记录：${option}`);
                this.hideRecordOverlay();
                // 刷新轮盘和历史记录
                await this.refreshAll();
            } else {
                alert('记录失败，请检查Token权限');
            }
        } catch (e) {
            alert('记录失败：' + e.message);
        }
    }
    
    showClearConfirm() {
        const confirmed = confirm('确定要清空所有历史记录吗？\n清空后所有选项都会重新加入轮盘。');
        if (confirmed) {
            this.showClearOverlay();
        }
    }
    
    showClearOverlay() {
        // 创建一个简单的Token输入弹窗
        const overlay = document.createElement('div');
        overlay.className = 'record-overlay';
        overlay.id = 'clear-token-overlay';
        overlay.innerHTML = `
            <div class="record-content">
                <h2>🗑️ 清空记录</h2>
                <div class="form-group">
                    <label for="clear-token">GitHub Token：</label>
                    <input type="password" id="clear-token" placeholder="ghp_xxxxxx（需要gist权限）">
                    <small>需要Token才能清空记录</small>
                </div>
                <div class="form-buttons">
                    <button id="confirm-clear" class="submit-btn danger-btn">确认清空</button>
                    <button id="cancel-clear" class="cancel-btn">取消</button>
                </div>
            </div>
        `;
        document.body.appendChild(overlay);
        
        // 绑定事件
        overlay.querySelector('#confirm-clear').addEventListener('click', async () => {
            const token = overlay.querySelector('#clear-token').value.trim();
            if (!token) {
                alert('请输入GitHub Token');
                return;
            }
            await this.clearHistory(token);
            overlay.remove();
        });
        
        overlay.querySelector('#cancel-clear').addEventListener('click', () => {
            overlay.remove();
        });
    }
    
    async clearHistory(token) {
        try {
            // 读取数据并清空历史
            const data = await this.gistManager.readData();
            data.history = [];
            
            const success = await this.gistManager.writeData(data, token);
            
            if (success) {
                // 清除缓存，确保下次读取最新数据
                this.gistManager.clearCache();
                alert('历史记录已清空！');
                // 刷新轮盘和历史记录
                await this.refreshAll();
            } else {
                alert('清空失败，请检查Token权限');
            }
        } catch (e) {
            alert('清空失败：' + e.message);
        }
    }
}

// 启动
window.addEventListener('DOMContentLoaded', () => {
    new LunchWheel();
});