'use client'

import { useState, useEffect, useRef } from 'react'

interface VoiceChatProps {
  roomId: string;
  isConnected: boolean;
}

export default function VoiceChat({ isConnected }: VoiceChatProps) {
  const [isMuted, setIsMuted] = useState(true)
  const [isSpeaking, setIsSpeaking] = useState(false)
  const localStreamRef = useRef<MediaStream | null>(null)
  const audioContextRef = useRef<AudioContext | null>(null)
  const analyserRef = useRef<AnalyserNode | null>(null)

  useEffect(() => {
    if (!isConnected) {
      stopVoiceChat()
    }
    return () => {
      stopVoiceChat()
    }
  }, [isConnected])

  const startVoiceChat = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true })
      localStreamRef.current = stream

      const audioContext = new AudioContext()
      audioContextRef.current = audioContext

      const analyser = audioContext.createAnalyser()
      analyserRef.current = analyser

      const source = audioContext.createMediaStreamSource(stream)
      source.connect(analyser)

      checkVoiceActivity()
      setIsMuted(false)
    } catch (error) {
      console.error('Error accessing microphone:', error)
    }
  }

  const stopVoiceChat = () => {
    if (localStreamRef.current) {
      localStreamRef.current.getTracks().forEach(track => track.stop())
      localStreamRef.current = null
    }
    if (audioContextRef.current) {
      audioContextRef.current.close()
      audioContextRef.current = null
    }
    setIsMuted(true)
    setIsSpeaking(false)
  }

  const checkVoiceActivity = () => {
    if (!analyserRef.current) return

    const analyser = analyserRef.current
    const dataArray = new Uint8Array(analyser.frequencyBinCount)

    const check = () => {
      analyser.getByteFrequencyData(dataArray)
      const average = dataArray.reduce((a, b) => a + b) / dataArray.length
      setIsSpeaking(average > 20)
      requestAnimationFrame(check)
    }

    check()
  }

  const toggleMute = () => {
    if (isMuted) {
      startVoiceChat()
    } else {
      stopVoiceChat()
    }
  }

  return (
    <div className="flex items-center space-x-2">
      <button
        onClick={toggleMute}
        className={`p-2 rounded-full transition-colors ${
          isMuted
            ? 'bg-gray-200 hover:bg-gray-300'
            : isSpeaking
            ? 'bg-red-500 hover:bg-red-600'
            : 'bg-green-500 hover:bg-green-600'
        }`}
        disabled={!isConnected}
      >
        <svg
          className="w-5 h-5 text-white"
          fill="none"
          stroke="currentColor"
          viewBox="0 0 24 24"
        >
          {isMuted ? (
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M19 11a7 7 0 01-7 7m0 0a7 7 0 01-7-7m7 7v4m0 0H8m4 0h4m-4-8a3 3 0 01-3-3V5a3 3 0 116 0v6a3 3 0 01-3 3z"
            />
          ) : (
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M5.586 15H4a1 1 0 01-1-1v-4a1 1 0 011-1h1.586l4.707-4.707C10.923 3.663 12 4.109 12 5v14c0 .891-1.077 1.337-1.707.707L5.586 15z"
            />
          )}
        </svg>
      </button>
      {isSpeaking && !isMuted && (
        <span className="text-sm text-gray-600">Speaking...</span>
      )}
    </div>
  )
}
