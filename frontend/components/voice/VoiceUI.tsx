import { useRef, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useVoiceConnection } from '@/hooks/useVoiceConnection';
import VoiceControls from './VoiceControls';

export default function VoiceUI() {
  const router = useRouter();
  const [isMuted, setIsMuted] = useState(true);
  const [volume, setVolume] = useState(1);
  const audioRef = useRef<HTMLAudioElement | null>(null);

  const {
    isConnected,
    isSearching,
    isSpeaking,
    error,
    startSearching,
    startVoiceChat,
    stopVoiceChat,
    remoteStreamRef
  } = useVoiceConnection();

  useEffect(() => {
    if (audioRef.current && remoteStreamRef.current) {
      audioRef.current.srcObject = remoteStreamRef.current;
      // Ensure audio plays
      audioRef.current.play().catch(error => {
        console.error('[WebRTC] Error playing audio:', error);
      });
    }
  }, [remoteStreamRef]);

  useEffect(() => {
    if (audioRef.current) {
      audioRef.current.volume = volume;
    }
  }, [volume]);

  const toggleMute = async () => {
    if (isMuted) {
      try {
        await startVoiceChat();
        setIsMuted(false);
      } catch (error) {
        console.error('Error starting voice chat:', error);
      }
    } else {
      stopVoiceChat();
      setIsMuted(true);
    }
  };

  const handleVolumeChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const newVolume = parseFloat(e.target.value);
    setVolume(newVolume);
  };

  return (
    <div className="h-screen flex flex-col bg-[#efeae2] overflow-hidden">
      {/* Header */}
      <div className="bg-[#075e54] px-4 py-3 flex justify-between items-center shadow-md">
        <div className="flex items-center space-x-3">
          <div className="relative">
            <div className="w-10 h-10 bg-gray-300 rounded-full overflow-hidden flex items-center justify-center">
              <svg className="w-6 h-6 text-gray-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 11a7 7 0 01-7 7m0 0a7 7 0 01-7-7m7 7v4m0 0H8m4 0h4m-4-8a3 3 0 01-3-3V5a3 3 0 116 0v6a3 3 0 01-3 3z" />
              </svg>
            </div>
            <span className={`absolute bottom-0 right-0 w-3 h-3 rounded-full ${
              isConnected ? 'bg-green-500' : 'bg-gray-400'
            } border-2 border-white`}></span>
          </div>
          <div>
            <h1 className="text-white font-semibold">Voice Chat</h1>
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
          <button onClick={() => {}} className="absolute top-0 bottom-0 right-0 px-4 py-3">
            <span className="sr-only">Dismiss</span>
            <svg className="h-6 w-6 text-red-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>
      )}

      {/* Main Content */}
      <div className="flex-1 flex flex-col items-center justify-center p-4">
        {!isConnected && !isSearching && (
          <div className="text-center space-y-4">
            <h2 className="text-2xl font-semibold text-gray-800">Start Voice Chat</h2>
            <p className="text-gray-600">Click the button below to find a random partner for voice chat</p>
            <button
              onClick={startSearching}
              className="bg-[#075e54] text-white px-6 py-3 rounded-full hover:bg-[#0c766b] transition-colors shadow-lg"
            >
              Find Partner
            </button>
          </div>
        )}

        {isSearching && (
          <div className="text-center space-y-4">
            <div className="animate-spin rounded-full h-12 w-12 border-4 border-[#075e54] border-t-transparent mx-auto"></div>
            <p className="text-gray-600">Finding your chat partner...</p>
          </div>
        )}

        {isConnected && (
          <VoiceControls
            isConnected={isConnected}
            isSpeaking={isSpeaking}
            isMuted={isMuted}
            onToggleMute={toggleMute}
          />
        )}
      </div>

      {/* Hidden audio element for remote stream */}
      <audio
        ref={audioRef}
        autoPlay
        playsInline
        className="hidden"
        // @ts-expect-error - srcObject is valid but not in the type definition
        srcObject={remoteStreamRef.current}
      />

      {/* Volume Control */}
      {isConnected && (
        <div className="absolute bottom-20 left-1/2 transform -translate-x-1/2 flex items-center space-x-2">
          <svg
            className="w-5 h-5 text-gray-600"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M15.536 8.464a5 5 0 010 7.072m2.828-9.9a9 9 0 010 12.728M5.586 15H4a1 1 0 01-1-1v-4a1 1 0 011-1h1.586l4.707-4.707C10.923 3.663 12 4.109 12 5v14c0 .891-1.077 1.337-1.707.707L5.586 15z"
            />
          </svg>
          <input
            type="range"
            min="0"
            max="1"
            step="0.1"
            value={volume}
            onChange={handleVolumeChange}
            className="w-24"
          />
        </div>
      )}
    </div>
  );
}
