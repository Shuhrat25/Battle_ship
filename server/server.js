const express = require('express');
const http = require('http');
const { Server } = require('socket.io');

const app = express();
const server = http.createServer(app);
const io = new Server(server, { cors: { origin: "*" } });

const activeUsers = new Map();
const gameSessions = new Map(); 
const disconnectTimers = new Map(); 

const SHIP_CONFIGS = {
    10: { 4: 1, 3: 2, 2: 3, 1: 4 }, 
    15: { 4: 2, 3: 3, 2: 4, 1: 5 }, 
    20: { 4: 3, 3: 4, 2: 5, 1: 6 }  
};

function generateBotBoard(gridSize, shipConfig) {
    let placedShips = [];
    const canPlace = (x, y, length, horizontal) => {
        if (horizontal && x + length > gridSize) return false;
        if (!horizontal && y + length > gridSize) return false;
        return !placedShips.some(ship => {
            for (let i = 0; i < length; i++) {
                for (let j = 0; j < ship.length; j++) {
                    const cx = horizontal ? x + i : x;
                    const cy = horizontal ? y : y + i;
                    const sx = ship.horizontal ? ship.x + j : ship.x;
                    const sy = ship.horizontal ? ship.y : ship.y + j;
                    if (Math.abs(sx - cx) <= 1 && Math.abs(sy - cy) <= 1) return true;
                }
            }
            return false;
        });
    };

    Object.entries(shipConfig).forEach(([len, count]) => {
        let placedCount = 0;
        let attempts = 0;
        while (placedCount < count && attempts < 1000) {
            const horizontal = Math.random() > 0.5;
            const x = Math.floor(Math.random() * gridSize);
            const y = Math.floor(Math.random() * gridSize);
            if (canPlace(x, y, Number(len), horizontal)) {
                placedShips.push({ x, y, length: Number(len), horizontal });
                placedCount++;
            }
            attempts++;
        }
    });
    return placedShips;
}

function getBotTarget(session) {
    const size = session.gridSize;
    const shots = session.shots['BOT'] || [];
    const hits = session.botState.currentHits || []; 

    const isShot = (x, y) => shots.some(s => s.x === x && s.y === y);
    const isValid = (x, y) => x >= 0 && x < size && y >= 0 && y < size && !isShot(x, y);

    if (hits.length === 0) {
        let available = [];
        for (let x = 0; x < size; x++) {
            for (let y = 0; y < size; y++) {
                if (isValid(x, y)) available.push({ x, y });
            }
        }
        return available.length > 0 ? available[Math.floor(Math.random() * available.length)] : null;
    }

    if (hits.length === 1) {
        const { x, y } = hits[0];
        const neighbors = [{ x: x + 1, y }, { x: x - 1, y }, { x, y: y + 1 }, { x, y: y - 1 }].filter(p => isValid(p.x, p.y));
        if (neighbors.length > 0) return neighbors[Math.floor(Math.random() * neighbors.length)];
    }

    if (hits.length >= 2) {
        hits.sort((a, b) => a.x !== b.x ? a.x - b.x : a.y - b.y);
        const isHoriz = hits[0].y === hits[1].y;
        if (isHoriz) {
            const y = hits[0].y;
            if (isValid(hits[0].x - 1, y)) return { x: hits[0].x - 1, y };
            if (isValid(hits[hits.length - 1].x + 1, y)) return { x: hits[hits.length - 1].x + 1, y };
        } else {
            const x = hits[0].x;
            if (isValid(x, hits[0].y - 1)) return { x, y: hits[0].y - 1 };
            if (isValid(x, hits[hits.length - 1].y + 1)) return { x, y: hits[hits.length - 1].y + 1 };
        }
    }

    session.botState.currentHits = []; 
    return getBotTarget(session);
}

function processShot(io, sessionId, session, shooter, target, x, y) {
    const targetBoard = session.boards[target];
    session.shots[shooter].push({ x, y });

    let hitShip = null;
    let isHit = false;

    for (let ship of targetBoard) {
        for (let i = 0; i < ship.length; i++) {
            const sx = ship.horizontal ? ship.x + i : ship.x;
            const sy = ship.horizontal ? ship.y : ship.y + i;
            if (sx === x && sy === y) {
                isHit = true;
                hitShip = ship;
                break;
            }
        }
        if (isHit) break;
    }

    let isSunk = false;
    let haloCells = [];
    let sunkShipData = null;

    if (isHit) {
        session.damageTaken[target] = (session.damageTaken[target] || 0) + 1;
        if (shooter === 'BOT') session.botState.currentHits.push({x, y});

        isSunk = true;
        for (let i = 0; i < hitShip.length; i++) {
            const sx = hitShip.horizontal ? hitShip.x + i : hitShip.x;
            const sy = hitShip.horizontal ? hitShip.y : hitShip.y + i;
            if (!session.shots[shooter].some(s => s.x === sx && s.y === sy)) {
                isSunk = false;
                break;
            }
        }

        if (isSunk) {
            sunkShipData = { x: hitShip.x, y: hitShip.y, length: hitShip.length, horizontal: hitShip.horizontal };
            
            if (shooter === 'BOT') session.botState.currentHits = [];
            for (let i = 0; i < hitShip.length; i++) {
                const sx = hitShip.horizontal ? hitShip.x + i : hitShip.x;
                const sy = hitShip.horizontal ? hitShip.y : hitShip.y + i;
                for (let dx = -1; dx <= 1; dx++) {
                    for (let dy = -1; dy <= 1; dy++) {
                        const nx = sx + dx, ny = sy + dy;
                        if (nx >= 0 && nx < session.gridSize && ny >= 0 && ny < session.gridSize) {
                            if (!session.shots[shooter].some(s => s.x === nx && s.y === ny)) {
                                session.shots[shooter].push({ x: nx, y: ny });
                                if (!haloCells.some(h => h.x === nx && h.y === ny)) haloCells.push({ x: nx, y: ny });
                            }
                        }
                    }
                }
            }
        }
        
        session.matchHistory.push({
            shooter: shooter, target: target, x: x, y: y, status: 'hit', haloCells: [...haloCells], sunkShip: sunkShipData
        });

        if (session.damageTaken[target] >= session.totalDecks) {
            session.status = 'finished';
            io.to(sessionId).emit('shot_result', { x, y, status: 'hit', shooter, nextTurn: shooter, haloCells, sunkShip: sunkShipData });
            io.to(sessionId).emit('game_over', { 
                winner: shooter, 
                winnerName: shooter === 'BOT' ? 'Бот' : activeUsers.get(shooter),
                matchHistory: session.matchHistory,
                finalBoards: session.boards
            });
            return true; 
        }
    } else {
        session.matchHistory.push({
            shooter: shooter, target: target, x: x, y: y, status: 'miss', haloCells: []
        });
        session.currentTurn = target; 
    }

    io.to(sessionId).emit('shot_result', {
        x, y, status: isHit ? 'hit' : 'miss', shooter, nextTurn: session.currentTurn, haloCells, sunkShip: sunkShipData
    });
    return false;
}

io.on('connection', (socket) => {
    socket.emit('update_sessions', Array.from(gameSessions.values()));

    socket.on('register_user', (requestedName, callback) => {
        const baseName = requestedName.trim();
        let finalName = baseName;
        let counter = 2;
        while (Array.from(activeUsers.values()).some(n => n.toLowerCase() === finalName.toLowerCase())) {
            finalName = `${baseName} ${counter}`;
            counter++;
        }
        activeUsers.set(socket.id, finalName);
        socket.emit('update_sessions', Array.from(gameSessions.values()));
        callback({ success: true, name: finalName });
    });

    socket.on('reconnect_user', ({ sessionId, userName }) => {
        activeUsers.set(socket.id, userName);
        const session = gameSessions.get(sessionId);
        
        if (session) {
            if (disconnectTimers.has(sessionId)) {
                clearTimeout(disconnectTimers.get(sessionId));
                disconnectTimers.delete(sessionId);
            }

            if (session.host === userName) {
                const oldSocket = session.hostSocket;
                session.hostSocket = socket.id;
                if (session.currentTurn === oldSocket) session.currentTurn = socket.id;
                if (session.shots[oldSocket]) { session.shots[socket.id] = session.shots[oldSocket]; delete session.shots[oldSocket]; }
                if (session.boards[oldSocket]) { session.boards[socket.id] = session.boards[oldSocket]; delete session.boards[oldSocket]; }
                if (session.damageTaken[oldSocket] !== undefined) { session.damageTaken[socket.id] = session.damageTaken[oldSocket]; delete session.damageTaken[oldSocket]; }
            } else if (session.opponent === userName) {
                const oldSocket = session.opponentSocket;
                session.opponentSocket = socket.id;
                if (session.currentTurn === oldSocket) session.currentTurn = socket.id;
                if (session.shots[oldSocket]) { session.shots[socket.id] = session.shots[oldSocket]; delete session.shots[oldSocket]; }
                if (session.boards[oldSocket]) { session.boards[socket.id] = session.boards[oldSocket]; delete session.boards[oldSocket]; }
                if (session.damageTaken[oldSocket] !== undefined) { session.damageTaken[socket.id] = session.damageTaken[oldSocket]; delete session.damageTaken[oldSocket]; }
            }
            socket.join(sessionId);
        }
    });

    socket.on('create_game', (gridSize, callback) => {
        const safeGridSize = [10, 15, 20].includes(Number(gridSize)) ? Number(gridSize) : 10;
        const sessionId = `game_${Date.now()}`;
        const session = {
            id: sessionId, host: activeUsers.get(socket.id), hostSocket: socket.id,
            opponent: null, opponentSocket: null,
            gridSize: safeGridSize, shipConfig: SHIP_CONFIGS[safeGridSize],
            status: 'waiting', boards: {},
            totalDecks: Object.entries(SHIP_CONFIGS[safeGridSize]).reduce((sum, [len, count]) => sum + (Number(len) * count), 0),
            damageTaken: {}, shots: { [socket.id]: [] }, isBot: false, matchHistory: []
        };
        gameSessions.set(sessionId, session);
        socket.join(sessionId);
        io.emit('update_sessions', Array.from(gameSessions.values()));
        callback({ success: true, sessionId, sessionData: session });
    });

    socket.on('create_bot_game', (gridSize, callback) => {
        const safeGridSize = [10, 15, 20].includes(Number(gridSize)) ? Number(gridSize) : 10;
        const sessionId = `bot_game_${Date.now()}`;
        const session = {
            id: sessionId, host: activeUsers.get(socket.id), hostSocket: socket.id,
            opponent: 'Бот', opponentSocket: 'BOT',
            gridSize: safeGridSize, shipConfig: SHIP_CONFIGS[safeGridSize],
            status: 'placing_ships', boards: {},
            totalDecks: Object.entries(SHIP_CONFIGS[safeGridSize]).reduce((sum, [len, count]) => sum + (Number(len) * count), 0),
            damageTaken: {}, shots: { [socket.id]: [], 'BOT': [] }, 
            isBot: true, botState: { currentHits: [] }, matchHistory: []
        };
        gameSessions.set(sessionId, session);
        socket.join(sessionId);
        callback({ success: true, sessionId, sessionData: session });
    });

    socket.on('join_game', (sessionId, callback) => {
        const session = gameSessions.get(sessionId);
        if (session && session.status === 'waiting') {
            session.opponent = activeUsers.get(socket.id);
            session.opponentSocket = socket.id;
            session.status = 'placing_ships';
            session.shots[socket.id] = [];
            socket.join(sessionId);
            io.emit('update_sessions', Array.from(gameSessions.values()));
            callback({ success: true, sessionData: session });
        } else {
            callback({ success: false });
        }
    });

    socket.on('ships_ready', (sessionId, placedShips) => {
        const session = gameSessions.get(sessionId);
        if (!session) return;

        session.boards[socket.id] = placedShips;
        if (session.isBot) session.boards['BOT'] = generateBotBoard(session.gridSize, session.shipConfig);

        const readySockets = Object.keys(session.boards);
        if (readySockets.length === 2) {
            session.status = 'in_progress';
            session.currentTurn = session.hostSocket; 
            io.to(sessionId).emit('game_start', { firstTurn: session.currentTurn });
        }
    });

    socket.on('fire_shot', (sessionId, x, y) => {
        const session = gameSessions.get(sessionId);
        if (!session || session.status !== 'in_progress' || session.currentTurn !== socket.id) return;
        const target = session.hostSocket === socket.id ? session.opponentSocket : session.hostSocket;
        const isGameOver = processShot(io, sessionId, session, socket.id, target, x, y);

        if (!isGameOver && session.isBot && session.currentTurn === 'BOT') {
            const playBotTurn = () => {
                if (session.status !== 'in_progress') return;
                const targetCell = getBotTarget(session);
                if (!targetCell) return;
                const botGameOver = processShot(io, sessionId, session, 'BOT', session.hostSocket, targetCell.x, targetCell.y);
                if (!botGameOver && session.currentTurn === 'BOT') setTimeout(playBotTurn, 800); 
            };
            setTimeout(playBotTurn, 1000);
        }
    });

    socket.on('leave_game', (sessionId) => {
        const session = gameSessions.get(sessionId);
        if (session) {
            io.to(sessionId).emit('game_cancelled');
            
            gameSessions.delete(sessionId);
            if (disconnectTimers.has(sessionId)) {
                clearTimeout(disconnectTimers.get(sessionId));
                disconnectTimers.delete(sessionId);
            }
            
            io.in(sessionId).socketsLeave(sessionId);
            io.emit('update_sessions', Array.from(gameSessions.values()));
        }
    });

    socket.on('surrender', (sessionId) => {
        const session = gameSessions.get(sessionId);
        if (session && session.status === 'in_progress') {
            const winnerSocket = session.hostSocket === socket.id ? session.opponentSocket : session.hostSocket;
            if (winnerSocket) {
                io.to(sessionId).emit('game_over', { 
                    winner: winnerSocket, 
                    winnerName: winnerSocket === 'BOT' ? 'Бот' : activeUsers.get(winnerSocket), 
                    reason: 'surrender',
                    matchHistory: session.matchHistory,
                    finalBoards: session.boards
                });
            }
            session.status = 'finished';
        }
    });

    socket.on('logout', () => {
        activeUsers.delete(socket.id);
        socket.disconnect(); 
    });

    socket.on('disconnect', () => {
        for (let [sessionId, session] of gameSessions.entries()) {
            if (session.hostSocket === socket.id || session.opponentSocket === socket.id) {
                if (session.status === 'placing_ships' || session.status === 'in_progress') {
                    const timer = setTimeout(() => {
                        const winnerSocket = session.hostSocket === socket.id ? session.opponentSocket : session.hostSocket;
                        if (winnerSocket && winnerSocket !== 'BOT') {
                            io.to(sessionId).emit('game_over', { 
                                winner: winnerSocket, winnerName: activeUsers.get(winnerSocket), reason: 'disconnect',
                                matchHistory: session.matchHistory, finalBoards: session.boards 
                            });
                        }
                        gameSessions.delete(sessionId);
                        disconnectTimers.delete(sessionId);
                        io.emit('update_sessions', Array.from(gameSessions.values()));
                    }, 15000);
                    disconnectTimers.set(sessionId, timer);
                } else {
                    gameSessions.delete(sessionId);
                    io.emit('update_sessions', Array.from(gameSessions.values()));
                }
            }
        }
        activeUsers.delete(socket.id);
    });
});

const PORT = process.env.PORT || 3001;
server.listen(PORT, () => console.log(`Сервер запущен на порту ${PORT} 🚀`));