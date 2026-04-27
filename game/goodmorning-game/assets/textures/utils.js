if (!CanvasRenderingContext2D.prototype.roundRect) {
    CanvasRenderingContext2D.prototype.roundRect = function(x, y, width, height, radii) {
        if (typeof radii === 'undefined') radii = 5;
        if (typeof radii === 'number') radii = {tl: radii, tr: radii, br: radii, bl: radii};
        else {
            var defaultRadius = {tl: 0, tr: 0, br: 0, bl: 0};
            for (var side in defaultRadius) {
                radii[side] = radii[side] || defaultRadius[side];
            }
        }
        
        this.beginPath();
        this.moveTo(x + radii.tl, y);
        this.lineTo(x + width - radii.tr, y);
        this.quadraticCurveTo(x + width, y, x + width, y + radii.tr);
        this.lineTo(x + width, y + height - radii.br);
        this.quadraticCurveTo(x + width, y + height, x + width - radii.br, y + height);
        this.lineTo(x + radii.bl, y + height);
        this.quadraticCurveTo(x, y + height, x, y + height - radii.bl);
        this.lineTo(x, y + radii.tl);
        this.quadraticCurveTo(x, y, x + radii.tl, y);
        this.closePath();
        
        return this;
    };
}