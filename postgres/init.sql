-- Criação das tabelas
CREATE TABLE IF NOT EXISTS users (
    id SERIAL PRIMARY KEY,
    name VARCHAR(100) DEFAULT 'Jogador',
    phone VARCHAR(20) UNIQUE NOT NULL,
    password VARCHAR(255) NOT NULL,
    spins INT DEFAULT 10,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS prizes (
    id SERIAL PRIMARY KEY,
    phone VARCHAR(20) NOT NULL,
    prize_name VARCHAR(100) NOT NULL,
    lines_count INT DEFAULT 1,
    won_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- População Inicial de Dados (Backup/Dump de teste)
INSERT INTO users (name, phone, password, spins) VALUES
('Jogador Demo', '5548999999999', '$2a$10$wE1VpS1W/9tW0/pOnxXmze5R2XG2J3hGkZ8Y.lRzq1E8.cZ1m.KOW', 20),
('Admin Garage', '5548996890282', '$2a$10$wE1VpS1W/9tW0/pOnxXmze5R2XG2J3hGkZ8Y.lRzq1E8.cZ1m.KOW', 100)
ON CONFLICT (phone) DO NOTHING;

INSERT INTO prizes (phone, prize_name, lines_count) VALUES
('5548999999999', 'Hot Wheels Mainline', 1),
('5548999999999', 'Mini GT', 2);