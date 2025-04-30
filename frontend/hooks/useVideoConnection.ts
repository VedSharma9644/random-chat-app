import { useRef, useState, useCallback } from 'react';
import { Socket } from 'socket.io-client';
import { getSocket, initializeSocket } from '@/utils/socket';
import { auth } from '@/utils/auth';

export const useVideoConnection = () => {
  const [isConnected, setIsConnected] = useState(false);
  const [isSearching, setIsSearching] = useState(false);
  const [error, setError] = useState<string | null>(null);
  
  const localStreamRef = useRef<MediaStream | null>(null);
  const remoteStreamRef = useRef<MediaStream | null>(null);
  const peerConnectionRef = useRef<RTCPeerConnection | null>(null);
  const socket = useRef<Socket | null>(null);
  const pendingCandidates = useRef<RTCIceCandidateInit[]>([]);

  const getMediaStream = useCallback(async (isTestMode = false) => {
    try {
      if (isTestMode) {
        const canvas = document.createElement('canvas');
        canvas.width = 1280;
        canvas.height = 720;
        const ctx = canvas.getContext('2d');
        if (ctx) {
          ctx.fillStyle = '#075e54';
          ctx.fillRect(0, 0, canvas.width, canvas.height);
          ctx.fillStyle = 'white';
          ctx.font = '48px Arial';
          ctx.textAlign = 'center';
          ctx.fillText('Test Video', canvas.width/2, canvas.height/2);
        }
        const stream = canvas.captureStream(30);
        return stream;
      }

      return await navigator.mediaDevices.getUserMedia({ 
        audio: true,
        video: {
          width: { ideal: 1280 },
          height: { ideal: 720 },
          facingMode: 'user'
        }
      }).catch(error => {
        console.error('Error accessing media devices:', error);
        setError('Could not access camera/microphone. Please check permissions.');
        throw error;
      });
    } catch (error) {
      console.error('Error accessing media devices:', error);
      if (error instanceof DOMException && error.name === 'NotReadableError') {
        console.log('Device in use, switching to test mode');
        return getMediaStream(true);
      }
      throw error;
    }
  }, []);

  const stopVideoChat = useCallback(() => {
    if (localStreamRef.current) {
      localStreamRef.current.getTracks().forEach(track => track.stop());
      localStreamRef.current = null;
    }
    if (remoteStreamRef.current) {
      remoteStreamRef.current.getTracks().forEach(track => track.stop());
      remoteStreamRef.current = null;
    }
    if (peerConnectionRef.current) {
      peerConnectionRef.current.close();
      peerConnectionRef.current = null;
    }
    setIsConnected(false);
    setIsSearching(false);
    setError(null);
  }, []);

  const startVideoChat = useCallback(async () => {
    try {
      setError(null);
      const stream = await getMediaStream();
      localStreamRef.current = stream;

      const peerConnection = new RTCPeerConnection({
        iceServers: [
          { urls: 'stun:stun.l.google.com:19302' },
          { urls: 'stun:stun1.l.google.com:19302' },
          { urls: 'stun:stun2.l.google.com:19302' },
          { urls: 'stun:stun3.l.google.com:19302' },
          { urls: 'stun:stun4.l.google.com:19302' }
        ]
      });

      peerConnectionRef.current = peerConnection;

      stream.getTracks().forEach(track => {
        peerConnection.addTrack(track, stream);
      });

      peerConnection.ontrack = (event) => {
        if (event.streams && event.streams[0]) {
          remoteStreamRef.current = event.streams[0];
        }
      };

      peerConnection.onicecandidate = (event) => {
        if (event.candidate && socket.current) {
          socket.current.emit('ice_candidate', event.candidate);
        }
      };

      peerConnection.onconnectionstatechange = () => {
        if (peerConnection.connectionState === 'connected') {
          setIsConnected(true);
        } else if (peerConnection.connectionState === 'disconnected' || 
                  peerConnection.connectionState === 'failed') {
          setIsConnected(false);
          stopVideoChat();
        }
      };

      peerConnection.oniceconnectionstatechange = () => {
        if (peerConnection.iceConnectionState === 'failed') {
          peerConnection.restartIce();
        }
      };

      const offer = await peerConnection.createOffer({
        offerToReceiveAudio: true,
        offerToReceiveVideo: true
      });
      await peerConnection.setLocalDescription(offer);
      if (socket.current) {
        socket.current.emit('offer', offer);
      }
    } catch (error) {
      console.error('Error starting video chat:', error);
      setError('Failed to start video chat');
      stopVideoChat();
    }
  }, [getMediaStream, stopVideoChat]);

  const startSearching = useCallback(() => {
    const socket = getSocket();
    setIsSearching(true);
    socket.emit('find_match');
  }, []);

  const initializeConnection = useCallback(async () => {
    try {
      const initializedSocket = await initializeSocket();
      socket.current = initializedSocket;
      
      auth.currentUser?.getIdToken().then(token => {
        if (socket.current) {
          socket.current.emit('authenticate', token);
        }
      });

      const peerConnection = new RTCPeerConnection({
        iceServers: [
          { urls: 'stun:stun.l.google.com:19302' },
          { urls: 'stun:stun1.l.google.com:19302' },
          { urls: 'stun:stun2.l.google.com:19302' },
          { urls: 'stun:stun3.l.google.com:19302' }
        ],
        iceCandidatePoolSize: 10
      });

      peerConnectionRef.current = peerConnection;

      if (socket.current) {
        socket.current.on('match_found', () => {
          setIsConnected(true);
          setIsSearching(false);
        });

        socket.current.on('offer', async (offer: RTCSessionDescriptionInit) => {
          try {
            const stream = await getMediaStream();
            localStreamRef.current = stream;
            
            stream.getTracks().forEach(track => {
              peerConnection.addTrack(track, stream);
            });

            await peerConnection.setRemoteDescription(new RTCSessionDescription(offer));
            
            while (pendingCandidates.current.length > 0) {
              const candidate = pendingCandidates.current.shift();
              if (candidate) {
                await peerConnection.addIceCandidate(candidate);
              }
            }

            const answer = await peerConnection.createAnswer({
              offerToReceiveAudio: true,
              offerToReceiveVideo: true
            });
            await peerConnection.setLocalDescription(answer);
            if (socket.current) {
              socket.current.emit('answer', answer);
            }
          } catch (error) {
            console.error('Error handling offer:', error);
          }
        });

        socket.current.on('answer', async (answer: RTCSessionDescriptionInit) => {
          try {
            await peerConnection.setRemoteDescription(new RTCSessionDescription(answer));
            while (pendingCandidates.current.length > 0) {
              const candidate = pendingCandidates.current.shift();
              if (candidate) {
                await peerConnection.addIceCandidate(candidate);
              }
            }
          } catch (error) {
            console.error('Error handling answer:', error);
          }
        });

        socket.current.on('ice_candidate', async (candidate: RTCIceCandidateInit) => {
          try {
            if (!peerConnection.remoteDescription) {
              pendingCandidates.current.push(candidate);
              return;
            }
            await peerConnection.addIceCandidate(new RTCIceCandidate(candidate));
          } catch (error) {
            console.error('Error adding ICE candidate:', error);
          }
        });

        socket.current.on('partner_disconnected', () => {
          setIsConnected(false);
          setIsSearching(false);
          stopVideoChat();
        });
      }
    } catch (error) {
      console.error('Error initializing connection:', error);
    }
  }, [getMediaStream, stopVideoChat]);

  return {
    isConnected,
    isSearching,
    error,
    localStreamRef,
    remoteStreamRef,
    startSearching,
    startVideoChat,
    stopVideoChat,
    initializeConnection
  };
}; 