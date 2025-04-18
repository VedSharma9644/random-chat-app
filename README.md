# Random Chat App

A real-time chat application that allows users to connect with random partners for text, voice, and video conversations.

## Features

- **Text Chat**: Real-time text messaging with random partners
- **Voice Chat**: WebRTC-based voice calls with random partners
- **Video Chat**: WebRTC-based video calls with random partners
- **Google Authentication**: Secure sign-in using Google accounts
- **Real-time Matching**: Find random chat partners instantly
- **Responsive Design**: Works on desktop and mobile devices

## Tech Stack

- **Frontend**: Next.js, TypeScript, Tailwind CSS
- **Backend**: Node.js, Socket.IO
- **Authentication**: Firebase Authentication
- **Real-time Communication**: WebRTC, Socket.IO
- **Deployment**: Vercel (Frontend), Railway/Heroku (Backend)

## Getting Started

### Prerequisites

- Node.js (v14 or later)
- npm or yarn
- Google Cloud Project with Firebase setup
- WebRTC-compatible browser (Chrome, Firefox, Edge)

### Installation

1. Clone the repository:
```bash
git clone https://github.com/yourusername/random-chat-app.git
cd random-chat-app
```

2. Install dependencies:
```bash
# Install frontend dependencies
cd frontend
npm install

# Install backend dependencies
cd ../backend
npm install
```

3. Set up environment variables:
```bash
# Frontend (.env.local)
NEXT_PUBLIC_FIREBASE_API_KEY=your_api_key
NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN=your_auth_domain
NEXT_PUBLIC_FIREBASE_PROJECT_ID=your_project_id
NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET=your_storage_bucket
NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID=your_messaging_sender_id
NEXT_PUBLIC_FIREBASE_APP_ID=your_app_id
NEXT_PUBLIC_FIREBASE_MEASUREMENT_ID=your_measurement_id
NEXT_PUBLIC_SOCKET_URL=your_socket_url

# Backend (.env)
PORT=3001
FIREBASE_SERVICE_ACCOUNT=your_service_account_json
```

4. Start the development servers:
```bash
# Start backend server
cd backend
npm run dev

# Start frontend server
cd frontend
npm run dev
```

5. Open [http://localhost:3000](http://localhost:3000) in your browser.

## Project Structure

```
random-chat-app/
├── frontend/                 # Next.js frontend application
│   ├── app/                 # Next.js app directory
│   ├── components/          # React components
│   ├── utils/              # Utility functions
│   └── public/             # Static assets
└── backend/                # Node.js backend server
    ├── src/               # Source code
    └── dist/              # Compiled code
```

## Contributing

1. Fork the repository
2. Create your feature branch (`git checkout -b feature/amazing-feature`)
3. Commit your changes (`git commit -m 'Add some amazing feature'`)
4. Push to the branch (`git push origin feature/amazing-feature`)
5. Open a Pull Request

## License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.

## Acknowledgments

- WebRTC for real-time communication
- Socket.IO for WebSocket support
- Firebase for authentication
- Next.js and React for the frontend framework 