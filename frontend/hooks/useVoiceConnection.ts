import { useState, useEffect, useRef } from 'react';
import { Socket } from 'socket.io-client';
import { getSocket, initializeSocket } from '@/utils/socket';
import { initializeVoiceSocket, setupSocketHandlers, findMatch } from '@/utils/voice/socket';
import { useVoiceTransfer } from './useVoiceTransfer';

export const useVoiceConnection = () => {
  const [isConnected, setIsConnected] = useState(false);
  const [isSearching, setIsSearching] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const socketRef = useRef<Socket | null>(null);
  const peerConnectionRef = useRef<RTCPeerConnection | null>(null);
  const remoteStreamRef = useRef<MediaStream | null>(null); // Using useRef to avoid re-rendering

  const {
    isSpeaking,
    error: voiceError,
    localStreamRef,
    startVoiceChat,
    stopVoiceChat,
    handleOffer,
    handleAnswer,
    handleIceCandidate
  } = useVoiceTransfer();

  useEffect(() => {
    let mounted = true;
    let socket: Socket | null = null;

    const initializeConnection = async () => {
      try {
        socket = await initializeSocket();
        if (!mounted) return;

        socketRef.current = socket;
        await initializeVoiceSocket(socket);

        const cleanup = setupSocketHandlers(socket, {
          onMatchFound: () => {
            if (!mounted) return;
            setIsConnected(true);
            setIsSearching(false);
          },
          onOffer: async (offer) => {
            if (!mounted) return;
            try {
              const answer = await handleOffer(offer);
              if (socket) {
                socket.emit('answer', answer);
              }
            } catch (error) {
              console.error('Error handling offer:', error);
              setError('Error handling connection offer');
            }
          },
          onAnswer: async (answer) => {
            if (!mounted) return;
            try {
              await handleAnswer(answer);
            } catch (error) {
              console.error('Error handling answer:', error);
              setError('Error handling connection answer');
            }
          },
          onIceCandidate: async (candidate) => {
            if (!mounted) return;
            try {
              await handleIceCandidate(candidate);
            } catch (error) {
              console.error('Error handling ICE candidate:', error);
            }
          },
          onPartnerDisconnected: () => {
            if (!mounted) return;
            setIsConnected(false);
            setIsSearching(false);
            stopVoiceChat();
          }
        });

        return () => {
          mounted = false;
          cleanup();
          if (socket) {
            socket.disconnect();
          }
          stopVoiceChat();
        };
      } catch (error) {
        console.error('Error initializing connection:', error);
        setError('Failed to initialize connection');
      }
    };

    initializeConnection();
  }, [handleOffer, handleAnswer, handleIceCandidate, stopVoiceChat]);

  const startSearching = () => {
    const socket = getSocket();
    if (socket) {
      setIsSearching(true);
      findMatch(socket);
    }
  };

  useEffect(() => {
    if (peerConnectionRef.current) {
      peerConnectionRef.current.ontrack = (event) => {
        // Using useRef to store remote stream and avoid re-rendering
        const newRemoteStream = new MediaStream();
        event.streams[0].getTracks().forEach(track => {
          newRemoteStream.addTrack(track);
        });
        remoteStreamRef.current = newRemoteStream; // Update via useRef
      };
    }
  }, []);

  return {
    isConnected,
    isSearching,
    isSpeaking,
    error: error || voiceError,
    localStreamRef,
    remoteStreamRef,
    startSearching,
    startVoiceChat,
    stopVoiceChat
  };
};
