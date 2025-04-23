import express from 'express';
import { createServer } from 'http';
import { Server } from 'socket.io';
import cors from 'cors';
import * as admin from 'firebase-admin';
import dotenv from 'dotenv';

dotenv.config();

// Initialize Firebase Admin from environment variable
// Access the Firebase service account JSON from the environment variable
const serviceAccount = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT_KEY || '{}');

if (!serviceAccount || !serviceAccount.project_id) {
  throw new Error('Missing Firebase service account credentials');
}

// Initialize Firebase Admin SDK
admin.initializeApp({
  credential: admin.credential.cert(serviceAccount),
});

console.log('Firebase Admin Initialized');

const dev = process.env.NODE_ENV !== 'production';
const app = express();

// Define allowed origin
const allowedOrigin = process.env.CORS_ORIGIN || 'http://localhost:3000';

// Configure CORS options
const corsOptions = {
  origin: allowedOrigin,
  methods: ['GET', 'POST'],
  credentials: true,
};

// Apply CORS middleware
app.use(cors(corsOptions));

// Handle preflight requests
app.options(/(.*)/, cors(corsOptions));


app.use(express.json());

// Initialize Socket.IO
const httpServer = createServer(app);
const io = new Server(httpServer, {
  cors: {
    origin: allowedOrigin,
    methods: ['GET', 'POST'],
    credentials: true,
  },
});

// Store waiting users and active rooms
const waitingUsers: string[] = [];
const activeRooms: { [key: string]: string[] } = {};

// Store active rooms and their participants
const rooms = new Map<string, Set<string>>();

// Helper function to find a partner in a room
function findPartner(socketId: string): { id: string } | null {
  for (const [roomId, participants] of rooms.entries()) {
    if (participants.has(socketId)) {
      for (const participantId of participants) {
        if (participantId !== socketId) {
          return { id: participantId };
        }
      }
    }
  }
  return null;
}

// Socket.io connection handling
io.on('connection', (socket) => {
  console.log('User connected:', socket.id);

  // Handle user authentication
  socket.on('authenticate', async (token: string) => {
    try {
      const decodedToken = await admin.auth().verifyIdToken(token);
      socket.data.userId = decodedToken.uid;
      console.log('User authenticated:', decodedToken.uid);
    } catch (error) {
      console.error('Authentication error:', error);
      socket.disconnect();
    }
  });

  // Handle user looking for a match
  socket.on('find_match', () => {
    if (waitingUsers.length > 0) {
      const partnerId = waitingUsers.pop()!;
      const roomId = `${socket.id}-${partnerId}`;

      // Create room with both users
      rooms.set(roomId, new Set([socket.id, partnerId]));

      // Join both users to the room
      socket.join(roomId);
      const partnerSocket = io.sockets.sockets.get(partnerId);
      partnerSocket?.join(roomId);

      // Notify both users
      io.to(roomId).emit('match_found', roomId);
    } else {
      waitingUsers.push(socket.id);
    }
  });

  // Handle WebRTC signaling
  socket.on('offer', (offer: RTCSessionDescriptionInit) => {
    const partner = findPartner(socket.id);
    if (partner) {
      socket.to(partner.id).emit('offer', offer);
    }
  });

  socket.on('answer', (answer: RTCSessionDescriptionInit) => {
    const partner = findPartner(socket.id);
    if (partner) {
      socket.to(partner.id).emit('answer', answer);
    }
  });

  socket.on('ice_candidate', (candidate: RTCIceCandidateInit) => {
    const partner = findPartner(socket.id);
    if (partner) {
      socket.to(partner.id).emit('ice_candidate', candidate);
    }
  });

  // Handle messages
  socket.on('message', (message: string) => {
    // Find the room that contains this socket
    for (const [roomId, participants] of rooms.entries()) {
      if (participants.has(socket.id)) {
        // Emit the message to all participants in the room
        io.to(roomId).emit('message', {
          id: Date.now().toString(),
          text: message,
          sender: socket.id,
          timestamp: new Date(),
        });
        break;
      }
    }
  });

  // Handle disconnection
  socket.on('disconnect', () => {
    console.log('User disconnected:', socket.id);

    // Remove from waiting list
    const waitingIndex = waitingUsers.indexOf(socket.id);
    if (waitingIndex !== -1) {
      waitingUsers.splice(waitingIndex, 1);
    }

    // Clean up rooms
    for (const [roomId, participants] of rooms.entries()) {
      if (participants.has(socket.id)) {
        participants.delete(socket.id);
        if (participants.size === 0) {
          rooms.delete(roomId);
        } else {
          // Notify remaining participant
          const remainingParticipant = Array.from(participants)[0];
          io.to(remainingParticipant).emit('partner_disconnected');
        }
      }
    }
  });
});

// API route example
app.get('/api/status', (req, res) => {
  res.json({ status: 'online' });
});

// Start the server
const PORT = process.env.PORT || '8080';
const HOST = '0.0.0.0';

console.log('Environment variables:');
console.log('NODE_ENV:', process.env.NODE_ENV);
console.log('PORT:', PORT);
console.log('CORS_ORIGIN:', process.env.CORS_ORIGIN);
console.log('Firebase initialized:', !!admin.apps.length);

console.log(`Starting server on ${HOST}:${PORT}`);

try {
  httpServer.listen(parseInt(PORT, 10), HOST, () => {
    console.log(`Server running on ${HOST}:${PORT}`);
  });

  // Handle server errors
  httpServer.on('error', (error) => {
    console.error('Server error:', error);
    process.exit(1);
  });
} catch (error) {
  console.error('Failed to start server:', error);
  process.exit(1);
}
