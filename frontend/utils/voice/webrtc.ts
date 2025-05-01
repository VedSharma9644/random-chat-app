// WebRTC types are available globally in the DOM lib
// No need to import them explicitly

export const createPeerConnection = () => {
  return new RTCPeerConnection({
    iceServers: [
      { urls: 'stun:stun.l.google.com:19302' },
      { urls: 'stun:stun1.l.google.com:19302' },
      { urls: 'stun:stun2.l.google.com:19302' },
      { urls: 'stun:stun3.l.google.com:19302' },
      { urls: 'stun:stun4.l.google.com:19302' }
    ]
  });
};

export const createAudioContext = () => {
  return new AudioContext();
};

export const createAnalyser = (audioContext: AudioContext) => {
  const analyser = audioContext.createAnalyser();
  analyser.fftSize = 256;
  return analyser;
};

export const setupLocalStream = async () => {
  try {
    console.log('[WebRTC] Requesting user media with audio');
    const stream = await navigator.mediaDevices.getUserMedia({
      audio: {
        echoCancellation: true,
        noiseSuppression: true,
        autoGainControl: true
      }
    });
    
    // Ensure tracks are enabled
    stream.getAudioTracks().forEach(track => {
      track.enabled = true;
      console.log('[WebRTC] Audio track created:', {
        id: track.id,
        enabled: track.enabled,
        muted: track.muted,
        readyState: track.readyState
      });
    });
    
    return stream;
  } catch (error) {
    console.error('[WebRTC] Error accessing microphone:', error);
    throw error;
  }
};

export const addLocalTracks = (peerConnection: RTCPeerConnection, stream: MediaStream) => {
  console.log('[WebRTC] Adding local tracks to peer connection');
  const audioTracks = stream.getAudioTracks();
  
  audioTracks.forEach(track => {
    // Ensure track is enabled before adding
    track.enabled = true;
    
    console.log('[WebRTC] Adding track to peer connection:', {
      id: track.id,
      kind: track.kind,
      enabled: track.enabled,
      muted: track.muted
    });
    
    const sender = peerConnection.addTrack(track, stream);
    console.log('[WebRTC] Track added with sender:', sender.track?.id);
  });
  
  // Log all senders after adding tracks
  const senders = peerConnection.getSenders();
  console.log('[WebRTC] Total senders after adding tracks:', senders.length);
  senders.forEach(sender => {
    if (sender.track) {
      console.log('[WebRTC] Sender track details:', {
        id: sender.track.id,
        kind: sender.track.kind,
        enabled: sender.track.enabled,
        muted: sender.track.muted
      });
    }
  });
};

export const createOffer = async (peerConnection: RTCPeerConnection) => {
  const offer = await peerConnection.createOffer({
    offerToReceiveAudio: true
  });
  await peerConnection.setLocalDescription(offer);
  return offer;
};

export const createAnswer = async (peerConnection: RTCPeerConnection) => {
  const answer = await peerConnection.createAnswer({
    offerToReceiveAudio: true
  });
  await peerConnection.setLocalDescription(answer);
  return answer;
};

export const setRemoteDescription = async (
  peerConnection: RTCPeerConnection,
  description: RTCSessionDescriptionInit
) => {
  await peerConnection.setRemoteDescription(new RTCSessionDescription(description));
};

export const addIceCandidate = async (
  peerConnection: RTCPeerConnection,
  candidate: RTCIceCandidateInit
) => {
  await peerConnection.addIceCandidate(new RTCIceCandidate(candidate));
}; 