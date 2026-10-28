console.log('🚀 Iniciando servidor Backend Garage Slots...');

const dns = require('dns');
dns.setDefaultResultOrder('ipv4first');

const originalLookup = dns.lookup;
dns.lookup = function (hostname, options, callback) {
    if (typeof options === 'function') {
        callback = options;
        options = {};
    }
    options = options || {};
    options.family = 4;
    return originalLookup(hostname, options, callback);
};

// Silenciamento de logs de sessão e erros de encriptação do Baileys
const originalStderrWrite = process.stderr.write;
process.stderr.write = function (chunk, encoding, callback) {
    const str = chunk.toString();
    if (
        str.includes('Bad MAC') || 
        str.includes('Failed to decrypt') || 
        str.includes('Session error') ||
        str.includes('Closing session:') ||
        str.includes('Removing old closed session:') ||
        str.includes('SessionEntry')
    ) {
        return true;
    }
    return originalStderrWrite.apply(process.stderr, arguments);
};

const express = require('express');
const cors = require('cors');
const path = require('path');
const fs = require('fs');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { Pool } = require('pg');
const qrcodeTerminal = require('qrcode-terminal');
const QRCode = require('qrcode');
const pino = require('pino');

const app = express();
app.use(cors());
app.use(express.json());

const JWT_SECRET = process.env.JWT_SECRET || 'sua_chave_secreta_aqui_123';
const ADMIN_PHONE = '5548996890282';
const PORT = 3000;

// Variável para armazenar o QR Code para exibição na rota web
let latestQR = '';

// Conexão com o PostgreSQL Container
const DB_CONNECTION_STRING = process.env.DATABASE_URL || 'postgres://postgres:senai@postgres:5432/postgres';

const pool = new Pool({
    connectionString: DB_CONNECTION_STRING,
    connectionTimeoutMillis: 10000
});

async function initDatabase() {
    try {
        console.log('⏳ Conectando ao Banco de Dados PostgreSQL e migrando tabelas...');
        
        await pool.query(`
            CREATE TABLE IF NOT EXISTS users (
                id SERIAL PRIMARY KEY,
                name VARCHAR(100) DEFAULT 'Jogador',
                phone VARCHAR(20) UNIQUE NOT NULL,
                password VARCHAR(255) NOT NULL,
                spins INT DEFAULT 10,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            );
        `);

        await pool.query(`
            ALTER TABLE users ADD COLUMN IF NOT EXISTS name VARCHAR(100) DEFAULT 'Jogador';
            ALTER TABLE users ADD COLUMN IF NOT EXISTS spins INT DEFAULT 10;
        `);

        await pool.query(`
            CREATE TABLE IF NOT EXISTS prizes (
                id SERIAL PRIMARY KEY,
                phone VARCHAR(20) NOT NULL,
                prize_name VARCHAR(100) NOT NULL,
                lines_count INT DEFAULT 1,
                won_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            );
        `);

        await pool.query(`
            ALTER TABLE prizes ADD COLUMN IF NOT EXISTS lines_count INT DEFAULT 1;
        `);

        console.log('✅ Tabelas users e prizes sincronizadas no PostgreSQL com sucesso!');
    } catch (err) {
        console.error('❌ Erro ao inicializar banco de dados:', err.message);
    }
}

const otps = {};
const OTP_TTL_MS = 10 * 60 * 1000;
let lastPendingOrder = null;

function authRequired(req, res, next) {
    const header = req.headers.authorization || '';
    const token = header.startsWith('Bearer ') ? header.slice(7) : null;

    if (!token) {
        return res.status(401).json({ error: 'Sessão expirada. Faça login novamente.' });
    }

    try {
        const payload = jwt.verify(token, JWT_SECRET);
        req.phone = payload.phone;
        next();
    } catch (err) {
        return res.status(401).json({ error: 'Sessão expirada. Faça login novamente.' });
    }
}

// CONEXÃO COM WHATSAPP (BAILEYS)
let sock;
let isConnected = false;

async function connectToWhatsApp() {
    try {
        console.log('⏳ Inicializando conexão com WhatsApp...');
        
        const baileys = await import('@whiskeysockets/baileys');
        const makeWASocket = baileys.default || baileys;
        const { useMultiFileAuthState, DisconnectReason, fetchLatestBaileysVersion } = baileys;

        const authPath = path.resolve(__dirname, 'auth_info_baileys');
        const { state, saveCreds } = await useMultiFileAuthState(authPath);
        
        let version = [2, 3000, 1015901307];
        try {
            const versionInfo = await fetchLatestBaileysVersion();
            version = versionInfo.version;
        } catch (e) {
            console.log('ℹ️ Usando versão padrão do protocolo WhatsApp.');
        }

        sock = makeWASocket({
            version,
            auth: state,
            logger: pino({ level: 'silent' }),
            syncFullHistory: false,
            markOnlineOnConnect: true,
            emitOwnEvents: false,
            browser: ['Garage Slots', 'Chrome', '1.0.0']
        });

        sock.ev.on('creds.update', saveCreds);

        sock.ev.on('connection.update', (update) => {
            const { connection, lastDisconnect, qr } = update;

            if (qr) {
                latestQR = qr;
                console.log('\n=============================================');
                console.log('📱 QR CODE PRONTO!');
                console.log('Acesse no navegador para escanear com facilidade:');
                console.log('👉 http://localhost:3000/qr');
                console.log('=============================================\n');
                qrcodeTerminal.generate(qr, { small: true });
            }

            if (connection === 'close') {
                isConnected = false;
                const statusCode = lastDisconnect?.error?.output?.statusCode;

                if (statusCode === DisconnectReason.loggedOut || statusCode === 401) {
                    console.log('⚠️ Sessão expirada/desconectada. Limpando credenciais...');
                    try { fs.rmSync(authPath, { recursive: true, force: true }); } catch (e) {}
                    latestQR = '';
                    setTimeout(connectToWhatsApp, 2000);
                } else {
                    console.log(`Conexão com WhatsApp fechada (Status ${statusCode}). Reconectando em 3s...`);
                    setTimeout(connectToWhatsApp, 3000);
                }
            } else if (connection === 'open') {
                isConnected = true;
                latestQR = '';
                console.log('✅ WhatsApp Conectado e Pronto!');
            }
        });

        sock.ev.on('messages.upsert', async (m) => {
            const msg = m.messages[0];
            if (!msg || !msg.message) return;

            const text = (msg.message.conversation || msg.message.extendedTextMessage?.text || '').trim();
            const senderJid = msg.key.remoteJid || '';

            if (msg.key.fromMe) return;

            if (text.startsWith('/liberar') || text.startsWith('/addspins')) {
                const parts = text.split(' ');
                if (parts.length >= 3) {
                    const targetPhone = parts[1].replace(/\D/g, '');
                    const amountSpins = parseInt(parts[2], 10);

                    if (!isNaN(amountSpins) && amountSpins > 0) {
                        await processLiberation(targetPhone, amountSpins, senderJid);
                        lastPendingOrder = null;
                    }
                } else {
                    await sock.sendMessage(senderJid, {
                        text: '⚠️ USO INCORRETO!\nExemplo para adicionar giros:\n`/addspins 48999999999 50`'
                    });
                }
            } else if (text === '1' && lastPendingOrder) {
                await processLiberation(lastPendingOrder.phone, lastPendingOrder.spins, senderJid);
                lastPendingOrder = null;
            }
        });
    } catch (err) {
        console.error('❌ Erro no WhatsApp:', err.message);
    }
}

async function processLiberation(targetPhone, amountSpins, chatJid) {
    try {
        const result = await pool.query(
            'UPDATE users SET spins = spins + $1 WHERE phone LIKE $2 RETURNING name, phone, spins',
            [amountSpins, `%${targetPhone}%`]
        );

        if (result.rows.length > 0) {
            const user = result.rows[0];
            await sock.sendMessage(chatJid, {
                text: `✅ *GIROS ADICIONADOS COM SUCESSO!*\n\n👤 Cliente: *${user.name}*\n📱 Telefone: *${user.phone}*\n➕ Giros Adicionados: *+${amountSpins}*\n🎰 Saldo Atual: *${user.spins} Giros*.`
            });
        } else {
            await sock.sendMessage(chatJid, { text: `❌ Número ${targetPhone} não foi encontrado no banco de dados.` });
        }
    } catch (err) {
        console.error('Erro ao adicionar giros via admin:', err);
    }
}

async function sendWhatsAppMessage(phone, messageText) {
    if (!sock || !isConnected) {
        throw new Error('O WhatsApp do servidor ainda não está conectado.');
    }

    let cleanPhone = phone.replace(/\D/g, '');
    if (!cleanPhone.startsWith('55')) {
        cleanPhone = '55' + cleanPhone;
    }

    const [result] = await sock.onWhatsApp(cleanPhone);

    if (!result || !result.exists) {
        throw new Error(`O número ${phone} não é uma conta ativa no WhatsApp.`);
    }

    await sock.sendMessage(result.jid, { text: messageText });
}

// ROTA PARA EXIBIR QR CODE NO NAVEGADOR
app.get('/qr', async (req, res) => {
    if (isConnected) {
        return res.send('<div style="font-family:sans-serif;text-align:center;padding:50px;background:#111;color:#0f0;height:100vh;"><h2>✅ WhatsApp já está conectado e pronto para uso!</h2></div>');
    }
    if (!latestQR) {
        return res.send('<div style="font-family:sans-serif;text-align:center;padding:50px;background:#111;color:#fff;height:100vh;"><h2>⏳ Gerando QR Code... Recarregue a página em alguns segundos.</h2></div>');
    }
    try {
        const url = await QRCode.toDataURL(latestQR);
        res.send(`
            <div style="display:flex;flex-direction:column;justify-content:center;align-items:center;height:100vh;background:#0d0d0d;color:#fff;font-family:sans-serif;">
                <h1 style="color:#d4af37;margin-bottom:10px;">Garage Slots - Autenticação</h1>
                <p style="margin-bottom:20px;color:#aaa;">Abra o WhatsApp > Aparelhos Conectados > Conectar um Aparelho</p>
                <div style="background:#fff;padding:20px;border-radius:16px;box-shadow:0 0 20px rgba(212,175,55,0.4);">
                    <img src="${url}" style="width:300px;height:300px;display:block;" />
                </div>
            </div>
        `);
    } catch (err) {
        res.status(500).send('Erro ao gerar imagem do QR Code.');
    }
});

// ROTAS DA API
app.post('/api/admin/add-spins', async (req, res) => {
    const { phone, amount } = req.body;

    if (!phone || !amount) {
        return res.status(400).json({ error: 'Informe phone e amount.' });
    }

    const cleanPhone = String(phone).replace(/\D/g, '');
    const spinAmount = parseInt(amount, 10);

    try {
        const result = await pool.query(
            'UPDATE users SET spins = spins + $1 WHERE phone LIKE $2 RETURNING name, phone, spins',
            [spinAmount, `%${cleanPhone}%`]
        );

        if (result.rows.length > 0) {
            console.log(`\n🎉 [ADMIN CMD] +${spinAmount} giros -> ${result.rows[0].name} (${result.rows[0].phone}). Saldo atual: ${result.rows[0].spins}\n`);
            return res.json({ success: true, user: result.rows[0] });
        } else {
            return res.status(404).json({ error: 'Usuário não encontrado.' });
        }
    } catch (err) {
        console.error(err);
        return res.status(500).json({ error: 'Erro no banco de dados.' });
    }
});

app.post('/api/auth/register-otp', async (req, res) => {
    const { name, phone, password } = req.body;

    if (!name || !phone || !password) {
        return res.status(400).json({ error: 'Nome, telefone e senha são obrigatórios' });
    }

    const cleanPhone = String(phone).replace(/\D/g, '');

    try {
        const existingUser = await pool.query('SELECT 1 FROM users WHERE phone = $1', [cleanPhone]);
        if (existingUser.rows.length > 0) {
            return res.status(400).json({ error: 'Este número já está cadastrado. Faça login!' });
        }

        const code = Math.floor(100000 + Math.random() * 900000).toString();
        const hashedPassword = await bcrypt.hash(password, 10);

        otps[cleanPhone] = { name: name.trim(), code, hashedPassword, expiresAt: Date.now() + OTP_TTL_MS };

        const msgToSend = `🏎️ *GARAGE SLOTS - MINIATURAS*\n\nOlá ${name.trim()}! Seu código de verificação é: *${code}*`;
        await sendWhatsAppMessage(cleanPhone, msgToSend);

        return res.json({ success: true, message: 'Código enviado para seu WhatsApp!' });
    } catch (err) {
        console.error('[ERRO CADASTRO]', err.message || err);
        return res.status(500).json({ error: err.message || 'Falha ao processar solicitação.' });
    }
});

app.post('/api/auth/verify-register', async (req, res) => {
    const { phone, code } = req.body;
    const inputCode = String(code || '').trim();

    if (!inputCode) {
        return res.status(400).json({ error: 'Código de verificação é obrigatório.' });
    }

    let cleanPhone = phone ? String(phone).replace(/\D/g, '') : null;
    let pendingData = cleanPhone ? otps[cleanPhone] : null;

    if (!pendingData) {
        const foundEntry = Object.entries(otps).find(([ph, data]) => data.code === inputCode);
        if (foundEntry) {
            cleanPhone = foundEntry[0];
            pendingData = foundEntry[1];
        }
    }

    if (!pendingData) {
        return res.status(400).json({ error: 'Sessão expirada. Volte e clique em Cadastrar novamente!' });
    }

    if (pendingData.expiresAt < Date.now()) {
        delete otps[cleanPhone];
        return res.status(400).json({ error: 'Código de verificação expirado. Solicite um novo.' });
    }

    if (pendingData.code !== inputCode) {
        return res.status(400).json({ error: 'Código de verificação incorreto.' });
    }

    try {
        const userName = pendingData.name || 'Jogador';
        const passwordToSave = pendingData.hashedPassword || await bcrypt.hash('123456', 10);

        const insertQuery = `
            INSERT INTO users (name, phone, password, spins) 
            VALUES ($1, $2, $3, 10) 
            ON CONFLICT (phone) DO UPDATE SET name = EXCLUDED.name, password = EXCLUDED.password
            RETURNING name, phone, spins;
        `;

        const result = await pool.query(insertQuery, [userName, cleanPhone, passwordToSave]);
        const userRecord = result.rows[0];

        delete otps[cleanPhone];
        const token = jwt.sign({ phone: userRecord.phone }, JWT_SECRET, { expiresIn: '7d' });

        return res.json({
            success: true,
            user: { name: userRecord.name, phone: userRecord.phone, spins: Number(userRecord.spins) || 10 },
            token
        });
    } catch (err) {
        console.error('[ERRO BANCO]:', err.message || err);
        return res.status(500).json({ error: 'Erro de comunicação com o Banco de Dados.' });
    }
});

app.post('/api/auth/login', async (req, res) => {
    const { phone, password } = req.body;

    if (!phone || !password) {
        return res.status(400).json({ error: 'Telefone e senha são obrigatórios' });
    }

    const cleanPhone = String(phone).replace(/\D/g, '');

    try {
        const result = await pool.query('SELECT * FROM users WHERE phone = $1', [cleanPhone]);

        if (result.rows.length === 0) {
            return res.status(400).json({ error: 'Usuário não encontrado. Crie uma conta!' });
        }

        const user = result.rows[0];
        const passwordMatch = await bcrypt.compare(password, user.password);

        if (!passwordMatch) {
            return res.status(400).json({ error: 'Senha incorreta!' });
        }

        const token = jwt.sign({ phone: user.phone }, JWT_SECRET, { expiresIn: '7d' });

        return res.json({
            success: true,
            user: { name: user.name, phone: user.phone, spins: parseInt(user.spins, 10) },
            token
        });
    } catch (err) {
        console.error(err);
        return res.status(500).json({ error: 'Erro ao realizar login.' });
    }
});

app.get('/api/auth/me', authRequired, async (req, res) => {
    try {
        const result = await pool.query('SELECT name, phone, spins FROM users WHERE phone = $1', [req.phone]);
        if (result.rows.length === 0) {
            return res.status(401).json({ error: 'Sessão expirada. Faça login novamente.' });
        }
        const u = result.rows[0];
        return res.json({ success: true, user: { name: u.name, phone: u.phone, spins: parseInt(u.spins, 10) } });
    } catch (err) {
        console.error(err);
        return res.status(500).json({ error: 'Erro ao carregar usuário.' });
    }
});

app.post('/api/buy-spins', authRequired, async (req, res) => {
    const { spinAmount, price } = req.body;

    if (!spinAmount || !price) {
        return res.status(400).json({ error: 'Pacote inválido' });
    }

    try {
        const userRes = await pool.query('SELECT name FROM users WHERE phone = $1', [req.phone]);
        const userName = userRes.rows[0]?.name || 'Jogador';

        lastPendingOrder = { phone: req.phone, spins: spinAmount };

        const adminMessage = 
`🛒 *SOLICITAÇÃO DE COMPRA DE GIROS*

👤 *Cliente:* ${userName} (${req.phone})
📦 *Pacote:* ${spinAmount} Giros
💰 *Valor:* R$ ${parseFloat(price).toFixed(2)}

-----------------------------------
👉 Responda com *1* para aprovar

ou envie:
/addspins ${req.phone} ${spinAmount}`;

        await sendWhatsAppMessage(ADMIN_PHONE, adminMessage);

        return res.json({
            success: true,
            message: 'MENSAGEM ENVIADA AO ADM COMPRA CONTINUA POR LA'
        });
    } catch (err) {
        console.error(err);
        return res.status(500).json({ error: 'Erro ao notificar Administrador.' });
    }
});

app.get('/api/prizes', authRequired, async (req, res) => {
    try {
        const result = await pool.query(
            `SELECT prize_name, lines_count,
                    to_char(won_at AT TIME ZONE 'UTC' AT TIME ZONE 'America/Sao_Paulo', 'DD/MM/YYYY "às" HH24:MI:SS') as formatted_time
             FROM prizes 
             WHERE phone = $1 
             ORDER BY won_at DESC`,
            [req.phone]
        );
        return res.json({ success: true, prizes: result.rows });
    } catch (err) {
        console.error(err);
        return res.status(500).json({ error: 'Erro ao carregar histórico de prêmios.' });
    }
});

// LÓGICA DO GAME SLOT
const SYMBOLS = [
    { id: 'EMPTY', name: 'Tente Novamente', weight: 30 },
    { id: 'MAINLINE', name: 'Hot Wheels Mainline', weight: 30 },
    { id: 'HW_SILVER', name: 'Hot Wheels Silver', weight: 20 },
    { id: 'HW_PREMIUM', name: 'Hot Wheels Premium', weight: 10 },
    { id: 'MINIGT', name: 'Mini GT', weight: 5 },
    { id: 'INO64', name: 'Ino64', weight: 3 },
    { id: 'KAIDO', name: 'Kaido House', weight: 2 }
];

const TOTAL_WEIGHT = SYMBOLS.reduce((acc, s) => acc + s.weight, 0);

const PAYLINES = [
    [[0, 0], [0, 1], [0, 2]],
    [[1, 0], [1, 1], [1, 2]],
    [[2, 0], [2, 1], [2, 2]],
    [[0, 0], [1, 0], [2, 0]],
    [[0, 1], [1, 1], [2, 1]],
    [[0, 2], [1, 2], [2, 2]],
    [[0, 0], [1, 1], [2, 2]],
    [[2, 0], [1, 1], [0, 2]]
];

function getRandomSymbol() {
    let rand = Math.random() * TOTAL_WEIGHT;
    for (const symbol of SYMBOLS) {
        if (rand < symbol.weight) return symbol;
        rand -= symbol.weight;
    }
    return SYMBOLS[0];
}

app.post('/api/spin', authRequired, async (req, res) => {
    const client = await pool.connect();

    try {
        await client.query('BEGIN');

        const userRes = await client.query('SELECT spins FROM users WHERE phone = $1 FOR UPDATE', [req.phone]);
        if (userRes.rows.length === 0) {
            await client.query('ROLLBACK');
            return res.status(401).json({ error: 'Sessão expirada. Faça login novamente.' });
        }

        let currentSpins = parseInt(userRes.rows[0].spins, 10);

        if (currentSpins < 1) {
            await client.query('ROLLBACK');
            return res.status(400).json({ error: 'Você não tem giros suficientes! Compre mais giros para continuar.' });
        }

        currentSpins -= 1;

        const grid = [0, 1, 2].map(() => [getRandomSymbol(), getRandomSymbol(), getRandomSymbol()]);

        const winningLines = [];
        const prizeMap = {};

        PAYLINES.forEach((line, index) => {
            const [s1, s2, s3] = line.map(([r, c]) => grid[r][c]);

            if (s1.id !== 'EMPTY' && s1.id === s2.id && s2.id === s3.id) {
                winningLines.push(index);
                prizeMap[s1.name] = (prizeMap[s1.name] || 0) + 1;
            }
        });

        const wonMiniatures = [];
        for (const [prizeName, count] of Object.entries(prizeMap)) {
            wonMiniatures.push(count > 1 ? `${prizeName} (x${count} fileiras)` : prizeName);
            await client.query(
                'INSERT INTO prizes (phone, prize_name, lines_count, won_at) VALUES ($1, $2, $3, NOW())',
                [req.phone, prizeName, count]
            );
        }

        await client.query('UPDATE users SET spins = $1 WHERE phone = $2', [currentSpins, req.phone]);
        await client.query('COMMIT');

        return res.json({
            success: true,
            grid: grid.map(row => row.map(cell => cell.id)),
            winningLines,
            wonMiniatures,
            winCount: winningLines.length,
            newSpins: currentSpins
        });
    } catch (err) {
        try { await client.query('ROLLBACK'); } catch (e) { /* ignora */ }
        console.error(err);
        return res.status(500).json({ error: 'Erro ao processar giro.' });
    } finally {
        client.release();
    }
});

app.listen(PORT, () => {
    console.log(`✅ Backend rodando na porta ${PORT} (http://localhost:${PORT})`);
    initDatabase();
    connectToWhatsApp();
});