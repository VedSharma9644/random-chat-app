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
    const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    return stream;
  } catch (error) {
    console.error('Error accessing microphone:', error);
    throw error;
  }
};

export const addLocalTracks = (peerConnection: RTCPeerConnection, stream: MediaStream) => {
  stream.getTracks().forEach(track => {
    peerConnection.addTrack(track, stream);
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