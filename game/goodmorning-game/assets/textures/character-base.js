const CharacterBaseTexture = {
    createEye(ctx, x, y, size, eyeColor, isBlinking = false) {
        if (isBlinking) {
            ctx.strokeStyle = '#333';
            ctx.lineWidth = 2;
            ctx.beginPath();
            ctx.moveTo(x - size, y);
            ctx.quadraticCurveTo(x, y + 1, x + size, y);
            ctx.stroke();
        } else {
            ctx.fillStyle = '#ffffff';
            ctx.beginPath();
            ctx.ellipse(x, y, size * 1.3, size * 1.5, 0, 0, Math.PI * 2);
            ctx.fill();
            
            ctx.fillStyle = eyeColor;
            ctx.beginPath();
            ctx.arc(x, y + size * 0.2, size * 0.8, 0, Math.PI * 2);
            ctx.fill();
            
            ctx.fillStyle = '#000000';
            ctx.beginPath();
            ctx.arc(x, y + size * 0.3, size * 0.4, 0, Math.PI * 2);
            ctx.fill();
            
            ctx.fillStyle = '#ffffff';
            ctx.beginPath();
            ctx.arc(x - size * 0.3, y - size * 0.2, size * 0.25, 0, Math.PI * 2);
            ctx.fill();
            ctx.beginPath();
            ctx.arc(x + size * 0.2, y + size * 0.4, size * 0.15, 0, Math.PI * 2);
            ctx.fill();
        }
    },
    
    createNose(ctx, x, y, size) {
        ctx.fillStyle = 'rgba(0,0,0,0.1)';
        ctx.beginPath();
        ctx.arc(x, y, size * 0.3, 0, Math.PI * 2);
        ctx.fill();
    },
    
    createMouth(ctx, x, y, width, expression = 'happy') {
        ctx.strokeStyle = '#c55a5a';
        ctx.lineWidth = 2;
        ctx.lineCap = 'round';
        
        switch (expression) {
            case 'happy':
                ctx.beginPath();
                ctx.moveTo(x - width / 2, y);
                ctx.quadraticCurveTo(x, y + width * 0.5, x + width / 2, y);
                ctx.stroke();
                
                ctx.fillStyle = 'rgba(255,150,150,0.3)';
                ctx.beginPath();
                ctx.moveTo(x - width / 2 + 2, y + 2);
                ctx.quadraticCurveTo(x, y + width * 0.5 + 2, x + width / 2 - 2, y + 2);
                ctx.closePath();
                ctx.fill();
                break;
                
            case 'surprised':
                ctx.beginPath();
                ctx.arc(x, y + 2, width * 0.3, 0, Math.PI * 2);
                ctx.stroke();
                break;
                
            case 'neutral':
                ctx.beginPath();
                ctx.moveTo(x - width / 2, y);
                ctx.lineTo(x + width / 2, y);
                ctx.stroke();
                break;
        }
    },
    
    createCheek(ctx, x, y, size) {
        const cheekGradient = ctx.createRadialGradient(x, y, 0, x, y, size);
        cheekGradient.addColorStop(0, 'rgba(255,150,150,0.4)');
        cheekGradient.addColorStop(0.7, 'rgba(255,150,150,0.2)');
        cheekGradient.addColorStop(1, 'rgba(255,150,150,0)');
        
        ctx.fillStyle = cheekGradient;
        ctx.beginPath();
        ctx.ellipse(x, y, size, size * 0.6, 0, 0, Math.PI * 2);
        ctx.fill();
    },
    
    createHeadShadow(ctx, headRadius, headY) {
        ctx.fillStyle = 'rgba(0,0,0,0.05)';
        ctx.beginPath();
        ctx.ellipse(0, headY + headRadius * 0.2, headRadius * 0.9, headRadius * 0.3, 0, 0, Math.PI * 2);
        ctx.fill();
    },
    
    createBodyShadow(ctx, bodyWidth, bodyHeight, bodyY) {
        ctx.fillStyle = 'rgba(0,0,0,0.08)';
        ctx.beginPath();
        ctx.ellipse(0, bodyY + bodyHeight * 1.2, bodyWidth * 0.6, bodyHeight * 0.15, 0, 0, Math.PI * 2);
        ctx.fill();
    }
};
window.CharacterBaseTexture = CharacterBaseTexture;