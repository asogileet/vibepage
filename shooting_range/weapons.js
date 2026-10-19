// 武器定義與彈道管理
const WEAPONS = {
    pistol: {
        id: 'pistol',
        name: '沙漠之鷹 (Pistol)',
        icon: '🔫',
        fireRate: 0.13, // 支援按住高速連射，單點/連發皆有強烈槍林彈雨感
        damage: 45,
        force: 18,
        pellets: 2, // 雙發高速曳光重彈齊射
        spread: 0.022,
        auto: true,
        sound: 'playPistol',
        color: '#ffdd55',
        type: 'hitscan',
        bulletSize: 1.35,
        muzzleScale: 1.35
    },
    smg: {
        id: 'smg',
        name: '微型衝鋒槍 (SMG)',
        icon: '⚡',
        fireRate: 0.055, // 極速狂暴連射
        damage: 18,
        force: 8,
        pellets: 3, // 每次擊發射出 3 發錯位高速子彈流，形成密集槍林彈雨
        spread: 0.055,
        auto: true,
        sound: 'playSMG',
        color: '#ffaa00',
        type: 'hitscan',
        bulletSize: 1.05,
        muzzleScale: 1.25
    },
    shotgun: {
        id: 'shotgun',
        name: '霰彈槍 (Shotgun)',
        icon: '💥',
        fireRate: 0.38,
        damage: 22, // 每顆彈丸
        force: 35,
        pellets: 14, // 14 顆熾熱重型鹿彈同時噴射而出
        spread: 0.095,
        auto: true,
        sound: 'playShotgun',
        color: '#ff7700',
        type: 'hitscan',
        bulletSize: 0.95,
        muzzleScale: 1.75
    },
    tomato: {
        id: 'tomato',
        name: '爛番茄 (Tomato)',
        icon: '🍅',
        fireRate: 0.22,
        damage: 10,
        force: 12,
        pellets: 1,
        spread: 0,
        auto: true,
        sound: 'playSplat',
        color: '#e74c3c',
        type: 'projectile',
        projectileType: 'tomato',
        muzzleScale: 0.9
    },
    rpg: {
        id: 'rpg',
        name: '火箭筒 (RPG-7)',
        icon: '🚀',
        fireRate: 0.85,
        damage: 250,
        force: 80,
        pellets: 1,
        spread: 0,
        auto: true,
        sound: 'playExplosion',
        color: '#ff4400',
        type: 'projectile',
        projectileType: 'rocket',
        muzzleScale: 2.0
    },
    laser: {
        id: 'laser',
        name: '雷射加農 (Laser)',
        icon: '🔮',
        fireRate: 0.11,
        damage: 65,
        force: 22,
        pellets: 1,
        spread: 0,
        auto: true,
        sound: 'playLaser',
        color: '#00e5ff',
        type: 'beam',
        muzzleScale: 1.4
    }
};

// 高速實體子彈 (具 3D 近大遠小透視、破風音爆火衣、曳光尾跡，清楚呈現「子彈射出」到「子彈射入」)
class BulletProjectile {
    constructor(startX, startY, targetX, targetY, weapon, delay = 0, lockedHit = null) {
        this.startX = startX;
        this.startY = startY;
        this.x = startX;
        this.y = startY;
        this.targetX = targetX;
        this.targetY = targetY;
        this.weapon = weapon;
        this.delay = delay; // 錯位連發延遲 (秒)
        this.lockedHit = lockedHit; // { dummy, hit } 鎖定命中部位，確保移動靶也能精準射入

        this.recalcTrajectory();

        // 飛行時間控制在 0.065s ~ 0.09s (約 4~6 幀)，兼具極致打擊感與肉眼清晰可見的子彈飛行軌跡
        this.flightDuration = 0.068 + Math.random() * 0.022;
        this.progress = 0;
        this.started = delay <= 0;
        this.isDead = false;
        this.bulletSize = weapon.bulletSize || 1.1;
    }

    recalcTrajectory() {
        if (this.lockedHit && this.lockedHit.dummy && !this.lockedHit.dummy.isDead) {
            const d = this.lockedHit.dummy;
            const h = this.lockedHit.hit;
            const cos = Math.cos(d.angle);
            const sin = Math.sin(d.angle);
            this.targetX = (d.x + d.shakeX) + (h.localX * cos - h.localY * sin);
            this.targetY = (d.y + d.shakeY) + (h.localX * sin + h.localY * cos);
        }
        const dx = this.targetX - this.startX;
        const dy = this.targetY - this.startY;
        this.dist = Math.max(10, Math.hypot(dx, dy));
        this.angle = Math.atan2(dy, dx);
    }

    update(dt, currentMuzzlePos) {
        if (this.delay > 0) {
            this.delay -= dt;
            if (this.delay <= 0) {
                this.started = true;
                if (currentMuzzlePos) {
                    this.startX = currentMuzzlePos.x;
                    this.startY = currentMuzzlePos.y;
                }
            } else {
                return false;
            }
        }

        this.recalcTrajectory();
        this.progress += dt / this.flightDuration;

        if (this.progress >= 1.0) {
            this.progress = 1.0;
            this.x = this.targetX;
            this.y = this.targetY;
            this.isDead = true;
            return true; // 抵達並射入目標
        }

        this.x = this.startX + (this.targetX - this.startX) * this.progress;
        this.y = this.startY + (this.targetY - this.startY) * this.progress;
        return false;
    }

    draw(ctx) {
        if (!this.started || this.isDead) return;

        const p = this.progress;
        // 3D 透視比例：剛從槍口射出時較大 (2.1x)，飛向遠處目標時縮小至 (0.95x)
        const persp = (2.15 - p * 1.2) * this.bulletSize;

        // 計算曳光彈尾跡起點 (長尾跡讓子彈射出感極度強烈)
        const tailP = Math.max(0, p - 0.42);
        const tailX = this.startX + (this.targetX - this.startX) * tailP;
        const tailY = this.startY + (this.targetY - this.startY) * tailP;

        ctx.save();

        // 1. 剛出膛時的槍口氣浪環 (前 45% 航程可見音爆環，強化「子彈射出」視覺)
        if (p < 0.48) {
            const ringAlpha = (1 - p / 0.48) * 0.7;
            const ringX = this.startX + (this.targetX - this.startX) * (p * 0.35);
            const ringY = this.startY + (this.targetY - this.startY) * (p * 0.35);
            ctx.save();
            ctx.translate(ringX, ringY);
            ctx.rotate(this.angle);
            ctx.strokeStyle = `rgba(255, 220, 130, ${ringAlpha})`;
            ctx.lineWidth = 2 * persp;
            ctx.beginPath();
            ctx.ellipse(0, 0, 5 * persp, (14 + p * 35) * persp, 0, 0, Math.PI * 2);
            ctx.stroke();
            ctx.restore();
        }

        // 2. 繪製多層次熾熱曳光彈道尾跡 (Tracer Trail)
        // 外層火光暈
        const gradOuter = ctx.createLinearGradient(tailX, tailY, this.x, this.y);
        gradOuter.addColorStop(0, 'rgba(255, 80, 0, 0)');
        gradOuter.addColorStop(0.5, 'rgba(255, 120, 10, 0.35)');
        gradOuter.addColorStop(1, this.weapon.color || '#ffaa00');
        ctx.strokeStyle = gradOuter;
        ctx.lineWidth = 8.5 * persp;
        ctx.lineCap = 'round';
        ctx.beginPath();
        ctx.moveTo(tailX, tailY);
        ctx.lineTo(this.x, this.y);
        ctx.stroke();

        // 中層亮金火線
        const gradMid = ctx.createLinearGradient(tailX, tailY, this.x, this.y);
        gradMid.addColorStop(0, 'rgba(255, 200, 50, 0)');
        gradMid.addColorStop(1, '#ffee77');
        ctx.strokeStyle = gradMid;
        ctx.lineWidth = 4 * persp;
        ctx.beginPath();
        ctx.moveTo(tailX, tailY);
        ctx.lineTo(this.x, this.y);
        ctx.stroke();

        // 內層白熱核心線
        const midTailX = this.startX + (this.targetX - this.startX) * Math.max(0, p - 0.22);
        const midTailY = this.startY + (this.targetY - this.startY) * Math.max(0, p - 0.22);
        ctx.strokeStyle = '#ffffff';
        ctx.lineWidth = 1.8 * persp;
        ctx.beginPath();
        ctx.moveTo(midTailX, midTailY);
        ctx.lineTo(this.x, this.y);
        ctx.stroke();

        // 3. 繪製立體金屬子彈彈頭與破風音爆錐 (3D Bullet Head)
        ctx.translate(this.x, this.y);
        ctx.rotate(this.angle);

        const bLen = 22 * persp;
        const bRad = 4.2 * persp;

        // 彈頭破風V型音爆火衣 (Mach Cone)
        const coneGrad = ctx.createLinearGradient(bLen * 0.6, 0, -bLen * 1.1, 0);
        coneGrad.addColorStop(0, 'rgba(255, 255, 255, 0.95)');
        coneGrad.addColorStop(0.35, 'rgba(255, 160, 20, 0.65)');
        coneGrad.addColorStop(1, 'rgba(255, 60, 0, 0)');
        ctx.fillStyle = coneGrad;
        ctx.beginPath();
        ctx.moveTo(bLen * 0.75, 0);
        ctx.lineTo(-bLen * 1.0, -bRad * 2.4);
        ctx.lineTo(-bLen * 0.5, 0);
        ctx.lineTo(-bLen * 1.0, bRad * 2.4);
        ctx.closePath();
        ctx.fill();

        // 子彈流線型黃銅/紅銅彈體
        const bulletGrad = ctx.createLinearGradient(0, -bRad, 0, bRad);
        bulletGrad.addColorStop(0, '#fff6cc');
        bulletGrad.addColorStop(0.35, '#f1c40f');
        bulletGrad.addColorStop(0.75, '#d35400');
        bulletGrad.addColorStop(1, '#6e2c00');
        ctx.fillStyle = bulletGrad;

        ctx.beginPath();
        ctx.moveTo(-bLen * 0.55, -bRad);
        ctx.lineTo(bLen * 0.1, -bRad);
        // 尖銳流線彈頭 (Ogive Nose)
        ctx.quadraticCurveTo(bLen * 0.55, -bRad * 0.6, bLen * 0.7, 0);
        ctx.quadraticCurveTo(bLen * 0.55, bRad * 0.6, bLen * 0.1, bRad);
        ctx.lineTo(-bLen * 0.55, bRad);
        ctx.closePath();
        ctx.fill();

        // 彈體高光反光條
        ctx.strokeStyle = 'rgba(255, 255, 255, 0.85)';
        ctx.lineWidth = Math.max(1, 1.2 * persp);
        ctx.beginPath();
        ctx.moveTo(-bLen * 0.45, -bRad * 0.5);
        ctx.lineTo(bLen * 0.45, -bRad * 0.2);
        ctx.stroke();

        // 彈底曳光藥燃燒亮點 (Tracer Base Flare)
        ctx.fillStyle = '#ffffff';
        ctx.beginPath();
        ctx.arc(-bLen * 0.55, 0, bRad * 0.9, 0, Math.PI * 2);
        ctx.fill();

        ctx.restore();
    }
}

// 投擲物/飛行物實體 (火箭、番茄等)
class Projectile {
    constructor(startX, startY, targetX, targetY, type, weapon) {
        this.x = startX;
        this.y = startY;
        this.startX = startX;
        this.startY = startY;
        this.targetX = targetX;
        this.targetY = targetY;
        this.type = type; // 'rocket' | 'tomato'
        this.weapon = weapon;

        const dx = targetX - startX;
        const dy = targetY - startY;
        this.dist = Math.hypot(dx, dy);
        this.angle = Math.atan2(dy, dx);

        this.speed = type === 'rocket' ? 1400 : 950;
        this.vx = Math.cos(this.angle) * this.speed;
        this.vy = Math.sin(this.angle) * this.speed;

        this.traveled = 0;
        this.isDead = false;
        this.life = 0;
    }

    update(dt) {
        this.life += dt;
        const step = this.speed * dt;
        this.x += this.vx * dt;
        this.y += this.vy * dt;
        this.traveled += step;

        if (this.traveled >= this.dist) {
            this.x = this.targetX;
            this.y = this.targetY;
            this.isDead = true;
            return true; // 抵達目標點
        }
        return false;
    }

    draw(ctx) {
        ctx.save();
        ctx.translate(this.x, this.y);
        ctx.rotate(this.angle);

        if (this.type === 'rocket') {
            // 火箭彈身
            ctx.fillStyle = '#445544';
            ctx.fillRect(-18, -5, 36, 10);
            // 彈頭
            ctx.fillStyle = '#cc2222';
            ctx.beginPath();
            ctx.moveTo(18, -5);
            ctx.lineTo(28, 0);
            ctx.lineTo(18, 5);
            ctx.fill();
            // 尾翼
            ctx.fillStyle = '#222';
            ctx.fillRect(-18, -10, 6, 20);
            // 尾焰
            ctx.fillStyle = '#ffaa00';
            ctx.beginPath();
            ctx.moveTo(-18, -4);
            ctx.lineTo(-35 - Math.random() * 20, 0);
            ctx.lineTo(-18, 4);
            ctx.fill();
        } else if (this.type === 'tomato') {
            // 旋轉飛行中的紅番茄
            ctx.fillStyle = '#d63031';
            ctx.beginPath();
            ctx.arc(0, 0, 10, 0, Math.PI * 2);
            ctx.fill();
            // 綠蒂
            ctx.fillStyle = '#27ae60';
            ctx.beginPath();
            ctx.arc(0, -7, 4, 0, Math.PI * 2);
            ctx.fill();
        }

        ctx.restore();
    }
}

window.WEAPONS = WEAPONS;
window.BulletProjectile = BulletProjectile;
window.Projectile = Projectile;
