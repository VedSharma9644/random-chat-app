import express from 'express';
import { createServer } from 'http';
import { Server } from 'socket.io';
import cors from 'cors';
import * as admin from 'firebase-admin';
import dotenv from 'dotenv';
import path from 'path';

dotenv.config();

// Initialize Firebase Admin from environment variable
const serviceAccount = JSON.parse(process.env.SERVICE_ACCOUNT_KEY || '{}');
admin.initializeApp({
  credential: admin.credential.cert(serviceAccount),
});

const app = express();

// Define allowed origin
const allowedOrigin = process.env.CLIENT_URL || 'http://localhost:3000';

// Configure CORS options
const corsOptions = {
  origin: allowedOrigin,
  methods: ['GET', 'POST'],
  credentials: true,
};

// Apply CORS middleware
app.use(cors(corsOptions));

// Handle preflight requests
app.options('*', cors(corsOptions));

app.use(express.json());

// Serve static files from the 'frontend' directory
app.use(express.static(path.join(__dirname, '../frontend')));

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
    const roomId = Object.keys(activeRooms).find((room) =>
      activeRooms[room].includes(socket.id)
    );

    if (roomId) {
      io.to(roomId).emit('message', {
        id: Date.now().toString(),
        text: message,
        sender: socket.id,
        timestamp: new Date(),
      });
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

const PORT = process.env.PORT || 3001;
httpServer.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});

// Define your API routes first
app.get('/api/status', (req, res) => {
  res.json({ status: 'online' });
});

// Root route
app.get('/', (req, res) => {
  res.send('Welcome to the Chat App!');
});

// Important: Add a catch-all route to handle client-side routing
// This must be placed AFTER all other routes
app.get('*', (req, res) => {
  // Check if the request seems to be for an API endpoint or a static file
  if (req.path.startsWith('/api/') || req.path.includes('.')) {
    res.status(404).send('Not found');
  } else {
    // For all other requests, serve the index.html file
    // This allows client-side routing to work properly
    res.sendFile(path.join(__dirname, '../frontend/index.html'));
  }
});