const GrassTexture = {
    createGrassPatch(ctx, x, y, tileSize) {
        const baseColor = '#7cba5f';
        ctx.fillStyle = baseColor;
        ctx.fillRect(x, y, tileSize, tileSize);
        
        const grassColors = ['#5a9a3f', '#6db344', '#8ed46a', '#a8e67b'];
        for (let i = 0; i < 8; i++) {
            const gx = x + (Math.random() * tileSize);
            const gy = y + (Math.random() * tileSize);
            ctx.fillStyle = grassColors[Math.floor(Math.random() * grassColors.length)];
            ctx.beginPath();
            const bladeHeight = 4 + Math.random() * 6;
            ctx.moveTo(gx, gy);
            ctx.quadraticCurveTo(gx - 1, gy - bladeHeight / 2, gx - 2, gy - bladeHeight);
            ctx.quadraticCurveTo(gx, gy - bladeHeight / 2, gx + 2, gy - bladeHeight);
            ctx.quadraticCurveTo(gx + 1, gy - bladeHeight / 2, gx, gy);
            ctx.fill();
        }
        
        for (let i = 0; i < 3; i++) {
            const dx = x + Math.random() * tileSize;
            const dy = y + Math.random() * tileSize;
            ctx.fillStyle = 'rgba(255,255,255,0.15)';
            ctx.beginPath();
            ctx.arc(dx, dy, 1 + Math.random() * 2, 0, Math.PI * 2);
            ctx.fill();
        }
    },
    
    createLushGrass(ctx, x, y, tileSize) {
        ctx.fillStyle = '#6db344';
        ctx.fillRect(x, y, tileSize, tileSize);
        
        for (let i = 0; i < 12; i++) {
            const gx = x + Math.random() * tileSize;
            const gy = y + Math.random() * tileSize;
            const shade = Math.random();
            ctx.fillStyle = shade > 0.5 ? '#8ed46a' : '#5a9a3f';
            ctx.beginPath();
            const bladeHeight = 6 + Math.random() * 8;
            ctx.moveTo(gx, gy);
            ctx.quadraticCurveTo(gx - 2, gy - bladeHeight / 2, gx - 3, gy - bladeHeight);
            ctx.quadraticCurveTo(gx, gy - bladeHeight / 2, gx + 3, gy - bladeHeight);
            ctx.quadraticCurveTo(gx + 2, gy - bladeHeight / 2, gx, gy);
            ctx.fill();
        }
        
        ctx.fillStyle = 'rgba(0,0,0,0.05)';
        ctx.beginPath();
        ctx.ellipse(x + tileSize * 0.3, y + tileSize * 0.8, tileSize * 0.25, tileSize * 0.1, 0, 0, Math.PI * 2);
        ctx.fill();
    }
};
window.GrassTexture = GrassTexture;