// 武器定義與彈道管理
const WEAPONS = {
    pistol: {
        id: 'pistol',
        name: '沙漠之鷹 (Pistol)',
        icon: '🔫',
        fireRate: 0.22, // 秒/發
        damage: 45,
        force: 18,
        pellets: 1,
        spread: 0.015,
        auto: false,
        sound: 'playPistol',
        color: '#ffdd55',
        type: 'hitscan'
    },
    smg: {
        id: 'smg',
        name: '微型衝鋒槍 (SMG)',
        icon: '⚡',
        fireRate: 0.08, // 連射
        damage: 18,
        force: 8,
        pellets: 1,
        spread: 0.045,
        auto: true,
        sound: 'playSMG',
        color: '#ffaa00',
        type: 'hitscan'
    },
    shotgun: {
        id: 'shotgun',
        name: '霰彈槍 (Shotgun)',
        icon: '💥',
        fireRate: 0.75,
        damage: 22, // 每顆彈丸
        force: 35,
        pellets: 8,
        spread: 0.09,
        auto: false,
        sound: 'playShotgun',
        color: '#ff7700',
        type: 'hitscan'
    },
    tomato: {
        id: 'tomato',
        name: '爛番茄 (Tomato)',
        icon: '🍅',
        fireRate: 0.3,
        damage: 10,
        force: 12,
        pellets: 1,
        spread: 0,
        auto: true,
        sound: 'playSplat',
        color: '#e74c3c',
        type: 'projectile',
        projectileType: 'tomato'
    },
    rpg: {
        id: 'rpg',
        name: '火箭筒 (RPG-7)',
        icon: '🚀',
        fireRate: 1.1,
        damage: 250,
        force: 80,
        pellets: 1,
        spread: 0,
        auto: false,
        sound: 'playExplosion',
        color: '#ff4400',
        type: 'projectile',
        projectileType: 'rocket'
    },
    laser: {
        id: 'laser',
        name: '雷射加農 (Laser)',
        icon: '🔮',
        fireRate: 0.15,
        damage: 65,
        force: 22,
        pellets: 1,
        spread: 0,
        auto: true,
        sound: 'playLaser',
        color: '#00e5ff',
        type: 'beam'
    }
};

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
            ctx.lineTo(-30 - Math.random() * 15, 0);
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
window.Projectile = Projectile;
