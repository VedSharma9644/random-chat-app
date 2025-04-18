'use client'

import { signInWithGoogle } from '@/utils/auth'
import { useRouter } from 'next/navigation'

export default function SignIn() {
  const router = useRouter()

  const handleGoogleSignIn = async (chatType: 'text' | 'voice' | 'video') => {
    try {
      await signInWithGoogle()
      router.push(`/${chatType}`)
    } catch (error) {
      console.error('Error signing in:', error)
    }
  }

  return (
    <div className="flex flex-col items-center justify-center min-h-screen p-4">
      <h1 className="text-3xl font-bold mb-8">Choose Chat Type</h1>
      <div className="space-y-4 w-full max-w-md">
        <button
          onClick={() => handleGoogleSignIn('text')}
          className="flex items-center justify-center space-x-2 bg-white text-gray-700 border border-gray-300 rounded-lg px-6 py-4 hover:bg-gray-50 w-full"
        >
          <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
          </svg>
          <span>Text Chat</span>
        </button>
        
        <button
          onClick={() => handleGoogleSignIn('voice')}
          className="flex items-center justify-center space-x-2 bg-white text-gray-700 border border-gray-300 rounded-lg px-6 py-4 hover:bg-gray-50 w-full"
        >
          <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 11a7 7 0 01-7 7m0 0a7 7 0 01-7-7m7 7v4m0 0H8m4 0h4m-4-8a3 3 0 01-3-3V5a3 3 0 116 0v6a3 3 0 01-3 3z" />
          </svg>
          <span>Voice Chat</span>
        </button>

        <button
          onClick={() => handleGoogleSignIn('video')}
          className="flex items-center justify-center space-x-2 bg-white text-gray-700 border border-gray-300 rounded-lg px-6 py-4 hover:bg-gray-50 w-full"
        >
          <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 10l4.553-2.276A1 1 0 0121 8.618v6.764a1 1 0 01-1.447.894L15 14M5 18h8a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v8a2 2 0 002 2z" />
          </svg>
          <span>Video Chat</span>
        </button>
      </div>
    </div>
  )
} 