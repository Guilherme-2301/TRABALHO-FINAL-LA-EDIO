const { Pool } = require('pg');

const DB_CONNECTION_STRING = 'postgres://postgres:2301estTGUI@db.alhimxpabowihrxgvfta.supabase.co:5432/postgres';

const pool = new Pool({
    connectionString: DB_CONNECTION_STRING,
    ssl: { rejectUnauthorized: false }
});

async function addSpins(phone, amount) {
    const cleanPhone = String(phone).replace(/\D/g, '');
    try {
        const res = await pool.query(
            'UPDATE users SET spins = spins + $1 WHERE phone LIKE $2 RETURNING phone, spins',
            [amount, `%${cleanPhone}%`]
        );

        if (res.rows.length > 0) {
            console.log(`\n✅ SUCESSO!`);
            console.log(`📱 Cliente: ${res.rows[0].phone}`);
            console.log(`🎰 Saldo Atual: ${res.rows[0].spins} giros\n`);
        } else {
            console.log(`\n❌ Usuário ${phone} não foi encontrado no banco de dados.\n`);
        }
    } catch (err) {
        console.error('❌ Erro no banco:', err.message);
    } finally {
        await pool.end();
    }
}

// Pega os argumentos do terminal: node add-spins.js <numero> <quantidade>
const targetPhone = process.argv[2] || '554888502473';
const spinsAmount = parseInt(process.argv[3] || '50', 10);

addSpins(targetPhone, spinsAmount);