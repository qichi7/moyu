const WaterTexture = {
    wavePhase: 0,
    
    createPond(ctx, x, y, tileSize, time = 0) {
        const baseGradient = ctx.createRadialGradient(
            x + tileSize / 2, y + tileSize / 2, 0,
            x + tileSize / 2, y + tileSize / 2, tileSize / 2
        );
        baseGradient.addColorStop(0, '#5dade2');
        baseGradient.addColorStop(0.5, '#4fc3f7');
        baseGradient.addColorStop(1, '#29b6f6');
        
        ctx.fillStyle = baseGradient;
        ctx.fillRect(x, y, tileSize, tileSize);
        
        ctx.strokeStyle = 'rgba(255,255,255,0.4)';
        ctx.lineWidth = 1;
        
        const waveOffset = (time * 0.001) % (Math.PI * 2);
        
        for (let w = 0; w < 3; w++) {
            const waveY = y + tileSize * (0.2 + w * 0.3);
            const waveAmplitude = 2 + w;
            
            ctx.beginPath();
            ctx.moveTo(x, waveY);
            
            for (let wx = 0; wx <= tileSize; wx += 4) {
                const wy = waveY + Math.sin((wx / tileSize) * Math.PI * 2 + waveOffset + w) * waveAmplitude;
                ctx.lineTo(x + wx, wy);
            }
            ctx.stroke();
        }
        
        ctx.fillStyle = 'rgba(255,255,255,0.3)';
        for (let i = 0; i < 3; i++) {
            const sx = x + Math.random() * tileSize;
            const sy = y + Math.random() * tileSize * 0.6;
            ctx.beginPath();
            ctx.arc(sx, sy, 1 + Math.random() * 2, 0, Math.PI * 2);
            ctx.fill();
        }
        
        ctx.fillStyle = 'rgba(0,0,0,0.1)';
        ctx.beginPath();
        ctx.ellipse(x + tileSize * 0.7, y + tileSize * 0.9, tileSize * 0.2, tileSize * 0.05, 0, 0, Math.PI * 2);
        ctx.fill();
    },
    
    createSparkle(ctx, x, y, tileSize, time = 0) {
        WaterTexture.createPond(ctx, x, y, tileSize, time);
        
        const sparkleCount = 4;
        const sparklePhase = (time * 0.002) % (Math.PI * 2);
        
        for (let i = 0; i < sparkleCount; i++) {
            const sx = x + tileSize * 0.2 + (i * tileSize * 0.2);
            const sy = y + tileSize * 0.3 + Math.sin(sparklePhase + i) * tileSize * 0.15;
            const sparkleSize = 2 + Math.abs(Math.sin(sparklePhase + i * 0.5)) * 2;
            
            ctx.fillStyle = 'rgba(255,255,255,0.8)';
            ctx.beginPath();
            ctx.moveTo(sx, sy - sparkleSize);
            ctx.lineTo(sx + sparkleSize * 0.3, sy);
            ctx.lineTo(sx, sy + sparkleSize);
            ctx.lineTo(sx - sparkleSize * 0.3, sy);
            ctx.closePath();
            ctx.fill();
        }
    }
};
window.WaterTexture = WaterTexture;