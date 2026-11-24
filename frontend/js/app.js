// URL do Backend apontando para o túnel ativo
const DEFAULT_TUNNEL_URL = 'https://aid-individuals-achieving-forestry.trycloudflare.com';

const urlParams = new URLSearchParams(window.location.search);
if (urlParams.get('api')) {
    localStorage.setItem('custom_api_url', urlParams.get('api').replace(/\/+$/, ''));
}

const savedCustomApi = localStorage.getItem('custom_api_url');
const API_BASE = (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1')
    ? 'http://127.0.0.1:3000'
    : (savedCustomApi || DEFAULT_TUNNEL_URL);

const API_URL = `${API_BASE}/api`;

let authToken = localStorage.getItem('token');
let currentUser = null;
let balanceSyncInterval = null;

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

// Função para padronizar telefone (garante sempre 55 + DDD + Número)
function normalizePhone(rawPhone) {
    let cleaned = String(rawPhone || '').replace(/\D/g, '');
    if (cleaned.length === 10 || cleaned.length === 11) {
        cleaned = '55' + cleaned;
    }
    return cleaned;
}

// Atualiza o contador de giros na tela e destrava o botão de girar
function updateSpinsDisplay(newSpins) {
    const validSpins = Math.max(0, parseInt(newSpins, 10) || 0);
    if (currentUser) currentUser.spins = validSpins;
    if (spinsCounter) spinsCounter.textContent = validSpins;
    if (spinBtn && !isSpinning) {
        spinBtn.disabled = false;
    }
}

// Sincroniza o saldo com o banco a cada 3 segundos
async function syncUserBalance() {
    if (!authToken) return;
    try {
        const res = await fetch(`${API_URL}/auth/me`, {
            headers: { 'Authorization': `Bearer ${authToken}` }
        });
        if (res.ok) {
            const data = await res.json();
            if (data.success && data.user) {
                updateSpinsDisplay(data.user.spins);
            }
        }
    } catch (e) {
        // Ignora falhas temporárias de rede
    }
}

function startBalanceSync() {
    if (balanceSyncInterval) clearInterval(balanceSyncInterval);
    balanceSyncInterval = setInterval(syncUserBalance, 3000);
}

function stopBalanceSync() {
    if (balanceSyncInterval) {
        clearInterval(balanceSyncInterval);
        balanceSyncInterval = null;
    }
}

// MAPEAMENTO DAS IMAGENS (Rotas para a pasta assets/)
const loadedImages = {};
const symbolImagePaths = {
    'EMPTY': 'assets/images.jpg',
    'MAINLINE': 'assets/familia_floripa_mini_banner_1920x1080.png',
    'HW_SILVER': 'assets/silver.jpg',
    'HW_PREMIUM': 'assets/hotwhelspremium.jpg',
    'MINIGT': 'assets/mini gt.png',
    'INO64': 'assets/ino64.webp',
    'KAIDO': 'assets/kaido.webp'
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
    otpForm.classList.add('hidden');
    registerForm.classList.remove('hidden');
});

showLoginLink.addEventListener('click', (e) => {
    e.preventDefault();
    registerForm.classList.add('hidden');
    otpForm.classList.add('hidden');
    loginForm.classList.remove('hidden');
});

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

// AUTENTICAÇÃO - LOGIN
loginForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    const phone = normalizePhone(document.getElementById('login-phone').value);
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
        alert(`Servidor indisponível em ${API_BASE}.\nVerifique se o node server.js e o túnel Cloudflare da porta 3000 estão ativos.`);
    }
});

// AUTENTICAÇÃO - SOLICITAR CÓDIGO OTP
registerForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    const nameInput = document.getElementById('reg-name');
    const name = nameInput && nameInput.value.trim() ? nameInput.value.trim() : 'Jogador';
    const phone = normalizePhone(document.getElementById('reg-phone').value);
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
            alert(data.message || 'Código enviado para seu WhatsApp!');
        } else {
            alert(data.error || 'Erro no cadastro. Verifique se o WhatsApp do servidor está conectado.');
        }
    } catch (err) {
        alert(`Erro ao conectar ao servidor (${API_BASE}). Verifique se o backend e o túnel estão rodando.`);
    }
});

// AUTENTICAÇÃO - VERIFICAR OTP E FINALIZAR CADASTRO
otpForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    const code = String(document.getElementById('otp-code').value || '').trim();
    const phoneToVerify = pendingRegPhone || normalizePhone(document.getElementById('reg-phone').value);

    try {
        const res = await fetch(`${API_URL}/auth/verify-register`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ phone: phoneToVerify, code })
        });
        const data = await res.json();

        if (data.success) {
            authToken = data.token;
            localStorage.setItem('token', authToken);
            currentUser = data.user;
            pendingRegPhone = '';
            initGame();
        } else {
            alert(data.error || 'Código incorreto.');
        }
    } catch (err) {
        alert('Erro ao verificar código.');
    }
});

logoutBtn.addEventListener('click', () => {
    stopBalanceSync();
    localStorage.removeItem('token');
    authToken = null;
    currentUser = null;
    location.reload();
});

// MODAL COMPRA DE GIROS (AUTORIZAÇÃO AUTOMÁTICA DO ADMIN)
buySpinsBtn.addEventListener('click', () => buyModal.classList.remove('hidden'));
closeModal.addEventListener('click', () => {
    buyModal.classList.add('hidden');
    syncUserBalance();
});

document.querySelectorAll('.select-pkg').forEach(btn => {
    btn.addEventListener('click', async (e) => {
        const button = e.target;
        const card = button.closest('.package-card');
        const spinAmount = card.dataset.spins;
        const price = card.dataset.price;

        button.disabled = true;
        const originalText = button.textContent;
        button.textContent = 'Liberando...';

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

            if (data.success) {
                if (typeof data.newSpins !== 'undefined') {
                    updateSpinsDisplay(data.newSpins);
                } else {
                    await syncUserBalance();
                }
                winMessage.textContent = `🎉 +${spinAmount} Giros liberados! Boa sorte!`;
                buyModal.classList.add('hidden');
                alert(data.message || `✅ Compra autorizada! +${spinAmount} giros adicionados.`);
            } else {
                alert(data.error || 'Não foi possível liberar os giros.');
            }
        } catch (err) {
            alert('Erro na requisição ao comprar giros.');
        } finally {
            button.disabled = false;
            button.textContent = originalText;
        }
    });
});

const CELL_WIDTH = 100;
const CELL_HEIGHT = 150;

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

function drawGrid(grid = [['EMPTY','EMPTY','EMPTY'],['EMPTY','EMPTY','EMPTY'],['EMPTY','EMPTY','EMPTY']], isWin = false) {
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    for (let r = 0; r < 3; r++) {
        for (let c = 0; c < 3; c++) {
            if (isWin) {
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
                ctx.shadowBlur = 0;
                ctx.font = '36px Arial';
                ctx.textAlign = 'center';
                ctx.textBaseline = 'middle';
                ctx.fillStyle = '#e74c3c';
                ctx.fillText('❌', c * CELL_WIDTH + CELL_WIDTH / 2, r * CELL_HEIGHT + CELL_HEIGHT / 2);
            }
        }
    }
    
    ctx.shadowBlur = 0;
}

function animateSpin(finalGrid, onComplete) {
    isSpinning = true;
    const startTime = performance.now();
    const duration = 4500;
    
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

    await syncUserBalance();
    const currentSpins = parseInt(spinsCounter.textContent, 10) || 0;

    if (currentSpins <= 0) {
        buyModal.classList.remove('hidden');
        return;
    }

    spinBtn.disabled = true;
    winMessage.textContent = 'GIRANDO... 🎰';

    try {
        const res = await fetch(`${API_URL}/spin`, {
            method: 'POST',
            headers: { 'Authorization': `Bearer ${authToken}` }
        });
        const data = await res.json();

        if (!data.success) {
            if (data.error && data.error.includes('giros')) {
                buyModal.classList.remove('hidden');
            } else {
                alert(data.error);
            }
            spinBtn.disabled = false;
            winMessage.textContent = '';
            return;
        }

        updateSpinsDisplay(data.newSpins);

        animateSpin(data.grid, () => {
            if (data.winCount > 0) {
                winMessage.textContent = `🎉 GANHOU: ${data.wonMiniatures.join(', ')}!`;
                drawGrid(data.grid, true);
                fetchPrizes();
            } else {
                winMessage.textContent = '❌ Tente Novamente!';
                drawGrid(data.grid, false);
            }
            spinBtn.disabled = false;

            if (parseInt(data.newSpins, 10) <= 0) {
                setTimeout(() => buyModal.classList.remove('hidden'), 800);
            }
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
            updateSpinsDisplay(currentUser.spins);
            drawGrid();
            fetchPrizes();
            startBalanceSync();
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
// FIM DO ARQUIVO