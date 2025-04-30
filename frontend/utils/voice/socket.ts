import { Socket } from 'socket.io-client';
import { auth } from '@/utils/auth';

export const initializeVoiceSocket = async (socket: Socket) => {
  try {
    const token = await auth.currentUser?.getIdToken();
    if (token) {
      socket.emit('authenticate', token);
    }
  } catch (error) {
    console.error('Error initializing voice socket:', error);
    throw error;
  }
};

export const setupSocketHandlers = (
  socket: Socket,
  handlers: {
    onMatchFound: () => void;
    onOffer: (offer: RTCSessionDescriptionInit) => void;
    onAnswer: (answer: RTCSessionDescriptionInit) => void;
    onIceCandidate: (candidate: RTCIceCandidateInit) => void;
    onPartnerDisconnected: () => void;
  }
) => {
  socket.on('match_found', handlers.onMatchFound);
  socket.on('offer', handlers.onOffer);
  socket.on('answer', handlers.onAnswer);
  socket.on('ice_candidate', handlers.onIceCandidate);
  socket.on('partner_disconnected', handlers.onPartnerDisconnected);

  return () => {
    socket.off('match_found', handlers.onMatchFound);
    socket.off('offer', handlers.onOffer);
    socket.off('answer', handlers.onAnswer);
    socket.off('ice_candidate', handlers.onIceCandidate);
    socket.off('partner_disconnected', handlers.onPartnerDisconnected);
  };
};

export const findMatch = (socket: Socket) => {
  socket.emit('find_match');
};

export const sendOffer = (socket: Socket, offer: RTCSessionDescriptionInit) => {
  socket.emit('offer', offer);
};

export const sendAnswer = (socket: Socket, answer: RTCSessionDescriptionInit) => {
  socket.emit('answer', answer);
};

export const sendIceCandidate = (socket: Socket, candidate: RTCIceCandidateInit) => {
  socket.emit('ice_candidate', candidate);
}; 