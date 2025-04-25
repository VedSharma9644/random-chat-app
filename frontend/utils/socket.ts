import { io, Socket } from 'socket.io-client';
import { auth } from './auth';

let socket: Socket | null = null;
let socketPromise: Promise<Socket> | null = null;

export const initializeSocket = async () => {
  if (socketPromise) return socketPromise;
  if (socket) return socket;

  socketPromise = (async () => {
    const wsUrl = process.env.NEXT_PUBLIC_WS_URL || 'http://localhost:3001';
    console.log('Connecting to WebSocket server:', wsUrl);

    // Get token asynchronously before creating socket
    let token;
    try {
      token = await auth.currentUser?.getIdToken(true);
    } catch (err) {
      console.error('Error getting auth token:', err);
    }

    socket = io(wsUrl, {
      auth: token ? { token } : undefined,
      transports: ['websocket', 'polling'], // Try both, fallback to polling
      reconnection: true,
      reconnectionAttempts: 5,
      reconnectionDelay: 1000,
      reconnectionDelayMax: 5000,
      timeout: 20000,
      forceNew: true,
      autoConnect: true,
      path: '/socket.io/',
      withCredentials: true,
      extraHeaders: {
        'Access-Control-Allow-Credentials': 'true'
      }
    });

    socket.on('connect', () => {
      console.log('Connected to socket server');
    });

    socket.on('connect_error', (error) => {
      console.error('Socket connection error:', error);
      // Try to reconnect after a delay
      setTimeout(() => {
        if (socket && !socket.connected) {
          console.log('Attempting to reconnect...');
          socket.connect();
        }
      }, 5000);
    });

    socket.on('disconnect', (reason) => {
      console.log('Disconnected from socket server:', reason);
      if (reason === 'io server disconnect' && socket) {
        // The disconnection was initiated by the server, you need to reconnect manually
        setTimeout(() => {
          if (socket && !socket.connected) {
            console.log('Attempting to reconnect after server disconnect...');
            socket.connect();
          }
        }, 5000);
      }
    });

    return socket;
  })();

  return socketPromise;
};

export const getSocket = () => {
  if (!socket) {
    throw new Error('Socket not initialized');
  }
  return socket;
};

export const disconnectSocket = () => {
  if (socket) {
    socket.disconnect();
    socket = null;
  }
  socketPromise = null;
};
