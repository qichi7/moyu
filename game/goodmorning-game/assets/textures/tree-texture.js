const TreeTexture = {
    createOakTree(ctx, x, y, tileSize) {
        ctx.fillStyle = '#7cba5f';
        ctx.fillRect(x, y, tileSize, tileSize);
        GrassTexture.createGrassPatch(ctx, x, y, tileSize);
        
        const centerX = x + tileSize / 2;
        const trunkHeight = tileSize * 0.5;
        const trunkWidth = 6;
        
        const trunkGradient = ctx.createLinearGradient(
            centerX - trunkWidth / 2, y + tileSize - trunkHeight,
            centerX + trunkWidth / 2, y + tileSize - trunkHeight
        );
        trunkGradient.addColorStop(0, '#5D4037');
        trunkGradient.addColorStop(0.3, '#8B4513');
        trunkGradient.addColorStop(0.7, '#A0522D');
        trunkGradient.addColorStop(1, '#5D4037');
        
        ctx.fillStyle = trunkGradient;
        ctx.beginPath();
        ctx.moveTo(centerX - trunkWidth / 2, y + tileSize);
        ctx.lineTo(centerX - trunkWidth / 2 + 1, y + tileSize - trunkHeight);
        ctx.lineTo(centerX + trunkWidth / 2 - 1, y + tileSize - trunkHeight);
        ctx.lineTo(centerX + trunkWidth / 2, y + tileSize);
        ctx.closePath();
        ctx.fill();
        
        ctx.fillStyle = 'rgba(0,0,0,0.2)';
        ctx.fillRect(centerX - trunkWidth / 2 + 1, y + tileSize - trunkHeight * 0.6, 1, trunkHeight * 0.4);
        
        const canopyRadius = tileSize * 0.4;
        const canopyCenterY = y + tileSize - trunkHeight - canopyRadius * 0.3;
        
        const canopyColors = ['#228B22', '#32CD32', '#3CB371', '#2E8B57'];
        
        for (let layer = 0; layer < 3; layer++) {
            const layerRadius = canopyRadius - layer * 3;
            const layerY = canopyCenterY + layer * 4;
            
            ctx.fillStyle = canopyColors[layer];
            ctx.beginPath();
            ctx.arc(centerX, layerY, layerRadius, 0, Math.PI * 2);
            ctx.fill();
        }
        
        ctx.fillStyle = 'rgba(255,255,255,0.2)';
        ctx.beginPath();
        ctx.arc(centerX - canopyRadius * 0.3, canopyCenterY - canopyRadius * 0.3, canopyRadius * 0.25, 0, Math.PI * 2);
        ctx.fill();
        
        ctx.fillStyle = 'rgba(0,0,0,0.15)';
        ctx.beginPath();
        ctx.arc(centerX + canopyRadius * 0.4, canopyCenterY + canopyRadius * 0.5, canopyRadius * 0.35, 0, Math.PI * 2);
        ctx.fill();
    },
    
    createPineTree(ctx, x, y, tileSize) {
        ctx.fillStyle = '#7cba5f';
        ctx.fillRect(x, y, tileSize, tileSize);
        GrassTexture.createGrassPatch(ctx, x, y, tileSize);
        
        const centerX = x + tileSize / 2;
        
        ctx.fillStyle = '#5D4037';
        ctx.fillRect(centerX - 3, y + tileSize * 0.7, 6, tileSize * 0.3);
        
        ctx.fillStyle = '#2E8B57';
        
        const layers = [
            { y: y + tileSize * 0.6, width: 16, height: 12 },
            { y: y + tileSize * 0.4, width: 13, height: 10 },
            { y: y + tileSize * 0.25, width: 10, height: 8 }
        ];
        
        layers.forEach(layer => {
            ctx.beginPath();
            ctx.moveTo(centerX, layer.y - layer.height);
            ctx.lineTo(centerX - layer.width / 2, layer.y);
            ctx.lineTo(centerX + layer.width / 2, layer.y);
            ctx.closePath();
            ctx.fill();
            
            ctx.fillStyle = 'rgba(255,255,255,0.15)';
            ctx.beginPath();
            ctx.moveTo(centerX, layer.y - layer.height);
            ctx.lineTo(centerX - layer.width / 4, layer.y - layer.height / 2);
            ctx.lineTo(centerX, layer.y - layer.height / 3);
            ctx.closePath();
            ctx.fill();
            ctx.fillStyle = '#2E8B57';
        });
    },
    
    createCherryTree(ctx, x, y, tileSize) {
        TreeTexture.createOakTree(ctx, x, y, tileSize);
        
        const centerX = x + tileSize / 2;
        const canopyCenterY = y + tileSize * 0.3;
        
        ctx.fillStyle = '#FFB7C5';
        for (let i = 0; i < 5; i++) {
            const angle = Math.random() * Math.PI * 2;
            const distance = tileSize * 0.2 + Math.random() * tileSize * 0.15;
            const bx = centerX + Math.cos(angle) * distance;
            const by = canopyCenterY + Math.sin(angle) * distance * 0.7;
            
            ctx.beginPath();
            ctx.arc(bx, by, 3, 0, Math.PI * 2);
            ctx.fill();
        }
    }
};
window.TreeTexture = TreeTexture;