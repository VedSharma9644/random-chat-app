import { useState, useRef, useCallback, useEffect } from 'react';
import {
  createPeerConnection,
  createAudioContext,
  createAnalyser,
  setupLocalStream,
  addLocalTracks,
  createOffer,
  createAnswer,
  setRemoteDescription,
  addIceCandidate
} from '@/utils/voice/webrtc';
import { getSocket } from '@/utils/socket';

export const useVoiceTransfer = () => {
  const [isSpeaking, setIsSpeaking] = useState(false);
  const [error, setError] = useState<string | null>(null);
  
  const localStreamRef = useRef<MediaStream | null>(null);
  const remoteStreamRef = useRef<MediaStream | null>(null);
  const peerConnectionRef = useRef<RTCPeerConnection | null>(null);
  const audioContextRef = useRef<AudioContext | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const animationFrameRef = useRef<number | null>(null);
  const pendingIceCandidatesRef = useRef<RTCIceCandidateInit[]>([]);

  const processPendingIceCandidates = useCallback(async () => {
    if (!peerConnectionRef.current || !peerConnectionRef.current.remoteDescription) {
      return;
    }

    console.log('[WebRTC] Processing pending ICE candidates:', pendingIceCandidatesRef.current.length);
    for (const candidate of pendingIceCandidatesRef.current) {
      try {
        await addIceCandidate(peerConnectionRef.current, candidate);
        console.log('[WebRTC] Added pending ICE candidate:', candidate);
      } catch (error) {
        console.error('[WebRTC] Error adding pending ICE candidate:', error);
      }
    }
    pendingIceCandidatesRef.current = [];
  }, []);

  const checkVoiceActivity = useCallback(() => {
    if (!analyserRef.current) {
      console.log('[WebRTC] No analyzer available for voice activity detection');
      return;
    }

    const analyser = analyserRef.current;
    const dataArray = new Uint8Array(analyser.frequencyBinCount);
    
    const check = () => {
      if (!analyserRef.current) return;
      
      analyser.getByteFrequencyData(dataArray);
      const average = dataArray.reduce((a, b) => a + b) / dataArray.length;
      const normalizedLevel = (average / 255) * 100;
      
      if (normalizedLevel > 20) {
        console.log('[WebRTC] Local audio level:', normalizedLevel.toFixed(2));
        setIsSpeaking(true);
      } else {
        setIsSpeaking(false);
      }
      
      animationFrameRef.current = requestAnimationFrame(check);
    };
    
    console.log('[WebRTC] Starting voice activity detection');
    check();
  }, []);

  // Add cleanup for voice activity detection
  useEffect(() => {
    return () => {
      if (animationFrameRef.current) {
        console.log('[WebRTC] Cleaning up voice activity detection');
        cancelAnimationFrame(animationFrameRef.current);
      }
    };
  }, []);

  useEffect(() => {
    if (!localStreamRef.current) {
      console.log('[WebRTC] No local stream available for audio monitoring');
      return;
    }

    console.log('[WebRTC] Setting up audio monitoring');
    const audioContext = new AudioContext();
    const analyser = audioContext.createAnalyser();
    analyser.fftSize = 2048;
    const source = audioContext.createMediaStreamSource(localStreamRef.current);
    source.connect(analyser);
    analyserRef.current = analyser;
    audioContextRef.current = audioContext;

    console.log('[WebRTC] Audio context state:', audioContext.state);
    console.log('[WebRTC] Analyzer FFT size:', analyser.fftSize);

    checkVoiceActivity();

    return () => {
      console.log('[WebRTC] Cleaning up audio monitoring');
      source.disconnect();
      audioContext.close();
      if (animationFrameRef.current) {
        cancelAnimationFrame(animationFrameRef.current);
      }
    };
  }, [localStreamRef.current, checkVoiceActivity]);

  const startVoiceChat = useCallback(async () => {
    try {
      setError(null);
      console.log('[WebRTC] ===== Starting voice chat process =====');
      
      // Get local audio stream
      console.log('[WebRTC] Step 1: Requesting local audio stream...');
      const stream = await setupLocalStream();
      localStreamRef.current = stream;
      console.log('[WebRTC] Local stream obtained:', stream.getAudioTracks().length, 'audio tracks');

      // Initially enable all audio tracks since we're starting the chat
      const audioTracks = stream.getAudioTracks();
      audioTracks.forEach(track => {
        track.enabled = true; // Enable the track since we're starting voice chat
        console.log('[WebRTC] Initial track state:', {
          id: track.id,
          enabled: track.enabled,
          muted: track.muted
        });
      });

      // Log when local audio is being sent
      console.log('[WebRTC] Step 2: Setting up local audio track handlers...');
      audioTracks.forEach(track => {
        console.log('[WebRTC] Setting up handlers for track:', track.id);
        track.onended = () => console.log('[WebRTC] Local audio track ended:', track.id);
        track.onmute = () => console.log('[WebRTC] Local audio track muted:', track.id);
        track.onunmute = () => console.log('[WebRTC] Local audio track unmuted:', track.id);
        console.log('[WebRTC] Track enabled:', track.enabled);
        console.log('[WebRTC] Track muted:', track.muted);
      });

      // Create audio context and analyzer
      console.log('[WebRTC] Step 3: Setting up audio context and analyzer...');
      const audioContext = createAudioContext();
      audioContextRef.current = audioContext;
      console.log('[WebRTC] Audio context created with state:', audioContext.state);
      
      const analyser = createAnalyser(audioContext);
      analyserRef.current = analyser;
      console.log('[WebRTC] Analyser created with fftSize:', analyser.fftSize);
      
      const source = audioContext.createMediaStreamSource(stream);
      source.connect(analyser);
      console.log('[WebRTC] Source connected to analyser');
      
      // Start monitoring audio levels
      checkVoiceActivity();

      // Create peer connection
      console.log('[WebRTC] Step 4: Creating peer connection...');
      const peerConnection = createPeerConnection();
      peerConnectionRef.current = peerConnection;
      console.log('[WebRTC] Peer connection created with initial state:', {
        connectionState: peerConnection.connectionState,
        iceConnectionState: peerConnection.iceConnectionState,
        signalingState: peerConnection.signalingState
      });

      // Add local tracks
      console.log('[WebRTC] Step 5: Adding local tracks to peer connection...');
      addLocalTracks(peerConnection, stream);
      console.log('[WebRTC] Local tracks added to peer connection');

      // Handle incoming audio tracks
      peerConnection.ontrack = (event) => {
        console.log('[WebRTC] ===== ontrack event received =====');
        console.log('[WebRTC] Event details:', {
          streams: event.streams?.length,
          track: event.track?.kind,
          trackId: event.track?.id
        });
        
        if (event.streams && event.streams[0]) {
          console.log('[WebRTC] Remote stream received:', event.streams[0].id);
          remoteStreamRef.current = event.streams[0];
          
          // Create a single audio context for the remote stream
          console.log('[WebRTC] Setting up remote audio context...');
          const audioContext = new AudioContext();
          const analyser = audioContext.createAnalyser();
          analyser.fftSize = 2048;
          const source = audioContext.createMediaStreamSource(event.streams[0]);
          
          // Connect to both analyser and destination for playback
          source.connect(analyser);
          source.connect(audioContext.destination);
          console.log('[WebRTC] Remote audio connected to destination with context state:', audioContext.state);

          const dataArray = new Uint8Array(analyser.frequencyBinCount);
          let animationFrameId: number;

          const checkAudioLevel = () => {
            analyser.getByteFrequencyData(dataArray);
            const average = dataArray.reduce((a, b) => a + b) / dataArray.length;
            const normalizedLevel = (average / 255) * 100;
            
            if (normalizedLevel > 20) {
              console.log('[WebRTC] Remote audio level:', normalizedLevel.toFixed(2));
            }
            
            animationFrameId = requestAnimationFrame(checkAudioLevel);
          };

          animationFrameId = requestAnimationFrame(checkAudioLevel);

          // Log when remote audio is being received
          const remoteTracks = event.streams[0].getAudioTracks();
          console.log('[WebRTC] Remote audio tracks:', remoteTracks.length);
          remoteTracks.forEach(track => {
            console.log('[WebRTC] Setting up handlers for remote track:', track.id);
            track.onended = () => console.log('[WebRTC] Remote audio track ended:', track.id);
            track.onmute = () => console.log('[WebRTC] Remote audio track muted:', track.id);
            track.onunmute = () => {
              console.log('[WebRTC] Remote audio track unmuted:', track.id);
              // Resume audio context when track is unmuted
              if (audioContext.state === 'suspended') {
                audioContext.resume();
                console.log('[WebRTC] Audio context resumed');
              }
            };
            console.log('[WebRTC] Remote track enabled:', track.enabled);
            console.log('[WebRTC] Remote track muted:', track.muted);
          });
        }
      };

      // Handle ICE candidates
      peerConnection.onicecandidate = (event) => {
        if (event.candidate) {
          console.log('[WebRTC] ===== New ICE candidate =====');
          console.log('[WebRTC] Candidate details:', {
            type: event.candidate.type,
            protocol: event.candidate.protocol,
            address: event.candidate.address,
            port: event.candidate.port
          });
          const socket = getSocket();
          if (socket) {
            socket.emit('ice_candidate', event.candidate);
          }
        } else {
          console.log('[WebRTC] ICE gathering completed');
        }
      };

      // Handle connection state changes
      peerConnection.onconnectionstatechange = () => {
        console.log('[WebRTC] ===== Connection state changed =====');
        console.log('[WebRTC] New connection state:', peerConnection.connectionState);
        console.log('[WebRTC] Current ICE state:', peerConnection.iceConnectionState);
        console.log('[WebRTC] Current signaling state:', peerConnection.signalingState);
      };

      // Handle ICE connection state changes
      peerConnection.oniceconnectionstatechange = () => {
        console.log('[WebRTC] ===== ICE connection state changed =====');
        console.log('[WebRTC] New ICE state:', peerConnection.iceConnectionState);
        console.log('[WebRTC] Current connection state:', peerConnection.connectionState);
      };

      // Handle signaling state changes
      peerConnection.onsignalingstatechange = () => {
        console.log('[WebRTC] ===== Signaling state changed =====');
        console.log('[WebRTC] New signaling state:', peerConnection.signalingState);
        console.log('[WebRTC] Current connection state:', peerConnection.connectionState);
      };

      // Create and send offer
      console.log('[WebRTC] Step 6: Creating and sending offer...');
      const offer = await createOffer(peerConnection);
      console.log('[WebRTC] Offer created with type:', offer.type);
      
      // Send the offer through the socket
      const socket = getSocket();
      if (socket) {
        socket.emit('offer', offer);
        console.log('[WebRTC] Offer sent through socket');
      } else {
        console.error('[WebRTC] Socket not available to send offer');
      }
      
      // After setting up the peer connection, process any pending ICE candidates
      await processPendingIceCandidates();

      console.log('[WebRTC] ===== Voice chat setup completed =====');
      return offer;
    } catch (error) {
      console.error('[WebRTC] ===== Error in voice chat setup =====');
      console.error('[WebRTC] Error details:', error);
      setError('Failed to start voice chat');
      stopVoiceChat();
      throw error;
    }
  }, [checkVoiceActivity, processPendingIceCandidates]);

  const stopVoiceChat = useCallback(() => {
    if (localStreamRef.current) {
      localStreamRef.current.getTracks().forEach(track => track.stop());
      localStreamRef.current = null;
    }
    if (audioContextRef.current) {
      audioContextRef.current.close().catch(err => console.error("Error closing audio context:", err));
      audioContextRef.current = null;
    }
    if (peerConnectionRef.current) {
      peerConnectionRef.current.close();
      peerConnectionRef.current = null;
    }
    if (animationFrameRef.current) {
      cancelAnimationFrame(animationFrameRef.current);
      animationFrameRef.current = null;
    }
    setIsSpeaking(false);
    setError(null);
  }, []);

  const handleOffer = useCallback(async (offer: RTCSessionDescriptionInit) => {
    if (!peerConnectionRef.current) return;
    
    try {
      await setRemoteDescription(peerConnectionRef.current, offer);
      const answer = await createAnswer(peerConnectionRef.current);
      return answer;
    } catch (error) {
      console.error('Error handling offer:', error);
      setError('Error handling connection offer');
      throw error;
    }
  }, []);

  const setupPeerConnectionHandlers = useCallback((peerConnection: RTCPeerConnection) => {
    // Handle incoming audio tracks
    peerConnection.ontrack = (event) => {
      console.log('[WebRTC] ===== ontrack event received =====');
      console.log('[WebRTC] Event details:', {
        streams: event.streams?.length,
        track: event.track?.kind,
        trackId: event.track?.id
      });
      
      if (event.streams && event.streams[0]) {
        console.log('[WebRTC] Remote stream received:', event.streams[0].id);
        remoteStreamRef.current = event.streams[0];
        
        // Create a single audio context for the remote stream
        console.log('[WebRTC] Setting up remote audio context...');
        const audioContext = new AudioContext();
        const analyser = audioContext.createAnalyser();
        analyser.fftSize = 2048;
        const source = audioContext.createMediaStreamSource(event.streams[0]);
        
        // Connect to both analyser and destination for playback
        source.connect(analyser);
        source.connect(audioContext.destination);
        console.log('[WebRTC] Remote audio connected to destination with context state:', audioContext.state);

        const dataArray = new Uint8Array(analyser.frequencyBinCount);
        let animationFrameId: number;

        const checkAudioLevel = () => {
          analyser.getByteFrequencyData(dataArray);
          const average = dataArray.reduce((a, b) => a + b) / dataArray.length;
          const normalizedLevel = (average / 255) * 100;
          
          if (normalizedLevel > 20) {
            console.log('[WebRTC] Remote audio level:', normalizedLevel.toFixed(2));
          }
          
          animationFrameId = requestAnimationFrame(checkAudioLevel);
        };

        animationFrameId = requestAnimationFrame(checkAudioLevel);

        // Log when remote audio is being received
        const remoteTracks = event.streams[0].getAudioTracks();
        console.log('[WebRTC] Remote audio tracks:', remoteTracks.length);
        remoteTracks.forEach(track => {
          console.log('[WebRTC] Setting up handlers for remote track:', track.id);
          track.onended = () => console.log('[WebRTC] Remote audio track ended:', track.id);
          track.onmute = () => console.log('[WebRTC] Remote audio track muted:', track.id);
          track.onunmute = () => {
            console.log('[WebRTC] Remote audio track unmuted:', track.id);
            // Resume audio context when track is unmuted
            if (audioContext.state === 'suspended') {
              audioContext.resume();
              console.log('[WebRTC] Audio context resumed');
            }
          };
          console.log('[WebRTC] Remote track enabled:', track.enabled);
          console.log('[WebRTC] Remote track muted:', track.muted);
        });
      }
    };

    // Handle ICE candidates
    peerConnection.onicecandidate = (event) => {
      if (event.candidate) {
        console.log('[WebRTC] ===== New ICE candidate =====');
        console.log('[WebRTC] Candidate details:', {
          type: event.candidate.type,
          protocol: event.candidate.protocol,
          address: event.candidate.address,
          port: event.candidate.port
        });
        const socket = getSocket();
        if (socket) {
          socket.emit('ice_candidate', event.candidate);
        }
      } else {
        console.log('[WebRTC] ICE gathering completed');
      }
    };

    // Handle connection state changes
    peerConnection.onconnectionstatechange = () => {
      console.log('[WebRTC] ===== Connection state changed =====');
      console.log('[WebRTC] New connection state:', peerConnection.connectionState);
      console.log('[WebRTC] Current ICE state:', peerConnection.iceConnectionState);
      console.log('[WebRTC] Current signaling state:', peerConnection.signalingState);
    };

    // Handle ICE connection state changes
    peerConnection.oniceconnectionstatechange = () => {
      console.log('[WebRTC] ===== ICE connection state changed =====');
      console.log('[WebRTC] New ICE state:', peerConnection.iceConnectionState);
      console.log('[WebRTC] Current connection state:', peerConnection.connectionState);
    };

    // Handle signaling state changes
    peerConnection.onsignalingstatechange = () => {
      console.log('[WebRTC] ===== Signaling state changed =====');
      console.log('[WebRTC] New signaling state:', peerConnection.signalingState);
      console.log('[WebRTC] Current connection state:', peerConnection.connectionState);
    };
  }, []);

  const handleAnswer = useCallback(async (answer: RTCSessionDescriptionInit) => {
    if (!peerConnectionRef.current) {
      console.error('[WebRTC] No peer connection available to handle answer');
      return;
    }
    
    try {
      console.log('[WebRTC] ===== Handling answer =====');
      console.log('[WebRTC] Answer details:', {
        type: answer.type,
        sdpLength: answer.sdp?.length,
        currentState: {
          connectionState: peerConnectionRef.current.connectionState,
          iceConnectionState: peerConnectionRef.current.iceConnectionState,
          signalingState: peerConnectionRef.current.signalingState
        }
      });

      // Check if answer is valid
      if (!answer.type || !answer.sdp) {
        throw new Error('Invalid answer: missing type or sdp');
      }

      const currentState = peerConnectionRef.current.signalingState;
      console.log('[WebRTC] Current signaling state:', currentState);

      // If we're in have-remote-offer, we need to create and send our own answer
      if (currentState === 'have-remote-offer') {
        console.log('[WebRTC] We are in answering state, creating our own answer');
        const localAnswer = await createAnswer(peerConnectionRef.current);
        const socket = getSocket();
        if (socket) {
          socket.emit('answer', localAnswer);
        }
        return;
      }

      // If we're in stable state, we might have already processed this answer
      if (currentState === 'stable') {
        console.log('[WebRTC] Connection already stable, processing pending ICE candidates');
        await processPendingIceCandidates();
        return;
      }

      // We should be in have-local-offer state to accept an answer
      if (currentState === 'have-local-offer') {
        console.log('[WebRTC] Setting remote description from answer');
        await peerConnectionRef.current.setRemoteDescription(new RTCSessionDescription(answer));
        console.log('[WebRTC] Remote description set successfully');
        
        // Process any pending ICE candidates
        await processPendingIceCandidates();
        
        console.log('[WebRTC] Connection state after setting remote description:', {
          connectionState: peerConnectionRef.current.connectionState,
          iceConnectionState: peerConnectionRef.current.iceConnectionState,
          signalingState: peerConnectionRef.current.signalingState
        });

        // Check for remote tracks
        const receivers = peerConnectionRef.current.getReceivers();
        console.log('[WebRTC] Number of receivers:', receivers.length);
        receivers.forEach(receiver => {
          if (receiver.track) {
            console.log('[WebRTC] Receiver track:', {
              kind: receiver.track.kind,
              enabled: receiver.track.enabled,
              muted: receiver.track.muted,
              readyState: receiver.track.readyState
            });
          }
        });
      } else {
        console.log('[WebRTC] Unexpected signaling state:', currentState);
        // Instead of throwing an error, let's try to recover
        if (peerConnectionRef.current.remoteDescription === null) {
          console.log('[WebRTC] No remote description set, attempting to set it');
          await peerConnectionRef.current.setRemoteDescription(new RTCSessionDescription(answer));
          await processPendingIceCandidates();
        }
      }
    } catch (error) {
      console.error('[WebRTC] ===== Error handling answer =====');
      console.error('[WebRTC] Error details:', error);
      console.error('[WebRTC] Connection state:', peerConnectionRef.current.connectionState);
      console.error('[WebRTC] ICE state:', peerConnectionRef.current.iceConnectionState);
      console.error('[WebRTC] Signaling state:', peerConnectionRef.current.signalingState);
      
      // If we get an invalid state error, try to recover by resetting
      if (error instanceof Error && error.name === 'InvalidStateError') {
        console.log('[WebRTC] Got invalid state, attempting to reset connection...');
        
        // Create new connection
        const newConnection = createPeerConnection();
        
        // Copy over any existing tracks
        if (localStreamRef.current) {
          localStreamRef.current.getTracks().forEach(track => {
            if (localStreamRef.current) {
              newConnection.addTrack(track, localStreamRef.current);
            }
          });
        }
        
        // Set up handlers
        setupPeerConnectionHandlers(newConnection);
        
        // Replace the old connection
        if (peerConnectionRef.current) {
          peerConnectionRef.current.close();
        }
        peerConnectionRef.current = newConnection;
        
        // Create a new offer
        const offer = await createOffer(newConnection);
        const socket = getSocket();
        if (socket) {
          socket.emit('offer', offer);
        }
        
        console.log('[WebRTC] Connection reset and new offer sent');
      } else {
        setError('Error handling connection answer');
        throw error;
      }
    }
  }, [processPendingIceCandidates, setupPeerConnectionHandlers]);

  const handleIceCandidate = useCallback(async (candidate: RTCIceCandidateInit) => {
    if (!peerConnectionRef.current) {
      console.log('[WebRTC] Storing ICE candidate for later:', candidate);
      pendingIceCandidatesRef.current.push(candidate);
      return;
    }
    
    try {
      console.log('[WebRTC] ===== Handling ICE candidate =====');
      console.log('[WebRTC] Candidate details:', {
        candidate: candidate.candidate,
        sdpMid: candidate.sdpMid,
        sdpMLineIndex: candidate.sdpMLineIndex
      });
      
      // Check if we have a remote description before adding ICE candidates
      if (!peerConnectionRef.current.remoteDescription) {
        console.log('[WebRTC] No remote description yet, storing ICE candidate for later');
        pendingIceCandidatesRef.current.push(candidate);
        return;
      }
      
      await addIceCandidate(peerConnectionRef.current, candidate);
      console.log('[WebRTC] ICE candidate added successfully');
      
      // Check connection state after adding ICE candidate
      console.log('[WebRTC] Connection state after adding ICE candidate:', {
        connectionState: peerConnectionRef.current.connectionState,
        iceConnectionState: peerConnectionRef.current.iceConnectionState,
        signalingState: peerConnectionRef.current.signalingState
      });
    } catch (error) {
      console.error('[WebRTC] ===== Error handling ICE candidate =====');
      console.error('[WebRTC] Error details:', error);
      throw error;
    }
  }, []);

  return {
    isSpeaking,
    error,
    localStreamRef,
    remoteStreamRef,
    peerConnectionRef,
    startVoiceChat,
    stopVoiceChat,
    handleOffer,
    handleAnswer,
    handleIceCandidate
  };
}; 