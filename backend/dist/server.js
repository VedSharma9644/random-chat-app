"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
var __awaiter = (this && this.__awaiter) || function (thisArg, _arguments, P, generator) {
    function adopt(value) { return value instanceof P ? value : new P(function (resolve) { resolve(value); }); }
    return new (P || (P = Promise))(function (resolve, reject) {
        function fulfilled(value) { try { step(generator.next(value)); } catch (e) { reject(e); } }
        function rejected(value) { try { step(generator["throw"](value)); } catch (e) { reject(e); } }
        function step(result) { result.done ? resolve(result.value) : adopt(result.value).then(fulfilled, rejected); }
        step((generator = generator.apply(thisArg, _arguments || [])).next());
    });
};
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = __importDefault(require("express"));
const http_1 = require("http");
const socket_io_1 = require("socket.io");
const cors_1 = __importDefault(require("cors"));
const admin = __importStar(require("firebase-admin"));
const dotenv_1 = __importDefault(require("dotenv"));
dotenv_1.default.config();
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
const app = (0, express_1.default)();
// Define allowed origin
const allowedOrigin = process.env.CORS_ORIGIN || 'http://localhost:3000';
// Configure CORS options
const corsOptions = {
    origin: allowedOrigin,
    methods: ['GET', 'POST'],
    credentials: true,
};
// Apply CORS middleware
app.use((0, cors_1.default)(corsOptions));
// Handle preflight requests
app.options(/(.*)/, (0, cors_1.default)(corsOptions));
app.use(express_1.default.json());
// Initialize Socket.IO
const httpServer = (0, http_1.createServer)(app);
const io = new socket_io_1.Server(httpServer, {
    cors: {
        origin: allowedOrigin,
        methods: ['GET', 'POST'],
        credentials: true,
    },
});
// Store waiting users and active rooms
const waitingUsers = [];
const activeRooms = {};
// Store active rooms and their participants
const rooms = new Map();
// Helper function to find a partner in a room
function findPartner(socketId) {
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
    socket.on('authenticate', (token) => __awaiter(void 0, void 0, void 0, function* () {
        try {
            const decodedToken = yield admin.auth().verifyIdToken(token);
            socket.data.userId = decodedToken.uid;
            console.log('User authenticated:', decodedToken.uid);
        }
        catch (error) {
            console.error('Authentication error:', error);
            socket.disconnect();
        }
    }));
    // Handle user looking for a match
    socket.on('find_match', () => {
        if (waitingUsers.length > 0) {
            const partnerId = waitingUsers.pop();
            const roomId = `${socket.id}-${partnerId}`;
            // Create room with both users
            rooms.set(roomId, new Set([socket.id, partnerId]));
            // Join both users to the room
            socket.join(roomId);
            const partnerSocket = io.sockets.sockets.get(partnerId);
            partnerSocket === null || partnerSocket === void 0 ? void 0 : partnerSocket.join(roomId);
            // Notify both users
            io.to(roomId).emit('match_found', roomId);
        }
        else {
            waitingUsers.push(socket.id);
        }
    });
    // Handle WebRTC signaling
    socket.on('offer', (offer) => {
        const partner = findPartner(socket.id);
        if (partner) {
            socket.to(partner.id).emit('offer', offer);
        }
    });
    socket.on('answer', (answer) => {
        const partner = findPartner(socket.id);
        if (partner) {
            socket.to(partner.id).emit('answer', answer);
        }
    });
    socket.on('ice_candidate', (candidate) => {
        const partner = findPartner(socket.id);
        if (partner) {
            socket.to(partner.id).emit('ice_candidate', candidate);
        }
    });
    // Handle messages
    socket.on('message', (message) => {
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
                }
                else {
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
}
catch (error) {
    console.error('Failed to start server:', error);
    process.exit(1);
}
