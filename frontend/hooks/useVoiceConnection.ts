import { useState, useEffect, useRef, useCallback } from 'react';
import { Socket } from 'socket.io-client';
import { getSocket, initializeSocket } from '@/utils/socket';
import { initializeVoiceSocket, setupSocketHandlers, findMatch } from '@/utils/voice/socket';
import { useVoiceTransfer } from './useVoiceTransfer';

export const useVoiceConnection = () => {
  const [isConnected, setIsConnected] = useState(false);
  const [isSearching, setIsSearching] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const socketRef = useRef<Socket | null>(null);
  const remoteStreamRef = useRef<MediaStream | null>(null);

  const {
    isSpeaking,
    error: voiceError,
    localStreamRef,
    remoteStreamRef: voiceRemoteStreamRef,
    startVoiceChat,
    stopVoiceChat,
    handleOffer,
    handleAnswer,
    handleIceCandidate,
    peerConnectionRef
  } = useVoiceTransfer();

  useEffect(() => {
    let mounted = true;
    let socket: Socket | null = null;
    let cleanup: (() => void) | null = null;

    const initializeConnection = async () => {
      try {
        socket = await initializeSocket();
        if (!mounted) return;

        socketRef.current = socket;
        await initializeVoiceSocket(socket);

        cleanup = setupSocketHandlers(socket, {
          onMatchFound: () => {
            if (!mounted) return;
            console.log('[WebRTC] Match found, starting voice chat...');
            setIsConnected(true);
            setIsSearching(false);
          },
          onOffer: async (offer) => {
            if (!mounted || !socket) return;
            try {
              console.log('[WebRTC] Received offer:', offer);
              
              // Only start voice chat if we haven't already
              if (!peerConnectionRef.current) {
                console.log('[WebRTC] Starting voice chat to handle offer...');
                await startVoiceChat();
              }
              
              const answer = await handleOffer(offer);
              if (answer) {
                console.log('[WebRTC] Created answer:', answer);
                socket.emit('answer', answer);
                console.log('[WebRTC] Answer sent through socket');
              } else {
                console.error('[WebRTC] Failed to create answer');
              }
            } catch (error) {
              console.error('[WebRTC] Error handling offer:', error);
              setError('Error handling connection offer');
            }
          },
          onAnswer: async (answer) => {
            if (!mounted) return;
            if (!answer) {
              console.error('[WebRTC] Received null answer');
              return;
            }
            try {
              console.log('[WebRTC] Received answer:', answer);
              await handleAnswer(answer);
              console.log('[WebRTC] Answer processed successfully');
              
              // Check connection state after processing answer
              if (peerConnectionRef.current) {
                console.log('[WebRTC] Connection state after answer:', peerConnectionRef.current.connectionState);
                console.log('[WebRTC] ICE connection state after answer:', peerConnectionRef.current.iceConnectionState);
                console.log('[WebRTC] Signaling state after answer:', peerConnectionRef.current.signalingState);
              }
            } catch (error) {
              console.error('[WebRTC] Error handling answer:', error);
              setError('Error handling connection answer');
            }
          },
          onIceCandidate: async (candidate) => {
            if (!mounted) return;
            if (!candidate) {
              console.error('[WebRTC] Received null ICE candidate');
              return;
            }
            try {
              console.log('[WebRTC] Received ICE candidate:', candidate);
              await handleIceCandidate(candidate);
              console.log('[WebRTC] ICE candidate processed successfully');
              
              // Check connection state after adding ICE candidate
              if (peerConnectionRef.current) {
                console.log('[WebRTC] Connection state after ICE:', peerConnectionRef.current.connectionState);
                console.log('[WebRTC] ICE connection state after ICE:', peerConnectionRef.current.iceConnectionState);
              }
            } catch (error) {
              console.error('[WebRTC] Error handling ICE candidate:', error);
            }
          },
          onPartnerDisconnected: () => {
            if (!mounted) return;
            console.log('[WebRTC] Partner disconnected');
            setIsConnected(false);
            setIsSearching(false);
            stopVoiceChat();
          }
        });
      } catch (error) {
        console.error('[WebRTC] Error initializing connection:', error);
        setError('Failed to initialize connection');
      }
    };

    initializeConnection();

    return () => {
      mounted = false;
      if (cleanup) {
        cleanup();
      }
      if (socket) {
        socket.disconnect();
      }
      stopVoiceChat();
    };
  }, [handleOffer, handleAnswer, handleIceCandidate, stopVoiceChat, startVoiceChat]);

  const startSearching = () => {
    const socket = getSocket();
    if (socket) {
      setIsSearching(true);
      findMatch(socket);
    }
  };

  // Update remoteStreamRef when voiceRemoteStreamRef changes
  useEffect(() => {
    if (voiceRemoteStreamRef.current) {
      remoteStreamRef.current = voiceRemoteStreamRef.current;
    }
  }, [voiceRemoteStreamRef]);

  useEffect(() => {
    if (!remoteStreamRef.current) return;

    const audioContext = new AudioContext();
    const analyser = audioContext.createAnalyser();
    analyser.fftSize = 2048;
    const source = audioContext.createMediaStreamSource(remoteStreamRef.current);
    source.connect(analyser);

    const dataArray = new Uint8Array(analyser.frequencyBinCount);
    let animationFrameId: number;

    const checkRemoteAudioLevel = () => {
      analyser.getByteFrequencyData(dataArray);
      const average = dataArray.reduce((a, b) => a + b) / dataArray.length;
      const normalizedLevel = (average / 255) * 100;
      
      if (normalizedLevel > 20) {
        console.log('[WebRTC] Remote audio being received:', normalizedLevel.toFixed(2));
      }
      
      animationFrameId = requestAnimationFrame(checkRemoteAudioLevel);
    };

    animationFrameId = requestAnimationFrame(checkRemoteAudioLevel);

    return () => {
      cancelAnimationFrame(animationFrameId);
      source.disconnect();
      audioContext.close();
    };
  }, [remoteStreamRef.current]);

  const handleRemoteStream = useCallback((event: RTCTrackEvent) => {
    if (event.streams && event.streams[0]) {
      console.log('[WebRTC] Remote stream received:', event.streams[0].id);
      remoteStreamRef.current = event.streams[0];
      
      // Log when remote audio is being received
      const remoteTracks = event.streams[0].getAudioTracks();
      console.log('[WebRTC] Remote audio tracks:', remoteTracks.length);
      remoteTracks.forEach(track => {
        console.log('[WebRTC] Setting up handlers for remote track:', track.id);
        track.onended = () => console.log('[WebRTC] Remote audio track ended:', track.id);
        track.onmute = () => console.log('[WebRTC] Remote audio track muted:', track.id);
        track.onunmute = () => console.log('[WebRTC] Remote audio track unmuted:', track.id);
        console.log('[WebRTC] Remote track enabled:', track.enabled);
        console.log('[WebRTC] Remote track muted:', track.muted);
      });
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
