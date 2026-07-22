import { useState, useEffect } from 'react';
import { io } from 'socket.io-client';
import Ship from './Ship';

// const socket = io('http://localhost:3001');
const socket = io('https://battle-ship-3990.onrender.com');

function App() {
  const savedState = JSON.parse(sessionStorage.getItem('battleship_save')) || {};

  const [sunkShips, setSunkShips] = useState(savedState.sunkShips || { mine: [], enemy: [] });
  const [appState, setAppState] = useState(savedState.appState || 'login');
  const [userName, setUserName] = useState(savedState.userName || '');
  const [nameInput, setNameInput] = useState('');

  const [gridSize, setGridSize] = useState(savedState.gridSize || 10);
  const [sessions, setSessions] = useState([]);
  const [currentSession, setCurrentSession] = useState(savedState.currentSession || null);

  const [availableShips, setAvailableShips] = useState(savedState.availableShips || {});
  const [placedShips, setPlacedShips] = useState(savedState.placedShips || []);
  const [selectedShipLength, setSelectedShipLength] = useState(savedState.selectedShipLength || null);
  const [isHorizontal, setIsHorizontal] = useState(savedState.isHorizontal ?? true);
  const [hoveredCell, setHoveredCell] = useState(null);

  const [isWaitingForOpponent, setIsWaitingForOpponent] = useState(savedState.isWaitingForOpponent || false);
  const [myTurn, setMyTurn] = useState(savedState.myTurn || false);
  const [myShots, setMyShots] = useState(savedState.myShots || []);
  const [enemyShots, setEnemyShots] = useState(savedState.enemyShots || []);
  const [winnerName, setWinnerName] = useState(savedState.winnerName || null);
  const [gameOverReason, setGameOverReason] = useState(savedState.gameOverReason || null);

  const [replayData, setReplayData] = useState(savedState.replayData || null);
  const [replayIndex, setReplayIndex] = useState(0);
  const [isPlayingReplay, setIsPlayingReplay] = useState(false);

  useEffect(() => {
    if (userName) {
      sessionStorage.setItem('battleship_save', JSON.stringify({
        appState, userName, gridSize, currentSession, availableShips, placedShips,
        selectedShipLength, isHorizontal, isWaitingForOpponent, myTurn, myShots, enemyShots, winnerName, gameOverReason, replayData, sunkShips
      }));
    }
  }, [appState, userName, gridSize, currentSession, availableShips, placedShips, selectedShipLength, isHorizontal, isWaitingForOpponent, myTurn, myShots, enemyShots, winnerName, gameOverReason, replayData, sunkShips]);

  useEffect(() => {
    if (savedState.currentSession && savedState.userName) {
      socket.emit('reconnect_user', { sessionId: savedState.currentSession.id, userName: savedState.userName });
    }
  }, []);

  useEffect(() => {
    socket.off('update_sessions');
    socket.off('game_start');
    socket.off('shot_result');
    socket.off('game_over');
    socket.off('game_cancelled'); 

    socket.on('update_sessions', (availableSessions) => {
      setSessions(availableSessions.filter(s => s.status === 'waiting'));
    });

    socket.on('game_start', (data) => {
      setIsWaitingForOpponent(false);
      setMyTurn(data.firstTurn === socket.id);
      setAppState('battle'); 
    });

    socket.on('shot_result', (data) => {
      if (data.sunkShip) {
        if (data.shooter === socket.id) setSunkShips(prev => ({ ...prev, enemy: [...prev.enemy, data.sunkShip] }));
        else setSunkShips(prev => ({ ...prev, mine: [...prev.mine, data.sunkShip] }));
      }

      if (data.shooter === socket.id) {
        setMyShots(prev => {
          let newShots = [...prev, { x: data.x, y: data.y, status: data.status }];
          if (data.haloCells) data.haloCells.forEach(c => newShots.push({ x: c.x, y: c.y, status: 'miss' }));
          return newShots;
        });
      } else {
        setEnemyShots(prev => {
          let newShots = [...prev, { x: data.x, y: data.y, status: data.status }];
          if (data.haloCells) data.haloCells.forEach(c => newShots.push({ x: c.x, y: c.y, status: 'miss' }));
          return newShots;
        });
      }
      setMyTurn(data.nextTurn === socket.id);
    });

    socket.on('game_over', (data) => {
      setWinnerName(data.winnerName);
      setGameOverReason(data.reason);
      if (data.matchHistory && data.finalBoards) {
        setReplayData({ history: data.matchHistory, boards: data.finalBoards });
      }
      setAppState('game_over');
    });

    socket.on('game_cancelled', () => {
      setAppState('lobby');
      setCurrentSession(null);
      setIsWaitingForOpponent(false);
      setPlacedShips([]);
      setSelectedShipLength(null);
      setHoveredCell(null);
      setMyShots([]);
      setEnemyShots([]);
      setSunkShips({ mine: [], enemy: [] });
    });

    return () => {
      socket.off('update_sessions');
      socket.off('game_start');
      socket.off('shot_result');
      socket.off('game_over');
      socket.off('game_cancelled');
    };
  }, []);

  useEffect(() => {
    let timer;
    if (appState === 'replay' && isPlayingReplay && replayData) {
      if (replayIndex < replayData.history.length) {
        timer = setTimeout(() => setReplayIndex(prev => prev + 1), 600);
      } else {
        setIsPlayingReplay(false);
      }
    }
    return () => clearTimeout(timer);
  }, [appState, isPlayingReplay, replayIndex, replayData]);

  const handleRegister = (e) => {
    e.preventDefault();
    if (!nameInput.trim()) return;
    socket.emit('register_user', nameInput, (response) => {
      if (response.success) {
        setUserName(response.name);
        setAppState('lobby');
      }
    });
  };

  const handleCreateGame = () => {
    socket.emit('create_game', gridSize, (response) => {
      if (response.success) {
        setCurrentSession(response.sessionData);
        setAvailableShips(response.sessionData.shipConfig);
        setPlacedShips([]);
        setAppState('placing_ships');
      }
    });
  };

  const handleCreateBotGame = () => {
    socket.emit('create_bot_game', gridSize, (response) => {
      if (response.success) {
        setCurrentSession(response.sessionData);
        setAvailableShips(response.sessionData.shipConfig);
        setPlacedShips([]);
        setAppState('placing_ships');
      }
    });
  };

  const handleJoinGame = (session) => {
    socket.emit('join_game', session.id, (response) => {
      if (response.success) {
        setCurrentSession(response.sessionData);
        setAvailableShips(response.sessionData.shipConfig);
        setPlacedShips([]);
        setAppState('placing_ships');
      }
    });
  };

  const handleRandomize = () => {
    const size = currentSession?.gridSize || 10;
    const shipsConfig = currentSession?.shipConfig || {};
    let newPlacedShips = [];
    let success = false;
    let globalAttempts = 0;
    const sortedShips = Object.entries(shipsConfig).sort((a, b) => Number(b[0]) - Number(a[0]));

    while (!success && globalAttempts < 50) {
      newPlacedShips = [];
      let allPlaced = true;

      const canPlace = (x, y, length, horizontal) => {
        if (horizontal && x + length > size) return false;
        if (!horizontal && y + length > size) return false;
        return !newPlacedShips.some(ship => {
          for (let i = 0; i < length; i++) {
            for (let j = 0; j < ship.length; j++) {
              if (Math.abs((ship.horizontal ? ship.x + j : ship.x) - (horizontal ? x + i : x)) <= 1 &&
                Math.abs((ship.horizontal ? ship.y : ship.y + j) - (horizontal ? y : y + i)) <= 1) return true;
            }
          } return false;
        });
      };

      for (let [len, count] of sortedShips) {
        const length = Number(len);
        let placedCount = 0;
        while (placedCount < count) {
          let attempts = 0, placedThisShip = false;
          while (!placedThisShip && attempts < 200) {
            const horizontal = Math.random() > 0.5, x = Math.floor(Math.random() * size), y = Math.floor(Math.random() * size);
            if (canPlace(x, y, length, horizontal)) {
              newPlacedShips.push({ x, y, length, horizontal });
              placedThisShip = true; placedCount++;
            } attempts++;
          }
          if (!placedThisShip) { allPlaced = false; break; }
        } if (!allPlaced) break;
      }
      if (allPlaced) success = true;
      globalAttempts++;
    }
    if (success) {
      setPlacedShips(newPlacedShips);
      setAvailableShips(Object.fromEntries(Object.keys(shipsConfig).map(k => [k, 0])));
    }
  };

  const isValidPlacement = (x, y, length, horizontal) => {
    const size = currentSession?.gridSize || 10;
    if (horizontal && x + length > size) return false;
    if (!horizontal && y + length > size) return false;

    for (let i = 0; i < length; i++) {
      const cx = horizontal ? x + i : x, cy = horizontal ? y : y + i;
      const isOccupiedOrTouching = placedShips.some(ship => {
        for (let j = 0; j < ship.length; j++) {
          if (Math.abs((ship.horizontal ? ship.x + j : ship.x) - cx) <= 1 &&
            Math.abs((ship.horizontal ? ship.y : ship.y + j) - cy) <= 1) return true;
        } return false;
      });
      if (isOccupiedOrTouching) return false;
    } return true;
  };

  const handleCellClick = (x, y) => {
    const clickedShipIndex = placedShips.findIndex(ship => {
      for (let i = 0; i < ship.length; i++) {
        if ((ship.horizontal ? ship.x + i : ship.x) === x && (ship.horizontal ? ship.y : ship.y + i) === y) return true;
      } return false;
    });

    if (clickedShipIndex !== -1) {
      const shipToPickUp = placedShips[clickedShipIndex];
      setPlacedShips(prev => prev.filter((_, idx) => idx !== clickedShipIndex));
      setAvailableShips(prev => ({ ...prev, [shipToPickUp.length]: (prev[shipToPickUp.length] || 0) + 1 }));
      setSelectedShipLength(shipToPickUp.length);
      setIsHorizontal(shipToPickUp.horizontal);
      return;
    }

    if (!selectedShipLength) return;
    if (isValidPlacement(x, y, selectedShipLength, isHorizontal)) {
      setPlacedShips(prev => [...prev, { x, y, length: selectedShipLength, horizontal: isHorizontal }]);
      setAvailableShips(prev => {
        const newShips = { ...prev }; newShips[selectedShipLength] -= 1;
        if (newShips[selectedShipLength] === 0) setSelectedShipLength(null);
        return newShips;
      });
    }
  };

  const handleRightClick = (e) => { e.preventDefault(); if (selectedShipLength) setIsHorizontal(prev => !prev); };

  const handleReadyClick = () => { setIsWaitingForOpponent(true); socket.emit('ships_ready', currentSession.id, placedShips); };

  const handleFireShot = (x, y) => {
    if (!myTurn) return;
    if (myShots.some(shot => shot.x === x && shot.y === y)) return;
    socket.emit('fire_shot', currentSession.id, x, y);
  };

  const handleSurrender = () => { if (window.confirm("Surrender fleet?")) socket.emit('surrender', currentSession.id); };
  const handleLogout = () => { sessionStorage.removeItem('battleship_save'); socket.emit('logout'); window.location.reload(); };

  const handleCancelGame = () => {
    if (currentSession) {
      socket.emit('leave_game', currentSession.id);
    }
    setAppState('lobby');
    setCurrentSession(null);
    setPlacedShips([]);
    setIsWaitingForOpponent(false);
  };

  if (appState === 'login') {
    return (
      <div className="min-h-screen bg-slate-900 text-white flex items-center justify-center p-4">
        <form onSubmit={handleRegister} className="bg-slate-800 p-8 rounded-xl shadow-2xl w-full max-w-md text-center border border-slate-700">
          <h1 className="text-4xl font-extrabold mb-2 text-blue-500 tracking-tight">Battleship</h1>
          <p className="mb-8 text-slate-400">Enter callsign to join the fleet</p>
          <input type="text" className="w-full px-4 py-3 mb-6 rounded-lg bg-slate-900 border border-slate-600 focus:outline-none focus:border-blue-500 text-lg text-white" placeholder="e.g. John" value={nameInput} onChange={(e) => setNameInput(e.target.value)} autoFocus />
          <button type="submit" className="w-full bg-blue-600 hover:bg-blue-500 text-white font-bold py-3 px-4 rounded-lg transition-colors text-lg shadow-lg">Connect to Server</button>
        </form>
      </div>
    );
  }

  if (appState === 'placing_ships') {
    const size = currentSession?.gridSize || 10;
    const cells = Array.from({ length: size * size }, (_, i) => ({ x: i % size, y: Math.floor(i / size) }));
    const isReady = placedShips.length === Object.values(currentSession?.shipConfig || {}).reduce((a, b) => a + b, 0);

    return (
      <div className="min-h-screen bg-slate-900 text-white p-2 md:p-8 flex flex-col items-center select-none overflow-x-hidden">
        <header className="w-full max-w-5xl flex justify-between items-center mb-6 border-b border-slate-700 pb-4">
          <div className="flex items-center gap-4">
            <button onClick={handleCancelGame} className="bg-slate-800 hover:bg-slate-700 text-slate-300 font-bold py-2 px-4 rounded-lg border border-slate-600 transition-colors flex items-center gap-2 text-sm">
              <span>⬅</span> Cancel
            </button>
            <h1 className="text-xl md:text-2xl font-bold text-blue-400 hidden sm:block">Setup Fleet</h1>
          </div>
          <button onClick={handleLogout} className="text-red-400 hover:text-red-300 font-bold text-sm">LOGOUT</button>
        </header>

        <div className="flex flex-col lg:flex-row gap-6 md:gap-8 items-center lg:items-start w-full max-w-5xl justify-center">
          <div className="w-full max-w-[320px] sm:max-w-[400px] md:max-w-[450px]">
            <div className="bg-slate-800 p-2 rounded-lg border-2 border-slate-700 shadow-2xl w-full" onContextMenu={handleRightClick} onMouseLeave={() => setHoveredCell(null)} style={{ display: 'grid', gridTemplateColumns: `repeat(${size}, 1fr)`, gap: '2px' }}>
              {cells.map((cell, idx) => {
                const placedShip = placedShips.find(s => s.x === cell.x && s.y === cell.y);
                let previewShip = null;
                if (selectedShipLength && hoveredCell && hoveredCell.x === cell.x && hoveredCell.y === cell.y) {
                  const isValid = isValidPlacement(cell.x, cell.y, selectedShipLength, isHorizontal);
                  previewShip = { length: selectedShipLength, horizontal: isHorizontal, valid: isValid };
                }

                return (
                  <div key={idx} onClick={() => handleCellClick(cell.x, cell.y)} onMouseEnter={() => setHoveredCell({ x: cell.x, y: cell.y })} className="bg-slate-700 aspect-square rounded-sm cursor-pointer relative">
                    {placedShip && (
                      <div className="absolute top-0 left-0 z-10 w-full h-full pointer-events-none">
                        <Ship size={placedShip.length} color="#10b981" isHorizontal={placedShip.horizontal} inGrid={true} />
                      </div>
                    )}
                    {previewShip && (
                      <div className="absolute top-0 left-0 z-20 w-full h-full pointer-events-none opacity-70 hidden md:block">
                        <Ship size={previewShip.length} color={previewShip.valid ? "#10b981" : "#ef4444"} isHorizontal={previewShip.horizontal} inGrid={true} />
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>

          <div className="bg-slate-800 p-4 md:p-6 rounded-xl border border-slate-700 w-full max-w-[320px] sm:max-w-[400px] lg:w-80 shadow-2xl">
            <button onClick={handleRandomize} className="mb-4 w-full bg-slate-700 hover:bg-slate-600 text-white font-bold py-3 px-4 rounded-lg transition-colors flex justify-center items-center gap-2">
              <span>🎲</span> Randomize Fleet
            </button>
            <button onClick={() => setIsHorizontal(!isHorizontal)} className="mb-6 w-full bg-slate-900 border border-blue-500/50 text-blue-400 font-bold py-3 px-4 rounded-lg transition-colors flex justify-between items-center">
              <span>Orientation:</span>
              <span className="flex items-center gap-2 text-white">{isHorizontal ? '⟷ Horiz' : '↕️ Vert'} 🔄</span>
            </button>

            <div className="flex flex-col gap-3">
              {Object.entries(availableShips).sort((a, b) => b[0] - a[0]).map(([decks, count]) => {
                const shipSize = Number(decks);
                const isSelected = selectedShipLength === shipSize;
                const isEmpty = count === 0;

                return (
                  <div key={decks} onClick={() => !isEmpty && setSelectedShipLength(shipSize)} className={`flex items-center justify-between p-3 rounded-lg border transition-all ${isEmpty ? 'opacity-30 cursor-not-allowed bg-slate-900 border-slate-800' : isSelected ? 'bg-slate-800 border-emerald-500 scale-105 shadow-lg' : 'bg-slate-900 border-slate-700 cursor-pointer hover:border-slate-400'}`}>
                    <div className="h-8 md:h-10 relative flex items-center" style={{ width: `${shipSize * 2.5}rem` }}>
                      <Ship size={shipSize} color={isEmpty ? '#475569' : (isSelected ? '#10b981' : '#64748b')} isHorizontal={true} />
                    </div>
                    <span className="text-slate-400 font-bold text-lg px-2">x{count}</span>
                  </div>
                );
              })}
            </div>

            <button disabled={!isReady || isWaitingForOpponent} onClick={handleReadyClick} className={`mt-6 md:mt-8 w-full font-bold py-4 rounded-lg text-lg transition-colors shadow-lg ${isWaitingForOpponent ? 'bg-amber-600 animate-pulse text-white cursor-wait' : isReady ? 'bg-blue-600 hover:bg-blue-500 text-white shadow-blue-500/30' : 'bg-slate-700 text-slate-500 cursor-not-allowed'}`}>
              {isWaitingForOpponent ? 'Waiting for enemy...' : 'Ready for Battle'}
            </button>
          </div>
        </div>
      </div>
    );
  }

  if (appState === 'battle') {
    const size = currentSession?.gridSize || 10;
    const cells = Array.from({ length: size * size }, (_, i) => ({ x: i % size, y: Math.floor(i / size) }));

    return (
      <div className="min-h-screen bg-slate-900 text-white p-4 flex flex-col items-center overflow-x-hidden">
        <div className={`px-8 py-3 rounded-full mb-4 shadow-lg mt-4 ${myTurn ? 'bg-emerald-600 shadow-emerald-500/30' : 'bg-red-600/70'}`}>
          <h1 className="text-lg md:text-xl font-bold uppercase tracking-widest">{myTurn ? '🎯 Your Turn!' : '🛡️ Enemy Turn...'}</h1>
        </div>
        <button onClick={handleSurrender} className="mb-6 bg-slate-800 text-red-400 font-bold py-2 px-6 rounded-lg border border-slate-700 hover:bg-red-900/30 transition-colors">🏳️ Surrender</button>

        <div className="flex flex-col xl:flex-row gap-8 md:gap-12 w-full max-w-5xl justify-center items-center">
          <div className="flex flex-col items-center w-full max-w-[320px] sm:max-w-[400px]">
            <h2 className="text-lg font-bold mb-3 text-slate-400">My Fleet</h2>
            <div className="bg-slate-800 p-2 rounded-lg border-2 border-slate-700 w-full shadow-xl" style={{ display: 'grid', gridTemplateColumns: `repeat(${size}, 1fr)`, gap: '2px' }}>
              {cells.map((cell, idx) => {
                const placedShip = placedShips.find(s => s.x === cell.x && s.y === cell.y);
                const isShipPart = placedShips.some(s => {
                  for (let i = 0; i < s.length; i++) if ((s.horizontal ? s.x + i : s.x) === cell.x && (s.horizontal ? s.y : s.y + i) === cell.y) return true;
                  return false;
                });

                const isSunkMyCell = sunkShips.mine.some(s => {
                  for (let i = 0; i < s.length; i++) if ((s.horizontal ? s.x + i : s.x) === cell.x && (s.horizontal ? s.y : s.y + i) === cell.y) return true;
                  return false;
                });

                const shot = enemyShots.find(s => s.x === cell.x && s.y === cell.y);

                let bgClass = "bg-slate-700";
                if (isShipPart && !shot) bgClass = "bg-emerald-500/20";
                if (isShipPart && shot && !isSunkMyCell) bgClass = "bg-red-600";
                if (isShipPart && shot && isSunkMyCell) bgClass = "bg-red-500/20";
                if (!isShipPart && shot) bgClass = "bg-slate-900";

                return (
                  <div key={idx} className={`${bgClass} aspect-square rounded-sm relative flex items-center justify-center`}>
                    {placedShip && (
                      <div className="absolute top-0 left-0 z-10 w-full h-full pointer-events-none opacity-90">
                        <Ship size={placedShip.length} color={isSunkMyCell ? "#ef4444" : "#10b981"} isHorizontal={placedShip.horizontal} inGrid={true} />
                      </div>
                    )}
                    {shot && (
                      <div className="absolute z-20 w-full h-full flex items-center justify-center pointer-events-none">
                        {isShipPart ? (!isSunkMyCell && <div className="w-2 h-2 md:w-3 md:h-3 bg-white rounded-full shadow-[0_0_5px_white]"></div>) : (<div className="w-1.5 h-1.5 md:w-2 md:h-2 bg-slate-500 rounded-full"></div>)}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>

          <div className="flex flex-col items-center w-full max-w-[320px] sm:max-w-[400px]">
            <h2 className="text-lg font-bold mb-3 text-blue-400">Enemy Waters</h2>
            <div className={`bg-slate-800 p-2 rounded-lg border-2 w-full shadow-xl transition-colors ${myTurn ? 'border-blue-500 cursor-pointer md:cursor-crosshair shadow-blue-500/20' : 'border-slate-700 opacity-60'}`} style={{ display: 'grid', gridTemplateColumns: `repeat(${size}, 1fr)`, gap: '2px' }}>
              {cells.map((cell, idx) => {
                const shot = myShots.find(s => s.x === cell.x && s.y === cell.y);
                const isSunkEnemyCell = sunkShips.enemy.some(s => {
                  for (let i = 0; i < s.length; i++) if ((s.horizontal ? s.x + i : s.x) === cell.x && (s.horizontal ? s.y : s.y + i) === cell.y) return true;
                  return false;
                });

                let bgClass = "bg-slate-700 hover:bg-blue-500/30";
                if (shot?.status === 'miss') bgClass = "bg-slate-900";
                if (shot?.status === 'hit' && !isSunkEnemyCell) bgClass = "bg-red-500";
                if (shot?.status === 'hit' && isSunkEnemyCell) bgClass = "bg-red-500/20";

                return (
                  <div key={idx} onClick={() => handleFireShot(cell.x, cell.y)} className={`${bgClass} aspect-square rounded-sm relative flex items-center justify-center`}>
                    {shot && (
                      <div className="absolute z-20 w-full h-full flex items-center justify-center pointer-events-none">
                        {shot.status === 'hit' ? (!isSunkEnemyCell && <div className="w-2 h-2 md:w-3 md:h-3 bg-white rounded-full shadow-[0_0_5px_white]"></div>) : (<div className="w-1.5 h-1.5 md:w-2 md:h-2 bg-slate-500 rounded-full"></div>)}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      </div>
    );
  }

  if (appState === 'game_over') {
    const isMeWinner = winnerName === userName;
    return (
      <div className="min-h-screen bg-slate-900 flex flex-col items-center justify-center p-4 text-center">
        <h1 className={`text-5xl md:text-6xl font-extrabold mb-4 ${isMeWinner ? 'text-emerald-500' : 'text-red-500'}`}>{isMeWinner ? 'VICTORY!' : 'DEFEAT'}</h1>
        {gameOverReason === 'surrender' && isMeWinner && <div className="bg-emerald-500/10 border border-emerald-500 text-emerald-500 px-6 py-2 rounded mb-4 font-bold">🏳️ ENEMY SURRENDERED!</div>}
        {gameOverReason === 'disconnect' && isMeWinner && <div className="bg-amber-500/10 border border-amber-500 text-amber-500 px-6 py-2 rounded mb-4 font-bold animate-pulse">⚠️ ENEMY FLED!</div>}
        <p className="text-lg md:text-xl text-slate-300 mb-8">{isMeWinner ? 'Enemy fleet sunk!' : `Crushed by ${winnerName}`}</p>
        {replayData && <button onClick={() => { setReplayIndex(0); setIsPlayingReplay(true); setAppState('replay'); }} className="mb-4 bg-purple-600 hover:bg-purple-500 transition-colors text-white font-bold py-3 px-8 rounded-xl shadow-lg w-full max-w-xs">🎥 Watch Replay</button>}
        <button onClick={() => { setAppState('lobby'); setMyShots([]); setEnemyShots([]); setSunkShips({ mine: [], enemy: [] }); setCurrentSession(null); setGameOverReason(null); }} className="bg-blue-600 hover:bg-blue-500 transition-colors text-white font-bold py-3 px-8 rounded-xl w-full max-w-xs">Return to Lobby</button>
      </div>
    );
  }

  if (appState === 'replay') {
    const size = currentSession?.gridSize || 10;
    const cells = Array.from({ length: size * size }, (_, i) => ({ x: i % size, y: Math.floor(i / size) }));
    const currentHistory = replayData.history.slice(0, replayIndex);

    const replaySunkMine = [];
    const replaySunkEnemy = [];
    currentHistory.forEach(h => {
      if (h.sunkShip) {
        if (h.target === socket.id) replaySunkMine.push(h.sunkShip);
        else replaySunkEnemy.push(h.sunkShip);
      }
    });

    const expandShots = (shots) => {
      let all = [...shots];
      shots.forEach(s => { if (s.haloCells) s.haloCells.forEach(hc => all.push({ x: hc.x, y: hc.y, status: 'miss' })); });
      return all;
    };

    const renderedMyShots = expandShots(currentHistory.filter(h => h.target === socket.id));
    const renderedEnemyShots = expandShots(currentHistory.filter(h => h.target !== socket.id));

    return (
      <div className="min-h-screen bg-slate-900 text-white p-4 flex flex-col items-center overflow-x-hidden">
        <div className="px-6 py-3 rounded-full mb-6 mt-4 bg-purple-600 flex gap-4 items-center shadow-lg">
          <h1 className="font-extrabold uppercase md:text-lg">🎥 Action Replay</h1>
          <div className="bg-purple-800 px-3 py-1 rounded text-sm font-bold">Turn: {replayIndex} / {replayData.history.length}</div>
        </div>
        <div className="flex flex-wrap justify-center gap-3 mb-8">
          <button onClick={() => setIsPlayingReplay(!isPlayingReplay)} className="bg-slate-700 px-6 py-2 rounded-lg font-bold hover:bg-slate-600">{isPlayingReplay ? '⏸ Pause' : '▶️ Play'}</button>
          <button onClick={() => { setReplayIndex(0); setIsPlayingReplay(true); }} className="bg-slate-700 px-6 py-2 rounded-lg font-bold hover:bg-slate-600">🔄 Restart</button>
          <button onClick={() => setAppState('game_over')} className="bg-red-600 px-6 py-2 rounded-lg font-bold hover:bg-red-500">✖ Close</button>
        </div>

        <div className="flex flex-col xl:flex-row gap-8 md:gap-12 w-full max-w-5xl justify-center items-center">
          <div className="flex flex-col items-center w-full max-w-[320px] sm:max-w-[400px]">
            <h2 className="text-lg font-bold mb-3 text-emerald-400">My Fleet (Revealed)</h2>
            <div className="bg-slate-800 p-2 rounded-lg border-2 border-slate-700 w-full shadow-lg" style={{ display: 'grid', gridTemplateColumns: `repeat(${size}, 1fr)`, gap: '2px' }}>
              {cells.map((cell, idx) => {
                const myBoard = replayData.boards[socket.id] || [];
                const placedShip = myBoard.find(s => s.x === cell.x && s.y === cell.y);
                const isShipPart = myBoard.some(s => {
                  for (let i = 0; i < s.length; i++) if ((s.horizontal ? s.x + i : s.x) === cell.x && (s.horizontal ? s.y : s.y + i) === cell.y) return true;
                  return false;
                });

                const isSunkMyCell = replaySunkMine.some(s => {
                  for (let i = 0; i < s.length; i++) if ((s.horizontal ? s.x + i : s.x) === cell.x && (s.horizontal ? s.y : s.y + i) === cell.y) return true;
                  return false;
                });

                const shot = renderedMyShots.find(s => s.x === cell.x && s.y === cell.y);

                let bgClass = "bg-slate-700";
                if (isShipPart && !shot) bgClass = "bg-emerald-500/20";
                if (isShipPart && shot && !isSunkMyCell) bgClass = "bg-red-600";
                if (isShipPart && shot && isSunkMyCell) bgClass = "bg-red-500/20";
                if (!isShipPart && shot) bgClass = "bg-slate-900";

                return (
                  <div key={idx} className={`${bgClass} aspect-square rounded-sm relative flex items-center justify-center`}>
                    {placedShip && (
                      <div className="absolute top-0 left-0 z-10 w-full h-full pointer-events-none opacity-90">
                        <Ship size={placedShip.length} color={isSunkMyCell ? "#ef4444" : "#10b981"} isHorizontal={placedShip.horizontal} inGrid={true} />
                      </div>
                    )}
                    {shot && (
                      <div className="absolute z-20 w-full h-full flex items-center justify-center pointer-events-none">
                        {isShipPart ? (!isSunkMyCell && <div className="w-2 h-2 md:w-3 md:h-3 bg-white rounded-full"></div>) : (<div className="w-1.5 h-1.5 md:w-2 md:h-2 bg-slate-500 rounded-full"></div>)}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>

          <div className="flex flex-col items-center w-full max-w-[320px] sm:max-w-[400px]">
            <h2 className="text-lg font-bold mb-3 text-red-400">Enemy Fleet (Revealed)</h2>
            <div className="bg-slate-800 p-2 rounded-lg border-2 border-slate-700 w-full shadow-lg" style={{ display: 'grid', gridTemplateColumns: `repeat(${size}, 1fr)`, gap: '2px' }}>
              {cells.map((cell, idx) => {
                const enemySocket = Object.keys(replayData.boards).find(k => k !== socket.id);
                const enemyBoard = replayData.boards[enemySocket] || [];
                const placedShip = enemyBoard.find(s => s.x === cell.x && s.y === cell.y);
                const isShipPart = enemyBoard.some(s => {
                  for (let i = 0; i < s.length; i++) if ((s.horizontal ? s.x + i : s.x) === cell.x && (s.horizontal ? s.y : s.y + i) === cell.y) return true;
                  return false;
                });

                const isSunkEnemyCell = replaySunkEnemy.some(s => {
                  for (let i = 0; i < s.length; i++) if ((s.horizontal ? s.x + i : s.x) === cell.x && (s.horizontal ? s.y : s.y + i) === cell.y) return true;
                  return false;
                });

                const shot = renderedEnemyShots.find(s => s.x === cell.x && s.y === cell.y);

                let bgClass = "bg-slate-700";
                if (isShipPart && !shot) bgClass = "bg-slate-500/20";
                if (isShipPart && shot && !isSunkEnemyCell) bgClass = "bg-red-600";
                if (isShipPart && shot && isSunkEnemyCell) bgClass = "bg-red-500/20";
                if (!isShipPart && shot) bgClass = "bg-slate-900";

                return (
                  <div key={idx} className={`${bgClass} aspect-square rounded-sm relative flex items-center justify-center`}>
                    {placedShip && (
                      <div className="absolute top-0 left-0 z-10 w-full h-full pointer-events-none opacity-90">
                        <Ship size={placedShip.length} color={isSunkEnemyCell ? "#ef4444" : "#64748b"} isHorizontal={placedShip.horizontal} inGrid={true} />
                      </div>
                    )}
                    {shot && (
                      <div className="absolute z-20 w-full h-full flex items-center justify-center pointer-events-none">
                        {isShipPart ? (!isSunkEnemyCell && <div className="w-2 h-2 md:w-3 md:h-3 bg-white rounded-full"></div>) : (<div className="w-1.5 h-1.5 md:w-2 md:h-2 bg-slate-500 rounded-full"></div>)}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-900 text-white p-4 md:p-8">
      <header className="max-w-5xl mx-auto flex justify-between items-center mb-8 border-b border-slate-700 pb-6">
        <h1 className="text-3xl font-extrabold text-blue-500 tracking-tight">Battleship Lobby</h1>
        <div className="flex items-center gap-4">
          <div className="bg-slate-800 px-6 py-2 rounded-full border border-slate-700">
            <span className="text-slate-400 mr-2">Callsign:</span>
            <span className="text-xl font-bold text-emerald-400">{userName}</span>
          </div>
          <button onClick={handleLogout} className="text-red-400 hover:text-red-300 font-bold text-sm">LOGOUT</button>
        </div>
      </header>

      <main className="max-w-5xl mx-auto grid grid-cols-1 md:grid-cols-3 gap-6">
        <section className="bg-slate-800 p-6 rounded-xl border border-slate-700 md:col-span-1 h-fit">
          <h2 className="text-xl font-bold mb-4 text-white">Fleet Command</h2>
          <label className="block text-slate-400 text-sm mb-2">Select Grid Size:</label>
          <select value={gridSize} onChange={(e) => setGridSize(Number(e.target.value))} className="w-full bg-slate-900 border border-slate-600 text-white rounded-lg px-4 py-2 mb-6 focus:outline-none">
            <option value={10}>10 x 10 (Classic Fleet)</option>
            <option value={15}>15 x 15 (Expanded Fleet)</option>
            <option value={20}>20 x 20 (Epic Fleet)</option>
          </select>
          <button onClick={handleCreateGame} className="w-full bg-emerald-600 text-white font-bold py-3 px-4 rounded-lg mb-2">Create Multiplayer Session</button>
          <div className="flex items-center gap-4 my-2"><hr className="flex-1 border-slate-600" /><span className="text-slate-500 text-sm font-bold uppercase">or</span><hr className="flex-1 border-slate-600" /></div>
          <button onClick={handleCreateBotGame} className="w-full bg-purple-600 text-white font-bold py-3 px-4 rounded-lg">🤖 Play against AI</button>
        </section>

        <section className="bg-slate-800 p-6 rounded-xl border border-slate-700 md:col-span-2">
          <h2 className="text-xl font-bold mb-4 text-white">Active Sessions</h2>
          {sessions.length === 0 ? (
            <div className="text-slate-500 text-center py-12 border-2 border-dashed border-slate-700 rounded-lg">No active games found. Create one!</div>
          ) : (
            <div className="grid gap-4">
              {sessions.map(session => (
                <div key={session.id} className="bg-slate-900 border border-slate-700 p-4 rounded-lg flex justify-between items-center">
                  <div>
                    <h3 className="font-bold text-lg text-white">Host: {session.host}</h3>
                    <p className="text-sm text-slate-400">Map: {session.gridSize}x{session.gridSize}</p>
                  </div>
                  <button onClick={() => handleJoinGame(session)} className="bg-blue-600 text-white font-bold py-2 px-6 rounded-lg">Join Game</button>
                </div>
              ))}
            </div>
          )}
        </section>
      </main>
    </div>
  );
}

export default App;