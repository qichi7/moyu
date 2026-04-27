const FlowerTexture = {
    createDaisy(ctx, x, y, tileSize) {
        ctx.fillStyle = '#7cba5f';
        ctx.fillRect(x, y, tileSize, tileSize);
        
        GrassTexture.createGrassPatch(ctx, x, y, tileSize);
        
        const centerX = x + tileSize / 2;
        const centerY = y + tileSize / 2;
        const petalCount = 8;
        const petalRadius = 5;
        const petalLength = 8;
        
        const petalColors = ['#ffffff', '#ffe4e1', '#fff0f5', '#fffafa'];
        ctx.fillStyle = petalColors[Math.floor(Math.random() * petalColors.length)];
        
        for (let i = 0; i < petalCount; i++) {
            const angle = (i / petalCount) * Math.PI * 2;
            const px = centerX + Math.cos(angle) * petalRadius;
            const py = centerY + Math.sin(angle) * petalRadius;
            
            ctx.beginPath();
            ctx.ellipse(
                centerX + Math.cos(angle) * (petalRadius + petalLength / 2),
                centerY + Math.sin(angle) * (petalRadius + petalLength / 2),
                petalLength / 2, petalRadius / 2,
                angle, 0, Math.PI * 2
            );
            ctx.fill();
        }
        
        ctx.fillStyle = '#FFD93D';
        ctx.beginPath();
        ctx.arc(centerX, centerY, petalRadius - 1, 0, Math.PI * 2);
        ctx.fill();
        
        ctx.fillStyle = '#FF8C32';
        ctx.beginPath();
        ctx.arc(centerX, centerY, 2, 0, Math.PI * 2);
        ctx.fill();
    },
    
    createTulip(ctx, x, y, tileSize) {
        ctx.fillStyle = '#7cba5f';
        ctx.fillRect(x, y, tileSize, tileSize);
        GrassTexture.createGrassPatch(ctx, x, y, tileSize);
        
        const centerX = x + tileSize / 2;
        const stemY = y + tileSize * 0.3;
        
        ctx.strokeStyle = '#2d5016';
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.moveTo(centerX, y + tileSize * 0.8);
        ctx.quadraticCurveTo(centerX - 2, stemY + 10, centerX, stemY);
        ctx.stroke();
        
        const tulipColors = ['#FF6B6B', '#FF6B9D', '#4D96FF', '#FFD93D', '#6BCB77'];
        ctx.fillStyle = tulipColors[Math.floor(Math.random() * tulipColors.length)];
        
        ctx.beginPath();
        ctx.moveTo(centerX - 6, stemY);
        ctx.quadraticCurveTo(centerX - 8, stemY - 12, centerX, stemY - 14);
        ctx.quadraticCurveTo(centerX + 8, stemY - 12, centerX + 6, stemY);
        ctx.quadraticCurveTo(centerX, stemY - 8, centerX - 6, stemY);
        ctx.fill();
        
        ctx.fillStyle = 'rgba(255,255,255,0.3)';
        ctx.beginPath();
        ctx.moveTo(centerX - 3, stemY - 2);
        ctx.quadraticCurveTo(centerX - 4, stemY - 10, centerX, stemY - 12);
        ctx.quadraticCurveTo(centerX + 1, stemY - 8, centerX - 3, stemY - 2);
        ctx.fill();
    },
    
    createButtercup(ctx, x, y, tileSize) {
        ctx.fillStyle = '#7cba5f';
        ctx.fillRect(x, y, tileSize, tileSize);
        GrassTexture.createGrassPatch(ctx, x, y, tileSize);
        
        const centerX = x + tileSize / 2;
        const centerY = y + tileSize / 2;
        
        ctx.fillStyle = '#FFD93D';
        ctx.beginPath();
        ctx.arc(centerX, centerY, 6, 0, Math.PI * 2);
        ctx.fill();
        
        ctx.fillStyle = '#FF8C32';
        ctx.beginPath();
        ctx.arc(centerX, centerY, 3, 0, Math.PI * 2);
        ctx.fill();
        
        ctx.fillStyle = 'rgba(255,255,255,0.5)';
        ctx.beginPath();
        ctx.arc(centerX - 2, centerY - 2, 2, 0, Math.PI * 2);
        ctx.fill();
    }
};
window.FlowerTexture = FlowerTexture;