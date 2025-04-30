import { useRef, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useVideoConnection } from '@/hooks/useVideoConnection';
import VideoControls from './VideoControls';

export default function VideoUI() {
  const router = useRouter();
  const localVideoRef = useRef<HTMLVideoElement | null>(null);
  const remoteVideoRef = useRef<HTMLVideoElement | null>(null);
  const [isMuted, setIsMuted] = useState(true);
  const [isVideoOff, setIsVideoOff] = useState(false);

  const {
    isConnected,
    isSearching,
    error,
    localStreamRef,
    remoteStreamRef,
    startSearching,
    stopVideoChat,
    initializeConnection
  } = useVideoConnection();

  useEffect(() => {
    initializeConnection();
  }, [initializeConnection]);

  useEffect(() => {
    if (localVideoRef.current && localStreamRef.current) {
      localVideoRef.current.srcObject = localStreamRef.current;
    }
  }, [localStreamRef]);

  useEffect(() => {
    if (remoteVideoRef.current && remoteStreamRef.current) {
      remoteVideoRef.current.srcObject = remoteStreamRef.current;
    }
  }, [remoteStreamRef]);

  const toggleMute = () => {
    if (localStreamRef.current) {
      const audioTracks = localStreamRef.current.getAudioTracks();
      audioTracks.forEach(track => {
        track.enabled = !track.enabled;
      });
      setIsMuted(!isMuted);
    }
  };

  const toggleVideo = () => {
    if (localStreamRef.current) {
      const videoTracks = localStreamRef.current.getVideoTracks();
      videoTracks.forEach(track => {
        track.enabled = !track.enabled;
      });
      setIsVideoOff(!isVideoOff);
    }
  };

  return (
    <div className="h-screen flex flex-col bg-[#efeae2] overflow-hidden">
      {/* Header */}
      <div className="bg-[#075e54] px-4 py-3 flex justify-between items-center shadow-md">
        <div className="flex items-center space-x-3">
          <div className="relative">
            <div className="w-10 h-10 bg-gray-300 rounded-full overflow-hidden flex items-center justify-center">
              <svg className="w-6 h-6 text-gray-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 10l4.553-2.276A1 1 0 0121 8.618v6.764a1 1 0 01-1.447.894L15 14M5 18h8a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v8a2 2 0 002 2z" />
              </svg>
            </div>
            <span className={`absolute bottom-0 right-0 w-3 h-3 rounded-full ${
              isConnected ? 'bg-green-500' : 'bg-gray-400'
            } border-2 border-white`}></span>
          </div>
          <div>
            <h1 className="text-white font-semibold">Video Chat</h1>
            <span className="text-xs text-[#8eb2ae]">
              {isConnected ? 'Connected' : isSearching ? 'Searching...' : 'Disconnected'}
            </span>
          </div>
        </div>

        <button
          onClick={() => router.push('/chat')}
          className="text-white hover:bg-[#0c766b] p-2 rounded-full transition-colors"
        >
          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 8h10M7 12h4m1 8l-4-4H5a2 2 0 01-2-2V6a2 2 0 012-2h14a2 2 0 012 2v8a2 2 0 01-2 2h-3l-4 4z" />
          </svg>
        </button>
      </div>

      {/* Error Display */}
      {error && (
        <div className="bg-red-100 border border-red-400 text-red-700 px-4 py-3 rounded relative" role="alert">
          <span className="block sm:inline">{error}</span>
          <button
            onClick={() => {}}
            className="absolute top-0 bottom-0 right-0 px-4 py-3"
          >
            <span className="sr-only">Dismiss</span>
            <svg className="h-6 w-6 text-red-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>
      )}

      {/* Main Content */}
      <div className="flex-1 relative">
        {!isConnected && !isSearching && (
          <div className="absolute inset-0 flex items-center justify-center">
            <div className="text-center space-y-4">
              <h2 className="text-2xl font-semibold text-gray-800">Start Video Chat</h2>
              <p className="text-gray-600">Click the button below to find a random partner for video chat</p>
              <button
                onClick={startSearching}
                className="bg-[#075e54] text-white px-6 py-3 rounded-full hover:bg-[#0c766b] transition-colors shadow-lg"
              >
                Find Partner
              </button>
            </div>
          </div>
        )}

        {isSearching && (
          <div className="absolute inset-0 flex items-center justify-center">
            <div className="text-center space-y-4">
              <div className="animate-spin rounded-full h-12 w-12 border-4 border-[#075e54] border-t-transparent mx-auto"></div>
              <p className="text-gray-600">Finding your chat partner...</p>
            </div>
          </div>
        )}

        {isConnected && (
          <>
            {/* Remote Video */}
            <div className="absolute inset-0 bg-black">
              <video
                ref={remoteVideoRef}
                autoPlay
                playsInline
                className="w-full h-full object-cover"
              />
            </div>

            {/* Local Video */}
            <div className="absolute bottom-4 right-4 w-48 h-36 bg-black rounded-lg overflow-hidden shadow-lg">
              <video
                ref={localVideoRef}
                autoPlay
                playsInline
                muted
                className="w-full h-full object-cover"
              />
            </div>

            {/* Controls */}
            <VideoControls
              isConnected={isConnected}
              isMuted={isMuted}
              isVideoOff={isVideoOff}
              onToggleMute={toggleMute}
              onToggleVideo={toggleVideo}
              onEndCall={stopVideoChat}
            />
          </>
        )}
      </div>
    </div>
  );
} 