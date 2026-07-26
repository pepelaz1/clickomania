const COLORS = ['#CC0000', '#4682B4', '#708090', '#B0B0B0', '#8B0000'];
const COLS = 10;
const ROWS = 15;
const MIN_GROUP = 2;

let ysdk = null;

const translations = {
    ru: {
        title: 'Кликинатор',
        score: 'Счёт:',
        removed: 'Удалено:',
        undo: 'Отменить',
        newGame: 'Новая игра',
        gameOver: 'Игра окончена!',
        finalScore: 'Итоговый счёт:',
        playAgain: 'Играть снова'
    },
    en: {
        title: 'Klikinator',
        score: 'Score:',
        removed: 'Removed:',
        undo: 'Undo',
        newGame: 'New Game',
        gameOver: 'Game Over!',
        finalScore: 'Final score:',
        playAgain: 'Play Again'
    }
};

let lang = 'ru';

function applyLang(t) {
    document.querySelector('h1').textContent = t.title;
    document.querySelector('#score-panel span:nth-child(1)').innerHTML = t.score + ' <b id="score">0</b>';
    document.querySelector('#score-panel span:nth-child(2)').innerHTML = t.removed + ' <b id="removed">0</b>';
    document.getElementById('btn-undo').textContent = t.undo;
    document.getElementById('btn-new').textContent = t.newGame;
    document.getElementById('game-over').querySelector('p:nth-child(1)').textContent = t.gameOver;
    document.getElementById('game-over').querySelector('p:nth-child(2)').innerHTML = t.finalScore + ' <b id="final-score">0</b>';
    document.getElementById('btn-restart').textContent = t.playAgain;
}

YaGames.init().then(sdk => {
    ysdk = sdk;
    lang = ysdk.environment?.i18n?.lang || 'ru';
    applyLang(translations[lang] || translations.ru);
    ysdk.features.LoadingAPI?.ready();
}).catch(() => {
    applyLang(translations.ru);
});

const canvas = document.getElementById('game');
const ctx = canvas.getContext('2d');

let grid = [];
let cellSize = 0;
let score = 0;
let totalRemoved = 0;
let history = [];
let hoverGroup = [];
let animating = false;

let animBlocks = [];
let particles = [];
let animationPhase = 'idle';
let explosionTimer = 0;

function resize() {
    const appW = document.getElementById('app').clientWidth - 16;
    const maxH = window.innerHeight - 120;
    cellSize = Math.floor(Math.min(appW / COLS, maxH / ROWS));
    canvas.width = cellSize * COLS;
    canvas.height = cellSize * ROWS;
    draw();
}

function initGrid() {
    grid = [];
    for (let r = 0; r < ROWS; r++) {
        grid[r] = [];
        for (let c = 0; c < COLS; c++) {
            grid[r][c] = Math.floor(Math.random() * COLORS.length);
        }
    }
    score = 0;
    totalRemoved = 0;
    history = [];
    animBlocks = [];
    particles = [];
    animationPhase = 'idle';
    animating = false;
    updateUI();
}

function findGroup(r, c, color, visited) {
    if (r < 0 || r >= ROWS || c < 0 || c >= COLS) return [];
    if (visited[r][c]) return [];
    if (grid[r][c] !== color) return [];
    visited[r][c] = true;
    let group = [[r, c]];
    group = group.concat(findGroup(r - 1, c, color, visited));
    group = group.concat(findGroup(r + 1, c, color, visited));
    group = group.concat(findGroup(r, c - 1, color, visited));
    group = group.concat(findGroup(r, c + 1, color, visited));
    return group;
}

function getGroup(r, c) {
    if (grid[r][c] === -1) return [];
    const visited = Array.from({ length: ROWS }, () => Array(COLS).fill(false));
    return findGroup(r, c, grid[r][c], visited);
}

function calcScore(groupSize) {
    if (groupSize <= 1) return 0;
    return groupSize * groupSize;
}

function saveState() {
    history.push({
        grid: grid.map(row => [...row]),
        score,
        totalRemoved
    });
    if (history.length > 50) history.shift();
}

function undo() {
    if (history.length === 0 || animating) return;
    const state = history.pop();
    grid = state.grid;
    score = state.score;
    totalRemoved = state.totalRemoved;
    animBlocks = [];
    particles = [];
    animationPhase = 'idle';
    updateUI();
    draw();
}

function hasValidMoves() {
    for (let r = 0; r < ROWS; r++) {
        for (let c = 0; c < COLS; c++) {
            if (grid[r][c] === -1) continue;
            if (getGroup(r, c).length >= MIN_GROUP) return true;
        }
    }
    return false;
}

function checkGameOver() {
    if (!hasValidMoves()) {
        document.getElementById('final-score').textContent = score;
        document.getElementById('game-over').classList.remove('hidden');
    }
}

function updateUI() {
    document.getElementById('score').textContent = score;
    document.getElementById('removed').textContent = totalRemoved;
}

function draw() {
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    const pad = Math.max(1, cellSize * 0.06);
    const radius = Math.max(2, cellSize * 0.12);

    const skipSet = new Set();
    for (const b of animBlocks) {
        if (b.color === -1) continue;
        skipSet.add(b.targetR * COLS + b.targetC);
        const x = b.visualC * cellSize;
        const y = b.visualR * cellSize;
        ctx.globalAlpha = 1;
        ctx.fillStyle = COLORS[b.color];
        roundRect(ctx, x + pad, y + pad, cellSize - pad * 2, cellSize - pad * 2, radius);
        ctx.fill();
    }

    for (let r = 0; r < ROWS; r++) {
        for (let c = 0; c < COLS; c++) {
            if (grid[r][c] === -1) continue;
            if (skipSet.has(r * COLS + c)) continue;

            const x = c * cellSize;
            const y = r * cellSize;
            const isHover = hoverGroup.some(([hr, hc]) => hr === r && hc === c);

            ctx.globalAlpha = 1;
            ctx.fillStyle = COLORS[grid[r][c]];
            roundRect(ctx, x + pad, y + pad, cellSize - pad * 2, cellSize - pad * 2, radius);
            ctx.fill();

            if (isHover) {
                ctx.strokeStyle = '#fff';
                ctx.lineWidth = 2;
                roundRect(ctx, x + pad, y + pad, cellSize - pad * 2, cellSize - pad * 2, radius);
                ctx.stroke();
            }
        }
    }
    ctx.globalAlpha = 1;
    drawParticles();
}

function roundRect(ctx, x, y, w, h, r) {
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.lineTo(x + w - r, y);
    ctx.quadraticCurveTo(x + w, y, x + w, y + r);
    ctx.lineTo(x + w, y + h - r);
    ctx.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
    ctx.lineTo(x + r, y + h);
    ctx.quadraticCurveTo(x, y + h, x, y + h - r);
    ctx.lineTo(x, y + r);
    ctx.quadraticCurveTo(x, y, x + r, y);
    ctx.closePath();
}

function drawParticles() {
    for (const p of particles) {
        ctx.globalAlpha = p.life;
        ctx.fillStyle = p.color;
        ctx.beginPath();
        ctx.arc(p.x, p.y, p.size * p.life, 0, Math.PI * 2);
        ctx.fill();
    }
    ctx.globalAlpha = 1;
}

function spawnExplosion(group) {
    const cx = group.reduce((s, [r, c]) => s + c, 0) / group.length * cellSize + cellSize / 2;
    const cy = group.reduce((s, [r, c]) => s + r, 0) / group.length * cellSize + cellSize / 2;

    for (const [r, c] of group) {
        const bx = c * cellSize + cellSize / 2;
        const by = r * cellSize + cellSize / 2;
        const color = COLORS[grid[r][c]];
        const count = 5 + Math.floor(Math.random() * 3);
        for (let i = 0; i < count; i++) {
            const dx = bx - cx;
            const dy = by - cy;
            const pushAngle = Math.atan2(dy, dx);
            const finalAngle = pushAngle + (Math.random() - 0.5) * 1.5;
            const speed = 2 + Math.random() * 3;
            particles.push({
                x: bx + (Math.random() - 0.5) * cellSize * 0.3,
                y: by + (Math.random() - 0.5) * cellSize * 0.3,
                vx: Math.cos(finalAngle) * speed + (Math.random() - 0.5) * 1,
                vy: Math.sin(finalAngle) * speed + (Math.random() - 0.5) * 1 - 0.5,
                color,
                life: 1,
                decay: 0.04 + Math.random() * 0.03,
                size: cellSize * (0.08 + Math.random() * 0.1),
                gravity: 0.1
            });
        }
    }

    for (let i = 0; i < 6; i++) {
        const angle = Math.random() * Math.PI * 2;
        const speed = 2 + Math.random() * 4;
        particles.push({
            x: cx,
            y: cy,
            vx: Math.cos(angle) * speed,
            vy: Math.sin(angle) * speed,
            color: '#fff',
            life: 1,
            decay: 0.06 + Math.random() * 0.03,
            size: cellSize * (0.03 + Math.random() * 0.04),
            gravity: 0.02
        });
    }
}

function updateParticles() {
    for (let i = particles.length - 1; i >= 0; i--) {
        const p = particles[i];
        p.x += p.vx;
        p.y += p.vy;
        p.vy += p.gravity;
        p.vx *= 0.97;
        p.life -= p.decay;
        if (p.life <= 0) particles.splice(i, 1);
    }
}

function getCellFromEvent(e) {
    const rect = canvas.getBoundingClientRect();
    let clientX, clientY;
    if (e.touches) {
        clientX = e.touches[0].clientX;
        clientY = e.touches[0].clientY;
    } else {
        clientX = e.clientX;
        clientY = e.clientY;
    }
    const x = clientX - rect.left;
    const y = clientY - rect.top;
    const c = Math.floor(x / cellSize);
    const r = Math.floor(y / cellSize);
    if (r >= 0 && r < ROWS && c >= 0 && c < COLS) return { r, c };
    return null;
}

function tick() {
    if (animationPhase === 'idle') return;

    if (animationPhase === 'explosion') {
        updateParticles();
        explosionTimer--;
        if (explosionTimer <= 0) {
            animationPhase = 'fall';
            prepareFall();
        }
        draw();
        requestAnimationFrame(tick);
        return;
    }

    if (animationPhase === 'fall') {
        updateParticles();
        let allDone = true;
        for (const b of animBlocks) {
            const diff = b.targetR - b.visualR;
            if (diff > 0.01) {
                b.visualR += diff * 0.12 + 0.04;
                if (b.visualR > b.targetR) b.visualR = b.targetR;
                allDone = false;
            }
        }
        draw();
        if (allDone) {
            for (const b of animBlocks) {
                grid[b.targetR][b.targetC] = b.color;
            }
            animBlocks = [];
            animationPhase = 'shift';
            prepareShift();
        }
        requestAnimationFrame(tick);
        return;
    }

    if (animationPhase === 'shift') {
        updateParticles();
        let allDone = true;
        for (const b of animBlocks) {
            const diff = b.targetC - b.visualC;
            if (Math.abs(diff) > 0.01) {
                b.visualC += diff * 0.15 + (diff > 0 ? 0.04 : -0.04);
                if ((diff > 0 && b.visualC > b.targetC) || (diff < 0 && b.visualC < b.targetC)) {
                    b.visualC = b.targetC;
                }
                allDone = false;
            }
        }
        draw();
        if (allDone) {
            for (const b of animBlocks) {
                grid[b.targetR][b.targetC] = b.color;
            }
            animBlocks = [];
            animationPhase = 'idle';
            animating = false;
            checkGameOver();
        } else {
            requestAnimationFrame(tick);
        }
    }
}

function prepareFall() {
    const moves = [];
    for (let c = 0; c < COLS; c++) {
        let emptySlots = 0;
        for (let r = ROWS - 1; r >= 0; r--) {
            if (grid[r][c] === -1) {
                emptySlots++;
            } else if (emptySlots > 0) {
                moves.push({
                    color: grid[r][c],
                    fromR: r,
                    fromC: c,
                    toR: r + emptySlots,
                    toC: c
                });
                grid[r + emptySlots][c] = grid[r][c];
                grid[r][c] = -1;
            }
        }
    }

    if (moves.length === 0) {
        animationPhase = 'shift';
        prepareShift();
        return;
    }

    animBlocks = moves.map(m => ({
        color: m.color,
        targetR: m.toR,
        targetC: m.toC,
        visualR: m.fromR,
        visualC: m.fromC
    }));
}

function prepareShift() {
    const shifts = [];
    let writeCol = 0;
    for (let c = 0; c < COLS; c++) {
        if (grid[ROWS - 1][c] !== -1) {
            if (writeCol !== c) {
                for (let r = 0; r < ROWS; r++) {
                    if (grid[r][c] !== -1) {
                        shifts.push({
                            color: grid[r][c],
                            fromC: c,
                            toC: writeCol,
                            row: r
                        });
                    }
                    grid[r][writeCol] = grid[r][c];
                    grid[r][c] = -1;
                }
            }
            writeCol++;
        }
    }

    for (let c = writeCol; c < COLS; c++) {
        for (let r = 0; r < ROWS; r++) {
            grid[r][c] = -1;
        }
    }

    if (shifts.length === 0) {
        animationPhase = 'idle';
        animating = false;
        checkGameOver();
        return;
    }

    animBlocks = shifts.map(s => ({
        color: s.color,
        targetR: s.row,
        targetC: s.toC,
        visualR: s.row,
        visualC: s.fromC
    }));
}

function handleClick(e) {
    if (animating) return;
    e.preventDefault();
    if (ysdk && !document.fullscreenElement) {
        document.documentElement.requestFullscreen?.().catch(() => {});
    }
    const cell = getCellFromEvent(e);
    if (!cell) return;
    const group = getGroup(cell.r, cell.c);
    if (group.length < MIN_GROUP) return;

    hoverGroup = [];

    saveState();
    const pts = calcScore(group.length);
    score += pts;
    totalRemoved += group.length;
    updateUI();

    animating = true;
    spawnExplosion(group);

    for (const [r, c] of group) {
        grid[r][c] = -1;
    }

    animationPhase = 'explosion';
    explosionTimer = 18;
    requestAnimationFrame(tick);
}

function handleMove(e) {
    if (animating) return;
    e.preventDefault();
    const cell = getCellFromEvent(e);
    if (!cell) {
        hoverGroup = [];
        draw();
        return;
    }
    const group = getGroup(cell.r, cell.c);
    hoverGroup = group.length >= MIN_GROUP ? group : [];
    draw();
}

function handleLeave() {
    hoverGroup = [];
    draw();
}

canvas.addEventListener('click', handleClick);
canvas.addEventListener('touchstart', handleClick, { passive: false });
canvas.addEventListener('mousemove', handleMove);
canvas.addEventListener('mouseleave', handleLeave);
canvas.addEventListener('contextmenu', e => e.preventDefault());

document.getElementById('btn-undo').addEventListener('click', undo);
document.getElementById('btn-new').addEventListener('click', () => {
    document.getElementById('game-over').classList.add('hidden');
    initGrid();
    draw();
});
document.getElementById('btn-restart').addEventListener('click', () => {
    document.getElementById('game-over').classList.add('hidden');
    initGrid();
    draw();
});

window.addEventListener('resize', resize);
resize();
initGrid();
draw();
