let registerPhoneTemp = '';
let currentMode = 'slot';
let isSpinningWheel = false;
let wheelAngle = 0;

// MAPEAMENTO DE IMAGENS DOS SÍMBOLOS
const SYMBOL_IMAGES = {
    'EMPTY': '/images.jpg', // Usamos como ícone neutro do Tente Novamente
    'MAINLINE': '/images.jpg',
    'HW_SILVER': '/silver.jpg',
    'HW_PREMIUM': '/hotwhelspremium.jpg',
    'MINIGT': '/mini%20gt.png',
    'INO64': '/ino64.webp',
    'KAIDO': '/kaido.webp'
};

const SYMBOL_NAMES = {
    'EMPTY': '❌ Tente Novamente',
    'MAINLINE': 'Hot Wheels Mainline',
    'HW_SILVER': 'Hot Wheels Silver',
    'HW_PREMIUM': 'Hot Wheels Premium',
    'MINIGT': 'Mini GT',
    'INO64': 'Ino64',
    'KAIDO': 'Kaido House'
};

// PRÉ-CARREGAMENTO DAS IMAGENS PARA O CANVAS DA ROLETA CONVENCIONAL
const loadedImages = {};
Object.keys(SYMBOL_IMAGES).forEach(id => {
    const img = new Image();
    img.src = SYMBOL_IMAGES[id];
    loadedImages[id] = img;
});

const ALL_SYMBOLS = Object.keys(SYMBOL_IMAGES);

const PAYLINE_INDICES = [
    [0, 1, 2], [3, 4, 5], [6, 7, 8],
    [0, 3, 6], [1, 4, 7], [2, 5, 8],
    [0, 4, 8], [2, 4, 6]
];

// SETORES DA ROLETA CONVENCIONAL (INCLUI VÁRIOS "TENTE NOVAMENTE")
const WHEEL_SECTORS = [
    { id: 'EMPTY', label: '❌ TENTE NOVAMENTE', color: '#3a0211' },
    { id: 'MAINLINE', label: 'Mainline', color: '#d90429' },
    { id: 'EMPTY', label: '❌ TENTE NOVAMENTE', color: '#1f002b' },
    { id: 'HW_SILVER', label: 'HW Silver', color: '#ffb703' },
    { id: 'EMPTY', label: '❌ TENTE NOVAMENTE', color: '#3a0211' },
    { id: 'HW_PREMIUM', label: 'HW Premium', color: '#028090' },
    { id: 'EMPTY', label: '❌ TENTE NOVAMENTE', color: '#1f002b' },
    { id: 'MINIGT', label: 'Mini GT', color: '#fb8500' },
    { id: 'EMPTY', label: '❌ TENTE NOVAMENTE', color: '#3a0211' },
    { id: 'KAIDO', label: 'Kaido House', color: '#00f5d4' }
];

function switchTab(type) {
    const loginForm = document.getElementById('form-login');
    const registerForm = document.getElementById('form-register');
    const loginBtn = document.getElementById('tab-login-btn');
    const registerBtn = document.getElementById('tab-register-btn');

    if (type === 'login') {
        loginForm.style.display = 'block';
        registerForm.style.display = 'none';
        loginBtn.classList.add('active');
        registerBtn.classList.remove('active');
    } else {
        loginForm.style.display = 'none';
        registerForm.style.display = 'block';
        loginBtn.classList.remove('active');
        registerBtn.classList.add('active');
        
        document.getElementById('reg-step-1').style.display = 'block';
        document.getElementById('reg-step-2').style.display = 'none';
    }
}

async function sendRegisterOTP() {
    const phoneInput = document.getElementById('reg-phone').value;
    const passInput = document.getElementById('reg-pass').value;

    if (!phoneInput || !passInput) {
        alert('Por favor, preencha seu WhatsApp e crie uma senha.');
        return;
    }

    registerPhoneTemp = phoneInput.replace(/\D/g, '');

    try {
        const response = await fetch('/api/auth/register-otp', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ phone: registerPhoneTemp, password: passInput })
        });

        const data = await response.json();

        if (response.ok && data.success) {
            alert('Código enviado para seu WhatsApp!');
            document.getElementById('reg-step-1').style.display = 'none';
            document.getElementById('reg-step-2').style.display = 'block';
        } else {
            alert(data.error || 'Erro ao enviar código.');
        }
    } catch (err) {
        alert('Erro de conexão.');
    }
}

async function verifyRegister() {
    const otpInput = document.getElementById('reg-otp').value;
    if (!otpInput) {
        alert('Digite o código recebido no WhatsApp.');
        return;
    }

    const phoneToSend = registerPhoneTemp || document.getElementById('reg-phone').value.replace(/\D/g, '');

    try {
        const response = await fetch('/api/auth/verify-register', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ phone: phoneToSend, code: String(otpInput).trim() })
        });

        const data = await response.json();

        if (response.ok && data.success) {
            localStorage.setItem('slot_token', data.token);
            showGameSelectionScreen(data.user);
        } else {
            alert(data.error || 'Código incorreto.');
        }
    } catch (err) {
        alert('Erro de cadastro.');
    }
}

async function login() {
    const phoneInput = document.getElementById('login-phone').value;
    const passInput = document.getElementById('login-pass').value;

    if (!phoneInput || !passInput) {
        alert('Preencha WhatsApp e Senha!');
        return;
    }

    try {
        const response = await fetch('/api/auth/login', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                phone: phoneInput.replace(/\D/g, ''),
                password: passInput
            })
        });

        const data = await response.json();

        if (response.ok && data.success) {
            localStorage.setItem('slot_token', data.token);
            showGameSelectionScreen(data.user);
        } else {
            alert(data.error || 'Erro ao fazer login.');
        }
    } catch (err) {
        alert('Erro na conexão.');
    }
}

function showGameSelectionScreen(user) {
    document.getElementById('auth-section').style.display = 'none';
    document.getElementById('game-section').style.display = 'none';
    document.getElementById('game-selection-section').style.display = 'block';

    document.getElementById('user-display-select').innerText = `📱 ${user.phone}`;
    document.getElementById('spins-val-select').innerText = user.spins;

    document.getElementById('user-display').innerText = `📱 ${user.phone}`;
    document.getElementById('spins-val').innerText = user.spins;

    if (parseInt(user.spins, 10) <= 0) {
        openNoSpinsModal();
    }
}

function selectGameMode(mode) {
    currentMode = mode;
    document.getElementById('game-selection-section').style.display = 'none';
    document.getElementById('game-section').style.display = 'block';

    if (mode === 'slot') {
        document.getElementById('slot-container').style.display = 'block';
        document.getElementById('wheel-container').style.display = 'none';
    } else {
        document.getElementById('slot-container').style.display = 'none';
        document.getElementById('wheel-container').style.display = 'block';
        setTimeout(() => drawWheel(wheelAngle), 100);
    }
}

function backToGameSelection() {
    document.getElementById('game-section').style.display = 'none';
    document.getElementById('game-selection-section').style.display = 'block';
}

function handleSpin() {
    if (currentMode === 'slot') spinSlot();
    else spinWheel();
}

/* -------------------------------------------------------------
 * DESENHO DA ROLETA CONVENCIONAL COM FOTOS NO CANVAS
 * ------------------------------------------------------------- */
function drawWheel(angle) {
    const canvas = document.getElementById('wheel-canvas');
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    const width = canvas.width;
    const height = canvas.height;
    const centerX = width / 2;
    const centerY = height / 2;
    const radius = width / 2 - 12;
    const numSectors = WHEEL_SECTORS.length;
    const arc = (2 * Math.PI) / numSectors;

    ctx.clearRect(0, 0, width, height);

    for (let i = 0; i < numSectors; i++) {
        const sectorAngle = angle + i * arc;
        const sector = WHEEL_SECTORS[i];

        // Desenha Fatia
        ctx.beginPath();
        ctx.fillStyle = sector.color;
        ctx.moveTo(centerX, centerY);
        ctx.arc(centerX, centerY, radius, sectorAngle, sectorAngle + arc);
        ctx.lineTo(centerX, centerY);
        ctx.fill();
        ctx.lineWidth = 3;
        ctx.strokeStyle = '#ffd700';
        ctx.stroke();

        // Desenha Texto e Imagem na Fatia
        ctx.save();
        ctx.translate(centerX, centerY);
        ctx.rotate(sectorAngle + arc / 2);

        // Imagem da Miniatura na fatia
        const img = loadedImages[sector.id];
        if (img && img.complete && sector.id !== 'EMPTY') {
            try {
                ctx.drawImage(img, radius - 48, -16, 32, 32);
            } catch (e) { }
        }

        ctx.textAlign = "right";
        ctx.fillStyle = "#ffffff";
        ctx.font = "900 11px Montserrat";
        ctx.shadowColor = "#000";
        ctx.shadowBlur = 4;
        ctx.fillText(sector.label, radius - (sector.id !== 'EMPTY' ? 54 : 15), 4);
        ctx.restore();
    }

    // Borda Externa Reluzente
    ctx.beginPath();
    ctx.arc(centerX, centerY, radius, 0, 2 * Math.PI);
    ctx.lineWidth = 6;
    ctx.strokeStyle = '#ffd700';
    ctx.stroke();

    // Centro Dourado do Botão
    ctx.beginPath();
    ctx.arc(centerX, centerY, 28, 0, 2 * Math.PI);
    ctx.fillStyle = '#ffd700';
    ctx.fill();
    ctx.lineWidth = 3;
    ctx.strokeStyle = '#ffffff';
    ctx.stroke();
}

async function spinWheel() {
    const token = localStorage.getItem('slot_token');
    const currentSpins = parseInt(document.getElementById('spins-val').innerText, 10);

    if (currentSpins <= 0) {
        openNoSpinsModal();
        return;
    }

    if (isSpinningWheel) return;
    isSpinningWheel = true;

    const spinBtn = document.getElementById('spin-btn');
    spinBtn.disabled = true;
    document.getElementById('result-msg').innerText = 'GIRANDO A ROLETA... 🎡✨';

    try {
        const response = await fetch('/api/spin', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${token}`
            }
        });

        const data = await response.json();

        if (response.ok && data.success) {
            const chosenSymbolId = data.grid[1][1];
            
            // Busca setor correspondente na roda
            let targetSectorIndex = WHEEL_SECTORS.findIndex(s => s.id === chosenSymbolId);
            if (targetSectorIndex === -1) targetSectorIndex = 0;

            const numSectors = WHEEL_SECTORS.length;
            const sectorArc = (2 * Math.PI) / numSectors;

            const targetAngle = (3 * Math.PI / 2) - (targetSectorIndex * sectorArc) - (sectorArc / 2);
            const extraRounds = 5 * 2 * Math.PI;
            const finalAngle = wheelAngle + extraRounds + (targetAngle - (wheelAngle % (2 * Math.PI)));

            const duration = 3200;
            const start = performance.now();
            const startAngle = wheelAngle;

            function animate(now) {
                const elapsed = now - start;
                const progress = Math.min(elapsed / duration, 1);
                const easeOut = 1 - Math.pow(1 - progress, 3);

                wheelAngle = startAngle + (finalAngle - startAngle) * easeOut;
                drawWheel(wheelAngle);

                if (progress < 1) {
                    requestAnimationFrame(animate);
                } else {
                    isSpinningWheel = false;
                    spinBtn.disabled = false;
                    document.getElementById('spins-val').innerText = data.newSpins;
                    document.getElementById('spins-val-select').innerText = data.newSpins;

                    if (data.winningLines && data.winningLines.length > 0) {
                        document.getElementById('result-msg').innerHTML = `
                            <div class="win-banner">
                                🎉 <strong>VOCÊ GANHOU MINIATURA(S)!</strong><br>
                                <span>${data.wonMiniatures.join('<br>')}</span>
                            </div>
                        `;
                    } else {
                        document.getElementById('result-msg').innerHTML = `
                            <div class="lose-banner">
                                ❌ <strong>TENTE NOVAMENTE!</strong><br>Não foi desta vez. Gire novamente!
                            </div>
                        `;
                    }

                    if (data.newSpins <= 0) setTimeout(openNoSpinsModal, 800);
                }
            }

            requestAnimationFrame(animate);

        } else {
            isSpinningWheel = false;
            spinBtn.disabled = false;
            if (data.error && data.error.includes('giros')) openNoSpinsModal();
            else alert(data.error || 'Erro ao girar.');
        }
    } catch (err) {
        isSpinningWheel = false;
        spinBtn.disabled = false;
        alert('Erro de conexão ao girar.');
    }
}

/* -------------------------------------------------------------
 * SLOTS (TIGRINHO)
 * ------------------------------------------------------------- */
function clearHighlights() {
    const cells = document.querySelectorAll('.slot-cell');
    cells.forEach(cell => cell.classList.remove('winning-cell'));
}

async function spinSlot() {
    const token = localStorage.getItem('slot_token');
    const currentSpins = parseInt(document.getElementById('spins-val').innerText, 10);

    if (currentSpins <= 0) {
        openNoSpinsModal();
        return;
    }

    const spinBtn = document.getElementById('spin-btn');
    spinBtn.disabled = true;
    document.getElementById('result-msg').innerText = 'ACELERANDO... 🏎️💨';

    clearHighlights();

    const cells = document.querySelectorAll('.slot-cell');
    cells.forEach(cell => cell.classList.add('spinning'));

    const animationInterval = setInterval(() => {
        cells.forEach(cell => {
            const randomSymbol = ALL_SYMBOLS[Math.floor(Math.random() * ALL_SYMBOLS.length)];
            const imgPath = SYMBOL_IMAGES[randomSymbol];
            cell.innerHTML = randomSymbol === 'EMPTY' 
                ? '<span style="font-size:1.8rem;">❌</span>' 
                : `<img src="${imgPath}" alt="spin" class="slot-img">`;
        });
    }, 100);

    try {
        const response = await fetch('/api/spin', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${token}`
            }
        });

        const data = await response.json();

        setTimeout(() => {
            clearInterval(animationInterval);
            cells.forEach(cell => cell.classList.remove('spinning'));

            if (response.ok && data.success) {
                updateGridDisplay(data.grid);
                document.getElementById('spins-val').innerText = data.newSpins;
                document.getElementById('spins-val-select').innerText = data.newSpins;

                if (data.winningLines && data.winningLines.length > 0) {
                    highlightWinningLines(data.winningLines);

                    document.getElementById('result-msg').innerHTML = `
                        <div class="win-banner">
                            🎉 <strong>VOCÊ GANHOU MINIATURA(S)!</strong><br>
                            <span>${data.wonMiniatures.join('<br>')}</span>
                        </div>
                    `;
                } else {
                    document.getElementById('result-msg').innerHTML = `
                        <div class="lose-banner">
                            ❌ <strong>TENTE NOVAMENTE!</strong><br>Não foi desta vez.
                        </div>
                    `;
                }

                if (data.newSpins <= 0) setTimeout(openNoSpinsModal, 800);
            } else {
                if (data.error && data.error.includes('giros')) openNoSpinsModal();
                else alert(data.error || 'Erro ao girar.');
            }
            spinBtn.disabled = false;
        }, 1200);

    } catch (err) {
        clearInterval(animationInterval);
        cells.forEach(cell => cell.classList.remove('spinning'));
        alert('Erro ao conectar.');
        spinBtn.disabled = false;
    }
}

function updateGridDisplay(grid) {
    const cells = document.querySelectorAll('.slot-cell');
    for (let r = 0; r < 3; r++) {
        for (let c = 0; c < 3; c++) {
            const index = r * 3 + c;
            const symbolId = grid[r][c];
            if (cells[index]) {
                if (symbolId === 'EMPTY') {
                    cells[index].innerHTML = '<span style="font-size:1.8rem; color:#ff0055;">❌</span>';
                } else {
                    const imgPath = SYMBOL_IMAGES[symbolId];
                    cells[index].innerHTML = `<img src="${imgPath}" alt="${symbolId}" class="slot-img">`;
                }
            }
        }
    }
}

function highlightWinningLines(winningLines) {
    clearHighlights();
    const cells = document.querySelectorAll('.slot-cell');
    winningLines.forEach(lineIndex => {
        const cellIndices = PAYLINE_INDICES[lineIndex];
        if (cellIndices) {
            cellIndices.forEach(idx => {
                if (cells[idx]) cells[idx].classList.add('winning-cell');
            });
        }
    });
}

/* -------------------------------------------------------------
 * MODAIS E LOJA
 * ------------------------------------------------------------- */
function openNoSpinsModal() { openShop(); }
function openShop() { document.getElementById('shop-modal').style.display = 'flex'; }
function closeShop() { document.getElementById('shop-modal').style.display = 'none'; }

async function buySpins(amount, price) {
    const token = localStorage.getItem('slot_token');
    if (!token) return alert('Faça login primeiro.');

    try {
        const response = await fetch('/api/buy-spins', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${token}`
            },
            body: JSON.stringify({ spinAmount: amount, price })
        });

        const data = await response.json();
        if (response.ok && data.success) {
            alert('Solicitação enviada ao WhatsApp do Admin!');
            closeShop();
        } else {
            alert(data.error || 'Erro ao solicitar.');
        }
    } catch (err) {
        alert('Erro na compra.');
    }
}

async function openPrizesModal() {
    document.getElementById('prizes-modal').style.display = 'flex';
    await loadPrizesHistory();
}

function closePrizesModal() {
    document.getElementById('prizes-modal').style.display = 'none';
}

async function loadPrizesHistory() {
    const token = localStorage.getItem('slot_token');
    const container = document.getElementById('prizes-list');
    container.innerHTML = '<p class="loading-txt">Carregando...</p>';

    try {
        const response = await fetch('/api/prizes', {
            headers: { 'Authorization': `Bearer ${token}` }
        });
        const data = await response.json();

        if (response.ok && data.success) {
            if (data.prizes.length === 0) {
                container.innerHTML = '<p class="empty-txt">Nenhum prêmio ainda!</p>';
                return;
            }

            container.innerHTML = data.prizes.map(p => {
                const countText = p.lines_count > 1 ? ` (${p.lines_count} fileiras acertadas)` : ' (1 fileira acertada)';
                return `
                    <div class="prize-card">
                        <div class="prize-info">
                            <strong>🏎️ ${p.prize_name}${countText}</strong>
                            <span class="prize-date">📅 ${p.formatted_time}</span>
                        </div>
                    </div>
                `;
            }).join('');
        } else {
            container.innerHTML = '<p class="error-txt">Erro ao carregar prêmios.</p>';
        }
    } catch (err) {
        container.innerHTML = '<p class="error-txt">Erro de conexão.</p>';
    }
}