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

export const useVoiceTransfer = () => {
  const [isSpeaking, setIsSpeaking] = useState(false);
  const [error, setError] = useState<string | null>(null);
  
  const localStreamRef = useRef<MediaStream | null>(null);
  const remoteStreamRef = useRef<MediaStream | null>(null);
  const peerConnectionRef = useRef<RTCPeerConnection | null>(null);
  const audioContextRef = useRef<AudioContext | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const animationFrameRef = useRef<number | null>(null);

  const checkVoiceActivity = useCallback(() => {
    if (!analyserRef.current) return;

    const analyser = analyserRef.current;
    const dataArray = new Uint8Array(analyser.frequencyBinCount);
    
    const check = () => {
      if (!analyserRef.current) return;
      analyser.getByteFrequencyData(dataArray);
      const average = dataArray.reduce((a, b) => a + b) / dataArray.length;
      setIsSpeaking(average > 20);
      animationFrameRef.current = requestAnimationFrame(check);
    };
    
    check();
  }, []);

  useEffect(() => {
    return () => {
      if (animationFrameRef.current) {
        cancelAnimationFrame(animationFrameRef.current);
      }
    };
  }, []);

  const startVoiceChat = useCallback(async () => {
    try {
      setError(null);
      
      // Get local audio stream
      const stream = await setupLocalStream();
      localStreamRef.current = stream;

      // Create audio context and analyzer
      const audioContext = createAudioContext();
      audioContextRef.current = audioContext;
      
      const analyser = createAnalyser(audioContext);
      analyserRef.current = analyser;
      
      const source = audioContext.createMediaStreamSource(stream);
      source.connect(analyser);
      
      checkVoiceActivity();

      // Create peer connection
      const peerConnection = createPeerConnection();
      peerConnectionRef.current = peerConnection;

      // Add local tracks
      addLocalTracks(peerConnection, stream);

      // Handle incoming audio tracks
      peerConnection.ontrack = (event) => {
        if (event.streams && event.streams[0]) {
          remoteStreamRef.current = event.streams[0];
        }
      };

      // Handle ICE candidates
      peerConnection.onicecandidate = (event) => {
        if (event.candidate) {
          // This will be handled by the socket connection
          console.log('New ICE candidate:', event.candidate);
        }
      };

      // Handle connection state changes
      peerConnection.onconnectionstatechange = () => {
        console.log('Connection state:', peerConnection.connectionState);
      };

      // Create and send offer
      const offer = await createOffer(peerConnection);
      return offer;
    } catch (error) {
      console.error('Error starting voice chat:', error);
      setError('Failed to start voice chat');
      stopVoiceChat();
      throw error;
    }
  }, [checkVoiceActivity]);

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

  const handleAnswer = useCallback(async (answer: RTCSessionDescriptionInit) => {
    if (!peerConnectionRef.current) return;
    
    try {
      await setRemoteDescription(peerConnectionRef.current, answer);
    } catch (error) {
      console.error('Error handling answer:', error);
      setError('Error handling connection answer');
      throw error;
    }
  }, []);

  const handleIceCandidate = useCallback(async (candidate: RTCIceCandidateInit) => {
    if (!peerConnectionRef.current) return;
    
    try {
      await addIceCandidate(peerConnectionRef.current, candidate);
    } catch (error) {
      console.error('Error adding ICE candidate:', error);
      throw error;
    }
  }, []);

  return {
    isSpeaking,
    error,
    localStreamRef,
    remoteStreamRef,
    startVoiceChat,
    stopVoiceChat,
    handleOffer,
    handleAnswer,
    handleIceCandidate
  };
}; 