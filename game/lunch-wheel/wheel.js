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
        
        this.init();
    }
    
    async init() {
        // 加载选项
        await this.loadOptions();
        
        // 绘制轮盘
        this.drawWheel();
        
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
        
        // 查看历史
        document.getElementById('view-history-btn').addEventListener('click', () => {
            this.showHistory();
        });
        
        // 关闭历史
        document.getElementById('close-history').addEventListener('click', () => {
            this.hideHistory();
        });
        
        // 关闭结果
        document.getElementById('close-result').addEventListener('click', async () => {
            // 记录到历史
            const result = document.getElementById('result-food').textContent;
            if (result !== '你没饭吃了') {
                const token = document.getElementById('gist-token').value.trim();
                if (token) {
                    await this.gistManager.recordHistory(result, token);
                }
            }
            
            this.hideResult();
            // 重新加载选项（更新可用选项）
            await this.loadOptions();
            this.drawWheel();
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
        // 指针指向顶部（-90度），计算目标扇形的起始角度
        const targetAngle = selectedIndex * sliceAngle + sliceAngle / 2;
        // 需要旋转到目标角度指向顶部
        const baseRotation = -Math.PI / 2 - targetAngle;
        // 加上额外的旋转圈数（5-10圈）
        const extraRotation = Math.PI * 2 * (5 + Math.random() * 5);
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
                this.isSpinning = false;
                document.getElementById('spin-btn').disabled = false;
                this.showResult(selectedOption);
            }
        };
        
        animate();
    }
    
    showResult(option) {
        document.getElementById('result-food').textContent = option;
        document.getElementById('result-overlay').style.display = 'flex';
    }
    
    hideResult() {
        document.getElementById('result-overlay').style.display = 'none';
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
                await this.loadOptions();
                this.drawWheel();
                
                // 隐藏空状态提示
                document.getElementById('empty-message').style.display = 'none';
            } else {
                alert('添加失败，请检查Token权限');
            }
        } catch (e) {
            alert('添加失败：' + e.message);
        }
    }
    
    async showHistory() {
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
        
        document.getElementById('history-overlay').style.display = 'flex';
    }
    
    hideHistory() {
        document.getElementById('history-overlay').style.display = 'none';
    }
}

// 启动
window.addEventListener('DOMContentLoaded', () => {
    new LunchWheel();
});