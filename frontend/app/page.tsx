import Link from 'next/link'

export default function Home() {
  return (
    <div className="flex flex-col items-center justify-center min-h-screen p-4">
      <h1 className="text-4xl font-bold mb-8">Random Chat App</h1>
      <div className="flex flex-col space-y-4 w-full max-w-md">
        <Link 
          href="/auth/signin"
          className="bg-blue-500 hover:bg-blue-600 text-white font-semibold py-2 px-4 rounded-lg text-center"
        >
          Sign In with Google
        </Link>
        <div className="text-center text-gray-600">
          Connect with random people around the world
        </div>
      </div>
    </div>
  )
} 