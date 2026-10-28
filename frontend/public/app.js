const API_URL = 'http://localhost:3000/api';
let authToken = localStorage.getItem('token');
let currentUser = null;

// ELEMENTOS DOM
const authScreen = document.getElementById('auth-screen');
const gameScreen = document.getElementById('game-screen');
const loginForm = document.getElementById('login-form');
const registerForm = document.getElementById('register-form');
const otpForm = document.getElementById('otp-form');

const showRegisterLink = document.getElementById('show-register');
const showLoginLink = document.getElementById('show-login');

const userNameDisplay = document.getElementById('user-name-display');
const userPhoneDisplay = document.getElementById('user-phone-display');
const spinsCounter = document.getElementById('spins-counter');
const spinBtn = document.getElementById('spin-btn');
const winMessage = document.getElementById('win-message');
const prizesList = document.getElementById('prizes-list');
const togglePrizesBtn = document.getElementById('toggle-prizes-btn');

const buySpinsBtn = document.getElementById('buy-spins-btn');
const buyModal = document.getElementById('buy-modal');
const closeModal = document.querySelector('.close-modal');
const logoutBtn = document.getElementById('logout-btn');

const canvas = document.getElementById('slot-canvas');
const ctx = canvas.getContext('2d');

let pendingRegPhone = '';
let isSpinning = false;

// MAPEAMENTO DAS IMAGENS
const loadedImages = {};
const symbolImagePaths = {
    'EMPTY': null,
    'MAINLINE': 'images.jpg',
    'HW_SILVER': 'silver.jpg',
    'HW_PREMIUM': 'hotwhelspremium.jpg',
    'MINIGT': 'mini%20gt.png',
    'INO64': 'ino64.webp',
    'KAIDO': 'kaido.webp'
};

const SYMBOL_KEYS = Object.keys(symbolImagePaths);

// PRÉ-CARREGAMENTO DAS IMAGENS
Object.keys(symbolImagePaths).forEach(symbolKey => {
    const fileName = symbolImagePaths[symbolKey];
    if (fileName) {
        const img = new Image();
        img.src = fileName;
        img.onload = () => {
            if (!isSpinning) drawGrid();
        };
        loadedImages[symbolKey] = img;
    }
});

// ALTERNÂNCIA DE TELAS
showRegisterLink.addEventListener('click', (e) => {
    e.preventDefault();
    loginForm.classList.add('hidden');
    registerForm.classList.remove('hidden');
});

showLoginLink.addEventListener('click', (e) => {
    e.preventDefault();
    registerForm.classList.add('hidden');
    loginForm.classList.remove('hidden');
});

// BOTÃO EXIBIR/OCULTAR LISTA DE PRÊMIOS
togglePrizesBtn.addEventListener('click', () => {
    const isHidden = prizesList.classList.contains('hidden');
    if (isHidden) {
        prizesList.classList.remove('hidden');
        togglePrizesBtn.textContent = '🏆 Meus Prêmios Ganhos ▲';
    } else {
        prizesList.classList.add('hidden');
        togglePrizesBtn.textContent = '🏆 Meus Prêmios Ganhos ▼';
    }
});

// AUTENTICAÇÃO
loginForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    const phone = document.getElementById('login-phone').value;
    const password = document.getElementById('login-password').value;

    try {
        const res = await fetch(`${API_URL}/auth/login`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ phone, password })
        });
        const data = await res.json();

        if (data.success) {
            authToken = data.token;
            localStorage.setItem('token', authToken);
            currentUser = data.user;
            initGame();
        } else {
            alert(data.error || 'Erro ao realizar login.');
        }
    } catch (err) {
        alert('Servidor indisponível.');
    }
});

registerForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    const name = document.getElementById('reg-name').value;
    const phone = document.getElementById('reg-phone').value;
    const password = document.getElementById('reg-password').value;

    try {
        const res = await fetch(`${API_URL}/auth/register-otp`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ name, phone, password })
        });
        const data = await res.json();

        if (data.success) {
            pendingRegPhone = phone;
            registerForm.classList.add('hidden');
            otpForm.classList.remove('hidden');
            alert(data.message);
        } else {
            alert(data.error || 'Erro no cadastro.');
        }
    } catch (err) {
        alert('Servidor indisponível.');
    }
});

otpForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    const code = document.getElementById('otp-code').value;

    try {
        const res = await fetch(`${API_URL}/auth/verify-register`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ phone: pendingRegPhone, code })
        });
        const data = await res.json();

        if (data.success) {
            authToken = data.token;
            localStorage.setItem('token', authToken);
            currentUser = data.user;
            initGame();
        } else {
            alert(data.error || 'Código incorreto.');
        }
    } catch (err) {
        alert('Erro ao verificar código.');
    }
});

logoutBtn.addEventListener('click', () => {
    localStorage.removeItem('token');
    location.reload();
});

// MODAL COMPRA DE GIROS
buySpinsBtn.addEventListener('click', () => buyModal.classList.remove('hidden'));
closeModal.addEventListener('click', () => buyModal.classList.add('hidden'));

document.querySelectorAll('.select-pkg').forEach(btn => {
    btn.addEventListener('click', async (e) => {
        const card = e.target.closest('.package-card');
        const spinAmount = card.dataset.spins;
        const price = card.dataset.price;

        try {
            const res = await fetch(`${API_URL}/buy-spins`, {
                method: 'POST',
                headers: { 
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${authToken}`
                },
                body: JSON.stringify({ spinAmount, price })
            });
            const data = await res.json();
            alert(data.message || 'Solicitação enviada ao Admin.');
            buyModal.classList.add('hidden');
        } catch (err) {
            alert('Erro na requisição.');
        }
    });
});

// DIMENSÕES DO CANVAS (300px LARGURA x 450px ALTURA)
const CELL_WIDTH = 100;
const CELL_HEIGHT = 150;

// FUNÇÃO DE RENDERIZAÇÃO PROPORCIONAL
function drawCenteredImage(img, x, y, maxW, maxH) {
    const padding = 12;
    const targetW = maxW - padding * 2;
    const targetH = maxH - padding * 2;

    const imgAspect = img.naturalWidth / img.naturalHeight;
    const boxAspect = targetW / targetH;

    let renderW, renderH;

    if (imgAspect > boxAspect) {
        renderW = targetW;
        renderH = targetW / imgAspect;
    } else {
        renderH = targetH;
        renderW = targetH * imgAspect;
    }

    const renderX = x + (maxW - renderW) / 2;
    const renderY = y + (maxH - renderH) / 2;

    ctx.drawImage(img, renderX, renderY, renderW, renderH);
}

// DESENHO ESTÁTICO DO GRID COM SUPORTE A BRILHO DE VITÓRIA (GLOW)
function drawGrid(grid = [['EMPTY','EMPTY','EMPTY'],['EMPTY','EMPTY','EMPTY'],['EMPTY','EMPTY','EMPTY']], isWin = false) {
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    for (let r = 0; r < 3; r++) {
        for (let c = 0; c < 3; c++) {
            if (isWin) {
                // Efeito Neon Dourado Intenso nas Bordas ao Ganhar
                ctx.strokeStyle = '#ffe600';
                ctx.lineWidth = 4;
                ctx.shadowColor = '#f39c12';
                ctx.shadowBlur = 20;
            } else {
                ctx.strokeStyle = '#f1c40f';
                ctx.lineWidth = 2;
                ctx.shadowBlur = 0;
            }

            ctx.strokeRect(c * CELL_WIDTH, r * CELL_HEIGHT, CELL_WIDTH, CELL_HEIGHT);

            const symbolKey = grid[r][c];
            const img = loadedImages[symbolKey];

            if (img && img.complete && img.naturalWidth !== 0) {
                drawCenteredImage(img, c * CELL_WIDTH, r * CELL_HEIGHT, CELL_WIDTH, CELL_HEIGHT);
            } else {
                ctx.shadowBlur = 0; // Limpa sombra para o ícone estático
                ctx.font = '36px Arial';
                ctx.textAlign = 'center';
                ctx.textBaseline = 'middle';
                ctx.fillStyle = '#e74c3c';
                ctx.fillText('❌', c * CELL_WIDTH + CELL_WIDTH / 2, r * CELL_HEIGHT + CELL_HEIGHT / 2);
            }
        }
    }
    
    // Reseta configurações de sombra padrão após o loop
    ctx.shadowBlur = 0;
}

// ANIMAÇÃO DE GIRO COM DESACELERAÇÃO
function animateSpin(finalGrid, onComplete) {
    isSpinning = true;
    const startTime = performance.now();
    const duration = 4500; // 4.5s
    
    const tempDisplayGrid = [
        ['EMPTY','EMPTY','EMPTY'],
        ['EMPTY','EMPTY','EMPTY'],
        ['EMPTY','EMPTY','EMPTY']
    ];

    let lastTick = 0;

    function frame(now) {
        const elapsed = now - startTime;
        const progress = Math.min(elapsed / duration, 1);

        if (now - lastTick > 120) {
            lastTick = now;
            for (let c = 0; c < 3; c++) {
                for (let r = 0; r < 3; r++) {
                    const randIndex = Math.floor(Math.random() * SYMBOL_KEYS.length);
                    tempDisplayGrid[r][c] = SYMBOL_KEYS[randIndex];
                }
            }
        }

        ctx.clearRect(0, 0, canvas.width, canvas.height);

        for (let c = 0; c < 3; c++) {
            const columnFinished = progress > (0.55 + c * 0.20);

            for (let r = 0; r < 3; r++) {
                ctx.strokeStyle = '#f1c40f';
                ctx.lineWidth = 2;
                ctx.shadowBlur = 0;
                ctx.strokeRect(c * CELL_WIDTH, r * CELL_HEIGHT, CELL_WIDTH, CELL_HEIGHT);

                const symbolKey = columnFinished ? finalGrid[r][c] : tempDisplayGrid[r][c];
                const img = loadedImages[symbolKey];

                if (img && img.complete && img.naturalWidth !== 0) {
                    drawCenteredImage(img, c * CELL_WIDTH, r * CELL_HEIGHT, CELL_WIDTH, CELL_HEIGHT);
                } else {
                    ctx.font = '36px Arial';
                    ctx.textAlign = 'center';
                    ctx.textBaseline = 'middle';
                    ctx.fillStyle = '#e74c3c';
                    ctx.fillText('❌', c * CELL_WIDTH + CELL_WIDTH / 2, r * CELL_HEIGHT + CELL_HEIGHT / 2);
                }
            }
        }

        if (progress < 1) {
            requestAnimationFrame(frame);
        } else {
            isSpinning = false;
            if (onComplete) onComplete();
        }
    }

    requestAnimationFrame(frame);
}

async function fetchPrizes() {
    try {
        const res = await fetch(`${API_URL}/prizes`, {
            headers: { 'Authorization': `Bearer ${authToken}` }
        });
        const data = await res.json();
        if (data.success) {
            prizesList.innerHTML = '';
            if (data.prizes.length === 0) {
                prizesList.innerHTML = '<li>Nenhum prêmio ganho ainda.</li>';
            } else {
                data.prizes.forEach(p => {
                    const li = document.createElement('li');
                    li.textContent = `🏆 ${p.prize_name} - ${p.formatted_time}`;
                    prizesList.appendChild(li);
                });
            }
        }
    } catch (e) {}
}

spinBtn.addEventListener('click', async () => {
    if (isSpinning) return;

    spinBtn.disabled = true;
    winMessage.textContent = 'GIRANDO... 🎰';

    try {
        const res = await fetch(`${API_URL}/spin`, {
            method: 'POST',
            headers: { 'Authorization': `Bearer ${authToken}` }
        });
        const data = await res.json();

        if (!data.success) {
            alert(data.error);
            spinBtn.disabled = false;
            winMessage.textContent = '';
            return;
        }

        spinsCounter.textContent = data.newSpins;

        // Executa a animação de giro
        animateSpin(data.grid, () => {
            if (data.winCount > 0) {
                winMessage.textContent = `🎉 GANHOU: ${data.wonMiniatures.join(', ')}!`;
                
                // Desenha a roleta com brilho ativado (glow effect)
                drawGrid(data.grid, true);
                
                fetchPrizes();
            } else {
                winMessage.textContent = '❌ Tente Novamente!';
                drawGrid(data.grid, false);
            }
            spinBtn.disabled = false;
        });

    } catch (err) {
        alert('Erro ao processar giro.');
        spinBtn.disabled = false;
    }
});

async function initGame() {
    authScreen.classList.add('hidden');
    gameScreen.classList.remove('hidden');

    try {
        const res = await fetch(`${API_URL}/auth/me`, {
            headers: { 'Authorization': `Bearer ${authToken}` }
        });
        const data = await res.json();

        if (data.success) {
            currentUser = data.user;
            userNameDisplay.textContent = `👤 ${currentUser.name}`;
            userPhoneDisplay.textContent = `📱 ${currentUser.phone}`;
            spinsCounter.textContent = currentUser.spins;
            drawGrid();
            fetchPrizes();
        } else {
            localStorage.removeItem('token');
            location.reload();
        }
    } catch (e) {
        alert('Erro de conexão.');
    }
}

if (authToken) {
    initGame();
} else {
    drawGrid();
}